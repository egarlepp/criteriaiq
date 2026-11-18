// The ImpactIQ connection (impactiq_connection, migration 093): the ImpactIQ
// address and an effort:read API key, stored AES-256-GCM encrypted with
// encryptText like the other integration secrets and listed in the
// key-rotation manifest. The key never leaves the server; the card only ever
// sees its last four characters.
import { storage } from "../storage";
import { decryptText, encryptText } from "../auth/mfaUtils";
import type { ImpactiqCheck, ImpactiqConnectionSummary } from "@shared/impactiq";

export interface ImpactiqConfig {
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  lastCheck: ImpactiqCheck | null;
}

function readCheck(value: unknown): ImpactiqCheck | null {
  return value && typeof value === "object" && "ok" in value ? (value as ImpactiqCheck) : null;
}

/**
 * Null when nothing is saved, or when the saved key can't be decrypted (a
 * restore onto an install with a different ENCRYPTION_KEY): the admin pastes
 * the key again in that case.
 */
export async function getImpactiqConfig(): Promise<ImpactiqConfig | null> {
  const row = await storage.getImpactiqConnectionRow();
  if (!row?.apiKey || !row.baseUrl) return null;
  let apiKey: string;
  try {
    apiKey = decryptText(row.apiKey);
  } catch {
    return null;
  }
  return { baseUrl: row.baseUrl, apiKey, enabled: row.enabled, lastCheck: readCheck(row.lastCheck) };
}

export async function getImpactiqConnectionSummary(): Promise<ImpactiqConnectionSummary> {
  const config = await getImpactiqConfig();
  if (!config) return { configured: false, enabled: false, baseUrl: null, keyHint: null, lastCheck: null };
  return {
    configured: true,
    enabled: config.enabled,
    baseUrl: config.baseUrl,
    keyHint: config.apiKey.slice(-4),
    lastCheck: config.lastCheck,
  };
}

export async function saveImpactiqConfig(
  value: { baseUrl: string; apiKey?: string; enabled: boolean },
  updatedBy: string | null,
): Promise<void> {
  await storage.saveImpactiqConnectionRow(
    { baseUrl: value.baseUrl, enabled: value.enabled, ...(value.apiKey ? { apiKeyEnc: encryptText(value.apiKey) } : {}) },
    updatedBy,
  );
}
