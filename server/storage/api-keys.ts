// API Keys + n8n Config storage mixin (migration 056).
//
// Covers two related tables:
//   api_keys  — CRUD for Bearer-token credentials used by external callers
//   n8n_config — single-row n8n connection config (upsert pattern)
//
// Follows the standard mixin pattern (see server/storage/_mixins.ts).
// Registered in server/storage.ts alongside the other 24 domain mixins.

import { db } from "../db";
import { eq, and, desc } from "drizzle-orm";
import { apiKeys, n8nConfig } from "@shared/schema";
import type { ApiKey, InsertApiKey, N8nConfig } from "@shared/schema";

export class ApiKeysStorageMixin {
  // ─── API Keys ─────────────────────────────────────────────────────────

  /** Returns all API keys with keyHash stripped out (never sent to client). */
  async getApiKeys(): Promise<Omit<ApiKey, "keyHash">[]> {
    const rows = await db
      .select()
      .from(apiKeys)
      .orderBy(desc(apiKeys.createdAt));
    return rows.map(({ keyHash: _hash, ...rest }) => rest);
  }

  /** Inserts a new API key row. Caller must supply the bcrypt hash + prefix. */
  async createApiKey(data: InsertApiKey): Promise<ApiKey> {
    const [row] = await db.insert(apiKeys).values(data).returning();
    return row;
  }

  /**
   * Soft-revokes a key by setting is_active = false.
   * The row is retained for audit; bcrypt lookup will skip inactive keys.
   */
  async revokeApiKey(id: number): Promise<void> {
    await db
      .update(apiKeys)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(apiKeys.id, id));
  }

  /**
   * Used by apiKeyAuth middleware for fast prefix-filtered lookups.
   * Returns only active keys with the given prefix string.
   */
  async getActiveApiKeysByPrefix(prefix: string): Promise<ApiKey[]> {
    return db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.keyPrefix, prefix), eq(apiKeys.isActive, true)));
  }

  // ─── n8n Config ───────────────────────────────────────────────────────

  /** Returns the single n8n config row, or undefined if none exists yet. */
  async getN8nConfig(): Promise<N8nConfig | undefined> {
    const [row] = await db.select().from(n8nConfig).limit(1);
    return row;
  }

  /**
   * Creates or updates the single n8n config row.
   * Partial updates are supported — only provided fields are written.
   */
  async upsertN8nConfig(
    data: Partial<{
      hostUrl: string | null;
      apiKeyEnc: string | null;
      isEnabled: boolean;
      updatedBy: string;
    }>
  ): Promise<N8nConfig> {
    const existing = await this.getN8nConfig();
    if (existing) {
      const [row] = await db
        .update(n8nConfig)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(n8nConfig.id, existing.id))
        .returning();
      return row;
    } else {
      const [row] = await db
        .insert(n8nConfig)
        .values({ ...data })
        .returning();
      return row;
    }
  }

  /** Records the result of a connection test against the n8n host. */
  async updateN8nConfigTestResult(result: {
    success: boolean;
    error?: string;
  }): Promise<void> {
    const existing = await this.getN8nConfig();
    if (!existing) return;
    await db
      .update(n8nConfig)
      .set({
        lastTestedAt: new Date(),
        lastTestResult: result.success ? "success" : "failed",
        lastTestError: result.error ?? null,
        updatedAt: new Date(),
      })
      .where(eq(n8nConfig.id, existing.id));
  }
}
