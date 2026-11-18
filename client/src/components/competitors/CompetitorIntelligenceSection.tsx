import { SolutionGraphic } from "@/components/ui/solution-graphic";
import { useState, useEffect, useMemo, RefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FilterLabel, FilterMultiSelectButton } from "@/components/ui/search-filters-section";
import {
  Users,
  Briefcase,
  AlertTriangle,
  BarChart3,
  Search,
  Swords,
  Orbit,
  SquarePen,
  Globe,
  Building2,
  DollarSign,
  Server,
  Layers,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DangerIconButton } from "@/components/shared/danger-icon-button";
import CompetitorDetailDrawer from "./CompetitorDetailDrawer";
import AddCompetitorModal from "./AddCompetitorModal";
import AddTechnologySpaceModal from "./AddTechnologySpaceModal";
import EditTechnologySpaceModal from "./EditTechnologySpaceModal";
import { MetricCard } from "@/components/shared/MetricCard";

interface TechnologySpace {
  id: number;
  code: string;
  name: string;
  description?: string;
  displayOrder?: number;
  color?: string;
}

interface CompetitorListItem {
  id: number;
  name: string;
  slug: string;
  isActive: boolean;
  vendorType?: string;
  pricingPosition?: string;
  deploymentModel?: string;
  companySizeBand?: string;
  summary?: string;
  projectCount: number;
  spaces: Array<{ spaceId: number; code: string; name: string; isPrimary: boolean }>;
  solutions: Array<{ solutionId: number; name: string; abbreviation: string; solutionIcon?: string; solutionIconName?: string | null }>;
}

interface AnalyticsSummary {
  totalCompetitors: number;
  projectsTagged: number;
  highRiskOpps: number;
  mostActiveSpace: string;
}

function hexWithAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function getSpaceStyles(hex: string) {
  const h = hex && hex.startsWith("#") ? hex : "#64748b";
  return {
    chipActive: {
      className: "border text-white shadow-md",
      style: { backgroundColor: h, borderColor: h } as React.CSSProperties,
    },
    chipInactive: {
      className: "border transition-colors",
      style: {
        borderColor: hexWithAlpha(h, 0.35),
        backgroundColor: hexWithAlpha(h, 0.08),
        color: h,
      } as React.CSSProperties,
    },
    codeActive: { style: { color: "rgba(255,255,255,0.85)" } as React.CSSProperties },
    codeInactive: { style: { color: h } as React.CSSProperties },
    countActive: { style: { color: "rgba(255,255,255,0.65)" } as React.CSSProperties },
    countInactive: { style: { color: hexWithAlpha(h, 0.65) } as React.CSSProperties },
    cardBorderLeft: { style: { borderLeftColor: h } as React.CSSProperties },
    cardBg: { style: { backgroundColor: hexWithAlpha(h, 0.06) } as React.CSSProperties },
    badge: {
      style: {
        backgroundColor: hexWithAlpha(h, 0.15),
        color: h,
      } as React.CSSProperties,
    },
    competitorSelected: {
      className: "border shadow-sm",
      style: {
        borderColor: hexWithAlpha(h, 0.6),
        backgroundColor: hexWithAlpha(h, 0.08),
      } as React.CSSProperties,
    },
  };
}

function CompetitorCard({
  competitor,
  onSelect,
  selected,
  spaceHex,
}: {
  competitor: CompetitorListItem;
  onSelect: () => void;
  selected: boolean;
  spaceHex?: string;
}) {
  const styles = getSpaceStyles(spaceHex ?? "#64748b");
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-xl border p-3.5 transition-all duration-150 group",
        selected
          ? styles.competitorSelected.className
          : "border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-sm"
      )}
      style={selected ? styles.competitorSelected.style : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap mb-1">
            {competitor.vendorType && (
              <span className="inline-flex rounded-full bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 text-[10px] font-medium text-blue-800 dark:text-blue-300">
                {competitor.vendorType}
              </span>
            )}
            {competitor.deploymentModel && (
              <span className="inline-flex rounded-full bg-orange-100 dark:bg-orange-900/40 px-2 py-0.5 text-[10px] font-medium text-orange-800 dark:text-orange-300">
                {competitor.deploymentModel}
              </span>
            )}
            {competitor.companySizeBand && (
              <span className="inline-flex rounded-full bg-purple-100 dark:bg-purple-900/40 px-2 py-0.5 text-[10px] font-medium text-purple-800 dark:text-purple-300">
                {competitor.companySizeBand}
              </span>
            )}
            {competitor.pricingPosition && (
              <span className="inline-flex rounded-full bg-green-100 dark:bg-green-900/40 px-2 py-0.5 text-[10px] font-medium text-green-800 dark:text-green-300">
                {competitor.pricingPosition}
              </span>
            )}
          </div>
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors">
            {competitor.name}
          </div>
          {competitor.projectCount > 0 && (
            <span className="inline-flex mt-1 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:text-gray-400">
              {competitor.projectCount} {competitor.projectCount === 1 ? "project" : "projects"}
            </span>
          )}
        </div>
        {competitor.solutions.length > 0 && (
          <div className="flex flex-col items-center gap-1 shrink-0">
            {competitor.solutions.map((s) => (
              s.solutionIcon || s.solutionIconName ? (
                <span key={s.solutionId} title={s.name} className="inline-flex">
                  <SolutionGraphic graphic={s.solutionIcon} icon={s.solutionIconName} name={s.name} className="w-5 h-5" />
                </span>
              ) : (
                <span key={s.solutionId} title={s.name} className="inline-flex">
                  <Layers className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                </span>
              )
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

function SpaceGroupCard({
  space,
  competitors,
  activeCompetitorId,
  onSelectCompetitor,
}: {
  space: TechnologySpace;
  competitors: CompetitorListItem[];
  activeCompetitorId: number | null;
  onSelectCompetitor: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const styles = getSpaceStyles(space.color ?? "#64748b");

  return (
    <div
      className="rounded-2xl border border-gray-200 dark:border-gray-800 border-l-4 p-4"
      style={{ ...styles.cardBorderLeft.style, ...styles.cardBg.style }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center justify-between w-full mb-3"
      >
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-bold uppercase tracking-widest rounded px-1.5 py-0.5"
            style={styles.badge.style}
          >
            {space.code}
          </span>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{space.name}</span>
          <span className="rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-0.5 text-[10px] font-medium text-gray-500">
            {competitors.length}
          </span>
        </div>
        {expanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
      </button>
      {expanded && (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {competitors.map((c) => (
            <CompetitorCard
              key={c.id}
              competitor={c}
              selected={activeCompetitorId === c.id}
              onSelect={() => onSelectCompetitor(c.id)}
              spaceHex={space.color ?? "#64748b"}
            />
          ))}
          {competitors.length === 0 && (
            <p className="text-sm text-gray-400 italic col-span-full">No competitors mapped to this space yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

interface CompetitorIntelligenceSectionProps {
  filterContainerRef?: RefObject<HTMLDivElement | null>;
  onFilterStateChange?: (count: number, clearFn: () => void) => void;
}

export default function CompetitorIntelligenceSection({
  filterContainerRef,
  onFilterStateChange,
}: CompetitorIntelligenceSectionProps) {
  const queryClient = useQueryClient();
  const [selectedSpace, setSelectedSpace] = useState<string | null>(null);
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [solutionFilter, setSolutionFilter] = useState<string[]>([]);
  const [vendorTypeFilter, setVendorTypeFilter] = useState("all");
  const [deploymentFilter, setDeploymentFilter] = useState("all");
  const [companySizeFilter, setCompanySizeFilter] = useState("all");
  const [pricingFilter, setPricingFilter] = useState("all");
  const [selectedCompetitorId, setSelectedCompetitorId] = useState<number | null>(null);
  const [addCompetitorOpen, setAddCompetitorOpen] = useState(false);
  const [addSpaceOpen, setAddSpaceOpen] = useState(false);
  const [editingSpace, setEditingSpace] = useState<TechnologySpace | null>(null);

  const { data: spaces = [], isLoading: spacesLoading } = useQuery<TechnologySpace[]>({
    queryKey: ["/api/technology-spaces"],
    queryFn: () => fetch("/api/technology-spaces").then((r) => r.json()),
  });

  const { data: competitorList = [], isLoading: competitorsLoading } = useQuery<CompetitorListItem[]>({
    queryKey: ["/api/competitors", searchQuery],
    queryFn: () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set("search", searchQuery);
      return fetch(`/api/competitors?${params}`).then((r) => r.json());
    },
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<AnalyticsSummary>({
    queryKey: ["/api/competitors/analytics/summary"],
    queryFn: () => fetch("/api/competitors/analytics/summary").then((r) => r.json()),
  });

  const { data: solutions = [] } = useQuery<any[]>({
    queryKey: ["/api/products"],
    queryFn: () => fetch("/api/products").then((r) => r.json()),
  });

  const deleteSpaceMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/technology-spaces/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/technology-spaces"] });
      queryClient.invalidateQueries({ queryKey: ["/api/competitors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/competitors/analytics/summary"] });
      if (selectedSpace) setSelectedSpace(null);
    },
  });

  const vendorTypeOptions = useMemo(() =>
    [...new Set(competitorList.map((c) => c.vendorType).filter(Boolean))] as string[],
    [competitorList]);
  const deploymentOptions = useMemo(() =>
    [...new Set(competitorList.map((c) => c.deploymentModel).filter(Boolean))] as string[],
    [competitorList]);
  const companySizeOptions = useMemo(() =>
    [...new Set(competitorList.map((c) => c.companySizeBand).filter(Boolean))] as string[],
    [competitorList]);
  const pricingOptions = useMemo(() =>
    [...new Set(competitorList.map((c) => c.pricingPosition).filter(Boolean))] as string[],
    [competitorList]);

  const filteredCompetitors = useMemo(() => {
    return competitorList.filter((c) => {
      if (solutionFilter.length > 0 && !c.solutions.some((s) => solutionFilter.includes(s.name))) return false;
      if (vendorTypeFilter !== "all" && c.vendorType !== vendorTypeFilter) return false;
      if (deploymentFilter !== "all" && c.deploymentModel !== deploymentFilter) return false;
      if (companySizeFilter !== "all" && c.companySizeBand !== companySizeFilter) return false;
      if (pricingFilter !== "all" && c.pricingPosition !== pricingFilter) return false;
      return true;
    });
  }, [competitorList, solutionFilter, vendorTypeFilter, deploymentFilter, companySizeFilter, pricingFilter]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchQuery) count++;
    if (solutionFilter.length > 0) count++;
    if (vendorTypeFilter !== "all") count++;
    if (deploymentFilter !== "all") count++;
    if (companySizeFilter !== "all") count++;
    if (pricingFilter !== "all") count++;
    if (selectedSpace) count++;
    return count;
  }, [searchQuery, solutionFilter, vendorTypeFilter, deploymentFilter, companySizeFilter, pricingFilter, selectedSpace]);

  const clearAllFilters = () => {
    setSearchQuery("");
    setSolutionFilter([]);
    setVendorTypeFilter("all");
    setDeploymentFilter("all");
    setCompanySizeFilter("all");
    setPricingFilter("all");
    setSelectedSpace(null);
  };

  useEffect(() => {
    if (onFilterStateChange) {
      onFilterStateChange(activeFilterCount, clearAllFilters);
    }
  }, [activeFilterCount, onFilterStateChange]);

  const spaceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of filteredCompetitors) {
      for (const s of c.spaces) {
        counts[s.code] = (counts[s.code] ?? 0) + 1;
      }
    }
    return counts;
  }, [filteredCompetitors]);

  const filteredBySpace = useMemo(() => {
    if (!selectedSpace) return filteredCompetitors;
    return filteredCompetitors.filter((c) => c.spaces.some((s) => s.code === selectedSpace));
  }, [filteredCompetitors, selectedSpace]);

  const groupedBySpace = useMemo(() => {
    if (selectedSpace) {
      const space = spaces.find((s) => s.code === selectedSpace);
      return space ? [{ space, competitors: filteredBySpace }] : [];
    }
    return spaces
      .map((space) => ({
        space,
        competitors: filteredCompetitors.filter((c) => c.spaces.some((s) => s.code === space.code)),
      }))
      .filter((g) => g.competitors.length > 0);
  }, [spaces, filteredCompetitors, selectedSpace, filteredBySpace]);

  const ungrouped = useMemo(() => {
    return filteredCompetitors.filter((c) => c.spaces.length === 0);
  }, [filteredCompetitors]);

  const filterContent = (
    <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <div>
        <FilterLabel>Search</FilterLabel>
        <div className="relative w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            className="pl-8 h-9 rounded-xl text-sm w-full"
            placeholder="Search competitors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <div>
        <FilterLabel>Solutions</FilterLabel>
        <Popover>
          <PopoverTrigger asChild>
            <FilterMultiSelectButton className="h-9 text-sm">
              Solutions {solutionFilter.length > 0 && `(${solutionFilter.length})`}
            </FilterMultiSelectButton>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Select Solutions</h4>
              <div className="grid gap-2 max-h-60 overflow-y-auto">
                {solutions.map((s: any) => (
                  <div key={s.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`sol-${s.id}`}
                      checked={solutionFilter.includes(s.name)}
                      onCheckedChange={(checked) => {
                        setSolutionFilter(checked
                          ? [...solutionFilter, s.name]
                          : solutionFilter.filter((n) => n !== s.name));
                      }}
                    />
                    <label htmlFor={`sol-${s.id}`} className="text-sm flex items-center gap-2 cursor-pointer">
                      <SolutionGraphic graphic={s.solutionIcon} icon={s.solutionIconName} name={s.name} className="w-4 h-4 object-contain" />
                      {s.name}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <div>
        <FilterLabel>Vendor Type</FilterLabel>
        <Select value={vendorTypeFilter} onValueChange={setVendorTypeFilter}>
          <SelectTrigger className="h-9 rounded-xl text-sm">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {vendorTypeOptions.map((v) => (
              <SelectItem key={v} value={v}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <FilterLabel>Deployment</FilterLabel>
        <Select value={deploymentFilter} onValueChange={setDeploymentFilter}>
          <SelectTrigger className="h-9 rounded-xl text-sm">
            <SelectValue placeholder="All Models" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Models</SelectItem>
            {deploymentOptions.map((v) => (
              <SelectItem key={v} value={v}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <FilterLabel>Company Size</FilterLabel>
        <Select value={companySizeFilter} onValueChange={setCompanySizeFilter}>
          <SelectTrigger className="h-9 rounded-xl text-sm">
            <SelectValue placeholder="All Sizes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sizes</SelectItem>
            {companySizeOptions.map((v) => (
              <SelectItem key={v} value={v}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <FilterLabel>Pricing Position</FilterLabel>
        <Select value={pricingFilter} onValueChange={setPricingFilter}>
          <SelectTrigger className="h-9 rounded-xl text-sm">
            <SelectValue placeholder="All Positions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Positions</SelectItem>
            {pricingOptions.map((v) => (
              <SelectItem key={v} value={v}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Page Header — Card */}
      <Card className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shadow-sm rounded-2xl">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2.5 mb-1.5">
                <Swords className="h-6 w-6 text-blue-600 dark:text-blue-400 shrink-0" />
                <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Competitor Intelligence</h2>
              </div>
              <CardDescription>
                Track competitors by technology space, attach them to projects, and keep battlecard context close to the work.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button
                onClick={() => setAddCompetitorOpen(true)}
                className="gap-1.5 rounded-xl"
              >
                <Swords className="h-4 w-4" /> Add Competitor
              </Button>
              <Button
                className="gap-1.5 rounded-xl"
                onClick={() => setAddSpaceOpen(true)}
              >
                <Orbit className="h-4 w-4" /> Add Technology Space
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      {/* Metrics Strip */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Competitors"
          value={summary?.totalCompetitors ?? 0}
          sub="Unique vendors across all spaces"
          icon={<Users className="h-5 w-5" />}
          loading={summaryLoading}
          color="purple"
        />
        <MetricCard
          title="Projects Tagged"
          value={summary?.projectsTagged ?? 0}
          sub="Projects with competitor associations"
          icon={<Briefcase className="h-5 w-5" />}
          loading={summaryLoading}
          color="blue"
        />
        <MetricCard
          title="High-Risk Opps"
          value={summary?.highRiskOpps ?? 0}
          sub="Projects with an actively evaluated competitor"
          icon={<AlertTriangle className="h-5 w-5" />}
          loading={summaryLoading}
          color="rose"
        />
        <MetricCard
          title="Most Active Space"
          value={summary?.mostActiveSpace ?? "—"}
          sub="Highest competitor density right now"
          icon={<BarChart3 className="h-5 w-5" />}
          loading={summaryLoading}
          color="amber"
        />
      </div>
      {filterContainerRef?.current && createPortal(filterContent, filterContainerRef.current)}

      {/* Technology Spaces + Competitor Library */}
      <Card className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shadow-sm rounded-2xl">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Orbit className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Technology Spaces</h2>
          </div>

          {/* Space Chips */}
          {spacesLoading ? (
            <div className="flex gap-2 flex-wrap">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-28 rounded-2xl" />
              ))}
            </div>
          ) : spaces.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-2">{t("competitors.noSpaces")}</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 pt-[6px] pb-[6px]">
              {spaces.map((space) => {
                const count = spaceCounts[space.code] ?? 0;
                const active = selectedSpace === space.code;
                const styles = getSpaceStyles(space.color ?? "#64748b");
                const chipVariant = active ? styles.chipActive : styles.chipInactive;
                return (
                  <div key={space.id} className="relative group">
                    <button
                      onClick={() => setSelectedSpace(active ? null : space.code)}
                      className={cn(
                        "w-full rounded-2xl p-3.5 text-left transition-all duration-150",
                        chipVariant.className
                      )}
                      style={chipVariant.style}
                    >
                      <div className="text-[10px] font-bold uppercase tracking-widest mb-1 pr-10" style={active ? styles.codeActive.style : styles.codeInactive.style}>
                        {space.code}
                      </div>
                      <div className="text-xs font-semibold leading-tight">{space.name}</div>
                      <div className="mt-1.5 text-[10px]" style={active ? styles.countActive.style : styles.countInactive.style}>
                        {count} {count === 1 ? "competitor" : "competitors"}
                      </div>
                    </button>
                    <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5 z-10">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingSpace(space); }}
                        className="h-6 w-6 flex items-center justify-center rounded-lg bg-white/90 dark:bg-gray-800/90 hover:bg-white dark:hover:bg-gray-700 shadow-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                        title="Edit space"
                      >
                        <SquarePen className="h-3 w-3" />
                      </button>
                      <DangerIconButton
                        onClick={(e) => { e.stopPropagation(); deleteSpaceMutation.mutate(space.id); }}
                        className="h-6 w-6 bg-white/90 dark:bg-gray-800/90 shadow-sm"
                        title="Delete space"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}


      {/* Competitor Library */}
      <div className="space-y-3 pt-[10px] pb-[10px]">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 mb-1.5">
             <Swords className="h-4 w-4" />
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
            Competitor Library
            {selectedSpace && (
              <span className="ml-2 text-sm font-normal text-gray-500">— {selectedSpace}</span>
            )}
          </h3>
            </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {competitorsLoading ? "Loading..." : `${filteredBySpace.length} ${filteredBySpace.length === 1 ? "competitor" : "competitors"}`}
          </span>
        </div>

        {competitorsLoading ? (
          <div className="grid gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-2xl" />
            ))}
          </div>
        ) : groupedBySpace.length === 0 && ungrouped.length === 0 ? (
          <Card className="border border-dashed border-gray-300 dark:border-gray-700 bg-transparent rounded-2xl">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Swords className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">No competitors found</p>
              <p className="text-xs text-gray-400 mt-1 max-w-xs">
                {searchQuery ? "Try adjusting your search or filters." : "Click \"Add Competitor\" to add your first competitor."}
              </p>
              {!searchQuery && (
                <Button className="mt-4 gap-1.5 rounded-xl" size="sm" onClick={() => setAddCompetitorOpen(true)}>
                  <Swords className="h-3.5 w-3.5" /> Add Competitor
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {groupedBySpace.map(({ space, competitors }) => (
              <SpaceGroupCard
                key={space.id}
                space={space}
                competitors={competitors}
                activeCompetitorId={selectedCompetitorId}
                onSelectCompetitor={setSelectedCompetitorId}
              />
            ))}
            {ungrouped.length > 0 && (
              <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-4">
                <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-widest">Uncategorized</p>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {ungrouped.map((c) => (
                    <CompetitorCard
                      key={c.id}
                      competitor={c}
                      selected={selectedCompetitorId === c.id}
                      onSelect={() => setSelectedCompetitorId(c.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      </CardContent>
    </Card>
      {/* Detail Drawer */}
      <CompetitorDetailDrawer
        competitorId={selectedCompetitorId}
        onClose={() => setSelectedCompetitorId(null)}
      />
      {/* Modals */}
      <AddCompetitorModal open={addCompetitorOpen} onClose={() => setAddCompetitorOpen(false)} />
      <AddTechnologySpaceModal open={addSpaceOpen} onClose={() => setAddSpaceOpen(false)} />
      <EditTechnologySpaceModal open={!!editingSpace} space={editingSpace} onClose={() => setEditingSpace(null)} />
    </div>
  );
}
