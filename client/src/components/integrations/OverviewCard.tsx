import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import { Settings, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface OverviewCardProps {
  testId: string;
  icon: LucideIcon;
  /** Green icon tile when the integration is on; gray otherwise. */
  active: boolean;
  title: string;
  description: string;
  /** Status pill shown left of the Configure button. */
  badge?: ReactNode;
  /** Extra line under the description (e.g. why the card is grayed out). */
  note?: ReactNode;
  /** Grays the whole card out and disables Configure. */
  dimmed?: boolean;
  expanded: boolean;
  /** Configure / Close. Ignored while `dimmed`. */
  onToggle: () => void;
  configureTestId: string;
  /** Inline settings shown under the header while expanded. */
  children?: ReactNode;
}

/**
 * One collapsed card on Admin › Integrations › Overview: icon, name,
 * description, a status pill and a Configure button that opens the card's
 * settings inline (or, for cards with their own view, navigates there).
 */
export function OverviewCard({
  testId,
  icon: Icon,
  active,
  title,
  description,
  badge,
  note,
  dimmed = false,
  expanded,
  onToggle,
  configureTestId,
  children,
}: OverviewCardProps) {
  const { t } = useTranslation();
  const open = expanded && !dimmed;

  return (
    <Card className="p-5" data-testid={testId} data-dimmed={dimmed || undefined}>
      {/* Dim the contents, not the card, so the page background doesn't show through. */}
      <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", dimmed && "opacity-50")}>
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "rounded-md p-2",
              active && !dimmed
                ? "bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-400"
                : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-gray-900 dark:text-gray-100">{title}</p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{description}</p>
            {note ? <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{note}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 pl-11 sm:pl-0">
          {badge}
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2.5 text-xs"
            aria-expanded={children ? open : undefined}
            disabled={dimmed}
            onClick={onToggle}
            data-testid={configureTestId}
          >
            {open ? <X className="h-3 w-3" /> : <Settings className="h-3 w-3" />}
            {open ? t("integrations.overview.close") : t("integrations.overview.configure")}
          </Button>
        </div>
      </div>
      {open && children ? <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-800">{children}</div> : null}
    </Card>
  );
}
