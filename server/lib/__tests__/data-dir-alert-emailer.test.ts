// @vitest-environment node
//
// Coverage for the data-directory alert emailer (Task #769).
//
// The emailer reuses the SMTP loader + admin recipient resolution
// from `migration-failure-emailer` via its `_internals` export, so
// these tests mock that surface and pin:
//
//   1. The read-only email subject line is stable
//      (`[CriteriaIQ] Data directory not writable: <path>`).
//   2. The recovery email subject line is stable
//      (`[CriteriaIQ] Data directory writable again: <path>`).
//   3. The body cites the path, detected timestamp, and reason.
//   4. SMTP-not-configured → silent no-op (returns 0, no throw).
//   5. No admin recipients → warn + return 0 (never throws).
//   6. Transport failure → returns 0, never throws.

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const sendMailMock = vi.fn(async () => ({ messageId: "ok" }));
const transportCloseMock = vi.fn();
const createTransportMock = vi.fn(() => ({
  sendMail: sendMailMock,
  close: transportCloseMock,
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: (...args: unknown[]) => createTransportMock(...args),
  },
}));

const loadSmtpFromDbMock = vi.fn();
const loadSmtpFromDeferredFileMock = vi.fn();
const loadAdminEmailsMock = vi.fn();

vi.mock("../migration-failure-emailer", () => ({
  _internals: {
    loadSmtpFromDb: (...a: unknown[]) => loadSmtpFromDbMock(...a),
    loadSmtpFromDeferredFile: (...a: unknown[]) =>
      loadSmtpFromDeferredFileMock(...a),
    loadAdminEmails: (...a: unknown[]) => loadAdminEmailsMock(...a),
  },
}));

import {
  sendDataDirReadOnlyEmail,
  sendDataDirRecoveryEmail,
} from "../data-dir-alert-emailer";

const SMTP = {
  host: "smtp.example.com",
  port: 587,
  username: "alerts@example.com",
  password: "hunter2",
  fromAddress: "alerts@example.com",
  secure: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sendDataDirReadOnlyEmail", () => {
  it("dispatches one email to every approved admin with the stable subject + body", async () => {
    loadSmtpFromDbMock.mockResolvedValueOnce(SMTP);
    loadAdminEmailsMock.mockResolvedValueOnce([
      "ops@example.com",
      "founder@example.com",
    ]);

    const sent = await sendDataDirReadOnlyEmail({
      dataDir: "/srv/criteriaiq/data",
      reason: "EROFS: read-only file system",
      detectedAt: "2026-05-02T14:00:00.000Z",
    });

    expect(sent).toBe(2);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const call = sendMailMock.mock.calls[0][0];
    expect(call.to).toBe("ops@example.com, founder@example.com");
    expect(call.subject).toBe(
      "[CriteriaIQ] Data directory not writable: /srv/criteriaiq/data",
    );
    expect(call.text).toContain("/srv/criteriaiq/data");
    expect(call.text).toContain("2026-05-02T14:00:00.000Z");
    expect(call.text).toContain("EROFS: read-only file system");
    expect(call.html).toContain("EROFS");
    expect(transportCloseMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the deferred-file SMTP block when the DB row is absent", async () => {
    loadSmtpFromDbMock.mockResolvedValueOnce(null);
    loadSmtpFromDeferredFileMock.mockReturnValueOnce(SMTP);
    loadAdminEmailsMock.mockResolvedValueOnce(["ops@example.com"]);

    const sent = await sendDataDirReadOnlyEmail({
      dataDir: "/data",
      reason: null,
      detectedAt: "2026-05-02T14:00:00.000Z",
    });

    expect(sent).toBe(1);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
  });

  it("silent no-op when SMTP is not configured (returns 0, never throws)", async () => {
    loadSmtpFromDbMock.mockResolvedValueOnce(null);
    loadSmtpFromDeferredFileMock.mockReturnValueOnce(null);

    const sent = await sendDataDirReadOnlyEmail({
      dataDir: "/data",
      reason: "EACCES",
      detectedAt: "2026-05-02T14:00:00.000Z",
    });

    expect(sent).toBe(0);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("warns + returns 0 when there are no approved admins", async () => {
    loadSmtpFromDbMock.mockResolvedValueOnce(SMTP);
    loadAdminEmailsMock.mockResolvedValueOnce([]);

    const sent = await sendDataDirReadOnlyEmail({
      dataDir: "/data",
      reason: "EACCES",
      detectedAt: "2026-05-02T14:00:00.000Z",
    });

    expect(sent).toBe(0);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("returns 0 (never throws) when the transport rejects", async () => {
    loadSmtpFromDbMock.mockResolvedValueOnce(SMTP);
    loadAdminEmailsMock.mockResolvedValueOnce(["ops@example.com"]);
    sendMailMock.mockRejectedValueOnce(new Error("conn refused"));

    await expect(
      sendDataDirReadOnlyEmail({
        dataDir: "/data",
        reason: "EACCES",
        detectedAt: "2026-05-02T14:00:00.000Z",
      }),
    ).resolves.toBe(0);
  });
});

describe("sendDataDirRecoveryEmail", () => {
  it("uses the stable recovery subject + cites the recovery timestamp", async () => {
    loadSmtpFromDbMock.mockResolvedValueOnce(SMTP);
    loadAdminEmailsMock.mockResolvedValueOnce(["ops@example.com"]);

    const sent = await sendDataDirRecoveryEmail({
      dataDir: "/srv/criteriaiq/data",
      detectedAt: "2026-05-02T14:09:00.000Z",
    });

    expect(sent).toBe(1);
    const call = sendMailMock.mock.calls[0][0];
    expect(call.subject).toBe(
      "[CriteriaIQ] Data directory writable again: /srv/criteriaiq/data",
    );
    expect(call.text).toContain("2026-05-02T14:09:00.000Z");
    expect(call.text).toContain("/srv/criteriaiq/data");
  });

  it("silent no-op when SMTP is not configured", async () => {
    loadSmtpFromDbMock.mockResolvedValueOnce(null);
    loadSmtpFromDeferredFileMock.mockReturnValueOnce(null);

    const sent = await sendDataDirRecoveryEmail({
      dataDir: "/data",
      detectedAt: "2026-05-02T14:00:00.000Z",
    });

    expect(sent).toBe(0);
  });
});
