// Low-level client for HubSpot's REST API, authenticated with the install's
// private app token (config.ts). Ported from ImpactIQ.
//
// The host is fixed: callers pass a path, never a URL, so the token only
// ever goes to api.hubapi.com. Every request is paced by rate-limiter.ts and
// retries a per-second 429 after HubSpot's suggested wait. Failures throw
// HubspotError with a code from shared/hubspot.ts, never HubSpot's own
// message text, so a screen can translate it.
import type { HubspotErrorCode } from "@shared/hubspot";
import { getHubspotConfig } from "./config";
import { applyRateLimitHeaders, generalLimiter, searchLimiter } from "./rate-limiter";

export const HUBSPOT_API_BASE = "https://api.hubapi.com";

export class HubspotError extends Error {
  constructor(public readonly code: HubspotErrorCode, public readonly status?: number) {
    super(`hubspot_${code}`);
    this.name = "HubspotError";
  }
}

export interface HubspotRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** CRM search endpoints have their own, lower limit. */
  search?: boolean;
  /** Use this token instead of the saved one (checking a key before saving it). */
  token?: string;
}

export interface HubspotResponse {
  status: number;
  body: unknown;
}

const TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_MS = 1_000;

async function resolveToken(opts: HubspotRequestOptions): Promise<string> {
  if (opts.token) return opts.token;
  const cfg = await getHubspotConfig();
  if (!cfg) throw new HubspotError("not_configured");
  return cfg.accessToken;
}

export function buildHubspotUrl(path: string, query?: HubspotRequestOptions["query"]): URL {
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error(`HubSpot path must be absolute: ${path}`);
  const url = new URL(path, HUBSPOT_API_BASE);
  if (url.origin !== HUBSPOT_API_BASE) throw new Error(`HubSpot path must stay on ${HUBSPOT_API_BASE}`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  return url;
}

function retryDelayMs(res: Response): number {
  const retryAfter = Number(res.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 30_000);
  const interval = Number(res.headers.get("x-hubspot-ratelimit-interval-milliseconds"));
  if (Number.isFinite(interval) && interval > 0) return Math.min(interval, 30_000);
  return DEFAULT_RETRY_MS;
}

async function readBody(res: Response): Promise<unknown> {
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function isDailyLimit(body: unknown): boolean {
  return !!body && typeof body === "object" && (body as Record<string, unknown>).policyName === "DAILY";
}

/**
 * Sends one request and returns HubSpot's status and JSON body. Throws only
 * for what no caller can work around: no token, a rejected token (401), a
 * network failure, or a rate limit that outlasted the retries.
 */
export async function hubspotRequest(path: string, opts: HubspotRequestOptions = {}): Promise<HubspotResponse> {
  const token = await resolveToken(opts);
  const url = buildHubspotUrl(path, opts.query);
  const limiter = opts.search ? searchLimiter : generalLimiter;
  for (let attempt = 1; ; attempt++) {
    await limiter.acquire();
    // Search calls count toward the general limit too.
    if (opts.search) await generalLimiter.acquire();
    let res: Response;
    try {
      res = await fetch(url, {
        method: opts.method ?? "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new HubspotError("unreachable");
    }
    applyRateLimitHeaders(res.headers);
    if (res.status === 401) throw new HubspotError("unauthorized", 401);
    if (res.status === 429) {
      const body = await readBody(res);
      if (isDailyLimit(body) || attempt >= MAX_ATTEMPTS) throw new HubspotError("rate_limited", 429);
      limiter.pause(retryDelayMs(res));
      continue;
    }
    return { status: res.status, body: await readBody(res) };
  }
}

/** For callers that need a successful JSON answer: anything else becomes a HubspotError. */
export async function hubspotJson<T = unknown>(path: string, opts: HubspotRequestOptions = {}): Promise<T> {
  const { status, body } = await hubspotRequest(path, opts);
  if (status === 403) throw new HubspotError("forbidden", 403);
  if (status < 200 || status >= 300 || body === null) throw new HubspotError("bad_response", status);
  return body as T;
}

/** Reads every page of a v3 list endpoint (results + paging.next.after). */
export async function hubspotListAll<T>(
  path: string,
  query: HubspotRequestOptions["query"] = {},
  opts: Omit<HubspotRequestOptions, "query"> = {},
): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  // A safety stop far past any real list; a looping cursor can't run forever.
  for (let page = 0; page < 1000; page++) {
    const body = await hubspotJson<{ results?: T[]; paging?: { next?: { after?: string } } }>(path, {
      ...opts,
      query: { ...query, after },
    });
    out.push(...(Array.isArray(body.results) ? body.results : []));
    after = body.paging?.next?.after;
    if (!after) break;
  }
  return out;
}
