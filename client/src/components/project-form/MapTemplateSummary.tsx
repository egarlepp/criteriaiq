import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Waypoints, Trash2, ClipboardPenLine, Boxes, PackageCheck } from "lucide-react";

interface MapTemplateSummaryProps {
  templateName: string;
  description?: string;
  phaseCount?: number;
  stepCount?: number;
  taskCount?: number;
  onDelete: () => void;
}

export function MapTemplateSummary({
  templateName,
  description,
  phaseCount,
  stepCount,
  taskCount,
  onDelete
}: MapTemplateSummaryProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between p-3 border rounded-md bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-md">
          <Waypoints className="h-4 w-4 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {templateName}
            </p>
            <div className="flex items-center gap-3">
              {phaseCount !== undefined && (
                <div className="flex items-center gap-1 text-blue-600">
                  <ClipboardPenLine className="h-4 w-4" />
                  <span className="text-base font-medium">{t("projects.form.phasesCount", { count: phaseCount })}</span>
                </div>
              )}
              {stepCount !== undefined && (
                <div className="flex items-center gap-1 text-blue-600">
                  <Boxes className="h-4 w-4" />
                  <span className="text-base font-medium">{t("projects.form.stepsCount", { count: stepCount })}</span>
                </div>
              )}
              {taskCount !== undefined && (
                <div className="flex items-center gap-1 text-blue-600">
                  <PackageCheck className="h-4 w-4" />
                  <span className="text-base font-medium">{t("projects.form.tasksCount", { count: taskCount })}</span>
                </div>
              )}
            </div>
          </div>
          {description && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {description}
            </p>
          )}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onDelete}
        className="h-8 w-8 p-0 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
        title={t("projects.form.removeSelectedTemplate")}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
