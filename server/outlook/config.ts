// The Outlook sign-in app (outlook_signin_config, migration 102): the
// Microsoft Entra app each person signs in through to link their own Outlook
// calendar. The client secret is stored AES-256-GCM encrypted with
// encryptText and listed in the key-rotation manifest; it never leaves the
// server, and the admin card only sees its last four characters.
import { storage } from "../storage";
import { decryptText, encryptText } from "../auth/mfaUtils";
import { getPublicAppUrl } from "../lib/app-config";
import { OUTLOOK_CALLBACK_PATH, type OutlookSigninSave, type OutlookSigninSummary } from "@shared/outlook";

export interface OutlookSigninConfig {
  enabled: boolean;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  readWorkingHours: boolean;
  writeMapDueDates: boolean;
}

export function outlookRedirectUri(): string {
  const override = process.env.OUTLOOK_REDIRECT_URI?.trim();
  if (override) return override;
  return `${getPublicAppUrl()}${OUTLOOK_CALLBACK_PATH}`;
}

/**
 * Null when nothing is saved, or when the secret can't be decrypted (a
 * restore onto an install with a different ENCRYPTION_KEY): the admin pastes
 * the secret again in that case.
 */
export async function getOutlookSigninConfig(): Promise<OutlookSigninConfig | null> {
  const row = await storage.getOutlookSigninConfigRow();
  if (!row?.clientSecret) return null;
  let clientSecret: string;
  try {
    clientSecret = decryptText(row.clientSecret);
  } catch {
    return null;
  }
  return {
    enabled: row.enabled,
    tenantId: row.tenantId,
    clientId: row.clientId,
    clientSecret,
    readWorkingHours: row.readWorkingHours,
    writeMapDueDates: row.writeMapDueDates,
  };
}

/** Saved and switched on: people can link their calendar. */
export async function getActiveOutlookSigninConfig(): Promise<OutlookSigninConfig | null> {
  const config = await getOutlookSigninConfig();
  return config?.enabled ? config : null;
}

export async function getOutlookSigninSummary(): Promise<OutlookSigninSummary> {
  const [config, connectedUsers] = await Promise.all([getOutlookSigninConfig(), storage.countOutlookConnectedUsers()]);
  return {
    configured: config !== null,
    enabled: !!config?.enabled,
    tenantId: config?.tenantId ?? null,
    clientId: config?.clientId ?? null,
    secretHint: config ? config.clientSecret.slice(-4) : null,
    redirectUri: outlookRedirectUri(),
    connectedUsers,
    readWorkingHours: !!config?.readWorkingHours,
    writeMapDueDates: !!config?.writeMapDueDates,
  };
}

export async function saveOutlookSigninConfig(value: OutlookSigninSave, updatedBy: string | null): Promise<void> {
  await storage.saveOutlookSigninConfigRow(
    {
      tenantId: value.tenantId,
      clientId: value.clientId,
      enabled: value.enabled,
      ...(value.readWorkingHours !== undefined ? { readWorkingHours: value.readWorkingHours } : {}),
      ...(value.writeMapDueDates !== undefined ? { writeMapDueDates: value.writeMapDueDates } : {}),
      ...(value.clientSecret ? { clientSecretEnc: encryptText(value.clientSecret) } : {}),
    },
    updatedBy,
  );
}
