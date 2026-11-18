import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock, Check, CheckCircle2, ChevronsDownUp, ChevronsUpDown, ListTodo, Mail, Undo2, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDateForDisplay } from "@/lib/date-utils";
import type { CustomerActionRow } from "@/lib/customer-actions";
import { BentoCard } from "./BentoTiles";
import { ProjectPills, type PillProject } from "./ProjectPills";
import { WORKSPACE_TODOS_ANCHOR, type WorkspaceContact } from "./workspace-utils";
import { useCustomerActionStatus } from "./use-workspace-mutations";

interface WorkspaceTodoListProps {
  actions: CustomerActionRow[];
  loading?: boolean;
  /** Customer, Partner or Guest: "Your to-dos"; staff see "Waiting on {account}". */
  isExternalViewer: boolean;
  accountName?: string | null;
  /** Show each row's project (Account Portal, where rows span projects). */
  showProject?: boolean;
  onOpenProject?: (projectId: number) => void;
  timezone?: string;
  /** Detailed rows shown before "Show N more"; compact mode fits more into the same height. */
  limit?: number;
  /**
   * Account Portal: the projects to filter by, as pills (All, then one per
   * project with its open to-do count). Shown when there are two or more.
   */
  projects?: PillProject[];
}

/**
 * Compact rows that fit in the height of five detailed ones (a detailed row
 * is 54px with an 8px gap: 302px; a compact row is 32px with a 4px gap).
 */
const COMPACT_ROWS_PER_DETAILED = 8 / 5;
/** Height of the list when it is cut: five detailed rows. */
const CUT_LIST_HEIGHT_PER_ROW = 302 / 5;

/**
 * Open MAP tasks the customer side owns, overdue first (the order
 * shared/customer-actions.ts returns). A row the viewer may change
 * (`canComplete`, decided by the server) gets a Mark done button; to-dos
 * ticked here stay listed as "Done just now" with Undo until the page is
 * left. On the Account Portal a row also opens its project, and project
 * pills filter the list. "Show N more" expands the list in place. Rows start
 * compact (name and tick box); the toggle at the bottom right shows the
 * number, project or step and due date. While the list is cut, it keeps the
 * same height in both modes, so the card does not jump.
 */
export function WorkspaceTodoList({
  actions,
  loading = false,
  isExternalViewer,
  accountName,
  showProject = false,
  onOpenProject,
  timezone = "America/New_York",
  limit = 5,
  projects = [],
}: WorkspaceTodoListProps) {
  const { t } = useTranslation();
  const sectionRef = useRef<HTMLDivElement>(null);
  const statusMutation = useCustomerActionStatus();
  const [recentlyDone, setRecentlyDone] = useState<CustomerActionRow[]>([]);
  const rowKey = (action: CustomerActionRow) => `${action.projectId}-${action.taskId}`;
  const doneKeys = new Set(recentlyDone.map(rowKey));
  const [projectFilter, setProjectFilter] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [detailed, setDetailed] = useState(false);
  const allOpen = actions.filter((action) => !doneKeys.has(rowKey(action)));
  const perProject = new Map<number, number>();
  for (const action of allOpen) perProject.set(action.projectId, (perProject.get(action.projectId) ?? 0) + 1);
  // A pill per project with open to-dos: the given projects first, then any
  // other project that has some (a closed project can still have some). A
  // project with none gets no pill until it has one.
  const pillProjects = projects.filter((project) => perProject.has(project.id));
  for (const action of allOpen) {
    if (!pillProjects.some((project) => project.id === action.projectId)) {
      pillProjects.push({ id: action.projectId, label: action.projectName || t("projectView.hero.untitled", { id: action.projectId }) });
    }
  }
  // With to-dos on one project only, its pill would match All, so none show.
  const showPills = projects.length > 0 && pillProjects.length > 1;
  const filter = showPills && pillProjects.some((project) => project.id === projectFilter) ? projectFilter : null;
  const openActions = filter === null ? allOpen : allOpen.filter((action) => action.projectId === filter);
  const cap = detailed ? limit : Math.floor(limit * COMPACT_ROWS_PER_DETAILED);
  const shown = expanded ? openActions : openActions.slice(0, cap);
  const hidden = openActions.length - shown.length;
  // More to-dos than five detailed rows, and not all shown: hold the height.
  const holdHeight = !expanded && openActions.length > limit;
  const busyKey =
    statusMutation.isPending && statusMutation.variables
      ? `${statusMutation.variables.projectId}-${statusMutation.variables.taskId}`
      : null;

  const markDone = (action: CustomerActionRow) =>
    statusMutation.mutate(
      { projectId: action.projectId, taskId: action.taskId, done: true },
      { onSuccess: () => setRecentlyDone((prev) => [...prev, action]) },
    );
  const undo = (action: CustomerActionRow) =>
    statusMutation.mutate(
      { projectId: action.projectId, taskId: action.taskId, done: false, previousStatus: action.status },
      { onSuccess: () => setRecentlyDone((prev) => prev.filter((row) => rowKey(row) !== rowKey(action))) },
    );
  const title = isExternalViewer
    ? t("workspace.todos.title")
    : accountName
      ? t("workspace.todos.titleInternalNamed", { account: accountName })
      : t("workspace.todos.titleInternal");

  // The sidebar's "My to-dos" links to /account#workspace-todos.
  useEffect(() => {
    const scrollIfTargeted = () => {
      if (window.location.hash === `#${WORKSPACE_TODOS_ANCHOR}`) {
        sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    scrollIfTargeted();
    window.addEventListener("popstate", scrollIfTargeted);
    return () => window.removeEventListener("popstate", scrollIfTargeted);
  }, []);

  return (
    <div ref={sectionRef} id={WORKSPACE_TODOS_ANCHOR} className="scroll-mt-4">
      <BentoCard
        title={
          <span className="inline-flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-primary" aria-hidden="true" />
            {title}
          </span>
        }
        action={
          <span className="rounded-full bg-orange-100 px-2 text-xs font-bold text-orange-900 dark:bg-orange-950/60 dark:text-orange-200">
            {openActions.length}
          </span>
        }
        data-testid="workspace-todos"
      >
        {showPills && !loading ? (
          <ProjectPills
            projects={pillProjects}
            selected={filter}
            onSelect={(projectId) => {
              setProjectFilter(projectId);
              setExpanded(false);
            }}
            counts={perProject}
            label={t("workspace.todos.filter")}
            countLabel={(name, count) => t("workspace.todos.pillCount", { name, count })}
            testIdPrefix="workspace-todos-pill"
          />
        ) : null}
        {loading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : openActions.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400" data-testid="workspace-todos-empty">
            <CheckCircle2 className="h-4 w-4 text-green-700 dark:text-green-400" />
            {isExternalViewer ? t("workspace.todos.emptyExternal") : t("workspace.todos.emptyInternal")}
          </p>
        ) : (
          <ul
            className={cn("flex flex-col", detailed ? "gap-2" : "gap-1", holdHeight && "overflow-y-auto")}
            style={holdHeight ? { height: `${Math.round(limit * CUT_LIST_HEIGHT_PER_ROW)}px` } : undefined}
            data-compact={!detailed}
          >
            {shown.map((action) => {
              const overdue = action.daysOverdue > 0;
              const due = action.dueDate
                ? overdue
                  ? t("workspace.todos.overdue", { count: action.daysOverdue })
                  : t("workspace.todos.due", { date: formatDateForDisplay(action.dueDate, timezone) })
                : t("workspace.todos.noDueDate");
              const context = showProject ? action.projectName : action.stepName;
              const body = !detailed ? (
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm font-semibold",
                    overdue ? "text-red-700 dark:text-red-400" : "text-slate-900 dark:text-slate-100",
                  )}
                  title={[action.name, context, due].filter(Boolean).join(" · ")}
                >
                  {action.name}
                </span>
              ) : (
                <>
                  <span
                    className={cn(
                      "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white",
                      overdue ? "bg-red-700 dark:bg-red-600" : "bg-orange-700 dark:bg-orange-600",
                    )}
                    aria-hidden="true"
                  >
                    {overdue ? "!" : openActions.indexOf(action) + 1}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{action.name}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-slate-600 dark:text-slate-400">
                      {context ? <span className="font-semibold">{context}</span> : null}
                      <span className={cn("inline-flex items-center gap-1", overdue && "font-semibold text-red-700 dark:text-red-400")}>
                        <CalendarClock className="h-3 w-3" />
                        {due}
                      </span>
                    </span>
                  </span>
                </>
              );
              const rowClass = detailed
                ? "flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left"
                : "flex w-full min-w-0 items-center rounded-lg px-2 py-1 text-left";
              return (
                <li key={rowKey(action)} className={cn("flex gap-1", detailed ? "items-start" : "items-center")}>
                  {onOpenProject ? (
                    <button
                      type="button"
                      onClick={() => onOpenProject(action.projectId)}
                      className={cn(rowClass, "transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-slate-800")}
                    >
                      {body}
                    </button>
                  ) : (
                    <div className={rowClass}>{body}</div>
                  )}
                  {action.canComplete ? (
                    <button
                      type="button"
                      onClick={() => markDone(action)}
                      disabled={busyKey === rowKey(action)}
                      className={cn(
                        "grid shrink-0 place-items-center rounded-full border-2 border-slate-300 text-transparent transition-colors hover:border-green-700 hover:text-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:border-slate-600 dark:hover:border-green-400 dark:hover:text-green-400",
                        detailed ? "mt-2 h-7 w-7" : "h-6 w-6",
                      )}
                      aria-label={t("workspace.todos.markDone", { name: action.name })}
                      title={t("workspace.todos.markDoneShort")}
                      data-testid={`workspace-todo-done-${action.taskId}`}
                    >
                      <Check className={detailed ? "h-4 w-4" : "h-3.5 w-3.5"} />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {!loading && openActions.length > 0 ? (
          <div className="flex items-center justify-between gap-2">
            {hidden > 0 || (expanded && openActions.length > cap) ? (
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                aria-expanded={expanded}
                className="self-start rounded-md text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="workspace-todos-more"
              >
                {expanded ? t("workspace.todos.showLess") : t("workspace.todos.showMore", { count: hidden })}
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => setDetailed((value) => !value)}
              aria-pressed={detailed}
              aria-label={detailed ? t("workspace.todos.compactView") : t("workspace.todos.detailedView")}
              title={detailed ? t("workspace.todos.compactView") : t("workspace.todos.detailedView")}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-slate-300 dark:hover:bg-slate-800"
              data-testid="workspace-todos-density"
            >
              {detailed ? <ChevronsDownUp className="h-4 w-4" aria-hidden="true" /> : <ChevronsUpDown className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
        ) : null}
        {recentlyDone.length > 0 ? (
          <div className="flex flex-col gap-1 border-t border-slate-200 pt-3 dark:border-slate-800" data-testid="workspace-todos-recent">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">{t("workspace.todos.doneJustNow")}</p>
            <ul className="flex flex-col gap-1">
              {recentlyDone.map((action) => (
                <li key={rowKey(action)} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-700 dark:text-green-400" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-600 line-through dark:text-slate-400">{action.name}</span>
                  <button
                    type="button"
                    onClick={() => undo(action)}
                    disabled={busyKey === rowKey(action)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    aria-label={t("workspace.todos.undoNamed", { name: action.name })}
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    {t("workspace.todos.undo")}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </BentoCard>
    </div>
  );
}

interface WorkspaceTeamSection {
  key: string;
  label: string;
  contacts: WorkspaceContact[];
}

interface WorkspaceTeamCardProps {
  title: string;
  /** One list of people (Account Portal). */
  contacts?: WorkspaceContact[];
  /** Two or more labelled lists (project page: our team and the customer's). */
  sections?: WorkspaceTeamSection[];
  /** People shown per section before "Show all". */
  limit?: number;
}

function ContactRow({ contact }: { contact: WorkspaceContact }) {
  const { t } = useTranslation();
  return (
    <li className="flex items-center gap-3">
      <span
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold",
          contact.side === "customer"
            ? "bg-orange-100 text-orange-900 dark:bg-orange-950/60 dark:text-orange-200"
            : "bg-primary/10 text-primary dark:bg-primary/20",
        )}
        aria-hidden="true"
      >
        {contact.initials}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{contact.name}</span>
          {contact.badge ? (
            <span className="shrink-0 rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {contact.badge}
            </span>
          ) : null}
        </span>
        <span className="truncate text-xs text-slate-600 dark:text-slate-400">{contact.role}</span>
      </span>
      {contact.email ? (
        <a
          href={`mailto:${contact.email}`}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-slate-300 text-slate-700 transition-colors hover:bg-slate-100 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label={t("workspace.team.emailNamed", { name: contact.name })}
          title={`${t("workspace.team.email")}: ${contact.email}`}
        >
          <Mail className="h-4 w-4" />
        </a>
      ) : null}
    </li>
  );
}

function TeamSectionList({ section, showLabel, limit }: { section: WorkspaceTeamSection; showLabel: boolean; limit: number }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? section.contacts : section.contacts.slice(0, limit);
  const hidden = section.contacts.length - shown.length;
  return (
    <div className="flex flex-col gap-2" data-testid={`workspace-team-${section.key}`}>
      {showLabel ? (
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">{section.label}</h3>
      ) : null}
      {section.contacts.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">{showLabel ? t("workspace.team.emptySide") : t("workspace.team.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((contact) => (
            <ContactRow key={contact.key} contact={contact} />
          ))}
        </ul>
      )}
      {hidden > 0 || expanded ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="self-start rounded-md text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={expanded}
        >
          {expanded ? t("workspace.team.showLess") : t("workspace.team.showAll", { total: section.contacts.length })}
        </button>
      ) : null}
    </div>
  );
}

/**
 * The people to contact, each with an Email button (a mailto link). On the
 * project page the card has two sections, our team and the customer's.
 */
export function WorkspaceTeamCard({ title, contacts = [], sections, limit = 6 }: WorkspaceTeamCardProps) {
  const lists = sections ?? [{ key: "people", label: title, contacts }];
  const labelled = lists.length > 1;
  return (
    <BentoCard
      title={
        <span className="inline-flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" aria-hidden="true" />
          {title}
        </span>
      }
      data-testid="workspace-team"
    >
      <div className={cn("flex flex-col", labelled ? "gap-4 [&>*+*]:border-t [&>*+*]:border-slate-200 [&>*+*]:pt-4 dark:[&>*+*]:border-slate-800" : "gap-3")}>
        {lists.map((section) => (
          <TeamSectionList key={section.key} section={section} showLabel={labelled} limit={limit} />
        ))}
      </div>
    </BentoCard>
  );
}
