import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Edit, ExternalLink, Eye, EyeOff, Link2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  SortableTable,
  SortableTableBody,
  SortableTableCell,
  SortableTableHead,
  SortableTableHeader,
  SortableTableRow,
} from "@/components/ui/sortable-table";
import { ResponsiveTableActionsMenu, type TableAction } from "@/components/ui/table-actions-menu";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { useUrlSortState, sortRows } from "@/lib/sorting";
import { formatDateForDisplay } from "@/lib/date-utils";
import type { PortalResourceView } from "@shared/portal-resources";
import { ResourceLink } from "./ResourceLink";

// ─── ResourceGroup: a collapsible My / Other / System section ────────────────

interface ResourceGroupProps {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  emptyText: string;
  children: React.ReactNode;
  testId: string;
}

export function ResourceGroup({ label, icon: Icon, iconClass, count, expanded, onToggle, emptyText, children, testId }: ResourceGroupProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700" data-testid={testId}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 bg-gray-200 px-4 py-3 text-left transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
      >
        <Icon className={`h-5 w-5 shrink-0 ${iconClass}`} />
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{label}</span>
        <Badge variant="secondary" className="px-2 py-0.5 text-xs">
          {count}
        </Badge>
        <ChevronDown className={`ml-auto h-4 w-4 text-gray-400 transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`} />
      </button>
      {expanded && (count === 0 ? <div className="px-4 py-6 text-center text-sm text-muted-foreground">{emptyText}</div> : children)}
    </div>
  );
}

// ─── ResourceTable ────────────────────────────────────────────────────────────

interface ResourceTableProps {
  rows: PortalResourceView[];
  /** URL prefix for this table's sort state, so each group sorts on its own. */
  sortPrefix: string;
  canEditPortal: boolean;
  /** Whether the signed-in person may edit / delete a given row. */
  permissionsFor: (row: PortalResourceView) => { edit: boolean; remove: boolean };
  onEdit: (row: PortalResourceView) => void;
  onDelete: (row: PortalResourceView) => void;
  onTogglePortal: (row: PortalResourceView) => void;
}

export function ResourceTable({ rows, sortPrefix, canEditPortal, permissionsFor, onEdit, onDelete, onTogglePortal }: ResourceTableProps) {
  const { t } = useTranslation();
  const [sortConfig, handleSort] = useUrlSortState(sortPrefix);
  const sorted = useMemo(
    () =>
      sortRows(rows, sortConfig, {
        title: (r) => r.title.toLowerCase(),
        link: (r) => r.url.toLowerCase(),
        portal: (r) => (r.portalPosition === null ? null : r.portalPosition),
        owner: (r) => (r.isSystem ? t("resourceContent.table.system") : r.ownerName ?? ""),
        updatedAt: (r) => new Date(r.updatedAt).getTime(),
      }),
    [rows, sortConfig, t],
  );

  return (
    <div className="overflow-x-auto">
      <SortableTable>
        <SortableTableHeader>
          <SortableTableRow>
            <SortableTableHead sortKey="title" sortConfig={sortConfig} onSort={handleSort} tooltipText={t("resourceContent.table.sortBy", { column: t("resourceContent.table.resource") })} className="px-4 py-3 text-left">
              {t("resourceContent.table.resource")}
            </SortableTableHead>
            <SortableTableHead sortKey="link" sortConfig={sortConfig} onSort={handleSort} tooltipText={t("resourceContent.table.sortBy", { column: t("resourceContent.table.link") })} className="px-4 py-3 text-left">
              {t("resourceContent.table.link")}
            </SortableTableHead>
            <SortableTableHead sortKey="portal" sortConfig={sortConfig} onSort={handleSort} tooltipText={t("resourceContent.table.sortBy", { column: t("resourceContent.table.portal") })} className="px-4 py-3 text-left">
              {t("resourceContent.table.portal")}
            </SortableTableHead>
            <SortableTableHead sortKey="owner" sortConfig={sortConfig} onSort={handleSort} tooltipText={t("resourceContent.table.sortBy", { column: t("resourceContent.table.createdBy") })} className="px-4 py-3 text-left">
              {t("resourceContent.table.createdBy")}
            </SortableTableHead>
            <SortableTableHead sortKey="updatedAt" sortConfig={sortConfig} onSort={handleSort} tooltipText={t("resourceContent.table.sortBy", { column: t("resourceContent.table.updated") })} className="px-4 py-3 text-left">
              {t("resourceContent.table.updated")}
            </SortableTableHead>
            <SortableTableHead sortKey="" sortConfig={sortConfig} onSort={handleSort} sortable={false} className="px-4 py-3 text-left">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("common.actions")}</span>
            </SortableTableHead>
          </SortableTableRow>
        </SortableTableHeader>
        <SortableTableBody>
          {sorted.map((row) => {
            const perms = permissionsFor(row);
            const onCard = row.portalPosition !== null;
            const actions: TableAction[] = [
              {
                id: "toggle-portal",
                label: onCard ? t("resourceContent.actions.removeFromCard") : t("resourceContent.actions.showOnCard"),
                icon: onCard ? EyeOff : Eye,
                onClick: () => onTogglePortal(row),
                hidden: !canEditPortal,
              },
              { id: "edit", label: t("resourceContent.actions.edit"), icon: Edit, onClick: () => onEdit(row), hidden: !perms.edit },
              {
                id: "delete",
                label: t("resourceContent.actions.delete"),
                icon: Trash2,
                onClick: () => onDelete(row),
                variant: "destructive",
                separator: true,
                hidden: !perms.remove,
              },
            ];
            return (
              <SortableTableRow key={row.id} className="border-b border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800" data-testid={`resource-row-${row.id}`}>
                <SortableTableCell className="p-4">
                  <div className="flex items-start gap-3">
                    <DynamicIcon name={row.icon} className="mt-0.5 h-4 w-4 shrink-0" style={{ color: row.iconColor }} />
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 dark:text-gray-100">{row.title}</p>
                      {row.description && <p className="line-clamp-2 text-sm text-gray-500 dark:text-gray-400">{row.description}</p>}
                    </div>
                  </div>
                </SortableTableCell>
                <SortableTableCell className="max-w-[280px] p-4">
                  <ResourceLink resource={row} className="group flex items-center gap-2 text-sm text-blue-600 hover:underline dark:text-blue-400">
                    {row.linkType === "internal" ? <Link2 className="h-3.5 w-3.5 shrink-0" /> : <ExternalLink className="h-3.5 w-3.5 shrink-0" />}
                    <span className="truncate">{row.url}</span>
                  </ResourceLink>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {t(row.linkType === "internal" ? "resourceContent.linkTypes.internal" : "resourceContent.linkTypes.external")}
                  </span>
                </SortableTableCell>
                <SortableTableCell className="p-4">
                  {onCard ? (
                    <Badge className="border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40">
                      {t("resourceContent.table.shownAt", { position: (row.portalPosition ?? 0) + 1 })}
                    </Badge>
                  ) : (
                    <span className="text-sm text-gray-400 dark:text-gray-500">{t("resourceContent.table.notShown")}</span>
                  )}
                </SortableTableCell>
                <SortableTableCell className="p-4 text-sm text-gray-600 dark:text-gray-300">
                  {row.isSystem ? t("resourceContent.table.system") : row.ownerName ?? "—"}
                </SortableTableCell>
                <SortableTableCell className="p-4 text-sm text-gray-600 dark:text-gray-300">{formatDateForDisplay(row.updatedAt)}</SortableTableCell>
                <SortableTableCell className="p-4">
                  <ResponsiveTableActionsMenu actions={actions} />
                </SortableTableCell>
              </SortableTableRow>
            );
          })}
        </SortableTableBody>
      </SortableTable>
    </div>
  );
}
