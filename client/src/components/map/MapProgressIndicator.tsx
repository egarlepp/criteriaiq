import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, AlertTriangle, XCircle, Target, BarChart3, TrendingUp, Users, Calendar, AlertCircle, Ambulance, FileChartPie, ClipboardPenLine, Boxes, PackageCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { MapPhase, MapStep, MAP_STATUS_CONFIG, MapAnalytics } from "@/types/map";

interface MapProgressIndicatorProps {
  phases: MapPhase[];
  steps: MapStep[];
  analytics?: MapAnalytics;
  compact?: boolean;
  enhanced?: boolean;
  className?: string;
}

const statusConfig = {
  not_started: { ...MAP_STATUS_CONFIG.not_started, icon: Clock },
  in_progress: { ...MAP_STATUS_CONFIG.in_progress, icon: Target },
  complete: { ...MAP_STATUS_CONFIG.complete, icon: CheckCircle },
  blocked: { ...MAP_STATUS_CONFIG.blocked, icon: AlertTriangle },
  cancelled: { ...MAP_STATUS_CONFIG.cancelled, icon: XCircle }
};

export function MapProgressIndicator({ 
  phases, 
  steps, 
  analytics, 
  compact = false, 
  enhanced = false, 
  className 
}: MapProgressIndicatorProps) {
  const progressStats = useMemo(() => {
    const phaseStats = {
      total: phases.length,
      completed: phases.filter(p => p.status === "complete").length,
      inProgress: phases.filter(p => p.status === "in_progress").length,
      blocked: phases.filter(p => p.status === "blocked").length
    };
    
    const stepStats = {
      total: steps.length,
      completed: steps.filter(s => s.status === "complete").length,
      inProgress: steps.filter(s => s.status === "in_progress").length,
      blocked: steps.filter(s => s.status === "blocked").length
    };
    
    // Use enhanced analytics if available, otherwise fallback to basic calculation
    const overallProgress = analytics 
      ? analytics.overallProgress
      : phaseStats.total > 0 
        ? Math.round((phaseStats.completed / phaseStats.total) * 100)
        : 0;
    
    return {
      phases: phaseStats,
      steps: stepStats,
      overallProgress,
      hasSteps: stepStats.total > 0,
      analytics
    };
  }, [phases, steps, analytics]);

  if (compact) {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <BarChart3 className="h-4 w-4 text-blue-600" />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="text-sm font-medium">
              {progressStats.overallProgress}% Complete
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {progressStats.phases.completed}/{progressStats.phases.total} phases
            </div>
          </div>
        </div>
        <Progress value={progressStats.overallProgress} className="flex-1 h-2" />
      </div>
    );
  }

  // Enhanced analytics view
  if (enhanced && analytics) {
    return (
      <div className={cn("space-y-4", className)}>
        {/* Main Progress Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileChartPie className="h-4 w-4" />
              Enhanced MAP Analytics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Weighted Progress */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Weighted Progress</span>
                <span className="text-sm text-gray-600 dark:text-gray-400">{analytics.overallProgress}%</span>
              </div>
              <Progress value={analytics.overallProgress} className="h-3" />
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Based on phases (40%), steps (35%), and tasks (25%)
              </div>
            </div>

            {/* Completion Summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-lg font-semibold text-green-600 flex items-center justify-center gap-2">
                  <ClipboardPenLine className="h-5 w-5" />
                  {analytics.completion.phases.completed}/{analytics.completion.phases.total}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Phases</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-blue-600 flex items-center justify-center gap-2">
                  <Boxes className="h-5 w-5" />
                  {analytics.completion.steps.completed}/{analytics.completion.steps.total}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Steps</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-purple-600 flex items-center justify-center gap-2">
                  <PackageCheck className="h-5 w-5" />
                  {analytics.completion.tasks.completed}/{analytics.completion.tasks.total}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Tasks</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Analytics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Timeline Analytics */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Ambulance className="h-4 w-4" />
                Timeline Health
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600 dark:text-gray-400">Overdue Tasks</span>
                <Badge variant={analytics.timeline.overdueTasks > 0 ? "destructive" : "secondary"} className="text-xs">
                  {analytics.timeline.overdueTasks}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600 dark:text-gray-400">Upcoming Deadlines</span>
                <Badge variant={analytics.timeline.upcomingDeadlines > 3 ? "default" : "secondary"} className="text-xs">
                  {analytics.timeline.upcomingDeadlines}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600 dark:text-gray-400">At Risk Items</span>
                <Badge variant={analytics.timeline.atRiskItems > 0 ? "destructive" : "secondary"} className="text-xs">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  {analytics.timeline.atRiskItems}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Assignment Analytics */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4" />
                Task Assignments
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600 dark:text-gray-400">Assignment Rate</span>
                <span className="text-sm font-medium">{analytics.assignments.assignmentRate}%</span>
              </div>
              <Progress value={analytics.assignments.assignmentRate} className="h-2" />
              <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                <span>{analytics.assignments.assignedTasks} assigned</span>
                <span>{analytics.assignments.unassignedTasks} unassigned</span>
              </div>
            </CardContent>
          </Card>

          {/* Performance Metrics */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Performance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600 dark:text-gray-400">Completion Rate</span>
                <span className="text-sm font-medium">{analytics.performance.completionRate}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600 dark:text-gray-400">Recent Completions</span>
                <Badge variant="secondary" className="text-xs">
                  {analytics.performance.recentCompletions} this week
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600 dark:text-gray-400">Blocked Items</span>
                <Badge variant={analytics.performance.blockedItems > 0 ? "destructive" : "secondary"} className="text-xs">
                  {analytics.performance.blockedItems}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Risk Indicators */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Risk Indicators
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {analytics.riskIndicators.hasOverdueTasks && (
                <Badge variant="destructive" className="text-xs w-full justify-center">
                  Overdue Tasks Present
                </Badge>
              )}
              {analytics.riskIndicators.hasBlockedItems && (
                <Badge variant="destructive" className="text-xs w-full justify-center">
                  Blocked Items
                </Badge>
              )}
              {analytics.riskIndicators.lowAssignmentRate && (
                <Badge variant="default" className="text-xs w-full justify-center">
                  Low Assignment Rate
                </Badge>
              )}
              {analytics.riskIndicators.manyUpcomingDeadlines && (
                <Badge variant="default" className="text-xs w-full justify-center">
                  Many Upcoming Deadlines
                </Badge>
              )}
              {!analytics.riskIndicators.hasOverdueTasks && 
               !analytics.riskIndicators.hasBlockedItems && 
               !analytics.riskIndicators.lowAssignmentRate && 
               !analytics.riskIndicators.manyUpcomingDeadlines && (
                <Badge variant="secondary" className="text-xs w-full justify-center text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  All Clear
                </Badge>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          MAP Progress Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Overall Progress</span>
            <span className="text-sm text-gray-600 dark:text-gray-400">{progressStats.overallProgress}%</span>
          </div>
          <Progress value={progressStats.overallProgress} className="h-2" />
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Phases ({progressStats.phases.total})</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <div className={cn("w-3 h-3 rounded-full", statusConfig.complete.color)} />
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {progressStats.phases.completed} Completed
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className={cn("w-3 h-3 rounded-full", statusConfig.in_progress.color)} />
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {progressStats.phases.inProgress} In Progress
              </span>
            </div>
            {progressStats.phases.blocked > 0 && (
              <div className="flex items-center gap-2">
                <div className={cn("w-3 h-3 rounded-full", statusConfig.blocked.color)} />
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {progressStats.phases.blocked} Blocked
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className={cn("w-3 h-3 rounded-full", statusConfig.not_started.color)} />
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {progressStats.phases.total - progressStats.phases.completed - progressStats.phases.inProgress - progressStats.phases.blocked} Not Started
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {progressStats.phases.completed > 0 && (
            <Badge variant="secondary" className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800">
              <CheckCircle className="h-3 w-3 mr-1" />
              {progressStats.phases.completed} Done
            </Badge>
          )}
          {progressStats.phases.inProgress > 0 && (
            <Badge variant="secondary" className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">
              <Target className="h-3 w-3 mr-1" />
              {progressStats.phases.inProgress} Active
            </Badge>
          )}
          {progressStats.phases.blocked > 0 && (
            <Badge variant="secondary" className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {progressStats.phases.blocked} Blocked
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}