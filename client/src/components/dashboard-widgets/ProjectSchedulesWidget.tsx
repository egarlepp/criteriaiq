"use client";
import * as React from "react";
import { useState, useMemo } from "react";
import { Calendar, ChevronLeft, ChevronRight, MonitorPlay, MonitorStop } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  parseISO,
} from "date-fns";
import { parseProjectDate } from "@/lib/date-utils";

interface ProjectData {
  id: number;
  customerName?: string;
  businessProblem?: string;
  solutionName?: string;
  startDate: string;
  endDate?: string;
}

export interface DateClickData {
  date: string;
  type: "start" | "end" | "both";
  projectIds: number[];
}

interface ProjectSchedulesWidgetProps {
  projects: ProjectData[];
  className?: string;
  onDateClick?: (data: DateClickData) => void;
}

export function ProjectSchedulesWidget({
  projects,
  className = "",
  onDateClick,
}: ProjectSchedulesWidgetProps) {
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  const projectCountsByDate = useMemo(() => {
    const endDateCounts: { [key: string]: { count: number; projects: ProjectData[] } } = {};
    const startDateCounts: { [key: string]: { count: number; projects: ProjectData[] } } = {};

    projects.forEach((project) => {
      if (project.endDate) {
        try {
          const endDate = parseProjectDate(project.endDate);
          if (!isNaN(endDate.getTime())) {
            const dateKey = format(endDate, "yyyy-MM-dd");
            if (!endDateCounts[dateKey]) {
              endDateCounts[dateKey] = { count: 0, projects: [] };
            }
            endDateCounts[dateKey].count++;
            endDateCounts[dateKey].projects.push(project);
          }
        } catch (error) {
          // Ignore invalid dates
        }
      }

      if (project.startDate) {
        try {
          const startDate = parseProjectDate(project.startDate);
          if (!isNaN(startDate.getTime())) {
            const dateKey = format(startDate, "yyyy-MM-dd");
            if (!startDateCounts[dateKey]) {
              startDateCounts[dateKey] = { count: 0, projects: [] };
            }
            startDateCounts[dateKey].count++;
            startDateCounts[dateKey].projects.push(project);
          }
        } catch (error) {
          // Ignore invalid dates
        }
      }
    });

    return { endDates: endDateCounts, startDates: startDateCounts };
  }, [projects]);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(selectedMonth);
    const monthEnd = endOfMonth(selectedMonth);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [selectedMonth]);

  const navigateMonth = (direction: "prev" | "next") => {
    setSelectedMonth((prev) =>
      direction === "next" ? addMonths(prev, 1) : subMonths(prev, 1)
    );
  };

  const monthlyStartedCount = useMemo(() => {
    return Object.entries(projectCountsByDate.startDates)
      .filter(([dateKey]) => {
        const checkDate = parseISO(dateKey);
        return isSameMonth(checkDate, selectedMonth);
      })
      .reduce((sum, [, data]) => sum + data.count, 0);
  }, [projectCountsByDate.startDates, selectedMonth]);

  const monthlyEndedCount = useMemo(() => {
    return Object.entries(projectCountsByDate.endDates)
      .filter(([dateKey]) => {
        const checkDate = parseISO(dateKey);
        return isSameMonth(checkDate, selectedMonth);
      })
      .reduce((sum, [, data]) => sum + data.count, 0);
  }, [projectCountsByDate.endDates, selectedMonth]);

  return (
    <div
      className={`rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 bg-card text-card-foreground p-4 ${className}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Project Scheduled Dates
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-orange-500"></div>
            <span className="text-muted-foreground">Start</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
            <span className="text-muted-foreground">End</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => navigateMonth("prev")}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          {format(selectedMonth, "MMMM yyyy")}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => navigateMonth("next")}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {["S", "M", "T", "W", "T", "F", "S"].map((day, idx) => (
          <div
            key={idx}
            className="text-[9px] font-medium text-center text-slate-500 dark:text-slate-400 bg-blue-50 dark:bg-blue-900/30 rounded py-0.5"
          >
            {day}
          </div>
        ))}

        {calendarDays.map((day) => {
          const dateKey = format(day, "yyyy-MM-dd");
          const endDateData = projectCountsByDate.endDates[dateKey];
          const startDateData = projectCountsByDate.startDates[dateKey];
          const isToday = isSameDay(day, new Date());
          const hasData = startDateData || endDateData;

          const tooltipContent = hasData ? (
            <div className="space-y-1 max-w-xs">
              {startDateData && (
                <div>
                  <p className="text-[10px] font-semibold text-orange-500 mb-0.5">
                    Starting ({startDateData.count}):
                  </p>
                  {startDateData.projects.map((p) => (
                    <p key={`start-${p.id}`} className="text-[10px]">
                      <span className="font-medium">#{p.id}</span> - {p.solutionName || p.businessProblem || "Project"}
                    </p>
                  ))}
                </div>
              )}
              {endDateData && (
                <div>
                  <p className="text-[10px] font-semibold text-blue-500 mb-0.5">
                    Ending ({endDateData.count}):
                  </p>
                  {endDateData.projects.map((p) => (
                    <p key={`end-${p.id}`} className="text-[10px]">
                      <span className="font-medium">#{p.id}</span> - {p.solutionName || p.businessProblem || "Project"}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ) : null;

          const handleDateClick = () => {
            if (!hasData || !onDateClick) return;
            
            const startIds = startDateData?.projects.map((p) => p.id) || [];
            const endIds = endDateData?.projects.map((p) => p.id) || [];
            const allIds = [...new Set([...startIds, ...endIds])];
            
            let type: "start" | "end" | "both" = "both";
            if (startDateData && !endDateData) type = "start";
            else if (!startDateData && endDateData) type = "end";
            
            onDateClick({
              date: dateKey,
              type,
              projectIds: allIds,
            });
          };

          const dayCell = (
            <div
              onClick={handleDateClick}
              className={`
                relative text-[10px] rounded h-7 flex flex-col items-center justify-center
                border border-slate-100 dark:border-slate-800
                ${!isSameMonth(day, selectedMonth) ? "text-slate-300 dark:text-slate-600 bg-slate-50/50 dark:bg-slate-900/20" : "text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800/50"}
                ${isToday ? "ring-1 ring-blue-500 bg-blue-50 dark:bg-blue-900/30" : ""}
                ${hasData ? "cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700" : ""}
              `}
            >
              <span className="text-[9px]">{format(day, "d")}</span>
              {hasData && (
                <div className="flex items-center gap-0.5 mt-0.5">
                  {startDateData && (
                    <Badge className="text-[7px] px-1 py-0 h-3 min-w-[12px] rounded-full bg-orange-500 text-white border-0 hover:bg-orange-600">
                      {startDateData.count}
                    </Badge>
                  )}
                  {endDateData && (
                    <Badge className="text-[7px] px-1 py-0 h-3 min-w-[12px] rounded-full bg-blue-500 text-white border-0 hover:bg-blue-600">
                      {endDateData.count}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          );

          return hasData ? (
            <Tooltip key={day.toISOString()}>
              <TooltipTrigger asChild>{dayCell}</TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                {tooltipContent}
              </TooltipContent>
            </Tooltip>
          ) : (
            <div key={day.toISOString()}>{dayCell}</div>
          );
        })}
      </div>

      <div className="text-[8px] text-center text-muted-foreground mb-2">
        Hover on dates to see project details
      </div>

      <div className="border-t border-slate-200/70 dark:border-slate-700 pt-2">
        <p className="text-[10px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">
          Monthly Totals
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-orange-50 dark:bg-orange-900/30 p-2 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[9px] font-medium text-orange-600 dark:text-orange-400">
                  Projects Started
                </p>
                <p className="text-base font-bold text-orange-900 dark:text-orange-100">
                  {monthlyStartedCount}
                </p>
              </div>
               <div className="w-1.5 h-1.5 rounded-full bg-orange-500 relative">
                <MonitorPlay
                  className="absolute right-4 top-1/2 h-12 w-12 text-orange-500/5 dark:text-white/5 pointer-events-none"
                  style={{ transform: "translateY(-50%) rotate(-12deg)" }}
                />
              </div>
            </div>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/30 p-2 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[9px] font-medium text-blue-600 dark:text-blue-400">
                  Projects Ended
                </p>
                <p className="text-base font-bold text-blue-900 dark:text-blue-100">
                  {monthlyEndedCount}
                </p>
              </div>
               <div className="w-1.5 h-1.5 rounded-full bg-blue-500 relative">
                <MonitorStop
                  className="absolute right-4 top-1/2 h-12 w-12 text-blue-500/5 dark:text-white/5 pointer-events-none"
                  style={{ transform: "translateY(-50%) rotate(-12deg)" }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
