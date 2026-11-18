// Pure helpers for Workflow Automation email digests.
//
// How a digest works:
//   1. A rule with a "Schedule Digest" action fires. The action queues the
//      event for each recipient: the rule's audit row (email_rule_audits)
//      records the recipients under executionResults[].digestRecipientIds.
//   2. An email_digest workflow schedule (Configuration › Scheduler) runs
//      processDigestSend for the rule. It gathers the queued events per
//      recipient and sends one summary email each.
//   3. Each recipient who got the digest is added to the audit row's
//      metadata.digestSentTo, so the event is not sent to them again.

import { parseTargetIds, type TeamTargets } from "@shared/teams";

/** Queued events older than this are dropped from digests. */
export const DIGEST_LOOKBACK_DAYS = 31;

/** Recipient value meaning "the user who triggered the rule". */
export const TRIGGER_USER = "trigger_user";
/** Recipient value meaning "whoever the MAP phase, step or task is assigned to" (metadata.assignedTo). */
export const ITEM_ASSIGNEE = "item_assignee";

/**
 * Team recipients of a Send Email or Schedule Digest action: the rule
 * editor saves team and subteam ids (recipientTeamIds, recipientSubteamIds).
 * The engine resolves them to the people on those teams when the action
 * runs (docs/features/teams.md).
 */
export function actionTeamTargets(params: Record<string, unknown> | null | undefined): TeamTargets {
  return {
    teamIds: parseTargetIds(params?.recipientTeamIds),
    subteamIds: parseTargetIds(params?.recipientSubteamIds),
  };
}

/**
 * Recipients of a Send Email or Schedule Digest action. The rule editor
 * saves a list (recipientUserIds); older and seeded rules use a single
 * recipientId. "trigger_user" resolves to the user who fired the trigger;
 * "item_assignee" to `assigneeId` (the MAP item's assignee), else nobody.
 * With nothing set, `fallback` decides: digests go to the triggering user,
 * send_email has no default.
 */
export function resolveActionRecipients(
  params: Record<string, unknown> | null | undefined,
  triggerUserId: string | null | undefined,
  fallback: "trigger_user" | "none" = "none",
  assigneeId?: string | null,
): string[] {
  const raw: unknown[] = [];
  if (Array.isArray(params?.recipientUserIds)) raw.push(...params.recipientUserIds);
  if (params?.recipientId !== undefined && params?.recipientId !== null && params?.recipientId !== "") {
    raw.push(params.recipientId);
  }
  if (raw.length === 0 && fallback === "trigger_user") raw.push(TRIGGER_USER);

  const ids = new Set<string>();
  for (const value of raw) {
    if (typeof value !== "string" && typeof value !== "number") continue;
    const id =
      value === TRIGGER_USER ? triggerUserId ?? "" : value === ITEM_ASSIGNEE ? assigneeId ?? "" : String(value).trim();
    if (id) ids.add(id);
  }
  return [...ids];
}

interface DigestAuditRow {
  metadata: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Recipients an audit row queued for a digest, minus those already sent. */
export function pendingDigestRecipients(row: DigestAuditRow): string[] {
  const metadata = asRecord(row.metadata);
  const results = Array.isArray(metadata?.executionResults) ? metadata.executionResults : [];
  const sentTo = new Set(
    Array.isArray(metadata?.digestSentTo) ? metadata.digestSentTo.filter((id): id is string => typeof id === "string") : [],
  );

  const pending = new Set<string>();
  for (const entry of results) {
    const result = asRecord(entry);
    if (result?.action !== "schedule_digest") continue;
    const ids = Array.isArray(result.digestRecipientIds) ? result.digestRecipientIds : [];
    for (const id of ids) {
      if (typeof id === "string" && id && !sentTo.has(id)) pending.add(id);
    }
  }
  return [...pending];
}

/** Queued events grouped by recipient, in the order given. */
export function groupDigestItems<T extends DigestAuditRow>(rows: T[]): Map<string, T[]> {
  const byRecipient = new Map<string, T[]>();
  for (const row of rows) {
    for (const recipientId of pendingDigestRecipients(row)) {
      const list = byRecipient.get(recipientId) ?? [];
      list.push(row);
      byRecipient.set(recipientId, list);
    }
  }
  return byRecipient;
}

/** The audit metadata after `recipientId` received the digest. */
export function markDigestSent(metadata: unknown, recipientId: string, sentAt: Date): Record<string, unknown> {
  const current = asRecord(metadata) ?? {};
  const sentTo = Array.isArray(current.digestSentTo) ? current.digestSentTo.filter((id) => typeof id === "string") : [];
  return {
    ...current,
    digestSentTo: sentTo.includes(recipientId) ? sentTo : [...sentTo, recipientId],
    digestSentAt: sentAt.toISOString(),
  };
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A one-line description of a queued event for the digest email. */
export function describeDigestItem(input: unknown): string | null {
  const metadata = asRecord(asRecord(input)?.metadata);
  for (const key of ["description", "message", "title", "projectName", "name"]) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
