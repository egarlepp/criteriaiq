import { useState, useEffect, type ElementType } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { SolutionBadge, AllSolutionsBadge } from "@/components/ui/solution-badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import {
  Globe,
  Building2,
  DollarSign,
  Server,
  Layers,
  ExternalLink,
  Plus,
  Unlink,
  Clock,
  Briefcase,
  ChevronDown,
  ChevronRight,
  FileText,
  Link as LinkIcon,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  ShieldAlert,
  Activity,
  Swords,
  FileSpreadsheet,
  StickyNote,
  Trophy,
  MonitorPlay,
  File,
  GraduationCap,
  BookMarked,
  Package,
  Headphones,
  PlayCircle,
  Video,
  Download,
  Cloud,
  LineChart,
  Archive,
  Search,
  X,
  Pencil,
  Save,
  XCircle,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface CompetitorDetailDrawerProps {
  competitorId: number | null;
  onClose: () => void;
}

const THREAT_CONFIG: Record<string, { label: string; className: string }> = {
  Critical: { label: "Critical", className: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400" },
  High:     { label: "High",     className: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400" },
  Medium:   { label: "Medium",   className: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400" },
  Low:      { label: "Low",      className: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400" },
};

const STAGE_CONFIG: Record<string, string> = {
  Won: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400",
  Lost: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400",
  Finalist: "bg-purple-100 text-purple-700 border-purple-200",
  POC: "bg-blue-100 text-blue-700 border-blue-200",
  "Active Eval": "bg-amber-100 text-amber-700 border-amber-200",
};

const docTypeConfig: Record<string, { icon: ElementType; color: string }> = {
  "Battlecard":     { icon: Swords,         color: "text-orange-500" },
  "Datasheet":      { icon: FileSpreadsheet, color: "text-blue-500" },
  "Internal Notes": { icon: StickyNote,      color: "text-yellow-500" },
  "Win/Loss Info":  { icon: Trophy,          color: "text-emerald-500" },
  "Demo Notes":     { icon: MonitorPlay,     color: "text-purple-500" },
  "Architecture":   { icon: Building2,       color: "text-blue-500" },
  "Product Info":   { icon: Package,         color: "text-purple-500" },
  "Documentation":  { icon: FileText,        color: "text-cyan-500" },
  "Reference":      { icon: BookMarked,      color: "text-green-500" },
  "Other":          { icon: File,            color: "text-slate-500" },
};

const linkTypeConfig: Record<string, { icon: ElementType; color: string }> = {
  "Documentation": { icon: FileText,      color: "text-cyan-500" },
  "Tutorial":      { icon: GraduationCap, color: "text-indigo-500" },
  "Reference":     { icon: BookMarked,    color: "text-green-500" },
  "Product Info":  { icon: Package,       color: "text-purple-500" },
  "Support":       { icon: Headphones,    color: "text-pink-500" },
  "Demo":          { icon: PlayCircle,    color: "text-amber-500" },
  "Video":         { icon: Video,         color: "text-red-500" },
  "Download":      { icon: Download,      color: "text-teal-500" },
  "Architecture":  { icon: Building2,     color: "text-blue-500" },
  "CloudLAB":      { icon: Cloud,         color: "text-sky-500" },
  "Portal":        { icon: Globe,         color: "text-emerald-500" },
  "Battlecard":    { icon: Swords,        color: "text-orange-500" },
  "Analyst":       { icon: LineChart,     color: "text-teal-500" },
  "Website":       { icon: Globe,         color: "text-blue-500" },
  "Other":         { icon: File,          color: "text-slate-500" },
};

const DOC_TYPES = [
  "Battlecard",
  "Datasheet",
  "Internal Notes",
  "Win/Loss Info",
  "Demo Notes",
  "Architecture",
  "Product Info",
  "Documentation",
  "Reference",
  "Other",
];

const LINK_TYPES = [
  "Website",
  "Battlecard",
  "Analyst",
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
  "Other",
];

function CollapsibleSection({
  title,
  icon,
  children,
  defaultOpen = true,
  action,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  action?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <div className="flex items-center justify-between w-full py-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100 text-left flex-1"
        >
          {icon}
          {title}
          {open ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          )}
        </button>
        {action && <div className="ml-2">{action}</div>}
      </div>
      {open && <div className="pb-3">{children}</div>}
    </div>
  );
}

export default function CompetitorDetailDrawer({ competitorId, onClose }: CompetitorDetailDrawerProps) {
  const queryClient = useQueryClient();
  

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCategory, setPickerCategory] = useState<"document" | "link" | "">("");
  const [pickerType, setPickerType] = useState("");
  const [pickerSearch, setPickerSearch] = useState("");

  const [profileEditMode, setProfileEditMode] = useState(false);
  const [editStrengths, setEditStrengths] = useState("");
  const [editWeaknesses, setEditWeaknesses] = useState("");
  const [editCounterPositioning, setEditCounterPositioning] = useState("");
  const [editCommonWinThemes, setEditCommonWinThemes] = useState("");
  const [editCommonLossThemes, setEditCommonLossThemes] = useState("");
  const [editNotes, setEditNotes] = useState("");

  useEffect(() => {
    setProfileEditMode(false);
  }, [competitorId]);

  const { data: competitor, isLoading } = useQuery({
    queryKey: ["/api/competitors", competitorId],
    queryFn: () => fetch(`/api/competitors/${competitorId}`).then((r) => r.json()),
    enabled: competitorId !== null,
  });

  const { data: linkedDocs = [] } = useQuery<any[]>({
    queryKey: ["/api/documents", { competitorId }],
    queryFn: () => fetch(`/api/documents?competitorId=${competitorId}`).then((r) => r.json()),
    enabled: competitorId !== null,
  });

  const { data: linkedLinks = [] } = useQuery<any[]>({
    queryKey: ["/api/links", { competitorId }],
    queryFn: () => fetch(`/api/links?competitorId=${competitorId}`).then((r) => r.json()),
    enabled: competitorId !== null,
  });

  const readyToFetchLibrary = pickerCategory !== "" && pickerType !== "";

  const { data: libraryDocs = [] } = useQuery<any[]>({
    queryKey: ["/api/documents", { documentType: pickerType }],
    queryFn: () => fetch(`/api/documents?documentType=${encodeURIComponent(pickerType)}`).then((r) => r.json()),
    enabled: readyToFetchLibrary && pickerCategory === "document",
  });

  const { data: libraryLinks = [] } = useQuery<any[]>({
    queryKey: ["/api/links", { linkType: pickerType }],
    queryFn: () => fetch(`/api/links?linkType=${encodeURIComponent(pickerType)}`).then((r) => r.json()),
    enabled: readyToFetchLibrary && pickerCategory === "link",
  });

  const { data: allSolutions = [] } = useQuery<any[]>({
    queryKey: ["/api/products"],
    queryFn: () => fetch("/api/products").then((r) => r.json()),
  });

  const addSolutionMutation = useMutation({
    mutationFn: (solutionId: number) =>
      apiRequest("POST", `/api/competitors/${competitorId}/solutions`, { solutionId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/competitors", competitorId] });
      queryClient.invalidateQueries({ queryKey: ["/api/competitors"] });
      showSuccessToast("Solution added");
    },
    onError: () => showErrorToast("Failed to add solution"),
  });

  const removeSolutionMutation = useMutation({
    mutationFn: (solutionId: number) =>
      apiRequest("DELETE", `/api/competitors/${competitorId}/solutions/${solutionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/competitors", competitorId] });
      queryClient.invalidateQueries({ queryKey: ["/api/competitors"] });
      showSuccessToast("Solution removed");
    },
    onError: () => showErrorToast("Failed to remove solution"),
  });

  function toggleSolution(solutionId: number) {
    const isSelected = competitor?.solutions?.some((s: any) => s.solutionId === solutionId);
    if (isSelected) {
      removeSolutionMutation.mutate(solutionId);
    } else {
      addSolutionMutation.mutate(solutionId);
    }
  }

  const allSolutionsSelected =
    allSolutions.length > 0 &&
    allSolutions.every((s: any) => competitor?.solutions?.some((cs: any) => cs.solutionId === s.id));

  function toggleAllSolutions() {
    if (allSolutionsSelected) {
      competitor?.solutions?.forEach((cs: any) => removeSolutionMutation.mutate(cs.solutionId));
    } else {
      allSolutions
        .filter((s: any) => !competitor?.solutions?.some((cs: any) => cs.solutionId === s.id))
        .forEach((s: any) => addSolutionMutation.mutate(s.id));
    }
  }

  const unlinkDocMutation = useMutation({
    mutationFn: (docId: number) =>
      apiRequest("PUT", `/api/documents/${docId}`, { competitorId: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents", { competitorId }] });
      showSuccessToast("Document unlinked");
    },
    onError: () => showErrorToast("Failed to unlink document"),
  });

  const unlinkLinkMutation = useMutation({
    mutationFn: (linkId: number) =>
      apiRequest("PUT", `/api/links/${linkId}`, { competitorId: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/links", { competitorId }] });
      showSuccessToast("Link unlinked");
    },
    onError: () => showErrorToast("Failed to unlink"),
  });

  const associateDocMutation = useMutation({
    mutationFn: (docId: number) =>
      apiRequest("PUT", `/api/documents/${docId}`, { competitorId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents", { competitorId }] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents", { documentType: pickerType }] });
      resetPicker();
      showSuccessToast("Document linked to competitor");
    },
    onError: () => showErrorToast("Failed to link document"),
  });

  const associateLinkMutation = useMutation({
    mutationFn: (linkId: number) =>
      apiRequest("PUT", `/api/links/${linkId}`, { competitorId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/links", { competitorId }] });
      queryClient.invalidateQueries({ queryKey: ["/api/links", { linkType: pickerType }] });
      resetPicker();
      showSuccessToast("Link associated with competitor");
    },
    onError: () => showErrorToast("Failed to associate link"),
  });

  const updateProfileMutation = useMutation({
    mutationFn: (profileData: {
      strengths: string | null;
      weaknesses: string | null;
      counterPositioning: string | null;
      commonWinThemes: string | null;
      commonLossThemes: string | null;
      notes: string | null;
    }) => apiRequest("PUT", `/api/competitors/${competitorId}`, profileData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/competitors", competitorId] });
      queryClient.invalidateQueries({ queryKey: ["/api/competitors"] });
      setProfileEditMode(false);
      showSuccessToast("Competitive profile updated");
    },
    onError: () => showErrorToast("Failed to update profile"),
  });

  function enterProfileEdit() {
    setEditStrengths(competitor?.strengths || "");
    setEditWeaknesses(competitor?.weaknesses || "");
    setEditCounterPositioning(competitor?.counterPositioning || "");
    setEditCommonWinThemes(competitor?.commonWinThemes || "");
    setEditCommonLossThemes(competitor?.commonLossThemes || "");
    setEditNotes(competitor?.notes || "");
    setProfileEditMode(true);
  }

  function saveProfile() {
    updateProfileMutation.mutate({
      strengths: editStrengths.trim() || null,
      weaknesses: editWeaknesses.trim() || null,
      counterPositioning: editCounterPositioning.trim() || null,
      commonWinThemes: editCommonWinThemes.trim() || null,
      commonLossThemes: editCommonLossThemes.trim() || null,
      notes: editNotes.trim() || null,
    });
  }

  function resetPicker() {
    setPickerOpen(false);
    setPickerCategory("");
    setPickerType("");
    setPickerSearch("");
  }

  const linkedDocIds = new Set(linkedDocs.map((d: any) => d.id));
  const linkedLinkIds = new Set(linkedLinks.map((l: any) => l.id));

  const filteredLibraryDocs = libraryDocs.filter((d: any) =>
    !linkedDocIds.has(d.id) &&
    (pickerSearch === "" || (d.givenName || d.originalName || "").toLowerCase().includes(pickerSearch.toLowerCase()))
  );

  const filteredLibraryLinks = libraryLinks.filter((l: any) =>
    !linkedLinkIds.has(l.id) &&
    (pickerSearch === "" || (l.name || "").toLowerCase().includes(pickerSearch.toLowerCase()))
  );

  const totalLinked = linkedDocs.length + linkedLinks.length + (competitor?.documents?.length ?? 0);

  return (
    <Sheet open={competitorId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto p-0"
      >
        {isLoading || !competitor ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div>
            {/* Header */}
            <div className="sticky top-0 z-10 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 px-6 py-5">
              <SheetHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {competitor.isActive ? (
                        <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 text-[10px] font-semibold border">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">Inactive</Badge>
                      )}
                      {competitor.vendorType && (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">{competitor.vendorType}</span>
                      )}
                      {competitor.deploymentModel && (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">{competitor.deploymentModel}</span>
                      )}
                      {competitor.companySizeBand && (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">{competitor.companySizeBand}</span>
                      )}
                      {competitor.pricingPosition && (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">{competitor.pricingPosition}</span>
                      )}
                    </div>
                    <SheetTitle className="text-2xl font-bold tracking-tight">{competitor.name}</SheetTitle>
                    {competitor.websiteUrl && (
                      <a
                        href={competitor.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1"
                      >
                        <Globe className="h-3 w-3" />
                        {competitor.websiteUrl.replace(/^https?:\/\//, "")}
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Spaces + Solutions */}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {competitor.spaces?.map((s: any) => (
                    <span key={s.spaceId} className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                      {s.code}
                      {s.isPrimary && <span className="text-blue-400">·primary</span>}
                    </span>
                  ))}
                  {competitor.solutions?.map((s: any) => (
                    <span key={s.solutionId} className="inline-flex items-center gap-1 rounded-full bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 px-2.5 py-0.5 text-[11px] font-medium text-purple-700 dark:text-purple-300">
                      <Layers className="h-2.5 w-2.5" />
                      {s.abbreviation || s.name}
                    </span>
                  ))}
                  {competitor.tags?.map((t: any) => (
                    <span key={t.tagId} className="inline-flex rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-0.5 text-[11px] font-medium text-gray-600 dark:text-gray-300">
                      {t.name}
                    </span>
                  ))}
                </div>
              </SheetHeader>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Detail Cards */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Vendor Type", value: competitor.vendorType, icon: <Building2 className="h-3.5 w-3.5" /> },
                  { label: "Pricing", value: competitor.pricingPosition, icon: <DollarSign className="h-3.5 w-3.5" /> },
                  { label: "Deployment", value: competitor.deploymentModel, icon: <Server className="h-3.5 w-3.5" /> },
                  { label: "Linked Projects", value: `${competitor.relatedProjects?.length ?? 0} projects`, icon: <Briefcase className="h-3.5 w-3.5" /> },
                ].map((item) => (
                  item.value ? (
                    <div key={item.label} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-3">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1">
                        {item.icon}
                        {item.label}
                      </div>
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.value}</div>
                    </div>
                  ) : null
                ))}
              </div>

              {competitor.summary && (
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{competitor.summary}</p>
              )}

              <Separator />

              {/* Aligned Solutions */}
              <CollapsibleSection title="Aligned Solutions" icon={<Layers className="h-4 w-4 text-purple-500" />}>
                <div className="mt-2">
                  {allSolutions.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">No solutions found in product catalog.</p>
                  ) : (
                    <TooltipProvider>
                      <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto p-1">
                        <button
                          type="button"
                          onClick={toggleAllSolutions}
                          className={cn(
                            "inline-flex items-center rounded-full transition-all",
                            allSolutionsSelected
                              ? "ring-2 ring-primary ring-offset-1"
                              : "opacity-70 hover:opacity-100"
                          )}
                        >
                          <AllSolutionsBadge />
                        </button>
                        {allSolutions.map((s: any) => {
                          const isSelected = competitor?.solutions?.some((cs: any) => cs.solutionId === s.id);
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => toggleSolution(s.id)}
                              className={cn(
                                "inline-flex items-center rounded-full transition-all",
                                isSelected
                                  ? "ring-2 ring-primary ring-offset-1"
                                  : "opacity-70 hover:opacity-100"
                              )}
                            >
                              <SolutionBadge solutionName={s.name} solutionIcon={s.solutionIcon ?? null} solutionIconName={s.solutionIconName} />
                            </button>
                          );
                        })}
                      </div>
                    </TooltipProvider>
                  )}
                </div>
              </CollapsibleSection>

              <Separator />

              {/* Competitive Profile */}
              <CollapsibleSection
                title="Competitive Profile"
                icon={<ShieldAlert className="h-4 w-4 text-amber-500" />}
                action={
                  !profileEditMode ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); enterProfileEdit(); }}
                      className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-amber-600 transition-colors"
                      title="Edit profile"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  ) : null
                }
              >
                {profileEditMode ? (
                  <div className="space-y-3 mt-2">
                    <div>
                      <Label className="text-xs font-semibold text-green-700 dark:text-green-400 flex items-center gap-1.5 mb-1">
                        <TrendingUp className="h-3.5 w-3.5" /> Strengths
                      </Label>
                      <Textarea
                        value={editStrengths}
                        onChange={(e) => setEditStrengths(e.target.value)}
                        placeholder="Key strengths of this competitor..."
                        className="min-h-[60px] text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-red-700 dark:text-red-400 flex items-center gap-1.5 mb-1">
                        <TrendingDown className="h-3.5 w-3.5" /> Weaknesses
                      </Label>
                      <Textarea
                        value={editWeaknesses}
                        onChange={(e) => setEditWeaknesses(e.target.value)}
                        placeholder="Known weaknesses or gaps..."
                        className="min-h-[60px] text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1.5 mb-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Counter-Positioning
                      </Label>
                      <Textarea
                        value={editCounterPositioning}
                        onChange={(e) => setEditCounterPositioning(e.target.value)}
                        placeholder="How to position against this competitor..."
                        className="min-h-[60px] text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 mb-1">
                        <Trophy className="h-3.5 w-3.5 text-emerald-500" /> Common Win Themes
                      </Label>
                      <Textarea
                        value={editCommonWinThemes}
                        onChange={(e) => setEditCommonWinThemes(e.target.value)}
                        placeholder="Recurring themes in wins against this competitor..."
                        className="min-h-[60px] text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 mb-1">
                        <TrendingDown className="h-3.5 w-3.5 text-orange-500" /> Common Loss Themes
                      </Label>
                      <Textarea
                        value={editCommonLossThemes}
                        onChange={(e) => setEditCommonLossThemes(e.target.value)}
                        placeholder="Recurring themes in losses to this competitor..."
                        className="min-h-[60px] text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 mb-1">
                        <StickyNote className="h-3.5 w-3.5 text-yellow-500" /> Internal Notes
                      </Label>
                      <Textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        placeholder="Additional context, internal notes..."
                        className="min-h-[60px] text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={saveProfile}
                        disabled={updateProfileMutation.isPending}
                        className="gap-1.5"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {updateProfileMutation.isPending ? "Saving..." : "Save Profile"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setProfileEditMode(false)}
                        disabled={updateProfileMutation.isPending}
                        className="gap-1.5"
                      >
                        <XCircle className="h-3.5 w-3.5" /> Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 mt-2">
                    {competitor.strengths && (
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-green-700 dark:text-green-400 mb-1">
                          <TrendingUp className="h-3.5 w-3.5" /> Strengths
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{competitor.strengths}</p>
                      </div>
                    )}
                    {competitor.weaknesses && (
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-400 mb-1">
                          <TrendingDown className="h-3.5 w-3.5" /> Weaknesses
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{competitor.weaknesses}</p>
                      </div>
                    )}
                    {competitor.counterPositioning && (
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Counter-Positioning
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{competitor.counterPositioning}</p>
                      </div>
                    )}
                    {competitor.commonWinThemes && (
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                          <Trophy className="h-3.5 w-3.5 text-emerald-500" /> Common Win Themes
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{competitor.commonWinThemes}</p>
                      </div>
                    )}
                    {competitor.commonLossThemes && (
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                          <TrendingDown className="h-3.5 w-3.5 text-orange-500" /> Common Loss Themes
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{competitor.commonLossThemes}</p>
                      </div>
                    )}
                    {competitor.notes && (
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                          <StickyNote className="h-3.5 w-3.5 text-yellow-500" /> Internal Notes
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{competitor.notes}</p>
                      </div>
                    )}
                    {!competitor.strengths && !competitor.weaknesses && !competitor.counterPositioning && !competitor.commonWinThemes && !competitor.commonLossThemes && !competitor.notes && (
                      <div className="text-center py-3">
                        <p className="text-sm text-gray-400 italic mb-2">No competitive intelligence added yet.</p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={enterProfileEdit}
                          className="gap-1.5"
                        >
                          <Plus className="h-3.5 w-3.5" /> Add Profile Details
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CollapsibleSection>

              <Separator />

              {/* Competitor Artifacts */}
              <CollapsibleSection
                title="Competitor Artifacts"
                icon={<Archive className="h-4 w-4 text-violet-500" />}
                defaultOpen={false}
              >
                <div className="space-y-2 mt-2">

                  {/* Linked Global Documents */}
                  {linkedDocs.map((doc: any) => {
                    const DocIcon = docTypeConfig[doc.documentType]?.icon || File;
                    const docColor = docTypeConfig[doc.documentType]?.color || "text-slate-500";
                    return (
                      <div key={`doc-${doc.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 px-3 py-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <DocIcon className={`h-4 w-4 shrink-0 ${docColor}`} />
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                              {doc.givenName || doc.originalName}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-gray-500">{doc.documentType}</span>
                              <span className="text-[10px] bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 rounded px-1 py-0.5">Document</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            title="Unlink document"
                            onClick={() => unlinkDocMutation.mutate(doc.id)}
                            disabled={unlinkDocMutation.isPending}
                            className="text-gray-400 hover:text-orange-500 transition-colors"
                          >
                            <Unlink className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Linked Global Links */}
                  {linkedLinks.map((link: any) => {
                    const LinkIc = linkTypeConfig[link.linkType]?.icon || File;
                    const linkColor = linkTypeConfig[link.linkType]?.color || "text-slate-500";
                    return (
                      <div key={`link-${link.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 px-3 py-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <LinkIc className={`h-4 w-4 shrink-0 ${linkColor}`} />
                          <div className="min-w-0">
                            <a
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-blue-600 hover:underline flex items-center gap-1 truncate"
                            >
                              {link.name} <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-gray-500">{link.linkType}</span>
                              <span className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded px-1 py-0.5">Link</span>
                            </div>
                          </div>
                        </div>
                        <button
                          title="Unlink"
                          onClick={() => unlinkLinkMutation.mutate(link.id)}
                          disabled={unlinkLinkMutation.isPending}
                          className="text-gray-400 hover:text-orange-500 shrink-0 transition-colors"
                        >
                          <Unlink className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}

                  {/* Legacy competitor_documents */}
                  {competitor.documents?.map((doc: any) => {
                    const DocIcon = docTypeConfig[doc.documentType]?.icon || File;
                    const docColor = docTypeConfig[doc.documentType]?.color || "text-slate-500";
                    return (
                      <div key={`legacy-${doc.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 px-3 py-2 opacity-75">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <DocIcon className={`h-4 w-4 shrink-0 ${docColor}`} />
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{doc.title}</div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-gray-400">{doc.documentType}</span>
                              <span className="text-[10px] bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400 rounded px-1 py-0.5">Legacy</span>
                            </div>
                          </div>
                        </div>
                        {doc.fileUrl && (
                          <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 shrink-0">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    );
                  })}

                  {/* Empty state */}
                  {totalLinked === 0 && (
                    <p className="text-sm text-gray-400 italic">
                      No artifacts linked yet. Create documents or links in the Artifacts section, then link them here.
                    </p>
                  )}

                  {/* Add Artifact Button */}
                  {!pickerOpen ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-1.5 mt-1"
                      onClick={() => setPickerOpen(true)}
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Artifact
                    </Button>
                  ) : (
                    <div className="rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/20 p-3 space-y-3 mt-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-violet-700 dark:text-violet-400">Link an Artifact</span>
                        <button onClick={resetPicker} className="text-gray-400 hover:text-gray-600">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Step 1: Category */}
                      <div className="space-y-1">
                        <Label className="text-[11px] text-gray-500 uppercase tracking-wide">1. Artifact Type</Label>
                        <Select
                          value={pickerCategory}
                          onValueChange={(v) => {
                            setPickerCategory(v as "document" | "link");
                            setPickerType("");
                            setPickerSearch("");
                          }}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Choose type..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="document">
                              <div className="flex items-center gap-2">
                                <FileText className="h-3.5 w-3.5 text-violet-500" /> Document
                              </div>
                            </SelectItem>
                            <SelectItem value="link">
                              <div className="flex items-center gap-2">
                                <LinkIcon className="h-3.5 w-3.5 text-blue-500" /> Link
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Step 2: Type */}
                      {pickerCategory && (
                        <div className="space-y-1">
                          <Label className="text-[11px] text-gray-500 uppercase tracking-wide">2. Category</Label>
                          <Select
                            value={pickerType}
                            onValueChange={(v) => {
                              setPickerType(v);
                              setPickerSearch("");
                            }}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Select category..." />
                            </SelectTrigger>
                            <SelectContent>
                              {(pickerCategory === "document" ? DOC_TYPES : LINK_TYPES).map((t) => {
                                const cfg = pickerCategory === "document" ? docTypeConfig[t] : linkTypeConfig[t];
                                const Ic = cfg?.icon || File;
                                const cl = cfg?.color || "text-slate-500";
                                return (
                                  <SelectItem key={t} value={t}>
                                    <div className="flex items-center gap-2">
                                      <Ic className={`h-3.5 w-3.5 ${cl}`} />
                                      {t}
                                    </div>
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* Step 3: Artifact picker */}
                      {pickerCategory && pickerType && (
                        <div className="space-y-1">
                          <Label className="text-[11px] text-gray-500 uppercase tracking-wide">3. Select Artifact</Label>
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                            <Input
                              className="pl-7 h-8 text-sm"
                              placeholder="Search artifacts..."
                              value={pickerSearch}
                              onChange={(e) => setPickerSearch(e.target.value)}
                            />
                          </div>
                          <div className="max-h-44 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
                            {pickerCategory === "document" && filteredLibraryDocs.length === 0 && (
                              <p className="text-xs text-gray-400 italic p-2 text-center">
                                {libraryDocs.length === 0 ? `No ${pickerType} documents found in library.` : "All matching documents are already linked."}
                              </p>
                            )}
                            {pickerCategory === "link" && filteredLibraryLinks.length === 0 && (
                              <p className="text-xs text-gray-400 italic p-2 text-center">
                                {libraryLinks.length === 0 ? `No ${pickerType} links found in library.` : "All matching links are already linked."}
                              </p>
                            )}
                            {pickerCategory === "document" && filteredLibraryDocs.map((doc: any) => (
                              <button
                                key={doc.id}
                                onClick={() => associateDocMutation.mutate(doc.id)}
                                disabled={associateDocMutation.isPending}
                                className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors text-left"
                              >
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                    {doc.givenName || doc.originalName}
                                  </div>
                                  {doc.owner && (
                                    <div className="text-[11px] text-gray-400">by {doc.owner}</div>
                                  )}
                                </div>
                                <Plus className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                              </button>
                            ))}
                            {pickerCategory === "link" && filteredLibraryLinks.map((link: any) => (
                              <button
                                key={link.id}
                                onClick={() => associateLinkMutation.mutate(link.id)}
                                disabled={associateLinkMutation.isPending}
                                className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors text-left"
                              >
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                    {link.name}
                                  </div>
                                  {link.description && (
                                    <div className="text-[11px] text-gray-400 truncate">{link.description}</div>
                                  )}
                                </div>
                                <Plus className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CollapsibleSection>

              <Separator />

              {/* Related Projects */}
              <CollapsibleSection title="Related Projects" icon={<Briefcase className="h-4 w-4 text-indigo-500" />}>
                <div className="space-y-2 mt-2">
                  {competitor.relatedProjects?.length === 0 && (
                    <p className="text-sm text-gray-400 italic">No projects linked yet. Add this competitor to a project to track deal pressure and win/loss patterns.</p>
                  )}
                  {competitor.relatedProjects?.map((proj: any) => (
                    <div key={proj.id} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                            {proj.projectName || proj.customerName}
                          </div>
                          <div className="text-[11px] text-gray-500 mt-0.5">
                            {[proj.spaceCode, proj.relationshipType].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {proj.threatLevel && (
                            <span className={cn(
                              "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                              THREAT_CONFIG[proj.threatLevel]?.className ?? "bg-gray-100 text-gray-600"
                            )}>
                              {proj.threatLevel}
                            </span>
                          )}
                          {proj.competitiveStage && (
                            <span className={cn(
                              "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium",
                              STAGE_CONFIG[proj.competitiveStage] ?? "bg-gray-100 text-gray-600 border-gray-200"
                            )}>
                              {proj.competitiveStage}
                            </span>
                          )}
                        </div>
                      </div>
                      {proj.notes && (
                        <p className="text-xs text-gray-500 mt-2 border-t border-gray-200 dark:border-gray-700 pt-2">{proj.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              </CollapsibleSection>

              <Separator />

              {/* Activity Timeline */}
              <CollapsibleSection title="Activity Timeline" icon={<Activity className="h-4 w-4 text-gray-400" />} defaultOpen={false}>
                <div className="space-y-2 mt-2">
                  {competitor.activity?.length === 0 && (
                    <p className="text-sm text-gray-400 italic">No activity recorded yet.</p>
                  )}
                  {competitor.activity?.map((event: any) => (
                    <div key={event.id} className="flex items-start gap-3">
                      <div className="mt-1 h-2 w-2 rounded-full bg-blue-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 dark:text-gray-300">{event.message}</p>
                        <div className="flex items-center gap-1 text-[11px] text-gray-400 mt-0.5">
                          <Clock className="h-3 w-3" />
                          {event.createdAt ? format(new Date(event.createdAt), "MMM d, yyyy") : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
