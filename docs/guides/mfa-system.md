# Multi-Factor Authentication (MFA) System Documentation

> Last reviewed against the codebase on 2026-04-29 (task #669). Whenever
> the auth surface changes — a new factor, a new audit tag, a new
> rate-limit code, a new cookie name — update the corresponding section
> below in the same PR. The numbered task references (e.g. *Task #611*)
> map back to the in-code comments so a reader can always find the
> committed rationale.

## Overview

The CriteriaIQ MFA system provides multi-factor authentication built
around three factor types — TOTP, single-use recovery codes, and
WebAuthn passkeys — plus role-based enforcement, full audit logging,
and a six-locale operator UI. The system is designed to fail closed:
every gate that protects access is wired so that an unexpected error
defaults to "require MFA" rather than "let the user through".

Three things that distinguish this implementation from the off-the-
shelf "TOTP plugin" pattern:

1. **Passkeys are a first-class login factor, not just a step-up factor.**
   The `/api/mfa/challenge` endpoint accepts a WebAuthn assertion in
   the same request that would otherwise carry a TOTP code or a
   recovery code — there is no separate `/api/webauthn/login/*` path.
   See *Task #599* for the rationale.
2. **All rate-limit budgets live in Postgres, not in process memory.**
   A rolling restart no longer wipes an attacker's lockout. A
   multi-worker deployment shares one budget across workers. See
   *Task #630* and the `auth_rate_limits` table.
3. **WebAuthn challenges are stateless HMAC-signed HttpOnly cookies,
   not session rows.** The begin and finish halves of every WebAuthn
   ceremony can land on different workers (or survive a process
   restart between the two) without breaking. See *Tasks #611, #623,
   #624, #654*.

## System Architecture

### Core Components

**Backend (`server/auth/`):**

- `server/auth/simpleAuth.ts` — wires every auth route into the Express
  app. Owns `/api/login`, `/api/register`, `/api/logout`,
  `/api/auth/user`, the `/api/webauthn/register/*` enrollment routes
  (self + admin variants), the `/api/admin/users/.../security` admin
  surface, and the `/api/users/me/*` profile endpoints. Also exports
  the rate-limit constants and the WebAuthn challenge-cookie helpers
  shared with `mfaChallengeRoute.ts`.
- `server/auth/mfaUtils.ts` — pure crypto + helper layer: TOTP
  encryption (`encryptText` / `decryptText`), TOTP code verification
  (`verifyTotpCode`), recovery-code generation and constant-time match
  (`generateRecoveryCodes`, `findMatchingUnusedRecoveryCode`),
  WebAuthn helpers, signed temp-token issuance (`generateTempToken` /
  `verifyTempToken`), the security-health calculator
  (`calculateSecurityHealth`), the recovery-codes-low evaluator
  (`evaluateRecoveryCodesWarning`, threshold = 3), and the
  Postgres-backed rate-limit primitives (`checkRateLimit`,
  `recordAttemptResult`, `getRateLimitResetTime`).
- `server/auth/mfaChallengeRoute.ts` — owns `/api/mfa/challenge` and
  the matching `/api/webauthn/authenticate/{begin,cancel}` routes.
  Handles the second-factor verification for TOTP, recovery codes,
  and passkeys against the same temporary-token contract issued by
  `/api/login`.
- `server/storage/mfa.ts` — Drizzle data access for MFA recovery codes,
  WebAuthn credentials, trusted devices, MFA events, and the
  Admin MFA Management surface (Phase 7 mixin).
- `server/storage/users.ts` — User CRUD + `getUserByEmail` (case-
  insensitive) used by the login flow.
- `server/storage/activity.ts` — `getAuditLoginsByUserId` for the
  per-user login audit trail.

**Frontend (`client/src/components/security/`):**

- `MFASetupDialog.tsx` — the four-tab enrollment / management dialog
  (Status, Setup, Recovery, Passkeys). Doubles as the admin-mode
  surface when a `userId` prop is passed in.
- `MFAChallengeDialog.tsx` — second-factor prompt shown after a
  successful password submission. Tabs for TOTP / Recovery / Passkey,
  attempts counter, lockout banner, post-login recovery-codes-low
  callout.
- `MFAEnforcementDialog.tsx` — the "Security Setup Required" gate
  shown to operators (Admin / Engineer roles) whose role requires MFA
  but who have not yet completed setup. Renders inside `<AuthShell>`
  so the page chrome (theme toggle, language switcher, version
  footer) stays visible. Cannot be dismissed; the parent router
  short-circuits on `isMfaRequired` (*Tasks #583, #432*).
- `MFAManagement.tsx` — admin table of every user's security status,
  with filter / sort / per-user actions (view detail, force setup,
  reset MFA).
- `SecurityHealthBadge.tsx` — color-coded green/amber/red badge.
- `SecurityJourney.tsx` — visual checklist of the security setup
  steps a given user has completed.
- `SecurityStatusDrawer.tsx` — slide-over panel summarising the
  current operator's security posture.
- `SecurityShieldButton.tsx` — header trigger that opens the drawer.

**Security infrastructure:**

- AES-256-GCM encryption for TOTP secrets, key from `ENCRYPTION_KEY`.
- bcrypt hashing for recovery codes and trusted-device tokens.
- Per-account / per-IP / per-MFA-user rate-limit buckets stored in
  the `auth_rate_limits` Postgres table (*Task #630*), with an
  in-process Map fallback used only when the DB is unreachable.
- Signed temporary tokens (`mfa_required`) carrying the user id +
  intent, validated on the challenge route.
- HMAC-signed HttpOnly cookies (`mfa_login_challenge`,
  `webauthn_register_challenge`, `webauthn_register_admin_challenge`,
  TTL = 5 minutes) carry WebAuthn challenges between the begin and
  finish halves of each ceremony.
- WebAuthn integration via `@simplewebauthn/{server,browser}`.

## Features

### 1. TOTP Authentication
- **Secret generation** — cryptographically secure secrets via
  `otplib`.
- **QR code generation** — automatic QR code for authenticator-app
  enrollment, with a manual entry key as fallback.
- **Time window tolerance** — ±30 seconds default to absorb clock
  drift between the server and the user's device.
- **Encryption** — TOTP secrets are stored in `users.totp_secret_enc`
  encrypted at rest with AES-256-GCM (`encryptText` /
  `decryptText` in `mfaUtils.ts`). The plaintext only ever exists in
  memory during the verify step.

### 2. Recovery Codes
- **High-entropy generation** — `crypto.randomBytes(16)` (128 bits)
  per code, ten codes per regeneration.
- **Format** — human-readable
  `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`.
- **Single use** — verified codes are stamped with `used_at = NOW()`
  inside the same request that authenticates them, so a replay
  attempt finds the row filtered out by the `IS NULL` guard
  (*Task #595*).
- **Storage** — bcrypt-hashed (cost factor 10); the plaintext is
  shown to the user exactly once at generation time.
- **Wired into the challenge route** — supplying a `recoveryCode` in
  the `/api/mfa/challenge` body satisfies the second factor and burns
  the code (*Task #595*).
- **Low-count nudge** — every successful MFA login (TOTP, recovery,
  or passkey) returns `recoveryCodesRemaining` and `recoveryCodesLow`
  in the response body. The dialog surfaces a regenerate prompt when
  `remaining < RECOVERY_CODES_LOW_THRESHOLD` (= 3). Recovery-code
  logins also pivot to a confirmation screen showing the remaining
  count before continuing into the app (*Tasks #602, #615, #632*).

### 3. WebAuthn Passkeys
- **Platform + roaming authenticators** — biometrics, hardware keys,
  hybrid (cross-device) flows.
- **Stateless challenges** — registration and login challenges are
  HMAC-signed and ride in HttpOnly cookies scoped to the matching
  finish path. They survive process restarts and multi-worker
  deployments without sticky sessions (*Tasks #611, #623*).
- **First-class login factor** — supplying a WebAuthn assertion in
  the `/api/mfa/challenge` body is a complete login, peer to TOTP
  and recovery codes (*Task #599*). The token is no longer carried
  in the request body — it is read from the signed cookie set by
  `/api/webauthn/authenticate/begin` (*Task #624*).
- **Self + admin enrollment share one helper** — the four
  `/api/webauthn/register/{begin,finish}[/:userId]` routes are thin
  wrappers around `handleWebAuthnRegister{Begin,Finish}` so the two
  flows can no longer drift in subtle ways (*Task #654*).
- **Cancel endpoints** —
  `POST /api/webauthn/authenticate/cancel` (*Task #634*) and
  `POST /api/webauthn/register/cancel[/:userId]` (*Task #652*) drop
  the matching challenge cookie when the user backs out of the flow
  before finish runs.

### 4. Trusted Devices
- **30-day trust period** — opt-in checkbox on the challenge dialog.
- **Secure tokens** — `crypto.randomBytes(32)` (256-bit), bcrypt
  hashed in `trusted_devices.token_hash`.
- **Cookie** — `trusted_device` HttpOnly, `secure` in production,
  30-day max age.

### 5. Security Health Calculation
Three-tier health label (`green` / `amber` / `red`) computed by
`calculateSecurityHealth` in `mfaUtils.ts` from
`(enabled, method, enrolledAt, recoveryCount, passkeyCount)`:

- **RED** — MFA is not enabled. The flag flips green/amber the
  moment `mfa_enabled` becomes true; from there the only remaining
  question is whether the operator also has recovery codes and a
  passkey.
- **AMBER** — MFA is enabled but the operator is missing recovery
  codes, missing at least one passkey, or both. This is the default
  state immediately after TOTP enrollment.
- **GREEN** — MFA is enabled AND the operator has at least one
  unused recovery code AND at least one registered passkey.

The label is what `MFAEnforcementDialog` uses to decide whether to
gate the operator: a required role (Admin / Engineer) sitting on
`red` is what trips `mfaSetupRequired = true` on `/api/auth/user`.

### 6. Post-Login Enforcement Gate (Task #583)
After a successful login (with or without MFA), `/api/auth/user`
returns `mfaSetupRequired: true` for any required-role operator
whose security health is `red`. The router short-circuits on this
flag and renders `MFAEnforcementDialog` instead of the app — the
operator cannot navigate away until they finish setup. Page chrome
(theme toggle, language switcher, Get Help, version footer) is
provided by `<AuthShell>` so the gate doesn't feel like a modal
trap (*Task #432*).

### 7. Admin Management
- **User MFA status** — paginated, filterable, sortable list with
  per-user health badges and last-login info.
- **Admin-initiated setup** — admins can begin TOTP enrollment or
  passkey registration on behalf of another user via the
  `:userId`-suffixed route variants.
- **Force setup / reset** — `/api/admin/users/:id/mfa/require-setup`
  flags an operator's account so the next sign-in lands on the
  enforcement gate; `/api/admin/users/:id/mfa/reset` clears MFA
  entirely.
- **Audit trail** — every successful and failed authentication is
  written to `audit_logins` with the resolved `loginMethod` tag (see
  *Audit Logging* below).

### 8. Internationalisation
The MFA UI ships in six locales (English, Spanish, French, German,
Italian, Portuguese-BR). Translation keys live under
`security.mfa.*` and are loaded by the `react-i18next` configuration
in `client/src/i18n/index.ts`. Operator-visible strings — error
toasts, challenge labels, enforcement-gate copy, recovery-code
download filename — are all localised.

## User Experience Flows

### Initial MFA Setup

```
1. Operator signs in (password)
       │
       ▼
2. /api/auth/user returns mfaSetupRequired = true (required role,
   security health = red)
       │
       ▼
3. Router renders <MFAEnforcementDialog> inside <AuthShell>
       │
       ▼
4. Operator clicks "Set up MFA" → <MFASetupDialog isEnforcementMode>
       │
       ▼
5. Status tab → Setup tab → scan QR / enter manual key →
   verify TOTP code → MFA enabled (security health = amber)
       │
       ▼
6. Recovery tab → ten codes shown once → operator downloads
   the .txt file → "what to do next" callout appears
       │
       ▼
7. Passkeys tab → register a platform / roaming authenticator →
   security health = green
       │
       ▼
8. onComplete() → router lifts the gate → app loads
```

### Login with MFA Challenge

```
1. POST /api/login {email, password}
       │
       ├─ rate-limited?  → 429 LOGIN_RATE_LIMITED + Retry-After
       ├─ wrong creds?   → 401 + audit row (failureReason)
       │
       ▼
2. mfaEnabled?
       ├─ no  → session created → 200 {user}
       └─ yes → 200 {requiresMfa: true, temporaryToken, userEmail}
       │
       ▼
3. <MFAChallengeDialog> opens; operator picks tab:
       • TOTP code      → POST /api/mfa/challenge {type:'totp', code, temporaryToken}
       • Recovery code  → POST /api/mfa/challenge {type:'recovery', recoveryCode, temporaryToken}
       • Passkey        → POST /api/webauthn/authenticate/begin (sets mfa_login_challenge cookie)
                          → assertion → POST /api/mfa/challenge {assertion, ...}
       │
       ├─ rate-limited? → 429 MFA_CHALLENGE_RATE_LIMITED + Retry-After
       ├─ invalid?      → 400 + audit row + attempts counter decrements
       │
       ▼
4. Session created · audit row (loginMethod = mfa-totp / mfa-recovery /
   mfa-webauthn) · trusted device cookie if requested · response body
   carries recoveryCodesRemaining / recoveryCodesLow when applicable
```

### Admin MFA Management

```
1. /admin/security → GET /api/admin/users/security?search&role&health&page
       │
       ▼
2. Operator row → GET /api/admin/users/:id/security
       │
       ▼
3. Per-user actions:
       • View detail (SecurityJourney + audit timeline)
       • Require setup → POST /api/admin/users/:id/mfa/require-setup
       • Reset MFA      → POST /api/admin/users/:id/mfa/reset
       • Manage passkeys → POST /api/webauthn/register/begin/:userId etc.
```

## Security Implementation

### Encryption and Hashing

**TOTP Secret Encryption (AES-256-GCM):**
```typescript
// Required env var: 64 hex characters (32 bytes)
ENCRYPTION_KEY=<openssl rand -hex 32>

// Encryption (mfaUtils.ts → encryptText)
const key = Buffer.from(ENCRYPTION_KEY, 'hex');
const iv  = crypto.randomBytes(12); // 96-bit IV per GCM spec
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
// Ciphertext format on disk: <iv>:<ciphertext>:<authTag>  (all hex)
```

**Recovery Code Hashing (bcrypt):**
```typescript
// Generation: crypto.randomBytes(16) → 128 bits per code
// Format:     XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
// Storage:    bcrypt.hash(code, 10) into mfa_recovery_codes.code_hash
// Verify:     findMatchingUnusedRecoveryCode() — constant-time bcrypt
//             match across the user's IS NULL used_at rows.
```

**Trusted-Device Tokens:**
```typescript
// Generation: crypto.randomBytes(32) → 256-bit
// Storage:    bcrypt.hash(token, 10) into trusted_devices.token_hash
// Cookie:     trusted_device (HttpOnly, secure in prod, 30 days)
```

**WebAuthn Challenge Cookies:**
```typescript
// Login:        mfa_login_challenge                scoped to /api/mfa/challenge
// Self enroll:  webauthn_register_challenge       scoped to /api/webauthn/register/finish
// Admin enroll: webauthn_register_admin_challenge scoped to /api/webauthn/register/finish/:userId
//
// Each cookie value is an HMAC-signed envelope of {challenge, userId,
// expiresAt}. The finish handler reconstructs the expected challenge
// from the cookie and verifies the signature before handing it to
// SimpleWebAuthn — there is no server-side state to look up.
// TTL = 5 minutes (REGISTER_WEBAUTHN_CHALLENGE_COOKIE_MAX_AGE_MS).
```

### Rate Limiting

**Three buckets, all in `auth_rate_limits`:**

| Bucket key                       | Limit | Window | Set on        | Reset on       |
| -------------------------------- | ----- | ------ | ------------- | -------------- |
| `login:email:<email>`            | 10    | 15 min | /api/login    | success        |
| `login:ip:<ip>`                  | 30    | 15 min | /api/login    | success        |
| `mfa_challenge:<userId>`         | 5     | 15 min | /api/mfa/challenge | success   |

The constants live alongside the routes:

- `LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_EMAIL = 10` (simpleAuth.ts)
- `LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP   = 30` (simpleAuth.ts)
- `LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000` (simpleAuth.ts)
- `MFA_CHALLENGE_RATE_LIMIT_MAX_ATTEMPTS = 5` (mfaChallengeRoute.ts)
- `MFA_CHALLENGE_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000` (mfaChallengeRoute.ts)

**Why three buckets?** The MFA challenge route already capped repeated
bad TOTP / passkey codes per user. Before *Task #616* the password
endpoint — the *front door* — accepted unbounded attempts and only
the `audit_logins` rows piled up. The per-account bucket stops the
"hammer one known email" attack; the per-IP bucket stops the "spray
across many accounts from one host" attack; the per-user MFA bucket
stops the "got the password, now brute force the second factor"
attack. All three are checked before doing the expensive work.

**Persistence (Task #630):** the buckets used to live in a process-
local `Map<string, { failedCount, resetTime }>`. A rolling restart
wiped every locked-out attacker, and a multi-worker deployment let
an attacker pivot between workers. They now live in the
`auth_rate_limits` Postgres table; the same primitives keep an
in-memory fallback for the case where the DB is unreachable (setup
wizard, tests, transient hiccups), so the failure mode is "fall
back to the old behaviour" rather than "open the gate".

**429 responses** carry a stable machine-readable code so the
front-end can branch on the lockout case without parsing the
human-readable message:

```json
{
  "message": "Too many login attempts. Please try again later.",
  "code": "LOGIN_RATE_LIMITED",
  "retryAfterSeconds": 873
}
```

Same pattern on the MFA route with `MFA_CHALLENGE_RATE_LIMITED`
(*Tasks #629, #637*). Both responses also set the `Retry-After`
header (RFC 9110 §10.2.3, integer seconds, rounded up). `apiRequest`
on the client packages this into an `ApiError` carrying `.status` and
`.details` so the dialog can render an honest "wait N minutes"
banner instead of the generic "invalid credentials" fallback.

### WebAuthn Configuration

**Registration options:**
- `rpID` from `WEBAUTHN_RP_ID` (env)
- `rpName` from `WEBAUTHN_RP_NAME` (env)
- `userVerification: "required"`
- `attestationType: "none"` (privacy)
- Algorithms: ES256 (-7) and RS256 (-257)
- 60-second user-interaction timeout

**Authentication options:**
- `userVerification: "required"`
- `allowCredentials` is the user's registered credential allowlist
- Transport methods: USB, NFC, BLE, Internal, Hybrid

**Counter check:** every successful assertion bumps
`webauthn_credentials.counter` so a replay of the same assertion is
rejected by SimpleWebAuthn's counter logic on the next attempt.

## Database Schema

Schema definitions live in `shared/schema/auth.ts` (split-module —
the rest of the schema is composed under `shared/schema/`).

### `users` (MFA columns only)

```sql
mfa_enabled                BOOLEAN DEFAULT FALSE
mfa_method                 VARCHAR              -- 'totp' | 'webauthn' | NULL
totp_secret_enc            TEXT                 -- AES-256-GCM ciphertext
mfa_enrolled_at            TIMESTAMP
security_setup_required    BOOLEAN DEFAULT FALSE
password_history           TEXT[] NOT NULL DEFAULT ARRAY[]::text[]
force_password_change      BOOLEAN DEFAULT FALSE
```

### `mfa_recovery_codes`

```sql
id          VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()
user_id     VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE
code_hash   TEXT NOT NULL                     -- bcrypt
used_at     TIMESTAMP                         -- NULL = unused
created_at  TIMESTAMP DEFAULT NOW()
INDEX idx_mfa_recovery_codes_user (user_id)
```

### `webauthn_credentials`

```sql
id             VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()
user_id        VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE
credential_id  TEXT UNIQUE NOT NULL              -- base64url
public_key     TEXT NOT NULL                     -- base64url
counter        INTEGER NOT NULL DEFAULT 0
transports     TEXT
device_name    TEXT
created_at     TIMESTAMP DEFAULT NOW()
```

### `trusted_devices`

```sql
id          VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()
user_id     VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE
token_hash  TEXT NOT NULL                       -- bcrypt
user_agent  TEXT
ip          TEXT
created_at  TIMESTAMP DEFAULT NOW()
expires_at  TIMESTAMP NOT NULL
```

### `auth_rate_limits` (Task #630)

```sql
bucket_key    VARCHAR PRIMARY KEY            -- e.g. login:email:foo@x, mfa_challenge:<userId>
failed_count  INTEGER NOT NULL DEFAULT 0
reset_at      TIMESTAMPTZ NOT NULL
updated_at    TIMESTAMPTZ DEFAULT NOW()
INDEX idx_auth_rate_limits_reset_at (reset_at)
```

The `idx_auth_rate_limits_reset_at` index supports the periodic
cleanup query that purges expired rows so the table doesn't grow
unbounded — the auth path itself looks rows up by primary key, so
it doesn't need this index.

### `audit_logins`

```sql
id              SERIAL PRIMARY KEY
user_id         VARCHAR NOT NULL                -- soft ref (FK dropped in migration 036)
user_email      VARCHAR NOT NULL
user_name       VARCHAR NOT NULL
login_time      TIMESTAMP DEFAULT NOW()
ip_address      VARCHAR
user_agent      VARCHAR
session_id      VARCHAR
login_method    VARCHAR DEFAULT 'email'         -- see "Audit Logging" below
success         BOOLEAN DEFAULT TRUE
failure_reason  VARCHAR
created_at      TIMESTAMP DEFAULT NOW()
```

### `mfa_events`

```sql
id          VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()
user_id     VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE
event_type  VARCHAR NOT NULL
meta        JSONB
created_at  TIMESTAMP DEFAULT NOW()
INDEX idx_mfa_events_user (user_id)
INDEX idx_mfa_events_type (event_type)
```

### `user_sessions`

Tracks one row per active browser session for the "Sessions" tab in
the profile editor and the admin "Active sessions" surface. Created
inside `recordSuccessfulLogin` so MFA-gated and password-only logins
both contribute.

```sql
id           VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()
user_id      VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE
session_id   VARCHAR UNIQUE NOT NULL
device_name  VARCHAR
browser      VARCHAR
os           VARCHAR
ip_address   VARCHAR
user_agent   TEXT
last_active  TIMESTAMP DEFAULT NOW()
created_at   TIMESTAMP DEFAULT NOW()
```

## Audit Logging

Every authenticated and unauthenticated attempt at the auth surface
writes one row to `audit_logins`. The shared helpers in
`server/auth/simpleAuth.ts` are the only call paths so the row shape
stays consistent across the password endpoint, the MFA challenge
route, and the WebAuthn enrollment flows:

- `recordSuccessfulLogin(req, user, loginMethod)` — sets `success =
  true`, increments `users.login_count`, writes `users.last_login`,
  inserts the matching `user_sessions` row.
- `recordFailedLogin(req, identity, loginMethod, failureReason)` —
  sets `success = false` with the supplied human-readable reason.
- `recordWebAuthnEnrollmentAudit(...)` — separate event for passkey
  registration that does NOT establish a session (it's an enrollment
  side-effect of an already-authenticated request).

**`loginMethod` values written to `audit_logins.login_method`:**

| Value                  | Set by                                   |
| ---------------------- | ---------------------------------------- |
| `email`                | password-only `/api/login` (no MFA gate) |
| `auto-login`           | dev-only demo account branch             |
| `mfa-totp`             | TOTP success on `/api/mfa/challenge`     |
| `mfa-recovery`         | recovery-code success on `/api/mfa/challenge` |
| `mfa-webauthn`         | passkey assertion success on `/api/mfa/challenge` |
| `webauthn-enroll-self` | self-mode passkey registration finish    |
| `webauthn-enroll-admin`| admin-mode passkey registration finish (logs both the admin actor and the target user) |

**Failure-reason strings** that show up in the Recent Logins surface
include `"Unknown email"`, `"Account pending approval"`, `"Account
setup incomplete"`, `"Invalid password"`, `"Too many login attempts"`
(the rate-limit lockout — *Task #616*), `"Invalid MFA verification
code"`, `"Invalid MFA recovery code"`, `"Invalid passkey assertion"`,
`"Unknown passkey for this account"`, and `"Passkey challenge
expired — please try again"`. The MFA challenge route also writes
a dedicated `mfa_rate_limited` row when its 5-attempts/15-minute
ceiling fires (*Task #613*) so admins reviewing a brute-force streak
can see the ceiling fired, not just silence after N bad guesses.

## API Reference

### User Endpoints

**GET `/api/me/security`**
Returns the current user's MFA status enriched with the calculated
security health.
```json
{
  "enabled": true,
  "method": "totp",
  "enrolledAt": "2026-04-12T18:34:11Z",
  "recoveryCount": 7,
  "passkeyCount": 1,
  "securityHealth": { "health": "green", ... }
}
```

**POST `/api/mfa/totp/setup`**
Begins TOTP enrollment for the current user. Generates the secret,
encrypts it into `users.totp_secret_enc`, and returns the data the
client needs to render the QR code:
```json
{
  "otpauthUrl":   "otpauth://totp/...",
  "qrPngDataUrl": "data:image/png;base64,...",
  "secret":       "JBSWY3DPEHPK3PXP"
}
```
No recovery codes are issued at this stage — they are minted by
`/verify` once the operator has proven they can read codes from
their authenticator app.

**POST `/api/mfa/totp/verify`**
Completes TOTP enrollment. Body `{ code: string }`. Verifies the
code against the encrypted secret persisted by `/setup`, mints ten
fresh recovery codes (bcrypt-hashed into `mfa_recovery_codes`),
flips `users.mfa_enabled = true`, sets `mfa_method = 'totp'`,
stamps `mfa_enrolled_at`, and clears `security_setup_required`.
Returns the plaintext recovery codes to the client exactly once so
the operator can download them.

**POST `/api/mfa/challenge`** *(routed by `mfaChallengeRoute.ts`)*
Verifies the second factor against a temporary token. The body shape
depends on the factor:

```jsonc
// TOTP
{ "type": "totp", "code": "123456",
  "temporaryToken": "...", "rememberDevice": false }

// Recovery code
{ "type": "recovery", "recoveryCode": "AAAA-BBBB-...-HHHH",
  "temporaryToken": "...", "rememberDevice": false }

// Passkey assertion (token also read from mfa_login_challenge cookie)
{ "type": "webauthn", "assertion": <PublicKeyCredentialJSON>,
  "temporaryToken": "...", "rememberDevice": false }
```

Success response (all three branches):
```json
{
  "message": "Authentication successful",
  "recoveryCodesRemaining": 4,   // optional, when user has codes
  "recoveryCodesLow": false       // true when remaining < 3
}
```

Failure responses:
- `400 { message: "Invalid verification code" }` — wrong code / wrong
  recovery code / unknown passkey / failed assertion. Increments the
  per-user MFA attempts counter and writes an `audit_logins` row.
- `429 { message, code: "MFA_CHALLENGE_RATE_LIMITED",
  retryAfterSeconds }` — rate-limit ceiling fired. Sets
  `Retry-After`. Writes a `mfa_rate_limited` audit row.

**POST `/api/mfa/disable`**
Disables MFA for the current user (requires an active session).

**POST `/api/mfa/recovery/regenerate`**
Generates a fresh set of ten recovery codes, atomically deleting the
previous batch from `mfa_recovery_codes`. Returns
`{ recoveryCodes: string[] }` — the plaintext is shown to the
operator exactly once.

### WebAuthn Endpoints

**POST `/api/webauthn/register/begin`** — self-mode enrollment.
Returns SimpleWebAuthn registration options and sets the
`webauthn_register_challenge` HttpOnly cookie scoped to
`/api/webauthn/register/finish`.

**POST `/api/webauthn/register/finish`** — self-mode enrollment.
Body `{ response: AuthenticatorAttestationResponse, deviceName }`.
Reads the challenge from the cookie, verifies the attestation,
inserts into `webauthn_credentials`, writes a
`webauthn-enroll-self` audit row.

**POST `/api/webauthn/register/begin/:userId`** *(Admin-only)* —
identical contract, but binds the cookie + the eventual credential
to `:userId`. Cookie name is `webauthn_register_admin_challenge` so
an admin enrolling themselves and then a target user back-to-back
can't clobber the first ceremony's cookie with the second's
(*Task #654*).

**POST `/api/webauthn/register/finish/:userId`** *(Admin-only)* —
companion finish route. Writes a `webauthn-enroll-admin` audit row
that records both the admin actor and the target user.

**POST `/api/webauthn/register/cancel`** *(Task #652)* —
companion to `/begin` that drops the
`webauthn_register_challenge` cookie when the user backs out before
`/finish` runs (closes the dialog, dismisses the authenticator
prompt, navigates away). Without it the cookie sits in the browser
for its full 5-minute TTL even though `/finish` will never see it.
Intentionally unauthenticated and idempotent — its only effect is a
`Set-Cookie` clearing the cookie on the caller's own browser.
Returns `204 No Content`.

**POST `/api/webauthn/register/cancel/:userId`** — admin-mode
counterpart that clears the
`webauthn_register_admin_challenge` cookie. Same idempotent contract.

**POST `/api/webauthn/authenticate/begin`** — login passkey
challenge. Returns SimpleWebAuthn authentication options and sets
the `mfa_login_challenge` HttpOnly cookie. Intentionally
unauthenticated — the temp token is what binds the ceremony to the
user.

**POST `/api/webauthn/authenticate/cancel`** *(Task #634)* — drops
the `mfa_login_challenge` cookie when the user backs out of the
passkey login (cancels the browser prompt, closes the dialog).
Returns `204 No Content`. Idempotent.

**POST `/api/webauthn/authenticate/finish`** — *(historical)*. The
finish step is now part of `POST /api/mfa/challenge` with `type:
"webauthn"` (*Task #599*). New clients should not call a separate
finish endpoint.

**GET `/api/webauthn/credentials/:userId`**
Lists the user's registered credentials (no private keys). Self-only
unless the caller is an Admin.

**DELETE `/api/webauthn/credentials/:credentialId`**
Removes a credential. Self-only unless the caller is an Admin.

### Login & Session Endpoints

**POST `/api/login`** — password endpoint. Possible responses:

- `400 { message: "Email and password are required" }`
- `401 { message: "Invalid credentials" }` — unknown email or wrong
  password (audit row written).
- `401 { message: "Account setup incomplete" }` — user row exists
  with no password.
- `403 { message: "Login Not Approved", code: "ACCOUNT_PENDING_APPROVAL" }`
- `429 { message, code: "LOGIN_RATE_LIMITED", retryAfterSeconds }` —
  per-account or per-IP bucket fired (*Task #629*).
- `200 { user, message: "Login successful" }` — no MFA required;
  session created.
- `200 { requiresMfa: true, temporaryToken, userEmail, message }` —
  MFA gate; client opens `MFAChallengeDialog`.

**POST `/api/logout`** — destroys the session.

**GET `/api/auth/user`** — returns the current operator's profile
plus `mfaEnabled`, `mfaSetupRequired`, `securityHealth`, `lastLogin`,
`forcePasswordChange`. The `mfaSetupRequired` flag is what trips
the `MFAEnforcementDialog` gate. Fail-safe: on any internal error
the response defaults to `mfaSetupRequired: true` for required
roles (*fail closed*).

### Admin Endpoints

**GET `/api/admin/users/security`**
Paginated user-security list. Query params: `search`, `role`,
`health`, `page`, `limit` (default 25). Admin only.

**GET `/api/admin/users/:id/security`**
Detailed security profile for one user, including audit timeline.
Admin only.

**POST `/api/admin/users/:id/mfa/require-setup`**
Sets `security_setup_required = true` on the target user so their
next sign-in lands on the enforcement gate. Admin only.

**POST `/api/admin/users/:id/mfa/reset`**
Clears the user's MFA configuration (resets `mfa_enabled`, blanks
`totp_secret_enc`, deletes recovery codes, deletes WebAuthn
credentials). Admin only.

## Configuration

### Environment Variables

**Required:**
```bash
ENCRYPTION_KEY=<64 hex characters>           # AES-256 key for TOTP secrets
WEBAUTHN_RP_ID=yourdomain.com                # Relying Party ID
WEBAUTHN_RP_NAME="CriteriaIQ"                # Display name shown by authenticators
WEBAUTHN_ORIGIN=https://yourdomain.com       # Expected origin (full scheme + host)
SESSION_SECRET=<random>                       # Used by express-session AND to HMAC the
                                              # WebAuthn challenge cookies (Task #611)
```

**Optional:**
```bash
MFA_RATE_LIMIT_ATTEMPTS=5                    # Per-user MFA challenge ceiling (default 5)
MFA_RATE_LIMIT_WINDOW=900                    # Window in seconds (default 15 min)
TRUSTED_DEVICE_DURATION=2592000              # Trusted-device cookie TTL (default 30d)
```

The login-side rate-limit constants
(`LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_EMAIL = 10`,
`LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP = 30`,
`LOGIN_RATE_LIMIT_WINDOW_MS = 15 min`) are not currently env-tunable
— change them in `server/auth/simpleAuth.ts` if you need to relax
or tighten the front-door budget.

### Security Configuration

**Encryption key generation:**
```bash
openssl rand -hex 32
```

**WebAuthn setup:**
```bash
# Development
WEBAUTHN_RP_ID=localhost
WEBAUTHN_ORIGIN=http://localhost:5000

# Production
WEBAUTHN_RP_ID=yourdomain.com
WEBAUTHN_ORIGIN=https://yourdomain.com
```

## User Interface Components

All MFA / security components live under
`client/src/components/security/`. Operator-visible strings are
localised via `react-i18next` with translation keys under
`security.mfa.*`.

### MFASetupDialog

**Features:**
- Tabbed interface: **Status**, **Setup**, **Recovery**, **Passkeys**.
- QR code with manual-entry secret fallback.
- Recovery code generation, single-time display, downloadable .txt
  with a localised filename.
- "What to do next" callout shown after the operator downloads their
  recovery codes (and dismissable on subsequent visits within the
  same dialog session).
- WebAuthn passkey registration (self mode and admin mode).
- "Disable MFA" with confirmation dialog.
- Real-time security-health badge updates inside the dialog.

**Key Props:**
```typescript
interface MFASetupDialogProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string;            // admin mode: manage another user's MFA
  isEnforcementMode?: boolean; // hides the close affordances when true
  onGoToStatus?: () => void;   // Task #583: parent surfaces use this to
                               // route the operator straight to their
                               // Status tab after recovery-code download
}
```

### MFAChallengeDialog

**Features:**
- Three tabs: **TOTP**, **Recovery**, **Passkey**. Tab visibility
  follows what the operator has actually enrolled.
- Auto-submit on the 6th TOTP digit.
- Trusted device opt-in checkbox.
- Attempts counter with progressive disclosure of the recovery tab.
- Lockout banner driven by the `MFA_CHALLENGE_RATE_LIMITED` 429
  contract (parses `retryAfterSeconds` off the error body or falls
  back to the HTTP 429 status — see `readRateLimitSignal`).
- Post-success recovery-codes-low pivot: when the response carries
  `recoveryCodesRemaining` / `recoveryCodesLow`, the dialog shows a
  confirmation screen with the remaining count and a regenerate
  prompt before firing `onSuccess()`.

**Key Props:**
```typescript
interface MFAChallengeDialogProps {
  isOpen: boolean;
  onSuccess: (sessionData?: any) => void;
  onCancel: () => void;
  userEmail: string;
  temporaryToken?: string;     // mfa_required token issued by /api/login
}
```

### MFAEnforcementDialog *(Tasks #583, #432)*

**Features:**
- Renders inside `<AuthShell>` (gradient backdrop, white-logo
  watermark, theme toggle, Get Help link, language switcher, version
  footer) — page chrome is provided by the parent, not the
  component.
- "Security Setup Required" card with current status, a list of
  what's missing, and three benefit cards explaining why the
  operator can't skip this.
- Single CTA button that opens `MFASetupDialog` in
  `isEnforcementMode`.
- Cannot be dismissed — the parent router short-circuits on
  `isMfaRequired`.

**Key Props:**
```typescript
interface MFAEnforcementDialogProps {
  isOpen: boolean;
  onComplete: () => void;
}
```

### SecurityHealthBadge

Color-coded badge (`green` / `amber` / `red`) with optional details
row. Three sizes (`sm` / `md` / `lg`). Used by the enforcement
dialog, the setup dialog, the admin table, the security drawer, and
the security journey panel.

```typescript
export interface SecurityHealth {
  enabled: boolean;
  method: 'totp' | 'webauthn' | null;
  enrolledAt: string | null;
  recoveryCount: number;
  passkeyCount: number;
  health: 'green' | 'amber' | 'red';
}
```

### SecurityJourney

Visual checklist of the security setup steps a given user has
completed. Reused by the operator's own profile and the admin
detail surface.

### MFAManagement (Admin)

Admin table of every user's security status. Filters and search are
lifted up to the parent so the same table can be reused on different
admin surfaces with different filter chrome.

```typescript
interface MFAManagementProps {
  className?: string;
  searchTerm?: string;
  roleFilter?: string;
  healthFilter?: string;
  showActiveOnly?: boolean;
}
```

## Troubleshooting

### Common Issues

**1. "ENCRYPTION_KEY not configured" Error**
```bash
export ENCRYPTION_KEY=$(openssl rand -hex 32)
```

**2. WebAuthn Registration Fails**
- Browser console for the specific `NotAllowedError` /
  `SecurityError` text.
- `WEBAUTHN_ORIGIN` MUST exactly match the page origin, scheme
  included.
- HTTPS is required outside of `localhost`.

**3. "Passkey challenge expired — please try again" on every passkey login**
- The `mfa_login_challenge` cookie is HttpOnly and path-scoped to
  `/api/mfa/challenge`. A reverse proxy that strips Set-Cookie or rewrites
  paths will break this. Verify the cookie is present in the
  Network tab on `/begin` and being sent back on `/api/mfa/challenge`.
- The cookie TTL is 5 minutes — if the operator goes for coffee mid-
  ceremony, they need to start over.

**4. TOTP Codes Not Working**
- Server clock drift — TOTP tolerates ±30 seconds; beyond that
  every code looks invalid.
- Authenticator app clock drift — the user's device clock can drift
  too; many apps have a "sync time" option.

**5. Recovery Codes Not Accepted**
- Each code is single use; once `used_at` is set, the row is
  filtered out of the constant-time match.
- Codes are case-insensitive in the input field; the dash separators
  are tolerated but not required.

**6. "Too many login attempts" but the operator hasn't tried 10 times**
- The per-IP bucket (`LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP = 30`) is
  shared across operators behind the same NAT. The 429's
  `retryAfterSeconds` reflects the longer of the two bucket reset
  times so the hint stays honest. Inspect the
  `auth_rate_limits` table by `bucket_key` to confirm which bucket
  fired.

### Debugging Steps

**Inspect MFA state in Postgres:**
```sql
-- One user's MFA configuration
SELECT id, email, mfa_enabled, mfa_method, mfa_enrolled_at,
       security_setup_required
FROM users
WHERE LOWER(email) = LOWER('user@example.com');

-- Unused recovery codes for one user
SELECT id, created_at
FROM mfa_recovery_codes
WHERE user_id = '<userId>' AND used_at IS NULL;

-- Registered passkeys for one user
SELECT id, device_name, counter, created_at
FROM webauthn_credentials
WHERE user_id = '<userId>';

-- Recent failed sign-ins for one user
SELECT login_time, login_method, success, failure_reason, ip_address
FROM audit_logins
WHERE LOWER(user_email) = LOWER('user@example.com')
ORDER BY login_time DESC
LIMIT 50;

-- What rate-limit buckets are currently in effect
SELECT bucket_key, failed_count, reset_at
FROM auth_rate_limits
WHERE reset_at > NOW()
ORDER BY reset_at DESC;
```

**Check active sessions for one user:**
```sql
SELECT id, device_name, browser, os, ip_address, last_active
FROM user_sessions
WHERE user_id = '<userId>'
ORDER BY last_active DESC;
```

## Security Best Practices

### Development

1. Never log TOTP secrets, recovery codes, temp tokens, or WebAuthn
   challenge cookie values.
2. Run dev with `WEBAUTHN_RP_ID=localhost` and
   `WEBAUTHN_ORIGIN=http://localhost:5000`. Anything else and the
   browser will reject every assertion.
3. Validate every MFA input on both client and server — the client
   checks are UX, the server checks are the gate.
4. Keep error messages opaque ("Invalid verification code", not
   "Wrong TOTP code, recovery code didn't match either").
5. When you change a rate-limit constant, search for every
   `recordAttemptResult` call against the same key — they MUST all
   share the same window, otherwise the bucket leaks.

### Deployment

1. Generate a fresh `ENCRYPTION_KEY` per environment and back it up
   securely — losing it means every TOTP secret in `users.totp_
   secret_enc` becomes unrecoverable and every operator has to
   re-enroll.
2. Rotate `SESSION_SECRET` carefully — it HMACs the WebAuthn
   challenge cookies. A rotation invalidates every in-flight
   ceremony but does NOT invalidate stored credentials.
3. Monitor the `audit_logins` table for streaks of `success = false`
   from one IP / one email — the rate limiter handles the
   per-bucket case but a coordinated low-and-slow attack across many
   accounts won't trip a single bucket.
4. Test WebAuthn against the browser matrix you actually support;
   each browser surfaces user-verification differently.
5. Have a documented MFA bypass procedure for when an operator loses
   both their authenticator and their recovery codes (admin
   `/api/admin/users/:id/mfa/reset`, then force-setup on next
   login).

### User Education

1. Explain that recovery codes are bearer tokens — anyone with the
   .txt file can sign in once.
2. Encourage at least one passkey + recovery codes (security health
   = green). TOTP-only is amber for a reason.
3. Trusted-device opt-in is a 30-day trade-off; on shared machines
   the operator should leave it unchecked.
4. The recovery-codes-low banner (< 3 remaining) is the only
   friendly nudge — past zero, the operator is locked out of the
   second factor entirely if they lose their authenticator.

## Migration and Upgrade

### Enabling MFA for Existing Users

```typescript
// Bulk-flag a role so the next sign-in lands on the enforcement gate
const requireMFAForRole = async (role: string) => {
  await db.update(users)
    .set({ securitySetupRequired: true })
    .where(eq(users.role, role));
};
```

### Migrating from Legacy Authentication

```typescript
// Phased rollout — flip a slice of operators per phase
const requireMFAByPhase = async (phase: number) => {
  const userGroups = await getUsersByPhase(phase);
  for (const user of userGroups) {
    await db.update(users)
      .set({ securitySetupRequired: true })
      .where(eq(users.id, user.id));
  }
};
```

### Migrating From an In-Memory Rate Limiter

If you are pulling these patterns into a separate codebase that
still has an in-process Map, the migration shape is small but
tricky:

1. Add the `auth_rate_limits` table (see Database Schema above).
2. Replace the `Map.get(key)` calls in your `checkRateLimit` with a
   PK lookup against the table.
3. Replace the `Map.set(key, ...)` calls in `recordAttemptResult`
   with the `INSERT ... ON CONFLICT DO UPDATE` pattern from
   `mfaUtils.ts` — note the `CASE WHEN reset_at < NOW() THEN reset
   ELSE keep` branch in the SET clause, that's what makes the
   bucket roll over without an out-of-band cleanup job.
4. Keep the in-memory Map as a *fallback* for when the DB is
   unreachable so the failure mode stays "fall back to old
   behaviour", not "open the gate".

## Performance Considerations

### Optimisation Strategies

1. The `auth_rate_limits` lookups are PK reads — they're already as
   fast as a Postgres point read can be. Don't add caching here; a
   stale read would re-open a closed bucket.
2. Recovery-code verification is `O(n_codes)` bcrypt comparisons
   per attempt because we MUST compare against every UNUSED hash to
   stay constant-time across the user's hash set. With the default
   ten codes per user this is negligible. If you ever raise that
   number significantly, profile it.
3. Run the `idx_auth_rate_limits_reset_at`-backed cleanup query on
   a schedule (or in a low-priority maintenance task) so the table
   doesn't grow unbounded — the auth path itself never scans this
   table, so this is purely housekeeping.
4. The `audit_logins` table grows monotonically. Plan a retention
   policy alongside whatever compliance regime your deployment is
   operating under.
5. WebAuthn signature verification is CPU-bound and runs on the
   request thread. If you ever see it dominate a flame graph,
   that's the moment to put it behind a worker pool — not before.

### Monitoring Metrics

- MFA setup completion rates (per role).
- Sign-in failure rates split by `failure_reason`.
- Rate-limit lockout frequency (`mfa_rate_limited` audit rows,
  `LOGIN_RATE_LIMITED` 429s).
- Recovery-code usage and regeneration cadence.
- Passkey adoption (% of MFA-enabled users with at least one
  credential).
- Distribution across `green` / `amber` / `red` security-health
  buckets, especially among required roles.

---

This MFA system is intentionally fail-closed at every gate, audited
end-to-end, and rate-limited at every door an attacker could knock
on. When in doubt, follow the in-code task references — every
non-trivial decision was committed with the rationale that should
answer "why does it work this way?".
