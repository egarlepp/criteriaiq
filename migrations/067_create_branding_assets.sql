-- Migration 067: Branding Assets — admin-customizable logos + backgrounds
--
-- Backs the new Configuration → System Settings → Media page. One row per
-- (slot, mode) holds the uploaded asset's cloud-storage object key, the
-- presigned URL we last cached, MIME, size, and an optional opacity (0–100)
-- used only by background-type slots (login_bg, sidebar_logo_watermark,
-- page_bg). NULL opacity = "use default" or "logo slot" — the application
-- layer ignores opacity for logo slots.
--
-- Slots: login_logo | login_bg | sidebar_logo_expanded |
--        sidebar_logo_collapsed | sidebar_logo_watermark | page_bg
-- Modes: light | dark
--
-- The tagline override (login screen "Data Security that Starts with Identity™")
-- is stored separately in system_settings under key 'branding.login_tagline'
-- — no schema change needed for that.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS branding_assets (
  id           SERIAL PRIMARY KEY,
  slot         VARCHAR(64)  NOT NULL,
  mode         VARCHAR(8)   NOT NULL,
  storage_key  TEXT         NOT NULL,
  url          TEXT         NOT NULL,
  mime         VARCHAR(64)  NOT NULL,
  size_bytes   INTEGER      NOT NULL,
  opacity      SMALLINT,
  uploaded_by  VARCHAR REFERENCES users(id),
  uploaded_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS branding_assets_slot_mode_unique
  ON branding_assets (slot, mode);
