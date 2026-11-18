-- 069: persist the "Use CriteriaIQ logo" toggle for Flight Deck header/footer
-- banners. Defaults to TRUE for every existing row so rules that previously
-- relied on the empty-URL → CriteriaIQ-logo render-time fallback keep doing
-- the same thing without the admin re-saving them. Idempotent.

ALTER TABLE flight_deck_configs
  ADD COLUMN IF NOT EXISTS use_default_header_image BOOLEAN DEFAULT TRUE;

ALTER TABLE flight_deck_configs
  ADD COLUMN IF NOT EXISTS use_default_footer_image BOOLEAN DEFAULT TRUE;
