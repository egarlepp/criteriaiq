# Secrets Management

The lifecycle of CriteriaIQ's bootstrap secrets — `SESSION_SECRET` and
`ENCRYPTION_KEY` — and the admin tools for revealing, promoting,
unmanaging, and regenerating them.

> **Audience:** admins operating a self-hosted install.
>
> **Scope:** this guide covers the *lifecycle* (where secrets live, how
> to move and reveal them). For the **rotation mechanics** — the
> transactional re-encryption walk, the dual-key decrypt fallback, forced
> logout — see [`../features/encryption-key-rotation.md`](../features/encryption-key-rotation.md).

---

## The two secrets

| Secret | Protects |
|---|---|
| `SESSION_SECRET` | Signs session cookies. Rotating it invalidates every active session (forced logout). |
| `ENCRYPTION_KEY` | AES-256-GCM master key for all encrypted-at-rest values (MFA secrets, integration tokens, stored credentials — see the encrypted-column manifest). Rotating it re-encrypts all that data. |

---

## Where a secret can live

Each secret is in exactly one of two places at a time:

| Mode | Location | Set how |
|---|---|---|
| **Host-env** | A real environment variable on the container/host | Your deploy config (Docker env, Dokploy, `.env`) |
| **App-managed** | The encrypted app file `data/db-config.json` | "Promote" from the admin UI |

At boot, `hydrateProcessEnvFromBootstrap()` in
[`server/lib/app-config.ts`](../../server/lib/app-config.ts) loads the
app-managed values into `process.env` *before* any module that reads them
(db, auth, mfa, email). It also captures the original host-env values so
an "unmanage" can fall back to them safely.

> **Chicken-and-egg note for `ENCRYPTION_KEY`.** The app file is itself
> protected by `ENCRYPTION_KEY`. Rotating the key therefore re-encrypts
> the *database rows*, not the file — the new key is written to the file
> and used to decrypt DB rows from the next boot. See the rotation doc
> for the full sequence.

---

## The admin operations

All under **System Settings → Bootstrap Secrets**, backed by routes in
[`server/routes/system-routes.ts`](../../server/routes/system-routes.ts) (admin-only):

| Operation | Endpoint | What it does |
|---|---|---|
| **Reveal** | `POST /api/system/secrets/reveal` | Single-shot, audit-logged reveal for a ~10-second copy window. The value is suppressed from access logs and never logged server-side. |
| **Promote** | `POST /api/system/secrets/promote` | Move a secret from host-env into the encrypted app file (app-managed). |
| **Unmanage** | `POST /api/system/secrets/unmanage` | Move it back out to host-env — guarded against the "no host-env fallback exists" edge case so you can't strand the install. |
| **Regenerate** | `POST /api/system/secrets/regenerate` | Generate a new value. For `ENCRYPTION_KEY` this also re-encrypts all data; for `SESSION_SECRET` it forces logout. See the rotation doc. |

A separate `POST /api/system/secrets/reveal-database-url` reveals the
resolved DB connection string under the same single-shot, audit-logged,
not-logged pattern.

The panel also shows, per secret, whether it's currently **app-managed**
or **host-env-managed**, and which database connection the install is
using.

---

## Production hardening

`enforceProductionSecrets()` fails fast in production if `SESSION_SECRET`
or `ENCRYPTION_KEY` is missing **once an approved admin exists** — while
auto-generating safe values during the first-boot bootstrap window so a
fresh install never deadlocks. `server/index.ts` toggles between the
auto-generate (fresh install) and strict fail-fast (post-setup) modes
based on whether an approved admin exists.

The boot-time **data-directory writability probe** (surfaced on System
Health → Environment Variables) catches a read-only `/data` mount before
it can silently break a promote or a rotation persist.

---

## Operational guidance

- **Promote when** you want secrets managed inside the app (rotatable
  from the UI, revealed on demand) rather than baked into deploy config.
- **Keep host-env when** your platform already manages secrets (a vault,
  Dokploy secrets) and you don't want a second source of truth.
- **Back up before rotating `ENCRYPTION_KEY`** — rotation is
  transactional and self-protecting, but a snapshot is cheap insurance.
- **Reveal is audited.** Every reveal writes an audit entry; treat it as
  a sensitive operation.

---

## Related files

| Concern | File |
|---|---|
| Boot hydration, fallback key, rotation status | [`server/lib/app-config.ts`](../../server/lib/app-config.ts) |
| Secret endpoints (reveal/promote/unmanage/regenerate) | [`server/routes/system-routes.ts`](../../server/routes/system-routes.ts) |
| Encrypt / decrypt primitives | [`server/auth/mfaUtils.ts`](../../server/auth/mfaUtils.ts) |
| Rotation mechanics (deep dive) | [`../features/encryption-key-rotation.md`](../features/encryption-key-rotation.md) |
| System Health env tile | [`../features/system-health-dashboard.md`](../features/system-health-dashboard.md) |
