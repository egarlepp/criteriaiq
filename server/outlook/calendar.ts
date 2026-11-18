// Reads from a person's own Outlook calendar for their work schedule
// (docs/features/working-calendar.md): all-day "Out of office" events
// become time off, and, when the admin allows it, their Outlook working
// days become their work week. Delegated Graph calls with the person's own
// token; read only. Every call goes to the fixed graph.microsoft.com host.
import { fromIsoDate, toIsoDate } from "@shared/working-calendar";
import { MicrosoftAuthError, type FetchFn } from "./oauth";

const GRAPH = "https://graph.microsoft.com/v1.0";
const REQUEST_TIMEOUT_MS = 15_000;
/** A calendar with more events than this in the window is read in part. */
const MAX_PAGES = 20;

export interface OutOfOfficeDays {
  /** The Outlook event id, so the next sync can update or remove the entry. */
  eventId: string;
  startDate: string;
  endDate: string;
}

interface GraphEvent {
  id?: unknown;
  isAllDay?: unknown;
  isCancelled?: unknown;
  showAs?: unknown;
  start?: { dateTime?: unknown };
  end?: { dateTime?: unknown };
}

async function graphGet(url: string, accessToken: string, fetchFn: FetchFn): Promise<Response> {
  const res = await fetchFn(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (res.status === 401) throw new MicrosoftAuthError("Microsoft refused the token", "unauthorized", true);
  return res;
}

/** The day before "YYYY-MM-DD". */
function dayBefore(iso: string): string {
  const d = fromIsoDate(iso);
  d.setUTCDate(d.getUTCDate() - 1);
  return toIsoDate(d);
}

/**
 * An all-day, not cancelled event shown as "Out of office" as inclusive
 * dates (Graph's all-day end is the next midnight). Null for anything else.
 */
export function outOfOfficeDays(event: GraphEvent): OutOfOfficeDays | null {
  if (event.isAllDay !== true || event.isCancelled === true || event.showAs !== "oof") return null;
  if (typeof event.id !== "string" || event.id.length === 0 || event.id.length > 512) return null;
  const start = typeof event.start?.dateTime === "string" ? event.start.dateTime.slice(0, 10) : "";
  const end = typeof event.end?.dateTime === "string" ? event.end.dateTime.slice(0, 10) : "";
  try {
    fromIsoDate(start);
    fromIsoDate(end);
  } catch {
    return null;
  }
  const last = end > start ? dayBefore(end) : start;
  return { eventId: event.id, startDate: start, endDate: last };
}

/** The person's all-day "Out of office" events overlapping `from`..`to` (inclusive dates). */
export async function listOutOfOfficeDays(
  accessToken: string,
  from: string,
  to: string,
  fetchFn: FetchFn = fetch,
): Promise<OutOfOfficeDays[]> {
  const params = new URLSearchParams({
    startDateTime: `${from}T00:00:00Z`,
    endDateTime: `${toIsoDate(new Date(fromIsoDate(to).getTime() + 86_400_000))}T00:00:00Z`,
    $select: "id,isAllDay,isCancelled,showAs,start,end",
    $top: "200",
  });
  let url: string | null = `${GRAPH}/me/calendarView?${params.toString()}`;
  const out: OutOfOfficeDays[] = [];
  for (let page = 0; url && page < MAX_PAGES; page++) {
    const res = await graphGet(url, accessToken, fetchFn);
    if (!res.ok) throw new MicrosoftAuthError(`Microsoft Graph request failed (${res.status})`, `http_${res.status}`, false);
    const body = (await res.json().catch(() => ({}))) as { value?: unknown; "@odata.nextLink"?: unknown };
    for (const event of Array.isArray(body.value) ? (body.value as GraphEvent[]) : []) {
      const days = outOfOfficeDays(event);
      if (days) out.push(days);
    }
    const next = body["@odata.nextLink"];
    // Only ever follow links back to Graph itself.
    url = typeof next === "string" && next.startsWith(`${GRAPH}/`) ? next : null;
  }
  return out;
}

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Graph's day names ("monday", …) as day numbers, 0 = Sunday. */
export function workDaysFromGraph(daysOfWeek: unknown): number[] {
  if (!Array.isArray(daysOfWeek)) return [];
  const days = new Set<number>();
  for (const name of daysOfWeek) {
    const index = typeof name === "string" ? DAY_NAMES.indexOf(name.toLowerCase()) : -1;
    if (index >= 0) days.add(index);
  }
  return Array.from(days).sort((a, b) => a - b);
}

/**
 * The person's Outlook working days. Null when the token doesn't carry
 * MailboxSettings.Read (they linked Outlook before the admin turned it on)
 * or Outlook has no working days set.
 */
export async function readOutlookWorkDays(accessToken: string, fetchFn: FetchFn = fetch): Promise<number[] | null> {
  const res = await graphGet(`${GRAPH}/me/mailboxSettings/workingHours`, accessToken, fetchFn);
  if (res.status === 403) return null;
  if (!res.ok) throw new MicrosoftAuthError(`Microsoft Graph request failed (${res.status})`, `http_${res.status}`, false);
  const body = (await res.json().catch(() => ({}))) as { daysOfWeek?: unknown };
  const days = workDaysFromGraph(body.daysOfWeek);
  return days.length > 0 ? days : null;
}
