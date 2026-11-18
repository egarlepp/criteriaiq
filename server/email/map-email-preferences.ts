// Which MAP events a person gets Workflow Automation emails for. Profile ›
// Notifications sets, per phases / steps / tasks, "Project MAP Decides" or
// "Do Not Send"; each project's MAP › Notifications tab then picks the
// events (assigned, completed, due soon, status changed). Used by the
// automation engine before a rule emails someone about a MAP event.
// See docs/features/working-calendar.md (MAP emails).

export type MapEntity = "phase" | "step" | "task";

/** Events a project can switch on, as stored in project_map_notification_settings. */
export const MAP_EMAIL_EVENTS = ["assigned", "completed", "due_soon", "status_changed"] as const;
export type MapEmailEvent = (typeof MAP_EMAIL_EVENTS)[number];

/** What a project sends when nobody has changed its MAP › Notifications settings. */
export const DEFAULT_MAP_EMAIL_EVENTS: Record<MapEntity, readonly MapEmailEvent[]> = {
  phase: ["completed"],
  step: ["completed"],
  task: ["assigned"],
};

const MAP_EVENT_KEY = /^map\.(phase|step|task)\.(assigned|completed|due_soon|status_changed)$/;

/** The entity and event of a MAP trigger key such as "map.task.assigned", else null. */
export function parseMapEventKey(triggerKey: string): { entity: MapEntity; event: MapEmailEvent } | null {
  const m = MAP_EVENT_KEY.exec(triggerKey);
  return m ? { entity: m[1] as MapEntity, event: m[2] as MapEmailEvent } : null;
}

export interface MapEmailProfilePrefs {
  phasesPreference?: string | null;
  stepsPreference?: string | null;
  tasksPreference?: string | null;
}

export interface MapEmailProjectSettings {
  phasesSettings?: string[] | null;
  stepsSettings?: string[] | null;
  tasksSettings?: string[] | null;
}

/**
 * Whether a person gets an email for this MAP event on this project.
 * Trigger keys that aren't MAP events are always allowed.
 */
export function mapEmailDecision(
  triggerKey: string,
  prefs: MapEmailProfilePrefs | null | undefined,
  projectSettings: MapEmailProjectSettings | null | undefined,
): { allowed: boolean; reason?: string } {
  const parsed = parseMapEventKey(triggerKey);
  if (!parsed) return { allowed: true };
  const { entity, event } = parsed;
  const plural = `${entity}s` as const;

  const profileChoice = prefs?.[`${plural}Preference`];
  if (profileChoice === "do_not_send") {
    return { allowed: false, reason: `Recipient turned off MAP ${entity} emails in Profile` };
  }
  const chosen = projectSettings?.[`${plural}Settings`] ?? DEFAULT_MAP_EMAIL_EVENTS[entity];
  if (!chosen.includes(event)) {
    return { allowed: false, reason: `Recipient's MAP settings for this project don't include ${entity} ${event.replace("_", " ")}` };
  }
  return { allowed: true };
}

/**
 * Key that stops the same rule emailing twice about the same MAP change
 * within the hour, while two different tasks (or a new assignee, status or
 * due date) still each get theirs.
 */
export function mapEventDedupKey(triggerKey: string, metadata: Record<string, unknown> | undefined): string | undefined {
  const parsed = parseMapEventKey(triggerKey);
  if (!parsed) return undefined;
  const id = metadata?.[`${parsed.entity}Id`];
  if (id === undefined || id === null || id === "") return undefined;
  const detail =
    parsed.event === "assigned"
      ? metadata?.assignedTo
      : parsed.event === "status_changed"
        ? metadata?.newStatus
        : parsed.event === "due_soon"
          ? metadata?.dueDate
          : "";
  return `${parsed.entity}:${String(id)}:${detail == null ? "" : String(detail)}`;
}
