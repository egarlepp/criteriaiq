// Email transport abstraction (Microsoft Graph + SMTP).
//
// CriteriaIQ historically sent every email through nodemailer + SMTP
// basic auth. This module adds Microsoft Graph `sendMail` as a second
// transport WITHOUT touching the rich send pipeline in `email.ts`
// (HTML wrapping, Email Design, PDF attachments, email_logs logging,
// retries). `sendEmail()` builds a provider-agnostic `mailOptions`
// object and hands it to whichever `EmailSender` `getEmailSender()`
// returns based on `config.authType`.
//
// No new dependencies: Graph token acquisition (client secret OR
// certificate `client_assertion` JWT) uses the built-in `fetch` and
// Node's `crypto`. See docs/features/email-graph-sending.md.

import crypto from "crypto";
import nodemailer from "nodemailer";
import { decryptText } from "../auth/mfaUtils";
import type { EmailConfiguration } from "@shared/schema";
import { GraphAuthError, GraphPermissionError, GraphThrottleError, isGraphStructuredError } from "./graph-errors";

/** Provider-agnostic mail payload built by `sendEmail()` in email.ts. */
export interface MailOptions {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

export interface SendResult {
  messageId: string;
  /** Recipients the transport ACCEPTED (SMTP `info.accepted`). */
  accepted?: string[];
  /** Recipients the transport REJECTED (SMTP `info.rejected`). Non-empty with an
   *  empty `accepted` means "the server took the connection but delivered to
   *  nobody" — the classic "logged as Sent but never received" case. */
  rejected?: string[];
  /** A short provider trace string for diagnosis: the SMTP server's response
   *  line, or the Microsoft Graph `request-id` (correlate with Exchange message
   *  trace). Stored alongside the email log's message id. */
  response?: string;
}

export interface EmailSender {
  send(mail: MailOptions): Promise<SendResult>;
}

// ── SMTP (nodemailer) ────────────────────────────────────────────────

class SmtpSender implements EmailSender {
  constructor(private readonly config: EmailConfiguration) {}

  async send(mail: MailOptions): Promise<SendResult> {
    const username = this.config.username ? decryptText(this.config.username) : "";
    const password = this.config.password ? decryptText(this.config.password) : "";
    const transporter = nodemailer.createTransport({
      host: this.config.server ?? undefined,
      port: this.config.port,
      secure: !!this.config.tls, // implicit TLS (465)
      requireTLS: !!this.config.startTLS, // STARTTLS (587)
      auth: { user: username, pass: password },
    });
    const info = await transporter.sendMail(mail as any);
    // Surface nodemailer's per-recipient outcome. `sendMail` resolves even when
    // the server accepted the connection but rejected every recipient, so the
    // caller (email.ts) inspects `accepted`/`rejected` to avoid logging an
    // undeliverable message as "Sent".
    const toAddr = (a: any): string =>
      typeof a === "string" ? a : a?.address ?? String(a);
    return {
      messageId: info.messageId,
      accepted: (info.accepted ?? []).map(toAddr),
      rejected: (info.rejected ?? []).map(toAddr),
      response: info.response,
    };
  }
}

// ── Microsoft Graph sendMail ─────────────────────────────────────────

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}
// Cached client-credentials tokens, keyed by tenant+client. Tokens last
// ~60–90 min; we refresh ~2 min early. Module scope so it survives
// across sends within a process.
//
// NOTE: this cache is per-process. In a multi-worker deployment, a token
// acquired by one worker is invisible to the others — there is no
// force-invalidate action exposed to admins for this reason (it would
// misleadingly appear to work while other workers keep the stale token).
// getGraphTokenStatus() below only reports the current process's view.
const graphTokenCache = new Map<string, CachedToken>();

// A 429 with a short Retry-After is worth one inline retry; anything
// longer throws immediately rather than blocking the caller (which may be
// an interactive "Send Test Email" click, not just a background job).
const GRAPH_RETRY_MAX_WAIT_MS = 3000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Build a signed `client_assertion` JWT for certificate-based
 * client-credentials auth (RS256). The public cert is uploaded to the
 * Entra app registration; the matching PEM private key signs here. The
 * `x5t` header is the base64url of the cert's binary SHA-1 thumbprint,
 * derived from the hex thumbprint the admin pastes.
 */
function buildClientAssertion(params: {
  tenantId: string;
  clientId: string;
  privateKeyPem: string;
  thumbprintHex: string;
}): string {
  const { tenantId, clientId, privateKeyPem, thumbprintHex } = params;
  const x5t = base64Url(Buffer.from(thumbprintHex.replace(/[^0-9a-fA-F]/g, ""), "hex"));
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", x5t };
  const aud = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const payload = {
    aud,
    iss: clientId,
    sub: clientId,
    jti: crypto.randomUUID(),
    nbf: now,
    exp: now + 600, // 10 min assertion lifetime
  };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(signingInput)
    .sign(privateKeyPem);
  return `${signingInput}.${base64Url(signature)}`;
}

/**
 * Acquires a Microsoft Graph client-credentials token and classifies any
 * failure into GraphAuthError / GraphThrottleError. Shared by
 * `GraphSender.getToken()` (which caches the result) and
 * `probeEmailSender()` (which does not — the probe path deliberately
 * stays independent of the send-path cache). On a 429 with a short
 * `Retry-After`, retries once inline before giving up.
 */
async function fetchGraphToken(
  config: EmailConfiguration,
  attempt = 0,
): Promise<{ accessToken: string; expiresIn: number }> {
  const tenantId = config.graphTenantId!;
  const clientId = config.graphClientId!;

  const body = new URLSearchParams({
    client_id: clientId,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  if (config.graphCredentialType === "certificate") {
    const privateKeyPem = decryptText(config.graphCertificatePem!);
    body.set(
      "client_assertion_type",
      "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    );
    body.set(
      "client_assertion",
      buildClientAssertion({
        tenantId,
        clientId,
        privateKeyPem,
        thumbprintHex: config.graphCertificateThumbprint!,
      }),
    );
  } else {
    body.set("client_secret", decryptText(config.graphClientSecret!));
  }

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );

  if (res.status === 429) {
    const retryAfterSeconds = parseInt(res.headers.get("retry-after") ?? "", 10) || 30;
    if (attempt === 0 && retryAfterSeconds * 1000 <= GRAPH_RETRY_MAX_WAIT_MS) {
      await sleep(retryAfterSeconds * 1000);
      return fetchGraphToken(config, attempt + 1);
    }
    throw new GraphThrottleError(retryAfterSeconds);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    let graphErrorCode: string | null = null;
    let description = errText.slice(0, 300);
    try {
      const parsed = JSON.parse(errText);
      graphErrorCode = parsed.error ?? null;
      description = parsed.error_description || parsed.error || description;
    } catch {
      // errText wasn't JSON — fall back to the raw (truncated) body above.
    }
    throw new GraphAuthError({ httpStatus: res.status, graphErrorCode, description });
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  return { accessToken: json.access_token, expiresIn: json.expires_in ?? 3600 };
}

/**
 * Read-only view into the per-process Graph token cache — "is a token
 * currently cached for this config, and when does it expire." No
 * force-invalidate action is exposed (see the cache's own doc comment
 * above for why). Used by GET /api/system/health/email/graph-token-status.
 */
export function getGraphTokenStatus(
  config: EmailConfiguration,
): { cached: boolean; expiresAt: number | null } {
  if (config.authType !== "graph" || !config.graphTenantId || !config.graphClientId) {
    return { cached: false, expiresAt: null };
  }
  const cached = graphTokenCache.get(`${config.graphTenantId}:${config.graphClientId}`);
  return { cached: !!cached, expiresAt: cached?.expiresAt ?? null };
}

class GraphSender implements EmailSender {
  constructor(private readonly config: EmailConfiguration) {}

  private async getToken(): Promise<string> {
    const tenantId = this.config.graphTenantId!;
    const clientId = this.config.graphClientId!;
    const cacheKey = `${tenantId}:${clientId}`;
    const cached = graphTokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() + 120_000) {
      return cached.token;
    }

    const { accessToken, expiresIn } = await fetchGraphToken(this.config);
    graphTokenCache.set(cacheKey, {
      token: accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
    });
    return accessToken;
  }

  private toGraphMessage(mail: MailOptions): Record<string, unknown> {
    const toRecipients = mail.to
      .split(",")
      .map((addr) => addr.trim())
      .filter(Boolean)
      .map((address) => ({ emailAddress: { address } }));

    const message: Record<string, unknown> = {
      subject: mail.subject,
      body: mail.html
        ? { contentType: "HTML", content: mail.html }
        : { contentType: "Text", content: mail.text ?? "" },
      toRecipients,
      from: { emailAddress: { address: this.extractAddress(mail.from) } },
    };

    if (mail.headers && Object.keys(mail.headers).length > 0) {
      // Graph only accepts custom headers whose name begins with `X-`
      // (or `x-`). Our pipeline already uses X- headers, but filter to
      // be safe.
      const internetMessageHeaders = Object.entries(mail.headers)
        .filter(([name]) => /^x-/i.test(name))
        .map(([name, value]) => ({ name, value: String(value ?? "") }));
      if (internetMessageHeaders.length > 0) {
        message.internetMessageHeaders = internetMessageHeaders;
      }
    }

    if (mail.attachments && mail.attachments.length > 0) {
      message.attachments = mail.attachments.map((att) => ({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: att.filename,
        contentType: att.contentType ?? "application/octet-stream",
        contentBytes: Buffer.isBuffer(att.content)
          ? att.content.toString("base64")
          : Buffer.from(att.content).toString("base64"),
      }));
    }

    return message;
  }

  /** Pull the bare address out of a `Name <addr@x>` or plain string. */
  private extractAddress(from: string): string {
    const m = from.match(/<([^>]+)>/);
    return (m ? m[1] : from).trim();
  }

  async send(mail: MailOptions): Promise<SendResult> {
    const token = await this.getToken();
    const sender = this.config.graphSenderEmail!;
    const message = this.toGraphMessage(mail);
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        // saveToSentItems: true so a genuinely-sent message lands in the sender
        // mailbox's Sent Items. This is both an audit trail and the quickest way
        // to confirm delivery actually happened when a 202 is logged but the
        // recipient reports nothing arrived — if it's NOT in Sent Items, Graph
        // never really sent it; if it IS, the problem is downstream (transport
        // rule / spam / quarantine).
        body: JSON.stringify({ message, saveToSentItems: true }),
      },
    );
    // Graph sendMail returns 202 Accepted with an empty body and no message id.
    if (res.status !== 202) {
      if (res.status === 429) {
        const retryAfterSeconds = parseInt(res.headers.get("retry-after") ?? "", 10) || 30;
        throw new GraphThrottleError(retryAfterSeconds);
      }
      const errText = await res.text().catch(() => "");
      // Graph's Mail API error shape is `{ error: { code, message } }` —
      // distinct from the token endpoint's `{ error, error_description }`
      // shape handled in fetchGraphToken().
      let graphErrorCode: string | null = null;
      let description = errText.slice(0, 300);
      try {
        const parsed = JSON.parse(errText);
        graphErrorCode = parsed?.error?.code ?? null;
        description = parsed?.error?.message || description;
      } catch {
        // errText wasn't JSON — fall back to the raw (truncated) body above.
      }
      if (res.status === 403) {
        throw new GraphPermissionError({ httpStatus: res.status, graphErrorCode, description });
      }
      throw new Error(
        `Microsoft Graph sendMail failed (HTTP ${res.status}${graphErrorCode ? ` ${graphErrorCode}` : ""}): ${description}`,
      );
    }
    // Capture Graph's request id so the admin can correlate a 202 with Exchange
    // Online message trace (the authoritative "what happened to this message?"
    // tool). Synthesize a stable message id from our X-Message-ID header.
    const requestId =
      res.headers.get("request-id") || res.headers.get("client-request-id") || "";
    const messageId = mail.headers?.["X-Message-ID"] || `graph_${crypto.randomUUID()}`;
    return {
      messageId,
      response: requestId ? `graph-request-id=${requestId}` : undefined,
    };
  }
}

// ── Factory ──────────────────────────────────────────────────────────

/**
 * Returns the configured transport. Branches on `config.authType`
 * ('graph' → Microsoft Graph; anything else → SMTP). Callers should
 * have already verified the config is enabled.
 */
export function getEmailSender(config: EmailConfiguration): EmailSender {
  if (config.authType === "graph") {
    return new GraphSender(config);
  }
  return new SmtpSender(config);
}

// ── Transport probe (no email sent) ──────────────────────────────────

/**
 * Probes the configured email transport without sending any message.
 *
 * SMTP:  Creates a nodemailer transporter and calls transporter.verify() —
 *        opens a TCP connection, performs the SMTP handshake + credential
 *        exchange, then closes. No message is queued or delivered.
 *
 * Graph: Acquires a Microsoft Graph OAuth2 access token using the stored
 *        credentials (client-secret or certificate client_assertion). A
 *        successful token response confirms the Entra app registration,
 *        tenant ID, client ID, permissions, and credential are all valid.
 *        No sendMail call is made.
 *
 * Used by POST /api/system/health/email/probe for the on-demand "Test
 * Connection" button in the Email System Health dashboard.
 *
 * Returns { success, message, latencyMs }.
 */
export async function probeEmailSender(
  config: EmailConfiguration,
): Promise<{ success: boolean; message: string; latencyMs: number; errorCode?: string }> {
  const start = Date.now();
  try {
    if (config.authType === "graph") {
      const tenantId = config.graphTenantId;
      const clientId = config.graphClientId;
      if (!tenantId || !clientId || !config.graphSenderEmail) {
        return {
          success: false,
          message:
            "Microsoft Graph configuration is incomplete (missing tenant ID, client ID, or sender email).",
          latencyMs: Date.now() - start,
        };
      }

      // Intentionally does NOT use fetchGraphToken()'s caller (GraphSender) —
      // the probe path stays independent of the real send-path token cache,
      // and does not itself populate the cache, so a probe never masks a
      // genuinely stale cached token on the send path.
      try {
        const { expiresIn } = await fetchGraphToken(config);
        return {
          success: true,
          message: `Microsoft Graph credentials verified — token acquired (expires in ${expiresIn}s).`,
          latencyMs: Date.now() - start,
        };
      } catch (graphError) {
        const message = graphError instanceof Error ? graphError.message : String(graphError);
        return {
          success: false,
          message,
          latencyMs: Date.now() - start,
          errorCode: isGraphStructuredError(graphError) ? graphError.name : undefined,
        };
      }
    } else {
      // SMTP — nodemailer verify() opens a connection, performs the greeting
      // and login exchange, then closes cleanly.
      if (!config.server) {
        return {
          success: false,
          message: "SMTP configuration is incomplete (no server address configured).",
          latencyMs: Date.now() - start,
        };
      }
      const username = config.username ? decryptText(config.username) : "";
      const password = config.password ? decryptText(config.password) : "";
      const transporter = nodemailer.createTransport({
        host: config.server,
        port: config.port ?? 587,
        secure: !!config.tls,       // implicit TLS on port 465
        requireTLS: !!config.startTLS, // STARTTLS upgrade on 587
        auth: { user: username, pass: password },
        // Short timeouts so the probe doesn't stall the health endpoint
        connectionTimeout: 8_000,
        greetingTimeout: 5_000,
        socketTimeout: 8_000,
      });
      await transporter.verify();
      return {
        success: true,
        message: `SMTP connection verified — ${config.server}:${config.port ?? 587} authenticated successfully.`,
        latencyMs: Date.now() - start,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message, latencyMs: Date.now() - start };
  }
}
