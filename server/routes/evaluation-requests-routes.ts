// Evaluation Requests CRUD + count + email notifications.
//
// Extracted from server/routes.ts (Phase 8 extraction #3 — see
// docs/archive/routes-split-plan.md). 6 handlers covering the full
// request-tracking surface used by the Sales / Engineering pipeline.
//
// Endpoints owned by this module:
//   POST   /api/evaluation-requests           (auth, creates + emails AR/AE)
//   GET    /api/evaluation-requests           (auth; staff see all, outside users their own)
//   GET    /api/evaluation-requests/count     (auth, scoped by role)
//   GET    /api/evaluation-requests/:id       (auth, with access check)
//   PATCH  /api/evaluation-requests/:id       (auth, edit fields/solutions/status)
//   DELETE /api/evaluation-requests/:id       (auth, creator or Admin only)
//
// Customer-access helpers come from server/lib/customer-access.ts so
// this module and routes.ts share the same logic.
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated } from "../auth/simpleAuth";
import { createEvaluationRequestSchema, updateEvaluationRequestSchema } from "@shared/schema";
import { sendEmail } from "../email/email";
import { notifyEvaluationRequestStatusChanged, notifyEvaluationRequestSubmitted } from "../services/notifications";
import { hasCustomerAccess, getUserAccessibleCustomers } from "../lib/customer-access";
import { isExternalRole } from "../lib/internal-access";

interface EvaluationRequestFilters {
  userId?: string;
  customerId?: number;
  status?: string;
  accessibleCustomerIds?: number[];
}

/**
 * Who sees which requests. Internal roles may filter freely (they can
 * access every account). Outside users are pinned to their own requests on
 * accounts that list them as a contact; their userId filter is ignored, and
 * with no such account they match nothing.
 */
async function evaluationRequestScope(
  sessionUserId: string,
  role: string | null | undefined,
  requested: { userId?: string; customerId?: number; status?: string },
): Promise<EvaluationRequestFilters> {
  if (role && !isExternalRole(role)) return requested;
  const accessibleCustomerIds = await getUserAccessibleCustomers(sessionUserId, null);
  return {
    ...requested,
    userId: sessionUserId,
    // [-1] matches no account, so an empty list never means "no filter".
    accessibleCustomerIds: accessibleCustomerIds.length > 0 ? accessibleCustomerIds : [-1],
  };
}

export function registerEvaluationRequestsRoutes(app: Express) {
  // POST /api/evaluation-requests — create + email AR/AE
  app.post('/api/evaluation-requests', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      // userId comes from the session; the schema rejects unknown fields
      // and checks end date >= start date and at least one solution.
      const { solutionIds, ...validatedData } = createEvaluationRequestSchema.parse(req.body);

      // Security Check: Verify user has access to the customer before creating evaluation request
      if (!await hasCustomerAccess(userId, userRole, validatedData.customerId)) {
        return res.status(403).json({ message: "Access denied to this customer" });
      }

      // Create the evaluation request with products in a transaction
      const requestData = {
        ...validatedData,
        userId: userId
      };

      const newRequest = await storage.createEvaluationRequestWithProducts(requestData, solutionIds);

      // Send email notification to Account Representative and Account Engineer
      try {
        const customer = await storage.getCustomer(validatedData.customerId);
        if (customer) {
          notifyEvaluationRequestSubmitted({
            customerId: validatedData.customerId,
            accountName: customer.accountName ?? null,
            requesterName: [req.session.user.firstName, req.session.user.lastName].filter(Boolean).join(' ') || null,
            accountRepresentativeId: customer.accountRepresentativeId,
            accountEngineerId: customer.accountEngineerId,
            actorUserId: userId,
          });
        }
        if (customer && (customer.accountRepresentativeId || customer.accountEngineerId)) {
          // Get solution names for email
          const solutions = await storage.getProductsByIds(solutionIds);
          const solutionNames = solutions.map(s => s.name);

          const emailData = {
            requesterName: req.session.user.firstName + ' ' + req.session.user.lastName,
            requesterEmail: req.session.user.email,
            customerName: customer.accountName,
            solutions: solutionNames,
            startDate: validatedData.startDate.toLocaleDateString(),
            endDate: validatedData.endDate.toLocaleDateString(),
            topReasons: validatedData.topReasons,
            compellingEvent: validatedData.compellingEvent,
            status: 'Open'
          };

          // Send to Account Representative
          if (customer.accountRepresentativeId) {
            const accountRep = await storage.getUser(customer.accountRepresentativeId);
            if (accountRep && accountRep.email) {
              await sendEmail({
                to: accountRep.email,
                template: 'Evaluation Request Submitted',
                data: emailData
              } as any);
            }
          }

          // Send to Account Engineer
          if (customer.accountEngineerId) {
            const accountEngineer = await storage.getUser(customer.accountEngineerId);
            if (accountEngineer && accountEngineer.email) {
              await sendEmail({
                to: accountEngineer.email,
                template: 'Evaluation Request Submitted',
                data: emailData
              } as any);
            }
          }
        }
      } catch (emailError) {
        console.error('Failed to send evaluation request notification email:', emailError);
        // Don't fail the request creation if email fails
      }

      res.status(201).json(newRequest);
    } catch (error: any) {
      console.error("Error creating evaluation request:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.issues });
      }
      res.status(500).json({ message: "Failed to create evaluation request" });
    }
  });

  // GET /api/evaluation-requests — list scoped by role
  app.get('/api/evaluation-requests', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const { userId: filterUserId, customerId: filterCustomerId, status } = req.query;

      // Internal roles (Admin, SE, Sales, CX, Product, ...) see every request
      // on the accounts they can access, which is every account: requests
      // come from the account's customers, so staff must see them all.
      // Outside users (Customer, Guest, Partner) see only their own.
      const requests = await storage.getEvaluationRequests(
        await evaluationRequestScope(userId, userRole, {
          userId: filterUserId,
          customerId: filterCustomerId ? parseInt(filterCustomerId) : undefined,
          status,
        }),
      );

      res.json(requests);
    } catch (error: any) {
      console.error("Error fetching evaluation requests:", error);
      res.status(500).json({ message: "Failed to fetch evaluation requests" });
    }
  });

  // GET /api/evaluation-requests/count — count scoped by role (must precede /:id)
  app.get('/api/evaluation-requests/count', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const { userId: filterUserId, customerId: filterCustomerId, status = 'open' } = req.query;

      const count = await storage.getEvaluationRequestsCount(
        await evaluationRequestScope(userId, userRole, {
          userId: filterUserId,
          customerId: filterCustomerId && !isNaN(parseInt(filterCustomerId)) ? parseInt(filterCustomerId) : undefined,
          status,
        }),
      );

      res.json({ count });
    } catch (error: any) {
      console.error("Error fetching evaluation requests count:", error);
      res.status(500).json({ message: "Failed to fetch evaluation requests count" });
    }
  });

  // GET /api/evaluation-requests/:id — single request with access check
  app.get('/api/evaluation-requests/:id', isAuthenticated, async (req: any, res) => {
    try {
      const requestId = parseInt(req.params.id as string);

      // Validate that requestId is a valid number
      if (isNaN(requestId)) {
        return res.status(400).json({ message: "Invalid request ID" });
      }

      const userId = req.session.user.id;
      const userRole = req.session.user.role;

      const request = await storage.getEvaluationRequestDetailById(requestId);
      if (!request) {
        return res.status(404).json({ message: "Evaluation request not found" });
      }

      // Check access permissions
      if (userRole !== 'Admin' && request.userId !== userId) {
        if (!await hasCustomerAccess(userId, userRole, request.customerId)) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      res.json(request);
    } catch (error: any) {
      console.error("Error fetching evaluation request:", error);
      res.status(500).json({ message: "Failed to fetch evaluation request" });
    }
  });

  // PATCH /api/evaluation-requests/:id — edit fields, solutions and status
  app.patch('/api/evaluation-requests/:id', isAuthenticated, async (req: any, res) => {
    try {
      const requestId = parseInt(req.params.id as string);

      // Validate that requestId is a valid number
      if (isNaN(requestId)) {
        return res.status(400).json({ message: "Invalid request ID" });
      }

      const userId = req.session.user.id;
      const userRole = req.session.user.role;

      // Get the request to check permissions
      const request = await storage.getEvaluationRequestById(requestId);
      if (!request) {
        return res.status(404).json({ message: "Evaluation request not found" });
      }

      // Check access permissions
      if (userRole !== 'Admin' && request.userId !== userId) {
        if (!await hasCustomerAccess(userId, userRole, request.customerId)) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      // Only the editable fields are accepted (.strict() rejects userId,
      // customerId, id and timestamps).
      const { solutionIds, ...allowedUpdates } = updateEvaluationRequestSchema.parse(req.body);
      const nextStart = allowedUpdates.startDate ?? request.startDate;
      const nextEnd = allowedUpdates.endDate ?? request.endDate;
      if (nextEnd < nextStart) {
        return res.status(400).json({ message: "End date must be on or after the start date" });
      }

      await storage.updateEvaluationRequestWithProducts(requestId, allowedUpdates, solutionIds);
      const updatedRequest = await storage.getEvaluationRequestDetailById(requestId);
      if (allowedUpdates.status && allowedUpdates.status !== request.status) {
        const customer = await storage.getCustomer(request.customerId).catch(() => undefined);
        notifyEvaluationRequestStatusChanged({
          requesterId: request.userId,
          customerId: request.customerId,
          accountName: customer?.accountName ?? null,
          newStatus: allowedUpdates.status,
          actorUserId: userId,
        });
      }
      res.json(updatedRequest);
    } catch (error: any) {
      console.error("Error updating evaluation request:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.issues });
      }
      res.status(500).json({ message: "Failed to update evaluation request" });
    }
  });

  // DELETE /api/evaluation-requests/:id — creator or Admin only
  app.delete('/api/evaluation-requests/:id', isAuthenticated, async (req: any, res) => {
    try {
      const requestId = parseInt(req.params.id as string);

      // Validate that requestId is a valid number
      if (isNaN(requestId)) {
        return res.status(400).json({ message: "Invalid request ID" });
      }

      const userId = req.session.user.id;
      const userRole = req.session.user.role;

      // Get the request to check permissions
      const request = await storage.getEvaluationRequestById(requestId);
      if (!request) {
        return res.status(404).json({ message: "Evaluation request not found" });
      }

      // Check access permissions (only request creator or admin can delete)
      if (userRole !== 'Admin' && request.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      await storage.deleteEvaluationRequest(requestId);
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting evaluation request:", error);
      res.status(500).json({ message: "Failed to delete evaluation request" });
    }
  });
}
