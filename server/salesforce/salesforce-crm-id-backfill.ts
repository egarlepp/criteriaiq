/**
 * CRM record id backfill (Admin > Integrations > Salesforce > Sync History).
 *
 * Fills crm_opportunity_id / crm_account_id on projects that have a
 * salesforce_evaluation_link but no Opportunity id yet:
 *
 *   1. Pull the Evaluation id out of the link.
 *   2. Read the Evaluation's Opportunity lookup. The lookup field comes from
 *      the active field mapping for the project's "CRM Opportunity ID"
 *      (crmOpportunityId) on the Evaluation object; without one, from the
 *      Validation Record settings (Admin › Integrations › Overview). Never
 *      a hardcoded name.
 *   3. Read that Opportunity's AccountId.
 *
 * Runs on the calling admin's own Salesforce connection. Dry run reports
 * what it would fill and writes nothing. A real run writes only rows whose
 * Opportunity id is still empty, never overwrites an Account id someone
 * already set, and logs each change (server log + project activity log).
 *
 * Dependencies are injectable so the planning logic is testable without
 * Salesforce or a database.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { extractSalesforceIdFromUrl, isSalesforceId, toSalesforceId18 } from '@shared/crm-record-id';

export interface BackfillCandidate {
  id: number;
  name: string | null;
  customerName: string;
  salesforceEvaluationLink: string | null;
  crmAccountId: string | null;
}

export type BackfillItemStatus = 'would_fill' | 'filled' | 'skipped';

export type BackfillSkipReason =
  | 'no_evaluation_id'
  | 'evaluation_not_found'
  | 'no_opportunity_on_evaluation'
  | 'invalid_opportunity_id'
  | 'already_filled';

export interface BackfillItem {
  projectId: number;
  projectName: string;
  evaluationId: string | null;
  opportunityId: string | null;
  accountId: string | null;
  status: BackfillItemStatus;
  reason?: BackfillSkipReason;
}

export interface BackfillReport {
  dryRun: boolean;
  evaluationObject: string;
  lookupField: string;
  candidates: number;
  filled: number;
  wouldFill: number;
  skipped: number;
  items: BackfillItem[];
}

export class BackfillConfigError extends Error {
  constructor(public readonly code: 'mapping_missing' | 'invalid_field', message: string) {
    super(message);
    this.name = 'BackfillConfigError';
  }
}

export interface BackfillDeps {
  getEvaluationObject(): Promise<string>;
  /** Active project mappings for crmOpportunityId: object + field API names. */
  getOpportunityIdMappings(): Promise<Array<{ sfObjectApiName: string; sfFieldApiName: string }>>;
  /** Lookup field from the Validation Record settings, used when no mapping exists. */
  getSettingsLookupField?(): Promise<string | null>;
  loadCandidates(): Promise<BackfillCandidate[]>;
  /** Runs a SOQL query on the admin's connection and returns all records. */
  query(soql: string): Promise<Array<Record<string, unknown>>>;
  /** Writes the ids when the project's Opportunity id is still empty. Returns true when a row changed. */
  applyUpdate(projectId: number, values: { opportunityId: string; accountId: string | null; setAccount: boolean }): Promise<boolean>;
  logChange(item: BackfillItem, userId: string): Promise<void>;
}

const API_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
const SOQL_IN_CHUNK = 200;

function chunk<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

/** Ids are validated Salesforce ids, so quoting them is safe. */
function soqlIdList(ids: string[]): string {
  return ids.map((id) => `'${id}'`).join(', ');
}

export async function resolveLookupField(deps: BackfillDeps): Promise<{ evaluationObject: string; lookupField: string }> {
  const evaluationObject = await deps.getEvaluationObject();
  const mappings = await deps.getOpportunityIdMappings();
  const mapped = mappings.find((m) => m.sfObjectApiName.toLowerCase() === evaluationObject.toLowerCase());
  const fallback = mapped ? null : await deps.getSettingsLookupField?.();
  const mapping = mapped ?? (fallback ? { sfObjectApiName: evaluationObject, sfFieldApiName: fallback } : null);
  if (!mapping) {
    throw new BackfillConfigError(
      'mapping_missing',
      `No active field mapping from the project's CRM Opportunity ID to a field on ${evaluationObject}. ` +
        `Add one under Field Mappings, or set the Opportunity lookup field under Integrations › Overview › Validation Record, then run the backfill again.`,
    );
  }
  if (!API_NAME.test(mapping.sfFieldApiName) || !API_NAME.test(evaluationObject)) {
    throw new BackfillConfigError('invalid_field', `The mapped field ${mapping.sfFieldApiName} is not a valid Salesforce field name.`);
  }
  return { evaluationObject, lookupField: mapping.sfFieldApiName };
}

export async function runCrmIdBackfill(
  options: { userId: string; dryRun: boolean },
  deps: BackfillDeps,
): Promise<BackfillReport> {
  const { evaluationObject, lookupField } = await resolveLookupField(deps);
  const candidates = await deps.loadCandidates();

  const evaluationIdByProject = new Map<number, string | null>();
  for (const project of candidates) {
    const link = project.salesforceEvaluationLink ?? '';
    evaluationIdByProject.set(project.id, extractSalesforceIdFromUrl(link) ?? toSalesforceId18(link));
  }

  // Evaluation -> Opportunity lookup.
  const evaluationIds = Array.from(new Set(Array.from(evaluationIdByProject.values()).filter((v): v is string => !!v)));
  const opportunityByEvaluation = new Map<string, string | null>();
  for (const ids of chunk(evaluationIds, SOQL_IN_CHUNK)) {
    const records = await deps.query(`SELECT Id, ${lookupField} FROM ${evaluationObject} WHERE Id IN (${soqlIdList(ids)})`);
    for (const record of records) {
      const evaluationId = toSalesforceId18(String(record.Id ?? ''));
      if (!evaluationId) continue;
      const raw = record[lookupField];
      opportunityByEvaluation.set(evaluationId, typeof raw === 'string' && raw ? raw : null);
    }
  }

  // Opportunity -> Account.
  const opportunityIds = Array.from(
    new Set(
      Array.from(opportunityByEvaluation.values())
        .filter((v): v is string => !!v && isSalesforceId(v))
        .map((v) => toSalesforceId18(v) as string),
    ),
  );
  const accountByOpportunity = new Map<string, string | null>();
  for (const ids of chunk(opportunityIds, SOQL_IN_CHUNK)) {
    const records = await deps.query(`SELECT Id, AccountId FROM Opportunity WHERE Id IN (${soqlIdList(ids)})`);
    for (const record of records) {
      const opportunityId = toSalesforceId18(String(record.Id ?? ''));
      if (!opportunityId) continue;
      const accountId = typeof record.AccountId === 'string' ? toSalesforceId18(record.AccountId) : null;
      accountByOpportunity.set(opportunityId, accountId);
    }
  }

  const items: BackfillItem[] = [];
  for (const project of candidates) {
    const base = {
      projectId: project.id,
      projectName: project.name || project.customerName,
      evaluationId: evaluationIdByProject.get(project.id) ?? null,
      opportunityId: null as string | null,
      accountId: null as string | null,
    };
    if (!base.evaluationId) {
      items.push({ ...base, status: 'skipped', reason: 'no_evaluation_id' });
      continue;
    }
    if (!opportunityByEvaluation.has(base.evaluationId)) {
      items.push({ ...base, status: 'skipped', reason: 'evaluation_not_found' });
      continue;
    }
    const rawOpportunity = opportunityByEvaluation.get(base.evaluationId);
    if (!rawOpportunity) {
      items.push({ ...base, status: 'skipped', reason: 'no_opportunity_on_evaluation' });
      continue;
    }
    const opportunityId = toSalesforceId18(rawOpportunity);
    if (!opportunityId) {
      items.push({ ...base, status: 'skipped', reason: 'invalid_opportunity_id' });
      continue;
    }
    // Keep an Account id someone already set; report the one we would use.
    const accountId = accountByOpportunity.get(opportunityId) ?? null;
    const setAccount = !project.crmAccountId && !!accountId;
    const item: BackfillItem = {
      ...base,
      opportunityId,
      accountId: project.crmAccountId ?? accountId,
      status: 'would_fill',
    };

    if (!options.dryRun) {
      const changed = await deps.applyUpdate(project.id, { opportunityId, accountId, setAccount });
      if (changed) {
        item.status = 'filled';
        await deps.logChange(item, options.userId);
      } else {
        item.status = 'skipped';
        item.reason = 'already_filled';
      }
    }
    items.push(item);
  }

  return {
    dryRun: options.dryRun,
    evaluationObject,
    lookupField,
    candidates: candidates.length,
    filled: items.filter((i) => i.status === 'filled').length,
    wouldFill: items.filter((i) => i.status === 'would_fill').length,
    skipped: items.filter((i) => i.status === 'skipped').length,
    items,
  };
}

/** Production dependencies: the admin's Salesforce connection and the app database. */
export async function createDefaultBackfillDeps(userId: string): Promise<BackfillDeps> {
  const { storage } = await import('../storage.js');
  const { salesforceConfigService, getSalesforceConnectionForUser } = await import('./salesforce-config-service.js');
  const { projects, salesforceFieldMappings } = storage.schema;
  let connection: Awaited<ReturnType<typeof getSalesforceConnectionForUser>> | null = null;

  return {
    getEvaluationObject: () => salesforceConfigService.getEvaluationObjectApiName(),
    getSettingsLookupField: () => salesforceConfigService.getEvaluationOpportunityLookupField(),
    getOpportunityIdMappings: () =>
      storage.db
        .select({
          sfObjectApiName: salesforceFieldMappings.sfObjectApiName,
          sfFieldApiName: salesforceFieldMappings.sfFieldApiName,
        })
        .from(salesforceFieldMappings)
        .where(
          and(
            eq(salesforceFieldMappings.cqiEntity, 'project'),
            eq(salesforceFieldMappings.cqiFieldKey, 'crmOpportunityId'),
            eq(salesforceFieldMappings.isActive, true),
          ),
        ),
    loadCandidates: () =>
      storage.db
        .select({
          id: projects.id,
          name: projects.name,
          customerName: projects.customerName,
          salesforceEvaluationLink: projects.salesforceEvaluationLink,
          crmAccountId: projects.crmAccountId,
        })
        .from(projects)
        .where(
          and(
            isNull(projects.crmOpportunityId),
            eq(projects.isDemo, false),
            sql`coalesce(trim(${projects.salesforceEvaluationLink}), '') <> ''`,
          ),
        )
        .orderBy(projects.id),
    query: async (soql) => {
      connection ??= await getSalesforceConnectionForUser(userId);
      const result = await connection.query(soql, { autoFetch: true, maxFetch: 50_000 });
      return (result.records ?? []) as Array<Record<string, unknown>>;
    },
    applyUpdate: async (projectId, { opportunityId, accountId, setAccount }) => {
      const updated = await storage.db
        .update(projects)
        .set({
          crmProvider: 'salesforce',
          crmOpportunityId: opportunityId,
          ...(setAccount ? { crmAccountId: accountId } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(projects.id, projectId), isNull(projects.crmOpportunityId)))
        .returning({ id: projects.id });
      return updated.length > 0;
    },
    logChange: async (item, actorId) => {
      console.log(
        `[salesforce-crm-id-backfill] project ${item.projectId}: evaluation ${item.evaluationId} -> ` +
          `crmOpportunityId=${item.opportunityId} crmAccountId=${item.accountId ?? '(none)'} (by ${actorId})`,
      );
      await storage.createActivityLog({
        projectId: item.projectId,
        userId: actorId,
        action: 'updated',
        details: `Salesforce backfill set CRM Opportunity ID ${item.opportunityId}` +
          (item.accountId ? ` and Account ID ${item.accountId}` : ''),
        targetType: 'project',
        targetId: item.projectId,
      });
    },
  };
}
