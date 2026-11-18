// Demo Mode indicator. Sits at the bottom of the sidebar nav, directly above
// the divider that opens the footer (connections, settings, user). Expanded,
// it is a compact amber card naming the source (session / account / app-wide)
// with an inline "Exit demo" when the session is the only source; collapsed,
// it is an amber icon whose tooltip carries the same text. Excluded-route
// detection is client-side (the /api/demo/status request path is itself
// always excluded, so the server can't answer).
import { FlaskConical, X } from "lucide-react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { useDemoStatus } from "@/hooks/useDemoStatus";
import { isExcludedClientRoute } from "@/lib/demoExcluded";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const amberSurface =
  "border border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-100";

export function SidebarDemoIndicator({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const { data } = useDemoStatus();
  const [location] = useLocation();
  const qc = useQueryClient();

  const exitSession = useMutation({
    mutationFn: () => apiRequest("POST", "/api/demo/session/exit"),
    onSuccess: () => {
      // Mode change requires dropping every tagged-table cache, not
      // just the demo status. See DemoModeSection for the full list.
      qc.invalidateQueries();
    },
  });

  if (!data?.active) return null;
  const sourceLabel = t(`layout.demoModeBanner.sources.${data.source}`, { defaultValue: data.source });
  const sourceLine = t("layout.demoModeBanner.enabledBy", { source: sourceLabel });
  const excluded = isExcludedClientRoute(location);
  const notice = excluded ? t("layout.demoModeBanner.excludedNotice") : t("layout.demoModeBanner.syntheticNotice");
  // Only offer "Exit demo" when the session is the SOLE active source. If the
  // account flag or the app-wide setting is also on, clearing the session
  // would not exit demo mode, so the button would mislead. Those sources are
  // lifted from the Demo Mode page.
  const sessionExitable = data.sessionFlag && data.source === "session";

  const tooltipBody = (
    <div className="max-w-[260px] space-y-1">
      <p className="font-medium">{t("layout.demoModeBanner.title")}</p>
      <p className="text-xs">{sourceLine}</p>
      <p className="text-xs opacity-80">{notice}</p>
    </div>
  );

  const common = {
    "data-testid": "demo-mode-indicator",
    "data-demo-excluded": excluded ? "true" : "false",
    "data-demo-source": data.source,
    role: "status",
  } as const;

  if (collapsed) {
    return (
      <div className="shrink-0 flex justify-center px-2 pt-2 pb-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                {...common}
                tabIndex={0}
                aria-label={`${t("layout.demoModeBanner.title")}. ${sourceLine}`}
                className={cn("flex h-9 w-9 items-center justify-center rounded-lg", amberSurface)}
              >
                <FlaskConical className="h-[18px] w-[18px]" strokeWidth={1.75} />
                <span className="sr-only">{notice}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">{tooltipBody}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  return (
    <div className="shrink-0 pl-2 pr-[10px] pt-2 pb-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              {...common}
              tabIndex={0}
              className={cn("flex items-start gap-2 rounded-lg px-2.5 py-2", amberSurface)}
            >
              <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold leading-4">{t("layout.demoModeBanner.label")}</p>
                <p className="text-[11px] leading-4 text-amber-800 dark:text-amber-200/80">{sourceLine}</p>
                <span className="sr-only">{notice}</span>
              </div>
              {sessionExitable && (
                <button
                  type="button"
                  data-testid="demo-banner-exit-session"
                  disabled={exitSession.isPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    exitSession.mutate();
                  }}
                  title={exitSession.isPending ? t("layout.demoModeBanner.exiting") : t("layout.demoModeBanner.exit")}
                  aria-label={t("layout.demoModeBanner.exit")}
                  className="-mr-1 -mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-amber-200 disabled:opacity-50 dark:hover:bg-amber-500/25"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">{tooltipBody}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
