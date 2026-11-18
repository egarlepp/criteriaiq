import {
  Clock,
  Target,
  AlertTriangle,
  CheckCircle,
  CircleArrowUp,
  OctagonPause,
  Siren,
  XCircle,
  CircleAlert,
} from "lucide-react";

export const criteriaStatusConfig = {
  not_started: { 
    label: "Not Started", 
    icon: Clock,
    textColor: "text-gray-600 dark:text-gray-400",
    pillClass: "!bg-gray-100 !text-gray-700 dark:!bg-slate-700 dark:!text-slate-200",
    description: "Validation hasn't begun; no execution steps performed and no evidence collected yet."
  },
  in_progress: { 
    label: "In Progress", 
    icon: Target,
    textColor: "text-blue-600 dark:text-blue-400",
    pillClass: "!bg-blue-100 !text-blue-800 dark:!bg-blue-900/60 dark:!text-blue-200",
    description: "Validation is actively underway; steps are being executed and/or evidence is being gathered."
  },
  blocked: { 
    label: "Blocked", 
    icon: AlertTriangle,
    textColor: "text-red-600 dark:text-red-400",
    pillClass: "!bg-red-100 !text-red-800 dark:!bg-red-900/60 dark:!text-red-200",
    description: "Validation can't proceed due to a gating issue or dependency not met (typically a missing prerequisite like access, data, logging, or integration)."
  },
  complete: { 
    label: "Complete", 
    icon: CheckCircle,
    textColor: "text-green-600 dark:text-green-400",
    pillClass: "!bg-green-100 !text-green-800 dark:!bg-green-900/60 dark:!text-green-200",
    description: "Validation activities are finished and the item has a final result with supporting evidence recorded."
  },
  deferred: { 
    label: "Deferred", 
    icon: CircleArrowUp,
    textColor: "text-yellow-600 dark:text-yellow-400",
    pillClass: "!bg-yellow-100 !text-yellow-800 dark:!bg-yellow-900/50 dark:!text-yellow-200",
    description: "Validation is intentionally postponed (out of current scope/phase), to be revisited later."
  },
  stalled: { 
    label: "Stalled", 
    icon: OctagonPause,
    textColor: "text-orange-600 dark:text-orange-400",
    pillClass: "!bg-orange-100 !text-orange-800 dark:!bg-orange-900/50 dark:!text-orange-200",
    description: "Validation started but has stopped progressing due to unresolved issues or lack of traction (not fully blocked, but not moving)."
  },
  at_risk: { 
    label: "At Risk", 
    icon: Siren,
    textColor: "text-purple-600 dark:text-purple-400",
    pillClass: "!bg-purple-100 !text-purple-800 dark:!bg-purple-900/60 dark:!text-purple-200",
    description: "Validation is likely to miss timeline or success criteria unless corrective action is taken (known risks, open gaps, or tight dependencies)."
  },
  cancelled: { 
    label: "Cancelled", 
    icon: XCircle,
    textColor: "text-gray-600 dark:text-gray-400",
    pillClass: "!bg-gray-100 !text-gray-600 dark:!bg-slate-800 dark:!text-slate-300",
    description: "Validation will not be performed (scope change, no longer needed, or superseded)."
  },
  fail: {
    label: "Fail",
    icon: CircleAlert,
    textColor: "text-red-400 dark:text-red-300",
    pillClass: "!bg-red-100 !text-red-700 dark:!bg-red-950/70 dark:!text-red-300",
    description: "Test was executed with prerequisites satisfied and assumptions valid, but the success threshold was not met."
  }
};

export type CriteriaStatusKey = keyof typeof criteriaStatusConfig;

/** Display order for status pickers and the status sort. */
export const CRITERIA_STATUS_KEYS = Object.keys(criteriaStatusConfig) as CriteriaStatusKey[];

export function isEntityNA(entity: any, solutionId: number): boolean {
  if (entity.isAllSolutions === true) {
    return false;
  }

  if (entity.productId !== undefined) {
    return entity.productId !== solutionId;
  }

  if (entity.solutionIds && Array.isArray(entity.solutionIds)) {
    return !entity.solutionIds.includes(solutionId);
  }

  return true;
}

export function getTagColor(tagName: string, tags: any[], systemTags: any[]): string {
  const dbTag = tags.find(
    (t: any) => t.name.toLowerCase() === tagName.toLowerCase(),
  );
  if (dbTag) {
    return dbTag.color;
  }
  const systemTag = systemTags.find(
    (t: any) => t.name.toLowerCase() === tagName.toLowerCase(),
  );
  if (systemTag) {
    return systemTag.color;
  }
  return '#6B7280';
}
