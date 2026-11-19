// Support Requests CRUD + analytics + file upload/download.
//
// Extracted from server/routes.ts (Phase 8 extraction #6 — see
// docs/archive/routes-split-plan.md). 10 handlers covering the full
// support-request feature surface.
//
// Endpoints owned by this module:
//   POST   /api/support-requests                         (auth, supportUpload, customer access check)
//   GET    /api/support-requests                         (auth, scoped by role)
//   GET    /api/support-requests/:id                     (auth, customer access check)
//   PATCH  /api/support-requests/:id                     (auth, role-scoped fields, status-change emails)
//   DELETE /api/support-requests/:id                     (auth, Admin only)
//   GET    /api/support-requests/count                   (auth, scoped by role)
//   POST   /api/support-requests/upload                  (auth, supportUpload, file→cloud)
//   GET    /api/support-requests/download/:filename      (auth, legacy on-disk attachments)
//   GET    /api/support-requests/analytics               (auth, role-scoped totals)
//   GET    /api/support-requests/trends                  (auth, role-scoped time-series)
//
// `supportUpload` is the dedicated multer instance for support
// attachments (separate from the project-wide `upload`). Injected via
// DI so this module doesn't have to redefine its quarantine config.
//
// `uploadsDir` is duplicated from routes.ts (const path) — only the
// legacy download endpoint uses it, and only for the "support_*"
// attachments still on local disk from before the cloud-storage
// migration. Re-deriving here is simpler than threading it through DI.
import type { Express } from "express";
import type { Multer } from "multer";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { storage } from "../storage";
import { notifySupportRequestUpdated } from "../services/notifications";
import { isAuthenticated } from "../auth/simpleAuth";
import { insertSupportRequestSchema } from "@shared/schema";
import {
  sendNewSupportRequestNotification,
  sendSupportRequestUpdateNotification,
} from "../email/email";
import {
  hasCustomerAccess,
  getUserAccessibleCustomers,
} from "../lib/customer-access";
import { buildSupportPath, normalizeFilename, discardQuarantinedUpload } from "../lib/upload-config";
import { processUpload } from "../lib/upload-processor";

const uploadsDir = path.join(process.cwd(), "attached_assets");

const INTERNAL_ROLES = ["Admin", "Engineer", "ProServ", "Support"] as const;

/**
 * Filter response fields based on user role. Internal roles see all
 * fields; external roles get the response with `internalNotes` stripped.
 */
function filterSupportRequestFields(request: any, userRole: string) {
  if (INTERNAL_ROLES.includes(userRole as (typeof INTERNAL_ROLES)[number])) {
    return request;
  }
  // External users cannot see internal notes
  const { internalNotes, ...filteredRequest } = request;
  return filteredRequest;
}

interface SupportRequestRouteOptions {
  supportUpload: Multer;
}

export function registerSupportRequestsRoutes(
  app: Express,
  { supportUpload }: SupportRequestRouteOptions,
) {
  // GET /api/support-requests/analytics — role-scoped totals
  app.get('/api/support-requests/analytics', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const analytics = await storage.getSupportRequestAnalytics(userId, userRole);
      res.json(analytics);
    } catch (error: any) {
      console.error("Error fetching support request analytics:", error);
      res.status(500).json({ message: "Failed to fetch support request analytics" });
    }
  });

  // GET /api/support-requests/trends — role-scoped time-series
  app.get('/api/support-requests/trends', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const { period = '30' } = req.query; // Days
      const trends = await storage.getSupportRequestTrends(userId, userRole, parseInt(period as string));
      res.json(trends);
    } catch (error: any) {
      console.error("Error fetching support request trends:", error);
      res.status(500).json({ message: "Failed to fetch support request trends" });
    }
  });

  // POST /api/support-requests — create + attachment upload + email internal team
  app.post('/api/support-requests', isAuthenticated, supportUpload.single('attachment'), async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const userRole = req.session.user.role;

      // Extract form fields from multipart FormData and complete with user info
      const formData = {
        type: req.body.type,
        title: req.body.title,
        description: req.body.description,
        priority: req.body.priority,
        applicationPage: req.body.applicationPage,
        customerId: req.body.customerId ? parseInt(req.body.customerId) : undefined,
        browser: req.body.browser,
        // Support Request specific fields
        os: req.body.os,
        frequency: req.body.frequency,
        stepsToReproduce: req.body.stepsToReproduce,
        expectedBehavior: req.body.expectedBehavior,
        actualBehavior: req.body.actualBehavior,
        // Feature Request specific fields
        problemToSolve: req.body.problemToSolve,
        proposedBehavior: req.body.proposedBehavior,
        alternativesTried: req.body.alternativesTried,
        // User information (completed on backend)
        submittedByUserId: userId,
        submittedByName: req.session.user.firstName + ' ' + req.session.user.lastName,
        submittedByEmail: req.session.user.email,
        status: 'Not Started' // Default status for new requests
      };

      const validatedData = insertSupportRequestSchema.parse(formData);

      // Customer access validation
      if (!await hasCustomerAccess(userId, userRole, validatedData.customerId)) {
        return res.status(403).json({ message: "Access denied to this customer" });
      }

      const newRequest = await storage.createSupportRequest(validatedData);

      // Handle uploaded file (single file) — promote through quarantine pipeline to cloud storage
      if (req.file) {
        try {
          const safeFilename = normalizeFilename(req.file.originalname);
          const customerId = validatedData.customerId ?? null;
          const gcsObjectKey = buildSupportPath(safeFilename, customerId);
          const uploadResult = await processUpload(req.file, gcsObjectKey, 'support');

          if (uploadResult.ok) {
            const pf = uploadResult.file;
            const newDoc = await storage.createDocument({
              givenName: pf.originalName,
              fileName: pf.safeFilename,
              originalName: pf.originalName,
              mimeType: pf.mimeType,
              fileSize: pf.fileSize,
              uploadedByUserId: userId,
              customerId,
              storedPath: pf.url,
              gcsPath: pf.gcsPath,
              fileHash: pf.fileHash,
              scanStatus: pf.scanStatus,
              sensitivityLabel: 'internal',
            });
            // Link the document back to the support request
            await storage.updateSupportRequest(newRequest.id, { attachmentDocumentId: newDoc.id });
            console.log(`File attachment uploaded to cloud for support request ${newRequest.id}: ${pf.originalName} → ${gcsObjectKey}`);
          } else {
            console.warn(`Support attachment upload failed (non-fatal) for request ${newRequest.id}: ${uploadResult.reason}`);
          }
        } catch (fileError) {
          console.error("Error handling file attachment:", fileError);
          // Don't fail the request creation if file handling fails
        }
      }

      // Send notification email for new submissions
      try {
        // Get user details for the submitter
        const submitterUser = await storage.getUserById(userId);
        const customerDetails = validatedData.customerId ? await storage.getCustomer(validatedData.customerId) : null;
        const projectDetails = (validatedData as any).projectId ? await storage.getPoc((validatedData as any).projectId) : null;

        if (submitterUser) {
          // Prepare notification details
          const notificationDetails: any = {
            id: newRequest.id,
            type: newRequest.type,
            priority: newRequest.priority,
            subject: newRequest.title,
            description: newRequest.description,
            submitterName: `${submitterUser.firstName} ${submitterUser.lastName}`,
            submitterEmail: submitterUser.email,
            customerName: (customerDetails as any)?.name,
            projectName: projectDetails?.name
          };

          // Get internal team members to notify (Admin, Engineer, ProServ, Support roles)
          const allUsers = await storage.getAllUsers();
          const internalUsers = allUsers.filter(user => ['Admin', 'Engineer', 'ProServ', 'Support'].includes(user.role as string));

          // Send notifications to internal team members
          for (const internalUser of internalUsers) {
            if (internalUser.email && (internalUser as any).receiveEmails !== false) {
              sendNewSupportRequestNotification(notificationDetails, internalUser.email)
                .catch(error => console.error(`Failed to send notification to ${internalUser.email}:`, error));
            }
          }
        }
      } catch (emailError) {
        console.error("Error sending new request notification:", emailError);
        // Don't fail the request creation if email fails
      }

      // Filter response based on user role
      const responseData = filterSupportRequestFields(newRequest, userRole);
      res.status(201).json(responseData);
    } catch (error: any) {
      console.error("Error creating support request:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.issues });
      }
      res.status(500).json({ message: "Failed to create support request" });
    }
  });

  // GET /api/support-requests — list scoped by role
  app.get('/api/support-requests', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const {
        userId: filterUserId,
        customerId: filterCustomerId,
        type,
        status,
        search,
        assignedToUserId
      } = req.query;

      // Parse numeric query parameters
      const customerIdFilter = filterCustomerId && !isNaN(parseInt(filterCustomerId)) ? parseInt(filterCustomerId) : undefined;

      let requests;

      if (INTERNAL_ROLES.includes(userRole as (typeof INTERNAL_ROLES)[number])) {
        // Internal roles can see all requests with full search
        requests = await storage.getSupportRequests({
          userId: filterUserId,
          customerId: customerIdFilter,
          type,
          status,
          search,
          assignedToUserId,
          includeInternalNotesInSearch: true
        });
      } else {
        // External users see requests for customers they can access with limited search
        const accessibleCustomers = await getUserAccessibleCustomers(userId, req.session.user.email);

        requests = await storage.getSupportRequests({
          userId: filterUserId,
          customerId: customerIdFilter,
          type,
          status,
          search,
          assignedToUserId,
          accessibleCustomerIds: accessibleCustomers,
          includeInternalNotesInSearch: false
        });
      }

      // Filter response fields based on user role
      const filteredRequests = requests.map(request => filterSupportRequestFields(request, userRole));
      res.json(filteredRequests);
    } catch (error: any) {
      console.error("Error fetching support requests:", error);
      res.status(500).json({ message: "Failed to fetch support requests" });
    }
  });

  // GET /api/support-requests/:id — single request with access check
  app.get('/api/support-requests/:id', isAuthenticated, async (req: any, res) => {
    try {
      const requestId = parseInt(req.params.id as string);
      if (isNaN(requestId)) {
        return res.status(400).json({ message: "Invalid request ID" });
      }
      const userId = req.session.user.id;
      const userRole = req.session.user.role;

      const request = await storage.getSupportRequestById(requestId);
      if (!request) {
        return res.status(404).json({ message: "Support request not found" });
      }

      // Customer access validation
      if (!await hasCustomerAccess(userId, userRole, request.customerId)) {
        return res.status(403).json({ message: "Access denied to this request" });
      }

      // Filter response based on user role
      const responseData = filterSupportRequestFields(request, userRole);
      res.json(responseData);
    } catch (error: any) {
      console.error("Error fetching support request:", error);
      res.status(500).json({ message: "Failed to fetch support request" });
    }
  });

  // PATCH /api/support-requests/:id — update + status-change emails
  app.patch('/api/support-requests/:id', isAuthenticated, async (req: any, res) => {
    try {
      const requestId = parseInt(req.params.id as string);
      if (isNaN(requestId)) {
        return res.status(400).json({ message: "Invalid request ID" });
      }
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const updates = req.body;

      // Get existing request for validation
      const existingRequest = await storage.getSupportRequestById(requestId);
      if (!existingRequest) {
        return res.status(404).json({ message: "Support request not found" });
      }

      // Customer access validation
      if (!await hasCustomerAccess(userId, userRole, existingRequest.customerId)) {
        return res.status(403).json({ message: "Access denied to this request" });
      }

      let updatedRequest;

      if (!INTERNAL_ROLES.includes(userRole as (typeof INTERNAL_ROLES)[number])) {
        // External users can only update limited fields
        const allowedFields = ['title', 'description', 'attachmentUrl'];
        const filteredUpdates = Object.keys(updates)
          .filter(key => allowedFields.includes(key))
          .reduce((obj: any, key) => {
            obj[key] = updates[key];
            return obj;
          }, {});

        if (Object.keys(filteredUpdates).length === 0) {
          return res.status(403).json({ message: "No allowed fields to update" });
        }

        updatedRequest = await storage.updateSupportRequest(requestId, filteredUpdates);
      } else {
        // Internal users can update any field
        updatedRequest = await storage.updateSupportRequest(requestId, updates);
      }

      notifySupportRequestUpdated(existingRequest, updatedRequest, userId);

      // Send notification email for status changes
      try {
        // Check if status changed and send notification to submitter
        if (updates.status && updates.status !== existingRequest.status) {
          const submitterUser = await storage.getUserById(existingRequest.submittedByUserId);
          const updaterUser = await storage.getUserById(userId);
          const customerDetails = existingRequest.customerId ? await storage.getCustomer(existingRequest.customerId) : null;
          const projectDetails = (existingRequest as any).projectId ? await storage.getPoc((existingRequest as any).projectId) : null;
          const assignedUser = updatedRequest.assignedToUserId ? await storage.getUserById(updatedRequest.assignedToUserId) : null;

          if (submitterUser && updaterUser) {
            const updateNotificationDetails: any = {
              id: existingRequest.id,
              type: existingRequest.type,
              priority: existingRequest.priority,
              subject: existingRequest.title,
              description: existingRequest.description,
              submitterName: `${submitterUser.firstName} ${submitterUser.lastName}`,
              submitterEmail: submitterUser.email,
              customerName: (customerDetails as any)?.name,
              projectName: projectDetails?.name,
              oldStatus: existingRequest.status,
              newStatus: updates.status,
              assignedToName: assignedUser ? `${assignedUser.firstName} ${assignedUser.lastName}` : undefined,
              updatedByName: `${updaterUser.firstName} ${updaterUser.lastName}`,
              updateNote: updates.internalNotes
            };

            // Send notification to the original submitter
            if (submitterUser.email && submitterUser.receiveEmails !== false) {
              sendSupportRequestUpdateNotification(updateNotificationDetails, submitterUser.email)
                .catch((error: any) => console.error(`Failed to send update notification to ${submitterUser.email}:`, error));
            }

            // If assigned to someone, also notify the assignee (if different from submitter)
            if (assignedUser && assignedUser.id !== submitterUser.id && assignedUser.email && assignedUser.receiveEmails !== false) {
              sendSupportRequestUpdateNotification(updateNotificationDetails, assignedUser.email)
                .catch(error => console.error(`Failed to send assignment notification to ${assignedUser.email}:`, error));
            }
          }
        }
      } catch (emailError) {
        console.error("Error sending update notification:", emailError);
        // Don't fail the update if email fails
      }

      // Filter response based on user role
      const responseData = filterSupportRequestFields(updatedRequest, userRole);
      res.json(responseData);
    } catch (error: any) {
      console.error("Error updating support request:", error);
      res.status(500).json({ message: "Failed to update support request" });
    }
  });

  // DELETE /api/support-requests/:id — Admin only
  app.delete('/api/support-requests/:id', isAuthenticated, async (req: any, res) => {
    try {
      const requestId = parseInt(req.params.id as string);
      if (isNaN(requestId)) {
        return res.status(400).json({ message: "Invalid request ID" });
      }
      const userId = req.session.user.id;
      const userRole = req.session.user.role;

      // Get existing request for validation
      const existingRequest = await storage.getSupportRequestById(requestId);
      if (!existingRequest) {
        return res.status(404).json({ message: "Support request not found" });
      }

      // Customer access validation
      if (!await hasCustomerAccess(userId, userRole, existingRequest.customerId)) {
        return res.status(403).json({ message: "Access denied to this request" });
      }

      // Only admins can delete support requests
      if (userRole !== 'Admin') {
        return res.status(403).json({ message: "Only administrators can delete support requests" });
      }

      await storage.deleteSupportRequest(requestId);
      res.json({ message: "Support request deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting support request:", error);
      res.status(500).json({ message: "Failed to delete support request" });
    }
  });

  // GET /api/support-requests/count — count scoped by role
  app.get('/api/support-requests/count', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const {
        userId: filterUserId,
        customerId: filterCustomerId,
        type,
        status = 'submitted',
        search,
        assignedToUserId
      } = req.query;

      // Parse numeric query parameters
      const customerIdFilter = filterCustomerId && !isNaN(parseInt(filterCustomerId)) ? parseInt(filterCustomerId) : undefined;

      let count;

      if (INTERNAL_ROLES.includes(userRole as (typeof INTERNAL_ROLES)[number])) {
        // Internal roles can see count for all requests
        count = await storage.getSupportRequestsCount({
          userId: filterUserId,
          customerId: customerIdFilter,
          type,
          status,
          search,
          assignedToUserId,
          includeInternalNotesInSearch: true
        });
      } else {
        // External users see count for requests they can access
        const accessibleCustomers = await getUserAccessibleCustomers(userId, req.session.user.email);

        count = await storage.getSupportRequestsCount({
          userId: filterUserId || userId,
          customerId: customerIdFilter,
          type,
          status,
          search,
          assignedToUserId,
          accessibleCustomerIds: accessibleCustomers,
          includeInternalNotesInSearch: false
        });
      }

      res.json({ count });
    } catch (error: any) {
      console.error("Error fetching support requests count:", error);
      res.status(500).json({ message: "Failed to fetch support requests count" });
    }
  });

  // POST /api/support-requests/upload — file upload to cloud storage
  app.post('/api/support-requests/upload', isAuthenticated, async (req: any, res) => {
    // Use multer upload with error handling
    supportUpload.single('file')(req, res, async (err) => {
      try {
        const userId = req.session.user.id;
        const userRole = req.session.user.role;

        // Handle multer errors
        if (err) {
          console.error("Multer error:", err);

          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
              message: "File too large. Maximum size is 2MB."
            });
          }

          if (err.code === 'UNSUPPORTED_FILE_TYPE' || err.code === 'INVALID_FILENAME') {
            return res.status(400).json({
              message: err.message
            });
          }

          if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
              message: "Too many files. Only one file allowed per upload."
            });
          }

          return res.status(400).json({ message: "File upload error" });
        }

        if (!req.file) {
          return res.status(400).json({ message: "No file uploaded" });
        }

        // Resolve customerId from linked support request or from request body directly
        const supportRequestId = req.body.supportRequestId;
        let resolvedCustomerId: number | null = null;
        if (supportRequestId) {
          const requestIdNum = parseInt(supportRequestId);
          if (!isNaN(requestIdNum)) {
            // Validate access to the support request
            const existingRequest = await storage.getSupportRequestById(requestIdNum);
            if (existingRequest && !await hasCustomerAccess(userId, userRole, existingRequest.customerId)) {
              // Delete uploaded file since access is denied
              discardQuarantinedUpload(req.file.path);
              return res.status(403).json({ message: "Access denied to this support request" });
            }
            resolvedCustomerId = existingRequest?.customerId ?? null;
          }
        } else if (req.body.customerId) {
          // Initial upload before a request exists: use customerId from body for correct path routing
          const bodyCustomerId = parseInt(req.body.customerId);
          if (!isNaN(bodyCustomerId)) {
            if (!await hasCustomerAccess(userId, userRole, bodyCustomerId)) {
              discardQuarantinedUpload(req.file.path);
              return res.status(403).json({ message: "Access denied to this customer" });
            }
            resolvedCustomerId = bodyCustomerId;
          }
        }

        // Promote file through quarantine pipeline to cloud storage
        const safeFilename = normalizeFilename(req.file.originalname);
        const gcsObjectKey = buildSupportPath(safeFilename, resolvedCustomerId);
        const uploadResult = await processUpload(req.file, gcsObjectKey, 'support');

        if (!uploadResult.ok) {
          return res.status(uploadResult.status).json({ message: uploadResult.reason });
        }

        const pf = uploadResult.file;

        // Log successful upload
        console.log('Support file uploaded to cloud storage:', {
          originalname: pf.originalName,
          gcsPath: pf.gcsPath,
          size: pf.fileSize,
          mimetype: pf.mimeType,
          userId,
          userRole,
          supportRequestId,
          customerId: resolvedCustomerId,
        });

        res.json({
          message: "File uploaded successfully",
          file: {
            originalname: pf.originalName,
            filename: pf.safeFilename,
            size: pf.fileSize,
            mimetype: pf.mimeType,
            url: pf.url,
            gcsPath: pf.gcsPath,
          }
        });
      } catch (error: any) {
        console.error("Error in support file upload:", error);
        res.status(500).json({ message: "Failed to upload file" });
      }
    });
  });

  // GET /api/support-requests/download/:filename — legacy local-disk download
  // Pre-cloud-migration attachments only. Cloud-promoted attachments are served
  // directly from their `file.url` in the upload response.
  app.get('/api/support-requests/download/:filename', isAuthenticated, async (req: any, res) => {
    try {
      const filename = req.params.filename;

      // Validate filename format to prevent path traversal
      if (!filename || !/^support_[a-f0-9-]{36}\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|jpg|png|gif|webp|zip|rar|7z|bin)$/i.test(filename)) {
        return res.status(400).json({ message: "Invalid filename" });
      }

      const attachmentsRoot = path.resolve(uploadsDir, 'support_attachments') + path.sep;
      const filePath = path.resolve(attachmentsRoot, filename);
      if (!filePath.startsWith(attachmentsRoot)) {
        return res.status(400).json({ message: "Invalid filename" });
      }

      // Check if file exists on local disk (legacy only)
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "File not found. Cloud-promoted attachments are accessed via the URL returned at upload time." });
      }

      // Get file stats for security headers
      const stats = fs.statSync(filePath);

      // Set security headers for file download
      res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
      res.setHeader('Content-Type', 'application/octet-stream'); // Force download, don't execute
      res.setHeader('Content-Length', stats.size);
      res.setHeader('X-Content-Type-Options', 'nosniff'); // Prevent MIME sniffing
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

      // Stream the file
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);

      fileStream.on('error', (error) => {
        console.error('Error streaming file:', error);
        if (!res.headersSent) {
          res.status(500).json({ message: "Error downloading file" });
        }
      });

    } catch (error: any) {
      console.error("Error downloading support file:", error);
      res.status(500).json({ message: "Failed to download file" });
    }
  });
}
