// @vitest-environment node
//
// External users (Customer / Partner / Guest) get project access only through
// the project's customerUsers / additionalAccess entries. getProjectById
// returns those entries enriched as user rows ({id, email, permission}), while
// the stored form is {userId, permission}; both must work, and "Edit" must
// grant edit access.

import { describe, expect, it, vi } from "vitest";

const projects: Record<number, unknown> = {
  // Enriched shape, as storage.getProjectById returns it.
  1: {
    id: 1,
    primaryEngineerId: "eng",
    customerUsers: [
      { id: "cust-edit", email: "Edit@Customer.com", permission: "Edit" },
      { id: "cust-view", email: "view@customer.com", permission: "View" },
    ],
    additionalAccess: [
      { id: "partner-edit", email: "p@partner.com", permission: "Edit" },
      { id: "guest-view", email: "g@guest.com", permission: "View" },
    ],
  },
  // Stored shape.
  2: {
    id: 2,
    primaryEngineerId: "eng",
    customerUsers: [{ userId: "cust-edit", permission: "Edit" }],
    additionalAccess: [{ userId: "guest-view", permission: "View" }],
  },
  // Entries without an email must not match a user whose email is unknown.
  3: {
    id: 3,
    primaryEngineerId: "eng",
    customerUsers: [{ userId: "someone-else", permission: "Edit" }],
    additionalAccess: [],
  },
};

vi.mock("../../storage", () => ({
  storage: { getProjectById: vi.fn(async (id: number) => projects[id]) },
}));

const { hasProjectAccess, hasProjectEditAccess } = await import("../project-access");

describe("project access for external users", () => {
  it("grants edit to a customer user set to Edit (enriched shape)", async () => {
    expect(await hasProjectEditAccess("cust-edit", "Customer", "edit@customer.com", 1)).toBe(true);
    expect(await hasProjectAccess("cust-edit", "Customer", "edit@customer.com", 1)).toBe(true);
  });

  it("matches by email case-insensitively", async () => {
    expect(await hasProjectEditAccess("other-id", "Customer", "EDIT@customer.com", 1)).toBe(true);
  });

  it("gives View users read but not edit", async () => {
    expect(await hasProjectAccess("cust-view", "Customer", "view@customer.com", 1)).toBe(true);
    expect(await hasProjectEditAccess("cust-view", "Customer", "view@customer.com", 1)).toBe(false);
  });

  it("handles additional access for Partners and Guests", async () => {
    expect(await hasProjectEditAccess("partner-edit", "Partner", "p@partner.com", 1)).toBe(true);
    expect(await hasProjectAccess("guest-view", "Guest", "g@guest.com", 1)).toBe(true);
    expect(await hasProjectEditAccess("guest-view", "Guest", "g@guest.com", 1)).toBe(false);
  });

  it("works with the stored {userId, permission} shape", async () => {
    expect(await hasProjectEditAccess("cust-edit", "Customer", null, 2)).toBe(true);
    expect(await hasProjectAccess("guest-view", "Guest", null, 2)).toBe(true);
    expect(await hasProjectEditAccess("guest-view", "Guest", null, 2)).toBe(false);
  });

  it("refuses external users who are not listed, even with no email", async () => {
    expect(await hasProjectAccess("stranger", "Customer", null, 3)).toBe(false);
    expect(await hasProjectEditAccess("stranger", "Customer", null, 3)).toBe(false);
    expect(await hasProjectAccess("stranger", "Guest", "x@y.com", 1)).toBe(false);
  });
});
