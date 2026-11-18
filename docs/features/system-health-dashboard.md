# System Health Dashboard

The operator's at-a-glance view of whether CriteriaIQ is running cleanly.
Lives at **Configuration → System Health → Overview**. A top
Healthy / Warnings / Errors strip aggregates a grid of per-subsystem
cards; each card is one independent health check.

> **Audience:** admins monitoring a running install, and developers
> adding a new health check.

---

## The three-status model

Every card resolves to exactly one of three statuses:

| Status | Meaning | Dot / border |
|---|---|---|
| `ok` | Operating normally | green |
| `warning` | Needs attention, not blocking | yellow |
| `error` | Needs immediate action | red |

The headline strip is just a tally of those statuses across all cards —
"Healthy 10 / Warnings 0 / Errors 1" always equals the count of green /
yellow / red cards in the grid below. The overall badge on the card
header shows the worst status present (`error` > `warning` > `ok`).

---

## The cards

Eleven categories, each computed by a `getXHealth()` method on the
`HealthMonitor` class in [`server/services/health-monitor.ts`](../../server/services/health-monitor.ts)
and folded into `getFullHealthReport()`.

| Card | What it checks | Degrades to | Source method |
|---|---|---|---|
| **Database** | Connection pool usage, pending migrations (schema drift) | `warning` on drift, `error` on connection failure | `getDatabaseHealth()` |
| **Email System** | SMTP configured? Failures in the last 24h? | `error` if unconfigured, `warning` if recent failures | `getEmailHealth()` |
| **Integrations** | Salesforce / n8n / webhook connectivity | `warning`/`error` per integration state | `getIntegrationHealth()` |
| **Security** | Forced-password-reset backlog, MFA posture | `warning`/`error` per finding | `getSecurityHealth()` |
| **Background Services** | Scheduler liveness (email, cleanup jobs) | `error` if a scheduler is down | `getBackgroundServicesHealth()` |
| **Storage** | Cloud storage reachability, account-logo counts | `warning`/`error` per probe | `getStorageHealth()` |
| **Performance** | Rolling API response time, slow-request count | `warning` past thresholds | `getPerformanceHealth()` |
| **Archive Validation** | Do `archived_*` tables still mirror their source tables? | `warning` on column drift | `getArchiveSchemaValidation()` |
| **Feature Requests** | Count of `support_requests` where `type='feature'` | `warning` when > 0 | `getFeatureRequestsHealth()` |
| **Support Requests** | Count of `support_requests` where `type='issue'` | `error` when > 0 | `getSupportRequestsHealth()` |
| **Client Errors** | Count of `client_error_logs` rows | `error` when > 0 | `getClientErrorsHealth()` |

A 12th tile, **Environment Variables**, is **admin-only** and rendered
separately — it's folded into the headline counts as a single entry
(not four), and it deep-links to System Settings → Environment Variables
rather than a System Health sub-tab. See "Environment variables" below.

### Demand-and-defect cards

The last three cards (Feature Requests, Support Requests, Client Errors)
are a different shape from the infrastructure cards: instead of probing
a subsystem, they count rows in a table and surface unhandled feedback
or captured bugs. They click through **out of System Health** to
**About → Support & Features** (Client Errors deep-links to the Error
Audit Log sub-tab). Unlike the Error Audit Log itself, these cards are
visible to **every System Health viewer**, not just admins — the count
is not sensitive, though the underlying detail surfaces remain
admin-gated. See [`client-error-capture.md`](client-error-capture.md)
for the Client Errors pipeline.

---

## How the headline counts are computed

The tally is **server-derived**, not recomputed in the browser, so every
consumer of `/api/system/health` sees the same numbers. The logic lives
in [`server/lib/system-health-env-rollup.ts`](../../server/lib/system-health-env-rollup.ts):

- `CATEGORY_KEYS` is an **explicit allowlist** of the category fields
  that count toward the headline. It is deliberately hardcoded (not
  reflected from the report object) so that adding a new card to the
  report forces a conscious decision to include it in the tally. **If
  you add a card to `getFullHealthReport()` and forget to add its key
  here, the headline will be off by one** and silently understate the
  problem during an incident.
- `categoryStatusCounts()` walks `CATEGORY_KEYS` and buckets each
  status into healthy / warning / error.
- For admins, `withEnvVars()` folds the Environment Variables block in
  as a **single** entry (graded by its worst sub-row) so "one tile =
  one count" holds — counting the four individual env rows would inflate
  the headline above the number of tiles rendered.
- A defensive client-side fallback in
  [`SystemHealthSection.tsx`](../../client/src/components/configuration/SystemHealthSection.tsx)
  re-counts the visible tiles if the server omits the rollup, so the
  panel degrades gracefully rather than crashing.

---

## API surface

Registered in [`server/routes/system-health-routes.ts`](../../server/routes/system-health-routes.ts).
Every GET needs view access to `config.system-health` (Role Management ›
Monitoring & Audit; Admin always passes). Anyone else gets `403`.

| Endpoint | Returns |
|---|---|
| `GET /api/system/health` | The full report: all card statuses + `overviewCounts` (Healthy/Warnings/Errors) + (admin) the `envVars` block |
| `GET /api/system/health/database` | Just the Database card (deep-tab refresh) |
| `GET /api/system/health/email` | Just Email |
| … one per category … | `/integrations`, `/security`, `/services`, `/storage`, `/performance`, `/archive-validation`, `/feature-requests`, `/support-requests`, `/client-errors` |

The Overview reads the combined `/api/system/health` once; the
per-category endpoints exist so a deep detail tab can refresh a single
card without re-running every probe. Refetch interval is
operator-configurable (default 60 s) via a localStorage key; the UI
shows a "next refresh in Ns" countdown and a "Refresh now" button.

---

## Environment variables (admin-only 12th tile)

The Environment Variables tile rolls up the bootstrap-secret and
env-var health from the app-config snapshot (see
[`encryption-key-rotation.md`](encryption-key-rotation.md) for the
secret-management context). It also surfaces the **boot-time data
directory writability probe** — a read-only `/data` mount turns this
tile red before it can silently break secret promotion or backups.
Non-admins never receive this block and the tile is dropped from their
grid entirely.

---

## Adding a new health card

1. **Define a result interface** in `health-monitor.ts` extending
   `HealthCheckResult` (`{ status, lastChecked, message }`) plus any
   metrics you want to surface.
2. **Add a `getXHealth()` method** on `HealthMonitor`. Keep it cheap —
   a single `COUNT(*)` or a focused probe. Wrap the body in try/catch
   and return `status: 'error'` on failure (never throw — one failing
   probe must not break the whole report).
3. **Fold it into `getFullHealthReport()`** — add to the `Promise.all`
   and the returned object, and to the `statuses` array used for the
   overall badge.
4. **Add its key to `CATEGORY_KEYS`** in `system-health-env-rollup.ts`
   so it counts toward the headline. *(This is the step that's easy to
   forget — the demand cards shipped a follow-up fix precisely because
   it was missed once.)*
5. **Add a per-category endpoint** in `system-health-routes.ts`
   mirroring the existing eight.
6. **Render it** in the `healthCategories` array in
   `SystemHealthSection.tsx` with an icon, a status, and (optionally)
   an `extra` inline detail slot or an `href` for click-through.

---

## Related files

| Concern | File |
|---|---|
| Health checks | [`server/services/health-monitor.ts`](../../server/services/health-monitor.ts) |
| Headline rollup + `CATEGORY_KEYS` | [`server/lib/system-health-env-rollup.ts`](../../server/lib/system-health-env-rollup.ts) |
| API routes | [`server/routes/system-health-routes.ts`](../../server/routes/system-health-routes.ts) |
| Overview grid + cards | [`client/src/components/configuration/SystemHealthSection.tsx`](../../client/src/components/configuration/SystemHealthSection.tsx) |
| Per-category query hook | [`client/src/components/configuration/system-health/useSystemHealthCategoryQuery.ts`](../../client/src/components/configuration/system-health/useSystemHealthCategoryQuery.ts) |
| Archive mirror check | [`.claude/skills/archive-mirror-check/SKILL.md`](../../.claude/skills/archive-mirror-check/SKILL.md) (drives the Archive Validation card's contract) |
