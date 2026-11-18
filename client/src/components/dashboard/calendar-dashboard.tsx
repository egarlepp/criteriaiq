import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { Search, ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { SearchFiltersSection, FilterLabel } from "@/components/ui/search-filters-section";
import { calculateDaysDiff, parseProjectDate } from "@/lib/date-utils";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from "date-fns";
import { EndDateBadge } from "@/components/shared/end-date-badge";
import { useTranslation } from 'react-i18next';
import { isEngineerOnProject } from "@/lib/project-access-utils";

interface CalendarDashboardProps {
  filterContainerRef?: React.RefObject<HTMLDivElement | null>;
  onFilterStateChange?: (count: number, clearFn: () => void) => void;
  showMyProjects?: boolean;
}

export default function CalendarDashboard({ filterContainerRef, onFilterStateChange, showMyProjects }: CalendarDashboardProps = {}) {
  const { isAuthenticated, user } = useAuth();
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dueDateFilter, setDueDateFilter] = useState("All Projects");

  // Fetch projects
  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ["/api/projects"],
    retry: false,
    enabled: isAuthenticated,
    refetchOnWindowFocus: true,
    staleTime: 0
  });

  // Fetch status configs for badges
  const { data: statusConfigs = [] } = useQuery<any[]>({
    queryKey: ["/api/status-configs"],
    retry: false,
    enabled: isAuthenticated,
  });

  // Get status config for a given status name
  const getStatusConfig = (statusName: string) => {
    return statusConfigs.find((config: any) => config.name.toLowerCase() === statusName.toLowerCase());
  };

  // Get project counts by date using standardized parsing
  const projectCountsByDate = useMemo(() => {
    const endDateCounts: { [key: string]: { count: number; projects: any[] } } = {};
    const startDateCounts: { [key: string]: { count: number; projects: any[] } } = {};

    (projects as any[]).forEach((project: any) => {
      // Count end dates
      if (project.endDate) {
        try {
          const endDate = parseProjectDate(project.endDate);

          // Validate the date
          if (!isNaN(endDate.getTime())) {
            const dateKey = format(endDate, 'yyyy-MM-dd');

            if (!endDateCounts[dateKey]) {
              endDateCounts[dateKey] = { count: 0, projects: [] };
            }
            endDateCounts[dateKey].count++;
            endDateCounts[dateKey].projects.push(project);
          }
        } catch (error) {
          console.warn('Invalid end date format for project:', project.id, project.endDate);
        }
      }

      // Count start dates
      if (project.startDate) {
        try {
          const startDate = parseProjectDate(project.startDate);

          // Validate the date
          if (!isNaN(startDate.getTime())) {
            const dateKey = format(startDate, 'yyyy-MM-dd');

            if (!startDateCounts[dateKey]) {
              startDateCounts[dateKey] = { count: 0, projects: [] };
            }
            startDateCounts[dateKey].count++;
            startDateCounts[dateKey].projects.push(project);
          }
        } catch (error) {
          console.warn('Invalid start date format for project:', project.id, project.startDate);
        }
      }
    });

    return { endDates: endDateCounts, startDates: startDateCounts };
  }, [projects]);

  // Use the standardized date parsing function
  const parseProjectEndDate = (endDateString: string): Date | null => {
    try {
      return parseProjectDate(endDateString);
    } catch (error) {
      return null;
    }
  };

  // Filter projects based on search term, selected date, and due date filter
  const filteredProjects = useMemo(() => {
    let filtered = projects as any[];

    // Apply "Show My Projects" filter
    if (showMyProjects && user?.id) {
      filtered = filtered.filter((p: any) => isEngineerOnProject(p, user.id));
    }

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter((project: any) =>
        project.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.businessProblem?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.solutionDescription?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply date filter if a specific date is selected
    if (selectedDate) {
      filtered = filtered.filter((project: any) => {
        let hasMatchingDate = false;
        
        // Check if end date matches
        if (project.endDate) {
          const projectEndDate = parseProjectEndDate(project.endDate);
          if (projectEndDate && isSameDay(projectEndDate, selectedDate)) {
            hasMatchingDate = true;
          }
        }
        
        // Check if start date matches
        if (project.startDate) {
          try {
            const projectStartDate = parseProjectDate(project.startDate);
            if (projectStartDate && isSameDay(projectStartDate, selectedDate)) {
              hasMatchingDate = true;
            }
          } catch (error) {
            // Ignore invalid start dates
          }
        }
        
        return hasMatchingDate;
      });
    }

    // Apply due date filter
    if (dueDateFilter !== "All Projects") {
      filtered = filtered.filter((project: any) => {
        if (!project.endDate) return false;
        const projectEndDate = parseProjectEndDate(project.endDate);
        if (!projectEndDate) return false;

        const daysDiff = calculateDaysDiff(projectEndDate, user?.timezone || 'America/New_York');

        switch (dueDateFilter) {
          case "Today":
            return daysDiff === 0;
          case "This Week":
            return daysDiff >= 0 && daysDiff <= 6;
          case "This Month":
            // For month filtering, we need to check if it's in the same month in user's timezone
            return daysDiff >= 0 && daysDiff <= 31; // Simple approximation for now
          case "Next Week":
            return daysDiff >= 7 && daysDiff <= 13;
          case "Next Month":
            return daysDiff >= 32 && daysDiff <= 62; // Simple approximation for now
          case "Past Due":
            return daysDiff < 0;
          default:
            return true;
        }
      });
    }

    return filtered;
  }, [projects, searchTerm, selectedDate, dueDateFilter, showMyProjects, user]);

  // Generate calendar days (including days from previous/next months to fill the grid)
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(selectedMonth);
    const monthEnd = endOfMonth(selectedMonth);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 }); // Start on Sunday
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 }); // End on Saturday

    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [selectedMonth]);

  const navigateMonth = (direction: 'prev' | 'next') => {
    setSelectedMonth(prev => direction === 'next' ? addMonths(prev, 1) : subMonths(prev, 1));
    setSelectedDate(null); // Clear selected date when changing months
  };

  const resetFilters = () => {
    setSearchTerm("");
    setSelectedDate(null);
    setDueDateFilter("All Projects");
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchTerm) count++;
    if (selectedDate) count++;
    if (dueDateFilter !== "All Projects") count++;
    return count;
  }, [searchTerm, selectedDate, dueDateFilter]);

  const clearAllFilters = resetFilters;

  useEffect(() => {
    if (onFilterStateChange) {
      onFilterStateChange(activeFilterCount, clearAllFilters);
    }
  }, [activeFilterCount, onFilterStateChange]);

  // Generate title based on filter selection
  const getProjectsTitle = () => {
    if (selectedDate) {
      return t("dashboard.calendar.projectsOnDate", { date: format(selectedDate, 'MMMM d, yyyy') });
    }

    switch (dueDateFilter) {
      case "All Projects":
        return t("dashboard.calendar.allProjectsWithDueDates");
      case "Past Due":
        return t("dashboard.calendar.projectsPastDue");
      default:
        return t("dashboard.calendar.projectsDue", { period: dueDateFilter });
    }
  };

  // Filter content JSX for portal or inline rendering
  const filterContent = (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div>
        <FilterLabel>{t("dashboard.calendar.searchProjects")}</FilterLabel>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("dashboard.calendar.searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-9 text-sm"
          />
        </div>
      </div>

      <div>
        <FilterLabel>{t("dashboard.calendar.dueDateFilter")}</FilterLabel>
        <Select value={dueDateFilter} onValueChange={setDueDateFilter}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder={t("dashboard.calendar.selectTimePeriod")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All Projects">{t("dashboard.filters.allProjects")}</SelectItem>
            <SelectItem value="Today">{t("dashboard.filters.today")}</SelectItem>
            <SelectItem value="This Week">{t("dashboard.filters.thisWeek")}</SelectItem>
            <SelectItem value="This Month">{t("dashboard.calendar.thisMonth")}</SelectItem>
            <SelectItem value="Next Week">{t("dashboard.calendar.nextWeek")}</SelectItem>
            <SelectItem value="Next Month">{t("dashboard.calendar.nextMonth")}</SelectItem>
            <SelectItem value="Past Due">{t("dashboard.filters.pastDue")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <FilterLabel>{t("dashboard.calendar.selectedDate")}</FilterLabel>
        <div className="flex items-center space-x-2">
          <Input
            type="date"
            value={selectedDate ? format(selectedDate, 'yyyy-MM-dd') : ''}
            onChange={(e) => setSelectedDate(e.target.value ? new Date(e.target.value + 'T00:00:00') : null)}
            className="flex-1 h-9 text-sm"
          />
          {(searchTerm || selectedDate || dueDateFilter !== "All Projects") && (
            <Button variant="outline" size="sm" onClick={resetFilters}>
              {t("projects.navigator.clear")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Search and Filters - rendered via portal when filterContainerRef is provided */}
      {filterContainerRef?.current ? (
        createPortal(filterContent, filterContainerRef.current)
      ) : (
        <SearchFiltersSection activeFilterCount={activeFilterCount} onClearFilters={clearAllFilters}>
          <div className="space-y-4">
            {filterContent}
          </div>
        </SearchFiltersSection>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Calendar View */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-2 text-2xl">
                <Calendar className="h-5 w-5" style={{ color: '#2563eb' }} />
                <span>{t("dashboard.calendar.projectDates")}</span>
              </CardTitle>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-3 text-xs">
                  <div className="flex items-center space-x-1">
                    <div className="w-4 h-4 rounded-full bg-orange-600"></div>
                    <span>{t("dashboard.calendar.startDates")}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <div className="w-4 h-4 rounded-full bg-blue-600"></div>
                    <span>{t("dashboard.calendar.endDates")}</span>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Button variant="ghost" size="sm" onClick={() => navigateMonth('prev')}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <h3 className="text-lg font-semibold min-w-[140px] text-center">
                    {format(selectedMonth, 'MMMM yyyy')}
                  </h3>
                  <Button variant="ghost" size="sm" onClick={() => navigateMonth('next')}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1 mb-4">
              {/* Day headers with light blue background */}
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day} className="p-3 text-center text-sm font-medium text-gray-700 dark:text-gray-200 bg-blue-100 dark:bg-blue-900/50 rounded border dark:border-gray-700 h-12 flex items-center justify-center">
                  {day}
                </div>
              ))}

              {/* Calendar days */}
              {calendarDays.map((day) => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const endDateData = projectCountsByDate.endDates[dateKey];
                const startDateData = projectCountsByDate.startDates[dateKey];
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                const isToday = isSameDay(day, new Date());

                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDate(isSelected ? null : day)}
                    className={`
                      relative p-1 text-sm rounded border transition-colors h-16 min-h-[64px]
                      ${isSelected
                        ? 'bg-blue-100 dark:bg-blue-900/50 border-blue-500 text-blue-900 dark:text-blue-100'
                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 bg-white dark:bg-gray-800'
                      }
                      ${isToday ? 'ring-2 ring-blue-800 border-blue-800 bg-blue-50 dark:bg-blue-900/30' : ''}
                      ${!isSameMonth(day, selectedMonth) ? 'text-gray-300 dark:text-gray-600' : 'text-gray-900 dark:text-gray-100'}
                    `}
                  >
                    {/* Day number in top-left corner */}
                    <div className="absolute top-1 left-1 text-sm font-medium">
                      {format(day, 'd')}
                    </div>

                    {/* Project count badges in center */}
                    {(startDateData || endDateData) && (
                      <div className="flex items-center justify-center h-full space-x-1">
                        {/* Start date count - orange circle on the left */}
                        {startDateData && (
                          <Badge
                            variant="secondary"
                            className="text-xs px-2 py-1 min-w-[24px] h-6 rounded-full bg-orange-600 text-white"
                          >
                            {startDateData.count}
                          </Badge>
                        )}
                        {/* End date count - blue circle on the right */}
                        {endDateData && (
                          <Badge
                            variant="secondary"
                            className="text-xs px-2 py-1 min-w-[24px] h-6 rounded-full bg-blue-600 text-white"
                          >
                            {endDateData.count}
                          </Badge>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="text-xs text-gray-500 dark:text-gray-400 text-center mb-4">
              {t("dashboard.calendar.calendarHint")}
            </div>

            {/* Monthly Totals */}
            <div className="border-t dark:border-gray-700 pt-4">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">{t('dashboard.calendar.monthlyTotals')}</h4>
              <div className="grid grid-cols-2 gap-4">
                {/* Started Projects Total */}
                <div className="bg-orange-50 dark:bg-orange-900/30 p-3 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-orange-600 dark:text-orange-400">{t('dashboard.calendar.projectsStarted')}</p>
                      <div className="flex items-center gap-2">
                        {(() => {
                          const currentTotal = Object.values(projectCountsByDate.startDates)
                            .filter(data => {
                              const date = Object.keys(projectCountsByDate.startDates).find(dateKey => 
                                projectCountsByDate.startDates[dateKey] === data
                              );
                              if (!date) return false;
                              const checkDate = new Date(date);
                              return isSameMonth(checkDate, selectedMonth);
                            })
                            .reduce((sum, data) => sum + data.count, 0);

                          const previousMonth = subMonths(selectedMonth, 1);
                          const previousTotal = Object.values(projectCountsByDate.startDates)
                            .filter(data => {
                              const date = Object.keys(projectCountsByDate.startDates).find(dateKey => 
                                projectCountsByDate.startDates[dateKey] === data
                              );
                              if (!date) return false;
                              const checkDate = new Date(date);
                              return isSameMonth(checkDate, previousMonth);
                            })
                            .reduce((sum, data) => sum + data.count, 0);

                          const difference = currentTotal - previousTotal;
                          
                          return (
                            <>
                              {difference > 0 && <span className="text-green-600 font-bold">+</span>}
                              {difference < 0 && <span className="text-red-600 font-bold">-</span>}
                              <span className="text-lg font-bold text-orange-900 dark:text-orange-100">{currentTotal}</span>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="w-2 h-2 rounded-full bg-orange-600"></div>
                  </div>
                </div>

                {/* Ended Projects Total */}
                <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-blue-600 dark:text-blue-400">{t('dashboard.calendar.projectsEnded')}</p>
                      <div className="flex items-center gap-2">
                        {(() => {
                          const currentTotal = Object.values(projectCountsByDate.endDates)
                            .filter(data => {
                              const date = Object.keys(projectCountsByDate.endDates).find(dateKey => 
                                projectCountsByDate.endDates[dateKey] === data
                              );
                              if (!date) return false;
                              const checkDate = new Date(date);
                              return isSameMonth(checkDate, selectedMonth);
                            })
                            .reduce((sum, data) => sum + data.count, 0);

                          const previousMonth = subMonths(selectedMonth, 1);
                          const previousTotal = Object.values(projectCountsByDate.endDates)
                            .filter(data => {
                              const date = Object.keys(projectCountsByDate.endDates).find(dateKey => 
                                projectCountsByDate.endDates[dateKey] === data
                              );
                              if (!date) return false;
                              const checkDate = new Date(date);
                              return isSameMonth(checkDate, previousMonth);
                            })
                            .reduce((sum, data) => sum + data.count, 0);

                          const difference = currentTotal - previousTotal;
                          
                          return (
                            <>
                              {difference > 0 && <span className="text-green-600 font-bold">+</span>}
                              {difference < 0 && <span className="text-red-600 font-bold">-</span>}
                              <span className="text-lg font-bold text-blue-900 dark:text-blue-100">{currentTotal}</span>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="w-2 h-2 rounded-full bg-blue-600"></div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Projects List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-2xl">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5" style={{ color: '#2563eb' }} />
                <span>{getProjectsTitle()}</span>
              </div>
              <Badge variant="outline" className="text-xs">
                {t("dashboard.calendar.projectCount", {
                  count: selectedDate
                    ? (filteredProjects as any[]).length
                    : (filteredProjects as any[]).filter((p: any) => p.endDate).length
                })}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {(filteredProjects as any[])
                .filter((project: any) => project.endDate)
                .sort((a: any, b: any) => {
                  // Sort by end date using standardized parsing
                  try {
                    const dateA = parseProjectDate(a.endDate!);
                    const dateB = parseProjectDate(b.endDate!);
                    return dateA.getTime() - dateB.getTime();
                  } catch (error) {
                    return 0;
                  }
                })
                .map((project: any) => {
                  const statusConfig = getStatusConfig(project.status);
                  const endDate = parseProjectDate(project.endDate!);
                  const daysDiff = calculateDaysDiff(endDate, user?.timezone || 'America/New_York');
                  const isDueSoon = daysDiff <= 5 && daysDiff >= 0;
                  const isPastDue = daysDiff < 0;

                  return (
                    <div key={project.id} className="border dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-1">
                            <h4 className="font-medium text-sm truncate">
                              {project.customerName}
                            </h4>
                            <Badge
                              className="text-xs text-white shrink-0"
                              style={{
                                backgroundColor: statusConfig?.color || '#6b7280'
                              }}
                            >
                              {statusConfig?.name || project.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                            {project.businessProblem}
                          </p>
                          <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
                            <span>ID: {project.id}</span>
                            <span>{t("dashboard.calendar.seLabel")}: {typeof project.primarySe === 'object' && project.primarySe
                              ? `${project.primarySe.firstName || ''} ${project.primarySe.lastName || ''}`.trim() || project.primarySe.email || t("dashboard.table.unknown")
                              : project.primarySe || t("projects.notAssigned")
                            }</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end space-y-1 ml-4">
                          <div className="text-sm font-medium">
                            {format(endDate, 'MMM d, yyyy')}
                          </div>
                          <EndDateBadge endDate={endDate} projectStatus={project.status} targetField="project.endDate" />
                        </div>
                      </div>
                    </div>
                  );
                })}

              {(selectedDate 
                ? (filteredProjects as any[]).length === 0 
                : (filteredProjects as any[]).filter((p: any) => p.endDate).length === 0
              ) && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  {selectedDate
                    ? t("dashboard.calendar.noProjectsOnDate")
                    : searchTerm
                      ? t("dashboard.calendar.noProjectsMatchSearch")
                      : t("dashboard.calendar.noProjectsWithDueDates")
                  }
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}