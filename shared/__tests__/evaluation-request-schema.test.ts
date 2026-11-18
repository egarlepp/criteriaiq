import { describe, it, expect } from "vitest";
import { createEvaluationRequestSchema, updateEvaluationRequestSchema } from "@shared/schema";

const validCreate = {
  customerId: 1,
  solutionIds: [2, 3],
  startDate: "2026-11-10",
  endDate: "2026-12-10",
  topReasons: "Audit failures",
  compellingEvent: "External audit next quarter",
};

describe("createEvaluationRequestSchema", () => {
  it("accepts the fields the request form sends", () => {
    const parsed = createEvaluationRequestSchema.parse(validCreate);
    expect(parsed.startDate).toBeInstanceOf(Date);
    expect(parsed.solutionIds).toEqual([2, 3]);
  });

  it("rejects a userId in the body (the requester comes from the session)", () => {
    expect(createEvaluationRequestSchema.safeParse({ ...validCreate, userId: "someone-else" }).success).toBe(false);
  });

  it("rejects an end date before the start date", () => {
    const result = createEvaluationRequestSchema.safeParse({ ...validCreate, endDate: "2026-11-01" });
    expect(result.success).toBe(false);
  });

  it("requires at least one solution and non-blank text", () => {
    expect(createEvaluationRequestSchema.safeParse({ ...validCreate, solutionIds: [] }).success).toBe(false);
    expect(createEvaluationRequestSchema.safeParse({ ...validCreate, topReasons: "   " }).success).toBe(false);
  });

  it("rejects an unparseable date", () => {
    expect(createEvaluationRequestSchema.safeParse({ ...validCreate, startDate: "soon" }).success).toBe(false);
  });
});

describe("updateEvaluationRequestSchema", () => {
  it("accepts a partial edit and a status change", () => {
    expect(updateEvaluationRequestSchema.parse({ topReasons: "Updated" })).toEqual({ topReasons: "Updated" });
    expect(updateEvaluationRequestSchema.parse({ status: "closed" })).toEqual({ status: "closed" });
  });

  it("rejects fields that must not change", () => {
    for (const body of [{ customerId: 5 }, { userId: "x" }, { id: 9 }, { createdAt: "2020-01-01" }]) {
      expect(updateEvaluationRequestSchema.safeParse(body).success).toBe(false);
    }
  });

  it("rejects an unknown status", () => {
    expect(updateEvaluationRequestSchema.safeParse({ status: "approved" }).success).toBe(false);
  });
});
