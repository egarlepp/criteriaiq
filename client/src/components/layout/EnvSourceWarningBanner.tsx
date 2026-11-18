import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, X } from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";

// Subset of the `/api/system/env-status` response we actually consume.
// The endpoint returns a superset (also includes `publicAppUrl` and
// `smtpHostSource` for other consumers) — we just ignore the extras.
interface EnvStatusSnapshot {
  databaseUrlSource: "env" | "wizard" | "none";
  sessionSecretSource: "env" | "file" | "none";
  encryptionKeySource: "env" | "file" | "none";
  publicAppUrlSource: "env" | "file" | "default";
}

interface EnvIssue {
  name: "DATABASE_URL" | "SESSION_SECRET" | "ENCRYPTION_KEY" | "PUBLIC_APP_URL";
  source: "wizard" | "file";
}

const STORAGE_KEY_PREFIX = "envSourceBannerDismissed";

function collectIssues(snap: EnvStatusSnapshot): EnvIssue[] {
  const issues: EnvIssue[] = [];
  if (snap.databaseUrlSource === "wizard") issues.push({ name: "DATABASE_URL", source: "wizard" });
  if (snap.sessionSecretSource === "file") issues.push({ name: "SESSION_SECRET", source: "file" });
  if (snap.encryptionKeySource === "file") issues.push({ name: "ENCRYPTION_KEY", source: "file" });
  if (snap.publicAppUrlSource === "file") issues.push({ name: "PUBLIC_APP_URL", source: "file" });
  return issues;
}

function buildSnapshotKey(issues: EnvIssue[]): string {
  return issues.map((i) => `${i.name}=${i.source}`).sort().join("|");
}

export function EnvSourceWarningBanner() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";
  const userKey = user?.id ?? "";

  // Reuses the canonical admin-gated env-status endpoint that backs the
  // EnvStatusPanel + System Health env-source rollup. Previously this
  // banner had its own duplicate `/api/admin/env-status` route in
  // `server/routes.ts`; that handler was deleted to keep a single
  // source of truth.
  const { data } = useQuery<EnvStatusSnapshot>({
    queryKey: ["/api/system/env-status"],
    queryFn: async () => {
      const r = await fetch("/api/system/env-status", { credentials: "include" });
      if (!r.ok) throw new Error("env-status fetch failed");
      return r.json();
    },
    enabled: isAdmin,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const issues = useMemo(() => (data ? collectIssues(data) : []), [data]);
  const snapshotKey = useMemo(() => buildSnapshotKey(issues), [issues]);

  const storageKey = `${STORAGE_KEY_PREFIX}:${userKey}`;
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  useEffect(() => {
    try {
      setDismissedKey(localStorage.getItem(storageKey));
    } catch {
      setDismissedKey(null);
    }
  }, [storageKey]);

  if (!isAdmin || !data || issues.length === 0) return null;
  if (dismissedKey === snapshotKey) return null;

  function handleDismiss() {
    try {
      localStorage.setItem(storageKey, snapshotKey);
    } catch {
      /* ignore quota / disabled storage */
    }
    setDismissedKey(snapshotKey);
  }

  const names = issues.map((i) => i.name).join(", ");
  // i18next plural key picker: `_one` when count===1, `_other` otherwise.
  // We keep names rendered separately so the inline `<strong>` formatting
  // survives, and surround them with the singular/plural sentence halves.
  const storedOnlyVerb = t("layout.envSourceWarningBanner.storedOnly", {
    count: issues.length,
  });
  const promoteSentence = t("layout.envSourceWarningBanner.promote", {
    count: issues.length,
  });

  return (
    <div
      role="alert"
      className="bg-amber-100 dark:bg-amber-900/30 border-b border-amber-300 dark:border-amber-800 px-4 py-2 flex items-start justify-between gap-4"
      data-testid="banner-env-source-warning"
    >
      <div className="flex items-start gap-2 text-amber-900 dark:text-amber-100 min-w-0">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="text-sm leading-snug">
          <strong>{names}</strong> {storedOnlyVerb}{" "}
          <code className="font-mono text-xs bg-amber-200/60 dark:bg-amber-800/40 px-1 py-0.5 rounded">
            data/db-config.json
          </code>
          . {promoteSentence}{" "}
          <Link
            href="/setup"
            className="underline font-medium hover:no-underline ml-1"
            data-testid="link-env-warning-setup"
          >
            {t("layout.envSourceWarningBanner.openSetup")}
          </Link>
          <span className="mx-2 opacity-60">·</span>
          <Link
            href="/admin?tab=fiscal-calendar"
            className="underline font-medium hover:no-underline"
            data-testid="link-env-warning-system-settings"
          >
            {t("layout.envSourceWarningBanner.systemSettings")}
          </Link>
        </div>
      </div>
      <button
        onClick={handleDismiss}
        className="flex items-center gap-1 px-2 py-1 hover:bg-amber-200 dark:hover:bg-amber-800/40 rounded text-amber-900 dark:text-amber-100 shrink-0"
        aria-label={t("layout.envSourceWarningBanner.dismiss")}
        data-testid="button-env-warning-dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
