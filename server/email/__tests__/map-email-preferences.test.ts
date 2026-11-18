import { describe, expect, it } from "vitest";
import { mapEmailDecision, mapEventDedupKey, parseMapEventKey } from "../map-email-preferences";
import { resolveActionRecipients } from "../digest-utils";

describe("MAP email choices", () => {
  it("knows only the MAP events projects can switch on", () => {
    expect(parseMapEventKey("map.task.assigned")).toEqual({ entity: "task", event: "assigned" });
    expect(parseMapEventKey("map.phase.due_soon")).toEqual({ entity: "phase", event: "due_soon" });
    expect(parseMapEventKey("map.task_assigned")).toBeNull();
    expect(parseMapEventKey("project.created")).toBeNull();
  });

  it("allows events that aren't MAP events", () => {
    expect(mapEmailDecision("project.created", { tasksPreference: "do_not_send" }, null).allowed).toBe(true);
  });

  it("uses the project defaults when nobody changed them", () => {
    expect(mapEmailDecision("map.task.assigned", null, null).allowed).toBe(true);
    expect(mapEmailDecision("map.task.completed", null, null).allowed).toBe(false);
    expect(mapEmailDecision("map.phase.completed", null, null).allowed).toBe(true);
    expect(mapEmailDecision("map.step.assigned", null, null).allowed).toBe(false);
  });

  it("follows the project's MAP › Notifications choices", () => {
    const settings = { tasksSettings: ["completed", "due_soon"] };
    expect(mapEmailDecision("map.task.due_soon", null, settings).allowed).toBe(true);
    expect(mapEmailDecision("map.task.assigned", null, settings).allowed).toBe(false);
  });

  it("lets Profile's Do Not Send win over the project", () => {
    const d = mapEmailDecision("map.task.assigned", { tasksPreference: "do_not_send" }, { tasksSettings: ["assigned"] });
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/Profile/);
    expect(mapEmailDecision("map.phase.completed", { tasksPreference: "do_not_send" }, null).allowed).toBe(true);
  });

  it("dedups per item and change, not per project", () => {
    expect(mapEventDedupKey("map.task.assigned", { taskId: 7, assignedTo: "u1" })).toBe("task:7:u1");
    expect(mapEventDedupKey("map.task.assigned", { taskId: 7, assignedTo: "u2" })).toBe("task:7:u2");
    expect(mapEventDedupKey("map.step.status_changed", { stepId: 3, newStatus: "blocked" })).toBe("step:3:blocked");
    expect(mapEventDedupKey("map.phase.completed", { phaseId: 1 })).toBe("phase:1:");
    expect(mapEventDedupKey("map.task.due_soon", { taskId: "9", dueDate: "2026-11-02" })).toBe("task:9:2026-11-02");
    expect(mapEventDedupKey("map.task.assigned", {})).toBeUndefined();
    expect(mapEventDedupKey("project.created", { taskId: 1 })).toBeUndefined();
  });

  it("resolves the item's assignee as a recipient", () => {
    expect(resolveActionRecipients({ recipientUserIds: ["item_assignee", "u9"] }, "actor", "none", "u1")).toEqual(["u1", "u9"]);
    expect(resolveActionRecipients({ recipientUserIds: ["item_assignee"] }, "actor", "none", null)).toEqual([]);
  });
});
