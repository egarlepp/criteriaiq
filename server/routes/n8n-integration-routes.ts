// n8n integration routes (migration 056).
//
// Three concerns:
//
// 1. Inbound trigger bridge — POST /api/n8n/trigger
//    Allows n8n (or any external caller with an API key) to fire a
//    CriteriaIQ automation trigger by name. The request runs through
//    evaluateAndExecute() — the same evaluate-then-execute path native
//    triggers use — so matching rules' emails, notifications, webhooks etc.
//    actually run. triggerKey must exist in the system trigger registry.
//    Required scope: automation:execute (or admin).
//
// 2. n8n connection config — GET/PUT /api/admin/n8n/config
//    Stores the n8n host URL and an encrypted n8n-side API key so CriteriaIQ
//    can optionally call n8n's management API. Admin-only.
//
// 3. Connection test — POST /api/admin/n8n/config/test
//    PINGs the configured n8n host's /healthz endpoint and records the result.
//    Admin-only.
//
// 4. Workflow list — GET /api/admin/n8n/workflows
//    Active workflows with Webhook trigger URLs, for URL pickers. The old
//    workflow browser and its eight saved sync filters were removed
//    (migration 081).

import type { Express } from "express";
import { storage } from "../storage";
import type { N8nConfig } from "@shared/schema";
import { isAuthenticated } from "../auth/simpleAuth";
import { requireApiKeyScope } from "../auth/apiKeyAuth";
import { encryptText, decryptText } from "../auth/mfaUtils";
import { z } from "zod";
import { assertOutboundUrl, OutboundUrlError } from "../lib/outbound-url";
import { evaluateAndExecute } from "../email/email-automation-engine";
import { getSystemTrigger } from "../email/email-trigger-registry";

const n8nTriggerBodySchema = z.object({
  triggerKey: z.string().trim().min(1, "triggerKey is required").max(200),
  projectId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const WORKFLOW_FETCH_LIMIT = 250;

const n8nConfigBodySchema = z.object({
  hostUrl: z.union([z.url({ protocol: /^https?$/ }).max(500), z.literal(""), z.null()]).optional(),
  apiKey: z.string().trim().max(2000).optional(),
  isEnabled: z.boolean().optional(),
});

function toConfigResponse(config: N8nConfig) {
  return {
    id: config.id,
    hostUrl: config.hostUrl,
    hasApiKey: !!config.apiKeyEnc,
    isEnabled: config.isEnabled,
    lastTestedAt: config.lastTestedAt,
    lastTestResult: config.lastTestResult,
    lastTestError: config.lastTestError,
    updatedBy: config.updatedBy,
    updatedAt: config.updatedAt,
  };
}

export function registerN8nIntegrationRoutes(app: Express) {
  // ─── Inbound trigger bridge ───────────────────────────────────────────

  /**
   * POST /api/n8n/trigger
   * Fire a CriteriaIQ automation trigger from an external system (n8n).
   *
   * Body: {
   *   triggerKey: string,      // e.g. "project.status_changed"
   *   projectId?: number,
   *   metadata?: Record<string, any>
   * }
   *
   * Authenticated via Bearer token (apiKeyAuth middleware set on the app).
   * Requires scope: automation:execute (or admin).
   */
  app.post(
    "/api/n8n/trigger",
    isAuthenticated,
    requireApiKeyScope("automation:execute"),
    async (req: any, res) => {
      try {
        const parsed = n8nTriggerBodySchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
        }
        const { triggerKey, projectId, metadata } = parsed.data;

        if (!getSystemTrigger(triggerKey)) {
          return res.status(400).json({ message: `Unknown triggerKey: ${triggerKey}` });
        }

        // evaluateAndExecute (not evaluateTrigger) — the latter only
        // evaluates which rules match and never runs their actions, so
        // the bridge used to be a silent dry run.
        const { evaluations, executionResults, executedActions } = await evaluateAndExecute({
          triggerKey,
          projectId: projectId !== undefined ? String(projectId) : undefined,
          userId: req.apiKeyContext?.label ?? "n8n",
          metadata: metadata ?? {},
          timestamp: new Date(),
        });

        const matchedCount = evaluations.filter((r) => r.matched).length;

        res.json({
          triggerKey,
          rulesEvaluated: evaluations.length,
          rulesMatched: matchedCount,
          actionsExecuted: executedActions,
          actionsFailed: executionResults.filter((r) => r.status === "failed").length,
          results: evaluations.map((r) => ({
            ruleId: r.ruleId,
            ruleName: r.ruleName,
            matched: r.matched,
            actionsMatched: r.actionsToExecute.length,
          })),
        });
      } catch (err: any) {
        console.error("[n8n-integration-routes] POST /api/n8n/trigger:", err);
        res.status(500).json({ message: "Failed to evaluate trigger" });
      }
    }
  );

  // ─── n8n connection config ────────────────────────────────────────────

  // GET /api/admin/n8n/config — fetch masked config
  app.get("/api/admin/n8n/config", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== "Admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const config = await storage.getN8nConfig();

      // Never return the decrypted API key — only signal whether one is set
      res.json({ config: config ? toConfigResponse(config) : null });
    } catch (err: any) {
      console.error("[n8n-integration-routes] GET /api/admin/n8n/config:", err);
      res.status(500).json({ message: "Failed to fetch n8n configuration" });
    }
  });

  // PUT /api/admin/n8n/config — save config
  app.put("/api/admin/n8n/config", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== "Admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const parsed = n8nConfigBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      }
      const { hostUrl, apiKey, isEnabled } = parsed.data;

      const patch: Parameters<typeof storage.upsertN8nConfig>[0] = {
        updatedBy: req.session.user.id,
      };
      if (hostUrl) {
        try {
          await assertOutboundUrl(hostUrl);
        } catch (error) {
          const message = error instanceof OutboundUrlError ? error.message : "Host URL is not allowed";
          return res.status(400).json({ message });
        }
      }
      if (hostUrl !== undefined) patch.hostUrl = hostUrl || null;
      if (isEnabled !== undefined) patch.isEnabled = isEnabled;
      // Only re-encrypt if a new API key value was explicitly provided
      if (apiKey) patch.apiKeyEnc = encryptText(apiKey);

      const config = await storage.upsertN8nConfig(patch);
      res.json({ config: toConfigResponse(config) });
    } catch (err: any) {
      console.error("[n8n-integration-routes] PUT /api/admin/n8n/config:", err);
      res.status(500).json({ message: "Failed to save n8n configuration" });
    }
  });

  // POST /api/admin/n8n/config/test — test connection to n8n host
  app.post(
    "/api/admin/n8n/config/test",
    isAuthenticated,
    async (req: any, res) => {
      try {
        if (req.session.user.role !== "Admin") {
          return res.status(403).json({ message: "Admin access required" });
        }

        const config = await storage.getN8nConfig();

        if (!config?.hostUrl) {
          return res
            .status(400)
            .json({ message: "n8n host URL is not configured" });
        }

        const start = Date.now();
        let success = false;
        let errorMessage: string | undefined;

        try {
          // n8n exposes GET /healthz (returns 200 with {"status":"ok"})
          const url = config.hostUrl.replace(/\/$/, "") + "/healthz";
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };

          // If an n8n API key is configured, include it in the test request
          if (config.apiKeyEnc) {
            try {
              const plainKey = decryptText(config.apiKeyEnc);
              headers["X-N8N-API-KEY"] = plainKey;
            } catch (_e) {
              // Decryption failure — still attempt without the key
            }
          }

          await assertOutboundUrl(url);
          const response = await fetch(url, {
            method: "GET",
            headers,
            signal: AbortSignal.timeout(8000), // 8 s timeout
            redirect: "manual",
          });

          success = response.ok;
          if (!success) {
            errorMessage = `n8n responded with HTTP ${response.status}`;
          }
        } catch (fetchErr: any) {
          success = false;
          errorMessage = fetchErr?.message ?? "Connection failed";
        }

        const latencyMs = Date.now() - start;
        await storage.updateN8nConfigTestResult({
          success,
          error: errorMessage,
        });

        res.json({ success, latencyMs, error: errorMessage });
      } catch (err: any) {
        console.error(
          "[n8n-integration-routes] POST /api/admin/n8n/config/test:",
          err
        );
        res.status(500).json({ message: "Failed to run connection test" });
      }
    }
  );

  // GET /api/admin/n8n/workflows — slim proxy to n8n's REST API. Returns
  // active workflows that have a Webhook trigger node, with their webhook
  // URLs, for the URL pickers on the Webhook AI provider and the n8n event
  // subscription dialog. Admin-only.
  //
  // Response shape:
  //   { workflows: { id, name, webhookUrls }[], reason?: string }
  //
  // `reason` is present (and workflows is []) when the request cannot be
  // completed: "no_host_url" | "not_enabled" | "no_api_key" | "api_error"
  // | "fetch_error"
  app.get("/api/admin/n8n/workflows", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== "Admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const config = await storage.getN8nConfig();
      if (!config?.hostUrl) return res.json({ workflows: [], reason: "no_host_url" });
      if (!config.isEnabled) return res.json({ workflows: [], reason: "not_enabled" });
      if (!config.apiKeyEnc) return res.json({ workflows: [], reason: "no_api_key" });

      let apiKey: string;
      try {
        apiKey = decryptText(config.apiKeyEnc);
      } catch {
        return res.json({ workflows: [], reason: "no_api_key" });
      }

      const baseUrl = config.hostUrl.replace(/\/$/, "");
      let rawWorkflows: any[] = [];
      try {
        const workflowsUrl = `${baseUrl}/api/v1/workflows?active=true&limit=${WORKFLOW_FETCH_LIMIT}`;
        await assertOutboundUrl(workflowsUrl);
        const response = await fetch(workflowsUrl, {
          headers: { "X-N8N-API-KEY": apiKey },
          signal: AbortSignal.timeout(10_000),
          redirect: "manual",
        });
        if (!response.ok) {
          return res.json({ workflows: [], reason: "api_error", status: response.status });
        }
        const body = await response.json();
        rawWorkflows = Array.isArray(body.data) ? body.data : [];
      } catch (fetchErr: any) {
        return res.json({ workflows: [], reason: "fetch_error", error: fetchErr?.message ?? "Connection failed" });
      }

      const workflows = rawWorkflows
        .map((wf: any) => {
          const nodes: any[] = Array.isArray(wf.nodes) ? wf.nodes : [];
          const webhookUrls = nodes
            .filter((n) => n.type === "n8n-nodes-base.webhook")
            .map((n) => n.parameters?.path ?? "")
            .filter(Boolean)
            .map((path: string) => `${baseUrl}/webhook/${path}`);
          return { id: String(wf.id), name: wf.name ?? "(unnamed)", active: !!wf.active, webhookUrls };
        })
        .filter((wf) => wf.active && wf.webhookUrls.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name));

      res.json({ workflows, n8nBaseUrl: baseUrl });
    } catch (err: any) {
      console.error("[n8n-integration-routes] GET /api/admin/n8n/workflows:", err);
      res.status(500).json({ message: "Failed to fetch n8n workflows" });
    }
  });
}
