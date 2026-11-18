import {
  desc,
  eq,
  getTableColumns,
  gt,
  ilike,
  inArray,
  isNotNull,
  lt,
  ne,
  notInArray,
} from "drizzle-orm";
import type { Column, SQL, Table } from "drizzle-orm";
import { projects, customers, successCriteria, teams, subteams } from "@shared/schema";

export type ReportFieldType = "string" | "number" | "date" | "boolean" | "array";

export interface ReportField {
  field: string;
  label: string;
  type: ReportFieldType;
  source: string;
  description?: string;
  example?: string | null;
}

/**
 * A canned filter the Report Builder UI surfaces under each source on
 * the Filters tab. Each source declares its own examples in the
 * registry so adding new sources (or reorganising the catalog of
 * preset filters) doesn't require touching the React component.
 *
 * `value` is the literal filter value sent to the API. For dates use
 * `valueResolver: 'today' | 'startOfYear' | 'thirtyDaysAgo'` so the
 * UI can compute the right "now"-relative value at click time.
 */
export interface ReportFilterExample {
  label: string;
  field: string;
  operator: string;
  value?: string;
  /**
   * Names a server-known function for computing the value at click
   * time. Defined values: 'today', 'startOfYear', 'thirtyDaysAgo'.
   * Mutually exclusive with `value` — `value` wins when both are set.
   */
  valueResolver?: "today" | "startOfYear" | "thirtyDaysAgo";
}

export interface ReportFieldDefinition extends ReportField {
  /**
   * The key under which the source row appears on a Drizzle joined result row
   * (e.g. `row.projects`, `row.customers`). When the executor runs
   * `db.select().from(projects).leftJoin(customers, ...)`, Drizzle keys each
   * joined record by its table name; this is the same name.
   */
  tableKey: string;
  /** The actual column property name on that source row. */
  columnName: string;
}

export interface AvailableReportFields {
  string: ReportField[];
  number: ReportField[];
  date: ReportField[];
  boolean: ReportField[];
  array: ReportField[];
}

interface FieldOverride {
  label?: string;
  type?: ReportFieldType;
  description?: string;
}

/**
 * Each entry in `include` is either the raw column name (used both as
 * the field key on the wire and the lookup into `overrides`) or an
 * `{ column, alias }` tuple that lets two sources expose a column with
 * the same name without colliding in the global field registry
 * (e.g. `projects.status` already owns the bare `"status"` key, so
 * `successCriteria.status` opts in as `{ column: 'status', alias: 'criterionStatus' }`).
 */
type IncludeEntry = string | { column: string; alias: string };

interface ReportTableRegistration {
  source: string;
  tableKey: string;
  table: Table;
  include: IncludeEntry[];
  overrides?: Record<string, FieldOverride>;
  /**
   * Per-source filter examples surfaced as "click to add" chips on
   * the Filters tab. The chip's accent color comes from the matching
   * frontend `groupAccent(source)` palette.
   */
  filterExamples?: ReportFilterExample[];
  /**
   * How this source joins from the base `projects` row. Omitting it
   * marks the source as either the base (Projects) or as joinable via
   * a hardcoded path (Customers, which joins by accountName). New
   * sources MUST set this so the executor can wire them in
   * dynamically.
   */
  joinFromProjects?: { on: SQL };
  /**
   * Set to `true` when this source has many rows per parent project
   * (e.g. one project may have many criteria, tasks, gaps). A report
   * that selects any field from a one-to-many source returns one row
   * per child — parent columns repeat. The UI surfaces this on the
   * field-group header so users know to expect fan-out.
   */
  oneToMany?: boolean;
}

const REPORT_TABLES: ReportTableRegistration[] = [
  {
    source: "Projects",
    tableKey: "projects",
    table: projects,
    include: [
      "id",
      "customerName",
      "businessProblem",
      "solutionName",
      "solutionDescription",
      "industry",
      "environment",
      "status",
      "customerStatus",
      "risk",
      "ranking",
      "riskScore",
      "tags",
      "supportingEngineers",
      "startDate",
      "endDate",
      "completedDate",
      "lastRiskAnalysis",
      "createdAt",
      "updatedAt",
      // Backfilled in Tier 2 — analytically useful columns that the
      // original registry skipped. Operational/freeform blobs
      // (notes, mgmtNotes, engineerNotes,
      // riskPredictionData) intentionally remain excluded.
      "type",
      "opportunityName",
      "opportunityAcvValue",
      "salesStage",
      "forecastCategory",
      "customerObjective",
      "mapTemplateName",
      "enableGapAnalysis",
    ],
    filterExamples: [
      { label: "Active Projects Only", field: "status", operator: "equals", value: "In Progress" },
      { label: "In-Quarter Priority", field: "ranking", operator: "equals", value: "In Quarter" },
      { label: "Projects Starting This Year", field: "startDate", operator: "greater_than", valueResolver: "startOfYear" },
      { label: "High Risk Projects", field: "risk", operator: "equals", value: "Red" },
      { label: "CloudLAB Environment", field: "environment", operator: "equals", value: "CloudLAB" },
      { label: "Recently Updated", field: "updatedAt", operator: "greater_than", valueResolver: "thirtyDaysAgo" },
    ],
    overrides: {
      id: {
        label: "Project ID",
        description: "Internal numeric identifier for the project record.",
      },
      customerName: {
        label: "Customer Name",
        description: "Name of the customer or account this project belongs to.",
      },
      businessProblem: {
        label: "Business Problem",
        description: "Free-text description of the customer problem the project is meant to solve.",
      },
      solutionName: {
        label: "Solution Name",
        description: "Short name of the proposed solution for this project.",
      },
      solutionDescription: {
        label: "Solution Description",
        description: "Free-text description of the proposed solution.",
      },
      industry: {
        label: "Industry",
        description: "Industry vertical the customer operates in.",
      },
      environment: {
        label: "Environment",
        description: "Deployment environment for the work (e.g. CloudLAB, Production).",
      },
      status: {
        label: "Status",
        description: "Internal execution status of the project (e.g. Planning, In Progress, Completed). Configurable per workspace via the status picklist.",
      },
      customerStatus: {
        label: "Customer Status",
        description: "How the customer perceives progress (e.g. On Time, Need Assistance, Delayed). Configurable per workspace via the customer status picklist.",
      },
      risk: {
        label: "Risk Level",
        description: "Categorical risk assessment for the project (Red, Yellow, None). Configurable per workspace via the risk level picklist.",
      },
      ranking: {
        label: "Ranking",
        description: "Internal priority bucket (e.g. In Quarter, Upside, Stretch, Out Quarter, Burn it Down). Configurable per workspace via the ranking picklist.",
      },
      riskScore: {
        label: "Risk Score",
        type: "number",
        description: "Numeric risk score from the most recent automated analysis.",
      },
      tags: {
        label: "Tags",
        description: "Free-form tags applied to this project.",
      },
      supportingEngineers: {
        label: "Supporting Engineers",
        description: "Engineers helping out beyond the primary engineer.",
      },
      startDate: {
        label: "Start Date",
        description: "Date the project officially started.",
      },
      endDate: {
        label: "End Date",
        description: "Planned end date for the project.",
      },
      completedDate: {
        label: "Completed Date",
        description: "Date the project was actually marked complete.",
      },
      lastRiskAnalysis: {
        label: "Last Risk Analysis",
        description: "Timestamp of the most recent risk score recalculation.",
      },
      createdAt: {
        label: "Created Date",
        description: "When this project record was first created in the system.",
      },
      updatedAt: {
        label: "Last Updated",
        description: "When this project record was last modified.",
      },
      type: {
        label: "Project Type",
        description: "Category/type classification of the project.",
      },
      opportunityName: {
        label: "Opportunity Name",
        description: "Linked sales opportunity name (CRM/Salesforce).",
      },
      opportunityAcvValue: {
        label: "Opportunity ACV",
        type: "number",
        description: "Annual contract value of the linked opportunity.",
      },
      salesStage: {
        label: "Sales Stage",
        description: "Current sales stage from the linked opportunity.",
      },
      forecastCategory: {
        label: "Forecast Category",
        description: "Forecast bucket from the linked opportunity (e.g. Commit, Best Case, Pipeline).",
      },
      customerObjective: {
        label: "Customer Objective",
        description: "What the customer is trying to achieve with this engagement.",
      },
      mapTemplateName: {
        label: "MAP Template",
        description: "Name of the Mutual Action Plan template this project is based on.",
      },
      enableGapAnalysis: {
        label: "Gap Analysis Enabled",
        description: "Whether the gap analysis feature is turned on for this project.",
      },
    },
  },
  {
    source: "Customers",
    tableKey: "customers",
    table: customers,
    include: [
      "accountName",
      "abbreviation",
      "region",
      "productInterests",
      "isActive",
      "isPartner",
    ],
    filterExamples: [
      { label: "Active Customers Only", field: "isActive", operator: "equals", value: "true" },
      { label: "Partner Accounts", field: "isPartner", operator: "equals", value: "true" },
      { label: "North America Region", field: "region", operator: "equals", value: "North America" },
    ],
    overrides: {
      accountName: {
        label: "Customer Account Name",
        description: "Full account name as it appears in the customer record.",
      },
      abbreviation: {
        label: "Customer Abbreviation",
        description: "Short code or abbreviation used to refer to the customer.",
      },
      region: {
        label: "Customer Region",
        description: "Geographic region the customer is based in.",
      },
      productInterests: {
        label: "Product Interests",
        description: "Products this customer has expressed interest in.",
      },
      isActive: {
        label: "Customer Is Active",
        description: "Whether this customer record is currently marked active.",
      },
      isPartner: {
        label: "Customer Is Partner",
        description: "Whether this customer is also a partner.",
      },
    },
  },
  // -- New in Tier 2 -----------------------------------------------------
  // Validation Criteria is the first one-to-many source registered. Adding
  // a Validation Criteria field to a report causes row-per-criterion
  // fan-out: a project with 5 criteria appears 5 times with its parent
  // columns repeated. The UI surfaces this in the field-group header.
  //
  // Pattern to add the next source (MAP Tasks, Gaps, Products, …):
  //   1. Import the table from @shared/schema.
  //   2. Append a registration here with `joinFromProjects` set.
  //   3. Use the `{ column, alias }` include shape for any column whose
  //      bare name would collide with an already-registered field key.
  //   4. Pick a non-overlapping accent in
  //      `archive/analytics-builders/client/src/components/analytics/report-builder-utils.ts` (archived)
  //      (six colors already pre-populated for the planned sources).
  {
    source: "Validation Criteria",
    tableKey: "success_criteria",
    table: successCriteria,
    oneToMany: true,
    joinFromProjects: { on: eq(successCriteria.projectId, projects.id) },
    include: [
      "id",
      "productName",
      "criterion",
      "expectedOutcome",
      "actionItem",
      { column: "status", alias: "criterionStatus" },
      "componentName",
      "valueMappingName",
      { column: "isActive", alias: "criterionIsActive" },
      "createdAt",
      "updatedAt",
    ],
    filterExamples: [
      { label: "Pending Criteria", field: "criterionStatus", operator: "equals", value: "pending" },
      { label: "Active Criteria Only", field: "criterionIsActive", operator: "equals", value: "true" },
    ],
    overrides: {
      id: {
        label: "Criterion ID",
        description: "Internal numeric identifier for the criterion record.",
      },
      productName: {
        label: "Criterion Product",
        description: "Product this criterion validates.",
      },
      criterion: {
        label: "Criterion",
        description: "Free-text description of the success criterion.",
      },
      expectedOutcome: {
        label: "Expected Outcome",
        description: "What success looks like for this criterion.",
      },
      actionItem: {
        label: "Action Item",
        description: "The action required to satisfy this criterion.",
      },
      criterionStatus: {
        label: "Criterion Status",
        description: "Per-criterion execution status (pending, in_progress, complete, blocked).",
      },
      componentName: {
        label: "Criterion Component",
        description: "Component the criterion is scoped to.",
      },
      valueMappingName: {
        label: "Value Mapping",
        description: "Value-mapping name attached to the criterion.",
      },
      criterionIsActive: {
        label: "Criterion Is Active",
        description: "Whether the criterion record is currently active.",
      },
      createdAt: {
        label: "Criterion Created",
        description: "When this criterion record was first added.",
      },
      updatedAt: {
        label: "Criterion Updated",
        description: "When this criterion record was last modified.",
      },
    },
  },
  // Owning team and subteam (docs/features/teams.md). One per project, so
  // no fan-out. Both tables share the "Teams" group in the UI; the names
  // are aliased because `name` would collide with other sources.
  {
    source: "Teams",
    tableKey: "teams",
    table: teams,
    joinFromProjects: { on: eq(teams.id, projects.teamId) },
    include: [{ column: "name", alias: "teamName" }],
    overrides: {
      teamName: {
        label: "Owning Team",
        description: "The team that owns the project. Empty when no team is set.",
      },
    },
  },
  {
    source: "Teams",
    tableKey: "subteams",
    table: subteams,
    joinFromProjects: { on: eq(subteams.id, projects.subteamId) },
    include: [{ column: "name", alias: "subteamName" }],
    overrides: {
      subteamName: {
        label: "Owning Subteam",
        description: "The subteam within the owning team. Empty when no subteam is set.",
      },
    },
  },
];

function inferFieldType(column: Column): ReportFieldType | null {
  switch (column.dataType) {
    case "string":
      return "string";
    case "number":
    case "bigint":
      return "number";
    case "boolean":
      return "boolean";
    case "date":
      return "date";
    case "array":
      return "array";
    default:
      return null;
  }
}

function humanizeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

const REPORT_FIELD_REGISTRY: Map<string, ReportFieldDefinition> = (() => {
  const registry = new Map<string, ReportFieldDefinition>();
  for (const registration of REPORT_TABLES) {
    const columns = getTableColumns(registration.table) as Record<string, Column>;
    for (const entry of registration.include) {
      const columnName = typeof entry === "string" ? entry : entry.column;
      const fieldKey = typeof entry === "string" ? entry : entry.alias;
      const column = columns[columnName];
      if (!column) {
        continue;
      }
      const override = registration.overrides?.[fieldKey];
      const type = override?.type ?? inferFieldType(column);
      if (!type) {
        continue;
      }
      const label = override?.label ?? humanizeKey(fieldKey);
      const definition: ReportFieldDefinition = {
        field: fieldKey,
        label,
        type,
        source: registration.source,
        description: override?.description,
        tableKey: registration.tableKey,
        columnName,
      };
      // First registration wins so callers can rely on a stable mapping when
      // two source tables happen to expose the same field name. New sources
      // that would collide should opt-in to `{ column, alias }` so the
      // collision becomes an explicit, prefixed key instead of a silent drop.
      if (!registry.has(fieldKey)) {
        registry.set(fieldKey, definition);
      }
    }
  }
  return registry;
})();

export function getReportFieldDefinitions(): ReportFieldDefinition[] {
  return Array.from(REPORT_FIELD_REGISTRY.values());
}

export function getReportFieldDefinition(
  field: string,
): ReportFieldDefinition | undefined {
  return REPORT_FIELD_REGISTRY.get(field);
}

export function isKnownReportField(field: string): boolean {
  return REPORT_FIELD_REGISTRY.has(field);
}

const REPORT_TABLES_BY_KEY: Map<string, ReportTableRegistration> = new Map(
  REPORT_TABLES.map((registration) => [registration.tableKey, registration]),
);

/**
 * Given a list of selected field keys and filter rows, return the
 * distinct set of source registrations they reference (de-duplicated,
 * in registry-declaration order). Sources that have a
 * `joinFromProjects` declaration become candidates for dynamic
 * leftJoin in the executor; sources without it (Projects itself, plus
 * Customers which is joined by a hardcoded path) are skipped.
 */
export function getDynamicJoinRegistrations(
  selectedFields: readonly string[],
  filters: readonly { field?: string }[] = [],
): ReportTableRegistration[] {
  const referencedTableKeys = new Set<string>();
  const visit = (fieldKey: unknown) => {
    if (typeof fieldKey !== "string" || fieldKey.length === 0) return;
    const def = REPORT_FIELD_REGISTRY.get(fieldKey);
    if (!def) return;
    referencedTableKeys.add(def.tableKey);
  };
  for (const f of selectedFields) visit(f);
  for (const f of filters) visit(f?.field);

  return REPORT_TABLES.filter(
    (reg) => reg.joinFromProjects != null && referencedTableKeys.has(reg.tableKey),
  );
}

/**
 * Per-source metadata for the Report Builder UI: the canonical source
 * label, whether it's one-to-many (so the UI can surface fan-out),
 * and the configured filter-example chips.
 *
 * Surfaces only sources that contributed at least one field to the
 * registry — useful to keep the API from advertising an empty source.
 */
export interface ReportSourceMetadata {
  source: string;
  tableKey: string;
  oneToMany: boolean;
  filterExamples: ReportFilterExample[];
}

export function getReportSourceMetadata(): ReportSourceMetadata[] {
  const seen = new Set<string>();
  for (const def of REPORT_FIELD_REGISTRY.values()) {
    seen.add(def.tableKey);
  }
  return REPORT_TABLES.filter((reg) => seen.has(reg.tableKey)).map((reg) => ({
    source: reg.source,
    tableKey: reg.tableKey,
    oneToMany: reg.oneToMany === true,
    filterExamples: reg.filterExamples ?? [],
  }));
}

/**
 * Returns the Drizzle Column for a registered report field, or undefined if
 * the field isn't in the registry. This lets callers (e.g. the preview-report
 * filter builder) resolve a registered field name to the actual joined column
 * without having to hardcode each table.
 */
export function getReportFieldColumn(field: string): Column | undefined {
  const definition = REPORT_FIELD_REGISTRY.get(field);
  if (!definition) return undefined;
  const registration = REPORT_TABLES_BY_KEY.get(definition.tableKey);
  if (!registration) return undefined;
  const columns = getTableColumns(registration.table) as Record<string, Column>;
  return columns[definition.columnName];
}

export type ReportFilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "greater_than"
  | "less_than"
  | "in"
  | "not_in";

const KNOWN_OPERATORS: ReadonlySet<string> = new Set<ReportFilterOperator>([
  "equals",
  "not_equals",
  "contains",
  "greater_than",
  "less_than",
  "in",
  "not_in",
]);

export type ReportFilterDecision =
  | { kind: "condition"; condition: SQL }
  | { kind: "skip"; reason: string };

function coerceScalarValue(
  value: unknown,
  type: ReportFieldType,
): unknown | undefined {
  if (value === null || value === undefined) return undefined;
  switch (type) {
    case "string":
      return typeof value === "string" ? value : String(value);
    case "number": {
      const raw = typeof value === "string" ? value.trim() : value;
      if (raw === "") return undefined;
      const n = typeof raw === "number" ? raw : Number(raw);
      return Number.isFinite(n) ? n : undefined;
    }
    case "boolean": {
      if (typeof value === "boolean") return value;
      const lower = String(value).trim().toLowerCase();
      if (lower === "true" || lower === "1" || lower === "yes") return true;
      if (lower === "false" || lower === "0" || lower === "no") return false;
      return undefined;
    }
    case "date": {
      if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? undefined : value;
      }
      const raw = typeof value === "string" ? value.trim() : value;
      if (raw === "") return undefined;
      const d = new Date(String(raw));
      return Number.isNaN(d.getTime()) ? undefined : d;
    }
    case "array":
      // Filtering an array column with scalar/list operators is ambiguous —
      // callers should reject this at the operator-compatibility check
      // before attempting to coerce.
      return undefined;
  }
}

/**
 * Coerces a raw `in` / `not_in` filter value into a typed list.
 *
 * The Report Builder sends a real array on the wire, and migration
 * `migrations/026_normalize_custom_report_list_filters.sql` has rewritten
 * every previously stored comma-joined string in `custom_reports.filters`
 * into the same shape. Callers (currently only `buildReportFilterCondition`)
 * are expected to reject any non-array `rawValue` before getting here, so
 * this helper only handles arrays. Each entry is run through
 * `coerceScalarValue` so the returned list is typed to the field; the
 * helper returns `undefined` if no entry survives coercion.
 */
function coerceListValue(
  value: unknown[],
  type: ReportFieldType,
): unknown[] | undefined {
  const coerced: unknown[] = [];
  for (const part of value) {
    const v = coerceScalarValue(part, type);
    if (v !== undefined) coerced.push(v);
  }
  return coerced.length > 0 ? coerced : undefined;
}

/**
 * Build a Drizzle WHERE condition for a single Report Builder filter row.
 *
 * The Report Builder UI offers `equals`, `contains`, `not_equals`,
 * `greater_than`, `less_than`, `in`, and `not_in` against any registered
 * field. This helper resolves the field through the registry, coerces the
 * raw string value coming from the UI to the field's type, enforces
 * operator/type compatibility (e.g. `contains` only on strings,
 * `greater_than` only on numbers/dates), and returns either the resulting
 * condition or a skip decision with a human-readable reason that callers
 * can surface in logs.
 */
export function buildReportFilterCondition(
  field: string,
  operator: string,
  rawValue: unknown,
): ReportFilterDecision {
  if (typeof field !== "string" || field.length === 0) {
    return { kind: "skip", reason: "filter has no field name" };
  }
  const definition = REPORT_FIELD_REGISTRY.get(field);
  if (!definition) {
    return {
      kind: "skip",
      reason: `unknown filter field "${field}" — register it in server/lib/report-fields.ts`,
    };
  }
  const column = getReportFieldColumn(field);
  if (!column) {
    return {
      kind: "skip",
      reason: `no column resolved for registered field "${field}"`,
    };
  }
  const op = String(operator || "").toLowerCase();
  if (!KNOWN_OPERATORS.has(op)) {
    return { kind: "skip", reason: `unknown filter operator "${operator}"` };
  }

  const requireScalar = (): { kind: "value"; value: unknown } | ReportFilterDecision => {
    const coerced = coerceScalarValue(rawValue, definition.type);
    if (coerced === undefined) {
      return {
        kind: "skip",
        reason: `cannot coerce filter value ${JSON.stringify(rawValue)} for "${field}" (${definition.type})`,
      };
    }
    return { kind: "value", value: coerced };
  };

  switch (op as ReportFilterOperator) {
    case "equals": {
      if (definition.type === "array") {
        return {
          kind: "skip",
          reason: `'equals' is not supported on array field "${field}"`,
        };
      }
      const result = requireScalar();
      if (result.kind !== "value") return result;
      return { kind: "condition", condition: eq(column, result.value) };
    }
    case "not_equals": {
      if (definition.type === "array") {
        return {
          kind: "skip",
          reason: `'not_equals' is not supported on array field "${field}"`,
        };
      }
      const result = requireScalar();
      if (result.kind !== "value") return result;
      return { kind: "condition", condition: ne(column, result.value) };
    }
    case "contains": {
      if (definition.type !== "string") {
        return {
          kind: "skip",
          reason: `'contains' is only supported on string fields (got ${definition.type} for "${field}")`,
        };
      }
      const result = requireScalar();
      if (result.kind !== "value") return result;
      return {
        kind: "condition",
        condition: ilike(column, `%${String(result.value)}%`),
      };
    }
    case "greater_than": {
      if (definition.type !== "number" && definition.type !== "date") {
        return {
          kind: "skip",
          reason: `'greater_than' is only supported on number/date fields (got ${definition.type} for "${field}")`,
        };
      }
      const result = requireScalar();
      if (result.kind !== "value") return result;
      return { kind: "condition", condition: gt(column, result.value) };
    }
    case "less_than": {
      if (definition.type !== "number" && definition.type !== "date") {
        return {
          kind: "skip",
          reason: `'less_than' is only supported on number/date fields (got ${definition.type} for "${field}")`,
        };
      }
      const result = requireScalar();
      if (result.kind !== "value") return result;
      return { kind: "condition", condition: lt(column, result.value) };
    }
    case "in": {
      if (definition.type === "array") {
        return {
          kind: "skip",
          reason: `'in' is not supported on array field "${field}"`,
        };
      }
      if (!Array.isArray(rawValue)) {
        const shape =
          typeof rawValue === "string"
            ? "string (the legacy comma-joined shape is no longer accepted)"
            : typeof rawValue;
        return {
          kind: "skip",
          reason: `'in' filter on "${field}" requires an array of values, got ${shape}`,
        };
      }
      const list = coerceListValue(rawValue, definition.type);
      if (!list) {
        return {
          kind: "skip",
          reason: `no valid values for 'in' filter on "${field}" — pass an array of values`,
        };
      }
      return { kind: "condition", condition: inArray(column, list) };
    }
    case "not_in": {
      if (definition.type === "array") {
        return {
          kind: "skip",
          reason: `'not_in' is not supported on array field "${field}"`,
        };
      }
      if (!Array.isArray(rawValue)) {
        const shape =
          typeof rawValue === "string"
            ? "string (the legacy comma-joined shape is no longer accepted)"
            : typeof rawValue;
        return {
          kind: "skip",
          reason: `'not_in' filter on "${field}" requires an array of values, got ${shape}`,
        };
      }
      const list = coerceListValue(rawValue, definition.type);
      if (!list) {
        return {
          kind: "skip",
          reason: `no valid values for 'not_in' filter on "${field}" — pass an array of values`,
        };
      }
      return { kind: "condition", condition: notInArray(column, list) };
    }
  }
}

export interface ProjectReportRowOptions {
  /**
   * Called once per selected field that the registry doesn't recognise. Use
   * this to surface drift between the picker and the executor instead of
   * silently emitting `null`.
   */
  onUnknownField?: (field: string) => void;
  /**
   * Optional virtual field handlers that don't map directly to a single
   * registered column (e.g. the legacy `primaryEngineer` field which joins
   * first/last name on the users row).
   */
  virtualFields?: Record<string, (row: Record<string, any>) => unknown>;
}

export function projectReportRow(
  row: Record<string, any>,
  selectedFields: string[],
  options: ProjectReportRowOptions = {},
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of selectedFields) {
    const virtual = options.virtualFields?.[field];
    if (virtual) {
      result[field] = virtual(row);
      continue;
    }
    const definition = REPORT_FIELD_REGISTRY.get(field);
    if (!definition) {
      options.onUnknownField?.(field);
      result[field] = null;
      continue;
    }
    const sourceRow = row?.[definition.tableKey];
    if (sourceRow == null) {
      result[field] = null;
      continue;
    }
    const value = sourceRow[definition.columnName];
    result[field] = value === undefined ? null : value;
  }
  return result;
}

export function buildAvailableReportFields(): AvailableReportFields {
  const result: AvailableReportFields = {
    string: [],
    number: [],
    date: [],
    boolean: [],
    array: [],
  };

  for (const definition of REPORT_FIELD_REGISTRY.values()) {
    result[definition.type].push({
      field: definition.field,
      label: definition.label,
      type: definition.type,
      source: definition.source,
      description: definition.description,
    });
  }

  return result;
}

function formatExampleValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    const preview = value.slice(0, 3).map((v) => String(v));
    const suffix = value.length > 3 ? `, +${value.length - 3} more` : "";
    return preview.join(", ") + suffix;
  }
  if (value instanceof Date) {
    return value.toISOString().split("T")[0];
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }
  const str = String(value);
  if (str.length === 0) return null;
  if (str.length > 80) return str.slice(0, 77) + "...";
  return str;
}

interface DbLike {
  select: (...args: any[]) => any;
}

async function fetchExamplesForTable(
  registration: ReportTableRegistration,
  db: DbLike,
): Promise<Map<string, string>> {
  const examples = new Map<string, string>();
  const columns = getTableColumns(registration.table) as Record<string, Column>;

  // `selectMap` is keyed by the public field key (alias when one is
  // declared, raw column name otherwise) so the returned examples map
  // lines up with the registry field keys downstream.
  const selectMap: Record<string, Column> = {};
  for (const entry of registration.include) {
    const columnName = typeof entry === "string" ? entry : entry.column;
    const fieldKey = typeof entry === "string" ? entry : entry.alias;
    if (columns[columnName]) {
      selectMap[fieldKey] = columns[columnName];
    }
  }
  if (Object.keys(selectMap).length === 0) return examples;

  const orderColumn =
    columns.updatedAt ?? columns.createdAt ?? columns.lastRiskAnalysis ?? columns.id;

  let query: any = db.select(selectMap).from(registration.table as any);
  if (orderColumn) {
    query = query.orderBy(desc(orderColumn));
  }
  query = query.limit(50);

  let rows: Array<Record<string, unknown>> = [];
  try {
    rows = await query;
  } catch (error) {
    console.warn(
      `Failed to fetch example values for ${registration.source}:`,
      error instanceof Error ? error.message : error,
    );
    return examples;
  }

  for (const fieldName of Object.keys(selectMap)) {
    for (const row of rows) {
      const formatted = formatExampleValue(row[fieldName]);
      if (formatted !== null) {
        examples.set(fieldName, formatted);
        break;
      }
    }
  }

  // For any columns that didn't yield an example from the recent sample,
  // do a focused fallback query that pulls the most recent non-null value.
  for (const fieldName of Object.keys(selectMap)) {
    if (examples.has(fieldName)) continue;
    const column = selectMap[fieldName];
    try {
      let fallback: any = db
        .select({ value: column })
        .from(registration.table as any)
        .where(isNotNull(column));
      if (orderColumn) {
        fallback = fallback.orderBy(desc(orderColumn));
      }
      fallback = fallback.limit(1);
      const result = (await fallback) as Array<{ value: unknown }>;
      if (result.length > 0) {
        const formatted = formatExampleValue(result[0].value);
        if (formatted !== null) {
          examples.set(fieldName, formatted);
        }
      }
    } catch (error) {
      console.warn(
        `Failed to fetch fallback example for ${registration.source}.${fieldName}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return examples;
}

export async function buildAvailableReportFieldsWithExamples(
  db: DbLike,
): Promise<AvailableReportFields> {
  const fields = buildAvailableReportFields();

  const examplesBySource = new Map<string, Map<string, string>>();
  await Promise.all(
    REPORT_TABLES.map(async (registration) => {
      const examples = await fetchExamplesForTable(registration, db);
      examplesBySource.set(registration.source, examples);
    }),
  );

  for (const typeKey of Object.keys(fields) as Array<keyof AvailableReportFields>) {
    fields[typeKey] = fields[typeKey].map((field) => {
      const example = examplesBySource.get(field.source)?.get(field.field) ?? null;
      return { ...field, example };
    });
  }

  return fields;
}

export interface ReportFilter {
  field: string;
  operator: string;
  value: unknown;
}

export interface BuildReportFilterConditionsOptions {
  /**
   * Called once per filter that the helper decides to skip — unknown field,
   * unknown operator, incompatible operator/type, uncoercible value, etc.
   * The `reason` text comes from `buildReportFilterCondition` so callers get
   * one canonical explanation regardless of which branch tripped.
   */
  onSkip?: (filter: ReportFilter, reason: string) => void;
  /**
   * Called when an individual filter throws while being translated to SQL.
   * The helper swallows the error so one bad filter can't break the whole
   * query — callers should typically just log via this hook.
   */
  onError?: (filter: ReportFilter, error: unknown) => void;
}

function isReportFilter(value: unknown): value is ReportFilter {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { field?: unknown; operator?: unknown };
  return (
    typeof candidate.field === "string" &&
    candidate.field.length > 0 &&
    typeof candidate.operator === "string"
  );
}

/**
 * Standard warning text used when a saved or previewed report references a
 * filter the executor decides to skip. Centralised so the preview and
 * executor paths emit the same wording (only the leading `context` differs).
 */
export function formatFilterSkipWarning(
  context: string,
  filter: ReportFilter,
  reason: string,
): string {
  return `[reports] ${context}: skipping filter on "${filter.field}" (${filter.operator}) — ${reason}.`;
}

/**
 * Translate a list of saved/preview report filters into Drizzle SQL conditions
 * by delegating each entry to `buildReportFilterCondition`. Both
 * `previewReport` and `executeCustomReport` share this so a saved report runs
 * against the same `where` clause that its preview did, and both paths
 * automatically inherit any new operators added to the singular helper.
 *
 * Filters come from JSONB columns and untyped request bodies, so the input is
 * accepted as `unknown` and validated per-entry. Malformed entries are
 * silently skipped rather than failing the whole query.
 */
export function buildReportFilterConditions(
  filters: unknown,
  options: BuildReportFilterConditionsOptions = {},
): SQL[] {
  const conditions: SQL[] = [];
  if (!Array.isArray(filters) || filters.length === 0) return conditions;

  for (const rawFilter of filters) {
    if (!isReportFilter(rawFilter)) continue;
    const filter = rawFilter;

    try {
      const decision = buildReportFilterCondition(
        filter.field,
        filter.operator,
        filter.value,
      );
      if (decision.kind === "condition") {
        conditions.push(decision.condition);
      } else {
        options.onSkip?.(filter, decision.reason);
      }
    } catch (error) {
      options.onError?.(filter, error);
    }
  }

  return conditions;
}
