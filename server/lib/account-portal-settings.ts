// Storage for the Account Portal settings (shared/account-portal-settings.ts).
// One `system_settings` row (key `account_portal`). Missing or invalid rows
// fall back to the defaults, so the portal never breaks on a bad value.
import { storage } from "../storage";
import {
  DEFAULT_ACCOUNT_PORTAL_SETTINGS,
  accountPortalSettingsSchema,
  type AccountPortalSettings,
} from "@shared/account-portal-settings";

export const ACCOUNT_PORTAL_SETTINGS_KEY = "account_portal";

/** Never throws: falls back to defaults when the row is missing or invalid. */
export async function getAccountPortalSettings(): Promise<AccountPortalSettings> {
  try {
    const row = await storage.getSystemSetting(ACCOUNT_PORTAL_SETTINGS_KEY);
    if (row) {
      const parsed = accountPortalSettingsSchema.safeParse(row.value);
      if (parsed.success) return parsed.data;
      console.warn("[account-portal] stored settings are invalid, using defaults");
    }
  } catch (err) {
    console.warn("[account-portal] failed to load settings, using defaults:", err);
  }
  return { ...DEFAULT_ACCOUNT_PORTAL_SETTINGS };
}

export async function saveAccountPortalSettings(
  next: AccountPortalSettings,
  updatedBy: string | undefined,
): Promise<AccountPortalSettings> {
  await storage.upsertSystemSetting(
    ACCOUNT_PORTAL_SETTINGS_KEY,
    next,
    updatedBy,
    "Account Portal links (Admin › Workplace › Terminology)",
  );
  return next;
}
