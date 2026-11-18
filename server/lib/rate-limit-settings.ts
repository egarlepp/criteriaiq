// Admin-configurable global API rate limit (Admin › Integrations ›
// Overview › Rate Limiting), ported from ImpactIQ.
//
// Stored as one `system_settings` row (key `rate_limit_settings`) and
// cached in memory so the global limiter in server/routes.ts can read it
// synchronously on every request without touching the database. A save
// updates the cache, so changes apply live with no restart.
//
// Per-route limiters (login + MFA in auth_rate_limits, SSO login/callback,
// MCP) stack tighter caps on top and are not controlled here.

import { z } from "zod";
import { storage } from "../storage";
import type { DynamicRateLimitSettings } from "./rate-limiter";

export const RATE_LIMIT_SETTINGS_KEY = "rate_limit_settings";

export const RATE_LIMIT_BOUNDS = {
  minWindowSeconds: 10,
  maxWindowSeconds: 3600,
  minMax: 1,
  maxMax: 1_000_000,
} as const;

export const rateLimitSettingsSchema = z.object({
  enabled: z.boolean(),
  max: z.number().int().min(RATE_LIMIT_BOUNDS.minMax).max(RATE_LIMIT_BOUNDS.maxMax),
  windowSeconds: z
    .number()
    .int()
    .min(RATE_LIMIT_BOUNDS.minWindowSeconds)
    .max(RATE_LIMIT_BOUNDS.maxWindowSeconds),
});

export type RateLimitSettings = z.infer<typeof rateLimitSettingsSchema>;

// Same limit the hardcoded limiter used before this became configurable
// (600 requests per minute), so an upgrade changes nothing until an admin
// edits it.
export const DEFAULT_RATE_LIMIT_SETTINGS: RateLimitSettings = {
  enabled: true,
  max: 600,
  windowSeconds: 60,
};

let cached: RateLimitSettings = { ...DEFAULT_RATE_LIMIT_SETTINGS };

/** Warm the cache from the database. Never throws; keeps defaults on error. */
export async function loadRateLimitSettings(): Promise<void> {
  try {
    const row = await storage.getSystemSetting(RATE_LIMIT_SETTINGS_KEY);
    if (!row) return;
    const parsed = rateLimitSettingsSchema.safeParse(row.value);
    if (parsed.success) {
      cached = parsed.data;
    } else {
      console.warn("[rate-limit] stored settings are invalid, using defaults");
    }
  } catch (err) {
    console.warn("[rate-limit] failed to load settings, using defaults:", err);
  }
}

export function getRateLimitSettings(): RateLimitSettings {
  return cached;
}

/** Synchronous read for the middleware. Never hits the database. */
export function getRateLimitForMiddleware(): DynamicRateLimitSettings {
  return { enabled: cached.enabled, max: cached.max, windowMs: cached.windowSeconds * 1000 };
}

export async function saveRateLimitSettings(
  next: RateLimitSettings,
  updatedBy: string | undefined,
): Promise<RateLimitSettings> {
  await storage.upsertSystemSetting(
    RATE_LIMIT_SETTINGS_KEY,
    next,
    updatedBy,
    "Global API rate limit (Admin › Integrations)",
  );
  cached = next;
  return next;
}
