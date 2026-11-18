import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CheckCircle2, KeyRound, Loader2 } from "lucide-react";

/**
 * Shape returned by `GET /api/system/secrets/rotation-status` (Task #734).
 * Mirrors the server-side `RotationStatusSnapshot` plus the steady-state
 * fallback the endpoint emits when no rotation has run in this process —
 * `lastCompletedAt` is `null` and `reencrypted` is `null` in that case.
 */
interface RotationStatusResponse {
  active: boolean;
  tailRemainingMs: number;
  tailDurationMs: number;
  lastCompletedAt: string | null;
  reencrypted: { tables: number; rows: number } | null;
}

/**
 * Live admin banner that surfaces the brief (~5s) ENCRYPTION_KEY rotation
 * tail window — the period where the dual-key fallback in
 * `server/lib/app-config.ts` keeps both the old and the new key valid for
 * decrypts so in-flight requests don't trip on the post-COMMIT/pre-env-swap
 * (and mirror) race the rotation handler closes (Task #726).
 *
 * Without this surface the fallback was completely invisible: only an
 * in-process getter knew whether the tail was still active. Showing a
 * "rotation in progress, N seconds remaining, re-encrypted N rows" banner
 * lets operators sanity-check what they just clicked AND avoid kicking off
 * a second rotation while the first is still finishing.
 *
 * Polling strategy: while `active` is true we poll once per second so the
 * countdown stays fresh; once `active` flips to false we stop polling
 * entirely (`refetchInterval: false`) — the next rotation invalidates the
 * cache via `invalidateQueries(['/api/system/secrets/rotation-status'])`
 * (already wired in `DatabaseConnectionSection`'s regenerate mutation, see
 * the `onSuccess` hook). The banner unmounts immediately when active flips,
 * but a 600ms grace fade-out (`opacity-0` transition) keeps the visual
 * "fades out" promise the task description calls for.
 *
 * Read-only and admin-only (the endpoint returns 403 for non-admins). Never
 * displays raw secret values — the wire payload is metadata only.
 */
export function RotationStatusBanner() {
  const { t } = useTranslation();

  // Poll once per second while the tail is active. We start with a poll on
  // mount so the banner appears almost-immediately after a rotation kicks
  // off (the regenerate mutation invalidates this query, which forces a
  // fetch). When `active` goes false the interval drops to false so we
  // stop hammering the endpoint in steady state.
  const { data } = useQuery<RotationStatusResponse>({
    queryKey: ["/api/system/secrets/rotation-status"],
    refetchInterval: (query) => (query.state.data?.active ? 1000 : false),
    // Don't retry — a 403 (non-admin) or transient blip should not block
    // the rest of the page from rendering. The next active rotation will
    // re-arm the interval through invalidation.
    retry: false,
  });

  // Track the tail's tail-end so the banner can fade rather than pop. We
  // hold the banner mounted for ~600ms after `active` flips false so the
  // CSS opacity transition has a chance to run. Without this the banner
  // would unmount in the same frame as the active flip and the user would
  // see a hard cut.
  const [showFadingOut, setShowFadingOut] = useState(false);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasActiveRef = useRef(false);

  useEffect(() => {
    const isActive = data?.active === true;
    if (isActive) {
      wasActiveRef.current = true;
      setShowFadingOut(false);
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
      return;
    }
    // Just transitioned active -> inactive. Hold the banner around for a
    // single fade cycle so it doesn't pop off-screen.
    if (wasActiveRef.current) {
      setShowFadingOut(true);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = setTimeout(() => {
        setShowFadingOut(false);
        wasActiveRef.current = false;
        fadeTimerRef.current = null;
      }, 600);
    }
  }, [data?.active]);

  useEffect(() => {
    return () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, []);

  const isActive = data?.active === true;
  if (!isActive && !showFadingOut) return null;

  // tailRemainingMs is guaranteed >= 0 by the server; round up so the
  // operator always sees at least "1s" rather than a flicker to "0s"
  // before the fade-out kicks in.
  const remainingSeconds = Math.max(
    1,
    Math.ceil((data?.tailRemainingMs ?? 0) / 1000),
  );
  const tables = data?.reencrypted?.tables ?? 0;
  const rows = data?.reencrypted?.rows ?? 0;

  return (
    <div
      className={`flex items-start gap-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-900 transition-opacity duration-500 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100 ${
        isActive ? "opacity-100" : "opacity-0"
      }`}
      data-testid="rotation-status-banner"
      data-active={isActive ? "true" : "false"}
      role="status"
      aria-live="polite"
    >
      {isActive ? (
        <Loader2
          className="h-4 w-4 mt-0.5 shrink-0 animate-spin"
          aria-hidden="true"
        />
      ) : (
        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
      )}
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5 font-medium">
          <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
          {t("config.rotationStatus.title")}
        </div>
        <div className="text-xs opacity-90" data-testid="rotation-status-detail">
          {t("config.rotationStatus.detail", {
            seconds: remainingSeconds,
            rows,
            tables,
          })}
        </div>
      </div>
    </div>
  );
}
