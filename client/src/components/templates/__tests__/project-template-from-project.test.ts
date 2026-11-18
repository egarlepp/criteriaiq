import { describe, expect, it } from "vitest";
import {
  buildProjectTemplatePayload,
  templateCriteriaFrom,
  templateDocumentsFrom,
  type ProjectTemplateSourceInput,
} from "../project-template-from-project";
import type { ProjectFormSubmitData } from "@/components/project-form/types";

const competitor = {
  spaceId: 1,
  competitorId: 7,
  spaceName: "SIEM",
  spaceColor: "#123456",
  competitorName: "Rival",
  relationship: "Evaluating",
};

function submit(overrides: Partial<ProjectFormSubmitData> = {}): ProjectFormSubmitData {
  return {
    projectName: "ACME-NA-SEC",
    customerName: "Acme",
    type: "POC",
    solutionName: ["Auditor", "Guardian"],
    environment: "Hybrid",
    industry: "Finance",
    tags: ["Priority"],
    businessProblem: "<p>Problem</p>",
    solutionDescription: "<p>Solution</p>",
    customerObjective: "<p>Objective</p>",
    policyConsiderations: "<p>Policy</p>",
    projectCompetingWith: [competitor],
    projectLinks: [{ linkType: "Doc", url: "https://example.com", description: "Spec" }],
    uploadedFiles: [
      { name: "a.pdf", isExistingDocument: true, documentData: { id: 11, givenName: "Runbook" } },
      { name: "new.pdf" },
    ],
    ...overrides,
  } as unknown as ProjectFormSubmitData;
}

function input(overrides: Partial<ProjectTemplateSourceInput> = {}): ProjectTemplateSourceInput {
  return {
    submit: submit(),
    successCriteria: [
      { id: 9, projectId: 2, criterion: "Detect", criteriaId: 5, status: "completed", productName: "Auditor" },
      { criterion: "", criteriaId: null },
    ],
    mapTemplate: null,
    validationTemplate: { id: 8, name: "Core VC" },
    durationWorkingDays: 15,
    name: "ACME-NA-SEC Template",
    description: "Saved from project ACME-NA-SEC",
    ...overrides,
  };
}

describe("buildProjectTemplatePayload", () => {
  it("carries every project feature a template holds", () => {
    const p = buildProjectTemplatePayload(input());
    expect(p).toMatchObject({
      name: "ACME-NA-SEC Template",
      type: "POC",
      solutionName: ["Auditor", "Guardian"],
      solutionType: "Auditor",
      environment: "Hybrid",
      industry: "Hybrid",
      tags: ["Priority"],
      businessProblem: "<p>Problem</p>",
      solutionDescription: "<p>Solution</p>",
      customerObjective: "<p>Objective</p>",
      policyConsiderations: "<p>Policy</p>",
      mapTemplateId: null,
      mapTemplateName: null,
      validationCriteriaTemplateId: 8,
      validationCriteriaTemplateName: "Core VC",
      typicalCompetitors: [competitor],
      durationWorkingDays: 15,
      projectLinks: [{ linkType: "Doc", url: "https://example.com", description: "Spec" }],
      projectDocuments: [{ id: 11, givenName: "Runbook" }],
      artifactsNotApplicable: false,
      isActive: true,
    });
    expect(p.successCriteria).toEqual([
      { criterion: "Detect", criteriaId: 5, status: "not_started", productName: "Auditor" },
    ]);
    expect(p).not.toHaveProperty("isSystem");
    expect(p).not.toHaveProperty("createdBy");
  });

  it("keeps the MAP template picked on the page", () => {
    const p = buildProjectTemplatePayload(
      input({
        submit: submit({ mapTemplateId: 21 }),
        mapTemplate: { id: 21, name: "Enterprise MAP" },
      }),
    );
    expect(p).toMatchObject({ mapTemplateId: 21, mapTemplateName: "Enterprise MAP" });
  });

  it("marks artifacts not applicable and drops a bad duration when there is nothing to carry", () => {
    const p = buildProjectTemplatePayload(
      input({ submit: submit({ projectLinks: [], uploadedFiles: [] }), durationWorkingDays: 0, validationTemplate: null }),
    );
    expect(p.artifactsNotApplicable).toBe(true);
    expect(p.durationWorkingDays).toBeNull();
    expect(p.validationCriteriaTemplateId).toBeNull();
  });
});

describe("helpers", () => {
  it("keeps only existing library documents", () => {
    expect(templateDocumentsFrom(undefined)).toEqual([]);
    expect(templateDocumentsFrom([{ isExistingDocument: true }, { isExistingDocument: true, documentData: { id: 1 } }])).toEqual([{ id: 1 }]);
  });

  it("keeps only criteria rows with a criterion or criteria id", () => {
    expect(templateCriteriaFrom([{ criterion: "" }, { criteriaId: 3 }])).toEqual([{ criteriaId: 3, status: "not_started" }]);
  });
});
