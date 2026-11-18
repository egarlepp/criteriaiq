// Recent Activity on the Demo Mode page: the last 50 Demo Mode events
// (GET /api/demo/audit, server/lib/demo-events.ts) as a sortable table.
// Shows who did what, for whom, and what a seed or wipe added or removed,
// in the reader's language.
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  ChevronDown, ChevronUp, DatabaseZap, Globe, GlobeLock, MonitorOff, MonitorPlay,
  RefreshCw, Trash2, UserCheck, UserX, History,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SortableTableHead } from "@/components/ui/sortable-table";
import { sortRows, useUrlSortState } from "@/lib/sorting";
import { useDemoCountLabels, type DemoCountPart } from "./demo-count-labels";

interface DemoEventPerson {
  id: string;
  name: string;
  email: string | null;
}

export interface DemoEventView {
  id: number;
  action: string;
  createdAt: string | null;
  actor: DemoEventPerson | null;
  target: DemoEventPerson | null;
  counts: Record<string, number> | null;
  wiped: Record<string, number> | null;
}

const ACTION_ICONS: Record<string, LucideIcon> = {
  demo_session_enter: MonitorPlay,
  demo_session_exit: MonitorOff,
  demo_user_enter: UserCheck,
  demo_user_exit: UserX,
  demo_app_wide_enable: Globe,
  demo_app_wide_disable: GlobeLock,
  demo_seed: DatabaseZap,
  demo_reseed: RefreshCw,
  demo_wipe: Trash2,
};

const ACTION_TONES: Record<string, string> = {
  demo_seed: "border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300",
  demo_reseed: "border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300",
  demo_wipe: "border-red-300 text-red-700 dark:border-red-700 dark:text-red-300",
};

/** Accounts and projects lead the summary; other counts follow under Show all. */
const HEADLINE_KEYS = ["customers", "projects"];

function headline(parts: DemoCountPart[]): DemoCountPart[] {
  const lead = parts.filter((p) => HEADLINE_KEYS.includes(p.key));
  return lead.length > 0 ? lead : parts.slice(0, 2);
}

function CountLine({ label, parts, expanded }: { label: string; parts: DemoCountPart[]; expanded: boolean }) {
  const { t, i18n } = useTranslation();
  const format = (p: DemoCountPart) => `${p.count.toLocaleString(i18n.language)} ${p.label}`;
  if (parts.length === 0) {
    return (
      <div>
        <span className="font-medium text-foreground">{label}</span> {t("configuration.demoMode.noRowsChanged")}
      </div>
    );
  }
  if (!expanded) {
    return (
      <div>
        <span className="font-medium text-foreground">{label}</span> {headline(parts).map(format).join(", ")}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div className="font-medium text-foreground">{label}</div>
      <ul className="flex flex-wrap gap-1">
        {parts.map((p) => (
          <li
            key={p.key}
            className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-xs text-foreground dark:bg-muted/20"
          >
            {format(p)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EventDetails({ row }: { row: DemoEventView }) {
  const { t } = useTranslation();
  const { countParts } = useDemoCountLabels();
  const [expanded, setExpanded] = useState(false);
  const added = countParts(row.counts);
  const removed = countParts(row.wiped);

  switch (row.action) {
    case "demo_session_enter":
    case "demo_session_exit":
      return <span>{t("configuration.demoMode.activityOwnSession")}</span>;
    case "demo_user_enter":
    case "demo_user_exit":
      return row.target
        ? <span title={row.target.email ?? undefined}>{row.target.name}</span>
        : <span className="text-muted-foreground">—</span>;
    case "demo_app_wide_enable":
    case "demo_app_wide_disable":
      return <span>{t("configuration.demoMode.activityEveryone")}</span>;
    default:
      break;
  }

  if (!row.counts && !row.wiped) return <span className="text-muted-foreground">—</span>;
  const hidden = (row.wiped ? removed.length - headline(removed).length : 0)
    + (row.counts ? added.length - headline(added).length : 0);
  return (
    <div className="space-y-1">
      {row.wiped && <CountLine label={t("configuration.demoMode.activityRemoved")} parts={removed} expanded={expanded} />}
      {row.counts && <CountLine label={t("configuration.demoMode.activityAdded")} parts={added} expanded={expanded} />}
      {(hidden > 0 || expanded) && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded
            ? <><ChevronUp className="mr-1 h-3.5 w-3.5" />{t("configuration.demoMode.activityShowLess")}</>
            : <><ChevronDown className="mr-1 h-3.5 w-3.5" />{t("configuration.demoMode.activityShowAll", { hidden })}</>}
        </Button>
      )}
    </div>
  );
}

export default function DemoModeActivityTable() {
  const { t, i18n } = useTranslation();
  const [sort, handleSort] = useUrlSortState("demoActivity");
  const eventsQ = useQuery<DemoEventView[]>({ queryKey: ["/api/demo/audit"], retry: false });

  const actionLabel = useCallback(
    (action: string) => t(`configuration.demoMode.activityActions.${action}`, { defaultValue: action }),
    [t],
  );

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }),
    [i18n.language],
  );

  const rows = useMemo(
    () => sortRows(eventsQ.data ?? [], sort, {
      when: (r) => r.createdAt ?? "",
      action: (r) => actionLabel(r.action),
      by: (r) => r.actor?.name ?? "",
    }),
    [eventsQ.data, sort, actionLabel],
  );

  return (
    <div className="border rounded-md max-h-[32rem] overflow-auto" data-testid="demo-activity-table">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 sticky top-0">
          <tr>
            <SortableTableHead sortKey="when" sortConfig={sort} onSort={handleSort} className="h-auto w-px px-3 py-2 whitespace-nowrap">
              {t("configuration.demoMode.activityColWhen")}
            </SortableTableHead>
            <SortableTableHead sortKey="action" sortConfig={sort} onSort={handleSort} className="h-auto w-px px-3 py-2 whitespace-nowrap">
              {t("configuration.demoMode.activityColAction")}
            </SortableTableHead>
            <SortableTableHead sortKey="by" sortConfig={sort} onSort={handleSort} className="h-auto w-px px-3 py-2 whitespace-nowrap">
              {t("configuration.demoMode.activityColBy")}
            </SortableTableHead>
            <SortableTableHead sortable={false} className="h-auto px-3 py-2">
              {t("configuration.demoMode.activityColDetails")}
            </SortableTableHead>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const Icon = ACTION_ICONS[row.action] ?? History;
            return (
              <tr key={row.id} className="border-t align-top">
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                  {row.createdAt ? dateFormat.format(new Date(row.createdAt)) : "—"}
                </td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className={`gap-1 whitespace-nowrap ${ACTION_TONES[row.action] ?? ""}`}>
                    <Icon className="h-3.5 w-3.5" />
                    {actionLabel(row.action)}
                  </Badge>
                </td>
                <td className="px-3 py-2 whitespace-nowrap" title={row.actor?.email ?? undefined}>
                  {row.actor?.name ?? "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  <EventDetails row={row} />
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                {eventsQ.isLoading ? t("common.loading") : t("configuration.demoMode.activityEmpty")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
