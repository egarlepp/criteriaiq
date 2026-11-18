// @vitest-environment node
//
// A deactivated, archived or demoted user loses access on their next
// request, and admin changes end their stored sessions (parity review P0-2).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storageMock = vi.hoisted(() => ({
  getUserAuthState: vi.fn(),
  deleteSessionsForUser: vi.fn(),
  deactivateApiKeysForUser: vi.fn(),
  getUser: vi.fn(),
  createAuditLogin: vi.fn(),
}));
vi.mock("../../storage", () => ({ storage: storageMock }));

import { checkSessionUser, resetSessionRevalidationForTests, revokeUserAccess } from "../session-revocation";

function request(role = "Engineer") {
  const destroy = vi.fn((cb: (err?: unknown) => void) => cb());
  return { req: { session: { user: { id: "u1", role }, destroy } }, destroy };
}

beforeEach(() => {
  resetSessionRevalidationForTests();
  storageMock.deleteSessionsForUser.mockResolvedValue(2);
  storageMock.deactivateApiKeysForUser.mockResolvedValue(1);
  storageMock.getUser.mockResolvedValue({ id: "u1", email: "u1@example.com", firstName: "U", lastName: "One" });
  storageMock.createAuditLogin.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("checkSessionUser", () => {
  it("signs out a deactivated user", async () => {
    storageMock.getUserAuthState.mockResolvedValue({ id: "u1", role: "Engineer", isActive: false, isApproved: true });
    const { req, destroy } = request();
    expect(await checkSessionUser(req)).toBe(false);
    expect(destroy).toHaveBeenCalled();
  });

  it("signs out a user whose row is gone (archived)", async () => {
    storageMock.getUserAuthState.mockResolvedValue(null);
    expect(await checkSessionUser(request().req)).toBe(false);
  });

  it("applies a role change to the session without signing out", async () => {
    storageMock.getUserAuthState.mockResolvedValue({ id: "u1", role: "Customer", isActive: true, isApproved: true });
    const { req, destroy } = request("Admin");
    expect(await checkSessionUser(req)).toBe(true);
    expect(req.session.user.role).toBe("Customer");
    expect(destroy).not.toHaveBeenCalled();
  });

  it("caches the lookup for a short while", async () => {
    storageMock.getUserAuthState.mockResolvedValue({ id: "u1", role: "Engineer", isActive: true, isApproved: true });
    await checkSessionUser(request().req);
    await checkSessionUser(request().req);
    expect(storageMock.getUserAuthState).toHaveBeenCalledTimes(1);
  });

  it("leaves API-key requests alone", async () => {
    const { req } = request();
    expect(await checkSessionUser({ ...req, apiKeyContext: { keyId: 1 } })).toBe(true);
    expect(storageMock.getUserAuthState).not.toHaveBeenCalled();
  });
});

describe("revokeUserAccess", () => {
  it("ends sessions, revokes API keys on deactivation and writes an audit row", async () => {
    const result = await revokeUserAccess("u1", { reason: "deactivated", actor: { id: "admin", email: "a@example.com" } });
    expect(result).toEqual({ sessions: 2, apiKeys: 1 });
    expect(storageMock.deleteSessionsForUser).toHaveBeenCalledWith("u1", undefined);
    expect(storageMock.createAuditLogin).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", eventType: "sessions_revoked", eventSubject: "a@example.com" }),
    );
  });

  it("keeps API keys and the caller's session on a self-service password change", async () => {
    await revokeUserAccess("u1", { reason: "password_reset", exceptSid: "sid-1" });
    expect(storageMock.deleteSessionsForUser).toHaveBeenCalledWith("u1", "sid-1");
    expect(storageMock.deactivateApiKeysForUser).not.toHaveBeenCalled();
  });

  it("forgets the cached state so the next request re-reads the user", async () => {
    storageMock.getUserAuthState.mockResolvedValue({ id: "u1", role: "Engineer", isActive: true, isApproved: true });
    await checkSessionUser(request().req);
    await revokeUserAccess("u1", { reason: "role_changed" });
    await checkSessionUser(request().req);
    expect(storageMock.getUserAuthState).toHaveBeenCalledTimes(2);
  });

  it("never throws", async () => {
    storageMock.deleteSessionsForUser.mockRejectedValue(new Error("db down"));
    await expect(revokeUserAccess("u1", { reason: "archived" })).resolves.toEqual({ sessions: 0, apiKeys: 0 });
  });
});
