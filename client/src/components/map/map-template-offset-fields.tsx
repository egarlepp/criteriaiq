// "Starts after" / "Due after" working-day offsets on a MAP template phase,
// step or task. When a MAP is created from the template, each offset counts
// working days from its parent's start (the project start for phases), so
// weekends and holidays are skipped. See docs/features/working-calendar.md.
import { useTranslation } from "react-i18next";
import { CalendarClock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type OffsetLevel = "phase" | "step" | "task";

export interface OffsetValues {
  defaultStartOffsetDays?: number | null;
  defaultDueOffsetDays?: number | null;
}

/** Offsets as whole, non-negative numbers (start defaults to 0, due to 7). */
export function readOffsets(item: OffsetValues): { start: number; due: number } {
  return { start: item.defaultStartOffsetDays ?? 0, due: item.defaultDueOffsetDays ?? 7 };
}

/** Parses an offset input; empty or invalid input becomes 0. */
export function parseOffsetInput(value: string): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Working days from the MAP start to this item's start and due date, given
 * the start of its parent counted the same way (0 for a phase).
 */
export function absoluteOffsets(parentStart: number, item: OffsetValues): { start: number; due: number } {
  const { start, due } = readOffsets(item);
  return { start: parentStart + start, due: parentStart + Math.max(start, due) };
}

interface OffsetFieldsProps {
  level: OffsetLevel;
  item: OffsetValues;
  readonly?: boolean;
  onChange: (field: "defaultStartOffsetDays" | "defaultDueOffsetDays", value: number) => void;
  /** Grid classes for the help text cell. */
  helpClassName?: string;
}

export function MapTemplateOffsetFields({ level, item, readonly = false, onChange, helpClassName }: OffsetFieldsProps) {
  const { t } = useTranslation();
  const { start, due } = readOffsets(item);
  return (
    <>
      <div>
        <Label className="text-sm font-medium">{t("templates.mapTreeEditor.offsets.start")}</Label>
        <Input
          type="number"
          min={0}
          step={1}
          value={start}
          onChange={(e) => onChange("defaultStartOffsetDays", parseOffsetInput(e.target.value))}
          readOnly={readonly}
          className="mt-1"
        />
      </div>
      <div>
        <Label className="text-sm font-medium">{t("templates.mapTreeEditor.offsets.due")}</Label>
        <Input
          type="number"
          min={0}
          step={1}
          value={due}
          onChange={(e) => onChange("defaultDueOffsetDays", parseOffsetInput(e.target.value))}
          readOnly={readonly}
          className="mt-1"
        />
      </div>
      <p className={`flex items-start gap-1.5 self-end text-xs text-gray-600 dark:text-gray-400 ${helpClassName ?? ""}`}>
        <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{t(`templates.mapTreeEditor.offsets.help.${level}`)}</span>
      </p>
    </>
  );
}

/** Header chip: "WD 3–8", working days from the MAP start. */
export function MapTemplateScheduleChip({ start, due }: { start: number; due: number }) {
  const { t } = useTranslation();
  return (
    <span
      className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400"
      title={t("templates.mapTreeEditor.offsets.chipTitle")}
    >
      <CalendarClock className="h-3 w-3" />
      {t("templates.mapTreeEditor.offsets.chip", { start, due })}
    </span>
  );
}
