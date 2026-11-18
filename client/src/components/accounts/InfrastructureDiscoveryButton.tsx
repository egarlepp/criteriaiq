import { useTranslation } from "react-i18next";
import { SearchCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useInfrastructureProfileSummary, type InfrastructureProfileSummary } from "./infrastructure-profile-summary";

/** Hover text for the Infrastructure Discovery icon: the title, plus the default profile when there is one. */
export function InfrastructureDiscoveryTooltip({ summary }: { summary?: InfrastructureProfileSummary }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-0.5">
      <p className="font-medium">{t("accounts.infraDiscovery.title")}</p>
      {summary && (
        <p className="text-xs opacity-80">
          {t("accounts.infraDiscovery.defaultProfile", { name: summary.defaultProfileName })}
        </p>
      )}
    </div>
  );
}

interface InfrastructureDiscoveryButtonProps {
  customerId: number | null | undefined;
  onClick: () => void;
  /** "sm" sits beside text (overview card); "md" matches a 40px input. */
  size?: "sm" | "md";
  side?: "top" | "bottom";
  className?: string;
}

/**
 * The Infrastructure Discovery icon button. Bold and blue when the account
 * has at least one profile; hovering shows the default profile's name.
 */
export function InfrastructureDiscoveryButton({
  customerId,
  onClick,
  size = "md",
  side = "top",
  className,
}: InfrastructureDiscoveryButtonProps) {
  const { t } = useTranslation();
  const summary = useInfrastructureProfileSummary(customerId);
  const hasProfiles = !!summary;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={!customerId}
            onClick={onClick}
            aria-label={t("accounts.infraDiscovery.title")}
            data-has-profiles={hasProfiles ? "true" : "false"}
            className={cn(
              "shrink-0 disabled:opacity-30 disabled:cursor-not-allowed",
              size === "sm" ? "h-6 w-6" : "h-10 w-10",
              hasProfiles
                ? "text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                : "text-gray-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400",
              className,
            )}
          >
            <SearchCode className="h-4 w-4" strokeWidth={hasProfiles ? 2.75 : 2} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side={side}>
          <InfrastructureDiscoveryTooltip summary={summary} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
