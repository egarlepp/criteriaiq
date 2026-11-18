-- Task #82: Add solution_ids array column to assumptions table
-- Supports multi-solution alignment (null = all solutions, {1,2} = specific solutions)
-- The legacy solution_id FK column is retained for backward compatibility
ALTER TABLE assumptions ADD COLUMN IF NOT EXISTS solution_ids integer[];

-- Backfill existing records that have solution_id set into the new array column
UPDATE assumptions
SET solution_ids = ARRAY[solution_id]
WHERE solution_id IS NOT NULL
  AND (solution_ids IS NULL OR array_length(solution_ids, 1) IS NULL);
