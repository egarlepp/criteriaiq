import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock, FolderKanban, ChartNoAxesGantt, ListTodo, Target } from "lucide-react";
import { formatDateForDisplay } from "@/lib/date-utils";
import type { CustomerActionRow } from "@/lib/customer-actions";
import type { StatusBadgeConfig } from "@/components/shared/StatusBadge";
import { criteriaProgress } from "@/components/project-detail/project-overview-utils";
import { BentoCard, BentoStat } from "./BentoTiles";
import { PortalMessagesCard, useProjectMessageUnread } from "./PortalMessagesCard";
import { RoadmapChart } from "./RoadmapChart";
import { toRoadmapDate, type RoadmapRowInput } from "./roadmap-utils";
import { buildProjectRoadmapRow } from "./roadmap-rows";
import { WorkspaceTodoList } from "./WorkspaceAside";
import { WorkspaceCalendarCard, type CalendarEvent } from "./WorkspaceCalendarCard";
import { useProjectJourneys } from "@/components/value-journey/use-value-journey";
import { isClosedProjectStatus, wholePercent } from "./workspace-utils";

export interface PortalProject {
  id: number;
  name?: string | null;
  customerName?: string | null;
  status?: string | null;
  customerStatus?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  successCriteria?: Array<{ status?: string | null; isActive?: boolean | null }> | null;
}

interface PortalWorkspaceHomeProps {
  /** First name for the greeting; omitted, the greeting has no name. */
  viewerFirstName?: string | null;
  accountName: string;
  projects: PortalProject[];
  actions: CustomerActionRow[];
  actionsLoading: boolean;
  isExternalViewer: boolean;
  onOpenProject: (projectId: number) => void;
  projectHref: (projectId: number) => string;
  timezone: string;
  /**
   * Account (customer) status rows from /api/customer-status-configs: each
   * roadmap project leads with its status icon in the status color.
   */
  customerStatusConfigs?: StatusBadgeConfig[];
  /** The project cards, drawn under the roadmap; each card's chat button opens its messages. */
  projectCards?(messages: PortalCardMessages): ReactNode;
  /** More content for the main column (the account charts for staff). */
  children?: ReactNode;
}

/** What a project card needs for its chat button. */
export interface PortalCardMessages {
  unread: Map<number, number>;
  /** Opens the project's conversation in the side panel and scrolls to it. */
  open(projectId: number): void;
}

const NO_STATUS_CONFIGS: StatusBadgeConfig[] = [];

/**
 * Home tab of the Account Portal in the customer workspace layout: a
 * greeting, four number tiles, every live project on one roadmap (each lane
 * names how many open to-dos it has; the to-dos themselves are dated in the
 * side panel and calendar), the project cards (each with a chat button and
 * unread count), and a side panel with all to-dos, the messages of every
 * project and a calendar. The account team sits in the page header.
 */
export function PortalWorkspaceHome({
  viewerFirstName,
  accountName,
  projects,
  actions,
  actionsLoading,
  isExternalViewer,
  onOpenProject,
  projectHref,
  timezone,
  customerStatusConfigs = NO_STATUS_CONFIGS,
  projectCards,
  children,
}: PortalWorkspaceHomeProps) {
  const { t } = useTranslation();
  const liveProjects = useMemo(() => projects.filter((project) => !isClosedProjectStatus(project.status)), [projects]);
  const overdue = actions.filter((action) => action.daysOverdue > 0).length;
  const projectLabel = useCallback(
    (project: PortalProject) => project.name || project.customerName || t("projectView.hero.untitled", { id: project.id }),
    [t],
  );
  const messageProjects = useMemo(
    () => liveProjects.map((project) => ({ id: project.id, label: projectLabel(project) })),
    [liveProjects, projectLabel],
  );
  const unread = useProjectMessageUnread(messageProjects.map((project) => project.id));
  const [messagesProjectId, setMessagesProjectId] = useState<number | null>(null);
  const openMessages = useCallback((projectId: number) => {
    setMessagesProjectId(projectId);
    // After the panel re-renders with the project's conversation.
    requestAnimationFrame(() => document.getElementById("portal-messages")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, []);

  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const criteriaTotals = useMemo(
    () =>
      liveProjects.reduce(
        (sum, project) => {
          const progress = criteriaProgress(project.successCriteria);
          return { met: sum.met + progress.met, total: sum.total + progress.total };
        },
        { met: 0, total: 0 },
      ),
    [liveProjects],
  );

  // The soonest open to-do due today or later.
  const nextDeadline = useMemo(() => {
    let best: { date: Date; action: CustomerActionRow } | null = null;
    for (const action of actions) {
      const date = toRoadmapDate(action.dueDate);
      if (!date || date < today) continue;
      if (!best || date < best.date) best = { date, action };
    }
    return best;
  }, [actions, today]);

  const liveProjectIds = useMemo(() => liveProjects.map((project) => project.id), [liveProjects]);
  const journeys = useProjectJourneys(liveProjectIds);

  // One lane per project. Individual to-dos are not pinned here: an account
  // can have dozens, many due after the project's end date, and they would
  // run past the bar. The lane's subtitle counts them instead.
  const roadmapRows = useMemo<RoadmapRowInput[]>(() => {
    return liveProjects.map((project) =>
      buildProjectRoadmapRow({
        project,
        label: projectLabel(project),
        actions: actions.filter((action) => action.projectId === project.id),
        stages: journeys.get(project.id)?.stages,
        statusConfigs: customerStatusConfigs,
        href: projectHref(project.id),
        today,
        t,
      }),
    );
  }, [liveProjects, actions, projectHref, today, projectLabel, customerStatusConfigs, journeys, t]);

  const calendarEvents = useMemo<CalendarEvent[]>(
    () => [
      ...liveProjects.flatMap((project): CalendarEvent[] => {
        const name = project.name || project.customerName || t("projectView.hero.untitled", { id: project.id });
        return [
          { key: `start-${project.id}`, date: project.startDate, kind: "start", label: t("workspace.calendar.namedStarts", { name }) },
          { key: `end-${project.id}`, date: project.endDate, kind: "end", label: t("workspace.calendar.namedEnds", { name }) },
        ];
      }),
      ...actions.map((action): CalendarEvent => ({
        key: `todo-${action.projectId}-${action.taskId}`,
        date: action.dueDate,
        kind: "todo",
        label: action.name,
        overdue: action.daysOverdue > 0,
      })),
    ],
    [liveProjects, actions, t],
  );

  return (
    <div className="flex flex-col gap-4" data-testid="portal-workspace-home">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {viewerFirstName ? t("workspace.portal.greetingNamed", { name: viewerFirstName }) : t("workspace.portal.greeting")}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {actions.length > 0
                ? isExternalViewer
                  ? t("workspace.portal.summaryWaiting", { count: actions.length, account: accountName })
                  : t("workspace.portal.summaryWaitingInternal", { count: actions.length, account: accountName })
                : t("workspace.portal.summaryClear", { account: accountName })}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <BentoStat
              tone="brand"
              icon={FolderKanban}
              label={t("workspace.portal.activeProjects")}
              value={liveProjects.length}
              hint={t("workspace.portal.totalProjects", { count: projects.length })}
              data-testid="portal-tile-active"
            />
            <BentoStat
              tone="warn"
              icon={ListTodo}
              label={isExternalViewer ? t("workspace.tiles.waitingOnYou") : t("workspace.tiles.waitingOnCustomer")}
              value={actions.length}
              loading={actionsLoading}
              hint={overdue > 0 ? t("workspace.tiles.overdue", { count: overdue }) : t("workspace.tiles.noneOverdue")}
              hintAlert={overdue > 0}
              data-testid="portal-tile-waiting"
            />
            <BentoStat
              icon={CalendarClock}
              label={t("workspace.portal.nextDeadline")}
              value={nextDeadline ? formatDateForDisplay(nextDeadline.action.dueDate as string, timezone) : "—"}
              loading={actionsLoading}
              hint={nextDeadline ? nextDeadline.action.name : t("workspace.portal.nothingDue")}
              valueClassName="text-2xl"
              data-testid="portal-tile-deadline"
            />
            <BentoStat
              icon={Target}
              label={t("workspace.tiles.criteriaMet")}
              value={criteriaTotals.total > 0 ? `${wholePercent(criteriaTotals.met, criteriaTotals.total)}%` : "—"}
              progress={criteriaTotals.total > 0 ? wholePercent(criteriaTotals.met, criteriaTotals.total) : null}
              hint={t("workspace.tiles.criteriaHint", { met: criteriaTotals.met, total: criteriaTotals.total })}
              data-testid="portal-tile-criteria"
            />
          </div>

          {liveProjects.length > 0 ? (
            <BentoCard
              title={
                <span className="inline-flex items-center gap-2">
                  <ChartNoAxesGantt className="h-4 w-4 text-primary" aria-hidden="true" />
                  {t("workspace.portal.roadmapTitle")}
                </span>
              }
              data-testid="portal-roadmap-card"
            >
              <RoadmapChart rows={roadmapRows} labelWidth={200} />
            </BentoCard>
          ) : null}

          {projectCards?.({ unread, open: openMessages })}
          {children}
        </div>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4 lg:max-w-[360px]" aria-label={t("workspace.aside.label")}>
          <WorkspaceTodoList
            actions={actions}
            loading={actionsLoading}
            isExternalViewer={isExternalViewer}
            accountName={accountName}
            showProject
            onOpenProject={onOpenProject}
            timezone={timezone}
            projects={messageProjects}
          />
          {messageProjects.length > 0 ? (
            <PortalMessagesCard
              projects={messageProjects}
              unread={unread}
              selectedProjectId={messagesProjectId}
              onSelect={setMessagesProjectId}
              isExternalViewer={isExternalViewer}
              accountName={accountName}
              timezone={timezone}
            />
          ) : null}
          <WorkspaceCalendarCard events={calendarEvents} />
        </aside>
      </div>
    </div>
  );
}
