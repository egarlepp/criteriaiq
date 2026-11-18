import { describe, expect, it } from "vitest";
import { accountPortalSettingsSchema, DEFAULT_ACCOUNT_PORTAL_SETTINGS } from "../account-portal-settings";

describe("accountPortalSettingsSchema", () => {
  it("accepts the default (no link)", () => {
    expect(accountPortalSettingsSchema.parse(DEFAULT_ACCOUNT_PORTAL_SETTINGS)).toEqual({ internalPortalUrl: "" });
  });

  it("fills a missing link with an empty string", () => {
    expect(accountPortalSettingsSchema.parse({})).toEqual({ internalPortalUrl: "" });
  });

  it("accepts an https link and trims it", () => {
    expect(accountPortalSettingsSchema.parse({ internalPortalUrl: "  https://portal.example.org/customers  " })).toEqual({
      internalPortalUrl: "https://portal.example.org/customers",
    });
  });

  it.each(["http://portal.example.org", "javascript:alert(1)", "portal.example.org", "ftp://example.org"])(
    "refuses %s",
    (internalPortalUrl) => {
      expect(accountPortalSettingsSchema.safeParse({ internalPortalUrl }).success).toBe(false);
    },
  );

  it("refuses links longer than 500 characters", () => {
    const internalPortalUrl = `https://example.org/${"a".repeat(500)}`;
    expect(accountPortalSettingsSchema.safeParse({ internalPortalUrl }).success).toBe(false);
  });
});
