import { describe, expect, it } from "vitest";
import {
  ACCOUNT_PORTAL_SECTION,
  PAGE_PERMISSION_KEYS,
  accountPortalAccess,
  levelAllows,
  normalizeLevel,
  payloadToValues,
  resolveLevel,
  toPageValues,
  validatePermissionPayload,
  valuesToPayload,
} from "../permissions";
import { IMPACTIQ_COST_SECTION } from "../impactiq";

const value = (rows: { section: string; permission: string }[], key: string) =>
  rows.find((r) => r.section === key)?.permission;

describe("normalizeLevel", () => {
  it("maps the old Admin level to Edit and unknown values to None", () => {
    expect(normalizeLevel("dashboard", "admin")).toBe("edit");
    expect(normalizeLevel("dashboard", "Edit")).toBe("edit");
    expect(normalizeLevel("dashboard", "view")).toBe("view");
    expect(normalizeLevel("dashboard", "inherit")).toBe("none");
    expect(normalizeLevel("dashboard", undefined)).toBe("none");
  });

  it("maps the Account Portal's old levels to the scoped ones", () => {
    expect(normalizeLevel(ACCOUNT_PORTAL_SECTION, "admin")).toBe("edit-all");
    expect(normalizeLevel(ACCOUNT_PORTAL_SECTION, "edit")).toBe("edit-all");
    expect(normalizeLevel(ACCOUNT_PORTAL_SECTION, "view")).toBe("none");
    expect(normalizeLevel(ACCOUNT_PORTAL_SECTION, "edit-assigned")).toBe("edit-assigned");
  });

  it("allows only None or View on data visibility", () => {
    expect(normalizeLevel(IMPACTIQ_COST_SECTION, "edit")).toBe("view");
    expect(normalizeLevel(IMPACTIQ_COST_SECTION, "none")).toBe("none");
  });
});

describe("resolveLevel and levelAllows", () => {
  it("reads only the page's own row", () => {
    const rows = [{ section: "analytics", permission: "edit" }];
    expect(resolveLevel(rows, "analytics.main")).toBe("none");
    expect(levelAllows("analytics.main", resolveLevel(rows, "analytics.main"), "view")).toBe(false);
  });

  it("lets Edit Assigned and Edit All change the Account Portal", () => {
    expect(levelAllows(ACCOUNT_PORTAL_SECTION, "edit-assigned", "edit")).toBe(true);
    expect(levelAllows(ACCOUNT_PORTAL_SECTION, "view-all", "edit")).toBe(false);
    expect(levelAllows(ACCOUNT_PORTAL_SECTION, "view-assigned", "view")).toBe(true);
    expect(accountPortalAccess("edit-assigned")).toEqual({ scope: "assigned", canEdit: true });
    expect(accountPortalAccess("view-all")).toEqual({ scope: "all", canEdit: false });
  });
});

describe("toPageValues (one-time backfill)", () => {
  it("gives a page its group's value when it had none or said inherit", () => {
    const rows = toPageValues([
      { section: "ai-risk", permission: "view" },
      { section: "ai-risk.projects", permission: "inherit" },
    ]);
    expect(value(rows, "ai-risk.projects")).toBe("view");
    expect(value(rows, "ai-risk.criteria")).toBe("view");
    expect(value(rows, "ai-risk")).toBeUndefined();
  });

  it("keeps a page's own value over its group's", () => {
    const rows = toPageValues([
      { section: "analytics", permission: "view" },
      { section: "analytics.main", permission: "edit" },
    ]);
    expect(value(rows, "analytics.main")).toBe("edit");
  });

  it("denies every page under a group set to None", () => {
    const rows = toPageValues([
      { section: "project", permission: "none" },
      { section: "project.validation", permission: "edit" },
    ]);
    expect(value(rows, "project.validation")).toBeUndefined();
  });

  it("starts split keys from the key they were split from", () => {
    const rows = toPageValues([
      { section: "config.user-management", permission: "view" },
      { section: "config.salesforce-configuration", permission: "admin" },
      { section: "config.configuration", permission: "edit" },
    ]);
    expect(value(rows, "config.industries")).toBe("edit");
    expect(value(rows, "config.roles")).toBe("view");
    expect(value(rows, "config.login-history")).toBe("view");
    expect(value(rows, "config.hubspot")).toBe("edit");
    expect(value(rows, "config.mcp-server")).toBe("edit");
  });

  it("converts the Account Portal and drops unknown keys", () => {
    const rows = toPageValues([
      { section: ACCOUNT_PORTAL_SECTION, permission: "admin" },
      { section: "retired.page", permission: "edit" },
    ]);
    expect(value(rows, ACCOUNT_PORTAL_SECTION)).toBe("edit-all");
    expect(value(rows, "retired.page")).toBeUndefined();
  });

  it("gives the same answer when run twice", () => {
    const once = toPageValues([{ section: "project", permission: "edit" }]);
    expect(toPageValues(once)).toEqual(once);
  });
});

describe("validatePermissionPayload", () => {
  it("accepts known keys and drops None rows", () => {
    const result = validatePermissionPayload([
      { section: "dashboard", permission: "view" },
      { section: "create", permission: "none" },
      { section: ACCOUNT_PORTAL_SECTION, permission: "view-assigned" },
    ]);
    expect(result).toEqual({
      ok: true,
      permissions: [
        { section: "dashboard", permission: "view" },
        { section: ACCOUNT_PORTAL_SECTION, permission: "view-assigned" },
      ],
    });
  });

  it.each([
    ["not an array", { dashboard: "view" }],
    ["an unknown key", [{ section: "project", permission: "view" }]],
    ["a level the key doesn't take", [{ section: "dashboard", permission: "admin" }]],
    ["a portal level on a page", [{ section: "dashboard", permission: "edit-all" }]],
    ["a duplicate key", [{ section: "dashboard", permission: "view" }, { section: "dashboard", permission: "edit" }]],
  ])("refuses %s", (_label, input) => {
    expect(validatePermissionPayload(input).ok).toBe(false);
  });
});

describe("editor values", () => {
  it("round-trip through the save payload", () => {
    const values = { dashboard: "edit", create: "none", [ACCOUNT_PORTAL_SECTION]: "view-all", bogus: "edit" };
    const payload = valuesToPayload(values);
    expect(payload).toEqual([
      { section: "dashboard", permission: "edit" },
      { section: ACCOUNT_PORTAL_SECTION, permission: "view-all" },
    ]);
    expect(payloadToValues(payload)).toEqual({ dashboard: "edit", [ACCOUNT_PORTAL_SECTION]: "view-all" });
  });

  it("lists every page key once", () => {
    expect(new Set(PAGE_PERMISSION_KEYS).size).toBe(PAGE_PERMISSION_KEYS.length);
  });
});
