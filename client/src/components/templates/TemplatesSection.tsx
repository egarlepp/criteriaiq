import { SolutionGraphic } from "@/components/ui/solution-graphic";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { FolderOpenDot, ChartNetwork, Search, Plus, Blocks } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SearchFiltersSection, FilterLabel } from "@/components/ui/search-filters-section";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import ProjectTemplatesTab from "./ProjectTemplatesTab";
import MapLibraryTab from "./MapLibraryTab";
import ValidationCriteriaTemplateBuilder from "../validation-criteria/ValidationCriteriaTemplateBuilder";
import { CriteriaBuilderProvider } from "../validation-criteria/CriteriaBuilderStepper";
import { JourneyStagesSection, VALUE_JOURNEY_SECTION } from "../value-journey/JourneyStagesSection";
import { buildLinksFromEntities } from "@/lib/link-utils";
import { usePermissions } from "@/hooks/usePermissions";

type TemplateView = "project-templates" | "criteria-builder" | "map-library" | "value-journey";
const TEMPLATE_VIEWS: TemplateView[] = ["project-templates", "criteria-builder", "map-library", "value-journey"];

function viewFromTab(tab: string | null): TemplateView | null {
  return tab && TEMPLATE_VIEWS.includes(tab as TemplateView) ? (tab as TemplateView) : null;
}

export default function TemplatesSection() {
  const [location, setLocation] = useLocation();
  const [activeView, setActiveView] = useState<TemplateView>("project-templates");
  const { canView } = usePermissions();
  const canViewJourney = canView(VALUE_JOURNEY_SECTION);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSolution, setSelectedSolution] = useState("all");
  const [selectedScope, setSelectedScope] = useState("all");
  const [selectedVisibility, setSelectedVisibility] = useState("all");
  const [selectedTags, setSelectedTags] = useState("all");
  const [selectedEnvironment, setSelectedEnvironment] = useState("all");

  const { data: allProducts = [] } = useQuery<Array<{id: number, name: string, isActive: boolean, solutionIcon?: string; solutionIconName?: string | null}>>({
    queryKey: ["/api/products"],
    staleTime: 0,
  });

  const products = allProducts.filter(product => product.isActive !== false);

  const { data: systemTags = [] } = useQuery<Array<{id: number, name: string, description: string, color: string}>>({
    queryKey: ["/api/tags"],
    staleTime: 0,
  });

  const { data: solutions = [] } = useQuery<any[]>({
    queryKey: ["/api/products", { showInactive: false }],
    queryFn: () => apiRequest("GET", `/api/products?showInactive=false`),
    staleTime: 60000,
    select: (data: any[]) => data.map((product: any) => ({
      id: product.id,
      name: product.name,
      abbreviation: product.abbreviation,
      description: product.description,
      tags: product.tags || [],
      isActive: product.isActive !== false,
      solutionIcon: product?.solutionIcon ?? undefined, solutionIconName: product?.solutionIconName ?? null,
    })),
  });

  const { data: criteriaData = [] } = useQuery<any[]>({
    queryKey: ["/api/criteriaWithRelationships", { showInactive: false }],
    queryFn: async () => {
      const data: any[] = await apiRequest("GET", `/api/criteria?showInactive=false`);
      const relationshipPromises = data
        .filter(c => c.id !== undefined && c.id !== null)
        .map(async (c) => {
          try {
            const linkedProducts = await apiRequest("GET", `/api/success-criteria/links/products-for-criteria/${c.id}`);
            return { id: c.id, solutionIds: linkedProducts };
          } catch { return { id: c.id, solutionIds: [] }; }
        });
      const relationships = await Promise.all(relationshipPromises);
      return data.map(c => {
        const rel = relationships.find(r => r.id === c.id);
        return { ...c, solutionIds: rel ? rel.solutionIds : [], isActive: c.isActive !== false };
      });
    },
    staleTime: 60000,
  });

  const { data: components = [] } = useQuery<any[]>({
    queryKey: ["/api/components", { showInactive: false }],
    queryFn: () => apiRequest("GET", `/api/components?showInactive=false`),
    staleTime: 60000,
    select: (data: any[]) => data.map((component: any) => ({
      id: component.id,
      name: component.name,
      description: component.description,
      solutionIds: component.solutionIds || [],
      isAllSolutions: component.isAllSolutions || false,
      isActive: component.isActive !== false,
    })),
  });

  const { data: expectedOutcomes = [] } = useQuery<any[]>({
    queryKey: ["/api/outcomesWithRelationships", { showInactive: false }],
    queryFn: async () => {
      const data: any[] = await apiRequest("GET", `/api/outcomes?showInactive=false`);
      const relationshipPromises = data
        .filter(o => o.id !== undefined && o.id !== null)
        .map(async (o) => {
          try {
            const linkedCriteria = await apiRequest("GET", `/api/success-criteria/links/criteria-for-outcome/${o.id}`);
            return { id: o.id, criteriaIds: linkedCriteria };
          } catch { return { id: o.id, criteriaIds: [] }; }
        });
      const relationships = await Promise.all(relationshipPromises);
      return data.map(o => {
        const rel = relationships.find(r => r.id === o.id);
        return { ...o, criteriaIds: rel ? rel.criteriaIds : [], isActive: o.isActive !== false, solutionIds: o.solutionIds || [] };
      });
    },
    staleTime: 60000,
  });

  const { data: actionItems = [] } = useQuery<any[]>({
    queryKey: ["/api/actionsWithRelationships", { showInactive: false }],
    queryFn: async () => {
      const data: any[] = await apiRequest("GET", `/api/actions?showInactive=false`);
      const relationshipPromises = data
        .filter(a => a.id !== undefined && a.id !== null)
        .map(async (a) => {
          try {
            const linkedOutcomes = await apiRequest("GET", `/api/success-criteria/links/outcomes-for-action/${a.id}`);
            return { id: a.id, outcomeIds: linkedOutcomes };
          } catch { return { id: a.id, outcomeIds: [] }; }
        });
      const relationships = await Promise.all(relationshipPromises);
      return data.map(a => {
        const rel = relationships.find(r => r.id === a.id);
        return { ...a, outcomeIds: rel ? rel.outcomeIds : [], isActive: a.isActive !== false, solutionIds: a.solutionIds || [] };
      });
    },
    staleTime: 60000,
  });

  const { data: valueMappings = [] } = useQuery<any[]>({
    queryKey: ["/api/value-mappings"],
    queryFn: () => apiRequest("GET", `/api/value-mappings?showInactive=false`),
    staleTime: 60000,
  });

  const globalLibrary = useMemo(() => {
    const entities = {
      solution: solutions.map((s: any) => ({ ...s, type: 'solution' })),
      component: components.map((c: any) => ({ ...c, type: 'component' })),
      value_mapping: valueMappings.map((v: any) => ({ ...v, type: 'value_mapping' })),
      criteria: criteriaData.map((c: any) => ({ ...c, type: 'criteria' })),
      outcome: expectedOutcomes.map((o: any) => ({ ...o, type: 'outcome' })),
      action: actionItems.map((a: any) => ({ ...a, type: 'action' }))
    };
    const links = buildLinksFromEntities({
      solution: solutions,
      component: components,
      value_mapping: valueMappings,
      criteria: criteriaData,
      outcome: expectedOutcomes,
      action: actionItems
    });
    return { ...entities, links };
  }, [solutions, components, valueMappings, criteriaData, expectedOutcomes, actionItems]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const view = viewFromTab(urlParams.get('tab'));
    if (view) setActiveView(view);
  }, [location]);

  useEffect(() => {
    const handleNavigation = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const view = viewFromTab(urlParams.get('tab'));
      if (view) setActiveView(view);
    };

    window.addEventListener('popstate', handleNavigation);
    return () => window.removeEventListener('popstate', handleNavigation);
  }, []);

  const handleTabChange = (value: string) => {
    setActiveView(value as TemplateView);
    setSearchTerm("");
    setSelectedSolution("all");
    setSelectedScope("all");
    setSelectedVisibility("all");
    setSelectedTags("all");
    setSelectedEnvironment("all");
    const newUrl = `/templates?tab=${value}`;
    window.history.pushState(null, '', newUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const handleCreateTemplate = () => {
    localStorage.setItem("pendingTemplateData", JSON.stringify({ mode: 'create-template' }));
    setLocation("/edit-template");
  };

  const handleCreateMapTemplate = () => {
    const createButton = document.querySelector('[data-create-map-template="true"]') as HTMLButtonElement;
    if (createButton) createButton.click();
  };

  const renderActionButton = () => {
    switch (activeView) {
      case "project-templates":
        return (
          <Button size="sm" onClick={handleCreateTemplate} className="h-9">
            <FolderOpenDot className="h-4 w-4 mr-2" />
            Create Project Template
          </Button>
        );
      case "map-library":
        return (
          <Button size="sm" onClick={handleCreateMapTemplate} className="h-9">
            <ChartNetwork className="h-4 w-4 mr-2" />
            Create MAP Template
          </Button>
        );
      default:
        return null;
    }
  };

  const renderFilters = () => {
    switch (activeView) {
      case "project-templates":
        return (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
            <div>
              <FilterLabel>Search</FilterLabel>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 text-gray-400" size={14} />
                <Input
                  placeholder="Search templates..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>
            </div>
            <div>
              <FilterLabel>Tags</FilterLabel>
              <Select value={selectedTags} onValueChange={setSelectedTags}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="All Tags" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tags</SelectItem>
                  {systemTags?.map((tag: any) => (
                    <SelectItem key={tag.id} value={tag.name}>{tag.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FilterLabel>Solutions</FilterLabel>
              <Select value={selectedSolution} onValueChange={setSelectedSolution}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="All Solutions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Solutions</SelectItem>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.name}>
                      <div className="flex items-center gap-2">
                        <SolutionGraphic graphic={product.solutionIcon} icon={product.solutionIconName} name={product.name} className="w-4 h-4" />
                        {product.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FilterLabel>Environment</FilterLabel>
              <Select value={selectedEnvironment} onValueChange={setSelectedEnvironment}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="All Environments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Environments</SelectItem>
                  <SelectItem value="CloudLAB">CloudLAB</SelectItem>
                  <SelectItem value="OnPremise Production">OnPremise Production</SelectItem>
                  <SelectItem value="OnPremise PreProd">OnPremise PreProd</SelectItem>
                  <SelectItem value="SaaS">SaaS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case "map-library":
        return (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
            <div>
              <FilterLabel>Search</FilterLabel>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 text-gray-400" size={14} />
                <Input
                  placeholder="Search MAP templates..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>
            </div>
            <div>
              <FilterLabel>Scope</FilterLabel>
              <Select value={selectedScope} onValueChange={setSelectedScope}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="All Scopes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Scopes</SelectItem>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="application">Application</SelectItem>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="project">Project</SelectItem>
                  <SelectItem value="partner">Partner</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <FilterLabel>Visibility</FilterLabel>
              <Select value={selectedVisibility} onValueChange={setSelectedVisibility}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="All Visibility" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Visibility</SelectItem>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <FilterLabel>Solutions</FilterLabel>
              <Select value={selectedSolution} onValueChange={setSelectedSolution}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="All Solutions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Solutions</SelectItem>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.name}>
                      <div className="flex items-center gap-2">
                        <SolutionGraphic graphic={product.solutionIcon} icon={product.solutionIconName} name={product.name} className="w-4 h-4" />
                        {product.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const componentsMap = useMemo(() => ({
    "project-templates": (
      <ProjectTemplatesTab 
        key="project-templates"
        searchTerm={searchTerm}
        selectedSolution={selectedSolution}
        selectedTags={selectedTags}
        selectedEnvironment={selectedEnvironment}
        hideFilters={true}
      />
    ),
    "criteria-builder": (
      <CriteriaBuilderProvider key="criteria-builder">
        <ValidationCriteriaTemplateBuilder globalLibrary={globalLibrary} />
      </CriteriaBuilderProvider>
    ),
    "map-library": (
      <MapLibraryTab 
        key="map-library"
        searchTerm={searchTerm}
        selectedSolution={selectedSolution}
        selectedScope={selectedScope}
        selectedVisibility={selectedVisibility}
        hideFilters={true}
      />
    )
  }), [searchTerm, selectedSolution, selectedScope, selectedVisibility, selectedTags, selectedEnvironment, globalLibrary]);

  return (
    <TooltipProvider>
      <div data-testid="project-templates" className="space-y-0">
        <div className="max-w-full mx-auto space-y-6 h-full">
          <Tabs value={activeView} onValueChange={handleTabChange} className="space-y-4">
            {/* The tab bar comes from the sidebar (PageLayout's SectionTabBar). */}

            <div className="space-y-4">

              {activeView !== "criteria-builder" && activeView !== "value-journey" && (
                <SearchFiltersSection actions={renderActionButton()}>
                  {renderFilters()}
                </SearchFiltersSection>
              )}

              <div>
                <TabsContent value="project-templates" className="mt-0 space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-2xl">
                        <FolderOpenDot className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        Project Templates
                      </CardTitle>
                      <CardDescription>
                        Create and manage reusable project templates for quick project setup. Templates define default settings, solutions, timelines, and tags to standardize how new projects are created.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {componentsMap["project-templates"]}
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="criteria-builder" className="mt-0 space-y-4">
                  <Card>
                    <CardHeader className="pt-[24px] pb-[8px]">
                      <CardTitle className="flex items-center gap-2 text-2xl">
                        <Blocks className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        Validation Criteria Builder
                      </CardTitle>
                      <CardDescription>Validation Criteria Template Builder lets you model Project success paths by linking Solutions, Components, Criteria, Expected Outcomes, and Actions Taken, mapping to the overall core business Value. Admins can compose, validate, and reuse templates with inline editing, duplicate guards, and a publish-ready preview for consistent, auditable delivery.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {componentsMap["criteria-builder"]}
                    </CardContent>
                  </Card>
                </TabsContent>
                {canViewJourney && (
                  <TabsContent value="value-journey" className="mt-0 space-y-4">
                    <JourneyStagesSection />
                  </TabsContent>
                )}
                <TabsContent value="map-library" className="mt-0 space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-2xl">
                        <ChartNetwork className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        MAP Template Library
                      </CardTitle>
                      <CardDescription>Manage and create Mutual Action Plan templates with predefined phases, steps, and tasks. Use MAP templates to standardize collaborative project timelines and stakeholder accountability. These templates are shared roadmaps between a sales team and a customer that outlines key steps, responsibilities, and deadlines to close a deal.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {componentsMap["map-library"]}
                    </CardContent>
                  </Card>
                </TabsContent>
              </div>
            </div>
          </Tabs>
        </div>
      </div>
    </TooltipProvider>
  );
}
