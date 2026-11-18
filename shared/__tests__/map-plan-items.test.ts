import { describe, expect, it } from "vitest";
import {
  MAP_ITEM_NAME_MAX,
  QUICK_PLAN_MAX_STEPS,
  newMapItemSchema,
  quickPlanSchema,
  quickPlanStepsFromText,
} from "../map-plan-items";

describe("quickPlanStepsFromText", () => {
  it("strips bullets, numbering and checkboxes and drops blank lines", () => {
    const text = "- Kickoff\r\n\n* Configure\n• Test\n1. Readout\n2) Decide\n[ ] Sign\n[x] Done\n   ";
    expect(quickPlanStepsFromText(text)).toEqual(["Kickoff", "Configure", "Test", "Readout", "Decide", "Sign", "Done"]);
  });

  it("keeps plain lines as they are", () => {
    expect(quickPlanStepsFromText("Security review\nPilot")).toEqual(["Security review", "Pilot"]);
  });

  it("caps the name length and the number of steps", () => {
    const long = "x".repeat(MAP_ITEM_NAME_MAX + 20);
    expect(quickPlanStepsFromText(long)[0]).toHaveLength(MAP_ITEM_NAME_MAX);
    const many = Array.from({ length: QUICK_PLAN_MAX_STEPS + 5 }, (_, i) => `Step ${i}`).join("\n");
    expect(quickPlanStepsFromText(many)).toHaveLength(QUICK_PLAN_MAX_STEPS);
  });
});

describe("newMapItemSchema", () => {
  it("accepts a phase without a parent", () => {
    expect(newMapItemSchema.safeParse({ kind: "phase", name: "Pilot" }).success).toBe(true);
  });

  it("needs a parent for a step or a task", () => {
    expect(newMapItemSchema.safeParse({ kind: "step", name: "Review" }).success).toBe(false);
    expect(newMapItemSchema.safeParse({ kind: "task", name: "Send", parentId: 4 }).success).toBe(true);
  });

  it("checks the name and the due date format", () => {
    expect(newMapItemSchema.safeParse({ kind: "phase", name: "   " }).success).toBe(false);
    expect(newMapItemSchema.safeParse({ kind: "phase", name: "P", dueDate: "11/30/2026" }).success).toBe(false);
    expect(newMapItemSchema.safeParse({ kind: "phase", name: "P", dueDate: "2026-11-30" }).success).toBe(true);
  });
});

describe("quickPlanSchema", () => {
  it("defaults to no steps and rejects too many", () => {
    expect(quickPlanSchema.parse({ phaseName: "Plan" }).steps).toEqual([]);
    const steps = Array.from({ length: QUICK_PLAN_MAX_STEPS + 1 }, (_, i) => `S${i}`);
    expect(quickPlanSchema.safeParse({ phaseName: "Plan", steps }).success).toBe(false);
  });
});
