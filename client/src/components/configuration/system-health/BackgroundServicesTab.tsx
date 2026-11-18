import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSystemHealthCategoryQuery } from "./useSystemHealthCategoryQuery";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Cog,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Radio,
  Mail,
  Workflow,
  Trash2,
  Play,
} from "lucide-react";
import { HealthFreshnessIndicator } from "./HealthFreshnessIndicator";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { showErrorToast } from "@/lib/toast-helper";

interface BackgroundServicesData {
  status: "ok" | "warning" | "error";
  lastChecked: string;
  message: string;
  websocket: {
    status: "running" | "stopped" | "unknown";
    connectedClients: number;
    authenticatedClients: number;
  };
  emailScheduler: {
    status: "active" | "inactive" | "unknown";
    rulesCount: number;
    triggersCount: number;
    scheduledActionsCount: number;
  };
  workflowAutomation: {
    activeRules: number;
    executionsToday: number;
    failedExecutions24h: number;
  };
  sessionsCleanup?: {
    status: "active" | "inactive" | "unknown";
    lastRunAt: string | null;
    lastSuccessAt: string | null;
    lastRowsPruned: number | null;
    lastDurationMs: number | null;
    lastError: string | null;
    nextRunAt: string | null;
    intervalMs: number | null;
    skippedDueToUnreachableDb: boolean;
  };
}

// Render an absolute ISO timestamp as a "X minutes ago" / "in X hours"
// label so an operator can see at a glance when the daily expired-
// session prune (Task #745) last ran and when the next sweep is due.
// Rounds toward the user-facing unit ("just now" / "Xm" / "Xh" / "Xd")
// so the dashboard text stays compact regardless of how stale the
// last tick is.
function formatRelativeFromIso(iso: string | null, nowMs: number): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "never";
  const deltaMs = t - nowMs;
  const future = deltaMs > 0;
  const absSec = Math.max(0, Math.floor(Math.abs(deltaMs) / 1000));
  if (absSec < 60) return future ? "in <1 minute" : "just now";
  const absMin = Math.floor(absSec / 60);
  if (absMin < 60) {
    return future
      ? `in ${absMin} minute${absMin === 1 ? "" : "s"}`
      : `${absMin} minute${absMin === 1 ? "" : "s"} ago`;
  }
  const absHrs = Math.floor(absMin / 60);
  if (absHrs < 24) {
    return future
      ? `in ${absHrs} hour${absHrs === 1 ? "" : "s"}`
      : `${absHrs} hour${absHrs === 1 ? "" : "s"} ago`;
  }
  const absDays = Math.floor(absHrs / 24);
  return future
    ? `in ${absDays} day${absDays === 1 ? "" : "s"}`
    : `${absDays} day${absDays === 1 ? "" : "s"} ago`;
}

export function BackgroundServicesTab() {
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useSystemHealthCategoryQuery<BackgroundServicesData>({
    queryKey: ["system-health-services"],
    queryFn: async () => {
      const response = await fetch("/api/system/health/services");
      if (!response.ok) throw new Error("Failed to fetch background services health");
      return response.json();
    },
    refetchInterval: 30000,
  });

  // Admin-only "Run now" mutation for the Sessions Cleanup card (Task #752).
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";
  const { toast } = useToast();
  const runPruneMutation = useMutation<
    { rowsPruned: number; durationMs: number },
    Error,
    void
  >({
    mutationFn: async () => {
      const response = await fetch(
        "/api/system/health/services/sessions-cleanup/run",
        { method: "POST" },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          (body && (body.error || body.message)) ||
            `Failed to run prune (HTTP ${response.status})`,
        );
      }
      return body as { rowsPruned: number; durationMs: number };
    },
    onSuccess: (result) => {
      toast({
        title:
          result.rowsPruned === 0
            ? "Prune complete (no expired sessions)"
            : `Pruned ${result.rowsPruned} expired session${result.rowsPruned === 1 ? "" : "s"}`,
        description: `Took ${result.durationMs}ms.`,
      });
      void refetch();
    },
    onError: (err) => {
      // lint:toasts requires the helper for {variant,title,description}-only
      // calls (Task #461). The success path above keeps direct toast() use
      // because it has no `variant` key and is therefore not flagged.
      showErrorToast("Prune failed", err.message);
      void refetch();
    },
  });

  // Tick once a minute so the "X minutes ago / in X hours" labels on
  // the Sessions Cleanup card (Task #745) stay live between the
  // 30-second refetches. A minute is the smallest unit the formatter
  // surfaces for those labels, so a per-minute interval keeps the
  // text in sync without burning a render every second on a panel
  // that's mostly numeric counters.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const getStatusBadge = (status: "ok" | "warning" | "error") => {
    switch (status) {
      case "ok":
        return (
          <Badge variant="outline" className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            All Running
          </Badge>
        );
      case "warning":
        return (
          <Badge variant="outline" className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Some Issues
          </Badge>
        );
      case "error":
        return (
          <Badge variant="outline" className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Service Down
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
            <span>Failed to load background services data.</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

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
              testIdPrefix="background-services-health"
              lastCheckedIso={data.lastChecked}
            />
          </div>
          <div className="flex items-center gap-2">
            <Cog className="h-6 w-6 text-blue-600" />
            <CardTitle className="text-2xl font-bold">
              Background Services
            </CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            Monitor webSocket, email scheduler, and workflow automation status
          </p>
        </CardHeader> 

      <div className="grid grid-cols-3 gap-4 px-4 pb-4 pt-0">
        <Card className="relative overflow-hidden bg-blue-50/80 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Radio className="h-24 w-24 opacity-10 text-blue-600 dark:text-blue-400" />
          </div>
          <CardContent className="relative p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Radio className="w-5 h-5 text-blue-700 dark:text-blue-300" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">WebSocket Server</h3>
              <div className={`w-2 h-2 rounded-full ${data.websocket.status === "running" ? "bg-green-500 animate-pulse" : data.websocket.status === "stopped" ? "bg-red-500" : "bg-gray-400"}`} />
            </div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {data.websocket.connectedClients}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">connected clients ({data.websocket.authenticatedClients} authenticated)</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-green-50/80 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Mail className="h-24 w-24 opacity-10 text-green-600 dark:text-green-400" />
          </div>
          <CardContent className="relative p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Mail className="w-5 h-5 text-green-700 dark:text-green-300" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Email Scheduler</h3>
              <div className={`w-2 h-2 rounded-full ${data.emailScheduler.status === "active" ? "bg-green-500 animate-pulse" : data.emailScheduler.status === "inactive" ? "bg-red-500" : "bg-gray-400"}`} />
            </div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {data.emailScheduler.rulesCount}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">rules ({data.emailScheduler.triggersCount} triggers, {data.emailScheduler.scheduledActionsCount} scheduled)</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-purple-50/80 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Workflow className="h-24 w-24 opacity-10 text-purple-600 dark:text-purple-400" />
          </div>
          <CardContent className="relative p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Workflow className="w-5 h-5 text-purple-700 dark:text-purple-300" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Workflow Automation</h3>
            </div>
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {data.workflowAutomation.activeRules}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">active rules ({data.workflowAutomation.executionsToday} today, {data.workflowAutomation.failedExecutions24h} failed)</p>
          </CardContent>
        </Card>
      </div>

      {/* Sessions Cleanup card (Task #745). Surfaces the daily prune
          job's last-run / row-count / next-run / skipped-state from
          the in-memory snapshot in
          `server/services/expired-sessions-cleanup.ts` so operators
          can confirm the sweep ran without tailing stdout. The card
          is full-width below the three-up grid so the longer
          "Last expired-session prune: N rows, X minutes ago" copy
          has room to render without truncating on narrower screens. */}
      {data.sessionsCleanup && (
        <div className="px-4 pb-4 pt-0">
          <Card
            data-testid="sessions-cleanup-card"
            className="relative overflow-hidden bg-amber-50/80 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
          >
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <Trash2 className="h-24 w-24 opacity-10 text-amber-600 dark:text-amber-400" />
            </div>
            <CardContent className="relative p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Trash2 className="w-5 h-5 text-amber-700 dark:text-amber-300" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Expired-Sessions Cleanup
                </h3>
                <div
                  className={`w-2 h-2 rounded-full ${
                    data.sessionsCleanup.status === "active"
                      ? "bg-green-500 animate-pulse"
                      : data.sessionsCleanup.status === "inactive"
                        ? "bg-gray-400"
                        : "bg-red-500"
                  }`}
                />
                {isAdmin && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="ml-auto h-7 px-2 text-xs"
                    onClick={() => runPruneMutation.mutate()}
                    disabled={runPruneMutation.isPending}
                    data-testid="sessions-cleanup-run-now"
                  >
                    {runPruneMutation.isPending ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Play className="h-3 w-3 mr-1" />
                    )}
                    Run now
                  </Button>
                )}
              </div>

              {/*
                The headline row is intentionally pinned to
                `lastSuccessAt` (NOT `lastRunAt`) so the row count is
                never paired with a failed-tick timestamp — e.g. after
                "5 rows pruned, then a failed tick 1 minute ago", we
                still show "5 rows, 2 hours ago" up here and surface
                the failed attempt on a separate row below.
              */}
              {data.sessionsCleanup.lastSuccessAt ? (
                <div
                  className="text-base font-medium text-amber-900 dark:text-amber-100"
                  data-testid="sessions-cleanup-last-run"
                >
                  Last expired-session prune:{" "}
                  <span className="font-bold">
                    {data.sessionsCleanup.lastRowsPruned ?? 0} row
                    {data.sessionsCleanup.lastRowsPruned === 1 ? "" : "s"}
                  </span>
                  ,{" "}
                  {formatRelativeFromIso(
                    data.sessionsCleanup.lastSuccessAt,
                    nowMs,
                  )}
                </div>
              ) : (
                <div
                  className="text-base font-medium text-amber-900 dark:text-amber-100"
                  data-testid="sessions-cleanup-last-run"
                >
                  Last expired-session prune:{" "}
                  <span className="italic text-amber-700 dark:text-amber-300">
                    {data.sessionsCleanup.status === "inactive"
                      ? "scheduler inactive"
                      : "not run yet"}
                  </span>
                </div>
              )}

              {/*
                When the most recent attempt differs from the most recent
                success (i.e. a later tick failed or was skipped), surface
                it on its own line so the row count above is never paired
                with a misleading "just now" timestamp from a failed run.
              */}
              {data.sessionsCleanup.lastRunAt &&
                data.sessionsCleanup.lastRunAt !==
                  data.sessionsCleanup.lastSuccessAt && (
                  <p
                    className="text-xs text-amber-800 dark:text-amber-200 mt-1"
                    data-testid="sessions-cleanup-last-attempt"
                  >
                    Last attempt:{" "}
                    {formatRelativeFromIso(
                      data.sessionsCleanup.lastRunAt,
                      nowMs,
                    )}
                  </p>
                )}

              <p
                className="text-xs text-gray-600 dark:text-gray-400 mt-1"
                data-testid="sessions-cleanup-next-run"
              >
                Next run:{" "}
                {data.sessionsCleanup.nextRunAt
                  ? formatRelativeFromIso(
                      data.sessionsCleanup.nextRunAt,
                      nowMs,
                    )
                  : "—"}
                {data.sessionsCleanup.lastDurationMs !== null &&
                  ` · last took ${data.sessionsCleanup.lastDurationMs}ms`}
              </p>

              {data.sessionsCleanup.skippedDueToUnreachableDb && (
                <p
                  className="text-xs text-yellow-800 dark:text-yellow-200 mt-2 flex items-center gap-1"
                  data-testid="sessions-cleanup-db-unreachable"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Last tick skipped because the database was unreachable.
                </p>
              )}
              {data.sessionsCleanup.lastError && (
                <p
                  className="text-xs text-red-700 dark:text-red-300 mt-2 flex items-center gap-1"
                  data-testid="sessions-cleanup-last-error"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Last prune failed: {data.sessionsCleanup.lastError}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      <div className="p-4">
        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 p-2">
        <CardContent className="p-2">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-800/30 rounded-lg">
              <Cog className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h4 className="font-medium text-blue-900 dark:text-blue-100">About Background Services</h4>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                Background services run continuously to handle real-time updates, scheduled emails, and 
                automated workflows. If any service shows as stopped, some features may not work properly.
              </p>
            </div>
          </div>
        </CardContent>
        </Card>
        </div>
    </Card>  
    </div>
  );
}
