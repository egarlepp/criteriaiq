import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { InterimUpdatesList } from "@/components/about/InterimUpdatesList";
import { useVersionUpdates } from "@/hooks/use-version-updates";
import { SidebarVersionLabel } from "./SidebarVersionLabel";

export interface SidebarVersionLinkProps {
  version: string | null | undefined;
  isLoading: boolean;
  isError: boolean;
  /** Opens About → Introduction (Recent Updates). */
  onOpenIntroduction: () => void;
}

/**
 * The version under the CriteriaIQ logo, right-aligned to the logo like
 * ImpactIQ's version chip. For internal users it is a link that opens the
 * interim updates merged since the last release, laid out like ImpactIQ's
 * What's new (the newest three open, each under its Change Log heading, the
 * rest folded into "Earlier updates"); outside users (Customer,
 * Guest, Partner) see the plain version, since PR titles can name internal
 * work.
 */
export function SidebarVersionLink({ version, isLoading, isError, onOpenIntroduction }: SidebarVersionLinkProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data, isLoading: updatesLoading, isError: updatesError, canView } = useVersionUpdates();

  const label = <SidebarVersionLabel as="span" version={version} isLoading={isLoading} isError={isError} />;
  if (!canView) return <span className="font-mono leading-none">{label}</span>;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="font-mono leading-none hover:underline focus-visible:underline focus-visible:outline-none"
          title={t("about.versionUpdates.linkTitle")}
          aria-label={t("about.versionUpdates.linkTitle")}
          data-testid="sidebar-version-link"
        >
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-80 p-2 text-xs">
        <div className="mb-1.5 flex items-baseline justify-between gap-2 px-0.5">
          <span className="font-semibold text-gray-900 dark:text-gray-100">{t("about.versionUpdates.whatsNew")}</span>
          {data?.release && (
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              {t("about.versionUpdates.since", { release: data.release })}
            </span>
          )}
        </div>
        <InterimUpdatesList
          variant="compact"
          collapseAfter={3}
          updates={data?.updates}
          release={data?.release}
          isLoading={updatesLoading}
          isError={updatesError}
        />
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onOpenIntroduction();
          }}
          className="mt-2 flex w-full items-center justify-end gap-1 px-0.5 text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          {t("about.versionUpdates.openIntroduction")}
          <ArrowRight className="h-3 w-3" />
        </button>
      </PopoverContent>
    </Popover>
  );
}

export default SidebarVersionLink;
