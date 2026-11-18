// @vitest-environment node
//
// What a linked account copies from its CRM account, and which fields that
// makes read-only. A value that doesn't map cleanly is left alone, so the
// field stays editable.
import { describe, expect, it } from "vitest";
import { crmAccountUpdate, crmFieldChanges, normalizeWebsite, regionForCountry } from "../account-fields";

const lookups = {
  industries: [
    { id: 1, name: "Financial Services" },
    { id: 2, name: "Computer Software" },
    { id: 3, name: "Retail", isActive: false },
  ],
  userIdByEmail: (email: string) => (email === "rep@corp.com" ? "user-rep" : null),
};

const details = {
  id: "001000000000001AAA",
  name: "  Acme Corp ",
  industry: "COMPUTER_SOFTWARE",
  country: "United States",
  website: "www.Acme.com/",
  ownerEmail: "Rep@Corp.com",
};

describe("crmAccountUpdate", () => {
  it("maps every field that has a clean match", () => {
    expect(crmAccountUpdate(details, lookups)).toEqual({
      values: {
        accountName: "Acme Corp",
        industryId: 2,
        region: "North America",
        website: "https://www.acme.com",
        accountRepresentativeId: "user-rep",
      },
      managed: ["accountName", "industryId", "region", "website", "accountRepresentativeId"],
    });
  });

  it("leaves unmapped fields editable", () => {
    const result = crmAccountUpdate(
      { ...details, industry: "Retail", country: "Atlantis", website: null, ownerEmail: "someone@else.com" },
      lookups,
    );
    expect(result.values).toEqual({ accountName: "Acme Corp" });
    expect(result.managed).toEqual(["accountName"]);
  });

  it("matches industries ignoring case, spaces, underscores and &", () => {
    const result = crmAccountUpdate({ ...details, industry: "financial_services" }, lookups);
    expect(result.values.industryId).toBe(1);
  });
});

describe("regionForCountry", () => {
  it.each([
    ["US", "North America"],
    ["Deutschland", "Europe"],
    ["United Kingdom", "Europe"],
    ["brazil", "South America"],
    ["Singapore", "Asia Pacific"],
    ["United Arab Emirates", "Middle East & Africa"],
  ])("%s → %s", (country, region) => {
    expect(regionForCountry(country)).toBe(region);
  });

  it("returns null for blanks and unknown countries", () => {
    expect(regionForCountry(null)).toBeNull();
    expect(regionForCountry("Narnia")).toBeNull();
  });
});

describe("normalizeWebsite", () => {
  it("adds https, lower-cases the host and drops a trailing slash", () => {
    expect(normalizeWebsite("ACME.com/")).toBe("https://acme.com");
    expect(normalizeWebsite("http://acme.com/about/")).toBe("http://acme.com/about");
  });

  it("rejects what isn't a web address", () => {
    expect(normalizeWebsite("")).toBeNull();
    expect(normalizeWebsite("javascript:alert(1)")).toBeNull();
  });
});

describe("crmFieldChanges", () => {
  it("lists only managed fields whose value changes", () => {
    expect(
      crmFieldChanges(
        { accountName: "Acme", industryId: 2, region: null },
        { accountName: "Acme Corp", industryId: 2, region: "Europe" },
      ),
    ).toEqual([
      { field: "accountName", from: "Acme", to: "Acme Corp" },
      { field: "region", from: null, to: "Europe" },
    ]);
  });
});
