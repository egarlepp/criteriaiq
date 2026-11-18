# Field Settings and Industries

**Admin › Projects & Rules** holds the lists the rest of the app picks values
from.

## Field Settings (`/admin?tab=configuration`)

One page with a tab per list. The tabs are the page's `views` in
`client/src/components/layout/sidebar-nav-config.ts`, and
`FieldSettingsSection` shows the list named by `&subtab=`:

| Tab | `subtab` | Endpoints |
| --- | --- | --- |
| Internal Project Status | `project-status` (default) | `/api/status-configs` |
| Account Status | `account-status` | `/api/customer-status-configs` |
| Risk Level | `risk-level` | `/api/risk-level-configs` |
| Ranking | `ranking` | `/api/ranking-configs` |
| Tags | `tags` | `/api/tags` |
| End Date Flags | `end-date-flags` | `/api/end-date-flags` |

All six share one permission, `config.configuration`. Writes need Edit on it
(`requireSectionEdit("config.configuration")` in `configurations-routes.ts`);
Admin always passes. `/admin?tab=configuration` with no `subtab` opens
Internal Project Status, so old links still land on the page.

A "days before" end-date flag can count working days instead of calendar
days; see [`working-calendar.md`](working-calendar.md#end-date-flags).

## Industries (`/admin?tab=industries`)

Its own page and permission, `config.industries` (it used to be the last card
on Field Settings). `IndustriesSection` lists each industry with its icon,
description and the regulations it falls under (or "All Regulations Apply").

- Create, edit and delete need Edit on Industries
  (`requireSectionEdit("config.industries")` in `industries-routes.ts`). These
  routes used to accept any signed-in user.
- Reset to defaults is Admin only and leaves added industries alone.
- `GET /api/industries` stays open: project forms and filters read it.

When the page moved, everyone who had Field Settings got the same level on
Industries (`backfillPermissionKeySplit()`, marker
`backfill.permissions_split_industries.v1`; see
[role-permissions.md](role-permissions.md)).
