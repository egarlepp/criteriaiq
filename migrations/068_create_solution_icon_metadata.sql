-- 068: solution_icon_metadata — admin-editable display names for icons
-- uploaded via Configuration → System Settings → Media → Solution Icons.
-- Icon bytes live in the storage provider (system/solution-icons/<filename>);
-- this table is the source of truth for the user-facing label that the
-- Validation Criteria → Solutions dropdown surfaces. Idempotent.

CREATE TABLE IF NOT EXISTS solution_icon_metadata (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL UNIQUE,
  display_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
