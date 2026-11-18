import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast } from "@/lib/toast-helper";
import { useAuth } from "@/hooks/useAuth";
import {
  ENV_SOURCE_ORDER,
  type EnvHelperSource,
  envSourceBadgeClass,
  envSourceMutedBadgeClass,
  mapDatabaseUrlSource,
  mapPublicUrlSource,
  mapSecretSource,
} from "@/lib/env-source-badges";

interface EnvStatusPanelProps {
  /**
   * When provided, an additional "View details" link is rendered below the
   * rows whenever any row is amber (file/wizard) or red (not-set). Used to
   * cross-link from the System Health dashboard back to the full panel on
   * Configuration → System Settings → Environment Variables (Task #346).
   */
  detailsHref?: string;
}

// Shape returned by GET /api/system/env-status. Mirrors the subset of
// `getBootstrapSnapshot()` the panel actually needs — never raw secret
// values. See `server/routes/system-routes.ts`.
interface EnvStatusResponse {
  databaseUrlSource: "env" | "wizard" | "none";
  // Task #741: server-rendered, credentials-masked preview of the
  // resolved DATABASE_URL (host/port/db visible, user+password
  // replaced with bullets). Computed server-side so the plaintext
  // password never crosses the wire — the dedicated reveal endpoint
  // remains the only path that returns the raw URL. `null` when the
  // server couldn't resolve a URL or couldn't parse it as a URL.
  databaseUrlPreview?: string | null;
  sessionSecretSource: "env" | "file" | "none";
  encryptionKeySource: "env" | "file" | "none";
  publicAppUrl: string;
  publicAppUrlSource: "env" | "file" | "default";
}

const ROW_KEYS = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "ENCRYPTION_KEY",
  "PUBLIC_APP_URL",
] as const;
type RowKey = (typeof ROW_KEYS)[number];

type BannerState = "ok" | "promote" | "missing";

const BANNER_CLASS: Record<BannerState, string> = {
  ok: "border-green-200 bg-green-50 text-green-900 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-100",
  promote:
    "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100",
  missing:
    "border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100",
};

/**
 * Read-only, admin-only audit panel that mirrors the env-var source badges
 * shown in the Setup wizard. Operators who already finished setup use this
 * on Configuration → System Settings to confirm which of the four critical
 * env vars are coming from their hosting platform's env editor (`env`,
 * blue) vs. still backed only by `data/db-config.json` (`file` for secrets,
 * `wizard` for DATABASE_URL — both will vanish on container rebuild and
 * therefore render in green/amber to flag follow-up). Missing values render
 * red.
 *
 * The panel never displays raw secret values; only the source label and (for
 * PUBLIC_APP_URL alone) the resolved URL itself, which is already public.
 *
 * Task #488 added the rollup status banner, the badge legend, and the
 * "all four badges per row with the inactive ones muted" layout so
 * operators can instantly tell what each badge means and whether the
 * current state is good or bad news.
 */
// How long a Reveal stays visible before auto-re-masking. Mirrors the
// 10-second window the Bootstrap Secrets card uses on the Database
// Connection page so the same physical operator behaviour applies on
// both panels (Task #741).
const REVEAL_AUTO_HIDE_MS = 10_000;

// Keys whose values can be revealed from the env panel. PUBLIC_APP_URL
// is intentionally excluded — it is already displayed in plain text in
// the panel (the URL is public information by design).
const REVEALABLE_KEYS = ["DATABASE_URL", "SESSION_SECRET", "ENCRYPTION_KEY"] as const;
type RevealableKey = (typeof REVEALABLE_KEYS)[number];

export function EnvStatusPanel({ detailsHref }: EnvStatusPanelProps = {}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  // Admin gate matches the server-side `requireAdmin` on the reveal
  // endpoints — non-admins simply don't see the Reveal buttons. During
  // View As `user` is the person viewed, so the buttons hide then too.
  const isAdmin = user?.role === "Admin";

  const { data, isLoading, isError, error } = useQuery<EnvStatusResponse>({
    queryKey: ["/api/system/env-status"],
  });

  // Reveal state, indexed by key. Each entry is the plaintext value
  // that's currently visible; absence means "still masked". The
  // auto-mask timer in `revealMutation.onSuccess` deletes the entry
  // after REVEAL_AUTO_HIDE_MS.
  const [revealedValues, setRevealedValues] = useState<Partial<Record<RevealableKey, string>>>({});
  const [revealingKey, setRevealingKey] = useState<RevealableKey | null>(null);
  // Track the per-key timeout so we can clear it on unmount AND on a
  // toggle-off click (otherwise an aggressive operator who reveals,
  // hides, reveals could see the previous timer fire mid-second-reveal
  // and prematurely re-mask).
  const hideTimers = useRef<Partial<Record<RevealableKey, ReturnType<typeof setTimeout>>>>({});
  useEffect(() => {
    return () => {
      // On unmount, drop every revealed value and cancel timers so the
      // strings don't linger in component state across navigations.
      const timers = hideTimers.current;
      (Object.keys(timers) as RevealableKey[]).forEach((k) => {
        const handle = timers[k];
        if (handle) clearTimeout(handle);
      });
      hideTimers.current = {};
    };
  }, []);

  const revealMutation = useMutation({
    mutationFn: async (key: RevealableKey) => {
      // DATABASE_URL goes through its own runtime-aware endpoint
      // (`reveal-database-url`) so the panel stays decoupled from the
      // active-connection-id lookup. The two secret keys share the
      // existing `/api/system/secrets/reveal` handler that the
      // Bootstrap Secrets card already uses.
      const path =
        key === "DATABASE_URL"
          ? "/api/system/secrets/reveal-database-url"
          : "/api/system/secrets/reveal";
      const json = await apiRequest("POST", path, key === "DATABASE_URL" ? {} : { key });
      return { key, value: (json as { value: string }).value };
    },
    onSuccess: ({ key, value }) => {
      setRevealedValues((prev) => ({ ...prev, [key]: value }));
      // Cancel any prior timer for this key before scheduling a new
      // one so back-to-back reveals always get a full 10s window.
      const prior = hideTimers.current[key];
      if (prior) clearTimeout(prior);
      hideTimers.current[key] = setTimeout(() => {
        setRevealedValues((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        delete hideTimers.current[key];
      }, REVEAL_AUTO_HIDE_MS);
    },
    onError: (e: Error, key) => {
      // lint:toasts requires the helper for {variant,title,description}-only
      // calls (Task #461). The original t() second arg was just an i18next
      // defaultValue fallback (no `config.envStatus.revealError` key exists
      // in any locale yet), so we surface the same English string directly.
      showErrorToast("Could not reveal value", e.message);
      void key;
    },
    onSettled: () => setRevealingKey(null),
  });

  function handleReveal(key: RevealableKey) {
    if (revealedValues[key]) {
      // Toggle off: drop the value and clear the timer immediately.
      const prior = hideTimers.current[key];
      if (prior) clearTimeout(prior);
      delete hideTimers.current[key];
      setRevealedValues((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    setRevealingKey(key);
    revealMutation.mutate(key);
  }

  // Decide whether a row is eligible for the Reveal control AT ALL.
  // The server-side handlers each enforce their own version of this
  // rule (so the rules below are merely a UX gate that hides the
  // button when it would be guaranteed to fail), but keeping them in
  // sync prevents operators from clicking a button that always 409s.
  function canReveal(key: RevealableKey, source: EnvHelperSource): boolean {
    if (!isAdmin) return false;
    if (key === "SESSION_SECRET" || key === "ENCRYPTION_KEY") {
      // Reveal endpoint refuses anything other than file source
      // because it pulls from the encrypted store, not the host env.
      return source === "file";
    }
    // DATABASE_URL: only revealable when the value lives in the
    // encrypted app file (wizard source). When DATABASE_URL is host-
    // env-sourced it is the operator's responsibility — and they can
    // see it directly in their host secret manager — so the panel
    // shouldn't expose it through a Reveal button. Restricting to
    // wizard-source also keeps the affordance symmetric with the two
    // secret keys above and avoids any chance of the proxy/dev-tools/
    // network tab capturing a plaintext URL the operator could just
    // read from their host config instead.
    return source === "wizard";
  }

  const sources: Record<RowKey, EnvHelperSource> = {
    DATABASE_URL: mapDatabaseUrlSource(data?.databaseUrlSource),
    SESSION_SECRET: mapSecretSource(data?.sessionSecretSource),
    ENCRYPTION_KEY: mapSecretSource(data?.encryptionKeySource),
    PUBLIC_APP_URL: mapPublicUrlSource(data?.publicAppUrlSource),
  };

  const promoteCount = ROW_KEYS.filter(
    (k) => sources[k] === "file" || sources[k] === "wizard",
  ).length;
  const missingCount = ROW_KEYS.filter((k) => sources[k] === "not-set").length;
  const hasFileSourced = promoteCount > 0;
  const hasMissing = missingCount > 0;
  // Missing trumps promote because a missing var is a hard outage, while a
  // file/wizard one only becomes a problem on the next container rebuild.
  const bannerState: BannerState = hasMissing
    ? "missing"
    : hasFileSourced
      ? "promote"
      : "ok";
  const showDetailsLink = Boolean(detailsHref) && (hasFileSourced || hasMissing);

  const bannerTitle =
    bannerState === "ok"
      ? t("config.envStatus.banner.okTitle")
      : bannerState === "promote"
        ? t("config.envStatus.banner.promoteTitle", { count: promoteCount })
        : t("config.envStatus.banner.missingTitle", { count: missingCount });
  const bannerDescription = t(
    `config.envStatus.banner.${bannerState}Description`,
  );
  const BannerIcon = bannerState === "ok" ? CheckCircle2 : AlertTriangle;

  return (
    <Card data-testid="env-status-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
          <KeyRound className="h-5 w-5" />
          {t("config.envStatus.title")}
        </CardTitle>
        <CardDescription>
          {t("config.envStatus.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && (
          <div
            className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"
            data-testid="env-status-loading"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("config.envStatus.loading")}
          </div>
        )}
        {isError && (
          <div
            className="flex items-start gap-2 text-sm text-red-700 dark:text-red-300"
            data-testid="env-status-error"
          >
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              {error instanceof Error
                ? t("config.envStatus.errorWithMessage", {
                    message: error.message,
                  })
                : t("config.envStatus.error")}
            </span>
          </div>
        )}
        {data && (
          <>
            {/* Rollup status banner — gives operators an immediate
                "everything is fine" / "promote" / "fix this" signal so
                they don't have to read every row to tell. */}
            <div
              className={`flex items-start gap-3 rounded-md border px-3 py-2.5 text-sm ${BANNER_CLASS[bannerState]}`}
              data-testid="env-status-banner"
              data-state={bannerState}
              role="status"
            >
              <BannerIcon className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
              <div className="space-y-0.5">
                <div className="font-medium">{bannerTitle}</div>
                <div className="text-xs opacity-90">{bannerDescription}</div>
              </div>
            </div>

            {/* Legend — explains all four badge states in plain language
                with a clear "ENV is the expected state" marker so the
                operator never has to guess what an unfamiliar badge means. */}
            <div
              className="rounded-md border border-gray-200 dark:border-gray-700 bg-muted/30 px-3 py-2.5"
              data-testid="env-status-legend"
            >
              <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t("config.envStatus.legend.title")}
              </div>
              <ul className="space-y-1.5">
                {ENV_SOURCE_ORDER.map((src) => (
                  <li
                    key={src}
                    className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400"
                    data-testid={`env-status-legend-item-${src}`}
                  >
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${envSourceBadgeClass(src)}`}
                      aria-hidden="true"
                    >
                      {t(`setup.envHelper.badge.${src}`)}
                    </span>
                    {src === "env" && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200 inline-flex items-center gap-0.5"
                        data-testid="env-status-legend-expected-marker"
                      >
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                        {t("config.envStatus.legend.expected")}
                      </span>
                    )}
                    <span className="leading-snug">
                      {t(`config.envStatus.legend.${src}Description`)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              {ROW_KEYS.map((key) => {
                const activeSource = sources[key];
                // PUBLIC_APP_URL is the one row where the resolved value is
                // safe to display — it's already advertised publicly via
                // the app's own URLs and webhooks, and seeing the actual
                // URL helps operators confirm it matches what their host
                // serves. Secrets are NEVER rendered.
                const valueHint =
                  key === "PUBLIC_APP_URL" && data.publicAppUrl
                    ? data.publicAppUrl
                    : null;

                // Task #741: per-row Reveal-for-10s control. Renders the
                // currently-revealed plaintext when present, otherwise a
                // bullet placeholder. The Reveal button is hidden for
                // PUBLIC_APP_URL (always plaintext) and for non-admins.
                const isRevealable =
                  key === "DATABASE_URL" ||
                  key === "SESSION_SECRET" ||
                  key === "ENCRYPTION_KEY";
                const revealKey = isRevealable ? (key as RevealableKey) : null;
                const revealedValue = revealKey ? revealedValues[revealKey] : undefined;
                const isRevealing = revealingKey === revealKey;
                const showRevealButton = revealKey
                  ? canReveal(revealKey, activeSource)
                  : false;

                return (
                  <div
                    key={key}
                    className="flex flex-wrap items-center gap-3 rounded-md border border-gray-200 dark:border-gray-700 bg-background px-3 py-2"
                    data-testid={`env-status-row-${key}`}
                  >
                    <code
                      className="font-mono text-xs text-gray-900 dark:text-gray-100 flex-1 min-w-[8rem]"
                      lang="en"
                      dir="ltr"
                    >
                      {key}
                    </code>
                    {valueHint && (
                      <code
                        className="hidden md:inline font-mono text-[11px] text-gray-500 dark:text-gray-400 truncate max-w-[40%]"
                        lang="en"
                        dir="ltr"
                        data-testid={`env-status-value-${key}`}
                      >
                        {valueHint}
                      </code>
                    )}
                    {revealKey && (
                      <code
                        className="hidden md:inline font-mono text-[11px] text-gray-500 dark:text-gray-400 truncate max-w-[40%] break-all"
                        lang="en"
                        dir="ltr"
                        data-testid={`env-status-masked-${key}`}
                        aria-label={
                          revealedValue
                            ? `${key} value visible`
                            : `${key} value hidden`
                        }
                      >
                        {/* DATABASE_URL renders the server-rendered
                            credentials-masked URL preview (host/port/db
                            visible, user+password as bullets) when not
                            revealed. The two secret keys have no preview
                            — they are rendered as a bullet placeholder
                            until Reveal flips them to plaintext. */}
                        {revealedValue ??
                          (key === "DATABASE_URL" && data.databaseUrlPreview
                            ? data.databaseUrlPreview
                            : "•".repeat(12))}
                      </code>
                    )}
                    {revealKey && showRevealButton && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleReveal(revealKey)}
                        disabled={isRevealing}
                        title={
                          revealedValue
                            ? "Hide value"
                            : "Reveal value for 10 seconds"
                        }
                        data-testid={`env-status-reveal-${key}`}
                      >
                        {isRevealing ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : revealedValue ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    )}
                    {/* All four possible badges render every row, with the
                        inactive ones muted so the active source visually
                        dominates while the alternatives stay legible for
                        context. */}
                    <div className="flex items-center gap-1 shrink-0">
                      {ENV_SOURCE_ORDER.map((src) => {
                        const isActive = src === activeSource;
                        const cls = isActive
                          ? envSourceBadgeClass(src)
                          : envSourceMutedBadgeClass(src);
                        // The active badge keeps the legacy
                        // `env-status-badge-${KEY}` testid for backward
                        // compat with existing tests / consumers; every
                        // badge also gets a per-source testid so the new
                        // four-up layout can be asserted directly.
                        return (
                          <span
                            key={src}
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cls}`}
                            data-testid={
                              isActive
                                ? `env-status-badge-${key}`
                                : `env-status-badge-${key}-${src}`
                            }
                            data-active={isActive ? "true" : "false"}
                            data-source={src}
                            aria-label={t(
                              `setup.envHelper.sourceLabel.${src}`,
                            )}
                            aria-current={isActive ? "true" : undefined}
                            title={t(`setup.envHelper.sourceTooltip.${src}`)}
                          >
                            {t(`setup.envHelper.badge.${src}`)}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {hasFileSourced && (
              <p
                className="text-xs text-amber-700 dark:text-amber-300"
                data-testid="env-status-promote-hint"
              >
                {t("setup.envHelper.promoteHint")}
              </p>
            )}
            {showDetailsLink && detailsHref && (
              <Link
                href={detailsHref}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900 hover:underline dark:text-blue-300 dark:hover:text-blue-100"
                data-testid="env-status-details-link"
              >
                {t("config.envStatus.detailsLink")}
                <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
