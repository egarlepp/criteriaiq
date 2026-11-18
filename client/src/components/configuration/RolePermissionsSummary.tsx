import { useTranslation } from "react-i18next";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { DATA_VISIBILITY_PERMISSIONS } from "@/lib/permission-sections";
import { PERMISSION_TREE, type PermissionGroup } from "@/lib/permission-tree";
import { normalizeLevel, type StoredPermission } from "@shared/permissions";

const LEVEL_BADGE: Record<string, string> = {
  view: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "view-all": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "view-assigned": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  edit: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "edit-all": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "edit-assigned": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

interface RolePermissionsSummaryProps {
  sidebarRolePermissions: StoredPermission[];
  isAdmin?: boolean;
  tree?: PermissionGroup[];
}

/** The pages a role can open, grouped like the sidebar; None pages are left out. */
export function RolePermissionsSummary({ sidebarRolePermissions, isAdmin = false, tree = PERMISSION_TREE }: RolePermissionsSummaryProps) {
  const { t } = useTranslation();

  if (isAdmin) {
    return (
      <div className="py-8 text-center">
        <DynamicIcon name="ShieldCheck" className="mx-auto mb-2 h-8 w-8 text-red-500 dark:text-red-400" />
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{t("rolePermissions.summary.fullAccess")}</p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("rolePermissions.summary.fullAccessDescription")}</p>
      </div>
    );
  }

  const levelOf = (key: string) => normalizeLevel(key, sidebarRolePermissions.find((p) => p.section === key)?.permission);

  const groups = tree
    .map((group) => ({
      group,
      rows: group.items.flatMap((item) =>
        item.rows.flatMap((row) => {
          if (!row.key) return [];
          const level = levelOf(row.key);
          if (level === "none") return [];
          const labelKeys = item.hasChildren ? row.labelKeys : [item.labelKey];
          return [{ key: row.key, label: labelKeys.map((k) => t(k)).join(" · "), icon: item.hasChildren ? row.icon : item.icon, level }];
        }),
      ),
    }))
    .filter((g) => g.rows.length > 0);
  const data = DATA_VISIBILITY_PERMISSIONS.filter((item) => levelOf(item.id) !== "none");

  if (groups.length === 0 && data.length === 0) {
    return (
      <div className="py-8 text-center">
        <DynamicIcon name="ShieldCheck" className="mx-auto mb-2 h-8 w-8 text-gray-300 dark:text-gray-600" />
        <p className="text-sm text-gray-500 dark:text-gray-400">{t("rolePermissions.summary.noneConfigured")}</p>
      </div>
    );
  }

  const badge = (level: string) => (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${LEVEL_BADGE[level] ?? ""}`}>
      {t(`rolePermissions.levels.${level}.label`)}
    </span>
  );

  return (
    <div className="max-h-[400px] space-y-3 overflow-y-auto pr-1">
      {groups.map(({ group, rows }) => (
        <div key={group.id} className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {group.parentLabelKey ? `${t(group.parentLabelKey)} › ${t(group.labelKey)}` : t(group.labelKey)}
          </p>
          {rows.map((row) => {
            const Icon = row.icon;
            return (
              <div key={row.key} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 dark:border-gray-700">
                <span className="flex min-w-0 items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
                  <span className="min-w-0 break-words text-sm text-gray-800 dark:text-gray-200">{row.label}</span>
                </span>
                {badge(row.level)}
              </div>
            );
          })}
        </div>
      ))}
      {data.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t("rolePermissions.dataVisibility.title")}
          </p>
          {data.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 dark:border-gray-700">
              <span className="flex min-w-0 items-center gap-2">
                <DynamicIcon name={item.icon} className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
                <span className="min-w-0 break-words text-sm text-gray-800 dark:text-gray-200">{t(item.labelKey)}</span>
              </span>
              {badge("view")}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
