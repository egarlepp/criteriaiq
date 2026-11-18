import { useTranslation } from "react-i18next";
import { CircleDashed, ShieldCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { normalizeCriterionPriority, type CriterionPriority } from "@shared/value-journey";

interface CriterionPriorityButtonProps {
  priority: string | null | undefined;
  /** Omit for a read-only icon. */
  onChange?: (next: CriterionPriority) => void;
  disabled?: boolean;
  "data-testid"?: string;
}

/**
 * The 26px icon to the right of a criterion's Status: a filled shield for a
 * must-have (it decides the technical win), a dashed circle for a
 * nice-to-have. Clicking it switches the two when the user can edit.
 */
export function CriterionPriorityButton({ priority, onChange, disabled, ...rest }: CriterionPriorityButtonProps) {
  const { t } = useTranslation();
  const value = normalizeCriterionPriority(priority);
  const isMust = value === "must_have";
  const label = isMust ? t("valueJourney.priority.mustHave") : t("valueJourney.priority.niceToHave");
  const hint = isMust ? t("valueJourney.priority.mustHaveHint") : t("valueJourney.priority.niceToHaveHint");
  const Icon = isMust ? ShieldCheck : CircleDashed;
  const iconClass = cn(
    "h-4 w-4",
    isMust ? "fill-purple-100 text-purple-700 dark:fill-purple-900/60 dark:text-purple-300" : "text-slate-400 dark:text-slate-500",
  );

  const body = onChange ? (
    <button
      type="button"
      onClick={() => onChange(isMust ? "nice_to_have" : "must_have")}
      disabled={disabled}
      aria-label={t("valueJourney.priority.switch", { priority: label })}
      className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-md hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:hover:bg-slate-800"
      data-testid={rest["data-testid"]}
    >
      <Icon className={iconClass} aria-hidden="true" />
    </button>
  ) : (
    <span
      className="grid h-[26px] w-[26px] shrink-0 place-items-center"
      role="img"
      aria-label={label}
      data-testid={rest["data-testid"]}
    >
      <Icon className={iconClass} aria-hidden="true" />
    </span>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{body}</TooltipTrigger>
      <TooltipContent side="left">
        <p className="text-xs font-semibold">{label}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
        {onChange ? <p className="text-[11px] text-muted-foreground">{t("valueJourney.priority.clickToSwitch")}</p> : null}
      </TooltipContent>
    </Tooltip>
  );
}
