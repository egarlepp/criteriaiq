import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Users, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  TrendingUp,
  TrendingDown,
  Scale,
  Calendar,
  Target,
  UserCheck,
  UserX
} from "lucide-react";
import { useMapAssignmentAnalytics } from "@/hooks/useMapAssignmentAnalytics";
import { AssignmentAnalytics, UserWorkload } from "@/types/map";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface MapAssignmentTrackerProps {
  projectId: number;
  className?: string;
}

// "Upcoming" counts items due within this many working days (server/services/map-scheduling.ts).
const UPCOMING_WORKING_DAYS = 5;
// "Recent" counts assignments changed in the last this many days.
const RECENT_DAYS = 7;
const TK = 'projects.form.mapDrawer.assignmentTracker';

export function MapAssignmentTracker({ projectId, className }: MapAssignmentTrackerProps) {
  const { t } = useTranslation();
  const { data: analytics, isLoading, error } = useMapAssignmentAnalytics(projectId);

  if (isLoading) {
    return (
      <div className={cn("space-y-4", className)}>
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <Alert variant="destructive" className={className}>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          {t(`${TK}.loadFailed`)}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Assignment Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <AssignmentMetricCard
          title={t(`${TK}.totalUsers`)}
          value={analytics.distributionMetrics.totalUsers}
          icon={<Users className="h-4 w-4" />}
          color="blue"
        />
        <AssignmentMetricCard
          title={t(`${TK}.totalAssignments`)}
          value={analytics.distributionMetrics.totalAssignments}
          icon={<Target className="h-4 w-4" />}
          color="green"
        />
        <AssignmentMetricCard
          title={t(`${TK}.balanceScore`)}
          value={`${Math.round(analytics.distributionMetrics.balanceScore)}%`}
          icon={<Scale className="h-4 w-4" />}
          color={analytics.distributionMetrics.balanceScore >= 80 ? "green" : 
                analytics.distributionMetrics.balanceScore >= 60 ? "yellow" : "red"}
        />
        <AssignmentMetricCard
          title={t(`${TK}.completionRate`)}
          value={`${analytics.assignmentTimeline.completionRate}%`}
          icon={<CheckCircle className="h-4 w-4" />}
          color={analytics.assignmentTimeline.completionRate >= 80 ? "green" : 
                analytics.assignmentTimeline.completionRate >= 60 ? "yellow" : "red"}
        />
      </div>

      {/* Workload Balance Alert */}
      {!analytics.workloadBalance.isBalanced && (
        <WorkloadBalanceAlert balance={analytics.workloadBalance} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Workload Distribution */}
        <UserWorkloadChart workloads={analytics.userWorkloads} />
        
        {/* Entity Distribution */}
        <EntityDistributionChart distribution={analytics.entityDistribution} />
      </div>

      {/* Detailed User Workloads */}
      <UserWorkloadTable 
        workloads={analytics.userWorkloads}
        averageWorkload={analytics.distributionMetrics.averageWorkload}
      />

      {/* Assignment Timeline */}
      <AssignmentTimelineCard timeline={analytics.assignmentTimeline} />
    </div>
  );
}

// Helper Components

interface AssignmentMetricCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'yellow' | 'red';
}

function AssignmentMetricCard({ title, value, icon, color }: AssignmentMetricCardProps) {
  const colorClasses = {
    blue: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",
    green: "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800",
    yellow: "text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800",
    red: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
  };

  return (
    <Card className={cn("border", colorClasses[color])}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function WorkloadBalanceAlert({ balance }: { balance: AssignmentAnalytics['workloadBalance'] }) {
  const { t } = useTranslation();
  const hasOverloaded = balance.overloadedUsers.length > 0;
  const hasUnderloaded = balance.underloadedUsers.length > 0;

  return (
    <Alert variant={hasOverloaded ? "destructive" : "default"} className="border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription>
        <div className="space-y-2">
          <p className="font-medium">{t(`${TK}.imbalanceTitle`)}</p>
          {hasOverloaded && (
            <div className="flex items-center gap-2">
              <TrendingUp className="h-3 w-3 text-red-500 dark:text-red-400" />
              <span className="text-sm">
                {t(`${TK}.overloaded`, { names: balance.overloadedUsers.map(u => u.name).join(', ') })}
              </span>
            </div>
          )}
          {hasUnderloaded && (
            <div className="flex items-center gap-2">
              <TrendingDown className="h-3 w-3 text-blue-500 dark:text-blue-400" />
              <span className="text-sm">
                {t(`${TK}.underloaded`, { names: balance.underloadedUsers.map(u => u.name).join(', ') })}
              </span>
            </div>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}

function UserWorkloadChart({ workloads }: { workloads: UserWorkload[] }) {
  const { t } = useTranslation();
  const maxWorkload = Math.max(...workloads.map(w => w.totalAssignments), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" />
          {t(`${TK}.workloadTitle`)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {workloads.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t(`${TK}.noAssignments`)}</p>
        ) : (
          workloads.map((workload, index) => (
            <div key={workload.user.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-xs">
                      {`${workload.user.firstName?.[0] || ''}${workload.user.lastName?.[0] || ''}`.trim() || (workload.user.email?.[0] ?? "?").toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">
                    {`${workload.user.firstName || ''} ${workload.user.lastName || ''}`.trim() || workload.user.email}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {workload.totalAssignments}
                  </Badge>
                  {workload.overdueItems > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {t(`${TK}.overdueCount`, { count: workload.overdueItems })}
                    </Badge>
                  )}
                </div>
              </div>
              <Progress 
                value={(workload.totalAssignments / maxWorkload) * 100} 
                className="h-2"
              />
              <div className="grid grid-cols-3 gap-2 text-xs text-gray-600 dark:text-gray-400">
                <span>{t(`${TK}.phaseShort`, { count: workload.phases })}</span>
                <span>{t(`${TK}.stepShort`, { count: workload.steps })}</span>
                <span>{t(`${TK}.taskShort`, { count: workload.tasks })}</span>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function EntityDistributionChart({ distribution }: { distribution: AssignmentAnalytics['entityDistribution'] }) {
  const { t } = useTranslation();
  const entities = [
    // Phase 8 followup: canonical Phase/Step/Task color triplet
    // (purple, blue, green) shared with MapActivityTimeline.
    { key: 'phases', name: t(`${TK}.phases`), ...distribution.phases, color: 'bg-purple-500 dark:bg-purple-600' },
    { key: 'steps', name: t(`${TK}.steps`), ...distribution.steps, color: 'bg-blue-500 dark:bg-blue-600' },
    { key: 'tasks', name: t(`${TK}.tasks`), ...distribution.tasks, color: 'bg-green-500 dark:bg-green-600' }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="h-4 w-4" />
          {t(`${TK}.distributionTitle`)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {entities.map((entity) => (
          <div key={entity.key} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{entity.name}</span>
              <div className="flex items-center gap-2">
                <UserCheck className="h-3 w-3 text-green-600 dark:text-green-400" />
                <span className="text-xs">{entity.assigned}</span>
                <UserX className="h-3 w-3 text-gray-400 dark:text-gray-500" />
                <span className="text-xs">{entity.unassigned}</span>
              </div>
            </div>
            <div className="flex gap-1 h-2 bg-gray-100 dark:bg-gray-800 rounded">
              <div 
                className={cn(entity.color, "rounded-l")}
                style={{ 
                  width: `${entity.total > 0 ? (entity.assigned / entity.total) * 100 : 0}%` 
                }}
              />
              <div 
                className="bg-gray-300 dark:bg-gray-600 rounded-r"
                style={{ 
                  width: `${entity.total > 0 ? (entity.unassigned / entity.total) * 100 : 0}%` 
                }}
              />
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">
              {t(`${TK}.percentAssigned`, {
                percent: entity.total > 0 ? Math.round((entity.assigned / entity.total) * 100) : 0,
                assigned: entity.assigned,
                total: entity.total,
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function UserWorkloadTable({ 
  workloads, 
  averageWorkload 
}: { 
  workloads: UserWorkload[];
  averageWorkload: number;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t(`${TK}.detailTitle`)}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b dark:border-gray-700">
                <th className="text-left p-2">{t(`${TK}.colUser`)}</th>
                <th className="text-right p-2">{t(`${TK}.colTotal`)}</th>
                <th className="text-right p-2">{t(`${TK}.colPhases`)}</th>
                <th className="text-right p-2">{t(`${TK}.colSteps`)}</th>
                <th className="text-right p-2">{t(`${TK}.colTasks`)}</th>
                <th className="text-right p-2">{t(`${TK}.colCompleted`)}</th>
                <th className="text-right p-2">{t(`${TK}.colOverdue`)}</th>
                <th className="text-right p-2">{t(`${TK}.colUpcoming`)}</th>
                <th className="text-right p-2">{t(`${TK}.colLoad`)}</th>
              </tr>
            </thead>
            <tbody>
              {workloads.map((workload) => {
                const loadRatio = workload.totalAssignments / Math.max(averageWorkload, 1);
                const loadColor = loadRatio > 1.5 ? 'text-red-600 dark:text-red-400' :
                                loadRatio < 0.5 ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400';
                
                return (
                  <tr key={workload.user.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs">
                            {`${workload.user.firstName?.[0] || ''}${workload.user.lastName?.[0] || ''}`.trim() || (workload.user.email?.[0] ?? "?").toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">
                            {`${workload.user.firstName || ''} ${workload.user.lastName || ''}`.trim() || workload.user.email}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{workload.user.isTeam ? t("mapPlan.assign.teamBadge") : workload.user.role}</div>
                        </div>
                      </div>
                    </td>
                    <td className="text-right p-2 font-semibold">{workload.totalAssignments}</td>
                    <td className="text-right p-2">{workload.phases}</td>
                    <td className="text-right p-2">{workload.steps}</td>
                    <td className="text-right p-2">{workload.tasks}</td>
                    <td className="text-right p-2 text-green-600 dark:text-green-400">{workload.completedItems}</td>
                    <td className="text-right p-2">
                      {workload.overdueItems > 0 ? (
                        <Badge variant="destructive" className="text-xs">
                          {workload.overdueItems}
                        </Badge>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="text-right p-2">
                      {workload.upcomingDeadlines > 0 ? (
                        <Badge variant="outline" className="text-xs">
                          {workload.upcomingDeadlines}
                        </Badge>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className={cn("text-right p-2 font-medium", loadColor)}>
                      {Math.round(loadRatio * 100)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function AssignmentTimelineCard({ timeline }: { timeline: AssignmentAnalytics['assignmentTimeline'] }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          {t(`${TK}.timelineTitle`)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">{timeline.recentAssignments}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{t(`${TK}.recentDays`, { count: RECENT_DAYS })}</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-green-600 dark:text-green-400">{timeline.completionRate}%</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{t(`${TK}.completionRate`)}</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-red-600 dark:text-red-400">{timeline.totalOverdueItems}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{t(`${TK}.overdueItems`)}</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-yellow-600 dark:text-yellow-400">{timeline.totalUpcomingDeadlines}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{t(`${TK}.upcomingWorkingDays`, { count: UPCOMING_WORKING_DAYS })}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}