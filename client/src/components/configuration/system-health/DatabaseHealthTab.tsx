import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSystemHealthCategoryQuery } from "./useSystemHealthCategoryQuery";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { showErrorToast } from "@/lib/toast-helper";
import {
  Database,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Loader2,
  HardDrive,
  Link2Off,
  Server,
  Info,
  Cloud,
  FileText,
  Terminal,
  ExternalLink,
  History,
  PlayCircle,
  ChevronRight,
  Trash2,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SortableTable,
  SortableTableHeader,
  SortableTableHead,
  SortableTableBody,
  SortableTableRow,
  SortableTableCell,
} from "@/components/ui/sortable-table";
import { TablePaginationFooter } from "@/components/ui/table-pagination-footer";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { stableSort, makeComparator, useSortState } from "@/lib/sorting";
import { HealthFreshnessIndicator } from "./HealthFreshnessIndicator";

interface DatabaseHealthData {
  status: "ok" | "warning" | "error";
  lastChecked: string;
  message: string;
  // Live pool snapshot (Task #507).
  //
  // `poolMax` reflects the resolved `DB_POOL_MAX` value the server
  // actually built the pool with. `totalCount` / `idleCount` /
  // `waitingCount` are the gauges exposed by both supported drivers
  // (Neon and node-postgres).
  //
  // The legacy `totalConnections` / `idleConnections` /
  // `maxConnections` aliases are accepted as fallbacks so a UI
  // running ahead of an older server build still renders sensible
  // numbers.
  connectionPool: {
    poolMax?: number;
    totalCount?: number;
    idleCount?: number;
    waitingCount: number;
    totalConnections?: number;
    idleConnections?: number;
    maxConnections?: number;
  };
  tableStats: Array<{
    tableName: string;
    rowCount: number;
    sizeBytes: number;
    sizeFormatted: string;
  }>;
  orphanedRecords: {
    projectsWithoutCustomers: number;
    mapPhasesWithoutProjects: number;
    mapStepsWithoutPhases: number;
    mapTasksWithoutSteps: number;
    successCriteriaWithoutProjects: number;
  };
  databaseSize: {
    totalBytes: number;
    totalFormatted: string;
  };
  connectionSource?: string;
}

interface SchemaMigrationApplied {
  filename: string;
  checksum: string;
  appliedAt: string;
  description: string;
}

// Per-file payload the server attaches to every pending migration so
// the Apply confirmation dialog can show what each file does (Task
// #435). `description` is always present (the server falls back to a
// filename heuristic when the SQL file lacks a leading `--` comment),
// but the UI still defends against an empty string by reverting to
// filename-only. `previewLines` is the first ~20 lines of the SQL
// file verbatim so the operator can sanity-check destructive
// statements without leaving the dashboard.
interface SchemaMigrationPending {
  filename: string;
  description: string;
  previewLines: string[];
  previewTruncated: boolean;
}

// One persisted row from `schema_migration_audit` (Task #429).
// Mirrors `SchemaMigrationAuditEvent` on the server. Records who
// applied which file (or attempted to and failed) so security can
// answer "who applied migration #042 in March?" months later, after
// stdout logs have rotated.
interface SchemaMigrationAuditEvent {
  id: number;
  filename: string;
  userId: string | null;
  userEmail: string | null;
  success: boolean;
  errorMessage: string | null;
  sqlState: string | null;
  appliedAt: string;
}

interface SchemaMigrationsReport {
  applied: SchemaMigrationApplied[];
  missing: SchemaMigrationPending[];
  unknown: string[];
  // Optional on the wire because older server builds (pre-Task #429)
  // don't include this field. The card defaults to an empty list and
  // hides the section when no events are present.
  recentAuditEvents?: SchemaMigrationAuditEvent[];
}

// Shape returned by `POST /api/admin/schema-migrations/run`. Mirrors
// the server contract in `server/routes/system-routes.ts` — see that file
// for the rationale behind always returning `report` (so the UI
// drops the cached pending list immediately) and `failedFilename` /
// `sqlState` on error (so we surface the same detail the boot-time
// FATAL handler does).
interface RunMigrationsResponse {
  ok: boolean;
  applied: string[];
  report: SchemaMigrationsReport | null;
  failedFilename?: string | null;
  sqlState?: string | null;
  error?: string;
  errorCode?: string;
}

// Number of consecutive `waitingCount > 0` polls that must be
// observed before the Connection Pool card surfaces the
// "raise DB_POOL_MAX" hint (Task #507). The dashboard polls every
// 60 s, so requiring two consecutive non-zero observations means
// the pool has been saturated for at least one full polling window
// before we suggest a tuning change — a single transient spike
// during a load burst won't nag the operator.
const SUSTAINED_WAITING_OBSERVATIONS = 2;

export function DatabaseHealthTab() {
  const [currentPage, setCurrentPage] = useState(1);
  const { sortConfig, handleSort: baseSortHandler } = useSortState({ key: 'tableName', direction: 'asc' });
  const pageSize = 15;
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Tracks how many consecutive polls have observed
  // `waitingCount > 0` so the "sustained" hint only fires once the
  // pool has actually been saturated for a while. Reset to 0 the
  // moment the pool drains.
  const [sustainedWaitingCount, setSustainedWaitingCount] = useState(0);

  // Deep-link target for the System Health overview's Database tile
  // (Task #412). When migration drift is present, clicking the tile
  // navigates here with `#schema-migrations` in the URL; we scroll the
  // matching card into view so an admin lands directly on the panel
  // that lists the pending filenames instead of having to find it
  // amongst the other database widgets.
  const schemaMigrationsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!isAdmin) return;
    const scrollIfHash = () => {
      if (window.location.hash !== "#schema-migrations") return;
      // Wait one frame so the card has mounted (the query may still be
      // loading on first render — the card renders its skeleton state
      // immediately so the anchor is real either way).
      requestAnimationFrame(() => {
        schemaMigrationsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    };
    scrollIfHash();
    window.addEventListener("hashchange", scrollIfHash);
    return () => window.removeEventListener("hashchange", scrollIfHash);
  }, [isAdmin]);

  const handleSort = (key: string) => {
    baseSortHandler(key);
    setCurrentPage(1);
  };
  
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useSystemHealthCategoryQuery<DatabaseHealthData>({
    queryKey: ["system-health-database"],
    queryFn: async () => {
      const response = await fetch("/api/system/health/database");
      if (!response.ok) throw new Error("Failed to fetch database health");
      return response.json();
    },
    refetchInterval: 60000,
  });

  // Increment the consecutive-waiters tally each time a fresh poll
  // arrives showing the pool has requests queued; reset it to zero
  // on the first poll that finds the queue empty. Keying the effect
  // on `dataUpdatedAt` ensures we count one bump per actual poll
  // (not on every render). Without this the hint would either fire
  // on the first transient spike or never fire at all.
  useEffect(() => {
    if (!data) return;
    const waiting = data.connectionPool?.waitingCount ?? 0;
    setSustainedWaitingCount((prev) => (waiting > 0 ? prev + 1 : 0));
  }, [data, dataUpdatedAt]);

  // Daily audit_logins prune scheduler status (Task #751). Admin-only
  // — backs the "Login history cleanup" panel below the Schema
  // Migrations card so admins can confirm at a glance that login
  // history is being trimmed and the active retention window matches
  // their compliance regime, without grepping the
  // `[Audit Logins Cleanup]` log line on the host.
  //
  // Polled every 60 s on the same cadence as the rest of this tab
  // (`refetchInterval: 60000`) so the "last pruned at …" timestamp
  // refreshes when the scheduler ticks while an admin is watching.
  // The endpoint returns the in-process snapshot only — there's no
  // DB I/O behind it — so polling at this rate is cheap.
  const {
    data: auditLoginsCleanup,
    isFetching: auditLoginsCleanupFetching,
    error: auditLoginsCleanupError,
    refetch: refetchAuditLoginsCleanup,
  } = useQuery<AuditLoginsCleanupStatus>({
    queryKey: ["admin-audit-logins-cleanup-status"],
    enabled: isAdmin,
    queryFn: async () => {
      const response = await fetch("/api/admin/audit-logins-cleanup/status");
      if (!response.ok) {
        throw new Error(
          `Failed to fetch audit-logins cleanup status (${response.status})`,
        );
      }
      return response.json();
    },
    refetchInterval: 60000,
  });

  // On-demand prune of `audit_logins` (Task #756). The scheduled
  // tick still runs every 24 h by default, but admins who tighten
  // `AUDIT_LOGINS_RETENTION_DAYS` for compliance can press
  // "Prune now" on the panel below to make the new window take
  // effect immediately. On success we seed the cached status with
  // the snapshot the server returned so the panel reflects the run
  // without waiting for the next 60 s poll, and surface the removed
  // row count via a toast.
  const pruneAuditLoginsMutation = useMutation<
    { removed: number; lastRunAt: string; retentionDays: number },
    Error,
    void
  >({
    mutationFn: async () => {
      const response = await fetch("/api/admin/audit-logins-cleanup/run", {
        method: "POST",
      });
      const body = (await response.json().catch(() => ({}))) as {
        removed?: number;
        lastRunAt?: string;
        retentionDays?: number;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(
          body?.message ?? `Failed to prune audit logins (HTTP ${response.status})`,
        );
      }
      return {
        removed: body.removed ?? 0,
        lastRunAt: body.lastRunAt ?? new Date().toISOString(),
        retentionDays: body.retentionDays ?? 0,
      };
    },
    onSuccess: (data) => {
      queryClient.setQueryData<AuditLoginsCleanupStatus>(
        ["admin-audit-logins-cleanup-status"],
        {
          lastRunAt: data.lastRunAt,
          lastRemoved: data.removed,
          retentionDays: data.retentionDays,
        },
      );
      toast({
        title:
          data.removed === 0
            ? "No login history rows to prune"
            : `Pruned ${data.removed.toLocaleString()} login history row${data.removed === 1 ? "" : "s"}`,
        description:
          data.removed === 0
            ? `Nothing older than ${data.retentionDays} days was found.`
            : `Removed rows older than ${data.retentionDays} days.`,
      });
    },
    onError: (err) => {
      showErrorToast("Login history prune failed", err.message);
    },
  });

  // Schema migration history (task #391). Admin-only — gating the
  // query with `enabled` keeps non-Admin users from triggering a 403
  // round-trip just to render the Database tab.
  const {
    data: migrationsReport,
    isLoading: migrationsLoading,
    error: migrationsError,
    refetch: refetchMigrations,
    isFetching: migrationsFetching,
  } = useQuery<SchemaMigrationsReport>({
    queryKey: ["admin-schema-migrations"],
    enabled: isAdmin,
    queryFn: async () => {
      const response = await fetch("/api/admin/schema-migrations");
      if (!response.ok) {
        throw new Error(`Failed to fetch schema migrations (${response.status})`);
      }
      return response.json();
    },
  });

  // Apply pending migrations (task #419). Surfaces the same
  // `runPendingMigrations` entry point the boot path uses behind an
  // admin-gated POST. On success we seed the cache with the
  // freshly-recomputed report the server returned so the pending
  // banners disappear without waiting for a follow-up GET. On
  // failure we still seed the partial report (the server returns
  // it whenever it could be re-fetched) so the operator sees
  // exactly which files made it before the run aborted.
  const runMigrationsMutation = useMutation<
    RunMigrationsResponse,
    Error,
    void
  >({
    mutationFn: async () => {
      const response = await fetch("/api/admin/schema-migrations/run", {
        method: "POST",
      });
      const body = (await response.json().catch(() => ({}))) as RunMigrationsResponse & {
        error?: string;
        errorCode?: string;
      };
      if (!response.ok) {
        // Seed cached report when the server still managed to compute
        // one, so banners reflect any partially-applied files even
        // though we surface the failure.
        if (body && body.report) {
          queryClient.setQueryData(["admin-schema-migrations"], body.report);
        }
        const failed = body?.failedFilename ? ` (${body.failedFilename})` : "";
        const detail = body?.error ? `: ${body.error}` : "";
        throw new Error(
          `Failed to apply migrations${failed}${detail || ` (HTTP ${response.status})`}`,
        );
      }
      return body;
    },
    onSuccess: (data) => {
      if (data?.report) {
        queryClient.setQueryData(["admin-schema-migrations"], data.report);
      } else {
        void refetchMigrations();
      }
      // Re-fetching the database health query is cheap and refreshes
      // the connection-pool / size tiles in case a migration changed
      // table sizes meaningfully.
      void queryClient.invalidateQueries({ queryKey: ["system-health-database"] });
      const appliedCount = data?.applied?.length ?? 0;
      toast({
        title:
          appliedCount === 0
            ? "No pending migrations"
            : `Applied ${appliedCount} migration${appliedCount === 1 ? "" : "s"}`,
        description:
          appliedCount === 0
            ? "Schema is already up to date."
            : data!.applied.join(", "),
      });
    },
    onError: (err) => {
      showErrorToast("Migration run failed", err.message);
    },
  });

  const getStatusBadge = (status: "ok" | "warning" | "error") => {
    switch (status) {
      case "ok":
        return (
          <Badge variant="outline" className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Healthy
          </Badge>
        );
      case "warning":
        return (
          <Badge variant="outline" className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Warning
          </Badge>
        );
      case "error":
        return (
          <Badge variant="outline" className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Error
          </Badge>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
            <AlertTriangle className="h-5 w-5" />
            <span>Failed to load database health data.</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Normalize the pool snapshot so the rest of this component can
  // read a single field name regardless of whether the server is
  // running the new (Task #507) or legacy payload shape. The
  // fallback to `0` / `1` for `maxConnections` mirrors the server
  // contract — `dbPoolMax` is always a positive integer when the
  // pool is built — and avoids a divide-by-zero in the percent calc.
  const poolTotalCount = data.connectionPool.totalCount ?? data.connectionPool.totalConnections ?? 0;
  const poolIdleCount = data.connectionPool.idleCount ?? data.connectionPool.idleConnections ?? 0;
  const poolWaitingCount = data.connectionPool.waitingCount ?? 0;
  const poolMax = data.connectionPool.poolMax ?? data.connectionPool.maxConnections ?? 1;
  const orphanTotal = Object.values(data.orphanedRecords).reduce((a, b) => a + b, 0);

  const getConnectionSourceInfo = () => {
    if (data.connectionSource === "file") {
      return {
        icon: <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />,
        label: "Bootstrap config file",
        description: "Connection loaded from /data/db-config.json.",
        colorClasses: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700 text-emerald-900 dark:text-emerald-100",
        descColorClasses: "text-emerald-700 dark:text-emerald-300",
        badgeClasses: "bg-emerald-100 dark:bg-emerald-800/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-700",
      };
    }
    return {
      icon: <Terminal className="h-4 w-4 text-violet-600 dark:text-violet-400" />,
      label: "Environment variable (DATABASE_URL)",
      description: "Connection string read from the DATABASE_URL environment variable.",
      colorClasses: "bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-700 text-violet-900 dark:text-violet-100",
      descColorClasses: "text-violet-700 dark:text-violet-300",
      badgeClasses: "bg-violet-100 dark:bg-violet-800/40 text-violet-800 dark:text-violet-200 border-violet-200 dark:border-violet-700",
    };
  };

  const sourceInfo = getConnectionSourceInfo();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="relative">
          <div className="absolute top-4 right-4 flex items-center gap-3">
            {getStatusBadge(data.status)}
            <HealthFreshnessIndicator
              dataUpdatedAt={dataUpdatedAt}
              isFetching={isFetching}
              onRefresh={() => refetch()}
              testIdPrefix="database-health"
              lastCheckedIso={data.lastChecked}
            />
          </div>
          <div className="flex items-center gap-2">
            <Database className="h-6 w-6 text-blue-600" />
            <CardTitle className="text-2xl font-bold">
              Database Health
            </CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            Monitor Connection pool, table statistics, and data integrity
          </p>
        </CardHeader>

        <div className={`mx-4 mb-4 flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 ${sourceInfo.colorClasses}`}>
          <div className="flex items-center gap-2.5">
            {sourceInfo.icon}
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide opacity-60">Active Connection Source</span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-sm font-medium">{sourceInfo.label}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded border font-mono ${sourceInfo.badgeClasses}`}>
                  {data.connectionSource ?? "env"}
                </span>
              </div>
              <p className={`text-xs mt-0.5 ${sourceInfo.descColorClasses}`}>{sourceInfo.description}</p>
            </div>
          </div>
          <a
            href="/admin?tab=database-connection"
            className={`flex items-center gap-1 text-xs font-medium whitespace-nowrap hover:underline ${sourceInfo.descColorClasses}`}
          >
            <ExternalLink className="h-3 w-3" />
            Database Connections
          </a>
        </div>

      <TooltipProvider>
        <div className="grid grid-cols-3 gap-4 px-4 pb-4 pt-0">
          <Card
            className={`relative overflow-hidden ${
              poolWaitingCount > 0
                ? "bg-yellow-50/80 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
                : "bg-blue-50/80 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
            }`}
            data-testid="connection-pool-card"
          >
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Server className={`h-24 w-24 opacity-10 ${poolWaitingCount > 0 ? "text-yellow-600" : "text-blue-600"}`} />
          </div>
          <CardContent className="relative p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Server className={`w-5 h-5 ${poolWaitingCount > 0 ? "text-yellow-700 dark:text-yellow-300" : "text-blue-700 dark:text-blue-300"}`} />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Connection Pool</h3>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-4 h-4 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-sm">
                    <strong>Connection Pool</strong> is a cache of ready-to-use database connections.
                  </p>
                  <p className="text-sm mt-1">
                    <strong>9 / 20 in use</strong> = 9 active connections out of the <code>DB_POOL_MAX</code> ceiling of 20 (healthy).
                  </p>
                  <p className="text-sm mt-1">
                    <strong>Waiting</strong> is the number of callers blocked in <code>pool.connect()</code> right now — anything above zero means requests are queueing for a free client.
                  </p>
                  <p className="text-sm mt-1 text-gray-500 dark:text-gray-400">
                    Sustained waiters across multiple polls usually means it's time to raise <code>DB_POOL_MAX</code>.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div
              className={`text-2xl font-bold ${poolWaitingCount > 0 ? "text-yellow-600" : "text-blue-600"}`}
              data-testid="connection-pool-headline"
            >
              {poolTotalCount} / {poolMax} in use
              {poolWaitingCount > 0 && (
                <span className="ml-2 text-base font-semibold text-yellow-700 dark:text-yellow-300">
                  , {poolWaitingCount} waiting
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Active / DB_POOL_MAX (idle: {poolIdleCount})
            </p>
            {sustainedWaitingCount >= SUSTAINED_WAITING_OBSERVATIONS && (
              <div
                className="mt-2 flex items-start gap-1.5 rounded border border-yellow-300 dark:border-yellow-700 bg-yellow-100/70 dark:bg-yellow-900/40 px-2 py-1.5 text-xs text-yellow-900 dark:text-yellow-100"
                data-testid="connection-pool-raise-hint"
              >
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Requests have been waiting on the pool for multiple polls. Consider raising <code className="font-mono">DB_POOL_MAX</code> from {poolMax}.{' '}
                  {/*
                    Deep-link to the "Tuning the database connection pool"
                    section in the self-hosting guide (Task #516). The
                    operator following this hint needs to know what number
                    to pick — sizing relative to Postgres' own
                    `max_connections` lives in that section. Opens in a new
                    tab so the operator doesn't lose their place on the
                    Database Health dashboard while reading. The anchor id
                    matches the explicit `<a id="…"></a>` in the markdown
                    file (the in-app docs renderer is regex-based and does
                    not auto-generate heading IDs, so the anchor is added
                    by hand on the docs side).
                  */}
                  <a
                    href="/docs/self-hosting#tuning-the-database-connection-pool"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium underline hover:no-underline"
                    data-testid="connection-pool-raise-hint-link"
                  >
                    How to pick a value
                  </a>
                  .
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-purple-50/80 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <HardDrive className="h-24 w-24 opacity-10 text-purple-600" />
          </div>
          <CardContent className="relative p-4">
            <div className="flex items-center space-x-2 mb-2">
              <HardDrive className="w-5 h-5 text-purple-700 dark:text-purple-300" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Database Size</h3>
            </div>
            <div className="text-2xl font-bold text-purple-600">
              {data.databaseSize.totalFormatted}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">PostgreSQL-reported size</p>
          </CardContent>
        </Card>

        <Card className={`relative overflow-hidden ${orphanTotal > 0 ? "bg-yellow-50/80 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800" : "bg-gray-50/80 dark:bg-gray-800 border-gray-200 dark:border-gray-700"}`}>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Link2Off className={`h-24 w-24 opacity-10 ${orphanTotal > 0 ? "text-yellow-600" : "text-gray-600 dark:text-gray-400"}`} />
          </div>
          <CardContent className="relative p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Link2Off className={`w-5 h-5 ${orphanTotal > 0 ? "text-yellow-700 dark:text-yellow-300" : "text-gray-700 dark:text-gray-300"}`} />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Orphaned Records</h3>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-4 h-4 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-sm">
                    <strong>Orphaned records</strong> are database entries that reference items that no longer exist.
                  </p>
                  <p className="text-sm mt-1">
                    For example: a project linked to a deleted customer, or a task linked to a deleted step.
                  </p>
                  <p className="text-sm mt-1 text-gray-500 dark:text-gray-400">
                    These can cause errors and should be cleaned up when found.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className={`text-2xl font-bold ${orphanTotal > 0 ? "text-yellow-600" : "text-gray-600 dark:text-gray-400"}`}>
              {orphanTotal}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{orphanTotal > 0 ? "Records needing attention" : "No orphaned records"}</p>
          </CardContent>
        </Card>
        </div>
      </TooltipProvider>

      {orphanTotal > 0 && (
        <Card className="border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20">
          <CardHeader>
            <CardTitle className="text-lg text-yellow-800 dark:text-yellow-200">Orphaned Records Detail</CardTitle>
            <CardDescription className="text-yellow-700 dark:text-yellow-300">
              Records that reference non-existent parent records
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {data.orphanedRecords.projectsWithoutCustomers > 0 && (
                <div className="p-3 bg-white dark:bg-gray-900 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <div className="text-lg font-semibold text-yellow-800 dark:text-yellow-200">
                    {data.orphanedRecords.projectsWithoutCustomers}
                  </div>
                  <div className="text-sm text-yellow-600 dark:text-yellow-400">Projects without customers</div>
                </div>
              )}
              {data.orphanedRecords.mapPhasesWithoutProjects > 0 && (
                <div className="p-3 bg-white dark:bg-gray-900 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <div className="text-lg font-semibold text-yellow-800 dark:text-yellow-200">
                    {data.orphanedRecords.mapPhasesWithoutProjects}
                  </div>
                  <div className="text-sm text-yellow-600 dark:text-yellow-400">MAP Phases without projects</div>
                </div>
              )}
              {data.orphanedRecords.mapStepsWithoutPhases > 0 && (
                <div className="p-3 bg-white dark:bg-gray-900 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <div className="text-lg font-semibold text-yellow-800 dark:text-yellow-200">
                    {data.orphanedRecords.mapStepsWithoutPhases}
                  </div>
                  <div className="text-sm text-yellow-600 dark:text-yellow-400">MAP Steps without phases</div>
                </div>
              )}
              {data.orphanedRecords.mapTasksWithoutSteps > 0 && (
                <div className="p-3 bg-white dark:bg-gray-900 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <div className="text-lg font-semibold text-yellow-800 dark:text-yellow-200">
                    {data.orphanedRecords.mapTasksWithoutSteps}
                  </div>
                  <div className="text-sm text-yellow-600 dark:text-yellow-400">MAP Tasks without steps</div>
                </div>
              )}
              {data.orphanedRecords.successCriteriaWithoutProjects > 0 && (
                <div className="p-3 bg-white dark:bg-gray-900 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <div className="text-lg font-semibold text-yellow-800 dark:text-yellow-200">
                    {data.orphanedRecords.successCriteriaWithoutProjects}
                  </div>
                  <div className="text-sm text-yellow-600 dark:text-yellow-400">Criteria without projects</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      </Card>
      <Card className="relative overflow-hidden">
        <DecorativeCardIcon icon={Database} />
        <CardHeader className="relative z-10">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            <CardTitle className="text-2xl font-bold">
              Table Statistics</CardTitle>
          </div>
          <CardDescription>
            Row counts and storage usage for all {data.tableStats.length} database tables
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4">
          <TooltipProvider>
            <SortableTable>
              <SortableTableHeader>
                <SortableTableRow>
                  <SortableTableHead
                    sortKey="tableName"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                  >
                    Table Name
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="rowCount"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    className="text-right"
                  >
                    Row Count
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="sizeBytes"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    className="text-right"
                  >
                    Size
                  </SortableTableHead>
                </SortableTableRow>
              </SortableTableHeader>
              <SortableTableBody>
                {stableSort(data.tableStats, makeComparator(sortConfig))
                  .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                  .map((table) => (
                    <SortableTableRow key={table.tableName}>
                      <SortableTableCell className="font-medium">{table.tableName}</SortableTableCell>
                      <SortableTableCell className="text-right">{table.rowCount.toLocaleString()}</SortableTableCell>
                      <SortableTableCell className="text-right">{table.sizeFormatted}</SortableTableCell>
                    </SortableTableRow>
                  ))}
              </SortableTableBody>
            </SortableTable>
            <TablePaginationFooter
              totalItems={data.tableStats.length}
              pageSize={pageSize}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              entityLabel="tables"
            />
          </TooltipProvider>
        </CardContent>
      </Card>

      {isAdmin && (
        <SchemaMigrationsCard
          report={migrationsReport}
          isLoading={migrationsLoading}
          isFetching={migrationsFetching}
          error={migrationsError}
          onRefresh={() => refetchMigrations()}
          onRunPending={() => runMigrationsMutation.mutate()}
          isRunning={runMigrationsMutation.isPending}
          runError={
            runMigrationsMutation.isError ? runMigrationsMutation.error : null
          }
          anchorRef={schemaMigrationsRef}
        />
      )}

      {isAdmin && (
        <AuditLoginsCleanupCard
          status={auditLoginsCleanup}
          isFetching={auditLoginsCleanupFetching}
          error={auditLoginsCleanupError}
          onRefresh={() => refetchAuditLoginsCleanup()}
          onPruneNow={() => pruneAuditLoginsMutation.mutate()}
          isPruning={pruneAuditLoginsMutation.isPending}
        />
      )}
    </div>
  );
}

// "Login history cleanup" panel on the Database tab (Task #751).
// Mirrors the visual treatment of the surrounding Database Health
// cards (Schema Migrations, Connection Pool) so the System Health
// page reads as a single coherent surface — the same `Card` /
// `DecorativeCardIcon` / lucide-icon header layout, and the same
// outline-badge convention for the headline state.
//
// What it shows:
//   - "Last pruned at <local time>" + "Removed N rows" — the
//     timestamp + row count from the most recent successful tick.
//     Both are blank-state placeholders ("Not yet — first run is
//     scheduled shortly after boot.") until the first tick fires,
//     so a fresh deployment doesn't render a misleading "0 rows"
//     readout.
//   - "Retention window: N days" — the active retention setting.
//     This is published as soon as the scheduler is started, so it
//     renders even during the first-run delay window.
//
// "Prune now" button (Task #756): the daily scheduled tick remains
// the primary path, but admins who tighten
// `AUDIT_LOGINS_RETENTION_DAYS` for compliance shouldn't have to
// wait up to 24 h for the new window to take effect. Pressing the
// button triggers the same `pruneOldAuditLogins` delete
// synchronously and refreshes the snapshot. The button is disabled
// while a run is in flight (and labelled "Pruning…") so admins
// can't queue concurrent runs by mashing it. Tuning the retention
// window itself still happens via the env vars documented in the
// self-hosting guide; the panel links out to that section so an
// admin who wants to change the window knows where to go.
interface AuditLoginsCleanupCardProps {
  status: AuditLoginsCleanupStatus | undefined;
  isFetching: boolean;
  error: unknown;
  onRefresh: () => void;
  onPruneNow: () => void;
  isPruning: boolean;
}

function AuditLoginsCleanupCard({
  status,
  isFetching,
  error,
  onRefresh,
  onPruneNow,
  isPruning,
}: AuditLoginsCleanupCardProps) {
  const lastRunAt = status?.lastRunAt ?? null;
  const lastRemoved = status?.lastRemoved;
  const retentionDays = status?.retentionDays ?? null;
  const hasRunYet = lastRunAt !== null;

  return (
    <Card
      className="relative overflow-hidden"
      data-testid="card-audit-logins-cleanup"
    >
      <DecorativeCardIcon icon={Trash2} />
      <CardHeader className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              <CardTitle className="text-2xl font-bold">
                Login history cleanup
              </CardTitle>
              {!error && (
                hasRunYet ? (
                  <Badge
                    variant="outline"
                    className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
                    data-testid="badge-audit-logins-cleanup-active"
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Active
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                    data-testid="badge-audit-logins-cleanup-pending"
                  >
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Awaiting first run
                  </Badge>
                )
              )}
            </div>
            <CardDescription>
              Daily background prune of the {" "}
              <code className="text-xs">audit_logins</code> table so login
              history rows older than the retention window don&apos;t
              accumulate forever.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onRefresh}
              disabled={isFetching}
              data-testid="button-refresh-audit-logins-cleanup"
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            {/*
              On-demand prune (Task #756). The button is disabled
              while the mutation is in flight so a click-spam can't
              queue concurrent prunes — the server runs each one
              synchronously, but the button text still flips to
              "Pruning…" so the operator gets visible feedback that
              their press was received and the request is mid-air.

              Task #758: the click is wrapped in an AlertDialog so an
              accidental press (e.g. an admin who meant to hit the
              adjacent "Refresh" button) can't wipe compliance-relevant
              login_history rows with no recovery path. The dialog
              names the active retention window so the operator
              confirms against the same number that's about to be
              applied, mirroring the schema-migrations Apply
              confirmation pattern used elsewhere on this tab.
            */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="default"
                  disabled={isPruning}
                  data-testid="button-prune-audit-logins-cleanup"
                >
                  {isPruning ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  {isPruning ? "Pruning…" : "Prune now"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent data-testid="dialog-confirm-prune-audit-logins">
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Prune login history now?
                  </AlertDialogTitle>
                  <AlertDialogDescription
                    data-testid="dialog-confirm-prune-audit-logins-description"
                  >
                    {retentionDays !== null
                      ? `This will permanently delete login_history rows older than ${retentionDays.toLocaleString()} day${retentionDays === 1 ? "" : "s"}. This cannot be undone.`
                      : "This will permanently delete login_history rows older than the active retention window. This cannot be undone."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel
                    data-testid="button-cancel-prune-audit-logins"
                  >
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onPruneNow}
                    disabled={isPruning}
                    data-testid="button-confirm-prune-audit-logins"
                  >
                    Prune now
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 space-y-4">
        {error ? (
          <div
            className="flex items-center gap-2 p-3 rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"
            data-testid="audit-logins-cleanup-error"
          >
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">
              {error instanceof Error
                ? error.message
                : "Failed to load login history cleanup status."}
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div
              className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/80 dark:bg-blue-900/20 p-3"
              data-testid="audit-logins-cleanup-last-run"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                Last pruned
              </p>
              <p
                className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100"
                data-testid="audit-logins-cleanup-last-run-value"
              >
                {hasRunYet
                  ? new Date(lastRunAt!).toLocaleString()
                  : "Not yet"}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {hasRunYet
                  ? "Most recent successful tick"
                  : "First run fires shortly after boot"}
              </p>
            </div>

            <div
              className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50/80 dark:bg-purple-900/20 p-3"
              data-testid="audit-logins-cleanup-removed"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300">
                Rows removed
              </p>
              <p
                className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100"
                data-testid="audit-logins-cleanup-removed-value"
              >
                {hasRunYet && typeof lastRemoved === "number"
                  ? lastRemoved.toLocaleString()
                  : "—"}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Deleted on the last tick
              </p>
            </div>

            <div
              className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-900/20 p-3"
              data-testid="audit-logins-cleanup-retention"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                Retention window
              </p>
              <p
                className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100"
                data-testid="audit-logins-cleanup-retention-value"
              >
                {retentionDays !== null
                  ? `${retentionDays.toLocaleString()} day${retentionDays === 1 ? "" : "s"}`
                  : "—"}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                <code>AUDIT_LOGINS_RETENTION_DAYS</code>
              </p>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Rows older than the retention window are deleted on every
          tick (default once per 24 h). Tune via the {" "}
          <code className="text-xs">AUDIT_LOGINS_RETENTION_DAYS</code> /{" "}
          <code className="text-xs">AUDIT_LOGINS_CLEANUP_INTERVAL_HOURS</code>
          {" "}env vars — see the {" "}
          <a
            href="/docs/self-hosting#login-history-retention"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline hover:no-underline"
            data-testid="link-audit-logins-cleanup-docs"
          >
            Login history retention
          </a>
          {" "}guide for details.
        </p>
      </CardContent>
    </Card>
  );
}

// Status payload returned by `GET /api/admin/audit-logins-cleanup/status`
// (Task #751). The fields mirror the in-process snapshot the
// scheduler exposes via `getAuditLoginsCleanupStatus()` in
// `server/services/audit-logins-cleanup.ts`. `lastRunAt` and
// `lastRemoved` stay `null` until the first successful tick has
// fired (the scheduler has a configurable first-run delay, default
// 60 s after boot); `retentionDays` is published as soon as the
// scheduler is started so the panel can render the active window
// during that initial window.
interface AuditLoginsCleanupStatus {
  lastRunAt: string | null;
  lastRemoved: number | null;
  retentionDays: number | null;
}

interface SchemaMigrationsCardProps {
  report: SchemaMigrationsReport | undefined;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  onRefresh: () => void;
  // Triggers `POST /api/admin/schema-migrations/run` (Task #419).
  // The card owns the button so the parent tab doesn't have to
  // mirror the mutation's pending/disabled state.
  onRunPending: () => void;
  isRunning: boolean;
  runError: Error | null;
  // Ref + DOM `id` form the deep-link anchor (Task #412): the System
  // Health overview's Database tile sets `#schema-migrations` on the
  // URL and the parent tab scrolls this card into view via the ref.
  // Optional so tests / future callers can mount the card without
  // wiring a ref.
  anchorRef?: React.RefObject<HTMLDivElement | null>;
}

function SchemaMigrationsCard({
  report,
  isLoading,
  isFetching,
  error,
  onRefresh,
  onRunPending,
  isRunning,
  runError,
  anchorRef,
}: SchemaMigrationsCardProps) {
  const missingCount = report?.missing.length ?? 0;
  const unknownCount = report?.unknown.length ?? 0;
  const appliedCount = report?.applied.length ?? 0;
  const hasAnomaly = missingCount > 0 || unknownCount > 0;
  // Apply is offered whenever at least one file in `migrations/` is
  // not yet recorded as applied. We deliberately keep it disabled
  // (rather than hiding it) when there is nothing pending so the
  // affordance is discoverable even from a healthy state.
  const canRun = missingCount > 0;

  return (
    <Card
      ref={anchorRef}
      id="schema-migrations"
      className="relative overflow-hidden scroll-mt-20"
      data-testid="card-schema-migrations"
    >
      <DecorativeCardIcon icon={History} />
      <CardHeader className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <History className="h-5 w-5" />
              <CardTitle className="text-2xl font-bold">Schema Migrations</CardTitle>
              {!isLoading && !error && (
                hasAnomaly ? (
                  <Badge
                    variant="outline"
                    className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800"
                    data-testid="badge-schema-migrations-attention"
                  >
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Needs attention
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
                    data-testid="badge-schema-migrations-up-to-date"
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Up to date
                  </Badge>
                )
              )}
            </div>
            <CardDescription>
              Database upgrades that have been applied to this deployment, recorded in the
              {" "}<code className="text-xs">schema_migrations</code> table.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  disabled={!canRun || isRunning || isFetching}
                  data-testid="button-apply-pending-migrations"
                >
                  {isRunning ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <PlayCircle className="h-4 w-4 mr-2" />
                  )}
                  {isRunning
                    ? "Applying..."
                    : missingCount > 0
                      ? `Apply ${missingCount} pending`
                      : "Apply pending migrations"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent data-testid="dialog-confirm-apply-migrations">
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Apply {missingCount} pending migration{missingCount === 1 ? "" : "s"}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    The following file{missingCount === 1 ? "" : "s"} will be applied to this
                    deployment&apos;s database. Schema changes are irreversible — make sure you mean
                    to run them now.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div
                  className="space-y-2 max-h-72 overflow-y-auto rounded-md border bg-muted/40 p-3"
                  data-testid="dialog-pending-migrations-list"
                >
                  {report?.missing.map((pending) => (
                    <PendingMigrationDialogRow
                      key={pending.filename}
                      pending={pending}
                    />
                  ))}
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-apply-migrations">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onRunPending}
                    data-testid="button-confirm-apply-migrations"
                  >
                    Apply now
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button size="sm" variant="outline" onClick={onRefresh} disabled={isFetching || isRunning}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div
            className="flex items-center gap-2 p-3 rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"
            data-testid="schema-migrations-error"
          >
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">
              {error instanceof Error ? error.message : "Failed to load schema migrations."}
            </span>
          </div>
        ) : report ? (
          <>
            {runError && (
              <div
                className="flex items-start gap-2 p-3 rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"
                data-testid="schema-migrations-run-error"
              >
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span className="text-sm">{runError.message}</span>
              </div>
            )}

            {missingCount > 0 && (
              <div
                className="p-3 rounded-md border border-yellow-300 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-900 dark:text-yellow-200"
                data-testid="schema-migrations-missing"
              >
                <div className="flex items-center gap-2 mb-1 font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  {missingCount} migration{missingCount === 1 ? "" : "s"} on disk have not been applied
                </div>
                <p className="text-xs mb-2">
                  These files exist in <code>migrations/</code> but are not recorded in
                  {" "}<code>schema_migrations</code>. Boot may have skipped them — check the server logs.
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  {report.missing.map((pending) => (
                    <li
                      key={pending.filename}
                      className="text-xs"
                      data-testid={`schema-migrations-missing-row-${pending.filename}`}
                    >
                      <span className="font-mono">{pending.filename}</span>
                      {pending.description ? (
                        <>
                          {" — "}
                          <span data-testid={`schema-migrations-missing-description-${pending.filename}`}>
                            {pending.description}
                          </span>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {unknownCount > 0 && (
              <div
                className="p-3 rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200"
                data-testid="schema-migrations-unknown"
              >
                <div className="flex items-center gap-2 mb-1 font-medium">
                  <Info className="h-4 w-4" />
                  {unknownCount} recorded migration{unknownCount === 1 ? "" : "s"} no longer on disk
                </div>
                <p className="text-xs mb-2">
                  Source files were removed or renamed after they ran. Useful for support investigations,
                  but should normally be empty.
                </p>
                <ul className="text-xs font-mono list-disc pl-5 space-y-0.5">
                  {report.unknown.map((file) => (
                    <li key={file}>{file}</li>
                  ))}
                </ul>
              </div>
            )}

            {appliedCount === 0 ? (
              <div
                className="p-4 text-sm text-muted-foreground border rounded-md text-center"
                data-testid="schema-migrations-empty"
              >
                No migrations have been recorded yet. The auto-runner will populate this list on the next deployment that ships pending SQL files.
              </div>
            ) : (
              <SortableTable data-testid="table-schema-migrations">
                <SortableTableHeader>
                  <SortableTableRow>
                    <SortableTableHead>Filename</SortableTableHead>
                    <SortableTableHead>Description</SortableTableHead>
                    <SortableTableHead>Applied</SortableTableHead>
                  </SortableTableRow>
                </SortableTableHeader>
                <SortableTableBody>
                  {report.applied.map((row) => (
                    <SortableTableRow
                      key={row.filename}
                      data-testid={`row-schema-migration-${row.filename}`}
                    >
                      <SortableTableCell className="font-mono text-xs">
                        {row.filename}
                      </SortableTableCell>
                      <SortableTableCell>{row.description}</SortableTableCell>
                      <SortableTableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(row.appliedAt).toLocaleString()}
                      </SortableTableCell>
                    </SortableTableRow>
                  ))}
                </SortableTableBody>
              </SortableTable>
            )}

            <p className="text-xs text-muted-foreground" data-testid="schema-migrations-summary">
              {appliedCount} migration{appliedCount === 1 ? "" : "s"} applied
              {missingCount > 0 ? `, ${missingCount} pending on disk` : ""}
              {unknownCount > 0 ? `, ${unknownCount} no longer on disk` : ""}.
            </p>

            <RecentAuditEvents events={report.recentAuditEvents ?? []} />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * One row inside the Apply confirmation dialog (Task #435). Surfaces:
 *   - the filename (always),
 *   - a human-readable description sourced from the SQL file's leading
 *     `--` comment when present (server-side fallback to the filename
 *     heuristic guarantees a non-empty string), and
 *   - a collapsible preview of the first ~20 lines of SQL so an admin
 *     can sanity-check destructive statements before clicking Apply.
 *
 * The preview is collapsed by default so the dialog stays scannable
 * when several files are pending — an admin who wants to inspect any
 * single file expands it explicitly.
 */
function PendingMigrationDialogRow({
  pending,
}: {
  pending: SchemaMigrationPending;
}) {
  const [open, setOpen] = useState(false);
  const hasPreview = pending.previewLines.length > 0;
  const shownLineCount = pending.previewLines.length;
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      data-testid={`dialog-pending-migration-${pending.filename}`}
    >
      <div className="rounded-md border bg-background/60 p-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div
              className="text-xs font-mono break-all"
              data-testid={`dialog-pending-migration-filename-${pending.filename}`}
            >
              {pending.filename}
            </div>
            {pending.description ? (
              <div
                className="text-xs text-muted-foreground mt-0.5"
                data-testid={`dialog-pending-migration-description-${pending.filename}`}
              >
                {pending.description}
              </div>
            ) : null}
          </div>
          {hasPreview ? (
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                data-testid={`dialog-pending-migration-toggle-${pending.filename}`}
              >
                <ChevronRight
                  className={`h-3 w-3 mr-1 transition-transform ${open ? "rotate-90" : ""}`}
                />
                {open ? "Hide SQL" : "Show SQL"}
              </Button>
            </CollapsibleTrigger>
          ) : null}
        </div>
        {hasPreview ? (
          <CollapsibleContent>
            <pre
              className="mt-2 text-xs font-mono whitespace-pre-wrap break-all rounded bg-muted/60 p-2 max-h-48 overflow-auto"
              data-testid={`dialog-pending-migration-preview-${pending.filename}`}
            >
              {pending.previewLines.join("\n")}
            </pre>
            {pending.previewTruncated ? (
              <p
                className="text-[11px] text-muted-foreground mt-1"
                data-testid={`dialog-pending-migration-truncated-${pending.filename}`}
              >
                Showing the first {shownLineCount} lines — open the file on disk to read the rest.
              </p>
            ) : null}
          </CollapsibleContent>
        ) : null}
      </div>
    </Collapsible>
  );
}

/**
 * Renders the most-recent rows from `schema_migration_audit`
 * (Task #429) — admin-triggered apply events including the actor
 * email, success/failure, and SQLSTATE on failure. Hidden entirely
 * when no events have been recorded yet, so a fresh deployment
 * (boot-only history) doesn't show an empty section.
 *
 * Boot-driven applies never appear here by design — the runner
 * intentionally skips audit writes when no actor is supplied so
 * security can rely on every row in this list representing a real
 * human-triggered event.
 */
function RecentAuditEvents({ events }: { events: SchemaMigrationAuditEvent[] }) {
  if (events.length === 0) return null;
  return (
    <div data-testid="schema-migrations-audit-events" className="space-y-2 pt-2">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-sm font-semibold">Recent admin-triggered events</h4>
      </div>
      <p className="text-xs text-muted-foreground">
        Persistent record of who used the Apply pending button on this
        deployment. Boot-driven applies are intentionally not listed here.
      </p>
      <SortableTable data-testid="table-schema-migrations-audit">
        <SortableTableHeader>
          <SortableTableRow>
            <SortableTableHead>When</SortableTableHead>
            <SortableTableHead>Filename</SortableTableHead>
            <SortableTableHead>Actor</SortableTableHead>
            <SortableTableHead>Result</SortableTableHead>
          </SortableTableRow>
        </SortableTableHeader>
        <SortableTableBody>
          {events.map((event) => (
            <SortableTableRow
              key={event.id}
              data-testid={`row-schema-migration-audit-${event.id}`}
            >
              <SortableTableCell className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(event.appliedAt).toLocaleString()}
              </SortableTableCell>
              <SortableTableCell className="font-mono text-xs">
                {event.filename}
              </SortableTableCell>
              <SortableTableCell className="text-xs">
                {event.userEmail ?? event.userId ?? "—"}
              </SortableTableCell>
              <SortableTableCell>
                {event.success ? (
                  <Badge
                    variant="outline"
                    className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
                    data-testid={`badge-audit-success-${event.id}`}
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Success
                  </Badge>
                ) : (
                  <div className="space-y-1">
                    <Badge
                      variant="outline"
                      className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800"
                      data-testid={`badge-audit-failure-${event.id}`}
                    >
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Failed
                      {event.sqlState ? ` (${event.sqlState})` : ""}
                    </Badge>
                    {event.errorMessage && (
                      <p className="text-xs text-red-700 dark:text-red-300 font-mono break-all">
                        {event.errorMessage}
                      </p>
                    )}
                  </div>
                )}
              </SortableTableCell>
            </SortableTableRow>
          ))}
        </SortableTableBody>
      </SortableTable>
    </div>
  );
}
