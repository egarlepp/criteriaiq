import { describe, expect, it } from "vitest";

import {
  REPORT_FILTER_OPERATORS,
  defaultOperatorForType,
  describeIncompatibility,
  getCompatibleOperators,
  getValueInputKind,
  isOperatorCompatible,
} from "../report-filter-helpers";

describe("getCompatibleOperators", () => {
  it("allows all operators when the field type is unknown", () => {
    expect(getCompatibleOperators(undefined)).toEqual(REPORT_FILTER_OPERATORS);
    expect(getCompatibleOperators("mystery")).toEqual(REPORT_FILTER_OPERATORS);
  });

  it("restricts string fields to text-friendly operators (no numeric comparisons)", () => {
    const ops = getCompatibleOperators("string");
    expect(ops).toContain("equals");
    expect(ops).toContain("contains");
    expect(ops).toContain("in");
    expect(ops).not.toContain("greater_than");
    expect(ops).not.toContain("less_than");
  });

  it("allows numeric comparisons but not contains for number/date fields", () => {
    for (const t of ["number", "date"] as const) {
      const ops = getCompatibleOperators(t);
      expect(ops).toContain("greater_than");
      expect(ops).toContain("less_than");
      expect(ops).not.toContain("contains");
    }
  });

  it("limits boolean fields to equality operators", () => {
    expect(getCompatibleOperators("boolean")).toEqual(["equals", "not_equals"]);
  });

  it("returns no operators for array fields (all server-side branches reject them)", () => {
    expect(getCompatibleOperators("array")).toEqual([]);
  });
});

describe("isOperatorCompatible", () => {
  it("treats unknown field type as permissive", () => {
    expect(isOperatorCompatible(undefined, "contains")).toBe(true);
  });

  it("flags contains on number as incompatible", () => {
    expect(isOperatorCompatible("number", "contains")).toBe(false);
  });

  it("flags greater_than on string as incompatible", () => {
    expect(isOperatorCompatible("string", "greater_than")).toBe(false);
  });

  it("accepts equals on every non-array type", () => {
    for (const t of ["string", "number", "date", "boolean"] as const) {
      expect(isOperatorCompatible(t, "equals")).toBe(true);
    }
  });

  it("rejects every operator on array fields", () => {
    for (const op of REPORT_FILTER_OPERATORS) {
      expect(isOperatorCompatible("array", op)).toBe(false);
    }
  });
});

describe("defaultOperatorForType", () => {
  it("returns equals as the safe default for typed fields", () => {
    expect(defaultOperatorForType("string")).toBe("equals");
    expect(defaultOperatorForType("number")).toBe("equals");
    expect(defaultOperatorForType("date")).toBe("equals");
    expect(defaultOperatorForType("boolean")).toBe("equals");
  });

  it("falls back to equals when no operators are compatible", () => {
    expect(defaultOperatorForType("array")).toBe("equals");
  });
});

describe("getValueInputKind", () => {
  it("uses a list-friendly text input for in/not_in regardless of type", () => {
    expect(getValueInputKind("number", "in")).toBe("list");
    expect(getValueInputKind("string", "not_in")).toBe("list");
    expect(getValueInputKind("date", "in")).toBe("list");
    expect(getValueInputKind("boolean", "not_in")).toBe("list");
  });

  it("maps scalar operators to type-specific controls", () => {
    expect(getValueInputKind("number", "equals")).toBe("number");
    expect(getValueInputKind("date", "greater_than")).toBe("date");
    expect(getValueInputKind("boolean", "equals")).toBe("boolean");
    expect(getValueInputKind("string", "contains")).toBe("text");
  });

  it("falls back to text when the field type is unknown", () => {
    expect(getValueInputKind(undefined, "equals")).toBe("text");
    expect(getValueInputKind("mystery", "equals")).toBe("text");
  });
});

describe("describeIncompatibility", () => {
  it("returns null when the operator is compatible", () => {
    expect(describeIncompatibility("string", "contains")).toBeNull();
    expect(describeIncompatibility("number", "greater_than")).toBeNull();
  });

  it("returns null when there's nothing to evaluate", () => {
    expect(describeIncompatibility(undefined, "contains")).toBeNull();
    expect(describeIncompatibility("string", "")).toBeNull();
  });

  it("calls out the offending operator label for typed fields", () => {
    const msg = describeIncompatibility("number", "contains");
    expect(msg).toContain("Contains");
    expect(msg).toContain("number");
  });

  it("explains that array fields are unsupported across the board", () => {
    const msg = describeIncompatibility("array", "equals");
    expect(msg).toMatch(/array/i);
  });
});
