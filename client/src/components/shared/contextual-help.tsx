import React from "react";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface ContextualHelpProps {
  content: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  className?: string;
  iconSize?: number;
}

export function ContextualHelp({
  content,
  side = "top",
  align = "center",
  className = "",
  iconSize = 14
}: ContextualHelpProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <HelpCircle
          className={`text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 cursor-help ${className}`}
          size={iconSize}
        />
      </TooltipTrigger>
      <TooltipContent side={side} align={align} className="max-w-xs">
        <p className="text-sm">{content}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// Predefined help content keys for common fields. The actual strings come from
// i18n via `useHelpContent()` so they translate to the active locale.
export const helpContentKeys = {
  // Project Creation & Management
  businessProblem: "shared.contextualHelp.businessProblem",
  opportunityAcvValue: "shared.contextualHelp.opportunityAcvValue",
  customerStatus: "shared.contextualHelp.customerStatus",
  primaryEngineer: "shared.contextualHelp.primaryEngineer",
  specialistEngineer: "shared.contextualHelp.specialistEngineer",
  supportingEngineers: "shared.contextualHelp.supportingEngineers",
  additionalSupportingTeam: "shared.contextualHelp.additionalSupportingTeam",

  // Success Criteria
  successCriteria: "shared.contextualHelp.successCriteria",
  solutions: "shared.contextualHelp.solutions",
  linkedCriteria: "shared.contextualHelp.linkedCriteria",
  expectedOutcome: "shared.contextualHelp.expectedOutcome",
  actionRequired: "shared.contextualHelp.actionRequired",

  // Customer Information
  customerAccess: "shared.contextualHelp.customerAccess",
  additionalAccess: "shared.contextualHelp.additionalAccess",
  stakeholderTypes: "shared.contextualHelp.stakeholderTypes",

  // Configuration & Management
  statusConfiguration: "shared.contextualHelp.statusConfiguration",
  userPermissions: "shared.contextualHelp.userPermissions",
  industryClassification: "shared.contextualHelp.industryClassification",
  solutionTypes: "shared.contextualHelp.solutionTypes",

  // Templates & Artifacts
  projectTemplates: "shared.contextualHelp.projectTemplates",
  documentTypes: "shared.contextualHelp.documentTypes",

  // Analytics & Reporting
  successRate: "shared.contextualHelp.successRate",
  avgDaysToComplete: "shared.contextualHelp.avgDaysToComplete",
  projectStatus: "shared.contextualHelp.projectStatus",

  // Account Portal
  accountAccess: "shared.contextualHelp.accountAccess",
  criteriaCount: "shared.contextualHelp.criteriaCount",
  projectProgress: "shared.contextualHelp.projectProgress",
} as const;

export type HelpKey = keyof typeof helpContentKeys;

/**
 * Backwards-compatible export that returns translated help strings keyed by
 * the same identifiers as the original `helpContent` map. Existing call sites
 * that read `helpContent[key]` continue to work — but new call sites should
 * prefer `useHelpContent()`.
 */
export const helpContent: Record<HelpKey, string> = new Proxy(
  {} as Record<HelpKey, string>,
  {
    get(_target, prop: string) {
      return prop;
    },
  },
);

// Component for inline help with label
interface LabelWithHelpProps {
  label: string;
  helpKey: HelpKey;
  required?: boolean;
  className?: string;
}

export function LabelWithHelp({ label, helpKey, required = false, className = "" }: LabelWithHelpProps) {
  const { t } = useTranslation();
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
        {required && <span className="text-red-500 dark:text-red-400 ml-1">*</span>}
      </label>
      <ContextualHelp content={t(helpContentKeys[helpKey])} />
    </div>
  );
}

// Component for section headers with an optional leading icon and help
interface SectionHeaderWithHelpProps {
  title: React.ReactNode;
  helpKey: HelpKey;
  /** Pass a lucide-react icon to render to the LEFT of the title */
  icon?: LucideIcon;
  className?: string;
  /** Override icon size classes if needed */
  iconClassName?: string;
}

export function SectionHeaderWithHelp({
  title,
  helpKey,
  icon: Icon,
  className = "",
  iconClassName = "h-5 w-5"
}: SectionHeaderWithHelpProps) {
  const { t } = useTranslation();
  return (
    <div className={`flex items-center gap-2 mb-4 ${className}`}>
      {Icon ? <Icon data-title-icon className={iconClassName} /> : null}
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      <ContextualHelp content={t(helpContentKeys[helpKey])} />
    </div>
  );
}
