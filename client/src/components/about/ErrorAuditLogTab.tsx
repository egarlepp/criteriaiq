import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showInfoToast, showSuccessToast } from "@/lib/toast-helper";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  SortableTable,
  SortableTableHeader,
  SortableTableHead,
  SortableTableBody,
  SortableTableRow,
  SortableTableCell
} from "@/components/ui/sortable-table";
import { useSortState, makeComparator, stableSort } from "@/lib/sorting";
import { TablePaginationFooter } from "@/components/ui/table-pagination-footer";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
// Severity Shield icons now live in @/lib/error-severity (SEVERITY_CONFIG.icon),
// so they're no longer imported here. Layers/Users/ChevronRight + Checkbox are
// for the v2 "Group identical" UI.
import { AlertTriangle, Trash2, RefreshCw, Bug, Clock, Copy, PocketKnife, Layers, Users, ChevronRight, Download, CheckCircle2 } from "lucide-react";
import { filterErrorLogs, buildErrorLogJson, downloadJsonFile, type ErrorLogFilters } from "./error-audit-log-utils";
import type { SeverityLevel } from "@/lib/error-severity";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDistanceToNow, format } from "date-fns";
import { SupportFeatureDialog } from "@/components/support/support-feature-dialog";
import {
  classifyErrorSeverity,
  SEVERITY_CONFIG,
  type ErrorClassification,
} from "@/lib/error-severity";

interface ClientErrorLogUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

interface ClientErrorLog {
  id: number;
  errorId: string;
  timestamp: string;
  context: string | null;
  userId: string | null;
  message: string | null;
  stack: string | null;
  url: string | null;
  userAgent: string | null;
  details: any;
  /**
   * Resolved user — server-side leftJoin on `client_error_logs.user_id
   * = users.id`. `null` for anonymous errors, errors captured against
   * the literal `'Anonymous'` sentinel, or errors whose user has since
   * been deleted. Frontend falls back to the raw `userId` string (or
   * "Anonymous"/"—") in those cases.
   */
  user: ClientErrorLogUser | null;
  // --- Error Audit Log v2 fields (may be null on older rows) ---
  /** Build the error came from, e.g. "v0.7.50". */
  appVersion?: string | null;
  /** HTTP status for API/query errors. */
  httpStatus?: number | null;
  /** sha256 fingerprint; identical errors share it. */
  errorHash?: string | null;
}

/** Breadcrumb entry shape inside `details.breadcrumbs` (best-effort). */
interface ErrorBreadcrumb {
  t: string;
  type: string;
  detail: string;
}

/** Console buffer entry shape inside `details.consoleLogs` (best-effort). */
interface ErrorConsoleLog {
  t: string;
  level: string;
  text: string;
}

/**
 * Defensively extract a string field from a possibly-null/any `details`
 * blob. Returns null unless the value is a non-empty string.
 */
function detailString(details: any, key: string): string | null {
  if (!details || typeof details !== "object") return null;
  const v = (details as Record<string, unknown>)[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Defensively extract `details.breadcrumbs` as a typed array (or []). */
function getBreadcrumbs(details: any): ErrorBreadcrumb[] {
  if (!details || typeof details !== "object" || !Array.isArray(details.breadcrumbs)) return [];
  return (details.breadcrumbs as unknown[])
    .filter((b): b is Record<string, unknown> => !!b && typeof b === "object")
    .map(b => ({
      t: typeof b.t === "string" ? b.t : "",
      type: typeof b.type === "string" ? b.type : "",
      detail: typeof b.detail === "string" ? b.detail : "",
    }));
}

/** Defensively extract `details.consoleLogs` as a typed array (or []). */
function getConsoleLogs(details: any): ErrorConsoleLog[] {
  if (!details || typeof details !== "object" || !Array.isArray(details.consoleLogs)) return [];
  return (details.consoleLogs as unknown[])
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map(c => ({
      t: typeof c.t === "string" ? c.t : "",
      level: typeof c.level === "string" ? c.level : "",
      text: typeof c.text === "string" ? c.text : "",
    }));
}

/**
 * Tailwind classes for the HTTP status badge: red-ish for 5xx, amber
 * for 4xx, neutral otherwise. Both light + dark variants.
 */
function httpStatusBadgeClass(status: number): string {
  if (status >= 500) return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border-red-300 dark:border-red-800";
  if (status >= 400) return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-800";
  return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-300 dark:border-gray-700";
}

/**
 * Pick the best human-readable label for the User column. Falls
 * through "first last" → "first" → email → raw user id → "Anonymous"
 * → "—". The raw id is the same one the row was originally captured
 * with (e.g. `user_1778517437101_p…`), still useful as a
 * disambiguator when no resolved user is available.
 */
function userDisplayName(log: ClientErrorLog): string {
  const u = log.user;
  if (u) {
    const fullName = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
    if (fullName.length > 0) return fullName;
    if (u.email) return u.email;
  }
  const raw = (log.userId ?? '').trim();
  if (!raw) return '—';
  if (raw.toLowerCase() === 'anonymous') return 'Anonymous';
  return raw;
}

/**
 * Stable empty-array reference for the `useQuery` destructuring
 * default below. Using `data: errorLogs = []` would allocate a fresh
 * `[]` on every render while the query is pending, which makes the
 * downstream `useMemo` for `uniqueContexts` re-compute, which makes
 * the propagation `useEffect` fire, which calls the parent's
 * `setErrorUniqueContexts(...)` setter, which re-renders this
 * component — and the loop repeats until React's
 * max-update-depth circuit breaker trips with "Maximum update depth
 * exceeded". Hoisting the empty array to module scope makes the
 * fallback reference stable so the chain doesn't fire while data is
 * still loading.
 */
const EMPTY_ERROR_LOGS: ClientErrorLog[] = [];

function buildSupportTitle(log: ClientErrorLog): string {
  const ctx = log.context ? `[${log.context}] ` : "";
  const msg = log.message || "Unknown error";
  const short = msg.length > 80 ? msg.substring(0, 77) + "..." : msg;
  return `${ctx}${short}`;
}

function buildSupportDescription(log: ClientErrorLog, classification: ErrorClassification): string {
  const lines = [
    `**Error ID:** ${log.errorId}`,
    `**Severity:** ${SEVERITY_CONFIG[classification.severity].label}`,
    `**Impact:** ${classification.impact}`,
    `**Timestamp:** ${log.timestamp ? format(new Date(log.timestamp), "PPpp") : "-"}`,
    `**User:** ${userDisplayName(log)}${log.user?.email && log.user.email !== userDisplayName(log) ? ` (${log.user.email})` : ''}${log.userId ? ` — id: ${log.userId}` : ''}`,
    `**Context:** ${log.context || "-"}`,
    `**URL:** ${log.url || "-"}`,
    "",
    `**Error Message:**`,
    log.message || "-",
  ];
  if (log.stack) {
    lines.push("", "**Stack Trace:**", log.stack);
  }
  return lines.join("\n");
}

/**
 * A grouped view of error logs sharing the same `errorHash`. `rep` is
 * the most-recent occurrence (used as the representative row + the one
 * shown when expanded). `count` is the total occurrences and
 * `distinctUsers` the number of distinct identities that hit it.
 * `occurrences` lists every member, newest-first.
 */
interface GroupedLog {
  rep: ClientErrorLog;
  count: number;
  distinctUsers: number;
  occurrences: ClientErrorLog[];
}

/**
 * Collapse logs sharing a non-null `errorHash` into a single
 * `GroupedLog`. Rows with a null/empty hash are emitted as singleton
 * groups (never merged). Within each group the representative is the
 * most-recent occurrence by timestamp. The returned list preserves the
 * input order of each group's representative so downstream sorting can
 * reorder as usual.
 */
function groupByHash(logs: ClientErrorLog[]): GroupedLog[] {
  const groups = new Map<string, ClientErrorLog[]>();
  const singletons: GroupedLog[] = [];

  for (const log of logs) {
    const hash = (log.errorHash ?? "").trim();
    if (!hash) {
      singletons.push({ rep: log, count: 1, distinctUsers: distinctUserCount([log]), occurrences: [log] });
      continue;
    }
    const arr = groups.get(hash);
    if (arr) arr.push(log);
    else groups.set(hash, [log]);
  }

  const grouped: GroupedLog[] = [];
  for (const arr of groups.values()) {
    const occurrences = [...arr].sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tb - ta; // newest first
    });
    grouped.push({
      rep: occurrences[0],
      count: occurrences.length,
      distinctUsers: distinctUserCount(occurrences),
      occurrences,
    });
  }

  return [...grouped, ...singletons];
}

/** Count distinct user identities across a set of logs. */
function distinctUserCount(logs: ClientErrorLog[]): number {
  const ids = new Set<string>();
  for (const log of logs) {
    const id = (log.user?.id ?? log.userId ?? "").trim().toLowerCase();
    ids.add(id || "anonymous");
  }
  return ids.size;
}

interface ErrorAuditLogTabProps {
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  contextFilter: string;
  setContextFilter: (v: string) => void;
  /** Other filter dimensions added in v0.7.52. All optional so existing callers compile. */
  versionFilter?: string;
  urlFilter?: string;
  severityFilter?: SeverityLevel | "all";
  userFilter?: string;
  dateFrom?: string;
  dateTo?: string;
  /**
   * Callback fired whenever the raw `errorLogs` array changes — used by
   * the parent to derive the filter-dropdown options (contexts,
   * versions, URLs, users). Receives the full row list so the parent
   * can run `extractErrorLogFacets` itself instead of pre-deriving here.
   */
  onLogsChange?: (logs: ClientErrorLog[]) => void;
  /** Legacy callback retained for backwards compatibility — see `onLogsChange`. */
  onContextsChange: (contexts: string[]) => void;
}

export function ErrorAuditLogTab({
  searchTerm,
  setSearchTerm,
  contextFilter,
  setContextFilter,
  versionFilter = "all",
  urlFilter = "all",
  severityFilter = "all",
  userFilter = "all",
  dateFrom = "",
  dateTo = "",
  onLogsChange,
  onContextsChange,
}: ErrorAuditLogTabProps) {
  
  const queryClient = useQueryClient();
  const { sortConfig, handleSort } = useSortState({ key: "timestamp", direction: "desc" });

  const [currentPage, setCurrentPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [supportDialogLog, setSupportDialogLog] = useState<ClientErrorLog | null>(null);
  const [groupIdentical, setGroupIdentical] = useState(false);
  const itemsPerPage = 15;

  const { data, isLoading, isError } = useQuery<ClientErrorLog[]>({
    queryKey: ["/api/error-logs"],
    queryFn: () => apiRequest("GET", "/api/error-logs?limit=500"),
    refetchInterval: 60000,
  });
  // Fall back to the module-level constant rather than a fresh `[]`
  // literal so the reference is stable across renders — see the
  // EMPTY_ERROR_LOGS doc comment for why this matters.
  const errorLogs = data ?? EMPTY_ERROR_LOGS;

  const clearMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/error-logs"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/error-logs"] });
      // Also bust the cached count so the KPI tile on the parent
      // Support & Features header refreshes immediately instead of
      // waiting for its 60s refetch interval.
      queryClient.invalidateQueries({ queryKey: ["/api/error-logs/count"] });
      showSuccessToast("Error Logs Cleared", "All error logs have been removed.");
    },
    onError: () => {
      showErrorToast("Clear Failed", "Could not clear error logs.");
    },
  });

  const uniqueContexts = useMemo(() => {
    const contexts = [...new Set(errorLogs.map(l => l.context).filter(Boolean))];
    return contexts.sort();
  }, [errorLogs]);

  // Idempotent propagation — only call the parent's setter when the
  // contents of `uniqueContexts` actually change, not just its array
  // identity. The 60-second refetchInterval rebuilds `errorLogs` (and
  // thus `uniqueContexts`) on a fresh array reference every cycle, so
  // an identity-only diff here would re-render the parent each minute
  // for no visible reason. The string key also defends against
  // future regressions in the upstream memoization chain.
  const lastSentContextsKeyRef = useRef<string>("");
  useEffect(() => {
    const key = (uniqueContexts as string[]).join("|");
    if (key !== lastSentContextsKeyRef.current) {
      lastSentContextsKeyRef.current = key;
      onContextsChange(uniqueContexts as string[]);
    }
  }, [uniqueContexts, onContextsChange]);

  // Filter is delegated to a shared helper so the analytics panel can
  // apply the EXACT same logic against the same row set — see
  // `client/src/components/about/error-audit-log-utils.ts`.
  const filterCriteria: ErrorLogFilters = useMemo(
    () => ({
      searchTerm,
      contextFilter,
      versionFilter,
      urlFilter,
      severityFilter,
      userFilter,
      dateFrom,
      dateTo,
    }),
    [searchTerm, contextFilter, versionFilter, urlFilter, severityFilter, userFilter, dateFrom, dateTo]
  );
  const filteredLogs = useMemo(
    () => filterErrorLogs(errorLogs, filterCriteria),
    [errorLogs, filterCriteria]
  );

  // Propagate the raw, unfiltered logs to the parent so it can derive
  // every dropdown's available options. The 60s refetchInterval would
  // otherwise notify on a fresh array reference each cycle, so we
  // diff by length-and-first-id to avoid pointless parent re-renders.
  const lastLogsKeyRef = useRef<string>("");
  useEffect(() => {
    if (!onLogsChange) return;
    const key = `${errorLogs.length}|${errorLogs[0]?.id ?? ""}|${errorLogs[errorLogs.length - 1]?.id ?? ""}`;
    if (key !== lastLogsKeyRef.current) {
      lastLogsKeyRef.current = key;
      onLogsChange(errorLogs);
    }
  }, [errorLogs, onLogsChange]);

  // Build the display rows as `GroupedLog`s in both modes so the table
  // has a single rendering path. When grouping is OFF every row is a
  // singleton group (count 1); when ON, rows sharing a non-null
  // `errorHash` collapse into one. Either way we sort by the
  // representative log so the existing `makeComparator` keys (timestamp,
  // errorId, context, message, url …) keep working unchanged.
  const groupedRows = useMemo<GroupedLog[]>(() => {
    if (groupIdentical) return groupByHash(filteredLogs);
    return filteredLogs.map(log => ({ rep: log, count: 1, distinctUsers: 1, occurrences: [log] }));
  }, [filteredLogs, groupIdentical]);

  const sortedGroups = useMemo<GroupedLog[]>(() => {
    const comparator = makeComparator<ClientErrorLog>(sortConfig);
    return stableSort(groupedRows.map(g => g.rep), comparator)
      // Re-attach group metadata after sorting the representatives.
      .map(rep => groupedRows.find(g => g.rep === rep)!)
      .filter(Boolean);
  }, [groupedRows, sortConfig]);

  const totalGroups = sortedGroups.length;

  const paginatedGroups = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedGroups.slice(start, start + itemsPerPage);
  }, [sortedGroups, currentPage]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      showInfoToast("Copied", "Copied to clipboard.");
    });
  };

  const truncate = (text: string | null, max: number) => {
    if (!text) return "-";
    return text.length > max ? text.substring(0, max) + "..." : text;
  };

  const supportDialogClassification = supportDialogLog ? classifyErrorSeverity(supportDialogLog.message, supportDialogLog.context) : null;

  return (
    <div className="space-y-4">
      <Card className="border border-gray-200 dark:border-gray-800 relative overflow-hidden">
        <DecorativeCardIcon icon={Bug} />
        <CardHeader className="pb-2 relative z-10">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Bug className="h-5 w-5 text-red-500" />
                Client Error Audit Log
              </CardTitle>
              <CardDescription>
                Persisted client-side errors for production debugging and audit review
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/error-logs"] })}
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => clearMutation.mutate()}
                disabled={clearMutation.isPending || errorLogs.length === 0}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Clear All
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2 mt-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="flex items-center justify-center py-8 text-red-500">
              <AlertTriangle className="h-5 w-5 mr-2" />
              Failed to load error logs
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Bug className="h-10 w-10 mb-2 opacity-30" />
              <p className="text-sm">No error logs found</p>
            </div>
          ) : (
            <>
              <div className="mt-4 mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {groupIdentical ? (
                    <>Showing {paginatedGroups.length} of {totalGroups} group{totalGroups !== 1 ? "s" : ""} ({filteredLogs.length} error{filteredLogs.length !== 1 ? "s" : ""})</>
                  ) : (
                    <>Showing {paginatedGroups.length} of {filteredLogs.length} error{filteredLogs.length !== 1 ? "s" : ""}</>
                  )}
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                  <Checkbox
                    checked={groupIdentical}
                    onCheckedChange={(checked) => {
                      setGroupIdentical(checked === true);
                      setExpandedRow(null);
                      setCurrentPage(1);
                    }}
                    aria-label="Group identical errors"
                  />
                  <Layers className="h-3.5 w-3.5 text-gray-400" />
                  Group identical
                </label>
              </div>
              <SortableTable>
                <SortableTableHeader>
                  <SortableTableRow>
                    <SortableTableHead
                      sortKey="timestamp"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      className="w-[140px]"
                    >
                      Time
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="errorId"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      className="w-[140px]"
                    >
                      Error ID
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="userId"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      className="w-[100px]"
                    >
                      User
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey=""
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      sortable={false}
                      className="w-[100px]"
                    >
                      Severity
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="context"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      className="w-[140px]"
                    >
                      Context
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="appVersion"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      className="w-[90px]"
                    >
                      Version
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="message"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    >
                      Message
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="url"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      className="w-[160px]"
                    >
                      URL
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey=""
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      sortable={false}
                      className="w-[170px]"
                    >
                      Actions
                    </SortableTableHead>
                  </SortableTableRow>
                </SortableTableHeader>
                <SortableTableBody>
                  {paginatedGroups.map(group => {
                    const log = group.rep;
                    const isGrouped = groupIdentical && group.count > 1;
                    const classification = classifyErrorSeverity(log.message, log.context, log.details);
                    const config = SEVERITY_CONFIG[classification.severity];
                    const SeverityIcon = config.icon;
                    return (
                    <TooltipProvider key={log.id}>
                      <SortableTableRow
                        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                        onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                      >
                        <SortableTableCell className="text-xs whitespace-nowrap">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3 text-gray-400" />
                                {log.timestamp
                                  ? formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })
                                  : "-"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
                              {log.timestamp ? format(new Date(log.timestamp), "PPpp") : "-"}
                            </TooltipContent>
                          </Tooltip>
                        </SortableTableCell>
                        <SortableTableCell className="text-xs font-mono">
                          <div className="flex items-center gap-1">
                            <span className="truncate max-w-[110px]">{truncate(log.errorId, 18)}</span>
                            <button
                              onClick={e => { e.stopPropagation(); copyToClipboard(log.errorId); }}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          </div>
                        </SortableTableCell>
                        <SortableTableCell className="text-xs">
                          <span
                            title={log.userId ?? undefined}
                            data-testid={`error-log-user-${log.id}`}
                          >
                            {truncate(userDisplayName(log), 24)}
                          </span>
                        </SortableTableCell>
                        <SortableTableCell>
                          <div className="flex flex-col items-start gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className={`text-xs font-medium gap-1 ${config.badgeClass}`}>
                                  <SeverityIcon className="h-3 w-3" />
                                  {config.label}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="bg-white dark:bg-gray-900 text-black dark:text-gray-100 text-xs px-3 py-2 border border-gray-200 dark:border-gray-700 shadow-md max-w-xs">
                                <p className="font-semibold mb-1">{config.label} Severity</p>
                                <p className="text-gray-600 dark:text-gray-400">{classification.impact}</p>
                              </TooltipContent>
                            </Tooltip>
                            {classification.selfRecovered ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-medium px-1.5 py-0 gap-0.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800"
                                  >
                                    <CheckCircle2 className="h-2.5 w-2.5" />
                                    Self-recovered
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="bg-white dark:bg-gray-900 text-black dark:text-gray-100 text-xs px-3 py-2 border border-gray-200 dark:border-gray-700 shadow-md max-w-xs">
                                  The frontend's retry path handled this automatically — typically a mid-deploy HTML-instead-of-JSON response. No user impact occurred.
                                </TooltipContent>
                              </Tooltip>
                            ) : null}
                            {typeof log.httpStatus === "number" ? (
                              <Badge variant="outline" className={`text-[10px] font-mono font-medium px-1.5 py-0 ${httpStatusBadgeClass(log.httpStatus)}`}>
                                HTTP {log.httpStatus}
                              </Badge>
                            ) : null}
                          </div>
                        </SortableTableCell>
                        <SortableTableCell>
                          {log.context ? (
                            <Badge variant="outline" className="text-xs font-normal">
                              {truncate(log.context, 20)}
                            </Badge>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </SortableTableCell>
                        <SortableTableCell className="text-xs">
                          {log.appVersion ? (
                            <Badge variant="outline" className="text-[10px] font-mono font-normal px-1.5 py-0 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-700">
                              {log.appVersion}
                            </Badge>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500">—</span>
                          )}
                        </SortableTableCell>
                        <SortableTableCell className="text-xs max-w-[280px]">
                          <div>
                            <div className="flex items-center gap-1.5">
                              {isGrouped ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="outline" className="text-[10px] font-medium px-1.5 py-0 gap-0.5 bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800 shrink-0">
                                      <Layers className="h-2.5 w-2.5" />
                                      ×{group.count}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="bg-white dark:bg-gray-900 text-black dark:text-gray-100 text-xs px-3 py-2 border border-gray-200 dark:border-gray-700 shadow-md">
                                    {group.count} occurrence{group.count !== 1 ? "s" : ""} · {group.distinctUsers} user{group.distinctUsers !== 1 ? "s" : ""}
                                  </TooltipContent>
                                </Tooltip>
                              ) : null}
                              {isGrouped ? (
                                <Badge variant="outline" className="text-[10px] font-normal px-1.5 py-0 gap-0.5 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-700 shrink-0">
                                  <Users className="h-2.5 w-2.5" />
                                  {group.distinctUsers}
                                </Badge>
                              ) : null}
                              <span className="line-clamp-1">{truncate(log.message, 100)}</span>
                            </div>
                            <span className="block text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-1 italic">{classification.impact}</span>
                          </div>
                        </SortableTableCell>
                        <SortableTableCell className="text-xs">
                          {log.url ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="truncate block max-w-[140px]">
                                  {(() => { try { return new URL(log.url).pathname; } catch { return log.url; } })()}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md max-w-sm break-all">
                                {log.url}
                              </TooltipContent>
                            </Tooltip>
                          ) : "-"}
                        </SortableTableCell>
                        <SortableTableCell>
                          <div className="flex items-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  aria-label="Download error as JSON"
                                  onClick={e => {
                                    e.stopPropagation();
                                    const payload = buildErrorLogJson(log);
                                    downloadJsonFile(`error_${log.errorId || log.id}.json`, payload);
                                  }}
                                >
                                  <Download className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                Download as JSON (for AI / debugging)
                              </TooltipContent>
                            </Tooltip>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs whitespace-nowrap"
                              onClick={e => {
                                e.stopPropagation();
                                setSupportDialogLog(log);
                              }}
                            >
                              <PocketKnife className="h-3 w-3 mr-1" />
                              File as Support Request
                            </Button>
                          </div>
                        </SortableTableCell>
                      </SortableTableRow>
                      {expandedRow === log.id && (
                        <SortableTableRow>
                          <SortableTableCell colSpan={9}>
                            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-md space-y-3 text-xs">
                              {isGrouped ? (
                                <div className="flex items-center gap-2 p-2 rounded border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300">
                                  <Layers className="h-3.5 w-3.5 shrink-0" />
                                  <span>
                                    Grouped: {group.count} occurrence{group.count !== 1 ? "s" : ""} across {group.distinctUsers} user{group.distinctUsers !== 1 ? "s" : ""}. Showing details of the most recent occurrence.
                                  </span>
                                </div>
                              ) : null}
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <span className="font-semibold text-gray-700 dark:text-gray-300">Full Error ID:</span>
                                  <p className="font-mono mt-1">{log.errorId}</p>
                                </div>
                                <div>
                                  <span className="font-semibold text-gray-700 dark:text-gray-300">Timestamp:</span>
                                  <p className="mt-1">{log.timestamp ? format(new Date(log.timestamp), "PPpp") : "-"}</p>
                                </div>
                                <div>
                                  <span className="font-semibold text-gray-700 dark:text-gray-300">User:</span>
                                  <p className="mt-1">{userDisplayName(log)}</p>
                                  {log.user?.email && log.user.email !== userDisplayName(log) ? (
                                    <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                                      {log.user.email}
                                    </p>
                                  ) : null}
                                  {log.userId ? (
                                    <p className="mt-0.5 font-mono text-[11px] text-gray-500 dark:text-gray-400 break-all">
                                      {log.userId}
                                    </p>
                                  ) : null}
                                </div>
                                <div>
                                  <span className="font-semibold text-gray-700 dark:text-gray-300">Full URL:</span>
                                  <p className="mt-1 break-all">{log.url || "-"}</p>
                                </div>
                                <div>
                                  <span className="font-semibold text-gray-700 dark:text-gray-300">Build:</span>
                                  <p className="mt-1 font-mono text-[11px] text-gray-600 dark:text-gray-300 break-all">
                                    {(() => {
                                      const parts = [
                                        log.appVersion ?? null,
                                        detailString(log.details, "gitCommit"),
                                        detailString(log.details, "environment"),
                                        detailString(log.details, "buildDate"),
                                      ].filter(Boolean);
                                      return parts.length > 0 ? parts.join(" · ") : "-";
                                    })()}
                                  </p>
                                </div>
                                {typeof log.httpStatus === "number" ? (
                                  <div>
                                    <span className="font-semibold text-gray-700 dark:text-gray-300">HTTP status:</span>
                                    <p className="mt-1">
                                      <Badge variant="outline" className={`text-[10px] font-mono font-medium px-1.5 py-0 ${httpStatusBadgeClass(log.httpStatus)}`}>
                                        {log.httpStatus}
                                      </Badge>
                                    </p>
                                  </div>
                                ) : null}
                              </div>
                              <div className="flex items-center gap-3 p-2 rounded border bg-white dark:bg-gray-800">
                                <Badge variant="outline" className={`text-xs font-medium gap-1 ${config.badgeClass}`}>
                                  <SeverityIcon className="h-3 w-3" />
                                  {config.label}
                                </Badge>
                                <span className="text-gray-600 dark:text-gray-400 italic">{classification.impact}</span>
                              </div>
                              <div>
                                <span className="font-semibold text-gray-700 dark:text-gray-300">Full Message:</span>
                                <p className="mt-1 whitespace-pre-wrap bg-white dark:bg-gray-800 p-2 rounded border">
                                  {log.message || "-"}
                                </p>
                              </div>
                              {detailString(log.details, "resolvedStack") ? (
                                <div>
                                  <span className="font-semibold text-gray-700 dark:text-gray-300">Resolved stack (source-mapped):</span>
                                  <pre className="mt-1 whitespace-pre-wrap bg-white dark:bg-gray-800 p-2 rounded border font-mono text-[11px] max-h-48 overflow-auto">
                                    {detailString(log.details, "resolvedStack")}
                                  </pre>
                                </div>
                              ) : null}
                              {log.stack && (
                                <div>
                                  <span className="font-semibold text-gray-700 dark:text-gray-300">Stack Trace:</span>
                                  <pre className="mt-1 whitespace-pre-wrap bg-white dark:bg-gray-800 p-2 rounded border font-mono text-[11px] max-h-48 overflow-auto">
                                    {log.stack}
                                  </pre>
                                </div>
                              )}
                              {(() => {
                                const breadcrumbs = getBreadcrumbs(log.details);
                                if (breadcrumbs.length === 0) return null;
                                return (
                                  <div>
                                    <span className="font-semibold text-gray-700 dark:text-gray-300">Breadcrumbs:</span>
                                    <ol className="mt-1 bg-white dark:bg-gray-800 p-2 rounded border max-h-48 overflow-auto space-y-1">
                                      {breadcrumbs.map((b, i) => (
                                        <li key={i} className="flex items-start gap-2 relative pl-3">
                                          <span className="absolute left-0 top-1.5 h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
                                          <span className="font-mono text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap shrink-0">
                                            {b.t || "—"}
                                          </span>
                                          {b.type ? (
                                            <Badge variant="outline" className="text-[10px] font-normal px-1 py-0 shrink-0 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-700">
                                              {b.type}
                                            </Badge>
                                          ) : null}
                                          <span className="text-[11px] text-gray-600 dark:text-gray-300 break-all">{b.detail}</span>
                                        </li>
                                      ))}
                                    </ol>
                                  </div>
                                );
                              })()}
                              {(() => {
                                const consoleLogs = getConsoleLogs(log.details);
                                if (consoleLogs.length === 0) return null;
                                return (
                                  <div>
                                    <span className="font-semibold text-gray-700 dark:text-gray-300">Console:</span>
                                    <div className="mt-1 bg-white dark:bg-gray-800 p-2 rounded border font-mono text-[11px] max-h-48 overflow-auto space-y-0.5">
                                      {consoleLogs.map((c, i) => {
                                        const level = (c.level || "").toLowerCase();
                                        const lineClass =
                                          level === "error"
                                            ? "text-red-600 dark:text-red-400"
                                            : level === "warn"
                                              ? "text-amber-600 dark:text-amber-400"
                                              : "text-gray-500 dark:text-gray-400";
                                        return (
                                          <div key={i} className={`flex items-start gap-2 ${lineClass}`}>
                                            <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap shrink-0">{c.t || "—"}</span>
                                            <span className="uppercase text-[10px] font-semibold shrink-0 w-9">{level || "log"}</span>
                                            <span className="break-all whitespace-pre-wrap">{c.text}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })()}
                              {log.userAgent && (
                                <div>
                                  <span className="font-semibold text-gray-700 dark:text-gray-300">User Agent:</span>
                                  <p className="mt-1 break-all text-gray-500">{log.userAgent}</p>
                                </div>
                              )}
                              {log.details && (
                                <div>
                                  <span className="font-semibold text-gray-700 dark:text-gray-300">Details:</span>
                                  <pre className="mt-1 whitespace-pre-wrap bg-white dark:bg-gray-800 p-2 rounded border font-mono text-[11px] max-h-32 overflow-auto">
                                    {JSON.stringify(log.details, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {isGrouped ? (
                                <div>
                                  <span className="font-semibold text-gray-700 dark:text-gray-300">All occurrences ({group.count}):</span>
                                  <ul className="mt-1 bg-white dark:bg-gray-800 p-2 rounded border max-h-40 overflow-auto space-y-1">
                                    {group.occurrences.map((occ, i) => (
                                      <li key={occ.id} className="flex items-center gap-2 text-[11px]">
                                        <ChevronRight className="h-3 w-3 text-gray-300 dark:text-gray-600 shrink-0" />
                                        <span className="font-mono text-gray-400 dark:text-gray-500 whitespace-nowrap shrink-0">
                                          {occ.timestamp ? format(new Date(occ.timestamp), "PPpp") : "-"}
                                        </span>
                                        <span className="text-gray-600 dark:text-gray-300 truncate">
                                          {userDisplayName(occ)}
                                        </span>
                                        {i === 0 ? (
                                          <Badge variant="outline" className="text-[9px] font-normal px-1 py-0 shrink-0 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-700">
                                            most recent
                                          </Badge>
                                        ) : null}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSupportDialogLog(log);
                                  }}
                                >
                                  <PocketKnife className="h-3 w-3 mr-1" />
                                  File as Support Request
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const text = [
                                      `Error ID: ${log.errorId}`,
                                      `Severity: ${config.label}`,
                                      `Impact: ${classification.impact}`,
                                      `Time: ${log.timestamp ? format(new Date(log.timestamp), "PPpp") : "-"}`,
                                      `User: ${userDisplayName(log)}${log.user?.email && log.user.email !== userDisplayName(log) ? ` (${log.user.email})` : ''}${log.userId ? ` — id: ${log.userId}` : ''}`,
                                      `Context: ${log.context || "-"}`,
                                      `URL: ${log.url || "-"}`,
                                      `Message: ${log.message || "-"}`,
                                      log.stack ? `Stack:\n${log.stack}` : "",
                                    ].filter(Boolean).join("\n");
                                    copyToClipboard(text);
                                  }}
                                >
                                  <Copy className="h-3 w-3 mr-1" />
                                  Copy Full Details
                                </Button>
                              </div>
                            </div>
                          </SortableTableCell>
                        </SortableTableRow>
                      )}
                    </TooltipProvider>
                  );
                  })}
                </SortableTableBody>
              </SortableTable>
              <TablePaginationFooter
                currentPage={currentPage}
                totalItems={totalGroups}
                pageSize={itemsPerPage}
                onPageChange={setCurrentPage}
              />
            </>
          )}
        </CardContent>
      </Card>

      {supportDialogLog && supportDialogClassification && (
        <SupportFeatureDialog
          open={!!supportDialogLog}
          onOpenChange={(open) => { if (!open) setSupportDialogLog(null); }}
          prefilledData={{
            type: "issue",
            title: buildSupportTitle(supportDialogLog),
            description: buildSupportDescription(supportDialogLog, supportDialogClassification),
            priority: SEVERITY_CONFIG[supportDialogClassification.severity].priorityMap,
          }}
          onSuccess={() => {
            setSupportDialogLog(null);
            showSuccessToast("Support Request Created", "The error has been filed as a support request.");
          }}
        />
      )}
    </div>
  );
}
