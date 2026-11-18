// {{crm}} / {{crmShort}} need no t() argument: they come from the install's
// CRM, set by applyCrmWording(), and an explicit value still wins.
import { afterEach, describe, expect, it, vi } from "vitest";
import i18n, { applyCrmWording } from "@/i18n";

describe("applyCrmWording", () => {
  afterEach(() => applyCrmWording("none"));

  it("reads 'CRM' until the install's CRM is known", () => {
    applyCrmWording("none");
    expect(i18n.t("crmSync.mappings.field")).toBe("CRM Field");
  });

  it("names the install's CRM in every string", () => {
    applyCrmWording("hubspot");
    expect(i18n.t("crmSync.mappings.field")).toBe("HubSpot Field");
    applyCrmWording("salesforce");
    expect(i18n.t("crmSync.values.fetchButton")).toBe("Fetch SF Values");
    expect(i18n.t("crmSync.direction.inbound")).toBe("Salesforce → CriteriaIQ");
  });

  it("lets an explicit value override the install's CRM", () => {
    applyCrmWording("salesforce");
    expect(i18n.t("crmSync.mappings.field", { crm: "HubSpot" })).toBe("HubSpot Field");
  });

  it("re-renders translated components only when the wording changes", () => {
    applyCrmWording("hubspot");
    const listener = vi.fn();
    i18n.on("languageChanged", listener);
    applyCrmWording("hubspot");
    expect(listener).not.toHaveBeenCalled();
    applyCrmWording("salesforce");
    expect(listener).toHaveBeenCalledTimes(1);
    i18n.off("languageChanged", listener);
  });
});
