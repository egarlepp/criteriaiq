import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, ClipboardPenLine, Boxes, Filter, PackageCheck } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, parseISO, isWithinInterval } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import type { ProjectMapData, MapPhase, MapStep, MapTask } from "@/types/map";

interface MapCalendarTimelineProps {
  projectId: number;
}

type FilterType = "phases" | "steps" | "tasks";

interface DateCounts {
  [dateKey: string]: {
    phases: { start: number; end: number };
    steps: { start: number; end: number };
    tasks: { start: number; end: number };
  };
}

export function MapCalendarTimeline({ projectId }: MapCalendarTimelineProps) {
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [selectedFilters, setSelectedFilters] = useState<FilterType[]>(["phases", "steps", "tasks"]);

  // Fetch project data to get project startDate and endDate
  const { data: project } = useQuery<any>({
    queryKey: ["/api/projects", projectId],
    queryFn: async () => apiRequest("GET", `/api/projects/${projectId}`),
    enabled: Boolean(projectId),
  });

  // Fetch MAP data
  const { data: mapData, isLoading } = useQuery<ProjectMapData>({
    queryKey: ["/api/projects", projectId, "map"],
    queryFn: async () => apiRequest("GET", `/api/projects/${projectId}/map`),
    enabled: Boolean(projectId),
  });

  // Calculate counts of phases/steps/tasks starting/ending on each date
  const dateCounts = useMemo<DateCounts>(() => {
    const counts: DateCounts = {};

    if (!mapData) return counts;

    const initDateEntry = (dateKey: string) => {
      if (!counts[dateKey]) {
        counts[dateKey] = {
          phases: { start: 0, end: 0 },
          steps: { start: 0, end: 0 },
          tasks: { start: 0, end: 0 },
        };
      }
    };

    // Count phases
    mapData.phases?.forEach((phase: MapPhase) => {
      if (phase.startDate) {
        const dateKey = format(parseISO(phase.startDate), 'yyyy-MM-dd');
        initDateEntry(dateKey);
        counts[dateKey].phases.start++;
      }
      if (phase.dueDate) {
        const dateKey = format(parseISO(phase.dueDate), 'yyyy-MM-dd');
        initDateEntry(dateKey);
        counts[dateKey].phases.end++;
      }
    });

    // Count steps
    mapData.steps?.forEach((step: MapStep) => {
      if (step.startDate) {
        const dateKey = format(parseISO(step.startDate), 'yyyy-MM-dd');
        initDateEntry(dateKey);
        counts[dateKey].steps.start++;
      }
      if (step.dueDate) {
        const dateKey = format(parseISO(step.dueDate), 'yyyy-MM-dd');
        initDateEntry(dateKey);
        counts[dateKey].steps.end++;
      }
    });

    // Count tasks
    mapData.tasks?.forEach((task: MapTask) => {
      if (task.startDate) {
        const dateKey = format(parseISO(task.startDate), 'yyyy-MM-dd');
        initDateEntry(dateKey);
        counts[dateKey].tasks.start++;
      }
      if (task.dueDate) {
        const dateKey = format(parseISO(task.dueDate), 'yyyy-MM-dd');
        initDateEntry(dateKey);
        counts[dateKey].tasks.end++;
      }
    });

    return counts;
  }, [mapData]);

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(selectedMonth);
    const monthEnd = endOfMonth(selectedMonth);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [selectedMonth]);

  // Check if a date is within project range
  const isDateInProjectRange = (date: Date): boolean => {
    if (!project?.startDate || !project?.endDate) return true;

    try {
      const projectStart = parseISO(project.startDate);
      const projectEnd = parseISO(project.endDate);
      return isWithinInterval(date, { start: projectStart, end: projectEnd });
    } catch {
      return true;
    }
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setSelectedMonth(prev => direction === 'next' ? addMonths(prev, 1) : subMonths(prev, 1));
  };

  const toggleFilter = (filter: FilterType) => {
    setSelectedFilters(prev =>
      prev.includes(filter)
        ? prev.filter(f => f !== filter)
        : [...prev, filter]
    );
  };

  const filterOptions = [
    { value: "phases" as FilterType, label: "Phases", icon: ClipboardPenLine, color: "text-purple-600" },
    { value: "steps" as FilterType, label: "Steps", icon: Boxes, color: "text-blue-600" },
    { value: "tasks" as FilterType, label: "Tasks", icon: PackageCheck, color: "text-green-600" },
  ];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            MAP Timeline Calendar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="px-4 pb-2 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            MAP Timeline Calendar
          </CardTitle>
          <div className="flex flex-wrap items-center gap-3">
            {/* Filter Dropdown */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-xs" aria-label="Filter" title="Filter">
                  <Filter className="h-3.5 w-3.5" />
                  {selectedFilters.length}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64" align="end">
                <div className="space-y-3">
                  <h4 className="font-medium text-sm">Show on Calendar</h4>
                  {filterOptions.map((option) => (
                    <div key={option.value} className="flex items-center gap-2">
                      <Checkbox
                        id={option.value}
                        checked={selectedFilters.includes(option.value)}
                        onCheckedChange={() => toggleFilter(option.value)}
                      />
                      <label
                        htmlFor={option.value}
                        className="flex items-center gap-2 text-sm font-medium cursor-pointer flex-1"
                      >
                        <option.icon className={`h-4 w-4 ${option.color}`} />
                        {option.label}
                      </label>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* Legend */}
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-full bg-orange-600 dark:bg-orange-700"></div>
                <span>Start Dates</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-full bg-blue-600 dark:bg-blue-700"></div>
                <span>End Dates</span>
              </div>
            </div>

            {/* Month Navigation */}
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigateMonth('prev')} aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h3 className="min-w-[110px] text-center text-sm font-semibold">
                {format(selectedMonth, 'MMMM yyyy')}
              </h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigateMonth('next')} aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-0.5">
          {/* Day headers */}
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="flex h-7 items-center justify-center rounded border border-blue-100 bg-blue-50 text-center text-xs font-medium text-gray-700 dark:border-blue-900 dark:bg-blue-950/60 dark:text-gray-200">
              {day}
            </div>
          ))}

          {/* Calendar days */}
          {calendarDays.map((day) => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const counts = dateCounts[dateKey];
            const isInProjectRange = isDateInProjectRange(day);
            const isCurrentMonth = isSameMonth(day, selectedMonth);
            const isToday = isSameDay(day, new Date());

            // Calculate total start/end counts based on active filters
            let totalStart = 0;
            let totalEnd = 0;

            if (counts) {
              if (selectedFilters.includes("phases")) {
                totalStart += counts.phases.start;
                totalEnd += counts.phases.end;
              }
              if (selectedFilters.includes("steps")) {
                totalStart += counts.steps.start;
                totalEnd += counts.steps.end;
              }
              if (selectedFilters.includes("tasks")) {
                totalStart += counts.tasks.start;
                totalEnd += counts.tasks.end;
              }
            }

            return (
              <div
                key={day.toISOString()}
                className={`
                  relative h-12 rounded border p-1 text-xs
                  ${isToday ? 'ring-2 ring-blue-800 border-blue-800 bg-blue-50 dark:bg-blue-900/30' : 'border-gray-200 dark:border-gray-700'}
                  ${!isCurrentMonth ? 'text-gray-300 dark:text-gray-600' : 'text-gray-900 dark:text-gray-100'}
                  ${!isInProjectRange ? 'bg-gray-100 dark:bg-gray-800 opacity-40' : 'bg-white dark:bg-slate-900'}
                `}
              >
                {/* Day number */}
                <div className="absolute left-1 top-0.5 text-xs font-medium">
                  {format(day, 'd')}
                </div>

                {/* Count badges */}
                {isInProjectRange && (totalStart > 0 || totalEnd > 0) && (
                  <div className="flex h-full items-end justify-center gap-1 pb-0.5">
                    {totalStart > 0 && (
                      <Badge
                        variant="secondary"
                        className="h-5 min-w-[20px] justify-center rounded-full bg-orange-600 px-1.5 py-0 text-[11px] text-white dark:bg-orange-700"
                      >
                        {totalStart}
                      </Badge>
                    )}
                    {totalEnd > 0 && (
                      <Badge
                        variant="secondary"
                        className="h-5 min-w-[20px] justify-center rounded-full bg-blue-600 px-1.5 py-0 text-[11px] text-white dark:bg-blue-700"
                      >
                        {totalEnd}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-2 text-center text-[11px] text-gray-500 dark:text-gray-400">
          Orange circles show items starting that day, blue circles show items ending that day. Grayed dates are outside the project timeline.
        </div>
      </CardContent>
    </Card>
  );
}
