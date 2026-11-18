// Archive routes (Phase 8 extraction #10).
//
// Admin-only soft-delete archive UI surface. 17 handlers across three
// entity types (users, projects, customers) plus archive log:
//
//   GET    /api/archive/users
//   GET    /api/archive/projects
//   GET    /api/archive/customers
//   GET    /api/archive/log
//   GET    /api/archive/users/:id
//   POST   /api/archive/users/:userId/restore
//   POST   /api/archive/projects/:projectId/restore
//   POST   /api/archive/customers/:customerId/restore
//   GET    /api/archive/users/:userId/dependencies
//   DELETE /api/archive/users/:userId
//   GET    /api/archive/projects/:projectId/dependencies
//   DELETE /api/archive/projects/:projectId
//   GET    /api/archive/customers/:customerId/dependencies
//   DELETE /api/archive/customers/:customerId
//   DELETE /api/archive/users/bulk/all
//   DELETE /api/archive/projects/bulk/all
//   DELETE /api/archive/customers/bulk/all
//
// Notes:
//   - All routes are gated on userRole === 'admin' (case-insensitive).
//   - The list endpoints catch dbError to handle bootstrap installs
//     where the archive_* tables haven't yet been migrated.
//   - Archived user rows are run through `sanitizeArchivedUser` before
//     being returned, so secret material (password hashes, TOTP, SF
//     OAuth tokens, reset tokens) cannot escape via this surface.
//   - Restore-user handles the case-insensitive email collision via a
//     409 with a friendly message (Task #543).
import type { Express } from "express";
import { storage, RestoreUserEmailConflictError } from "../storage";
import { isAuthenticated } from "../auth/simpleAuth";

// Strip secret/credential fields from archived user payloads before
// they ever leave the server. Even admins should not see bcrypt
// password hashes, the per-user password history, reset tokens,
// TOTP secret material, or Salesforce OAuth tokens through a JSON
// API. Internal flows that legitimately need these (restore,
// migrations, dependency checks) bypass this helper by going
// through storage methods directly. Keeping the redaction at the
// route boundary means callers can't accidentally widen the leak
// by adding a new list-style handler that forgets to sanitize.
const ARCHIVED_USER_REDACTED_FIELDS = [
  'password',
  'passwordHistory',
  'password_history',
  'resetToken',
  'reset_token',
  'resetTokenExpiry',
  'reset_token_expiry',
  'totpSecretEnc',
  'totp_secret_enc',
  'sfAccessToken',
  'sf_access_token',
  'sfRefreshToken',
  'sf_refresh_token',
] as const;
const sanitizeArchivedUser = <T extends Record<string, any>>(row: T): T => {
  const out: Record<string, any> = { ...row };
  for (const key of ARCHIVED_USER_REDACTED_FIELDS) {
    delete out[key];
  }
  return out as T;
};

export function registerArchiveRoutes(app: Express) {
  // Get archived users
  app.get('/api/archive/users', isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role?.toLowerCase();
      if (userRole !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      try {
        const archivedUsers = await storage.getArchivedUsers();
        res.json((archivedUsers || []).map(sanitizeArchivedUser));
      } catch (dbError) {
        console.log("Archive tables may not exist yet, returning empty array");
        res.json([]);
      }
    } catch (error: any) {
      console.error("Error fetching archived users:", error);
      res.status(500).json({ message: "Failed to fetch archived users" });
    }
  });

  // Get archived projects
  app.get('/api/archive/projects', isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role?.toLowerCase();
      if (userRole !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      try {
        const archivedProjects = await storage.getArchivedProjects();
        res.json(archivedProjects || []);
      } catch (dbError) {
        console.log("Archive tables may not exist yet, returning empty array");
        res.json([]);
      }
    } catch (error: any) {
      console.error("Error fetching archived projects:", error);
      res.status(500).json({ message: "Failed to fetch archived projects" });
    }
  });

  // Get archived customers
  app.get('/api/archive/customers', isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role?.toLowerCase();
      if (userRole !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      try {
        const archivedCustomers = await storage.getArchivedCustomers();
        res.json(archivedCustomers || []);
      } catch (dbError) {
        console.log("Archive tables may not exist yet, returning empty array");
        res.json([]);
      }
    } catch (error: any) {
      console.error("Error fetching archived customers:", error);
      res.status(500).json({ message: "Failed to fetch archived customers" });
    }
  });

  // Get archive log
  app.get('/api/archive/log', isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role?.toLowerCase();
      if (userRole !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      try {
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
        const archiveLog = await (storage.getArchiveLog as any)(limit);
        res.json(archiveLog || []);
      } catch (dbError) {
        console.log("Archive tables may not exist yet, returning empty array");
        res.json([]);
      }
    } catch (error: any) {
      console.error("Error fetching archive log:", error);
      res.status(500).json({ message: "Failed to fetch archive log" });
    }
  });

  // Get archived user by ID
  app.get('/api/archive/users/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role?.toLowerCase();
      if (userRole !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { id } = req.params;
      const archivedUser = await storage.getArchivedUserById(id);

      if (!archivedUser) {
        return res.status(404).json({ message: "Archived user not found" });
      }

      res.json(sanitizeArchivedUser(archivedUser));
    } catch (error: any) {
      console.error("Error fetching archived user:", error);
      res.status(500).json({ message: "Failed to fetch archived user" });
    }
  });

  // Restore archived user
  app.post('/api/archive/users/:userId/restore', isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role?.toLowerCase();
      if (userRole !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { userId } = req.params;
      const currentUserId = req.session.user.id;

      await storage.restoreUser(userId, currentUserId);
      res.json({ message: "User restored successfully" });
    } catch (error: any) {
      // Translate the case-insensitive email collision detected by
      // `restoreUser` (Task #543) into a clean 409 with a friendly
      // message. Without this, the previously-raw SQLSTATE 23505
      // from the `users_email_lower_unique` index (migration 035)
      // would have been dumped here as a generic 500.
      if (error instanceof RestoreUserEmailConflictError) {
        console.warn("Refusing to restore user — email conflicts with an active user:", error.message);
        return res.status(409).json({
          message: "Cannot restore: an active user already exists with this email address.",
        });
      }
      console.error("Error restoring user:", error);
      res.status(500).json({ message: "Failed to restore user" });
    }
  });

  // Restore archived project
  app.post('/api/archive/projects/:projectId/restore', isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role?.toLowerCase();
      if (userRole !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const projectId = parseInt(req.params.projectId as string);
      const currentUserId = req.session.user.id;

      await storage.restoreProject(projectId, currentUserId);
      res.json({ message: "Project restored successfully" });
    } catch (error: any) {
      console.error("Error restoring project:", error);
      res.status(500).json({ message: "Failed to restore project" });
    }
  });

  // Restore archived customer
  app.post('/api/archive/customers/:customerId/restore', isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role?.toLowerCase();
      if (userRole !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const customerId = parseInt(req.params.customerId as string);
      const currentUserId = req.session.user.id;

      await storage.restoreCustomer(customerId, currentUserId);
      res.json({ message: "Customer restored successfully" });
    } catch (error: any) {
      console.error("Error restoring customer:", error);
      res.status(500).json({ message: "Failed to restore customer" });
    }
  });

  // Permanent delete routes for archived records

  // Check dependencies before deleting an archived user
  app.get('/api/archive/users/:userId/dependencies', isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role?.toLowerCase();
      if (userRole !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { userId } = req.params;
      const dependencies = await storage.getDependenciesForArchivedUser(userId);
      res.json(dependencies);
    } catch (error: any) {
      console.error("Error checking archived user dependencies:", error);
      res.status(500).json({ message: "Failed to check dependencies" });
    }
  });

  // Permanently delete an archived user
  app.delete('/api/archive/users/:userId', isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role?.toLowerCase();
      if (userRole !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { userId } = req.params;
      await storage.permanentlyDeleteArchivedUser(userId);
      res.json({ success: true, message: "Archived user permanently deleted" });
    } catch (error: any) {
      console.error("Error permanently deleting archived user:", error);
      res.status(500).json({ message: "Failed to delete archived user" });
    }
  });

  // Check dependencies before deleting an archived project
  app.get('/api/archive/projects/:projectId/dependencies', isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role?.toLowerCase();
      if (userRole !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      const projectId = parseInt(req.params.projectId as string);
      const dependencies = await storage.getDependenciesForArchivedProject(projectId);
      res.json(dependencies);
    } catch (error: any) {
      console.error("Error checking archived project dependencies:", error);
      res.status(500).json({ message: "Failed to check dependencies" });
    }
  });

  // Permanently delete an archived project
  app.delete('/api/archive/projects/:projectId', isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role?.toLowerCase();
      if (userRole !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      const projectId = parseInt(req.params.projectId as string);
      await storage.permanentlyDeleteArchivedProject(projectId);
      res.json({ success: true, message: "Archived project permanently deleted" });
    } catch (error: any) {
      console.error("Error permanently deleting archived project:", error);
      res.status(500).json({ message: "Failed to delete archived project" });
    }
  });

  // Check dependencies before deleting an archived customer
  app.get('/api/archive/customers/:customerId/dependencies', isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role?.toLowerCase();
      if (userRole !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      const customerId = parseInt(req.params.customerId as string);
      const dependencies = await storage.getDependenciesForArchivedCustomer(customerId);
      res.json(dependencies);
    } catch (error: any) {
      console.error("Error checking archived customer dependencies:", error);
      res.status(500).json({ message: "Failed to check dependencies" });
    }
  });

  // Permanently delete an archived customer
  app.delete('/api/archive/customers/:customerId', isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role?.toLowerCase();
      if (userRole !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      const customerId = parseInt(req.params.customerId as string);
      await storage.permanentlyDeleteArchivedCustomer(customerId);
      res.json({ success: true, message: "Archived customer permanently deleted" });
    } catch (error: any) {
      console.error("Error permanently deleting archived customer:", error);
      res.status(500).json({ message: "Failed to delete archived customer" });
    }
  });

  // Bulk delete all archived users
  app.delete('/api/archive/users/bulk/all', isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role?.toLowerCase();
      if (userRole !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      await storage.permanentlyDeleteAllArchivedUsers();
      res.json({ success: true, message: "All archived users permanently deleted" });
    } catch (error: any) {
      console.error("Error permanently deleting all archived users:", error);
      res.status(500).json({ message: "Failed to delete all archived users" });
    }
  });

  // Bulk delete all archived projects
  app.delete('/api/archive/projects/bulk/all', isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role?.toLowerCase();
      if (userRole !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      await storage.permanentlyDeleteAllArchivedProjects();
      res.json({ success: true, message: "All archived projects permanently deleted" });
    } catch (error: any) {
      console.error("Error permanently deleting all archived projects:", error);
      res.status(500).json({ message: "Failed to delete all archived projects" });
    }
  });

  // Bulk delete all archived customers
  app.delete('/api/archive/customers/bulk/all', isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role?.toLowerCase();
      if (userRole !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      await storage.permanentlyDeleteAllArchivedCustomers();
      res.json({ success: true, message: "All archived customers permanently deleted" });
    } catch (error: any) {
      console.error("Error permanently deleting all archived customers:", error);
      res.status(500).json({ message: "Failed to delete all archived customers" });
    }
  });
}
