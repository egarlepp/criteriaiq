import { describe, expect, it } from "vitest";
import {
  actionTeamTargets,
  describeDigestItem,
  escapeHtml,
  groupDigestItems,
  markDigestSent,
  pendingDigestRecipients,
  resolveActionRecipients,
} from "../digest-utils";

const queued = (recipients: string[], extra: Record<string, unknown> = {}) => ({
  metadata: {
    actions: [],
    executionResults: [
      { action: "send_email", status: "executed" },
      { action: "schedule_digest", status: "delayed", digestRecipientIds: recipients },
    ],
    ...extra,
  },
});

describe("resolveActionRecipients", () => {
  it("reads the editor's recipient list", () => {
    expect(resolveActionRecipients({ recipientUserIds: ["a", "b"] }, "trigger")).toEqual(["a", "b"]);
  });

  it("reads the single recipientId used by older rules", () => {
    expect(resolveActionRecipients({ recipientId: "a" }, "trigger")).toEqual(["a"]);
  });

  it("maps trigger_user to the user who fired the rule and dedupes", () => {
    expect(resolveActionRecipients({ recipientUserIds: ["trigger_user", "u1"], recipientId: "u1" }, "u1")).toEqual(["u1"]);
  });

  it("falls back to the triggering user only when asked", () => {
    expect(resolveActionRecipients({}, "u9", "trigger_user")).toEqual(["u9"]);
    expect(resolveActionRecipients({}, "u9")).toEqual([]);
    expect(resolveActionRecipients(undefined, null, "trigger_user")).toEqual([]);
  });

  it("ignores blank and non-string values", () => {
    expect(resolveActionRecipients({ recipientUserIds: ["", null, 7, " x "] }, null)).toEqual(["7", "x"]);
  });
});

describe("pendingDigestRecipients", () => {
  it("lists queued recipients not yet sent", () => {
    expect(pendingDigestRecipients(queued(["a", "b"], { digestSentTo: ["a"] }))).toEqual(["b"]);
  });

  it("ignores audit rows without a schedule_digest result", () => {
    expect(pendingDigestRecipients({ metadata: { executionResults: [{ action: "send_email" }] } })).toEqual([]);
    expect(pendingDigestRecipients({ metadata: null })).toEqual([]);
  });
});

describe("groupDigestItems", () => {
  it("groups each queued event under every pending recipient", () => {
    const one = queued(["a", "b"]);
    const two = queued(["b"]);
    const done = queued(["a"], { digestSentTo: ["a"] });
    const grouped = groupDigestItems([one, two, done]);
    expect(grouped.get("a")).toEqual([one]);
    expect(grouped.get("b")).toEqual([one, two]);
    expect(grouped.size).toBe(2);
  });
});

describe("markDigestSent", () => {
  it("adds the recipient once and keeps the rest of the metadata", () => {
    const sentAt = new Date("2026-10-21T12:00:00Z");
    const first = markDigestSent(queued(["a", "b"]).metadata, "a", sentAt);
    const again = markDigestSent(first, "a", sentAt);
    expect(again.digestSentTo).toEqual(["a"]);
    expect(again.digestSentAt).toBe(sentAt.toISOString());
    expect(pendingDigestRecipients({ metadata: markDigestSent(first, "b", sentAt) })).toEqual([]);
  });
});

describe("escapeHtml and describeDigestItem", () => {
  it("escapes markup", () => {
    expect(escapeHtml(`<b onclick="x">'&'</b>`)).toBe("&lt;b onclick=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/b&gt;");
  });

  it("picks the first useful text from the trigger metadata", () => {
    expect(describeDigestItem({ metadata: { title: "  Phase done ", name: "x" } })).toBe("Phase done");
    expect(describeDigestItem({ metadata: {} })).toBeNull();
    expect(describeDigestItem(null)).toBeNull();
  });
});

describe("actionTeamTargets", () => {
  it("reads team and subteam ids from action params", () => {
    expect(actionTeamTargets({ recipientTeamIds: [1, "2"], recipientSubteamIds: [5, "x"] })).toEqual({
      teamIds: [1, 2],
      subteamIds: [5],
    });
  });

  it("is empty for rules saved before teams", () => {
    expect(actionTeamTargets({ recipientUserIds: ["u1"] })).toEqual({ teamIds: [], subteamIds: [] });
    expect(actionTeamTargets(null)).toEqual({ teamIds: [], subteamIds: [] });
  });
});
