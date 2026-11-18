import { useMemo, type MouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BookOpen, Home, ListTodo, MonitorCloud, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CustomerActionRow } from "@/lib/customer-actions";
import { CUSTOMER_ACTIONS_MAX_PROJECTS } from "@shared/customer-actions";
import { isClosedProjectStatus, WORKSPACE_TODOS_ANCHOR } from "./workspace-utils";

interface NavProject {
  id: number;
  name?: string | null;
  customerName?: string | null;
  status?: string | null;
}

interface CustomerWorkspaceNavProps {
  isCollapsed: boolean;
  pathname: string;
  search: string;
  onNavClick: (href: string) => (event: MouseEvent<HTMLAnchorElement>) => void;
}

const MAX_LISTED_PROJECTS = 8;

/**
 * Sidebar menu for Customer, Partner and Guest users (customer workspace
 * layout): Home, their to-dos, their projects, and the portal's Resources and
 * Lab environments tabs. Replaces the staff menu, which these roles mostly
 * cannot see.
 */
export function CustomerWorkspaceNav({ isCollapsed, pathname, search, onNavClick }: CustomerWorkspaceNavProps) {
  const { t } = useTranslation();
  const { data: projects = [] } = useQuery<NavProject[]>({ queryKey: ["/api/projects"], staleTime: 60_000 });

  const projectIds = useMemo(
    () =>
      projects
        .map((project) => project.id)
        .sort((a, b) => a - b)
        .slice(0, CUSTOMER_ACTIONS_MAX_PROJECTS),
    [projects],
  );
  const { data: actions = [] } = useQuery<CustomerActionRow[]>({
    queryKey: ["/api/customer-actions", projectIds.join(",")],
    queryFn: async () => {
      const response = await fetch(`/api/customer-actions?projectIds=${projectIds.join(",")}`);
      if (!response.ok) throw new Error("Failed to fetch customer actions");
      return response.json();
    },
    enabled: projectIds.length > 0,
    staleTime: 60_000,
  });

  const openByProject = useMemo(() => {
    const counts = new Map<number, { open: number; overdue: number }>();
    for (const action of actions) {
      const entry = counts.get(action.projectId) ?? { open: 0, overdue: 0 };
      entry.open += 1;
      if (action.daysOverdue > 0) entry.overdue += 1;
      counts.set(action.projectId, entry);
    }
    return counts;
  }, [actions]);

  const liveProjects = projects.filter((project) => !isClosedProjectStatus(project.status)).slice(0, MAX_LISTED_PROJECTS);
  const tab = new URLSearchParams(search).get("tab");
  const onPortal = pathname === "/account";

  const links: Array<{ id: string; href: string; icon: LucideIcon; label: string; active: boolean; count?: number }> = [
    { id: "home", href: "/account", icon: Home, label: t("workspace.nav.home"), active: onPortal && (!tab || tab === "overview") },
    {
      id: "todos",
      href: `/account#${WORKSPACE_TODOS_ANCHOR}`,
      icon: ListTodo,
      label: t("workspace.nav.todos"),
      active: false,
      count: actions.length,
    },
  ];
  const moreLinks = [
    { id: "resources", href: "/account?tab=resources", icon: BookOpen, label: t("workspace.nav.resources"), active: onPortal && tab === "resources" },
    { id: "labs", href: "/account?tab=cloudlabs", icon: MonitorCloud, label: t("workspace.nav.labs"), active: onPortal && tab === "cloudlabs" },
  ];

  const renderLink = (link: (typeof links)[number]) => {
    const Icon = link.icon;
    return (
      <a
        key={link.id}
        href={link.href}
        onClick={onNavClick(link.href)}
        title={isCollapsed ? link.label : undefined}
        aria-current={link.active ? "page" : undefined}
        className={cn(
          "flex w-full items-center rounded-lg text-sm font-medium transition-colors",
          isCollapsed ? "justify-center p-3" : "gap-3 py-2 pl-3 pr-2",
          link.active ? "bg-primary text-primary-foreground" : "brand-sidebar-link",
        )}
        data-testid={`workspace-nav-${link.id}`}
      >
        <Icon size={18} strokeWidth={1.5} className="shrink-0" />
        {isCollapsed ? <span className="sr-only">{link.label}</span> : <span className="min-w-0 flex-1 truncate">{link.label}</span>}
        {!isCollapsed && link.count ? (
          <span className="rounded-full bg-orange-700 px-2 text-[11px] font-bold text-white dark:bg-orange-600">{link.count}</span>
        ) : null}
      </a>
    );
  };

  const heading = (label: string) =>
    isCollapsed ? (
      <div className="mx-2 border-t brand-sidebar-divider" aria-hidden="true" />
    ) : (
      <div className="px-3 pb-0.5 text-[8px] font-semibold uppercase tracking-wider brand-sidebar-heading">{label}</div>
    );

  return (
    <div className={cn(isCollapsed ? "space-y-2" : "space-y-3")} data-testid="customer-workspace-nav">
      <div className="space-y-1">
        {heading(t("workspace.nav.workspace"))}
        {links.map(renderLink)}
      </div>
      {liveProjects.length > 0 ? (
        <div className="space-y-1">
          {heading(t("workspace.nav.projects"))}
          {liveProjects.map((project) => {
            const href = `/project/${project.id}`;
            const active = pathname === href;
            const counts = openByProject.get(project.id);
            const label = project.name || project.customerName || t("projectView.hero.untitled", { id: project.id });
            const dotClass = counts?.overdue
              ? "bg-red-700 dark:bg-red-500"
              : counts?.open
                ? "bg-orange-700 dark:bg-orange-500"
                : "bg-green-700 dark:bg-green-500";
            const dotLabel = counts?.overdue
              ? t("workspace.nav.projectOverdue")
              : counts?.open
                ? t("workspace.nav.projectWaiting")
                : t("workspace.nav.projectOnTrack");
            return (
              <a
                key={project.id}
                href={href}
                onClick={onNavClick(href)}
                title={isCollapsed ? label : undefined}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex w-full items-center rounded-lg text-sm font-medium transition-colors",
                  isCollapsed ? "justify-center p-3" : "gap-3 py-2 pl-3 pr-2",
                  active ? "bg-primary text-primary-foreground" : "brand-sidebar-link",
                )}
              >
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", dotClass)} role="img" aria-label={dotLabel} />
                {isCollapsed ? <span className="sr-only">{label}</span> : <span className="min-w-0 flex-1 truncate" title={label}>{label}</span>}
              </a>
            );
          })}
        </div>
      ) : null}
      <div className="space-y-1">
        {heading(t("workspace.nav.more"))}
        {moreLinks.map(renderLink)}
      </div>
    </div>
  );
}
