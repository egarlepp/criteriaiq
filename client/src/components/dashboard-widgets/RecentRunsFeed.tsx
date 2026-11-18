import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { History, Clock, BrainCircuit } from "lucide-react";
import { AI_PROVIDER_ICONS, AI_PROVIDER_COLORS } from "@/components/icons/ai-provider-icons";

interface RecentRun {
  id: number;
  projectId: number;
  projectName: string;
  customerName: string;
  overallRiskScore: string;
  riskLevel: string;
  aiProvider: string | null;
  aiModel: string | null;
  confidence: string | null;
  createdAt: string;
}

interface RecentRunsFeedProps {
  className?: string;
  onProjectClick?: (projectId: number) => void;
}

function getRiskColor(level: string): string {
  switch (level) {
    case "low":
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "medium":
      return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "high":
      return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
    case "critical":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    default:
      return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400";
  }
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function RecentRunsFeed({ className = "", onProjectClick }: RecentRunsFeedProps) {
  const { data: recentRuns = [], isLoading } = useQuery<RecentRun[]>({
    queryKey: ["/api/risk/recent-runs"],
    staleTime: 60 * 1000,
  });

  return (
    <Card className={`${className}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <History className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Recent Project Assessment Runs</h3>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : recentRuns.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">No analysis runs yet</p>
        ) : (
          <div className="space-y-1.5">
            {recentRuns.map((run) => {
              const score = Math.round(parseFloat(run.overallRiskScore));
              const providerKey = run.aiProvider;
              const ProviderIcon = providerKey ? AI_PROVIDER_ICONS[providerKey] : null;
              const providerColors = providerKey ? AI_PROVIDER_COLORS[providerKey] : null;

              return (
                <div
                  key={run.id}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors bg-gray-50 dark:bg-gray-800/50 ${
                    onProjectClick ? "cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" : ""
                  }`}
                  onClick={() => onProjectClick?.(run.projectId)}
                >
                  {ProviderIcon && providerColors ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className={`flex items-center justify-center h-6 w-6 rounded ${providerColors.bgColor} shrink-0`}>
                          <ProviderIcon className="h-3 w-3" style={{ color: providerColors.color }} />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="text-xs capitalize">{providerKey?.replace("_", " ")}{run.aiModel ? ` · ${run.aiModel}` : ""}</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <div className="flex items-center justify-center h-6 w-6 rounded bg-gray-100 dark:bg-gray-700 shrink-0">
                      <BrainCircuit className="h-3 w-3 text-gray-400 dark:text-gray-500" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                      {run.projectName || run.customerName}
                    </p>
                    <div className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500">
                      <Clock className="h-2.5 w-2.5" />
                      {timeAgo(run.createdAt)}
                    </div>
                  </div>

                  <Badge className={`text-[10px] px-1.5 py-0 shrink-0 ${getRiskColor(run.riskLevel)}`}>
                    R-Index: {score}%
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
