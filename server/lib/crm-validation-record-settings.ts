// Storage for the validation record settings (shared/crm-validation-record.ts).
//
// One `system_settings` row (key `crm_validation_record`). Until an admin
// saves it, the Salesforce object comes from the older
// salesforce_oauth_config.evaluation_object_api_name column, so upgrading
// changes nothing.
import { storage } from "../storage";
import {
  DEFAULT_VALIDATION_RECORD_SETTINGS,
  validationRecordSettingsSchema,
  type ValidationRecordSettings,
} from "@shared/crm-validation-record";

export const VALIDATION_RECORD_SETTINGS_KEY = "crm_validation_record";

async function legacySalesforceObject(): Promise<string | null> {
  try {
    const [config] = await storage.db
      .select({ name: storage.schema.salesforceOauthConfig.evaluationObjectApiName })
      .from(storage.schema.salesforceOauthConfig)
      .limit(1);
    return config?.name || null;
  } catch {
    return null;
  }
}

/** Never throws: falls back to defaults when the row is missing or invalid. */
export async function getValidationRecordSettings(): Promise<ValidationRecordSettings> {
  try {
    const row = await storage.getSystemSetting(VALIDATION_RECORD_SETTINGS_KEY);
    if (row) {
      const parsed = validationRecordSettingsSchema.safeParse(row.value);
      if (parsed.success) return parsed.data;
      console.warn("[validation-record] stored settings are invalid, using defaults");
    }
  } catch (err) {
    console.warn("[validation-record] failed to load settings, using defaults:", err);
  }
  const legacy = await legacySalesforceObject();
  return {
    ...DEFAULT_VALIDATION_RECORD_SETTINGS,
    salesforce: {
      ...DEFAULT_VALIDATION_RECORD_SETTINGS.salesforce,
      objectApiName: legacy ?? DEFAULT_VALIDATION_RECORD_SETTINGS.salesforce.objectApiName,
    },
  };
}

export async function saveValidationRecordSettings(
  next: ValidationRecordSettings,
  updatedBy: string | undefined,
): Promise<ValidationRecordSettings> {
  await storage.upsertSystemSetting(
    VALIDATION_RECORD_SETTINGS_KEY,
    next,
    updatedBy,
    "Validation record name and CRM objects (Admin › Integrations)",
  );
  return next;
}
