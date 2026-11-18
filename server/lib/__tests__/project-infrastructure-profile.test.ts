import { describe, expect, it } from "vitest";
import {
  parseInfrastructureProfileRef,
  resolveProjectInfrastructureProfile,
  type ProjectInfrastructureProfileDeps,
} from "../project-infrastructure-profile";

// Profiles 1 and 2 belong to account 10 ("Acme"), profile 3 to account 20 ("Globex").
const deps: ProjectInfrastructureProfileDeps = {
  async getInfrastructureProfileRef(id) {
    return ({ 1: { id: 1, customerId: 10 }, 2: { id: 2, customerId: 10 }, 3: { id: 3, customerId: 20 } } as const)[
      id as 1 | 2 | 3
    ];
  },
  async resolveCustomerIdByName(name) {
    const key = (name ?? "").trim().toLowerCase();
    return key === "acme" ? 10 : key === "globex" ? 20 : null;
  },
};

const acmeProject = { customerId: 10, customerName: "Acme", infrastructureProfileId: 1 };

describe("parseInfrastructureProfileRef", () => {
  it("reads ids, clears and rejects junk", () => {
    expect(parseInfrastructureProfileRef(undefined)).toBeUndefined();
    expect(parseInfrastructureProfileRef(null)).toBeNull();
    expect(parseInfrastructureProfileRef("")).toBeNull();
    expect(parseInfrastructureProfileRef("12")).toBe(12);
    expect(parseInfrastructureProfileRef(7)).toBe(7);
    expect(parseInfrastructureProfileRef(0)).toBeNaN();
    expect(parseInfrastructureProfileRef(-3)).toBeNaN();
    expect(parseInfrastructureProfileRef("abc")).toBeNaN();
    expect(parseInfrastructureProfileRef(1.5)).toBeNaN();
  });
});

describe("resolveProjectInfrastructureProfile on create", () => {
  it("attaches a profile of the chosen account", async () => {
    const result = await resolveProjectInfrastructureProfile({ customerName: "Acme", infrastructureProfileId: 2 }, null, deps);
    expect(result).toEqual({ ok: true, values: { infrastructureProfileId: 2 } });
  });

  it("refuses a profile of another account", async () => {
    const result = await resolveProjectInfrastructureProfile({ customerName: "Acme", infrastructureProfileId: 3 }, null, deps);
    expect(result).toMatchObject({ ok: false, code: "infrastructure_profile_wrong_account" });
  });

  it("refuses when the account name does not resolve to one account", async () => {
    const result = await resolveProjectInfrastructureProfile({ customerName: "Unknown", infrastructureProfileId: 1 }, null, deps);
    expect(result).toMatchObject({ ok: false, code: "infrastructure_profile_wrong_account" });
  });

  it("refuses a missing profile and junk ids", async () => {
    expect(await resolveProjectInfrastructureProfile({ customerName: "Acme", infrastructureProfileId: 99 }, null, deps)).toMatchObject({
      ok: false,
      code: "infrastructure_profile_not_found",
    });
    expect(await resolveProjectInfrastructureProfile({ customerName: "Acme", infrastructureProfileId: "x" }, null, deps)).toMatchObject({
      ok: false,
      code: "invalid_infrastructure_profile",
    });
  });

  it("writes nothing when the field is not sent", async () => {
    expect(await resolveProjectInfrastructureProfile({ customerName: "Acme" }, null, deps)).toEqual({ ok: true, values: {} });
  });
});

describe("resolveProjectInfrastructureProfile on update", () => {
  it("keeps an unchanged id without looking it up (a deleted profile never blocks a save)", async () => {
    const current = { ...acmeProject, infrastructureProfileId: 99 };
    const result = await resolveProjectInfrastructureProfile({ customerName: "Acme", infrastructureProfileId: 99 }, current, deps);
    expect(result).toEqual({ ok: true, values: { infrastructureProfileId: 99 } });
  });

  it("switches to another profile of the same account", async () => {
    const result = await resolveProjectInfrastructureProfile({ infrastructureProfileId: 2 }, acmeProject, deps);
    expect(result).toEqual({ ok: true, values: { infrastructureProfileId: 2 } });
  });

  it("falls back to the name when the project has no account id", async () => {
    const current = { customerId: null, customerName: "Acme", infrastructureProfileId: null };
    const result = await resolveProjectInfrastructureProfile({ infrastructureProfileId: 2 }, current, deps);
    expect(result).toEqual({ ok: true, values: { infrastructureProfileId: 2 } });
  });

  it("refuses a profile of another account", async () => {
    const result = await resolveProjectInfrastructureProfile({ infrastructureProfileId: 3 }, acmeProject, deps);
    expect(result).toMatchObject({ ok: false, code: "infrastructure_profile_wrong_account" });
  });

  it("detaches on null or empty string", async () => {
    expect(await resolveProjectInfrastructureProfile({ infrastructureProfileId: null }, acmeProject, deps)).toEqual({
      ok: true,
      values: { infrastructureProfileId: null },
    });
    expect(await resolveProjectInfrastructureProfile({ infrastructureProfileId: "" }, acmeProject, deps)).toEqual({
      ok: true,
      values: { infrastructureProfileId: null },
    });
  });

  it("detaches when the account changes and no profile is resent", async () => {
    const result = await resolveProjectInfrastructureProfile({ customerName: "Globex" }, acmeProject, deps);
    expect(result).toEqual({ ok: true, values: { infrastructureProfileId: null } });
  });

  it("checks a resent id against the new account", async () => {
    expect(await resolveProjectInfrastructureProfile({ customerName: "Globex", infrastructureProfileId: 1 }, acmeProject, deps)).toMatchObject({
      ok: false,
      code: "infrastructure_profile_wrong_account",
    });
    expect(await resolveProjectInfrastructureProfile({ customerName: "Globex", infrastructureProfileId: 3 }, acmeProject, deps)).toEqual({
      ok: true,
      values: { infrastructureProfileId: 3 },
    });
  });

  it("treats a name that only differs in case or spaces as the same account", async () => {
    const result = await resolveProjectInfrastructureProfile({ customerName: " acme " }, acmeProject, deps);
    expect(result).toEqual({ ok: true, values: {} });
  });
});
