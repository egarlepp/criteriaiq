// Customer Access + Audit Login + CSV Imports + Custom Reports +
// Client Error Logs (Phase 8 extraction #26).
//
// Bundled slice. All read-mostly admin operational surfaces:
//
//   Customer Access:        /api/customer-access/*
//   Audit Login:            /api/audit-logins/*
//   CSV Imports:            /api/success-criteria/import + preview
//   Custom Reports:         /api/custom-reports/* (list, delete, run)
//   Built-in Reports:       /api/built-in-reports/:id/results (Reports › Run)
//   Report Calendar:        /api/report-schedules (Reports page calendar)
//   Client Error Logs:      /api/client-errors/* (logger + admin admin clear)
//
// Mechanical sed extraction.
import type { Express } from "express";
import type { Multer } from "multer";
import fs from "fs";
import path from "path";

const uploadsDir = path.join(process.cwd(), 'attached_assets');
import crypto from "crypto";
import { eq, and, or, desc, gte, count, sql } from "drizzle-orm";
import { storage } from "../storage";
import { db } from "../db";
import { getVersionInfo } from "../lib/version-info";
import { resolveMinifiedStack } from "../lib/sourcemap-resolver";
import {
  customers,
  users,
  projects,
  clientErrorLogs,
} from "@shared/schema";
import { isAuthenticated } from "../auth/simpleAuth";
import { requireSectionView } from "../lib/section-permissions";
import { requireInternalUser } from "../lib/internal-access";
import { hasProjectAccess } from "../lib/project-access";
import { resolveSchedulePermissions } from "../lib/schedule-permissions";
import { REPORT_SCHEDULE_ACTION_TYPE, reportCalendarQuerySchema } from "@shared/report-schedule-calendar";
import { getSystemReport } from "@shared/system-reports";
import { UnknownBuiltInReportError, runBuiltInReport } from "../lib/built-in-report-run";
import { classifyErrorSeverity, type SeverityLevel } from "@shared/error-severity";
import { sendEmail, wrapEmailContent, sendWelcomeEmail } from "../email/email";
import {
  getAuditLoginsCleanupStatus,
  runManualAuditLoginsPrune,
} from "../services/audit-logins-cleanup";
import { cleanupSpuriousAuditEntries } from "../auditHelper";

export async function registerAuditAndReportsRoutes(
  app: Express,
  { upload }: { upload: Multer },
) {
  // Customer Access routes. The rows carry customer names and emails, so
  // the viewer must be able to open the project (hasProjectAccess).
  app.get("/api/customer-access/:pocId", isAuthenticated, async (req: any, res) => {
    try {
      const pocId = Number(req.params.pocId);
      if (!Number.isInteger(pocId) || pocId <= 0) {
        return res.status(400).json({ message: "Invalid project ID" });
      }
      const user = req.session.user;
      if (!(await hasProjectAccess(user.id, user.role, user.email, pocId))) {
        return res.status(403).json({ message: "Access denied - insufficient project permissions" });
      }
      const customerAccess = await storage.getCustomerAccessByPoc(pocId);
      res.json(customerAccess);
    } catch (error: any) {
      console.error("Error fetching customer access:", error);
      res.status(500).json({ message: "Failed to fetch customer access" });
    }
  });

  // Archive API routes — DELIBERATELY EMPTY.
  //
  // The four list endpoints (`/api/archive/{users,projects,customers,log}`)
  // were originally registered here with `isAuthenticated`-only gating,
  // *and again* near line ~16315 with proper admin-role checks. Express
  // resolves duplicate route registrations in first-registered-wins
  // order, so the permissive copies above were the ones actually
  // serving traffic — letting any authenticated user (e.g. a regular
  // SE) fetch archived rows that include password hashes,
  // password_history (added in migration 030 / Task #491), reset
  // tokens, and SF/MFA secrets.
  //
  // The canonical, admin-gated handlers live further down in this file
  // (search for "Archive Management API Routes (Admin only)"). Do NOT
  // re-add list-style `/api/archive/*` routes here without making them
  // strictly admin-only AND sanitizing the response payload.

  // Account approval routes (Admin only)
  app.get("/api/pending-users", isAuthenticated, async (req: any, res) => {
    try {
      // Check if user is admin
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const users = await storage.getAllUsers();
      const pendingUsers = users.filter((user: any) => !user.isApproved);
      res.json(pendingUsers);
    } catch (error: any) {
      console.error("Error fetching pending users:", error);
      res.status(500).json({ message: "Failed to fetch pending users" });
    }
  });

  app.post("/api/approve-user/:userId", isAuthenticated, async (req: any, res) => {
    try {
      // Check if user is admin
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const userId = req.params.userId;
      const adminId = req.session.user.id;

      // Get user details before approval
      const users = await storage.getAllUsers();
      const userToApprove = users.find((u: any) => u.id === userId);

      if (!userToApprove) {
        return res.status(404).json({ message: "User not found" });
      }

      if (userToApprove.isApproved) {
        return res.status(400).json({ message: "User is already approved" });
      }

      // Update user approval status
      const updatedUser = await storage.updateUser(userId, {
        isApproved: true,
        approvedBy: adminId,
        approvedAt: new Date()
      });

      // Send approval notification email
      try {
        await sendWelcomeEmail({
          email: userToApprove.email,
          firstName: userToApprove.firstName,
          lastName: userToApprove.lastName,
          role: userToApprove.role
        });
      } catch (emailError) {
        console.error('Failed to send approval notification email:', emailError);
        // Continue with approval even if email fails
      }

      res.json({
        message: "User approved successfully",
        user: updatedUser
      });
    } catch (error: any) {
      console.error("Error approving user:", error);
      res.status(500).json({ message: "Failed to approve user" });
    }
  });

  app.post("/api/reject-user/:userId", isAuthenticated, async (req: any, res) => {
    try {
      // Check if user is admin
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const userId = req.params.userId;

      // Get user details before deletion
      const users = await storage.getAllUsers();
      const userToReject = users.find((u: any) => u.id === userId);

      if (!userToReject) {
        return res.status(404).json({ message: "User not found" });
      }

      // Delete the user account
      await storage.deleteUser(userId);

      res.json({ message: "User account rejected and deleted successfully" });
    } catch (error: any) {
      console.error("Error rejecting user:", error);
      res.status(500).json({ message: "Failed to reject user" });
    }
  });

  // Audit Login routes
  app.get("/api/audit-logins", isAuthenticated, requireSectionView("config.login-history"), async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 25;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const days = req.query.days ? parseInt(req.query.days as string) : 30;
      const userId = req.query.userId as string;
      const success = req.query.success ? req.query.success === 'true' : undefined;
      // Optional sign-in method filter (e.g. "email", "mfa-totp",
      // "mfa-recovery"). Mirrors `audit_logins.login_method` values
      // produced by the auth pipeline; "all" / empty means no filter.
      const rawLoginMethod = typeof req.query.loginMethod === 'string' ? req.query.loginMethod.trim() : '';
      const loginMethod = rawLoginMethod && rawLoginMethod !== 'all' ? rawLoginMethod : undefined;

      const result = await storage.getAuditLogsPaginated(limit, offset, days, userId, success, loginMethod);
      res.json(result);
    } catch (error: any) {
      console.error('Error fetching audit logins:', error);
      res.status(500).json({ message: "Failed to fetch audit logins" });
    }
  });

  app.get("/api/audit-logins/report", isAuthenticated, requireSectionView("config.login-history"), async (req, res) => {
    try {
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();
      // Task #767: optional `eventType` filter so the admin Login
      // Audit UI can narrow the table to a single class of event
      // (today: 'login' or 'secret_reveal') without post-filtering
      // potentially-large result sets in the browser. Empty / 'all'
      // means no filter and preserves the previous behaviour.
      const rawEventType = typeof req.query.eventType === 'string' ? req.query.eventType.trim() : '';
      const eventType = rawEventType && rawEventType !== 'all' ? rawEventType : undefined;

      const auditLogins = await storage.getAuditLoginsByDateRange(startDate, endDate, eventType);
      res.json(auditLogins);
    } catch (error: any) {
      console.error('Error fetching audit logins report:', error);
      res.status(500).json({ message: "Failed to fetch audit logins report" });
    }
  });

  // Admin-only read of the daily audit_logins prune scheduler's
  // last-run snapshot (Task #751). Backs the System Health → Database
  // tab "Login history cleanup" panel so admins can confirm at a
  // glance that login-history rows are being trimmed and the
  // configured retention window matches their compliance regime,
  // without grepping the `[Audit Logins Cleanup]` log line on the
  // host.
  //
  // `lastRunAt` / `lastRemoved` are read from the persisted
  // `audit_logins_cleanup_state` singleton row (Task #757) so the
  // values survive a process restart and are consistent across
  // replicas — a single-row PK lookup, so polling at the panel's
  // 60s cadence is still cheap. `retentionDays` is reported from the
  // local replica's in-process config since it reflects this
  // replica's active env-derived window.
  //
  // The persisted values stay `null` until the first successful tick
  // has fired (the scheduler has a configurable first-run delay,
  // default 60 s); after that they survive future restarts. If the
  // metadata row read fails (DB outage, missing migration), the
  // route falls back to whatever in-memory snapshot this replica has
  // observed — handled inside `getAuditLoginsCleanupStatus`.
  app.get("/api/admin/audit-logins-cleanup/status", isAuthenticated, async (req: any, res) => {
    const userRole = req.session?.user?.role;
    if (userRole !== "Admin") {
      return res.status(403).json({ message: "Admin role required" });
    }
    try {
      return res.json(await getAuditLoginsCleanupStatus());
    } catch (error: any) {
      console.error("Error fetching audit-logins cleanup status:", error);
      return res.status(500).json({
        message: "Failed to read audit-logins cleanup status",
      });
    }
  });

  // Admin-only on-demand prune of `audit_logins` (Task #756). The
  // daily background scheduler (`startAuditLoginsCleanup`) already
  // trims old rows once per interval (default 24 h), but admins who
  // tighten `AUDIT_LOGINS_RETENTION_DAYS` for compliance still have
  // to wait until the next scheduled tick before older rows actually
  // disappear. This endpoint runs the same `pruneOldAuditLogins`
  // delete synchronously so a regime change can take effect right
  // away from the System Health → Database "Login history cleanup"
  // panel.
  //
  // Returns the number of rows removed plus the refreshed snapshot
  // (`lastRunAt`, `retentionDays`) so the UI can display the count
  // in a toast and update the panel without a follow-up GET. On
  // failure the underlying error message is forwarded so the toast
  // can show the operator something actionable rather than a bare
  // "500".
  app.post("/api/admin/audit-logins-cleanup/run", isAuthenticated, async (req: any, res) => {
    const userRole = req.session?.user?.role;
    if (userRole !== "Admin") {
      return res.status(403).json({ message: "Admin role required" });
    }
    try {
      const result = await runManualAuditLoginsPrune();
      return res.json({
        removed: result.removed,
        lastRunAt: result.lastRunAt,
        retentionDays: result.retentionDays,
      });
    } catch (error: any) {
      console.error("Error running on-demand audit-logins prune:", error);
      return res.status(500).json({
        message:
          error instanceof Error
            ? `Failed to prune audit logins: ${error.message}`
            : "Failed to prune audit logins",
      });
    }
  });


  // Test email endpoint for demonstration
  app.post("/api/test-email", isAuthenticated, async (req, res) => {
    try {
      // Send a test email for logging demonstration
      if (!req.body.to) {
        return res.status(400).json({ message: "Email address is required" });
      }

      const emailResult = await sendEmail({
        to: req.body.to,
        from: 'noreply@netlrix.com',
        subject: req.body.subject || 'Test Email for Logging',
        text: req.body.text || 'This is a test email to demonstrate the email logging functionality.',
        html: req.body.html || '<p>This is a test email to demonstrate the email logging functionality.</p>',
        emailType: 'test',
        userId: req.session.user?.id
      });

      res.json(emailResult);
    } catch (error: any) {
      console.error('Error sending test email:', error);
      res.status(500).json({ message: "Failed to send test email" });
    }
  });

  // Email logs hold full message bodies, including invites and password
  // resets, so reading them needs Communications › Email Logs.
  app.get("/api/email-logs", isAuthenticated, requireSectionView("communications.email-logs"), async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 25;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

      const result = await storage.getEmailLogsPaginated(limit, offset);
      res.json(result);
    } catch (error: any) {
      console.error('Error fetching email logs:', error);
      res.status(500).json({ message: "Failed to fetch email logs" });
    }
  });

  app.get("/api/email-logs/:id", isAuthenticated, requireSectionView("communications.email-logs"), async (req, res) => {
    try {
      const emailLog = await storage.getEmailLog(parseInt(req.params.id as string));
      if (!emailLog) {
        return res.status(404).json({ message: "Email log not found" });
      }

      // If the email has HTML content and it's not already wrapped, wrap it with legacy vendor branding
      if (emailLog.htmlContent && !emailLog.htmlContent.includes('Solutions Engineering')) {
        emailLog.htmlContent = wrapEmailContent(emailLog.htmlContent);
      }

      res.json(emailLog);
    } catch (error: any) {
      console.error("Error fetching email log:", error);
      res.status(500).json({ message: "Failed to fetch email log" });
    }
  });















  // Shared CSV parsing helper
  const parseCSVLine = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = i + 1 < line.length ? line[i + 1] : null;
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  };

  const parseCSVContent = (csvContent: string) => {
    const lines = csvContent.split('\n').filter((line: string) => line.trim());
    if (lines.length < 2) {
      throw new Error("CSV file must contain header and at least one data row");
    }
    const headers = lines[0].split(',').map((h: string) => h.replace(/['"]/g, '').trim());
    const expectedHeaders = ['Category', 'Name', 'Description', 'Solutions', 'Abbreviation', 'Tags'];
    const missingHeaders = expectedHeaders.filter((h: string) => !headers.includes(h));
    if (missingHeaders.length > 0) {
      throw new Error(`Missing required headers: ${missingHeaders.join(', ')}`);
    }
    const rows: { rowIndex: number; data: Record<string, string> }[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const rowData: Record<string, string> = {};
      headers.forEach((header: string, index: number) => {
        rowData[header] = values[index] || '';
      });
      rows.push({ rowIndex: i, data: rowData });
    }
    return { headers, rows };
  };

  // Preview endpoint — validates CSV and returns per-row status without writing to DB
  app.post("/api/success-criteria/import/preview", isAuthenticated, upload.single('csvFile'), async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Only administrators can import Success Criteria data" });
      }
      if (!req.file) {
        return res.status(400).json({ message: "No CSV file uploaded" });
      }

      const csvContent = fs.readFileSync(req.file.path, 'utf-8');
      try { fs.unlinkSync(req.file.path); } catch {}
      let parsed;
      try {
        parsed = parseCSVContent(csvContent);
      } catch (e: any) {
        return res.status(400).json({ message: e.message });
      }

      const existingSolutions = await storage.getProducts();
      const existingComponents = await storage.getComponents();
      const existingCriteria = await storage.getCriteria();
      const existingOutcomes = await storage.getOutcomes();
      const existingActions = await storage.getActions();

      const newSolutionNames: string[] = [];
      const newComponentNames: string[] = [];
      const newValueMappingNames: string[] = [];

      const previewRows: any[] = [];

      for (const { rowIndex, data } of parsed.rows) {
        const category = (data.Category || '').trim();
        const name = (data.Name || '').trim();
        const description = (data.Description || '').trim();
        const solutions = (data.Solutions || '').trim();
        const abbreviation = (data.Abbreviation || '').trim();
        const tags = (data.Tags || '').trim();
        const component = (data.Component || '').trim();

        const rowResult: any = {
          rowIndex: rowIndex + 1,
          category,
          name,
          description,
          solutions,
          abbreviation,
          tags,
          component,
          status: 'create',
          errors: [],
        };

        if (!category || !name) {
          rowResult.status = 'error';
          rowResult.errors.push('Missing required fields (Category, Name)');
          previewRows.push(rowResult);
          continue;
        }

        if (!description) {
          rowResult.status = 'error';
          rowResult.errors.push('Missing required field (Description)');
          previewRows.push(rowResult);
          continue;
        }

        const validCategories = ['Solution', 'Component', 'Value Mapping', 'Criteria', 'Outcome', 'Action'];
        if (!validCategories.includes(category)) {
          rowResult.status = 'error';
          rowResult.errors.push(`Invalid Category "${category}" (must be ${validCategories.join(', ')})`);
          previewRows.push(rowResult);
          continue;
        }

        if (category === 'Solution') {
          const existing = existingSolutions.find((s: any) => s.name.toLowerCase() === name.toLowerCase());
          if (existing) {
            const existingTags = tags ? tags.split(',').map((t: string) => t.trim()).filter((t: string) => t) : [];
            if (existing.description !== description ||
                existing.abbreviation !== abbreviation ||
                JSON.stringify(existing.tags || []) !== JSON.stringify(existingTags)) {
              rowResult.status = 'update';
            } else {
              rowResult.status = 'skip';
            }
          } else {
            rowResult.status = 'create';
            newSolutionNames.push(name.toLowerCase());
          }

        } else if (category === 'Component') {
          if (solutions) {
            const solNames = solutions.split(',').map((s: string) => s.trim()).filter((s: string) => s);
            for (const sn of solNames) {
              const found = existingSolutions.find((s: any) => s.name.toLowerCase() === sn.toLowerCase()) ||
                            newSolutionNames.includes(sn.toLowerCase());
              if (!found) {
                rowResult.errors.push(`Solution "${sn}" not found`);
              }
            }
          }
          if (rowResult.errors.length > 0) {
            rowResult.status = 'error';
          } else {
            const existing = existingComponents.find((c: any) => c.name.toLowerCase() === name.toLowerCase());
            if (existing) {
              rowResult.status = existing.description !== description ? 'update' : 'skip';
            } else {
              rowResult.status = 'create';
              newComponentNames.push(name.toLowerCase());
            }
          }

        } else if (category === 'Value Mapping') {
          if (solutions) {
            const solNames = solutions.split(',').map((s: string) => s.trim()).filter((s: string) => s);
            for (const sn of solNames) {
              const found = existingSolutions.find((s: any) => s.name.toLowerCase() === sn.toLowerCase()) ||
                            newSolutionNames.includes(sn.toLowerCase());
              if (!found) {
                rowResult.errors.push(`Solution "${sn}" not found`);
              }
            }
          }
          if (rowResult.errors.length > 0) {
            rowResult.status = 'error';
          } else {
            const existingVMs = await storage.getValueMappings();
            const existing = existingVMs.find((v: any) => v.name.toLowerCase() === name.toLowerCase());
            if (existing) {
              rowResult.status = existing.description !== description ? 'update' : 'skip';
            } else {
              rowResult.status = 'create';
              newValueMappingNames.push(name.toLowerCase());
            }
          }

        } else if (category === 'Criteria') {
          if (solutions) {
            const solNames = solutions.split(',').map((s: string) => s.trim()).filter((s: string) => s);
            for (const sn of solNames) {
              const found = existingSolutions.find((s: any) => s.name.toLowerCase() === sn.toLowerCase()) ||
                            newSolutionNames.includes(sn.toLowerCase());
              if (!found) {
                rowResult.errors.push(`Solution "${sn}" not found`);
              }
            }
          }
          if (component) {
            const foundComp = existingComponents.find((c: any) => c.name.toLowerCase() === component.toLowerCase()) ||
                              newComponentNames.includes(component.toLowerCase());
            if (!foundComp) {
              rowResult.errors.push(`Component "${component}" not found`);
            }
          }
          if (rowResult.errors.length > 0) {
            rowResult.status = 'error';
          } else {
            const existing = existingCriteria.find((c: any) => c.name.toLowerCase() === name.toLowerCase());
            if (existing) {
              rowResult.status = existing.description !== description ? 'update' : 'skip';
            } else {
              rowResult.status = 'create';
            }
          }

        } else if (category === 'Outcome') {
          if (solutions) {
            const solNames = solutions.split(',').map((s: string) => s.trim()).filter((s: string) => s);
            for (const sn of solNames) {
              const found = existingSolutions.find((s: any) => s.name.toLowerCase() === sn.toLowerCase()) ||
                            newSolutionNames.includes(sn.toLowerCase());
              if (!found) {
                rowResult.errors.push(`Solution "${sn}" not found`);
              }
            }
          }
          if (rowResult.errors.length > 0) {
            rowResult.status = 'error';
          } else {
            const existing = existingOutcomes.find((o: any) => o.name.toLowerCase() === name.toLowerCase());
            if (existing) {
              rowResult.status = existing.description !== description ? 'update' : 'skip';
            } else {
              rowResult.status = 'create';
            }
          }

        } else if (category === 'Action') {
          if (solutions) {
            const solNames = solutions.split(',').map((s: string) => s.trim()).filter((s: string) => s);
            for (const sn of solNames) {
              const found = existingSolutions.find((s: any) => s.name.toLowerCase() === sn.toLowerCase()) ||
                            newSolutionNames.includes(sn.toLowerCase());
              if (!found) {
                rowResult.errors.push(`Solution "${sn}" not found`);
              }
            }
          }
          if (rowResult.errors.length > 0) {
            rowResult.status = 'error';
          } else {
            const existing = existingActions.find((a: any) => a.name.toLowerCase() === name.toLowerCase());
            if (existing) {
              rowResult.status = existing.description !== description ? 'update' : 'skip';
            } else {
              rowResult.status = 'create';
            }
          }
        }

        previewRows.push(rowResult);
      }

      res.json({ rows: previewRows });

    } catch (error: any) {
      console.error("CSV preview error:", error);
      res.status(500).json({ message: "Failed to preview CSV file" });
    }
  });

  // CSV Import endpoint for Success Criteria (Category-based format)
  app.post("/api/success-criteria/import", isAuthenticated, upload.single('csvFile'), async (req: any, res) => {
    try {
      // Check if user is ADMIN
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Only administrators can import Success Criteria data" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No CSV file uploaded" });
      }

      const csvContent = fs.readFileSync(req.file.path, 'utf-8');
      try { fs.unlinkSync(req.file.path); } catch {}
      let parsed;
      try {
        parsed = parseCSVContent(csvContent);
      } catch (e: any) {
        return res.status(400).json({ message: e.message });
      }

      const { rows } = parsed;

      const selectedRowsParam = req.body?.selectedRows;
      let selectedRowIndices: Set<number> | null = null;
      if (selectedRowsParam) {
        try {
          const indices = JSON.parse(selectedRowsParam);
          if (Array.isArray(indices)) {
            selectedRowIndices = new Set(indices);
          }
        } catch {}
      }

      let solutionsCreated = 0, solutionsUpdated = 0, solutionsSkipped = 0;
      let componentsCreated = 0, componentsUpdated = 0, componentsSkipped = 0;
      let valueMappingsCreated = 0, valueMappingsUpdated = 0, valueMappingsSkipped = 0;
      let criteriaCreated = 0, criteriaUpdated = 0, criteriaSkipped = 0;
      let outcomesCreated = 0, outcomesUpdated = 0, outcomesSkipped = 0;
      let actionsCreated = 0, actionsUpdated = 0, actionsSkipped = 0;
      const errors: string[] = [];

      // Get existing data for duplicate detection
      const existingSolutions = await storage.getProducts();
      let existingComponents = await storage.getComponents();
      const existingValueMappings = await storage.getValueMappings();
      const existingCriteria = await storage.getCriteria();
      const existingOutcomes = await storage.getOutcomes();
      const existingActions = await storage.getActions();

      // Helper to resolve solution names to IDs (returns null if any solution not found)
      const resolveSolutionIds = (solutionsStr: string, rowNum: number): number[] | null => {
        if (!solutionsStr || solutionsStr.trim() === '') {
          return []; // Empty = "All Solutions"
        }
        const solutionNames = solutionsStr.split(',').map(s => s.trim()).filter(s => s);
        const solutionIdsSet = new Set<number>(); // Use Set to deduplicate
        
        for (const name of solutionNames) {
          const solution = existingSolutions.find((s: any) => s.name.toLowerCase() === name.toLowerCase());
          if (solution) {
            solutionIdsSet.add(solution.id);
          } else {
            errors.push(`Row ${rowNum}: Solution "${name}" not found - please create Solutions before referencing them`);
            return null; // Short-circuit on invalid solution
          }
        }
        return Array.from(solutionIdsSet); // Convert Set back to array
      };

      for (const { rowIndex, data } of rows) {
        const rowNum = rowIndex + 1;

        if (selectedRowIndices && !selectedRowIndices.has(rowNum)) {
          continue;
        }

        try {
          const category = (data.Category || '').trim();
          const name = (data.Name || '').trim();
          const description = (data.Description || '').trim();

          if (!category || !name) {
            errors.push(`Row ${rowNum}: Missing required fields (Category, Name)`);
            continue;
          }

          // Process based on Category
          if (category === 'Solution') {
            const icon = (data.Icon || '').trim();
            const abbreviation = (data.Abbreviation || '').trim();
            const tags = data.Tags ? data.Tags.split(',').map((t: string) => t.trim()).filter((t: string) => t) : [];
            
            const existingSolution = existingSolutions.find((s: any) => s.name.toLowerCase() === name.toLowerCase());

            if (existingSolution) {
              // Update if any field changed
              if (existingSolution.description !== description ||
                  (existingSolution as any).icon !== icon ||
                  existingSolution.abbreviation !== abbreviation ||
                  JSON.stringify(existingSolution.tags || []) !== JSON.stringify(tags)) {
                await storage.updateProduct(existingSolution.id, {
                  description,
                  ...(icon ? { icon } as any : {}),
                  abbreviation: abbreviation || undefined,
                  tags
                });
                solutionsUpdated++;
              } else {
                solutionsSkipped++;
              }
            } else {
              // Create new solution
              await storage.createProduct({
                name,
                description,
                ...(icon ? { icon } as any : {}),
                abbreviation: abbreviation || undefined,
                tags,
                createdBy: req.session.user.id
              });
              solutionsCreated++;
            }

          } else if (category === 'Component') {
            const solutionIds = resolveSolutionIds(data.Solutions || '', rowNum);
            if (solutionIds === null) continue;

            const isAllSolutions = solutionIds.length === 0;
            const existingComponent = existingComponents.find((c: any) => c.name.toLowerCase() === name.toLowerCase());

            if (existingComponent) {
              if (existingComponent.description !== description) {
                await storage.updateComponent(existingComponent.id, {
                  description,
                  isAllSolutions,
                  solutionIds: isAllSolutions ? [] : solutionIds,
                });
                componentsUpdated++;
              } else {
                componentsSkipped++;
              }
            } else {
              await storage.createComponent({
                name,
                description,
                isAllSolutions,
                solutionIds: isAllSolutions ? [] : solutionIds,
                createdBy: req.session.user.id,
              });
              componentsCreated++;
            }
            existingComponents = await storage.getComponents();

          } else if (category === 'Value Mapping') {
            const solutionIds = resolveSolutionIds(data.Solutions || '', rowNum);
            if (solutionIds === null) continue;

            const isAllSolutions = solutionIds.length === 0;
            const existingVM = existingValueMappings.find((v: any) => v.name.toLowerCase() === name.toLowerCase());

            if (existingVM) {
              if (existingVM.description !== description) {
                await storage.updateValueMapping(existingVM.id, { description, isAllSolutions, solutionIds: isAllSolutions ? [] : solutionIds });
                valueMappingsUpdated++;
              } else {
                valueMappingsSkipped++;
              }
            } else {
              await storage.createValueMapping({
                name,
                description,
                isAllSolutions,
                solutionIds: isAllSolutions ? [] : solutionIds,
                createdBy: req.session.user.id,
              });
              valueMappingsCreated++;
            }

          } else if (category === 'Criteria') {
            const solutionIds = resolveSolutionIds(data.Solutions || '', rowNum);
            if (solutionIds === null) continue;
            
            const componentName = data.Component ? data.Component.trim() : '';
            let componentId: number | null = null;
            if (componentName) {
              const matchedComponent = existingComponents.find((c: any) => c.name.toLowerCase() === componentName.toLowerCase());
              if (matchedComponent) {
                componentId = matchedComponent.id;
              } else {
                errors.push(`Row ${rowNum}: Component "${componentName}" not found - create it first or add it as a Component row above`);
              }
            }

            const existingCriteriaItem = existingCriteria.find((c: any) => c.name.toLowerCase() === name.toLowerCase());

            if (existingCriteriaItem) {
              if (existingCriteriaItem.description !== description) {
                await storage.updateCriteria(existingCriteriaItem.id, {
                  description,
                  solutionIds,
                  ...(componentId !== null ? { componentId } : {}),
                });
                criteriaUpdated++;
              } else {
                criteriaSkipped++;
              }
            } else {
              await storage.createCriteria({
                name,
                description,
                solutionIds,
                ...(componentId !== null ? { componentId } : {}),
                createdBy: req.session.user.id
              });
              criteriaCreated++;
            }

          } else if (category === 'Outcome') {
            const solutionIds = resolveSolutionIds(data.Solutions || '', rowNum);
            if (solutionIds === null) continue; // Skip row if invalid solutions
            
            const existingOutcome = existingOutcomes.find((o: any) => o.name.toLowerCase() === name.toLowerCase());

            if (existingOutcome) {
              if (existingOutcome.description !== description) {
                await storage.updateOutcome(existingOutcome.id, {
                  description,
                  solutionIds
                });
                outcomesUpdated++;
              } else {
                outcomesSkipped++;
              }
            } else {
              await storage.createOutcome({
                name,
                description,
                solutionIds,
                createdBy: req.session.user.id
              });
              outcomesCreated++;
            }

          } else if (category === 'Action') {
            const solutionIds = resolveSolutionIds(data.Solutions || '', rowNum);
            if (solutionIds === null) continue; // Skip row if invalid solutions
            
            const existingAction = existingActions.find((a: any) => a.name.toLowerCase() === name.toLowerCase());

            if (existingAction) {
              if (existingAction.description !== description) {
                await storage.updateAction(existingAction.id, {
                  description,
                  solutionIds
                });
                actionsUpdated++;
              } else {
                actionsSkipped++;
              }
            } else {
              await storage.createAction({
                name,
                description,
                solutionIds,
                createdBy: req.session.user.id
              });
              actionsCreated++;
            }

          } else {
            errors.push(`Row ${rowNum}: Invalid Category "${category}" (must be Solution, Component, Value Mapping, Criteria, Outcome, or Action)`);
          }

        } catch (rowError: any) {
          errors.push(`Row ${rowNum}: ${rowError instanceof Error ? rowError.message : 'Processing error'}`);
        }
      }

      const totalProcessed = solutionsCreated + solutionsUpdated + componentsCreated + componentsUpdated +
                           valueMappingsCreated + valueMappingsUpdated +
                           criteriaCreated + criteriaUpdated + outcomesCreated + outcomesUpdated + actionsCreated + actionsUpdated;

      res.json({
        success: true,
        message: `Import completed. Processed ${totalProcessed} items with ${errors.length} errors.`,
        details: {
          solutionsCreated,
          solutionsUpdated,
          solutionsSkipped,
          componentsCreated,
          componentsUpdated,
          componentsSkipped,
          valueMappingsCreated,
          valueMappingsUpdated,
          valueMappingsSkipped,
          criteriaCreated,
          criteriaUpdated,
          criteriaSkipped,
          outcomesCreated,
          outcomesUpdated,
          outcomesSkipped,
          actionsCreated,
          actionsUpdated,
          actionsSkipped,
          errors
        }
      });

    } catch (error: any) {
      console.error("CSV import error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to import CSV file",
        details: { errors: [error instanceof Error ? error.message : 'Unknown error'] }
      });
    }
  });

  // Custom Reports API Routes
  //
  // Reports read every project (deal fields, owning team) with no account
  // scoping, so every report route is staff only. Report Builder was archived
  // (archive/analytics-builders/), so creating, editing, previewing and the
  // builder's field-source catalog are gone; saved reports can still be run,
  // scheduled, starred and deleted.

  // Get all custom reports for current user
  app.get('/api/custom-reports', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const reports = await storage.getCustomReports(userId);
      res.json(reports);
    } catch (error: any) {
      console.error("Error fetching custom reports:", error);
      res.status(500).json({ message: "Failed to fetch custom reports" });
    }
  });

  // Get user report favorites
  app.get('/api/user-report-favorites', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const favorites = await storage.getUserReportFavorites(userId);
      res.json(favorites);
    } catch (error: any) {
      console.error("Error fetching user report favorites:", error);
      res.status(500).json({ message: "Failed to fetch favorites" });
    }
  });

  // Add report to favorites
  app.post('/api/user-report-favorites', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const { reportId, reportType, systemReportId } = req.body;
      
      if (!reportType || (reportType !== 'system' && reportType !== 'custom')) {
        return res.status(400).json({ error: "Valid report type is required" });
      }
      
      if (reportType === 'custom' && !reportId) {
        return res.status(400).json({ error: "Report ID is required for custom reports" });
      }
      
      if (reportType === 'system' && !systemReportId) {
        return res.status(400).json({ error: "System report ID is required for system reports" });
      }

      await storage.addReportToFavorites(userId, reportId || 0, reportType, systemReportId);
      res.status(201).json({ message: "Report added to favorites" });
    } catch (error: any) {
      console.error("Error adding report to favorites:", error);
      res.status(500).json({ message: "Failed to add to favorites" });
    }
  });

  // Remove report from favorites
  app.delete('/api/user-report-favorites', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const { reportId, reportType, systemReportId } = req.body;
      
      if (!reportType || (reportType !== 'system' && reportType !== 'custom')) {
        return res.status(400).json({ error: "Valid report type is required" });
      }

      await storage.removeReportFromFavorites(userId, reportId || 0, reportType, systemReportId);
      res.json({ message: "Report removed from favorites" });
    } catch (error: any) {
      console.error("Error removing report from favorites:", error);
      res.status(500).json({ message: "Failed to remove from favorites" });
    }
  });

  // DELETE endpoint to remove a custom report
  app.delete('/api/custom-reports/:reportId', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const reportId = Number.parseInt(String(req.params.reportId), 10);
      if (!Number.isInteger(reportId) || reportId <= 0) {
        return res.status(400).json({ error: "Invalid report id" });
      }

      await storage.deleteCustomReport(reportId, userId);
      res.status(204).send();
    } catch (error: any) {
      console.error('Error deleting custom report:', error);

      // Handle specific error information
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return res.status(404).json({ error: "Report not found or you don't have permission to delete it" });
        }
        return res.status(500).json({ error: `Delete failed: ${error.message}` });
      }

      res.status(500).json({ error: 'Failed to delete custom report - unknown error' });
    }
  });

  // Execute a custom report and return data
  app.post('/api/custom-reports/:reportId/execute', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const { reportId } = req.params;
      const result = await storage.executeCustomReport(reportId, userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error executing custom report:", error);
      res.status(500).json({ message: "Failed to execute report" });
    }
  });

  // Reports › Run for a built-in report (shared/system-reports.ts): the
  // same definition a scheduled send uses, over every project. Staff with
  // the Reports page only.
  app.get('/api/built-in-reports/:reportId/results', isAuthenticated, requireInternalUser, requireSectionView("analytics.main"), async (req, res) => {
    try {
      const reportId = String(req.params.reportId);
      if (!getSystemReport(reportId)) {
        return res.status(404).json({ message: "Report not found" });
      }
      res.json(await runBuiltInReport(reportId));
    } catch (error: unknown) {
      if (error instanceof UnknownBuiltInReportError) {
        return res.status(404).json({ message: "Report not found" });
      }
      console.error("Error running built-in report:", error);
      res.status(500).json({ message: "Failed to run report" });
    }
  });

  // Report field catalog (server/lib/report-fields.ts). The Schedule Report
  // dialog uses it to label a saved report's filters.
  app.get('/api/report-builder/fields', isAuthenticated, requireInternalUser, async (req, res) => {
    try {
      const fields = await storage.getAvailableReportFields();
      res.json(fields);
    } catch (error: any) {
      console.error("Error fetching report fields:", error);
      res.status(500).json({ message: "Failed to fetch report fields" });
    }
  });

  // Reports page calendar: scheduled reports (report_generation schedules
  // from Schedule Report) with their runs and upcoming occurrences in a day
  // range. Staff only, like running a report, and gated like the schedule
  // routes: the Scheduler section or the Analytics page grants view.
  app.get('/api/report-schedules', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const parsed = reportCalendarQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid date range" });
      }
      const permissions = await resolveSchedulePermissions(req);
      if (!permissions.canView(REPORT_SCHEDULE_ACTION_TYPE)) {
        return res.status(403).json({ message: "You do not have permission to view scheduled reports" });
      }
      res.json(await storage.getReportScheduleCalendar(parsed.data.start, parsed.data.end));
    } catch (error: any) {
      console.error("Error fetching report schedules:", error);
      res.status(500).json({ message: "Failed to fetch report schedules" });
    }
  });

  // Project Audit API endpoints
  app.get('/api/projects/:id/audit', isAuthenticated, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.id as string);
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 500;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

      const auditEntries = await storage.getProjectAuditHistory(projectId, limit, offset);
      res.json(auditEntries);
    } catch (error: any) {
      console.error("Error fetching project audit history:", error);
      res.status(500).json({ message: "Failed to fetch project audit history" });
    }
  });

  app.get('/api/projects/:id/audit/count', isAuthenticated, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.id as string);
      const count = await storage.getProjectAuditCount(projectId);
      res.json({ count });
    } catch (error: any) {
      console.error("Error fetching project audit count:", error);
      res.status(500).json({ message: "Failed to fetch project audit count" });
    }
  });




  // Get customer status configurations
  app.get('/api/customer-status-configs', isAuthenticated, async (req: any, res) => {
    try {
      const configs = await storage.getCustomerStatusConfigs();
      res.json(configs);
    } catch (error: any) {
      console.error("Error fetching customer status configs:", error);
      res.status(500).json({ message: "Failed to fetch customer status configurations" });
    }
  });

  // Clean up spurious audit entries (admin only)
  app.post('/api/audit/cleanup', isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role?.toLowerCase();
      if (userRole !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const deletedCount = await cleanupSpuriousAuditEntries();
      res.json({
        success: true,
        message: `Cleaned up ${deletedCount} spurious audit entries`,
        deletedCount
      });
    } catch (error: any) {
      console.error("Error cleaning up audit entries:", error);
      res.status(500).json({ message: "Failed to clean up audit entries" });
    }
  });

  // The old /api/assets list/upload routes were removed: nothing called them
  // and the folder parameter allowed reading and writing outside uploads.

  // Compliance routes extracted to server/routes/compliance-routes.ts
  // (Phase 8 extraction #2 — registerComplianceRoutes).

  // End Date Flags routes extracted to server/routes/end-date-flags-routes.ts
  // (Phase 8 extraction #4 — registerEndDateFlagsRoutes).

  // Customer Status Configuration routes
  app.get("/api/customer-status-configs", async (req, res) => {
    try {
      const configs = await storage.getCustomerStatusConfigs();
      res.json(configs);
    } catch (error: any) {
      console.error("Error fetching customer status configs:", error);
      res.status(500).json({ message: "Failed to fetch customer status configurations" });
    }
  });


  // ============ END MFA API ENDPOINTS ============

  // Evaluation Requests routes extracted to
  // server/routes/evaluation-requests-routes.ts (Phase 8 extraction #3 —
  // registerEvaluationRequestsRoutes).

  // Support Requests routes extracted to server/routes/support-requests-routes.ts
  // (Phase 8 extraction #6 — registerSupportRequestsRoutes).

  // ============ CLIENT ERROR LOGS API ENDPOINTS ============

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "client_error_logs" (
        "id" serial PRIMARY KEY,
        "error_id" varchar(255) NOT NULL,
        "timestamp" timestamp DEFAULT now(),
        "context" varchar(500),
        "user_id" varchar(255),
        "message" text,
        "stack" text,
        "url" text,
        "user_agent" text,
        "details" jsonb
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_client_error_logs_timestamp ON client_error_logs(timestamp DESC)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_client_error_logs_user_id ON client_error_logs(user_id)`);
    console.log('✅ client_error_logs table ready');
  } catch (error: any) {
    console.error('Failed to initialize client_error_logs table:', error);
  }

  try {
    await db.execute(sql`ALTER TABLE project_templates ADD COLUMN IF NOT EXISTS map_template_id integer`);
    await db.execute(sql`ALTER TABLE project_templates ADD COLUMN IF NOT EXISTS map_template_name varchar(255)`);
    await db.execute(sql`ALTER TABLE project_templates ADD COLUMN IF NOT EXISTS artifacts_not_applicable boolean DEFAULT true`);
    await db.execute(sql`ALTER TABLE project_templates ADD COLUMN IF NOT EXISTS validation_criteria_template_id integer REFERENCES validation_criteria_templates(id) ON DELETE SET NULL`);
    await db.execute(sql`ALTER TABLE project_templates ADD COLUMN IF NOT EXISTS validation_criteria_template_name varchar(255)`);
    console.log('✅ project_templates plan columns ready');
  } catch (error: any) {
    console.error('Failed to add plan columns to project_templates:', error);
  }

  app.post('/api/error-logs', isAuthenticated, async (req: any, res) => {
    try {
      const { id, timestamp, context, userId, message, stack, url, userAgent, details, status, breadcrumbs, consoleLogs } = req.body;

      if (!id || !message) {
        return res.status(400).json({ message: "errorId and message are required" });
      }

      const sessionUserId = req.session?.user?.id || userId || 'Anonymous';

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentCount = await db.select({ count: sql<number>`count(*)` })
        .from(clientErrorLogs)
        .where(and(
          eq(clientErrorLogs.userId, String(sessionUserId)),
          gte(clientErrorLogs.timestamp, oneHourAgo)
        ));

      if (recentCount[0]?.count >= 100) {
        return res.json({ received: true, throttled: true });
      }

      const stackStr = stack ? String(stack) : null;

      // Error Audit Log v2 enrichment ---------------------------------------
      // Fingerprint identical errors so the viewer can group them + count
      // occurrences: context + message + the first app/asset stack frame.
      const firstAppFrame = (stackStr?.split('\n') || [])
        .map((l) => l.trim())
        .find((l) => /\/assets\/|\/src\/|\.tsx|\.ts(:|\b)/.test(l)) || '';
      const errorHash = crypto
        .createHash('sha256')
        .update(`${context || ''}\n${String(message)}\n${firstAppFrame}`)
        .digest('hex')
        .substring(0, 64);

      // Server-known build identity — authoritative, always present.
      const build = getVersionInfo();

      // HTTP status the client sent (for API/query errors); previously dropped.
      const httpStatus = status != null && !isNaN(Number(status)) ? Number(status) : null;

      // De-minify the stack against hidden source maps (best-effort: null if
      // maps are not present, e.g. sourcemaps disabled).
      const resolvedStack = resolveMinifiedStack(stackStr);

      const baseDetails = details
        ? (typeof details === 'object' ? { ...details } : { raw: details })
        : {};
      const enrichedDetails = {
        ...baseDetails,
        ...(resolvedStack ? { resolvedStack } : {}),
        ...(Array.isArray(breadcrumbs) && breadcrumbs.length ? { breadcrumbs: breadcrumbs.slice(-25) } : {}),
        ...(Array.isArray(consoleLogs) && consoleLogs.length ? { consoleLogs: consoleLogs.slice(-50) } : {}),
        buildDate: build.buildDate,
        gitCommit: build.gitCommit,
        environment: build.environment,
        serverReceivedAt: new Date().toISOString(),
      };

      await db.insert(clientErrorLogs).values({
        errorId: String(id).substring(0, 255),
        context: context ? String(context).substring(0, 500) : null,
        userId: String(sessionUserId).substring(0, 255),
        message: String(message).substring(0, 10000),
        stack: stackStr ? stackStr.substring(0, 10000) : null,
        url: url ? String(url).substring(0, 2000) : null,
        userAgent: userAgent ? String(userAgent).substring(0, 1000) : null,
        appVersion: build.version ? String(build.version).substring(0, 50) : null,
        httpStatus,
        errorHash,
        details: enrichedDetails,
      });

      res.json({ received: true });
    } catch (error: any) {
      console.error("Error storing client error log:", error);
      res.json({ received: false });
    }
  });

  app.get('/api/error-logs', isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session?.user?.role;
      if (userRole !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      // Left-join the users table so the audit log can render a
      // human-readable name in its User column instead of the raw
      // session ID (which looks like `user_1778517437101_p…` and
      // means nothing to the admin reading the report).
      //
      // The join is LEFT — not INNER — because:
      //   - `client_error_logs.user_id` is nullable (anonymous errors
      //     captured pre-login)
      //   - the column also accepts the literal `'Anonymous'` from the
      //     setupGlobalErrorHandling capture path
      //   - users may be deleted after errors were captured against
      //     their id
      // In all three cases the row should still surface; the response
      // just sends `user: null` and the frontend falls back to the
      // raw `userId` (or "Anonymous"/"—").
      const rows = await db.select({
          log: clientErrorLogs,
          user: {
            id: users.id,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
          },
        })
        .from(clientErrorLogs)
        .leftJoin(users, eq(clientErrorLogs.userId, users.id))
        .orderBy(desc(clientErrorLogs.timestamp))
        .limit(limit);

      // Flatten the joined shape: every existing field on a log row
      // stays where the frontend already reads it, with the resolved
      // user object (or null) added alongside.
      const logs = rows.map((row) => ({
        ...row.log,
        user: row.user?.id ? row.user : null,
      }));

      res.json(logs);
    } catch (error: any) {
      console.error("Error fetching client error logs:", error);
      res.status(500).json({ message: "Failed to fetch error logs" });
    }
  });

  // Count-only endpoint so KPI tiles (e.g. on Support & Features) can
  // surface "how many captured errors" without paying the cost of
  // shipping up to 500 full rows back to the client. Admin-only — the
  // count itself is operationally sensitive (it implies bug volume).
  app.get('/api/error-logs/count', isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session?.user?.role;
      if (userRole !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const [row] = await db
        .select({ count: count() })
        .from(clientErrorLogs);
      res.json({ count: Number(row?.count ?? 0) });
    } catch (error: any) {
      console.error("Error counting client error logs:", error);
      res.status(500).json({ message: "Failed to count error logs" });
    }
  });

  // Analytics endpoint backing the "Client Error Analytics" panel
  // (`ClientErrorsAnalytics.tsx`). Unlike `GET /api/error-logs` — which
  // caps at the latest 500 rows for the audit-log table — this computes
  // its four datasets UNCAPPED across the whole `client_error_logs` table
  // so the charts reflect every captured error, not just the recent
  // window. Admin-only (same gate as the sibling handlers): error volume
  // is operationally sensitive.
  //
  // Severity is a heuristic (not a stored column), so it is computed here
  // via the shared `classifyErrorSeverity` — the SAME classifier the
  // audit-log table uses — guaranteeing the pie chart and table agree.
  app.get('/api/error-logs/analytics', isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session?.user?.role;
      if (userRole !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Total — all-time count.
      const [totalRow] = await db
        .select({ count: count() })
        .from(clientErrorLogs);
      const totalErrors = Number(totalRow?.count ?? 0);

      // Errors per day over the trailing 14 calendar days. SQL groups the
      // existing rows by day; JS then zero-fills any missing days so the
      // chart always shows a contiguous 14-bar series in ascending order.
      const dayRows = await db.execute<{ date: string; count: number }>(sql`
        SELECT to_char(date_trunc('day', "timestamp"), 'YYYY-MM-DD') AS date,
               count(*)::int AS count
        FROM client_error_logs
        WHERE "timestamp" >= now() - interval '14 days'
        GROUP BY 1
        ORDER BY 1
      `);
      const dayCounts = new Map<string, number>();
      for (const row of dayRows.rows) {
        dayCounts.set(String(row.date), Number(row.count));
      }
      const errorsByDay: Array<{ date: string; count: number }> = [];
      const today = new Date();
      for (let i = 13; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        // Build the YYYY-MM-DD key from local date parts so it matches the
        // server-local day boundaries used by date_trunc above.
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        errorsByDay.push({ date: key, count: dayCounts.get(key) ?? 0 });
      }

      // Top 5 pages by URL path (query string stripped), desc.
      const pageRows = await db.execute<{ page: string; count: number }>(sql`
        SELECT split_part(url, '?', 1) AS page,
               count(*)::int AS count
        FROM client_error_logs
        WHERE url IS NOT NULL
        GROUP BY 1
        ORDER BY count DESC
        LIMIT 5
      `);
      const topPages = pageRows.rows.map((row) => ({
        page: String(row.page),
        count: Number(row.count),
      }));

      // Top 5 full messages, desc.
      const messageRows = await db.execute<{ message: string; count: number }>(sql`
        SELECT message,
               count(*)::int AS count
        FROM client_error_logs
        WHERE message IS NOT NULL
        GROUP BY 1
        ORDER BY count DESC
        LIMIT 5
      `);
      const topMessages = messageRows.rows.map((row) => ({
        message: String(row.message),
        count: Number(row.count),
      }));

      // Severity counts — heuristic, so load (message, context) for all
      // rows (50k safety cap, far beyond current volume) and tally via the
      // shared classifier the audit-log table uses.
      const severityCounts: Record<SeverityLevel, number> = {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      };
      const classifyRows = await db
        .select({
          message: clientErrorLogs.message,
          context: clientErrorLogs.context,
        })
        .from(clientErrorLogs)
        .limit(50000);
      for (const row of classifyRows) {
        const { severity } = classifyErrorSeverity(row.message, row.context);
        severityCounts[severity] += 1;
      }

      res.json({
        totalErrors,
        errorsByDay,
        topPages,
        topMessages,
        severityCounts,
      });
    } catch (error: any) {
      console.error("Error computing client error analytics:", error);
      res.status(500).json({ message: "Failed to compute error analytics" });
    }
  });

  app.delete('/api/error-logs', isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session?.user?.role;
      if (userRole !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      await db.delete(clientErrorLogs);
      res.json({ message: "All error logs cleared" });
    } catch (error: any) {
      console.error("Error clearing client error logs:", error);
      res.status(500).json({ message: "Failed to clear error logs" });
    }
  });
}
