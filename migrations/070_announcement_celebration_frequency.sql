-- Adds per-announcement celebration frequency controls.
-- celebration_on_click  : 'first' (fire only on first click) | 'every' (fire on every open). Default 'first'.
-- celebration_on_login  : 'first' (fire once per user/browser) | 'every' (fire on every fresh page load). Default 'first'.
ALTER TABLE system_announcements
  ADD COLUMN IF NOT EXISTS celebration_on_click VARCHAR DEFAULT 'first',
  ADD COLUMN IF NOT EXISTS celebration_on_login VARCHAR DEFAULT 'first';
