// Roadmap lanes shared by the Account Portal and the project Overview, so
// both read the same way: each lane leads with a status icon, names its
// open to-dos under the label, and its bar fills to plan progress and leads
// with the journey stage icon ("Build · 44% done").
import type { TFunction } from "i18next";
import type { CustomerActionRow } from "@/lib/customer-actions";
import type { StatusBadgeConfig } from "@/components/shared/StatusBadge";
import { isMapItemComplete } from "@shared/map-status";
import type { ComputedJourneyStage } from "@shared/value-journey";
import { phaseTone, toRoadmapDate, type RoadmapRowInput, type RoadmapTone } from "./roadmap-utils";
import { journeyPillInfo, wholePercent } from "./workspace-utils";

export interface RoadmapProject {
  id: number;
  customerStatus?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface RoadmapPhase {
  id: number | string;
  name: string;
  status?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
}

export interface RoadmapTask {
  id: number | string;
  phaseId?: number | string | null;
  status?: string | null;
}

/** Green check for done stages with nothing left (the bar's lead icon). */
const ALL_DONE_STAGE = { iconName: "Check", color: "#15803d" } as const;

/** Where a project's bar sits against today. */
export function projectTone(project: RoadmapProject, today: Date): RoadmapTone {
  const start = toRoadmapDate(project.startDate);
  const end = toRoadmapDate(project.endDate);
  if (end && end < today) return "late";
  if (start && start > today) return "next";
  return "now";
}

/** "3 open to-dos" / "3 open to-dos, 1 overdue", or null with none. */
export function todoCountText(actions: CustomerActionRow[], t: TFunction): string | null {
  if (actions.length === 0) return null;
  const late = actions.filter((action) => action.daysOverdue > 0).length;
  return late > 0
    ? t("workspace.roadmap.laneTodosOverdue", { count: actions.length, overdue: late })
    : t("workspace.roadmap.laneTodos", { count: actions.length });
}

/**
 * One lane for a project: its account status icon in the status color (the
 * same icon and color as the status pill; a dot when the config has none, a
 * gray dashed circle with no status), the status and open to-dos under the
 * name, and a bar that fills to plan progress and leads with the current
 * journey stage. A project without a plan keeps a plain bar.
 */
export function buildProjectRoadmapRow(input: {
  project: RoadmapProject;
  label: string;
  actions: CustomerActionRow[];
  stages: ComputedJourneyStage[] | null | undefined;
  statusConfigs: StatusBadgeConfig[];
  href?: string;
  today: Date;
  t: TFunction;
}): RoadmapRowInput {
  const { project, label, actions, stages, statusConfigs, href, today, t } = input;
  const status = project.customerStatus?.trim() || null;
  const config = status ? statusConfigs.find((row) => row.name?.toLowerCase() === status.toLowerCase()) : undefined;
  const pill = journeyPillInfo(stages);
  const stageName = pill ? (pill.stage?.name ?? t("valueJourney.card.allDone")) : null;
  const pillLabel = pill
    ? pill.percent != null
      ? t("workspace.roadmap.pillLabel", { stage: stageName, percent: pill.percent })
      : (stageName ?? label)
    : label;
  return {
    key: `project-${project.id}`,
    label,
    sublabel: [status, todoCountText(actions, t)].filter(Boolean).join(" · ") || undefined,
    badge: {
      iconName: config?.icon || (status ? "CircleDot" : "CircleDashed"),
      color: config?.color || "#64748b",
      title: t("workspace.portal.statusBadge", { status: config?.name || status || t("workspace.portal.noStatus") }),
    },
    href,
    segments: [
      {
        key: `project-${project.id}`,
        label: pillLabel,
        title: pill ? t("workspace.roadmap.pillTitle", { name: label, label: pillLabel }) : label,
        start: project.startDate ?? project.endDate,
        end: project.endDate ?? project.startDate,
        tone: projectTone(project, today),
        progress: pill?.percent ?? null,
        stage: pill ? (pill.stage ? { iconName: pill.stage.iconName, color: pill.stage.color } : ALL_DONE_STAGE) : null,
      },
    ],
  };
}

/** The status icon of a phase lane, by where the phase stands. */
const PHASE_BADGE: Record<RoadmapTone, { iconName: string; color: string; labelKey: string }> = {
  done: { iconName: "CircleCheck", color: "#15803d", labelKey: "workspace.roadmap.legendDone" },
  now: { iconName: "CircleDot", color: "#2563eb", labelKey: "workspace.roadmap.legendNow" },
  late: { iconName: "CircleAlert", color: "#dc2626", labelKey: "workspace.roadmap.phaseLate" },
  next: { iconName: "CircleDashed", color: "#64748b", labelKey: "workspace.roadmap.legendNext" },
};

/**
 * One lane per plan phase, in the portal's style: a status icon (done,
 * in progress, overdue, up next), the status and the customer's open to-dos
 * in the phase under its name, and a bar that fills to the phase's task
 * progress and leads with the journey stage the phase belongs to.
 */
export function buildPhaseRoadmapRows(input: {
  phases: RoadmapPhase[];
  tasks: RoadmapTask[];
  actions: CustomerActionRow[];
  stages: ComputedJourneyStage[] | null | undefined;
  today: Date;
  t: TFunction;
}): RoadmapRowInput[] {
  const { phases, tasks, actions, stages, today, t } = input;
  const phaseOfTask = new Map(tasks.map((task) => [String(task.id), task.phaseId == null ? null : String(task.phaseId)]));
  return phases.map((phase) => {
    const phaseId = String(phase.id);
    const phaseTasks = tasks.filter((task) => String(task.phaseId) === phaseId);
    const done = phaseTasks.filter((task) => isMapItemComplete(task.status)).length;
    const percent = phaseTasks.length > 0 ? wholePercent(done, phaseTasks.length) : null;
    const tone = phaseTone(phase.status, phase.dueDate, today);
    const badge = PHASE_BADGE[tone];
    const statusText = t(badge.labelKey);
    const phaseActions = actions.filter((action) => phaseOfTask.get(String(action.taskId)) === phaseId);
    const stage = stages?.find((row) => row.phases.some((p) => String(p.id) === phaseId)) ?? null;
    // As on the portal bar: the stage and how much is done ("Build · 25% done");
    // the phase's own name is already on the left.
    const stageName = stage?.name ?? phase.name;
    const label = percent != null ? t("workspace.roadmap.pillLabel", { stage: stageName, percent }) : stageName;
    return {
      key: `phase-${phaseId}`,
      label: phase.name,
      sublabel: [statusText, todoCountText(phaseActions, t)].filter(Boolean).join(" · "),
      badge: { iconName: badge.iconName, color: badge.color, title: statusText },
      segments: [
        {
          key: `phase-${phaseId}`,
          label,
          title: t("workspace.roadmap.pillTitle", { name: phase.name, label }),
          start: phase.startDate ?? phase.dueDate,
          end: phase.dueDate ?? phase.startDate,
          tone,
          progress: tone === "done" ? null : percent,
          stage: stage ? { iconName: stage.iconName, color: stage.color } : null,
        },
      ],
    };
  });
}
