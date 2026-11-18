export type ReportFilterFieldType =
  | "string"
  | "number"
  | "date"
  | "boolean"
  | "array"
  | string;

export type ReportFilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "greater_than"
  | "less_than"
  | "in"
  | "not_in";

export const REPORT_FILTER_OPERATORS: ReportFilterOperator[] = [
  "equals",
  "not_equals",
  "contains",
  "greater_than",
  "less_than",
  "in",
  "not_in",
];

export const REPORT_FILTER_OPERATOR_LABELS: Record<ReportFilterOperator, string> = {
  equals: "Equals",
  not_equals: "Not Equals",
  contains: "Contains",
  greater_than: "Greater than",
  less_than: "Less than",
  in: "In List",
  not_in: "Not In List",
};

export type ReportFilterValueInputKind =
  | "text"
  | "number"
  | "date"
  | "boolean"
  | "list";

/**
 * Returns the operators that the server's `buildReportFilterCondition`
 * will accept for the given field type. When the type is unknown we fall
 * back to all operators so we don't accidentally hide options for fields
 * we haven't modelled yet.
 */
export function getCompatibleOperators(
  fieldType: ReportFilterFieldType | undefined,
): ReportFilterOperator[] {
  if (!fieldType) return [...REPORT_FILTER_OPERATORS];
  switch (fieldType) {
    case "string":
      return ["equals", "not_equals", "contains", "in", "not_in"];
    case "number":
    case "date":
      return ["equals", "not_equals", "greater_than", "less_than", "in", "not_in"];
    case "boolean":
      return ["equals", "not_equals"];
    case "array":
      return [];
    default:
      return [...REPORT_FILTER_OPERATORS];
  }
}

export function isOperatorCompatible(
  fieldType: ReportFilterFieldType | undefined,
  operator: string,
): boolean {
  if (!operator) return true;
  if (!fieldType) return true;
  const compatible = getCompatibleOperators(fieldType);
  return compatible.includes(operator as ReportFilterOperator);
}

/**
 * Picks a sensible default operator for a field type, used when the
 * previously chosen operator stops being compatible after a field swap.
 */
export function defaultOperatorForType(
  fieldType: ReportFilterFieldType | undefined,
): ReportFilterOperator {
  const compatible = getCompatibleOperators(fieldType);
  return compatible[0] ?? "equals";
}

/**
 * Decides which value control to render for a filter row. List operators
 * (`in`/`not_in`) always render as text so the user can type a comma-
 * separated list; everything else follows the field's underlying type.
 */
export function getValueInputKind(
  fieldType: ReportFilterFieldType | undefined,
  operator: string,
): ReportFilterValueInputKind {
  if (operator === "in" || operator === "not_in") {
    return "list";
  }
  switch (fieldType) {
    case "number":
      return "number";
    case "date":
      return "date";
    case "boolean":
      return "boolean";
    default:
      return "text";
  }
}

export function describeIncompatibility(
  fieldType: ReportFilterFieldType | undefined,
  operator: string,
): string | null {
  if (!operator || !fieldType) return null;
  if (isOperatorCompatible(fieldType, operator)) return null;
  if (fieldType === "array") {
    return `Array fields don't support filter operators yet.`;
  }
  return `"${REPORT_FILTER_OPERATOR_LABELS[operator as ReportFilterOperator] ?? operator}" can't be used on ${fieldType} fields.`;
}
