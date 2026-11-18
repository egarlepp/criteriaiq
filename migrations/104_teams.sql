-- Migration 104: teams (Admin › Team & People › Teams).
--
-- Modeled on ImpactIQ's Teams, but used only to organize and filter people:
-- a team never changes what anyone can see or do, and each person keeps one
-- role. A person can be on several teams, with at most one marked default.
-- Subteams nest up to four levels inside a team; their members are leaders
-- or members. See docs/features/teams.md.
--
-- The new Teams page has its own permission key (config.teams). Everyone
-- starts with the same value they have on Users (config.user-management),
-- so nobody loses or gains access to the people pages.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS / NOT EXISTS guards.

CREATE TABLE IF NOT EXISTS teams (
  id serial PRIMARY KEY,
  name varchar(120) NOT NULL,
  slug varchar(120) NOT NULL,
  description text,
  icon varchar(60),
  manager_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT teams_slug_unique UNIQUE (slug)
);

CREATE UNIQUE INDEX IF NOT EXISTS teams_name_lower_unique ON teams (LOWER(name));

CREATE TABLE IF NOT EXISTS team_members (
  team_id integer NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT team_members_team_id_user_id_pk PRIMARY KEY (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS team_members_one_default ON team_members (user_id) WHERE is_default;

CREATE TABLE IF NOT EXISTS subteams (
  id serial PRIMARY KEY,
  team_id integer NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  parent_subteam_id integer REFERENCES subteams(id) ON DELETE SET NULL,
  name varchar(120) NOT NULL,
  kind varchar(20),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subteams_team ON subteams (team_id);

CREATE TABLE IF NOT EXISTS subteam_members (
  subteam_id integer NOT NULL REFERENCES subteams(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role varchar(10) NOT NULL DEFAULT 'member',
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT subteam_members_subteam_id_user_id_pk PRIMARY KEY (subteam_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_subteam_members_user ON subteam_members (user_id);

-- config.teams starts with each role's and person's Users value.
INSERT INTO role_permissions (role_id, section, permission)
SELECT DISTINCT ON (rp.role_id) rp.role_id, 'config.teams', rp.permission
FROM role_permissions rp
WHERE rp.section = 'config.user-management'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions x WHERE x.role_id = rp.role_id AND x.section = 'config.teams'
  )
ORDER BY rp.role_id, rp.id DESC;

INSERT INTO user_permissions (user_id, section, permission)
SELECT DISTINCT ON (up.user_id) up.user_id, 'config.teams', up.permission
FROM user_permissions up
WHERE up.section = 'config.user-management'
  AND NOT EXISTS (
    SELECT 1 FROM user_permissions x WHERE x.user_id = up.user_id AND x.section = 'config.teams'
  )
ORDER BY up.user_id, up.id DESC;
