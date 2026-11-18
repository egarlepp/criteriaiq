/**
 * ManageProjectsTable — the Table view of the Manage Projects card
 * (ValidationProjectsPage). Account-first layout:
 *
 *   • "Account · Project" leads every row and stays pinned while the table
 *     scrolls sideways.
 *   • Related fields share a column (Statuses = Internal + Account Status, Type ·
 *     Environment, Primary / Specialist engineers); each merged header has a
 *     "sort by" picker next to its label.
 *   • Risk and Ranking are chip-sized pickers; every Risk, Ranking and status
 *     value shows its Field Settings icon. Statuses are round icon pills;
 *     the hover names the status and who set it, and when.
 *   • Solutions show their graphic or icon and short name (SolutionMark).
 *   • The Account cell carries a ProjectIQ coach marker (only when the
 *     project has coaching) and a competitors marker that lists them.
 *   • Compact (default) or Comfortable row density, chosen in the card header.
 */

import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import {
  AlignVerticalSpaceAround,
  Edit,
  Eye,
  History,
  Orbit,
  SearchCode,
  Trash2,
  Waypoints,
} from "lucide-react";
import type { TeamSummary } from "@shared/teams";
import { SolutionMark } from "@/components/shared/solution-mark";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  SortableTable,
  SortableTableBody,
  SortableTableCell,
  SortableTableHead,
  SortableTableHeader,
  SortableTableRow,
} from "@/components/ui/sortable-table";
import { ResponsiveTableActionsMenu, type TableAction } from "@/components/ui/table-actions-menu";
import type { StatusBadgeConfig } from "@/components/shared/StatusBadge";
import { ProjectTeamBadge } from "@/components/teams/project-teams";
import { cn } from "@/lib/utils";
import { ImpactiqActivityCell, type ImpactiqActivityColumn } from "./impactiq-activity-column";
import {
  CoachMarker,
  CompetitorsMarker,
  ConfigPicker,
  EndDateCell,
  EngineersCell,
  RIndexBadge,
  SortFieldMenu,
  StatusPill,
  TOOLTIP_CLASS,
  splitSolutions,
  type EngineerRef,
  type FieldConfigOption,
  type RIndexInfo,
  type SortFieldOption,
  type StatusChangeRef,
  type TableDensity,
} from "./manage-projects-table-cells";

export interface ManageProject {
  id: number;
  name?: string;
  customerId?: number;
  customerName: string;
  solutionName: string;
  status: string;
  customerStatus?: string;
  risk: string;
  ranking: string;
  type?: string;
  environment?: string;
  industry?: string;
  customerLogo?: string;
  auditCount?: string;
  competitorCount?: number;
  competitorNames?: string[];
  /** Who last set the internal / account status, and when (project audit history). */
  statusChange?: StatusChangeRef | null;
  customerStatusChange?: StatusChangeRef | null;
  /**
   * True once the project has ProjectIQ coaching to show. Nothing sets it
   * yet: the Coach feature is still "Coming soon", so the coach marker stays
   * hidden until that feature stores coaching and the projects list sends it.
   */
  hasCoaching?: boolean;
  primarySe?: EngineerRef;
  specialistSe?: EngineerRef;
  products?: Array<{ id: number; name: string }>;
  successCriteria?: Array<{ id: number; criterion: string; productName?: string }>;
  endDate?: string;
  startDate?: string;
  salesStage?: string | null;
  forecastCategory?: string | null;
  teamId?: number | null;
  subteamId?: number | null;
}

export type ManageProjectAction =
  | "view"
  | "coach"
  | "edit"
  | "assessment"
  | "plan"
  | "tap"
  | "gaps"
  | "discovery"
  | "audit"
  | "delete";

/** Sort fields each merged column can sort by; the first is the default. */
export const MERGED_SORT_FIELDS = {
  accountProject: ["customerName", "id"],
  status: ["status", "customerStatus"],
  typeEnv: ["type", "environment"],
  engineers: ["primarySe", "specialistSe"],
} as const;

interface ManageProjectsTableProps {
  projects: readonly ManageProject[];
  density: TableDensity;
  sortField: string;
  sortDirection: "asc" | "desc";
  onSort: (field: string) => void;
  onPickSortField: (field: string) => void;
  showTeams: boolean;
  teams: readonly TeamSummary[];
  impactiqActivities: ImpactiqActivityColumn;
  rIndexMap: ReadonlyMap<number, RIndexInfo>;
  statusConfigs: readonly StatusBadgeConfig[];
  customerStatusConfigs: readonly StatusBadgeConfig[];
  riskLevelConfigs: readonly FieldConfigOption[];
  rankingConfigs: readonly FieldConfigOption[];
  timezone?: string;
  canEditProjects: boolean;
  canDeleteProjects: boolean;
  canUseEngineerTools: boolean;
  getProductInfo: (solutionName: string) => SolutionInfo | null;
  getAccountId: (project: ManageProject) => number | undefined;
  onFieldUpdate: (projectId: number, field: "risk" | "ranking", value: string) => void;
  onAction: (action: ManageProjectAction, project: ManageProject, solutions: string[]) => void;
}

/** A project's solution as the table draws it (see SolutionMark). */
export interface SolutionInfo {
  name: string;
  abbreviation?: string | null;
  /** Uploaded graphic filename (products.solutionIcon); always wins over `icon`. */
  graphic?: string | null;
  /** Lucide icon name shown when there is no graphic. */
  icon?: string | null;
}

function findConfig(configs: readonly StatusBadgeConfig[], name: string): StatusBadgeConfig | undefined {
  const lower = name.toLowerCase();
  return configs.find((c) => (c.name ?? "").toLowerCase() === lower);
}

function activeOf(options: readonly string[], sortField: string): string {
  return options.includes(sortField) ? sortField : options[0];
}

export function ManageProjectsTable({
  projects,
  density,
  sortField,
  sortDirection,
  onSort,
  onPickSortField,
  showTeams,
  teams,
  impactiqActivities,
  rIndexMap,
  statusConfigs,
  customerStatusConfigs,
  riskLevelConfigs,
  rankingConfigs,
  timezone,
  canEditProjects,
  canDeleteProjects,
  canUseEngineerTools,
  getProductInfo,
  getAccountId,
  onFieldUpdate,
  onAction,
}: ManageProjectsTableProps) {
  const { t } = useTranslation();
  const sortConfig = { key: sortField, direction: sortDirection };
  const compact = density === "compact";
  const cellPad = compact ? "px-2.5 py-1.5" : "px-4 py-3";
  const headPad = compact ? "px-2.5 py-2" : "px-4 py-3";
  const stickyHead = "sticky left-0 z-20 bg-gray-50 dark:bg-gray-800 shadow-[1px_0_0_0_rgb(229,231,235)] dark:shadow-[1px_0_0_0_rgb(55,65,81)]";
  const stickyCell =
    "sticky left-0 z-10 bg-card group-hover/row:bg-gray-50 dark:group-hover/row:bg-gray-800 shadow-[1px_0_0_0_rgb(229,231,235)] dark:shadow-[1px_0_0_0_rgb(55,65,81)]";

  const sortOptions = (keys: readonly string[]): SortFieldOption[] =>
    keys.map((key) => ({ key, label: t(`projects.manageTable.sortField.${key}`) }));

  // A merged column's header sorts by whichever of its fields is active.
  const mergedHead = (
    keys: readonly string[],
    label: string,
    tooltip: string,
    className?: string,
  ) => {
    const active = activeOf(keys, sortField);
    return (
      <SortableTableHead
        sortKey={active}
        sortConfig={sortConfig}
        onSort={onSort}
        tooltipText={tooltip}
        className={cn(headPad, "whitespace-nowrap", className)}
        headerAddon={<SortFieldMenu options={sortOptions(keys)} activeKey={active} onPick={onPickSortField} />}
      >
        {label}
      </SortableTableHead>
    );
  };

  const head = (key: string, label: string, tooltip: string) => (
    <SortableTableHead
      sortKey={key}
      sortConfig={sortConfig}
      onSort={onSort}
      tooltipText={tooltip}
      className={cn(headPad, "whitespace-nowrap")}
    >
      {label}
    </SortableTableHead>
  );

  return (
    // The table's own overflow clip would make it the sticky container, so the
    // pinned Account column needs it visible; the wrapper still scrolls.
    <SortableTable className="!overflow-visible">
      <SortableTableHeader>
        <SortableTableRow>
          {mergedHead(MERGED_SORT_FIELDS.accountProject, t("projects.manageTable.col.accountProject"), t("projects.manageTable.tip.accountProject"), stickyHead)}
          {head("rIndex", t("projects.manageTable.col.rIndex"), t("projects.manageTable.tip.rIndex"))}
          {head("risk", t("projects.manageTable.col.risk"), t("projects.manageTable.tip.risk"))}
          {head("ranking", t("projects.manageTable.col.ranking"), t("projects.manageTable.tip.ranking"))}
          {mergedHead(MERGED_SORT_FIELDS.status, t("projects.manageTable.col.status"), t("projects.manageTable.tip.status"))}
          {head("solutionName", t("projects.manageTable.col.solution"), t("projects.manageTable.tip.solution"))}
          {mergedHead(MERGED_SORT_FIELDS.typeEnv, t("projects.manageTable.col.typeEnv"), t("projects.manageTable.tip.typeEnv"))}
          {showTeams && head("team", t("projects.teams.column"), t("projects.teams.sortTooltip"))}
          {mergedHead(MERGED_SORT_FIELDS.engineers, t("projects.manageTable.col.engineers"), t("projects.manageTable.tip.engineers"))}
          {head("endDate", t("projects.manageTable.col.endDate"), t("projects.manageTable.tip.endDate"))}
          {impactiqActivities.visible && head("impactiqActivities", t("projects.impactiqActivities.header"), t("projects.impactiqActivities.headerTooltip"))}
          <SortableTableHead sortKey="actions" sortable={false} className={headPad}>
            <span className="sr-only">{t("projects.manageTable.col.actions")}</span>
          </SortableTableHead>
        </SortableTableRow>
      </SortableTableHeader>
      <SortableTableBody>
        {projects.map((poc) => {
          const solutions = splitSolutions(poc.solutionName);
          const accountId = getAccountId(poc);
          const statusConfig = findConfig(statusConfigs, poc.status ?? "");
          const customerStatus = poc.customerStatus || "";
          const customerStatusConfig = customerStatus ? findConfig(customerStatusConfigs, customerStatus) : undefined;
          const rIndex = rIndexMap.get(poc.id);

          const actions: TableAction[] = [
            { id: "view", label: t("projects.manageTable.action.view"), icon: Eye, onClick: () => onAction("view", poc, solutions) },
            ...(canEditProjects
              ? [{ id: "edit", label: t("projects.manageTable.action.edit"), icon: Edit, onClick: () => onAction("edit", poc, solutions) }]
              : []),
            {
              id: "plan",
              label: t(canEditProjects ? "projects.manageTable.action.editMap" : "projects.manageTable.action.viewMap"),
              icon: Waypoints,
              onClick: () => onAction("plan", poc, solutions),
            },
            { id: "tap", label: t("projects.manageTable.action.editTap"), icon: Orbit, onClick: () => onAction("tap", poc, solutions), hidden: !canUseEngineerTools },
            { id: "gaps", label: t("projects.manageTable.action.viewGaps"), icon: AlignVerticalSpaceAround, onClick: () => onAction("gaps", poc, solutions), hidden: !canUseEngineerTools },
            { id: "discovery", label: t("projects.manageTable.action.discovery"), icon: SearchCode, onClick: () => onAction("discovery", poc, solutions), hidden: accountId === undefined },
            {
              id: "audit",
              label: t("projects.manageTable.action.audit"),
              icon: History,
              onClick: () => onAction("audit", poc, solutions),
              hidden: !poc.auditCount || poc.auditCount === "0",
              variant: "warning",
            },
            ...(canDeleteProjects
              ? [{
                  id: "delete",
                  label: t("projects.manageTable.action.delete"),
                  icon: Trash2,
                  onClick: () => onAction("delete", poc, solutions),
                  variant: "destructive" as const,
                  separator: true,
                }]
              : []),
          ];

          return (
            <SortableTableRow key={poc.id} className="group/row">
              {/* Account · Project (pinned) */}
              <SortableTableCell className={cn(cellPad, stickyCell, "min-w-[220px] max-w-[280px]")}>
                <div className="flex items-start gap-1.5 min-w-0">
                  {(poc.hasCoaching || (poc.competitorCount ?? 0) > 0) && (
                    <div className="mt-0.5 flex shrink-0 items-center gap-0.5">
                      {poc.hasCoaching && <CoachMarker onOpen={() => onAction("coach", poc, solutions)} />}
                      {(poc.competitorCount ?? 0) > 0 && (
                        <CompetitorsMarker count={poc.competitorCount ?? 0} names={poc.competitorNames ?? []} />
                      )}
                    </div>
                  )}
                  <div className="min-w-0 leading-tight">
                    {accountId !== undefined ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link
                            href={`/account?edit=${accountId}`}
                            className="block truncate font-semibold text-gray-900 hover:text-blue-700 dark:text-gray-100 dark:hover:text-blue-300"
                          >
                            {poc.customerName}
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="top" className={TOOLTIP_CLASS}>
                          {t("projects.manageTable.editAccount")}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="block truncate font-semibold text-gray-900 dark:text-gray-100">{poc.customerName}</span>
                    )}
                    <Link
                      href={`/project/${poc.id}?source=projects`}
                      title={t("projects.manageTable.viewProject")}
                      className="mt-0.5 block truncate text-[11px] text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-300"
                    >
                      <span className="font-semibold text-blue-600 dark:text-blue-400">#{poc.id}</span>
                      {poc.name ? ` · ${poc.name}` : ""}
                    </Link>
                  </div>
                </div>
              </SortableTableCell>

              {/* R-Index */}
              <SortableTableCell className={cn(cellPad, "whitespace-nowrap")}>
                {rIndex ? (
                  <RIndexBadge info={rIndex} timezone={timezone} onOpen={() => onAction("assessment", poc, solutions)} />
                ) : (
                  <span className="text-sm text-gray-400 dark:text-gray-500">—</span>
                )}
              </SortableTableCell>

              {/* Risk */}
              <SortableTableCell className={cn(cellPad, "whitespace-nowrap")}>
                <ConfigPicker
                  value={poc.risk || "None"}
                  options={riskLevelConfigs}
                  ariaLabel={t("projects.manageTable.changeRisk")}
                  disabled={!canEditProjects}
                  onChange={(value) => onFieldUpdate(poc.id, "risk", value)}
                />
              </SortableTableCell>

              {/* Ranking */}
              <SortableTableCell className={cn(cellPad, "whitespace-nowrap")}>
                <ConfigPicker
                  value={poc.ranking || "In Quarter"}
                  options={rankingConfigs}
                  ariaLabel={t("projects.manageTable.changeRanking")}
                  disabled={!canEditProjects}
                  onChange={(value) => onFieldUpdate(poc.id, "ranking", value)}
                />
              </SortableTableCell>

              {/* Statuses: Internal + Account */}
              <SortableTableCell className={cn(cellPad, "whitespace-nowrap")}>
                <div className="flex items-center gap-1.5">
                  <StatusPill
                    kind="internal"
                    config={statusConfig}
                    label={statusConfig?.name ?? (poc.status || null)}
                    change={poc.statusChange}
                    timezone={timezone}
                    fallbackColor="#64748B"
                  />
                  <StatusPill
                    kind="account"
                    config={customerStatusConfig}
                    label={customerStatusConfig?.name ?? (customerStatus || null)}
                    change={poc.customerStatusChange}
                    timezone={timezone}
                  />
                </div>
              </SortableTableCell>

              {/* Solution */}
              <SortableTableCell className={cellPad}>
                <div className="flex flex-wrap gap-1">
                  {solutions.length > 0 ? (
                    solutions.map((solutionName, index) => {
                      const info = getProductInfo(solutionName);
                      if (!info) return null;
                      return (
                        <SolutionMark
                          key={`${solutionName}-${index}`}
                          name={info.name}
                          abbreviation={info.abbreviation}
                          graphic={info.graphic}
                          icon={info.icon}
                        />
                      );
                    })
                  ) : (
                    <span className="text-xs text-gray-400 dark:text-gray-500">{t("projects.manageTable.noSolution")}</span>
                  )}
                </div>
              </SortableTableCell>

              {/* Type · Environment */}
              <SortableTableCell className={cn(cellPad, "whitespace-nowrap leading-tight")}>
                <span className="block text-sm text-gray-900 dark:text-gray-100">{poc.type || t("projects.manageTable.notSpecified")}</span>
                <span className="block text-[11px] text-gray-500 dark:text-gray-400">{poc.environment || t("projects.manageTable.notSpecified")}</span>
              </SortableTableCell>

              {showTeams && (
                <SortableTableCell className={cn(cellPad, "whitespace-nowrap")}>
                  <ProjectTeamBadge teams={teams} project={poc} />
                </SortableTableCell>
              )}

              {/* Engineers */}
              <SortableTableCell className={cn(cellPad, "whitespace-nowrap")}>
                <EngineersCell primary={poc.primarySe} specialist={poc.specialistSe} />
              </SortableTableCell>

              {/* End Date */}
              <SortableTableCell className={cn(cellPad, "whitespace-nowrap")}>
                <EndDateCell endDate={poc.endDate} startDate={poc.startDate} status={poc.status} timezone={timezone} />
              </SortableTableCell>

              {impactiqActivities.visible && (
                <SortableTableCell className={cn(cellPad, "whitespace-nowrap")}>
                  <ImpactiqActivityCell
                    column={impactiqActivities}
                    projectId={poc.id}
                    projectLabel={[poc.customerName, poc.name].filter(Boolean).join(" · ")}
                    timezone={timezone}
                  />
                </SortableTableCell>
              )}

              <SortableTableCell className={cn(cellPad, "text-right")}>
                <ResponsiveTableActionsMenu actions={actions} />
              </SortableTableCell>
            </SortableTableRow>
          );
        })}
      </SortableTableBody>
    </SortableTable>
  );
}
