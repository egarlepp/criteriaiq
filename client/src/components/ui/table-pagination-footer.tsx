import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface TablePaginationFooterProps {
  totalItems: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  entityLabel?: string;
  /** Replaces the "Showing X to Y of Z items" text (pass it already translated). */
  summary?: string;
  className?: string;
}

function toTitleCase(str: string): string {
  return str
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function TablePaginationFooter({
  totalItems,
  pageSize,
  currentPage,
  onPageChange,
  entityLabel = "items",
  summary,
  className = "",
}: TablePaginationFooterProps) {
  const { t } = useTranslation();
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const displayStart = totalItems === 0 ? 0 : startIndex + 1;
  const formattedEntityLabel = toTitleCase(entityLabel);

  return (
    <div className={`flex items-center justify-end p-3 border-t dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 gap-4 ${className}`}>
      {totalPages > 1 && (
        <div className="flex space-x-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="default"
                size="sm"
                className="h-7 px-2.5 text-xs"
                disabled={currentPage === 1}
                onClick={() => onPageChange(currentPage - 1)}
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                {t("common.previous")}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {t("common.pagination.previousPage")}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="default"
                size="sm"
                className="h-7 px-2.5 text-xs"
                disabled={currentPage === totalPages}
                onClick={() => onPageChange(currentPage + 1)}
              >
                {t("common.next")}
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{t("common.pagination.nextPage")}</TooltipContent>
          </Tooltip>
        </div>
      )}
      <div className="text-sm font-medium text-slate-600 dark:text-slate-400">
        {summary ?? `Showing ${displayStart} to ${endIndex} of ${totalItems} ${formattedEntityLabel}`}
      </div>
    </div>
  );
}
