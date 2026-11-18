// API Key management routes (migration 056).
//
// Admin-only CRUD for CriteriaIQ API keys that external systems (e.g. n8n)
// use to authenticate via Bearer token. All routes require an authenticated
// Admin session.
//
// Routes:
//   GET  /api/admin/api-keys          — list all keys (keyHash stripped)
//   POST /api/admin/api-keys          — create new key (plaintext returned once).
//                                        Body: { label, preset? | scopes?, expiresAt? }
//   DELETE /api/admin/api-keys/:id    — revoke (soft-delete; is_active = false)

import type { Express } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated } from "../auth/simpleAuth";
import { resolveScopesForNewKey } from "../auth/apiKeyScopes";

const createApiKeyBodySchema = z.object({
  label: z.string().trim().min(1, "label is required").max(255),
  preset: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  expiresAt: z.iso.datetime({ offset: true }).or(z.iso.date()).nullable().optional(),
});

export function registerApiKeyRoutes(app: Express) {
  // GET /api/admin/api-keys — list all keys (masked)
  app.get("/api/admin/api-keys", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== "Admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const keys = await storage.getApiKeys();
      res.json({ keys });
    } catch (err: any) {
      console.error("[api-key-routes] GET /api/admin/api-keys:", err);
      res.status(500).json({ message: "Failed to retrieve API keys" });
    }
  });

  // POST /api/admin/api-keys — create a new key
  // Returns the plaintext token exactly once. It is NOT stored and cannot be
  // recovered — the caller must copy it immediately.
  app.post("/api/admin/api-keys", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== "Admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const parsed = createApiKeyBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      }
      const { label, preset, scopes, expiresAt } = parsed.data;

      // Scopes come from a preset or an explicit list of issuable scopes.
      // `admin` is no longer issuable (see server/auth/apiKeyScopes.ts).
      const scopeResult = resolveScopesForNewKey({ preset, scopes });
      if (!scopeResult.ok) {
        return res.status(400).json({ message: scopeResult.message });
      }

      const expiresAtDate = expiresAt ? new Date(expiresAt) : null;
      if (expiresAtDate && expiresAtDate.getTime() <= Date.now()) {
        return res.status(400).json({ message: "expiresAt must be in the future" });
      }

      // Generate a 32-byte random token, base64url encoded → ~43 chars
      // Prefix it with "ciq_" for recognisability
      const rawBytes = crypto.randomBytes(32);
      const rawToken = "ciq_" + rawBytes.toString("base64url");

      // First 8 chars are stored as key_prefix for fast bcrypt candidate lookup
      const keyPrefix = rawToken.slice(0, 8);

      // Hash the full token — bcrypt with cost 10 (fast enough, secure enough)
      const keyHash = await bcrypt.hash(rawToken, 10);

      const newKey = await storage.createApiKey({
        keyHash,
        keyPrefix,
        label,
        createdBy: req.session.user.id,
        scopes: scopeResult.scopes,
        isActive: true,
        expiresAt: expiresAtDate,
      });

      // Strip the hash before returning; include the plaintext token exactly once
      const { keyHash: _hash, ...keyWithoutHash } = newKey;

      res.status(201).json({
        key: keyWithoutHash,
        token: rawToken, // ← one-time reveal; never returned again
      });
    } catch (err: any) {
      console.error("[api-key-routes] POST /api/admin/api-keys:", err);
      res.status(500).json({ message: "Failed to create API key" });
    }
  });

  // DELETE /api/admin/api-keys/:id — revoke a key
  app.delete(
    "/api/admin/api-keys/:id",
    isAuthenticated,
    async (req: any, res) => {
      try {
        if (req.session.user.role !== "Admin") {
          return res.status(403).json({ message: "Admin access required" });
        }

        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
          return res.status(400).json({ message: "Invalid key ID" });
        }

        await storage.revokeApiKey(id);
        res.json({ message: "API key revoked successfully" });
      } catch (err: any) {
        console.error("[api-key-routes] DELETE /api/admin/api-keys/:id:", err);
        res.status(500).json({ message: "Failed to revoke API key" });
      }
    }
  );
}
