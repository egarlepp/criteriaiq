import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionInfo } from "./QuickJumpDropdown";

interface ProgressStepsProps {
  sections: SectionInfo[];
  onJumpToSection: (sectionId: string) => void;
  activeSectionId?: string;
}

const colorMap: Record<string, string> = {
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

export function ProgressSteps({ sections, onJumpToSection, activeSectionId }: ProgressStepsProps) {
  const { t } = useTranslation();
  const activeSections = sections.filter(s => !s.disabled);
  const completedCount = activeSections.filter(s => s.isComplete).length;
  const totalCount = activeSections.length;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium px-2 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 mr-1">
        {completedCount}/{totalCount}
      </span>
      <div className="flex items-center gap-1">
        {sections.map((section, index) => {
          const isComplete = section.isComplete;
          const isActive = activeSectionId === section.id;
          const isDisabled = section.disabled;
          const baseColor = colorMap[section.color] || '#3b82f6';

          /* Build title and aria-label via i18n */
          const sectionTitle = isDisabled
            ? t("projects.form.stepNotApplicable", { step: section.stepNumber, title: section.title })
            : isComplete && isActive
              ? t("projects.form.stepCurrentComplete", { step: section.stepNumber, title: section.title })
              : isComplete
                ? t("projects.form.stepComplete", { step: section.stepNumber, title: section.title })
                : isActive
                  ? t("projects.form.stepCurrent", { step: section.stepNumber, title: section.title })
                  : t("projects.form.stepTitle", { step: section.stepNumber, title: section.title });

          const ariaLabel = isDisabled
            ? t("projects.form.stepAriaNotApplicable", { title: section.title })
            : isComplete && isActive
              ? t("projects.form.stepAriaCurrentComplete", { title: section.title })
              : isComplete
                ? t("projects.form.stepAriaComplete", { title: section.title })
                : isActive
                  ? t("projects.form.stepAriaCurrent", { title: section.title })
                  : t("projects.form.stepAriaJump", { title: section.title });

          return (
            <div key={section.id} className="flex items-center">
              <button
                type="button"
                onClick={() => !isDisabled && onJumpToSection(section.id)}
                disabled={isDisabled}
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-200 border-2",
                  isDisabled
                    ? "cursor-not-allowed opacity-40"
                    : "hover:scale-110 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500",
                  isActive && !isComplete && !isDisabled && "ring-2 ring-offset-2 scale-110 shadow-md"
                )}
                style={{
                  backgroundColor: isDisabled
                    ? '#e5e7eb'
                    : isComplete ? '#22c55e' : isActive ? baseColor : 'white',
                  borderColor: isDisabled
                    ? '#d1d5db'
                    : isComplete ? '#22c55e' : baseColor,
                  color: isDisabled
                    ? '#9ca3af'
                    : isComplete || isActive ? 'white' : baseColor,
                  ...(isActive && !isComplete && !isDisabled ? { ringColor: baseColor } : {})
                }}
                title={sectionTitle}
                aria-label={ariaLabel}
                aria-current={isActive ? 'step' : undefined}
                aria-disabled={isDisabled}
              >
                {isComplete && !isDisabled ? (
                  <Check className="h-4 w-4" />
                ) : (
                  section.stepNumber
                )}
              </button>
              {index < sections.length - 1 && (
                <div
                  className="w-4 h-0.5 mx-0.5 transition-colors duration-200"
                  style={{
                    backgroundColor: sections[index + 1]?.disabled || isDisabled
                      ? '#e5e7eb'
                      : sections[index + 1]?.isComplete || isComplete ? '#22c55e' : '#d1d5db'
                  }}
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
