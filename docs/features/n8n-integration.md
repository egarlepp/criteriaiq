# n8n ↔ CriteriaIQ Bidirectional Integration

> **Date Posted:** 2026-05-12  
> **Last Updated:** 2026-10-20  
> **Migration:** 056 (`api_keys` + `n8n_config` tables), 080 (`webhooks.subscribed_events`), 081 (drops the old workflow-filter columns from `n8n_config`)

---

## Overview

CriteriaIQ integrates bidirectionally with [n8n](https://n8n.io), a self-hosted workflow automation platform. n8n acts as an external orchestration hub — capable of reading and writing all aspects of CriteriaIQ, firing CriteriaIQ's native automation triggers, and receiving real-time events from CriteriaIQ via webhooks.

CriteriaIQ's native automation engine (email rules, notifications, webhooks) continues to run independently and additively alongside n8n. Both systems can respond to the same events without conflict.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CriteriaIQ                               │
│                                                                 │
│  User action / API call                                         │
│       │                                                         │
│       ▼                                                         │
│  Automation Engine ──► Native rules fire (email, notif, etc.)  │
│       │                                                         │
│       ├──► Webhook action ──────────────────────────────────►  │─┐
│       │         (existing outbound webhook system)              │ │ POST to n8n
│       │                                                         │ │ Webhook node
│  REST API                                                       │ │
│       ▲                                                         │◄┘
│       │                                                         │
│  POST /api/n8n/trigger  ◄── n8n HTTP Request ────── n8n        │
│  (inbound trigger bridge)   (Bearer token auth)     workflow   │
│                                                                 │
│  GET/POST/PATCH /api/*  ◄── n8n HTTP Request ────── n8n        │
│  (standard REST — accessible via Bearer API key)    workflow   │
└─────────────────────────────────────────────────────────────────┘
```

**Key coexistence rule:** Every trigger evaluation — whether initiated natively or by n8n — passes through the same `EmailAutomationEngine.evaluateTrigger()` path. Native email rules, notifications, and webhooks still fire. n8n-initiated events are fully additive, never replacing built-in automation.

---

## Configuration in CriteriaIQ

Navigate to **Admin → Integrations → n8n**. The page has three cards, one for each thing n8n needs to act as the automation engine:

1. **Connection**: where n8n lives.
2. **API keys**: how n8n calls CriteriaIQ.
3. **Event subscriptions**: which CriteriaIQ events are pushed to n8n.

The workflow browser, workflow sync filters and stats strip that used to sit on this page were removed (2026-10-20): they only displayed n8n's own workflow list and did not drive any automation.

### 1. n8n Connection

Stores how CriteriaIQ reaches n8n. Optional: the host URL pre-fills the webhook URL when you add an event subscription, and the n8n API key lets CriteriaIQ test the connection and list active webhook workflows (`GET /api/admin/n8n/workflows`, used by the AI Providers webhook URL picker).

| Field | Description |
|---|---|
| **n8n Host URL** | Base URL of your n8n instance, e.g. `http://n8n:5678` |
| **n8n API Key** | API key from n8n **Settings → API Keys** (encrypted with AES-256-GCM at rest) |
| **Enabled** | Toggle to enable/disable the connection |

Use the **Test Connection** button to ping n8n's `/healthz` endpoint. The result shows latency and any error details.

> **Note:** The n8n API key here is the *n8n-side* key — what CriteriaIQ uses to call n8n. This is distinct from the CriteriaIQ API key that n8n uses to call CriteriaIQ (managed in the API Keys section below).

### 2. API Keys (n8n → CriteriaIQ direction)

CriteriaIQ-issued Bearer tokens that n8n (or any external caller) uses to authenticate against `/api/*` endpoints. The card also shows the automation trigger endpoint (`POST /api/n8n/trigger`) with a copy button. MCP server keys (`mcp:*` scopes) are managed on the MCP Server page and are not listed here.

| Column | Description |
|---|---|
| **Label** | Human-readable name for the key, e.g. `n8n-main` |
| **Prefix** | First 8 characters of the token for identification, e.g. `ciq_xxxx` |
| **Scopes** | Permission scopes granted to the key |
| **Last Used** | When the key was last authenticated |
| **Expires** | Expiry date, or Never |

**Creating a key:**
1. Click **+ Create API Key**
2. Enter a label (e.g. `n8n-main`)
3. Pick an access preset: **Read only**, **Read and write**, or **Automation only**
4. Optionally set an expiry date
5. Copy the generated token — it is shown **exactly once** and cannot be recovered

New keys can no longer be given the `admin` scope. Keys created before this change keep `admin` and keep working, except on the identity and secret endpoints listed under **Scope enforcement** below. Re-issue them with a preset when convenient.

**Revoking a key:** Click **Revoke** next to any key and confirm. Revoked keys immediately return `401` on all subsequent requests. Revocation is soft-delete; the key record is preserved for audit purposes.

---

## API Key Scopes

Scopes are enforced on **every** `/api/*` request by `server/auth/apiKeyScopes.ts`. Reads are GET/HEAD; anything else needs the `:write` scope. A path that is not mapped to a scope is refused for scoped keys (default deny).

| Scope | What it covers |
|---|---|
| `admin` | Legacy only (no longer issuable): everything except the forbidden endpoints below |
| `projects:read` | GET /api/projects, /api/project/:id |
| `projects:write` | POST/PATCH projects, status changes, archiving |
| `customers:read` | GET /api/customers |
| `customers:write` | POST/PATCH customers |
| `map:read` | GET map projects, tasks, phases, steps |
| `map:write` | PATCH task/step/phase status, assign users |
| `validation:read` | GET validation criteria, success criteria |
| `validation:write` | POST/PATCH success criteria, criteria results |
| `users:read` | GET /api/users (read only; no write scope exists) |
| `automation:execute` | POST /api/n8n/trigger |
| `automation:read` | GET /api/email-automation/* |
| `webhooks:read` | GET /api/webhooks, /api/webhook-templates |
| `webhooks:write` | POST/PATCH/DELETE /api/webhooks |
| `mcp:read` | POST /api/mcp (MCP server keys; managed on the MCP Server page) |

| Preset | Scopes |
|---|---|
| Read only | every `:read` scope above except `mcp:read` |
| Read and write | Read only + `projects:write`, `customers:write`, `map:write`, `validation:write` |
| Automation only | `automation:read`, `automation:execute` |

### Scope enforcement

Refused for **every** API key, including legacy `admin` keys: `/api/admin/api-keys`, `/api/admin/sso`, `/api/admin/users`, `/api/admin/mcp`, `/api/system/secrets`, `/api/system/env-status`, `/api/auth`, `/api/login`, `/api/logout`, `/api/register`, `/api/mfa`, `/api/webauthn`, `/api/setup`, `/api/db-connections`, `/api/demo`, `/api/approve-user`, `/api/reject-user`, and writes to `/api/users`, `/api/roles`, `/api/user-permissions`, `/api/admin/n8n`, `/api/admin/rate-limit`. A leaked key cannot mint more keys, change users or roles, or reveal secrets.

### Project access for keys

Non-admin keys run as the synthetic role `ApiKey`. They are not project team members, so since 2026-10-20 the project access checks (`hasProjectAccess`, `hasProjectEditAccess` in `server/lib/project-access.ts`) let them through; the key's scopes, checked earlier on every request, decide what they can do. A "Read and write" key can therefore update any project, MAP item and success criterion; a "Read only" key is still refused every write before it reaches a route.

Keys get no section permissions, so they cannot change the global Validation Criteria library (solutions, components, value mappings, criteria, outcomes, actions, links). Those writes need edit permission on the matching Validation Criteria tab or on the Criteria Builder.

---

## Inbound: n8n → CriteriaIQ

### Bearer Token Authentication

All standard CriteriaIQ REST endpoints accept Bearer token authentication:

```http
GET /api/projects
Authorization: Bearer ciq_<your-token>
```

The token is validated via bcrypt against the stored hash. On success, a synthetic admin session is injected — all existing route middleware works transparently.

### Inbound Trigger Bridge

Fire any CriteriaIQ native automation trigger from n8n:

```http
POST /api/n8n/trigger
Authorization: Bearer ciq_<your-token>
Content-Type: application/json

{
  "triggerKey": "project.status_changed",
  "projectId": 42,
  "metadata": {
    "newStatus": "completed",
    "changedBy": "n8n-workflow"
  }
}
```

**Required scope:** `automation:execute` (or legacy `admin`)

`triggerKey` must be a key from the system trigger registry (`server/email/email-trigger-registry.ts`); unknown keys return `400`.

**Response:**
```json
{
  "triggerKey": "project.status_changed",
  "rulesEvaluated": 3,
  "rulesMatched": 2,
  "actionsExecuted": 2,
  "actionsFailed": 0,
  "results": [
    {
      "ruleId": 1,
      "ruleName": "Notify SE on completion",
      "matched": true,
      "actionsMatched": 2
    }
  ]
}
```

Matching rules' actions run (emails, notifications, webhooks, MAP and project updates) through `evaluateAndExecute()`, the same evaluate-then-execute path native triggers use. Before 2026-10-20 this route only evaluated rules and ran nothing.

### Available API Endpoints

CriteriaIQ exposes all existing REST endpoints to Bearer token callers. Key endpoint groups:

| Feature Area | Endpoints |
|---|---|
| Projects | `GET/POST/PATCH /api/projects`, `GET /api/project/:id` |
| MAP | `GET /api/map-project/:id`, task/step/phase PATCH endpoints |
| Customers | `GET/POST/PATCH /api/customers` |
| Users | `GET /api/users` |
| Validation | `GET/POST/PATCH /api/success-criteria`, `/api/validation-results` |
| Webhooks | `GET/POST/PATCH/DELETE /api/webhooks` |
| Automation | `GET /api/automation-rules` |
| Triggers | `POST /api/n8n/trigger` |

See the full **API Reference** documentation for the complete endpoint catalog.

---

## Outbound: CriteriaIQ → n8n

CriteriaIQ pushes events to n8n through outbound webhooks with **event subscriptions** (migration 080). A webhook subscribed to an event receives it directly whenever it happens; no Workflow Automation rule is needed.

### Setup Steps

1. In n8n, create a workflow with a **Webhook** trigger node
2. Copy the n8n Webhook node's URL (e.g. `http://n8n:5678/webhook/abc123`)
3. In CriteriaIQ, open **Admin → Integrations → n8n → Event subscriptions** and click **Add subscription** (this opens the webhook wizard on the n8n step; the same webhooks are also listed under **Messaging & Alerts → Webhooks**)
4. Paste the n8n Webhook node URL and set a signing secret
5. Under **Events**, tick the events this workflow should receive (Admins only)

The Event subscriptions card lists every n8n-type webhook plus any other webhook that has events ticked.

### Payload

New n8n webhooks start from the **n8n - Event** template:

```json
{
  "event": "project.status_changed",
  "occurredAt": "2026-10-20T18:00:00.000Z",
  "source": "CriteriaIQ",
  "projectId": 42,
  "userId": "user-id",
  "data": { "projectName": "Acme POC", "oldStatus": "active", "newStatus": "closed" }
}
```

`{{json value}}` in a template inserts the value as real JSON (objects, numbers, null), even though it sits inside a quoted string in the template. Before 2026-10-20 it inserted raw text there, which made the rendered body invalid JSON whenever the value was an object.

A webhook with no events ticked behaves as before: it fires only from a Workflow Automation rule's `trigger_webhook` action.

### Events emitted

The app emits these events today (list kept in `shared/automation-events.ts`, emitter in `server/services/automation-events.ts`):

| Area | Event | Fires when |
|---|---|---|
| Projects | `project.created` | A project is created |
| Projects | `project.updated` | A project is saved (PUT/PATCH) or its Kanban status changes |
| Projects | `project.status_changed` | The internal status value changes |
| Projects | `project.assigned` | The primary engineer changes to a new person |
| Projects | `risk.level_changed` | The project risk value changes |
| MAP | `map.phase.status_changed`, `map.step.status_changed`, `map.task.status_changed` | A phase, step or task status changes |
| MAP | `map.phase.completed`, `map.step.completed`, `map.task.completed` | It moves to `completed` |
| MAP | `map.phase.assigned`, `map.step.assigned`, `map.task.assigned` | It gets a new assignee |
| Success criteria | `criteria.updated` | A success criterion is saved |
| Success criteria | `criteria.completed` | Its status moves to `complete` |

Delivery is fire-and-forget: it runs after the API response, in parallel across subscribed webhooks, with each webhook's own retry policy (1 s, 5 s, 15 s). Every attempt is logged in `webhook_deliveries`.

These events are sent to subscribed webhooks only. They do **not** evaluate native Workflow Automation rules; switching that on is a separate change, because several of these routes already send their own notification emails.

### Who can subscribe

Only Admins can set a webhook's events. A non-admin owner of a webhook that has subscriptions cannot edit it (otherwise they could repoint project data to another URL).

CriteriaIQ signs all outbound webhook payloads with HMAC-SHA256, keyed with the webhook's signing secret (stored encrypted, decrypted just before signing). Before 2026-10-20 the encrypted value was used as the key, so signatures could not be verified; no change is needed in n8n.
```
X-CriteriaIQ-Signature: sha256=<hex>
```

Validate the signature in n8n using a **Function** node:
```javascript
const crypto = require('crypto');
const secret = 'your-webhook-secret';
const payload = JSON.stringify($input.body);
const expected = 'sha256=' + crypto
  .createHmac('sha256', secret)
  .update(payload)
  .digest('hex');
const received = $input.headers['x-criteriaiq-signature'];
if (expected !== received) throw new Error('Signature mismatch');
return $input.all();
```

Deliveries also carry `X-CriteriaIQ-Signature-V2: t=<unix seconds>,v1=<hex>`, an HMAC of `"<t>.<raw body>"` with the same secret. It binds the time to the body, so a receiver can refuse old or replayed deliveries; see [Webhook signatures](project-summary-api.md#webhook-signatures).

---

## n8n Workflow Examples

### Example 1: Sync Project Closure to External System

Triggered when CriteriaIQ fires `project.status_changed` → n8n updates a Jira ticket or Salesforce opportunity.

```
[CriteriaIQ Webhook] → [Function: validate signature] → [HTTP Request: POST to Jira]
```

### Example 2: n8n-Initiated Project Status Update

n8n detects an external event (e.g. deal closed in Salesforce) and updates CriteriaIQ:

```
[Salesforce Trigger] → [HTTP Request: PATCH /api/project/:id]
                                Header: Authorization: Bearer ciq_xxxx
```

### Example 3: Fire CriteriaIQ Automation from n8n

n8n workflow triggers CriteriaIQ's native automation engine:

```
[Schedule] → [HTTP Request: POST /api/n8n/trigger]
                      Body: { "triggerKey": "project.overdue_check", "projectId": 7 }
```

---

## Database Schema

### `api_keys` table

| Column | Type | Description |
|---|---|---|
| `id` | SERIAL | Primary key |
| `key_hash` | VARCHAR(255) | bcrypt hash of the full token |
| `key_prefix` | VARCHAR(12) | First 8 chars of token for display |
| `label` | VARCHAR(255) | Human-readable name |
| `created_by` | VARCHAR | User ID of creator |
| `scopes` | JSONB | Array of scope strings |
| `last_used_at` | TIMESTAMP | Last successful authentication |
| `expires_at` | TIMESTAMP | NULL = never expires |
| `is_active` | BOOLEAN | False = revoked |
| `created_at` | TIMESTAMP | Creation time |
| `updated_at` | TIMESTAMP | Last modification |

### `n8n_config` table

Migration 081 dropped the eight workflow-filter columns (`filter_webhook_only`, `filter_schedule_triggers`, `filter_manual_triggers`, `filter_active_only`, `filter_owner`, `filter_updated_within_value`, `filter_updated_within_unit`, `workflow_limit`) along with the workflow browser. The workflows endpoint now always returns active workflows that have a Webhook trigger, up to 250.

| Column | Type | Description |
|---|---|---|
| `id` | SERIAL | Primary key (single row) |
| `host_url` | VARCHAR(500) | n8n base URL |
| `api_key_enc` | TEXT | AES-256-GCM encrypted n8n API key |
| `is_enabled` | BOOLEAN | Connection enabled/disabled |
| `last_tested_at` | TIMESTAMP | When connection was last tested |
| `last_test_result` | VARCHAR(50) | `"success"` or `"failure"` |
| `last_test_error` | TEXT | Error message from last failed test |
| `updated_by` | VARCHAR | User ID of last updater |
| `updated_at` | TIMESTAMP | Last modification |

---

## Verification Checklist

After setup, verify the integration with these steps:

- [ ] Create an API key in the UI → copy the one-time token
- [ ] `curl -H "Authorization: Bearer <key>" http://localhost:5000/api/projects` → returns projects array
- [ ] `curl -X POST -H "Authorization: Bearer <key>" -H "Content-Type: application/json" -d '{"triggerKey":"project.created","projectId":1}' http://localhost:5000/api/n8n/trigger` → automation engine fires
- [ ] In n8n: create workflow with Webhook node → n8n page → **Add subscription** with its URL, tick `project.updated` → save a project → verify n8n execution runs and `data` arrives as an object
- [ ] "Read and write" key: `PATCH /api/projects/<id>` succeeds; "Read only" key gets `403` on the same call
- [ ] In n8n: HTTP Request node → POST to `/api/n8n/trigger` with Bearer token → verify CriteriaIQ processes it
- [ ] Scope test: create key with only `projects:read` → verify POST to `/api/projects` returns `403`
- [ ] Revoke a key → verify subsequent requests return `401`
- [ ] Test n8n connection: enter host URL + n8n API key → click Test Connection → verify ✓ Connected

---

## Security Notes

- API key plaintext is **never stored** — only the bcrypt hash. The plaintext is returned exactly once at creation time.
- The n8n API key stored in `n8n_config.api_key_enc` is encrypted with AES-256-GCM using the same key derivation as other CriteriaIQ secrets.
- Revoked keys are soft-deleted and preserved for audit trail.
- The Bearer token middleware runs before session middleware at zero cost when no `Authorization` header is present — no performance impact on normal browser traffic.
- Scope enforcement runs on every request in `apiKeyAuth` via `checkApiKeyAccess()` (`server/auth/apiKeyScopes.ts`); `requireApiKeyScope()` remains as a belt-and-braces check on `/api/n8n/trigger`.
