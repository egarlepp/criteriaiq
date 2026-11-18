import type { ComponentPropsWithRef } from "react";
import { useTranslation } from "react-i18next";
import { Check, Diamond } from "lucide-react";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ComputedJourneyStage } from "@shared/value-journey";
import { hexToRgba, journeyStageSubline, journeyStateText, useProjectJourney, type ProjectJourney } from "./use-value-journey";

interface JourneyStageTrackProps {
  projectId: number;
  /**
   * compact: small stage pills (project cards, the project page tab bar).
   * icons: one round icon per stage in the stage's own color (Account
   * Portal project cards); the name and state are in the tooltip.
   * banner: a full-width row of the same stage icons with each stage's
   * name and date (Edit Project); the tooltip explains the stage.
   */
  variant?: "compact" | "icons" | "banner";
}

/** The agreement diamond's look for the journey's agreement state. */
function agreementTone(status: ProjectJourney["agreement"]["status"]): string {
  switch (status) {
    case "agreed":
      return "text-green-700 dark:text-green-400";
    case "changed":
      return "text-amber-600 dark:text-amber-400";
    case "sent":
      return "text-blue-600 dark:text-blue-400";
    default:
      return "text-slate-400 dark:text-slate-500";
  }
}

interface StageIconProps extends Omit<ComponentPropsWithRef<"span">, "children"> {
  stage: ComputedJourneyStage;
  size: "sm" | "md";
  label: string;
  testId?: string;
  doneTestId?: string;
}

/**
 * One stage as a round icon: done and current stages are filled with the
 * stage's color (the current one with a soft ring), stages not started yet
 * are grayed out, and a done stage adds a small check in the corner.
 */
function StageIcon({ stage, size, label, testId, doneTestId, className, style, ...rest }: StageIconProps) {
  const md = size === "md";
  return (
    <span
      {...rest}
      className={cn(
        "relative grid shrink-0 cursor-default place-items-center rounded-full border-2",
        md ? "h-9 w-9" : "h-7 w-7",
        stage.state === "upcoming" &&
          "border-slate-300 bg-slate-100 text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-500",
        className,
      )}
      style={
        stage.state === "upcoming"
          ? style
          : {
              ...style,
              borderColor: stage.color,
              backgroundColor: stage.color,
              color: "#ffffff",
              boxShadow: stage.state === "current" ? `0 0 0 3px ${hexToRgba(stage.color, 0.25)}` : undefined,
            }
      }
      role="img"
      aria-label={label}
      aria-current={stage.state === "current" ? "step" : undefined}
      data-testid={testId}
      data-state={stage.state}
    >
      <DynamicIcon name={stage.iconName} size={md ? 17 : 14} aria-hidden="true" />
      {stage.state === "done" ? (
        <span
          className={cn(
            "absolute -bottom-1 -right-1 grid place-items-center rounded-full bg-green-600 text-white ring-2 ring-white dark:bg-green-500 dark:ring-slate-900",
            md ? "h-4 w-4" : "h-3.5 w-3.5",
          )}
          data-testid={doneTestId}
          aria-hidden="true"
        >
          <Check className={md ? "h-3 w-3" : "h-2.5 w-2.5"} strokeWidth={3.5} />
        </span>
      ) : null}
    </span>
  );
}

/**
 * The project's value journey as a one-line track: each stage lit when done,
 * the current stage in its color, and the diamond before the stage that waits
 * for the customer's agreement to the criteria. Read only; the Overview card
 * (ValueJourneyCard) explains each stage. Renders nothing without a plan.
 */
export function JourneyStageTrack({ projectId, variant = "compact" }: JourneyStageTrackProps) {
  const { t, i18n } = useTranslation();
  const { data } = useProjectJourney(projectId);
  if (!data || data.stages.length === 0) return null;

  const stateText = (stage: ComputedJourneyStage) => journeyStateText(stage, t);
  const agreementText = t(`valueJourney.agreement.short.${data.agreement.status}`);

  const diamond = (key: string) => (
    <Tooltip key={key}>
      <TooltipTrigger asChild>
        <span
          className={cn("inline-flex shrink-0 items-center", agreementTone(data.agreement.status))}
          aria-label={agreementText}
          data-testid={`journey-track-agreement-${projectId}`}
        >
          <Diamond className={variant === "banner" ? "h-4 w-4" : "h-3 w-3"} fill={data.agreement.status === "agreed" ? "currentColor" : "none"} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="text-xs">{agreementText}</p>
      </TooltipContent>
    </Tooltip>
  );

  if (variant === "banner") {
    return (
      <TooltipProvider delayDuration={200}>
        <ol
          className="flex flex-wrap items-stretch gap-2 rounded-xl border border-slate-200 bg-card p-2 dark:border-slate-800"
          aria-label={t("valueJourney.track")}
          data-testid="journey-track-banner"
        >
          {data.stages.map((stage, index) => (
            <li key={stage.key} className="flex min-w-[150px] flex-1 items-center gap-2">
              {index > 0 ? (
                <span
                  className={cn(
                    "hidden h-0.5 w-3 shrink-0 rounded-full sm:block",
                    stage.state === "upcoming" ? "bg-slate-200 dark:bg-slate-700" : "bg-slate-400 dark:bg-slate-500",
                  )}
                  aria-hidden="true"
                />
              ) : null}
              {stage.agreementGate ? diamond(`gate-${stage.key}`) : null}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "flex min-w-0 flex-1 cursor-default items-center gap-2.5 rounded-lg border px-2.5 py-1.5",
                      stage.state === "upcoming" && "border-slate-200 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-900/40",
                    )}
                    style={
                      stage.state === "upcoming"
                        ? undefined
                        : {
                            borderColor: hexToRgba(stage.color, stage.state === "current" ? 0.6 : 0.3),
                            backgroundColor: hexToRgba(stage.color, stage.state === "current" ? 0.12 : 0.06),
                          }
                    }
                    tabIndex={0}
                    data-testid={`journey-banner-stage-${stage.key}`}
                  >
                    <StageIcon
                      stage={stage}
                      size="md"
                      label={t("valueJourney.card.stageLabel", { name: stage.name, status: stateText(stage) })}
                      testId={`journey-banner-icon-${stage.key}`}
                      doneTestId={`journey-banner-done-${stage.key}`}
                    />
                    <span className="min-w-0">
                      <span
                        className={cn(
                          "block truncate text-sm",
                          stage.state === "current" ? "font-bold" : "font-semibold",
                          stage.state === "upcoming" ? "text-slate-500 dark:text-slate-400" : "text-slate-900 dark:text-slate-100",
                        )}
                      >
                        {stage.name}
                      </span>
                      <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {journeyStageSubline(stage, t, i18n.language)}
                      </span>
                    </span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="text-xs font-semibold">
                    {stage.name}
                    <span className="ml-1.5 font-normal text-muted-foreground">{stateText(stage)}</span>
                  </p>
                  {stage.description ? <p className="mt-1 text-[11px] leading-snug">{stage.description}</p> : null}
                  <p className="mt-1 text-[11px] text-muted-foreground">{journeyStageSubline(stage, t, i18n.language)}</p>
                </TooltipContent>
              </Tooltip>
            </li>
          ))}
        </ol>
      </TooltipProvider>
    );
  }

  if (variant === "icons") {
    return (
      <TooltipProvider delayDuration={200}>
        <ol className="flex flex-nowrap items-center gap-1" aria-label={t("valueJourney.track")} data-testid={`journey-track-${projectId}`}>
          {data.stages.map((stage, index) => (
            <li key={stage.key} className="flex items-center gap-1">
              {index > 0 ? (
                <span
                  className={cn("h-0.5 w-2 rounded-full", stage.state === "upcoming" ? "bg-slate-200 dark:bg-slate-700" : "bg-slate-400 dark:bg-slate-500")}
                  aria-hidden="true"
                />
              ) : null}
              {stage.agreementGate ? diamond(`gate-${stage.key}`) : null}
              <Tooltip>
                <TooltipTrigger asChild>
                  <StageIcon
                    stage={stage}
                    size="sm"
                    label={t("valueJourney.card.stageLabel", { name: stage.name, status: stateText(stage) })}
                    testId={`journey-track-stage-${projectId}-${stage.key}`}
                    doneTestId={`journey-track-done-${projectId}-${stage.key}`}
                  />
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs font-semibold">{stage.name}</p>
                  <p className="text-[11px] text-muted-foreground">{stateText(stage)}</p>
                </TooltipContent>
              </Tooltip>
            </li>
          ))}
        </ol>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <ol className="flex flex-wrap items-center gap-1" aria-label={t("valueJourney.track")} data-testid={`journey-track-${projectId}`}>
        {data.stages.map((stage) => (
          <li key={stage.key} className="flex items-center gap-1">
            {stage.agreementGate ? diamond(`gate-${stage.key}`) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    "inline-flex cursor-default items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold",
                    stage.state === "done" && "border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/50 dark:text-green-300",
                    stage.state === "upcoming" && "border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500",
                  )}
                  style={
                    stage.state === "current"
                      ? { borderColor: hexToRgba(stage.color, 0.5), backgroundColor: hexToRgba(stage.color, 0.12), color: stage.color }
                      : undefined
                  }
                  aria-current={stage.state === "current" ? "step" : undefined}
                >
                  {stage.state === "done" ? (
                    <Check className="h-2.5 w-2.5 shrink-0" strokeWidth={3} aria-hidden="true" />
                  ) : (
                    <DynamicIcon name={stage.iconName} size={10} className="shrink-0" aria-hidden="true" />
                  )}
                  <span className="max-w-[72px] truncate">{stage.name}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs font-semibold">{stage.name}</p>
                <p className="text-[11px] text-muted-foreground">{stateText(stage)}</p>
              </TooltipContent>
            </Tooltip>
          </li>
        ))}
      </ol>
    </TooltipProvider>
  );
}
