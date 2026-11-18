/**
 * Cell-level building blocks for the Manage Projects Table view
 * (manage-projects-table.tsx): the "sort by" field picker used by merged
 * columns, the compact Risk / Ranking pickers, the round status pills, the
 * R-Index badge, the competitor and coach markers, the engineer initials
 * and the End Date cell.
 */

import { useTranslation } from "react-i18next";
import { Bot, ChevronDown, Swords } from "lucide-react";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EndDateBadge } from "@/components/shared/end-date-badge";
import { StatusBadge, type StatusBadgeConfig } from "@/components/shared/StatusBadge";
import { formatDateForDisplay, getDateStatus, getStartDateStatus } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

export type TableDensity = "compact" | "comfortable";

export const TOOLTIP_CLASS =
  "bg-white dark:bg-gray-800 text-black dark:text-white text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 shadow-md";

const CLOSED_STATUSES = ["closed lost", "closed won", "cancelled"];

// ─── Sort field picker ──────────────────────────────────────────────────────

export interface SortFieldOption {
  key: string;
  label: string;
}

interface SortFieldMenuProps {
  options: readonly SortFieldOption[];
  activeKey: string;
  onPick: (key: string) => void;
}

/**
 * Small chevron menu shown next to a merged column's header label. Picking a
 * field makes the header sort by that field; the header's own arrow still
 * flips the direction.
 */
export function SortFieldMenu({ options, activeKey, onPick }: SortFieldMenuProps) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("projects.manageTable.sortBy")}
          className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-gray-200 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary dark:hover:bg-gray-700"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[180px]">
        <DropdownMenuLabel className="text-xs text-muted-foreground">{t("projects.manageTable.sortBy")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={activeKey} onValueChange={onPick}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.key} value={option.key} className="text-sm">
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Risk / Ranking picker ──────────────────────────────────────────────────

export interface FieldConfigOption {
  name: string;
  color?: string | null;
  icon?: string | null;
}

interface ConfigPickerProps {
  value: string;
  options: readonly FieldConfigOption[];
  ariaLabel: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

function ConfigOptionLabel({ option }: { option: FieldConfigOption }) {
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <DynamicIcon
        name={option.icon || "CircleDot"}
        className="h-3.5 w-3.5 shrink-0"
        style={{ color: option.color ?? undefined }}
      />
      <span>{option.name}</span>
    </div>
  );
}

/**
 * Compact chip-sized Select for a Field-Settings-driven value (Risk Level,
 * Ranking). Icons and colors come from the admin's configuration, so the
 * table matches Configuration › Field Settings.
 */
export function ConfigPicker({ value, options, ariaLabel, disabled, onChange }: ConfigPickerProps) {
  const current =
    options.find((o) => o.name.toLowerCase() === value.toLowerCase()) ?? { name: value, color: null, icon: null };
  const list = options.some((o) => o.name.toLowerCase() === value.toLowerCase()) ? options : [current, ...options];
  return (
    <Select value={current.name} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        aria-label={ariaLabel}
        className="h-7 w-auto gap-1.5 rounded-md px-2 text-xs bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 [&>svg]:h-3 [&>svg]:w-3"
      >
        <ConfigOptionLabel option={current} />
      </SelectTrigger>
      <SelectContent>
        {list.map((option) => (
          <SelectItem key={option.name} value={option.name} className="text-sm">
            <ConfigOptionLabel option={option} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Engineers ──────────────────────────────────────────────────────────────

export interface EngineerRef {
  id: number;
  name: string;
  firstName?: string;
  lastName?: string;
}

export function engineerName(engineer?: EngineerRef | null): string {
  if (!engineer) return "";
  const full = [engineer.firstName, engineer.lastName].filter(Boolean).join(" ").trim();
  return full || engineer.name || "";
}

function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter((p) => p && !p.startsWith("("));
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

function EngineerAvatar({ name, roleLabel, tone }: { name: string; roleLabel: string; tone: "primary" | "specialist" }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label={roleLabel}
          className={cn(
            "inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold cursor-default",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
            tone === "primary"
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
              : "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
          )}
        >
          {initialsOf(name)}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className={TOOLTIP_CLASS}>
        {roleLabel}
      </TooltipContent>
    </Tooltip>
  );
}

export function EngineersCell({ primary, specialist }: { primary?: EngineerRef; specialist?: EngineerRef }) {
  const { t } = useTranslation();
  const primaryName = engineerName(primary);
  const specialistName = engineerName(specialist);
  if (!primaryName && !specialistName) {
    return <span className="text-xs text-gray-400 dark:text-gray-500">{t("projects.manageTable.noEngineers")}</span>;
  }
  return (
    <div className="flex items-center gap-1">
      {primaryName && (
        <EngineerAvatar
          name={primaryName}
          tone="primary"
          roleLabel={t("projects.manageTable.primaryEngineer", { name: primaryName })}
        />
      )}
      {specialistName && (
        <EngineerAvatar
          name={specialistName}
          tone="specialist"
          roleLabel={t("projects.manageTable.specialistEngineer", { name: specialistName })}
        />
      )}
    </div>
  );
}

// ─── End date ───────────────────────────────────────────────────────────────

interface EndDateCellProps {
  endDate?: string;
  startDate?: string;
  status?: string;
  timezone?: string;
}

export function EndDateCell({ endDate, startDate, status, timezone }: EndDateCellProps) {
  const { t } = useTranslation();
  if (!endDate) {
    return <span className="text-xs text-gray-400 dark:text-gray-500">{t("projects.manageTable.notSet")}</span>;
  }
  const tz = timezone || "America/New_York";
  const isClosed = !!status && CLOSED_STATUSES.includes(status.toLowerCase());

  let sub: { text: string; className: string } | null = null;
  if (isClosed && startDate) {
    const days = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 3600 * 24));
    sub = { text: t("dashboard.table.daysDuration", { count: days }), className: "text-gray-500 dark:text-gray-400" };
  } else {
    const startStatus = startDate ? getStartDateStatus(startDate, tz) : null;
    const endStatus = startStatus ?? getDateStatus(endDate, tz);
    sub = { text: endStatus.statusText, className: endStatus.statusClass };
  }

  return (
    <div className="flex flex-col items-start leading-tight">
      <div className="flex items-center gap-1">
        <span className="text-sm tabular-nums text-gray-900 dark:text-gray-100">{formatDateForDisplay(endDate, timezone)}</span>
        <EndDateBadge endDate={endDate} projectStatus={status} targetField="project.endDate" />
      </div>
      {sub && <span className={cn("text-[11px]", sub.className)}>{sub.text}</span>}
    </div>
  );
}

// ─── Solutions ──────────────────────────────────────────────────────────────

/** The stored solutionName may be a JSON array, a comma list or one name. */
export function splitSolutions(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean);
  const text = String(raw);
  try {
    const parsed: unknown = JSON.parse(text);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr.map((s) => String(s).trim()).filter(Boolean);
  } catch {
    if (text.includes(",")) return text.split(",").map((s) => s.trim()).filter(Boolean);
    const trimmed = text.trim();
    return trimmed ? [trimmed] : [];
  }
}

// ─── Row markers: ProjectIQ coach, competitors ─────────────────────────────

const MARKER_BUTTON =
  "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary";

/** Opens the project's ProjectIQ Coach tab. Rendered only when the project has coaching. */
export function CoachMarker({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation();
  const label = t("projects.manageTable.coach.open");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onOpen}
          className={cn(MARKER_BUTTON, "text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950")}
        >
          <Bot className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className={TOOLTIP_CLASS}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/** Swords marker whose hover lists how many competitors are on the deal, and who. */
export function CompetitorsMarker({ count, names }: { count: number; names: readonly string[] }) {
  const { t } = useTranslation();
  const heading = t("projects.manageTable.competing", { count });
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} aria-label={names.length > 0 ? `${heading}: ${names.join(", ")}` : heading} className={cn(MARKER_BUTTON, "cursor-default")}>
          <Swords className="h-3 w-3 text-amber-500 dark:text-amber-400" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className={cn(TOOLTIP_CLASS, "max-w-[16rem]")}>
        <p className="font-semibold">{heading}</p>
        {names.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {names.map((name) => (
              <li key={name} className="flex items-center gap-1.5">
                <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-amber-500 dark:bg-amber-400" />
                <span className="truncate">{name}</span>
              </li>
            ))}
          </ul>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/** A stored timestamp (ISO) as a short date in the viewer's language and time zone. */
function useFormatInstant(timezone?: string): (iso: string | null | undefined) => string | null {
  const { i18n } = useTranslation();
  return (iso) => {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    try {
      return date.toLocaleDateString(i18n.language || "en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        timeZone: timezone || undefined,
      });
    } catch {
      return date.toLocaleDateString(i18n.language || "en-US", { year: "numeric", month: "short", day: "2-digit" });
    }
  };
}

// ─── Status (round pill) ────────────────────────────────────────────────────

export interface StatusChangeRef {
  by: string | null;
  at: string | null;
}

interface StatusPillProps {
  kind: "internal" | "account";
  config?: StatusBadgeConfig;
  label: string | null;
  change?: StatusChangeRef | null;
  timezone?: string;
  fallbackColor?: string;
}

/**
 * Button-sized round pill: the status icon on its Field Settings color. The
 * hover names the status and who set it, and when (from the project's audit
 * history).
 */
export function StatusPill({ kind, config, label, change, timezone, fallbackColor }: StatusPillProps) {
  const { t } = useTranslation();
  const formatInstant = useFormatInstant(timezone);
  const name = label ?? config?.name ?? null;
  const heading = t(kind === "internal" ? "projects.manageTable.statusPill.internal" : "projects.manageTable.statusPill.account", {
    status: name ?? t("projects.manageTable.notSet"),
  });
  let attribution: string | null = null;
  if (name) {
    const date = formatInstant(change?.at);
    if (change?.by && date) attribution = t("projects.manageTable.statusPill.setByOn", { name: change.by, date });
    else if (change?.by) attribution = t("projects.manageTable.statusPill.setBy", { name: change.by });
    else if (date) attribution = t("projects.manageTable.statusPill.setOn", { date });
    else attribution = t("projects.manageTable.statusPill.noHistory");
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label={attribution ? `${heading}. ${attribution}` : heading}
          className="inline-flex rounded-full cursor-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          <StatusBadge config={config} label={name} size="sm" iconOnly hideWhenEmpty={false} fallbackColor={fallbackColor} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className={TOOLTIP_CLASS}>
        <p className="font-semibold">{heading}</p>
        {attribution && <p className="text-gray-600 dark:text-gray-300">{attribution}</p>}
      </TooltipContent>
    </Tooltip>
  );
}

// ─── R-Index ────────────────────────────────────────────────────────────────

export interface RIndexInfo {
  score: number;
  level: string;
  /** 0–1 from the latest run; null when the run didn't report one. */
  confidence: number | null;
  /** ISO time of the latest run. */
  runAt: string | null;
}

function rIndexBadgeClass(score: number): string {
  if (score >= 75) return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  if (score >= 50) return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
  if (score >= 25) return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
  return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
}

/** R-Index score badge; hover shows score, last run and confidence, click opens the assessment drawer. */
export function RIndexBadge({ info, timezone, onOpen }: { info: RIndexInfo; timezone?: string; onOpen: () => void }) {
  const { t } = useTranslation();
  const formatInstant = useFormatInstant(timezone);
  const score = Math.round(info.score);
  const lastRun = formatInstant(info.runAt) ?? t("projects.manageTable.notSet");
  const confidence = info.confidence !== null ? `${Math.round(info.confidence * 100)}%` : t("projects.manageTable.rIndexHover.notReported");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={t("projects.manageTable.rIndexHover.aria", { score })}
          onClick={onOpen}
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums transition-opacity hover:opacity-80",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
            rIndexBadgeClass(score),
          )}
        >
          {score}%
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className={cn(TOOLTIP_CLASS, "space-y-0.5")}>
        <p className="font-semibold">{t("projects.manageTable.rIndexHover.score", { score })}</p>
        <p>{t("projects.manageTable.rIndexHover.lastRun", { date: lastRun })}</p>
        <p>{t("projects.manageTable.rIndexHover.confidence", { value: confidence })}</p>
        <p className="pt-1 text-gray-500 dark:text-gray-400">{t("projects.manageTable.rIndexHover.click")}</p>
      </TooltipContent>
    </Tooltip>
  );
}
