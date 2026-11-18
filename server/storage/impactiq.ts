// ImpactIQ connection — mixin for DatabaseStorage.
//
// The one impactiq_connection row (migration 093). The API key arrives
// already encrypted with encryptText; this layer never sees the plaintext.
import { db } from "../db";
import { eq } from "drizzle-orm";
import { impactiqConnection, type ImpactiqConnectionRow } from "@shared/schema";

const CONNECTION_ROW_ID = 1;

export interface ImpactiqConnectionWrite {
  baseUrl: string;
  /** Already encrypted with encryptText (server/auth/mfaUtils.ts). Omit to keep the saved key. */
  apiKeyEnc?: string;
  enabled: boolean;
}

export class ImpactiqStorageMixin {
  async getImpactiqConnectionRow(): Promise<ImpactiqConnectionRow | null> {
    const [row] = await db.select().from(impactiqConnection).where(eq(impactiqConnection.id, CONNECTION_ROW_ID)).limit(1);
    return row ?? null;
  }

  /** Saves the connection. A new address or key makes the last check stale, so it is cleared. */
  async saveImpactiqConnectionRow(value: ImpactiqConnectionWrite, updatedBy: string | null): Promise<void> {
    const existing = await this.getImpactiqConnectionRow();
    const apiKey = value.apiKeyEnc ?? existing?.apiKey;
    if (!apiKey) throw new Error("An ImpactIQ API key is required");
    const changed = !existing || existing.baseUrl !== value.baseUrl || value.apiKeyEnc !== undefined;
    const set = {
      baseUrl: value.baseUrl,
      apiKey,
      enabled: value.enabled,
      ...(changed ? { lastCheck: null } : {}),
      updatedBy,
      updatedAt: new Date(),
    };
    await db
      .insert(impactiqConnection)
      .values({ id: CONNECTION_ROW_ID, ...set })
      .onConflictDoUpdate({ target: impactiqConnection.id, set });
  }

  async saveImpactiqConnectionCheck(check: unknown): Promise<void> {
    await db.update(impactiqConnection).set({ lastCheck: check }).where(eq(impactiqConnection.id, CONNECTION_ROW_ID));
  }

  async deleteImpactiqConnectionRow(): Promise<void> {
    await db.delete(impactiqConnection).where(eq(impactiqConnection.id, CONNECTION_ROW_ID));
  }
}
