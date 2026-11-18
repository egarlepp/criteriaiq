import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SIDEBAR_NAV, activeChildId, filterSidebarNav, isGroupActive, isItemActive } from "./sidebar-nav-config";
import { preloadPages } from "@/lib/page-preloads";
import { useCrmProvider } from "@/hooks/use-crm-provider";

/**
 * Full-height second-tier menu shown under the header, between the sidebar and
 * the page, on every page of a `secondTier` sidebar group (Admin). Each item of
 * the group is a collapsible section listing its sub-items; the section holding
 * the current page is always open.
 */
export function SecondTierNav() {
  const [pathname, setLocation] = useLocation();
  const search = useSearch();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { canView } = usePermissions();
  const { provider: activeCrm } = useCrmProvider();
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});

  const role = user?.role;
  const query = search ? `?${search}` : "";
  const group = filterSidebarNav(SIDEBAR_NAV, canView, role === "Admin", activeCrm, !!user?.demoLogin)
    .find((g) => g.secondTier && isGroupActive(g, pathname, query));

  // The group's sections live on several URLs; load their code once this page
  // is idle so moving between them only swaps the page area.
  const otherPaths = [...new Set((group?.items ?? []).flatMap((item) =>
    [item.href, ...(item.children ?? []).map((c) => c.href)].map((href) => href.split("?")[0])))]
    .filter((path) => path !== pathname)
    .join(",");
  useEffect(() => {
    if (!otherPaths) return;
    const id = window.setTimeout(() => preloadPages(otherPaths.split(",")), 300);
    return () => window.clearTimeout(id);
  }, [otherPaths]);

  if (!group) return null;

  const onNavClick = (href: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    window.history.pushState({}, "", href);
    window.dispatchEvent(new PopStateEvent("popstate"));
    setLocation(href);
  };

  return (
    <nav
      aria-label={t(group.labelKey)}
      data-testid="second-tier-nav"
      className="brand-admin-menu print:hidden w-[240px] shrink-0 overflow-y-auto sidebar-scroll border-r px-3 py-4 space-y-1"
    >
      {group.items.map((item) => {
        const label = t(item.labelKey);
        const active = isItemActive(item, pathname, query);
        const sectionClass = "flex items-center justify-between w-full gap-2 px-2 py-2 text-sm font-semibold rounded-md transition-colors";
        const sectionColor = "brand-admin-menu-heading";

        if (!item.children?.length) {
          return (
            <a key={item.id} href={item.href} onClick={onNavClick(item.href)} aria-current={active ? "page" : undefined}
              className={cn(sectionClass, active ? "submenu-active" : sectionColor)}>
              <span className="truncate">{label}</span>
            </a>
          );
        }

        const isOpen = (openItems[item.id] ?? false) || active;
        const activeChild = activeChildId(item, pathname, query);
        return (
          <Collapsible key={item.id} open={isOpen} onOpenChange={(open) => setOpenItems((prev) => ({ ...prev, [item.id]: open }))}>
            <CollapsibleTrigger className={cn(sectionClass, sectionColor)} data-testid={`second-tier-section-${item.id}`}>
              <span className="truncate">{label}</span>
              {isOpen ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="ml-2 mt-1 mb-2 space-y-0.5">
                {item.children.map((child) => {
                  const ChildIcon = child.icon;
                  const childActive = activeChild === child.id;
                  return (
                    <a
                      key={child.id}
                      href={child.href}
                      onClick={onNavClick(child.href)}
                      aria-current={childActive ? "page" : undefined}
                      data-testid={`second-tier-link-${child.id}`}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors w-full text-left",
                        childActive ? "submenu-active" : "brand-admin-menu-link"
                      )}
                    >
                      <ChildIcon size={16} strokeWidth={1.5} className="shrink-0" />
                      <span className="truncate">{t(child.labelKey)}</span>
                    </a>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </nav>
  );
}
