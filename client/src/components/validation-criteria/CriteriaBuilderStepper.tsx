import { SolutionGraphic, solutionGraphicUrl } from "@/components/ui/solution-graphic";
import { useState, useMemo, createContext, useContext, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { SolutionBadge, AllSolutionsBadge } from "@/components/ui/solution-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from "react-i18next";
import { SolutionIconField } from "./SolutionIconField";
import { FilterMultiSelectButton } from "@/components/ui/search-filters-section";
import {
  Package,
  Blocks,
  LayoutList,
  CheckCircle,
  Activity,
  HandHeart,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Plus,
  Link2,
  SkipForward,
  Check,
  Search,
  RotateCcw,
  Sparkles,
  X,
  Info,
} from "lucide-react";

import type {
  Solution,
  ComponentItem,
  CriteriaLibrary,
  ExpectedOutcome,
  ActionItem,
} from "./types";

type StepId = "solution" | "component" | "value_mapping" | "criteria" | "outcome" | "action";
type StepMode = "create" | "existing";

interface StepFormData {
  name: string;
  description: string;
  abbreviation?: string;
  solutionIcon?: string;
  solutionIconName?: string;
  documentationLinkId?: number | null;
  docsRepoConfigId?: number | null;
  tags?: string[];
}

const emptyFormData = (stepId: StepId): StepFormData => {
  if (stepId === "solution") {
    return { name: "", description: "", abbreviation: "", solutionIcon: "none", solutionIconName: "", documentationLinkId: null, docsRepoConfigId: null, tags: [] };
  }
  return { name: "", description: "" };
};

interface StepConfig {
  id: StepId;
  label: string;
  icon: any;
  color: string;
  bgColor: string;
  darkBgColor: string;
  borderColor: string;
  darkBorderColor: string;
  required: boolean;
}

const STEPS: StepConfig[] = [
  {
    id: "solution",
    label: "Solution",
    icon: Package,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100",
    darkBgColor: "dark:bg-blue-900/40",
    borderColor: "border-blue-300",
    darkBorderColor: "dark:border-blue-700",
    required: true,
  },
  {
    id: "component",
    label: "Component",
    icon: Blocks,
    color: "text-indigo-600 dark:text-indigo-400",
    bgColor: "bg-indigo-100",
    darkBgColor: "dark:bg-indigo-900/40",
    borderColor: "border-indigo-300",
    darkBorderColor: "dark:border-indigo-700",
    required: false,
  },
  {
    id: "value_mapping",
    label: "Value Mapping",
    icon: HandHeart,
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-100",
    darkBgColor: "dark:bg-orange-900/40",
    borderColor: "border-orange-300",
    darkBorderColor: "dark:border-orange-700",
    required: true,
  },
  {
    id: "criteria",
    label: "Criteria",
    icon: LayoutList,
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-100",
    darkBgColor: "dark:bg-purple-900/40",
    borderColor: "border-purple-300",
    darkBorderColor: "dark:border-purple-700",
    required: true,
  },
  {
    id: "outcome",
    label: "Expected Outcome",
    icon: CheckCircle,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-100",
    darkBgColor: "dark:bg-green-900/40",
    borderColor: "border-green-300",
    darkBorderColor: "dark:border-green-700",
    required: false,
  },
  {
    id: "action",
    label: "Action Taken",
    icon: Activity,
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-100",
    darkBgColor: "dark:bg-amber-900/40",
    borderColor: "border-amber-300",
    darkBorderColor: "dark:border-amber-700",
    required: false,
  },
];

const ALL_SOLUTIONS_ID = -1;
const ALL_SOLUTIONS_NAME = "All Solutions";

interface StepSelection {
  mode: StepMode | "skipped" | null;
  id: number | null;
  name: string;
  isNew: boolean;
}

const emptySelection = (): StepSelection => ({
  mode: null,
  id: null,
  name: "",
  isNew: false,
});

const STEP_TO_TAB: Record<StepId, string> = {
  solution: "solutions",
  component: "components",
  value_mapping: "value-mapping",
  criteria: "criteria",
  outcome: "outcomes",
  action: "actions",
};

interface CriteriaBuilderContextValue {
  isExpanded: boolean;
  setIsExpanded: (v: boolean) => void;
  activeStep: number;
  setActiveStep: (v: number) => void;
  selections: Record<StepId, StepSelection>;
  stepModes: Record<StepId, StepMode>;
  formData: Record<StepId, StepFormData>;
  searchTerms: Record<StepId, string>;
  solutionIcons: any[];
  allTags: string[];
  allLinks: any[];
  docsRepoConfigs: any[];
  tags: any[];
  solutions: Solution[];
  allComponents: ComponentItem[];
  allValueMappings: any[];
  allCriteria: CriteriaLibrary[];
  allOutcomes: ExpectedOutcome[];
  allActions: ActionItem[];
  activeSolutions: Solution[];
  filteredComponents: ComponentItem[];
  navigateToStep: (stepIndex: number) => void;
  currentStep: StepConfig | undefined;
  isComplete: boolean;
  getStepStatus: (index: number) => "completed" | "active" | "upcoming" | "skipped";
  setStepMode: (stepId: StepId, mode: StepMode) => void;
  updateFormField: (stepId: StepId, field: string, value: any) => void;
  updateSearchTerm: (stepId: StepId, term: string) => void;
  handleCreate: (stepId: StepId) => void;
  handleSelectExisting: (stepId: StepId, item: { id: number; name: string }) => void;
  handleReset: () => void;
  handleFinish: () => void;
  canNavigateToStep: (index: number) => boolean;
  handleStepClick: (index: number) => void;
  getItemsForStep: (stepId: StepId) => { id: number; name: string; description?: string | null; iconUrl?: string; iconName?: string; isAllSolutions?: boolean; solutionIds?: number[] }[];
  skipStep: (stepId: StepId) => void;
  isAnyMutationPending: boolean;
}

const CriteriaBuilderContext = createContext<CriteriaBuilderContextValue | null>(null);

export function useCriteriaBuilder() {
  const ctx = useContext(CriteriaBuilderContext);
  if (!ctx) {
    throw new Error("useCriteriaBuilder must be used within a CriteriaBuilderProvider");
  }
  return ctx;
}

interface CriteriaBuilderProviderProps {
  children: ReactNode;
  onTabChange?: (tab: string) => void;
  onComplete?: () => void;
}

export function CriteriaBuilderProvider({ children, onTabChange, onComplete }: CriteriaBuilderProviderProps) {
  
  const queryClient = useQueryClient();

  const [isExpanded, setIsExpanded] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [selections, setSelections] = useState<Record<StepId, StepSelection>>({
    solution: emptySelection(),
    component: emptySelection(),
    value_mapping: emptySelection(),
    criteria: emptySelection(),
    outcome: emptySelection(),
    action: emptySelection(),
  });

  const [stepModes, setStepModes] = useState<Record<StepId, StepMode>>({
    solution: "existing",
    component: "existing",
    value_mapping: "existing",
    criteria: "existing",
    outcome: "existing",
    action: "existing",
  });

  const [formData, setFormData] = useState<Record<StepId, StepFormData>>({
    solution: emptyFormData("solution"),
    component: emptyFormData("component"),
    value_mapping: emptyFormData("value_mapping"),
    criteria: emptyFormData("criteria"),
    outcome: emptyFormData("outcome"),
    action: emptyFormData("action"),
  });

  const [searchTerms, setSearchTerms] = useState<Record<StepId, string>>({
    solution: "",
    component: "",
    value_mapping: "",
    criteria: "",
    outcome: "",
    action: "",
  });

  const { data: solutions = [] } = useQuery<Solution[]>({
    queryKey: ["/api/products"],
    enabled: isExpanded,
  });

  const { data: allComponents = [] } = useQuery<ComponentItem[]>({
    queryKey: ["/api/components"],
    enabled: isExpanded,
  });

  const { data: allCriteria = [] } = useQuery<CriteriaLibrary[]>({
    queryKey: ["/api/criteria/by-solution/0", { includeAll: true }],
    queryFn: async () => {
      const res = await fetch("/api/criteria/by-solution/0?includeAll=true", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch criteria");
      return res.json();
    },
    enabled: isExpanded,
  });

  const { data: allOutcomes = [] } = useQuery<ExpectedOutcome[]>({
    queryKey: ["/api/outcomes"],
    enabled: isExpanded,
  });

  const { data: allValueMappings = [] } = useQuery<any[]>({
    queryKey: ["/api/value-mappings"],
    enabled: isExpanded,
  });

  const { data: allActions = [] } = useQuery<ActionItem[]>({
    queryKey: ["/api/actions"],
    enabled: isExpanded,
  });

  const { data: solutionIcons = [] } = useQuery<any[]>({
    queryKey: ["/api/solution-icons"],
    enabled: isExpanded,
    staleTime: 300000,
  });

  const { data: tags = [] } = useQuery<any[]>({
    queryKey: ["/api/tags"],
    enabled: isExpanded,
  });

  const { data: allLinks = [] } = useQuery<any[]>({
    queryKey: ["/api/links"],
    enabled: isExpanded,
  });

  const { data: docsRepoConfigs = [] } = useQuery<any[]>({
    queryKey: ["/api/docs-repo-configs"],
    enabled: isExpanded,
  });

  const allTags = useMemo(() => {
    const uniqueTags = new Set<string>();
    (tags as any[]).forEach((tag: any) => uniqueTags.add(tag.name));
    return Array.from(uniqueTags).sort();
  }, [tags]);

  const activeSolutions = useMemo(() => solutions.filter(s => s.isActive !== false), [solutions]);

  const filteredComponents = useMemo(() => {
    const solutionId = selections.solution.id;
    if (!solutionId || solutionId === ALL_SOLUTIONS_ID) return allComponents.filter(c => (c as any).isActive !== false);
    return allComponents.filter(c =>
      (c as any).isActive !== false &&
      (c.isAllSolutions || (c.solutionIds && c.solutionIds.includes(solutionId)))
    );
  }, [allComponents, selections.solution.id]);

  const navigateToStep = (stepIndex: number) => {
    setActiveStep(stepIndex);
    if (stepIndex < STEPS.length && onTabChange) {
      onTabChange(STEP_TO_TAB[STEPS[stepIndex].id]);
    }
  };

  const currentStep = STEPS[activeStep];
  const isComplete = activeStep >= STEPS.length;

  const getStepStatus = (index: number): "completed" | "active" | "upcoming" | "skipped" => {
    const stepId = STEPS[index].id;
    const sel = selections[stepId];
    if (sel.mode === "skipped") return "skipped";
    if (sel.id !== null) return "completed";
    if (index === activeStep) return "active";
    return "upcoming";
  };

  const setStepMode = (stepId: StepId, mode: StepMode) => {
    setStepModes(prev => ({ ...prev, [stepId]: mode }));
  };

  const updateFormField = (stepId: StepId, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [stepId]: { ...prev[stepId], [field]: value },
    }));
  };

  const updateSearchTerm = (stepId: StepId, term: string) => {
    setSearchTerms(prev => ({ ...prev, [stepId]: term }));
  };

  const selectExisting = (stepId: StepId, item: { id: number; name: string }) => {
    setSelections(prev => ({
      ...prev,
      [stepId]: { mode: "existing", id: item.id, name: item.name, isNew: false },
    }));
    if (activeStep < STEPS.length - 1) {
      navigateToStep(activeStep + 1);
    } else {
      setActiveStep(STEPS.length);
    }
  };

  const skipStep = (stepId: StepId) => {
    setSelections(prev => ({
      ...prev,
      [stepId]: { mode: "skipped", id: null, name: "", isNew: false },
    }));
    if (activeStep < STEPS.length - 1) {
      navigateToStep(activeStep + 1);
    } else {
      setActiveStep(STEPS.length);
    }
  };

  const createSolutionMutation = useMutation({
    mutationFn: async (data: { name: string; abbreviation: string; description: string; solutionIcon?: string; solutionIconName?: string; documentationLinkId?: number | null; docsRepoConfigId?: number | null; tags?: string[] }) => {
      // `apiRequest` returns the parsed JSON body directly — calling
      // `.json()` on it would throw and silently bounce the mutation
      // into its error branch (task #754).
      return await apiRequest("POST", "/api/products", {
        name: data.name,
        abbreviation: data.abbreviation,
        description: data.description,
        solutionIcon: data.solutionIcon && data.solutionIcon !== "none" ? data.solutionIcon : null,
        solutionIconName: data.solutionIconName || null,
        documentationLinkId: data.documentationLinkId || null,
        docsRepoConfigId: data.docsRepoConfigId || null,
        tags: data.tags || [],
        isActive: true,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setSelections(prev => ({
        ...prev,
        solution: { mode: "create", id: data.id, name: data.name, isNew: true },
      }));
      navigateToStep(1);
      showSuccessToast("Solution Created", `"${data.name}" has been created.`);
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to create solution");
    },
  });

  const createComponentMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; solutionId: number }) => {
      // `apiRequest` returns the parsed JSON body directly (task #754).
      return await apiRequest("POST", "/api/components", {
        name: data.name,
        description: data.description,
        solutionIds: [data.solutionId],
        isAllSolutions: false,
        isActive: true,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/components"] });
      setSelections(prev => ({
        ...prev,
        component: { mode: "create", id: data.id, name: data.name, isNew: true },
      }));
      navigateToStep(2);
      showSuccessToast("Component Created", `"${data.name}" has been created.`);
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to create component");
    },
  });

  const createValueMappingMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; solutionId: number }) => {
      // `apiRequest` returns the parsed JSON body directly (task #754).
      return await apiRequest("POST", "/api/value-mappings", {
        name: data.name,
        description: data.description,
        solutionIds: [data.solutionId],
        isAllSolutions: false,
        isActive: true,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/value-mappings"] });
      setSelections(prev => ({
        ...prev,
        value_mapping: { mode: "create", id: data.id, name: data.name, isNew: true },
      }));
      navigateToStep(3);
      showSuccessToast("Value Mapping Created", `"${data.name}" has been created.`);
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to create value mapping");
    },
  });

  const createCriteriaMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; solutionId: number }) => {
      // `apiRequest` returns the parsed JSON body directly (task #754).
      return await apiRequest("POST", "/api/criteria", {
        name: data.name,
        description: data.description,
        solutionIds: [data.solutionId],
        isAllSolutions: false,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/criteria/by-solution/0"] });
      setSelections(prev => ({
        ...prev,
        criteria: { mode: "create", id: data.id, name: data.name, isNew: true },
      }));
      navigateToStep(4);
      showSuccessToast("Criteria Created", `"${data.name}" has been created.`);
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to create criteria");
    },
  });

  const createOutcomeMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; solutionId: number }) => {
      // `apiRequest` returns the parsed JSON body directly (task #754).
      return await apiRequest("POST", "/api/outcomes", {
        name: data.name,
        description: data.description,
        solutionIds: [data.solutionId],
        isAllSolutions: false,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/outcomes"] });
      setSelections(prev => ({
        ...prev,
        outcome: { mode: "create", id: data.id, name: data.name, isNew: true },
      }));
      navigateToStep(5);
      showSuccessToast("Outcome Created", `"${data.name}" has been created.`);
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to create outcome");
    },
  });

  const createActionMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; solutionId: number }) => {
      // `apiRequest` returns the parsed JSON body directly (task #754).
      return await apiRequest("POST", "/api/actions", {
        name: data.name,
        description: data.description,
        solutionIds: [data.solutionId],
        isAllSolutions: false,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/actions"] });
      setSelections(prev => ({
        ...prev,
        action: { mode: "create", id: data.id, name: data.name, isNew: true },
      }));
      setActiveStep(STEPS.length);
      showSuccessToast("Action Created", `"${data.name}" has been created.`);
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to create action");
    },
  });

  const appendLinkMutation = useMutation({
    mutationFn: async (data: { type: string; parentId: number; newChildId: number }) => {
      let existingIds: number[] = [];
      if (data.type === "criteria") {
        const res = await fetch(`/api/success-criteria/links/criteria/${data.parentId}`, { credentials: "include" });
        if (res.ok) {
          existingIds = await res.json();
        }
      } else if (data.type === "outcomes") {
        const res = await fetch(`/api/success-criteria/links/outcomes/${data.parentId}`, { credentials: "include" });
        if (res.ok) {
          existingIds = await res.json();
        }
      } else if (data.type === "actions") {
        const res = await fetch(`/api/success-criteria/links/actions/${data.parentId}`, { credentials: "include" });
        if (res.ok) {
          existingIds = await res.json();
        }
      }
      const mergedIds = Array.from(new Set([...existingIds, data.newChildId]));
      // `apiRequest` returns the parsed JSON body directly (task #754).
      return await apiRequest("PUT", "/api/success-criteria/link", {
        type: data.type,
        parentId: data.parentId,
        childIds: mergedIds,
      });
    },
    onError: (error: any) => {
      console.error("Link error:", error);
    },
  });

  const handleCreate = (stepId: StepId) => {
    const data = formData[stepId];
    if (!data.name.trim()) {
      showErrorToast("Name Required", "Please enter a name.");
      return;
    }
    if (stepId === "solution" && !data.abbreviation?.trim()) {
      showErrorToast("Abbreviation Required", "Please enter a solution abbreviation.");
      return;
    }
    const solutionId = (selections.solution.id === ALL_SOLUTIONS_ID) ? 0 : (selections.solution.id || 0);

    switch (stepId) {
      case "solution":
        createSolutionMutation.mutate({
          name: data.name.trim(),
          abbreviation: data.abbreviation || data.name.trim().substring(0, 5).toUpperCase(),
          description: data.description.trim(),
          solutionIcon: data.solutionIcon,
          solutionIconName: data.solutionIconName,
          documentationLinkId: data.documentationLinkId,
          docsRepoConfigId: data.docsRepoConfigId,
          tags: data.tags,
        });
        break;
      case "component":
        createComponentMutation.mutate({
          name: data.name.trim(),
          description: data.description.trim(),
          solutionId,
        });
        break;
      case "value_mapping":
        createValueMappingMutation.mutate({
          name: data.name.trim(),
          description: data.description.trim(),
          solutionId,
        });
        break;
      case "criteria":
        createCriteriaMutation.mutate({
          name: data.name.trim(),
          description: data.description.trim(),
          solutionId,
        });
        break;
      case "outcome":
        createOutcomeMutation.mutate({
          name: data.name.trim(),
          description: data.description.trim(),
          solutionId,
        });
        break;
      case "action":
        createActionMutation.mutate({
          name: data.name.trim(),
          description: data.description.trim(),
          solutionId,
        });
        break;
    }
  };

  const handleSelectExisting = (stepId: StepId, item: { id: number; name: string }) => {
    const solutionId = selections.solution.id;
    const isAllSolutions = solutionId === ALL_SOLUTIONS_ID;

    if (stepId === "criteria" && solutionId && !isAllSolutions && item.id) {
      appendLinkMutation.mutate({ type: "criteria", parentId: solutionId, newChildId: item.id });
    } else if (stepId === "outcome" && selections.criteria.id && item.id) {
      appendLinkMutation.mutate({ type: "outcomes", parentId: selections.criteria.id, newChildId: item.id });
    } else if (stepId === "action" && selections.outcome.id && item.id) {
      appendLinkMutation.mutate({ type: "actions", parentId: selections.outcome.id, newChildId: item.id });
    }

    selectExisting(stepId, item);
  };

  const handleReset = () => {
    setActiveStep(0);
    onTabChange?.("solutions");
    setSelections({
      solution: emptySelection(),
      component: emptySelection(),
      value_mapping: emptySelection(),
      criteria: emptySelection(),
      outcome: emptySelection(),
      action: emptySelection(),
    });
    setFormData({
      solution: emptyFormData("solution"),
      component: emptyFormData("component"),
      value_mapping: emptyFormData("value_mapping"),
      criteria: emptyFormData("criteria"),
      outcome: emptyFormData("outcome"),
      action: emptyFormData("action"),
    });
    setSearchTerms({
      solution: "",
      component: "",
      value_mapping: "",
      criteria: "",
      outcome: "",
      action: "",
    });
    setStepModes({
      solution: "existing",
      component: "existing",
      value_mapping: "existing",
      criteria: "existing",
      outcome: "existing",
      action: "existing",
    });
  };

  const handleFinish = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    queryClient.invalidateQueries({ queryKey: ["/api/components"] });
    queryClient.invalidateQueries({ queryKey: ["/api/value-mappings"] });
    queryClient.invalidateQueries({ queryKey: ["/api/criteria/by-solution/0"] });
    queryClient.invalidateQueries({ queryKey: ["/api/outcomes"] });
    queryClient.invalidateQueries({ queryKey: ["/api/actions"] });
    showSuccessToast("Criteria Builder Complete", "Your validation criteria have been set up successfully.");
    handleReset();
    setIsExpanded(false);
    onComplete?.();
  };

  const canNavigateToStep = (index: number): boolean => {
    if (index === 0) return true;
    for (let i = 0; i < index; i++) {
      const stepId = STEPS[i].id;
      const sel = selections[stepId];
      if (STEPS[i].required && sel.id === null && sel.mode !== "skipped") return false;
      if (!STEPS[i].required && sel.id === null && sel.mode !== "skipped") {
        if (i < activeStep) continue;
        return false;
      }
    }
    return true;
  };

  const handleStepClick = (index: number) => {
    if (canNavigateToStep(index)) {
      navigateToStep(index);
    }
  };

  const getItemsForStep = (stepId: StepId) => {
    const search = searchTerms[stepId].toLowerCase();
    switch (stepId) {
      case "solution": {
        const allSolutionsOption = { id: ALL_SOLUTIONS_ID, name: ALL_SOLUTIONS_NAME, description: "Apply to all solutions", iconUrl: undefined as string | undefined, iconName: undefined as string | undefined };
        const filtered = activeSolutions
          .filter(s => !search || s.name.toLowerCase().includes(search))
          .map(s => ({ id: s.id, name: s.name, description: s.description, iconUrl: s.solutionIcon ? solutionGraphicUrl(s.solutionIcon) : undefined, iconName: s.solutionIconName ?? undefined }));
        if (!search || ALL_SOLUTIONS_NAME.toLowerCase().includes(search)) {
          return [allSolutionsOption, ...filtered];
        }
        return filtered;
      }
      case "component":
        return filteredComponents
          .filter(c => !search || c.name.toLowerCase().includes(search))
          .map(c => ({ id: c.id, name: c.name, description: (c as any).description, isAllSolutions: c.isAllSolutions, solutionIds: c.solutionIds }));
      case "value_mapping":
        return (allValueMappings as any[])
          .filter(v => (v as any).isActive !== false)
          .filter(v => !search || v.name.toLowerCase().includes(search))
          .map(v => ({ id: v.id, name: v.name, description: v.description, isAllSolutions: v.isAllSolutions, solutionIds: v.solutionIds }));
      case "criteria":
        return (allCriteria as any[])
          .filter(c => (c as any).isActive !== false)
          .filter(c => !search || c.name.toLowerCase().includes(search))
          .map(c => ({ id: c.id, name: c.name, description: c.description, isAllSolutions: c.isAllSolutions, solutionIds: c.solutionIds }));
      case "outcome":
        return (allOutcomes as any[])
          .filter(o => (o as any).isActive !== false)
          .filter(o => !search || o.name.toLowerCase().includes(search))
          .map(o => ({ id: o.id, name: o.name, description: o.description, isAllSolutions: o.isAllSolutions, solutionIds: o.solutionIds }));
      case "action":
        return (allActions as any[])
          .filter(a => (a as any).isActive !== false)
          .filter(a => !search || a.name.toLowerCase().includes(search))
          .map(a => ({ id: a.id, name: a.name, description: a.description, isAllSolutions: a.isAllSolutions, solutionIds: a.solutionIds }));
      default:
        return [];
    }
  };

  const isAnyMutationPending =
    createSolutionMutation.isPending ||
    createComponentMutation.isPending ||
    createValueMappingMutation.isPending ||
    createCriteriaMutation.isPending ||
    createOutcomeMutation.isPending ||
    createActionMutation.isPending ||
    appendLinkMutation.isPending;

  const value: CriteriaBuilderContextValue = {
    isExpanded,
    setIsExpanded,
    activeStep,
    setActiveStep,
    selections,
    stepModes,
    formData,
    searchTerms,
    solutionIcons,
    allTags,
    allLinks,
    docsRepoConfigs,
    tags,
    solutions,
    allComponents,
    allValueMappings,
    allCriteria,
    allOutcomes,
    allActions,
    activeSolutions,
    filteredComponents,
    navigateToStep,
    currentStep,
    isComplete,
    getStepStatus,
    setStepMode,
    updateFormField,
    updateSearchTerm,
    handleCreate,
    handleSelectExisting,
    handleReset,
    handleFinish,
    canNavigateToStep,
    handleStepClick,
    getItemsForStep,
    skipStep,
    isAnyMutationPending,
  };

  return (
    <CriteriaBuilderContext.Provider value={value}>
      {children}
    </CriteriaBuilderContext.Provider>
  );
}

export default function CriteriaBuilderStepper() {
  const {
    isExpanded,
    setIsExpanded,
    activeStep,
    selections,
    stepModes,
    formData,
    searchTerms,
    solutionIcons,
    allTags,
    allLinks,
    docsRepoConfigs,
    tags,
    solutions,
    currentStep,
    isComplete,
    getStepStatus,
    setStepMode,
    updateFormField,
    updateSearchTerm,
    handleCreate,
    handleSelectExisting,
    handleReset,
    handleFinish,
    canNavigateToStep,
    handleStepClick,
    getItemsForStep,
    skipStep,
    isAnyMutationPending,
  } = useCriteriaBuilder();

  const getTagColor = (tagName: string) => {
    const dbTag = (tags as any[]).find(
      (t: any) => t.name.toLowerCase() === tagName.toLowerCase(),
    );
    return dbTag ? dbTag.color : '#64748B';
  };

  return (
    <Card className="relative overflow-hidden shadow-sm border border-gray-200 dark:border-gray-700 rounded-xl">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
            <Sparkles className="h-4.5 w-4.5 text-white" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Guided Criteria Builder
              </h3>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors focus:outline-none"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-sm p-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-1.5">Example Criteria</p>
                  <div className="space-y-1.5 text-xs">
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Value Mapping: </span>
                      <span className="text-gray-600 dark:text-gray-400">Reduce incident impact + improve audit defensibility</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Criterion: </span>
                      <span className="text-gray-600 dark:text-gray-400">Alerting on privileged group membership changes</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Expected Outcome: </span>
                      <span className="text-gray-600 dark:text-gray-400">"Alert generated and logged with actor, target, time, and before/after values within 2 minutes."</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Actions Taken: </span>
                      <span className="text-gray-600 dark:text-gray-400">"Enabled AD audit source, created test admin group change, validated alert payload + SIEM forwarding."</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Evidence: </span>
                      <span className="text-gray-600 dark:text-gray-400">alert screenshot, syslog entry, SIEM event, report export</span>
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Walk through 6 steps to build and link a solution's technical validation criteria</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isExpanded && activeStep > 0 && !isComplete && (
            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
              Step {activeStep + 1} of {STEPS.length}
            </Badge>
          )}
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-gray-400" />
          )}
        </div>
      </button>
      {isExpanded && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center w-full">
                {STEPS.map((step, index) => {
                  const status = getStepStatus(index);
                  const Icon = step.icon;
                  const isClickable = canNavigateToStep(index);

                  return (
                    <div key={step.id} className="flex items-center flex-1 last:flex-none">
                      <button
                        onClick={() => handleStepClick(index)}
                        disabled={!isClickable && status !== "completed" && status !== "skipped"}
                        className={`flex items-center gap-2 group transition-all duration-200 ${
                          isClickable || status === "completed" || status === "skipped"
                            ? "cursor-pointer"
                            : "cursor-not-allowed opacity-40"
                        }`}
                      >
                        <div
                          className={`relative h-10 w-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 shrink-0 ${
                            status === "completed"
                              ? `${step.bgColor} ${step.darkBgColor} ${step.borderColor} ${step.darkBorderColor}`
                              : status === "active"
                              ? `${step.bgColor} ${step.darkBgColor} ${step.borderColor} ${step.darkBorderColor} ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-blue-400 dark:ring-blue-500`
                              : status === "skipped"
                              ? "bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                              : "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700"
                          }`}
                        >
                          {status === "completed" ? (
                            <Check className={`h-5 w-5 ${step.color}`} />
                          ) : status === "skipped" ? (
                            <SkipForward className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                          ) : (
                            <Icon className={`h-5 w-5 ${status === "active" ? step.color : "text-gray-400 dark:text-gray-500"}`} />
                          )}
                        </div>
                        <div className="hidden sm:block text-left">
                          <p
                            className={`text-xs font-medium leading-tight ${
                              status === "active" || status === "completed"
                                ? "text-gray-900 dark:text-gray-100"
                                : "text-gray-500 dark:text-gray-400"
                            }`}
                          >
                            {step.label}
                          </p>
                          {!step.required && (
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 italic">Optional</span>
                          )}
                          {status === "completed" && selections[step.id].name && (
                            <p className={`text-[10px] ${step.color} truncate max-w-[100px]`}>
                              {selections[step.id].name}
                            </p>
                          )}
                        </div>
                      </button>

                      {index < STEPS.length - 1 && (
                        <div className="flex-1 mx-2 sm:mx-3">
                          <div
                            className={`h-0.5 rounded-full transition-colors duration-300 ${
                              getStepStatus(index) === "completed" || getStepStatus(index) === "skipped"
                                ? "bg-gradient-to-r from-blue-400 to-indigo-400 dark:from-blue-500 dark:to-indigo-500"
                                : "bg-gray-200 dark:bg-gray-700"
                            }`}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {!isComplete && currentStep && (
              <div className="mt-2">
                <StepContent
                  step={currentStep}
                  mode={stepModes[currentStep.id]}
                  onSetMode={(mode) => setStepMode(currentStep.id, mode)}
                  formData={formData[currentStep.id]}
                  onUpdateForm={(field, value) => updateFormField(currentStep.id, field, value)}
                  searchTerm={searchTerms[currentStep.id]}
                  onUpdateSearch={(term) => updateSearchTerm(currentStep.id, term)}
                  items={getItemsForStep(currentStep.id)}
                  onSelectExisting={(item) => handleSelectExisting(currentStep.id, item)}
                  onCreate={() => handleCreate(currentStep.id)}
                  onSkip={!currentStep.required ? () => skipStep(currentStep.id) : undefined}
                  isPending={isAnyMutationPending}
                  showAbbreviation={currentStep.id === "solution"}
                  isSolutionStep={currentStep.id === "solution"}
                  solutionIcons={solutionIcons}
                  allTags={allTags}
                  allLinks={allLinks}
                  docsRepoConfigs={docsRepoConfigs}
                  getTagColor={getTagColor}
                  contextLabel={
                    currentStep.id !== "solution" && selections.solution.name
                      ? `for "${selections.solution.name}"`
                      : undefined
                  }
                  useColumns={true}
                  solutions={solutions}
                />
              </div>
            )}

            {isComplete && (
              <div className="mt-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-gray-50 to-white dark:from-gray-800/50 dark:to-gray-900 p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                    <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Criteria Builder Summary
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Here's everything that was set up
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  {STEPS.map((step) => {
                    const sel = selections[step.id];
                    const Icon = step.icon;
                    return (
                      <div
                        key={step.id}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${
                          sel.mode === "skipped"
                            ? "bg-gray-50 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700 opacity-50"
                            : `${step.bgColor} ${step.darkBgColor} ${step.borderColor} ${step.darkBorderColor}`
                        }`}
                      >
                        <Icon className={`h-4 w-4 ${sel.mode === "skipped" ? "text-gray-400" : step.color}`} />
                        <div className="flex-1 min-w-0">
                          <span className={`text-xs font-medium ${sel.mode === "skipped" ? "text-gray-400 dark:text-gray-500" : "text-gray-900 dark:text-gray-100"}`}>
                            {step.label}:
                          </span>
                          <span className={`text-xs ml-1.5 ${sel.mode === "skipped" ? "text-gray-400 dark:text-gray-500 italic" : "text-gray-600 dark:text-gray-300"}`}>
                            {sel.mode === "skipped"
                              ? "Skipped"
                              : sel.name}
                          </span>
                        </div>
                        {sel.mode !== "skipped" && (
                          <Badge
                            variant="outline"
                            className={`text-[10px] shrink-0 ${
                              sel.isNew
                                ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
                                : "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800"
                            }`}
                          >
                            {sel.isNew ? (
                              <><Plus className="h-2.5 w-2.5 mr-0.5" />New</>
                            ) : (
                              <><Link2 className="h-2.5 w-2.5 mr-0.5" />Linked</>
                            )}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <Button variant="outline" size="sm" onClick={handleReset}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    Build Another
                  </Button>
                  <Button size="sm" onClick={handleFinish}>
                    <Check className="h-3.5 w-3.5 mr-1.5" />
                    Done
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

interface StepContentProps {
  step: StepConfig;
  mode: StepMode;
  onSetMode: (mode: StepMode) => void;
  formData: StepFormData;
  onUpdateForm: (field: string, value: any) => void;
  searchTerm: string;
  onUpdateSearch: (term: string) => void;
  items: { id: number; name: string; description?: string | null; iconUrl?: string; iconName?: string; isAllSolutions?: boolean; solutionIds?: number[] }[];
  onSelectExisting: (item: { id: number; name: string }) => void;
  onCreate: () => void;
  onSkip?: () => void;
  isPending: boolean;
  showAbbreviation?: boolean;
  isSolutionStep?: boolean;
  solutionIcons?: any[];
  allTags?: string[];
  allLinks?: any[];
  docsRepoConfigs?: any[];
  getTagColor?: (tag: string) => string;
  contextLabel?: string;
  useColumns?: boolean;
  solutions?: Solution[];
}

function StepContent({
  step,
  mode,
  onSetMode,
  formData,
  onUpdateForm,
  searchTerm,
  onUpdateSearch,
  items,
  onSelectExisting,
  onCreate,
  onSkip,
  isPending,
  showAbbreviation,
  isSolutionStep,
  solutionIcons = [],
  allTags = [],
  allLinks = [],
  docsRepoConfigs = [],
  getTagColor,
  contextLabel,
  useColumns,
  solutions = [],
}: StepContentProps) {
  const { t } = useTranslation();
  const Icon = step.icon;

  return (
    <div className={`rounded-xl border ${step.borderColor} ${step.darkBorderColor} overflow-hidden`}>
      <div className={`px-4 py-3 ${step.bgColor} ${step.darkBgColor} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${step.color}`} />
          <span className={`text-sm font-medium ${step.color}`}>
            {step.label}
          </span>
          {contextLabel && (
            <span className="text-xs text-gray-500 dark:text-gray-400">{contextLabel}</span>
          )}
          {!step.required && (
            <Badge variant="outline" className="text-[10px] bg-white/50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600">
              Optional
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onSetMode("existing")}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              mode === "existing"
                ? `${step.color} bg-white dark:bg-gray-800 shadow-sm`
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            <Link2 className="h-3 w-3 inline mr-1" />
            Use Existing
          </button>
          <button
            onClick={() => onSetMode("create")}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              mode === "create"
                ? `${step.color} bg-white dark:bg-gray-800 shadow-sm`
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            <Plus className="h-3 w-3 inline mr-1" />
            Create New
          </button>
        </div>
      </div>

      <div className="p-4 bg-white dark:bg-gray-900">
        {mode === "existing" ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={`Search ${step.label.toLowerCase()}s...`}
                value={searchTerm}
                onChange={(e) => onUpdateSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <ScrollArea className={useColumns ? "max-h-[300px]" : "max-h-[200px]"}>
              <div className={useColumns ? "grid grid-cols-2 gap-1" : "space-y-1"}>
                {items.length === 0 ? (
                  <div className={`text-center py-6 ${useColumns ? "col-span-2" : ""}`}>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {searchTerm ? "No matches found" : `No ${step.label.toLowerCase()}s available`}
                    </p>
                    <Button variant="link" size="sm" className="text-xs mt-1" onClick={() => onSetMode("create")}>
                      Create a new one instead
                    </Button>
                  </div>
                ) : (
                  items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => onSelectExisting(item)}
                      className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-gray-50 dark:hover:bg-gray-800 border border-transparent hover:border-gray-200 dark:hover:border-gray-700 transition-all group"
                    >
                      <div className={`h-7 w-7 rounded-md ${step.bgColor} ${step.darkBgColor} flex items-center justify-center shrink-0 mt-0.5`}>
                        {item.iconUrl || item.iconName ? (
                          <SolutionGraphic graphic={item.iconUrl} icon={item.iconName} className="h-4 w-4" />
                        ) : (
                          <Icon className={`h-3.5 w-3.5 ${step.color}`} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            {item.name}
                          </p>
                          {step.id !== "solution" && item.isAllSolutions && (
                            <AllSolutionsBadge className="text-[9px] px-1.5 py-0 shrink-0" />
                          )}
                          {step.id !== "solution" && !item.isAllSolutions && item.solutionIds && item.solutionIds.length > 0 && (
                            <div className="flex items-center gap-0.5 shrink-0">
                              {item.solutionIds.slice(0, 1).map(sid => {
                                const sol = solutions.find(s => s.id === sid);
                                return sol ? (
                                  <SolutionBadge
                                    key={sid}
                                    solutionName={sol.name}
                                    solutionIcon={sol.solutionIcon} solutionIconName={sol.solutionIconName}
                                    className="text-[9px] px-1.5 py-0"
                                  />
                                ) : null;
                              })}
                              {item.solutionIds.length > 1 && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="outline" className="text-[9px] px-1 py-0 bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800 cursor-default">
                                      +{item.solutionIds.length - 1}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-[200px]">
                                    <div className="space-y-1">
                                      {item.solutionIds.slice(1).map(sid => {
                                        const sol = solutions.find(s => s.id === sid);
                                        return sol ? (
                                          <div key={sid} className="flex items-center gap-1.5">
                                            <SolutionGraphic graphic={sol.solutionIcon} icon={sol.solutionIconName} name="" className="w-3.5 h-3.5 object-contain" />
                                            <span className="text-xs">{sol.name}</span>
                                          </div>
                                        ) : null;
                                      })}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          )}
                        </div>
                        {item.description && !useColumns && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                            {item.description}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600 group-hover:text-blue-400 shrink-0 mt-1 transition-colors" />
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">Name *</label>
              <Input
                placeholder={`Enter ${step.label.toLowerCase()} name`}
                value={formData.name}
                onChange={(e) => onUpdateForm("name", e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            {showAbbreviation && (
              <div>
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">Abbreviation *</label>
                <Input
                  placeholder="e.g. SOL"
                  value={formData.abbreviation || ""}
                  onChange={(e) => onUpdateForm("abbreviation", e.target.value)}
                  className="h-9 text-sm"
                  maxLength={10}
                />
              </div>
            )}
            {isSolutionStep && (
              <div className="space-y-1">
              <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">{t("successCriteria.solutionMark.graphic")}</label>
                <Select
                  onValueChange={(value) => onUpdateForm("solutionIcon", value)}
                  value={formData.solutionIcon || "none"}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder={t("successCriteria.solutionMark.selectGraphic")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("successCriteria.solutionMark.noGraphic")}</SelectItem>
                    {(solutionIcons as any[]).map((icon: any) => (
                      <SelectItem key={icon.filename} value={icon.filename}>
                        <div className="flex items-center gap-2">
                          <img
                            src={icon.path}
                            alt={icon.displayName}
                            className="w-5 h-5 object-contain"
                          />
                          {icon.displayName}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <SolutionIconField small value={formData.solutionIconName || ""} onChange={(iconName) => onUpdateForm("solutionIconName", iconName)} />
              </div>
              <p className="text-xs text-muted-foreground">{t("successCriteria.solutionMark.hint")}</p>
              </div>
            )}
            {isSolutionStep && (
              <div>
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">Documentation URL</label>
                <Select
                  onValueChange={(value) => onUpdateForm("documentationLinkId", value === "none" ? null : parseInt(value))}
                  value={formData.documentationLinkId ? String(formData.documentationLinkId) : "none"}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select documentation link" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {(allLinks as any[]).filter((link: any) => link.isActive !== false).map((link: any) => (
                      <SelectItem key={link.id} value={String(link.id)}>
                        <div className="flex flex-col">
                          <span>{link.name}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[220px]">{link.url}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {isSolutionStep && (
              <div>
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">Documentation AI Mapping</label>
                <Select
                  onValueChange={(value) => onUpdateForm("docsRepoConfigId", value === "none" ? null : parseInt(value))}
                  value={formData.docsRepoConfigId ? String(formData.docsRepoConfigId) : "none"}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select documentation source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {(docsRepoConfigs as any[]).filter((config: any) => config.isActive !== false).map((config: any) => (
                      <SelectItem key={config.id} value={String(config.id)}>
                        <span>{config.repoOwner}/{config.repoName} — {config.docsPath}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">Description</label>
              <Textarea
                placeholder={`Describe this ${step.label.toLowerCase()}`}
                value={formData.description}
                onChange={(e) => onUpdateForm("description", e.target.value)}
                className="text-sm min-h-[60px] resize-none"
                rows={2}
              />
            </div>
            {isSolutionStep && allTags.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">Tags</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <FilterMultiSelectButton className="w-full justify-start text-sm h-9">
                      {(formData.tags || []).length > 0
                        ? `${(formData.tags || []).length} tag${(formData.tags || []).length === 1 ? '' : 's'} selected`
                        : "Select tags"
                      }
                    </FilterMultiSelectButton>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-0" align="start">
                    <div className="p-3">
                      <h4 className="font-medium text-xs text-gray-900 dark:text-gray-100 mb-2">Select Tags</h4>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {allTags.map((tag) => (
                          <div key={tag} className="flex items-center space-x-2">
                            <Checkbox
                              id={`stepper-tag-${tag}`}
                              checked={(formData.tags || []).includes(tag)}
                              onCheckedChange={(checked) => {
                                const currentTags = formData.tags || [];
                                if (checked) {
                                  onUpdateForm("tags", [...currentTags, tag]);
                                } else {
                                  onUpdateForm("tags", currentTags.filter((t: string) => t !== tag));
                                }
                              }}
                            />
                            <Label
                              htmlFor={`stepper-tag-${tag}`}
                              className="text-xs font-normal cursor-pointer flex-1"
                            >
                              {tag}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
                {(formData.tags || []).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {(formData.tags || []).map((tag: string) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="text-[10px] cursor-pointer text-white rounded-full px-2 py-0.5"
                        style={{ backgroundColor: getTagColor ? getTagColor(tag) : '#64748B' }}
                        onClick={() => {
                          onUpdateForm("tags", (formData.tags || []).filter((t: string) => t !== tag));
                        }}
                      >
                        {tag} ×
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
            <Button
              size="sm"
              onClick={onCreate}
              disabled={!formData.name.trim() || (isSolutionStep && !formData.abbreviation?.trim()) || isPending}
              className="w-full"
            >
              {isPending ? (
                "Creating..."
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Create {step.label}
                </>
              )}
            </Button>
          </div>
        )}

        {onSkip && (
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
            <Button
              variant="ghost"
              size="sm"
              onClick={onSkip}
              className="w-full text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            >
              <SkipForward className="h-3.5 w-3.5 mr-1.5" />
              Skip this step
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
