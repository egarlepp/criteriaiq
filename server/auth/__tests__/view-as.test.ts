// @vitest-environment node
//
// View As (Dev Persona Switcher): the session answers as the person viewed,
// it is read only, it ends when the Admin behind it stops being one, MFA
// applies to the Admin, and a role stand-in gets its role's grants.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storageMock = vi.hoisted(() => ({
  getUserAuthState: vi.fn(),
  getUserPermissions: vi.fn(),
  getRoleByName: vi.fn(),
  getRolePermissions: vi.fn(),
}));
vi.mock("../../storage", () => ({ storage: storageMock }));

import {
  beginViewAs,
  buildRoleStandIn,
  endViewAs,
  realSessionUser,
  roleForViewAsUserId,
  viewAsGuard,
  viewAsRoleUserId,
} from "../view-as";
import { checkSessionUser, resetSessionRevalidationForTests } from "../session-revocation";
import { permissionRowsForUser } from "../../lib/section-permissions";

const admin = { id: "admin-1", email: "admin@example.com", role: "Admin" };
const sales = { id: "sales-1", email: "sales@example.com", role: "Sales" };

function viewingSession() {
  const session: Record<string, any> = { user: { ...admin } };
  beginViewAs(session, { ...sales }, { mode: "user", role: "Sales", targetUserId: sales.id });
  session.destroy = vi.fn((cb: () => void) => cb());
  return session;
}

function response() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((body: unknown) => {
    res.body = body;
    return res;
  });
  return res;
}

async function runGuard(session: Record<string, any> | undefined, method: string, url: string) {
  const res = response();
  const next = vi.fn();
  await viewAsGuard({ session, method, originalUrl: url, path: url } as any, res, next);
  return { res, next };
}

beforeEach(() => {
  resetSessionRevalidationForTests();
  storageMock.getUserAuthState.mockImplementation(async (id: string) =>
    id === admin.id ? { id, role: "Admin", isActive: true, isApproved: true } : { id, role: "Sales", isActive: true, isApproved: true },
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("beginViewAs / endViewAs", () => {
  it("makes the session the viewed person and keeps the Admin aside", () => {
    const session = viewingSession();
    expect(session.user.id).toBe(sales.id);
    expect(session.viewAs.realUser.id).toBe(admin.id);
    expect(realSessionUser(session as any)?.id).toBe(admin.id);
  });

  it("switching keeps the original Admin, not the person viewed", () => {
    const session = viewingSession();
    beginViewAs(session, buildRoleStandIn("Customer", "Customer"), { mode: "role", role: "Customer", targetUserId: null });
    expect(session.viewAs.realUser.id).toBe(admin.id);
    expect(session.user.id).toBe(viewAsRoleUserId("Customer"));
  });

  it("ending puts the Admin back", () => {
    const session = viewingSession();
    endViewAs(session as any);
    expect(session.user.id).toBe(admin.id);
    expect(session.viewAs).toBeUndefined();
  });

  it("recognises only stand-in ids", () => {
    expect(roleForViewAsUserId(viewAsRoleUserId("Partner"))).toBe("Partner");
    expect(roleForViewAsUserId("sales-1")).toBeNull();
    expect(roleForViewAsUserId("view-as-role:")).toBeNull();
    expect(roleForViewAsUserId(undefined)).toBeNull();
  });
});

describe("viewAsGuard", () => {
  it("does nothing when View As is off", async () => {
    const { next, res } = await runGuard({ user: admin }, "POST", "/api/projects");
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("lets reads through", async () => {
    const { next } = await runGuard(viewingSession(), "GET", "/api/projects?x=1");
    expect(next).toHaveBeenCalled();
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])("refuses %s writes", async (method) => {
    const { next, res } = await runGuard(viewingSession(), method, "/api/projects/1");
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("VIEW_AS_READ_ONLY");
  });

  it("refuses writes to the person's own profile", async () => {
    const { res } = await runGuard(viewingSession(), "PUT", "/api/users/me");
    expect(res.statusCode).toBe(403);
  });

  it("allows ending or switching View As and signing out", async () => {
    for (const [method, url] of [["DELETE", "/api/view-as"], ["POST", "/api/view-as"], ["POST", "/api/logout"]]) {
      const { next } = await runGuard(viewingSession(), method, url);
      expect(next).toHaveBeenCalled();
    }
  });

  it("does not treat a look-alike path as allowed", async () => {
    const { res } = await runGuard(viewingSession(), "POST", "/api/view-as/extra");
    expect(res.statusCode).toBe(403);
  });

  it("ends the session when the Admin behind it is no longer an Admin", async () => {
    storageMock.getUserAuthState.mockResolvedValue({ id: admin.id, role: "Engineer", isActive: true, isApproved: true });
    const session = viewingSession();
    const { next, res } = await runGuard(session, "GET", "/api/projects");
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(session.destroy).toHaveBeenCalled();
  });

  it("ends the session when the Admin behind it was deactivated", async () => {
    storageMock.getUserAuthState.mockResolvedValue({ id: admin.id, role: "Admin", isActive: false, isApproved: true });
    const { res } = await runGuard(viewingSession(), "GET", "/api/projects");
    expect(res.statusCode).toBe(401);
  });
});

describe("checkSessionUser during View As", () => {
  it("leaves a role stand-in alone (it has no record)", async () => {
    const session: Record<string, any> = { user: { ...admin } };
    beginViewAs(session, buildRoleStandIn("Sales", "Sales"), { mode: "role", role: "Sales", targetUserId: null });
    expect(await checkSessionUser({ session } as any)).toBe(true);
    expect(storageMock.getUserAuthState).not.toHaveBeenCalled();
  });

  it("ends View As, not the Admin's session, when the viewed user is switched off", async () => {
    storageMock.getUserAuthState.mockResolvedValue({ id: sales.id, role: "Sales", isActive: false, isApproved: true });
    const session = viewingSession();
    expect(await checkSessionUser({ session } as any)).toBe(true);
    expect(session.destroy).not.toHaveBeenCalled();
    expect(session.user.id).toBe(admin.id);
    expect(session.viewAs).toBeUndefined();
  });
});

describe("permissionRowsForUser", () => {
  it("gives a role stand-in its role's Role Management grants", async () => {
    storageMock.getRoleByName.mockResolvedValue({ id: 7, name: "Sales" });
    storageMock.getRolePermissions.mockResolvedValue([{ section: "dashboard", permission: "view" }]);
    expect(await permissionRowsForUser(viewAsRoleUserId("Sales"))).toEqual([{ section: "dashboard", permission: "view" }]);
    expect(storageMock.getRolePermissions).toHaveBeenCalledWith(7);
    expect(storageMock.getUserPermissions).not.toHaveBeenCalled();
  });

  it("gives nothing for a stand-in whose role is gone", async () => {
    storageMock.getRoleByName.mockResolvedValue(undefined);
    expect(await permissionRowsForUser(viewAsRoleUserId("Gone"))).toEqual([]);
  });

  it("reads a real user's own rows", async () => {
    storageMock.getUserPermissions.mockResolvedValue([{ section: "dashboard", permission: "edit" }]);
    expect(await permissionRowsForUser(sales.id)).toEqual([{ section: "dashboard", permission: "edit" }]);
  });
});
