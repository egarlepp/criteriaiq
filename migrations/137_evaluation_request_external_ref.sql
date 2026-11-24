-- Migration 137: evaluation requests sent by other apps.
--
-- POST /api/v1/evaluation-requests lets DemoIQ ask for a POC on behalf of
-- the SE who ran a demo. external_ref is the caller's own id for the request
-- (e.g. "demoiq:demo:<uuid>"); it is unique, so a retry returns the request
-- already made instead of a second one. Null for requests made in the app.
-- See docs/features/evaluation-requests.md.

ALTER TABLE evaluation_requests ADD COLUMN IF NOT EXISTS external_ref varchar(200);
CREATE UNIQUE INDEX IF NOT EXISTS evaluation_requests_external_ref_unique ON evaluation_requests (external_ref);
