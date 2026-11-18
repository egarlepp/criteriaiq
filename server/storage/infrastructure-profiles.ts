// Infrastructure Discovery profiles — mixin for DatabaseStorage.
//
// Reads used by the "profile attached to a project" feature (migration 125,
// docs/features/infrastructure-discovery.md): one profile by id, and a
// per-account summary (how many profiles, which is the default) that the
// Account Directory and the project form use to show the Infrastructure
// Discovery icon bold with the default profile's name.
//
// The profile CRUD routes in server/routes/products-criteria-routes.ts
// still query the table directly; they predate this mixin.
import { db } from "../db";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { infrastructureProfiles } from "@shared/schema";
import { resolveCustomerIdByName } from "./_project-customer";

export interface InfrastructureProfileRef {
  id: number;
  customerId: number;
  profileName: string;
  isDefault: boolean;
}

export interface InfrastructureProfileSummary {
  customerId: number;
  profileCount: number;
  /** The account's default profile, else its first one by name. */
  defaultProfileId: number;
  defaultProfileName: string;
}

const refColumns = {
  id: infrastructureProfiles.id,
  customerId: infrastructureProfiles.customerId,
  profileName: infrastructureProfiles.profileName,
  isDefault: infrastructureProfiles.isDefault,
};

export class InfrastructureProfilesStorageMixin {
  /** The one account with this name, or null; lets the project routes check a profile's account. */
  async resolveCustomerIdByName(name: string | null | undefined): Promise<number | null> {
    return resolveCustomerIdByName(name);
  }

  async getInfrastructureProfileRef(id: number): Promise<InfrastructureProfileRef | undefined> {
    const [row] = await db.select(refColumns).from(infrastructureProfiles).where(eq(infrastructureProfiles.id, id)).limit(1);
    return row ? { ...row, isDefault: row.isDefault === true } : undefined;
  }

  /**
   * One row per account that has at least one profile. `customerIds`
   * narrows the result (an empty list returns nothing); omit it for all.
   */
  async getInfrastructureProfileSummaries(customerIds?: number[]): Promise<InfrastructureProfileSummary[]> {
    if (customerIds && customerIds.length === 0) return [];
    const base = db
      .select({
        ...refColumns,
        profileCount: sql<number>`count(*) over (partition by ${infrastructureProfiles.customerId})`.mapWith(Number),
      })
      .from(infrastructureProfiles);
    const rows = await (customerIds ? base.where(inArray(infrastructureProfiles.customerId, customerIds)) : base).orderBy(
      infrastructureProfiles.customerId,
      desc(infrastructureProfiles.isDefault),
      asc(infrastructureProfiles.profileName),
      asc(infrastructureProfiles.id),
    );
    const summaries = new Map<number, InfrastructureProfileSummary>();
    for (const row of rows) {
      if (summaries.has(row.customerId)) continue;
      summaries.set(row.customerId, {
        customerId: row.customerId,
        profileCount: row.profileCount,
        defaultProfileId: row.id,
        defaultProfileName: row.profileName,
      });
    }
    return [...summaries.values()];
  }
}
