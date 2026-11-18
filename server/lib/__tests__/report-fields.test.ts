import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  buildAvailableReportFields,
  buildReportFilterCondition,
  buildReportFilterConditions,
  formatFilterSkipWarning,
  getDynamicJoinRegistrations,
  getReportFieldColumn,
  getReportFieldDefinition,
  isKnownReportField,
  projectReportRow,
} from "../report-fields";
import { customers, projects, subteams, teams } from "@shared/schema";

const pgDialect = new PgDialect();
const renderCondition = (condition: any) => pgDialect.sqlToQuery(condition).sql;

describe("report-fields registry", () => {
  it("registers a Projects field with the projects table key", () => {
    const def = getReportFieldDefinition("status");
    expect(def).toBeDefined();
    expect(def?.source).toBe("Projects");
    expect(def?.tableKey).toBe("projects");
    expect(def?.columnName).toBe("status");
  });

  it("registers a Customers field with the customers table key", () => {
    const def = getReportFieldDefinition("region");
    expect(def).toBeDefined();
    expect(def?.source).toBe("Customers");
    expect(def?.tableKey).toBe("customers");
    expect(def?.columnName).toBe("region");
  });

  it("does not include unregistered fields in availability", () => {
    const available = buildAvailableReportFields();
    const allFields = [
      ...available.string,
      ...available.number,
      ...available.date,
      ...available.boolean,
      ...available.array,
    ].map((f) => f.field);
    expect(allFields).toContain("status");
    expect(allFields).toContain("region");
    expect(allFields).not.toContain("madeUpField");
  });

  it("reports known and unknown fields correctly", () => {
    expect(isKnownReportField("status")).toBe(true);
    expect(isKnownReportField("region")).toBe(true);
    expect(isKnownReportField("madeUpField")).toBe(false);
  });

  it("resolves a Projects field to the corresponding projects column", () => {
    const column = getReportFieldColumn("status");
    expect(column).toBeDefined();
    // Drizzle Column exposes the underlying Table on `.table` and the
    // column name on `.name`.
    expect(column?.table).toBe(projects);
    expect(column?.name).toBe("status");
  });

  it("resolves a Customers field to the corresponding customers column", () => {
    const column = getReportFieldColumn("region");
    expect(column).toBeDefined();
    expect(column?.table).toBe(customers);
    expect(column?.name).toBe("region");
  });

  it("returns undefined for an unregistered field", () => {
    expect(getReportFieldColumn("totallyMadeUpField")).toBeUndefined();
  });

  it("registers the owning team and subteam under the Teams source", () => {
    const team = getReportFieldDefinition("teamName");
    expect(team).toMatchObject({ source: "Teams", tableKey: "teams", columnName: "name", type: "string" });
    expect(getReportFieldColumn("teamName")?.table).toBe(teams);
    const subteam = getReportFieldDefinition("subteamName");
    expect(subteam).toMatchObject({ source: "Teams", tableKey: "subteams", columnName: "name", type: "string" });
    expect(getReportFieldColumn("subteamName")?.table).toBe(subteams);
  });

  it("joins the team tables only when a report uses their fields", () => {
    expect(getDynamicJoinRegistrations(["status"]).map((r) => r.tableKey)).toEqual([]);
    expect(getDynamicJoinRegistrations(["status"], [{ field: "teamName" }]).map((r) => r.tableKey)).toEqual(["teams"]);
    expect(getDynamicJoinRegistrations(["teamName", "subteamName"]).map((r) => r.tableKey)).toEqual(["teams", "subteams"]);
  });

  it("reads team names from the joined rows", () => {
    const row = { projects: { status: "Active" }, teams: { name: "EMEA" }, subteams: null };
    expect(projectReportRow(row, ["status", "teamName", "subteamName"])).toEqual({
      status: "Active",
      teamName: "EMEA",
      subteamName: null,
    });
  });
});

describe("projectReportRow", () => {
  const row = {
    projects: {
      id: 42,
      status: "active",
      customerName: "Acme Corp",
      riskScore: "7.50",
    },
    customers: {
      accountName: "Acme Corp",
      region: "EMEA",
      isActive: true,
    },
    users: {
      firstName: "Ada",
      lastName: "Lovelace",
    },
  };

  it("projects a Projects field from the projects sub-row", () => {
    const projected = projectReportRow(row, ["status"]);
    expect(projected).toEqual({ status: "active" });
  });

  it("projects a Customers field from the customers sub-row (the join)", () => {
    const projected = projectReportRow(row, ["region", "isActive"]);
    expect(projected).toEqual({ region: "EMEA", isActive: true });
  });

  it("logs (or otherwise notifies) on an unknown field instead of silently dropping it", () => {
    const onUnknownField = vi.fn();
    const projected = projectReportRow(
      row,
      ["status", "totallyMadeUpField"],
      { onUnknownField },
    );
    expect(projected).toEqual({ status: "active", totallyMadeUpField: null });
    expect(onUnknownField).toHaveBeenCalledTimes(1);
    expect(onUnknownField).toHaveBeenCalledWith("totallyMadeUpField");
  });

  it("supports virtual fields like the legacy primaryEngineer joiner", () => {
    const projected = projectReportRow(row, ["primaryEngineer"], {
      virtualFields: {
        primaryEngineer: (r) =>
          `${r.users.firstName} ${r.users.lastName}`.trim(),
      },
    });
    expect(projected).toEqual({ primaryEngineer: "Ada Lovelace" });
  });

  it("returns null for a known field whose source row is missing (no join match)", () => {
    const onUnknownField = vi.fn();
    const projected = projectReportRow(
      { projects: { status: "active" } },
      ["status", "region"],
      { onUnknownField },
    );
    expect(projected).toEqual({ status: "active", region: null });
    // 'region' is a known field — we shouldn't flag it as unknown just
    // because the joined customers row is absent.
    expect(onUnknownField).not.toHaveBeenCalled();
  });

  it("preserves the order of selected fields", () => {
    const projected = projectReportRow(row, ["region", "status", "id"]);
    expect(Object.keys(projected)).toEqual(["region", "status", "id"]);
  });
});

describe("buildReportFilterCondition", () => {
  // Compile each condition to a parameterised SQL string so we can assert
  // both the operator and the values bound for it.
  // A fresh dialect per test keeps state-free expectations.
  const compile = async (condition: any) => {
    const { PgDialect } = await import("drizzle-orm/pg-core");
    const dialect = new PgDialect();
    return dialect.sqlToQuery(condition);
  };

  it("skips filters whose field isn't registered", () => {
    const decision = buildReportFilterCondition("madeUpField", "equals", "x");
    expect(decision.kind).toBe("skip");
    if (decision.kind === "skip") {
      expect(decision.reason).toMatch(/madeUpField/);
    }
  });

  it("skips filters with an unknown operator", () => {
    const decision = buildReportFilterCondition("status", "between", "x");
    expect(decision.kind).toBe("skip");
    if (decision.kind === "skip") {
      expect(decision.reason).toMatch(/operator/);
    }
  });

  it("preserves equals on a string column", async () => {
    const decision = buildReportFilterCondition("status", "equals", "Planning");
    expect(decision.kind).toBe("condition");
    if (decision.kind !== "condition") return;
    const q = await compile(decision.condition);
    expect(q.sql).toMatch(/"status"\s*=\s*\$1/i);
    expect(q.params).toEqual(["Planning"]);
  });

  it("preserves contains on a string column (ilike with wildcards)", async () => {
    const decision = buildReportFilterCondition("status", "contains", "plan");
    expect(decision.kind).toBe("condition");
    if (decision.kind !== "condition") return;
    const q = await compile(decision.condition);
    expect(q.sql.toLowerCase()).toContain("ilike");
    expect(q.params).toEqual(["%plan%"]);
  });

  it("rejects contains on a non-string column", () => {
    const decision = buildReportFilterCondition("riskScore", "contains", "5");
    expect(decision.kind).toBe("skip");
    if (decision.kind === "skip") {
      expect(decision.reason).toMatch(/contains/);
    }
  });

  it("supports not_equals on a string column", async () => {
    const decision = buildReportFilterCondition(
      "status",
      "not_equals",
      "Complete",
    );
    expect(decision.kind).toBe("condition");
    if (decision.kind !== "condition") return;
    const q = await compile(decision.condition);
    expect(q.sql).toMatch(/<>/);
    expect(q.params).toEqual(["Complete"]);
  });

  it("supports greater_than on a number column with string coercion", async () => {
    const decision = buildReportFilterCondition(
      "riskScore",
      "greater_than",
      "7.5",
    );
    expect(decision.kind).toBe("condition");
    if (decision.kind !== "condition") return;
    const q = await compile(decision.condition);
    expect(q.sql).toMatch(/>/);
    expect(q.params).toEqual([7.5]);
  });

  it("supports less_than on a date column with string coercion", async () => {
    const decision = buildReportFilterCondition(
      "startDate",
      "less_than",
      "2025-01-01",
    );
    expect(decision.kind).toBe("condition");
    if (decision.kind !== "condition") return;
    const q = await compile(decision.condition);
    expect(q.sql).toMatch(/</);
    expect(q.params).toHaveLength(1);
    const param = q.params[0];
    expect(param instanceof Date || typeof param === "string").toBe(true);
  });

  it("rejects greater_than on a string column", () => {
    const decision = buildReportFilterCondition(
      "status",
      "greater_than",
      "Planning",
    );
    expect(decision.kind).toBe("skip");
    if (decision.kind === "skip") {
      expect(decision.reason).toMatch(/greater_than/);
    }
  });

  it("skips an `in` filter whose value is a string (the legacy comma-joined shape is no longer accepted)", () => {
    // Migration 026 backfilled every stored `in` / `not_in` value into a
    // real array, so anything still arriving as a comma-joined string
    // signals a writer that hasn't switched to the array shape — we want
    // that to surface as a skip instead of being silently re-parsed.
    const decision = buildReportFilterCondition(
      "status",
      "in",
      "Planning, In Progress, Complete",
    );
    expect(decision.kind).toBe("skip");
    if (decision.kind === "skip") {
      expect(decision.reason).toMatch(/array/);
      expect(decision.reason).toMatch(/string/);
    }
  });

  it("skips a `not_in` filter whose value is a string", () => {
    const decision = buildReportFilterCondition("id", "not_in", "1,2,3");
    expect(decision.kind).toBe("skip");
    if (decision.kind === "skip") {
      expect(decision.reason).toMatch(/array/);
    }
  });

  it("skips an `in` filter whose value is a non-array scalar", () => {
    // The contract is array-or-skip, so a bare number / boolean / object /
    // Date should be rejected just like a string is. Otherwise a single
    // scalar would be silently wrapped into a one-element list and produce
    // a valid condition, hiding writer drift.
    for (const value of [42, true, { foo: "bar" }, new Date()] as const) {
      const decision = buildReportFilterCondition("id", "in", value);
      expect(decision.kind).toBe("skip");
      if (decision.kind === "skip") {
        expect(decision.reason).toMatch(/array/);
      }
    }
  });

  it("skips a `not_in` filter whose value is a non-array scalar", () => {
    for (const value of [42, false, { foo: "bar" }] as const) {
      const decision = buildReportFilterCondition("id", "not_in", value);
      expect(decision.kind).toBe("skip");
      if (decision.kind === "skip") {
        expect(decision.reason).toMatch(/array/);
      }
    }
  });

  it("supports in with a real string[] (the current chip-input wire shape)", async () => {
    const decision = buildReportFilterCondition("status", "in", [
      "Planning",
      "In Progress",
      "Complete",
    ]);
    expect(decision.kind).toBe("condition");
    if (decision.kind !== "condition") return;
    const q = await compile(decision.condition);
    expect(q.sql.toLowerCase()).toContain("in (");
    expect(q.params).toEqual(["Planning", "In Progress", "Complete"]);
  });

  it("preserves array entries that contain commas (the whole reason for switching off comma strings)", async () => {
    const decision = buildReportFilterCondition("status", "in", [
      "Smith, John",
      "Doe, Jane",
    ]);
    expect(decision.kind).toBe("condition");
    if (decision.kind !== "condition") return;
    const q = await compile(decision.condition);
    expect(q.sql.toLowerCase()).toContain("in (");
    expect(q.params).toEqual(["Smith, John", "Doe, Jane"]);
  });

  it("supports not_in with a real number-as-string array", async () => {
    const decision = buildReportFilterCondition("id", "not_in", ["1", "2", "3"]);
    expect(decision.kind).toBe("condition");
    if (decision.kind !== "condition") return;
    const q = await compile(decision.condition);
    expect(q.sql.toLowerCase()).toContain("not in (");
    expect(q.params).toEqual([1, 2, 3]);
  });

  it("skips in when no array entry can be coerced to the field type", () => {
    const decision = buildReportFilterCondition("id", "in", ["abc", "xyz"]);
    expect(decision.kind).toBe("skip");
    if (decision.kind === "skip") {
      expect(decision.reason).toMatch(/no valid values/);
    }
  });

  it("skips a number filter whose value can't be parsed", () => {
    const decision = buildReportFilterCondition("id", "equals", "not-a-number");
    expect(decision.kind).toBe("skip");
    if (decision.kind === "skip") {
      expect(decision.reason).toMatch(/coerce/);
    }
  });

  it("coerces boolean strings for an equals filter on a boolean column", async () => {
    const decision = buildReportFilterCondition("isActive", "equals", "true");
    expect(decision.kind).toBe("condition");
    if (decision.kind !== "condition") return;
    const q = await compile(decision.condition);
    expect(q.params).toEqual([true]);
  });

  it("rejects equals on an array column", () => {
    const decision = buildReportFilterCondition("tags", "equals", "x");
    expect(decision.kind).toBe("skip");
    if (decision.kind === "skip") {
      expect(decision.reason).toMatch(/array/);
    }
  });
});

describe("buildReportFilterConditions", () => {
  it("returns an empty list when given no filters", () => {
    expect(buildReportFilterConditions(undefined)).toEqual([]);
    expect(buildReportFilterConditions(null)).toEqual([]);
    expect(buildReportFilterConditions([])).toEqual([]);
  });

  it("emits an `equals` condition referencing the registered column", () => {
    const conditions = buildReportFilterConditions([
      { field: "region", operator: "equals", value: "EMEA" },
    ]);
    expect(conditions).toHaveLength(1);
    expect(renderCondition(conditions[0])).toBe('"customers"."region" = $1');
  });

  it("emits an `ilike` condition for `contains` against a string field", () => {
    const conditions = buildReportFilterConditions([
      { field: "customerName", operator: "contains", value: "acme" },
    ]);
    expect(conditions).toHaveLength(1);
    expect(renderCondition(conditions[0])).toBe(
      '"projects"."customer_name" ilike $1',
    );
  });

  it("inherits the extended operator set from buildReportFilterCondition", () => {
    // Operators added by Task #229 (not_equals, greater_than, less_than, in,
    // not_in) become available to the plural helper for free because it
    // delegates to the singular one. Each entry below should produce one
    // condition, proving the delegation is in place.
    const conditions = buildReportFilterConditions([
      { field: "status", operator: "not_equals", value: "Complete" },
      { field: "riskScore", operator: "greater_than", value: "7.5" },
      { field: "id", operator: "in", value: ["1", "2", "3"] },
      { field: "id", operator: "not_in", value: ["9", "10"] },
    ]);
    expect(conditions).toHaveLength(4);
  });

  it("notifies and skips unknown filter fields without throwing", () => {
    const onSkip = vi.fn();
    const conditions = buildReportFilterConditions(
      [
        { field: "totallyMadeUpField", operator: "equals", value: "x" },
        { field: "region", operator: "equals", value: "EMEA" },
      ],
      { onSkip },
    );
    expect(conditions).toHaveLength(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
    const [filter, reason] = onSkip.mock.calls[0];
    expect(filter.field).toBe("totallyMadeUpField");
    expect(reason).toMatch(/totallyMadeUpField/);
  });

  it("notifies and skips a `contains` filter applied to a non-string column", () => {
    const onSkip = vi.fn();
    const conditions = buildReportFilterConditions(
      [{ field: "riskScore", operator: "contains", value: "5" }],
      { onSkip },
    );
    expect(conditions).toHaveLength(0);
    expect(onSkip).toHaveBeenCalledTimes(1);
    const [filter, reason] = onSkip.mock.calls[0];
    expect(filter.field).toBe("riskScore");
    expect(filter.operator).toBe("contains");
    expect(reason).toMatch(/contains/);
  });

  it("ignores entries that aren't well-formed filter objects", () => {
    // The helper accepts `unknown` so untyped JSONB rows can be passed
    // through without first asserting their shape.
    const onSkip = vi.fn();
    const conditions = buildReportFilterConditions(
      [
        null,
        "not an object",
        { field: "", operator: "equals", value: "x" },
        { field: "region", operator: 42, value: "EMEA" },
        { field: "region", operator: "equals", value: "EMEA" },
      ],
      { onSkip },
    );
    expect(conditions).toHaveLength(1);
    expect(onSkip).not.toHaveBeenCalled();
  });

  it("accepts non-array filter input without throwing", () => {
    expect(buildReportFilterConditions("not an array")).toEqual([]);
    expect(buildReportFilterConditions({ not: "an array" })).toEqual([]);
  });

  it("notifies and skips when an unsupported operator is used", () => {
    const onSkip = vi.fn();
    const conditions = buildReportFilterConditions(
      [{ field: "status", operator: "matches-regex", value: ".*" }],
      { onSkip },
    );
    expect(conditions).toHaveLength(0);
    expect(onSkip).toHaveBeenCalledTimes(1);
    const [, reason] = onSkip.mock.calls[0];
    expect(reason).toMatch(/operator/);
  });

  it("formatFilterSkipWarning produces a stable, context-prefixed message", () => {
    // Both `previewReport` and `executeCustomReport` route every skip through
    // this formatter, so log scrapers see one canonical wording shape that
    // only varies by the leading context.
    expect(
      formatFilterSkipWarning(
        "previewReport",
        { field: "region", operator: "equals", value: "EMEA" },
        "field is not registered",
      ),
    ).toBe(
      `[reports] previewReport: skipping filter on "region" (equals) — field is not registered.`,
    );
    expect(
      formatFilterSkipWarning(
        "executeCustomReport: report 7",
        { field: "riskScore", operator: "contains", value: "5" },
        "contains is only supported for string fields",
      ),
    ).toBe(
      `[reports] executeCustomReport: report 7: skipping filter on "riskScore" (contains) — contains is only supported for string fields.`,
    );
  });
});
