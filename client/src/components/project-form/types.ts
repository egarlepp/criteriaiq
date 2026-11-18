import { ReactNode } from "react";
import { z } from "zod";
import { insertProjectSchema } from "@shared/schema";
import { parseCrmRecordInput } from "@shared/crm-record-id";
import { validationRecordRequired, type CrmProviderId } from "@shared/crm-provider";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Resolver } from "react-hook-form";

/**
 * Extended form schema for project form validation
 */
export const formSchema = insertProjectSchema.extend({
  projectName: z.string().min(1, "Project Name is required"), // Auto-generated project name (e.g., RBS-NA-NDC-17)
  startDate: z.string().min(1, "Start Date is required"),
  endDate: z.string().min(1, "End Date is required"),
  tags: z.array(z.string()).optional(),
  environment: z.string().min(1, "Environment is required"),
  type: z.string().min(1, "Project Type is required"),
  primarySe: z.string().optional(),
  // Owning team and subteam (ids as strings; "" = not chosen, "none" = no team).
  teamId: z.string().optional(),
  subteamId: z.string().optional(),
  specialistSe: z.string().optional(),
  supportingSalesEngineers: z.array(z.string()).optional(),
  risk: z.string().optional(),
  ranking: z.string().optional(),
  uploadedFiles: z.array(z.any()).optional(),
  customerLogo: z.any().optional(),
  solutionName: z.array(z.string()).min(1, "At least one solution is required"),
  customerName: z.string().min(1, "Account Name is required"),
  opportunityName: z.string().min(1, "Opportunity Name is required"),
  // Required only while a CRM is active; projectFormResolver checks that,
  // since the schema can't see the install's CRM setting.
  salesforceEvaluationLink: z.string().optional(),
  // CRM record ids: a bare id or a record URL; blank clears. The server
  // normalizes on save (Salesforce ids to 18 characters). The message is
  // not shown; CrmRecordFields renders its own translated error.
  crmProvider: z.string().nullable().optional(),
  crmOpportunityId: z
    .string()
    .nullable()
    .optional()
    .refine((v) => !v || !v.trim() || parseCrmRecordInput(v) !== null, { message: "invalid_crm_id" }),
  crmAccountId: z
    .string()
    .nullable()
    .optional()
    .refine((v) => !v || !v.trim() || parseCrmRecordInput(v) !== null, { message: "invalid_crm_id" }),
  accountRepresentative: z.string().min(1, "Opportunity Representative is required"),
  opportunityEngineer: z.string().min(1, "Opportunity Engineer is required"),
  opportunityAcvValue: z.string().min(1, "Opportunity ACV Value is required"),
  businessProblem: z.string().min(1, "Business Problem is required"),
  customerObjective: z.string().min(1, "Customer Objective is required"),
  solutionDescription: z.string().min(1, "Solution Description is required"),
  tccUseProjectUser: z.boolean().optional(),
  tccUserId: z.string().optional(),
  tccFirstName: z.string().optional(),
  tccLastName: z.string().optional(),
  tccCommitteeApproval: z.boolean().optional(),
  customerUsers: z.preprocess(
    (val) => Array.isArray(val) ? val.filter((item: any) => item?.userId && item.userId.trim() !== '') : val,
    z.array(z.object({
      userId: z.string(),
      permission: z.string()
    })).optional()
  ),
  additionalAccess: z.preprocess(
    (val) => Array.isArray(val) ? val.filter((item: any) => item?.userId && item.userId.trim() !== '') : val,
    z.array(z.object({
      userId: z.string(),
      permission: z.string()
    })).optional()
  ),
  projectLinks: z.preprocess(
    (val) => Array.isArray(val) ? val.filter((item: any) => item?.url && item.url.trim() !== '') : val,
    z.array(z.object({
      linkType: z.string(),
      url: z.string(),
      description: z.string()
    })).optional()
  ),
  complianceRegulations: z.array(z.number()).max(3, "Maximum 3 compliance regulations allowed").optional(),
});

/**
 * Inferred type from form schema
 */
export type FormData = z.infer<typeof formSchema>;

/**
 * Typed adapter for the project form's `zodResolver`. The library's
 * `zodResolver` returns `Resolver<Input, Context, Output>` where `Input`
 * comes from the schema's `_input`. Because `formSchema` uses
 * `z.preprocess` on a few fields (which widens `_input` to `unknown`),
 * TypeScript cannot unify the result with `Resolver<FormData>` even
 * though the runtime shape matches one-for-one. This helper isolates
 * that single re-assertion so callers can wire the resolver up without
 * needing their own escape hatch.
 */
const baseProjectFormResolver: Resolver<FormData> =
  zodResolver(formSchema) as unknown as Resolver<FormData>;

/** What the project form passes to its resolver (`useForm({ context })`). */
export interface ProjectFormContext {
  /** The install's CRM; undefined while still loading, which counts as a CRM. */
  crmProvider?: CrmProviderId;
}

/**
 * The schema check, plus the validation record link when the install uses a
 * CRM. With the CRM set to None the link is optional.
 */
export const projectFormResolver: Resolver<FormData, ProjectFormContext> = async (values, context, options) => {
  const result = await baseProjectFormResolver(values, undefined, options);
  const link = typeof values.salesforceEvaluationLink === "string" ? values.salesforceEvaluationLink.trim() : "";
  if (!validationRecordRequired(context?.crmProvider) || link) return result;
  return {
    values: {},
    errors: {
      ...result.errors,
      salesforceEvaluationLink: { type: "required", message: "Validation record link is required" },
    },
  } as Awaited<ReturnType<Resolver<FormData, ProjectFormContext>>>;
};

/**
 * A competitor entry connected to a competing space, surfaced from the
 * EssentialsSection's selector and forwarded with the form submit payload.
 */
export interface ConnectedCompetitorItem {
  spaceId: number;
  competitorId: number;
  spaceName: string;
  spaceColor: string;
  competitorName: string;
  relationship: string;
}

/**
 * Imperative handle exposed by ProjectForm via React.useImperativeHandle.
 */
export interface ProjectFormHandle {
  getValues: () => FormData;
  handleSubmit: () => void;
  setValue: (name: string, value: unknown) => void;
  trigger: (name?: string) => Promise<boolean>;
  setIsFormSubmitting: (value: boolean) => void;
}

/**
 * Props interface for ProjectForm component
 */
export interface RiskLevelConfig {
  id: number;
  name: string;
  color: string;
  icon?: string | null;
}

/**
 * Shape of the data emitted from the form. The form's underlying schema works
 * in `string` dates, but the submit handler converts them to `Date` objects
 * and merges in additional fields (uploaded files, project links, map
 * template id, etc.) before invoking the parent `onSubmit` callback.
 */
export type ProjectFormSubmitData = Omit<
  FormData,
  | 'startDate'
  | 'endDate'
  | 'primarySe'
  | 'specialistSe'
  | 'accountRepresentative'
  | 'opportunityEngineer'
  | 'customerUsers'
  | 'teamId'
  | 'subteamId'
> & {
  startDate?: Date;
  /** undefined on create lets the server use the primary engineer's default team. */
  teamId?: number | null;
  subteamId?: number | null;
  endDate?: Date;
  primarySe?: string;
  specialistSe?: string;
  accountRepresentative?: string;
  opportunityEngineer?: string;
  customerUsers?: Array<{
    userId?: string;
    email?: string;
    permission: string;
    firstName?: string | null;
    lastName?: string | null;
  }>;
  mapTemplateId?: number;
  projectCompetingWith?: ConnectedCompetitorItem[];
};

/**
 * Initial-data shape accepted by `ProjectForm`. Callers (the create and
 * edit pages) hand the form either a persisted project record, a project
 * template, or a freshly typed draft. Rather than widening every field to
 * `unknown` so those raw DB rows fit through, this type lists each known
 * field's accepted DB-vs-form variants explicitly so TypeScript can still
 * catch typos and shape mismatches at the call site.
 *
 * Conventions:
 *  - Plain string/boolean fields keep their form-level types but also
 *    accept `null`, since `createInsertSchema(projects)` columns are
 *    nullable on the persisted row.
 *  - Date columns (`startDate`, `endDate`) accept the form's ISO string
 *    *or* the raw `Date` instance returned by the DB driver — the form's
 *    hydration logic narrows them at runtime.
 *  - JSONB array columns (`customerUsers`, `additionalAccess`,
 *    `projectLinks`) stay `unknown` because their persisted shape is
 *    untyped JSON; the form's reset effect narrows them itself.
 *  - The optional `id` is allowed because the form uses it to detect edit
 *    mode (`initialData?.id`) when callers pass a persisted record
 *    through.
 *
 * See the `toProjectFormInitialData` adapter on the edit page for an
 * example conversion that produces this shape from a persisted project.
 */
export type ProjectFormInitialData = {
  /** Persisted-record primary key; presence triggers edit-mode behavior. */
  id?: number;

  // ─── Project metadata mirrored as strings on the form ───
  /** DB column behind the form's `projectName`. */
  name?: string | null;
  projectName?: string | null;
  customerName?: string | null;
  businessProblem?: string | null;
  industry?: string | null;
  environment?: string | null;
  type?: string | null;
  opportunityName?: string | null;
  salesforceEvaluationLink?: string | null;
  crmProvider?: string | null;
  crmOpportunityId?: string | null;
  crmAccountId?: string | null;
  /** Attached Infrastructure Discovery profile (migration 125). */
  infrastructureProfileId?: number | null;
  opportunityAcvValue?: string | null;
  solutionDescription?: string | null;
  policyConsiderations?: string | null;
  notes?: string | null;
  customerObjective?: string | null;
  customerStakeholder?: string | null;
  status?: string | null;
  customerStatus?: string | null;
  customerAccessLevel?: string | null;
  risk?: string | null;
  ranking?: string | null;
  customerLogo?: string | null;
  tccUserId?: string | null;
  tccFirstName?: string | null;
  tccLastName?: string | null;

  // ─── Boolean flags ───
  tccUseProjectUser?: boolean | null;
  tccCommitteeApproval?: boolean | null;

  // ─── Solutions, tagging, and other typed array columns ───
  /**
   * The form expects `string[]`; the persisted column may also arrive as
   * a comma-/PostgreSQL-array-encoded string, so accept both.
   */
  solutionName?: string[] | string | null;
  tags?: string[] | null;
  additionalSupportingTeam?: string[] | null;
  complianceRegulations?: number[] | null;

  // ─── Date columns (form ISO string vs DB `Date`) ───
  startDate?: string | Date | null;
  endDate?: string | Date | null;

  // ─── Engineer/representative reference fields (form string ids) ───
  // Persisted rows may have these unset, so each one accepts `null` too.
  primarySe?: string | null;
  specialistSe?: string | null;
  accountRepresentative?: string | null;
  opportunityEngineer?: string | null;
  supportingSalesEngineers?: string[] | null;

  // ─── Raw JSONB columns hydrated by the form's reset effect ───
  customerUsers?: unknown;
  additionalAccess?: unknown;
  projectLinks?: unknown;
  /** Mixed array of `File` instances and persisted document records. */
  uploadedFiles?: unknown[];
};

export interface ProjectFormProps {
  initialData?: ProjectFormInitialData;
  onSubmit: (data: ProjectFormSubmitData) => void;
  isLoading?: boolean;
  isEdit?: boolean;
  onSolutionChange?: (solutions: string[]) => void;
  triggerSubmit?: number;
  templateData?: any;
  existingSuccessCriteria?: any[];
  onRemoveSolutionCriteria?: (solutionName: string) => Promise<void>;
  selectedMapTemplate?: { 
    id: number; 
    name: string; 
    description?: string; 
    phaseCount?: number; 
    stepCount?: number; 
    taskCount?: number 
  } | null;
  handleRemoveMapTemplate?: () => void;
  setIsMapTemplateSelectorOpen?: (open: boolean) => void;
  projectId?: number;
  validationSectionContent?: ReactNode;
  isValidationSectionOpen?: boolean;
  onValidationSectionToggle?: () => void;
  assumptionsSectionContent?: ReactNode;
  isAssumptionsSectionOpen?: boolean;
  onAssumptionsSectionToggle?: () => void;
  editModeControls?: ReactNode;
  riskLevel?: string;
  riskLevelConfigs?: RiskLevelConfig[];
  validationCriteriaTemplateName?: string | null;
  accountLogoUrl?: string | null;
}

/**
 * Upload form data interface
 */
export interface UploadFormData {
  givenName: string;
  description: string;
  documentType: string;
  solutionIds: number[];
  file: File | null;
}

/**
 * Project link interface
 */
export interface ProjectLink {
  linkType: string;
  url: string;
  description: string;
  name?: string;
  linkId?: string;
}

/**
 * Confirmation dialog state interface
 */
export interface ConfirmationDialogState {
  isOpen: boolean;
  solutionName: string;
  criteriaCount: number;
  onConfirm: () => void;
}

/**
 * Customer user interface
 */
export interface CustomerUser {
  email: string;
  permission: string;
  firstName?: string;
  lastName?: string;
}

/**
 * User with ID interface
 */
export interface UserWithId extends CustomerUser {
  userId: string;
}

/**
 * API User interface
 */
export interface ApiUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  isActive: boolean;
  isApproved: boolean;
}

/**
 * API Customer interface
 */
export interface ApiCustomer {
  id: number;
  name: string;
  accountName?: string;
  customerName?: string;
  abbreviation?: string;
  industryId?: number;
  logoUrl?: string;
  accountManagerId?: string;
  users?: ApiUser[];
  contactUsers?: Array<{ userId: string; isPrimary?: boolean; canViewReports?: boolean; [key: string]: unknown }>;
}

/**
 * API Industry interface
 */
export interface ApiIndustry {
  id: number;
  name: string;
  icon?: string;
  color?: string;
}

/**
 * API Template interface
 */
export interface ApiTemplate {
  id: string;
  name: string;
  environment?: string;
  industry?: string;
  type?: string;
  solutionType?: string;
  projectTimeline?: string;
  estimatedDuration?: string;
}

/**
 * API Role interface
 */
export interface ApiRole {
  id: number;
  name: string;
  displayName: string;
  description?: string;
}

/**
 * API Compliance Regulation interface
 */
export interface ApiComplianceRegulation {
  id: number;
  name: string;
  abbreviation?: string;
  description?: string;
}
