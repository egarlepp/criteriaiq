// Categories for the interim updates in version.json "updates" (one row per
// merge to main since the last release). They are the same four headings the
// Major Release Change Log uses (docs/guides/version-update-guide.md → Change
// Categories) and ImpactIQ's "What's new" uses, in display order: Security
// first, Fixes last.
//
// scripts/version-patch.mjs keeps its own copy of this list (it runs in CI
// with no npm install, so it can't import TypeScript); a unit test keeps the
// two in step.
export const UPDATE_CATEGORIES = ["security", "feature", "improvement", "fix"] as const;

export type UpdateCategory = (typeof UPDATE_CATEGORIES)[number];

/** Category used for rows written before categories existed, or with an unknown value. */
export const DEFAULT_UPDATE_CATEGORY: UpdateCategory = "improvement";

export function isUpdateCategory(value: unknown): value is UpdateCategory {
  return typeof value === "string" && (UPDATE_CATEGORIES as readonly string[]).includes(value);
}

export function toUpdateCategory(value: unknown): UpdateCategory {
  return isUpdateCategory(value) ? value : DEFAULT_UPDATE_CATEGORY;
}
