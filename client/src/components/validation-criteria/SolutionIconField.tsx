import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LucideIconPicker } from "@/components/ui/lucide-icon-picker";

interface SolutionIconFieldProps {
  /** The chosen lucide icon name, or "" for none. */
  value: string;
  onChange: (iconName: string) => void;
  /** The Criteria Builder's smaller form fields. */
  small?: boolean;
}

/**
 * The Icon field of a solution form: a lucide icon shown wherever the
 * solution has no graphic. A graphic always replaces it.
 */
export function SolutionIconField({ value, onChange, small = false }: SolutionIconFieldProps) {
  const { t } = useTranslation();
  const height = small ? "h-9" : "h-10";
  return (
    <div>
      {small ? (
        <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">{t("successCriteria.solutionMark.icon")}</label>
      ) : (
        <Label className="block">{t("successCriteria.solutionMark.icon")}</Label>
      )}
      <div className="flex items-center gap-1">
        <div className={`flex-1 min-w-0 ${small ? "[&_[data-icon-picker-trigger]]:h-9 [&_[data-icon-picker-trigger]]:text-sm" : ""}`}>
          <LucideIconPicker value={value || undefined} onChange={onChange} align="end" />
        </div>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`${height} w-9 shrink-0`}
            onClick={() => onChange("")}
            title={t("successCriteria.solutionMark.removeIcon")}
            aria-label={t("successCriteria.solutionMark.removeIcon")}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
