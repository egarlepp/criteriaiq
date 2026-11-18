import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { 
  HeartPulse, 
  Database,
  Mail,
  Plug,
  Shield,
  Cog,
  HardDrive,
  Gauge,
  Archive,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Settings,
  KeyRound,
  Loader2,
  RefreshCw,
  Lightbulb,
  Wrench,
  Bug
} from "lucide-react";
import { useSystemHealthCategoryQuery } from "./system-health/useSystemHealthCategoryQuery";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";

import { EnvStatusPanel } from "./EnvStatusPanel";
import { formatRelativeUpdatedAt } from "./system-health/freshness";
import { DatabaseHealthTab } from "./system-health/DatabaseHealthTab";
import { EmailHealthTab } from "./system-health/EmailHealthTab";
import { IntegrationHealthTab } from "./system-health/IntegrationHealthTab";
import { SecurityHealthTab } from "./system-health/SecurityHealthTab";
import { BackgroundServicesTab } from "./system-health/BackgroundServicesTab";
import { StorageHealthTab } from "./system-health/StorageHealthTab";
import { PerformanceHealthTab } from "./system-health/PerformanceHealthTab";
import { ArchiveValidationTab } from "./system-health/ArchiveValidationTab";

// Re-export the live "updated Xs / Xm / Xh ago" formatter so the
// existing test imports of `formatRelativeUpdatedAt` from
// `SystemHealthSection` keep working. The implementation moved into
// `./system-health/freshness` (Task #425) so the per-category Health
// tabs can share it without creating a circular import back to this
// module (which itself imports the tabs).
export { formatRelativeUpdatedAt };

// Render a live "next refresh in Xs" countdown for the System Health
// overview header (Task #424). Task #418 surfaced how stale the data
// already is; this complementary helper tells operators how long until
// the next automatic refetch fires so they can decide whether to wait
// or click "Refresh now". Exported so the unit tests can pin the
// boundary behaviour without mounting React.
//
// The countdown is derived from the moment fresh data landed
// (`updatedAtMs`, the query's `dataUpdatedAt`) plus the polling
// interval — that way a successful refetch automatically resets the
// label to ~60s without any extra wiring. We `Math.ceil` so the label
// shows "60s" → "59s" → … → "1s" rather than briefly flashing "0s"
// before the poll lands, clamp to 0 so a stalled poll (interval
// has elapsed but the next response hasn't arrived yet) reads "next
// refresh in 0s" instead of going negative, and clamp to the
// interval at the top end so a backward client-clock jump (NTP
// correction, laptop wake-from-sleep) can't show an impossibly large
// "next refresh in 999s" — the value always stays inside [0,
// intervalSeconds].
export function formatNextRefreshIn(
  updatedAtMs: number,
  currentMs: number,
  intervalMs: number,
): string {
  const remainingMs = updatedAtMs + intervalMs - currentMs;
  const intervalSeconds = Math.ceil(intervalMs / 1000);
  const rawSeconds = Math.ceil(remainingMs / 1000);
  const seconds = Math.min(intervalSeconds, Math.max(0, rawSeconds));
  return `next refresh in ${seconds}s`;
}

// Env-vars block returned inline on `/api/system/health` for Admin
// callers (Task #350). Mirrors the safe-to-serialise subset of the
// bootstrap snapshot: the server-side `buildEnvVarsBlock` helper
// derives the `status` precedence so the dashboard can render the 9th
// "Environment Variables" tile without re-running the grading rules
// locally (Task #352).
interface EnvVarsBlock {
  status: "ok" | "warning" | "error";
  databaseUrlSource: string;
  sessionSecretSource: string;
  encryptionKeySource: string;
  publicAppUrl: string;
  publicAppUrlSource: string;
  // Task #741: data directory writable probe. Surfaced inline on the
  // env-vars block (rather than its own category tile) because every
  // promote/unmanage/regenerate operation depends on it. When `ok` is
  // false the env-vars tile rolls up to error and the overview renders
  // an explicit "Data directory not writable" health row so the
  // operator sees the failure before they try to promote a secret and
  // get a 503 mid-action. Optional for backward compatibility with
  // older server payloads that pre-date Task #741.
  dataDir?: {
    ok: boolean;
    path: string;
    reason: string | null;
  };
}

interface SystemHealthOverview {
  overallStatus: "ok" | "warning" | "error";
  lastChecked: string;
  // `pendingMigrations` (Task #400) is the number of migration files
  // present in `migrations/` that have NOT yet been recorded in
  // `schema_migrations`. The server downgrades `database.status` to
  // `warning` whenever this is non-zero so the headline rollup already
  // reflects the drift; the field is mirrored on the tile so we can
  // render a tooltip pointing at the exact count without a second
  // round-trip to `/api/system/health/database`.
  //
  // `pendingMigrationFiles` (Task #412) is a server-capped preview of
  // the actual filenames so the tile tooltip can name the exact files
  // an admin needs to act on — rather than just the count. The list is
  // intentionally short (the server caps it); when the full count
  // exceeds the preview length the tooltip renders a "+N more"
  // affordance and the tile click deep-links into the Schema Migrations
  // card on the Database tab where the full list lives.
  database: {
    status: "ok" | "warning" | "error";
    pendingMigrations?: number;
    pendingMigrationFiles?: string[];
    // Live pool snapshot folded into the overview payload so the
    // System Health overview tile can render the
    // `totalCount / poolMax in use` gauge alongside a "N waiting"
    // badge without a second round-trip to the deep Database tab
    // (Task #515). Mirrors the contract `DatabaseHealthTab` reads
    // from `/api/system/health/database`. Optional + permissive
    // (legacy alias fields kept) for forward-compat with older
    // server payloads, exactly like the deep tab.
    connectionPool?: {
      poolMax?: number;
      totalCount?: number;
      idleCount?: number;
      waitingCount?: number;
      maxConnections?: number;
      totalConnections?: number;
      idleConnections?: number;
    };
  };
  email: { status: "ok" | "warning" | "error" };
  integrations: { status: "ok" | "warning" | "error" };
  security: { status: "ok" | "warning" | "error" };
  backgroundServices: { status: "ok" | "warning" | "error" };
  storage: { status: "ok" | "warning" | "error" };
  performance: { status: "ok" | "warning" | "error" };
  archiveSchemaValidation: { status: "ok" | "warning" | "error" };
  // Demand-and-defect cards added so operators can see at a glance
  // whether feedback or captured browser errors are sitting unhandled.
  // All three share the `{ status, totalCount, message? }` shape; the
  // category cards in `healthCategories` below render the count via
  // the `extra` slot. Marked optional for forward-compat with older
  // server payloads — fallback `status: 'ok'` keeps the tile green
  // when the server omits the block.
  featureRequests?: { status: "ok" | "warning" | "error"; totalCount: number; message?: string };
  supportRequests?: { status: "ok" | "warning" | "error"; totalCount: number; message?: string };
  clientErrors?: { status: "ok" | "warning" | "error"; totalCount: number; message?: string };
  // Admin-only block (Task #350): the server now folds the four env-var
  // rows from the bootstrap snapshot into `/api/system/health` so the
  // dashboard rollup no longer needs a separate `/api/system/env-status`
  // round-trip. Optional because non-Admin callers don't get it.
  envVars?: EnvVarsBlock;
  // Headline Healthy / Warnings / Errors counts that drive the three big
  // tiles above the category grid (Task #352). Computed server-side so
  // both the React dashboard and any other consumer of
  // `/api/system/health` see the same numbers without re-implementing
  // the precedence rules locally. Includes the four env-var rows for
  // Admin callers; for non-admins it's just the eight categories.
  //
  // Marked optional/partial defensively (Task #355): if a future server
  // change omits the block, returns `null`, or only fills some of the
  // three counts, the overview falls back to counting the per-category
  // statuses client-side rather than crashing the whole panel —
  // operators see a degraded but functional dashboard exactly when they
  // need it most.
  overviewCounts?: {
    healthy?: number;
    warning?: number;
    error?: number;
  } | null;
}

// Polling interval for the System Health overview query (Task #411).
// Hoisted to a module-level constant so the countdown helper
// (`formatNextRefreshIn`) and the `useQuery` `refetchInterval` can't
// drift apart — if we ever change the cadence, both surfaces update in
// lockstep and operators don't see a countdown reset to a stale "60s"
// while the actual poll fires every 30s (or vice versa).
//
// Task #437 turned this from a hard-coded constant into the default
// for an operator-controlled selector — the value below is now only
// the seed used the first time someone opens the dashboard. Once the
// operator picks a cadence we persist it to `localStorage` and re-read
// it on subsequent mounts so the choice sticks across reloads.
const SYSTEM_HEALTH_REFETCH_INTERVAL_DEFAULT_MS = 60_000;

// Cadence options surfaced in the header selector (Task #437). Kept as
// a single source of truth so the `<select>` rendering, the
// localStorage validation, and any future analytics on operator
// preference all read from the same list. Exported so the unit tests
// can feed values into the formatter helpers without hard-coding the
// numeric literals in two places.
//
// Task #443 added the "Off" entry (value `0`) so an operator writing
// up a postmortem, capturing screenshots, or comparing two readings
// side-by-side can fully freeze the dashboard rather than just
// stretching the cadence to the slowest available tick. We treat `0`
// as the sentinel for "auto-refresh disabled" everywhere downstream:
// the `useQuery` block translates it to `refetchInterval: false`
// (TanStack Query's "don't poll" value) and the countdown swaps its
// "next refresh in Xs" label for a "paused" indicator so the frozen
// state is visible at a glance. "Refresh now" stays wired to a manual
// `refetch()` so an operator can still pull a fresh reading on demand
// without having to flip the cadence back on first.
export const SYSTEM_HEALTH_REFETCH_INTERVAL_OPTIONS: ReadonlyArray<{
  value: number;
  label: string;
}> = [
  { value: 30_000, label: "30s" },
  { value: 60_000, label: "60s" },
  { value: 300_000, label: "5m" },
  { value: 0, label: "Off" },
];

// localStorage key for the operator's preferred refresh cadence
// (Task #437). Namespaced so a future "preferences" rewrite can grep
// for every key the dashboard owns without hunting through string
// literals.
const SYSTEM_HEALTH_REFETCH_INTERVAL_STORAGE_KEY =
  "system-health-refetch-interval-ms";

// Number of consecutive `waitingCount > 0` polls that must be observed
// before the Database overview tile downgrades from `ok` to `warning`
// (Task #515). Mirrors `SUSTAINED_WAITING_OBSERVATIONS` on the deep
// Database Health tab so a single transient burst doesn't redden the
// tile, but a genuinely-saturated pool surfaces as a warning across
// the overview without the operator having to click in. Kept as a
// local constant rather than imported from `DatabaseHealthTab` so the
// overview doesn't take a render-time dependency on the deep tab
// module (which pulls in the schema-migrations machinery).
const SUSTAINED_WAITING_OBSERVATIONS = 2;

// Read the operator's saved cadence from `localStorage`, falling back
// to the default if the key is missing, unparseable, or no longer one
// of the offered options. The whitelist check matters: if we ever
// shorten the option list we don't want a stale stored value silently
// reactivating an unsupported interval, and a corrupted entry (someone
// hand-edited storage, a migration wrote `"null"`) should land on the
// well-known default rather than crash the dashboard. Wrapped in
// `try/catch` because `localStorage` access throws in Safari private
// mode and on the server during SSR — neither is currently in scope
// for the dashboard, but the cost of defending against them is one
// `try/catch` and the alternative is a blank panel.
function loadStoredRefetchInterval(): number {
  if (typeof window === "undefined") {
    return SYSTEM_HEALTH_REFETCH_INTERVAL_DEFAULT_MS;
  }
  try {
    const raw = window.localStorage.getItem(
      SYSTEM_HEALTH_REFETCH_INTERVAL_STORAGE_KEY,
    );
    if (raw === null) return SYSTEM_HEALTH_REFETCH_INTERVAL_DEFAULT_MS;
    const parsed = Number(raw);
    if (
      Number.isFinite(parsed) &&
      SYSTEM_HEALTH_REFETCH_INTERVAL_OPTIONS.some((opt) => opt.value === parsed)
    ) {
      return parsed;
    }
    return SYSTEM_HEALTH_REFETCH_INTERVAL_DEFAULT_MS;
  } catch {
    return SYSTEM_HEALTH_REFETCH_INTERVAL_DEFAULT_MS;
  }
}

const healthTabs = [
  { id: "overview", label: "Overview", icon: HeartPulse },
  { id: "database", label: "Database", icon: Database },
  { id: "email", label: "Email", icon: Mail },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "security", label: "Security", icon: Shield },
  { id: "services", label: "Services", icon: Cog },
  { id: "storage", label: "Storage", icon: HardDrive },
  { id: "performance", label: "Performance", icon: Gauge },
  { id: "archive", label: "Archive", icon: Archive },
];

export function SystemHealthSection() {
  const [location, setLocation] = useLocation();
  const [activeSubTab, setActiveSubTab] = useState("overview");
  // `EnvStatusPanel` (rendered below the overview cards) and the embedded
  // env-var panel are both admin-only (the underlying
  // `/api/system/env-status` endpoint returns 403 to non-admins). Hide the
  // embedded panel for non-admin operators so they don't land on a
  // predictable error state inside the System Health overview.
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const subtab = urlParams.get('subtab');
    if (subtab && healthTabs.some(t => t.id === subtab)) {
      setActiveSubTab(subtab);
    }
  }, [location]);

  useEffect(() => {
    const handleNavigation = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const subtab = urlParams.get('subtab');
      if (subtab && healthTabs.some(t => t.id === subtab)) {
        setActiveSubTab(subtab);
      }
    };

    window.addEventListener('popstate', handleNavigation);
    return () => window.removeEventListener('popstate', handleNavigation);
  }, []);

  const handleSubTabChange = (value: string) => {
    setActiveSubTab(value);
    const newUrl = `/admin?tab=system-health&subtab=${value}`;
    window.history.pushState({}, '', newUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  // Operator-controlled polling cadence for the System Health overview
  // (Task #437). Task #411 introduced a fixed 60s poll and Task #424
  // surfaced that cadence honestly via the countdown — but during an
  // active incident 60s feels long, and during steady-state operation
  // it's noisier than it needs to be. Promoting the interval to state
  // lets operators dial the cadence to match what they're doing while
  // keeping the `refetchInterval` and the countdown wired to the same
  // value, so they continue to update in lockstep.
  //
  // Initialised lazily from `localStorage` so an operator's preferred
  // cadence sticks across reloads. The setter below mirrors every
  // change back into storage; if either side throws (Safari private
  // mode, SSR) the dashboard still works — the in-memory state is the
  // source of truth, persistence is best-effort.
  const [refetchIntervalMs, setRefetchIntervalMs] = useState<number>(
    () => loadStoredRefetchInterval(),
  );

  const handleRefetchIntervalChange = (next: number) => {
    setRefetchIntervalMs(next);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        SYSTEM_HEALTH_REFETCH_INTERVAL_STORAGE_KEY,
        String(next),
      );
    } catch {
      // Persisting the preference is best-effort; an exception here
      // (quota exceeded, private mode) shouldn't break the in-memory
      // update the operator just made.
    }
  };

  // Auto-refresh contract for the System Health overview (Task #411).
  // Task #400 wired migration drift into the headline Database tile, but
  // without a periodic refetch the tile would stay green for an admin who
  // was already on the page when a deployment landed unapplied files.
  //
  // The polling/focus contract — `refetchInterval`,
  // `refetchIntervalInBackground: false`, `refetchOnWindowFocus: true`
  // — is shared with every per-category sub-tab via
  // `useSystemHealthCategoryQuery` (Task #421). The helper bakes in
  // the focus/background settings so a future contributor can't
  // silently drift them; we only have to supply `refetchInterval`
  // here.
  //
  // - `refetchInterval: refetchIntervalMs` polls `/api/system/health`
  //   on the operator-selected cadence (Task #437) so drift (and any
  //   other category status flip) appears within one interval without
  //   the operator having to reload the tab. The same state value
  //   feeds the visible "next refresh in X" countdown so the label
  //   can't drift from the actual cadence. When the operator picks
  //   the "Off" cadence (value `0`, Task #443) we hand TanStack Query
  //   `false` instead — its documented "disable polling entirely"
  //   sentinel — so the only way fresh data lands is the explicit
  //   "Refresh now" button or the focus-refetch contract above.
  // - `staleTime: 30000` keeps unrelated re-mounts (e.g. flipping between
  //   System Health sub-tabs) from spamming the endpoint while still
  //   allowing the focus-refetch above to run when the data is older.
  const {
    data: overviewData,
    isLoading: overviewLoading,
    error: overviewError,
    refetch: refetchOverview,
    isFetching: overviewFetching,
    dataUpdatedAt: overviewDataUpdatedAt,
  } = useSystemHealthCategoryQuery<SystemHealthOverview>({
    queryKey: ["system-health-overview"],
    queryFn: async () => {
      const response = await fetch("/api/system/health");
      if (!response.ok) throw new Error("Failed to fetch system health");
      return response.json();
    },
    refetchInterval: refetchIntervalMs > 0 ? refetchIntervalMs : false,
    staleTime: 30000,
  });

  // Live "updated Xs ago" ticker for the overview header (Task #418).
  // Task #411 added 60-second polling but the only visible timestamp
  // was the static `lastChecked` line — operators couldn't tell at a
  // glance whether the dashboard was live, frozen, or about to refresh.
  // Ticking once per second on a single component-level interval is
  // cheap (the overview is mounted at most once) and lets us re-render
  // the relative label in place using `Date.now()` against the query's
  // `dataUpdatedAt`. We deliberately use `dataUpdatedAt` (the moment
  // the client received fresh data) rather than the server-side
  // `lastChecked` so the label tracks the dashboard's own freshness —
  // if the network stalls and the next poll never lands, the counter
  // keeps climbing and operators see the staleness instead of a label
  // pinned to whatever the last successful response said.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Sustained-waiters tracker for the Database overview tile (Task
  // #515). The deep Database Health tab uses an identical
  // `SUSTAINED_WAITING_OBSERVATIONS` debounce before it surfaces its
  // "raise DB_POOL_MAX" hint; we mirror that here so the overview
  // tile downgrades to `warning` only after the pool has actually
  // been saturated across multiple polls — a single transient burst
  // shouldn't redden the tile during steady-state operation. The
  // counter is bumped on every fresh `/api/system/health` payload
  // that reports `waitingCount > 0` and reset to 0 the moment a poll
  // observes the queue drained, so the warning state lifts as soon
  // as the pool recovers. Keying the effect on `overviewDataUpdatedAt`
  // ensures we count one bump per actual poll (not on every render).
  const dbPool = overviewData?.database?.connectionPool;
  const dbWaitingCount =
    dbPool?.waitingCount ?? 0;
  const [sustainedDbWaitingCount, setSustainedDbWaitingCount] = useState(0);
  useEffect(() => {
    if (!overviewData) return;
    setSustainedDbWaitingCount((prev) =>
      dbWaitingCount > 0 ? prev + 1 : 0,
    );
    // `overviewDataUpdatedAt` is the source-of-truth "fresh poll
    // landed" trigger; depending on `dbWaitingCount` alone would miss
    // back-to-back polls that happen to report the same waiter count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overviewDataUpdatedAt]);

  // The env-var snapshot used to power both the headline rollup
  // (Task #349) AND the 9th "Environment Variables" tile in the
  // category grid (Task #348) now arrives inline on `/api/system/health`
  // for admin callers (Task #350). For non-Admin callers the server
  // omits the `envVars` block entirely, so `envStatusData` is
  // `undefined` and the env-status tile is filtered out of
  // `healthCategories` below.
  const envStatusData = overviewData?.envVars;

  // The single traffic-light status for the new "Environment Variables"
  // tile (Task #348) is now graded server-side (Task #352) — the
  // dashboard simply reads `envVars.status` rather than re-running the
  // precedence rules over the four source labels. Stays `undefined`
  // while the query is loading so the card renders a neutral state
  // instead of flashing green.
  const envWorstStatus: "ok" | "warning" | "error" | undefined =
    envStatusData?.status;

  const getStatusBadge = (status: "ok" | "warning" | "error") => {
    switch (status) {
      case "ok":
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Healthy
          </Badge>
        );
      case "warning":
        return (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Warning
          </Badge>
        );
      case "error":
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Error
          </Badge>
        );
    }
  };

  const getStatusColor = (status: "ok" | "warning" | "error") => {
    switch (status) {
      case "ok": return "bg-green-500";
      case "warning": return "bg-yellow-500";
      case "error": return "bg-red-500";
    }
  };

  const renderOverview = () => {
    if (overviewLoading) {
      return (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <HeartPulse className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <CardTitle>System Health Overview</CardTitle>
                  <CardDescription>Loading system health status...</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        </div>
      );
    }

    if (overviewError || !overviewData) {
      return (
        <div className="space-y-4">
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-red-700">
                <AlertTriangle className="h-5 w-5" />
                <span>Failed to load system health data.</span>
                <Button variant="outline" size="sm" onClick={() => refetchOverview()}>
                  Retry
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    // Migration drift tooltip (Tasks #400 / #412). When the server
    // reports `pendingMigrations > 0` the database tile downgrades to
    // `warning` and we attach a hover tooltip that names the exact
    // files an admin needs to act on — so an operator scanning the
    // overview during an incident sees the actionable signal without
    // having to click through to the deeper Schema Migrations card on
    // the Database tab. The server caps `pendingMigrationFiles` to a
    // small preview list; when the full count exceeds the preview we
    // surface a "+N more" affordance and the tile click deep-links into
    // the Schema Migrations card (via `#schema-migrations`) where the
    // full list lives.
    const databasePendingMigrations = overviewData.database?.pendingMigrations ?? 0;
    const databasePendingFiles = overviewData.database?.pendingMigrationFiles ?? [];
    const databasePendingHiddenCount = Math.max(
      0,
      databasePendingMigrations - databasePendingFiles.length,
    );
    const databaseTooltip: React.ReactNode | undefined =
      databasePendingMigrations > 0
        ? (
            <div data-testid="tooltip-pending-migrations" className="space-y-1">
              <p className="font-medium">
                {databasePendingMigrations} migration
                {databasePendingMigrations === 1 ? "" : "s"} on disk{" "}
                {databasePendingMigrations === 1 ? "has" : "have"} not been applied
              </p>
              {databasePendingFiles.length > 0 && (
                <ul
                  className="font-mono list-disc pl-4 space-y-0.5"
                  data-testid="tooltip-pending-migration-files"
                >
                  {databasePendingFiles.map((file) => (
                    <li key={file}>{file}</li>
                  ))}
                  {databasePendingHiddenCount > 0 && (
                    <li
                      className="font-sans italic list-none pl-0"
                      data-testid="tooltip-pending-migration-more"
                    >
                      +{databasePendingHiddenCount} more
                    </li>
                  )}
                </ul>
              )}
              <p className="text-[11px] italic opacity-80">
                Click to view details
              </p>
            </div>
          )
        : undefined;

    // When migration drift is present, the Database tile click deep-links
    // straight into the Schema Migrations card on the Database tab via a
    // URL hash (Task #412) — the card adds a matching `id` and scrolls
    // itself into view on mount when the hash is set. Without drift the
    // tile just opens the Database tab as before.
    const databaseHash = databasePendingMigrations > 0 ? "schema-migrations" : undefined;

    // Live pool gauge for the Database overview tile (Task #515). We
    // surface the same `totalCount / poolMax in use` headline the deep
    // Database Health tab carries, plus a small "N waiting" badge
    // whenever requests are queued, so an operator landing on the
    // overview during an incident can see whether the pool is
    // saturated without having to click into the Database tab.
    //
    // The pool block is optional on the wire (older server payloads
    // pre-Task-#515 omit it); when the block is missing we render no
    // gauge so the tile stays exactly as it was. The legacy
    // `maxConnections` / `totalConnections` aliases are honoured here
    // for forward-compat with mixed client/server upgrade orderings,
    // mirroring how `DatabaseHealthTab` normalises the same payload.
    const dbPoolForTile = overviewData.database?.connectionPool;
    const dbPoolTotal =
      dbPoolForTile?.totalCount ?? dbPoolForTile?.totalConnections;
    const dbPoolMax =
      dbPoolForTile?.poolMax ?? dbPoolForTile?.maxConnections;
    const dbPoolWaiting = dbPoolForTile?.waitingCount ?? 0;
    const databaseExtra: React.ReactNode | undefined =
      dbPoolForTile && dbPoolTotal !== undefined && dbPoolMax !== undefined
        ? (
            <div
              className="mt-2 flex items-center gap-2 text-xs"
              data-testid="health-card-database-pool"
            >
              <span className="font-mono text-gray-700 dark:text-gray-300">
                Pool {dbPoolTotal} / {dbPoolMax}
              </span>
              {dbPoolWaiting > 0 && (
                <span
                  data-testid="health-card-database-waiting"
                  className="rounded border border-yellow-300 dark:border-yellow-700 bg-yellow-100/80 dark:bg-yellow-900/40 px-1.5 py-0 text-[10px] font-semibold text-yellow-800 dark:text-yellow-200"
                >
                  {dbPoolWaiting} waiting
                </span>
              )}
            </div>
          )
        : undefined;

    // Sustained-waiters downgrade for the Database tile (Task #515).
    // Only override `ok` → `warning` so we never *upgrade* a server
    // status (e.g. an `error` tile must stay red even if the pool
    // happens to be quiet). The deep Database Health tab uses the
    // same `SUSTAINED_WAITING_OBSERVATIONS` debounce, so the two
    // surfaces stay in sync about when waiters are "real" vs a blip.
    const databaseServerStatus = overviewData.database?.status;
    const databaseEffectiveStatus: "ok" | "warning" | "error" | undefined =
      databaseServerStatus === "ok" &&
      sustainedDbWaitingCount >= SUSTAINED_WAITING_OBSERVATIONS
        ? "warning"
        : databaseServerStatus;

    // Compact inline number rendered in each card's `extra` slot for
    // the three "feedback / defects" tiles. Uses Intl.NumberFormat so
    // large counts (1,234) stay readable. The wrapper styling matches
    // the Database tile's "Pool 4 / 10" gauge so all `extra` slots
    // read as the same kind of secondary detail.
    const formatCount = (n: number) => new Intl.NumberFormat().format(n);
    const inlineCount = (value: number) => (
      <div className="mt-2 flex items-center gap-2 text-xs">
        <span className="font-mono text-gray-700 dark:text-gray-300">
          {formatCount(value)}
        </span>
      </div>
    );

    const healthCategories = [
      { key: "database", label: "Database", icon: Database, status: databaseEffectiveStatus, tooltip: databaseTooltip, hash: databaseHash, extra: databaseExtra },
      { key: "email", label: "Email System", icon: Mail, status: overviewData.email?.status },
      { key: "integrations", label: "Integrations", icon: Plug, status: overviewData.integrations?.status },
      { key: "security", label: "Security", icon: Shield, status: overviewData.security?.status },
      { key: "services", label: "Background Services", icon: Cog, status: overviewData.backgroundServices?.status },
      { key: "storage", label: "Storage", icon: HardDrive, status: overviewData.storage?.status },
      { key: "performance", label: "Performance", icon: Gauge, status: overviewData.performance?.status },
      { key: "archive", label: "Archive Validation", icon: Archive, status: overviewData.archiveSchemaValidation?.status },
      // Demand-and-defect cards (Feature Requests / Support Requests /
      // Client Errors). Each links OUT of System Health to the
      // canonical detail pages (Admin › Support Requests and Error Log) so we
      // don't duplicate those tables here. The card click handler
      // honours `href` and drives the same pushState + popstate
      // handshake the env-status tile uses, swapping both `tab` and
      // `subtab` in one go. Client Errors deep-links to the Error
      // Audit Log sub-tab for admins; for non-admins the parent page
      // gracefully falls back to the main requests view since the
      // audit log sub-tab is admin-only.
      {
        key: "feature-requests",
        label: "Feature Requests",
        icon: Lightbulb,
        status: overviewData.featureRequests?.status ?? "ok",
        tooltip: overviewData.featureRequests?.message,
        href: "/admin?tab=support-requests",
        extra: inlineCount(overviewData.featureRequests?.totalCount ?? 0),
      },
      {
        key: "support-requests",
        label: "Support Requests",
        icon: Wrench,
        status: overviewData.supportRequests?.status ?? "ok",
        tooltip: overviewData.supportRequests?.message,
        href: "/admin?tab=support-requests",
        extra: inlineCount(overviewData.supportRequests?.totalCount ?? 0),
      },
      {
        key: "client-errors",
        label: "Client Errors",
        icon: Bug,
        status: overviewData.clientErrors?.status ?? "ok",
        tooltip: overviewData.clientErrors?.message,
        href: "/admin?tab=error-log",
        extra: inlineCount(overviewData.clientErrors?.totalCount ?? 0),
      },
      // 9th tile (Task #348). Admin-only — non-admins skip both the query
      // and the tile, so `envWorstStatus` is `undefined` and the entry gets
      // dropped by the `.filter` below. The full Environment variable status
      // panel is rendered further down this page (it used to also have its
      // own System Settings view), so the tile scrolls to it.
      isAdmin
        ? {
            key: "env-status",
            label: "Environment Variables",
            icon: KeyRound,
            status: envWorstStatus,
            scrollTarget: '[data-testid="env-status-panel"]',
            // Task #741: when the boot probe found the data directory
            // not-writable, surface a red row directly on the tile so
            // operators see "Data directory not writable — promote-to-
            // file actions will fail" without having to click into the
            // env-status panel. The server already rolls dataDir.ok=false
            // up into envVars.status='error' (see system-health-env-
            // rollup.ts), so the tile is already red — this just
            // explains *why* it's red and what's broken. The tooltip
            // mirrors the same message and includes the resolved path
            // so an admin can fix the volume permissions directly.
            extra:
              envStatusData?.dataDir && !envStatusData.dataDir.ok ? (
                <div
                  className="mt-2 flex items-start gap-1.5 text-xs text-red-700 dark:text-red-400"
                  data-testid="env-status-data-dir-error"
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>
                    Data directory not writable — promote-to-file actions
                    will fail.
                  </span>
                </div>
              ) : undefined,
            tooltip:
              envStatusData?.dataDir && !envStatusData.dataDir.ok
                ? `Data directory not writable: ${envStatusData.dataDir.path}` +
                  (envStatusData.dataDir.reason
                    ? ` — ${envStatusData.dataDir.reason}`
                    : "")
                : undefined,
          }
        : { key: "env-status", label: "Environment Variables", icon: KeyRound, status: undefined as undefined },
    ].filter(c => c.status !== undefined) as Array<{ key: string; label: string; icon: any; status: "ok" | "warning" | "error"; href?: string; scrollTarget?: string; tooltip?: React.ReactNode; hash?: string; extra?: React.ReactNode }>;

    // Headline counts and overall badge are now both server-derived
    // (Task #352). For admins the server folds the env-var block into
    // both `overviewCounts` and `overallStatus` (Tasks #349/#350) as a
    // SINGLE entry — graded by the same `envVars.status` that colours
    // the one env-vars tile below — so the headline numbers always
    // equal the count of tiles with each border colour (Task #354).
    // For non-admins it's just the eight categories. Either way the
    // dashboard simply renders what it is told instead of running its
    // own copy of the precedence rules — keeping the server as the
    // single source of truth so the two surfaces can never disagree.
    //
    // Defensive fallback (Task #355): if the server omits the block,
    // sends `null`, or only fills some of the three counts, count the
    // visible category tiles client-side so the overview degrades to a
    // still-useful render rather than crashing the whole panel or
    // showing `undefined`. This is intentionally a back-stop — the
    // server remains the source of truth whenever it provides the
    // rollup so the surfaces can't disagree under normal operation.
    const fallbackCounts = healthCategories.reduce(
      (acc, c) => {
        if (c.status === "ok") acc.healthy += 1;
        else if (c.status === "warning") acc.warning += 1;
        else if (c.status === "error") acc.error += 1;
        return acc;
      },
      { healthy: 0, warning: 0, error: 0 },
    );
    const serverCounts = overviewData.overviewCounts ?? undefined;
    // When the client downgrades the Database tile for sustained
    // waiters (Task #515) the server-derived `overviewCounts` no
    // longer matches the visible tile colours — the server doesn't
    // know about the per-client sustained debounce. In that case we
    // prefer `fallbackCounts` (which is computed from the *effective*
    // statuses already applied to the tile grid) so the headline
    // Healthy / Warnings / Errors numbers always equal the count of
    // tiles with each border colour, just like Task #354 set out to
    // guarantee. Same logic for the overall status pill on the
    // header — it must reflect the worst tile actually visible.
    const databaseStatusOverridden =
      databaseEffectiveStatus !== undefined &&
      databaseEffectiveStatus !== databaseServerStatus;
    const healthyCount = databaseStatusOverridden
      ? fallbackCounts.healthy
      : (serverCounts?.healthy ?? fallbackCounts.healthy);
    const warningCount = databaseStatusOverridden
      ? fallbackCounts.warning
      : (serverCounts?.warning ?? fallbackCounts.warning);
    const errorCount = databaseStatusOverridden
      ? fallbackCounts.error
      : (serverCounts?.error ?? fallbackCounts.error);
    const effectiveOverallStatus: "ok" | "warning" | "error" =
      databaseStatusOverridden && overviewData.overallStatus === "ok"
        ? "warning"
        : overviewData.overallStatus;

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-lg ${
                  effectiveOverallStatus === "ok" ? "bg-green-100 dark:bg-green-950/75" :
                  effectiveOverallStatus === "warning" ? "bg-yellow-100 dark:bg-yellow-950/75" : "bg-red-100 dark:bg-red-950/75"
                }`}>
                  <HeartPulse className={`h-8 w-8 ${
                    effectiveOverallStatus === "ok" ? "text-green-600" :
                    effectiveOverallStatus === "warning" ? "text-yellow-600" : "text-red-600"
                  }`} />
                </div>
                <div>
                  <CardTitle className="text-2xl">System Health Overview</CardTitle>
                  <CardDescription>
                    Real-time monitoring of all system components
                  </CardDescription>
                </div>
              </div>
              {getStatusBadge(effectiveOverallStatus)}
            </div>
          </CardHeader>
          <CardContent>
            <TooltipProvider>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                <Card className="relative overflow-hidden bg-green-50/80 dark:bg-green-950/75 border-green-200">
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <CheckCircle2 className="h-32 w-32 opacity-10 text-green-600" />
                  </div>
                  <CardContent className="relative p-6">
                    <div className="flex items-center space-x-2 mb-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <CheckCircle2 className="w-5 h-5 text-green-900" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
                          <p>Systems operating normally</p>
                        </TooltipContent>
                      </Tooltip>
                      <h3 className="tracking-tight text-[19px] font-bold text-gray-900 dark:text-gray-100">Healthy</h3>
                    </div>
                    <div className="text-2xl font-bold text-green-600">
                      {healthyCount}
                    </div>
                    <p className="text-sm text-gray-500">Systems operating normally</p>
                  </CardContent>
                </Card>

                <Card className="relative overflow-hidden bg-yellow-50/80 dark:bg-yellow-950/75 border-yellow-200">
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <AlertTriangle className="h-32 w-32 opacity-10 text-yellow-600" />
                  </div>
                  <CardContent className="relative p-6">
                    <div className="flex items-center space-x-2 mb-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <AlertTriangle className="w-5 h-5 text-yellow-900" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
                          <p>Systems requiring attention</p>
                        </TooltipContent>
                      </Tooltip>
                      <h3 className="tracking-tight text-[19px] font-bold text-gray-900 dark:text-gray-100">Warnings</h3>
                    </div>
                    <div className="text-2xl font-bold text-yellow-600">
                      {warningCount}
                    </div>
                    <p className="text-sm text-gray-500">Systems requiring attention</p>
                  </CardContent>
                </Card>

                <Card className="relative overflow-hidden bg-red-50/80 dark:bg-red-950/75 border-red-200">
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <XCircle className="h-32 w-32 opacity-10 text-red-600" />
                  </div>
                  <CardContent className="relative p-6">
                    <div className="flex items-center space-x-2 mb-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <XCircle className="w-5 h-5 text-red-900" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
                          <p>Systems needing immediate action</p>
                        </TooltipContent>
                      </Tooltip>
                      <h3 className="tracking-tight text-[19px] font-bold text-gray-900 dark:text-gray-100">Errors</h3>
                    </div>
                    <div className="text-2xl font-bold text-red-600">
                      {errorCount}
                    </div>
                    <p className="text-sm text-gray-500">Systems needing immediate action</p>
                  </CardContent>
                </Card>
              </div>
            </TooltipProvider>
            <div className="flex items-center justify-between flex-wrap gap-3 text-sm text-muted-foreground">
              <span>
                Last checked: {new Date(overviewData.lastChecked).toLocaleString()}
              </span>
              {/* Live freshness indicator + manual refresh (Task #418).
                  The relative label re-renders every second from the
                  component-level `nowMs` ticker, so operators can see
                  the dashboard isn't frozen during an incident. The
                  spinner shows whenever a background refetch is in
                  flight (`isFetching` covers both the polling tick and
                  the manual button), and the button itself disables
                  while a request is pending so impatient operators
                  can't queue a flood of duplicate fetches. */}
              <span className="flex items-center gap-2">
                <span
                  data-testid="system-health-updated-ago"
                  aria-live="polite"
                >
                  {formatRelativeUpdatedAt(overviewDataUpdatedAt, nowMs)}
                </span>
                {/* Countdown to the next automatic refetch (Task #424).
                    Shares the same 1Hz `nowMs` ticker as the "updated
                    Xs ago" label and is derived from the query's
                    `dataUpdatedAt` plus the polling interval, so a
                    successful refetch resets it to ~60s for free. We
                    hide the countdown while a refetch is in flight so
                    it doesn't fight the spinner for the same screen
                    real estate — the spinner already tells the
                    operator the refresh is happening *right now*.
                    When the operator pauses auto-refresh entirely
                    (Task #443) the countdown loses its meaning, so we
                    swap it for an explicit "auto-refresh paused"
                    label inside the same span. Keeping the same
                    `data-testid` (rather than hiding the span) means
                    operators always have a single, glanceable status
                    in this slot — and screen-reader users hear the
                    paused state announced via the existing
                    `aria-live` region instead of having the indicator
                    silently disappear. */}
                {!overviewFetching && (
                  <span
                    data-testid="system-health-next-refresh"
                    aria-live="polite"
                    className="text-xs"
                  >
                    {refetchIntervalMs > 0
                      ? formatNextRefreshIn(
                          overviewDataUpdatedAt,
                          nowMs,
                          refetchIntervalMs,
                        )
                      : "auto-refresh paused"}
                  </span>
                )}
                {overviewFetching && (
                  <Loader2
                    data-testid="system-health-refreshing-spinner"
                    className="h-3.5 w-3.5 animate-spin"
                    aria-label="Refreshing"
                  />
                )}
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="system-health-refresh-now"
                  onClick={() => refetchOverview()}
                  disabled={overviewFetching}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  Refresh now
                </Button>
                {/* Operator-controlled cadence selector (Task #437).
                    Sits beside the manual "Refresh now" button so the
                    two refresh affordances are visually grouped. We
                    use a native `<select>` rather than the styled
                    Radix component so the change event is trivially
                    drivable from the unit tests (which mount via
                    happy-dom, where Radix's portal-based listbox is
                    awkward to interact with) and so the keyboard
                    affordance matches the rest of the browser's
                    chrome. The label is hidden visually but exposed
                    to screen readers via `aria-label`. */}
                <label className="flex items-center gap-1 text-xs">
                  <span className="sr-only">Refresh every</span>
                  <span aria-hidden="true">Refresh every:</span>
                  <select
                    data-testid="system-health-refresh-interval-select"
                    aria-label="Refresh every"
                    className="h-7 rounded-md border border-input bg-background px-1.5 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    value={refetchIntervalMs}
                    onChange={(e) =>
                      handleRefetchIntervalChange(Number(e.target.value))
                    }
                  >
                    {SYSTEM_HEALTH_REFETCH_INTERVAL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <TooltipProvider>
            {healthCategories.map((category) => {
              const card = (
                <Card
                  key={category.key}
                  data-testid={`health-card-${category.key}`}
                  // `h-full flex flex-col` lets the card stretch to the
                  // grid-row height that CSS Grid imposes when a sibling
                  // tile (the Database tile's connection-pool gauge) is
                  // taller than the rest. Without it the card stretched
                  // but its colored CardContent did not — leaving an
                  // uncolored white strip at the bottom (Task #557).
                  className={`relative overflow-hidden cursor-pointer transition-all hover:shadow-md h-full flex flex-col ${
                    category.status === "ok" ? "border-green-200" :
                    category.status === "warning" ? "border-yellow-200" :
                    category.status === "error" ? "border-red-200" : ""
                  }`}
                  onClick={() => {
                    // Cards backed by an in-page subtab (Database, Email, …)
                    // call `handleSubTabChange` to swap the active System Health
                    // sub-tab. The env-var tile scrolls to the panel below the
                    // cards. Cards that link out of System Health set an
                    // explicit `href` and we drive the same pushState +
                    // popstate handshake `config.tsx` listens for, so the
                    // outer page swaps both `tab` and `subtab` in one go.
                    if (category.scrollTarget) {
                      document.querySelector(category.scrollTarget)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
                      return;
                    }
                    if (category.href) {
                      window.history.pushState(null, "", category.href);
                      window.dispatchEvent(new PopStateEvent("popstate"));
                      return;
                    }
                    // When the category sets a `hash` (Task #412 — the
                    // Database tile in migration-drift state) push a URL
                    // that includes the anchor and dispatch a
                    // `hashchange` event so the destination tab can
                    // scroll the matching section into view. We still
                    // call `handleSubTabChange` to ensure the right
                    // sub-tab activates first; the hash listener on the
                    // tab itself handles the scroll-to behaviour.
                    if (category.hash) {
                      setActiveSubTab(category.key);
                      const newUrl = `/admin?tab=system-health&subtab=${category.key}#${category.hash}`;
                      window.history.pushState({}, "", newUrl);
                      window.dispatchEvent(new PopStateEvent("popstate"));
                      window.dispatchEvent(new HashChangeEvent("hashchange"));
                      return;
                    }
                    handleSubTabChange(category.key);
                  }}
                >
                  <category.icon
                    className="absolute right-24 top-1/2 h-32 w-32 text-blue-500/5 dark:text-white/5 pointer-events-none"
                    style={{ transform: "translateY(-50%) rotate(-12deg)" }}
                  />
                  {/* `flex-1` lets this colored block grow to fill any
                      extra height the parent Card receives from the CSS
                      grid so the status background reaches the bottom
                      edge instead of leaving an uncolored white strip
                      below the content (Task #557). */}
                  <CardContent className={`relative z-10 pt-4 flex-1 ${
                      category.status === "ok"
                        ? "bg-green-50/50 dark:bg-green-950/75"
                        : category.status === "warning"
                        ? "bg-yellow-50/50 dark:bg-yellow-950/75"
                        : "bg-red-50/50 dark:bg-red-950/75"
                    }`}>
                    <div className="flex items-center justify-between mb-3">
                      <category.icon className={`h-6 w-6 ${
                        category.status === "ok" ? "text-green-500" :
                        category.status === "warning" ? "text-yellow-500" : "text-red-500"
                      }`} />
                      <div className={`w-3 h-3 rounded-full ${getStatusColor(category.status)}`} />
                    </div>
                    <h3 className="font-medium">{category.label}</h3>
                    <p className="text-sm text-muted-foreground capitalize">{category.status}</p>
                    {/* Per-tile inline detail (Task #515 uses this for
                        the Database tile's "Pool X / Y" gauge plus the
                        "N waiting" badge). The slot is a no-op for
                        tiles without extra content so the existing
                        category cards keep their current layout. */}
                    {category.extra}
                  </CardContent>
                </Card>
              );
              // Wrap the tile in a hover tooltip when the category has
              // a per-tile message to surface (Task #400 uses this for
              // the migration-drift count on the Database tile). The
              // wrapper is a no-op for tiles without a tooltip so the
              // existing keyboard / click affordance for the other
              // categories stays exactly as it was.
              if (category.tooltip) {
                return (
                  <Tooltip key={category.key}>
                    <TooltipTrigger asChild>
                      {card}
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      data-testid={`tooltip-health-card-${category.key}`}
                      className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md max-w-xs"
                    >
                      {typeof category.tooltip === "string"
                        ? <p>{category.tooltip}</p>
                        : category.tooltip}
                    </TooltipContent>
                  </Tooltip>
                );
              }
              return card;
            })}
          </TooltipProvider>
        </div>

        {/* Env-var status badges (Task #346). This is the only place the
            panel is shown: the identical System Settings → Environment
            Variables view was removed, so there is no details link.
            Admin-only because the underlying endpoint is
            (`GET /api/system/env-status` returns 403 to non-admins). */}
        {isAdmin && <EnvStatusPanel />}

        <Card className="bg-blue-50 border-blue-200 dark:bg-blue-950/95">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-700/95 rounded-lg">
                <HeartPulse className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h4 className="font-medium text-blue-900">About System Health</h4>
                <p className="text-sm text-blue-700 dark:text-blue-500 mt-1">
                  This dashboard monitors all critical system components including database connections, 
                  email delivery, third-party integrations, security metrics, background services, 
                  storage, and performance indicators. Click on any card to view detailed metrics.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="space-y-4">

      <Tabs value={activeSubTab} onValueChange={handleSubTabChange} className="pt-0">
        {/* The view is picked from the top tab bar (System Health's sidebar sub-items). */}
        <div>
          <TabsContent value="overview" className="mt-2">
            {renderOverview()}
          </TabsContent>

          <TabsContent value="database" className="mt-2">
            <DatabaseHealthTab />
          </TabsContent>

          <TabsContent value="email" className="mt-2">
            <EmailHealthTab />
          </TabsContent>

          <TabsContent value="integrations" className="mt-2">
            <IntegrationHealthTab />
          </TabsContent>

          <TabsContent value="security" className="mt-2">
            <SecurityHealthTab />
          </TabsContent>

          <TabsContent value="services" className="mt-2">
            <BackgroundServicesTab />
          </TabsContent>

          <TabsContent value="storage" className="mt-2">
            <StorageHealthTab />
          </TabsContent>

          <TabsContent value="performance" className="mt-2">
            <PerformanceHealthTab />
          </TabsContent>

          <TabsContent value="archive" className="mt-2">
            <ArchiveValidationTab />
          </TabsContent>

        </div>
      </Tabs>
    </div>
  );
}
