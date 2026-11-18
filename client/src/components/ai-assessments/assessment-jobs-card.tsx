import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Calendar,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Play,
  Repeat,
} from "lucide-react";

interface AssessmentJob {
  id: number;
  type: string;
  status: string;
  rulesetId: number | null;
  rulesetName: string | null;
  projectIds: number[] | null;
  totalProjects: number | null;
  successCount: number | null;
  failedCount: number | null;
  results: any;
  triggeredBy: string | null;
  scheduleId: number | null;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

interface Schedule {
  id: number;
  actionType: string;
  ruleId: number | null;
  ruleName: string | null;
  actionConfig: any;
  rrule: string | null;
  cron: string | null;
  timezone: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  active: boolean;
  metadata: any;
}

interface AssessmentJobsCardProps {
  selectedJobId: number | null;
  onJobSelect: (jobId: number | null, projectIds: number[] | null) => void;
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

function timeUntil(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = date.getTime() - now.getTime();
  if (diffMs <= 0) return "overdue";
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `in ${diffMins}m`;
  if (diffHours < 24) return `in ${diffHours}h`;
  if (diffDays < 7) return `in ${diffDays}d`;
  return date.toLocaleDateString();
}

function parseFrequencyFromCron(cron: string | null): string {
  if (!cron) return "Custom";
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return "Custom";
  const [min, hour, dom, , dow] = parts;

  if (min.includes("/") || hour.includes("/")) {
    const minInterval = min.match(/\*\/(\d+)/);
    const hourInterval = hour.match(/\*\/(\d+)/);
    if (minInterval) return `Every ${minInterval[1]}min`;
    if (hourInterval) return `Every ${hourInterval[1]}h`;
  }

  if (dom !== "*" && dow === "*") {
    return "Monthly";
  }
  if (dow !== "*" && dom === "*") {
    return "Weekly";
  }
  if (dom === "*" && dow === "*" && hour !== "*") {
    return "Daily";
  }
  if (hour === "*" && dom === "*" && dow === "*") {
    return "Hourly";
  }
  return "Custom";
}

function parseFrequencyFromRrule(rrule: string | null): string {
  if (!rrule) return "Custom";
  const freqMatch = rrule.match(/FREQ=(\w+)/);
  const intervalMatch = rrule.match(/INTERVAL=(\d+)/);
  const freq = freqMatch?.[1] || "";
  const interval = parseInt(intervalMatch?.[1] || "1");

  switch (freq) {
    case "DAILY":
      return interval === 1 ? "Daily" : `Every ${interval} days`;
    case "WEEKLY":
      return interval === 1 ? "Weekly" : `Every ${interval} weeks`;
    case "MONTHLY":
      return interval === 1 ? "Monthly" : `Every ${interval} months`;
    case "HOURLY":
      return interval === 1 ? "Hourly" : `Every ${interval} hours`;
    default:
      return "Custom";
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-green-500 dark:text-green-400" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-500 dark:text-red-400" />;
    case "running":
      return <Loader2 className="h-4 w-4 text-blue-500 dark:text-blue-400 animate-spin" />;
    case "pending":
      return <Clock className="h-4 w-4 text-gray-400 dark:text-gray-500" />;
    default:
      return <Clock className="h-4 w-4 text-gray-400 dark:text-gray-500" />;
  }
}

function JobRow({
  job,
  selectedJobId,
  onJobSelect,
}: {
  job: AssessmentJob;
  selectedJobId: number | null;
  onJobSelect: (jobId: number | null, projectIds: number[] | null) => void;
}) {
  return (
    <div
      onClick={() => {
        onJobSelect(
          selectedJobId === job.id ? null : job.id,
          selectedJobId === job.id ? null : (job.projectIds || [])
        );
      }}
      className={`flex items-start gap-2.5 p-2.5 rounded-md cursor-pointer transition-colors border ${
        selectedJobId === job.id
          ? "border-blue-500 dark:border-blue-400 bg-blue-100/80 dark:bg-blue-900/30"
          : "border-blue-300 dark:border-blue-600 bg-blue-100/60 dark:bg-blue-900/25 hover:bg-blue-100 dark:hover:bg-blue-900/40"
      }`}
    >
      <div className="shrink-0 pt-0.5">
        {getStatusIcon(job.status)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
            {job.rulesetName || "Default Criteria"}
          </span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {job.totalProjects !== null
            ? `${job.successCount || 0}/${job.totalProjects} projects`
            : "Projects analyzed"}
        </p>
        <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 mt-0.5">
          <Clock className="h-3 w-3" />
          {timeAgo(job.createdAt)}
        </div>
      </div>
      <div className="flex flex-col gap-0.5 shrink-0">
        {job.successCount !== null && job.successCount > 0 && (
          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs px-1.5 py-0">
            {job.successCount}
          </Badge>
        )}
        {job.failedCount !== null && job.failedCount > 0 && (
          <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-xs px-1.5 py-0">
            {job.failedCount}
          </Badge>
        )}
      </div>
    </div>
  );
}

function ScheduleSection({
  schedule,
  jobs,
  selectedJobId,
  onJobSelect,
}: {
  schedule: Schedule;
  jobs: AssessmentJob[];
  selectedJobId: number | null;
  onJobSelect: (jobId: number | null, projectIds: number[] | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const frequency = schedule.cron ? parseFrequencyFromCron(schedule.cron) : parseFrequencyFromRrule(schedule.rrule);
  const rulesetName = schedule.actionConfig?.rulesetName
    || jobs.find(j => j.rulesetName)?.rulesetName
    || (schedule.actionConfig?.rulesetId ? "Custom Ruleset" : "Default Criteria");

  return (
    <div className="border border-purple-300 dark:border-purple-600 rounded-lg overflow-hidden bg-purple-100/60 dark:bg-purple-900/30">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 p-3 text-left hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0" />
        )}
        <Repeat className="h-4 w-4 text-purple-500 dark:text-purple-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {rulesetName}
            </span>
            <Badge
              variant="outline"
              className="text-xs shrink-0 border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-400"
            >
              {frequency}
            </Badge>
            {schedule.active ? (
              <Badge className="text-xs shrink-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-1.5 py-0">
                Active
              </Badge>
            ) : (
              <Badge className="text-xs shrink-0 bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500 px-1.5 py-0">
                Paused
              </Badge>
            )}
          </div>
          {schedule.nextRunAt && schedule.active && (
            <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
              <CalendarClock className="h-3 w-3" />
              Next run {timeUntil(schedule.nextRunAt)}
            </div>
          )}
          {schedule.lastRunAt && (
            <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
              <Clock className="h-3 w-3" />
              Last ran {timeAgo(schedule.lastRunAt)}
            </div>
          )}
        </div>
        {jobs.length > 0 && (
          <Badge
            variant="outline"
            className="text-xs shrink-0 dark:border-gray-600 dark:text-gray-400"
          >
            {jobs.length} run{jobs.length !== 1 ? "s" : ""}
          </Badge>
        )}
      </button>

      {expanded && (
        <div className="border-t border-purple-200 dark:border-purple-700 bg-purple-50/50 dark:bg-purple-950/20">
          <div className="px-3 py-2 space-y-1.5">
            {schedule.actionConfig?.projectScope && (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium text-gray-600 dark:text-gray-300">Scope:</span>{" "}
                {schedule.actionConfig.projectScope === "all" ? "All projects" :
                 schedule.actionConfig.projectScope === "never_analyzed" ? "Never analyzed" :
                 schedule.actionConfig.projectScope === "stale" ? "Stale (7+ days)" :
                 schedule.actionConfig.projectScope}
              </div>
            )}
            {schedule.actionConfig?.maxProjects && (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium text-gray-600 dark:text-gray-300">Max projects:</span>{" "}
                {schedule.actionConfig.maxProjects}
              </div>
            )}
            {schedule.timezone && (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium text-gray-600 dark:text-gray-300">Timezone:</span>{" "}
                {schedule.timezone}
              </div>
            )}
          </div>

          {jobs.length > 0 ? (
            <div className="px-3 pb-2 space-y-1.5">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-300 pt-1 border-t border-gray-200 dark:border-gray-700">
                Previous Runs
              </p>
              {jobs.map((job) => (
                <JobRow
                  key={job.id}
                  job={job}
                  selectedJobId={selectedJobId}
                  onJobSelect={onJobSelect}
                />
              ))}
            </div>
          ) : (
            <div className="px-3 pb-3 pt-1">
              <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                No runs yet — waiting for next scheduled execution
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AssessmentJobsCard({
  selectedJobId,
  onJobSelect,
}: AssessmentJobsCardProps) {
  const [, setLocation] = useLocation();
  const { data: jobs = [], isLoading: jobsLoading } = useQuery<AssessmentJob[]>({
    queryKey: ["/api/assessment-jobs"],
  });

  const { data: schedulesData, isLoading: schedulesLoading } = useQuery<{ schedules: Schedule[] }>({
    queryKey: ["/api/email-automation/schedules"],
  });

  const isLoading = jobsLoading || schedulesLoading;
  const allSchedules = schedulesData?.schedules || [];
  const assessmentSchedules = allSchedules.filter(s => s.actionType === "ai_assessment_analysis");

  const scheduledJobs = jobs.filter(j => j.type === "scheduled");
  const manualJobs = jobs.filter(j => j.type === "one_off");

  const scheduleJobMap = new Map<number, AssessmentJob[]>();
  const orphanedScheduledJobs: AssessmentJob[] = [];

  for (const job of scheduledJobs) {
    if (job.scheduleId && assessmentSchedules.some(s => s.id === job.scheduleId)) {
      const existing = scheduleJobMap.get(job.scheduleId) || [];
      existing.push(job);
      scheduleJobMap.set(job.scheduleId, existing);
    } else {
      orphanedScheduledJobs.push(job);
    }
  }

  const totalItems = assessmentSchedules.length + manualJobs.length + orphanedScheduledJobs.length;
  const hasContent = totalItems > 0;

  return (
    <Card className="relative overflow-hidden bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
      <DecorativeCardIcon icon={Calendar} />

      <CardHeader className="pb-3 relative z-10">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100 text-2xl">
              <ClipboardList className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Assessment Jobs
            </CardTitle>
            <CardDescription className="text-gray-500 dark:text-gray-400 mt-1.5">
              {isLoading
                ? "Loading..."
                : `${assessmentSchedules.length} schedule${assessmentSchedules.length !== 1 ? "s" : ""} · ${jobs.length} run${jobs.length !== 1 ? "s" : ""}`}
            </CardDescription>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 p-0 shrink-0"
                onClick={() => setLocation("/admin?tab=scheduler")}
              >
                <CalendarClock className="!h-5 !w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>View all schedules in Configuration › Scheduler</TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>

      <CardContent className="p-0 relative z-10">
        {isLoading ? (
          <div className="px-4 py-4 space-y-3 h-96">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : !hasContent ? (
          <div className="px-4 py-12 text-center min-h-96 flex items-center justify-center">
            <div>
              <Calendar className="h-12 w-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-gray-900 dark:text-gray-100 font-medium mb-1">
                No assessment jobs yet
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Run an analysis or create a schedule to see jobs here
              </p>
            </div>
          </div>
        ) : (
          <ScrollArea className="h-96">
            <div className="space-y-3 px-4 py-3">
              {assessmentSchedules.length > 0 && (
                <div className="space-y-2 bg-purple-50/50 dark:bg-purple-950/20 border border-purple-400 dark:border-purple-700 rounded-lg p-3">
                  <div className="flex items-center gap-2 px-1">
                    <CalendarClock className="h-3.5 w-3.5 text-purple-500 dark:text-purple-400" />
                    <span className="text-xs font-semibold text-purple-700 dark:text-purple-400 uppercase tracking-wider">
                      Scheduled
                    </span>
                  </div>
                  {assessmentSchedules.map((schedule) => (
                    <ScheduleSection
                      key={schedule.id}
                      schedule={schedule}
                      jobs={(scheduleJobMap.get(schedule.id) || []).sort(
                        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                      )}
                      selectedJobId={selectedJobId}
                      onJobSelect={onJobSelect}
                    />
                  ))}
                </div>
              )}

              {(manualJobs.length > 0 || orphanedScheduledJobs.length > 0) && (
                <div className="space-y-2 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-400 dark:border-blue-700 rounded-lg p-3">
                  <div className="flex items-center gap-2 px-1">
                    <Play className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
                    <span className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wider">
                      Manual Runs
                    </span>
                  </div>
                  {[...orphanedScheduledJobs, ...manualJobs]
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map((job) => (
                      <JobRow
                        key={job.id}
                        job={job}
                        selectedJobId={selectedJobId}
                        onJobSelect={onJobSelect}
                      />
                    ))}
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        {selectedJobId !== null && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 relative z-10">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onJobSelect(null, null)}
              className="w-full text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            >
              Clear Filter
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
