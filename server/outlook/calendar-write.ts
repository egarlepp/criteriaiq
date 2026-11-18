// Outlook write-back (docs/features/working-calendar.md): CriteriaIQ adds a
// person's MAP due dates to their own Outlook calendar as all-day events
// shown as Free, moves them when the date changes and removes them when the
// item is done. It only ever touches events it created (ids it stored).
// Delegated Graph calls with the person's own token, which needs
// Calendars.ReadWrite; every call goes to the fixed graph.microsoft.com host.
import { fromIsoDate, toIsoDate } from "@shared/working-calendar";
import { MicrosoftAuthError, type FetchFn } from "./oauth";

const GRAPH = "https://graph.microsoft.com/v1.0";
const REQUEST_TIMEOUT_MS = 15_000;

/** The token lacks Calendars.ReadWrite: the person linked Outlook before write-back was on. */
export class OutlookWriteForbiddenError extends Error {
  constructor() {
    super("Outlook refused the calendar write (Calendars.ReadWrite not granted)");
    this.name = "OutlookWriteForbiddenError";
  }
}

export interface DueDateEvent {
  subject: string;
  /** "YYYY-MM-DD". */
  dueDate: string;
  /** Link back to the MAP, shown in the event body. */
  link: string;
  /** IANA time zone the all-day event belongs to (the person's). */
  timeZone: string;
}

/** The Graph event for a due date: all day, Free, no reminder. */
export function dueDateEventBody(event: DueDateEvent): Record<string, unknown> {
  const next = fromIsoDate(event.dueDate);
  next.setUTCDate(next.getUTCDate() + 1);
  return {
    subject: event.subject.slice(0, 255),
    isAllDay: true,
    showAs: "free",
    isReminderOn: false,
    start: { dateTime: `${event.dueDate}T00:00:00`, timeZone: event.timeZone },
    end: { dateTime: `${toIsoDate(next)}T00:00:00`, timeZone: event.timeZone },
    body: { contentType: "text", content: event.link },
  };
}

function eventUrl(eventId: string): string {
  return `${GRAPH}/me/events/${encodeURIComponent(eventId)}`;
}

async function graphSend(url: string, method: string, accessToken: string, fetchFn: FetchFn, body?: unknown): Promise<Response> {
  const res = await fetchFn(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (res.status === 401) throw new MicrosoftAuthError("Microsoft refused the token", "unauthorized", true);
  if (res.status === 403) throw new OutlookWriteForbiddenError();
  return res;
}

function failed(res: Response): MicrosoftAuthError {
  return new MicrosoftAuthError(`Microsoft Graph request failed (${res.status})`, `http_${res.status}`, false);
}

/** Creates the event; returns its Outlook id. */
export async function createDueDateEvent(accessToken: string, event: DueDateEvent, fetchFn: FetchFn = fetch): Promise<string> {
  const res = await graphSend(`${GRAPH}/me/events`, "POST", accessToken, fetchFn, dueDateEventBody(event));
  if (!res.ok) throw failed(res);
  const body = (await res.json().catch(() => ({}))) as { id?: unknown };
  if (typeof body.id !== "string" || body.id.length === 0 || body.id.length > 512) {
    throw new MicrosoftAuthError("Microsoft Graph returned no event id", "no_event_id", false);
  }
  return body.id;
}

/** Updates the event; false when the person already deleted it in Outlook. */
export async function updateDueDateEvent(
  accessToken: string,
  eventId: string,
  event: DueDateEvent,
  fetchFn: FetchFn = fetch,
): Promise<boolean> {
  const res = await graphSend(eventUrl(eventId), "PATCH", accessToken, fetchFn, dueDateEventBody(event));
  if (res.status === 404) return false;
  if (!res.ok) throw failed(res);
  return true;
}

/** Deletes the event; an event already gone counts as deleted. */
export async function deleteDueDateEvent(accessToken: string, eventId: string, fetchFn: FetchFn = fetch): Promise<void> {
  const res = await graphSend(eventUrl(eventId), "DELETE", accessToken, fetchFn);
  if (res.status === 404 || res.status === 410) return;
  if (!res.ok) throw failed(res);
}
