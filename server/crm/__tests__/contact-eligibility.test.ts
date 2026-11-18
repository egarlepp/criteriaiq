// @vitest-environment node
import { describe, expect, it } from "vitest";
import { canImport, contactEligibility, type ContactEligibilityInput } from "../contact-eligibility";

const base: ContactEligibilityInput = {
  contactId: "c1",
  email: "ana@acme.io",
  crmProvider: "salesforce",
  customerId: 7,
  approvedDomains: ["acme.io"],
  internalDomain: false,
  importedUser: null,
  emailUser: null,
};

const user = (over: Partial<NonNullable<ContactEligibilityInput["emailUser"]>> = {}) => ({
  id: "u1",
  accountId: 7,
  role: "Customer",
  crmProvider: null,
  crmContactId: null,
  ...over,
});

describe("contactEligibility", () => {
  it("offers a contact on an approved domain", () => {
    expect(contactEligibility(base)).toEqual({ state: "available" });
  });

  it("matches approved domains whatever their case or a leading @", () => {
    expect(contactEligibility({ ...base, email: "Ana@ACME.io", approvedDomains: ["@Acme.IO"] }).state).toBe("available");
  });

  it("leaves an unapproved domain to an Admin", () => {
    const verdict = contactEligibility({ ...base, email: "ana@acme-partner.io" });
    expect(verdict.state).toBe("adminOnly");
    expect(canImport(verdict.state, false)).toBe(false);
    expect(canImport(verdict.state, true)).toBe(true);
  });

  it("refuses no email, personal domains and internal staff", () => {
    expect(contactEligibility({ ...base, email: null })).toEqual({ state: "blocked", reason: "noEmail" });
    expect(contactEligibility({ ...base, email: "ana@gmail.com", approvedDomains: ["gmail.com"] })).toEqual({ state: "blocked", reason: "personalDomain" });
    expect(contactEligibility({ ...base, internalDomain: true })).toEqual({ state: "blocked", reason: "internalDomain" });
  });

  it("reports an imported contact first", () => {
    expect(contactEligibility({ ...base, email: null, importedUser: user({ crmContactId: "c1" }) })).toEqual({ state: "imported", userId: "u1" });
  });

  it("links an outside user of this account instead of duplicating them", () => {
    expect(contactEligibility({ ...base, emailUser: user() })).toEqual({ state: "linkable", userId: "u1" });
  });

  it("refuses a user of another account, staff, and a user tied to another contact", () => {
    expect(contactEligibility({ ...base, emailUser: user({ accountId: 8 }) }).reason).toBe("otherAccount");
    expect(contactEligibility({ ...base, emailUser: user({ role: "Engineer" }) }).reason).toBe("otherAccount");
    expect(contactEligibility({ ...base, emailUser: user({ crmProvider: "salesforce", crmContactId: "c9" }) }).reason).toBe("linkedElsewhere");
  });

  it("never imports a blocked contact, even for an Admin", () => {
    expect(canImport("blocked", true)).toBe(false);
    expect(canImport("imported", true)).toBe(false);
  });
});
