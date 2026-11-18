// Which ImpactIQ activity types count toward a project on Manage Projects,
// and whether the Opportunity-within-dates fallback is on
// (shared/impactiq.ts). One system_settings row; until an admin saves it
// nothing is chosen and the Activities column stays hidden.
import { z } from "zod";
import { storage } from "../storage";
import {
  DEFAULT_IMPACTIQ_ACTIVITY_COUNT_SETTINGS,
  IMPACTIQ_ACTIVITY_COUNTS_SETTINGS_KEY,
  IMPACTIQ_MAX_ACTIVITY_TYPES,
  type ImpactiqActivityCountSettings,
} from "@shared/impactiq";

export const activityCountSettingsSchema = z.object({
  activityTypes: z
    .array(z.string().trim().min(1).max(100))
    .max(IMPACTIQ_MAX_ACTIVITY_TYPES)
    // One entry per name, compared the way ImpactIQ compares them.
    .transform((names) => names.filter((n, i) => names.findIndex((m) => m.toLowerCase() === n.toLowerCase()) === i)),
  opportunityFallback: z.boolean(),
});

/** Never throws: a missing or unreadable row means nothing is chosen. */
export async function getActivityCountSettings(): Promise<ImpactiqActivityCountSettings> {
  try {
    const row = await storage.getSystemSetting(IMPACTIQ_ACTIVITY_COUNTS_SETTINGS_KEY);
    if (row) {
      const parsed = activityCountSettingsSchema.safeParse(row.value);
      if (parsed.success) return parsed.data;
      console.warn("[impactiq] stored activity count settings are invalid, using defaults");
    }
  } catch (error) {
    console.warn("[impactiq] could not load activity count settings:", error);
  }
  return { ...DEFAULT_IMPACTIQ_ACTIVITY_COUNT_SETTINGS, activityTypes: [] };
}

export async function saveActivityCountSettings(
  next: ImpactiqActivityCountSettings,
  updatedBy: string | undefined,
): Promise<ImpactiqActivityCountSettings> {
  await storage.upsertSystemSetting(
    IMPACTIQ_ACTIVITY_COUNTS_SETTINGS_KEY,
    next,
    updatedBy,
    "ImpactIQ activity types that count toward a project (Admin › Integrations › ImpactIQ)",
  );
  return next;
}
