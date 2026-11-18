import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { UserCog, UserLock, UserCheck, Check, ChevronDown, ChevronRight, Users, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePersona } from "@/contexts/PersonaContext";
import { useQuery } from "@tanstack/react-query";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { showErrorToast } from "@/lib/toast-helper";

interface UserRecord {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: string;
}

interface RoleOption {
  name: string;
  displayName: string;
  icon?: string | null;
  color?: string | null;
  external: boolean;
}

type SwitchAction = ReturnType<typeof usePersona>["exitPersona"];

interface ViewAsOptions {
  roles: RoleOption[];
  users: UserRecord[];
}

// View As: the server answers as the chosen person (server/auth/view-as.ts),
// so pages, data and permission checks match what they see. Admins only;
// the list comes from /api/view-as/options, which checks the Admin actually
// signed in, so it still works while viewing as someone else.
export function DevPersonaSwitcher() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isActive, effectiveRole, personaUserId, activatePersonaRole, activatePersonaUser, exitPersona } = usePersona();
  const [open, setOpen] = useState(false);
  const [internalOpen, setInternalOpen] = useState(true);
  const [externalOpen, setExternalOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [expandedRoleGroups, setExpandedRoleGroups] = useState<Record<string, boolean>>({});
  const [userSearch, setUserSearch] = useState("");

  const isRealAdmin = (user?.viewAs?.realUser.role ?? user?.role) === "Admin";

  const { data: options } = useQuery<ViewAsOptions>({
    queryKey: ["/api/view-as/options"],
    enabled: isRealAdmin && open,
    staleTime: 60000,
  });
  const allUsers = options?.users ?? [];
  const allRoles = options?.roles ?? [];
  const internalRoles = allRoles.filter((r) => !r.external);
  const externalRoles = allRoles.filter((r) => r.external);

  const roleMetaByName = useMemo(() => {
    const map = new Map<string, RoleOption>();
    allRoles.forEach((r) => map.set(r.name, r));
    return map;
  }, [allRoles]);

  const usersByRole = useMemo(() => {
    const groups: Record<string, UserRecord[]> = {};
    allUsers.forEach((u) => {
      const role = u.role || "User";
      if (!groups[role]) groups[role] = [];
      groups[role].push(u);
    });
    Object.values(groups).forEach((arr) =>
      arr.sort((a, b) => {
        const nameA = [a.firstName, a.lastName].filter(Boolean).join(" ") || a.email;
        const nameB = [b.firstName, b.lastName].filter(Boolean).join(" ") || b.email;
        return nameA.localeCompare(nameB);
      })
    );
    return groups;
  }, [allUsers]);

  const filteredUsersByRole = useMemo(() => {
    if (!userSearch.trim()) return usersByRole;
    const q = userSearch.toLowerCase();
    const result: Record<string, UserRecord[]> = {};
    Object.entries(usersByRole).forEach(([role, users]) => {
      const matched = users.filter((u) => {
        const name = [u.firstName, u.lastName].filter(Boolean).join(" ").toLowerCase();
        return name.includes(q) || u.email.toLowerCase().includes(q);
      });
      if (matched.length > 0) result[role] = matched;
    });
    return result;
  }, [usersByRole, userSearch]);

  const filteredTotal = useMemo(() =>
    Object.values(filteredUsersByRole).reduce((sum, arr) => sum + arr.length, 0),
    [filteredUsersByRole]
  );

  const filteredRoleKeys = useMemo(() =>
    Object.keys(filteredUsersByRole).sort(),
    [filteredUsersByRole]
  );

  if (!isRealAdmin) return null;

  const run = (action: SwitchAction) => {
    setOpen(false);
    action().catch(() => showErrorToast("devPersona.switchFailed", "devPersona.switchFailedDescription"));
  };

  const handleRoleSelect = (role: string) => run(() => activatePersonaRole(role));
  const handleUserSelect = (u: UserRecord) => run(() => activatePersonaUser(u.id));
  const handleExitPersona = () => run(exitPersona);

  const toggleUsersOpen = () => {
    if (usersOpen) {
      setUserSearch("");
      setExpandedRoleGroups({});
    }
    setUsersOpen(!usersOpen);
  };

  const toggleRoleGroup = (role: string) => {
    setExpandedRoleGroups((prev) => ({ ...prev, [role]: !prev[role] }));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="p-2 brand-topbar-icon-btn rounded-md transition-all duration-200 bg-transparent border-0 relative"
          title={t("devPersona.title")}
        >
          <UserCog className="h-5 w-5 stroke-current fill-none stroke-2" />
          {isActive && (
            <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-amber-500 border-2 brand-topbar-badge-ring animate-pulse" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-90 p-0 dark:bg-slate-900 dark:border-slate-700"
        align="end"
        sideOffset={8}
      >
        <div className="px-3 py-2 border-b dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <UserCog className="h-4 w-4 text-purple-500" />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 pr-3">{t("devPersona.title")}</span>
          </div>
          {isActive && (
            <button
              onClick={handleExitPersona}
              className="text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 font-medium"
            >
              {t("devPersona.exitMode")}
            </button>
          )}
        </div>
        <p className="px-3 py-2 border-b dark:border-slate-700 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
          {t("devPersona.readOnlyNote")}
        </p>
        <div className="max-h-[480px] overflow-y-auto">
          <div className="p-1">

            {/* Internal Roles */}
            <button
              className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-left rounded hover:bg-gray-100 dark:hover:bg-slate-800"
              onClick={() => setInternalOpen(!internalOpen)}
            >
              {internalOpen ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
              <UserLock className="h-3.5 w-3.5 text-blue-500" />
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("devPersona.internalRoles")}</span>
            </button>
            <p className="ml-7 mr-2 mb-1 text-[11px] leading-snug text-gray-500 dark:text-gray-400">{t("devPersona.rolesHint")}</p>
            {internalOpen && (
              <div className="ml-5 space-y-0.5">
                {internalRoles.map((meta) => {
                  const role = meta.name;
                  return (
                    <button
                      key={role}
                      className="flex items-center justify-between w-full px-2 py-1.5 text-sm rounded hover:bg-blue-50 dark:hover:bg-slate-800 text-left"
                      onClick={() => handleRoleSelect(role)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {meta?.icon ? (
                          <DynamicIcon name={meta.icon} className="h-3.5 w-3.5 shrink-0" style={{ color: meta.color || "#6b7280" }} />
                        ) : (
                          <span className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <span className="text-gray-700 dark:text-gray-300">{meta.displayName}</span>
                      </div>
                      {isActive && !personaUserId && effectiveRole === role && (
                        <Check className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* External Roles */}
            <button
              className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-left rounded hover:bg-gray-100 dark:hover:bg-slate-800 mt-1"
              onClick={() => setExternalOpen(!externalOpen)}
            >
              {externalOpen ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
              <Users className="h-3.5 w-3.5 text-green-500" />
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("devPersona.externalRoles")}</span>
            </button>
            {externalOpen && (
              <div className="ml-5 space-y-0.5">
                {externalRoles.map((meta) => {
                  const role = meta.name;
                  return (
                    <button
                      key={role}
                      className="flex items-center justify-between w-full px-2 py-1.5 text-sm rounded hover:bg-green-50 dark:hover:bg-slate-800 text-left"
                      onClick={() => handleRoleSelect(role)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {meta?.icon ? (
                          <DynamicIcon name={meta.icon} className="h-3.5 w-3.5 shrink-0" style={{ color: meta.color || "#6b7280" }} />
                        ) : (
                          <span className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <span className="text-gray-700 dark:text-gray-300">{meta.displayName}</span>
                      </div>
                      {isActive && !personaUserId && effectiveRole === role && (
                        <Check className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Specific Users */}
            <button
              className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-left rounded hover:bg-gray-100 dark:hover:bg-slate-800 mt-1"
              onClick={toggleUsersOpen}
            >
              {usersOpen ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
              <UserCheck className="h-3.5 w-3.5 text-purple-500" />
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("devPersona.specificUsers")}</span>
              {allUsers.length > 0 && (
                <span className="text-xs text-gray-400 ml-auto">
                  {userSearch.trim() && filteredTotal !== allUsers.length
                    ? `${filteredTotal}/${allUsers.length}`
                    : allUsers.length}
                </span>
              )}
            </button>

            {usersOpen && (
              <div className="mt-1">
                {/* Search input */}
                <div className="relative mx-1 mb-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder={t("devPersona.searchPlaceholder")}
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="w-full pl-7 pr-2 py-1.5 text-xs rounded border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-purple-400"
                  />
                </div>

                {/* Role group headers + users */}
                <div className="ml-1 space-y-0.5">
                  {filteredRoleKeys.map((roleKey) => {
                    const meta = roleMetaByName.get(roleKey);
                    const groupUsers = filteredUsersByRole[roleKey];
                    const isGroupExpanded = expandedRoleGroups[roleKey] ?? false;

                    return (
                      <div key={roleKey}>
                        <button
                          type="button"
                          className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-gray-100 dark:hover:bg-slate-800 text-left"
                          onClick={() => toggleRoleGroup(roleKey)}
                        >
                          {isGroupExpanded
                            ? <ChevronDown className="h-3 w-3 text-gray-400 shrink-0" />
                            : <ChevronRight className="h-3 w-3 text-gray-400 shrink-0" />}
                          {meta?.icon ? (
                            <DynamicIcon
                              name={meta.icon}
                              className="h-3.5 w-3.5 shrink-0"
                              style={{ color: meta.color || "#6b7280" }}
                            />
                          ) : (
                            <span className="h-3.5 w-3.5 shrink-0" />
                          )}
                          <span
                            className="font-semibold truncate"
                            style={{ color: meta?.color || "#6b7280" }}
                          >
                            {meta?.displayName ?? roleKey}
                          </span>
                          <span className="text-[10px] text-gray-400 ml-auto shrink-0">{groupUsers.length}</span>
                        </button>

                        {isGroupExpanded && (
                          <div className="ml-6 space-y-0.5">
                            {groupUsers.map((u) => {
                              const displayName = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
                              const isSelected = isActive && personaUserId === u.id;
                              return (
                                <button
                                  key={u.id}
                                  className="flex items-center justify-between w-full px-2 py-1.5 text-sm rounded hover:bg-purple-50 dark:hover:bg-slate-800 text-left"
                                  onClick={() => handleUserSelect(u)}
                                >
                                  <div className="flex flex-col min-w-0">
                                    <span className="text-gray-700 dark:text-gray-300 truncate text-xs">{displayName}</span>
                                    <span className="text-[10px] text-gray-400 truncate">{u.email}</span>
                                  </div>
                                  {isSelected && (
                                    <Check className="h-3.5 w-3.5 text-amber-500 shrink-0 ml-2" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {filteredRoleKeys.length === 0 && (
                    <div className="px-2 py-2 text-xs text-gray-400">
                      {allUsers.length === 0 ? t("devPersona.noUsers") : t("devPersona.noUsersMatch")}
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
