// The permission rows must come from the per-user endpoint: the list
// endpoint returns every user's rows to User Management viewers, and none
// for a View As role stand-in (whose sidebar then came up empty).
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOwnPermissions } from "../usePermissions";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchOwnPermissions", () => {
  it("asks for the user's own rows, encoding stand-in ids", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([{ section: "dashboard", permission: "view" }]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const rows = await fetchOwnPermissions("view-as-role:Solution Engineer");
    expect(fetchMock).toHaveBeenCalledWith("/api/user-permissions/view-as-role%3ASolution%20Engineer", { credentials: "include" });
    expect(rows).toEqual([{ section: "dashboard", permission: "view" }]);
  });

  it("throws on an error status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));
    await expect(fetchOwnPermissions("u1")).rejects.toThrow("HTTP 403");
  });
});
