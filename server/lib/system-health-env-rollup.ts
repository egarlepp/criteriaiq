// Server-side mirror of the env-var → System Health overview rollup that
// originally lived only in the React component
// (`client/src/components/configuration/system-health/healthRollup.ts`,
// added in Task #349).
//
// `/api/system/health` previously returned the eight category statuses
// produced by `healthMonitor.getFullHealthReport()` and nothing else, so
// any consumer that wasn't the React dashboard (uptime probes, status
// pages, future CLI checks) would see "All systems healthy" even when a
// required env var was missing or only backed by `data/db-config.json`
// (the file gets wiped on a container rebuild).
//
// Task #350 closes that gap by folding the same `getBootstrapSnapshot()`
// signal that the env-status panel reads into the `/api/system/health`
// response for admin callers — adding an `envVars` block and re-deriving
// `overallStatus` so the rollup matches what the dashboard renders.
//
// The helper is kept here (rather than importing the client helper) for
// two reasons:
//   1. The client helper lives under `client/src/...` and pulls in the
//      `@/lib/env-source-badges` UI helpers — neither path is reachable
//      from server code.
//   2. The server only ever folds the four well-known env-var rows, so a
//      small focused helper is easier to test in isolation than
//      generalising the client helper into something cross-cutting.

export type EnvHealthStatus = 'ok' | 'warning' | 'error';

// Subset of `getBootstrapSnapshot()` the rollup helper actually reads.
// Modelled as a structural type (rather than `ReturnType<typeof ...>`)
// because `app-config.ts` infers the source fields as plain `string`
// for the SESSION_SECRET / ENCRYPTION_KEY / PUBLIC_APP_URL labels —
// pulling a narrower union here keeps the helper's API safe to consume
// from tests without forcing an `as` cast on every callsite.
export interface BootstrapSnapshotLike {
  databaseUrlSource: 'env' | 'wizard' | 'none' | string;
  sessionSecretSource: 'env' | 'file' | 'none' | string;
  encryptionKeySource: 'env' | 'file' | 'none' | string;
  publicAppUrl: string;
  publicAppUrlSource: 'env' | 'file' | 'default' | string;
}

export interface EnvVarsBlock {
  // Per-row status mirroring the badge grammar in `EnvStatusPanel`:
  //   * `env`           → ok      (already promoted into hosting env)
  //   * `file`/`wizard` → warning (still backed only by db-config.json,
  //                                will vanish on a container rebuild)
  //   * `none`/`default`→ error   (missing or only the localhost fallback)
  status: EnvHealthStatus;
  databaseUrlSource: string;
  sessionSecretSource: string;
  encryptionKeySource: string;
  publicAppUrl: string;
  publicAppUrlSource: string;
  // Boot-time + on-demand probe of the `data/` directory the encrypted
  // bootstrap store lives in. Surfaced through the env-vars rollup
  // (rather than as its own category) because every promote/unmanage/
  // regenerate flow depends on it — when the volume is missing those
  // operations all fail at the last `fs.writeFile` step. Folding it
  // here means the env-vars tile flips to error when the dir isn't
  // writable, even if every secret happens to be sourced from the
  // host env right now (Task #741).
  dataDir: {
    ok: boolean;
    path: string;
    reason: string | null;
  };
}

// Category counts the dashboard renders next to the overall badge. The
// server doesn't currently emit them on `/api/system/health` (the client
// derives them from the eight category objects), but the rollup helper
// exposes them so future consumers / tests don't have to re-implement
// the grammar.
export interface EnvHealthCounts {
  ok: number;
  warning: number;
  error: number;
}

// Headline Healthy / Warnings / Errors counts the dashboard renders in
// the three big tiles above the category grid. Task #352 moves this
// rollup server-side so the React component can simply render what it
// is told and the duplicated client helper can be deleted — keeping the
// server as the single source of truth for both `overallStatus` and the
// per-bucket numbers.
export interface OverviewCounts {
  healthy: number;
  warning: number;
  error: number;
}

// The category fields on a full health report whose `status` drives
// the headline counts. Listed explicitly (rather than reflected from
// the report) so a future addition to the report has to be consciously
// folded in here too — silent drift would let the dashboard claim a
// healthier state than reality.
//
// Eleven entries: the original eight infrastructure cards, plus the
// three demand-and-defect cards (Feature Requests, Support Requests,
// Client Errors) introduced to surface unhandled feedback and captured
// browser-side errors directly on the Overview grid. Add a key here
// for any new card you put in `getFullHealthReport()` — without it the
// Healthy / Warnings / Errors strip at the top of the page will be
// off by one (or more) and the operator's mental model of "headline =
// count of tiles below" breaks.
const CATEGORY_KEYS = [
  'database',
  'email',
  'integrations',
  'security',
  'backgroundServices',
  'storage',
  'performance',
  'archiveSchemaValidation',
  'featureRequests',
  'supportRequests',
  'clientErrors',
] as const;

// Combine two health statuses, returning the strictly worse of the two.
// `error` dominates `warning` dominates `ok` — same precedence as the
// client-side `worstHealthStatus` helper.
export function worstHealthStatus(
  a: EnvHealthStatus,
  b: EnvHealthStatus,
): EnvHealthStatus {
  if (a === 'error' || b === 'error') return 'error';
  if (a === 'warning' || b === 'warning') return 'warning';
  return 'ok';
}

// Map a single env-var source label to its health bucket. Centralised so
// every row is graded the same way regardless of which field it came
// from. The `default` fallback for `PUBLIC_APP_URL` is treated as `error`
// because it means the operator never actually set a public URL — the
// app would happily render localhost links to external visitors.
function gradeSource(
  source: string | undefined,
): EnvHealthStatus {
  if (source === 'env') return 'ok';
  if (source === 'file' || source === 'wizard') return 'warning';
  // `none`, `default`, or anything else (defensively) → error.
  return 'error';
}

// Walk the four env-var rows from a bootstrap snapshot and tally their
// statuses. Used both to derive the `envVars.status` field and the
// per-bucket counts callers may want to surface separately.
export function envHealthCounts(
  snapshot: Pick<
    BootstrapSnapshotLike,
    | 'databaseUrlSource'
    | 'sessionSecretSource'
    | 'encryptionKeySource'
    | 'publicAppUrlSource'
  >,
): EnvHealthCounts {
  const sources = [
    snapshot.databaseUrlSource,
    snapshot.sessionSecretSource,
    snapshot.encryptionKeySource,
    snapshot.publicAppUrlSource,
  ];
  const counts: EnvHealthCounts = { ok: 0, warning: 0, error: 0 };
  for (const source of sources) {
    counts[gradeSource(source)] += 1;
  }
  return counts;
}

// Distill the four rows down to a single overall env-var status using
// the same precedence rules as the per-category fold. Returned alongside
// the source labels in the `envVars` block so consumers can render a
// traffic light without re-implementing the grammar.
export function overallEnvStatus(
  snapshot: Pick<
    BootstrapSnapshotLike,
    | 'databaseUrlSource'
    | 'sessionSecretSource'
    | 'encryptionKeySource'
    | 'publicAppUrlSource'
  >,
): EnvHealthStatus {
  const counts = envHealthCounts(snapshot);
  if (counts.error > 0) return 'error';
  if (counts.warning > 0) return 'warning';
  return 'ok';
}

// Shape of the data-dir probe the rollup folds into the env-vars
// block (Task #741). Modelled structurally so the rollup helper has
// zero direct dependency on the probe module — tests can pass any
// `{ ok, dataDir, reason? }` stub without importing fs.
export interface DataDirProbe {
  ok: boolean;
  dataDir: string;
  reason?: string;
}

// Build the `envVars` block surfaced on `/api/system/health` for admin
// callers. Mirrors the safe-to-serialise subset of the bootstrap
// snapshot — never includes the optional `sessionSecretValue` /
// `encryptionKeyValue` fields, even if a future caller passed
// `revealValues: true` upstream.
//
// `dataDirProbe` is the result of `checkDataDirWritable()` (server/lib/
// data-dir-health.ts). Folding it here grades the env-vars tile as
// `error` when the volume holding `data/db-config.json` is missing or
// read-only — the operator needs to know about that before they click
// any of the promote/regenerate/unmanage actions, all of which would
// otherwise fail at the very last `fs.writeFile` step.
export function buildEnvVarsBlock(
  snapshot: BootstrapSnapshotLike,
  dataDirProbe?: DataDirProbe,
): EnvVarsBlock {
  const sourceStatus = overallEnvStatus(snapshot);
  const dataDirStatus: EnvHealthStatus = dataDirProbe && !dataDirProbe.ok ? 'error' : 'ok';
  const folded = worstHealthStatus(sourceStatus, dataDirStatus);
  return {
    status: folded,
    databaseUrlSource: snapshot.databaseUrlSource,
    sessionSecretSource: snapshot.sessionSecretSource,
    encryptionKeySource: snapshot.encryptionKeySource,
    publicAppUrl: snapshot.publicAppUrl,
    publicAppUrlSource: snapshot.publicAppUrlSource,
    dataDir: {
      ok: dataDirProbe ? dataDirProbe.ok : true,
      path: dataDirProbe?.dataDir ?? '',
      reason: dataDirProbe && dataDirProbe.reason ? dataDirProbe.reason : null,
    },
  };
}

// Shape returned by `healthMonitor.getFullHealthReport()`. Only the
// fields the env fold actually touches are typed here so test fixtures
// can pass minimal stubs without restating the entire report shape.
// `overallStatus` is widened to `string` because the upstream report
// types it loosely (`hasError ? 'error' : ...`); the helper narrows it
// defensively below before re-deriving the combined value.
interface HealthReportLike {
  overallStatus: string;
  [key: string]: unknown;
}

// Pull the `status` off a report category in a defensive way — the
// report uses `{ status: '…' }` for every category but a future
// refactor or an upstream error path could leave a field missing
// entirely. Unknown / missing values default to `error` (via
// `coerceStatus`) so a contract drift surfaces loudly instead of
// silently inflating the healthy count.
function categoryStatus(report: HealthReportLike, key: string): EnvHealthStatus {
  const raw = report[key] as { status?: unknown } | undefined;
  if (!raw || typeof raw.status !== 'string') return 'error';
  return coerceStatus(raw.status);
}

// Tally the eight category statuses from a base health report into the
// Healthy / Warnings / Errors buckets the dashboard's headline tiles
// render. Used both stand-alone (for non-admin callers, who don't get
// the env fold) and inside `withEnvVars` for admins.
export function categoryStatusCounts(report: HealthReportLike): OverviewCounts {
  const counts: OverviewCounts = { healthy: 0, warning: 0, error: 0 };
  for (const key of CATEGORY_KEYS) {
    const status = categoryStatus(report, key);
    if (status === 'ok') counts.healthy += 1;
    else if (status === 'warning') counts.warning += 1;
    else counts.error += 1;
  }
  return counts;
}

// Add the headline overview counts to a base health report without
// folding in env-vars. Used on the non-admin code path so every caller
// of `/api/system/health` — admin or not — gets the same
// `overviewCounts` field shape and the dashboard can render the same
// component logic for both audiences.
export function withOverviewCounts<T extends HealthReportLike>(
  report: T,
): T & { overviewCounts: OverviewCounts } {
  return {
    ...report,
    overviewCounts: categoryStatusCounts(report),
  };
}

// Coerce an arbitrary string to `EnvHealthStatus`, defaulting unknown
// labels to `error` so an upstream contract drift cannot silently
// downgrade the rollup. Centralised so both the report fold and any
// future callers share the same defensive default.
function coerceStatus(value: string): EnvHealthStatus {
  if (value === 'ok' || value === 'warning' || value === 'error') return value;
  return 'error';
}

// Fold the env-var snapshot into a base health report. Returns a new
// object so callers don't have to worry about accidentally mutating the
// memoised report from `healthMonitor`.
//
// `overallStatus` is recomputed via `worstHealthStatus(base, env)` so
// the response matches what the dashboard's headline badge has been
// rendering since Task #349 — without the second admin-only round-trip
// from the client.
//
// `overviewCounts` adds the env-var block as a SINGLE entry — graded by
// the same `envVars.status` that colours the one "Environment Variables"
// tile in the category grid (Task #348). Counting the four individual
// rows here would inflate the headline above the number of tiles
// rendered (e.g. "9 healthy" out of 9 tiles) and silently contradict the
// operator's mental model during an incident (Task #354). Keeping
// "one tile = one count" means the headline numbers ALWAYS equal the
// count of tiles with each border colour — admin or non-admin.
export function withEnvVars<T extends HealthReportLike>(
  report: T,
  snapshot: BootstrapSnapshotLike,
  dataDirProbe?: DataDirProbe,
): Omit<T, 'overallStatus'> & {
  overallStatus: EnvHealthStatus;
  envVars: EnvVarsBlock;
  overviewCounts: OverviewCounts;
} {
  const envVars = buildEnvVarsBlock(snapshot, dataDirProbe);
  const baseCounts = categoryStatusCounts(report);
  const overviewCounts: OverviewCounts = {
    healthy: baseCounts.healthy + (envVars.status === 'ok' ? 1 : 0),
    warning: baseCounts.warning + (envVars.status === 'warning' ? 1 : 0),
    error: baseCounts.error + (envVars.status === 'error' ? 1 : 0),
  };
  return {
    ...report,
    overallStatus: worstHealthStatus(coerceStatus(report.overallStatus), envVars.status),
    envVars,
    overviewCounts,
  };
}
