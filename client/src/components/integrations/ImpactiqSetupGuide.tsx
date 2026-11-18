import { useTranslation } from "react-i18next";
import { BookOpen, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const STEP_GROUPS = [
  { titleKey: "effortTitle", steps: ["effort1", "effort2"] },
  { titleKey: "readTitle", steps: ["read1", "read2", "read3"] },
  { titleKey: "liveTitle", steps: ["live1", "live2", "live3"] },
] as const;

/**
 * Setup steps for the whole ImpactIQ link, on the ImpactIQ card: the
 * effort:read key this card uses, the Read only key ImpactIQ uses to read
 * projects here, and the webhook behind ImpactIQ's live refresh. ImpactIQ
 * carries the same steps, with troubleshooting, in How to Use ImpactIQ ›
 * Connecting CriteriaIQ; keep both in step when either app's menus move.
 */
export function ImpactiqSetupGuide({ defaultOpen }: { defaultOpen: boolean }) {
  const { t } = useTranslation();
  const key = (k: string) => t(`integrations.impactiq.setupGuide.${k}`);

  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className="rounded-md border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40"
      data-testid="impactiq-setup-guide"
    >
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium text-gray-800 dark:text-gray-200">
        <span className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
          {key("toggle")}
        </span>
        <ChevronDown className="h-4 w-4 text-gray-500 transition-transform group-data-[state=open]:rotate-180 dark:text-gray-400" aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 border-t border-gray-200 px-3 py-3 text-xs text-gray-700 dark:border-gray-700 dark:text-gray-300">
        <p>{key("intro")}</p>
        {STEP_GROUPS.map((group) => (
          <div key={group.titleKey} className="space-y-1">
            <p className="font-medium text-gray-900 dark:text-gray-100">{key(group.titleKey)}</p>
            <ol className="list-decimal space-y-1 pl-5">
              {group.steps.map((step) => (
                <li key={step}>{key(step)}</li>
              ))}
            </ol>
          </div>
        ))}
        <p className="text-gray-500 dark:text-gray-400">{key("more")}</p>
      </CollapsibleContent>
    </Collapsible>
  );
}
