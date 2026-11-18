export type FilterChipsFieldType = "string" | "number" | "date" | string;

/**
 * Normalises whatever the Report Builder is currently storing in a
 * `filter.value` cell into the chip list the UI renders.
 *
 * The Report Builder now sends a real `string[]` to the server for
 * `in` / `not_in` filters, but saved reports written before that change
 * still hold a comma-separated string in the JSONB column. To keep
 * those loading cleanly we accept both shapes here:
 *   - arrays are trimmed and emptied of blank entries
 *   - strings are split on commas (the legacy format)
 *   - anything else falls back to an empty list
 *
 * Empty fragments are dropped because the server's `coerceListValue`
 * would discard them anyway.
 */
export function parseChipsFromValue(
  value: string | string[] | null | undefined,
): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value
      .map((part) => (typeof part === "string" ? part.trim() : String(part).trim()))
      .filter((part) => part.length > 0);
  }
  if (typeof value !== "string") return [];
  if (value.length === 0) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export type FilterChipValidationResult =
  | { ok: true; value: string }
  | { ok: false; reason: string };

/**
 * Validates a single chip against the field's underlying type before it
 * is added to the chip list. Mirrors `coerceScalarValue` on the server
 * so we reject bad values up front instead of letting them reach the
 * server and silently get filtered out.
 */
export function validateChip(
  raw: string,
  fieldType: FilterChipsFieldType | undefined,
): FilterChipValidationResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "Value can't be empty" };
  }
  if (fieldType === "number") {
    const n = Number(trimmed);
    if (!Number.isFinite(n)) {
      return { ok: false, reason: `"${trimmed}" isn't a valid number` };
    }
    return { ok: true, value: trimmed };
  }
  if (fieldType === "date") {
    // Strict YYYY-MM-DD. We deliberately don't fall back to `new Date(...)`
    // because it accepts ambiguous inputs ("3/2/26"), silently rolls over
    // bad days ("2026-02-31" -> March 3), and is locale-sensitive. The
    // server uses `new Date(String(raw))` and would also drift on those
    // — catching them here keeps the bad value out of the saved filter.
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (!match) {
      return {
        ok: false,
        reason: `"${trimmed}" isn't a valid date (use YYYY-MM-DD)`,
      };
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return {
        ok: false,
        reason: `"${trimmed}" isn't a valid date`,
      };
    }
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (
      dt.getUTCFullYear() !== year ||
      dt.getUTCMonth() !== month - 1 ||
      dt.getUTCDate() !== day
    ) {
      return {
        ok: false,
        reason: `"${trimmed}" isn't a real calendar date`,
      };
    }
    return { ok: true, value: trimmed };
  }
  return { ok: true, value: trimmed };
}
