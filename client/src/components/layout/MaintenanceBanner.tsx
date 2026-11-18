// Scheduled maintenance banner (Admin › System Settings › Maintenance).
// Counts down to the window an Admin announced, then says maintenance is
// under way until it ends. The countdown can be hidden until the last
// 15 minutes; it always shows while maintenance is running.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Clock, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import {
  countdownParts,
  maintenanceEndsAt,
  maintenancePhase,
  type MaintenancePhase,
  type MaintenanceWindow,
} from "@shared/maintenance";

export const MAINTENANCE_QUERY_KEY = ["/api/maintenance"] as const;

const ALWAYS_SHOW_MS = 15 * 60 * 1000;
const DISMISS_KEY = "criteriaiq.maintenanceBanner.dismissed";

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

function writeDismissed(value: string) {
  try {
    window.localStorage.setItem(DISMISS_KEY, value);
  } catch {
    // Storage blocked: the banner just stays visible.
  }
}

export function MaintenanceBanner() {
  const { t, i18n } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const [dismissed, setDismissed] = useState<string | null>(() => readDismissed());

  const { data } = useQuery<{ window: MaintenanceWindow | null; phase: MaintenancePhase | null }>({
    queryKey: MAINTENANCE_QUERY_KEY,
    queryFn: async () => await apiRequest("GET", "/api/maintenance"),
    refetchInterval: 5 * 60 * 1000,
    retry: false,
  });
  const window_ = data?.window ?? null;

  useEffect(() => {
    if (!window_) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [window_]);

  if (!window_) return null;
  const phase = maintenancePhase(window_, new Date(now));
  if (phase === "ended") return null;

  const start = new Date(window_.startsAt).getTime();
  const untilStart = start - now;
  if (phase === "upcoming" && dismissed === window_.startsAt && untilStart > ALWAYS_SHOW_MS) return null;

  const { days, hours, minutes, seconds } = countdownParts(
    phase === "upcoming" ? untilStart : maintenanceEndsAt(window_).getTime() - now,
  );
  const countdown =
    days > 0
      ? t("layout.maintenanceBanner.countdownDays", { days, hours })
      : hours > 0
        ? t("layout.maintenanceBanner.countdownHours", { hours, minutes })
        : t("layout.maintenanceBanner.countdownMinutes", { minutes, seconds: String(seconds).padStart(2, "0") });
  const when = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(start));
  const active = phase === "active";

  return (
    <div
      data-testid="maintenance-banner"
      data-phase={phase}
      role="status"
      aria-live="polite"
      className={
        active
          ? "flex items-center gap-2 border-y border-red-300 bg-red-100 px-4 py-2 text-sm text-red-900 dark:border-red-800 dark:bg-red-900/40 dark:text-red-100"
          : "flex items-center gap-2 border-y border-sky-300 bg-sky-100 px-4 py-2 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-900/40 dark:text-sky-100"
      }
    >
      {active ? <Wrench className="h-4 w-4 shrink-0" /> : <Clock className="h-4 w-4 shrink-0" />}
      <span className="flex-1">
        <strong>{active ? t("layout.maintenanceBanner.activeTitle") : t("layout.maintenanceBanner.upcomingTitle")}</strong>{" "}
        {active
          ? t("layout.maintenanceBanner.activeBody", { countdown })
          : t("layout.maintenanceBanner.upcomingBody", { when, countdown, minutes: window_.durationMinutes })}
        {window_.message ? <> {window_.message}</> : null}
      </span>
      {!active && untilStart > ALWAYS_SHOW_MS && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-sky-900 hover:bg-sky-200 dark:text-sky-100 dark:hover:bg-sky-800"
          aria-label={t("layout.maintenanceBanner.hide")}
          title={t("layout.maintenanceBanner.hide")}
          onClick={() => {
            writeDismissed(window_.startsAt);
            setDismissed(window_.startsAt);
          }}
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
