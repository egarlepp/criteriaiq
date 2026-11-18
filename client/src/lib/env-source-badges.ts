// Shared types + helpers for the env-var status badges that originally lived
// inside the Setup wizard (`client/src/pages/setup.tsx`). They are hoisted
// here so the System Settings page (and any future surface) can render the
// same badge grammar without pulling in the entire wizard module — see
// Task #342 (post-setup env-status panel) for the original motivation.

// Per-row source tag rendered as a small badge so operators can tell at a
// glance whether each value is already coming from their hosting platform's
// env editor (`env` — no further action), still only in the wizard's local
// file store (`file` for the secrets, `wizard` for DATABASE_URL — needs to be
// promoted before redeploy), or completely missing (`not-set`).
export type EnvHelperSource = "env" | "file" | "wizard" | "not-set";

export interface EnvHelperSources {
  databaseUrl: EnvHelperSource;
  sessionSecret: EnvHelperSource;
  encryptionKey: EnvHelperSource;
  publicAppUrl: EnvHelperSource;
}

// Snapshot → badge mappers. The bootstrap snapshot returns three flavours
// for SESSION_SECRET/ENCRYPTION_KEY (`env`/`file`/`none`) and four for
// PUBLIC_APP_URL (adds `default` for the localhost fallback). For
// the env helper we collapse `none` and `default` into "not-set" because
// both mean "no concrete value the operator chose". When the snapshot has
// not loaded yet (`undefined`) we conservatively show "not-set" rather than
// guessing.
export function mapSecretSource(
  source: "env" | "file" | "none" | undefined,
): EnvHelperSource {
  if (source === "env" || source === "file") return source;
  return "not-set";
}

export function mapPublicUrlSource(
  source: "env" | "file" | "default" | undefined,
): EnvHelperSource {
  if (source === "env" || source === "file") return source;
  return "not-set";
}

export function mapDatabaseUrlSource(
  source: "env" | "wizard" | "none" | undefined,
): EnvHelperSource {
  if (source === "env" || source === "wizard") return source;
  return "not-set";
}

// Tailwind class lookups by source — env=blue, file=green, wizard=amber to
// flag "still needs to be promoted to env", not-set=red. Same colour grammar
// the Setup wizard uses on its Secrets / Public URL / Done steps so
// operators get a consistent traffic-light story across surfaces.
export function envSourceBadgeClass(source: EnvHelperSource): string {
  switch (source) {
    case "env":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200";
    case "file":
      return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200";
    case "wizard":
      return "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200";
    case "not-set":
    default:
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
  }
}

// Muted/inactive variant used by the post-setup EnvStatusPanel (Task
// #488) to show *all four* possible badges per row with the inactive
// three rendered as neutral gray placeholders so the colored active
// badge visually dominates. The previous design tinted each muted
// badge with its own hue family, but operator feedback was that the
// active state didn't stand out enough — every badge looked roughly
// the same brightness. Going truly gray for the inactive state means
// the colored one immediately reads as "this is the live source",
// while the legend block (which still renders each source in its
// active color) lets operators map gray chips back to meaning.
//
// `_source` is intentionally unused: the muted variant is the same
// neutral gray for every source. Kept as a parameter for API symmetry
// with `envSourceBadgeClass` so callers can swap between the two
// without changing their call sites.
export function envSourceMutedBadgeClass(_source: EnvHelperSource): string {
  return "bg-gray-100 text-gray-400 ring-1 ring-inset ring-gray-200 dark:bg-gray-800/40 dark:text-gray-500 dark:ring-gray-700/60";
}

// Stable display order for the four-badge "all sources" row. Listed in the
// order operators most commonly encounter them — env first because it's the
// healthy/expected state, then the two transitional sources, then the
// missing state.
export const ENV_SOURCE_ORDER: readonly EnvHelperSource[] = [
  "env",
  "file",
  "wizard",
  "not-set",
] as const;
