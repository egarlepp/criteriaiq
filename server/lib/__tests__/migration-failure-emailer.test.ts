// @vitest-environment node
//
// Coverage for the boot-time migration-failure email dispatcher (Task #402).
//
// We mock `../db`, `../auth/mfaUtils`, and `nodemailer` so the test runs
// without a Postgres connection or a live SMTP server. The real
// filesystem path under cwd()/data/db-config.json IS exercised so the
// deferred-SMTP fallback test doubles as a check that we honour the
// same on-disk convention that `smtp-hydrate.ts` reads.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const dbExecuteMock = vi.fn();
const decryptTextMock = vi.fn((s: string) => `decrypted:${s}`);

// Synthetic AES-256-GCM envelope shape produced by `encryptText`:
// 24 hex chars (12-byte IV) ":" ciphertext hex ":" 32 hex chars
// (16-byte auth tag). Real ciphertext content is irrelevant — the
// emailer only inspects the envelope shape and delegates to the
// mocked `decryptText`.
const ENC = (label: string) =>
  `${"a".repeat(24)}:${Buffer.from(label, "utf8").toString("hex")}:${"b".repeat(32)}`;
const sendMailMock = vi.fn(async () => ({ messageId: "test-message-id" }));
const transportCloseMock = vi.fn();
const createTransportMock = vi.fn(() => ({
  sendMail: sendMailMock,
  close: transportCloseMock,
}));

vi.mock("../../db", () => ({
  get db() {
    return { execute: dbExecuteMock };
  },
}));

vi.mock("../../auth/mfaUtils", () => ({
  decryptText: (s: string) => decryptTextMock(s),
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: (...args: unknown[]) => createTransportMock(...args),
  },
}));

const CONFIG_FILE = path.join(process.cwd(), "data", "db-config.json");
const DATA_DIR = path.dirname(CONFIG_FILE);

function clearDeferredFile() {
  try {
    if (fs.existsSync(CONFIG_FILE)) fs.unlinkSync(CONFIG_FILE);
  } catch {
    // ignore
  }
}

function writeDeferredFile(contents: unknown) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(contents, null, 2), "utf8");
}

const MARKER = {
  filename: "023_add_foo_index.sql",
  sqlState: "42703",
  error: 'column "foo" does not exist',
  failedAt: "2026-04-26T12:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  decryptTextMock.mockImplementation((s: string) => `decrypted:${s}`);
  sendMailMock.mockImplementation(async () => ({
    messageId: "test-message-id",
  }));
  clearDeferredFile();
});

afterEach(() => {
  clearDeferredFile();
});

async function loadModule() {
  // Re-import so module-level state from earlier tests doesn't leak.
  vi.resetModules();
  return await import("../migration-failure-emailer");
}

describe("sendMigrationFailureEmail — happy path via DB email_configuration", () => {
  it("sends one email to the first approved admin with marker details (admin-UI shape: both fields encrypted)", async () => {
    // First execute() call: SELECT from email_configuration
    // Second: SELECT from users
    const userEnvelope = ENC("user-payload");
    const passEnvelope = ENC("pass-payload");
    dbExecuteMock
      .mockResolvedValueOnce({
        rows: [
          {
            enabled: true,
            server: "smtp.example.com",
            port: 587,
            from_address: "no-reply@example.com",
            username: userEnvelope,
            password: passEnvelope,
            tls: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ email: "ops@example.com" }],
      });

    const { sendMigrationFailureEmail } = await loadModule();
    await sendMigrationFailureEmail(MARKER);

    expect(createTransportMock).toHaveBeenCalledTimes(1);
    const transportArgs = createTransportMock.mock.calls[0][0] as {
      host: string;
      port: number;
      secure: boolean;
      requireTLS: boolean;
      auth?: { user: string; pass: string };
    };
    expect(transportArgs.host).toBe("smtp.example.com");
    expect(transportArgs.port).toBe(587);
    expect(transportArgs.secure).toBe(false);
    expect(transportArgs.requireTLS).toBe(true);
    expect(transportArgs.auth).toEqual({
      user: `decrypted:${userEnvelope}`,
      pass: `decrypted:${passEnvelope}`,
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const mail = sendMailMock.mock.calls[0][0] as {
      to: string;
      from: string;
      subject: string;
      text: string;
      html: string;
    };
    // Single-recipient case still produces a plain `To:` value with no
    // join artefacts.
    expect(mail.to).toBe("ops@example.com");
    expect(mail.from).toBe("no-reply@example.com");
    expect(mail.subject).toContain("023_add_foo_index.sql");
    expect(mail.text).toContain("023_add_foo_index.sql");
    expect(mail.text).toContain("42703");
    expect(mail.text).toContain('column "foo" does not exist');
    expect(mail.text).toContain("2026-04-26T12:00:00.000Z");
    expect(mail.html).toContain("023_add_foo_index.sql");
    expect(mail.html).toContain("42703");
    expect(transportCloseMock).toHaveBeenCalled();
  });

  it("treats port 465 as implicit TLS (secure=true, requireTLS=false)", async () => {
    dbExecuteMock
      .mockResolvedValueOnce({
        rows: [
          {
            enabled: true,
            server: "smtp.example.com",
            port: 465,
            from_address: "no-reply@example.com",
            username: ENC("user-payload"),
            password: ENC("pass-payload"),
            tls: false, // explicitly false; port should still force TLS
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ email: "ops@example.com" }] });

    const { sendMigrationFailureEmail } = await loadModule();
    await sendMigrationFailureEmail(MARKER);

    const args = createTransportMock.mock.calls[0][0] as {
      secure: boolean;
      requireTLS: boolean;
    };
    expect(args.secure).toBe(true);
    expect(args.requireTLS).toBe(false);
  });

  it("omits the SQLSTATE line when sqlState is null", async () => {
    dbExecuteMock
      .mockResolvedValueOnce({
        rows: [
          {
            enabled: true,
            server: "smtp.example.com",
            port: 587,
            from_address: "no-reply@example.com",
            username: ENC("user-payload"),
            password: ENC("pass-payload"),
            tls: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ email: "ops@example.com" }] });

    const { sendMigrationFailureEmail } = await loadModule();
    await sendMigrationFailureEmail({ ...MARKER, sqlState: null });

    const mail = sendMailMock.mock.calls[0][0] as { text: string; html: string };
    expect(mail.text).not.toContain("SQLSTATE");
    expect(mail.html).not.toContain("SQLSTATE");
  });
});

describe("sendMigrationFailureEmail — fans out to every approved admin (Task #407)", () => {
  it("joins every approved admin email into a single sendMail call (founder first by created_at)", async () => {
    // Two approved admins. The query orders by created_at ASC NULLS LAST,
    // so the founder (oldest row) appears first in the recipient list.
    // We assert the order to lock in the "founder-first" UX from the
    // operator's point of view when they read the To: header.
    dbExecuteMock
      .mockResolvedValueOnce({
        rows: [
          {
            enabled: true,
            server: "smtp.example.com",
            port: 587,
            from_address: "no-reply@example.com",
            username: ENC("user-payload"),
            password: ENC("pass-payload"),
            tls: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { email: "founder@example.com" },
          { email: "secondary@example.com" },
          { email: "oncall@example.com" },
        ],
      });

    const { sendMigrationFailureEmail } = await loadModule();
    await sendMigrationFailureEmail(MARKER);

    // Single transport, single sendMail — fans out via the recipient
    // header, NOT via N separate transactions, so we stay within the
    // 10s SEND_TIMEOUT_MS budget.
    expect(createTransportMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledTimes(1);

    const mail = sendMailMock.mock.calls[0][0] as { to: string };
    expect(mail.to).toBe(
      "founder@example.com, secondary@example.com, oncall@example.com",
    );
  });

  it("includes receive_emails opt-out in the SQL filter so opted-out admins never receive boot alerts", async () => {
    // The DB returns only the two admins who haven't opted out — we
    // assert at the SQL layer rather than filtering client-side because
    // the opt-out is the SAME contract `users.receive_emails` provides
    // to the rest of the application's transactional mail.
    let capturedSql = "";
    dbExecuteMock.mockImplementation(async (query: any) => {
      const sqlText = (query?.queryChunks ?? [])
        .map((c: any) =>
          typeof c === "string" ? c : c?.value?.[0] ?? "",
        )
        .join("");
      if (sqlText.includes("email_configuration")) {
        return {
          rows: [
            {
              enabled: true,
              server: "smtp.example.com",
              port: 587,
              from_address: "no-reply@example.com",
              username: ENC("user-payload"),
              password: ENC("pass-payload"),
              tls: false,
            },
          ],
        };
      }
      if (sqlText.includes("users")) {
        capturedSql = sqlText;
        return {
          rows: [
            { email: "founder@example.com" },
            { email: "oncall@example.com" },
          ],
        };
      }
      return { rows: [] };
    });

    const { sendMigrationFailureEmail } = await loadModule();
    await sendMigrationFailureEmail(MARKER);

    expect(capturedSql).toMatch(/receive_emails IS DISTINCT FROM false/i);
    const mail = sendMailMock.mock.calls[0][0] as { to: string };
    expect(mail.to).toBe("founder@example.com, oncall@example.com");
  });

  it("de-duplicates case-different addresses so the SMTP server doesn't see the same recipient twice", async () => {
    dbExecuteMock
      .mockResolvedValueOnce({
        rows: [
          {
            enabled: true,
            server: "smtp.example.com",
            port: 587,
            from_address: "no-reply@example.com",
            username: ENC("user-payload"),
            password: ENC("pass-payload"),
            tls: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { email: "Ops@Example.com" },
          { email: "ops@example.com" }, // case-different duplicate
          { email: "  " }, // whitespace-only — should be dropped
          { email: null }, // defensive: should not be returned by SQL but tolerated
          { email: "secondary@example.com" },
        ],
      });

    const { sendMigrationFailureEmail } = await loadModule();
    await sendMigrationFailureEmail(MARKER);

    const mail = sendMailMock.mock.calls[0][0] as { to: string };
    // First-seen wins on the original casing; duplicate dropped; blanks dropped.
    expect(mail.to).toBe("Ops@Example.com, secondary@example.com");
    expect(sendMailMock).toHaveBeenCalledTimes(1);
  });
});

describe("sendMigrationFailureEmail — gating and fallbacks", () => {
  it("no-ops silently when no SMTP config is persisted anywhere", async () => {
    // DB returns no row, no deferred file present.
    dbExecuteMock.mockResolvedValueOnce({ rows: [] });
    // Admin lookup never reached because we bail before it.
    const { sendMigrationFailureEmail } = await loadModule();
    await sendMigrationFailureEmail(MARKER);
    expect(createTransportMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("no-ops when SMTP row exists but enabled=false (fall through to file fallback)", async () => {
    dbExecuteMock.mockResolvedValueOnce({
      rows: [
        {
          enabled: false,
          server: "smtp.example.com",
          port: 587,
          from_address: "no-reply@example.com",
          username: ENC("user-payload"),
          password: ENC("pass-payload"),
          tls: false,
        },
      ],
    });
    // No deferred file either.
    const { sendMigrationFailureEmail } = await loadModule();
    await sendMigrationFailureEmail(MARKER);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("falls back to deferred SMTP from data/db-config.json when DB has no row", async () => {
    dbExecuteMock
      // First call: email_configuration → empty
      .mockResolvedValueOnce({ rows: [] })
      // Second call: users (admin lookup)
      .mockResolvedValueOnce({ rows: [{ email: "ops@example.com" }] });

    writeDeferredFile({
      smtp: {
        host: "deferred.example.com",
        port: 587,
        username: "deferred-user",
        passwordEncrypted: "deferred-pass-enc",
        fromAddress: "wizard@example.com",
        secure: false,
      },
    });

    const { sendMigrationFailureEmail } = await loadModule();
    await sendMigrationFailureEmail(MARKER);

    const args = createTransportMock.mock.calls[0][0] as {
      host: string;
      auth?: { user: string; pass: string };
    };
    expect(args.host).toBe("deferred.example.com");
    expect(args.auth).toEqual({
      user: "deferred-user", // username is NOT encrypted in deferred file
      pass: "decrypted:deferred-pass-enc",
    });
    const mail = sendMailMock.mock.calls[0][0] as { from: string; to: string };
    expect(mail.from).toBe("wizard@example.com");
    expect(mail.to).toBe("ops@example.com");
  });

  it("no-ops when SMTP is found but no approved admin exists", async () => {
    dbExecuteMock
      .mockResolvedValueOnce({
        rows: [
          {
            enabled: true,
            server: "smtp.example.com",
            port: 587,
            from_address: "no-reply@example.com",
            username: ENC("user-payload"),
            password: ENC("pass-payload"),
            tls: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const { sendMigrationFailureEmail } = await loadModule();
    await sendMigrationFailureEmail(MARKER);
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});

describe("sendMigrationFailureEmail — never throws", () => {
  it("swallows transport.sendMail errors and logs a warning", async () => {
    dbExecuteMock
      .mockResolvedValueOnce({
        rows: [
          {
            enabled: true,
            server: "smtp.example.com",
            port: 587,
            from_address: "no-reply@example.com",
            username: ENC("user-payload"),
            password: ENC("pass-payload"),
            tls: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ email: "ops@example.com" }] });
    sendMailMock.mockRejectedValueOnce(new Error("ECONNREFUSED smtp"));

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { sendMigrationFailureEmail } = await loadModule();
    await expect(sendMigrationFailureEmail(MARKER)).resolves.toBeUndefined();

    expect(
      errorSpy.mock.calls.some((args) =>
        String(args[0]).includes("[migration-email]"),
      ),
    ).toBe(true);
    errorSpy.mockRestore();
  });

  it("swallows DB execute errors and silently no-ops", async () => {
    dbExecuteMock.mockRejectedValueOnce(new Error("relation does not exist"));
    // No deferred file → still no-op.
    const { sendMigrationFailureEmail } = await loadModule();
    await expect(sendMigrationFailureEmail(MARKER)).resolves.toBeUndefined();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("skips sending when SMTP username LOOKS encrypted but decryption fails", async () => {
    dbExecuteMock.mockResolvedValueOnce({
      rows: [
        {
          enabled: true,
          server: "smtp.example.com",
          port: 587,
          from_address: "no-reply@example.com",
          username: ENC("user-payload"),
          password: ENC("pass-payload"),
          tls: false,
        },
      ],
    });
    // Decrypt throws on the FIRST call (username) — this is the
    // hard-failure case we need to surface as "skip" rather than
    // letting a half-decrypted credential reach the SMTP server.
    decryptTextMock.mockImplementationOnce(() => {
      throw new Error("ENCRYPTION_KEY missing");
    });
    const { sendMigrationFailureEmail } = await loadModule();
    await expect(sendMigrationFailureEmail(MARKER)).resolves.toBeUndefined();
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});

describe("sendMigrationFailureEmail — hydrated DB row (plaintext username + encrypted password)", () => {
  // Regression coverage for the wizard → smtp-hydrate.ts insert path,
  // which writes `username` as PLAINTEXT and only encrypts `password`.
  // The boot-failure email must work in this shape too — without
  // this branch the most common "operator just finished the wizard
  // and the very first post-wizard boot crashes a migration" case
  // would silently skip the email.
  it("sends the email using plaintext username and decrypted password", async () => {
    const passEnvelope = ENC("hydrated-pass");
    dbExecuteMock
      .mockResolvedValueOnce({
        rows: [
          {
            enabled: true,
            server: "smtp.example.com",
            port: 587,
            from_address: "wizard@example.com",
            username: "operator@example.com", // plaintext on purpose
            password: passEnvelope,
            tls: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ email: "ops@example.com" }] });

    const { sendMigrationFailureEmail } = await loadModule();
    await sendMigrationFailureEmail(MARKER);

    expect(createTransportMock).toHaveBeenCalledTimes(1);
    const args = createTransportMock.mock.calls[0][0] as {
      auth?: { user: string; pass: string };
    };
    expect(args.auth).toEqual({
      user: "operator@example.com", // pass-through, NOT decrypted
      pass: `decrypted:${passEnvelope}`, // decrypted via mock
    });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect((sendMailMock.mock.calls[0][0] as { from: string }).from).toBe(
      "wizard@example.com",
    );
  });
});

describe("looksEncrypted heuristic", () => {
  it("recognises the iv:cipher:tag envelope produced by encryptText", async () => {
    const { _internals } = await loadModule();
    expect(_internals.looksEncrypted(ENC("anything"))).toBe(true);
  });

  it("rejects typical SMTP usernames (email, dotted, with @)", async () => {
    const { _internals } = await loadModule();
    expect(_internals.looksEncrypted("alice@example.com")).toBe(false);
    expect(_internals.looksEncrypted("smtp_user_123")).toBe(false);
    expect(_internals.looksEncrypted("AKIAIOSFODNN7EXAMPLE")).toBe(false);
  });

  it("rejects strings with the right colon shape but wrong segment lengths", async () => {
    const { _internals } = await loadModule();
    expect(_internals.looksEncrypted("aa:bb:cc")).toBe(false);
    expect(_internals.looksEncrypted(`${"a".repeat(24)}:zz:${"b".repeat(32)}`))
      .toBe(false); // non-hex middle
  });
});

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", async () => {
    const { _internals } = await loadModule();
    expect(_internals.escapeHtml('a&b<c>d"e\'f')).toBe(
      "a&amp;b&lt;c&gt;d&quot;e&#39;f",
    );
  });
});

// ---------------------------------------------------------------------------
// Task #406: recovery / "all clear" companion email.
//
// The recovery path is structurally identical to the failure path
// (same SMTP loader, same admin lookup, same hard timeout, same silent-
// no-op-on-no-config posture). These tests focus on the *differences*:
//   - distinct subject line (so existing on-call alert rules keyed on
//     the failure subject don't fire for recoveries),
//   - body cites the previously-failing filename, the original
//     failedAt timestamp, AND the recovery timestamp,
//   - never throws even when the transport rejects.
// We don't re-prove the SMTP-loader / admin-lookup branches here —
// they're shared code already covered by the failure-path tests above.
// ---------------------------------------------------------------------------

const RECOVERED_AT = "2026-04-26T13:00:00.000Z";

describe("sendMigrationRecoveryEmail — happy path", () => {
  it("sends one recovery email naming the previously-failing migration and both timestamps", async () => {
    dbExecuteMock
      .mockResolvedValueOnce({
        rows: [
          {
            enabled: true,
            server: "smtp.example.com",
            port: 587,
            from_address: "no-reply@example.com",
            username: ENC("user-payload"),
            password: ENC("pass-payload"),
            tls: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ email: "ops@example.com" }] });

    const { sendMigrationRecoveryEmail } = await loadModule();
    await sendMigrationRecoveryEmail(MARKER, RECOVERED_AT);

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const mail = sendMailMock.mock.calls[0][0] as {
      to: string;
      from: string;
      subject: string;
      text: string;
      html: string;
    };
    expect(mail.to).toBe("ops@example.com");
    expect(mail.from).toBe("no-reply@example.com");
    // Distinct subject so on-call alert rules keyed on "failed" don't
    // fire for the "recovered" follow-up.
    expect(mail.subject).toContain("recovered");
    expect(mail.subject).toContain(MARKER.filename);
    expect(mail.subject).not.toContain("failed");

    // Body must cite the previously-failing filename + both timestamps
    // so the inbox thread reads as a clean open / close pair.
    expect(mail.text).toContain(MARKER.filename);
    expect(mail.text).toContain(MARKER.failedAt);
    expect(mail.text).toContain(RECOVERED_AT);
    expect(mail.html).toContain(MARKER.filename);
    expect(mail.html).toContain(MARKER.failedAt);
    expect(mail.html).toContain(RECOVERED_AT);

    expect(transportCloseMock).toHaveBeenCalled();
  });

  it("falls back to deferred SMTP from data/db-config.json when DB has no row", async () => {
    dbExecuteMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ email: "ops@example.com" }] });

    writeDeferredFile({
      smtp: {
        host: "deferred.example.com",
        port: 587,
        username: "deferred-user",
        passwordEncrypted: "deferred-pass-enc",
        fromAddress: "wizard@example.com",
        secure: false,
      },
    });

    const { sendMigrationRecoveryEmail } = await loadModule();
    await sendMigrationRecoveryEmail(MARKER, RECOVERED_AT);

    expect(createTransportMock).toHaveBeenCalledTimes(1);
    const mail = sendMailMock.mock.calls[0][0] as { from: string; to: string };
    expect(mail.from).toBe("wizard@example.com");
    expect(mail.to).toBe("ops@example.com");
  });
});

describe("sendMigrationRecoveryEmail — fans out to every approved admin (Task #407)", () => {
  it("joins every approved admin email into a single sendMail call so the open/close pair lands in the same inboxes", async () => {
    // Multi-admin recovery should mirror the failure-path recipient
    // shape exactly — otherwise the on-call inbox sees a "failed"
    // alert without a matching "recovered" follow-up and the operator
    // is left wondering whether the deployment ever came back up.
    dbExecuteMock
      .mockResolvedValueOnce({
        rows: [
          {
            enabled: true,
            server: "smtp.example.com",
            port: 587,
            from_address: "no-reply@example.com",
            username: ENC("user-payload"),
            password: ENC("pass-payload"),
            tls: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { email: "founder@example.com" },
          { email: "secondary@example.com" },
        ],
      });

    const { sendMigrationRecoveryEmail } = await loadModule();
    await sendMigrationRecoveryEmail(MARKER, RECOVERED_AT);

    expect(createTransportMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const mail = sendMailMock.mock.calls[0][0] as { to: string };
    expect(mail.to).toBe("founder@example.com, secondary@example.com");
  });
});

describe("sendMigrationRecoveryEmail — gating and resilience", () => {
  it("no-ops silently when no SMTP config is persisted anywhere", async () => {
    // Deliberately mirrors the failure-path silent-no-op contract:
    // a fresh install with no SMTP creds should not log per-boot
    // noise just because it cleared a marker.
    dbExecuteMock.mockResolvedValueOnce({ rows: [] });
    const { sendMigrationRecoveryEmail } = await loadModule();
    await sendMigrationRecoveryEmail(MARKER, RECOVERED_AT);
    expect(createTransportMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("no-ops when SMTP is found but no approved admin exists", async () => {
    dbExecuteMock
      .mockResolvedValueOnce({
        rows: [
          {
            enabled: true,
            server: "smtp.example.com",
            port: 587,
            from_address: "no-reply@example.com",
            username: ENC("user-payload"),
            password: ENC("pass-payload"),
            tls: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const { sendMigrationRecoveryEmail } = await loadModule();
    await sendMigrationRecoveryEmail(MARKER, RECOVERED_AT);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("swallows transport.sendMail errors and logs a warning — never throws", async () => {
    // Boot is already proceeding successfully when the recovery path
    // runs; an SMTP hiccup MUST NOT block the container from coming up.
    dbExecuteMock
      .mockResolvedValueOnce({
        rows: [
          {
            enabled: true,
            server: "smtp.example.com",
            port: 587,
            from_address: "no-reply@example.com",
            username: ENC("user-payload"),
            password: ENC("pass-payload"),
            tls: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ email: "ops@example.com" }] });
    sendMailMock.mockRejectedValueOnce(new Error("ECONNREFUSED smtp"));

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { sendMigrationRecoveryEmail } = await loadModule();
    await expect(
      sendMigrationRecoveryEmail(MARKER, RECOVERED_AT),
    ).resolves.toBeUndefined();

    expect(
      errorSpy.mock.calls.some((args) =>
        String(args[0]).includes("[migration-email]"),
      ),
    ).toBe(true);
    errorSpy.mockRestore();
  });
});
