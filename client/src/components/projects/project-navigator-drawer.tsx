import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Target, Loader2, X, Users, Building2, Package, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectNavigatorDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentProjectId?: number;
}

export function ProjectNavigatorDrawer({ 
  open, 
  onOpenChange, 
  currentProjectId 
}: ProjectNavigatorDrawerProps) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [engineerFilter, setEngineerFilter] = useState<string>("all");
  const [solutionFilter, setSolutionFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  const { data: projectsData, isLoading: projectsLoading } = useQuery({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const response = await fetch("/api/projects", { credentials: "include" });
      if (!response.ok) return [];
      const data = await response.json();
      return data.projects || data || [];
    },
    enabled: open,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const response = await fetch("/api/products", { credentials: "include" });
      if (!response.ok) return [];
      const data = await response.json();
      return data.products || data || [];
    },
    enabled: open,
  });

  const { data: usersData = [] } = useQuery({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const response = await fetch("/api/users", { credentials: "include" });
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: open,
  });

  const solutionAbbreviationMap = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((product: any) => {
      if (product.name && product.abbreviation) {
        map.set(product.name.toLowerCase(), product.abbreviation);
      }
    });
    return map;
  }, [products]);

  const getSolutionAbbreviations = (solutionInput: any): string => {
    if (!solutionInput) return "";
    
    let solutions: string[] = [];
    
    if (Array.isArray(solutionInput)) {
      solutions = solutionInput.map(s => String(s).trim());
    } else if (typeof solutionInput === 'string') {
      try {
        const parsed = JSON.parse(solutionInput);
        if (Array.isArray(parsed)) {
          solutions = parsed.map(s => String(s).trim());
        } else {
          solutions = solutionInput.split(",").map(s => s.trim());
        }
      } catch {
        solutions = solutionInput.split(",").map(s => s.trim());
      }
    }
    
    const abbreviations = solutions.map(solution => {
      if (!solution) return "";
      
      const normalized = solution.toLowerCase();
      const abbr = solutionAbbreviationMap.get(normalized);
      if (abbr) return abbr;
      
      return solution.length > 15 ? solution.substring(0, 12) + "..." : solution;
    }).filter(Boolean);
    
    return abbreviations.join("|");
  };

  const toTitleCase = (str: string): string => {
    if (!str) return "";
    return str.replace(/\b\w/g, char => char.toUpperCase());
  };

  const formatCurrency = (value: any): string => {
    if (value === null || value === undefined || value === "") return "N/A";
    
    let num: number;
    if (typeof value === 'string') {
      const cleaned = value.replace(/[$,]/g, '').trim();
      if (!cleaned) return "N/A";
      num = parseFloat(cleaned);
    } else {
      num = value;
    }
    
    if (isNaN(num) || num === 0) return "N/A";
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0 
    }).format(num);
  };

  const getEngineerName = (project: any): string => {
    if (project.primarySe) {
      const firstName = project.primarySe.firstName || "";
      const lastName = project.primarySe.lastName || "";
      return `${firstName} ${lastName}`.trim() || project.primarySe.email || "N/A";
    }
    return "N/A";
  };

  const getCustomerName = (project: any): string => {
    return project.customer?.name || project.customerName || "Unknown";
  };

  const uniqueCustomers = useMemo(() => {
    if (!projectsData || !Array.isArray(projectsData)) return [];
    const seen = new Set<string>();
    const names: string[] = [];
    for (const project of projectsData) {
      const name = project.customerName;
      if (name && !seen.has(name)) {
        seen.add(name);
        names.push(name);
      }
    }
    return names.sort((a, b) => a.localeCompare(b));
  }, [projectsData]);

  const uniqueEngineers = useMemo(() => {
    if (!usersData || !Array.isArray(usersData)) return [];
    return usersData
      .filter((user: any) => 
        user.role === "Engineer" || user.role === "Admin" || user.role === "CX" ||
        user.role === "engineer" || user.role === "admin" || user.role === "cx"
      )
      .sort((a: any, b: any) => {
        const aName = `${a.firstName || ""} ${a.lastName || ""}`.trim();
        const bName = `${b.firstName || ""} ${b.lastName || ""}`.trim();
        return aName.localeCompare(bName);
      });
  }, [usersData]);

  const uniqueSolutions = useMemo(() => {
    if (!products) return [];
    return products
      .filter((p: any) => p.name && p.abbreviation)
      .sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
  }, [products]);

  const filteredProjects = useMemo(() => {
    if (!projectsData) return [];
    
    const filtered = projectsData.filter((project: any) => {
      if (customerFilter !== "all") {
        if (project.customerName !== customerFilter) return false;
      }
      
      if (engineerFilter !== "all") {
        const engineerId = project.primaryEngineerId || project.primarySe?.id;
        if (String(engineerId) !== engineerFilter) return false;
      }
      
      if (solutionFilter !== "all") {
        const solutionNames = project.solutionName || [];
        const selectedProduct = products.find((p: any) => String(p.id) === solutionFilter);
        if (!selectedProduct) return false;
        
        const hasSolution = Array.isArray(solutionNames) 
          ? solutionNames.some((s: string) => 
              s.toLowerCase().includes(selectedProduct.name.toLowerCase()) ||
              s.toLowerCase().includes(selectedProduct.name.replace(/^Internal\s+/i, "").toLowerCase())
            )
          : String(solutionNames).toLowerCase().includes(selectedProduct.name.toLowerCase());
        
        if (!hasSolution) return false;
      }
      
      return true;
    });

    return filtered.sort((a: any, b: any) => 
      sortOrder === "desc" ? b.id - a.id : a.id - b.id
    );
  }, [projectsData, customerFilter, engineerFilter, solutionFilter, products, sortOrder]);

  const handleProjectClick = (projectId: number) => {
    onOpenChange(false);
    setLocation(`/edit-project/${projectId}`);
  };

  const clearFilters = () => {
    setCustomerFilter("all");
    setEngineerFilter("all");
    setSolutionFilter("all");
  };

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === "desc" ? "asc" : "desc");
  };

  const hasActiveFilters = customerFilter !== "all" || engineerFilter !== "all" || solutionFilter !== "all";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-blue-600" />
            {t('projects.navigator.title')}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <Select value={customerFilter} onValueChange={setCustomerFilter}>
                <SelectTrigger className="h-8 w-[130px]">
                  <SelectValue placeholder={t('projects.navigator.allAccounts')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('projects.navigator.allAccounts')}</SelectItem>
                  {uniqueCustomers.map((name: string) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <Select value={engineerFilter} onValueChange={setEngineerFilter}>
                <SelectTrigger className="h-8 w-[130px]">
                  <SelectValue placeholder={t('projects.navigator.allEngineers')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('projects.navigator.allEngineers')}</SelectItem>
                  {uniqueEngineers.map((user: any) => (
                    <SelectItem key={user.id} value={String(user.id)}>
                      {`${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <Select value={solutionFilter} onValueChange={setSolutionFilter}>
                <SelectTrigger className="h-8 w-[140px]">
                  <SelectValue placeholder={t('projects.navigator.allSolutions')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('projects.navigator.allSolutions')}</SelectItem>
                  {uniqueSolutions.map((product: any) => (
                    <SelectItem key={product.id} value={String(product.id)}>
                      {product.abbreviation} - {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-8 px-2"
              >
                <X className="h-3.5 w-3.5 mr-1" />
                {t('projects.navigator.clear')}
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {t('projects.navigator.projectsFound', { count: filteredProjects.length })}
            </span>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={toggleSortOrder}
              className="h-8 px-2"
            >
              {sortOrder === "desc" ? (
                <ArrowDown className="h-3.5 w-3.5 mr-1" />
              ) : (
                <ArrowUp className="h-3.5 w-3.5 mr-1" />
              )}
              ID
            </Button>
          </div>

          <ScrollArea className="h-[calc(100vh-220px)]">
            {projectsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {t('projects.navigator.noProjectsFound')}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredProjects.map((project: any) => {
                  const isCurrentProject = project.id === currentProjectId;
                  const status = toTitleCase(project.status || "Unknown");
                  const customer = getCustomerName(project);
                  const acv = formatCurrency(project.opportunityAcvValue);
                  const engineer = getEngineerName(project);
                  const solutions = getSolutionAbbreviations(project.solutionName);
                  
                  return (
                    <div key={project.id} className="relative">
                      {isCurrentProject && (
                        <div className="absolute left-0 inset-y-0 w-[2px] rounded-full bg-primary" />
                      )}
                      <button
                        type="button"
                        onClick={() => handleProjectClick(project.id)}
                        className={cn(
                          "w-full text-left px-3 py-2.5 rounded-md transition-colors",
                          "hover:bg-blue-50 hover:text-blue-900 dark:hover:bg-blue-950/40 dark:hover:text-blue-100",
                          "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                          isCurrentProject && "bg-blue-50 dark:bg-blue-950"
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <Target className="h-4 w-4 mt-0.5 text-blue-600 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">
                              #{project.id}({status}): {customer}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {acv} - {engineer} - {solutions || "N/A"}
                            </div>
                          </div>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
