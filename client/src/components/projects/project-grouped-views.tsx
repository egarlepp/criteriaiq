/**
 * ProjectGroupedViews — the "Due" and "For Review" views of the Manage
 * Projects card (moved from the Dashboard's Projects card). Projects are
 * grouped into accordion sections and rendered as DashboardProjectCards.
 */

import type { ElementType } from "react";
import { useTranslation } from "react-i18next";
import {
  CalendarCheck,
  CalendarClock,
  CalendarHeart,
  CalendarX2,
  GitPullRequestClosed,
  Hourglass,
  PlaneTakeoff,
} from "lucide-react";
import type { PocWithRelations } from "@shared/schema";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { DashboardProjectCard } from "@/components/dashboard/DashboardProjectCard";
import { getCustomerStatusConfig, getStatusConfig } from "@/components/dashboard/main-dashboard-utils";
import { calculateDaysDiff } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

export type ProjectGroupedViewMode = "due" | "review";

interface ConfigLike {
  name: string;
  color?: string | null;
  icon?: string | null;
}

interface ProjectGroupedViewsProps {
  mode: ProjectGroupedViewMode;
  projects: PocWithRelations[];
  userTimezone: string;
  statusConfigs: ConfigLike[];
  customerStatusConfigs: ConfigLike[];
  products: Array<{ name: string; solutionIcon?: string | null }>;
  rankingConfigs: ConfigLike[];
  riskLevelConfigs: ConfigLike[];
  onViewProject: (id: number) => void;
  onViewPlan: (id: number) => void;
}

interface GroupSection {
  key: string;
  label: string;
  projects: PocWithRelations[];
  icon: ElementType;
  iconClass: string;
}

const CLOSED_STATUSES = ["closed won", "closed lost", "cancelled"];

export function groupByDueDate(
  projects: PocWithRelations[],
  userTimezone: string,
): { today: PocWithRelations[]; thisWeek: PocWithRelations[]; overdue: PocWithRelations[] } {
  const today: PocWithRelations[] = [];
  const thisWeek: PocWithRelations[] = [];
  const overdue: PocWithRelations[] = [];
  for (const p of projects) {
    if (!p.endDate) continue;
    const diff = calculateDaysDiff(p.endDate, userTimezone);
    if (diff === null) continue;
    const statusLower = (p.status ?? "").toLowerCase();
    if (diff === 0) today.push(p);
    else if (diff > 0 && diff <= 7) thisWeek.push(p);
    else if (diff < 0 && !CLOSED_STATUSES.some((s) => statusLower.includes(s))) overdue.push(p);
  }
  return { today, thisWeek, overdue };
}

export function groupByReviewStatus(projects: PocWithRelations[]): {
  planning: PocWithRelations[];
  tcc: PocWithRelations[];
  completed: PocWithRelations[];
  onHold: PocWithRelations[];
} {
  const planning: PocWithRelations[] = [];
  const tcc: PocWithRelations[] = [];
  const completed: PocWithRelations[] = [];
  const onHold: PocWithRelations[] = [];
  for (const p of projects) {
    const s = (p.status ?? "").toLowerCase();
    if (s === "planning") planning.push(p);
    else if (s === "tcc") tcc.push(p);
    else if (s === "completed" || s === "complete") completed.push(p);
    else if (s === "on hold") onHold.push(p);
  }
  return { planning, tcc, completed, onHold };
}

export function ProjectGroupedViews({
  mode,
  projects,
  userTimezone,
  statusConfigs,
  customerStatusConfigs,
  products,
  rankingConfigs,
  riskLevelConfigs,
  onViewProject,
  onViewPlan,
}: ProjectGroupedViewsProps) {
  const { t } = useTranslation();

  let sections: GroupSection[];
  if (mode === "due") {
    const dueGroups = groupByDueDate(projects, userTimezone);
    sections = [
      { key: "due-today", label: t("dashboard.table.groupDueToday"), projects: dueGroups.today, icon: CalendarHeart, iconClass: "text-green-600" },
      { key: "due-week", label: t("dashboard.table.groupDueWeek"), projects: dueGroups.thisWeek, icon: CalendarClock, iconClass: "text-orange-600" },
      { key: "due-overdue", label: t("dashboard.table.groupOverdue"), projects: dueGroups.overdue, icon: CalendarX2, iconClass: "text-red-600" },
    ];
  } else {
    const reviewGroups = groupByReviewStatus(projects);
    sections = [
      { key: "review-planning", label: t("dashboard.table.groupPlanning"), projects: reviewGroups.planning, icon: GitPullRequestClosed, iconClass: "text-blue-600" },
      { key: "review-tcc", label: t("dashboard.table.groupTCC"), projects: reviewGroups.tcc, icon: PlaneTakeoff, iconClass: "text-emerald-600" },
      { key: "review-completed", label: t("dashboard.table.groupCompleted"), projects: reviewGroups.completed, icon: CalendarCheck, iconClass: "text-orange-600" },
      { key: "review-onhold", label: t("dashboard.table.groupOnHold"), projects: reviewGroups.onHold, icon: Hourglass, iconClass: "text-yellow-600" },
    ];
  }

  return (
    <div className="py-2">
      <Accordion
        key={mode}
        type="multiple"
        defaultValue={sections.filter((s) => s.projects.length > 0).map((s) => s.key)}
        className="space-y-3"
      >
        {sections.map(({ key, label, projects: groupProjects, icon: Icon, iconClass }) => (
          <AccordionItem key={key} value={key} className="border rounded-xl overflow-hidden bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50 [&[data-state=open]]:bg-gray-50 dark:[&[data-state=open]]:bg-gray-800/50">
              <div className="flex items-center gap-2">
                <Icon className={cn("h-4 w-4", iconClass)} />
                <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm">{label}</span>
                <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-bold px-2 py-0.5 rounded-full">
                  {groupProjects.length}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 pt-1">
              {groupProjects.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 py-2">{t("dashboard.table.noProjectsInGroup")}</p>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,400px),1fr))] gap-5">
                  {groupProjects.map((project) => {
                    const sConfig = getStatusConfig(statusConfigs, project.status ?? "");
                    const csConfig = getCustomerStatusConfig(customerStatusConfigs, project.customerStatus || "Not Set");
                    const csName = "name" in csConfig ? (csConfig as { name: string }).name : (project.customerStatus ?? "");
                    return (
                      <DashboardProjectCard
                        key={project.id}
                        project={project}
                        statusConfig={sConfig ? { name: sConfig.name, color: sConfig.color ?? "#64748B", icon: sConfig.icon } : undefined}
                        customerStatusConfig={{ name: csName, color: csConfig.color ?? "#6b7280", icon: csConfig.icon }}
                        products={products}
                        rankingConfigs={rankingConfigs.map((c) => ({ name: c.name, color: c.color ?? "#6b7280", icon: c.icon }))}
                        riskLevelConfigs={riskLevelConfigs.map((c) => ({ name: c.name, color: c.color ?? "#6b7280", icon: c.icon }))}
                        onViewProject={onViewProject}
                        onViewPlan={onViewPlan}
                      />
                    );
                  })}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
