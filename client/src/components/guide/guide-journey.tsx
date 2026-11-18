import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { useValidationRecordLabel } from "@/hooks/use-validation-record-label";
import { GUIDE_STAGES, ROLE_STAGE_ITEMS, type GuideRoleKey, type GuideStageKey } from "./guide-data";

export function GuideJourney({ role }: { role: GuideRoleKey }) {
  const { t } = useTranslation();
  // Admin-chosen name for the validation record (Evaluation, POC, POV, ...).
  const record = useValidationRecordLabel();
  const [stage, setStage] = useState<GuideStageKey>("before");

  return (
    <section className="rounded-lg border bg-card p-4 sm:p-5 space-y-4" aria-labelledby="guide-journey-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="guide-journey-title" className="text-base font-semibold text-foreground">{t("guide.journey.title")}</h2>
        <span className="text-xs text-muted-foreground">{t("guide.journey.hint")}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {GUIDE_STAGES.map((key, index) => {
          const active = key === stage;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setStage(key)}
              className={cn(
                // Tint via color-mix, not bg-primary/N: index.css forces a solid
                // primary fill on any <button> whose class contains "bg-primary".
                "flex items-center gap-3 rounded-lg px-4 py-3 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
                active
                  ? "border-2 border-primary bg-[color-mix(in_srgb,var(--primary)_6%,var(--card))] dark:bg-[color-mix(in_srgb,var(--primary)_15%,var(--card))]"
                  : "border bg-card",
              )}
              data-testid={`guide-stage-${key}`}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                  active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{t(`guide.journey.stages.${key}.title`)}</span>
                <span className="block text-xs text-muted-foreground">
                  {t("guide.journey.activityCount", { count: ROLE_STAGE_ITEMS[role][key].length })}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
        {ROLE_STAGE_ITEMS[role][stage].map((item) => (
          <li key={item} className="flex items-start gap-2.5 rounded-md bg-muted/40 px-3 py-2.5 text-sm text-foreground/90 leading-snug">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-primary" aria-hidden="true" />
            <span>{t(`guide.journey.roles.${role}.${stage}.${item}`, { record })}</span>
          </li>
        ))}
      </ul>

      <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 dark:border-amber-900/60 dark:bg-amber-950/30">
        <Lightbulb className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-amber-900 dark:text-amber-100">{t(`guide.journey.roles.${role}.tip`)}</p>
      </div>
    </section>
  );
}
