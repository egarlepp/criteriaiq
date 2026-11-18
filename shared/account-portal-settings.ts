// Account Portal settings (Admin › Workplace › Terminology page, "Account
// Portal" card). One `system_settings` row, key `account_portal`.
//
// internalPortalUrl: the company's own customer/partner portal. When set,
// internal users see a "Go to customer portal" button on the Account Portal
// header. Customers, Partners and Guests never see it. Empty = no button.
import { z } from "zod";

const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((value) => value.startsWith("https://"), { message: "URL must start with https://" });

export const accountPortalSettingsSchema = z.object({
  internalPortalUrl: z.union([z.literal(""), httpsUrl]).default(""),
});

export type AccountPortalSettings = z.infer<typeof accountPortalSettingsSchema>;

export const DEFAULT_ACCOUNT_PORTAL_SETTINGS: AccountPortalSettings = { internalPortalUrl: "" };
