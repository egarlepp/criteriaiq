// One line for a phase, step or task, shared by Next up and Full plan:
// checkbox (work items), name, owners, due date, status, and a ··· menu.
// Clicking the line opens the item in the detail pane.
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, MoreHorizontal, PanelRightOpen, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { MapAvatarStack, type InheritSource } from "./MapAssignees";
import { MapDueDate, MapStatusPill } from "./MapStatusPill";
import type { MapPeople } from "./use-map-people";
import { isDone, isLate, type AssignableItem, type MapItemKind } from "./map-plan-utils";
import { MapStageChip, MapTaskCriteriaChips } from "@/components/value-journey/map-journey";

export interface MapItemRowProps {
  kind: MapItemKind;
  item: AssignableItem & { id: number; name: string; status: string; dueDate: string | null; completedDate?: string | null; stageId?: number | null };
  label: ReactNode;
  sublabel?: ReactNode;
  depth?: 0 | 1 | 2;
  parents: readonly InheritSource[];
  people: MapPeople;
  today: Date;
  selected: boolean;
  canEdit: boolean;
  /** Work items get a checkbox that completes them. */
  checkable: boolean;
  /** Status shown as a pill (phases and steps in Full plan). */
  showStatus: boolean;
  /** The pill's status when it differs from the stored one (a phase or step rolled up from its tasks). */
  displayStatus?: string | null;
  /** Bordered card look (Next up) instead of a plain line (Full plan). */
  card?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  onSelect: () => void;
  onToggleComplete: (done: boolean) => void;
  onDelete: () => void;
}

const stop = (e: MouseEvent | KeyboardEvent) => e.stopPropagation();

export function MapItemRow({
  kind,
  item,
  label,
  sublabel,
  depth = 0,
  parents,
  people,
  today,
  selected,
  canEdit,
  checkable,
  showStatus,
  displayStatus,
  card,
  expanded,
  onToggleExpand,
  onSelect,
  onToggleComplete,
  onDelete,
}: MapItemRowProps) {
  const { t } = useTranslation();
  const done = isDone(item.status);
  const late = isLate(item, today);
  const nameClass =
    kind === "phase"
      ? "font-semibold text-purple-700 dark:text-purple-300"
      : kind === "step"
        ? "font-medium text-blue-700 dark:text-blue-300"
        : "text-gray-900 dark:text-gray-100";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group grid cursor-pointer grid-cols-[20px_minmax(0,1fr)_auto_auto_auto] items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500",
        card ? "border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900" : "border border-transparent",
        selected
          ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/40"
          : "hover:bg-gray-50 dark:hover:bg-gray-800/60",
        depth === 1 && "ml-5",
        depth === 2 && "ml-10",
      )}
      data-testid={`map-row-${kind}-${item.id}`}
    >
      <span className="flex items-center justify-center" onClick={stop} onKeyDown={stop}>
        {checkable ? (
          <Checkbox
            checked={done}
            disabled={!canEdit}
            onCheckedChange={(value) => onToggleComplete(value === true)}
            aria-label={done ? t("mapPlan.row.reopen", { name: item.name }) : t("mapPlan.row.complete", { name: item.name })}
            data-testid={`map-check-${kind}-${item.id}`}
          />
        ) : onToggleExpand ? (
          <button
            type="button"
            onClick={onToggleExpand}
            className="rounded p-0.5 text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
            aria-expanded={expanded}
            aria-label={expanded ? t("mapPlan.row.collapse", { name: item.name }) : t("mapPlan.row.expand", { name: item.name })}
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : null}
      </span>
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={cn("truncate", nameClass, done && kind === "task" && "text-gray-500 line-through dark:text-gray-400")}>
            {label}
          </span>
          {kind === "phase" && <MapStageChip stageId={item.stageId} className="flex-none" />}
          {kind === "task" && <MapTaskCriteriaChips taskId={item.id} />}
        </span>
        {sublabel && <span className="block truncate text-[11px] text-gray-500 dark:text-gray-400">{sublabel}</span>}
      </span>
      <MapAvatarStack item={item} parents={parents} people={people} />
      <MapDueDate
        item={item}
        today={today}
        className={cn(
          "min-w-[52px] text-right font-mono text-[11px]",
          late ? "font-semibold text-red-700 dark:text-red-300" : "text-gray-500 dark:text-gray-400",
        )}
      />
      <span className="flex min-w-[24px] items-center justify-end gap-1" onClick={stop} onKeyDown={stop}>
        {showStatus && <MapStatusPill status={displayStatus ?? item.status} completedDate={item.completedDate} />}
        <MapRowMenu kind={kind} name={item.name} id={item.id} canEdit={canEdit} onOpen={onSelect} onDelete={onDelete} />
      </span>
    </div>
  );
}

/** The ··· menu on a plan row: open details, and delete for editors. */
export function MapRowMenu({
  kind,
  name,
  id,
  canEdit,
  onOpen,
  onDelete,
}: {
  kind: MapItemKind;
  name: string;
  id: number;
  canEdit: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded p-1 text-gray-400 opacity-60 hover:bg-gray-200 hover:text-gray-700 group-hover:opacity-100 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          aria-label={t("mapPlan.row.actions", { name: name })}
          data-testid={`map-row-menu-${kind}-${id}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onOpen}>
          <PanelRightOpen className="mr-2 h-4 w-4" />
          {t("mapPlan.row.openDetails")}
        </DropdownMenuItem>
        {canEdit && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={onDelete}
              className="text-red-600 focus:text-red-700 dark:text-red-400 dark:focus:text-red-300"
              data-testid={`map-row-delete-${kind}-${id}`}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t("mapPlan.row.delete", { kind: t(`mapPlan.kind.${kind}`) })}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
