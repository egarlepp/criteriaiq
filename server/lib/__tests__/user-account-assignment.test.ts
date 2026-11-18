import { describe, expect, it } from "vitest";
import { parseRequestedAccountId, resolveAccountAssignment } from "../user-account-assignment";
import { internalAccountChangeRefusal } from "../internal-access";
import { freshLogoUrl, logoUrlToObjectKey } from "../customer-logo";

const INTERNAL = 7;
const CUSTOMER = 12;

describe("resolveAccountAssignment", () => {
  it("lets an Admin be linked to the internal account", () => {
    expect(
      resolveAccountAssignment({ role: "Admin", requestedAccountId: INTERNAL, requestedAccountIsInternal: true, domainInternalAccountId: null }),
    ).toEqual({ ok: true, staff: true, accountId: INTERNAL });
  });

  it("treats every non-outside role as staff with an optional internal account", () => {
    expect(
      resolveAccountAssignment({ role: "Engineer", requestedAccountId: null, requestedAccountIsInternal: undefined, domainInternalAccountId: null }),
    ).toEqual({ ok: true, staff: true, accountId: null });
    expect(
      resolveAccountAssignment({ role: "Custom Ops", requestedAccountId: undefined, requestedAccountIsInternal: undefined, domainInternalAccountId: null }),
    ).toEqual({ ok: true, staff: true, accountId: null });
  });

  it("refuses to link staff to a customer account", () => {
    expect(
      resolveAccountAssignment({ role: "Admin", requestedAccountId: CUSTOMER, requestedAccountIsInternal: false, domainInternalAccountId: null }).ok,
    ).toBe(false);
    expect(
      resolveAccountAssignment({ role: "Sales", requestedAccountId: 999, requestedAccountIsInternal: undefined, domainInternalAccountId: null }).ok,
    ).toBe(false);
  });

  it("links domain-matched users to their internal account whatever was sent", () => {
    expect(
      resolveAccountAssignment({ role: "Customer", requestedAccountId: CUSTOMER, requestedAccountIsInternal: false, domainInternalAccountId: INTERNAL }),
    ).toEqual({ ok: true, staff: true, accountId: INTERNAL });
  });

  it("keeps outside users off the internal account", () => {
    expect(
      resolveAccountAssignment({ role: "Customer", requestedAccountId: INTERNAL, requestedAccountIsInternal: true, domainInternalAccountId: null }).ok,
    ).toBe(false);
    expect(
      resolveAccountAssignment({ role: "Guest", requestedAccountId: CUSTOMER, requestedAccountIsInternal: false, domainInternalAccountId: null }),
    ).toEqual({ ok: true, staff: false });
  });
});

describe("parseRequestedAccountId", () => {
  it("accepts positive integers and numeric strings", () => {
    expect(parseRequestedAccountId(5)).toBe(5);
    expect(parseRequestedAccountId("5")).toBe(5);
  });
  it("maps empty and invalid values to null, and missing to undefined", () => {
    expect(parseRequestedAccountId(undefined)).toBeUndefined();
    expect(parseRequestedAccountId(null)).toBeNull();
    expect(parseRequestedAccountId("")).toBeNull();
    expect(parseRequestedAccountId("abc")).toBeNull();
    expect(parseRequestedAccountId(-3)).toBeNull();
  });
});

describe("internalAccountChangeRefusal", () => {
  const internal = { isInternal: true, isActive: true };
  const customer = { isInternal: false, isActive: true };

  it("allows an Admin anything", () => {
    expect(internalAccountChangeRefusal("Admin", internal)).toBeNull();
    expect(internalAccountChangeRefusal("Admin", internal, { isInternal: false, isActive: false })).toBeNull();
  });

  it("stops non-Admins archiving, deactivating or unflagging the internal account", () => {
    expect(internalAccountChangeRefusal("Engineer", internal)).not.toBeNull();
    expect(internalAccountChangeRefusal("Engineer", internal, { isInternal: true, isActive: false })).not.toBeNull();
    expect(internalAccountChangeRefusal("Engineer", internal, { isInternal: false, isActive: true })).not.toBeNull();
  });

  it("stops non-Admins flagging a customer account as internal", () => {
    expect(internalAccountChangeRefusal("Sales", customer, { isInternal: true, isActive: true })).not.toBeNull();
  });

  it("allows non-Admins ordinary edits and customer archives", () => {
    expect(internalAccountChangeRefusal("Engineer", internal, { isInternal: true, isActive: true })).toBeNull();
    expect(internalAccountChangeRefusal("Engineer", customer)).toBeNull();
    expect(internalAccountChangeRefusal("Engineer", customer, { isInternal: false, isActive: false })).toBeNull();
  });
});

describe("logoUrlToObjectKey", () => {
  it("reads local /api/files URLs", () => {
    expect(logoUrlToObjectKey("/api/files/accounts%2Flogos%2Facme.png", null)).toBe("accounts/logos/acme.png");
  });
  it("reads path-style and virtual-hosted cloud URLs", () => {
    expect(logoUrlToObjectKey("https://storage.googleapis.com/my-bucket/accounts/logos/acme.png?X-Goog-Signature=x", "my-bucket")).toBe("accounts/logos/acme.png");
    expect(logoUrlToObjectKey("https://my-bucket.s3.us-east-1.amazonaws.com/accounts/logos/acme.png?X-Amz-Signature=x", "my-bucket")).toBe("accounts/logos/acme.png");
  });
  it("returns null for unknown hosts", () => {
    expect(logoUrlToObjectKey("https://example.com/logo.png", "my-bucket")).toBeNull();
  });
});

describe("freshLogoUrl", () => {
  it("passes empty and local /api/files URLs through unchanged", async () => {
    expect(await freshLogoUrl(null)).toBeNull();
    expect(await freshLogoUrl("/api/files/accounts%2Flogos%2Facme.png")).toBe("/api/files/accounts%2Flogos%2Facme.png");
  });
});
