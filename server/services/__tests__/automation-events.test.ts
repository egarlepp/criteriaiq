import { describe, it, expect, vi, beforeEach } from "vitest";

const deliverToSubscribers = vi.fn().mockResolvedValue([]);

vi.mock("../../webhooks/webhook-service", () => ({
  webhookService: { deliverToSubscribers },
}));

const {
  emitAutomationEvent,
  emitProjectCreated,
  emitProjectUpdated,
  emitMapItemUpdated,
  emitCriterionUpdated,
} = await import("../automation-events");
const { getSystemTrigger } = await import("../../email/email-trigger-registry");
const { EMITTED_EVENT_KEYS } = await import("@shared/automation-events");
const { runWithDemoContext } = await import("../../lib/demo-mode");

/** Emission is deferred with setImmediate; flush it, then list keys sent. */
async function emittedKeys(): Promise<string[]> {
  await new Promise((resolve) => setImmediate(resolve));
  return deliverToSubscribers.mock.calls.map(([ctx]) => ctx.triggerKey);
}

beforeEach(() => {
  deliverToSubscribers.mockClear();
});

describe("EMITTED_EVENT_KEYS", () => {
  it("only lists keys that exist in the trigger registry", () => {
    for (const key of EMITTED_EVENT_KEYS) {
      expect(getSystemTrigger(key), key).toBeDefined();
    }
  });
});

describe("emitAutomationEvent", () => {
  it("drops unknown trigger keys", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    emitAutomationEvent({ triggerKey: "project.exploded" });
    expect(await emittedKeys()).toEqual([]);
    warn.mockRestore();
  });

  it("emits nothing from a Demo Mode request", async () => {
    runWithDemoContext({ active: true, source: "session", excluded: false }, () =>
      emitProjectCreated({ id: 7, solutionName: "Demo POC", status: "planning" }, "u1"),
    );
    expect(await emittedKeys()).toEqual([]);
  });

  it("still emits from a demo session on a screen outside Demo Mode", async () => {
    runWithDemoContext({ active: true, source: "session", excluded: true }, () =>
      emitAutomationEvent({ triggerKey: "project.updated", projectId: 1 }),
    );
    expect(await emittedKeys()).toEqual(["project.updated"]);
  });

  it("passes project id, user and metadata through", async () => {
    emitProjectCreated({ id: 7, solutionName: "Acme POC", customerName: "Acme", status: "planning" }, "u1");
    await emittedKeys();
    const [ctx] = deliverToSubscribers.mock.calls[0];
    expect(ctx.triggerKey).toBe("project.created");
    expect(ctx.projectId).toBe(7);
    expect(ctx.metadata).toMatchObject({ projectName: "Acme POC", customerName: "Acme", userId: "u1" });
  });

  it("does not throw when delivery rejects", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    deliverToSubscribers.mockRejectedValueOnce(new Error("db down"));
    expect(() => emitAutomationEvent({ triggerKey: "project.updated", projectId: 1 })).not.toThrow();
    await emittedKeys();
    await new Promise((resolve) => setImmediate(resolve));
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("emitProjectUpdated", () => {
  it("emits only project.updated when nothing notable changed", async () => {
    emitProjectUpdated({ id: 1, status: "active", risk: "Low" }, { id: 1, status: "active", risk: "Low" }, "u1");
    expect(await emittedKeys()).toEqual(["project.updated"]);
  });

  it("adds status, risk and assignment events from the diff", async () => {
    emitProjectUpdated(
      { id: 1, status: "active", risk: "Low", primaryEngineerId: "a" },
      { id: 1, status: "closed", risk: "High", primaryEngineerId: "b" },
      "u1",
    );
    expect(await emittedKeys()).toEqual([
      "project.updated",
      "project.status_changed",
      "risk.level_changed",
      "project.assigned",
    ]);
  });
});

describe("emitMapItemUpdated", () => {
  it("emits status_changed and completed on completion", async () => {
    emitMapItemUpdated("task", 3, { id: 9, status: "in_progress" }, { id: 9, status: "completed" }, "u1");
    expect(await emittedKeys()).toEqual(["map.task.status_changed", "map.task.completed"]);
  });

  it("emits assigned when the assignee changes", async () => {
    emitMapItemUpdated("phase", 3, { id: 2, status: "x", assignedToUserId: null }, { id: 2, status: "x", assignedToUserId: "u2" }, "u1");
    expect(await emittedKeys()).toEqual(["map.phase.assigned"]);
  });

  it("emits team_assigned when Our team changes to a team, and nothing when it's cleared", async () => {
    emitMapItemUpdated("task", 3, { id: 2, status: "x", assignedToTeamId: null }, { id: 2, status: "x", assignedToTeamId: 5 }, "u1");
    expect(await emittedKeys()).toEqual(["map.task.team_assigned"]);
    expect(deliverToSubscribers.mock.calls[0][0].metadata).toMatchObject({ assignedTeamId: 5, previousTeamId: null });
    deliverToSubscribers.mockClear();
    emitMapItemUpdated("task", 3, { id: 2, status: "x", assignedToTeamId: 5 }, { id: 2, status: "x", assignedToTeamId: null }, "u1");
    expect(await emittedKeys()).toEqual([]);
  });

  it("emits nothing for an unrelated edit", async () => {
    emitMapItemUpdated("step", 3, { id: 2, status: "x", name: "a" }, { id: 2, status: "x", name: "b" }, "u1");
    expect(await emittedKeys()).toEqual([]);
  });
});

describe("emitCriterionUpdated", () => {
  it("emits criteria.completed on the transition to complete", async () => {
    emitCriterionUpdated({ id: 4, projectId: 1, status: "in_progress" }, { id: 4, projectId: 1, status: "complete" }, "u1");
    expect(await emittedKeys()).toEqual(["criteria.updated", "criteria.completed"]);
  });

  it("does not re-emit completed when already complete", async () => {
    emitCriterionUpdated({ id: 4, projectId: 1, status: "complete" }, { id: 4, projectId: 1, status: "complete" }, "u1");
    expect(await emittedKeys()).toEqual(["criteria.updated"]);
  });
});

describe("onAutomationEvent", () => {
  it("runs listeners after emission and survives one that throws", async () => {
    const { onAutomationEvent } = await import("../automation-events");
    const seen: string[] = [];
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const offBad = onAutomationEvent(() => {
      throw new Error("boom");
    });
    const offGood = onAutomationEvent((e) => seen.push(e.triggerKey));
    emitAutomationEvent({ triggerKey: "criteria.completed", projectId: 1 });
    expect(seen).toEqual([]);
    await new Promise((resolve) => setImmediate(resolve));
    expect(seen).toEqual(["criteria.completed"]);
    offBad();
    offGood();
    err.mockRestore();
  });
});
