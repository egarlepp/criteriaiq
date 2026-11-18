// ImpactIQ shapes shared by the server and the client: the connection card on
// Admin › Integrations and the SE effort card on a project page. The effort
// shape mirrors ImpactIQ's GET /api/v1/effort (its docs/effort-api.md,
// version 1); fields are only ever added there.

export interface ImpactiqEffortPerson {
  name: string;
  email: string;
  hours: number;
  activityCount: number;
}

export interface ImpactiqEffortType {
  name: string;
  hours: number;
  activityCount: number;
}

/**
 * One cost total for the Opportunity (ImpactIQ v1.449+), in USD: hours × each
 * person's cost rate plus travel costs. Never per person, since that would
 * reveal a rate. CriteriaIQ sends it only to people with the
 * IMPACTIQ_COST_SECTION permission.
 */
export interface ImpactiqEffortCost {
  currency: string;
  totalCost: number;
  laborCost: number;
  directCost: number;
  activitiesWithoutRate: number;
}

/** Role Management section that lets a role see SE cost on the project card. Admin always can. */
export const IMPACTIQ_COST_SECTION = "impactiq_cost";

export interface ImpactiqEffort {
  version: number;
  crmOpportunityId: string;
  totalHours: number;
  activityCount: number;
  firstActivityAt: string | null;
  lastActivityAt: string | null;
  byPerson: ImpactiqEffortPerson[];
  byType: ImpactiqEffortType[];
  /** Missing when ImpactIQ is older than v1.449 or the viewer may not see cost. */
  cost?: ImpactiqEffortCost;
}

/** Why a call to ImpactIQ failed, translated on the card. */
export const IMPACTIQ_ERROR_CODES = [
  "not_configured",
  "url_not_allowed",
  "unreachable",
  "key_invalid",
  "key_wrong_scope",
  "owner_not_leader",
  "rate_limited",
  "bad_response",
  // ImpactIQ is older than the feature needs (v1.454 for activity counts).
  "not_supported",
] as const;
export type ImpactiqErrorCode = (typeof IMPACTIQ_ERROR_CODES)[number];

export interface ImpactiqCheck {
  ok: boolean;
  errorCode: ImpactiqErrorCode | null;
  checkedAt: string;
}

export interface ImpactiqConnectionSummary {
  configured: boolean;
  enabled: boolean;
  baseUrl: string | null;
  /** Last four characters of the saved key, never the key. */
  keyHint: string | null;
  lastCheck: ImpactiqCheck | null;
}

/**
 * GET /api/projects/:id/impactiq-effort. `hidden` means there is nothing to
 * show (ImpactIQ isn't connected or switched off, or the project has no CRM
 * Opportunity), so the card isn't drawn at all.
 */
export type ProjectImpactiqEffortResponse =
  | { status: "hidden" }
  // The links are null in Demo Mode, where the figures aren't from ImpactIQ.
  | { status: "ok"; effort: ImpactiqEffort; impactiqUrl: string | null; activitiesUrl: string | null }
  | { status: "unavailable"; errorCode: ImpactiqErrorCode };

/** ImpactIQ API keys are "iqk_" plus 43 base64url characters. */
export const IMPACTIQ_KEY_PATTERN = /^iqk_[A-Za-z0-9_-]{20,100}$/;

/**
 * Activity counts on Manage Projects (ImpactIQ v1.454+, its
 * POST /api/v1/effort/project-counts). An admin picks which ImpactIQ activity
 * types count toward a project; nothing picked keeps the column hidden.
 * Stored in system_settings under IMPACTIQ_ACTIVITY_COUNTS_SETTINGS_KEY.
 */
export const IMPACTIQ_ACTIVITY_COUNTS_SETTINGS_KEY = "impactiq_activity_counts";
export const IMPACTIQ_MAX_ACTIVITY_TYPES = 50;

export interface ImpactiqActivityCountSettings {
  /** ImpactIQ activity type names, matched case-insensitively there. */
  activityTypes: string[];
  /**
   * Also count chosen-type activities that have no Project link but sit on the
   * project's Opportunity inside its start and end dates. Off by default: one
   * activity can then count on several projects that share an Opportunity.
   */
  opportunityFallback: boolean;
}

export const DEFAULT_IMPACTIQ_ACTIVITY_COUNT_SETTINGS: ImpactiqActivityCountSettings = {
  activityTypes: [],
  opportunityFallback: false,
};

/** One row of ImpactIQ's GET /api/v1/effort/activity-types. */
export interface ImpactiqActivityTypeOption {
  name: string;
  /** Only types with a Project picker in ImpactIQ carry a Project link. */
  hasProjectPicker: boolean;
}

/** GET /api/admin/impactiq/activity-counts. `options` is null when ImpactIQ couldn't be read. */
export interface ImpactiqActivityCountsAdminView {
  settings: ImpactiqActivityCountSettings;
  options: ImpactiqActivityTypeOption[] | null;
  errorCode: ImpactiqErrorCode | null;
}

export interface ImpactiqProjectActivityCount {
  activityCount: number;
  totalHours: number;
  lastActivityAt: string | null;
  /** How many came in only through the Opportunity fallback. */
  viaOpportunity: number;
  /** ImpactIQ's activities drawer for the project's Opportunity, when it has one. */
  activitiesUrl: string | null;
}

/**
 * GET /api/impactiq/project-activity-counts. `hidden` means the column isn't
 * drawn: ImpactIQ isn't connected or is off, or no activity type is chosen.
 */
export type ProjectActivityCountsResponse =
  | { status: "hidden" }
  | { status: "ok"; counts: Record<string, ImpactiqProjectActivityCount>; opportunityFallback: boolean }
  | { status: "unavailable"; errorCode: ImpactiqErrorCode };

/**
 * One ImpactIQ activity linked to a project, as the Manage Projects
 * activities drawer lists it (ImpactIQ POST /api/v1/effort/project-activities).
 * Same matching rules and activity types as the count, so the list adds up
 * to the number in the Activities column. Never carries cost.
 */
export interface ImpactiqProjectActivity {
  /** ImpactIQ's id for the activity; only used as a list key. */
  id: string;
  /** Activity type name, e.g. "POx Work". */
  type: string;
  /** The type's lucide icon name in ImpactIQ (Admin → Activity Types); null when unset. */
  typeIcon: string | null;
  /** The type's hex color in ImpactIQ; null when unset. */
  typeColor: string | null;
  /** Who logged it. */
  ownerName: string;
  hours: number;
  /** ISO timestamp the activity started. */
  startAt: string;
  /** ISO timestamp it ended; null when ImpactIQ has no end time. */
  endAt: string | null;
  /** Counted only through the Opportunity fallback. */
  viaOpportunity: boolean;
}

/** ImpactIQ sends at most this many activities for one project, newest first. */
export const IMPACTIQ_MAX_PROJECT_ACTIVITIES = 500;

/**
 * GET /api/projects/:id/impactiq-activities. `hidden` matches the column:
 * ImpactIQ isn't connected or is off, or no activity type is chosen.
 */
export type ProjectImpactiqActivitiesResponse =
  | { status: "hidden" }
  | {
      status: "ok";
      activities: ImpactiqProjectActivity[];
      /** Every matching activity, including any past the list's cap. */
      activityCount: number;
      totalHours: number;
      /** More activities exist than were sent (the newest are listed). */
      truncated: boolean;
      /** ImpactIQ's own activities drawer for the Opportunity; null in Demo Mode. */
      activitiesUrl: string | null;
    }
  | { status: "unavailable"; errorCode: ImpactiqErrorCode };
