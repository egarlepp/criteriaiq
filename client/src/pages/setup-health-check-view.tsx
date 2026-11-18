import { useEffect, useMemo, useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import { CheckCircle, AlertCircle, Loader2, RefreshCw, Settings, ChevronRight, ChevronDown, AlertTriangle, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { safeCopyToClipboard } from "@/lib/clipboard";
import { markCameFromSetup } from "@/lib/from-setup-marker";
import { SetupShell } from "./setup-shell";

/**
 * Mirrors the `MigrationFailureMarker` shape defined in
 * `server/lib/migration-failure-marker.ts`. Kept as a local copy so the
 * client bundle does not pull the server module (and its node:fs
 * imports) into the browser. The `/api/setup/status` endpoint serializes
 * this exact shape on the `lastMigrationFailure` field.
 */
interface LastMigrationFailure {
  filename: string;
  sqlState?: string | null;
  error: string;
  failedAt: string;
}

/**
 * Read-only health-check view rendered when /api/setup/status reports
 * `setupCompletedAt != null`. Replaces the unconditional "wizard at
 * step 1" landing so:
 *   - intentional /setup re-entries do not silently reset the
 *     operator's saved configuration;
 *   - the post-Redeploy useAuth bounce (which lands here with
 *     `?reentry=1`) opens directly on the failing check with a
 *     one-line explanation banner instead of the connect step.
 *
 * Reconfiguration is gated behind an explicit AlertDialog so a misclick
 * or accidental visit cannot drop the operator back into the 7-step
 * wizard. When the operator confirms, we hand control back to the
 * parent via `onReconfigure()` which flips the wizard render branch
 * inside `setup.tsx`.
 */

interface CheckRow {
  id: string;
  labelKey: string;
  ok: boolean | null; // null = still loading
  detailKey?: string;
  detailParams?: Record<string, string | number>;
  detailRaw?: string;
  /**
   * When true, the row's detail text renders even on the happy path
   * (`ok === true`) — used for informational rows like
   * "Recent upgrade activity" where the summary IS the value the
   * operator came to see, not a fallback shown only on failure.
   */
  alwaysShowDetail?: boolean;
  /**
   * Map of i18n interpolation keys to ISO-8601 timestamps that should
   * be rendered as relative-time phrases ("5 minutes ago", "just now",
   * …) at render time rather than at fetch time. Storing the raw
   * timestamp here — instead of pre-formatting it into `detailParams`
   * — lets `useRelativeTimeTick` re-render the label in place as time
   * passes, so an operator who leaves the tab open for 20 minutes
   * does not keep seeing the stale "5 minutes ago" snapshot taken at
   * the original fetch (Task #414).
   *
   * Values formatted from this map override any same-named keys in
   * `detailParams` so callers can supply a fallback string (e.g. "—")
   * via `detailParams` and have it survive when no timestamp is known.
   */
  relativeTimeParams?: Record<string, string>;
  /** Short explanation of what this check tests — shown in the expanded panel. */
  descriptionKey?: string;
  /** Remediation hint shown only when ok === false in the expanded panel. */
  fixKey?: string;
}

const CHECK_IDS = {
  serverAlive: "serverAlive",
  dbReachable: "dbReachable",
  adminExists: "adminExists",
  sessionSecretSet: "sessionSecretSet",
  encryptionKeySet: "encryptionKeySet",
  publicUrlResolves: "publicUrlResolves",
  authRoundTrip: "authRoundTrip",
  migrationsApplied: "migrationsApplied",
} as const;

interface SetupHealthCheckViewProps {
  /**
   * ISO timestamp at which the wizard was originally completed. Shown
   * in the header so the operator immediately knows the system has
   * been set up — and was not freshly installed under their feet.
   */
  setupCompletedAt: string;
  /**
   * `true` when this view was reached via the post-Redeploy useAuth
   * bounce (URL carries `?reentry=1`). When set we expand the first
   * failing check by default and surface a one-line explanation banner
   * at the top so the operator knows WHY they were just kicked here
   * rather than the homepage.
   */
  reentry?: boolean;
  /**
   * Invoked after the operator clicks "Reconfigure" and confirms the
   * dialog. Parent component is responsible for actually rendering the
   * wizard after this fires.
   */
  onReconfigure: () => void;
}

/**
 * Origin label for the publicAppUrl in the running process, mirrored
 * from the bootstrap snapshot. `'default'` is the smoking-gun signal
 * that the running server is still on the localhost fallback (no env
 * var set, no value in `data/db-config.json`) — which is exactly the
 * "needs a restart so hydrate can promote the saved file value into
 * env" state the Restart Required callout is for.
 */
type PublicUrlSource = "env" | "file" | "default";

/**
 * Per-field source labels mirrored from the bootstrap snapshot. Used
 * to gate the Restart Required callout (Task #582 §19) on a broader
 * "any wizard-managed value is in a stale/wizard-only state" signal
 * — not just the publicAppUrl. Each field is normalized to one of
 * its possible source values, or `null` when an older server omits
 * the field entirely (in which case we never trigger the callout
 * for that field — we'd rather under-fire than spook operators with
 * a false positive on an otherwise-healthy install).
 */
type BootstrapSources = {
  publicAppUrl: PublicUrlSource | null;
  databaseUrl: "env" | "wizard" | "none" | null;
  sessionSecret: "env" | "file" | "none" | null;
  encryptionKey: "env" | "file" | "none" | null;
};

/**
 * Per task plan §19, the callout fires when ANY of the four
 * wizard-managed source fields reports the running process is using
 * a saved-but-not-yet-promoted-to-env value. In practice only
 * `publicAppUrl === 'default'` and `databaseUrl === 'wizard'`
 * actually fire (sessionSecret / encryptionKey can never reach a
 * 'default'/'wizard' value because the snapshot's classification
 * suppresses env when store has the value, and the server can't
 * boot without env-promoted versions of those two anyway). The
 * other two checks are kept for forward-compatibility — if a future
 * snapshot refactor adds a 'wizard' source for them, the callout
 * picks it up automatically without another client patch.
 */
function isStaleSource(sources: BootstrapSources | null): boolean {
  if (!sources) return false;
  return (
    sources.publicAppUrl === "default" ||
    sources.databaseUrl === "wizard" ||
    // Defensive future-proofing: treat 'wizard' / 'default' on the
    // secret fields as stale even though today's snapshot can never
    // emit those values for them. Cast to string so TS doesn't bark
    // about comparing to values not in the union.
    (sources.sessionSecret as string) === "wizard" ||
    (sources.sessionSecret as string) === "default" ||
    (sources.encryptionKey as string) === "wizard" ||
    (sources.encryptionKey as string) === "default"
  );
}

export function SetupHealthCheckView({
  setupCompletedAt,
  reentry = false,
  onReconfigure,
}: SetupHealthCheckViewProps) {
  const { t, i18n } = useTranslation();
  const [checks, setChecks] = useState<CheckRow[]>(initialChecks());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  // Auto-expand always-show-detail rows once they resolve
  useEffect(() => {
    const alwaysOpen = checks.filter(c => c.alwaysShowDetail && c.ok !== null).map(c => c.id);
    if (alwaysOpen.length > 0) {
      setExpandedIds(prev => {
        const next = new Set(prev);
        alwaysOpen.forEach(id => next.add(id));
        return next;
      });
    }
  }, [checks]);

  const [running, setRunning] = useState(false);
  const [confirmReconfigure, setConfirmReconfigure] = useState(false);
  // Re-render every 30 s so any row whose detail copy interpolates a
  // relative-time phrase (Task #409 / #414) updates in place — without
  // refetching anything — as the underlying timestamp ages out of the
  // "X minutes ago" bucket the operator originally saw on page load.
  // The hook owns its setInterval / clearInterval lifecycle so this
  // component stays leak-free even when the operator navigates away
  // mid-tick. Same tick is reused by every relative-time label on the
  // page (e.g. the "Failed at" line on the migration-failure panel
  // can opt in later by reading the value through this hook).
  useRelativeTimeTick(30_000);
  // Persistent migration-failure marker (Task #394 / #396). Populated
  // from /api/setup/status during runChecks(). When non-null we render
  // a prominent red panel with the failing migration's filename,
  // SQLSTATE, timestamp, raw error and a "copy as JSON" button so the
  // operator can paste the whole marker into a support ticket without
  // digging through container logs. Clears automatically on the next
  // status fetch after the next successful boot wipes the marker file.
  const [lastMigrationFailure, setLastMigrationFailure] =
    useState<LastMigrationFailure | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  // Per-field source labels captured from the bootstrap snapshot
  // piggybacked on /api/setup/status. Drives:
  //   * The top-of-card "Restart Required" callout (visible when ANY
  //     of the four wizard-managed source fields reports a stale state
  //     — see isStaleSource() — per task plan §19).
  //   * The publicUrl row's wording (the row-specific branch only
  //     reads `publicAppUrl` so operators don't see the misleading
  //     "http://localhost:5000 unreachable" detail when the real cause
  //     is "the server hasn't loaded the saved value yet").
  // Null until the first /api/setup/status reply lands so we don't
  // flash the callout on first paint when the snapshot has not yet
  // arrived. Older servers that omit one or more source fields
  // contribute `null` for those fields (which isStaleSource ignores)
  // — see comment on BootstrapSources for the under-fire-on-purpose
  // rationale.
  const [bootstrapSources, setBootstrapSources] =
    useState<BootstrapSources | null>(null);
  // Operator-controlled hide for the restart-required callout. We do
  // not persist this across reloads — every fresh page load is a chance
  // for the operator to re-evaluate, and the callout disappears
  // automatically once every tracked source field flips off its stale
  // state after the post-restart hydrate runs.
  const [restartRequiredDismissed, setRestartRequiredDismissed] =
    useState(false);
  // Restart button state: `restarting` disables the button + the
  // re-run/reconfigure controls while we wait for the process to come
  // back, and `countdown` powers the "restarting in N…" hint so the
  // operator knows the page hasn't frozen. Mirrors the wizard's
  // handleLaunch flow at setup.tsx:709 so the UX is identical between
  // the wizard's Done step and this read-only landing.
  const [restarting, setRestarting] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  // Inline error surfaced when POST /api/setup/restart is refused with
  // 401/403 in full-boot-with-admin mode (Task #582). Without it the
  // 12s polling loop would silently pretend a restart happened.
  const [restartError, setRestartError] = useState<string | null>(null);

  useEffect(() => {
    void runChecks();
    // We deliberately run only on mount — operator uses the Re-run
    // button (or page reload) to refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runChecks() {
    setRunning(true);
    const next = initialChecks();

    // /api/health — generic liveness
    try {
      const h = await fetch("/api/health", { cache: "no-store" });
      const hj = await h.json();
      replace(next, CHECK_IDS.serverAlive, {
        ok: !!hj.ok,
        detailKey: hj.uptimeSec
          ? "setup.done.checks.uptime"
          : undefined,
        detailParams: hj.uptimeSec ? { seconds: hj.uptimeSec } : undefined,
      });
    } catch (e: any) {
      replace(next, CHECK_IDS.serverAlive, {
        ok: false,
        detailRaw: e?.message ? String(e.message) : undefined,
      });
    }

    // /api/setup/status — config + admin presence
    try {
      const r = await fetch("/api/setup/status", { cache: "no-store" });
      const s = await r.json();
      replace(next, CHECK_IDS.dbReachable, {
        ok: !s.setupRequired,
        detailKey: s.setupRequired
          ? "setup.done.checks.dbConfigMissing"
          : "setup.done.checks.dbConnected",
      });
      replace(next, CHECK_IDS.adminExists, { ok: !!s.adminExists });
      replace(next, CHECK_IDS.sessionSecretSet, { ok: !!s.hasSessionSecret });
      replace(next, CHECK_IDS.encryptionKeySet, { ok: !!s.hasEncryptionKey });
      // Pull through the persisted migration-failure marker so the
      // banner below this checks list can render. Validate the shape
      // defensively — an old server that hasn't shipped Task #394 yet
      // simply omits the field, so we tolerate undefined / null /
      // partially-populated payloads instead of throwing.
      setLastMigrationFailure(parseLastMigrationFailure(s.lastMigrationFailure));

      // Capture the four wizard-managed source fields from the
      // bootstrap snapshot (already spread into /api/setup/status by
      // server/routes/setup-routes.ts). The publicAppUrl source drives both
      // the top-of-card "Restart Required" callout AND the publicUrl
      // row's wording below; the other three feed the callout's
      // OR-gate via isStaleSource(). Defensive normalize: any field
      // an older server / mock omits falls back to `null` so the
      // callout never fires spuriously and the URL probe runs as
      // before.
      const normalizePublicUrl = (raw: unknown): PublicUrlSource | null =>
        raw === "env" || raw === "file" || raw === "default" ? raw : null;
      const normalizeDbUrl = (raw: unknown): BootstrapSources["databaseUrl"] =>
        raw === "env" || raw === "wizard" || raw === "none" ? raw : null;
      const normalizeSecret = (
        raw: unknown,
      ): BootstrapSources["sessionSecret"] =>
        raw === "env" || raw === "file" || raw === "none" ? raw : null;
      const nextPublicUrlSource = normalizePublicUrl(s.publicAppUrlSource);
      const nextSources: BootstrapSources = {
        publicAppUrl: nextPublicUrlSource,
        databaseUrl: normalizeDbUrl(s.databaseUrlSource),
        sessionSecret: normalizeSecret(s.sessionSecretSource),
        encryptionKey: normalizeSecret(s.encryptionKeySource),
      };
      setBootstrapSources(nextSources);

      // When the running process is on the localhost fallback
      // (`publicAppUrlSource === 'default'`) the URL the snapshot
      // returns is literally `http://localhost:5000` — probing it from
      // the operator's browser will *always* fail with a CORS / DNS /
      // connection error, and the resulting "http://localhost:5000
      // unreachable — Failed to fetch" detail is doubly misleading
      // (the server is fine, and the URL the operator actually saved
      // is sitting in `data/db-config.json` waiting for the next boot's
      // hydrate to promote it into env). Skip the probe in that state
      // and surface the new "not loaded" wording instead, so the row
      // points at the real cause: "restart the server" or "open
      // Reconfigure to set one if you skipped step 4".
      if (nextPublicUrlSource === "default") {
        replace(next, CHECK_IDS.publicUrlResolves, {
          ok: false,
          detailKey: "setup.done.checks.publicUrlNotLoaded",
        });
      } else if (s.publicAppUrl) {
        try {
          const probeUrl = String(s.publicAppUrl).replace(/\/$/, "") + "/api/health";
          const ph = await fetch(probeUrl, { cache: "no-store", credentials: "omit" });
          replace(next, CHECK_IDS.publicUrlResolves, {
            ok: ph.ok,
            detailKey: ph.ok
              ? "setup.done.checks.publicUrlOk"
              : "setup.done.checks.publicUrlReturned",
            detailParams: { url: s.publicAppUrl, status: ph.status },
          });
        } catch (e: any) {
          replace(next, CHECK_IDS.publicUrlResolves, {
            ok: false,
            detailKey: "setup.done.checks.publicUrlUnreachable",
            detailParams: {
              url: String(s.publicAppUrl),
              error: e?.message ?? "",
            },
          });
        }
      } else {
        replace(next, CHECK_IDS.publicUrlResolves, {
          ok: false,
          detailKey: "setup.done.checks.publicUrlNotSet",
        });
      }
    } catch (e: any) {
      // Status endpoint failure cascades — mark every status-derived
      // check as failed so the operator sees red-on-red instead of a
      // half-empty list.
      [
        CHECK_IDS.dbReachable,
        CHECK_IDS.adminExists,
        CHECK_IDS.sessionSecretSet,
        CHECK_IDS.encryptionKeySet,
        CHECK_IDS.publicUrlResolves,
      ].forEach((id) =>
        replace(next, id, {
          ok: false,
          detailRaw: e?.message ? String(e.message) : undefined,
        }),
      );
      // We could not read the status endpoint, so we cannot trust any
      // previously-cached marker either — clear it so the panel does
      // not linger after the marker has actually been wiped.
      setLastMigrationFailure(null);
    }

    // Session round-trip — unauthenticated /api/auth/user must respond
    // with 401 cleanly (or 200 if a session is in fact valid). Anything
    // else points at the cookie/proxy bug we just fixed.
    try {
      const u = await fetch("/api/auth/user", { cache: "no-store" });
      replace(next, CHECK_IDS.authRoundTrip, {
        ok: u.status === 401 || u.status === 200,
        detailKey: "setup.done.checks.authStatus",
        detailParams: { status: u.status },
      });
    } catch (e: any) {
      replace(next, CHECK_IDS.authRoundTrip, {
        ok: false,
        detailRaw: e?.message ? String(e.message) : undefined,
      });
    }

    // Recent upgrade activity (Task #399). The pre-login summary
    // endpoint returns ONLY counts + the latest applied-at timestamp
    // — never filenames — so operators can confirm the boot-time
    // migration runner did its job without first having to log in.
    // The check fails iff `anyPendingOnDisk` is true, which mirrors
    // the admin-only "Needs attention" badge on the System Health
    // schema-migrations card.
    try {
      const m = await fetch("/api/setup/migrations-summary", { cache: "no-store" });
      if (!m.ok) {
        replace(next, CHECK_IDS.migrationsApplied, {
          ok: false,
          detailKey: "setup.done.checks.migrationsHttpError",
          detailParams: { status: m.status },
        });
      } else {
        const ms = (await m.json()) as {
          appliedCount?: number;
          latestAppliedAt?: string | null;
          anyPendingOnDisk?: boolean;
        };
        const appliedCount = Number(ms.appliedCount ?? 0);
        const anyPending = !!ms.anyPendingOnDisk;
        const latest = ms.latestAppliedAt ?? null;

        // Detail copy mirrors the three states the operator can be
        // in. We deliberately route through i18n keys with sensible
        // English defaults instead of hard-coding strings — the
        // wizard is already localized and this row needs to fit in.
        //
        // The `when` interpolation is supplied two ways: a literal
        // "—" placeholder via `detailParams` so the i18n template
        // never renders "undefined" when no timestamp is known, and
        // — when a timestamp IS known — an entry on
        // `relativeTimeParams` that gets formatted on every render
        // by `useRelativeTimeTick`. The render-time formatter
        // overrides the placeholder, so the operator sees the live
        // "X minutes ago" phrase whenever the server returned a
        // timestamp, and the literal "—" otherwise (Task #414).
        let detailKey: string;
        let detailParams: Record<string, string | number> | undefined;
        let relativeTimeParams: Record<string, string> | undefined;
        if (anyPending) {
          if (appliedCount === 0) {
            detailKey = "setup.done.checks.migrationsAllPending";
          } else {
            detailKey = "setup.done.checks.migrationsPending";
            detailParams = { applied: appliedCount, when: "—" };
            if (latest) relativeTimeParams = { when: latest };
          }
        } else if (appliedCount === 0) {
          detailKey = "setup.done.checks.migrationsNone";
        } else {
          detailKey = "setup.done.checks.migrationsApplied";
          detailParams = { count: appliedCount, when: "—" };
          if (latest) relativeTimeParams = { when: latest };
        }

        replace(next, CHECK_IDS.migrationsApplied, {
          ok: !anyPending,
          detailKey,
          detailParams,
          relativeTimeParams,
        });
      }
    } catch (e: any) {
      replace(next, CHECK_IDS.migrationsApplied, {
        ok: false,
        detailRaw: e?.message ? String(e.message) : undefined,
      });
    }

    setChecks(next);
    setRunning(false);
  }

  // Index of the first failing check — used to auto-expand its detail
  // row in `?reentry=1` mode so the operator immediately sees what went
  // wrong, without having to scan the list.
  const firstFailureIndex = useMemo(
    () => checks.findIndex((c) => c.ok === false),
    [checks],
  );

  /**
   * Restart the running server so the next boot's hydrate step can
   * promote the wizard-saved values (in particular `publicAppUrl`)
   * from `data/db-config.json` into `process.env`. Mirrors
   * `handleLaunch` in `setup.tsx` so the Done step and this read-only
   * landing share UX:
   *   1. POST `/api/setup/restart` — same endpoint the wizard's
   *      `handleLaunch` uses, so the two surfaces feel like one
   *      experience and operators learn one mental model. The route
   *      replies immediately and then `process.exit(0)`s after 500 ms,
   *      so we cannot rely on the response status as a success
   *      indicator. We DO still inspect the response status before
   *      exit, however, because in full-boot-with-admin mode the
   *      server requires an Admin session and a 401/403 means the
   *      restart never fired — silently polling /api/health would
   *      then mislead the operator into thinking the restart happened
   *      when it did not. Surface a clear "log in as Admin" hint
   *      instead of failing silently (Task #582 review thread).
   *   2. Poll `/api/health` for up to 12 seconds. The container's
   *      restart policy (Docker / Dokploy / Coolify / pm2 / systemd)
   *      is what relaunches the process; we just wait for it to come
   *      back so we can immediately re-run the health checks and show
   *      the operator whether their saved values are now in env.
   *   3. Whether the process comes back in time or not, re-run the
   *      checks so the publicUrl row reflects the new state — the
   *      Restart Required callout disappears automatically the moment
   *      every tracked source field flips off its stale state.
   *
   * Failures are non-fatal — operators can always click Re-run checks
   * or hit Restart again.
   */
  async function handleRestart() {
    setRestarting(true);
    setRestartError(null);
    try {
      // Track whether the server explicitly refused the restart with an
      // auth error. In that branch we stop the polling/countdown UI
      // immediately because no restart will happen and pretending
      // otherwise would mislead the operator.
      let restartRefused = false;
      try {
        const res = await fetch("/api/setup/restart", { method: "POST" });
        if (res.status === 401 || res.status === 403) {
          restartRefused = true;
          setRestartError(
            t("setup.restartRequired.authRequired", {
              defaultValue:
                "Log in as an Admin first — the running server requires an authenticated Admin session to restart.",
            }),
          );
        }
      } catch {
        /* The server exits ~500 ms after responding, so a network
         * error here is expected on slow restart policies — keep
         * polling regardless. */
      }
      if (restartRefused) {
        // The `finally` block below resets `restarting`. `countdown` was
        // never set on this code path (we early-return before the
        // polling loop), so there is nothing to clear there.
        return;
      }
      let count = 12;
      setCountdown(count);
      await new Promise<void>((resolve) => {
        const interval = window.setInterval(async () => {
          count -= 1;
          setCountdown(count);
          try {
            const ping = await fetch("/api/health", { cache: "no-store" });
            if (ping.ok) {
              window.clearInterval(interval);
              setCountdown(null);
              resolve();
              return;
            }
          } catch {
            /* still down — keep polling */
          }
          if (count <= 0) {
            window.clearInterval(interval);
            setCountdown(null);
            resolve();
          }
        }, 1000);
      });
      await runChecks();
    } finally {
      setRestarting(false);
    }
  }

  async function copyMarker() {
    if (!lastMigrationFailure) return;
    const ok = await safeCopyToClipboard(
      JSON.stringify(lastMigrationFailure, null, 2),
    );
    setCopyState(ok ? "copied" : "failed");
    if (ok) {
      // Briefly show the "Copied" affordance, then revert so a second
      // click reads as a fresh action rather than appearing inert.
      window.setTimeout(() => setCopyState("idle"), 2000);
    }
  }

  return (
    <SetupShell>
      <Card className="w-full max-w-2xl" data-testid="card-setup-health-check">
        <CardHeader>
          <div className="flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
            <div>
              <CardTitle data-testid="text-health-check-title">
                {t("setup.healthCheck.title", { defaultValue: "Setup health check" })}
              </CardTitle>
              <CardDescription data-testid="text-health-check-completed-at">
                <Trans
                  i18nKey="setup.healthCheck.completedAt"
                  defaults="Setup completed at {{when}}"
                  values={{ when: formatTimestamp(setupCompletedAt) }}
                />
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/*
            Restart-required callout (Task #582). Per task plan §19,
            fires when ANY of the four wizard-managed source fields
            from the bootstrap snapshot reports a stale state — the
            most common trigger in production is
            `publicAppUrlSource === 'default'` (running process still
            on the localhost fallback) but `databaseUrlSource ===
            'wizard'` (file has it, env doesn't) is also caught here.
            That signal almost always means the operator saved a value
            into `data/db-config.json` via the wizard but the container
            has not been restarted yet so the boot-time hydrate step
            has not yet promoted the file value into env. The same
            pattern (Restart Required → POST /api/setup/restart → poll
            /api/health → re-run checks) the wizard's Done step uses
            (`handleLaunch` in setup.tsx) is mirrored here so the two
            surfaces feel like one experience to the operator.

            We hide the callout once the operator clicks Dismiss, and
            also automatically once every tracked source field flips
            off its stale state (i.e. the post-restart hydrate worked)
            — no manual hide-after-success needed.
          */}
          {isStaleSource(bootstrapSources) && !restartRequiredDismissed && (
            <div
              className="flex items-start gap-3 p-3 rounded-md text-sm bg-amber-50 border border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200"
              data-testid="callout-restart-required"
              role="status"
            >
              <RefreshCw className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="flex-1 space-y-2">
                <p className="font-medium">
                  {t("setup.restartRequired.title", {
                    defaultValue: "Restart required to apply your changes",
                  })}
                </p>
                <p className="text-xs">
                  {t("setup.restartRequired.body", {
                    defaultValue:
                      "The values you just saved are written to data/db-config.json. They only become active after the server process restarts and re-reads the file.",
                  })}
                </p>
                <p className="text-xs">
                  <Trans
                    i18nKey="setup.restartRequired.dockerNote"
                    components={[<strong />]}
                  />
                </p>
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void handleRestart()}
                    disabled={restarting}
                    data-testid="button-restart-required-restart"
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1" />
                    {t("setup.restartRequired.restartButton", {
                      defaultValue: "Restart server now",
                    })}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setRestartRequiredDismissed(true)}
                    disabled={restarting}
                    data-testid="button-restart-required-dismiss"
                  >
                    {t("setup.restartRequired.dismiss", {
                      defaultValue: "Dismiss",
                    })}
                  </Button>
                  {countdown !== null && (
                    <span
                      className="text-xs text-amber-800 dark:text-amber-300"
                      data-testid="text-restart-required-countdown"
                    >
                      {t("setup.done.restartingCountdown", {
                        defaultValue: "Waiting for server… {{seconds}}s",
                        seconds: countdown,
                      })}
                    </span>
                  )}
                </div>
                {restartError && (
                  <p
                    className="text-xs text-red-700 dark:text-red-400 pt-1"
                    role="alert"
                    data-testid="text-restart-required-error"
                  >
                    {restartError}
                  </p>
                )}
              </div>
            </div>
          )}

          {reentry && (
            <div
              className="p-3 rounded-md border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200 text-sm"
              data-testid="banner-reentry"
              role="status"
            >
              {t("setup.healthCheck.reentryBanner", {
                defaultValue:
                  "We sent you here because the app could not authenticate your session. The most likely failing check is expanded below.",
              })}
            </div>
          )}

          {lastMigrationFailure && (
            <div
              className="p-4 rounded-md border-2 border-red-400 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200 space-y-3"
              data-testid="panel-last-migration-failure"
              role="alert"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 mt-0.5 text-red-600 dark:text-red-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">
                    <Trans
                      i18nKey="setup.healthCheck.lastMigrationFailure.title"
                      defaults="Your last upgrade failed: {{filename}}"
                      values={{ filename: lastMigrationFailure.filename }}
                    />
                  </p>
                  <p className="text-xs mt-1 text-red-800 dark:text-red-300">
                    {t("setup.healthCheck.lastMigrationFailure.subtitle", {
                      defaultValue:
                        "The previous container boot crashed inside this database migration. Fix the underlying error (or revert the migration) and redeploy — this banner clears automatically on the next successful boot.",
                    })}
                  </p>
                </div>
              </div>

              <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="font-medium">
                  {t("setup.healthCheck.lastMigrationFailure.filenameLabel", {
                    defaultValue: "Filename",
                  })}
                </dt>
                <dd
                  className="font-mono break-all"
                  data-testid="text-last-migration-failure-filename"
                >
                  {lastMigrationFailure.filename}
                </dd>

                {lastMigrationFailure.sqlState ? (
                  <>
                    <dt className="font-medium">
                      {t("setup.healthCheck.lastMigrationFailure.sqlStateLabel", {
                        defaultValue: "SQLSTATE",
                      })}
                    </dt>
                    <dd
                      className="font-mono"
                      data-testid="text-last-migration-failure-sqlstate"
                    >
                      {lastMigrationFailure.sqlState}
                    </dd>
                  </>
                ) : null}

                <dt className="font-medium">
                  {t("setup.healthCheck.lastMigrationFailure.failedAtLabel", {
                    defaultValue: "Failed at",
                  })}
                </dt>
                {/*
                  Render the failure timestamp through the same
                  `formatRelativeTime` helper the migrations row uses
                  (Task #414) so this line auto-ticks via the
                  `useRelativeTimeTick(30_000)` hook already mounted at
                  the top of this component — no extra timers, no
                  extra network requests. The pre-existing 30 s tick
                  already re-renders the whole component, and
                  `formatRelativeTime` reads `Date.now()` at call time,
                  so the label ages out of "just now" → "a minute ago"
                  → "2 hours ago" in place while the operator leaves
                  the tab open. Mirrors the regression Task #409
                  fixed for the applied-at line: operators no longer
                  have to mentally diff the failure timestamp against
                  the wall clock to know how recently the upgrade
                  crashed (Task #426).
                */}
                <dd data-testid="text-last-migration-failure-failed-at">
                  {formatRelativeTime(lastMigrationFailure.failedAt, i18n.language)}
                </dd>

                <dt className="font-medium">
                  {t("setup.healthCheck.lastMigrationFailure.errorLabel", {
                    defaultValue: "Error",
                  })}
                </dt>
                <dd
                  className="font-mono whitespace-pre-wrap break-words"
                  data-testid="text-last-migration-failure-error"
                >
                  {lastMigrationFailure.error}
                </dd>
              </dl>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void copyMarker()}
                  data-testid="button-copy-last-migration-failure"
                >
                  {copyState === "copied" ? (
                    <Check className="w-3.5 h-3.5 mr-1.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  {copyState === "copied"
                    ? t("setup.healthCheck.lastMigrationFailure.copied", {
                        defaultValue: "Copied",
                      })
                    : t("setup.healthCheck.lastMigrationFailure.copy", {
                        defaultValue: "Copy details as JSON",
                      })}
                </Button>
                {copyState === "failed" && (
                  <span
                    className="text-xs text-red-700 dark:text-red-400"
                    data-testid="text-last-migration-failure-copy-failed"
                  >
                    {t("setup.healthCheck.lastMigrationFailure.copyFailed", {
                      defaultValue:
                        "Could not copy — select the text manually.",
                    })}
                  </span>
                )}
              </div>
            </div>
          )}

          <ul className="space-y-2" data-testid="list-health-checks">
            {checks.map((c, idx) => {
              const autoExpanded = reentry && idx === firstFailureIndex;
              const isExpanded = expandedIds.has(c.id) || autoExpanded;
              const hasExpandContent = c.descriptionKey || c.detailKey || c.detailRaw || (c.ok === false && c.fixKey);
              return (
                <li
                  key={c.id}
                  className={`rounded-md border ${rowClass(c.ok)}`}
                  data-testid={`row-check-${c.id}`}
                  data-ok={String(c.ok)}
                  data-expanded={String(isExpanded)}
                >
                  {/* Header row — always visible */}
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 p-3 text-left"
                    onClick={() => hasExpandContent && toggleExpanded(c.id)}
                    aria-expanded={isExpanded}
                    disabled={!hasExpandContent}
                  >
                    {iconFor(c.ok)}
                    <span className="flex-1 text-sm font-medium">{t(c.labelKey)}</span>
                    {hasExpandContent && (
                      isExpanded
                        ? <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />
                        : <ChevronDown className="w-4 h-4 shrink-0 opacity-60 -rotate-90" />
                    )}
                  </button>

                  {/* Expanded panel */}
                  {isExpanded && hasExpandContent && (
                    <div className="px-4 pb-3 space-y-2 border-t border-current/10">
                      {/* What this check tests */}
                      {c.descriptionKey && (
                        <p className="text-xs opacity-75 pt-2">
                          {t(c.descriptionKey)}
                        </p>
                      )}
                      {/* Current data / status detail */}
                      {(c.detailKey || c.detailRaw) && (
                        <p className="text-xs break-words" data-testid={`detail-check-${c.id}`}>
                          <span className="font-medium opacity-60">{t("setup.healthCheck.dataLabel", { defaultValue: "Data:" })}</span>{" "}
                          {c.detailKey
                            ? t(c.detailKey, resolveDetailParams(c, i18n.language) ?? {})
                            : c.detailRaw}
                        </p>
                      )}
                      {/* How to fix it — only on failure */}
                      {c.ok === false && c.fixKey && (
                        <p className="text-xs break-words">
                          <span className="font-medium opacity-60">{t("setup.healthCheck.fixLabel", { defaultValue: "Fix:" })}</span>{" "}
                          {t(c.fixKey)}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="flex flex-col gap-2 pt-2">
            <Button
              onClick={() => void runChecks()}
              variant="outline"
              disabled={running}
              data-testid="button-rerun-health-checks"
            >
              {running ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              {t("setup.healthCheck.rerun", { defaultValue: "Re-run checks" })}
            </Button>
            <Button
              onClick={() => {
                // Task #455: an operator clicking "Go to Login" from the
                // health-check view is making an explicit, intentional exit
                // out of the diagnostic screen toward the login form. The
                // wizard's Done-step button writes the same sessionStorage
                // flag for the same reason — useAuth honors this flag in
                // its 401 handler to suppress the Task #378/#420 bounce
                // back to /setup?reentry=1, which would otherwise trap the
                // operator here whenever the localStorage "had a session"
                // marker is set (dev auto-login, prior admin session, …).
                // The flag is also already used by the Landing page to
                // surface the "Setup already complete" callout. Helper
                // swallows storage errors; navigation still proceeds.
                markCameFromSetup();
                window.location.href = "/";
              }}
              data-testid="button-go-to-login"
            >
              {t("setup.done.goToLogin", { defaultValue: "Go to login" })}
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
            <Button
              variant="ghost"
              onClick={() => setConfirmReconfigure(true)}
              data-testid="button-reconfigure"
            >
              <Settings className="w-4 h-4 mr-2" />
              {t("setup.healthCheck.reconfigure", { defaultValue: "Reconfigure…" })}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmReconfigure} onOpenChange={setConfirmReconfigure}>
        <AlertDialogContent data-testid="dialog-confirm-reconfigure">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("setup.healthCheck.confirmTitle", {
                defaultValue: "Reopen the setup wizard?",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("setup.healthCheck.confirmBody", {
                defaultValue:
                  "Reopening the wizard does not erase your existing configuration, but it lets you change the database URL, secrets, public URL, admin user, and SMTP settings. Re-saving any field replaces the previously saved value.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-reconfigure">
              {t("setup.healthCheck.confirmCancel", { defaultValue: "Stay here" })}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmReconfigure(false);
                onReconfigure();
              }}
              data-testid="button-confirm-reconfigure"
            >
              {t("setup.healthCheck.confirmAction", { defaultValue: "Reopen wizard" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SetupShell>
  );
}

function initialChecks(): CheckRow[] {
  return [
    {
      id: CHECK_IDS.serverAlive,
      labelKey: "setup.done.checks.serverAlive",
      ok: null,
      descriptionKey: "setup.done.checks.serverAliveDesc",
      fixKey: "setup.done.checks.serverAliveFix",
    },
    {
      id: CHECK_IDS.dbReachable,
      labelKey: "setup.done.checks.dbReachable",
      ok: null,
      descriptionKey: "setup.done.checks.dbReachableDesc",
      fixKey: "setup.done.checks.dbReachableFix",
    },
    {
      id: CHECK_IDS.adminExists,
      labelKey: "setup.done.checks.adminExists",
      ok: null,
      descriptionKey: "setup.done.checks.adminExistsDesc",
      fixKey: "setup.done.checks.adminExistsFix",
    },
    {
      id: CHECK_IDS.sessionSecretSet,
      labelKey: "setup.done.checks.sessionSecretSet",
      ok: null,
      descriptionKey: "setup.done.checks.sessionSecretDesc",
      fixKey: "setup.done.checks.sessionSecretFix",
    },
    {
      id: CHECK_IDS.encryptionKeySet,
      labelKey: "setup.done.checks.encryptionKeySet",
      ok: null,
      descriptionKey: "setup.done.checks.encryptionKeyDesc",
      fixKey: "setup.done.checks.encryptionKeyFix",
    },
    {
      id: CHECK_IDS.publicUrlResolves,
      labelKey: "setup.done.checks.publicUrlResolves",
      ok: null,
      descriptionKey: "setup.done.checks.publicUrlDesc",
      fixKey: "setup.done.checks.publicUrlFix",
    },
    {
      id: CHECK_IDS.authRoundTrip,
      labelKey: "setup.done.checks.authRoundTrip",
      ok: null,
      descriptionKey: "setup.done.checks.authRoundTripDesc",
      fixKey: "setup.done.checks.authRoundTripFix",
    },
    {
      id: CHECK_IDS.migrationsApplied,
      labelKey: "setup.done.checks.migrationsLabel",
      ok: null,
      // The summary line (count + latest applied-at, or "no
      // migrations recorded yet") is the whole point of this row,
      // so show it even on the happy ok=true path — operators come
      // to /setup specifically to confirm the upgrade ran.
      alwaysShowDetail: true,
      descriptionKey: "setup.done.checks.migrationsDesc",
      fixKey: "setup.done.checks.migrationsFix",
    },
  ];
}

function replace(rows: CheckRow[], id: string, patch: Partial<CheckRow>) {
  const idx = rows.findIndex((r) => r.id === id);
  if (idx >= 0) rows[idx] = { ...rows[idx], ...patch };
}

function rowClass(ok: boolean | null): string {
  // Dark-mode pairs follow the project convention: light tone stays as
  // is, dark tone uses a deep desaturated 950/40 background with a
  // matching 800-band border and 200-band text so the row reads as
  // green/red on a dark card without looking neon. The loading state
  // already uses `bg-muted` / `border-muted` (CSS variables) which
  // adapts automatically.
  if (ok === null) return "bg-muted/40 border-muted";
  return ok
    ? "bg-green-50 border-green-200 text-green-900 dark:bg-green-950/40 dark:border-green-800 dark:text-green-200"
    : "bg-red-50 border-red-200 text-red-900 dark:bg-red-950/40 dark:border-red-800 dark:text-red-200";
}

function iconFor(ok: boolean | null) {
  if (ok === null) return <Loader2 className="w-4 h-4 mt-0.5 animate-spin shrink-0" />;
  return ok ? (
    <CheckCircle className="w-4 h-4 mt-0.5 text-green-600 dark:text-green-400 shrink-0" />
  ) : (
    <AlertCircle className="w-4 h-4 mt-0.5 text-red-600 dark:text-red-400 shrink-0" />
  );
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * Re-render the calling component on a fixed cadence so any
 * relative-time label it renders ("5 minutes ago", "just now", …)
 * stays honest as time passes — without refetching data.
 *
 * Operators sometimes leave the health-check tab open for tens of
 * minutes while debugging a redeploy. Without this tick, the label
 * the page displayed at first paint would persist literally forever
 * (until a manual "Re-run checks" or page reload), actively
 * misleading the operator about how recent the underlying event was.
 *
 * The hook owns its `setInterval` lifecycle so the calling component
 * does not leak timers when it unmounts. The default 30 s cadence
 * comfortably beats the "at least once a minute" requirement (Task
 * #414) while keeping the hook cheap enough to share across every
 * relative-time label on the page — both the "Recent upgrade
 * activity" row that exists today and any future ones (e.g. a
 * relative "Failed at" inside the migration-failure panel).
 *
 * Returns `Date.now()` at the most recent tick so callers that want
 * to display the freshness directly (or compute a derived value
 * deterministically against it) can do so without re-deriving
 * `Date.now()` themselves.
 */
function useRelativeTimeTick(intervalMs: number = 30_000): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Build the i18n interpolation params that should be passed to
 * `t(detailKey, …)` for a given check row. Static params on
 * `detailParams` are emitted as-is; entries on `relativeTimeParams`
 * are formatted on each render via `formatRelativeTime` so the
 * "X minutes ago" phrase ticks forward in place between fetches.
 *
 * Render-time formatted entries override same-named keys on
 * `detailParams` so callers can supply a stable fallback string
 * (e.g. "—") via `detailParams` and have it survive when the row
 * has no timestamp to format.
 */
function resolveDetailParams(
  c: CheckRow,
  locale: string,
): Record<string, string | number> | undefined {
  if (!c.relativeTimeParams) return c.detailParams;
  const merged: Record<string, string | number> = { ...(c.detailParams ?? {}) };
  for (const [key, iso] of Object.entries(c.relativeTimeParams)) {
    merged[key] = formatRelativeTime(iso, locale);
  }
  return merged;
}

/**
 * Render a timestamp as a friendly relative phrase like "5 minutes ago"
 * / "just now" / "2 days ago", localised via the browser-native
 * `Intl.RelativeTimeFormat`. Used by the "Recent upgrade activity" row
 * on the pre-login health check so an operator scanning the page
 * 30 seconds after a redeploy immediately recognises that the upgrade
 * runner just finished, rather than having to mentally diff two raw
 * locale-formatted timestamps.
 *
 * Falls back gracefully:
 *   - If `iso` is not a parseable date, the original string is
 *     returned so the caller's `setup.done.checks.migrationsApplied`
 *     interpolation still has *some* value to render.
 *   - If `Intl.RelativeTimeFormat` is unavailable (e.g. very old
 *     browsers) or throws on the supplied locale tag, we fall back to
 *     the absolute `toLocaleString()` representation — never
 *     undefined, never an empty string.
 *
 * The locale tag passed in is i18next's short code (`en`, `fr`, `de`,
 * …); `Intl.RelativeTimeFormat` accepts these directly and resolves
 * to its default region.
 */
function formatRelativeTime(iso: string, locale: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  try {
    const diffMs = then - Date.now();
    const diffSec = Math.round(diffMs / 1000);
    const absSec = Math.abs(diffSec);
    const rtf = new Intl.RelativeTimeFormat(locale || "en", { numeric: "auto" });
    // Anything inside ±5 s reads as the present moment — avoids
    // flickering "1 second ago" / "in 1 second" for the just-rendered
    // page where the operator's clock and the server's clock differ
    // by a fraction.
    if (absSec < 5) return rtf.format(0, "second");
    if (absSec < 60) return rtf.format(diffSec, "second");
    if (absSec < 60 * 60) return rtf.format(Math.round(diffSec / 60), "minute");
    if (absSec < 60 * 60 * 24) return rtf.format(Math.round(diffSec / 3600), "hour");
    if (absSec < 60 * 60 * 24 * 30) return rtf.format(Math.round(diffSec / 86400), "day");
    if (absSec < 60 * 60 * 24 * 365) return rtf.format(Math.round(diffSec / (86400 * 30)), "month");
    return rtf.format(Math.round(diffSec / (86400 * 365)), "year");
  } catch {
    return formatTimestamp(iso);
  }
}

/**
 * Validate the raw `lastMigrationFailure` field returned by
 * /api/setup/status. Older servers (pre-Task #394) omit the field
 * entirely; we tolerate that, plus malformed payloads, by returning
 * `null` rather than crashing the whole health-check view.
 */
function parseLastMigrationFailure(value: unknown): LastMigrationFailure | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.filename !== "string" ||
    typeof v.error !== "string" ||
    typeof v.failedAt !== "string"
  ) {
    return null;
  }
  return {
    filename: v.filename,
    sqlState: typeof v.sqlState === "string" ? v.sqlState : null,
    error: v.error,
    failedAt: v.failedAt,
  };
}
