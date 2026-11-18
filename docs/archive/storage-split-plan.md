# `server/storage.ts` Split — Retrospective

> **Status: ✅ COMPLETE.** Phase 7 ran #1–#28 across two sessions and shipped to production. The plan below is preserved as a record of how it landed; do not use it as a forward-looking task list.

## Outcome

`server/storage.ts` went from **11,522 lines** to **843 lines** (–93%). The class body is now an empty composition shell:

```ts
export class DatabaseStorage {
  public db: Database = db;
  public schema: typeof schema = schema;
}
```

Every method comes from a domain mixin under `server/storage/`, composed back via interface declaration-merge plus the runtime `applyMixins(DatabaseStorage, [...])` helper (`server/storage/_mixins.ts`).

## Where the code landed

28 mixin files under `server/storage/`:

| Mixin | Methods (approx) | Notes |
|---|---|---|
| `core` | 10 | User get/upsert, Dashboard Metrics, Project (POC) ops + getProjects |
| `criteria` | 28 | Success Criteria, Components, Activity Log |
| `products` | 30 | Products + Hierarchical relations + ExecutionPlan |
| `dashboard-stats` | 2 | getDashboardStats, getMapDashboardStats |
| `users` | 22 | User Permissions, admin User CRUD, Password mgmt, UserAccount |
| `activity` | 10 | User Board Prefs, Kanban Audit Events, Project Activities, Sessions |
| `requests` | 14 | Eval Requests, Support Requests, support analytics + trends |
| `custom-reports` | 12 | Custom Reports CRUD + dynamic preview/execute |
| `roles` | 12 | Role + RolePermission CRUD, getUsersByRole |
| `audit-risk` | 22 | Project Audit, Assessment Rulesets, Risk Criteria/Alerts |
| `infrastructure` | 10 | Asset filesystem, Project Templates, Storage Configuration |
| `security` | 22 | Allowed Domains, Access Codes, Assumption seeder |
| `dashboard` | 14 | Dashboard Layouts/Configs, System Settings, table-sync seeder |
| `project-resources` | 32 | Customer CRUD, Audit Logins, Documents/Links/Code Scripts |
| `pcos` | 14 | Project Closure Outcome CRUD + OutcomeConfig + statistics |
| `validation-criteria-templates` | 8 | VCT CRUD + flattenTemplateLinks |
| `industries` | 14 (+ 3 seeders) | Industry CRUD, Compliance Regulations, canonical seed data |
| `mfa` | 16 | MFA recovery codes, MFA core, WebAuthn, Admin MFA |
| `email` | 17 | Email Logs/Templates/Designs/Configuration |
| `map` | 30 | MAP templates, project-MAP CRUD, cascading status/assignment |
| `archive` | 17 (+ 2 helpers) | Archive/restore for users/projects/customers |
| `customer-access` | 6 | Project-level customer access |
| `status-configs` | 17 | Status / RiskLevel / Ranking / CustomerStatus configs |
| `end-date-flags` | 6 | EndDateFlags CRUD + seeder |
| `tags` | 9 | Tag CRUD + system-tag seeder |
| `seeders` | (top-level) | seedDefaultRoles, seedSystemEmailTemplates, etc. |
| `vrl` | (top-level) | Value Realization Lifecycle helpers |
| `backfills` | (top-level) | backfillProjectNames, backfillFieldSettingsDefaults |

Plus two shared helpers at `server/storage/_errors.ts` (`RestoreUserEmailConflictError` + `sanitizeCustomerFolder`) — extracted to break the import cycle between `archive.ts` and `storage.ts`.

## Pattern used

The mixin pattern documented in `server/storage/_mixins.ts`:

1. Each domain becomes a class in `server/storage/<domain>.ts` (e.g. `TagsStorageMixin`).
2. `DatabaseStorage` declares the mixin's methods via interface declaration-merge:
   ```ts
   export interface DatabaseStorage extends TagsStorageMixin, EmailStorageMixin, ... {}
   ```
3. After class definition, `applyMixins(DatabaseStorage, [...])` copies the prototype methods at module load time.

Cross-mixin calls (e.g. `core` reaching into `audit-risk` for `getProjectAuditCount`) work through the prototype chain at runtime; tsc resolves them via small phantom `interface X extends Shape {}` declarations on each mixin (e.g. `AuditCountShape`, `ProductsLinkShape`, `UserCrudShape`).

## What was abandoned vs. shipped

Strategy 1 (re-exporting top-level standalone functions) was used for `vrl`, `seeders`, and `backfills` (Phase 7 #1–#3). Strategy 2 (mixin pattern) was used for the remaining 25 extractions (#4–#28) and is now the documented convention.

The doc-overhang flagged in the original plan ("if tree-shaking gets worse / tsserver gets slower / diffs don't improve") did not materialize — production bundle sizes are unchanged and IDE responsiveness on `storage.ts` is significantly better.

## How to add new methods

Place the method in the matching mixin file. Avoid putting new methods in `server/storage.ts` itself — that file should stay thin. If the new domain doesn't fit any existing mixin, create a new mixin under `server/storage/<domain>.ts` and wire it into `storage.ts` (one new import, one entry in the interface-merge, one entry in `applyMixins`).

See `PROJECT_REFERENCE.md` → **Storage Layer Composition** for the canonical onboarding text.
