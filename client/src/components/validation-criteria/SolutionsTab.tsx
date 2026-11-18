import { SolutionGraphic } from "@/components/ui/solution-graphic";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DangerIconButton } from "@/components/shared/danger-icon-button";
import { SearchFiltersSection, FilterLabel } from "@/components/ui/search-filters-section";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  SortableTable,
  SortableTableHead,
  SortableTableHeader,
  SortableTableBody,
  SortableTableRow,
  SortableTableCell,
} from "@/components/ui/sortable-table";
import {
  Package,
  SquarePen,
  Upload,
  ChevronDown,
  FolderHeart,
  FolderCog,
  FolderLock,
  FolderClock,
  Lock,
} from "lucide-react";
import CriteriaBuilderStepper from "./CriteriaBuilderStepper";
import type { Solution, DialogType, SortConfig } from "./types";

interface SolutionsTabProps {
  sortedSolutions: (Solution & { criteria_count: number; project_count: number; tags_text: string })[];
  allTags: string[];
  selectedTags: string[];
  setSelectedTags: (tags: string[]) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
  sortConfig: SortConfig | null;
  onSort: (key: string) => void;
  isAdmin: boolean;
  /** Edit permission on this tab's section; false hides add, edit and delete. */
  canEdit: boolean;
  userId?: string;
  onCsvImport: () => void;
  onAdd: (type: DialogType) => void;
  onEdit: (type: DialogType, item: any) => void;
  onDelete: (type: DialogType, id: number) => void;
  getTagColor: (tagName: string) => string;
  getProjectCount: (solutionName: string) => number;
}

function CollapsibleSection({
  label,
  icon: Icon,
  iconColor,
  count,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-left"
      >
        <Icon className={`h-5 w-5 shrink-0 ${iconColor}`} />
        <span className="font-semibold text-sm">{label}</span>
        <Badge variant="secondary" className="text-xs px-2 py-0.5">
          {count}
        </Badge>
        <ChevronDown
          className={`h-4 w-4 ml-auto text-gray-400 transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`}
        />
      </button>
      {expanded && (
        <div>
          {count === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              {t('successCriteria.solutions.noItemsInSection')}
            </div>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}

function SolutionTable({
  items,
  sortConfig,
  onSort,
  isAdmin,
  userId,
  onEdit,
  onDelete,
  getTagColor,
  getProjectCount,
  readOnly = false,
}: {
  items: (Solution & { criteria_count: number; project_count: number; tags_text: string })[];
  sortConfig: SortConfig | null;
  onSort: (key: string) => void;
  isAdmin: boolean;
  userId?: string;
  onEdit: (type: DialogType, item: any) => void;
  onDelete: (type: DialogType, id: number) => void;
  getTagColor: (tagName: string) => string;
  getProjectCount: (solutionName: string) => number;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <SortableTable>
      <SortableTableHeader>
        <SortableTableRow>
          <SortableTableHead sortKey="id" sortConfig={sortConfig} onSort={onSort} tooltipText="Sort by ID">ID</SortableTableHead>
          <SortableTableHead sortKey="name" sortConfig={sortConfig} onSort={onSort} tooltipText="Sort by name">{t('common.name')}</SortableTableHead>
          <SortableTableHead sortKey="abbreviation" sortConfig={sortConfig} onSort={onSort} tooltipText="Sort by abbreviation">{t('successCriteria.solutions.abbr')}</SortableTableHead>
          <SortableTableHead sortKey="description" sortConfig={sortConfig} onSort={onSort} tooltipText="Sort by description">{t('common.description')}</SortableTableHead>
          <SortableTableHead sortKey="tags_text" sortConfig={sortConfig} onSort={onSort} tooltipText="Sort by tags">Tags</SortableTableHead>
          <SortableTableHead sortKey="project_count" sortConfig={sortConfig} onSort={onSort} tooltipText="Sort by projects">{t('successCriteria.solutions.projects')}</SortableTableHead>
          <SortableTableHead sortKey="createdAt" sortConfig={sortConfig} onSort={onSort} tooltipText="Sort by created date">{t('common.created')}</SortableTableHead>
          <SortableTableHead sortKey="creatorFirstName" sortConfig={sortConfig} onSort={onSort} tooltipText="Sort by creator">{t('successCriteria.solutions.createdBy')}</SortableTableHead>
          <SortableTableHead sortKey="updatedAt" sortConfig={sortConfig} onSort={onSort} tooltipText="Sort by last updated">{t('successCriteria.solutions.updated')}</SortableTableHead>
          <SortableTableHead sortKey="updatedByFirstName" sortConfig={sortConfig} onSort={onSort} tooltipText="Sort by updater">{t('successCriteria.solutions.updatedBy')}</SortableTableHead>
          {!readOnly && <SortableTableHead sortable={false}>{t('common.actions')}</SortableTableHead>}
        </SortableTableRow>
      </SortableTableHeader>
      <SortableTableBody>
        {items.map((solution) => {
          const canEdit = isAdmin || solution.createdBy === userId;
          const canDelete = solution.isActive === false ? isAdmin : (isAdmin || (!solution.isSystem && solution.createdBy === userId));
          return (
            <SortableTableRow key={solution.id} className={!solution.isActive ? "opacity-60" : undefined}>
              <SortableTableCell className="text-sm text-gray-500">{solution.id}</SortableTableCell>
              <SortableTableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <SolutionGraphic graphic={solution.solutionIcon} icon={solution.solutionIconName} name={solution.name} className="w-[35px] h-[35px] object-contain shrink-0" />
                  <span>{solution.name}</span>
                  {solution.isSystem && (
                    <Tooltip>
                      <TooltipTrigger>
                        <Lock className="h-3 w-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>{t('successCriteria.solutions.systemItem')}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </SortableTableCell>
              <SortableTableCell>
                <span className="text-sm font-mono">{solution.abbreviation || "—"}</span>
              </SortableTableCell>
              <SortableTableCell>{solution.description || "—"}</SortableTableCell>
              <SortableTableCell>
                {solution.tags && solution.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {solution.tags.map((tag) => (
                      <Badge
                        key={`solution-${solution.id}-tag-${tag}`}
                        variant="secondary"
                        className="text-xs text-white rounded-full px-2 py-1"
                        style={{ backgroundColor: getTagColor(tag) }}
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                ) : "—"}
              </SortableTableCell>
              <SortableTableCell>
                <Badge variant="secondary">{getProjectCount(solution.name)}</Badge>
              </SortableTableCell>
              <SortableTableCell className="text-xs text-muted-foreground">
                {solution.createdAt ? new Date(solution.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : "—"}
              </SortableTableCell>
              <SortableTableCell className="text-xs">
                {solution.creatorFirstName && solution.creatorLastName
                  ? `${solution.creatorFirstName} ${solution.creatorLastName}`
                  : solution.creatorEmail || "—"}
              </SortableTableCell>
              <SortableTableCell className="text-xs text-muted-foreground">
                {solution.updatedAt ? new Date(solution.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : "—"}
              </SortableTableCell>
              <SortableTableCell className="text-xs">
                {solution.updatedByFirstName && solution.updatedByLastName
                  ? `${solution.updatedByFirstName} ${solution.updatedByLastName}`
                  : solution.updatedByEmail || "—"}
              </SortableTableCell>
              {!readOnly && (
                <SortableTableCell>
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEdit("solution", solution)}
                          disabled={!canEdit}
                          className="h-8 w-8 p-0 icon-button"
                        >
                          <SquarePen className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
                        <p>{canEdit ? "Edit solution" : "No permission"}</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DangerIconButton
                          onClick={() => onDelete("solution", solution.id)}
                          disabled={!canDelete}
                          aria-label={solution.isActive === false ? "Delete Permanently" : "Set Inactive"}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
                        <p>{canDelete ? (solution.isActive === false ? "Delete Permanently" : "Set Inactive") : "No permission"}</p>
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

export default function SolutionsTab({
  sortedSolutions,
  allTags,
  selectedTags,
  setSelectedTags,
  activeFilterCount,
  onClearFilters,
  sortConfig,
  onSort,
  isAdmin,
  canEdit,
  userId,
  onCsvImport,
  onAdd,
  onEdit,
  onDelete,
  getTagColor,
  getProjectCount,
}: SolutionsTabProps) {
  const { t } = useTranslation();
  const [myExpanded, setMyExpanded] = useState(true);
  const [otherExpanded, setOtherExpanded] = useState(true);
  const [systemExpanded, setSystemExpanded] = useState(false);
  const [inactiveExpanded, setInactiveExpanded] = useState(false);

  const myItems = sortedSolutions.filter(s => s.isActive !== false && !s.isSystem && s.createdBy === userId);
  const otherItems = sortedSolutions.filter(s => s.isActive !== false && !s.isSystem && s.createdBy !== userId);
  const systemItems = sortedSolutions.filter(s => s.isActive !== false && s.isSystem);
  const inactiveItems = sortedSolutions.filter(s => s.isActive === false);

  return (
    <TabsContent value="solutions" className="mt-0 space-y-4">
      <div className="space-y-4">
        {canEdit && <CriteriaBuilderStepper />}

        <SearchFiltersSection activeFilterCount={activeFilterCount} onClearFilters={onClearFilters}>
          <div className="flex items-center gap-3">
            <div className="space-y-2 flex-1">
              <FilterLabel>Tag</FilterLabel>
              <Select
                value={selectedTags.length === 1 ? selectedTags[0] : "all-tags"}
                onValueChange={(value) => {
                  if (value && value !== "all-tags") {
                    setSelectedTags([value]);
                  } else {
                    setSelectedTags([]);
                  }
                }}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder={t('successCriteria.solutions.allTags')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-tags">{t('successCriteria.solutions.allTags')}</SelectItem>
                  {allTags.map((tag) => (
                    <SelectItem key={tag} value={tag}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full border" style={{ backgroundColor: getTagColor(tag) }} />
                        {tag}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </SearchFiltersSection>

        <Card className="relative overflow-hidden">
          <DecorativeCardIcon icon={Package} />
          <CardHeader className="flex flex-row items-start justify-between py-4 relative z-10">
            <div className="flex-1 mr-4">
              <CardTitle className="flex items-center text-2xl gap-2">
                <Package data-title-icon className="h-5 w-5" />
                Solutions Library
              </CardTitle>
              <CardDescription className="mt-1.5">
                Library of all solutions in the system, organized by ownership and status.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Button onClick={onCsvImport} className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Import All Criteria
                </Button>
              )}
              {canEdit && (
                <Button onClick={() => onAdd("solution")}>
                  <Package className="h-4 w-4 mr-2" />
                  Add Solution
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto px-6 pb-4 relative z-10 space-y-3">
            <CollapsibleSection
              label={t('successCriteria.solutions.mySolutions')}
              icon={FolderHeart}
              iconColor="text-rose-500"
              count={myItems.length}
              expanded={myExpanded}
              onToggle={() => setMyExpanded(v => !v)}
            >
              <SolutionTable items={myItems} sortConfig={sortConfig} onSort={onSort} isAdmin={isAdmin} userId={userId} onEdit={onEdit} onDelete={onDelete} getTagColor={getTagColor} getProjectCount={getProjectCount} readOnly={!canEdit} />
            </CollapsibleSection>

            <CollapsibleSection
              label={t('successCriteria.solutions.otherSolutions')}
              icon={FolderCog}
              iconColor="text-amber-600"
              count={otherItems.length}
              expanded={otherExpanded}
              onToggle={() => setOtherExpanded(v => !v)}
            >
              <SolutionTable items={otherItems} sortConfig={sortConfig} onSort={onSort} isAdmin={isAdmin} userId={userId} onEdit={onEdit} onDelete={onDelete} getTagColor={getTagColor} getProjectCount={getProjectCount} readOnly={!canEdit} />
            </CollapsibleSection>

            <CollapsibleSection
              label={t('successCriteria.solutions.systemSolutions')}
              icon={FolderLock}
              iconColor="text-blue-600"
              count={systemItems.length}
              expanded={systemExpanded}
              onToggle={() => setSystemExpanded(v => !v)}
            >
              <SolutionTable items={systemItems} sortConfig={sortConfig} onSort={onSort} isAdmin={isAdmin} userId={userId} onEdit={onEdit} onDelete={onDelete} getTagColor={getTagColor} getProjectCount={getProjectCount} readOnly={!isAdmin} />
            </CollapsibleSection>

            <CollapsibleSection
              label={t('successCriteria.solutions.inactiveSolutions')}
              icon={FolderClock}
              iconColor="text-gray-400"
              count={inactiveItems.length}
              expanded={inactiveExpanded}
              onToggle={() => setInactiveExpanded(v => !v)}
            >
              <SolutionTable items={inactiveItems} sortConfig={sortConfig} onSort={onSort} isAdmin={isAdmin} userId={userId} onEdit={onEdit} onDelete={onDelete} getTagColor={getTagColor} getProjectCount={getProjectCount} readOnly={!isAdmin} />
            </CollapsibleSection>
          </CardContent>
        </Card>
      </div>
    </TabsContent>
  );
}
