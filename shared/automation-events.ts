// Trigger keys the app actually emits to subscribed webhooks
// (server/services/automation-events.ts). Used by the server to keep the
// emitter honest in tests and by the webhook wizard's event picker, which
// should only offer events that will really arrive. Every key here must
// exist in server/email/email-trigger-registry.ts.

export const EMITTED_EVENT_GROUPS = [
  {
    id: "projects",
    keys: [
      "project.created",
      "project.updated",
      "project.status_changed",
      "project.assigned",
      "risk.level_changed",
    ],
  },
  {
    id: "map",
    keys: [
      "map.phase.status_changed",
      "map.phase.completed",
      "map.phase.assigned",
      "map.phase.team_assigned",
      "map.step.status_changed",
      "map.step.completed",
      "map.step.assigned",
      "map.step.team_assigned",
      "map.task.status_changed",
      "map.task.completed",
      "map.task.assigned",
      "map.task.team_assigned",
    ],
  },
  {
    id: "criteria",
    keys: ["criteria.updated", "criteria.completed"],
  },
] as const;

export type EmittedEventKey = (typeof EMITTED_EVENT_GROUPS)[number]["keys"][number];

export const EMITTED_EVENT_KEYS: readonly EmittedEventKey[] = EMITTED_EVENT_GROUPS.flatMap(
  (g) => g.keys as readonly EmittedEventKey[],
);
