// @vitest-environment node
//
// Deal, CRM and internal-note fields never reach outside users.

import { describe, expect, it } from "vitest";
import { customerForViewer, projectForViewer, projectsForViewer } from "../external-fields";

const project = { id: 1, name: "POC", opportunityAcvValue: "250000", crmOpportunityId: "006A", mgmtNotes: "price risk", status: "Active" };

describe("projectForViewer", () => {
  it.each(["Customer", "Guest", "Partner", undefined])("hides internal fields from %s", (role) => {
    const shown = projectForViewer(role, project);
    expect(shown).toEqual({ id: 1, name: "POC", status: "Active" });
  });

  it("keeps every field for internal users", () => {
    expect(projectForViewer("Engineer", project)).toBe(project);
    expect(projectsForViewer("Admin", [project])[0]).toBe(project);
  });

  it("hides competitor names and status attribution from outside users", () => {
    const row = {
      id: 2,
      competitorNames: ["Acme"],
      statusChange: { by: "Dana Lee", at: "2026-11-01T00:00:00Z" },
      customerStatusChange: null,
    };
    expect(projectForViewer("Customer", row)).toEqual({ id: 2 });
    expect(projectForViewer("Engineer", row)).toBe(row);
  });

  it("doesn't change the original row", () => {
    projectsForViewer("Customer", [project]);
    expect(project.mgmtNotes).toBe("price risk");
  });
});

describe("customerForViewer", () => {
  it("hides the Salesforce account link from outside users", () => {
    expect(customerForViewer("Partner", { id: 7, salesforceAccountUrl: "https://x" })).toEqual({ id: 7 });
    expect(customerForViewer("Sales", { id: 7, salesforceAccountUrl: "https://x" })).toHaveProperty("salesforceAccountUrl");
  });
});
