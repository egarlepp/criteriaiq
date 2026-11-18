import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, CheckCircle2, Circle, CircleDot, ChartNoAxesGantt, Hourglass, ListTodo, Target, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateForDisplay } from "@/lib/date-utils";
import type { CustomerActionRow } from "@/lib/customer-actions";
import { isMapItemComplete } from "@shared/map-status";
import type { CriteriaProgress, ScheduleProgress } from "@/components/project-detail/project-overview-utils";
import { BentoCard, BentoStat } from "./BentoTiles";
import { RoadmapChart } from "./RoadmapChart";
import { toRoadmapDate, type RoadmapRowInput } from "./roadmap-utils";
import { buildPhaseRoadmapRows, buildProjectRoadmapRow } from "./roadmap-rows";
import type { StatusBadgeConfig } from "@/components/shared/StatusBadge";
import { useProjectJourney } from "@/components/value-journey/use-value-journey";
import { WorkspaceTeamCard, WorkspaceTodoList } from "./WorkspaceAside";
import { ProjectMessagesCard, type ProjectNotes } from "./ProjectMessagesCard";
import { WorkspaceCalendarCard, type CalendarEvent } from "./WorkspaceCalendarCard";
import { wholePercent, type WorkspaceContact } from "./workspace-utils";

export interface WorkspacePhase {
  id: number | string;
  name: string;
  status?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  orderIndex?: number | null;
}

export interface WorkspaceTask {
  id: number | string;
  phaseId?: number | string | null;
  name: string;
  status?: string | null;
  dueDate?: string | null;
}

interface ProjectWorkspaceOverviewProps {
  projectId: number;
  criteria: CriteriaProgress;
  /** Statuses of the active criteria, for the segment bar; null hides the tile. */
  criteriaStatuses: string[] | null;
  schedule: ScheduleProgress;
  startDate?: string | null;
  endDate?: string | null;
  /** The MAP, or null when the viewer does not see it (no MAP, or not shared). */
  plan: { phases: WorkspacePhase[]; tasks: WorkspaceTask[] } | null;
  actions: CustomerActionRow[];
  actionsLoading: boolean;
  isExternalViewer: boolean;
  accountName?: string | null;
  contacts: WorkspaceContact[];
  /** The customer's people on the project, listed under ours in the team card. */
  customerContacts?: WorkspaceContact[];
  /** Project notes, pinned at the top of Messages. */
  notes?: ProjectNotes;
  /** Leads the main column (the value journey). */
  journey?: ReactNode;
  /** Follows the roadmap (the project brief). */
  brief?: ReactNode;
  /** Switches the page's tab ("map", "success-criteria", "artifacts"). */
  onOpenTab: (tab: string) => void;
  timezone: string;
  /** Cards that follow in the main column (outcome prompt, ImpactIQ effort). */
  children?: ReactNode;
  /** The project's name, for its lane at the top of the roadmap. */
  projectName: string;
  /** Account (customer) status, shown as the project lane's icon and subtitle. */
  customerStatus?: string | null;
  /** Rows from /api/customer-status-configs, for that icon's shape and color. */
  customerStatusConfigs?: StatusBadgeConfig[];
}

const NO_STATUS_CONFIGS: StatusBadgeConfig[] = [];

type CriterionTone = "done" | "now" | "late" | "next";

function criterionTone(status: string): CriterionTone {
  const s = status.toLowerCase();
  if (s === "complete") return "done";
  if (s.includes("fail") || s.includes("block") || s.includes("not_met") || s.includes("at_risk")) return "late";
  if (s.includes("progress")) return "now";
  return "next";
}

const CRITERION_ORDER: CriterionTone[] = ["done", "now", "late", "next"];

const CRITERION_SEGMENT: Record<CriterionTone, string> = {
  done: "bg-green-700 dark:bg-green-600",
  now: "bg-primary",
  late: "bg-red-700 dark:bg-red-600",
  next: "bg-slate-300 dark:bg-slate-600",
};

function TaskStatusIcon({ status }: { status?: string | null }) {
  const { t } = useTranslation();
  if (isMapItemComplete(status)) {
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-green-700 dark:text-green-400" aria-label={t("workspace.now.taskDone")} />;
  }
  if (status === "in_progress") {
    return <CircleDot className="h-4 w-4 shrink-0 text-primary" aria-label={t("workspace.now.taskActive")} />;
  }
  return <Circle className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" aria-label={t("workspace.now.taskOpen")} />;
}

function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
      <ArrowRight className="h-3.5 w-3.5" />
    </button>
  );
}

/**
 * Overview tab of the project page in the customer workspace layout: bento
 * number tiles, the roadmap (the project's lane, then one per phase, in the
 * Account Portal's style), the current phase, and a side panel with the
 * to-dos (with Mark done), the project's messages with the notes pinned on
 * top, a calendar, and both sides of the team with email links. The value
 * journey leads the main column and the project brief follows the roadmap.
 */
export function ProjectWorkspaceOverview({
  projectId,
  criteria,
  criteriaStatuses,
  schedule,
  startDate,
  endDate,
  plan,
  actions,
  actionsLoading,
  isExternalViewer,
  accountName,
  contacts,
  customerContacts,
  notes,
  journey,
  brief,
  onOpenTab,
  timezone,
  children,
  projectName,
  customerStatus,
  customerStatusConfigs = NO_STATUS_CONFIGS,
}: ProjectWorkspaceOverviewProps) {
  const { t } = useTranslation();
  const { data: journeyData } = useProjectJourney(projectId);

  const phases = useMemo(
    () => [...(plan?.phases ?? [])].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)),
    [plan?.phases],
  );
  const tasks = plan?.tasks ?? [];
  const tasksDone = tasks.filter((task) => isMapItemComplete(task.status)).length;
  const currentIndex = phases.findIndex((phase) => !isMapItemComplete(phase.status));
  const currentPhase = currentIndex >= 0 ? phases[currentIndex] : null;
  const currentTasks = currentPhase
    ? tasks
        .filter((task) => String(task.phaseId) === String(currentPhase.id))
        .sort((a, b) => (toRoadmapDate(a.dueDate)?.getTime() ?? Infinity) - (toRoadmapDate(b.dueDate)?.getTime() ?? Infinity))
    : [];
  const overdue = actions.filter((action) => action.daysOverdue > 0).length;

  const calendarEvents = useMemo<CalendarEvent[]>(
    () => [
      { key: "project-start", date: startDate, kind: "start", label: t("workspace.calendar.projectStarts") },
      { key: "project-end", date: endDate, kind: "end", label: t("workspace.calendar.projectEnds") },
      ...phases.map((phase): CalendarEvent => ({
        key: `phase-${phase.id}`,
        date: phase.dueDate,
        kind: "milestone",
        label: t("workspace.calendar.phaseDue", { name: phase.name }),
      })),
      ...actions.map((action): CalendarEvent => ({
        key: `todo-${action.projectId}-${action.taskId}`,
        date: action.dueDate,
        kind: "todo",
        label: action.name,
        overdue: action.daysOverdue > 0,
      })),
    ],
    [startDate, endDate, phases, actions, t],
  );

  // The portal's roadmap for this one project: the project's own lane
  // first (status icon, open to-dos, bar filled to plan progress with the
  // current stage), then one lane per phase in the same style.
  const roadmapRows = useMemo<RoadmapRowInput[]>(() => {
    if (!plan) return [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return [
      buildProjectRoadmapRow({
        project: { id: projectId, customerStatus, startDate, endDate },
        label: projectName,
        actions,
        stages: journeyData?.stages,
        statusConfigs: customerStatusConfigs,
        today,
        t,
      }),
      ...buildPhaseRoadmapRows({ phases, tasks: plan.tasks, actions, stages: journeyData?.stages, today, t }),
    ];
  }, [plan, phases, actions, journeyData?.stages, projectId, projectName, customerStatus, customerStatusConfigs, startDate, endDate, t]);

  const progressTile = plan && tasks.length > 0 ? (
    <BentoStat
      tone="brand"
      icon={TrendingUp}
      label={t("workspace.tiles.progress")}
      value={`${wholePercent(tasksDone, tasks.length)}%`}
      progress={wholePercent(tasksDone, tasks.length)}
      hint={
        currentPhase
          ? t("workspace.tiles.progressPhase", { n: currentIndex + 1, total: phases.length, name: currentPhase.name })
          : t("workspace.tiles.progressAllDone")
      }
      data-testid="workspace-tile-progress"
    />
  ) : null;

  const daysLeft = schedule.daysRemaining;
  const timeTile = (
    <BentoStat
      icon={Hourglass}
      label={t("workspace.tiles.timeLeft")}
      value={daysLeft == null ? "—" : Math.abs(daysLeft)}
      unit={daysLeft == null ? undefined : t("workspace.tiles.days", { count: Math.abs(daysLeft) })}
      hint={
        daysLeft == null
          ? t("workspace.tiles.noEndDate")
          : daysLeft < 0
            ? t("workspace.tiles.pastEnd")
            : endDate
              ? t("workspace.tiles.endsOn", { date: formatDateForDisplay(endDate, timezone) })
              : undefined
      }
      hintAlert={daysLeft != null && daysLeft < 0}
      data-testid="workspace-tile-time"
    />
  );

  const waitingTile = plan ? (
    <BentoStat
      tone="warn"
      icon={ListTodo}
      label={isExternalViewer ? t("workspace.tiles.waitingOnYou") : t("workspace.tiles.waitingOnCustomer")}
      value={actions.length}
      loading={actionsLoading}
      hint={overdue > 0 ? t("workspace.tiles.overdue", { count: overdue }) : t("workspace.tiles.noneOverdue")}
      hintAlert={overdue > 0}
      data-testid="workspace-tile-waiting"
    />
  ) : null;

  // Success criteria as a number tile; the whole tile opens the criteria.
  // Null statuses: the tab is hidden from this viewer.
  const criteriaTile = criteriaStatuses ? (
    <BentoStat
      icon={Target}
      label={t("workspace.criteria.title")}
      value={criteria.total > 0 ? criteria.met : "—"}
      unit={criteria.total > 0 ? t("workspace.tiles.ofTotalMet", { total: criteria.total }) : undefined}
      footer={
        criteriaStatuses.length > 0 ? (
          <div className="flex h-2.5 gap-1" role="img" aria-label={t("workspace.tiles.criteriaHint", { met: criteria.met, total: criteria.total })}>
            {criteriaStatuses
              .map(criterionTone)
              .sort((a, b) => CRITERION_ORDER.indexOf(a) - CRITERION_ORDER.indexOf(b))
              .map((tone, index) => (
                <span key={index} className={cn("flex-1 rounded-full", CRITERION_SEGMENT[tone])} />
              ))}
          </div>
        ) : null
      }
      onClick={() => onOpenTab("success-criteria")}
      actionLabel={t("workspace.criteria.open")}
      data-testid="workspace-criteria"
    />
  ) : null;

  return (
    <div className="flex flex-wrap items-start gap-4" data-testid="project-workspace-overview">
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
        {journey}
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {progressTile}
          {timeTile}
          {waitingTile}
          {criteriaTile}
        </div>

        {plan && phases.length > 0 ? (
          <BentoCard
            title={
              <span className="inline-flex items-center gap-2">
                <ChartNoAxesGantt className="h-4 w-4 text-primary" aria-hidden="true" />
                {t("workspace.roadmap.title")}
              </span>
            }
            action={<LinkButton onClick={() => onOpenTab("map")}>{t("workspace.roadmap.openPlan")}</LinkButton>}
            data-testid="workspace-roadmap-card"
          >
            <RoadmapChart rows={roadmapRows} labelWidth={200} />
          </BentoCard>
        ) : null}

        {brief}

        {currentPhase ? (
          <BentoCard
            title={t("workspace.now.title", { name: currentPhase.name })}
            action={<LinkButton onClick={() => onOpenTab("map")}>{t("workspace.now.openPlan")}</LinkButton>}
            data-testid="workspace-now"
          >
            {currentTasks.length === 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-400">{t("workspace.now.empty")}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-slate-200 dark:divide-slate-800">
                {currentTasks.slice(0, 6).map((task) => (
                  <li key={task.id} className="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0">
                    <TaskStatusIcon status={task.status} />
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-sm",
                        isMapItemComplete(task.status) ? "text-slate-500 line-through dark:text-slate-500" : "font-medium",
                      )}
                    >
                      {task.name}
                    </span>
                    {task.dueDate ? (
                      <span className="shrink-0 text-xs text-slate-600 dark:text-slate-400">{formatDateForDisplay(task.dueDate, timezone)}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {currentTasks.length > 6 ? (
              <p className="text-xs text-slate-600 dark:text-slate-400">{t("workspace.todos.more", { count: currentTasks.length - 6 })}</p>
            ) : null}
          </BentoCard>
        ) : null}

        {children}
      </div>

      <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4 lg:max-w-[360px]" aria-label={t("workspace.aside.label")}>
        {plan ? (
          <WorkspaceTodoList
            actions={actions}
            loading={actionsLoading}
            isExternalViewer={isExternalViewer}
            accountName={accountName}
            timezone={timezone}
          />
        ) : null}
        <ProjectMessagesCard projectId={projectId} isExternalViewer={isExternalViewer} accountName={accountName} timezone={timezone} notes={notes} />
        <WorkspaceCalendarCard events={calendarEvents} />
        {customerContacts ? (
          <WorkspaceTeamCard
            title={t("workspace.team.title")}
            sections={[
              { key: "ours", label: t("workspace.team.ourTeam"), contacts },
              {
                key: "customer",
                label: isExternalViewer
                  ? t("workspace.team.yourTeam")
                  : accountName
                    ? t("workspace.team.accountTeam", { account: accountName })
                    : t("workspace.team.customerTeam"),
                contacts: customerContacts,
              },
            ]}
          />
        ) : (
          <WorkspaceTeamCard title={isExternalViewer ? t("workspace.team.titleExternal") : t("workspace.team.titleInternal")} contacts={contacts} />
        )}
      </aside>
    </div>
  );
}
