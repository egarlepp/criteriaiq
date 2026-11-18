# Archived: Report Builder, Dashboard Builder, Metric Builder

Archived 2026-11-05. These three Analytics screens were taken out of
CriteriaIQ: nothing in the app imports or links to them, and the server
routes only they called were removed. The files are kept here, at their
original paths under this folder, so they can be read or restored.

This folder is outside `tsconfig.json`'s `include`, the Vite build and the
Vitest `include` globs, so none of it is type-checked, bundled or tested.

## What is here

| File | Was |
|---|---|
| `client/src/pages/analytics.tsx` | The Analytics page before the builders were removed (all five tabs). |
| `client/src/components/analytics/ReportBuilderContent.tsx` | Report Builder (General / Fields / Filters / Preview). |
| `client/src/components/analytics/ReportBuilder.tsx` | The standalone `/report-builder` page. |
| `client/src/components/analytics/report-builder-utils.ts` | Report Builder helper. (`FilterChipsInput` stayed in the app: the Schedule Report dialog shows saved filters with it, read-only.) |
| `client/src/components/dashboard/admin-dashboard-builder.tsx` | Dashboard Builder. |
| `client/src/components/dashboard/metric-builder.tsx` | Metric Builder. |
| `client/src/config/app-pages.ts` | Page list the Dashboard Builder offered. |

## What was removed from the server

Restoring a builder means bringing its routes back too. They are in git
history (`git log --all -- server/routes/dashboard-routes.ts`), in the
commit that added this README:

- `server/routes/dashboard-routes.ts`: `POST/DELETE /api/dashboard-layout`,
  `POST/PUT/DELETE /api/dashboard-metrics`, `GET /api/schema-context`,
  `GET/POST /api/dashboard-config`. These checked only that someone was
  signed in, so any user (outside users included) could rewrite the Home
  dashboard or read the raw schema. Bring them back only behind an Admin
  or section `edit` check.
- `server/routes/audit-and-reports-routes.ts`: `POST /api/custom-reports`,
  `PUT /api/custom-reports/:id`, `POST /api/custom-reports/preview`,
  `GET /api/report-builder/sources`, `GET /api/custom-reports/:id/executions`,
  `POST /api/custom-reports/:id/export-pdf`.
- Permission keys `analytics.report-builder`, `analytics.dashboard-builder`
  and `analytics.metric-builder` were dropped from `PAGE_PERMISSION_KEYS`
  (`shared/permissions.ts`).

## What stayed

- The built-in Home, Support and Accounts dashboards still render through
  `DashboardRenderer`, reading the layouts seeded from
  `server/lib/default-protected-dashboards.ts` (`GET /api/dashboard-layout`).
- `useMetricEngine` still evaluates any custom metrics already saved in
  `dashboard_metrics` (`GET /api/dashboard-metrics`).
- Saved custom reports still run, schedule and email; the field catalog
  and executor in `server/lib/report-fields.ts` are live.
