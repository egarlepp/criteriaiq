import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDown, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SectionInfo {
  id: string;
  stepNumber: number;
  title: string;
  isComplete: boolean;
  color: string;
  disabled?: boolean;
}

interface QuickJumpDropdownProps {
  sections: SectionInfo[];
  onJumpToSection: (sectionId: string) => void;
}

export function QuickJumpDropdown({ sections, onJumpToSection }: QuickJumpDropdownProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const completedCount = sections.filter(s => s.isComplete).length;
  const totalCount = sections.length;

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
            {completedCount}/{totalCount}
          </span>
          {t('projects.form.jumpToSection')}
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {sections.map((section) => (
          <DropdownMenuItem
            key={section.id}
            onClick={() => {
              onJumpToSection(section.id);
              setIsOpen(false);
            }}
            className="flex items-center gap-3 py-2"
          >
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold"
            style={{
              backgroundColor: section.isComplete
                ? '#22c55e'
                : section.color === 'blue' ? '#3b82f6'
                : section.color === 'purple' ? '#a855f7'
                : section.color === 'green' ? '#22c55e'
                : section.color === 'amber' ? '#f59e0b'
                : section.color === 'red' ? '#ef4444'
                : section.color === 'cyan' ? '#06b6d4'
                : section.color === 'orange' ? '#f97316'
                : section.color === 'brand' ? '#3b0764'
                : section.color === 'forest' ? '#226600'
                : '#3b82f6'
            }}
            >
              {section.isComplete ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                section.stepNumber
              )}
            </div>
            <span className="flex-1 text-sm">{section.title}</span>
            {section.isComplete && (
              <span className="text-xs text-green-600 dark:text-green-400">{t('common.complete')}</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
