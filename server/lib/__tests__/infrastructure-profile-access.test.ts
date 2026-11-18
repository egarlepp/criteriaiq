import { describe, expect, it, vi } from "vitest";

vi.mock("../customer-access", () => ({ getExternalUserAccountIds: vi.fn(async () => []) }));

import { canUseInfrastructureProfiles } from "../infrastructure-profile-access";

const lookup = vi.fn(async (userId: string) => (userId === "cust-1" ? [10, 11] : []));

describe("canUseInfrastructureProfiles", () => {
  it("lets every internal role use any account", async () => {
    for (const role of ["Admin", "Sales", "CX", "Product", "Solutions Engineer"]) {
      expect(await canUseInfrastructureProfiles({ id: "u", role }, 99, lookup)).toBe(true);
    }
  });

  it("limits outside users to the accounts they belong to", async () => {
    for (const role of ["Customer", "Guest", "Partner"]) {
      expect(await canUseInfrastructureProfiles({ id: "cust-1", role }, 10, lookup)).toBe(true);
      expect(await canUseInfrastructureProfiles({ id: "cust-1", role }, 12, lookup)).toBe(false);
    }
  });

  it("refuses a missing viewer, id or role", async () => {
    expect(await canUseInfrastructureProfiles(undefined, 10, lookup)).toBe(false);
    expect(await canUseInfrastructureProfiles({ role: "Admin" }, 10, lookup)).toBe(false);
    expect(await canUseInfrastructureProfiles({ id: "u" }, 10, lookup)).toBe(false);
  });
});
