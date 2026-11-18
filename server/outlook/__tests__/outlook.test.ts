// @vitest-environment node
//
// Per-user Outlook sign-in: the Microsoft calls, the token refresh, the
// Profile Settings check, and the routes (admin app settings, connect,
// callback state check, disconnect).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "http";

const storageMock = vi.hoisted(() => ({
  getOutlookSigninConfigRow: vi.fn(),
  saveOutlookSigninConfigRow: vi.fn(),
  deleteOutlookSigninConfigRow: vi.fn(),
  getOutlookTokenRow: vi.fn(),
  saveOutlookTokens: vi.fn(),
  updateOutlookTokens: vi.fn(),
  setOutlookAccountLabel: vi.fn(),
  deleteOutlookTokens: vi.fn(),
  deleteAllOutlookTokens: vi.fn(),
  countOutlookConnectedUsers: vi.fn(),
  createAuditLogin: vi.fn(),
  clearOutlookSchedules: vi.fn(),
  clearOutlookWorkDays: vi.fn(),
  listOutlookMapEvents: vi.fn(async () => []),
  deleteOutlookMapEventRows: vi.fn(async () => undefined),
  getUser: vi.fn(async () => undefined),
}));
vi.mock("../../storage", () => ({ storage: storageMock }));
vi.mock("../../auth/mfaUtils", () => ({
  encryptText: (v: string) => `enc:${v}`,
  decryptText: (v: string) => {
    if (!v.startsWith("enc:")) throw new Error("bad ciphertext");
    return v.slice(4);
  },
}));
vi.mock("../../auth/simpleAuth", () => ({
  isAuthenticated: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { isOutlookConnectionReady, isValidOutlookTenant, outlookSigninSaveSchema } from "@shared/outlook";
import { buildAuthorizeUrl, exchangeCode, MicrosoftAuthError, verifyAppCredentials } from "../oauth";
import { clearOutlookUserCheck, getMyOutlookConnection, getOutlookAccessToken } from "../user-connection";
import { registerOutlookRoutes } from "../../routes/outlook-routes";

const CLIENT_ID = "11111111-2222-3333-4444-555555555555";
const config = { enabled: true, tenantId: "contoso.com", clientId: CLIENT_ID, clientSecret: "s3cret", readWorkingHours: false, writeMapDueDates: false };
const configRow = { id: 1, enabled: true, tenantId: "contoso.com", clientId: CLIENT_ID, clientSecret: "enc:s3cret", readWorkingHours: false, writeMapDueDates: false };

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("shared rules", () => {
  it("accepts a GUID, a domain or organizations as the tenant, and nothing else", () => {
    expect(isValidOutlookTenant("organizations")).toBe(true);
    expect(isValidOutlookTenant("contoso.onmicrosoft.com")).toBe(true);
    expect(isValidOutlookTenant("72f988bf-86f1-41af-91ab-2d7cd011db47")).toBe(true);
    expect(isValidOutlookTenant("common")).toBe(false);
    expect(isValidOutlookTenant("consumers")).toBe(false);
    expect(isValidOutlookTenant("evil.com/../x")).toBe(false);
  });

  it("requires a GUID client id", () => {
    expect(outlookSigninSaveSchema.safeParse({ tenantId: "contoso.com", clientId: "nope", enabled: true }).success).toBe(false);
    expect(outlookSigninSaveSchema.safeParse({ tenantId: "contoso.com", clientId: CLIENT_ID, enabled: true }).success).toBe(true);
  });

  it("only reports a ready link for an internal person with a working token", () => {
    const base = { available: true, external: false, connected: true, healthy: true, accountLabel: null, connectedAt: null };
    expect(isOutlookConnectionReady(base)).toBe(true);
    expect(isOutlookConnectionReady({ ...base, healthy: false })).toBe(false);
    expect(isOutlookConnectionReady({ ...base, connected: false })).toBe(false);
    expect(isOutlookConnectionReady({ ...base, external: true })).toBeNull();
    expect(isOutlookConnectionReady({ ...base, available: false, connected: false })).toBeNull();
  });
});

describe("Microsoft calls", () => {
  it("builds the authorize URL on the tenant with read-only scopes", () => {
    const url = new URL(buildAuthorizeUrl(config, { state: "st", redirectUri: "https://app/cb", loginHint: "a@b.c" }));
    expect(url.origin + url.pathname).toBe("https://login.microsoftonline.com/contoso.com/oauth2/v2.0/authorize");
    expect(url.searchParams.get("scope")).toBe("openid profile offline_access User.Read Calendars.Read");
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.searchParams.get("login_hint")).toBe("a@b.c");
  });

  it("asks for MailboxSettings.Read only when the admin turned on working days", () => {
    const url = new URL(buildAuthorizeUrl({ ...config, readWorkingHours: true }, { state: "st", redirectUri: "https://app/cb" }));
    expect(url.searchParams.get("scope")).toBe("openid profile offline_access User.Read Calendars.Read MailboxSettings.Read");
  });

  it("asks for Calendars.ReadWrite only when the admin turned on MAP due dates", () => {
    const url = new URL(buildAuthorizeUrl({ ...config, writeMapDueDates: true }, { state: "st", redirectUri: "https://app/cb" }));
    expect(url.searchParams.get("scope")).toBe("openid profile offline_access User.Read Calendars.Read Calendars.ReadWrite");
  });

  it("marks invalid_grant as revoked and keeps only the error code", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(400, { error: "invalid_grant", error_description: "AADSTS secret detail" }));
    const err = await exchangeCode(config, "code", "https://app/cb", fetchFn as never).catch((e) => e);
    expect(err).toBeInstanceOf(MicrosoftAuthError);
    expect(err.revoked).toBe(true);
    expect(err.message).not.toContain("secret detail");
  });

  it("skips the app check for organizations, which can't issue an app token", async () => {
    const fetchFn = vi.fn();
    await verifyAppCredentials({ ...config, tenantId: "organizations" }, fetchFn as never);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("getOutlookAccessToken", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the stored token while it is current", async () => {
    storageMock.getOutlookTokenRow.mockResolvedValue({ accessToken: "enc:at", refreshToken: "enc:rt", expiresAt: new Date(Date.now() + 60_000) });
    const fetchFn = vi.fn();
    await expect(getOutlookAccessToken("u1", { config: async () => config, fetchFn: fetchFn as never })).resolves.toBe("at");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("refreshes an expired token once, even when asked twice at the same time", async () => {
    storageMock.getOutlookTokenRow.mockResolvedValue({ accessToken: "enc:old", refreshToken: "enc:rt", expiresAt: new Date(Date.now() - 1000) });
    const fetchFn = vi.fn(async () => jsonResponse(200, { access_token: "new", refresh_token: "rt2", expires_in: 3600 }));
    const deps = { config: async () => config, fetchFn: fetchFn as never };
    const [a, b] = await Promise.all([getOutlookAccessToken("u1", deps), getOutlookAccessToken("u1", deps)]);
    expect([a, b]).toEqual(["new", "new"]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(storageMock.updateOutlookTokens).toHaveBeenCalledWith("u1", expect.objectContaining({ accessTokenEnc: "enc:new", refreshTokenEnc: "enc:rt2" }));
  });

  it("returns null when Outlook sign-in is switched off", async () => {
    storageMock.getOutlookTokenRow.mockResolvedValue({ accessToken: "enc:at", refreshToken: "enc:rt", expiresAt: new Date(Date.now() + 60_000) });
    await expect(getOutlookAccessToken("u1", { config: async () => null })).resolves.toBeNull();
  });
});

describe("getMyOutlookConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearOutlookUserCheck();
  });

  it("gives outside users no card", async () => {
    const me = await getMyOutlookConnection({ id: "u1", role: "Customer" }, { config: async () => config });
    expect(me.external).toBe(true);
    expect(storageMock.getOutlookTokenRow).not.toHaveBeenCalled();
  });

  it("shows a working link with the mailbox", async () => {
    storageMock.getOutlookTokenRow.mockResolvedValue({
      accessToken: "enc:at", refreshToken: "enc:rt", expiresAt: new Date(Date.now() + 60_000), accountLabel: null, connectedAt: new Date("2026-10-01T00:00:00Z"),
    });
    const me = await getMyOutlookConnection({ id: "u1", role: "Engineer" }, { config: async () => config, mailbox: async () => "pat@contoso.com" });
    expect(me).toMatchObject({ available: true, connected: true, healthy: true, accountLabel: "pat@contoso.com" });
    expect(storageMock.setOutlookAccountLabel).toHaveBeenCalledWith("u1", "pat@contoso.com");
  });

  it("reads a refused refresh as Reconnect needed, and an outage as unknown", async () => {
    storageMock.getOutlookTokenRow.mockResolvedValue({
      accessToken: "enc:at", refreshToken: "enc:rt", expiresAt: new Date(Date.now() - 1000), accountLabel: "pat@contoso.com", connectedAt: null,
    });
    const revoked = vi.fn(async () => jsonResponse(400, { error: "invalid_grant" }));
    const me = await getMyOutlookConnection({ id: "u1", role: "Engineer" }, { config: async () => config, fetchFn: revoked as never });
    expect(me.healthy).toBe(false);

    clearOutlookUserCheck();
    const down = vi.fn(async () => { throw new TypeError("fetch failed"); });
    const me2 = await getMyOutlookConnection({ id: "u1", role: "Engineer" }, { config: async () => config, fetchFn: down as never });
    expect(me2.healthy).toBeNull();
    expect(me2.accountLabel).toBe("pat@contoso.com");
  });
});

describe("routes", () => {
  let server: Server;
  let base: string;
  let sess: Record<string, unknown>;
  const fetchMock = vi.fn();

  beforeAll(async () => {
    vi.stubGlobal("fetch", fetchMock);
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as unknown as { session: unknown }).session = sess;
      next();
    });
    registerOutlookRoutes(app);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const addr = server.address();
    base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    clearOutlookUserCheck();
    sess = { user: { id: "u1", role: "Engineer", email: "pat@contoso.com" } };
    storageMock.getOutlookSigninConfigRow.mockResolvedValue(configRow);
    storageMock.countOutlookConnectedUsers.mockResolvedValue(0);
  });

  // Node's fetch (stubbed above for Microsoft) is also what the test uses,
  // so the test client goes through a saved copy.
  const realFetch = globalThis.fetch.bind(globalThis);
  const call = (path: string, init?: RequestInit) => realFetch(`${base}${path}`, { redirect: "manual", ...init });

  it("keeps the admin settings Admin-only", async () => {
    const res = await call("/api/admin/outlook-signin");
    expect(res.status).toBe(403);
  });

  it("refuses an app Microsoft rejects, without saving it", async () => {
    sess = { user: { id: "a1", role: "Admin" } };
    fetchMock.mockResolvedValue(jsonResponse(401, { error: "invalid_client" }));
    const res = await call("/api/admin/outlook-signin", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: "contoso.com", clientId: CLIENT_ID, clientSecret: "wrong", enabled: true }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).errorCode).toBe("credentials_rejected");
    expect(storageMock.saveOutlookSigninConfigRow).not.toHaveBeenCalled();
  });

  it("saves an app Microsoft accepts, encrypted, and never returns the secret", async () => {
    sess = { user: { id: "a1", role: "Admin" } };
    fetchMock.mockResolvedValue(jsonResponse(200, { access_token: "app" }));
    const res = await call("/api/admin/outlook-signin", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: "contoso.com", clientId: CLIENT_ID, clientSecret: "s3cret", enabled: true }),
    });
    expect(res.status).toBe(200);
    expect(storageMock.saveOutlookSigninConfigRow).toHaveBeenCalledWith(expect.objectContaining({ clientSecretEnc: "enc:s3cret" }), "a1");
    const body = await res.text();
    expect(body).not.toContain("s3cret");
    expect(storageMock.createAuditLogin).toHaveBeenCalledWith(expect.objectContaining({ eventType: "outlook_signin_saved" }));
  });

  it("removing the app removes every person's link", async () => {
    sess = { user: { id: "a1", role: "Admin" } };
    const res = await call("/api/admin/outlook-signin", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(storageMock.deleteAllOutlookTokens).toHaveBeenCalled();
  });

  it("sends an internal user to Microsoft with a one-time state kept in their session", async () => {
    const res = await call("/api/auth/microsoft/connect");
    expect(res.status).toBe(302);
    const url = new URL(res.headers.get("location") ?? "");
    expect(url.host).toBe("login.microsoftonline.com");
    const saved = sess.outlookOAuthState as { value: string; userId: string };
    expect(saved.userId).toBe("u1");
    expect(url.searchParams.get("state")).toBe(saved.value);
  });

  it("refuses outside users", async () => {
    sess = { user: { id: "c1", role: "Customer" } };
    const res = await call("/api/auth/microsoft/connect");
    expect(res.status).toBe(403);
  });

  it("refuses a callback whose state doesn't match the session", async () => {
    sess.outlookOAuthState = { value: "right", userId: "u1", issuedAt: Date.now() };
    const res = await call("/api/auth/microsoft/callback?code=c&state=wrong");
    expect(res.headers.get("location")).toBe("/?profile=integrations&outlook=expired");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sess.outlookOAuthState).toBeUndefined();
  });

  it("refuses a callback in a different person's session", async () => {
    sess = { user: { id: "u2", role: "Engineer" }, outlookOAuthState: { value: "st", userId: "u1", issuedAt: Date.now() } };
    const res = await call("/api/auth/microsoft/callback?code=c&state=st");
    expect(res.headers.get("location")).toBe("/?profile=integrations&outlook=expired");
    expect(storageMock.saveOutlookTokens).not.toHaveBeenCalled();
  });

  it("stores the tokens encrypted for the person who started the sign-in", async () => {
    sess.outlookOAuthState = { value: "st", userId: "u1", issuedAt: Date.now() };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { access_token: "at", refresh_token: "rt", expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse(200, { mail: "pat@contoso.com" }));
    const res = await call("/api/auth/microsoft/callback?code=c&state=st");
    expect(res.headers.get("location")).toBe("/?profile=integrations&outlook=connected");
    expect(storageMock.saveOutlookTokens).toHaveBeenCalledWith("u1", expect.objectContaining({
      accessTokenEnc: "enc:at",
      refreshTokenEnc: "enc:rt",
      accountLabel: "pat@contoso.com",
    }));
  });

  it("disconnect removes only the caller's own link", async () => {
    const res = await call("/api/auth/microsoft/disconnect", { method: "POST" });
    expect(res.status).toBe(200);
    expect(storageMock.deleteOutlookTokens).toHaveBeenCalledWith("u1");
    expect(storageMock.clearOutlookSchedules).toHaveBeenCalledWith("u1");
  });
});
