import { SolutionGraphic } from "@/components/ui/solution-graphic";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { SubNavPopover } from "@/components/ui/sub-nav-popover";
import { FileText, Link, Search, FolderCode, Terminal, FileCode, Code, FileJson, Database, Settings, Braces, Hash } from "lucide-react";
import type { ElementType } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SearchFiltersSection, FilterLabel } from "@/components/ui/search-filters-section";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import DocumentsSection from "./DocumentsSection";
import LinksSection from "./LinksSection";
import CodeScriptsSection from "./CodeScriptsSection";

type ArtifactView = "documents" | "links" | "code-scripts";

const documentTypes = [
  "Architecture",
  "Product Info",
  "Visio",
  "Reference",
  "Documentation",
  "Battlecard",
  "Datasheet",
  "Internal Notes",
  "Win/Loss Info",
  "Demo Notes",
  "Other"
];

const linkTypes = [
  "Documentation",
  "Tutorial",
  "Reference",
  "Product Info",
  "Support",
  "Demo",
  "Video",
  "Download", 
  "Architecture",
  "CloudLAB",
  "Portal",
  "Battlecard",
  "Analyst",
  "Website",
  "Other"
];

const scriptTypeConfig: Record<string, { icon: ElementType; color: string }> = {
  "PowerShell": { icon: Terminal, color: "text-blue-500" },
  "JavaScript": { icon: FileCode, color: "text-yellow-500" },
  "TypeScript": { icon: FileCode, color: "text-blue-600" },
  "Python": { icon: Code, color: "text-green-500" },
  "Bash": { icon: Terminal, color: "text-gray-600" },
  "JSON": { icon: FileJson, color: "text-orange-500" },
  "SQL": { icon: Database, color: "text-purple-500" },
  "YAML": { icon: Settings, color: "text-pink-500" },
  "XML": { icon: Braces, color: "text-red-500" },
  "CSS": { icon: Hash, color: "text-cyan-500" },
  "HTML": { icon: FileText, color: "text-orange-600" },
  "Go": { icon: Code, color: "text-sky-500" },
  "Rust": { icon: Code, color: "text-amber-600" },
  "C#": { icon: Code, color: "text-violet-500" },
  "Other": { icon: FileText, color: "text-slate-500" },
};

const scriptTypes = Object.keys(scriptTypeConfig);

export default function ArtifactsSection() {
  const [location] = useLocation();
  const [activeView, setActiveView] = useState<ArtifactView>("documents");
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedSolution, setSelectedSolution] = useState("all");

  const { data: products = [] } = useQuery({
    queryKey: ['/api/products'],
    queryFn: () => apiRequest('GET', '/api/products')
  });

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const subtabParam = urlParams.get('subtab');
    if (subtabParam && ['documents', 'links', 'code-scripts'].includes(subtabParam)) {
      setActiveView(subtabParam as ArtifactView);
    }
  }, [location]);

  useEffect(() => {
    const handleNavigation = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const subtabParam = urlParams.get('subtab');
      if (subtabParam && ['documents', 'links', 'code-scripts'].includes(subtabParam)) {
        setActiveView(subtabParam as ArtifactView);
      }
    };

    window.addEventListener('popstate', handleNavigation);
    return () => window.removeEventListener('popstate', handleNavigation);
  }, []);

  const handleTabChange = (value: string) => {
    setActiveView(value as ArtifactView);
    const newUrl = `/project?tab=artifacts&subtab=${value}`;
    window.history.pushState(null, '', newUrl);
  };

  const toggleOptions = [
    {
      id: "documents" as const,
      label: "Documents",
      icon: FileText,
      description: "Manage project documents and shared resources"
    },
    {
      id: "links" as const,
      label: "Links",
      icon: Link,
      description: "Manage useful links and resources for projects"
    },
    {
      id: "code-scripts" as const,
      label: "Code & Scripts",
      icon: FolderCode,
      description: "Manage code snippets and scripts"
    }
  ];

  const componentsMap = useMemo(() => ({
    documents: (
      <DocumentsSection 
        key="documents"
        searchTerm={searchTerm}
        selectedType={selectedType}
        selectedSolution={selectedSolution}
      />
    ),
    links: (
      <LinksSection 
        key="links"
        searchTerm={searchTerm}
        selectedType={selectedType}
        selectedSolution={selectedSolution}
      />
    ),
    "code-scripts": (
      <CodeScriptsSection 
        key="code-scripts"
        searchTerm={searchTerm}
        selectedType={selectedType}
        selectedSolution={selectedSolution}
      />
    )
  }), [searchTerm, selectedType, selectedSolution]);

  const typeOptions = activeView === "documents" ? documentTypes : activeView === "links" ? linkTypes : scriptTypes;
  const typeLabel = activeView === "documents" ? "Type" : activeView === "links" ? "Link Type" : "Script Type";

  return (
    <TooltipProvider>
      <div data-testid="artifacts" className="space-y-4">
        <SearchFiltersSection>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div>
              <FilterLabel>Search</FilterLabel>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 text-gray-400" size={14} />
                <Input
                  placeholder={`Search ${activeView}...`}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>
            </div>

            <div>
              <FilterLabel>{typeLabel}</FilterLabel>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {typeOptions.map((type) => {
                    const config = activeView === "code-scripts" ? scriptTypeConfig[type] : null;
                    const IconComponent = config?.icon;
                    return (
                      <SelectItem key={type} value={type}>
                        <div className="flex items-center gap-2">
                          {IconComponent && <IconComponent className={`h-4 w-4 ${config.color}`} />}
                          {type}
                        </div>
                      </SelectItem>
                    );
                  })}
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
                  {(products as any[]).map((product: any) => (
                    <SelectItem key={product.id} value={product.id.toString()}>
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
        </SearchFiltersSection>

        <div className="space-y-2">
          <SubNavPopover
            items={toggleOptions}
            activeId={activeView}
            onSelect={handleTabChange}
            title="Artifact Type"
          />

          <div>
            {componentsMap[activeView]}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
