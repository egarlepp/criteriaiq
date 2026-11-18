# Email Sending — SMTP & Microsoft Graph

How CriteriaIQ delivers email, and how to configure the **Microsoft
Graph `sendMail`** transport as a secure, password-free alternative to
SMTP for Microsoft 365 tenants.

> **Audience:** admins configuring outbound email; developers touching
> the email transport.

---

## Two transports

Admin › Integrations › Overview › Email Configuration (Configure opens the settings inline under the card) now offers an
**Authentication method** toggle:

| Method | Auth | When to use |
|---|---|---|
| **SMTP** (default) | Username + password / API key over TLS/STARTTLS | Transactional ESPs (SendGrid, Postmark, SES, Mailgun, …) using a scoped API key; or any SMTP relay |
| **Microsoft Graph** | App-only OAuth (client-credentials) → `sendMail` | Send as a real M365 mailbox without storing a mailbox password — the secure path now that Microsoft is deprecating SMTP Basic Auth for Exchange Online |

Both share the **From** and **Reply-to** fields and the entire downstream
pipeline (HTML wrapping, Email Design, PDF attachments, `email_logs`
logging, retries). Only the final delivery hop differs — see the
`EmailSender` abstraction in
[`server/email/email-sender.ts`](../../server/email/email-sender.ts).

---

## Why Graph is more secure

- **No mailbox password stored** — only a rotatable client secret, or a
  certificate private key (no shared secret at all).
- **App identity, not a user session** — immune to phishing, session
  hijack, and "someone turned off MFA on the mailbox" risks.
- **Fully auditable** — every token request and API call is logged in
  Entra sign-in logs and the unified audit log, tenant-side.

---

## Setup (Microsoft Graph)

> **Full step-by-step operator runbook:**
> [`../guides/entra-app-registration.md`](../guides/entra-app-registration.md)
> — the registration, consent, credential, and Application Access Policy
> steps with PowerShell and troubleshooting. The summary below is the
> quick version.

**One-time, admin, in Microsoft Entra ID:**

1. **App registrations → New registration.**
2. **API permissions → Microsoft Graph → Application permissions →
   `Mail.Send` → Grant admin consent.**
3. Add a credential — either:
   - **Client secret** (Certificates & secrets → New client secret), or
   - **Certificate** (upload the public cert; keep the private key for
     CriteriaIQ).
4. **Lock the blast radius (strongly recommended).** By default
   `Mail.Send` lets the app send as *any* mailbox in the tenant. Restrict
   it to the one sender mailbox with an Application Access Policy in
   Exchange Online PowerShell:
   ```powershell
   New-ApplicationAccessPolicy `
     -AppId "<CLIENT_ID>" `
     -PolicyScopeGroupId "alerts@yourtenant.com" `
     -AccessRight RestrictAccess `
     -Description "Restrict CriteriaIQ to the alerts mailbox only."
   ```
   After this, any attempt to send as another mailbox returns
   `403 AccessDenied`.
5. Ensure the **sender mailbox** is a real licensed or shared mailbox.

**In CriteriaIQ** (Email Configuration → Authentication method →
Microsoft Graph):
- **Tenant ID**, **Client ID**, **Sender mailbox**.
- **Credential type: Client secret** → paste the secret. **Certificate**
  → paste the PEM private key + the cert SHA-1 thumbprint.
- Set the **From address** (and optional Reply-to), then **Test Email**.

---

## How it works under the hood

`GraphSender` ([`server/email/email-sender.ts`](../../server/email/email-sender.ts)):

1. **Token** — POST `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`,
   `scope=https://graph.microsoft.com/.default`, cached in-process and
   refreshed ~2 min before expiry:
   - *Client secret:* `grant_type=client_credentials` + `client_secret`.
   - *Certificate:* a `client_assertion` JWT signed RS256 with the PEM
     private key (Node `crypto`, no JWT library), `x5t` header from the
     thumbprint.
2. **Send** — POST `https://graph.microsoft.com/v1.0/users/{sender}/sendMail`
   with the bearer token. The provider-agnostic `mailOptions` is mapped
   to a Graph `message` (`toRecipients`, `body` HTML/Text, `from`,
   `internetMessageHeaders` for the `X-*` tracking headers, base64
   `fileAttachment` for the PDF/other attachments). Graph returns
   `202 Accepted`; we synthesize the message id from the pipeline's
   `X-Message-ID`.

No new npm dependencies — `fetch` + `crypto` only.

---

## Error handling, credential verification & throttling

Three areas were hardened after a review of how the two "does Graph work"
checks and error surfacing behaved in practice:

- **One credential-verification path, not two.** The Email Configuration
  screen's **Verify Credentials** button
  (`POST /api/email-configuration/verify-graph-credentials`) now delegates
  to the same `probeEmailSender()` function
  ([`server/email/email-sender.ts`](../../server/email/email-sender.ts))
  used by the System Health dashboard's on-demand probe
  (`POST /api/system/health/email/probe`). Previously the config-screen
  route re-implemented token acquisition from scratch and explicitly
  rejected **certificate**-mode credentials — that gap is closed now that
  both callers share one implementation.
- **Structured error categories**
  ([`server/email/graph-errors.ts`](../../server/email/graph-errors.ts)):
  `GraphAuthError` (bad tenant/client/credential), `GraphPermissionError`
  (token acquired but `sendMail` denied — missing `Mail.Send` admin
  consent, or an Application Access Policy scoping the app out of the
  sender mailbox), and `GraphThrottleError` (HTTP 429). Each error class's
  `name` is returned to the client as `errorCode`, which the Email
  Configuration UI maps to one extra line of admin guidance rather than
  showing only the raw Graph error string. Anything that doesn't match one
  of these three categories still throws a plain `Error` — not every
  failure is forced into an artificial bucket.
- **429 / throttling.** On a `Retry-After` of 3 seconds or less, both token
  acquisition and `sendMail` retry once inline; longer waits throw
  `GraphThrottleError` immediately instead of blocking the caller — email
  sending is invoked from both background automation and interactive
  requests (e.g. "Send Test Email"), and a long blocking retry on an
  interactive request risks a bad UX and, for genuinely long waits, an
  upstream proxy timeout. **Known limitation:** there is no automatic
  requeue for a throttled background/automation-triggered send — it
  surfaces as a normal failed send, logged to `email_logs` with the
  throttle cause. Building a retry-later queue for this is out of scope
  for this hardening pass.
- **Token cache visibility.** `GET /api/email-configuration/graph-token-status`
  reports whether a token is currently cached for the active config and
  when it expires, surfaced as a small "token acquired Xm ago / expires in
  Ym" line under the Graph fields. There is **no force-invalidate action**
  — the cache (`server/email/email-sender.ts`'s module-scope
  `graphTokenCache`) is per-process, so in a multi-worker deployment a
  force-refresh on one worker would misleadingly appear to succeed while
  other workers keep serving the stale token. Revisit only if a genuine
  operational need shows up.

---

## Security of stored credentials

- **Client secret** and **certificate private key** are encrypted at rest
  with AES-256-GCM (`encryptText`/`decryptText`, the same helpers as the
  SMTP password) and are **in the ENCRYPTION_KEY rotation manifest**
  (`server/lib/encrypted-columns.ts` → `ENCRYPTED_COLUMN_MANIFEST`), so they
  re-encrypt on key rotation. See
  [`encryption-key-rotation.md`](encryption-key-rotation.md).
- The API **never returns them in plaintext** — `GET /api/email-configuration`
  masks both with the `••••••••` sentinel; re-saving without re-entering
  retains the stored value.
- The certificate **thumbprint** is not secret and is stored/returned
  plain.

---

## Related files

| Concern | File |
|---|---|
| Transport abstraction (SmtpSender + GraphSender + JWT) | [`server/email/email-sender.ts`](../../server/email/email-sender.ts) |
| Structured Graph error categories | [`server/email/graph-errors.ts`](../../server/email/graph-errors.ts) |
| Send pipeline (provider-agnostic) | [`server/email/email.ts`](../../server/email/email.ts) — `sendEmail()`, `getActiveEmailSender()` |
| Config schema | [`shared/schema/email.ts`](../../shared/schema/email.ts) — `emailConfiguration` (`authType`, `graph*`) |
| Save/get/test routes | [`server/routes/email-configuration-routes.ts`](../../server/routes/email-configuration-routes.ts) |
| Rotation parity | [`server/lib/encrypted-columns.ts`](../../server/lib/encrypted-columns.ts) — `ENCRYPTED_COLUMN_MANIFEST` |
| Config UI | [`client/src/components/configuration/EmailProviderSelect.tsx`](../../client/src/components/configuration/EmailProviderSelect.tsx) |
| Entra setup runbook | [`../guides/entra-app-registration.md`](../guides/entra-app-registration.md) |
