# Runbook — Microsoft Entra App Registration for Graph Email

A step-by-step operator runbook for creating the Microsoft Entra ID app
registration that CriteriaIQ uses to send email via the **Microsoft
Graph `sendMail`** transport. Follow this once per tenant; then enter the
resulting IDs/credential into Configuration → System Settings → Email
Configuration (Authentication method → Microsoft Graph).

> **Audience:** a Microsoft 365 / Entra **Global Administrator** (or an
> Application Administrator + Exchange Administrator working together).
> **Time:** ~15 minutes. **Prereqs:** a licensed or shared mailbox to
> send from (e.g. `alerts@yourtenant.com`).
>
> For how the feature works in the app, see
> [`../features/email-graph-sending.md`](../features/email-graph-sending.md).

---

## What you'll end up with

Four values to paste into CriteriaIQ, plus one **credential** (pick one):

| CriteriaIQ field | Where it comes from |
|---|---|
| **Tenant ID** | Entra → app registration → Overview → *Directory (tenant) ID* |
| **Client ID** | Entra → app registration → Overview → *Application (client) ID* |
| **Sender mailbox** | The mailbox you'll send as (e.g. `alerts@yourtenant.com`) |
| **Client secret** *(secret mode)* | Certificates & secrets → new client secret *value* |
| **Certificate private key (PEM) + thumbprint** *(cert mode)* | Your cert's private key + its SHA-1 thumbprint |

---

## Step 1 — Register the application

1. Go to **[entra.microsoft.com](https://entra.microsoft.com)** →
   **Identity** → **Applications** → **App registrations** →
   **New registration**.
2. **Name:** e.g. `CriteriaIQ Email Sender`.
3. **Supported account types:** *Accounts in this organizational
   directory only* (single tenant).
4. Leave **Redirect URI** blank (this is a daemon/app-only app — no
   interactive sign-in).
5. **Register.**
6. On the **Overview** page, copy the **Application (client) ID** and
   **Directory (tenant) ID** → these are CriteriaIQ's *Client ID* and
   *Tenant ID*.

## Step 2 — Grant the `Mail.Send` application permission

1. In the app → **API permissions** → **Add a permission** →
   **Microsoft Graph** → **Application permissions** (NOT delegated).
2. Search **`Mail.Send`**, tick it, **Add permissions**.
3. Click **Grant admin consent for [your org]** → confirm. The
   `Mail.Send` row must show **Granted** with a green check.

> ⚠️ Application permission, not Delegated. App-only auth has no signed-in
> user, so delegated permissions won't work.

## Step 3 — Add a credential

Pick **one** of the following.

### Option A — Client secret (simplest)
1. App → **Certificates & secrets** → **Client secrets** → **New client
   secret**.
2. Description `CriteriaIQ`, expiry e.g. **6 months** (shorter = safer;
   you'll rotate — see "Rotating" below).
3. **Add**, then **immediately copy the secret *Value*** (not the Secret
   ID). It's shown only once.
4. In CriteriaIQ: Credential type **Client secret** → paste the value.

### Option B — Certificate (strongest — no shared secret)
1. Obtain/generate a certificate (self-signed is fine for app-only auth).
   You need the **public cert** (`.cer`/`.crt`) to upload and the
   **private key in PEM** for CriteriaIQ.
   - Example (OpenSSL): `openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=CriteriaIQ Email"`
2. App → **Certificates & secrets** → **Certificates** → **Upload
   certificate** → upload the public cert (`cert.pem`/`.cer`).
3. Copy the **Thumbprint** shown after upload (40 hex chars).
4. In CriteriaIQ: Credential type **Certificate** → paste the **private
   key PEM** (`key.pem` contents, `-----BEGIN PRIVATE KEY-----` … ) and
   the **thumbprint**.

## Step 4 — Restrict the app to ONE mailbox (least privilege)

By default `Mail.Send` lets the app send as **any** mailbox in the
tenant. Lock it to just your sender mailbox so a compromise can't
impersonate your CEO/CFO/IT.

1. Connect to Exchange Online PowerShell:
   ```powershell
   Install-Module ExchangeOnlineManagement   # first time only
   Connect-ExchangeOnline -UserPrincipalName admin@yourtenant.com
   ```
2. (Recommended) Put the sender mailbox in a **mail-enabled security
   group** (e.g. `criteriaiq-senders@yourtenant.com`) so you can expand
   later without editing the policy. A single mailbox also works as the
   scope.
3. Create the policy:
   ```powershell
   New-ApplicationAccessPolicy `
     -AppId "<CLIENT_ID>" `
     -PolicyScopeGroupId "alerts@yourtenant.com" `
     -AccessRight RestrictAccess `
     -Description "Restrict CriteriaIQ to the alerts mailbox only."
   ```
4. Verify:
   ```powershell
   Test-ApplicationAccessPolicy -AppId "<CLIENT_ID>" -Identity "alerts@yourtenant.com"
   # AccessCheckResult should be: Granted
   Test-ApplicationAccessPolicy -AppId "<CLIENT_ID>" -Identity "ceo@yourtenant.com"
   # AccessCheckResult should be: Denied
   ```

> Policy propagation can take up to ~30 minutes.

## Step 5 — Configure CriteriaIQ & test

1. Admin › Integrations › Overview › Email Configuration → Configure →
   **Authentication method: Microsoft Graph**.
2. Enter **Tenant ID**, **Client ID**, **Sender mailbox**, the **From
   address**, and your chosen credential (Step 3).
3. **Save Configuration**, then **Test Email** to your own address.
4. Confirm receipt. A success is also written to the Email Logs.

---

## Rotating the credential

- **Client secret:** create a new secret in Entra (Step 3A), paste the
  new value into CriteriaIQ, save. Delete the old secret in Entra once
  confirmed.
- **Certificate:** upload a new public cert, paste the new private key +
  thumbprint into CriteriaIQ, save. Remove the old cert in Entra.
- CriteriaIQ encrypts the secret/key at rest (AES-256-GCM) and includes
  it in the `ENCRYPTION_KEY` rotation manifest — see
  [`../features/encryption-key-rotation.md`](../features/encryption-key-rotation.md).

---

## Troubleshooting

| Symptom (in Test Email result) | Likely cause | Fix |
|---|---|---|
| `token request failed (HTTP 401)` `invalid_client` | Wrong client secret, expired secret, or wrong tenant/client ID | Re-copy the secret *Value*; verify Tenant/Client ID on the Overview page |
| `token request failed` with cert | Thumbprint mismatch or wrong private key | Re-copy the thumbprint from Entra; ensure the PEM is the key matching the **uploaded** public cert |
| `sendMail failed (HTTP 403)` `AccessDenied` | Application Access Policy excludes the sender mailbox, OR `Mail.Send` consent not granted | Confirm Step 2 consent; check the policy scope (Step 4) includes the sender; wait for propagation |
| `sendMail failed (HTTP 404)` | Sender mailbox doesn't exist / not a real mailbox | Use a licensed or shared mailbox UPN |
| Works in test, not in prod | Different tenant/secret per environment | Re-enter credentials in the production install |

---

## Security checklist

- [ ] `Mail.Send` is an **Application** permission with **admin consent granted**.
- [ ] **Application Access Policy** restricts the app to the single sender mailbox (Step 4) — verified with `Test-ApplicationAccessPolicy`.
- [ ] Using a **short-lived secret** (rotate on a schedule) or a **certificate**.
- [ ] Tenant-wide **SMTP AUTH stays disabled** (it's off by default in newer tenants) — Graph doesn't need it.
- [ ] The sender mailbox is dedicated to automated mail (not a person's primary mailbox).

---

## Related

- [`../features/email-graph-sending.md`](../features/email-graph-sending.md) — how the transport works in CriteriaIQ
- [`../features/encryption-key-rotation.md`](../features/encryption-key-rotation.md) — how the stored credential is encrypted/rotated
