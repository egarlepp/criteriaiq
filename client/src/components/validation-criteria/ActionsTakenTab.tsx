import { SolutionGraphic } from "@/components/ui/solution-graphic";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import CriteriaBuilderStepper from "./CriteriaBuilderStepper";
import { TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DangerIconButton } from "@/components/shared/danger-icon-button";
import { SolutionBadge, AllSolutionsBadge } from "@/components/ui/solution-badge";
import { SearchFiltersSection, FilterLabel } from "@/components/ui/search-filters-section";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  SortableTable, SortableTableHead, SortableTableHeader,
  SortableTableBody, SortableTableRow, SortableTableCell,
} from "@/components/ui/sortable-table";
import {
  Activity, SquarePen, ChevronDown,
  FolderHeart, FolderCog, FolderLock, FolderClock, Lock,
} from "lucide-react";
import type { Solution, ActionItem, DialogType, SortConfig } from "./types";

interface ActionsTakenTabProps {
  sortedActions: (ActionItem & { solution_name: string })[];
  solutions: Solution[];
  selectedSolutionForActions: number | null;
  setSelectedSolutionForActions: (id: number | null) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
  sortConfig: SortConfig | null;
  onSort: (key: string) => void;
  isAdmin: boolean;
  /** Edit permission on this tab's section; false hides add, edit and delete. */
  canEdit: boolean;
  userId?: string;
  onAdd: (type: DialogType) => void;
  onEdit: (type: DialogType, item: any) => void;
  onDelete: (type: DialogType, id: number) => void;
}

function CollapsibleSection({
  label, icon: Icon, iconColor, count, expanded, onToggle, children,
}: {
  label: string; icon: React.ComponentType<{ className?: string }>; iconColor: string;
  count: number; expanded: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="border rounded-lg overflow-hidden">
      <button type="button" onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-left"
      >
        <Icon className={`h-5 w-5 shrink-0 ${iconColor}`} />
        <span className="font-semibold text-sm">{label}</span>
        <Badge variant="secondary" className="text-xs px-2 py-0.5">{count}</Badge>
        <ChevronDown className={`h-4 w-4 ml-auto text-gray-400 transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`} />
      </button>
      {expanded && (
        <div>
          {count === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">{t('successCriteria.actionsTaken.noItemsInSection')}</div>
          ) : children}
        </div>
      )}
    </div>
  );
}

function ActionsTable({
  items, solutions, sortConfig, onSort, isAdmin, userId, onEdit, onDelete, readOnly = false,
}: {
  items: (ActionItem & { solution_name: string })[]; solutions: Solution[];
  sortConfig: SortConfig | null; onSort: (key: string) => void;
  isAdmin: boolean; userId?: string;
  onEdit: (type: DialogType, item: any) => void; onDelete: (type: DialogType, id: number) => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <SortableTable>
      <SortableTableHeader>
        <SortableTableRow>
          <SortableTableHead sortKey="id" sortConfig={sortConfig} onSort={onSort} tooltipText="Sort by ID">ID</SortableTableHead>
          <SortableTableHead sortKey="name" sortConfig={sortConfig} onSort={onSort} tooltipText="Sort by name">{t('common.name')}</SortableTableHead>
          <SortableTableHead sortKey="description" sortConfig={sortConfig} onSort={onSort} tooltipText="Sort by description">{t('common.description')}</SortableTableHead>
          <SortableTableHead sortKey="solution_name" sortConfig={sortConfig} onSort={onSort} tooltipText="Sort by solution">{t('successCriteria.actionsTaken.solution')}</SortableTableHead>
          <SortableTableHead sortKey="createdAt" sortConfig={sortConfig} onSort={onSort} tooltipText="Sort by created date">{t('common.created')}</SortableTableHead>
          <SortableTableHead sortKey="creatorFirstName" sortConfig={sortConfig} onSort={onSort} tooltipText="Sort by creator">{t('successCriteria.actionsTaken.createdBy')}</SortableTableHead>
          <SortableTableHead sortKey="updatedAt" sortConfig={sortConfig} onSort={onSort} tooltipText="Sort by updated date">{t('successCriteria.actionsTaken.updated')}</SortableTableHead>
          <SortableTableHead sortKey="updatedByFirstName" sortConfig={sortConfig} onSort={onSort} tooltipText="Sort by updater">{t('successCriteria.actionsTaken.updatedBy')}</SortableTableHead>
          {!readOnly && <SortableTableHead sortable={false}>{t('common.actions')}</SortableTableHead>}
        </SortableTableRow>
      </SortableTableHeader>
      <SortableTableBody>
        {items.map((action) => {
          const itemSolutions = solutions.filter((s) => action.solutionIds?.includes(s.id));
          const canEdit = isAdmin || action.createdBy === userId;
          const canDelete = action.isActive === false ? isAdmin : (isAdmin || (!action.isSystem && action.createdBy === userId));
          return (
            <SortableTableRow key={action.id} className={!action.isActive ? "opacity-60" : undefined}>
              <SortableTableCell className="text-sm text-gray-500">{action.id}</SortableTableCell>
              <SortableTableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <span>{action.name}</span>
                  {action.isSystem && (
                    <Tooltip>
                      <TooltipTrigger><Lock className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
                      <TooltipContent>{t('successCriteria.actionsTaken.systemItem')}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </SortableTableCell>
              <SortableTableCell>{action.description || "—"}</SortableTableCell>
              <SortableTableCell>
                {action.isAllSolutions === true ? <AllSolutionsBadge /> :
                  itemSolutions.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {itemSolutions.map((s) => <SolutionBadge key={s.id} solutionName={s.name} solutionIcon={s.solutionIcon} solutionIconName={s.solutionIconName} />)}
                    </div>
                  ) : "—"}
              </SortableTableCell>
              <SortableTableCell className="text-xs text-muted-foreground">
                {action.createdAt ? new Date(action.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : "—"}
              </SortableTableCell>
              <SortableTableCell className="text-xs">
                {action.creatorFirstName && action.creatorLastName ? `${action.creatorFirstName} ${action.creatorLastName}` : action.creatorEmail || "—"}
              </SortableTableCell>
              <SortableTableCell className="text-xs text-muted-foreground">
                {action.updatedAt ? new Date(action.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : "—"}
              </SortableTableCell>
              <SortableTableCell className="text-xs">
                {action.updatedByFirstName && action.updatedByLastName ? `${action.updatedByFirstName} ${action.updatedByLastName}` : action.updatedByEmail || "—"}
              </SortableTableCell>
              {!readOnly && (
                <SortableTableCell>
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" onClick={() => onEdit("action", action)} disabled={!canEdit} className="h-8 w-8 p-0 icon-button">
                          <SquarePen className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
                        <p>{canEdit ? "Edit action" : "No permission"}</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DangerIconButton onClick={() => onDelete("action", action.id)} disabled={!canDelete} aria-label={action.isActive === false ? "Delete Permanently" : "Set Inactive"} />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
                        <p>{canDelete ? (action.isActive === false ? "Delete Permanently" : "Set Inactive") : "No permission"}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </SortableTableCell>
              )}
            </SortableTableRow>
          );
        })}
      </SortableTableBody>
    </SortableTable>
  );
}

export default function ActionsTakenTab({
  sortedActions, solutions, selectedSolutionForActions, setSelectedSolutionForActions,
  activeFilterCount, onClearFilters, sortConfig, onSort, isAdmin, canEdit, userId, onAdd, onEdit, onDelete,
}: ActionsTakenTabProps) {
  const { t } = useTranslation();
  const [myExpanded, setMyExpanded] = useState(true);
  const [otherExpanded, setOtherExpanded] = useState(true);
  const [systemExpanded, setSystemExpanded] = useState(false);
  const [inactiveExpanded, setInactiveExpanded] = useState(false);

  const myItems = sortedActions.filter(a => a.isActive !== false && !a.isSystem && a.createdBy === userId);
  const otherItems = sortedActions.filter(a => a.isActive !== false && !a.isSystem && a.createdBy !== userId);
  const systemItems = sortedActions.filter(a => a.isActive !== false && a.isSystem);
  const inactiveItems = sortedActions.filter(a => a.isActive === false);

  return (
    <TabsContent value="actions" className="mt-0 space-y-4">
      <div className="space-y-4">
        {canEdit && <CriteriaBuilderStepper />}

        <SearchFiltersSection activeFilterCount={activeFilterCount} onClearFilters={onClearFilters}>
          <div className="space-y-2 flex-1">
            <FilterLabel>{t('successCriteria.actionsTaken.solutions')}</FilterLabel>
            <Select
              value={selectedSolutionForActions ? selectedSolutionForActions.toString() : "all"}
              onValueChange={(value) => setSelectedSolutionForActions(value === "all" ? null : parseInt(value))}
            >
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={t('successCriteria.actionsTaken.allSolutions')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('successCriteria.actionsTaken.allSolutions')}</SelectItem>
                {solutions.filter((s) => s.id != null).map((s) => (
                  <SelectItem key={s.id} value={s.id.toString()}>
                    <div className="flex items-center gap-2">
                      <SolutionGraphic graphic={s.solutionIcon} icon={s.solutionIconName} name={s.name} className="w-4 h-4" />
                      {s.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </SearchFiltersSection>

        <Card className="relative overflow-hidden">
          <DecorativeCardIcon icon={Activity} />
          <CardHeader className="flex flex-row items-start justify-between py-4 relative z-10">
            <div className="flex-1 mr-4">
              <CardTitle className="flex items-center text-2xl gap-2">
                <Activity data-title-icon className="h-5 w-5" />
                Actions Taken Library
              </CardTitle>
              <CardDescription className="mt-1.5">
                Library of all actions taken organized by ownership and status.
              </CardDescription>
            </div>
            <div className="shrink-0">
              {canEdit && (
                <Button onClick={() => onAdd("action")}>
                  <Activity className="h-4 w-4 mr-2" />
                  Add Action
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto px-6 pb-4 relative z-10 space-y-3">
            <CollapsibleSection label={t('successCriteria.actionsTaken.myActions')} icon={FolderHeart} iconColor="text-rose-500" count={myItems.length} expanded={myExpanded} onToggle={() => setMyExpanded(v => !v)}>
              <ActionsTable items={myItems} solutions={solutions} sortConfig={sortConfig} onSort={onSort} isAdmin={isAdmin} userId={userId} onEdit={onEdit} onDelete={onDelete} readOnly={!canEdit} />
            </CollapsibleSection>
            <CollapsibleSection label={t('successCriteria.actionsTaken.otherActions')} icon={FolderCog} iconColor="text-amber-600" count={otherItems.length} expanded={otherExpanded} onToggle={() => setOtherExpanded(v => !v)}>
              <ActionsTable items={otherItems} solutions={solutions} sortConfig={sortConfig} onSort={onSort} isAdmin={isAdmin} userId={userId} onEdit={onEdit} onDelete={onDelete} readOnly={!canEdit} />
            </CollapsibleSection>
            <CollapsibleSection label={t('successCriteria.actionsTaken.systemActions')} icon={FolderLock} iconColor="text-blue-600" count={systemItems.length} expanded={systemExpanded} onToggle={() => setSystemExpanded(v => !v)}>
              <ActionsTable items={systemItems} solutions={solutions} sortConfig={sortConfig} onSort={onSort} isAdmin={isAdmin} userId={userId} onEdit={onEdit} onDelete={onDelete} readOnly={!isAdmin} />
            </CollapsibleSection>
            <CollapsibleSection label={t('successCriteria.actionsTaken.inactiveActions')} icon={FolderClock} iconColor="text-gray-400" count={inactiveItems.length} expanded={inactiveExpanded} onToggle={() => setInactiveExpanded(v => !v)}>
              <ActionsTable items={inactiveItems} solutions={solutions} sortConfig={sortConfig} onSort={onSort} isAdmin={isAdmin} userId={userId} onEdit={onEdit} onDelete={onDelete} readOnly={!isAdmin} />
            </CollapsibleSection>
          </CardContent>
        </Card>
      </div>
    </TabsContent>
  );
}
