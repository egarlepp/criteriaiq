import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Eye, EyeOff, Lock, Pencil, Users, UserCheck, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { DATA_VISIBILITY_PERMISSIONS } from "@/lib/permission-sections";
import {
  PERMISSION_TREE,
  keysOfItem,
  type PermissionGroup,
  type PermissionItem,
  type PermissionRow,
} from "@/lib/permission-tree";
import { ACCOUNT_PORTAL_SECTION, levelsFor, normalizeLevel } from "@shared/permissions";

/** Permission values keyed by page key; a missing key means None. */
export type PermissionValues = Record<string, string>;

interface PermissionTreeEditorProps {
  values: PermissionValues;
  /** Sets each of the given keys to one level. */
  onChange: (keys: string[], level: string) => void;
  /** The Admin role: every page shows Admin and nothing can be changed. */
  isAdminRole?: boolean;
  disabled?: boolean;
  tree?: PermissionGroup[];
}

const LEVEL_ICON: Record<string, LucideIcon> = {
  none: EyeOff,
  view: Eye,
  edit: Pencil,
  "view-assigned": UserCheck,
  "view-all": Users,
  "edit-assigned": UserCheck,
  "edit-all": Users,
};

const MIXED = "__mixed";

function useLevelText() {
  const { t } = useTranslation();
  return {
    label: (level: string) => t(`rolePermissions.levels.${level}.label`),
    description: (level: string) => t(`rolePermissions.levels.${level}.description`),
  };
}

function LevelSelect({
  levels,
  value,
  onChange,
  disabled,
  ariaLabel,
  width = "w-56",
}: {
  levels: readonly string[];
  value: string;
  onChange: (level: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  width?: string;
}) {
  const { t } = useTranslation();
  const text = useLevelText();
  const Icon = value === MIXED ? null : LEVEL_ICON[value];
  return (
    <Select value={value} disabled={disabled} onValueChange={onChange}>
      <SelectTrigger className={width} aria-label={ariaLabel}>
        <SelectValue>
          <span className="flex items-center gap-2">
            {Icon && <Icon className="h-4 w-4 text-gray-600 dark:text-gray-400" />}
            <span className={value === MIXED ? "italic text-gray-500 dark:text-gray-400" : ""}>
              {value === MIXED ? t("rolePermissions.mixed") : text.label(value)}
            </span>
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {levels.map((level) => {
          const OptionIcon = LEVEL_ICON[level];
          return (
            <SelectItem key={level} value={level}>
              <span className="flex items-center gap-2">
                <OptionIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                <span>
                  <span className="block font-medium text-gray-900 dark:text-gray-100">{text.label(level)}</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">{text.description(level)}</span>
                </span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function AdminOnlyBadge() {
  const { t } = useTranslation();
  return (
    <Badge
      variant="outline"
      title={t("rolePermissions.adminOnlyHint")}
      className="gap-1 border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300"
    >
      <Lock className="h-3 w-3" />
      {t("rolePermissions.adminOnly")}
    </Badge>
  );
}

function AdminRoleBadge() {
  const { t } = useTranslation();
  return (
    <Badge className="gap-1 bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/40">
      <DynamicIcon name="ShieldCheck" className="h-3 w-3" />
      {t("rolePermissions.levels.admin.label")}
    </Badge>
  );
}

/**
 * Role Management's permission editor: the sidebar's groups and pages, one
 * value per page, with Set all on each menu entry that has pages under it.
 * Shared by the role dialog and the user dialog.
 */
export function PermissionTreeEditor({
  values,
  onChange,
  isAdminRole = false,
  disabled = false,
  tree = PERMISSION_TREE,
}: PermissionTreeEditorProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const readOnly = disabled || isAdminRole;

  const levelOf = (key: string) => normalizeLevel(key, values[key]);
  const rowLabel = (row: PermissionRow) => row.labelKeys.map((k) => t(k)).join(" · ");

  const renderRowControl = (row: PermissionRow, label: string) => {
    if (row.adminOnly || !row.key) return <AdminOnlyBadge />;
    if (isAdminRole) return <AdminRoleBadge />;
    const key = row.key;
    return (
      <LevelSelect
        levels={levelsFor(key)}
        value={levelOf(key)}
        onChange={(level) => onChange([key], level)}
        disabled={readOnly}
        ariaLabel={label}
        width={key === ACCOUNT_PORTAL_SECTION ? "w-56" : "w-44"}
      />
    );
  };

  const renderRow = (row: PermissionRow, nested: boolean) => {
    const label = rowLabel(row);
    const Icon = row.icon;
    return (
      <div
        key={row.key ?? row.labelKeys.join("|")}
        className={`flex items-center justify-between gap-3 py-2 pr-3 ${nested ? "pl-12 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30" : "pl-3"}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          {!nested && <span className="w-5 shrink-0" />}
          <Icon className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
          <span className={`truncate ${nested ? "text-sm text-gray-700 dark:text-gray-300" : "font-medium text-gray-900 dark:text-gray-100"}`}>
            {label}
          </span>
        </span>
        {renderRowControl(row, label)}
      </div>
    );
  };

  const renderItem = (item: PermissionItem) => {
    if (!item.hasChildren) {
      return (
        <div key={item.id} className="rounded-lg border dark:border-gray-700">
          {renderRow({ ...item.rows[0], icon: item.icon, labelKeys: [item.labelKey] }, false)}
        </div>
      );
    }
    const keys = keysOfItem(item);
    const levels = keys.map(levelOf);
    const allSame = levels.every((l) => l === levels[0]);
    const isOpen = expanded[item.id] ?? false;
    const label = t(item.labelKey);
    const Icon = item.icon;
    return (
      <div key={item.id} className="overflow-hidden rounded-lg border dark:border-gray-700">
        <div className="flex items-center justify-between gap-3 py-2 pl-3 pr-3">
          <button
            type="button"
            onClick={() => setExpanded((prev) => ({ ...prev, [item.id]: !isOpen }))}
            className="flex min-w-0 items-center gap-2 text-left"
            aria-expanded={isOpen}
          >
            {isOpen ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
            )}
            <Icon className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
            <span className="truncate font-medium text-gray-900 dark:text-gray-100">{label}</span>
            <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
              {t("rolePermissions.pageCount", { count: item.rows.length })}
            </span>
          </button>
          {isAdminRole ? (
            <AdminRoleBadge />
          ) : keys.length === 0 ? (
            <AdminOnlyBadge />
          ) : (
            <span className="flex items-center gap-2">
              <span className="hidden text-xs text-gray-500 dark:text-gray-400 sm:inline">{t("rolePermissions.setAll")}</span>
              <LevelSelect
                levels={levelsFor(keys[0])}
                value={allSame ? levels[0] : MIXED}
                onChange={(level) => onChange(keys, level)}
                disabled={readOnly}
                ariaLabel={t("rolePermissions.setAllFor", { name: label })}
                width="w-44"
              />
            </span>
          )}
        </div>
        {isOpen && <div>{item.rows.map((row) => renderRow(row, true))}</div>}
      </div>
    );
  };

  const renderGroup = (group: PermissionGroup) => {
    const keys = group.items.flatMap(keysOfItem);
    const levels = keys.map(levelOf);
    const allSame = levels.length > 0 && levels.every((l) => l === levels[0]);
    const sameScale = keys.every((k) => levelsFor(k) === levelsFor(keys[0]));
    const title = group.parentLabelKey ? `${t(group.parentLabelKey)} › ${t(group.labelKey)}` : t(group.labelKey);
    return (
      <section key={group.id} className="space-y-2" aria-label={title}>
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</h4>
          {!isAdminRole && keys.length > 1 && sameScale && (
            <span className="flex items-center gap-2">
              <span className="hidden text-xs text-gray-500 dark:text-gray-400 sm:inline">{t("rolePermissions.setAll")}</span>
              <LevelSelect
                levels={levelsFor(keys[0])}
                value={allSame ? levels[0] : MIXED}
                onChange={(level) => onChange(keys, level)}
                disabled={readOnly}
                ariaLabel={t("rolePermissions.setAllFor", { name: title })}
                width="w-44"
              />
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-2">{group.items.map(renderItem)}</div>
      </section>
    );
  };

  const renderDataVisibility = () => (
    <section className="space-y-2" aria-label={t("rolePermissions.dataVisibility.title")}>
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {t("rolePermissions.dataVisibility.title")}
        </h4>
        <p className="text-xs text-gray-500 dark:text-gray-400">{t("rolePermissions.dataVisibility.description")}</p>
      </div>
      {DATA_VISIBILITY_PERMISSIONS.map((item) => {
        const label = t(item.labelKey);
        return (
          <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 dark:border-gray-700">
            <span className="flex min-w-0 items-center gap-2">
              <span className="w-5 shrink-0" />
              <DynamicIcon name={item.icon} className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
              <span className="min-w-0">
                <span className="block truncate font-medium text-gray-900 dark:text-gray-100">{label}</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">{t(item.descriptionKey)}</span>
              </span>
            </span>
            {isAdminRole ? (
              <AdminRoleBadge />
            ) : (
              <LevelSelect
                levels={levelsFor(item.id)}
                value={levelOf(item.id)}
                onChange={(level) => onChange([item.id], level)}
                disabled={readOnly}
                ariaLabel={label}
                width="w-44"
              />
            )}
          </div>
        );
      })}
    </section>
  );

  return (
    <div className="space-y-5">
      <p className="text-xs text-gray-500 dark:text-gray-400">{t("rolePermissions.intro")}</p>
      {tree.map(renderGroup)}
      {renderDataVisibility()}
    </div>
  );
}
