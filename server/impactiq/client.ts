// Calls to ImpactIQ's effort API (ImpactIQ v1.448+, its docs/effort-api.md):
// GET /api/v1/effort?crmOpportunityId= with an effort:read key, which answers
// hour totals by person and activity type and nothing else.
//
// Every call re-checks the saved address with assertOutboundUrl and refuses
// redirects, like the n8n and webhook calls. Answers are cached for five
// minutes per Opportunity so a busy project page doesn't hit ImpactIQ on
// every view; saving or removing the connection clears the cache.
import { z } from "zod";
import { assertOutboundUrl, OutboundUrlError } from "../lib/outbound-url";
import { IMPACTIQ_MAX_PROJECT_ACTIVITIES, type ImpactiqActivityCountSettings, type ImpactiqActivityTypeOption, type ImpactiqEffort, type ImpactiqErrorCode } from "@shared/impactiq";
import { getImpactiqConfig, type ImpactiqConfig } from "./config";
import { trimTrailingChar } from "@shared/trim-edge";

const REQUEST_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

export class ImpactiqError extends Error {
  constructor(readonly code: ImpactiqErrorCode, message?: string) {
    super(message ?? code);
    this.name = "ImpactiqError";
  }
}

const countRow = { hours: z.number(), activityCount: z.number().int().nonnegative() };
const effortSchema = z.object({
  version: z.number().int(),
  crmOpportunityId: z.string(),
  totalHours: z.number(),
  activityCount: z.number().int().nonnegative(),
  firstActivityAt: z.string().nullable(),
  lastActivityAt: z.string().nullable(),
  byPerson: z.array(z.object({ name: z.string().max(300), email: z.string().max(320), ...countRow })).max(500),
  byType: z.array(z.object({ name: z.string().max(300), ...countRow })).max(500),
  cost: z.object({
    currency: z.string().max(10),
    totalCost: z.number(),
    laborCost: z.number(),
    directCost: z.number(),
    activitiesWithoutRate: z.number().int().nonnegative(),
  }).optional(),
});
const envelopeSchema = z.object({ data: effortSchema });

const cache = new Map<string, { at: number; effort: ImpactiqEffort }>();

export function clearImpactiqCache(): void {
  cache.clear();
  listCache.clear();
  countCache.clear();
}

/**
 * ImpactIQ's activities drawer for one Opportunity (ImpactIQ v1.449+
 * ?openOpportunity=). Older ImpactIQ installs ignore the parameters and open
 * their home page. The name is only the drawer's heading.
 */
export function impactiqActivitiesUrl(impactiqUrl: string, crmOpportunityId: string, opportunityName: string | null): string {
  const url = new URL("/", impactiqUrl + "/");
  url.searchParams.set("openOpportunity", crmOpportunityId);
  const name = opportunityName?.trim().slice(0, 200);
  if (name) url.searchParams.set("name", name);
  return url.toString();
}

/** ImpactIQ's own link for people to open, built from the saved address only. */
export function impactiqAppUrl(config: Pick<ImpactiqConfig, "baseUrl">): string {
  return trimTrailingChar(config.baseUrl, "/");
}

function errorForStatus(status: number, body: unknown): ImpactiqError {
  const error = (body as { error?: unknown } | null)?.error;
  if (status === 401) return new ImpactiqError("key_invalid");
  if (status === 403) return new ImpactiqError(error === "errors.apikey.wrong_scope" ? "key_wrong_scope" : "owner_not_leader");
  if (status === 429) return new ImpactiqError("rate_limited");
  return new ImpactiqError("bad_response", `ImpactIQ answered HTTP ${status}`);
}

/**
 * One call to ImpactIQ's API with the saved key: the address is re-checked
 * against the outbound URL guard, redirects are refused, and the answer must
 * match `schema`. `notFoundMeansOld` turns a 404 into not_supported, for
 * endpoints newer ImpactIQ versions added.
 */
async function callImpactiq<T>(
  config: Pick<ImpactiqConfig, "baseUrl" | "apiKey">,
  url: URL,
  schema: z.ZodType<{ data: T }>,
  init: { method?: "GET" | "POST"; body?: unknown; notFoundMeansOld?: boolean } = {},
): Promise<T> {
  try {
    await assertOutboundUrl(url.toString());
  } catch (error) {
    throw new ImpactiqError("url_not_allowed", error instanceof OutboundUrlError ? error.message : undefined);
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "manual",
    });
  } catch {
    throw new ImpactiqError("unreachable");
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (response.status === 404 && init.notFoundMeansOld) throw new ImpactiqError("not_supported");
  if (!response.ok) throw errorForStatus(response.status, body);
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ImpactiqError("bad_response", "ImpactIQ's answer was not in the expected shape");
  return parsed.data.data;
}

export async function requestEffort(config: Pick<ImpactiqConfig, "baseUrl" | "apiKey">, crmOpportunityId: string): Promise<ImpactiqEffort> {
  const url = new URL("/api/v1/effort", impactiqAppUrl(config) + "/");
  url.searchParams.set("crmOpportunityId", crmOpportunityId);
  return callImpactiq(config, url, envelopeSchema);
}

/** Effort for one Opportunity through the saved connection, or null when ImpactIQ isn't connected or is switched off. */
export async function getOpportunityEffort(crmOpportunityId: string): Promise<{ effort: ImpactiqEffort; impactiqUrl: string } | null> {
  const config = await getImpactiqConfig();
  if (!config || !config.enabled) return null;
  const impactiqUrl = impactiqAppUrl(config);
  const key = `${impactiqUrl}|${crmOpportunityId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { effort: hit.effort, impactiqUrl };
  const effort = await requestEffort(config, crmOpportunityId);
  if (cache.size >= CACHE_MAX_ENTRIES) cache.clear();
  cache.set(key, { at: Date.now(), effort });
  return { effort, impactiqUrl };
}

// An id no record has, so the check reads zeros and proves the address, the
// key and its scope without touching real data.
const CHECK_OPPORTUNITY_ID = "000000000000000";

export async function checkImpactiqConnection(config: Pick<ImpactiqConfig, "baseUrl" | "apiKey">): Promise<void> {
  await requestEffort(config, CHECK_OPPORTUNITY_ID);
}

// ── Activity counts on Manage Projects (ImpactIQ v1.453+) ─────────────────

/** ImpactIQ answers at most this many projects per call. */
export const PROJECT_COUNTS_BATCH = 200;
const COUNT_CACHE_MAX_ENTRIES = 5000;

const activityTypesSchema = z.object({
  data: z.object({
    activityTypes: z.array(z.object({ name: z.string().min(1).max(300), hasProjectPicker: z.boolean() })).max(2000),
  }),
});

const projectCountSchema = z.object({
  criteriaiqProjectId: z.number().int().positive(),
  activityCount: z.number().int().nonnegative(),
  totalHours: z.number().nonnegative(),
  lastActivityAt: z.string().nullable(),
  viaOpportunity: z.number().int().nonnegative(),
});
const projectCountsSchema = z.object({
  data: z.object({ projects: z.array(projectCountSchema).max(PROJECT_COUNTS_BATCH) }),
});

export type ImpactiqProjectCount = z.infer<typeof projectCountSchema>;

/** What CriteriaIQ sends ImpactIQ for one project; ids already normalized. */
export interface ImpactiqProjectRef {
  criteriaiqProjectId: number;
  crmProjectId: string | null;
  crmOpportunityId: string | null;
  startDate: string | null;
  endDate: string | null;
}

/** The activity type names CriteriaIQ's admin picks from. */
export async function requestActivityTypes(config: Pick<ImpactiqConfig, "baseUrl" | "apiKey">): Promise<ImpactiqActivityTypeOption[]> {
  const url = new URL("/api/v1/effort/activity-types", impactiqAppUrl(config) + "/");
  const data = await callImpactiq(config, url, activityTypesSchema, { notFoundMeansOld: true });
  return data.activityTypes;
}

export async function requestProjectCounts(
  config: Pick<ImpactiqConfig, "baseUrl" | "apiKey">,
  settings: ImpactiqActivityCountSettings,
  projects: ImpactiqProjectRef[],
): Promise<ImpactiqProjectCount[]> {
  if (projects.length === 0) return [];
  if (projects.length > PROJECT_COUNTS_BATCH) throw new Error(`At most ${PROJECT_COUNTS_BATCH} projects per call`);
  const url = new URL("/api/v1/effort/project-counts", impactiqAppUrl(config) + "/");
  const data = await callImpactiq(config, url, projectCountsSchema, {
    method: "POST",
    notFoundMeansOld: true,
    body: {
      activityTypes: settings.activityTypes,
      opportunityFallback: settings.opportunityFallback,
      // Only the fields ImpactIQ needs; empty ones are left out.
      projects: projects.map((p) => ({
        criteriaiqProjectId: p.criteriaiqProjectId,
        ...(p.crmProjectId ? { crmProjectId: p.crmProjectId } : {}),
        ...(p.crmOpportunityId ? { crmOpportunityId: p.crmOpportunityId } : {}),
        ...(p.startDate ? { startDate: p.startDate } : {}),
        ...(p.endDate ? { endDate: p.endDate } : {}),
      })),
    },
  });
  return data.projects;
}

const countCache = new Map<string, { at: number; count: ImpactiqProjectCount }>();

function countCacheKey(impactiqUrl: string, settings: ImpactiqActivityCountSettings, p: ImpactiqProjectRef): string {
  const types = settings.activityTypes.map((n) => n.toLowerCase()).sort().join("\u0001");
  return [impactiqUrl, types, settings.opportunityFallback ? 1 : 0, p.criteriaiqProjectId, p.crmProjectId, p.crmOpportunityId, p.startDate, p.endDate].join("|");
}

/**
 * Counts for many projects through the saved connection: cached answers for
 * five minutes, the rest asked in batches of 200. Null when ImpactIQ isn't
 * connected or is switched off. A failed batch throws, so the column shows
 * one clear error instead of a mix of numbers and gaps.
 */
export async function getProjectActivityCounts(
  settings: ImpactiqActivityCountSettings,
  projects: ImpactiqProjectRef[],
): Promise<{ counts: Map<number, ImpactiqProjectCount>; impactiqUrl: string } | null> {
  const config = await getImpactiqConfig();
  if (!config || !config.enabled) return null;
  const impactiqUrl = impactiqAppUrl(config);
  const counts = new Map<number, ImpactiqProjectCount>();
  const misses: ImpactiqProjectRef[] = [];
  const now = Date.now();
  for (const p of projects) {
    const hit = countCache.get(countCacheKey(impactiqUrl, settings, p));
    if (hit && now - hit.at < CACHE_TTL_MS) counts.set(p.criteriaiqProjectId, hit.count);
    else misses.push(p);
  }
  for (let i = 0; i < misses.length; i += PROJECT_COUNTS_BATCH) {
    const batch = misses.slice(i, i + PROJECT_COUNTS_BATCH);
    const answered = new Map((await requestProjectCounts(config, settings, batch)).map((c) => [c.criteriaiqProjectId, c]));
    for (const p of batch) {
      const count = answered.get(p.criteriaiqProjectId);
      if (!count) continue;
      counts.set(p.criteriaiqProjectId, count);
      if (countCache.size >= COUNT_CACHE_MAX_ENTRIES) countCache.clear();
      countCache.set(countCacheKey(impactiqUrl, settings, p), { at: Date.now(), count });
    }
  }
  return { counts, impactiqUrl };
}

// ── The activities behind one project's count (ImpactIQ v1.479+) ─────────

const projectActivitySchema = z.object({
  id: z.string().min(1).max(100),
  type: z.string().min(1).max(300),
  // Anything that isn't a plain icon name or hex color is dropped, never rendered.
  typeIcon: z.string().nullish().transform((v) => (v && /^[A-Za-z0-9]{1,64}$/.test(v) ? v : null)),
  typeColor: z.string().nullish().transform((v) => (v && /^#[0-9A-Fa-f]{3,8}$/.test(v) ? v : null)),
  ownerName: z.string().max(300),
  hours: z.number().nonnegative(),
  startAt: z.string().max(40),
  endAt: z.string().max(40).nullable(),
  viaOpportunity: z.boolean(),
});
const projectActivitiesSchema = z.object({
  data: z.object({
    activityCount: z.number().int().nonnegative(),
    totalHours: z.number().nonnegative(),
    truncated: z.boolean(),
    activities: z.array(projectActivitySchema).max(IMPACTIQ_MAX_PROJECT_ACTIVITIES),
  }),
});

export type ImpactiqProjectActivityList = z.infer<typeof projectActivitiesSchema>["data"];

export async function requestProjectActivities(
  config: Pick<ImpactiqConfig, "baseUrl" | "apiKey">,
  settings: ImpactiqActivityCountSettings,
  p: ImpactiqProjectRef,
): Promise<ImpactiqProjectActivityList> {
  const url = new URL("/api/v1/effort/project-activities", impactiqAppUrl(config) + "/");
  return callImpactiq(config, url, projectActivitiesSchema, {
    method: "POST",
    // An ImpactIQ older than v1.479 has no such endpoint.
    notFoundMeansOld: true,
    body: {
      activityTypes: settings.activityTypes,
      opportunityFallback: settings.opportunityFallback,
      project: {
        criteriaiqProjectId: p.criteriaiqProjectId,
        ...(p.crmProjectId ? { crmProjectId: p.crmProjectId } : {}),
        ...(p.crmOpportunityId ? { crmOpportunityId: p.crmOpportunityId } : {}),
        ...(p.startDate ? { startDate: p.startDate } : {}),
        ...(p.endDate ? { endDate: p.endDate } : {}),
      },
    },
  });
}

const LIST_CACHE_MAX_ENTRIES = 200;
const listCache = new Map<string, { at: number; list: ImpactiqProjectActivityList }>();

/**
 * One project's activities through the saved connection, cached for five
 * minutes like the counts. Null when ImpactIQ isn't connected or is off.
 */
export async function getProjectActivities(
  settings: ImpactiqActivityCountSettings,
  project: ImpactiqProjectRef,
): Promise<{ list: ImpactiqProjectActivityList; impactiqUrl: string } | null> {
  const config = await getImpactiqConfig();
  if (!config || !config.enabled) return null;
  const impactiqUrl = impactiqAppUrl(config);
  const key = countCacheKey(impactiqUrl, settings, project);
  const hit = listCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { list: hit.list, impactiqUrl };
  const list = await requestProjectActivities(config, settings, project);
  if (listCache.size >= LIST_CACHE_MAX_ENTRIES) listCache.clear();
  listCache.set(key, { at: Date.now(), list });
  return { list, impactiqUrl };
}
