# MCP Server

CriteriaIQ includes a read-only [Model Context Protocol](https://modelcontextprotocol.io)
server, modeled on ImpactIQ's, so AI clients (Claude Desktop, Claude
Code, n8n agents) can look up validation data. It is configured at
**Admin → Integrations → MCP Server** and listed on the Integrations
Overview.

## What it exposes

Five tools, all read-only (`readOnlyHint: true`), all querying
`server/storage/mcp.ts`:

| Tool | Returns |
|---|---|
| `list_projects` | Projects, newest first. Filters: `search` (project, account or solution name), `status`, `customerName`, `limit` (≤200). |
| `get_project` | One project's summary plus business problem, customer objective, solution description, opportunity, tags, and active success criteria counted by status. |
| `list_success_criteria` | A project's active success criteria in line order, optional `status`, `limit` (≤500). |
| `list_accounts` | Accounts by name; active only unless `includeInactive`. No contact lists, logos or email domains. |
| `project_status_summary` | Project counts by status, customer status and risk. |

Nothing writes. Logos, contact lists, approved email domains and
customer feedback text are never returned.

## Endpoint and auth

- `POST /api/mcp`, Streamable HTTP transport in stateless mode with JSON
  responses (`server/routes/mcp-routes.ts`). `GET` and `DELETE` return
  405: there are no sessions or server-initiated streams.
- `Authorization: Bearer ciq_…` with an API key carrying the
  **`mcp:read`** scope. `apiKeyAuth` verifies the key (bcrypt, expiry,
  active); the route then requires `mcp:read`. Keys with only the
  `admin` scope (the n8n REST keys) are refused, so MCP access is opted
  into per key.
- Keys are created and revoked by admins on the MCP Server page (they
  use `POST /api/admin/api-keys` with `scopes: ["mcp:read"]`). The
  token is shown once.
- Because keys are admin-issued and tenant-wide, an MCP client sees the
  org-wide read view of the five tools above. Treat a key like an admin
  credential for that data.

## Gates, in order

1. **On/off switch**, `system_settings` key `mcp_settings`. **Default
   off** (ImpactIQ defaults on); every request returns 503
   `mcp_disabled_by_admin` until an admin turns it on.
2. **Key and scope**: 401 `missing_bearer_token`, 403 `wrong_scope`.
3. **Rate limits** (`server/lib/mcp-rate-limit.ts`), in memory, on top
   of the global API limit:

| Env var | Default | Limit |
|---|---|---|
| `MCP_RATE_PER_MIN` | `60` | calls per key per minute |
| `MCP_RATE_PER_HOUR` | `1000` | calls per key per hour |
| `MCP_RATE_TENANT_DAILY` | `5000` | calls across all keys per day |

A throttled call gets 429 with `Retry-After`.

## Activity log

Every `tools/call` writes a row to `mcp_tool_calls` (migration
`079_mcp_tool_calls.sql`): tool, a SHA-256 prefix of the request body,
status (`ok`, `error`, `throttled`), latency, error text and the key.
Arguments and results are not stored. Rows older than 30 days are
pruned daily by `server/services/mcp-activity-cleanup.ts`. The MCP
Server page shows today's counts, average latency and the latest 500
calls with a status filter and search (`GET /api/admin/mcp/activity`).

## Connecting a client

The page's **Connection details** card gives copyable snippets. For
Claude Code:

```
claude mcp add --transport http criteriaiq https://<host>/api/mcp --header "Authorization: Bearer ciq_…"
```

Custom connectors on claude.ai have no field for a Bearer key, so use
Claude Desktop, Claude Code or n8n's MCP Client Tool.

## Admin endpoints

Session-only (API keys, even admin-scoped, are refused):

- `GET /api/admin/mcp/config`: `{ enabled, path, scope, activeKeyCount, tools }`
- `PUT /api/admin/mcp/config`: `{ enabled }`
- `GET /api/admin/mcp/activity?status=&limit=`
