// Builds the POST /api/templates body for "Save As Project Template" on the
// Create Project page, from what the project was created with. Pure so it can
// be unit tested; the page supplies the translated name and description.
// See docs/features/project-templates.md for which project features a
// template carries and which it leaves out (people, dates, customer).
import type { ConnectedCompetitorItem, ProjectFormSubmitData } from "@/components/project-form/types";
import { parseProjectWorkingDays } from "@shared/project-duration";

export interface NamedRef {
  id: number;
  name: string;
}

export interface ProjectTemplateSourceInput {
  /** The project form's submit payload. */
  submit: ProjectFormSubmitData;
  /** The validation criteria rows the project was created with. */
  successCriteria: ReadonlyArray<Record<string, unknown>>;
  /** The MAP template picked on the page; the submit payload's id wins when set. */
  mapTemplate: NamedRef | null;
  validationTemplate: NamedRef | null;
  /** Working days the project runs (start to end), or null when unknown. */
  durationWorkingDays: number | null;
  name: string;
  description: string;
}

export interface ProjectTemplatePayload {
  name: string;
  description: string;
  type: string;
  solutionName: string[];
  solutionType: string;
  environment: string;
  /** The template's `industry` column holds the environment (list cards, filters). */
  industry: string;
  tags: string[];
  businessProblem: string;
  solutionDescription: string;
  customerObjective: string;
  policyConsiderations: string;
  mapTemplateId: number | null;
  mapTemplateName: string | null;
  validationCriteriaTemplateId: number | null;
  validationCriteriaTemplateName: string | null;
  successCriteria: Array<Record<string, unknown>>;
  typicalCompetitors: ConnectedCompetitorItem[];
  durationWorkingDays: number | null;
  projectLinks: Array<Record<string, unknown>>;
  projectDocuments: Array<Record<string, unknown>>;
  artifactsNotApplicable: boolean;
  isActive: true;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Existing library documents the project referenced. Newly uploaded files
 * belong to the project's customer and are not copied into a template.
 */
export function templateDocumentsFrom(uploadedFiles: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(uploadedFiles)) return [];
  const docs: Array<Record<string, unknown>> = [];
  for (const file of uploadedFiles) {
    if (!isRecord(file) || file.isExistingDocument !== true) continue;
    if (isRecord(file.documentData)) docs.push(file.documentData);
  }
  return docs;
}

/** Criteria rows worth keeping: the same filter the project save applies. */
export function templateCriteriaFrom(
  rows: ReadonlyArray<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  return rows
    .filter((row) => Boolean(row.criterion) || Boolean(row.criteriaId))
    .map((row) => {
      // Project-only fields (a saved row's id and project) are dropped, and
      // progress resets so a project made from the template starts fresh.
      const { id: _id, projectId: _projectId, ...rest } = row;
      return { ...rest, status: "not_started" };
    });
}

export function buildProjectTemplatePayload(input: ProjectTemplateSourceInput): ProjectTemplatePayload {
  const { submit } = input;
  const solutionName = Array.isArray(submit.solutionName)
    ? submit.solutionName.filter((s): s is string => typeof s === "string" && s !== "")
    : [];
  const mapTemplateId = submit.mapTemplateId ?? input.mapTemplate?.id ?? null;
  const mapTemplateName = mapTemplateId !== null && input.mapTemplate?.id === mapTemplateId ? input.mapTemplate.name : null;
  const projectLinks = Array.isArray(submit.projectLinks)
    ? (submit.projectLinks as unknown[]).filter(isRecord)
    : [];
  const projectDocuments = templateDocumentsFrom(submit.uploadedFiles);
  const environment = text(submit.environment);

  return {
    name: input.name,
    description: input.description,
    type: text(submit.type),
    solutionName,
    solutionType: solutionName[0] ?? text(submit.type),
    environment,
    industry: environment,
    tags: Array.isArray(submit.tags) ? submit.tags.filter((t): t is string => typeof t === "string") : [],
    businessProblem: text(submit.businessProblem),
    solutionDescription: text(submit.solutionDescription),
    customerObjective: text(submit.customerObjective),
    policyConsiderations: text(submit.policyConsiderations),
    mapTemplateId,
    mapTemplateName,
    validationCriteriaTemplateId: input.validationTemplate?.id ?? null,
    validationCriteriaTemplateName: input.validationTemplate?.name ?? null,
    successCriteria: templateCriteriaFrom(input.successCriteria),
    typicalCompetitors: Array.isArray(submit.projectCompetingWith) ? submit.projectCompetingWith : [],
    durationWorkingDays: parseProjectWorkingDays(input.durationWorkingDays),
    projectLinks,
    projectDocuments,
    artifactsNotApplicable: projectLinks.length === 0 && projectDocuments.length === 0,
    isActive: true,
  };
}
