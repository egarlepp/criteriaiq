import { describe, it, expect, vi } from "vitest";

vi.mock("../../storage", () => ({ storage: {} }));

const { describeNotification, buildDigestEmail } = await import("../notification-digest");

describe("notification digest", () => {
  it("describes each kind in plain English", () => {
    expect(describeNotification({ kind: "project_assigned", params: { projectName: "Acme" } })).toBe(
      'You were made the primary engineer on "Acme".',
    );
    expect(
      describeNotification({ kind: "map_item_assigned", params: { projectName: "Acme", itemType: "task", itemName: "Install" } }),
    ).toBe('You were assigned the task "Install" on "Acme".');
    expect(
      describeNotification({ kind: "project_status_changed", params: { projectName: "Acme", oldStatus: "Planning", newStatus: "Active" } }),
    ).toBe('"Acme" changed status from Planning to Active.');
  });

  it("escapes names and links each line", () => {
    const rows = [
      { id: 1, kind: "criterion_completed", params: { projectName: "<b>X</b>", criterionName: "SSO" }, linkPath: "/project/1?tab=success-criteria" },
    ] as never;
    const email = buildDigestEmail("Dana", rows, "https://app.test");
    expect(email.subject).toBe("[CriteriaIQ] 1 new notification");
    expect(email.html).toContain("&lt;b&gt;X&lt;/b&gt;");
    expect(email.html).toContain("https://app.test/project/1?tab=success-criteria");
    expect(email.text).toContain("Hi Dana,");
  });
});
