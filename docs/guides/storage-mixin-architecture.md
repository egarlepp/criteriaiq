# Storage Mixin Architecture

How CriteriaIQ's data-access layer is structured, and exactly where to
put a new storage method.

> **Audience:** any developer adding or changing a `storage.<method>()`
> call.

---

## TL;DR

- All data access goes through a single `storage` singleton
  (`DatabaseStorage`). Call sites everywhere use `storage.getProject(...)`,
  `storage.createCustomer(...)`, etc.
- `DatabaseStorage` itself is an almost-empty shell. Its methods are
  composed from **29 domain mixin classes** under `server/storage/`.
- To add a method: find the right domain mixin file, add the method
  there, and you're done — no call-site changes, no registration beyond
  the one-time mixin wiring that already exists.
- **Never** put new data-access methods in route handlers, and avoid
  adding them to `server/storage.ts` directly — that file should stay
  thin.

---

## Why it's split

`DatabaseStorage` was historically a single ~11,500-line class
implementing every data-access method in the app. Phase 7 split it into
per-domain mixins **without changing a single call site** — because every
other module calls methods on the `storage` singleton, the split had to
preserve that exact surface.

The result: `server/storage.ts` went from 11,522 → ~843 lines, and the
class body is now empty. The 29 mixin files under `server/storage/` carry
the implementations: `core`, `criteria`, `products`, `dashboard-stats`,
`users`, `activity`, `requests`, `custom-reports`, `roles`, `audit-risk`,
`infrastructure`, `security`, `dashboard`, `project-resources`, `pcos`,
`validation-criteria-templates`, `industries`, `mfa`, `email`, `map`,
`archive`, `customer-access`, `status-configs`, `end-date-flags`, `tags`,
`seeders`, `value-journey`, `backfills` (plus `core`).

---

## The pattern (TypeScript mixins)

Documented in [`server/storage/_mixins.ts`](../../server/storage/_mixins.ts).
Three moving parts:

1. **Each domain is a class** in `server/storage/<domain>.ts` — e.g.
   `TagsStorageMixin` in `server/storage/tags.ts`.
2. **Declaration merging** adds each mixin's method signatures to the
   `DatabaseStorage` *type* so call sites type-check:
   ```ts
   // server/storage.ts
   export interface DatabaseStorage extends
     TagsStorageMixin,
     EndDateFlagsStorageMixin,
     /* …all 29… */ {}
   ```
3. **`applyMixins(DatabaseStorage, [ TagsStorageMixin, … ])`** runs after
   the class definition and copies each mixin's prototype methods onto
   `DatabaseStorage.prototype` at module load.

At runtime the mixin methods are indistinguishable from methods defined
on the class directly. `this` resolves through the prototype chain, so a
**cross-domain call** like `this.getProjectAuditCount()` from the `core`
mixin reaching into `audit-risk` works fine — even though they live in
different files.

### Cross-mixin type resolution

Because `this.someOtherDomainMethod()` spans files, each mixin that calls
into another declares a small **phantom interface** (e.g.
`AuditCountShape`) describing just the methods it borrows, so `tsc`
resolves the call without a circular import. Two shared helpers live at
[`server/storage/_errors.ts`](../../server/storage/_errors.ts)
(`RestoreUserEmailConflictError`, `sanitizeCustomerFolder`) — extracted
to break an import cycle between `archive.ts` and `storage.ts`.

---

## Adding a method — the recipe

1. **Pick the domain mixin** that matches the method's purpose. Tags →
   `tags.ts`, MFA → `mfa.ts`, reports → `custom-reports.ts`, and so on.
   If the concept is genuinely new, create
   `server/storage/<newdomain>.ts` exporting a `class XStorageMixin`,
   then add it to both the `interface DatabaseStorage extends …` list
   and the `applyMixins(DatabaseStorage, [ … ])` array in
   `server/storage.ts`.
2. **Write the method** on the mixin class. Use bare schema imports
   (`import { tags } from '@shared/schema'`) — always from the barrel,
   never a domain schema file directly.
3. **Calling another domain's method?** Add a phantom interface on your
   mixin declaring the borrowed method's signature so `tsc` is happy
   (see existing examples like `AuditCountShape`).
4. **No call-site or registration changes** beyond step 1's one-time
   wiring for a brand-new domain. Existing domains are already wired.
5. Run `npm run check` — the declaration merge means a typo'd signature
   surfaces at compile time.

---

## Guardrails

- **Route handlers contain no raw SQL or Drizzle queries.** They call
  `storage.<method>()`. Data access belongs in a mixin.
- **`server/storage.ts` stays thin.** Don't add method bodies there —
  the class body is intentionally empty.
- **Barrel imports only** (`@shared/schema`), never
  `@shared/schema/<domain>`.

---

## Related files

| Concern | File |
|---|---|
| Mixin pattern + `applyMixins` | [`server/storage/_mixins.ts`](../../server/storage/_mixins.ts) |
| Shared error/helper extraction | [`server/storage/_errors.ts`](../../server/storage/_errors.ts) |
| Class shell + declaration merge + `applyMixins(...)` | [`server/storage.ts`](../../server/storage.ts) |
| Domain mixins | `server/storage/*.ts` (29 files) |
| Schema barrel (always import from here) | [`shared/schema/index.ts`](../../shared/schema/index.ts) |
