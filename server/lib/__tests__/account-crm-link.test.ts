import { describe, expect, it } from "vitest";
import {
  accountLinkChange,
  accountLinkRule,
  accountMappingDirectionProblem,
  linkChangeColumns,
  lockedAccountFields,
  crmColumnsForUrl,
  exceptionColumns,
  isCrmAccountConflict,
  withCrmColumns,
  CRM_LINK_REASON_MAX,
} from "../account-crm-link";

const SF_URL = "https://acme.lightning.force.com/lightning/r/Account/001000000000001AAA/view";
const HS_URL = "https://app.hubspot.com/contacts/12345/record/0-2/987654";

const base = {
  activeProvider: "salesforce",
  isInternal: false,
  isAdmin: false,
  nextUrl: "",
  exceptionReason: "",
} as const;

describe("crmColumnsForUrl", () => {
  it("parses Salesforce and HubSpot record URLs", () => {
    expect(crmColumnsForUrl(SF_URL)).toEqual({ crmProvider: "salesforce", crmAccountId: "001000000000001AAA" });
    expect(crmColumnsForUrl(HS_URL)).toEqual({ crmProvider: "hubspot", crmAccountId: "987654" });
  });

  it("returns nulls for an empty or unusable link", () => {
    expect(crmColumnsForUrl("")).toEqual({ crmProvider: null, crmAccountId: null });
    expect(crmColumnsForUrl(null)).toEqual({ crmProvider: null, crmAccountId: null });
    expect(crmColumnsForUrl("https://example.com/nothing")).toEqual({ crmProvider: null, crmAccountId: null });
  });
});

describe("withCrmColumns", () => {
  it("adds the CRM columns only when the write carries the URL", () => {
    expect(withCrmColumns({ accountName: "A" })).toEqual({ accountName: "A" });
    expect(withCrmColumns({ salesforceAccountUrl: HS_URL })).toMatchObject({ crmProvider: "hubspot", crmAccountId: "987654" });
    expect(withCrmColumns({ salesforceAccountUrl: null })).toMatchObject({ crmProvider: null, crmAccountId: null });
  });
});

describe("accountLinkRule", () => {
  it("never applies with no CRM or for the internal account", () => {
    expect(accountLinkRule({ ...base, activeProvider: "none" })).toEqual({ ok: true, exception: "keep" });
    expect(accountLinkRule({ ...base, isInternal: true })).toEqual({ ok: true, exception: "keep" });
  });

  it("allows a linked account and clears any exception", () => {
    expect(accountLinkRule({ ...base, nextUrl: SF_URL })).toEqual({ ok: true, exception: "clear" });
  });

  it("refuses a non-Admin creating an unlinked account", () => {
    const result = accountLinkRule({ ...base, exceptionReason: "please" });
    expect(result).toMatchObject({ ok: false, status: 403, errorCode: "crm_link_required" });
  });

  it("lets an Admin create an unlinked account only with a reason", () => {
    expect(accountLinkRule({ ...base, isAdmin: true })).toMatchObject({ ok: false, errorCode: "crm_link_reason_required" });
    expect(accountLinkRule({ ...base, isAdmin: true, exceptionReason: "Not in CRM yet" })).toEqual({ ok: true, exception: "record" });
  });

  it("makes unlinking Admin-only, with a reason", () => {
    const unlink = { ...base, storedUrl: SF_URL };
    expect(accountLinkRule(unlink)).toMatchObject({ ok: false, status: 403, errorCode: "crm_link_required" });
    expect(accountLinkRule({ ...unlink, isAdmin: true })).toMatchObject({ ok: false, errorCode: "crm_link_reason_required" });
    expect(accountLinkRule({ ...unlink, isAdmin: true, exceptionReason: "Merged away" })).toEqual({ ok: true, exception: "record" });
  });

  it("keeps an account saved unlinked before the rule editable", () => {
    const legacy = { ...base, storedUrl: null };
    expect(accountLinkRule(legacy)).toEqual({ ok: true, exception: "keep" });
    expect(accountLinkRule({ ...legacy, isAdmin: true, exceptionReason: "Partner, no CRM" })).toEqual({ ok: true, exception: "record" });
  });

  it("refuses an over-long reason", () => {
    const reason = "x".repeat(CRM_LINK_REASON_MAX + 1);
    expect(accountLinkRule({ ...base, isAdmin: true, exceptionReason: reason })).toMatchObject({ ok: false, errorCode: "crm_link_reason_too_long" });
  });
});

describe("exceptionColumns", () => {
  it("records, clears or keeps the exception", () => {
    const recorded = exceptionColumns("record", "  reason ", "u1");
    expect(recorded).toMatchObject({ crmLinkExceptionReason: "reason", crmLinkExceptionBy: "u1" });
    expect(recorded.crmLinkExceptionAt).toBeInstanceOf(Date);
    expect(exceptionColumns("clear", "x", "u1")).toEqual({ crmLinkExceptionReason: null, crmLinkExceptionBy: null, crmLinkExceptionAt: null });
    expect(exceptionColumns("keep", "x", "u1")).toEqual({});
  });
});

describe("isCrmAccountConflict", () => {
  it("matches only the CRM account unique index", () => {
    expect(isCrmAccountConflict({ code: "23505", constraint: "customers_crm_account_unique" })).toBe(true);
    expect(isCrmAccountConflict({ cause: { code: "23505", constraint: "customers_crm_account_unique" } })).toBe(true);
    expect(isCrmAccountConflict({ code: "23505", constraint: "something_else" })).toBe(false);
    expect(isCrmAccountConflict(null)).toBe(false);
  });
});

describe("link changes on save (PR 3)", () => {
  const SF = "https://acme.lightning.force.com/lightning/r/Account/001000000000001AAA/view";
  const SF_OTHER = "https://acme.lightning.force.com/lightning/r/Account/001000000000002AAA/view";
  const stored = { crmProvider: "salesforce", crmAccountId: "001000000000001AAA", crmManagedFields: ["industryId", "region"] };

  it("tells same, linked, relinked, unlinked and none apart by CRM id", () => {
    expect(accountLinkChange("salesforce", stored, SF)).toBe("same");
    expect(accountLinkChange("salesforce", stored, ` ${SF.replace("/view", "")} `)).toBe("same");
    expect(accountLinkChange("salesforce", stored, SF_OTHER)).toBe("relinked");
    expect(accountLinkChange("salesforce", stored, "")).toBe("unlinked");
    expect(accountLinkChange("salesforce", null, SF)).toBe("linked");
    expect(accountLinkChange("salesforce", null, "")).toBe("none");
    expect(accountLinkChange("none", stored, "")).toBe("none");
    // A link to the other CRM doesn't count as linked here.
    expect(accountLinkChange("hubspot", stored, SF)).toBe("none");
  });

  it("locks the name plus the CRM-filled fields only while the link stays", () => {
    expect(lockedAccountFields("same", stored)).toEqual(["accountName", "industryId", "region"]);
    expect(lockedAccountFields("same", { ...stored, crmManagedFields: null })).toEqual(["accountName"]);
    expect(lockedAccountFields("relinked", stored)).toEqual([]);
    expect(lockedAccountFields("unlinked", stored)).toEqual([]);
  });

  it("records the linker on a new link and clears the CRM state on unlink", () => {
    expect(linkChangeColumns("linked", "u1")).toMatchObject({ crmLinkedBy: "u1", crmManagedFields: null });
    expect(linkChangeColumns("unlinked", "u1")).toEqual({
      crmManagedFields: null,
      crmLinkedBy: null,
      crmSyncedAt: null,
      crmRecordMissingAt: null,
    });
    expect(linkChangeColumns("same", "u1")).toEqual({});
  });

  it("allows only inbound account mappings", () => {
    expect(accountMappingDirectionProblem("customer", "inbound")).toBeNull();
    expect(accountMappingDirectionProblem("customer", "outbound")).not.toBeNull();
    expect(accountMappingDirectionProblem("customer", "bidirectional")).not.toBeNull();
    expect(accountMappingDirectionProblem("project", "outbound")).toBeNull();
  });
});
