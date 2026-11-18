import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertOctagon, X } from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";

// Subset of `/api/system/data-dir-status` we actually consume. Fields
// other than `ok`/`dataDir`/`reason` are surfaced for completeness so
// future affordances (e.g. "alerted N minutes ago") can land without
// re-shaping the type.
interface DataDirStatusSnapshot {
  ok: boolean | null;
  dataDir: string | null;
  reason: string | null;
  lastChecked: string | null;
  lastTransitionAt: string | null;
  lastNotifiedAt: string | null;
  lastNotifiedKind: "read_only" | "recovery" | null;
  schedulerActive: boolean;
}

const STORAGE_KEY_PREFIX = "dataDirReadOnlyBannerDismissed";

/**
 * Top-of-page banner shown to admins when the periodic data-dir
 * watcher (Task #769) reports the `data/` directory is no longer
 * writable. Companion to the email alert that fires on the same
 * transition: the inbox alert pages on-call, the banner is what
 * admins who happen to be in the app see immediately.
 *
 * Dismissal is per-admin AND per-snapshot — the dismissal token
 * embeds the resolved `dataDir` + `reason`, so if the failure mode
 * changes (e.g. the path moves from EROFS to EACCES) the banner
 * resurfaces. A recovered probe also clears any prior dismissal so
 * the next failure shows again.
 *
 * Polls every 60 s so an admin who left a tab open sees the banner
 * appear shortly after the host's volume goes read-only, even if
 * they never navigate.
 */
export function DataDirReadOnlyBanner() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";
  const userKey = user?.id ?? "";

  const { data } = useQuery<DataDirStatusSnapshot>({
    queryKey: ["/api/system/data-dir-status"],
    queryFn: async () => {
      const r = await fetch("/api/system/data-dir-status", {
        credentials: "include",
      });
      if (!r.ok) throw new Error("data-dir-status fetch failed");
      return r.json();
    },
    enabled: isAdmin,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const showBanner = isAdmin && data?.ok === false;
  const snapshotKey = showBanner
    ? `${data?.dataDir ?? ""}|${data?.reason ?? ""}`
    : "";
  const storageKey = `${STORAGE_KEY_PREFIX}:${userKey}`;
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  useEffect(() => {
    try {
      setDismissedKey(localStorage.getItem(storageKey));
    } catch {
      setDismissedKey(null);
    }
  }, [storageKey]);

  // Clear any prior dismissal token the moment the directory recovers
  // — otherwise the next failure would still be suppressed because
  // the snapshot key from the previous failure happens to match the
  // new one. We only do this on a confirmed `ok === true` (not on a
  // null/loading state) so the banner persists across refreshes
  // while the failure is ongoing.
  useEffect(() => {
    if (data?.ok === true && dismissedKey !== null) {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* ignore quota / disabled storage */
      }
      setDismissedKey(null);
    }
  }, [data?.ok, dismissedKey, storageKey]);

  if (!showBanner) return null;
  if (dismissedKey === snapshotKey) return null;

  function handleDismiss() {
    try {
      localStorage.setItem(storageKey, snapshotKey);
    } catch {
      /* ignore */
    }
    setDismissedKey(snapshotKey);
  }

  return (
    <div
      role="alert"
      className="bg-red-100 dark:bg-red-900/30 border-b border-red-300 dark:border-red-800 px-4 py-2 flex items-start justify-between gap-4"
      data-testid="banner-data-dir-readonly"
    >
      <div className="flex items-start gap-2 text-red-900 dark:text-red-100 min-w-0">
        <AlertOctagon className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="text-sm leading-snug">
          <strong>{t("layout.dataDirReadOnlyBanner.title")}</strong>{" "}
          {data?.dataDir ? (
            <>
              {t("layout.dataDirReadOnlyBanner.pathPrefix")}{" "}
              <code className="font-mono text-xs bg-red-200/60 dark:bg-red-800/40 px-1 py-0.5 rounded">
                {data.dataDir}
              </code>{" "}
            </>
          ) : null}
          {t("layout.dataDirReadOnlyBanner.cannotWrite")}
          {data?.reason ? <> ({data.reason})</> : null}. {t("layout.dataDirReadOnlyBanner.consequences")}{" "}
          <Link
            href="/admin?tab=system-health"
            className="underline font-medium hover:no-underline ml-1"
            data-testid="link-data-dir-banner-system-health"
          >
            {t("layout.dataDirReadOnlyBanner.openSystemHealth")}
          </Link>
        </div>
      </div>
      <button
        onClick={handleDismiss}
        className="flex items-center gap-1 px-2 py-1 hover:bg-red-200 dark:hover:bg-red-800/40 rounded text-red-900 dark:text-red-100 shrink-0"
        aria-label={t("layout.dataDirReadOnlyBanner.dismiss")}
        data-testid="button-data-dir-banner-dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
