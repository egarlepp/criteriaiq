import { ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface GuidedFormSectionProps {
  stepNumber?: number;
  title: string;
  icon: ReactNode;
  description?: string;
  isOpen: boolean;
  onToggle: () => void;
  completedFields?: number;
  totalRequiredFields?: number;
  color?: 'blue' | 'purple' | 'green' | 'amber' | 'red' | 'cyan' | 'orange' | 'brand' | 'forest';
  children: ReactNode;
  id?: string;
  headerActions?: ReactNode;
  variant?: 'default' | 'plain';
  disabled?: boolean;
}

const accentColorMap: Record<string, string> = {
  blue: '#3b82f6',
  purple: '#a855f7',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
  cyan: '#06b6d4',
  orange: '#f97316',
  brand: '#3b0764',
  forest: '#226600',
};

const colorClasses = {
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-200 dark:border-blue-800',
    accent: 'bg-blue-500',
    text: 'text-blue-600 dark:text-blue-400',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    border: 'border-purple-200 dark:border-purple-800',
    accent: 'bg-purple-500',
    text: 'text-purple-600 dark:text-purple-400',
    badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
  },
  green: {
    bg: 'bg-green-50 dark:bg-green-950/30',
    border: 'border-green-200 dark:border-green-800',
    accent: 'bg-green-500',
    text: 'text-green-600 dark:text-green-400',
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-800',
    accent: 'bg-amber-500',
    text: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
  },
  red: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-800',
    accent: 'bg-red-500',
    text: 'text-red-600 dark:text-red-400',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
  },
  cyan: {
    bg: 'bg-cyan-50 dark:bg-cyan-950/30',
    border: 'border-cyan-200 dark:border-cyan-800',
    accent: 'bg-cyan-500',
    text: 'text-cyan-600 dark:text-cyan-400',
    badge: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300',
  },
  orange: {
    bg: 'bg-orange-50 dark:bg-orange-950/30',
    border: 'border-orange-200 dark:border-orange-800',
    accent: 'bg-orange-500',
    text: 'text-orange-600 dark:text-orange-400',
    badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300',
  },
  brand: {
    bg: 'bg-[#3b0764]/[0.06] dark:bg-[#3b0764]/[0.18]',
    border: 'border-[#3b0764]/25 dark:border-[#3b0764]/40',
    accent: 'bg-[#3b0764]',
    text: 'text-[#3b0764] dark:text-[#c4b5fd]',
    badge: 'bg-[#3b0764]/10 text-[#3b0764] dark:bg-[#3b0764]/30 dark:text-[#c4b5fd]',
  },
  forest: {
    bg: 'bg-[#226600]/[0.06] dark:bg-[#226600]/[0.18]',
    border: 'border-[#226600]/25 dark:border-[#226600]/40',
    accent: 'bg-[#226600]',
    text: 'text-[#226600] dark:text-[#86efac]',
    badge: 'bg-[#226600]/10 text-[#226600] dark:bg-[#226600]/30 dark:text-[#86efac]',
  },
};

export function GuidedFormSection({
  stepNumber,
  title,
  icon,
  description,
  isOpen,
  onToggle,
  completedFields = 0,
  totalRequiredFields = 0,
  color = 'blue',
  children,
  id,
  headerActions,
  variant = 'default',
  disabled = false,
}: GuidedFormSectionProps) {
  const { t } = useTranslation();
  const isComplete = totalRequiredFields > 0 && completedFields >= totalRequiredFields;
  const colors = colorClasses[color];
  const isPlain = variant === 'plain';
  const [isHovered, setIsHovered] = useState(false);
  const accentColor = accentColorMap[color] || '#3b82f6';

  return (
    <Collapsible open={isOpen && !disabled} onOpenChange={disabled ? undefined : onToggle}>
      <div
        id={id}
        className={cn(
          "rounded-lg border transition-all duration-200 relative",
          disabled && "opacity-50",
          isPlain
            ? "border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            : cn(
                "border-2",
                isOpen && !disabled ? colors.border : "border-gray-200 dark:border-slate-700",
                isOpen && !disabled ? colors.bg : "bg-white dark:bg-slate-900"
              )
        )}
        onMouseEnter={() => !disabled && setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg transition-all duration-200"
          style={{
            backgroundColor: !disabled && (isHovered || isOpen)
              ? (isPlain ? '#9ca3af' : accentColor)
              : 'transparent',
            opacity: !disabled && (isHovered || isOpen) ? 1 : 0
          }}
        />
        <CollapsibleTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            onClick={disabled ? undefined : undefined}
            className={cn(
              "w-full px-4 py-4 flex items-center gap-3 transition-colors rounded-t-lg",
              disabled
                ? "cursor-not-allowed"
                : "hover:bg-gray-50 dark:hover:bg-slate-800/50"
            )}
          >
            {/* Step number circle */}
            {!isPlain && stepNumber !== undefined && (
              <div
                className={cn(
                  "flex-none w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm",
                  isComplete ? "bg-green-500" : colors.accent
                )}
              >
                {isComplete ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  stepNumber
                )}
              </div>
            )}

            {/* Main content area: icon + title + description */}
            <div className="flex-1 min-w-0 flex items-center gap-2">
              {/* Icon: never shrinks */}
              <span className={cn("flex-none h-5 w-5", isPlain ? "text-gray-500 dark:text-slate-400" : colors.text)}>
                {icon}
              </span>
              {/* Title: natural width, only truncates on very narrow screens when container itself is tight */}
              <span className="font-semibold text-gray-900 dark:text-slate-100 truncate">
                {title}
              </span>
              {/* Description: fills remaining space, truncates with ellipsis when space is limited */}
              {description && (
                <span className="flex-1 min-w-0 text-sm text-gray-500 dark:text-slate-400 text-left truncate">
                  {description}
                </span>
              )}
            </div>

            {/* Right controls: completion badge + chevron */}
            <div className="flex items-center gap-3 flex-none">
              {!isPlain && totalRequiredFields > 0 && (
                <span
                  className={cn(
                    "text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap",
                    isComplete
                      ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
                      : colors.badge
                  )}
                >
                  {t("projects.form.completedOfRequired", { completed: completedFields, total: totalRequiredFields })}
                </span>
              )}
              {isOpen && !disabled ? (
                <ChevronDown className="h-5 w-5 text-gray-500 dark:text-slate-400" />
              ) : (
                <ChevronRight className="h-5 w-5 text-gray-500 dark:text-slate-400" />
              )}
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {headerActions && (
            <div className="px-4 pb-2 flex justify-end" onClick={(e) => e.stopPropagation()}>
              {headerActions}
            </div>
          )}
          <div className="px-4 pb-4 pt-2">
            {children}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
