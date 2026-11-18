// Everything about one phase, step or task, opened from any row. Edits save
// as soon as a field is left (name, description) or changed (status, dates,
// people), like the rest of the drawer.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, Trash2, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { MapStatus } from "@/types/map";
import { cn } from "@/lib/utils";
import { MapAssigneeChips } from "./MapAssignees";
import { MapDueVariance, MapStatusPill, MapStatusSelect } from "./MapStatusPill";
import { useParents, usePlanLabels } from "./MapPlanViews";
import type { MapPeople } from "./use-map-people";
import { MapPhaseStagePicker, MapTaskCriteriaSection, useMapJourney } from "@/components/value-journey/map-journey";
import {
  formatShortDate,
  fromDateInput,
  normalizeStatus,
  phaseProgress,
  phaseRollup,
  stepRollup,
  toDateInput,
  type AssignmentRole,
  type FoundItem,
  type MapItemRef,
} from "./map-plan-utils";

export interface MapItemPatch {
  name?: string;
  description?: string | null;
  status?: MapStatus;
  startDate?: string | null;
  dueDate?: string | null;
  completedDate?: string | null;
  /** Phases only: the value journey stage. */
  stageId?: number | null;
}

interface MapDetailPaneProps {
  found: FoundItem | null;
  people: MapPeople;
  today: Date;
  canEdit: boolean;
  position: { index: number; total: number } | null;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onUpdate: (ref: MapItemRef, patch: MapItemPatch) => void;
  onAssign: (ref: MapItemRef, role: AssignmentRole, value: string | null) => void;
  onDelete: (ref: MapItemRef) => void;
}

export function MapDetailPane(props: MapDetailPaneProps) {
  const { t } = useTranslation();
  const { found } = props;
  return (
    <aside
      className="flex h-full min-h-0 flex-col border-l border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950"
      aria-label={t("mapPlan.detail.label")}
      data-testid="map-detail-pane"
    >
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-2 dark:border-gray-800">
        <span className="truncate text-xs text-gray-500 dark:text-gray-400">
          {found ? <Breadcrumb found={found} /> : t("mapPlan.detail.title")}
        </span>
        <span className="flex flex-none items-center gap-1">
          {props.position && (
            <span className="mr-1 text-[11px] tabular-nums text-gray-400 dark:text-gray-500">
              {t("mapPlan.detail.position", { index: props.position.index + 1, total: props.position.total })}
            </span>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={props.onPrev} disabled={!found} aria-label={t("mapPlan.detail.previous")}>
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={props.onNext} disabled={!found} aria-label={t("mapPlan.detail.next")}>
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={props.onClose} aria-label={t("mapPlan.detail.close")} data-testid="map-detail-close">
            <X className="h-4 w-4" />
          </Button>
        </span>
      </div>
      {found ? (
        <DetailBody key={`${found.ref.kind}-${found.ref.id}`} {...props} found={found} />
      ) : (
        <p className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">{t("mapPlan.detail.empty")}</p>
      )}
    </aside>
  );
}

function Breadcrumb({ found }: { found: FoundItem }) {
  const { t } = useTranslation();
  const labels = usePlanLabels();
  const parts = [labels.phase(found.phase)];
  if (found.step && found.ref.kind !== "phase") parts.push(labels.step(found.step));
  if (found.ref.kind === "task" && found.taskNumber) parts.push(t("mapPlan.taskNumber", { number: found.taskNumber }));
  return <>{parts.join(" › ")}</>;
}

function DetailBody({ found, people, today, canEdit, onUpdate, onAssign, onDelete }: MapDetailPaneProps & { found: FoundItem }) {
  const { t, i18n } = useTranslation();
  const parents = useParents();
  const journey = useMapJourney();
  const { item, ref } = found;
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? "");
  useEffect(() => setName(item.name), [item.name]);
  useEffect(() => setDescription(item.description ?? ""), [item.description]);

  const status = normalizeStatus(item.status);
  // Complete and Cancelled items have an end date (the completed date).
  const ended = status === "complete" || status === "cancelled";
  const rolled =
    ref.kind === "phase" ? phaseRollup(found.phase) : ref.kind === "step" && found.step ? stepRollup(found.step) : null;
  const progress =
    ref.kind === "phase"
      ? phaseProgress(found.phase)
      : ref.kind === "step" && found.step && found.step.tasks.length > 0
        ? { done: found.step.tasks.filter((x) => normalizeStatus(x.status) === "complete" || x.status === "cancelled").length, total: found.step.tasks.length }
        : null;
  const inherit =
    ref.kind === "task" && found.step
      ? parents.forTask(found.phase, found.step)
      : ref.kind === "step"
        ? parents.forStep(found.phase)
        : [];

  const commitName = () => {
    const next = name.trim();
    if (!next) {
      setName(item.name);
      return;
    }
    if (next !== item.name) onUpdate(ref, { name: next });
  };
  const commitDescription = () => {
    const next = description.trim() ? description : null;
    if ((next ?? "") !== (item.description ?? "")) onUpdate(ref, { description: next });
  };
  const idBase = `map-detail-${ref.kind}-${ref.id}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">
      {canEdit ? (
        <Input
          id={`${idBase}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setName(item.name);
          }}
          aria-label={t("mapPlan.detail.name")}
          className="h-9 border-transparent px-1 text-base font-semibold shadow-none hover:border-gray-200 focus:border-gray-300 dark:hover:border-gray-700"
          maxLength={255}
        />
      ) : (
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{item.name}</h3>
      )}

      <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-x-3 gap-y-3 text-sm">
        <Label htmlFor={`${idBase}-status`} className="text-xs text-gray-500 dark:text-gray-400">
          {t("mapPlan.detail.status")}
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit ? (
            <MapStatusSelect id={`${idBase}-status`} value={status} onChange={(s) => onUpdate(ref, { status: s })} />
          ) : (
            <MapStatusPill status={status} />
          )}
        </div>

        {rolled && rolled !== status && (
          <>
            <span />
            <div
              className="flex flex-wrap items-center gap-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
              data-testid="map-detail-rollup"
            >
              <span>{t(ref.kind === "phase" ? "mapPlan.detail.rollupPhase" : "mapPlan.detail.rollupStep")}</span>
              <MapStatusPill status={rolled} />
              {canEdit && (
                <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => onUpdate(ref, { status: rolled })}>
                  <Wand2 className="mr-1 h-3 w-3" />
                  {t("mapPlan.detail.useRollup")}
                </Button>
              )}
            </div>
          </>
        )}

        {progress && (
          <>
            <span className="text-xs text-gray-500 dark:text-gray-400">{t("mapPlan.detail.progress")}</span>
            <span className="text-sm text-gray-800 dark:text-gray-200">
              {t("mapPlan.stepper.progress", { done: progress.done, total: progress.total })}
            </span>
          </>
        )}

        <Label htmlFor={`${idBase}-start`} className="self-start pt-1 text-xs text-gray-500 dark:text-gray-400">
          {t("mapPlan.detail.dates")}
        </Label>
        {canEdit ? (
          <div className="grid grid-cols-2 gap-2" data-testid="map-detail-dates">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-[11px] text-gray-500 dark:text-gray-400">{t("mapPlan.detail.start")}</span>
              <Input
                id={`${idBase}-start`}
                type="date"
                className="h-8 w-full min-w-0"
                value={toDateInput(item.startDate)}
                aria-label={t("mapPlan.detail.start")}
                onChange={(e) => onUpdate(ref, { startDate: e.target.value ? fromDateInput(e.target.value) : null })}
              />
            </div>
            {ended && (
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[11px] text-gray-500 dark:text-gray-400">{t("mapPlan.detail.end")}</span>
                <Input
                  id={`${idBase}-end`}
                  type="date"
                  className="h-8 w-full min-w-0"
                  value={toDateInput(item.completedDate)}
                  aria-label={t("mapPlan.detail.end")}
                  onChange={(e) => onUpdate(ref, { completedDate: e.target.value ? fromDateInput(e.target.value) : null })}
                  data-testid="map-detail-end"
                />
              </div>
            )}
          </div>
        ) : (
          <span className="font-mono text-xs tabular-nums text-gray-800 dark:text-gray-200" data-testid="map-detail-dates">
            {item.startDate ? formatShortDate(item.startDate, i18n.language) : "—"}
            {ended && ` → ${item.completedDate ? formatShortDate(item.completedDate, i18n.language) : "—"}`}
          </span>
        )}

        <Label htmlFor={`${idBase}-due`} className="text-xs text-gray-500 dark:text-gray-400">
          {t("mapPlan.detail.due")}
        </Label>
        <div className="flex items-center gap-2" data-testid="map-detail-due">
          {canEdit ? (
            <Input
              id={`${idBase}-due`}
              type="date"
              className="h-8 w-[calc(50%-4px)] min-w-0"
              value={toDateInput(item.dueDate)}
              aria-label={t("mapPlan.detail.due")}
              onChange={(e) => onUpdate(ref, { dueDate: e.target.value ? fromDateInput(e.target.value) : null })}
            />
          ) : (
            <span className="font-mono text-xs tabular-nums text-gray-800 dark:text-gray-200">
              {item.dueDate ? formatShortDate(item.dueDate, i18n.language) : "—"}
            </span>
          )}
          <span className="text-xs">
            <MapDueVariance item={item} today={today} />
          </span>
        </div>

        {ref.kind === "phase" && journey && (
          <>
            <Label htmlFor={`${idBase}-stage`} className="text-xs text-gray-500 dark:text-gray-400">
              {t("valueJourney.map.stage")}
            </Label>
            <div>
              <MapPhaseStagePicker
                id={`${idBase}-stage`}
                stageId={found.phase.phase.stageId}
                canEdit={canEdit}
                onChange={(stageId) => onUpdate(ref, { stageId })}
              />
            </div>
          </>
        )}

        <span className="self-start pt-1 text-xs text-gray-500 dark:text-gray-400">{t("mapPlan.detail.people")}</span>
        <MapAssigneeChips
          item={item}
          parents={inherit}
          people={people}
          canEdit={canEdit}
          onAssign={(role, value) => onAssign(ref, role, value)}
        />
      </div>

      {ref.kind === "task" && <MapTaskCriteriaSection taskId={ref.id} canEdit={canEdit} />}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idBase}-description`} className="text-xs text-gray-500 dark:text-gray-400">
          {t("mapPlan.detail.description")}
        </Label>
        {canEdit ? (
          <Textarea
            id={`${idBase}-description`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={commitDescription}
            placeholder={t("mapPlan.detail.descriptionPlaceholder")}
            className="min-h-[80px] text-sm"
            maxLength={10_000}
          />
        ) : (
          <p className={cn("whitespace-pre-wrap text-sm", item.description ? "text-gray-800 dark:text-gray-200" : "text-gray-400 dark:text-gray-500")}>
            {item.description || t("mapPlan.detail.noDescription")}
          </p>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 text-[11px] text-gray-500 dark:border-gray-800 dark:text-gray-400">
        <span>
          {item.updatedAt && t("mapPlan.detail.updatedOn", { date: formatShortDate(item.updatedAt, i18n.language) })}
        </span>
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40"
            onClick={() => onDelete(ref)}
            data-testid="map-detail-delete"
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            {t("mapPlan.row.delete", { kind: t(`mapPlan.kind.${ref.kind}`) })}
          </Button>
        )}
      </div>
    </div>
  );
}
