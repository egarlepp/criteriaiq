# Single Sign-On (Okta SSO and Azure SSO)

CriteriaIQ supports OpenID Connect single sign-on for internal
users. When configured, internal staff (`Admin`, `Engineer`, `Manager`,
`CX`, `Support`, `Sales`) can sign in with Okta or with Microsoft
Entra ID (Azure AD) instead of email + password. The two providers
are configured independently, as in ImpactIQ, and can be enabled at
the same time; the login page shows one button per enabled provider. Customer-facing accounts (`Customer`,
`Guest`, `Partner`) continue to use the existing password + MFA flow —
per-tenant customer SSO is a v2 follow-on.

This document covers the feature end-to-end: what's built, how it
interacts with the existing security stack, and what admins and end
users see. For Azure, see [`azure-sso-setup.md`](../guides/azure-sso-setup.md).
For the step-by-step Okta admin console walkthrough, see
[`okta-setup.md`](../guides/okta-setup.md).

## What's included in v1

| Aspect | v1 behavior |
|---|---|
| **Protocol** | OIDC only (`openid-client` 6.x). SAML 2.0 is a future option. |
| **Scope** | Internal users only. Customer-facing roles stay on password + MFA. |
| **Coexistence** | Hybrid — both "Continue with Okta" and email/password render on the login page. Protected admins (`users.isProtected = true`) always retain password + MFA as an IdP-outage break-glass. |
| **JIT provisioning** | First Okta sign-in auto-creates the `users` row. `accountId` resolves from the email domain via the existing `allowed_domains` table; role resolves from the Okta groups claim. |
| **Group → role mapping** | Admin configures a mapping (e.g. `CriteriaIQ-Admins` → `Admin`). Highest-precedence role wins (`Admin > Manager > Engineer > CX > Sales > Support`). |
| **Group → team mapping** | Every sign-in puts the person on the teams and subteams their groups map to, and takes them off SSO-added ones their groups no longer map to. Teams an admin added by hand stay. Teams grant no access. See [Teams](teams.md#teams-from-sso-groups). |
| **MFA stacking** | Trust Okta's MFA by default when the id_token ACR claim asserts it. Admin can flip a toggle to always run the CriteriaIQ TOTP/WebAuthn challenge on top. |
| **SCIM** | Not in v1. Deferred to v2. |

## Architectural model

### Two-layer access control

Two independent gates must allow a user before they reach an
authenticated CriteriaIQ session:

1. **Okta side (primary)** — the CriteriaIQ application in your Okta
   tenant is assigned to specific users or groups. Anyone not
   assigned fails at the Okta login screen and CriteriaIQ never sees
   the request. This is your centralized deprovisioning lever:
   removing someone from the Okta group instantly blocks their
   CriteriaIQ access.
2. **CriteriaIQ side (secondary)** — the OIDC callback at
   `/api/auth/sso/callback` re-validates the email domain against
   `allowed_domains`, refuses customer-facing roles
   (`external_role_not_eligible`), and short-circuits if the
   `users.isActive` flag is `false`. This means the existing
   "deactivate user" admin action also blocks future Okta logins.

### Identity keying

Lookups always go through `(users.sso_provider, users.sso_external_id)` —
the `sub` claim from the IdP, which is the durable identifier. Email
is mutable on the Okta side and is NEVER used as the join key for
finding the CriteriaIQ row. This prevents account takeover when an
Okta admin reassigns an email address.

### First-time linking of existing password users

When a user with an existing password account clicks **Continue with
Okta** for the first time and the email matches a CriteriaIQ row that
isn't linked yet, the system does NOT auto-link by email match. The
user is redirected to `/sso/error?reason=link_password_required` and
asked to enter their current CriteriaIQ password to confirm the
link. Only after the password is validated do we set `ssoProvider` /
`ssoExternalId` on the existing row. Without this confirmation an
Okta misconfig (or a developer dev-tenant) could take over a matching
admin account.

### Session and MFA

After successful OIDC verification the existing session pipeline
kicks in: `req.session.regenerate()` defeats session fixation, then
`req.session.user` is populated with the same shape as a password
login. The MFA gate decides next:

- If the admin toggle **Trust Okta MFA** is ON (default) AND the
  id_token's ACR claim asserts MFA (`urn:okta:loa:2fa:any`, AAL2
  equivalent, or `amr` contains `"mfa"`), skip the CriteriaIQ
  TOTP/WebAuthn challenge.
- Otherwise, if the user has CriteriaIQ MFA enrolled, no session is
  created yet. The callback parks the sign-in on the session (10-minute
  expiry) and redirects to `/sso/error?reason=mfa_required`. That page
  calls `POST /api/auth/sso/mfa-pending`, which hands out the same
  `mfa_required` temporary token password sign-in uses, exactly once,
  after re-checking that the account is still active, approved and
  MFA-enrolled. The page then shows the standard MFA challenge dialog
  (TOTP, recovery code or passkey), and `/api/mfa/challenge` creates the
  session, keeps the provider for RP-initiated logout and records the
  login as `<provider>-mfa-totp` / `-mfa-recovery` / `-mfa-webauthn`.
  Code: `server/auth/ssoMfaHandoff.ts`.

This means SSO does NOT bypass the CriteriaIQ MFA gate when the IdP
hasn't proven MFA — defense in depth at no extra friction when MFA
IS already enforced.

### Audit trail

Every Okta login attempt is recorded in `audit_logins` with a
distinct `loginMethod` so admins can filter the audit feed:

| `loginMethod` | Meaning |
|---|---|
| `okta` | Successful Okta sign-in, no CriteriaIQ MFA enrolled |
| `okta-mfa-totp`, `okta-mfa-recovery`, `okta-mfa-webauthn` | Successful Okta sign-in, then the CriteriaIQ MFA challenge with that factor |
| `okta-mfa-skipped` | Successful sign-in where IdP MFA was trusted |
| `okta-linked` | Existing user just completed password-confirm link |
| `okta-jit-create` | JIT created a new user row |
| `okta-email-changed` | Same `sub` returned a new email; CriteriaIQ updated the row |

Failed attempts use the same `loginMethod` with `success: false` and
a `failureReason` of `email_not_verified`, `external_role_not_eligible`,
`domain_not_allowed`, `pending_admin_approval`, `user_inactive`,
`idp_returned_error` (formerly `okta_returned_error`), `no_account`,
`linked_to_other_identity`, etc. The reasons map 1:1 to the user-facing
messages on the `/sso/error` page.

## Admin surface

### Admin → Integrations → Overview → Okta SSO / Azure SSO

Each provider is a card on the Integrations Overview with a status
badge (Configured, Disabled, Not configured). **Configure** expands the
provider's settings inside the card (`SsoProviderForm.tsx`); there is
no separate Single Sign-On view any more, and the old
`subtab=sso` URL lands on the Overview. Admin only. Fields:

- **Enable** toggle. When every provider is off, the public
  `/api/auth/sso/status` endpoint returns `{ enabled: false }` and the
  landing page shows no SSO button.
- **Okta domain** (Okta) or **Directory (tenant) ID** (Azure). A bare
  Okta domain tries the org authorization server, then
  `/oauth2/default`; a `/oauth2/<id>` URL is used as-is. Azure accepts
  a tenant GUID or a verified domain (resolved to the GUID issuer at
  discovery) and refuses `common`, `organizations` and `consumers`, so
  only the configured tenant can sign in.
- **Client ID**, **Client secret** (AES-256-GCM with `ENCRYPTION_KEY`;
  never returned, leave blank to keep it).
- **Redirect URI**: defaults to `PUBLIC_APP_URL` + the provider's
  callback path, with copy-to-clipboard. An override is accepted only
  if it is https (or http on localhost) and ends in that provider's
  callback path; an override equal to the default is stored as null so
  it keeps following `PUBLIC_APP_URL`.
- **Create users on first sign-in** (JIT). Default ON for Okta (the
  pre-Azure behaviour), OFF for Azure. When OFF, a person with no
  linked or matching CriteriaIQ account gets `no_account`.
- **Advanced settings**: scopes, group claim name, default role for
  unmapped users (never Admin), group → role mapping (Okta group names,
  or Entra group object IDs), group → team mapping, trust identity provider MFA (default
  ON), sync role on every login (default OFF), RP-initiated logout
  (default OFF).
- **Save** and **Test connection** (discovery only; works while the
  provider is disabled). The last test result is shown next to the
  buttons.

### Configuration → System Health → Integration Health

The integration-health page surfaces SSO alongside Salesforce,
webhooks, AI providers, and n8n. The Okta card shows:

- Connection state (`Connected` / `Failed` / `Disabled` / `Not Set Up`
  / `Not Tested` / `Unavailable`)
- Successful and failed Okta sign-ins in the last 24 hours
- Last test result + timestamp (and error message on failure)

Reads come from the `sso_config` row + a count over `audit_logins`
where `login_method LIKE 'okta%'`. No live OIDC discovery is
performed during polling — that's reserved for the admin **Test
connection** button.

### Configuration → User Management

The user table now includes an **Identity Source** column:

- **Okta** — `users.ssoProvider = 'okta'` (the row is linked to an
  Okta identity)
- **Password** — `users.ssoProvider` is null

The column tells admins at a glance who logs in via what. A user can
have both a password AND an SSO link in hybrid mode; the column only
reflects whether the SSO link exists.

### Per-user Allowed Login Methods

The Create / Edit User dialog (Step 1, under Role; admins only) has an
**Allowed Login Methods** dropdown stored in
`users.allowed_login_methods` (migration 075):

| Value | Password form | Okta |
|---|---|---|
| `okta_password` (default) | accepted | accepted |
| `okta_only` | rejected | accepted |
| `password_only` | accepted | rejected |

The login page always shows both paths ("show always, gate on
submit"); there is no endpoint that reveals an account's methods by
email, because that would let anyone enumerate accounts. The server
enforces the policy:

- `/api/login` checks it **after** the password verifies, so a wrong
  password against an Okta-only account still gets the generic 401.
  A correct password returns `403 { code: "LOGIN_METHOD_NOT_ALLOWED" }`
  and the login form shows an inline **Continue with Okta** button.
- The OIDC callback and `/api/auth/sso/link-confirm` reject
  `password_only` accounts before any session write; the callback
  redirects to `/sso/error?reason=sso_not_allowed`.
- `POST /api/users` and `PUT /api/users/:userId` accept the field only
  from an Admin (403 otherwise) and only one of the three values (400
  otherwise). `PUT /api/users/me` ignores it, so users can't change
  their own policy. The Profile → Security tab shows it read-only.

If Okta is disabled org-wide, `okta_only` users can't sign in at all
until an admin changes their setting or re-enables SSO. Protected
break-glass admins should stay on `okta_password` or `password_only`.

## User surface

### Public login page

When SSO is enabled, a **Continue with Okta** button renders above
the email + password form. Clicking it does a full-page navigation
to `/api/auth/sso/login`, which generates state + nonce + PKCE-S256,
stores them on the server-side session, and redirects to Okta.
After the user signs in at Okta, they land back at
`/api/auth/sso/callback`, which validates and establishes the
session.

### Profile / Security drawer

The drawer shows an **Identity source** line so the user understands
whether they signed in via Okta or password.

### Error / outcome page (`/sso/error`)

A dedicated public route handles every non-success branch of the
OIDC callback with a distinct user-facing message rather than a
generic "Authentication failed". Reasons handled:

- `email_not_verified`
- `external_role_not_eligible`
- `domain_not_allowed`
- `pending_admin_approval`
- `user_inactive`
- `callback_expired`
- `rate_limited`
- `sso_disabled`
- `okta_returned_error`
- `link_password_required` (renders the password confirm form)
- `sso_not_allowed` (account is set to password only; no Okta retry button)

## Security properties

| Property | Mechanism |
|---|---|
| Anti-CSRF on the callback | One-time `state` parameter stored on session, validated on return, deleted after use |
| Anti-replay on the token exchange | One-time `nonce`, validated against the id_token claim |
| Confidential client + PKCE-S256 | Defense in depth; `code_verifier` is on the server-side session, never the browser |
| Session fixation defense | `req.session.regenerate()` before establishing the authenticated session |
| Token redaction | `code`, `id_token`, `access_token`, `refresh_token` scrubbed from log lines |
| Encrypted secrets at rest | `clientSecretEnc` AES-256-GCM via the existing `ENCRYPTION_KEY` helper |
| Per-IP rate limiting | `/api/auth/sso/login` 30/15min; `/api/auth/sso/callback` 10/15min (failed exchanges) |
| Password-guess limiting on linking | `/api/auth/sso/link-confirm` shares the `/api/login` per-account (10/15min) and per-IP (30/15min) failed-attempt budgets |
| Sub-keyed identity | `(ssoProvider, ssoExternalId)` is the join key; email is mutable and never used |
| Required `email_verified` | JIT-create and link refuse unless the IdP asserts the email is verified |
| Internal-role enforcement | Customer-facing roles are rejected at the callback even if Okta authenticated them |

## Break-glass / disaster recovery

If Okta is unreachable:

1. **Protected admins keep password + MFA.** Accounts flagged
   `users.isProtected = true` always retain the password login path
   even when SSO is enabled. They're the recovery path.
2. **Environment override.** Set `SSO_DISABLE=true` and redeploy.
   The OIDC routes refuse to initiate or complete a sign-in
   regardless of what the DB row says, and the landing page hides
   the Okta button. The DB row is left untouched.
3. **Direct DB toggle.** As a last resort:
   ```sql
   UPDATE sso_config SET enabled = false WHERE id = 1;
   ```

Once Okta is back and the root cause is understood, undo the
override.

## Data model

### `sso_config` (one row per provider)

Row 1 is Okta, row 2 is Azure, enforced by the `sso_config_provider_row`
CHECK added in migration `078_sso_config_azure.sql` (which replaced the
old `id = 1` singleton CHECK). Rows are created with defaults on first
read. Columns:

- `provider` (`'okta'` | `'azure'`)
- `tenant_id` (Azure directory id or domain), `redirect_uri` (override,
  null = derived), `allow_jit` (boolean, default true; the Azure row is
  created with false)
- `enabled` (`boolean`, default `false`)
- `issuer_url`, `client_id`, `client_secret_enc` (AES-256-GCM)
- `scopes`, `group_claim_name`, `role_mapping` (`jsonb`),
  `team_mapping` (`jsonb` array of `{ group, teamId, subteamId }`,
  migration 112),
  `default_role_for_unmapped`
- `require_mfa_trust`, `sync_role_on_every_login`,
  `rp_initiated_logout`
- `last_tested_at`, `last_test_result`, `last_test_error`
- `created_by`, `updated_by`, `created_at`, `updated_at`

### `users` SSO columns (added in migration 071)

All nullable additive columns:

- `sso_provider` (`varchar`) — `'okta'` or `'azure'` once linked
- `sso_external_id` (`varchar`) — Okta's `sub`; for Azure the `oid`
  claim (stable across apps in the tenant, unlike the per-app `sub`)
- `sso_last_login_at` (`timestamp`)
- `sso_link_prompt_dismissed_at` (`timestamp`)

Plus a partial index for the fast-path lookup:
`CREATE INDEX users_sso_idx ON users (sso_provider, sso_external_id)
WHERE sso_external_id IS NOT NULL`.

### `users.allowed_login_methods` (added in migration 075)

`varchar NOT NULL DEFAULT 'okta_password'`, one of `okta_only`,
`okta_password`, `password_only` (`ALLOWED_LOGIN_METHODS` in
`shared/schema/auth.ts`). Mirrored onto `archived_users` in the same
migration.

## Endpoints

### Public

- `GET /api/auth/sso/status` — `{ enabled, providers: [{ name, label, loginUrl }], providerName, providerLabel }`.
  The landing page renders one button per entry in `providers`.
  `providers` is empty when `SSO_DISABLE=true` is set, or for a
  provider whose toggle is off or whose settings are incomplete.
- `GET /api/auth/sso/login` and `GET /api/auth/sso/azure/login` —
  initiate the OIDC redirect for Okta and Azure.
- `GET /api/auth/sso/callback` and `GET /api/auth/sso/azure/callback` —
  handle the IdP redirect (the session's pending provider must match
  the callback's provider), validate
  the id_token, resolves or JIT-creates the user, establishes the
  session.
- `POST /api/auth/sso/link-confirm` — used by the `/sso/error?reason=link_password_required`
  page to confirm linking with the existing CriteriaIQ password.
- `POST /api/auth/sso/logout` — clears the session locally and
  optionally returns Okta's `end_session_endpoint` URL when
  `rpInitiatedLogout` is ON.

### Admin

- `GET /api/admin/sso/config?provider=okta|azure` — returns that provider's config with the
  client secret replaced by a `clientSecretConfigured: boolean`
  flag.
- `POST /api/admin/sso/config` — admin-only save; `provider` in the body. Client secret is
  encrypted on the server before being written; sending the masked
  sentinel leaves the existing value intact.
- `POST /api/admin/sso/test` — `{ provider }`; runs OIDC discovery and
  records the outcome.

## Known limitations (v1)

- **No SCIM provisioning.** Until SCIM ships, deprovisioning takes
  effect on the Okta side (the user can't sign in) but the
  CriteriaIQ row stays `isActive = true` until an admin deactivates
  it manually.
- **No per-tenant customer SSO.** One Okta org and one Entra tenant.
- **No SAML 2.0.** Only OIDC.
- **No automatic re-link on Okta email change collisions.** If the
  same `sub` returns with an email that now collides with a
  different existing user, the row keeps the old email and the
  admin merges manually.

These are tracked in `docs/plans/backlog.md` as v2 follow-ons.

## Cross-references

- [`okta-setup.md`](../guides/okta-setup.md) — step-by-step Okta admin
  console walkthrough
- [`mfa-system.md`](../guides/mfa-system.md) —
  how the existing MFA stack interacts with SSO
- [`approved-email-domains.md`](approved-email-domains.md) — the JIT
  provisioning path
- [`account-user-management.md`](account-user-management.md) —
  internal-vs-external account model
