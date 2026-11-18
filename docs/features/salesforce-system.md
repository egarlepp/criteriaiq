# Salesforce Field Mapping System

CriteriaIQ's Salesforce integration enables bidirectional data synchronization between CriteriaIQ entities and Salesforce objects. This document covers the complete architecture, configuration, and usage guide.

## Overview

The Salesforce Field Mapping System provides:
- **Bidirectional Sync**: Push CriteriaIQ data to Salesforce and pull Salesforce changes back
- **Admin-Configurable Mappings**: No pre-configured mappings; admins define all field relationships
- **Three Sync Modes**: Manual, event-driven, and scheduled synchronization
- **Advanced Value Translation**: Picklist mapping with Primary Outbound designation and configurable unmapped value behavior
- **Conflict Resolution**: Salesforce-wins default strategy with user notifications
- **Record Linkage**: Enhanced search with Account context for accurate linking
- **SSO/Okta Support**: Optional custom domain configuration for enterprise authentication
- **Fuzzy Matching Suggestions**: Config-time value suggestions using Levenshtein distance (enterprise-safe, no runtime fuzzy logic)

## Architecture

### Database Schema

The system uses 9 dedicated tables:

| Table | Purpose |
|-------|---------|
| `salesforce_oauth_config` | Encrypted Connected App credentials (Client ID, Client Secret) |
| `salesforce_describe_cache` | Cached Salesforce object/field metadata from Describe API |
| `salesforce_field_mappings` | Field mapping definitions with `unmappedBehavior` setting |
| `salesforce_value_maps` | Picklist value translations with `isPrimaryOutbound` flag |
| `salesforce_record_links` | Links between CriteriaIQ records and Salesforce records |
| `salesforce_sync_queue` | Debounced queue for event-driven sync; failed items return to `pending` with a later `process_after` until the retry limit |
| `salesforce_sync_policies` | Per-entity-object sync mode configuration (composite unique on entity+sfObject) |
| `salesforce_sync_runs` | Sync execution history and statistics |
| `salesforce_sync_run_items` | Individual record sync results within a run |

#### Key Schema Columns

**salesforce_field_mappings:**
- `unmappedBehavior`: Enum (`use_default` | `error_and_log`) - Controls how unmapped values are handled during sync

**salesforce_value_maps:**
- `isPrimaryOutbound`: Boolean - Designates the primary CQI value for outbound sync when multiple CQI values map to the same SF value

**salesforce_sync_policies:**
- Composite unique constraint on `(entity, sfObject)` enables per-entity-object sync configuration

### Backend Services

```
server/salesforce/
├── index.ts                              # Service exports
├── salesforce-config-service.ts          # OAuth credential management + getSalesforceConnectionForUser()
├── salesforce-metadata-service.ts        # Describe API with caching
├── salesforce-mapping-service.ts         # Field mapping CRUD and value translation
├── salesforce-mapping-validation-service.ts  # Pre-flight validation + zero-write dry-run preview
├── salesforce-payload-builder.ts         # Pure sync-payload builders shared by the live sync path and dry-run preview
├── salesforce-linkage-service.ts         # Record linking and search
├── salesforce-sync-service.ts            # Manual/scheduled sync execution
├── salesforce-sync-worker.ts             # Registers the queue, link check and scheduled syncs on the shared Scheduler
└── fuzzy-matcher.ts                      # Config-time value suggestion service
```

`getSalesforceConnectionForUser()` (in `salesforce-config-service.ts`) is the single shared helper for
building a per-user `jsforce.Connection` — previously duplicated near-identically across
`salesforce-sync-service.ts`, `salesforce-metadata-service.ts`, and `salesforce-linkage-service.ts`.

### Entity Mappings

| CriteriaIQ Entity | Salesforce Object | Description |
|-------------------|-------------------|-------------|
| Projects | Opportunity | Core project data and opportunity details |
| Customers | Account | Account information and company data |
| Users | Contact | Internal team member information |
| Solutions | Product2 | Product catalog synchronization |
| MAP Tasks | Task | Mutual Action Plan task tracking |
| Customer Contacts | Contact | External customer contact information |

## Configuration

### Step 1: OAuth Credentials

Navigate to **Configuration → Integrations → Credentials**

1. Set environment (Production or Sandbox)
2. Enter Connected App credentials:
   - **Login URL**: Standard Salesforce login endpoint (auto-set based on environment)
   - **Custom Domain (Optional)**: For SSO/Okta authentication (e.g., `https://mycompany.my.salesforce.com`)
   - **Client ID** (Consumer Key)
   - **Client Secret** (Consumer Secret)
3. Click **Test Connection** to verify

#### SSO/Okta Authentication

For organizations using SSO/Okta with Salesforce:
1. Enter your organization's custom Salesforce domain in the **Custom Domain** field
2. Users will be redirected to the custom domain for OAuth authentication
3. This enables seamless SSO login without requiring separate Salesforce credentials

#### Creating a Salesforce Connected App

1. In Salesforce Setup, go to **App Manager** → **New Connected App**
2. Enable OAuth Settings:
   - Callback URL: `https://your-criteriaiq-domain.com/api/salesforce/callback`
   - Selected OAuth Scopes:
     - `api` (Access your basic information)
     - `refresh_token, offline_access` (Perform requests on your behalf at any time)
3. Save and note the Consumer Key and Consumer Secret

### Step 2: Field Mappings

Navigate to **Configuration → Integrations → Field Mappings**

The Field Mappings page displays a unified table with all mappings across all entity types. Use the **Filter by Entity** dropdown to focus on specific entity types.

Create mappings between CriteriaIQ fields and Salesforce fields:

1. Click **Add Mapping**
2. Select:
   - **CriteriaIQ Entity**: Project, Customer, User, Solution, MAP Task, or Customer Contact
   - **CriteriaIQ Field**: The local field to sync (fields available depend on selected entity)
   - **Salesforce Object**: Opportunity, Account, Contact, Product2, Task, or custom objects
   - **Salesforce Field**: The Salesforce field (from Describe API)
   - **Direction**: Inbound (SF→CQI), Outbound (CQI→SF), or Bidirectional
3. Toggle **Active** to enable

#### Direction Options

| Direction | Description |
|-----------|-------------|
| **Inbound** | Salesforce → CriteriaIQ (read-only in CQI, shows lock icon) |
| **Outbound** | CriteriaIQ → Salesforce (CQI is the source of truth) |
| **Bidirectional** | Two-way sync with conflict resolution |

### Step 3: Value Translations

For picklist and enum fields, configure value translations to map between CriteriaIQ and Salesforce values.

#### Accessing Value Translations

1. In the Field Mappings table, locate your mapping
2. Click the **Languages** icon (🌐) in the Actions column
3. The Value Translations dialog opens

#### Value Translations Dialog

The dialog displays a table with the following columns:

| Column | Description |
|--------|-------------|
| **CriteriaIQ Value** | The value used in CriteriaIQ |
| **Salesforce Value** | The corresponding value in Salesforce |
| **Default** | If checked, this CQI value is used when an unmapped SF value is received |
| **Primary Outbound** | Designates the primary CQI value for outbound sync (see below) |
| **Actions** | Edit and delete buttons |

#### One-to-Many Value Mappings (Primary Outbound)

CriteriaIQ supports one-to-many value mappings where multiple CriteriaIQ values map to a single Salesforce value. This is common in enterprise environments where CriteriaIQ has more granular status options.

**Example:**
| CriteriaIQ Value | Salesforce Value | Primary Outbound |
|------------------|------------------|------------------|
| In Progress | Working | ✅ |
| Under Review | Working | ❌ |
| Pending Approval | Working | ❌ |

**How it works:**
- **Inbound (SF → CQI)**: All three CQI values map to "Working" - the system uses the **Default** value or passthrough
- **Outbound (CQI → SF)**: The value marked as **Primary Outbound** ("In Progress") is used when syncing back to Salesforce

**Important:** Only one value per Salesforce value can be marked as Primary Outbound. Toggling Primary Outbound on one value automatically disables it on others mapping to the same SF value.

#### Unmapped Value Behavior

Each field mapping has an `unmappedBehavior` setting that controls what happens when a value is encountered that has no translation configured:

| Behavior | Description |
|----------|-------------|
| **Use Default** | Falls back to the value marked as Default, or passes through the original value if no default is set. Recommended for most use cases. |
| **Error and Log** | Logs an error and prevents the sync. Use for strict data quality enforcement. |

Configure this setting when editing a field mapping.

#### Fuzzy Matching Suggestions

When adding value translations, CriteriaIQ provides intelligent suggestions using fuzzy matching:

1. Click **Add Translation**
2. Start typing a CriteriaIQ value
3. Click **Get Suggestions** to see fuzzy-matched Salesforce picklist values
4. Suggestions are ranked by similarity score (Levenshtein distance)

**Enterprise Safety Note:** Fuzzy matching is ONLY used during configuration for suggestions. Runtime sync uses strict exact-match lookups only - no fuzzy logic is applied to actual data synchronization.

### Step 4: Sync Policies

Navigate to **Configuration → Integrations → Sync Policies**

Configure per-entity-object sync behavior. Policies use a composite unique constraint on (entity, sfObject) allowing different sync settings for different Salesforce object types.

| Policy | Description |
|--------|-------------|
| **Manual Enabled** | Allow users to trigger sync from record detail pages |
| **Event-Driven Enabled** | Auto-queue an outbound sync when a linked project or account is saved (debounced by `debounceSeconds`, default 5 min) |
| **Scheduled Enabled** | Enable cron-based background sync |
| **Schedule** | Cron expression (e.g., `0 */4 * * *` for every 4 hours) |
| **Conflict Strategy** | `salesforce_wins` (default), `criteriaiq_wins`, or `most_recent` |

### Step 5: Validate Mappings & Preview a Sync

Navigate to **Configuration → Integrations → Field Mappings → Validate Mappings**

Catches a broken mapping *before* it silently fails or writes wrong data during a real
sync, and lets an admin see exactly what a sync would do without running it.

**Validation** (`POST /api/admin/salesforce/mappings/validate`) runs two layers of
read-only checks:
- **Static**: duplicate mappings (same CriteriaIQ field mapped twice, or two CriteriaIQ
  fields both writing to the same Salesforce field on outbound), a field marked
  `isRequired` with no active mapping, and mappings whose (entity, Salesforce object) pair
  has no sync policy configured (so the mapping will never actually run).
- **Describe-backed**: for each mapped Salesforce object, checks (via the existing 24-hour
  `salesforce_describe_cache` — this does **not** force a live API call on every
  validation run) that every mapped field still exists, is createable/updateable for
  outbound mappings, has a Salesforce type compatible with the CriteriaIQ field's declared
  type, and — for restricted picklists — has at least one value translation configured.

**Dry-run preview** (`POST /api/admin/salesforce/mappings/preview`) builds the exact
update payload a real sync would send for one linked record — using the same
`buildInboundPayload`/`buildOutboundPayload` functions
(`salesforce-payload-builder.ts`) the live sync path calls — **without** calling
`.update()` on Salesforce or writing to CriteriaIQ, and without creating a
`salesforce_sync_runs` row. Only available for Projects, Customers, and Users — Solutions,
MAP Tasks, and Customer Contacts can have mappings *validated* but don't have a live sync
implementation yet (see "Entity Mappings" above).

## Sync Modes

### Manual Sync

There is no per-record **Sync Now** button today. The record linkage screens
(link modal, sync indicator, conflict toast) were never mounted, and they were
removed in v0.11.0 along with the API routes only they called. Admins can still
run a sync from Admin › Integrations › Salesforce.

### Event-Driven Sync

Automatic outbound sync triggered by CriteriaIQ saves:

1. Saving a project (`PUT`/`PATCH /api/projects/:id`, status change) or an account (`PUT /api/customers/:id`) queues an outbound sync, but only when the record has an active Salesforce link and at least one outbound mapping exists. The save itself never waits on Salesforce.
2. Repeated saves within the debounce window collapse into one queue entry.
3. The sync worker (`salesforce-sync-worker.ts`, started at boot) picks up due entries every minute and runs them as the user who saved the record (or, failing that, the user who linked it). It runs as the `salesforce_sync_queue` job on Configuration → Scheduler, where it can be turned off, slowed down or run now.
4. A failed sync is retried with exponential backoff: `backoffSeconds × 2^(attempt−1)`, capped at one hour, up to the policy's `retryLimit` (defaults 60 s and 3). Validation-rule, permission and record-not-found errors are not retried, since they fail the same way every time.
5. Every attempt is written to `salesforce_sync_runs` (mode `event`) and `salesforce_sync_run_items`, so it shows in Sync History and, when it fails, in Sync Issues.

### Scheduled Sync

Background sync of every linked record for an entity:

1. Created from the Sync Policies "Scheduled" toggle, which adds a **Salesforce Sync** schedule in Workflow Automation (direction, entities, and an optional broken-link check). A `scheduledCron` stored directly on the policy also works and is applied as soon as the policy is saved.
2. Skipped for an entity whose policy has Scheduled turned off.
3. There is no org-wide Salesforce connection: each record syncs with the connection of the user who linked it. Records with no linking user, or whose user has disconnected Salesforce, are recorded as skipped.

### Sync Issues

**Integrations → Salesforce → Sync History** shows a Sync Issues panel above the run history (ported from ImpactIQ's CRM Sync page):

- KPI cards: open/resolved issues, 24-hour success rate, queued syncs (and how many are waiting to retry), broken links, and the last run.
- An issue is the latest sync attempt for a record + direction when that attempt failed. A later successful sync clears it on its own.
- **Retry** queues the sync again and runs it immediately.
- **Resolve** marks it handled without retrying (`resolved_at` / `resolved_by` on the run item, migration 082). If the next sync of that record fails, a new unresolved item is written, so the issue reopens.
- **Check links now** runs the broken-link check below on demand.

## Value Translation Logic

The translation service follows this precedence order during sync:

### Inbound Sync (Salesforce → CriteriaIQ)

1. **Exact Match**: Look up SF value in value maps → return CQI value
2. **Default Value**: If no match and a default is configured → return default CQI value
3. **Unmapped Behavior**:
   - `use_default`: Pass through the original SF value
   - `error_and_log`: skip this field (it is left out of the sync's update payload
     entirely) and record the failure so it's visible on the sync run item's message and
     in a dry-run preview's `translationErrors`

> **Note:** prior to the mapping-validation-service extraction, `error_and_log` (and any
> value-map translation in general) had a bug where the internal translation result object
> was written directly into the target field instead of the translated string — see
> `salesforce-payload-builder.ts`'s file header for detail. Fixed as part of adding
> Mapping Validation & Dry Run (Step 5 above).

### Outbound Sync (CriteriaIQ → Salesforce)

1. **Exact Match**: Look up CQI value in value maps → return SF value
2. **Primary Outbound**: If multiple CQI values map to same SF value → use Primary Outbound designation
3. **Default Value**: If no match and a default is configured → return default SF value
4. **Unmapped Behavior**:
   - `use_default`: Pass through the original CQI value
   - `error_and_log`: Log error, return null (sync fails for this field)

## Record Linkage

Links between a CriteriaIQ record and a Salesforce record live in
`salesforce_record_links` and are read by the sync, the link check and email
automation. No screen creates or removes them today: the linkage UI was never
mounted, and its routes (`/api/admin/salesforce/linkage*`,
`/api/salesforce/conflicts*`), which accepted any signed-in user, were removed
in v0.11.0. Bringing linking back means a new screen on routes that require
edit access to the record.

### Broken Link Detection

A link is marked `broken` in two ways:

1. A sync attempt gets a not-found (404) from Salesforce.
2. The nightly link check (03:00 server time by default, `salesforce-link-health.ts`; the `salesforce_link_check` job on Configuration → Scheduler, where the time and timezone can be changed) finds the record missing. It runs one `SELECT Id … WHERE Id IN (…)` query per object type per 200 links, using the connection of the user who linked them.

The check heals both ways: a broken link whose record exists again (Recycle Bin restore) goes back to `active`. A query that fails changes nothing, so a Salesforce outage never marks real links as broken. Each check is recorded in sync history as a `link_check` run. A broken link can be re-linked to another Salesforce record.

### CRM Record IDs on Projects

Separate from record links, every project carries three plain fields that API clients (ImpactIQ) use to look projects up by CRM record (migration 086):

| Field | Holds |
|-------|-------|
| `crmProvider` | `salesforce` or `hubspot` |
| `crmOpportunityId` | Salesforce Opportunity id or HubSpot Deal id |
| `crmAccountId` | Salesforce Account id or HubSpot Company id |

They are not stored in `salesforce_record_links`: a project's link there points at the object its sync policy maps to (usually the Evaluation), and creating a link starts outbound sync. The ids are reference data only; saving them never pushes anything to Salesforce unless an admin maps them under Field Mappings.

- **Project form.** With Salesforce connected, picking an Opportunity fills the Opportunity name, `crmOpportunityId` and `crmAccountId` (from the Opportunity's Account), and the Evaluation picker stores the Evaluation's record URL. Without Salesforce, the CRM Opportunity ID and CRM Account ID fields take a pasted id or a Salesforce/HubSpot record URL and extract the id.
- **Normalization.** Salesforce ids are stored in their 18-character form; 15-character input is converted on save (`server/lib/crm-record-fields.ts`, parsing in `shared/crm-record-id.ts`).
- **Lookup.** `GET /api/projects?crmOpportunityId=…`, `?crmAccountId=…` and `?evaluationId=…` (the id inside `salesforceEvaluationLink`). See the [API reference](../guides/api-reference.md).

#### Backfilling existing projects

Admin → Integrations → Salesforce → Sync History → **CRM Record IDs** fills the ids for projects that have a `salesforceEvaluationLink` but no `crmOpportunityId`:

1. The backfill reads the Evaluation's Opportunity lookup field from a field mapping for the project field **CRM Opportunity ID** on the Evaluation object. Without that mapping it uses the **Opportunity lookup field** set on the Validation Record card (below).
2. Click **Preview** (a dry run). It lists each project with the Evaluation id from its link, the Opportunity id and the Account id it would write, or why it would be skipped.
3. Click **Fill IDs** and confirm. Only rows whose Opportunity id is still empty are written, Account ids already set are kept, and each change is logged to the server log and the project's activity log.

The backfill uses the running admin's own Salesforce connection and skips demo projects. API: `POST /api/admin/salesforce/crm-id-backfill` with `{ "dryRun": true }` (the default) or `{ "dryRun": false }`.

### Validation Record (name and CRM objects)

Teams call the record that holds a technical validation different things: Evaluation, POC, POV, POx or Project. One setting holds both its name and its CRM objects (`system_settings` key `crm_validation_record`, `shared/crm-validation-record.ts`), edited from two places:

- **Name** is app-wide, so it lives at Admin → System Settings → **Terminology** (Admin only). It applies with any CRM, including None.
- **CRM objects** live at Admin → Integrations → Overview → **Validation Record**, which shows the current name with a link to Terminology.

Each card sends the other card's fields back unchanged on save.

| Setting | Default | Used by |
|---------|---------|---------|
| Name | Evaluation (presets: Evaluation, POC, POV, POC/POV, POx, Project, or a custom name up to 40 characters) | Project form picker label, CRM Record IDs backfill, Requests button/drawer/dialog, Account Portal (request button, FAQ), Guide (Partner summary, customer journey), About › Clear2Close and 5A Framework, profile Salesforce card, Salesforce field-mapping label for the link field (`<Name> Link`) |
| Salesforce object API name | `Evaluation__c` | Project form picker, record links, backfill |
| Salesforce Opportunity lookup field | `Opportunity__c` | Project form picker (records under the chosen Opportunity), backfill |
| HubSpot object type | empty | Stored for the HubSpot connector; nothing reads it yet |

Screens read the name with `useValidationRecordLabel()` and pass it to translations as `{{record}}` (`t("key", { record })`). Preset names are translated into all six languages; a custom name is shown as typed. Server text with no locale (field-mapping labels) uses `validationRecordEnglishName()`. In German, Spanish, French, Italian and Portuguese the surrounding sentence carries a fixed article, so a name of a different grammatical gender (e.g. "Project") can read slightly off; a custom name avoids that. Until the setting is saved, the Salesforce object falls back to the older `salesforce_oauth_config.evaluation_object_api_name` value, so upgrading changes nothing. The Evaluation Object API Name field formerly on the Salesforce Configuration tab now lives here.

Only labels and CRM object names change. API and database names stay as they are (`salesforceEvaluationLink`, `?evaluationId=`, `/api/evaluation-requests`) because API clients such as ImpactIQ depend on them. Admin-editable email templates are not rewritten; the seeded "Evaluation Request Submitted" template keeps its wording.

API: `GET`/`PUT /api/admin/validation-record` (Admin), `GET /api/validation-record/label` (any signed-in user; returns `{ label, customLabel }` only).

## User Interface Elements

> **Not yet shown:** the sync indicator, linkage modal and conflict toast below exist under `client/src/components/salesforce/` but are not mounted on any page yet.

### Sync Indicator

Displayed on record forms for linked records:
- **Cloud Icon**: Record is linked to Salesforce
- **Last Sync Time**: Hover to see last successful sync
- **Lock Icon**: Field is inbound-only (read-only)

### Value Translations Button

In the Field Mappings table:
- **Languages Icon** (🌐): Opens the Value Translations dialog for the mapping
- Tooltip: "Value Translations"

### Conflict Toast

When Salesforce overwrites local changes:
- Toast notification appears
- Shows field name and new value
- Option to **Resave** your changes

### Inbound-Only Fields

Fields with inbound direction:
- Display lock icon
- Rendered as read-only in forms
- Tooltip: "Synced from Salesforce"

## API Reference

### Admin Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/salesforce/config` | Get OAuth configuration status |
| POST | `/api/admin/salesforce/config` | Save OAuth credentials |
| POST | `/api/admin/salesforce/test-connection` | Test Salesforce connection |
| GET | `/api/admin/salesforce/objects` | List available Salesforce objects |
| GET | `/api/admin/salesforce/objects/:objectName/fields` | Get fields for an object |
| GET | `/api/admin/salesforce/mappings` | List all field mappings |
| POST | `/api/admin/salesforce/mappings` | Create a field mapping |
| PUT | `/api/admin/salesforce/mappings/:id` | Update a field mapping |
| DELETE | `/api/admin/salesforce/mappings/:id` | Delete a field mapping |
| GET | `/api/admin/salesforce/policies` | Get sync policies |
| PUT | `/api/admin/salesforce/policies/:entity` | Update sync policy |
| GET | `/api/admin/salesforce/sync-runs` | Get sync run history |
| POST | `/api/admin/salesforce/mappings/validate` | Validate all (or one entity's) field mappings — read-only, no writes |
| POST | `/api/admin/salesforce/mappings/preview` | Zero-write dry-run preview of one linked record's sync payload |
| GET | `/api/admin/salesforce/sync/health` | Sync Issues KPI cards and worker status |
| GET | `/api/admin/salesforce/sync/issues?status=open\|resolved\|all` | Records whose latest sync failed |
| POST | `/api/admin/salesforce/sync/issues/:itemId/resolve` | Mark an issue handled without retrying |
| POST | `/api/admin/salesforce/sync/issues/:itemId/retry` | Queue the sync again and run it now |
| POST | `/api/admin/salesforce/sync/link-check` | Run the broken-link check now |
| POST | `/api/admin/salesforce/crm-id-backfill` | Fill project CRM record ids from Evaluation links (`dryRun` defaults to true) |
| GET | `/api/admin/validation-record` | Validation record name and CRM objects |
| PUT | `/api/admin/validation-record` | Save them (see Validation Record above) |
| GET | `/api/validation-record/label` | The chosen name only; any signed-in user |

### Value Map Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/salesforce/mappings/:mappingId/value-maps` | Get value maps for a mapping |
| POST | `/api/admin/salesforce/mappings/:mappingId/value-maps` | Create a value map |
| PUT | `/api/admin/salesforce/value-maps/:id` | Update a value map (including isPrimaryOutbound) |
| DELETE | `/api/admin/salesforce/value-maps/:id` | Delete a value map |
| POST | `/api/admin/salesforce/mappings/:mappingId/fuzzy-suggestions` | Get fuzzy-matched SF value suggestions |

### User Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/salesforce/link/:entity/:recordId` | Get link status for a record |
| POST | `/api/salesforce/link` | Create a record link |
| DELETE | `/api/salesforce/link/:entity/:recordId` | Remove a record link |
| POST | `/api/salesforce/sync/:entity/:recordId` | Trigger manual sync |
| GET | `/api/salesforce/search/:objectType` | Search Salesforce records |

## Troubleshooting

### Common Issues

#### "OAuth not configured"
- Ensure Client ID and Client Secret are saved in Credentials tab
- Click Test Connection to verify credentials
- (Fixed in Workstream 4 Phase 2) Prior to consolidation, the Profile page's "Connect to
  Salesforce" button used a separate, env-var-only OAuth config path and could report this
  error even when Credentials were correctly saved in the admin UI. All Salesforce OAuth now
  goes through the one DB-backed config in `salesforce-config-service.ts`.

#### "No mappings found for entity"
- Create at least one active mapping in Field Mappings tab
- Ensure mapping direction matches your sync operation

#### "Salesforce record not found" (404)
- The linked record was deleted in Salesforce
- Link status will be marked as "broken"
- Re-link to a new Salesforce record

#### "Conflict detected"
- Another user or Salesforce automation changed the record
- Default behavior: Salesforce value wins
- User can click "Resave" to override with local value

#### "Value translation failed"
- Check if value maps are configured for the field
- Verify the `unmappedBehavior` setting
- If using `error_and_log`, ensure all possible values are mapped

#### "Multiple Primary Outbound values"
- Only one CQI value per SF value can be Primary Outbound
- The system auto-deselects other values when toggling

#### A field mapping stopped working / sync results look wrong
- Run **Validate Mappings** (Field Mappings tab) first — it catches the most common causes:
  a renamed/deleted Salesforce field, a field that's no longer writable, a duplicate
  mapping, or a mapping whose entity has no sync policy configured.
- Use **Preview** in the same drawer to see exactly what a sync would write for a specific
  linked record before running a real sync.

### Debug Logging

Enable debug logging in development:
```typescript
// server/salesforce/salesforce-sync-service.ts
const DEBUG = process.env.SF_DEBUG === 'true';
```

View sync run details:
1. Configuration → Integrations → Sync Policies
2. Scroll to "Recent Sync Runs"
3. Click run to see individual record results

## Security Considerations

### Credential Storage
- Client Secret is AES-256-GCM encrypted at rest
- Environment detection prevents production credentials in sandbox

### OAuth Token Handling
- Each user's sign-in tokens live in `user_integrations` (one row per user per provider, `provider = 'salesforce'`), AES-256-GCM encrypted and covered by encryption-key rotation. They used to be columns on `users`; migration 083 copied them over, and the old `users.sf_*` columns are no longer read and will be dropped in a later migration.
- Every sync uses a user's own connection: manual and event-driven syncs use the acting user (or whoever linked the record); scheduled syncs and the nightly link check use the user who linked each record. There is no org-wide connection.
- A rotated access token is saved back automatically on refresh.
- Disconnecting deletes the user's row; archiving a user deletes it too, so a restored user reconnects.

### Data Protection
- Field mappings are admin-only
- Users can only sync records they have access to
- Audit logging for all sync operations

### Enterprise-Safe Value Translation
- Fuzzy matching is config-time ONLY (suggestions)
- Runtime sync uses strict exact-match lookups
- No fuzzy logic applied to production data

## Best Practices

### Field Mapping Strategy
1. Start with read-only (inbound) mappings to avoid data conflicts
2. Identify source of truth for each field
3. Use bidirectional only for collaborative fields

### Value Translation Strategy
1. Map all known picklist values before enabling sync
2. Set a sensible Default value for graceful fallback
3. Use `error_and_log` for critical fields requiring strict validation
4. Review fuzzy suggestions but always verify manually

### One-to-Many Mapping Guidelines
1. Use Primary Outbound to designate the "canonical" CQI value
2. Document your mapping decisions for team visibility
3. Consider business rules when choosing Primary Outbound

### Sync Frequency
- Manual: Best for ad-hoc updates
- Event-driven: Balance between real-time and API limits
- Scheduled: Ideal for overnight catchup sync

### Conflict Resolution
- Default to `salesforce_wins` to prevent data loss
- Use `criteriaiq_wins` only if CriteriaIQ is authoritative
- `most_recent` requires accurate timestamps on both sides

### API Limit Management
- 5-minute debounce batches reduce API calls
- Use scheduled sync during off-hours
- Monitor sync run statistics for API consumption

## Workflow Automation Integration

The Workflow Automation System can directly update Salesforce records using the `update_salesforce` action type, bypassing the standard 5-minute batch queue for immediate execution.

### Immediate Field Updates

When a workflow rule triggers with an `update_salesforce` action:

1. **Immediate Execution**: The update executes immediately when the rule fires, not through the batch queue
2. **Dirty Check**: By default, the system compares current vs. new values and only pushes actual changes
3. **Retry with Backoff**: Failed updates are automatically retried with exponential backoff (1s, 2s, 4s...)

### Configuration in Workflow Rules

Add Salesforce update actions to workflow rules via **Communications → Workflow Automation → Rules**:

```json
{
  "type": "update_salesforce",
  "objectType": "opportunity",
  "fieldUpdates": [
    {
      "salesforceField": "StageName",
      "value": "Closed Won",
      "updateType": "static"
    },
    {
      "salesforceField": "CloseDate",
      "value": "{{project.closeDate}}",
      "updateType": "dynamic"
    }
  ]
}
```

### Supported Objects

| Object Type | Description |
|-------------|-------------|
| `opportunity` | Update Opportunity fields (Stage, Amount, CloseDate, etc.) |
| `account` | Update Account fields (Name, Industry, Rating, etc.) |
| `contact` | Update Contact fields (Title, Email, Phone, etc.) |
| `task` | Update Task fields (Status, Priority, Subject, etc.) |

### Use Cases

1. **Project Closure** → Automatically update Opportunity Stage to "Closed Won/Lost"
2. **Milestone Completion** → Update custom fields with project progress
3. **Status Changes** → Sync CriteriaIQ project status to Opportunity Next Step
4. **Team Assignments** → Update Opportunity Owner when project lead changes

### Relationship to Field Mappings

- **Field Mappings**: Define which fields can sync and in what direction (bidirectional or one-way)
- **Workflow Actions**: Trigger specific updates based on events, using the mapped field relationships
- **Recommendation**: Ensure the Salesforce field being updated has an Outbound or Bidirectional mapping active

For detailed action configuration, see [workflow-automation-system.md](./workflow-automation-system.md).
