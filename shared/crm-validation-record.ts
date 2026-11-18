// The "validation record": the CRM object a project's technical validation
// lives in. Salesforce orgs usually call it Evaluation (Evaluation__c), but
// teams also use POC, POV, POx or Project, and a HubSpot custom object can
// be named anything. Admins pick the name once under Admin › System Settings
// › Terminology (it applies even with CRM = None) and the CRM objects under
// Admin › Integrations › Overview › Validation Record; every screen uses the
// name. Both cards save the same `crm_validation_record` setting.
//
// API and database names stay as they are (`salesforceEvaluationLink`,
// `?evaluationId=`): API clients such as ImpactIQ depend on them.
import { z } from "zod";

export const VALIDATION_RECORD_LABEL_PRESETS = ["evaluation", "poc", "pov", "poc_pov", "pox", "project", "custom"] as const;
export type ValidationRecordLabelPreset = (typeof VALIDATION_RECORD_LABEL_PRESETS)[number];

const API_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
// HubSpot object type: an id like "2-1234567", a fully qualified name like
// "p_poc_records", or a standard object name ("deals").
const HUBSPOT_OBJECT_TYPE = /^(?:\d+-\d+|p_[a-z0-9_]+|[a-z][a-z0-9_]*)$/;

export const validationRecordSettingsSchema = z
  .object({
    label: z.enum(VALIDATION_RECORD_LABEL_PRESETS),
    customLabel: z.string().trim().max(40).default(""),
    salesforce: z.object({
      objectApiName: z.string().trim().regex(API_NAME).max(80),
      opportunityLookupField: z.string().trim().regex(API_NAME).max(80),
    }),
    hubspot: z.object({
      objectType: z.union([z.literal(""), z.string().trim().regex(HUBSPOT_OBJECT_TYPE).max(80)]).default(""),
    }),
  })
  .refine((s) => s.label !== "custom" || s.customLabel.length > 0, {
    message: "customLabel is required when label is custom",
    path: ["customLabel"],
  });

export type ValidationRecordSettings = z.infer<typeof validationRecordSettingsSchema>;

export const DEFAULT_VALIDATION_RECORD_SETTINGS: ValidationRecordSettings = {
  label: "evaluation",
  customLabel: "",
  salesforce: { objectApiName: "Evaluation__c", opportunityLookupField: "Opportunity__c" },
  hubspot: { objectType: "" },
};

/** The subset every signed-in user may read (the project form needs it). */
export interface ValidationRecordLabel {
  label: ValidationRecordLabelPreset;
  customLabel: string;
}

/**
 * English names of the presets, for server-made text that has no locale
 * (Salesforce field-mapping labels). Screens use the translated
 * `integrations.validationRecord.presets.*` keys instead.
 */
const ENGLISH_PRESET_NAMES: Record<Exclude<ValidationRecordLabelPreset, "custom">, string> = {
  evaluation: "Evaluation",
  poc: "POC",
  pov: "POV",
  poc_pov: "POC/POV",
  pox: "POx",
  project: "Project",
};

/** The chosen name in English; a custom name is returned as typed. */
export function validationRecordEnglishName({ label, customLabel }: ValidationRecordLabel): string {
  if (label === "custom") return customLabel.trim() || ENGLISH_PRESET_NAMES.evaluation;
  return ENGLISH_PRESET_NAMES[label];
}
