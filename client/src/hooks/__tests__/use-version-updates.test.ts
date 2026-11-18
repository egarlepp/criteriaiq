// The version link and the interim update list are for internal users only:
// PR titles can name internal or security work. The server refuses outside
// users (GET /api/version/updates uses requireInternalUser); this locks the
// client-side check that hides the link and skips the request for them.
import { describe, expect, it } from "vitest";
import { canViewVersionUpdates } from "../use-version-updates";

describe("canViewVersionUpdates", () => {
  it.each(["Customer", "Guest", "Partner"])("hides the updates from %s users", (role) => {
    expect(canViewVersionUpdates(role, true)).toBe(false);
  });

  it.each(["Admin", "Sales Engineer", "Manager", "CX", "Sales"])("shows the updates to %s users", (role) => {
    expect(canViewVersionUpdates(role, true)).toBe(true);
  });

  it("hides the updates when nobody is signed in", () => {
    expect(canViewVersionUpdates(undefined, false)).toBe(false);
  });
});
