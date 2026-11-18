// Per-user Outlook sign-in, ported from ImpactIQ's My Settings › Outlook.
// The admin saves one Microsoft Entra app (Admin › Integrations › Overview ›
// Outlook sign-in); each person then links their own Outlook calendar on
// Profile Settings › Integrations. Read-only unless the admin turns on MAP
// due dates in Outlook, which adds Calendars.ReadWrite: CriteriaIQ then only
// adds, moves and removes its own all-day due-date events.
import { z } from "zod";

/** Delegated Microsoft Graph scopes asked for at sign-in. */
export const OUTLOOK_SCOPES = ["openid", "profile", "offline_access", "User.Read", "Calendars.Read"] as const;

/**
 * Asked for too when the admin turns on "Read working days from Outlook".
 * Only at sign-in: token redemption and refresh keep OUTLOOK_SCOPES, and
 * Microsoft still issues tokens carrying every scope the person consented
 * to, so people who linked Outlook before keep working without it.
 */
export const OUTLOOK_WORKING_HOURS_SCOPE = "MailboxSettings.Read";

/** Asked for too when the admin turns on "Add MAP due dates to Outlook" (same rules as above). */
export const OUTLOOK_WRITE_SCOPE = "Calendars.ReadWrite";

/** The scopes the sign-in page asks for. */
export function outlookAuthorizeScopes(readWorkingHours: boolean, writeMapDueDates = false): string[] {
  return [
    ...OUTLOOK_SCOPES,
    ...(readWorkingHours ? [OUTLOOK_WORKING_HOURS_SCOPE] : []),
    ...(writeMapDueDates ? [OUTLOOK_WRITE_SCOPE] : []),
  ];
}

/** Path Microsoft sends the person back to; the admin registers it on the Entra app. */
export const OUTLOOK_CALLBACK_PATH = "/api/auth/microsoft/callback";

// A directory id (GUID), a verified domain, or "organizations" (any work
// or school account). "common" and "consumers" would let personal Microsoft
// accounts in, which never have a work calendar.
const TENANT_PATTERN = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|organizations|(?=.{3,100}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)$/i;
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidOutlookTenant(value: string): boolean {
  return TENANT_PATTERN.test(value);
}

export const outlookSigninSaveSchema = z.object({
  tenantId: z.string().trim().refine(isValidOutlookTenant, { message: "invalid_tenant" }),
  clientId: z.string().trim().regex(GUID_PATTERN, { message: "invalid_client_id" }),
  /** Omit to keep the saved secret. */
  clientSecret: z.string().trim().min(1).max(500).optional(),
  enabled: z.boolean(),
  /** Omit to keep the saved choice. */
  readWorkingHours: z.boolean().optional(),
  /** Omit to keep the saved choice. */
  writeMapDueDates: z.boolean().optional(),
});
export type OutlookSigninSave = z.infer<typeof outlookSigninSaveSchema>;

/** errorCode values the admin routes answer with; the card translates them. */
export const OUTLOOK_ERROR_CODES = ["invalid", "credentials_rejected", "unreachable", "unknown"] as const;
export type OutlookErrorCode = (typeof OUTLOOK_ERROR_CODES)[number];

/** What the admin card sees. Never the secret, only its last four characters. */
export interface OutlookSigninSummary {
  configured: boolean;
  enabled: boolean;
  tenantId: string | null;
  clientId: string | null;
  secretHint: string | null;
  /** The address to add as a Web redirect URI on the Entra app. */
  redirectUri: string;
  /** People who have linked their Outlook calendar. */
  connectedUsers: number;
  /** Sign-in also asks for MailboxSettings.Read, and the daily sync sets work weeks. */
  readWorkingHours: boolean;
  /** Sign-in also asks for Calendars.ReadWrite, and MAP due dates go to people's Outlook. */
  writeMapDueDates: boolean;
}

/** What GET /api/outlook/me answers, for Profile Settings › Integrations and the sidebar icon. */
export interface MyOutlookConnection {
  /** The admin has saved the Entra app and switched Outlook sign-in on. */
  available: boolean;
  /** Customer, Guest and Partner users never link a calendar; screens show no card. */
  external: boolean;
  /** A token is on file for this person. */
  connected: boolean;
  /**
   * Whether Microsoft still accepted the stored token on the last check
   * (cached a few minutes). false = revoked or expired, so the person must
   * reconnect. null = not connected, or the check couldn't tell.
   */
  healthy: boolean | null;
  /** The mailbox the token belongs to. */
  accountLabel: string | null;
  connectedAt: string | null;
}

/** True when the person has a working Outlook link. null = Outlook sign-in doesn't apply to them. */
export function isOutlookConnectionReady(me: MyOutlookConnection | undefined | null): boolean | null {
  if (!me || me.external || (!me.available && !me.connected)) return null;
  return me.connected && me.healthy !== false;
}
