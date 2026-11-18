// Scheduled maintenance window (Admin › System Settings › Maintenance).
//
// An Admin announces when the app will be down for a redeploy; every
// signed-in user sees a banner with a countdown until it starts, and a
// "maintenance in progress" banner while it runs. Saving one changes
// nothing else: CriteriaIQ never restarts or redeploys itself.
import { z } from "zod";

export const MAINTENANCE_SETTING_KEY = "maintenance_window";
export const MAINTENANCE_MESSAGE_MAX = 300;
export const MAINTENANCE_MIN_MINUTES = 5;
export const MAINTENANCE_MAX_MINUTES = 24 * 60;

export const maintenanceWindowSchema = z.object({
  startsAt: z.iso.datetime({ offset: true }),
  durationMinutes: z.number().int().min(MAINTENANCE_MIN_MINUTES).max(MAINTENANCE_MAX_MINUTES),
  message: z.string().trim().max(MAINTENANCE_MESSAGE_MAX).nullable().default(null),
});

export type MaintenanceWindow = z.infer<typeof maintenanceWindowSchema>;

export type MaintenancePhase = "upcoming" | "active" | "ended";

export function maintenanceEndsAt(window: MaintenanceWindow): Date {
  return new Date(new Date(window.startsAt).getTime() + window.durationMinutes * 60_000);
}

export function maintenancePhase(window: MaintenanceWindow, now: Date = new Date()): MaintenancePhase {
  const start = new Date(window.startsAt).getTime();
  if (now.getTime() < start) return "upcoming";
  if (now.getTime() < maintenanceEndsAt(window).getTime()) return "active";
  return "ended";
}

/** Splits a duration for the banner countdown. */
export function countdownParts(ms: number): { days: number; hours: number; minutes: number; seconds: number } {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}
