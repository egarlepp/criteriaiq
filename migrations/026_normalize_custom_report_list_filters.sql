-- Migration: Normalize legacy `in` / `not_in` filter values on custom_reports
-- Date: 2026-04-24
-- Purpose:
--   Reports saved before task #245 stored their `in` / `not_in` filter values
--   as a single comma-joined string in the `custom_reports.filters` JSONB
--   column. The Report Builder now sends — and the server's coerceListValue
--   helper expects — a real JSON string array. Until each old report is opened
--   and re-saved it keeps the legacy string shape in the database.
--
--   This migration walks every custom_reports row and rewrites any filters
--   entry whose operator is `in` or `not_in` and whose `value` is a JSON
--   string into a real JSON array of trimmed, non-empty parts (the same
--   transformation `coerceListValue` performs at read time). Entries with
--   any other shape — already-array `in`/`not_in` values, scalar operators,
--   non-string values — are left untouched.
--
--   The update is idempotent: the EXISTS guard means rows with no
--   string-shaped list filters are never touched, and the per-element CASE
--   is a no-op for entries whose value is not a JSON string, so re-running
--   the migration produces no further changes.

UPDATE custom_reports
SET filters = (
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'operator' IN ('in', 'not_in')
       AND jsonb_typeof(elem->'value') = 'string'
      THEN jsonb_set(
        elem,
        '{value}',
        COALESCE(
          (
            SELECT jsonb_agg(to_jsonb(trimmed))
            FROM (
              SELECT trim(part) AS trimmed
              FROM unnest(string_to_array(elem->>'value', ',')) AS part
            ) parts
            WHERE trimmed <> ''
          ),
          '[]'::jsonb
        )
      )
      ELSE elem
    END
  )
  FROM jsonb_array_elements(filters) AS elem
)
WHERE jsonb_typeof(filters) = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(filters) AS e
    WHERE e->>'operator' IN ('in', 'not_in')
      AND jsonb_typeof(e->'value') = 'string'
  );
