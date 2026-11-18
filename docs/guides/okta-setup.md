# Okta OIDC Setup for CriteriaIQ

CriteriaIQ supports OpenID Connect single sign-on for internal
users. Once configured, internal staff (`Admin`, `Engineer`, `Manager`,
`CX`, `Support`, `Sales`) can click **Continue with Okta** on the login
page instead of entering an email and password. Customer-facing
accounts (`Customer`, `Guest`, `Partner`) continue to use password +
MFA — per-tenant customer SSO is a v2 follow-on.

For Microsoft Entra ID (Azure AD), see
[`azure-sso-setup.md`](azure-sso-setup.md). Both providers can be on at
the same time; the login page shows one button per enabled provider.

This guide covers everything an Okta admin needs to register the
CriteriaIQ application, expose the right claims, and finish the
configuration in CriteriaIQ.

## Quick start: developer.okta.com sandbox (for testing)

You don't need a production Okta tenant to test the integration. Okta
provides a free developer org that takes about 5 minutes to set up
and gives you the full OIDC surface (groups, claims, MFA factors)
without paying anything. Use this for local testing against
`http://localhost:5000` before doing the production setup.

**Step A — sign up for a free dev org**

1. Open <https://developer.okta.com/signup/>.
2. Pick **"Workforce Identity Cloud"** and sign up with your email
   (the dev org is free; no credit card required).
3. Okta emails you an org URL like
   `https://dev-12345678.okta.com` and a temporary password. Click
   the activation link and set a real password.
4. After first login, navigate to **Admin Console** (the link in the
   top-right user menu — "Your Org" → "Admin Console"). This is
   where everything below happens.

**Step B — create the CriteriaIQ OIDC app**

1. **Applications → Applications → Create App Integration**.
2. Sign-in method: **OIDC - OpenID Connect**. Application type:
   **Web Application**. Click **Next**.
3. Fill in:
   - **App integration name**: `CriteriaIQ (Local Dev)`
   - **Grant type**: leave only **Authorization Code** checked.
   - **Sign-in redirect URIs**: paste the exact URI shown on the
     CriteriaIQ SSO tab. For local development this is
     `http://localhost:5000/api/auth/sso/callback`. **Strict
     match** — port, http vs https, no trailing slash.
   - **Sign-out redirect URIs**: `http://localhost:5000` (only
     needed if you turn on RP-initiated logout later).
   - **Controlled access**: pick **Allow everyone in your
     organization to access** for testing (you'll be the only user
     in this dev org, so this is fine). For production you'll
     restrict by group.
4. Click **Save**. Okta shows the **Client ID** and **Client
   Secret**. Keep this tab open — you'll paste both into CriteriaIQ.

**Step C — expose the groups claim**

Okta's default authorization server does NOT include the `groups`
claim in id_tokens. You need to add it.

1. **Security → API → Authorization Servers**. Pick **default**.
2. Open the **Claims** tab → **Add Claim**.
   - **Name**: `groups`
   - **Include in token type**: `ID Token`, `Always`
   - **Value type**: `Groups`
   - **Filter**: `Matches regex` → `.*`
   - Leave **Disable claim** unchecked.
3. Click **Create**.

**Step D — (optional) create a test group**

For testing the group → role mapping:

1. **Directory → Groups → Add Group**. Name it `CriteriaIQ-Admins`.
2. **Directory → People → <your user>**. Open the **Groups** tab and
   add yourself to `CriteriaIQ-Admins`.

When you sign in via Okta, CriteriaIQ will read this claim and
resolve your role to `Admin` (assuming you map it in the next
step).

**Step E — paste credentials into CriteriaIQ**

1. In CriteriaIQ sign in as an admin (e.g. the bootstrap admin) and
   go to **Admin → Integrations → Overview** and click **Configure** on
   the **Okta SSO** card. The settings open inside the card.
2. Fill in:
   - **Okta domain** (a bare `your-org.okta.com` also works; CriteriaIQ
     tries the org authorization server, then `/oauth2/default`):
     `https://dev-12345678.okta.com/oauth2/default` (substitute your
     dev org subdomain).
   - **Client ID**: from Step B.
   - **Client Secret**: from Step B.
   - **Scopes**: leave the default `openid profile email groups`.
   - **Group claim name**: `groups`.
   - **Group → Role mapping**: click **Add mapping**, type
     `CriteriaIQ-Admins` on the left, pick `Admin` on the right.
   - **Default role for unmapped users**: keep `Engineer`.
   - Under **Advanced settings**, leave **Trust identity provider MFA** ON (default).
3. Click **Test Connection**. You should see a green
   "Connection successful" badge.
4. Toggle **Enable Okta SSO** ON and click **Save**.

**Step F — try the login**

1. Sign out of CriteriaIQ.
2. The landing page now shows **Continue with Okta** above the
   email/password fields. Click it.
3. You're redirected to your dev org's login. Sign in with the
   dev-org credentials from Step A.
4. Okta redirects back to CriteriaIQ. You should land
   authenticated as a JIT-created user with role `Admin` (because
   you're in the `CriteriaIQ-Admins` group).

If anything fails, the **Troubleshooting** section near the bottom
of this doc covers every error reason the SSO error page shows.

**What's NOT covered by the dev org**

- The free dev org caps you at 100 users — fine for testing, not for
  production rollout.
- Some enterprise features (System Log retention beyond 30 days,
  custom domain, full SCIM provisioning) require a paid tier.
- You should NOT reuse dev-org client credentials in production.
  Create a separate Okta app in your production tenant per the full
  walkthrough below.

---

## Prerequisites

- Okta admin access to your tenant (e.g. `https://your-tenant.okta.com`)
- CriteriaIQ admin access — only `Admin`-role users see the SSO config tab
- CriteriaIQ deployed at a stable URL with `PUBLIC_APP_URL` set
  (e.g. `https://app.example.com`); the redirect URI is strict-matched
  by Okta and changes require re-saving on both sides
- Per-environment Okta apps if you have dev/staging/prod (different
  redirect URIs, different client secrets)

## Step 1 — Create the OIDC application in Okta

1. In the Okta Admin Console, go to **Applications → Applications →
   Create App Integration**.
2. Pick **OIDC - OpenID Connect** as the sign-in method and **Web
   Application** as the application type. Click **Next**.
3. App settings:
   - **App integration name**: `CriteriaIQ` (or `CriteriaIQ (Staging)`
     etc., one per environment)
   - **Grant type**: `Authorization Code` only
   - **Sign-in redirect URIs**: paste the exact URI shown in CriteriaIQ
     at **Admin → Integrations → Okta SSO → Redirect
     URI**. It will be of the form
     `https://app.example.com/api/auth/sso/callback`. Strict match —
     trailing slashes, http vs https, port numbers all matter.
   - **Sign-out redirect URIs**: paste your `PUBLIC_APP_URL` value
     (`https://app.example.com`). Only used if you later enable
     RP-initiated logout.
   - **Controlled access**: pick one of the assignment options
     (recommended: **Limit access to selected groups**).
4. Click **Save**. Okta generates the **Client ID** and **Client
   Secret**.

## Step 2 — Assign users / groups

The Okta-side group assignment is the primary access gate for
CriteriaIQ SSO. Anyone not assigned to the app fails at Okta's login
screen — CriteriaIQ never sees the request.

1. Create one Okta group per CriteriaIQ role you intend to assign
   automatically:
   - `CriteriaIQ-Admins` → CriteriaIQ `Admin` role
   - `CriteriaIQ-Managers` → CriteriaIQ `Manager` role
   - `CriteriaIQ-Engineers` → CriteriaIQ `Engineer` role
   - `CriteriaIQ-Sales` → CriteriaIQ `Sales` role
   - `CriteriaIQ-Support` → CriteriaIQ `Support` role
   - `CriteriaIQ-CX` → CriteriaIQ `CX` role

   Names are arbitrary — you'll map them to CriteriaIQ roles in
   Step 4. Use whatever naming your Okta org already follows.

2. In the **Assignments** tab of the CriteriaIQ Okta app, assign these
   groups (or specific users).

3. Add real users to each group. Removing a user from these groups in
   Okta blocks their CriteriaIQ access immediately — no admin action
   needed in CriteriaIQ itself. This is the centralized
   deprovisioning story.

## Step 3 — Expose the groups claim

By default Okta does NOT include the `groups` claim in the id_token.
You must opt in.

1. Go to **Security → API → Authorization Servers**. Pick the
   authorization server you're using (most setups use **default**;
   some orgs use the **org-level** server at `<tenant>.okta.com` with
   no path suffix).
2. Open the **Claims** tab and click **Add Claim**:
   - **Name**: `groups`
   - **Include in token type**: `ID Token`, then `Always`
   - **Value type**: `Groups`
   - **Filter**: `Matches regex` → `.*` (sends all groups). Tighten
     this if you have many groups and only want CriteriaIQ-specific
     ones in the token — e.g. `Matches regex` → `^CriteriaIQ-.*`.
   - **Disable claim**: unchecked
3. Save.

The matching **Group claim name** field in CriteriaIQ is `groups` by
default. If you name the claim differently here, update the value in
CriteriaIQ accordingly.

## Step 4 — Configure CriteriaIQ

1. Sign into CriteriaIQ as an `Admin` user.
2. Go to **Admin → Integrations → Overview** and click **Configure** on
   the **Okta SSO** card.
3. Fill in:
   - **Okta domain**: your Okta org URL.
     - For the **default** authorization server:
       `https://your-tenant.okta.com/oauth2/default`
     - For the **org authorization server**:
       `https://your-tenant.okta.com`
   - **Client ID**: from the Okta app's General tab
   - **Client Secret**: from the Okta app's General tab. Stored
     encrypted (AES-256-GCM).
   - **Scopes**: keep the default `openid profile email groups`
   - **Group claim name**: `groups` (or whatever you named it)
   - **Group → Role mapping**: add one row per Okta group from
     Step 2 and pick the matching CriteriaIQ role.
   - **Default role for unmapped users**: keep `Engineer`. Admin is
     never offered as a default — admins are promoted manually in
     User Management after the user has signed in once.
   - **Trust identity provider MFA**: keep ON unless you want the CriteriaIQ
     TOTP/WebAuthn challenge to run even after Okta has already
     enforced MFA. Defense in depth versus user friction.
   - **Sync role on every login**: leave OFF for safety. ON means an
     Okta admin moving a user between groups instantly changes their
     CriteriaIQ role on the next login — convenient but means
     CriteriaIQ admins can't pin a role.
   - **RP-initiated logout**: leave OFF unless you want logout to
     also redirect users to Okta's `end_session_endpoint`.
4. Click **Test connection**. CriteriaIQ runs OIDC discovery against
   the issuer URL and confirms the well-known config is reachable
   with your client credentials. The result + timestamp is recorded
   in the config row and shown next to the button.
5. Click **Save settings**.
6. Toggle **Enable Okta SSO** ON and **Save** again.

The "Continue with Okta" button now renders on the public login
page.

## Step 5 — End-to-end smoke test

1. Open a private/incognito browser window so you don't have a
   CriteriaIQ session.
2. Open `https://app.example.com`.
3. Click **Continue with Okta**.
4. Sign into Okta. If you have MFA in Okta, complete it there.
5. You should land back at CriteriaIQ authenticated. Verify:
   - The header shows your name.
   - The role matches the group → role mapping (or the default role
     if you don't have any matching groups).
   - In **Configuration → User Management**, your user has an
     Identity source of `Okta`.

If anything fails, see **Troubleshooting** below.

## Per-environment apps

Create one Okta app per environment. Recommended naming:

- `CriteriaIQ` — production, redirect URI
  `https://app.example.com/api/auth/sso/callback`
- `CriteriaIQ (Staging)` — staging, redirect URI
  `https://staging.example.com/api/auth/sso/callback`
- `CriteriaIQ (Dev)` — dev, redirect URI
  `http://localhost:5000/api/auth/sso/callback`

DO NOT reuse the production client secret in staging/dev — leakage
in a lower environment compromises production.

## Troubleshooting

### "Sign-in failed" / okta_returned_error
- Client ID / secret typo in CriteriaIQ. Re-save the secret (it's
  masked in the UI; you must re-type to update).
- Issuer URL points at the wrong authorization server. Try both the
  `/oauth2/default` form and the root form.
- Redirect URI in CriteriaIQ does not exactly match the URI
  registered in Okta. The match is strict — even a trailing slash
  fails.

### "Domain not approved"
The email domain on the Okta side is not in
CriteriaIQ's **Configuration → User Management → Login Management →
Domain allow list**. Add it (auto-approve ON for internal staff).

### "SSO is for internal users"
The user's groups resolved to a customer-facing role (`Customer`,
`Guest`, `Partner`). In v1 the Okta path is restricted to internal
roles only. Either add them to the correct internal-role group in
Okta, or have them log in with password + MFA.

### "Pending administrator approval"
The user's domain is on the allow list but the row has `autoApprove`
off. An admin needs to approve the pending user in **Configuration →
User Management → Pending approvals**.

### "Account is inactive"
The CriteriaIQ user row has `isActive = false`. The same admin
deactivation flow blocks SSO logins — re-activate in User
Management.

### "Link your CriteriaIQ account"
The user has a pre-existing password-based account with the same
email. CriteriaIQ deliberately does NOT auto-link on email match —
that would be an account takeover vector if the Okta side ever
accepts an unverified email. The user must enter their current
CriteriaIQ password to confirm the link. After linking they can use
either path going forward.

### Okta is down — break-glass

Protected admin accounts (`users.isProtected = true`) always retain
password + MFA login even when SSO is enabled, so an Okta outage
cannot lock the org out.

If a protected admin is unavailable too, flip SSO off from the
database directly:

```sql
UPDATE sso_config SET enabled = false WHERE id = 1;
```

Or set the environment variable `SSO_DISABLE=true` and redeploy.
This overrides the DB row regardless of what the admin UI shows.
Once Okta is back and the cause is understood, undo the override.

## Known v1 limitations

- **No automatic deprovisioning into CriteriaIQ**. When Okta removes
  a user from the assigned group they instantly lose Okta access
  (Layer B), but the CriteriaIQ row stays `isActive = true`. An
  admin can deactivate manually; SCIM auto-provisioning ships in v2.
- **No per-tenant customer SSO**. v1 supports one Okta tenant (your
  internal tenant). Customer-side SSO that lets each customer
  account point at its own IdP is a v2 follow-on.
- **No SAML 2.0**. Only OIDC. Add SAML only if a specific procurement
  requirement forces it.
