// Geometry for the workspace roadmap (project page and Account Portal): where
// a bar or the "today" line sits along a date range, as a percentage of
// the track width, plus the month ticks along the top.
import { parseProjectDate } from "@/lib/date-utils";
import { isMapItemComplete } from "@shared/map-status";

const DAY_MS = 24 * 60 * 60 * 1000;

export type RoadmapTone = "done" | "now" | "next" | "late";

export interface RoadmapSegmentInput {
  key: string;
  label: string;
  start: string | Date | null | undefined;
  end: string | Date | null | undefined;
  tone: RoadmapTone;
  /** 0–100: the bar fills this far (plan tasks done); the rest is faded. */
  progress?: number | null;
  /** Shown at the left end of the bar: the project's current journey stage. */
  stage?: { iconName: string; color: string } | null;
  /** Tooltip; defaults to `label`. */
  title?: string;
}

export interface RoadmapRowInput {
  key: string;
  label: string;
  sublabel?: string;
  href?: string;
  /**
   * A round icon before the label (the Account Portal's customer status):
   * a Lucide icon name, white on `color`; `title` names it for screen readers.
   */
  badge?: { iconName: string; color: string; title: string };
  segments: RoadmapSegmentInput[];
}

export interface PlacedSegment extends RoadmapSegmentInput {
  left: number;
  width: number;
}

export interface PlacedRow extends Omit<RoadmapRowInput, "segments"> {
  segments: PlacedSegment[];
}

export interface RoadmapLayout {
  rows: PlacedRow[];
  /** Month starts inside the range, with their position. */
  months: Array<{ key: string; date: Date; left: number }>;
  /** Position of today, or null when today is outside the range. */
  todayLeft: number | null;
}

export function toRoadmapDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : parseProjectDate(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * Lays rows out on one shared date range: from the first day of the earliest
 * month any segment touches to the last day of the latest one, padded
 * to include today when today is within a month of the range. Segments with
 * a missing or reversed date are dropped; a one-day segment still gets a
 * visible width. Returns null when nothing has a date.
 */
export function layoutRoadmap(rows: RoadmapRowInput[], today: Date = new Date()): RoadmapLayout | null {
  const dates: Date[] = [];
  for (const row of rows) {
    for (const segment of row.segments) {
      const start = toRoadmapDate(segment.start);
      const end = toRoadmapDate(segment.end);
      if (start && end && end >= start) dates.push(start, end);
    }
  }
  if (dates.length === 0) return null;

  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let min = new Date(Math.min(...dates.map((d) => d.getTime())));
  let max = new Date(Math.max(...dates.map((d) => d.getTime())));
  if (todayDay < min && min.getTime() - todayDay.getTime() <= 31 * DAY_MS) min = todayDay;
  if (todayDay > max && todayDay.getTime() - max.getTime() <= 31 * DAY_MS) max = todayDay;

  const rangeStart = new Date(min.getFullYear(), min.getMonth(), 1);
  const rangeEnd = new Date(max.getFullYear(), max.getMonth() + 1, 1);
  const span = rangeEnd.getTime() - rangeStart.getTime();
  const pct = (date: Date) => clampPct(((date.getTime() - rangeStart.getTime()) / span) * 100);
  const minWidth = (DAY_MS / span) * 100;

  const placed: PlacedRow[] = rows.map((row) => ({
    key: row.key,
    label: row.label,
    sublabel: row.sublabel,
    badge: row.badge,
    href: row.href,
    segments: row.segments.flatMap((segment) => {
      const start = toRoadmapDate(segment.start);
      const end = toRoadmapDate(segment.end);
      if (!start || !end || end < start) return [];
      const left = pct(start);
      const right = pct(new Date(end.getTime() + DAY_MS));
      return [{ ...segment, left, width: Math.max(minWidth, right - left) }];
    }),
  }));

  const months: RoadmapLayout["months"] = [];
  for (let d = new Date(rangeStart); d < rangeEnd; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, date: d, left: pct(d) });
  }

  const todayLeft = todayDay >= rangeStart && todayDay < rangeEnd ? pct(new Date(todayDay.getTime() + DAY_MS / 2)) : null;
  return { rows: placed, months, todayLeft };
}

/** Bar tone for a MAP phase from its status and dates. */
export function phaseTone(status: string | null | undefined, due: string | Date | null | undefined, today: Date = new Date()): RoadmapTone {
  if (isMapItemComplete(status)) return "done";
  const dueDate = toRoadmapDate(due);
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (dueDate && dueDate < todayDay) return "late";
  if (status && status !== "not_started" && status !== "deferred" && status !== "cancelled") return "now";
  return "next";
}
