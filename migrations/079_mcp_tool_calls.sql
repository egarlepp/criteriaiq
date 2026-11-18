-- Migration 079: MCP server activity log.
--
-- One row per call to the read-only MCP server at /api/mcp (Admin ›
-- Integrations › MCP Server). Keeps the tool name, a hash of the
-- arguments, status, latency and error text; never the arguments or the
-- result. Rows older than 30 days are pruned daily by
-- server/services/mcp-activity-cleanup.ts.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: CREATE ... IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS mcp_tool_calls (
  id          SERIAL PRIMARY KEY,
  api_key_id  INTEGER REFERENCES api_keys(id) ON DELETE SET NULL,
  tool        VARCHAR(128) NOT NULL,
  args_hash   VARCHAR(64),
  status      VARCHAR(16) NOT NULL,
  latency_ms  INTEGER,
  error       TEXT,
  called_at   TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_tool_calls_called_at ON mcp_tool_calls (called_at);
