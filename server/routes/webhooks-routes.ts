// Webhook System routes (Phase 8 extraction #11g).
//
// 9 handlers covering custom-webhook CRUD, delivery history,
// templates, manual test fire, and active-state toggle:
//
//   GET    /api/webhooks
//   GET    /api/webhooks/:id
//   POST   /api/webhooks
//   PUT    /api/webhooks/:id
//   DELETE /api/webhooks/:id
//   POST   /api/webhooks/:id/test
//   GET    /api/webhooks/:id/deliveries
//   GET    /api/webhook-templates
//   POST   /api/webhooks/:id/toggle
//
//   subscribedEvents (migration 080): Admin-only list of system trigger
//   keys delivered straight to the webhook by
//   server/services/automation-events.ts.
//
// Notes:
//   - Webhook signing secrets are encrypted-at-rest via encryptText
//     (auth/mfaUtils, top-level import; not lazy here).
//   - Per-user vs admin scoping: admins see all webhooks, regular
//     users only see their own. Edit/delete/toggle requires the same
//     check.
//   - The webhook-service and webhook-templates modules stay
//     dynamic-imported as they were inline.
//
// Mechanical move — schema accesses now go through direct
// `@shared/schema` imports (cleanup pass).
import type { Express } from "express";
import { and, eq, or, desc, sql } from "drizzle-orm";
import { storage } from "../storage";
import { applyDemoFilter, applyDemoFlag } from "../lib/demo-storage";
import { webhooks, users } from "@shared/schema";
import { isAuthenticated } from "../auth/simpleAuth";
import { requireInternalUser } from "../lib/internal-access";
import { assertOutboundUrl, OutboundUrlError } from "../lib/outbound-url";
import { encryptText } from "../auth/mfaUtils";
import { getSystemTrigger } from "../email/email-trigger-registry";

const MAX_SUBSCRIBED_EVENTS = 200;

/**
 * Validates a subscribedEvents payload (migration 080). Event subscriptions
 * push project data to the endpoint without any automation rule in between,
 * so only Admins may set them.
 */
function parseSubscribedEvents(
  input: unknown,
  isAdmin: boolean,
): { ok: true; value: string[] | undefined } | { ok: false; status: number; message: string } {
  if (input === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(input) || input.length > MAX_SUBSCRIBED_EVENTS || input.some((k) => typeof k !== "string")) {
    return { ok: false, status: 400, message: "subscribedEvents must be an array of trigger keys" };
  }
  const keys = Array.from(new Set(input as string[]));
  if (keys.length > 0 && !isAdmin) {
    return { ok: false, status: 403, message: "Only admins can subscribe webhooks to events" };
  }
  const unknown = keys.filter((k) => !getSystemTrigger(k));
  if (unknown.length > 0) {
    return { ok: false, status: 400, message: `Unknown trigger keys: ${unknown.join(", ")}` };
  }
  return { ok: true, value: keys };
}

export function registerWebhooksRoutes(app: Express) {
  // GET /api/webhooks - List all webhooks
  app.get("/api/webhooks", isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const userRole = req.session.user.role;

      // Build query - admins see all, users see their own
      let result;
      if (userRole === 'Admin') {
        result = await storage.db
          .select({
            id: webhooks.id,
            name: webhooks.name,
            description: webhooks.description,
            serviceType: webhooks.serviceType,
            endpointUrl: webhooks.endpointUrl,
            isActive: webhooks.isActive,
            retryEnabled: webhooks.retryEnabled,
            maxRetries: webhooks.maxRetries,
            subscribedEvents: webhooks.subscribedEvents,
            createdBy: webhooks.createdBy,
            createdAt: webhooks.createdAt,
            updatedAt: webhooks.updatedAt,
            creatorName: sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.email})`,
          })
          .from(webhooks)
          .leftJoin(users, eq(webhooks.createdBy, users.id))
          .where(applyDemoFilter(webhooks))
          .orderBy(desc(webhooks.createdAt));
      } else {
        result = await storage.db
          .select({
            id: webhooks.id,
            name: webhooks.name,
            description: webhooks.description,
            serviceType: webhooks.serviceType,
            endpointUrl: webhooks.endpointUrl,
            isActive: webhooks.isActive,
            retryEnabled: webhooks.retryEnabled,
            maxRetries: webhooks.maxRetries,
            subscribedEvents: webhooks.subscribedEvents,
            createdBy: webhooks.createdBy,
            createdAt: webhooks.createdAt,
            updatedAt: webhooks.updatedAt,
          })
          .from(webhooks)
          .where(and(eq(webhooks.createdBy, userId), applyDemoFilter(webhooks)))
          .orderBy(desc(webhooks.createdAt));
      }

      res.json({ webhooks: result });
    } catch (error: any) {
      console.error("Error fetching webhooks:", error);
      res.status(500).json({ message: "Failed to fetch webhooks" });
    }
  });

  // GET /api/webhooks/:id - Get a single webhook
  app.get("/api/webhooks/:id", isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const webhookId = parseInt(req.params.id as string);
      const userId = req.session.user.id;
      const userRole = req.session.user.role;

      const [webhook] = await storage.db
        .select()
        .from(webhooks)
        .where(and(eq(webhooks.id, webhookId), applyDemoFilter(webhooks)))
        .limit(1);

      if (!webhook) {
        return res.status(404).json({ message: "Webhook not found" });
      }

      // Check ownership (admins can see all)
      if (userRole !== 'Admin' && webhook.createdBy !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Don't expose the signing secret
      const { signingSecret, ...safeWebhook } = webhook;

      res.json({ webhook: { ...safeWebhook, hasSigningSecret: !!signingSecret } });
    } catch (error: any) {
      console.error("Error fetching webhook:", error);
      res.status(500).json({ message: "Failed to fetch webhook" });
    }
  });

  // POST /api/webhooks - Create a new webhook
  app.post("/api/webhooks", isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const {
        name,
        description,
        serviceType,
        endpointUrl,
        template,
        headers,
        signingSecret,
        isActive,
        retryEnabled,
        maxRetries,
        timeoutMs,
        subscribedEvents
      } = req.body;

      if (!name || !serviceType || !endpointUrl || !template) {
        return res.status(400).json({ 
          message: "name, serviceType, endpointUrl, and template are required" 
        });
      }

      if (endpointUrl !== undefined) {
        try {
          await assertOutboundUrl(endpointUrl);
        } catch (error) {
          const message = error instanceof OutboundUrlError ? error.message : "Endpoint URL is not allowed";
          return res.status(400).json({ message });
        }
      }

      const parsedEvents = parseSubscribedEvents(subscribedEvents, req.session.user.role === 'Admin');
      if (!parsedEvents.ok) {
        return res.status(parsedEvents.status).json({ message: parsedEvents.message });
      }

      // Encrypt signing secret if provided
      let encryptedSecret = null;
      if (signingSecret) {
        encryptedSecret = encryptText(signingSecret);
      }

      const [newWebhook] = await storage.db
        .insert(webhooks)
        .values(applyDemoFlag({
          name,
          description: description || null,
          serviceType,
          endpointUrl,
          template,
          headers: headers || null,
          signingSecret: encryptedSecret,
          isActive: isActive !== false,
          retryEnabled: retryEnabled !== false,
          maxRetries: maxRetries || 3,
          timeoutMs: timeoutMs || 30000,
          subscribedEvents: parsedEvents.value ?? [],
          createdBy: userId,
          updatedBy: userId,
        }))
        .returning();

      // Don't expose the signing secret in response
      const { signingSecret: _, ...safeWebhook } = newWebhook;

      res.status(201).json({ 
        webhook: { ...safeWebhook, hasSigningSecret: !!encryptedSecret } 
      });
    } catch (error: any) {
      console.error("Error creating webhook:", error);
      res.status(500).json({ message: "Failed to create webhook" });
    }
  });

  // PUT /api/webhooks/:id - Update a webhook
  app.put("/api/webhooks/:id", isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const webhookId = parseInt(req.params.id as string);
      const userId = req.session.user.id;
      const userRole = req.session.user.role;

      // Check existence and ownership
      const [existing] = await storage.db
        .select()
        .from(webhooks)
        .where(and(eq(webhooks.id, webhookId), applyDemoFilter(webhooks)))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ message: "Webhook not found" });
      }

      // Admins can edit all, users can only edit their own
      if (userRole !== 'Admin' && existing.createdBy !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const {
        name,
        description,
        serviceType,
        endpointUrl,
        template,
        headers,
        signingSecret,
        clearSigningSecret,
        isActive,
        retryEnabled,
        maxRetries,
        timeoutMs,
        subscribedEvents
      } = req.body;

      const isAdmin = userRole === 'Admin';
      // A webhook with event subscriptions receives project data directly;
      // a non-admin owner must not be able to repoint it elsewhere.
      if (!isAdmin && (existing.subscribedEvents ?? []).length > 0) {
        return res.status(403).json({ message: "Only admins can edit webhooks with event subscriptions" });
      }
      if (endpointUrl !== undefined) {
        try {
          await assertOutboundUrl(endpointUrl);
        } catch (error) {
          const message = error instanceof OutboundUrlError ? error.message : "Endpoint URL is not allowed";
          return res.status(400).json({ message });
        }
      }
      const parsedEvents = parseSubscribedEvents(subscribedEvents, isAdmin);
      if (!parsedEvents.ok) {
        return res.status(parsedEvents.status).json({ message: parsedEvents.message });
      }

      // Handle signing secret update
      let encryptedSecret = existing.signingSecret;
      if (clearSigningSecret) {
        encryptedSecret = null;
      } else if (signingSecret) {
        encryptedSecret = encryptText(signingSecret);
      }

      const [updated] = await storage.db
        .update(webhooks)
        .set({
          name: name ?? existing.name,
          description: description !== undefined ? description : existing.description,
          serviceType: serviceType ?? existing.serviceType,
          endpointUrl: endpointUrl ?? existing.endpointUrl,
          template: template ?? existing.template,
          headers: headers !== undefined ? headers : existing.headers,
          signingSecret: encryptedSecret,
          isActive: isActive !== undefined ? isActive : existing.isActive,
          retryEnabled: retryEnabled !== undefined ? retryEnabled : existing.retryEnabled,
          maxRetries: maxRetries ?? existing.maxRetries,
          timeoutMs: timeoutMs ?? existing.timeoutMs,
          subscribedEvents: parsedEvents.value ?? existing.subscribedEvents,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(and(eq(webhooks.id, webhookId), applyDemoFilter(webhooks)))
        .returning();

      // Invalidate template cache
      const { webhookService } = await import('../webhooks/webhook-service.js');
      webhookService.invalidateTemplateCache(webhookId);

      // Don't expose the signing secret
      const { signingSecret: _, ...safeWebhook } = updated;

      res.json({ 
        webhook: { ...safeWebhook, hasSigningSecret: !!encryptedSecret } 
      });
    } catch (error: any) {
      console.error("Error updating webhook:", error);
      res.status(500).json({ message: "Failed to update webhook" });
    }
  });

  // DELETE /api/webhooks/:id - Delete a webhook
  app.delete("/api/webhooks/:id", isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const webhookId = parseInt(req.params.id as string);
      const userId = req.session.user.id;
      const userRole = req.session.user.role;

      // Check existence and ownership
      const [existing] = await storage.db
        .select()
        .from(webhooks)
        .where(and(eq(webhooks.id, webhookId), applyDemoFilter(webhooks)))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ message: "Webhook not found" });
      }

      // Admins can delete all, users can only delete their own
      if (userRole !== 'Admin' && existing.createdBy !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      await storage.db
        .delete(webhooks)
        .where(and(eq(webhooks.id, webhookId), applyDemoFilter(webhooks)));

      res.json({ message: "Webhook deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting webhook:", error);
      res.status(500).json({ message: "Failed to delete webhook" });
    }
  });

  // POST /api/webhooks/:id/test - Test a webhook
  app.post("/api/webhooks/:id/test", isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const webhookId = parseInt(req.params.id as string);
      const userId = req.session.user.id;
      const userRole = req.session.user.role;

      // Check existence and ownership
      const [existing] = await storage.db
        .select()
        .from(webhooks)
        .where(and(eq(webhooks.id, webhookId), applyDemoFilter(webhooks)))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ message: "Webhook not found" });
      }

      if (userRole !== 'Admin' && existing.createdBy !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { webhookService } = await import('../webhooks/webhook-service.js');
      const result = await webhookService.testWebhook(webhookId);

      res.json({ result });
    } catch (error: any) {
      console.error("Error testing webhook:", error);
      res.status(500).json({ message: "Failed to test webhook" });
    }
  });

  // GET /api/webhooks/:id/deliveries - Get delivery history for a webhook
  app.get("/api/webhooks/:id/deliveries", isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const webhookId = parseInt(req.params.id as string);
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const limit = parseInt(req.query.limit as string) || 10;

      // Check existence and ownership
      const [existing] = await storage.db
        .select()
        .from(webhooks)
        .where(and(eq(webhooks.id, webhookId), applyDemoFilter(webhooks)))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ message: "Webhook not found" });
      }

      if (userRole !== 'Admin' && existing.createdBy !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { webhookService } = await import('../webhooks/webhook-service.js');
      const deliveries = await webhookService.getRecentDeliveries(webhookId, limit);

      res.json({ deliveries });
    } catch (error: any) {
      console.error("Error fetching webhook deliveries:", error);
      res.status(500).json({ message: "Failed to fetch deliveries" });
    }
  });

  // GET /api/webhooks/templates - Get available webhook templates
  app.get("/api/webhook-templates", isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const { WEBHOOK_TEMPLATES, WEBHOOK_VARIABLES } = await import('../webhooks/webhook-templates.js');
      
      // Flatten WEBHOOK_VARIABLES from grouped object to flat array
      const flatVariables = Object.values(WEBHOOK_VARIABLES).flat() as Array<{ name: string; description: string }>;
      
      res.json({ 
        templates: Object.entries(WEBHOOK_TEMPLATES).map(([id, t]) => ({
          id,
          ...t
        })),
        variables: flatVariables
      });
    } catch (error: any) {
      console.error("Error fetching webhook templates:", error);
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });

  // POST /api/webhooks/:id/toggle - Toggle webhook active state
  app.post("/api/webhooks/:id/toggle", isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const webhookId = parseInt(req.params.id as string);
      const userId = req.session.user.id;
      const userRole = req.session.user.role;

      const [existing] = await storage.db
        .select()
        .from(webhooks)
        .where(and(eq(webhooks.id, webhookId), applyDemoFilter(webhooks)))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ message: "Webhook not found" });
      }

      if (userRole !== 'Admin' && existing.createdBy !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const [updated] = await storage.db
        .update(webhooks)
        .set({
          isActive: !existing.isActive,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(and(eq(webhooks.id, webhookId), applyDemoFilter(webhooks)))
        .returning();

      res.json({ 
        webhook: { 
          id: updated.id, 
          isActive: updated.isActive 
        } 
      });
    } catch (error: any) {
      console.error("Error toggling webhook:", error);
      res.status(500).json({ message: "Failed to toggle webhook" });
    }
  });
}
