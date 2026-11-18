// @vitest-environment node
//
// Every signed-in user, outside users included, must enroll in MFA before
// the API answers them (parity review P0-4).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storageMock = vi.hoisted(() => ({
  getUserMfaData: vi.fn(),
  getUser: vi.fn(),
  getSsoConfig: vi.fn(),
}));
vi.mock("../../storage", () => ({ storage: storageMock }));

import { passesMfaGate } from "../mfa-enforcement";

function request(path: string, userId = "u1", method = "GET") {
  return { method, originalUrl: path, session: { user: { id: userId } } as Record<string, any> };
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  storageMock.getUser.mockResolvedValue({ id: "u1", role: "Customer", ssoProvider: null });
  storageMock.getSsoConfig.mockResolvedValue({ enabled: false, requireMfaTrust: false });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("passesMfaGate", () => {
  it("blocks an outside user with no MFA", async () => {
    storageMock.getUserMfaData.mockResolvedValue({ enabled: false });
    expect(await passesMfaGate(request("/api/projects"))).toBe(false);
  });

  it("lets an enrolled user through and caches the answer", async () => {
    storageMock.getUserMfaData.mockResolvedValue({ enabled: true, method: "totp", recoveryCount: 8 });
    const req = request("/api/projects");
    expect(await passesMfaGate(req)).toBe(true);
    expect(await passesMfaGate(req)).toBe(true);
    expect(storageMock.getUserMfaData).toHaveBeenCalledTimes(1);
  });

  it("during View As, checks the Admin signed in, not the person viewed", async () => {
    storageMock.getUserMfaData.mockImplementation(async (id: string) =>
      id === "admin-1" ? { enabled: true, method: "totp", recoveryCount: 8 } : { enabled: false },
    );
    const req = request("/api/projects", "customer-1");
    req.session.viewAs = { realUser: { id: "admin-1" } };
    expect(await passesMfaGate(req)).toBe(true);
    expect(storageMock.getUserMfaData).toHaveBeenCalledWith("admin-1");
  });

  it("trusts MFA from an SSO provider the admin trusts", async () => {
    storageMock.getUserMfaData.mockResolvedValue({ enabled: false });
    storageMock.getUser.mockResolvedValue({ id: "u1", role: "Partner", ssoProvider: "azure" });
    storageMock.getSsoConfig.mockResolvedValue({ enabled: true, requireMfaTrust: true });
    expect(await passesMfaGate(request("/api/projects"))).toBe(true);
    expect(storageMock.getSsoConfig).toHaveBeenCalledWith("azure");
  });

  it("keeps the enrollment, status and sign-out routes open", async () => {
    storageMock.getUserMfaData.mockResolvedValue({ enabled: false });
    for (const path of ["/api/auth/user", "/api/mfa/totp/setup", "/api/webauthn/register/begin", "/api/logout"]) {
      expect(await passesMfaGate(request(path, "u1", "POST"))).toBe(true);
    }
    expect(await passesMfaGate(request("/api/branding/display"))).toBe(true);
    expect(await passesMfaGate(request("/api/branding/display", "u1", "POST"))).toBe(false);
  });

  it("re-reads status after an MFA route, so finishing enrollment takes effect at once", async () => {
    storageMock.getUserMfaData.mockResolvedValue({ enabled: false });
    const session = { user: { id: "u1" } } as Record<string, any>;
    expect(await passesMfaGate({ method: "GET", originalUrl: "/api/projects", session })).toBe(false);
    storageMock.getUserMfaData.mockResolvedValue({ enabled: true, method: "totp", recoveryCount: 8 });
    await passesMfaGate({ method: "POST", originalUrl: "/api/mfa/totp/verify", session });
    expect(await passesMfaGate({ method: "GET", originalUrl: "/api/projects", session })).toBe(true);
  });

  it("fails closed when MFA status can't be read", async () => {
    storageMock.getUserMfaData.mockRejectedValue(new Error("db down"));
    expect(await passesMfaGate(request("/api/projects"))).toBe(false);
  });

  it("skips API keys and non-production", async () => {
    storageMock.getUserMfaData.mockResolvedValue({ enabled: false });
    expect(await passesMfaGate({ ...request("/api/projects"), apiKeyContext: { keyId: 1 } })).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    expect(await passesMfaGate(request("/api/projects"))).toBe(true);
  });
});
