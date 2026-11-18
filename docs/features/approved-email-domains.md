# Approved Email Domains

How CriteriaIQ controls which email domains can self-register and which
account a new signup is auto-associated with — plus the per-access-code
domain narrowing that lets a single account hand out scoped invite codes.

> **Audience:** admins managing customer/partner self-service access, and
> developers touching the signup or access-code flow.

---

## The two layers

| Layer | Table | Scope |
|---|---|---|
| **Account / global allowed domains** | `allowed_domains` | A domain is either tied to one account (`accountId`) or global (`accountId = null`) |
| **Per-access-code domain narrowing** | `access_codes.domains` | An optional subset of the linked account's domains a specific code is valid for |

### `allowed_domains` ([`shared/schema/access-control.ts`](../../shared/schema/access-control.ts))

| Column | Notes |
|---|---|
| `domain` | varchar(255), **unique** — e.g. `acme.com` |
| `accountId` | FK → `customers.id`, `ON DELETE SET NULL`. **Null = global** (valid for any account context). |
| `autoApprove` | default `true` — when a signup matches this domain, is the user auto-approved or held for admin review? |
| `isActive` | default `true` — soft on/off without deleting the row |
| `addedBy` | FK → `users.id`, audit of who added it |

Indexed on `domain` and `accountId`.

### `access_codes.domains`

An access code is tied to an account (`associatedAccountId`) and carries
an optional `domains` text array:

> *Email domains this code is valid for (subset of the linked account's
> approved domains). `null` / empty = valid for ALL of the account's
> domains.*

So an account approved for `acme.com` and `acme.co.uk` can mint a code
restricted to just `acme.co.uk` for a regional rollout, without changing
the account's domain set.

---

## How a signup is evaluated

When a user self-registers, the email's domain is checked against
`allowed_domains`:

1. **No matching active domain** → signup is not auto-permitted (falls to
   the standard approval/rejection path).
2. **Matching domain with `autoApprove = true`** → user is approved and
   associated with the domain's `accountId` (or treated as global if the
   match is a global row).
3. **Matching domain with `autoApprove = false`** → user is created but
   held for admin approval.

When the signup came through an **access code**, the code's `domains`
array (if non-empty) further narrows which email domains the code
accepts — the email must match both the account's approved domains *and*
the code's subset.

---

## Admin UI & API

Managed under **Configuration → Login Management → Allowed Domains** (the
"Add Domain" surface). Backed by routes in
[`server/routes/login-management-routes.ts`](../../server/routes/login-management-routes.ts):

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/admin/allowed-domains` | List all allowed domains |
| POST | `/api/admin/allowed-domains` | Add a domain (account-scoped or global) |
| PUT | `/api/admin/allowed-domains/:id` | Edit (domain, account, autoApprove, isActive) |
| DELETE | `/api/admin/allowed-domains/:id` | Remove a domain |

Storage methods live on the relevant mixin (e.g.
`storage.getAllAllowedDomains()`) — see
[`storage-mixin-architecture.md`](../guides/storage-mixin-architecture.md).

The per-access-code domain subset is edited on the access-code form as a
multi-select constrained to the linked account's approved domains.

---

## Operational notes

- **Global rows are powerful.** A domain with `accountId = null` lets
  anyone at that domain self-register against any account context — use
  sparingly, typically only for the operator's own domain.
- **Deleting an account** sets its domains' `accountId` to null
  (`ON DELETE SET NULL`) rather than deleting them — a global leftover.
  Review domains after removing an account.
- **`isActive = false`** is the reversible way to suspend a domain;
  prefer it over delete when you might re-enable.

---

## Related files

| Concern | File |
|---|---|
| Schema | [`shared/schema/access-control.ts`](../../shared/schema/access-control.ts) — `allowedDomains`, `accessCodes` |
| Admin routes | [`server/routes/login-management-routes.ts`](../../server/routes/login-management-routes.ts) — `/api/admin/allowed-domains/*` |
| Account & user lifecycle | [`account-user-management.md`](account-user-management.md) |
