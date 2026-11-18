-- Migration 103: working-day MAP scheduling.
--
-- projects.schedule_by_task_owner: true (default) plans each MAP task's
-- dates on its owner's holiday calendar; false uses the project owner's
-- (primary engineer's) calendar for every date. Mirrored on
-- archived_projects so archive and restore keep the choice.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS schedule_by_task_owner BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE archived_projects
  ADD COLUMN IF NOT EXISTS schedule_by_task_owner BOOLEAN NOT NULL DEFAULT TRUE;
