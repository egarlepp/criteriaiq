# Azure SSO (Microsoft Entra ID) Setup for CriteriaIQ

Azure SSO lets internal staff (`Admin`, `Engineer`, `Manager`, `CX`,
`Support`, `Sales`) sign in with **Continue with Microsoft** on the
login page. It runs alongside Okta SSO and password sign-in; customer
accounts keep password + MFA. The security model is shared with Okta
and described in [`single-sign-on.md`](../features/single-sign-on.md).

## 1. Register the application in Entra ID

1. In the Azure portal open **Microsoft Entra ID → App registrations →
   New registration**.
2. Name it `CriteriaIQ`. Supported account types: **Accounts in this
   organizational directory only (single tenant)**. CriteriaIQ refuses
   the multi-tenant `common` and `organizations` endpoints.
3. Redirect URI: platform **Web**, value copied from CriteriaIQ
   (Admin → Integrations → Overview → **Azure SSO** → Configure →
   **Redirect URI**). It is `PUBLIC_APP_URL` +
   `/api/auth/sso/azure/callback`, for example
   `https://criteriaiq.example.com/api/auth/sso/azure/callback`.
4. Register, then copy from **Overview**: **Application (client) ID**
   and **Directory (tenant) ID**.

## 2. Create a client secret

**Certificates & secrets → Client secrets → New client secret.** Copy
the secret **Value** (not the Secret ID); it is shown once. Note the
expiry date: sign-in stops working when it lapses.

## 3. Claims

- **Token configuration → Add optional claim → ID → `email`**. If the
  portal asks to add the Microsoft Graph `email` permission, accept.
- For role mapping, **Add groups claim → Security groups**, ID token
  format **Group ID**. Entra sends group **object IDs**, so the role
  mapping in CriteriaIQ uses object IDs, not names.

CriteriaIQ keys the user by the `oid` claim. Entra does not send
`email_verified`, so the email counts as verified when it equals the
user's UPN (`preferred_username`) and the account is not a guest
(`#EXT#`), or when Entra sends `xms_edov: true`. Guests and accounts
whose mail differs from their UPN are refused with `email_not_verified`.

## 4. Configure CriteriaIQ

Admin → Integrations → Overview → **Azure SSO** → **Configure**:

- **Directory (tenant) ID**: the GUID from step 1 (a verified domain
  such as `acme.com` also works).
- **Client ID** and **Client secret** from steps 1 and 2.
- **Create users on first sign-in**: OFF by default. Leave it off to
  allow only people who already have a CriteriaIQ account; turn it on
  to create accounts (domain allow-list and approval rules still apply).
- **Advanced settings**: scopes default to `openid profile email`;
  group claim `groups`; add group object ID → role rows as needed.

Click **Test connection** (discovery against the tenant), then turn on
**Enable Azure SSO** and **Save**. The Overview card turns green and
the login page shows **Continue with Microsoft**.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Test connection fails with "tenant discovery failed" | Wrong tenant ID or domain. |
| AADSTS50011 redirect URI mismatch | The Web redirect URI in Entra differs from the one shown in CriteriaIQ (check `PUBLIC_APP_URL`). |
| `/sso/error?reason=email_not_verified` | Guest account, or the mailbox address differs from the UPN. |
| `/sso/error?reason=no_account` | JIT is off and the person has no CriteriaIQ account. Create the user first. |
| Everyone gets the default role | Groups claim not added, or the mapping uses group names instead of object IDs. |
