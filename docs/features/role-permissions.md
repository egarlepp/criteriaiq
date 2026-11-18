# Role Management and page permissions

**Admin › Team & People › Role Management** (`/admin?tab=roles`) sets which
pages each role can open. The same editor appears in the Permissions step of
Create User and Edit User. Both follow ImpactIQ's model: one value per page,
listed in the same groups and order as the sidebar.

## How a grant is read

- Every page has its own permission key, listed in `shared/permissions.ts`
  (`PAGE_PERMISSION_KEYS`, in menu order). The client (`usePermissions`) and
  the server (`server/lib/section-permissions.ts`) both read a grant with
  `resolveLevel()` and `levelAllows()` from that file, so they cannot disagree.
- A page's value is the row stored for its key. **A missing row means None.**
  There is no inheritance: a group key such as `analytics` or `config` is
  never read, and nothing is stored for it.
- The Admin role always passes. Admin-only pages (Terminology, Appearance,
  Storage Providers, Webhooks, Error Log, Page Usage, Backup & Restore, Flight
  Deck, System Announcements)
  are listed with an "Admin only" badge and can't be granted.

## Levels

| Key | Levels |
| --- | --- |
| Every page | None, View, Edit |
| Account Portal (`customer`) | None, View Assigned, View All, Edit Assigned, Edit All |
| Data visibility (`impactiq_cost`, SE cost on the SE Effort card) | None, View |

The Account Portal keeps scoped levels because partners and outside users see
only the accounts they are assigned to (`accountPortalAccess()` returns the
scope and whether they may edit).

## The editor

`client/src/lib/permission-tree.ts` builds the rows from `SIDEBAR_NAV`:

- Each sidebar group (Home, Work, Library, Insights, Help) is a group; each
  Admin category (Projects & Rules, Team & People, Workplace, Integrations,
  Monitoring & Audit, Demo) is its own group under "Admin".
- Menu entries that share one key (the views of one page, such as Manage
  Projects, Project Board and Schedules) are one row.
- A menu entry with pages under it has a **Set all** control that writes each
  of its pages; it shows "Mixed" when they differ. Each group heading has one
  too when its pages share a scale.

`client/src/components/configuration/PermissionTreeEditor.tsx` renders it and
`RolePermissionsSummary.tsx` lists a role's granted pages.

## Roles and users

- Role permissions are the defaults a new user starts with. `POST /api/users`
  copies the role's rows onto the new account, and an Admin can change them in
  the same dialog (saved with `PUT /api/user-permissions/:userId`).
- In Edit User, the dialog shows the user's own values. Changing the user's
  role there starts the editor from the new role's defaults.
- Saving a role that users already have asks first: "Update N users with
  this role?". Confirming saves the role and replaces those users' page
  permissions with the role's values, in one transaction
  (`PUT /api/roles/:id/permissions` with `applyToUsers: true`,
  `setRolePermissionsAndApplyToUsers()`). Individual changes made to those
  users are replaced too. Cancel goes back to the editor without saving.
- Only an Admin can save role or user permissions. Both save routes check the
  list with `validatePermissionPayload()`: known keys, a level the key takes,
  no duplicates. None rows are dropped.

## Adding a page

1. Give the sidebar entry a `section` key in `sidebar-nav-config.ts`.
2. Add the key to `PAGE_PERMISSION_KEYS` in `shared/permissions.ts`, at its
   menu position.
3. Check it on the page and its routes with that key.

`client/src/lib/__tests__/permission-tree.test.ts` fails when the editor and
the shared list differ, and `permission-keys-in-use.test.ts` fails when code
checks a key nobody can grant.

## The move from group keys (one-time backfill)

Before this, a page without its own row fell back to its group's row (or
"inherit"), a group set to None hid every page under it, and some keys covered
several pages. `backfillPermissionPageValues()` (`server/storage/backfills.ts`,
marker `backfill.permissions_page_values.v1`) rewrote every user and role once
with `toPageValues()`, so everyone keeps the access they had:

- each page gets the value it resolved to under the old rules;
- keys that were split start from the old key's value (`PERMISSION_KEY_SPLITS`:
  System Settings → Outcome Configuration, Calendar, Database Connection; User
  Management → Roles, Login Management, Login History; Integrations →
  Salesforce, HubSpot, Email Settings, AI Providers, n8n, MCP Server; Accounts
  → Team & Users; Field Settings → Industries);
- the old Admin level became Edit; on the Account Portal, Admin and Edit
  became Edit All.

The marker row keeps the previous rows, so the change can be undone by hand.

## Pages split later

A page split off another after that backfill ran gets its own one-time copy,
`backfillPermissionKeySplit(marker, toKey, fromKey)` in
`server/storage/backfills.ts`, called at boot from `server/index.ts`: every
user and role with the old key and no row for the new one gets the old key's
level. Add the pair to `PERMISSION_KEY_SPLITS` too, so an install that has not
run the page-values backfill yet gets it there. So far: Industries
(`config.industries`, from Field Settings, marker
`backfill.permissions_split_industries.v1`).
