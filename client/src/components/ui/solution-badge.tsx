import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Star } from "lucide-react";
import { SolutionGraphic } from "@/components/ui/solution-graphic";

interface SolutionBadgeProps {
  solutionName: string;
  solutionIcon?: string | null;
  /** Lucide icon shown when there is no graphic. */
  solutionIconName?: string | null;
  className?: string;
}

interface AllSolutionsBadgeProps {
  className?: string;
}

export function AllSolutionsBadge({ className = "" }: AllSolutionsBadgeProps) {
  return (
    <Badge 
      variant="outline" 
      className={`text-xs bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/80 dark:text-blue-400 dark:border-blue-800 ${className}`}
    >
      <div className="flex items-center gap-1">
        <Star className="h-3 w-3" />
        <span>All Solutions</span>
      </div>
    </Badge>
  );
}

export function SolutionBadge({ solutionName, solutionIcon, solutionIconName, className = "" }: SolutionBadgeProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge 
          variant="outline" 
          className={`text-xs max-w-full min-w-0 shrink
            bg-blue-50 text-blue-600 border-blue-200 
            dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800
            ${className}`}
        >
          <div className="flex items-center gap-1 min-w-0">
            <SolutionGraphic graphic={solutionIcon} icon={solutionIconName} name={solutionName} className="w-4 h-4" />
            <span className="truncate">{solutionName}</span>
          </div>
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top">
        {solutionName}
      </TooltipContent>
    </Tooltip>
  );
}
