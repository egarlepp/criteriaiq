# `server/routes.ts` Progressive Extraction — Retrospective

> **Status: ✅ COMPLETE.** Phase 8 ran across 11+ extraction batches and shipped to production. The plan below is preserved as a record of how it landed; do not use it as a forward-looking task list.

## Outcome

`server/routes.ts` went from **25,205 lines** (registering ~583 API handlers) to **808 lines** of orchestration glue (~97% reduction). The bulk now lives in **50 domain-specific `*-routes.ts` files** alongside it, each registering its own slice of handlers via the existing `app.<verb>(...)` pattern. The compiled `dist/routes-*.js` chunk is no longer the largest output bundle.

## Where the routes landed

50 domain route files under `server/` (alphabetical):

```
admin-ai-providers-routes.ts            email-automation-routes.ts
admin-flight-deck-configs-routes.ts     email-configuration-routes.ts
admin-flight-deck-tips-routes.ts        email-preferences-routes.ts
admin-salesforce-routes.ts              email-templates-routes.ts
admin-storage-routes.ts                 end-date-flags-routes.ts
announcements-routes.ts                 evaluation-requests-routes.ts
archive-routes.ts                       gap-analysis-routes.ts
assessments-routes.ts                   industries-routes.ts
assumptions-dependencies-routes.ts      login-management-routes.ts
audit-and-reports-routes.ts             map-management-routes.ts (etc. — see `ls server/*-routes.ts`)
backup-destinations-routes.ts
competitors-routes.ts                   plus the original three:
compliance-routes.ts                      dashboard-routes.ts
configurations-routes.ts                  docs-routes.ts
criteria-dashboard-routes.ts              setup-routes.ts
customers-routes.ts
db-connections-routes.ts
demo-routes.ts
documents-routes.ts
```

Each domain file exports a `register*(app)` function and is called from `server/routes.ts` during boot. The original boot-time registration order was preserved to avoid mounting-order regressions.

## Pattern used

The same pattern that already existed for the original three (`dashboard-routes.ts` / `docs-routes.ts` / `setup-routes.ts`):

```ts
// server/customers-routes.ts
import type { Express } from "express";
import { storage } from "./storage";
import { isAuthenticated } from "./auth/...";

export function registerCustomerRoutes(app: Express) {
  app.get("/api/customers", isAuthenticated, async (req: any, res) => {
    /* ... */
  });
  // ...
}
```

```ts
// server/routes.ts
import { registerCustomerRoutes } from "./customers-routes";
// ...
export async function registerRoutes(app: Express): Promise<Server> {
  // ... boot middleware ...
  registerCustomerRoutes(app);
  registerArchiveRoutes(app);
  registerDemoRoutes(app);
  // ...
}
```

No runtime behavior changed — Express still sees the same handlers in the same order. The split is purely about file ergonomics.

## Why it shipped (vs. the original "abandon if…" criteria)

The original plan flagged three abandon conditions: tree-shaking regressing, tsserver getting slower, and diff readability not improving. None materialized. The compiled production bundle stayed within tolerance, IDE responsiveness on the hub file is significantly better, and PR diffs that touch a single domain now show only the relevant route file.

## Sibling refactors

Phase 7 (`server/storage.ts` split into 28 mixins under `server/storage/`) and Phase 8 (this work) were independent — different files, no shared code paths. Both shipped. See:

- [`storage-split-plan.md`](./storage-split-plan.md) — Phase 7 retrospective
- [`PROJECT_REFERENCE.md`](../../PROJECT_REFERENCE.md) → "Storage Layer Composition" — onboarding text for the mixin pattern

## How to add new routes

Place handlers in the matching domain route file. If the new domain doesn't fit any existing file, create a new `<domain>-routes.ts` and export a `register<Domain>Routes(app)` function, then add the import + registration call in `server/routes.ts`. Avoid putting new handlers directly in `server/routes.ts` itself — that file should stay as orchestration glue (boot middleware + sub-route registration calls).
