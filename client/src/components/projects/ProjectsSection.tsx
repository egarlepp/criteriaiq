import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Target, Layers, Tags, FolderCheck, DollarSign, FolderOpen } from "lucide-react";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { SearchFiltersSection } from "@/components/ui/search-filters-section";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent } from "@/components/ui/card";

import ProjectBoard from "./project-board";
import CalendarDashboard from "@/components/dashboard/calendar-dashboard";
import MapManagementSection from "@/components/map/MapManagementSection";
import CompetitorIntelligenceSection from "@/components/competitors/CompetitorIntelligenceSection";
import GapAnalysisPage from "@/components/gap-analysis/GapAnalysisPage";
import OutcomesDashboard from "@/components/outcomes/OutcomesDashboard";
import ValidationProjectsPage from "./ValidationProjectsPage";
import DependenciesRegistrySection from "./DependenciesRegistrySection";
import AssumptionsLibraryTab from "@/components/projects/AssumptionsLibraryTab";
import EvaluationRequestsSection from "@/components/requests/EvaluationRequestsSection";

type ProjectsView = "projects" | "project-board" | "calendar" | "map" | "competitors" | "gap-analysis" | "outcome-intelligence" | "dependencies" | "assumptions" | "evaluation-requests";

interface ProjectsSectionProps {
  hideFilters?: boolean;
}

interface GapData {
  id: number;
  gapName: string;
  projectId: number | null;
  impactedSolution: string;
  gapType: string;
  projectName?: string | null;
}

export default function ProjectsSection({ hideFilters = false }: ProjectsSectionProps) {
  const { t } = useTranslation();
  const [location] = useLocation();
  const { user } = useAuth();
  const { canView } = usePermissions();
  const [activeView, setActiveView] = useState<ProjectsView>("projects");
  // Everyone starts on their own projects; untick to see every project.
  const [showMyProjects, setShowMyProjects] = useState(true);

  const { data: gaps = [], isLoading: gapsLoading } = useQuery<GapData[]>({
    queryKey: ["/api/gaps"],
  });

  const { data: allProjects = [] } = useQuery<any[]>({
    queryKey: ["/api/projects"],
  });

  const topImpactedSolutions = useMemo(() => {
    const counts: Record<string, number> = {};
    gaps.forEach(g => {
      const sol = g.impactedSolution || 'Not specified';
      counts[sol] = (counts[sol] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => ({ name, count }));
  }, [gaps]);

  const topGapTypes = useMemo(() => {
    const counts: Record<string, number> = {};
    gaps.forEach(g => {
      const gType = g.gapType || 'Not specified';
      counts[gType] = (counts[gType] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => ({ name, count }));
  }, [gaps]);

  const topGapsInProjects = useMemo(() => {
    const gapProjectCounts: Record<string, Set<number>> = {};
    gaps.forEach(g => {
      if (g.projectId) {
        if (!gapProjectCounts[g.gapName]) {
          gapProjectCounts[g.gapName] = new Set();
        }
        gapProjectCounts[g.gapName].add(g.projectId);
      }
    });
    return Object.entries(gapProjectCounts)
      .map(([name, projects]) => ({ name, count: projects.size }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }, [gaps]);

  const totalProjectsImpacted = useMemo(() => {
    return new Set(gaps.filter(g => g.projectId).map(g => g.projectId)).size;
  }, [gaps]);

  const totalRevenueImpacted = useMemo(() => {
    const impactedIds = new Set(gaps.filter(g => g.projectId).map(g => g.projectId));
    let total = 0;
    allProjects.forEach((p: any) => {
      if (impactedIds.has(p.id)) {
        const acv = parseFloat((p.opportunityAcvValue || '').replace(/[^0-9.-]/g, '') || '0');
        if (!isNaN(acv)) total += acv;
      }
    });
    return total;
  }, [gaps, allProjects]);

  const topProjectsByAcv = useMemo(() => {
    const impactedIds = new Set(gaps.filter(g => g.projectId).map(g => g.projectId));
    return allProjects
      .filter((p: any) => impactedIds.has(p.id))
      .map((p: any) => ({
        name: p.projectName || p.name || `Project #${p.id}`,
        acv: parseFloat((p.opportunityAcvValue || '').replace(/[^0-9.-]/g, '') || '0'),
      }))
      .filter(p => p.acv > 0)
      .sort((a, b) => b.acv - a.acv)
      .slice(0, 3);
  }, [gaps, allProjects]);

  function formatAcv(val: number): string {
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
    return `$${val.toFixed(0)}`;
  }
  
  const filterContainerRef = useRef<HTMLDivElement>(null);
  const actionContainerRef = useRef<HTMLDivElement>(null);
  
  const [refsReady, setRefsReady] = useState(false);
  
  const [activeFilterCount, setActiveFilterCount] = useState(0);
  const clearFiltersRef = useRef<Record<string, (() => void) | null>>({});
  
  const onFilterStateChange = useCallback((count: number, clearFn: () => void) => {
    setActiveFilterCount(count);
    clearFiltersRef.current[activeView] = clearFn;
  }, [activeView]);
  
  const handleClearFilters = useCallback(() => {
    const clearFn = clearFiltersRef.current[activeView];
    if (clearFn) {
      clearFn();
    }
  }, [activeView]);
  
  useEffect(() => {
    setActiveFilterCount(0);
    setShowMyProjects(true);
  }, [activeView]);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      if (filterContainerRef.current || actionContainerRef.current) {
        setRefsReady(true);
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [activeView]);

  const VALID_SUBTABS = ['projects', 'project-board', 'calendar', 'map', 'competitors', 'gap-analysis', 'outcome-intelligence', 'dependencies', 'assumptions', 'evaluation-requests'];

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const subtabParam = urlParams.get('subtab');
    if (subtabParam && VALID_SUBTABS.includes(subtabParam)) {
      setActiveView(subtabParam as ProjectsView);
    }
  }, [location]);

  useEffect(() => {
    const handleNavigation = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const subtabParam = urlParams.get('subtab');
      if (subtabParam && VALID_SUBTABS.includes(subtabParam)) {
        setActiveView(subtabParam as ProjectsView);
      }
    };

    window.addEventListener('popstate', handleNavigation);
    return () => window.removeEventListener('popstate', handleNavigation);
  }, []);

  return (
    <TooltipProvider>
      <div data-testid="projects-section" className="space-y-4">


        {!hideFilters && (
          <SearchFiltersSection 
            activeFilterCount={activeFilterCount} 
            onClearFilters={handleClearFilters}
            actions={
              (activeView === 'projects' || activeView === 'calendar')
                ? (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="show-my-projects-ps"
                      checked={showMyProjects}
                      onCheckedChange={(checked) => setShowMyProjects(!!checked)}
                    />
                    <label
                      htmlFor="show-my-projects-ps"
                      className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer select-none whitespace-nowrap"
                    >
                      {t("dashboard.filters.showMyProjects")}
                    </label>
                  </div>
                )
                : (activeView === 'gap-analysis' || activeView === 'outcome-intelligence' || activeView === 'evaluation-requests')
                ? <div ref={actionContainerRef} />
                : undefined
            }
          >
            <div ref={filterContainerRef} />
          </SearchFiltersSection>
        )}

        {/* The view is chosen from the sidebar / top tab bar via ?subtab=. */}
        <Tabs value={activeView} className="@container pt-0">
          <div>
            <TabsContent value="projects" className="space-y-4">
              {refsReady && (
                <ValidationProjectsPage 
                  key={`projects-${refsReady}`}
                  filterContainerRef={filterContainerRef}
                  onFilterStateChange={onFilterStateChange}
                  showMyProjects={showMyProjects}
                />
              )}
            </TabsContent>
            <TabsContent value="project-board" className="space-y-4">
              {refsReady && <ProjectBoard key={`project-board-${refsReady}`} filterContainerRef={filterContainerRef} onFilterStateChange={onFilterStateChange} />}
            </TabsContent>
            <TabsContent value="calendar" className="space-y-4">
              {refsReady && <CalendarDashboard key={`calendar-${refsReady}`} filterContainerRef={filterContainerRef} onFilterStateChange={onFilterStateChange} showMyProjects={showMyProjects} />}
            </TabsContent>
            <TabsContent value="map" className="space-y-4">
              {refsReady && <MapManagementSection key={`map-${refsReady}`} filterContainerRef={filterContainerRef} onFilterStateChange={onFilterStateChange} />}
            </TabsContent>
            <TabsContent value="competitors" className="space-y-4">
              <CompetitorIntelligenceSection
                filterContainerRef={filterContainerRef}
                onFilterStateChange={onFilterStateChange}
              />
            </TabsContent>
            <TabsContent value="gap-analysis" className="space-y-4">
              <div className="grid grid-cols-2 @md:grid-cols-3 @xl:grid-cols-6 gap-4">
                {/* Card 1 — Total Projects Impacted */}
                <Card className="relative overflow-hidden bg-purple-50/80 dark:bg-purple-950/75 border-purple-200">
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <Target className="h-24 w-24 opacity-10 text-purple-600" />
                  </div>
                  <CardContent className="relative p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Target className="w-4 h-4 text-purple-900 dark:text-purple-300" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
                          <p>Total number of distinct projects that have at least one gap recorded</p>
                        </TooltipContent>
                      </Tooltip>
                      <h3 className="tracking-tight text-[15px] font-bold text-gray-900 dark:text-gray-100 leading-tight">Projects Impacted</h3>
                    </div>
                    <div className="text-2xl font-bold text-purple-600">
                      {gapsLoading ? <Skeleton className="h-8 w-12" /> : totalProjectsImpacted}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Distinct projects with gaps</p>
                  </CardContent>
                </Card>

                {/* Card 2 — Total Revenue Impacted */}
                <Card className="relative overflow-hidden bg-emerald-50/80 dark:bg-emerald-950/75 border-emerald-200">
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <DollarSign className="h-24 w-24 opacity-10 text-emerald-600" />
                  </div>
                  <CardContent className="relative p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DollarSign className="w-4 h-4 text-emerald-900 dark:text-emerald-300" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
                          <p>Sum of ACV across all distinct projects impacted by gaps (each project counted once)</p>
                        </TooltipContent>
                      </Tooltip>
                      <h3 className="tracking-tight text-[15px] font-bold text-gray-900 dark:text-gray-100 leading-tight">Revenue Impacted</h3>
                    </div>
                    <div className="text-2xl font-bold text-emerald-600">
                      {gapsLoading ? <Skeleton className="h-8 w-16" /> : formatAcv(totalRevenueImpacted)}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Distinct project ACV</p>
                  </CardContent>
                </Card>

                {/* Card 3 — Top Solutions */}
                <Card className="relative overflow-hidden bg-indigo-50/80 dark:bg-indigo-950/75 border-indigo-200">
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <Layers className="h-24 w-24 opacity-10 text-indigo-600" />
                  </div>
                  <CardContent className="relative p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Layers className="w-4 h-4 text-indigo-900 dark:text-indigo-300" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
                          <p>Top 3 solutions most impacted by gaps</p>
                        </TooltipContent>
                      </Tooltip>
                      <h3 className="tracking-tight text-[15px] font-bold text-gray-900 dark:text-gray-100 leading-tight">Top Solutions</h3>
                    </div>
                    <div className="space-y-1">
                      {gapsLoading ? (
                        <Skeleton className="h-8 w-full" />
                      ) : topImpactedSolutions.length === 0 ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400">No data yet</p>
                      ) : (
                        topImpactedSolutions.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs">
                            <span className="text-gray-700 dark:text-gray-300 truncate">{item.name}</span>
                            <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 ml-2 text-xs px-1.5 py-0">{item.count}</Badge>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Card 4 — Top Gap Types */}
                <Card className="relative overflow-hidden bg-blue-50/80 dark:bg-blue-950/75 border-blue-200">
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <Tags className="h-24 w-24 opacity-10 text-blue-600" />
                  </div>
                  <CardContent className="relative p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Tags className="w-4 h-4 text-blue-900 dark:text-blue-300" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
                          <p>Top 3 most common gap type categories</p>
                        </TooltipContent>
                      </Tooltip>
                      <h3 className="tracking-tight text-[15px] font-bold text-gray-900 dark:text-gray-100 leading-tight">Top Gap Types</h3>
                    </div>
                    <div className="space-y-1">
                      {gapsLoading ? (
                        <Skeleton className="h-8 w-full" />
                      ) : topGapTypes.length === 0 ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400">No data yet</p>
                      ) : (
                        topGapTypes.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs">
                            <span className="text-gray-700 dark:text-gray-300 truncate">{item.name}</span>
                            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 ml-2 text-xs px-1.5 py-0">{item.count}</Badge>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Card 5 — Top Selected Gaps */}
                <Card className="relative overflow-hidden bg-cyan-50/80 dark:bg-cyan-950/75 border-cyan-200">
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <FolderCheck className="h-24 w-24 opacity-10 text-cyan-600" />
                  </div>
                  <CardContent className="relative p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <FolderCheck className="w-4 h-4 text-cyan-900 dark:text-cyan-300" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
                          <p>Top 3 gaps selected across the most projects</p>
                        </TooltipContent>
                      </Tooltip>
                      <h3 className="tracking-tight text-[15px] font-bold text-gray-900 dark:text-gray-100 leading-tight">Top Selected Gaps</h3>
                    </div>
                    <div className="space-y-1">
                      {gapsLoading ? (
                        <Skeleton className="h-8 w-full" />
                      ) : topGapsInProjects.length === 0 ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400">No data yet</p>
                      ) : (
                        topGapsInProjects.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs">
                            <span className="text-gray-700 dark:text-gray-300 truncate">{item.name}</span>
                            <Badge className="bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200 ml-2 text-xs px-1.5 py-0">{item.count}</Badge>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Card 6 — Top Projects Impacted */}
                <Card className="relative overflow-hidden bg-rose-50/80 dark:bg-rose-950/75 border-rose-200">
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <FolderOpen className="h-24 w-24 opacity-10 text-rose-600" />
                  </div>
                  <CardContent className="relative p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <FolderOpen className="w-4 h-4 text-rose-900 dark:text-rose-300" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
                          <p>Top 3 projects by opportunity ACV that have at least one gap recorded</p>
                        </TooltipContent>
                      </Tooltip>
                      <h3 className="tracking-tight text-[15px] font-bold text-gray-900 dark:text-gray-100 leading-tight">Top Projects</h3>
                    </div>
                    <div className="space-y-1">
                      {gapsLoading ? (
                        <Skeleton className="h-8 w-full" />
                      ) : topProjectsByAcv.length === 0 ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400">No data yet</p>
                      ) : (
                        topProjectsByAcv.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs">
                            <span className="text-gray-700 dark:text-gray-300 truncate">{item.name}</span>
                            <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200 ml-2 text-xs px-1.5 py-0 shrink-0">{formatAcv(item.acv)}</Badge>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
              {refsReady && <GapAnalysisPage key={`gap-analysis-${refsReady}`} filterContainerRef={filterContainerRef} actionContainerRef={actionContainerRef} onFilterStateChange={onFilterStateChange} />}
            </TabsContent>
            <TabsContent value="outcome-intelligence" className="space-y-4">
              {refsReady && <OutcomesDashboard key={`outcome-intelligence-${refsReady}`} filterContainerRef={filterContainerRef} actionContainerRef={actionContainerRef} onFilterStateChange={onFilterStateChange} />}
            </TabsContent>
            {canView("project.dependencies") && (
              <TabsContent value="dependencies" className="space-y-4">
                {refsReady && <DependenciesRegistrySection filterContainerRef={filterContainerRef} onFilterStateChange={onFilterStateChange} />}
              </TabsContent>
            )}
            <TabsContent value="evaluation-requests" className="space-y-4">
              {refsReady && (
                <EvaluationRequestsSection
                  key={`evaluation-requests-${refsReady}`}
                  filterContainerRef={filterContainerRef}
                  actionContainerRef={actionContainerRef}
                  onFilterStateChange={onFilterStateChange}
                />
              )}
            </TabsContent>
            <TabsContent value="assumptions" className="space-y-4">
              {refsReady && <AssumptionsLibraryTab filterContainerRef={filterContainerRef} onFilterStateChange={onFilterStateChange} />}
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
