import { useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageTabNav } from "@/components/ui/page-tab-nav";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { preloadPages } from "@/lib/page-preloads";
import { SIDEBAR_NAV, activeChildId, activeSection, activeViewId, filterSidebarNav } from "./sidebar-nav-config";
import { useCrmProvider } from "@/hooks/use-crm-provider";

/**
 * Cancelable window event fired before the tab bar navigates. A page that must
 * guard a tab switch (e.g. Analytics with an unsaved builder) calls
 * `preventDefault()` and handles the switch itself. `detail.href` is the target.
 */
export const SECTION_TAB_NAVIGATE_EVENT = "section-tab-navigate";

/**
 * Top tab bar for pages that belong to a sidebar entry with sub-items. The tabs
 * are that entry's children from sidebar-nav-config.ts, filtered by the same
 * permissions as the sidebar, so the tab bar always matches the sidebar.
 * Renders nothing on pages that are a single sidebar entry.
 *
 * Admin pages list their section's pages in the second-tier menu instead, so
 * there the tabs are the current page's `views` (System Settings, Workflow
 * Automation, …), and pages without views get no tab bar.
 */
export function SectionTabBar() {
  const [pathname, setLocation] = useLocation();
  const search = useSearch();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { canView } = usePermissions();
  const { provider: activeCrm } = useCrmProvider();

  const role = user?.role;
  const groups = filterSidebarNav(SIDEBAR_NAV, canView, role === "Admin", activeCrm);
  const query = search ? `?${search}` : "";
  const section = activeSection(groups, pathname, query);
  const inSecondTier = !!section && groups.some((g) => g.secondTier && g.items.includes(section));
  const page = inSecondTier ? section.children?.find((c) => c.id === activeChildId(section, pathname, query)) : undefined;
  const tabs = (inSecondTier ? page?.views : section?.children) ?? [];

  // Tabs on another URL (Account Portal) get their code preloaded.
  const otherPaths = [...new Set(tabs.map((c) => c.href.split("?")[0]))]
    .filter((path) => path !== pathname)
    .join(",");
  useEffect(() => {
    if (!otherPaths) return;
    const id = window.setTimeout(() => preloadPages(otherPaths.split(",")), 300);
    return () => window.clearTimeout(id);
  }, [otherPaths]);

  if (!tabs.length) return null;

  const activeId = page ? activeViewId(page, pathname, query) : activeChildId(section!, pathname, query);

  const navigateTo = (id: string) => {
    const child = tabs.find((c) => c.id === id);
    if (!child || id === activeId) return;
    const event = new CustomEvent(SECTION_TAB_NAVIGATE_EVENT, { detail: { href: child.href }, cancelable: true });
    if (!window.dispatchEvent(event)) return;
    // Same navigation as the sidebar: pages listen to popstate for tab changes.
    window.history.pushState({}, "", child.href);
    window.dispatchEvent(new PopStateEvent("popstate"));
    setLocation(child.href);
  };

  return (
    <Tabs value={activeId} onValueChange={navigateTo} activationMode="manual">
      {/* The tab bar extends the header bar, so the gap below it matches the
          16px gap pages without a tab bar get below the header. */}
      <PageTabNav className="mb-4 print:hidden">
        <TabsList className="flex flex-wrap gap-0 tabs-list bg-transparent rounded-none" data-testid="section-tab-bar">
          {tabs.map((child) => {
            const Icon = child.icon;
            return (
              <TabsTrigger key={child.id} value={child.id} className="flex items-center gap-2" data-testid={`section-tab-${child.id}`}>
                <Icon className="h-4 w-4" />
                {t(child.labelKey)}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </PageTabNav>
    </Tabs>
  );
}
