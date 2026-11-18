// Request shapes for adding to a project's plan without a template: one item
// on a live MAP, or a new Quick plan. Shared by the routes
// (server/routes/map-project-routes.ts) and the client forms.
import { z } from "zod";

export const MAP_ITEM_KINDS = ["phase", "step", "task"] as const;
export type MapItemKind = (typeof MAP_ITEM_KINDS)[number];

/** Longest item name the map_* tables accept (varchar 255). */
export const MAP_ITEM_NAME_MAX = 255;

/** Most steps a Quick plan can start with in one request. */
export const QUICK_PLAN_MAX_STEPS = 50;

const itemName = z.string().trim().min(1).max(MAP_ITEM_NAME_MAX);

export const newMapItemSchema = z
  .object({
    kind: z.enum(MAP_ITEM_KINDS),
    /** The phase id for a step, the step id for a task. */
    parentId: z.number().int().positive().nullish(),
    name: itemName,
    description: z.string().trim().max(10_000).nullish(),
    /** YYYY-MM-DD, or empty for no date. */
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullish(),
  })
  .refine((value) => value.kind === "phase" || value.parentId != null, {
    message: "A step needs a phase and a task needs a step",
    path: ["parentId"],
  });
export type NewMapItemInput = z.infer<typeof newMapItemSchema>;

export const quickPlanSchema = z.object({
  /** The plan's one phase, e.g. "Plan" in the creator's language. */
  phaseName: itemName,
  steps: z.array(itemName).max(QUICK_PLAN_MAX_STEPS).default([]),
});
export type QuickPlanInput = z.infer<typeof quickPlanSchema>;

/** Lines of pasted text as Quick plan steps: bullets and numbering stripped, blanks dropped. */
export function quickPlanStepsFromText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)]|\[[ xX]?\])\s*/, "").trim())
    .filter((line) => line.length > 0)
    .map((line) => line.slice(0, MAP_ITEM_NAME_MAX))
    .slice(0, QUICK_PLAN_MAX_STEPS);
}
