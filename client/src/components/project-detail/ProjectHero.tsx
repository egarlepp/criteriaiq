import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** TabsList classes: a pill segmented control under the title. */
export const HERO_TABS_LIST_CLASS =
  "!w-fit h-auto max-w-full !border-b-0 flex-nowrap justify-start gap-1 overflow-x-auto overflow-y-hidden rounded-full bg-slate-100 p-1 [scrollbar-width:none] dark:bg-slate-800";

/** TabsTrigger classes for one pill: the active tab is a raised white pill. */
export const HERO_TAB_CLASS = [
  "shrink-0 grow-0 gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold",
  "text-slate-600 hover:bg-white/60 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-slate-50",
  "data-[state=active]:border-b-0 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm",
  "dark:data-[state=active]:bg-slate-950 dark:data-[state=active]:text-slate-50",
  "focus-visible:ring-offset-0",
].join(" ");

/** Extra classes for a tab hidden from outside users (internal viewers only). */
export const HERO_TAB_HIDDEN_CLASS = "border border-dashed border-red-400 dark:border-red-500";

interface ProjectHeroProps {
  /** Shown left of the text (the Account Portal's logo). */
  leading?: ReactNode;
  /** Small line above the title (customer, project id, environment, approver). */
  eyebrow: ReactNode;
  title: string;
  /** Badges after the title (end-date flag). */
  titleAdornment?: ReactNode;
  /** Solution badges. */
  solutions?: ReactNode;
  /** Status controls (Account Status picker, internal-only pills). */
  status?: ReactNode;
  /** Buttons on the right (TAP, Save Updates). */
  actions?: ReactNode;
  /** Validation criteria met, 0–100; null hides the ring. */
  percent: number | null;
  percentLabel: string;
  /** The tab list, drawn as the bottom edge of the band. */
  tabs: ReactNode;
}

/**
 * Header of the project page and the Account Portal (customer workspace
 * layout): a light card surface edge to edge under the app header, with the
 * title, status and actions on top and the tabs as a pill segmented control.
 */
export function ProjectHero({
  leading,
  eyebrow,
  title,
  titleAdornment,
  solutions,
  status,
  actions,
  percent,
  percentLabel,
  tabs,
}: ProjectHeroProps) {
  const { t } = useTranslation();
  const pct = percent == null ? null : Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div
      className="project-hero mb-4 border-b border-slate-200 bg-card text-slate-900 print:mb-2 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
      style={{ marginLeft: "-80px", marginRight: "-80px", paddingLeft: "80px", paddingRight: "80px" }}
      data-testid="project-hero"
    >
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3 pt-4 pb-3">
        {leading ? <div className="shrink-0">{leading}</div> : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-600 dark:text-slate-400">{eyebrow}</div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold leading-tight tracking-tight" data-testid="project-hero-title">
              {title}
            </h1>
            {titleAdornment}
          </div>
          {solutions ? <div className="flex flex-wrap items-center gap-1.5">{solutions}</div> : null}
          {status ? <div className="pt-1.5">{status}</div> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {pct != null ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="relative h-14 w-14 shrink-0 rounded-full"
                    style={{
                      background: `conic-gradient(var(--primary) ${pct * 3.6}deg, color-mix(in srgb, var(--primary) 18%, transparent) 0deg)`,
                    }}
                    role="img"
                    aria-label={percentLabel}
                    data-testid="project-hero-ring"
                  >
                    <div
                      className="absolute inset-[6px] flex items-center justify-center rounded-full bg-card text-sm font-extrabold tabular-nums text-slate-900 dark:bg-slate-900 dark:text-slate-100"
                    >
                      {pct}%
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs font-semibold">{percentLabel}</p>
                  <p className="text-[11px] text-muted-foreground">{t("projectView.hero.ringHint")}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
        </div>
      </div>
      <div className="pb-3 print:hidden" data-html2canvas-ignore="true">
        {tabs}
      </div>
    </div>
  );
}
