import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen, Settings, UserCog } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from 'react-i18next';
import { getTimezoneLabel } from "@/lib/timezones";

import logoLight from "@/assets/criteriaiq-logo-light.png";
import logoDark from "@/assets/criteriaiq-logo-dark.png";
import logoMarkLight from "@/assets/criteriaiq-logo-mark-light.png";
import logoMarkDark from "@/assets/criteriaiq-logo-mark-dark.png";
import { SecurityShieldButton } from "@/components/security/SecurityShieldButton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/hooks/useAuth";
import { ProfileEditor } from "@/components/accounts/profile-editor";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SidebarVersionLink } from "./SidebarVersionLink";

export { navigation } from "./sidebar-navigation";
import { CollapsedSidebarButtons, SidebarLogoutButton, SidebarSettingsButton } from "./sidebar-components";
import { SidebarConnections } from "./sidebar-connections";
import { SidebarDemoIndicator } from "./SidebarDemoIndicator";
import { isProfileEditorTab, type ProfileEditorTab } from "@/components/accounts/profile-editor-types";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { SIDEBAR_NAV, activeChildId, filterSidebarNav, isGroupActive, isItemActive } from "./sidebar-nav-config";
import type { SidebarNavGroup } from "./sidebar-nav-config";
import type { SidebarProps, UserProfile } from "./sidebar-types";
import { useCrmProvider } from "@/hooks/use-crm-provider";
import { useValidationRecordLabel } from "@/hooks/use-validation-record-label";
import { CustomerWorkspaceNav } from "@/components/customer-workspace/CustomerWorkspaceNav";

export function Sidebar({ user }: SidebarProps) {
  const [pathname, setLocation] = useLocation();
  const [search, setSearch] = useState(window.location.search);

  useEffect(() => {
    const onPopState = () => {
      setSearch(window.location.search);
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  // Update search parameter when pathname changes
  useEffect(() => {
    setSearch(window.location.search);
  }, [pathname]);

  // Fetch user's sidebar preference
  const { data: userProfile } = useQuery<UserProfile>({
    queryKey: ["/api/users/me"],
    staleTime: 60000,
  });

  const [isCollapsed, setIsCollapsed] = useState(userProfile?.sidebarCollapsed || false);
  const [isProfileEditorOpen, setIsProfileEditorOpen] = useState(false);
  const [profileEditorTab, setProfileEditorTab] = useState<ProfileEditorTab>("profile");
  const openProfileEditor = (tab: ProfileEditorTab = "profile") => {
    setProfileEditorTab(tab);
    setIsProfileEditorOpen(true);
  };
  const [isAvatarHovered, setIsAvatarHovered] = useState(false);

  // Update sidebar state when user profile loads
  useEffect(() => {
    if (userProfile?.sidebarCollapsed !== undefined) {
      setIsCollapsed(userProfile.sidebarCollapsed);
    }
  }, [userProfile?.sidebarCollapsed]);

  // Which collapsible items the user has opened. An item that contains the
  // active page is always shown open regardless of this map.
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});
  
  const { canView } = usePermissions();
  const { t } = useTranslation();

  // ?profile=<tab> opens My Settings on that tab: the Salesforce and Outlook
  // sign-ins come back here (with ?sf= / ?sf_error= or ?outlook=), and old /profile
  // links redirect here. The error text in the URL is never shown, so a
  // crafted link can't put its own words in a toast.
  const handledProfileLink = useRef<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(search);
    const tab = params.get("profile");
    if (!isProfileEditorTab(tab) || handledProfileLink.current === search) return;
    handledProfileLink.current = search;
    openProfileEditor(tab);
    if (params.get("sf") === "connected") {
      showSuccessToast(t("profile.integrations.connectedToastTitle"), t("profile.integrations.connectedToastDescription"));
    } else if (params.has("sf_error")) {
      showErrorToast(t("profile.integrations.errorTitle"), t("profile.integrations.connectFailed"));
    }
    const outlook = params.get("outlook");
    if (outlook === "connected") {
      showSuccessToast(t("profile.integrations.outlookConnectedToastTitle"), t("profile.integrations.outlookConnectedToastDescription"));
    } else if (outlook === "expired") {
      showErrorToast(t("profile.integrations.errorTitle"), t("profile.integrations.outlookConnectExpired"));
    } else if (outlook === "unavailable") {
      showErrorToast(t("profile.integrations.errorTitle"), t("profile.integrations.outlookTurnedOff"));
    } else if (outlook !== null) {
      showErrorToast(t("profile.integrations.errorTitle"), t("profile.integrations.outlookConnectFailed"));
    }
    params.delete("profile");
    params.delete("sf");
    params.delete("sf_error");
    params.delete("outlook");
    const rest = params.toString();
    window.history.replaceState(window.history.state, "", `${pathname}${rest ? `?${rest}` : ""}`);
    setSearch(rest ? `?${rest}` : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, pathname]);


  const { data: versionData, isLoading: isVersionLoading, isError: isVersionError } = useQuery<{ version: string; buildDate: string; gitCommit: string; environment: string }>({ queryKey: ["/api/version"], staleTime: 0 });

  // Menu definition lives in sidebar-nav-config.ts; filter it by the viewer's
  // permissions. Active state is derived from the current URL.
  const { provider: activeCrm } = useCrmProvider();
  // Fills {{record}} in menu labels such as "{{record}} Requests".
  useValidationRecordLabel();
  const navGroups = filterSidebarNav(SIDEBAR_NAV, canView, user?.role === "Admin", activeCrm, !!user?.demoLogin);

  const isExternalUser = ["customer", "partner", "guest"].includes((user?.role ?? "").toLowerCase());

  const navigateTo = (href: string) => {
    // Use window.history.pushState for proper URL updates including query params
    window.history.pushState({}, '', href);
    // Dispatch popstate to notify React components of the URL change
    window.dispatchEvent(new PopStateEvent('popstate'));
    // Also update wouter's location for consistency
    setLocation(href);
    const searchString = href.includes('?') ? '?' + href.split('?')[1] : '';
    setSearch(searchString);
  };

  // Anchor click handler: let the browser handle modifier / middle clicks
  // (open in new tab), otherwise navigate in-app.
  const onNavClick = (href: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigateTo(href);
  };

  return (
    <nav className={cn("brand-sidebar border-r flex flex-col h-full transition-all duration-300 print:hidden", isCollapsed ? "w-16" : "w-[240px]")}>
      {/* CriteriaIQ logo, the same height as the header bar. Collapsed it
          shows the logo mark only. The admin-chosen graphic (Configuration →
          Media) sits at the right end of the header instead. */}
      <div className={cn("relative h-[70px] shrink-0 flex", isCollapsed ? "justify-center items-end pb-2 px-2" : "items-center px-4")}>
        <button onClick={() => setIsCollapsed(!isCollapsed)} className="absolute z-20 top-0 right-0 p-1 rounded-md brand-sidebar-link transition-colors" title={isCollapsed ? t("layout.sidebar.expand") : t("layout.sidebar.collapse")}>
          {isCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
        {isCollapsed ? (
          <>
            <img src={logoMarkLight} alt={t("layout.sidebar.brandAlt")} data-variant="dark_text" className="criteriaiq-logo w-10 h-10 object-contain" />
            <img src={logoMarkDark} alt={t("layout.sidebar.brandAlt")} data-variant="light_text" className="criteriaiq-logo w-10 h-10 object-contain" />
          </>
        ) : (
          // Version link sits under the logo's bottom-right corner, as in ImpactIQ.
          // The logo image has ~10px of empty space below the wordmark at this
          // width, so the version is pulled up into it.
          <div className="flex flex-col items-end">
            <img src={logoLight} alt={t("layout.sidebar.brandFullAlt")} data-variant="dark_text" className="criteriaiq-logo w-[190px] h-auto object-contain" />
            <img src={logoDark} alt={t("layout.sidebar.brandFullAlt")} data-variant="light_text" className="criteriaiq-logo w-[190px] h-auto object-contain" />
            <div className="-mt-[9px]">
              <SidebarVersionLink
                version={versionData?.version}
                isLoading={isVersionLoading}
                isError={isVersionError}
                onOpenIntroduction={() => navigateTo("/about?tab=introduction")}
              />
            </div>
          </div>
        )}
      </div>
      <div className={cn("@container/nav flex-1 min-h-0 overflow-y-auto pt-1 pb-2 sidebar-scroll", isCollapsed ? "px-2" : "pl-2 [scrollbar-gutter:stable]")}>
        <nav className={cn(isCollapsed ? "space-y-2" : "space-y-3")} aria-label={t("layout.sidebar.navLabel", "Main navigation")}>
          {/* Customer, Partner and Guest get the customer workspace menu first. */}
          {isExternalUser && (
            <CustomerWorkspaceNav isCollapsed={isCollapsed} pathname={pathname} search={search} onNavClick={onNavClick} />
          )}
          {navGroups.map((group, groupIndex) => group.secondTier ? (
            <div key={group.id} className="space-y-1">
              {isCollapsed && groupIndex > 0 && <div className="mx-2 border-t brand-sidebar-divider" aria-hidden="true" />}
              <SecondTierEntry
                group={group}
                isCollapsed={isCollapsed}
                active={isGroupActive(group, pathname, search)}
                onNavigate={navigateTo}
              />
            </div>
          ) : (
            <div key={group.id} className="space-y-1">
              {isCollapsed ? (
                groupIndex > 0 && <div className="mx-2 border-t brand-sidebar-divider" aria-hidden="true" />
              ) : (
                <div className="px-3 pb-0.5 text-[8px] font-semibold uppercase tracking-wider brand-sidebar-heading">
                  {t(group.labelKey)}
                </div>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isItemActive(item, pathname, search);
                const hasChildren = !!item.children && item.children.length > 0;
                // Where a click on the item itself goes: its first visible child
                // (for grouped items) or its own page.
                const target = hasChildren ? item.children![0].href : item.href;
                const label = t(item.labelKey);

                if (isCollapsed) {
                  return (
                    <a
                      key={item.id}
                      href={target}
                      onClick={onNavClick(target)}
                      title={label}
                      className={cn(
                        "flex items-center w-full rounded-lg transition-colors",
                        "justify-center p-3 @[120px]/nav:justify-start @[120px]/nav:gap-3 @[120px]/nav:px-3 @[120px]/nav:py-2",
                        active ? "bg-primary text-primary-foreground" : "brand-sidebar-link"
                      )}
                    >
                      <Icon size={18} strokeWidth={1.5} stroke="currentColor" fill="none" />
                      <span className="hidden @[120px]/nav:inline text-sm font-medium truncate">{label}</span>
                    </a>
                  );
                }

                const itemClass = cn(
                  "flex items-center justify-between w-full gap-1 pl-3 pr-2 py-2 text-sm font-medium rounded-lg transition-colors",
                  active ? "bg-primary text-primary-foreground" : "brand-sidebar-link"
                );

                if (!hasChildren) {
                  return (
                    <a key={item.id} href={item.href} onClick={onNavClick(item.href)} className={itemClass} aria-current={active ? "page" : undefined}>
                      <div className="flex items-center gap-3 min-w-0">
                        <Icon size={18} strokeWidth={1.5} stroke="currentColor" fill="none" className="shrink-0" />
                        <span className="hidden @[80px]/nav:inline truncate" title={label}>{label}</span>
                      </div>
                      <div className="w-4 h-4 shrink-0"></div>
                    </a>
                  );
                }

                const isOpen = (openItems[item.id] ?? false) || active;
                const activeChild = activeChildId(item, pathname, search);
                return (
                  <Collapsible key={item.id} open={isOpen} onOpenChange={(open) => setOpenItems((prev) => ({ ...prev, [item.id]: open }))}>
                    <CollapsibleTrigger className={itemClass}>
                      <div className="flex items-center gap-3 min-w-0">
                        <Icon size={18} strokeWidth={1.5} stroke="currentColor" fill="none" className="shrink-0" />
                        <span className="hidden @[80px]/nav:inline truncate" title={label}>{label}</span>
                      </div>
                      {isOpen ? <ChevronDown className="w-4 h-4 shrink-0 hidden @[80px]/nav:block" /> : <ChevronRight className="w-4 h-4 shrink-0 hidden @[80px]/nav:block" />}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="ml-4 mt-1 space-y-1">
                        {item.children!.map((child) => {
                          const ChildIcon = child.icon;
                          const childActive = activeChild === child.id;
                          return (
                            <a
                              key={child.id}
                              href={child.href}
                              onClick={onNavClick(child.href)}
                              aria-current={childActive ? "page" : undefined}
                              className={cn(
                                "flex items-center gap-2 px-3 py-2 text-xs rounded-md transition-colors w-full text-left",
                                childActive ? "submenu-active" : "brand-sidebar-link"
                              )}
                            >
                              <ChildIcon size={14} strokeWidth={1.5} />
                              <span>{t(child.labelKey)}</span>
                            </a>
                          );
                        })}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          ))}
        </nav>
      </div>
      {/* Demo Mode indicator: anchored to the footer divider, below the nav. */}
      <SidebarDemoIndicator collapsed={isCollapsed} />
      {/* Footer: one divider above the connection rows, buttons and user, as in ImpactIQ. */}
      <div className={cn("shrink-0 border-t brand-sidebar-divider", isCollapsed ? "p-2 pb-8" : "pl-2 pr-1 pt-3 pb-2")}>
        {!isCollapsed && (
          <div className="flex items-center gap-1 pl-1.5">
            <SidebarConnections collapsed={false} onOpenIntegrations={() => openProfileEditor("integrations")} />
            <SidebarSettingsButton onClick={() => openProfileEditor()} />
            <SidebarLogoutButton />
          </div>
        )}
        {isCollapsed && (
          <CollapsedSidebarButtons
            onOpenSettings={() => openProfileEditor()}
            connections={<SidebarConnections collapsed onOpenIntegrations={() => openProfileEditor("integrations")} />}
          />
        )}
        <div className={cn(isCollapsed ? "pb-3" : "pt-2")}>
          <div className={cn("flex items-center relative rounded-lg", isCollapsed ? "justify-center p-2" : "space-x-3 pr-6 p-2")}>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button 
                    className="w-10 h-10 min-w-10 rounded-full flex items-center justify-center text-white font-medium shrink-0 transition-all cursor-pointer hover:opacity-90"
                    style={{ backgroundColor: user?.role === 'Admin' ? '#ef4444' : "#6b7280" }}
                    onClick={() => openProfileEditor()}
                    onMouseEnter={() => setIsAvatarHovered(true)}
                    onMouseLeave={() => setIsAvatarHovered(false)}
                    aria-label={t("layout.sidebar.editProfile")}
                  >
                    {isAvatarHovered && !isCollapsed ? (
                      <UserCog className="w-5 h-5" />
                    ) : (
                      <span className="text-xs">
                        {(user?.firstName?.[0] || "").toUpperCase()}{(user?.lastName?.[0] || "").toUpperCase() || (user?.email?.[0] || "U").toUpperCase()}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="font-medium">{t("layout.sidebar.clickAvatarToEdit")}</p>
                  {user?.lastLogin && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {t("layout.sidebar.lastLogin")} {new Date(user.lastLogin).toLocaleDateString()} {new Date(user.lastLogin).toLocaleTimeString()}
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {!isCollapsed && (
              <div className="flex-1 flex flex-col min-w-0">
                <div>
                  <p className="text-sm font-medium brand-sidebar-strong line-clamp-2 break-words pr-2">{user?.firstName || user?.lastName ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : user?.email || t("layout.sidebar.defaultUser")}</p>
                  <p className="text-xs brand-sidebar-muted">{user?.role || t("layout.sidebar.defaultRole")}</p>
                  <p className="text-xs brand-sidebar-muted">{user?.timezone ? getTimezoneLabel(user.timezone) : getTimezoneLabel("America/New_York")}</p>
                  <p className="text-xs brand-sidebar-muted">{user?.email}</p>
                </div>
                <div className="flex justify-end">
                  <SecurityShieldButton />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ProfileEditor 
        isOpen={isProfileEditorOpen}
        onClose={() => setIsProfileEditorOpen(false)}
        initialTab={profileEditorTab}
      />
    </nav>
  );
}

/**
 * Sidebar entry for a `secondTier` group (Admin): one item with the group's
 * name. From outside the group it opens the group's first page, which shows
 * the second-tier menu; on a page of the group the menu is already open, so a
 * click does nothing.
 */
function SecondTierEntry({ group, isCollapsed, active, onNavigate }: {
  group: SidebarNavGroup;
  isCollapsed: boolean;
  active: boolean;
  onNavigate: (href: string) => void;
}) {
  const { t } = useTranslation();
  const first = group.items[0];
  const target = first?.children?.[0]?.href ?? first?.href ?? "/";
  const label = t(group.labelKey);

  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (!active) onNavigate(target);
  };

  return (
    <a
      href={target}
      onClick={onClick}
      title={isCollapsed ? label : undefined}
      aria-expanded={active}
      data-testid={`sidebar-second-tier-${group.id}`}
      className={cn(
        "flex items-center w-full rounded-lg transition-colors text-sm font-medium",
        isCollapsed ? "justify-center p-3" : "justify-between gap-1 pl-3 pr-2 py-2",
        active ? "bg-primary text-primary-foreground" : "brand-sidebar-link"
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <Settings size={18} strokeWidth={1.5} stroke="currentColor" fill="none" className="shrink-0" />
        {!isCollapsed && <span className="truncate">{label}</span>}
      </div>
    </a>
  );
}
