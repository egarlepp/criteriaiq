import { SolutionGraphic } from "@/components/ui/solution-graphic";
import type { TFunction } from "i18next";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { LucideIconPicker } from "@/components/ui/lucide-icon-picker";
import { EDGE_TYPES, normalizeLinks, denormalizeLinks } from "@/lib/link-utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { ToastAction } from "@/components/ui/toast";
import { showInfoToast, showSuccessToast, showToast, toastMessages } from "@/lib/toast-helper";
import { 
  Blocks, Grid2x2Plus, CircleMinus, Pin, Grid2x2Check, ChevronLeft, SaveAll, Info, CircleArrowLeft, Component, SkipForward, Check, HandHeart,
  FolderHeart, FolderCog, FolderLock, FolderClock, ChevronDown,
} from "lucide-react";
import * as LucideIcons from "lucide-react";

// ---------- Types
const TYPES = { solution: "solution", component: "component", value_mapping: "value_mapping", criteria: "criteria", outcome: "outcome", action: "action" } as const;

// ---------- Helpers
// Note: EDGE_TYPES, normalizeLinks, and denormalizeLinks are imported from @/lib/link-utils
const laneTitle: Record<string, string> = { [TYPES.solution]: "Solutions", [TYPES.component]: "Components", [TYPES.value_mapping]: "Value Mappings", [TYPES.criteria]: "Criteria", [TYPES.outcome]: "Expected Outcomes", [TYPES.action]: "Actions Taken" };
const singularTitle: Record<string, string> = { [TYPES.solution]: "Solution", [TYPES.component]: "Component", [TYPES.value_mapping]: "Value Mapping", [TYPES.criteria]: "Criteria", [TYPES.outcome]: "Expected Outcome", [TYPES.action]: "Action" };
const colors: Record<string, string> = {
  [TYPES.solution]: "bg-blue-50 border-blue-300 dark:bg-blue-950 dark:border-blue-700 dark:text-blue-100",
  [TYPES.component]: "bg-blue-100 border-blue-400 dark:bg-blue-900 dark:border-blue-600 dark:text-blue-100",
  [TYPES.value_mapping]: "bg-orange-50 border-orange-300 dark:bg-orange-950 dark:border-orange-700 dark:text-orange-100",
  [TYPES.criteria]: "bg-purple-50 border-purple-300 dark:bg-purple-950 dark:border-purple-700 dark:text-purple-100",
  [TYPES.outcome]: "bg-green-50 border-green-300 dark:bg-green-950 dark:border-green-700 dark:text-green-100",
  [TYPES.action]: "bg-amber-50 border-amber-300 dark:bg-amber-950 dark:border-amber-700 dark:text-amber-100"
};
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2,8)}`;
const nextType = (t: any) => t===TYPES.solution?TYPES.component:t===TYPES.component?TYPES.value_mapping:t===TYPES.value_mapping?TYPES.criteria:t===TYPES.criteria?TYPES.outcome:t===TYPES.outcome?TYPES.action:null;

// Helper to ensure all entity arrays are initialized (prevents "Cannot read properties of undefined" errors)
const ensureEntityArrays = (entities: any) => {
  return {
    solution: entities?.solution || [],
    component: entities?.component || [],
    value_mapping: entities?.value_mapping || [],
    criteria: entities?.criteria || [],
    outcome: entities?.outcome || [],
    action: entities?.action || []
  };
};
// Context-aware edge type: determines correct edge based on parent and child types
const edgeFor = (parentType: any, childType?: any) => {
  // If no child type provided, use default flow (for backward compatibility)
  if (!childType) {
    if (parentType === TYPES.solution) return EDGE_TYPES.SComp;  // Default to component
    if (parentType === TYPES.component) return EDGE_TYPES.CC;
    if (parentType === TYPES.criteria) return EDGE_TYPES.CO;
    return EDGE_TYPES.OA;
  }
  // Context-aware: return correct edge based on actual parent→child relationship
  if (parentType === TYPES.solution && childType === TYPES.component) return EDGE_TYPES.SComp;
  if (parentType === TYPES.solution && childType === TYPES.value_mapping) return EDGE_TYPES.SVM;
  if (parentType === TYPES.solution && childType === TYPES.criteria) return EDGE_TYPES.SC;
  if (parentType === TYPES.component && childType === TYPES.value_mapping) return EDGE_TYPES.CompVM;
  if (parentType === TYPES.component && childType === TYPES.criteria) return EDGE_TYPES.CC;
  if (parentType === TYPES.value_mapping && childType === TYPES.criteria) return EDGE_TYPES.VMC;
  if (parentType === TYPES.criteria && childType === TYPES.outcome) return EDGE_TYPES.CO;
  if (parentType === TYPES.criteria && childType === TYPES.action) return EDGE_TYPES.CA;
  if (parentType === TYPES.outcome && childType === TYPES.action) return EDGE_TYPES.OA;
  return edgeFor(parentType);
};
function safeOpen(ev: any): boolean { try { const el = (ev && (ev as any).currentTarget) as HTMLDetailsElement | null; return !!(el && el.open); } catch { return false; } }

// Helper to get icon component for entity type
const getEntityIcon = (item: any, size: number = 14, className?: string) => {
  if (item.type === TYPES.solution && (item.solutionIcon || item.solutionIconName)) {
    return <SolutionGraphic graphic={item.solutionIcon} icon={item.solutionIconName} className={`w-4 h-4 ${className || ''}`} />;
  }
  if (item.type === TYPES.component) return <Component size={size} className={className} />;
  if (item.type === TYPES.value_mapping) return <HandHeart size={size} className={className || "text-orange-600"} />;
  if (item.type === TYPES.criteria) return <LayoutListIcon size={size} className={className} />;
  if (item.type === TYPES.outcome) return <CircleCheckBigIcon size={size} className={className} />;
  if (item.type === TYPES.action) return <ActivityIcon size={size} className={className} />;
  return null;
};

// Helper to get library icon based on entity type
const getLibraryIcon = (entityType: string, size: number = 18, className: string = "text-blue-600") => {
  if (entityType === TYPES.solution) return <PackageIcon size={size} className={className} />;
  if (entityType === TYPES.component) return <Component size={size} className={className} />;
  if (entityType === TYPES.value_mapping) return <HandHeart size={size} className="text-orange-600" />;
  if (entityType === TYPES.criteria) return <LayoutListIcon size={size} className={className} />;
  if (entityType === TYPES.outcome) return <CircleCheckBigIcon size={size} className={className} />;
  if (entityType === TYPES.action) return <ActivityIcon size={size} className={className} />;
  return null;
};

// Helper to get template icon color based on solution count
const getTemplateIconColor = (solutionCount: number): string => {
  if (solutionCount === 1) return "text-blue-600";
  if (solutionCount === 2) return "text-orange-600";
  if (solutionCount >= 3) return "text-purple-600";
  return "text-blue-600"; // Default fallback
};

// Helper to dynamically render Lucide icon from string name
const renderLucideIcon = (iconName: string | undefined, size: number = 14, className?: string) => {
  if (!iconName) return null;

  // Dynamically lookup icon from lucide-react exports
  const IconComponent = (LucideIcons as any)[iconName];

  if (!IconComponent) {
    // Fallback to Blocks if icon not found
    return <Blocks size={size} className={className} />;
  }

  return <IconComponent size={size} className={className} />;
};

// ---------- Icons
const TrashIcon = ({ size = 14, className }: { size?: number; className?: string }) => ( <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className ? `stroke-current ${className}` : "stroke-current"}> <polyline points="3 6 5 6 21 6"></polyline> <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path> <path d="M10 11v6"></path> <path d="M14 11v6"></path> <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path> </svg> );
const ChevronIcon = ({ size = 14 }: { size?: number }) => ( <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"> <polyline points="9 18 15 12 9 6" /> </svg> );
const Chevron = ({ open, size = 14 }: { open?: boolean; size?: number }) => ( <span className="ml-1 inline-flex items-center text-slate-500 disclosure-chevron" aria-hidden> <ChevronIcon size={size} /> </span> );
const CheckIcon = ({ size = 16 }: { size?: number }) => ( <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"> <polyline points="20 6 9 17 4 12"></polyline> </svg> );
const AlertTriangleIcon = ({ size = 16 }: { size?: number }) => ( <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"> <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path> <line x1="12" y1="9" x2="12" y2="13"></line> <line x1="12" y1="17" x2="12.01" y2="17"></line> </svg> );
const XIcon = ({ size = 16 }: { size?: number }) => ( <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"> <line x1="18" y1="6" x2="6" y2="18"></line> <line x1="6" y1="6" x2="18" y2="18"></line> </svg> );
const ChevronLeftIcon = ({ size = 16 }: { size?: number }) => ( <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"> <polyline points="15 18 9 12 15 6" /> </svg> );
const CopyIcon = ({ size = 14 }: { size?: number }) => ( <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"> <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect> <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path> </svg> );
const PlusIcon = ({ size = 16 }: { size?: number }) => ( <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"> <line x1="12" y1="5" x2="12" y2="19"></line> <line x1="5" y1="12" x2="19" y2="12"></line> </svg> );
const LayoutTemplateIcon = ({ size = 14 }: { size?: number }) => ( <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"> <rect width="18" height="7" x="3" y="3" rx="1"></rect> <rect width="9" height="7" x="3" y="14" rx="1"></rect> <rect width="5" height="7" x="16" y="14" rx="1"></rect> </svg> );
const ArrowLeftIcon = ({ size = 14 }: { size?: number }) => ( <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"> <line x1="19" y1="12" x2="5" y2="12"></line> <polyline points="12 19 5 12 12 5"></polyline> </svg> );
const PackageIcon = ({ size = 14, className }: { size?: number; className?: string }) => ( <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}> <path d="m7.5 4.27 9 5.15"></path> <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path> <path d="m3.3 7 8.7 5 8.7-5"></path> <path d="M12 22V12"></path> </svg> );
const LayoutListIcon = ({ size = 14, className }: { size?: number; className?: string }) => ( <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}> <rect width="7" height="7" x="3" y="3" rx="1"></rect> <rect width="7" height="7" x="3" y="14" rx="1"></rect> <path d="M14 4h7"></path> <path d="M14 9h7"></path> <path d="M14 15h7"></path> <path d="M14 20h7"></path> </svg> );
const CircleCheckBigIcon = ({ size = 14, className }: { size?: number; className?: string }) => ( <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}> <path d="M21.801 10A10 10 0 1 1 17 3.335"></path> <path d="m9 11 3 3L22 4"></path> </svg> );
const HelpCircleIcon = ({ size = 14 }: { size?: number }) => ( <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"> <circle cx="12" cy="12" r="10"></circle> <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path> <line x1="12" y1="17" x2="12.01" y2="17"></line> </svg> );
const StarIcon = ({ size = 14, filled = false }: { size?: number; filled?: boolean }) => filled ? ( <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"> <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon> </svg> ) : ( <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"> <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon> </svg> );
const BlocksIcon = ({ size = 14, className }: { size?: number; className?: string }) => ( <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}> <rect width="7" height="7" x="14" y="3" rx="1"></rect> <path d="M10 21V8a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H3"></path> </svg> );
const ActivityIcon = ({ size = 14, className }: { size?: number; className?: string }) => ( <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}> <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"></path> </svg> );
const FocusIcon = ({ size = 14, className }: { size?: number; className?: string }) => ( <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}> <circle cx="12" cy="12" r="3"></circle> <path d="M3 7V5a2 2 0 0 1 2-2h2"></path> <path d="M17 3h2a2 2 0 0 1 2 2v2"></path> <path d="M21 17v2a2 2 0 0 1-2 2h-2"></path> <path d="M7 21H5a2 2 0 0 1-2-2v-2"></path> </svg> );
const SquareMousePointerIcon = ({ size = 14, className }: { size?: number; className?: string }) => ( <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}> <path d="M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z"></path> <path d="M21 11V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6"></path> </svg> );

// ---------- Global Styles
const GlobalStyles = () => ( <style>{` details > summary { list-style: none; } details > summary::-webkit-details-marker { display: none; } summary::marker { content: ""; } .disclosure-chevron { display:inline-flex; transform: rotate(0deg); transition: transform 200ms ease-out; } details[open] > summary .disclosure-chevron { transform: rotate(90deg); } .focus-ring { outline: none; transition-property: box-shadow; transition-duration: 150ms; } .focus-ring:focus-visible { box-shadow: 0 0 0 2px var(--color-indigo-400), 0 0 0 4px var(--color-indigo-200); } button.focus-ring:focus-visible { box-shadow: 0 0 0 2px var(--color-indigo-400), 0 0 0 4px var(--color-indigo-200); } input.focus-ring:focus-visible { box-shadow: 0 0 0 2px var(--color-indigo-400), 0 0 0 4px var(--color-indigo-200); border-color: var(--color-indigo-400); } :root { --color-indigo-200: #c7d2fe; --color-indigo-400: #818cf8; } @keyframes step-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4); } 50% { box-shadow: 0 0 0 6px rgba(99, 102, 241, 0); } } .step-active-pulse { animation: step-pulse 2s ease-in-out infinite; } `}</style> );

// ---------- Dev Tests / Analysis
function runAnalysis(templateData: any, globalLibrary: any) {
  const tests: Array<{pass: boolean; name: string; details?: string}> = [];
  const { entities, links } = templateData;
  if (!entities || !links || !templateData.rootSolutionId) {
    return [{pass: false, name: "No Data", details: "Template is empty or has no root solution."}];
  }

  const allTemplateEntities = [ ...entities.solution, ...(entities.component || []), ...(entities.value_mapping || []), ...entities.criteria, ...entities.outcome, ...entities.action ];
  const allLibraryEntitiesById = { ...globalLibrary.solution.reduce((acc:any, s:any) => ({...acc, [s.id]: s}), {}), ...(globalLibrary.component || []).reduce((acc:any, c:any) => ({...acc, [c.id]: c}), {}), ...(globalLibrary.value_mapping || []).reduce((acc:any, v:any) => ({...acc, [v.id]: v}), {}), ...globalLibrary.criteria.reduce((acc:any, c:any) => ({...acc, [c.id]: c}), {}), ...globalLibrary.outcome.reduce((acc:any, o:any) => ({...acc, [o.id]: o}), {}), ...globalLibrary.action.reduce((acc:any, a:any) => ({...acc, [a.id]: a}), {}) };

  const hasOut=(id:string,type:string)=>links.some((l:any)=>l.fromId===id&&l.type===type);

  // Test 1: Check if criteria have outcomes (only if criteria exist)
  if (entities.criteria.length > 0) {
    const criteriaNoOutcomes = entities.criteria.filter((e:any) => !hasOut(e.id, EDGE_TYPES.CO));
    tests.push({ 
      pass: criteriaNoOutcomes.length === 0, 
      name: "All Criteria have Outcomes", 
      details: criteriaNoOutcomes.length === 0 ? "All criteria properly linked to outcomes." : `${criteriaNoOutcomes.length} criteria are missing outcomes.` 
    });
  } else {
    tests.push({ 
      pass: false, 
      name: "All Criteria have Outcomes", 
      details: "No criteria in template yet. Add criteria from the library to build your template." 
    });
  }

  // Test 2: Check if outcomes have actions (only if outcomes exist)
  if (entities.outcome.length > 0) {
    const outcomesNoActions = entities.outcome.filter((e:any) => !hasOut(e.id, EDGE_TYPES.OA));
    tests.push({ 
      pass: outcomesNoActions.length === 0, 
      name: "All Outcomes have Actions", 
      details: outcomesNoActions.length === 0 ? "All outcomes properly linked to actions." : `${outcomesNoActions.length} outcomes are missing actions.` 
    });
  } else {
    tests.push({ 
      pass: false, 
      name: "All Outcomes have Actions", 
      details: "No outcomes in template yet. Link outcomes to your criteria to continue." 
    });
  }

  // Test 3: Check for inactive items
  const inactiveItems = allTemplateEntities.filter((e:any) => {
    const libraryItem = allLibraryEntitiesById[e.id];
    return libraryItem && libraryItem.isActive === false;
  });
  tests.push({ 
    pass: inactiveItems.length === 0, 
    name: "Items in this Template that are INACTIVE", 
    details: inactiveItems.length === 0 ? "All items are active." : `${inactiveItems.length} items are inactive in the global library.` 
  });

  // Test 4: Library coverage check
  const allLibraryItemIds = new Set(Object.keys(allLibraryEntitiesById));
  const allTemplateItemIds = new Set(allTemplateEntities.map((e:any) => e.id));
  let missingItemCount = 0;
  allLibraryItemIds.forEach(id => {
    if (!allTemplateItemIds.has(id)) missingItemCount++;
  });
  tests.push({ 
    pass: missingItemCount === 0, 
    name: "Items in Library, but NOT in this Template", 
    details: missingItemCount === 0 ? "Template includes all library items." : `${missingItemCount} library items are not included in this template.` 
  });

  return tests;
}


// ---------- Main Component
export default function ValidationCriteriaTemplateBuilder({ globalLibrary: rawGlobalLibrary }: { globalLibrary: any }){
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const { canEdit: permCanEdit } = usePermissions();
  const isAdmin = user?.role === 'Admin';
  const hasTemplateEditPermission = permCanEdit('template_management.criteria-builder');
  const queryClient = useQueryClient();

  // Normalize globalLibrary.links to convert hyphens to underscores for backwards compatibility
  const globalLibrary = useMemo(() => {
    if (!rawGlobalLibrary) return rawGlobalLibrary;
    return {
      ...rawGlobalLibrary,
      links: normalizeLinks(rawGlobalLibrary.links || [])
    };
  }, [rawGlobalLibrary]);

  const [currentTemplate, setCurrentTemplate] = useState<any>(null);
  const [template, setTemplate] = useState<any>(null); // Working draft state for template editing
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<any>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  const [stack, setStack] = useState<any[]>([]);
  const focus = useMemo(() => stack[stack.length - 1] || null, [stack]);

  // Track focused solution's library ID for filtering Library panel
  const [focusedSolutionLibraryId, setFocusedSolutionLibraryId] = useState<number | null>(null);

  // Staging state for Conveyor (lifted to parent to share with RightPalette)
  const [staging, setStaging] = useState<any[]>([]);

  // Skip state: tracks when user skips entity types to advance library view (supports multiple)
  const [skippedEntityTypes, setSkippedEntityTypes] = useState<Set<string>>(new Set());
  const addSkippedType = useCallback((type: string) => {
    setSkippedEntityTypes(prev => new Set([...prev, type]));
  }, []);
  const removeSkippedType = useCallback((type: string) => {
    setSkippedEntityTypes(prev => { const next = new Set(prev); next.delete(type); return next; });
  }, []);

  // Solution link mode: when focused on a solution, user chooses 'component' or 'criteria'
  const [solutionLinkMode, setSolutionLinkModeRaw] = useState<'component' | 'criteria' | null>(null);
  const setSolutionLinkMode = useCallback((mode: 'component' | 'criteria' | null) => {
    setSolutionLinkModeRaw(prev => {
      if (prev === 'criteria' && mode !== 'criteria') {
        setSkippedEntityTypes(s => { const next = new Set(s); next.delete(TYPES.component); return next; });
      }
      return mode;
    });
  }, []);

  // Reset solution link mode when focus changes away from a solution
  useEffect(() => {
    if (focus?.type !== TYPES.solution) {
      setSolutionLinkModeRaw(prev => {
        if (prev === 'criteria') {
          setSkippedEntityTypes(s => { const next = new Set(s); next.delete(TYPES.component); return next; });
        }
        return null;
      });
    }
  }, [focus?.id, focus?.type]);

  // Clear skip state only when the root solution changes (not on every focus change)
  const rootSolutionId = stack.length > 0 ? stack[0]?.id : null;
  useEffect(() => { setSkippedEntityTypes(new Set()); setSolutionLinkModeRaw(null); }, [rootSolutionId]);

  // Clear staging when focus changes
  useEffect(() => { setStaging([]); }, [focus?.id]);

  // Create a unique instance from a library entity
  const createInstance = useCallback((libraryEntity: any) => {
    return {
      ...libraryEntity,
      id: uid(`${libraryEntity.type}-${libraryEntity.id}`),
      libraryId: libraryEntity.id,  // Store original ID for reference
    };
  }, []);

  // Queue an item to staging (shared by Conveyor and RightPalette)
  const queueItem = useCallback((item: any) => {
    if (!focus) return;

    // Calculate rightType with skip state awareness + solution link mode
    let rightType = nextType(focus.type);
    if (focus.type === TYPES.solution && solutionLinkMode === 'criteria') {
      rightType = TYPES.criteria;
    } else if (skippedEntityTypes.has(TYPES.component) && focus.type === TYPES.solution) {
      rightType = skippedEntityTypes.has(TYPES.value_mapping) ? TYPES.criteria : TYPES.value_mapping;
    } else if (skippedEntityTypes.has(TYPES.value_mapping) && focus.type === TYPES.component) {
      rightType = TYPES.criteria;
    } else if (skippedEntityTypes.has(TYPES.outcome) && focus.type === TYPES.criteria) {
      rightType = TYPES.action;
    }

    if (!rightType || item.type !== rightType) return;

    // Prevent duplicates: check if item already in staging by libraryId
    setStaging(prev => {
      const alreadyQueued = prev.some((s: any) => (s.libraryId || s.id) === item.id);
      if (alreadyQueued) return prev;  // Return unchanged if already queued

      // Create a new instance and add to staging
      const instance = createInstance(item);
      return [...prev, instance];
    });
  }, [focus, createInstance, skippedEntityTypes, solutionLinkMode]);

  // Fetch template list
  const { data: templateList = [], refetch: refetchTemplates } = useQuery({
    queryKey: ["/api/validation-criteria-templates"],
    enabled: true,
    staleTime: 0,
  });

  // Helper: Normalize template entities to ensure all have instance IDs and libraryId fields
  // Uses STABLE instance IDs based on library ID to ensure consistency across loads
  const normalizeTemplateEntities = useCallback((entities: any, links: any[]) => {
    const normalized = {
      solution: [] as any[],
      component: [] as any[],
      value_mapping: [] as any[],
      criteria: [] as any[],
      outcome: [] as any[],
      action: [] as any[]
    };

    Object.entries(entities).forEach(([type, items]: [string, any]) => {
      if (!Array.isArray(items)) return;

      (items as any[]).forEach(entity => {
        if (!entity) return;

        // Check if this is already an instance (has libraryId field)
        if (entity.libraryId) {
          // Already normalized instance - use as-is
          normalized[type as keyof typeof normalized].push(entity);
        } else {
          // Legacy entity - create pseudo-instance with STABLE ID
          // Use deterministic ID format that matches Build area: type-libraryId-<hash>
          const stableId = `${type}-${entity.id}-legacy`;
          const instance = {
            ...entity,
            id: stableId,                    // Stable, deterministic instance ID
            libraryId: entity.id,            // Store original library ID
            type: type                        // Ensure type is set
          };
          normalized[type as keyof typeof normalized].push(instance);
        }
      });
    });

    // DO NOT rewrite links - keep them as-is (they may use library IDs or instance IDs)
    // The hasLink function will handle both formats by checking libraryId fields

    return { entities: normalized, links };
  }, []);

  // Fetch template details (enabled when template selected)
  const { data: templateDetails, refetch: refetchDetails } = useQuery({
    queryKey: ["/api/validation-criteria-templates", currentTemplate?.id],
    queryFn: async () => {
      if (!currentTemplate?.id) return null;
      const template = await apiRequest("GET", `/api/validation-criteria-templates/${currentTemplate.id}`);

      // Extract links from instanceEntities (new format) or fall back to top-level links (legacy format)
      // Normalize link types to convert hyphens to underscores for backwards compatibility
      const rawLinks = template.instanceEntities?.links ?? template.links ?? [];
      const links = normalizeLinks(rawLinks);

      // Try to load from instanceEntities first (new format)
      // If empty or missing, fallback to reconstructing from global library (legacy format)
      let entities = template.instanceEntities;

      if (!entities || !entities.solution || entities.solution.length === 0) {
        // Legacy fallback: Build entities from links using global library
        entities = ensureEntityArrays({}) as any;
        const allEntities = { 
          ...globalLibrary.solution.reduce((acc: any, s: any) => ({...acc, [s.id]: s}), {}), 
          ...(globalLibrary.component || []).reduce((acc: any, c: any) => ({...acc, [c.id]: c}), {}),
          ...(globalLibrary.value_mapping || []).reduce((acc: any, v: any) => ({...acc, [v.id]: v}), {}),
          ...globalLibrary.criteria.reduce((acc: any, c: any) => ({...acc, [c.id]: c}), {}), 
          ...globalLibrary.outcome.reduce((acc: any, o: any) => ({...acc, [o.id]: o}), {}), 
          ...globalLibrary.action.reduce((acc: any, a: any) => ({...acc, [a.id]: a}), {}) 
        };

        const rootSolution = globalLibrary.solution.find((s:any) => s.id === template.rootSolutionId);
        if (rootSolution) entities.solution.push(rootSolution);

        links.forEach((link: any) => {
          const fromEntity = allEntities[link.fromId];
          const toEntity = allEntities[link.toId];
          if (fromEntity && !entities[fromEntity.type].find((e:any) => e.id === fromEntity.id)) {
            entities[fromEntity.type].push(fromEntity);
          }
          if (toEntity && !entities[toEntity.type].find((e:any) => e.id === toEntity.id)) {
            entities[toEntity.type].push(toEntity);
          }
        });
      } else {
        // Ensure all entity arrays exist even when loading from instanceEntities
        entities = ensureEntityArrays(entities);
      }

      // Normalize all entities to have instance IDs and libraryId fields
      const { entities: normalizedEntities, links: normalizedLinks } = normalizeTemplateEntities(entities, links);

      // Return with both entities and links at top level for component compatibility
      return { ...template, entities: normalizedEntities, links: normalizedLinks };
    },
    enabled: !!currentTemplate?.id,
    staleTime: 0,
  });

  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: async (template: any) => {
      const { entities, links, ...dbTemplate } = template;
      // Denormalize links for server storage (backwards compatibility)
      const denormalizedLinks = denormalizeLinks(links || []);

      // Include instanceEntities AND top-level links for legacy compatibility
      dbTemplate.instanceEntities = {
        ...entities,
        links: denormalizedLinks
      };
      dbTemplate.links = denormalizedLinks;  // Legacy format support

      // Extract library ID from root solution instance for database storage
      if (dbTemplate.rootSolutionId && entities?.solution?.length > 0) {
        const rootSolutionInstance = entities.solution.find((s: any) => s.id === dbTemplate.rootSolutionId);
        if (rootSolutionInstance && rootSolutionInstance.libraryId) {
          // Instance-based template: extract library ID
          dbTemplate.rootSolutionId = rootSolutionInstance.libraryId;
        } else if (typeof dbTemplate.rootSolutionId === 'number') {
          // Legacy template: preserve numeric library ID
          // Keep dbTemplate.rootSolutionId as is
        } else {
          // Invalid state: clear it
          dbTemplate.rootSolutionId = null;
        }
      } else if (dbTemplate.rootSolutionId === null || dbTemplate.rootSolutionId === undefined) {
        dbTemplate.rootSolutionId = null;
      }
      // Else: preserve existing value (could be numeric for legacy)
      const response = await apiRequest("POST", "/api/validation-criteria-templates", dbTemplate);

      // Re-normalize response links before returning to state
      if (response.instanceEntities?.links) {
        response.instanceEntities.links = normalizeLinks(response.instanceEntities.links);
      }
      if (response.links) {
        response.links = normalizeLinks(response.links);
      }
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/validation-criteria-templates"] });
      showToast({ message: toastMessages.validationCriteria.template.createSuccess });
    },
    onError: (error: any) => {
      showToast({ message: toastMessages.validationCriteria.template.createError });
    },
  });

  // Update template mutation
  const updateTemplateMutation = useMutation({
    mutationFn: async (template: any) => {
      const { entities, links, ...dbTemplate } = template;
      // Denormalize links for server storage (backwards compatibility)
      const denormalizedLinks = denormalizeLinks(links || []);

      // Include instanceEntities AND top-level links for legacy compatibility
      dbTemplate.instanceEntities = {
        ...entities,
        links: denormalizedLinks
      };
      dbTemplate.links = denormalizedLinks;  // Legacy format support

      // Extract library ID from root solution instance for database storage
      if (dbTemplate.rootSolutionId && entities?.solution?.length > 0) {
        const rootSolutionInstance = entities.solution.find((s: any) => s.id === dbTemplate.rootSolutionId);
        if (rootSolutionInstance && rootSolutionInstance.libraryId) {
          // Instance-based template: extract library ID
          dbTemplate.rootSolutionId = rootSolutionInstance.libraryId;
        } else if (typeof dbTemplate.rootSolutionId === 'number') {
          // Legacy template: preserve numeric library ID
          // Keep dbTemplate.rootSolutionId as is
        } else {
          // Invalid state: clear it
          dbTemplate.rootSolutionId = null;
        }
      } else if (dbTemplate.rootSolutionId === null || dbTemplate.rootSolutionId === undefined) {
        dbTemplate.rootSolutionId = null;
      }
      // Else: preserve existing value (could be numeric for legacy)
      const response = await apiRequest("PATCH", `/api/validation-criteria-templates/${template.id}`, dbTemplate);

      // Re-normalize response links before returning to state
      if (response.instanceEntities?.links) {
        response.instanceEntities.links = normalizeLinks(response.instanceEntities.links);
      }
      if (response.links) {
        response.links = normalizeLinks(response.links);
      }
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/validation-criteria-templates"] });
      showToast({ message: toastMessages.validationCriteria.template.updateSuccess });
    },
    onError: (error: any) => {
      showToast({ message: toastMessages.validationCriteria.template.updateError });
    },
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/validation-criteria-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/validation-criteria-templates"] });
      showToast({ message: toastMessages.validationCriteria.template.deleteSuccess });
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
      handleBackToList();
    },
    onError: (error: any) => {
      showToast({ message: toastMessages.validationCriteria.template.deleteError });
    },
  });

  // Toggle star mutation
  const toggleStarMutation = useMutation({
    mutationFn: async ({ id, isStarred }: { id: number; isStarred: boolean }) => {
      return apiRequest("PATCH", `/api/validation-criteria-templates/${id}/star`, { isStarred });
    },
    onMutate: async ({ id, isStarred }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/validation-criteria-templates"] });
      const previousTemplates = queryClient.getQueryData(["/api/validation-criteria-templates"]);

      queryClient.setQueryData(["/api/validation-criteria-templates"], (old: any) => {
        if (!old) return old;
        return old.map((t: any) => t.id === id ? { ...t, isStarred } : t);
      });

      return { previousTemplates };
    },
    onError: (err, variables, context) => {
      if (context?.previousTemplates) {
        queryClient.setQueryData(["/api/validation-criteria-templates"], context.previousTemplates);
      }
      showToast({ message: toastMessages.validationCriteria.template.starError });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/validation-criteria-templates"] });
    },
  });

  // Sidebar inline toggle for active/system status (admin only)
  const handleSidebarToggle = async (templateId: number, field: 'isActive' | 'isSystem', value: boolean) => {
    try {
      await apiRequest("PATCH", `/api/validation-criteria-templates/${templateId}`, { [field]: value });
      queryClient.setQueryData(["/api/validation-criteria-templates"], (old: any) => {
        if (!old) return old;
        return old.map((t: any) => t.id === templateId ? { ...t, [field]: value } : t);
      });
    } catch {
      showToast({ message: toastMessages.validationCriteria.template.updateError });
    }
  };

  useEffect(() => {
    if (templateDetails) {
      // Convert rootSolutionId from library ID to instance ID for instance-based templates
      let rootSolutionInstanceId = templateDetails.rootSolutionId;
      let firstSolutionLibraryId = null;

      if (templateDetails.entities?.solution?.length > 0) {
        if (templateDetails.rootSolutionId) {
          // Has rootSolutionId: convert from library ID to instance ID if needed
          const hasInstanceEntities = templateDetails.entities.solution.some((s: any) => s.libraryId !== undefined);

          if (hasInstanceEntities) {
            // Instance-based template: find instance by libraryId
            const rootSolutionInstance = templateDetails.entities.solution.find(
              (s: any) => s.libraryId === templateDetails.rootSolutionId
            );
            if (rootSolutionInstance) {
              rootSolutionInstanceId = rootSolutionInstance.id;
              firstSolutionLibraryId = rootSolutionInstance.libraryId || rootSolutionInstance.id;
            }
          } else {
            // Legacy template: rootSolutionId is the library ID
            firstSolutionLibraryId = templateDetails.rootSolutionId;
          }
        } else {
          // No rootSolutionId but has solutions: auto-set to first solution
          const firstSolution = templateDetails.entities.solution[0];
          rootSolutionInstanceId = firstSolution.id;
          firstSolutionLibraryId = firstSolution.libraryId || firstSolution.id;
        }
      }

      const hydratedTemplate = {
        ...templateDetails,
        rootSolutionId: rootSolutionInstanceId,
        entities: ensureEntityArrays(templateDetails.entities),
        links: normalizeLinks(templateDetails.links || [])
      };

      setCurrentTemplate(hydratedTemplate);
      setTemplate(hydratedTemplate); // Hydrate the working draft state
      setStack(templateDetails.entities.solution[0] ? [templateDetails.entities.solution[0]] : []);

      // Auto-focus first solution on template load
      setFocusedSolutionLibraryId(firstSolutionLibraryId);
    }
  }, [templateDetails]);

  const handleSelectTemplate = async (id: number) => {
    setCurrentTemplate({ id });
    setTemplate(null); // Clear working draft while loading
  };

  const handleNewTemplate = () => {
    const newTemplate = {
      id: null,
      name: t("validationCriteriaTemplateBuilder.newTemplate", "New Unsaved Template"),
      rootSolutionId: null,
      links: [],
      icon: "LayoutTemplate",
      isStarred: false,
      entities: ensureEntityArrays({})
    };
    setCurrentTemplate(newTemplate);
    setTemplate(newTemplate); // Initialize working draft state
    setStack([]);
  };

  const handleDuplicateTemplate = async (template: any) => {
    setCurrentTemplate({ id: template.id });

    setTimeout(() => {
      if (templateDetails) {
        const newTemplate = {
          ...templateDetails,
          id: null,
          name: `${templateDetails.name} (${t("validationCriteriaTemplateBuilder.copy", "Copy")})`,
          entities: ensureEntityArrays(templateDetails.entities),
          links: normalizeLinks(templateDetails.links || [])
        };
        setCurrentTemplate(newTemplate);
        setTemplate(newTemplate); // Hydrate working draft for duplicate
        setStack(newTemplate.entities.solution[0] ? [newTemplate.entities.solution[0]] : []);
        showSuccessToast(t("validationCriteriaTemplateBuilder.duplicated", "Template duplicated"), t("validationCriteriaTemplateBuilder.duplicatedDescription", "Save to make changes permanent."));
      }
    }, 500);
  };

  const handleBackToList = () => {
    setCurrentTemplate(null);
    setTemplate(null); // Clear working draft
    setStack([]);
  };

  const handleSaveTemplate = async (templateData: any) => {
    try {
      if (templateData.id) {
        const saved = await updateTemplateMutation.mutateAsync(templateData);
        // Preserve instance-based rootSolutionId from working draft (templateData)
        // Server returns library ID, but UI needs instance ID for entity lookups
        const updatedTemplate = { 
          ...templateData, 
          ...saved, 
          entities: templateData.entities,
          rootSolutionId: templateData.rootSolutionId // Preserve instance ID
        };
        setCurrentTemplate(updatedTemplate);
        setTemplate(updatedTemplate); // Keep working draft in sync
        return updatedTemplate;
      } else {
        const saved = await createTemplateMutation.mutateAsync(templateData);
        // Preserve instance-based rootSolutionId from working draft (templateData)
        // Server returns library ID, but UI needs instance ID for entity lookups
        const updatedTemplate = { 
          ...templateData, 
          ...saved, 
          entities: templateData.entities,
          rootSolutionId: templateData.rootSolutionId // Preserve instance ID
        };
        setCurrentTemplate(updatedTemplate);
        setTemplate(updatedTemplate); // Keep working draft in sync
        return updatedTemplate;
      }
    } catch (err) {
      toast({
        variant: "error",
        title: t("common.error", "Error"),
        description: t("validationCriteriaTemplateBuilder.saveFailed", "Failed to save template"),
        action: <ToastAction altText={t("validationCriteriaTemplateBuilder.retry", "Retry")} onClick={() => handleSaveTemplate(templateData)}>{t("validationCriteriaTemplateBuilder.retry", "Retry")}</ToastAction>
      });
      throw err;
    }
  };

  const handleDeleteTemplate = () => {
    if (templateToDelete) {
      deleteTemplateMutation.mutate(templateToDelete.id);
    }
  };

  const handleToggleStar = (template: any, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleStarMutation.mutate({ id: template.id, isStarred: !template.isStarred });
  };

  const handleDeleteTemplateFromList = (templateId: number, onSuccess?: () => void) => {
    deleteTemplateMutation.mutate(templateId, {
      onSuccess: () => {
        // Only clear selection after successful deletion
        if (template && template.id === templateId) {
          setCurrentTemplate(null);
          setTemplate(null); // Clear working draft
          setStack([]);
        }
        // Call the callback to close the dialog
        if (onSuccess) onSuccess();
      },
      onError: () => {
        // Dialog stays open on error so user can see the error toast and retry
        // Template selection persists so user doesn't lose context
        // deleteTemplateMutation already handles the error toast
      }
    });
  };

  const allLibraryEntitiesById = useMemo(() => {
    if (!globalLibrary) return {};
    const all = {} as any;
    Object.values(globalLibrary).flat().forEach((e:any) => all[e.id] = e);
    return all;
  }, [globalLibrary]);

  const currentTemplateById = useMemo(()=> {
    if (!template || !template.entities) return {};
    const all = {} as any;
    const allEntities = [
      ...(template.entities.solution || []),
      ...(template.entities.component || []),
      ...(template.entities.value_mapping || []),
      ...(template.entities.criteria || []),
      ...(template.entities.outcome || []),
      ...(template.entities.action || [])
    ];
    // Use composite keys to prevent ID collisions between entity types
    allEntities.forEach((e:any) => {
      all[`${e.type}-${e.id}`] = e;  // e.g., "outcome-1", "criteria-1"
      all[e.id] = e;  // Also keep plain ID for backwards compatibility
    });
    return all;
  }, [template]);

  const onAddRootSolution = (solution: any) => {
    if (!template) return;
    // Create a unique instance for the solution
    const instance = {
      ...solution,
      id: uid(`${solution.type}-${solution.id}`),
      libraryId: solution.id,
    };
    setTemplate((prev:any) => {
      if (!prev) return prev;
      // Ensure all entity arrays exist before spreading
      const ensuredEntities = ensureEntityArrays(prev.entities || {});
      return {
        id: prev.id,
        name: prev.name,
        rootSolutionId: prev.rootSolutionId || instance.id,  // Keep existing rootSolutionId if present
        icon: prev.icon,
        isStarred: prev.isStarred,
        links: [...(prev.links || [])],
        entities: {
          solution: [...ensuredEntities.solution, instance],  // Add to existing solutions instead of replacing
          component: [...ensuredEntities.component],
          criteria: [...ensuredEntities.criteria],
          outcome: [...ensuredEntities.outcome],
          action: [...ensuredEntities.action]
        }
      };
    });
    setStack([instance]);
  };

  if (!globalLibrary) {
    return <div className="p-4">{t("common.loading", "Loading...")} {t("validationCriteriaTemplateBuilder.library", "Library")}...</div>;
  }

  const canDelete = template && template.id;

  // Permission gate: unified formula — admin always, or permission holder who created it
  const canEditCurrentTemplate = template
    ? (isAdmin || (hasTemplateEditPermission && template.createdBy === user?.id))
    : false;

  return (
   <div className="space-y-4">
      <GlobalStyles />
      <Card className="flex flex-col">
        <CardHeader className="pt-[12px] pb-3 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <CardTitle className="text-xl">
                {template 
                  ? t("validationCriteriaTemplateBuilder.templateBuilderWithName", "Validation Criteria Template Builder: {{name}}", { name: template.name })
                  : t("validationCriteriaTemplateBuilder.validationCriteriaTemplateBuilder", "Validation Criteria Template Builder")
                }
              </CardTitle>
            </div>
            {template && (
              <div className="flex items-center gap-3 shrink-0">
                {canEditCurrentTemplate && (
                  <Button
                    onClick={() => setSaveDialogOpen(true)}
                    disabled={!template}
                    variant="default"
                    className="flex items-center gap-2"
                  >
                    <SaveAll className="h-4 w-4" />
                    {t("validationCriteriaTemplateBuilder.saveTemplate", "Save Template")}
                  </Button>
                )}
                {canDelete && canEditCurrentTemplate && (
                  <>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="vc-template-active"
                        checked={template.isActive !== false}
                        onCheckedChange={(checked) => {
                          setTemplate((prev: any) => ({
                            ...prev,
                            isActive: checked
                          }));
                        }}
                        disabled={!isAdmin}
                      />
                      <label htmlFor="vc-template-active" className={`text-sm ${!isAdmin ? "text-gray-400" : "text-gray-700 dark:text-gray-300"}`}>Active</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="vc-template-system"
                        checked={template.isSystem === true}
                        onCheckedChange={(checked) => {
                          setTemplate((prev: any) => ({
                            ...prev,
                            isSystem: !!checked
                          }));
                        }}
                        disabled={!isAdmin}
                      />
                      <label htmlFor="vc-template-system" className={`text-sm ${!isAdmin ? "text-gray-400" : "text-gray-700 dark:text-gray-300"}`}>System</label>
                    </div>
                    <button
                      onClick={() => {
                        setTemplateToDelete(template);
                        setDeleteDialogOpen(true);
                      }}
                      title={t("validationCriteriaTemplateBuilder.deleteTemplate", "Delete Template")}
                      className="focus-ring rounded-full p-3 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <TrashIcon size={20} />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          {template && template.id && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mt-2 border-t pt-2 text-xs text-gray-500">
              <span>
                <span className="font-medium text-gray-600">{t("validationCriteriaTemplateBuilder.createdBy")}</span>{" "}
                {template.createdByUser
                  ? `${template.createdByUser.firstName || ''} ${template.createdByUser.lastName || ''}`.trim() || template.createdByUser.email || '—'
                  : '—'}
              </span>
              <span>
                <span className="font-medium text-gray-600">{t("validationCriteriaTemplateBuilder.createdAt")}</span>{" "}
                {template.createdAt ? new Date(template.createdAt).toLocaleDateString() : '—'}
              </span>
              <span>
                <span className="font-medium text-gray-600">{t("validationCriteriaTemplateBuilder.lastUpdated")}</span>{" "}
                {template.updatedAt ? new Date(template.updatedAt).toLocaleDateString() : '—'}
              </span>
              <span>
                <span className="font-medium text-gray-600">{t("validationCriteriaTemplateBuilder.updatedBy")}</span>{" "}
                {template.updatedByUser
                  ? `${template.updatedByUser.firstName || ''} ${template.updatedByUser.lastName || ''}`.trim() || template.updatedByUser.email || '—'
                  : '—'}
              </span>
            </div>
          )}
        </CardHeader>

        {template && !canEditCurrentTemplate && (
          <div className="mx-6 mb-2 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>{t("validationCriteriaTemplateBuilder.viewOnlyNotOwner")}</span>
          </div>
        )}

        <div className="px-6 pb-6">
          <div className="grid grid-cols-10 gap-4">

              <div className="relative col-span-3 rounded-lg border bg-background p-4 pb-6">
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] z-0">
                  <svg width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="7" height="7" x="14" y="3" rx="1"></rect>
                    <path d="M10 21V8a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H3"></path>
                  </svg>
                </div>
                <div className="relative z-10">
                  {!template ? (
                    <TemplateListView
                      templateList={templateList}
                      onSelectTemplate={handleSelectTemplate}
                      onNewTemplate={handleNewTemplate}
                      onDuplicateTemplate={handleDuplicateTemplate}
                      onToggleStar={handleToggleStar}
                      onDeleteTemplate={handleDeleteTemplateFromList}
                      onToggle={handleSidebarToggle}
                      isAdmin={!!isAdmin}
                      hasTemplateEditPermission={hasTemplateEditPermission}
                      isDeleting={deleteTemplateMutation.isPending}
                      currentUserId={user?.id}
                      t={t}
                    />
                  ) : (
                    <LeftAccordion
                      template={template}
                      setTemplate={setTemplate}
                      allLibraryEntitiesById={allLibraryEntitiesById}
                      byId={currentTemplateById}
                      stack={stack}
                      setStack={setStack}
                      onBack={handleBackToList}
                      focusedSolutionLibraryId={focusedSolutionLibraryId}
                      setFocusedSolutionLibraryId={setFocusedSolutionLibraryId}
                      t={t}
                    />
                  )}
                </div>
              </div>

              <div className="relative col-span-4 rounded-lg border bg-background p-4 pb-6">
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03]">
                  <svg width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="7" height="7" x="14" y="3" rx="1"></rect>
                    <path d="M10 21V8a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H3"></path>
                  </svg>
                </div>
                <div className="relative z-10 min-h-[500px]">
                  {!template ? (
                    <BuilderPlaceholder t={t} />
                  ) : (
                    <Conveyor
                      key={template.id || 'new'}
                      template={template}
                      setTemplate={setTemplate}
                      byId={currentTemplateById}
                      stack={stack}
                      setStack={setStack}
                      focus={focus}
                      onAddRootSolution={onAddRootSolution}
                      staging={staging}
                      setStaging={setStaging}
                      queueItem={queueItem}
                      skippedEntityTypes={skippedEntityTypes}
                      addSkippedType={addSkippedType}
                      removeSkippedType={removeSkippedType}
                      solutionLinkMode={solutionLinkMode}
                      setSolutionLinkMode={setSolutionLinkMode}
                      t={t}
                    />
                  )}
                </div>
              </div>

              <div className="relative col-span-3 rounded-lg border bg-background p-4 pb-6">
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03]">
                  <svg width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="7" height="7" x="14" y="3" rx="1"></rect>
                    <path d="M10 21V8a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H3"></path>
                  </svg>
                </div>
                <div className="relative z-10">
                  {!template ? (
                    <BuilderPlaceholder isRightPalette={true} t={t} />
                  ) : (
                    <RightPalette
                      key={template.id || 'new'}
                      template={template}
                      setTemplate={setTemplate}
                      globalLibrary={globalLibrary}
                      focus={focus}
                      stack={stack}
                      setStack={setStack}
                      onAddRootSolution={onAddRootSolution}
                      staging={staging}
                      queueItem={queueItem}
                      focusedSolutionLibraryId={focusedSolutionLibraryId}
                      skippedEntityTypes={skippedEntityTypes}
                      addSkippedType={addSkippedType}
                      removeSkippedType={removeSkippedType}
                      solutionLinkMode={solutionLinkMode}
                      setSolutionLinkMode={setSolutionLinkMode}
                      t={t}
                    />
                  )}
                </div>
              </div>
            </div>
        </div>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("validationCriteriaTemplateBuilder.deleteTitle", "Delete Template")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("validationCriteriaTemplateBuilder.deleteConfirmation", "Are you sure you want to delete this template? This action cannot be undone.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTemplate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("common.delete", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {template && (
        <SaveTemplateDialog
          open={saveDialogOpen}
          onOpenChange={setSaveDialogOpen}
          template={template}
          globalLibrary={globalLibrary}
          onSave={handleSaveTemplate}
          t={t}
        />
      )}
    </div>
  );
}

// ---------- View: Template List (in Left Column)
function TemplateListView({ templateList, onSelectTemplate, onNewTemplate, onDuplicateTemplate, onToggleStar, onDeleteTemplate, onToggle, isAdmin, hasTemplateEditPermission, isDeleting, currentUserId, t }: any) {
  const [myExpanded, setMyExpanded] = useState(true);
  const [customExpanded, setCustomExpanded] = useState(true);
  const [systemExpanded, setSystemExpanded] = useState(true);
  const [inactiveExpanded, setInactiveExpanded] = useState(false);

  // System = isSystem !== false; My = isSystem===false && creator; Custom = isSystem===false && !creator
  const myTemplates = templateList.filter((tmpl: any) => tmpl.isSystem === false && tmpl.createdBy === currentUserId && tmpl.isActive !== false);
  const customTemplates = templateList.filter((tmpl: any) => tmpl.isSystem === false && tmpl.createdBy !== currentUserId && tmpl.isActive !== false);
  const systemTemplates = templateList.filter((tmpl: any) => tmpl.isSystem !== false && tmpl.isActive !== false);
  const inactiveTemplates = templateList.filter((tmpl: any) => tmpl.isActive === false);

  const sections = [
    { key: 'my', label: 'My Templates', icon: FolderHeart, iconColor: 'text-rose-500', items: myTemplates, expanded: myExpanded, toggle: setMyExpanded },
    { key: 'custom', label: 'Other Templates', icon: FolderCog, iconColor: 'text-amber-600', items: customTemplates, expanded: customExpanded, toggle: setCustomExpanded },
    { key: 'system', label: 'System Templates', icon: FolderLock, iconColor: 'text-blue-600', items: systemTemplates, expanded: systemExpanded, toggle: setSystemExpanded },
    { key: 'inactive', label: 'Inactive Templates', icon: FolderClock, iconColor: 'text-gray-400', items: inactiveTemplates, expanded: inactiveExpanded, toggle: setInactiveExpanded },
  ];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <CardTitle className="text-2xl font-bold leading-none tracking-tight flex items-center gap-2">
          <Grid2x2Plus className="h-5 w-5 text-blue-600" />
          {t("validationCriteriaTemplateBuilder.templates", "Validation Templates")}
        </CardTitle>
        {(isAdmin || hasTemplateEditPermission) && (
          <button
            onClick={onNewTemplate}
            className="focus-ring rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1 text-xs flex items-center gap-1"
          >
            <Grid2x2Plus className="h-4 w-4" />
            {t("validationCriteriaTemplateBuilder.new", "New")}
          </button>
        )}
      </div>
      {templateList.length === 0 ? (
        <div className="text-sm text-slate-500 text-center py-8">
          {t("validationCriteriaTemplateBuilder.noTemplates", "No templates yet. Create one to get started.")}
        </div>
      ) : (
        <div className="space-y-2">
          {sections.map(({ key, label, icon: Icon, iconColor, items, expanded, toggle }) => (
            <div key={key} className="border rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => toggle(!expanded)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-left"
              >
                <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
                <span className="font-semibold text-xs">{label}</span>
                <span className="ml-1 text-xs text-gray-500 bg-gray-200 dark:bg-slate-700 rounded-full px-1.5 py-0.5 font-medium">{items.length}</span>
                <ChevronDown className={`h-3.5 w-3.5 ml-auto text-gray-400 transition-transform duration-200 ${expanded ? '' : '-rotate-90'}`} />
              </button>
              {expanded && (
                <div className="p-2 space-y-2">
                  {items.length > 0 ? items.map((template: any) => (
                    <TemplateListItem
                      key={template.id}
                      template={template}
                      onSelect={onSelectTemplate}
                      onDuplicate={onDuplicateTemplate}
                      onToggleStar={onToggleStar}
                      onDelete={onDeleteTemplate}
                      onToggle={onToggle}
                      isAdmin={isAdmin}
                      hasTemplateEditPermission={hasTemplateEditPermission}
                      isDeleting={isDeleting}
                      currentUserId={currentUserId}
                      t={t}
                    />
                  )) : (
                    <div className="text-xs text-slate-400 text-center py-3">No {label.toLowerCase()} found.</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateListItem({ template, onSelect, onDuplicate, onToggleStar, onDelete, onToggle, isAdmin, hasTemplateEditPermission, isDeleting, currentUserId, t }: any) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);

  const handleConfirmDelete = () => {
    // Call onDelete with callback to close dialog only on success
    onDelete(template.id, () => setShowDeleteConfirm(false));
  };

  // Calculate solution count and determine icon color
  const solutionCount = template.entities?.solution?.length || 0;
  const iconColor = getTemplateIconColor(solutionCount);

  const canEditDelete = isAdmin || (hasTemplateEditPermission && template.createdBy === currentUserId);

  return (
    <>
      <div className={`rounded-lg border bg-slate-50 dark:bg-gray-800 dark:border-gray-700 p-2 ${template.isActive === false ? 'opacity-70' : ''}`}>
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <button
              onClick={() => onSelect(template.id)}
              title={t("validationCriteriaTemplateBuilder.clickToEdit", "Click to Edit Template")}
              className="font-medium text-sm text-left hover:underline focus-ring rounded w-full flex items-center gap-2"
            >
              {template.icon ? (
                <span className={`shrink-0 ${iconColor}`}>
                  {renderLucideIcon(template.icon, 14, iconColor)}
                </span>
              ) : (
                <Grid2x2Plus size={14} className={`${iconColor} shrink-0`} />
              )}
              <span className="truncate">ID#{template.id}: {template.name}</span>
            </button>
            {template.isActive === false && (
              <div className="flex items-center gap-2 mt-1 ml-5">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-gray-500 border-gray-300 bg-gray-50">{t("validationCriteriaTemplateBuilder.inactive")}</Badge>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            {template.usageCount !== undefined && (
              <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 text-xs px-2 py-0.5">
                {template.usageCount}
              </Badge>
            )}
            <button
              onClick={(e) => onToggleStar(template, e)}
              title={template.isStarred ? t("validationCriteriaTemplateBuilder.unstar", "Remove from starred") : t("validationCriteriaTemplateBuilder.star", "Add to starred")}
              className="focus-ring rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:text-gray-400 dark:hover:bg-gray-700"
            >
              <StarIcon size={14} filled={template.isStarred} />
            </button>
            {canEditDelete && (
              <button
                onClick={() => onDuplicate(template)}
                title={t("validationCriteriaTemplateBuilder.duplicate", "Duplicate Template")}
                className="focus-ring rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                <CopyIcon size={14} />
              </button>
            )}
            {canEditDelete && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                title={t("validationCriteriaTemplateBuilder.deleteTemplate", "Delete Template")}
                aria-label={t("validationCriteriaTemplateBuilder.deleteTemplate")}
                className="focus-ring rounded-full p-2 text-red-600 hover:bg-red-50 dark:hover:bg-gray-700"
              >
                <TrashIcon size={14} />
              </button>
            )}
            {template.description && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDescriptionOpen(!descriptionOpen);
                }}
                title={t("validationCriteriaTemplateBuilder.showDescription", "Click to Show Template Description")}
                className="focus-ring ml-1 rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                <span className={`inline-block transition-transform ${descriptionOpen ? 'rotate-90' : ''}`}>
                  <ChevronIcon size={14} />
                </span>
              </button>
            )}
          </div>
        </div>
        {descriptionOpen && template.description && (
          <div className="mt-2 rounded-md border border-slate-200 bg-white dark:bg-gray-700 dark:border-gray-600 p-3 text-sm text-slate-700 dark:text-gray-200">
            {template.description}
          </div>
        )}
      </div>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("validationCriteriaTemplateBuilder.confirmDelete", "Delete Template?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("validationCriteriaTemplateBuilder.confirmDeleteDescription", `Are you sure you want to delete "{{name}}"? This action cannot be undone.`, { name: template.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t("common.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeleting ? t("common.deleting", "Deleting...") : t("common.delete", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------- View: Placeholder (in Middle/Right Columns)
function BuilderPlaceholder({ isRightPalette = false, t }: { isRightPalette?: boolean; t: any }) {
  return (
    <div className="flex h-full flex-col text-sm text-slate-500">
      {isRightPalette && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-400">{t("validationCriteriaTemplateBuilder.library", "Library")}</div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-slate-400"><input type="checkbox" disabled /> {t("validationCriteriaTemplateBuilder.showHidden", "Show hidden")}</label>
          </div>
        </div>
      )}
      {isRightPalette && (
         <input placeholder={t("validationCriteriaTemplateBuilder.searchLibrary", "Search Library")} disabled className="mb-2 rounded-md border px-2 py-1 text-sm bg-slate-50" />
      )}
      <div className="flex h-full flex-col items-center justify-center text-center">
        <p>{t("validationCriteriaTemplateBuilder.selectTemplate", "Select a template from the left to start building.")}</p>
      </div>
    </div>
  );
}



// ---------- Sub-Component: LeftAccordion
function LeftAccordion({ template, setTemplate, allLibraryEntitiesById, byId, stack, setStack, onBack, focusedSolutionLibraryId, setFocusedSolutionLibraryId, t }: any){
  const { toast } = useToast();
  const { entities = { solution: [], component: [], criteria: [], outcome: [], action: [] }, links = [] } = template || {};

  // Local state for accordion open/close
  const [openSolution,setOpenSolution] = useState<Record<string, boolean>>({});
  const [openComponent,setOpenComponent] = useState<Record<string, boolean>>({});
  const [openCriteria,setOpenCriteria] = useState<Record<string, boolean>>({});

  const childrenOf = (from:any)=>{ 
    if(!from) return[]; 
    const t=from.type; 

    // For solutions, check BOTH solution-to-component AND solution-to-criteria links
    let filteredLinks;
    if (t === TYPES.solution) {
      filteredLinks = links.filter((l:any) => 
        (l.type === EDGE_TYPES.SComp || l.type === EDGE_TYPES.SC) && l.fromId === from.id
      );
    } else if (t === TYPES.criteria) {
      filteredLinks = links.filter((l:any) => 
        (l.type === EDGE_TYPES.CO || l.type === EDGE_TYPES.CA) && l.fromId === from.id
      );
    } else {
      const edge = edgeFor(t);
      filteredLinks = links.filter((l:any) => l.type === edge && l.fromId === from.id);
    }

    // Map each link to its child entity, determining type from the link itself
    const children = filteredLinks.map((link:any) => {
      const childId = link.toId;
      // Determine child type from link type
      let childType;
      if (link.type === EDGE_TYPES.SComp) childType = TYPES.component;
      else if (link.type === EDGE_TYPES.SC) childType = TYPES.criteria;
      else if (link.type === EDGE_TYPES.CC) childType = TYPES.criteria;
      else if (link.type === EDGE_TYPES.CO) childType = TYPES.outcome;
      else if (link.type === EDGE_TYPES.OA) childType = TYPES.action;
      else if (link.type === EDGE_TYPES.CA) childType = TYPES.action;
      else childType = nextType(t); // Fallback to default

      return byId[`${childType}-${childId}`] || byId[childId];
    }).filter(Boolean);

    return children;
  };

  const unlinkEntity = (entity: any) => {
    if (!entity) return;

    const getDescendantIds = (entity: any, links: any[]) => {
      const childrenIds = new Set<string>();

      // For solutions, check BOTH solution-to-component AND solution-to-criteria links
      let outboundLinks;
      if (entity.type === TYPES.solution) {
        outboundLinks = links.filter(l => 
          l.fromId === entity.id && (l.type === EDGE_TYPES.SComp || l.type === EDGE_TYPES.SC)
        );
      } else if (entity.type === TYPES.criteria) {
        outboundLinks = links.filter(l => 
          l.fromId === entity.id && (l.type === EDGE_TYPES.CO || l.type === EDGE_TYPES.CA)
        );
      } else {
        const edge = edgeFor(entity.type);
        if (!edge) return childrenIds;
        outboundLinks = links.filter(l => l.fromId === entity.id && l.type === edge);
      }

      outboundLinks.forEach(l => {
        childrenIds.add(l.toId);

        // Determine child type from link type
        let childType;
        if (l.type === EDGE_TYPES.SComp) childType = TYPES.component;
        else if (l.type === EDGE_TYPES.SC) childType = TYPES.criteria;
        else if (l.type === EDGE_TYPES.CC) childType = TYPES.criteria;
        else if (l.type === EDGE_TYPES.CO) childType = TYPES.outcome;
        else if (l.type === EDGE_TYPES.OA) childType = TYPES.action;
        else if (l.type === EDGE_TYPES.CA) childType = TYPES.action;
        else childType = nextType(entity.type); // Fallback

        // Look up child entity in template's byId map (not global library)
        const childEntity = byId[`${childType}-${l.toId}`] || byId[l.toId];
        if (childEntity) {
          getDescendantIds(childEntity, links).forEach(id => childrenIds.add(id));
        }
      });
      return childrenIds;
    };

    const idsToUnlink = new Set([entity.id, ...getDescendantIds(entity, template.links)]);

    setTemplate((prev:any) => {
      // Guard against null state during async loads
      if (!prev || !prev.entities || !prev.links) return prev;

      const newLinks = prev.links.filter((l:any) => !idsToUnlink.has(l.fromId) && !idsToUnlink.has(l.toId));
      const newEntities = {
        solution: prev.entities.solution.filter((e:any) => !idsToUnlink.has(e.id)),
        component: prev.entities.component.filter((e:any) => !idsToUnlink.has(e.id)),
        value_mapping: (prev.entities.value_mapping || []).filter((e:any) => !idsToUnlink.has(e.id)),
        criteria: prev.entities.criteria.filter((e:any) => !idsToUnlink.has(e.id)),
        outcome: prev.entities.outcome.filter((e:any) => !idsToUnlink.has(e.id)),
        action: prev.entities.action.filter((e:any) => !idsToUnlink.has(e.id))
      };

      let newRootId = prev.rootSolutionId;
      if (entity.type === TYPES.solution && entity.id === prev.rootSolutionId) {
        newRootId = null;
      }

      return { ...prev, links: newLinks, entities: newEntities, rootSolutionId: newRootId };
    });
  };

  const deleteWithUndo = (entity: any, label: string) => {
    const originalLinks = [...template.links];
    const originalEntities = JSON.parse(JSON.stringify(template.entities));
    const originalRootId = template.rootSolutionId;

    unlinkEntity(entity);

    if (stack.some((item:any) => item.id === entity.id)) {
      setStack(entity.type === TYPES.solution ? [] : [entities.solution[0]]);
    }

    const undoCallback = () => {
      setTemplate((prev:any) => {
        // Guard against null state
        if (!prev) return prev;
        return {
          ...prev,
          entities: originalEntities,
          links: originalLinks,
          rootSolutionId: originalRootId,
        };
      });
    };

    toast({
      variant: "success",
      title: `${label} unlinked`,
      description: entity.name,
      action: <ToastAction altText="Undo" onClick={undoCallback}>Undo</ToastAction>
    });
  };

  const handleDelete = (entity:any, label:string, after?:()=>void) => {
    deleteWithUndo(entity, label);
  };

  const rootSolution = entities.solution[0];

  const handleAddAdditionalSolution = () => {
    // Clear stack to allow selecting a new solution from the library
    setStack([]);
    showInfoToast(t("validationCriteriaTemplateBuilder.selectSolution", "Select a Solution"), t("validationCriteriaTemplateBuilder.selectSolutionDescription", "Choose a Solution from the Library to add to this template"));
  };

  // Helper to select a solution and update focus
  const handleSelectSolution = useCallback((solution: any) => {
    setStack([solution]);
    setFocusedSolutionLibraryId(solution.libraryId || solution.id);
  }, [setStack, setFocusedSolutionLibraryId]);

  // Re-home focus when focused solution is deleted or solutions change
  useEffect(() => {
    if (!entities.solution || entities.solution.length === 0) {
      // No solutions: clear focus
      setFocusedSolutionLibraryId(null);
      return;
    }

    // Check if currently focused solution still exists
    const focusedSolutionExists = entities.solution.some(
      (s: any) => (s.libraryId || s.id) === focusedSolutionLibraryId
    );

    if (!focusedSolutionExists) {
      // Focused solution was deleted: focus first available solution
      const firstSolution = entities.solution[0];
      setFocusedSolutionLibraryId(firstSolution.libraryId || firstSolution.id);
    }
  }, [entities.solution, focusedSolutionLibraryId, setFocusedSolutionLibraryId]);

  const templateDisplayName = template.id 
    ? `ID#${template.id}: ${template.name}` 
    : "NEW Template - NOT Saved Yet";

  // Calculate solution count and determine icon color (same as TemplateListItem)
  const solutionCount = entities.solution.length;
  const iconColor = getTemplateIconColor(solutionCount);

  return (
    <TooltipProvider>
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-base font-semibold flex items-center gap-2">
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <button onClick={onBack} className="focus-ring rounded-full p-1.5 text-slate-600 hover:bg-slate-100 shrink-0">
                <CircleArrowLeft size={18} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8}>
              <p>{t("validationCriteriaTemplateBuilder.goBackToListing")}</p>
            </TooltipContent>
          </Tooltip>
          {template.icon ? (
            <span className={iconColor}>
              {renderLucideIcon(template.icon, 18, iconColor)}
            </span>
          ) : (
            <BlocksIcon size={18} className={iconColor} />
          )}
          <span>{t("validationCriteriaTemplateBuilder.templateLabel", { name: templateDisplayName })}</span>
        </div>
        {entities.solution.length > 0 && (
          <button 
            onClick={handleAddAdditionalSolution}
            className="focus-ring rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-2 py-1 text-xs flex items-center gap-1"
            title={t("validationCriteriaTemplateBuilder.addAdditionalSolution")}
          >
            <PackageIcon size={14} />
            {t("validationCriteriaTemplateBuilder.addSolution")}
          </button>
        )}
      </div>

      {!rootSolution && (
        <div
          className={`focus-ring w-full rounded-md border-2 border-dashed px-3 py-4 text-sm text-center bg-indigo-50 border-indigo-400 text-indigo-700`}
        >
          {t("validationCriteriaTemplateBuilder.addRootSolution")}
        </div>
      )}

      {entities.solution.map((s:any)=> {
        const childCount = childrenOf(s).length;
        const isFocused = (s.libraryId || s.id) === focusedSolutionLibraryId;
        return (
        <details key={s.id} className={`mb-2 rounded-xl border p-2 ${isFocused ? 'ring-2 ring-indigo-500' : ''} ${colors[s.type]}`} open={openSolution[s.id] ?? true}>
          <summary className="flex cursor-pointer items-center justify-between" onClick={(e) => e.preventDefault()}>
            <div className="flex items-center gap-2">
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    {s.solutionIcon || s.solutionIconName ? (
                      <SolutionGraphic graphic={s.solutionIcon} icon={s.solutionIconName} className="w-4 h-4" />
                    ) : (
                      <PackageIcon size={14} />
                    )}
                  </span>
                </TooltipTrigger>
                {s.description && (
                  <TooltipContent side="top" sideOffset={8} collisionPadding={8} className="max-w-xs z-[100]">
                    <p>{s.description}</p>
                  </TooltipContent>
                )}
              </Tooltip>
              <button className="focus-ring rounded text-left font-medium hover:underline" onClick={(ev)=>{ev.preventDefault(); ev.stopPropagation(); handleSelectSolution(s);}}>
                {s.name} ({childCount})
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={e=>{e.preventDefault(); e.stopPropagation(); handleDelete(s,"Solution");}} 
                title={t("validationCriteriaTemplateBuilder.unlink")}
                aria-label={t("validationCriteriaTemplateBuilder.unlink")}
                className="focus-ring rounded-full p-1 hover:bg-slate-100"
              >
                <CircleMinus size={14} className="text-slate-500" />
              </button>
              <button 
                className="focus-ring chev-toggle rounded-full p-1" 
                title={t("validationCriteriaTemplateBuilder.toggle")}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenSolution(prev=>({...prev,[s.id]: !(prev[s.id] ?? true)}));
                }}
              >
                <Chevron size={14} />
              </button>
            </div>
          </summary>

          <ul className="ml-3 mt-2 space-y-1">
            {(() => {
              const allChildren = childrenOf(s);
              const components = allChildren.filter((ch: any) => ch.type === TYPES.component);
              const directCriteria = allChildren.filter((ch: any) => ch.type === TYPES.criteria);

              const renderOutcomesAndActions = (c: any, stackPrefix: any[]) => (
                <ul className="ml-3 mt-1 space-y-1">
                  {childrenOf(c).map((o: any) => (
                    <li key={o.id}>
                      <div className={`rounded-md border p-2 text-sm ${colors[o.type]}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Tooltip delayDuration={300}>
                              <TooltipTrigger asChild>
                                <span className="inline-flex">{getEntityIcon(o, 14)}</span>
                              </TooltipTrigger>
                              {o.description && (
                                <TooltipContent side="top" sideOffset={8} collisionPadding={8} className="max-w-xs z-[100]">
                                  <p>{o.description}</p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                            <button className="focus-ring rounded text-left font-medium hover:underline" onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); setStack([...stackPrefix, o]); }}>
                              {o.name}
                            </button>
                          </div>
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(o, o.type === TYPES.outcome ? "Outcome" : "Action"); }}
                            title={t("validationCriteriaTemplateBuilder.unlink")}
                            aria-label={t("validationCriteriaTemplateBuilder.unlink")}
                            className="focus-ring rounded-full p-1 hover:bg-slate-100"
                          >
                            <CircleMinus size={14} className="text-slate-500" />
                          </button>
                        </div>
                        {o.type === TYPES.outcome && (
                          <ul className="ml-5 mt-1 space-y-1">
                            {childrenOf(o).map((a: any) => (
                              <li key={a.id}>
                                <div className={`rounded-md border p-2 text-sm ${colors[a.type]}`}>
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <Tooltip delayDuration={300}>
                                        <TooltipTrigger asChild>
                                          <span className="inline-flex">{getEntityIcon(a, 14)}</span>
                                        </TooltipTrigger>
                                        {a.description && (
                                          <TooltipContent side="top" sideOffset={8} collisionPadding={8} className="max-w-xs z-[100]">
                                            <p>{a.description}</p>
                                          </TooltipContent>
                                        )}
                                      </Tooltip>
                                      <span className="text-left font-medium">{a.name}</span>
                                    </div>
                                    <button
                                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(a, "Action"); }}
                                      title={t("validationCriteriaTemplateBuilder.unlink")}
                                      aria-label={t("validationCriteriaTemplateBuilder.unlink")}
                                      className="focus-ring rounded-full p-1 hover:bg-slate-100"
                                    >
                                      <CircleMinus size={14} className="text-slate-500" />
                                    </button>
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              );

              const renderCriteria = (c: any, stackPrefix: any[]) => {
                const criteriaChildCount = childrenOf(c).length;
                return (
                  <li key={c.id}>
                    <details className={`rounded-md border p-2 text-sm ${colors[c.type]}`} open={openCriteria[c.id] ?? true}>
                      <summary className="flex cursor-pointer items-center justify-between" onClick={(e) => e.preventDefault()}>
                        <div className="flex items-center gap-2">
                          <Tooltip delayDuration={300}>
                            <TooltipTrigger asChild>
                              <span className="inline-flex">{getEntityIcon(c, 14)}</span>
                            </TooltipTrigger>
                            {c.description && (
                              <TooltipContent side="top" sideOffset={8} collisionPadding={8} className="max-w-xs z-[100]">
                                <p>{c.description}</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                          <button className="focus-ring rounded text-left font-medium hover:underline" onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); setStack([...stackPrefix, c]); }}>
                            {c.name} ({criteriaChildCount})
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(c, "Criteria"); }}
                            title={t("validationCriteriaTemplateBuilder.unlink")}
                            aria-label={t("validationCriteriaTemplateBuilder.unlink")}
                            className="focus-ring rounded-full p-1 hover:bg-slate-100"
                          >
                            <CircleMinus size={14} className="text-slate-500" />
                          </button>
                          <button
                            className="focus-ring chev-toggle rounded-full p-1"
                            title={t("validationCriteriaTemplateBuilder.toggle")}
                            onClick={(e) => { e.stopPropagation(); setOpenCriteria(prev => ({ ...prev, [c.id]: !(prev[c.id] ?? true) })); }}
                          >
                            <Chevron size={14} />
                          </button>
                        </div>
                      </summary>
                      {renderOutcomesAndActions(c, [...stackPrefix, c])}
                    </details>
                  </li>
                );
              };

              return (
                <>
                  {components.map((comp: any) => {
                    const componentChildCount = childrenOf(comp).length;
                    return (
                      <li key={comp.id}>
                        <details className={`rounded-md border p-2 text-sm ${colors[comp.type]}`} open={openComponent[comp.id] ?? true}>
                          <summary className="flex cursor-pointer items-center justify-between" onClick={(e) => e.preventDefault()}>
                            <div className="flex items-center gap-2">
                              <Tooltip delayDuration={300}>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex">{getEntityIcon(comp, 14)}</span>
                                </TooltipTrigger>
                                {comp.description && (
                                  <TooltipContent side="top" sideOffset={8} collisionPadding={8} className="max-w-xs z-[100]">
                                    <p>{comp.description}</p>
                                  </TooltipContent>
                                )}
                              </Tooltip>
                              <button className="focus-ring rounded text-left font-medium hover:underline" onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); setStack([s, comp]); }}>
                                {comp.name} ({componentChildCount})
                              </button>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(comp, "Component"); }}
                                title={t("validationCriteriaTemplateBuilder.unlink")}
                                aria-label={t("validationCriteriaTemplateBuilder.unlink")}
                                className="focus-ring rounded-full p-1 hover:bg-slate-100"
                              >
                                <CircleMinus size={14} className="text-slate-500" />
                              </button>
                              <button
                                className="focus-ring chev-toggle rounded-full p-1"
                                title={t("validationCriteriaTemplateBuilder.toggle")}
                                onClick={(e) => { e.stopPropagation(); setOpenComponent(prev => ({ ...prev, [comp.id]: !(prev[comp.id] ?? true) })); }}
                              >
                                <Chevron size={14} />
                              </button>
                            </div>
                          </summary>
                          <ul className="ml-3 mt-1 space-y-1">
                            {childrenOf(comp).map((c: any) => renderCriteria(c, [s, comp]))}
                          </ul>
                        </details>
                      </li>
                    );
                  })}
                  {directCriteria.map((c: any) => renderCriteria(c, [s]))}
                </>
              );
            })()}
          </ul>
        </details>
      )})}

      <div className="mt-4 rounded-md border border-orange-200 bg-orange-50 dark:bg-orange-950 dark:border-orange-800 p-3 text-xs text-orange-800 dark:text-orange-300">
        <p className="font-medium mb-1">💡 Tip</p>
        <p>{t("validationCriteriaTemplateBuilder.tipDescription")}</p>
      </div>
    </div>
    </TooltipProvider>
  );
}

// ---------- Sub-Component: StepIndicator
const STEP_DEFS = [
  { type: TYPES.solution, label: "Solution", bg: "bg-blue-500", bgDark: "dark:bg-blue-600", ring: "ring-blue-300 dark:ring-blue-600", text: "text-blue-600 dark:text-blue-400", lineBg: "bg-blue-400 dark:bg-blue-600" },
  { type: TYPES.component, label: "Component", bg: "bg-sky-500", bgDark: "dark:bg-sky-600", ring: "ring-sky-300 dark:ring-sky-600", text: "text-sky-600 dark:text-sky-400", lineBg: "bg-sky-400 dark:bg-sky-600" },
  { type: TYPES.value_mapping, label: "Value Mapping", bg: "bg-orange-500", bgDark: "dark:bg-orange-600", ring: "ring-orange-300 dark:ring-orange-600", text: "text-orange-600 dark:text-orange-400", lineBg: "bg-orange-400 dark:bg-orange-600" },
  { type: TYPES.criteria, label: "Criteria", bg: "bg-purple-500", bgDark: "dark:bg-purple-600", ring: "ring-purple-300 dark:ring-purple-600", text: "text-purple-600 dark:text-purple-400", lineBg: "bg-purple-400 dark:bg-purple-600" },
  { type: TYPES.outcome, label: "Outcome", bg: "bg-green-500", bgDark: "dark:bg-green-600", ring: "ring-green-300 dark:ring-green-600", text: "text-green-600 dark:text-green-400", lineBg: "bg-green-400 dark:bg-green-600" },
  { type: TYPES.action, label: "Action", bg: "bg-amber-500", bgDark: "dark:bg-amber-600", ring: "ring-amber-300 dark:ring-amber-600", text: "text-amber-600 dark:text-amber-400", lineBg: "bg-amber-400 dark:bg-amber-600" },
];

function StepIndicator({ stack, setStack, skippedEntityTypes, addSkippedType, removeSkippedType, template, focus }: any) {
  const { t } = useTranslation();
  const TYPE_ORDER: string[] = [TYPES.solution, TYPES.component, TYPES.value_mapping, TYPES.criteria, TYPES.outcome, TYPES.action];

  const templatePath = useMemo(() => {
    const path: Record<string, any[]> = {
      solution: [], component: [], value_mapping: [], criteria: [], outcome: [], action: []
    };
    if (!template?.entities || !template?.links || stack.length === 0) return path;

    const rootSol = stack[0];
    path.solution = [rootSol];

    const compIds = new Set<string>();
    template.links.filter((l: any) => l.fromId === rootSol.id && l.type === EDGE_TYPES.SComp)
      .forEach((l: any) => compIds.add(l.toId));
    path.component = (template.entities.component || []).filter((e: any) => compIds.has(e.id));

    const vmIds = new Set<string>();
    template.links.filter((l: any) => l.fromId === rootSol.id && l.type === EDGE_TYPES.SVM)
      .forEach((l: any) => vmIds.add(l.toId));
    path.component.forEach((comp: any) => {
      template.links.filter((l: any) => l.fromId === comp.id && l.type === EDGE_TYPES.CompVM)
        .forEach((l: any) => vmIds.add(l.toId));
    });
    path.value_mapping = (template.entities.value_mapping || []).filter((e: any) => vmIds.has(e.id));

    const critIds = new Set<string>();
    template.links.filter((l: any) => l.fromId === rootSol.id && l.type === EDGE_TYPES.SC)
      .forEach((l: any) => critIds.add(l.toId));
    path.component.forEach((comp: any) => {
      template.links.filter((l: any) => l.fromId === comp.id && l.type === EDGE_TYPES.CC)
        .forEach((l: any) => critIds.add(l.toId));
    });
    path.value_mapping.forEach((vm: any) => {
      template.links.filter((l: any) => l.fromId === vm.id && l.type === EDGE_TYPES.VMC)
        .forEach((l: any) => critIds.add(l.toId));
    });
    path.criteria = (template.entities.criteria || []).filter((e: any) => critIds.has(e.id));

    const outIds = new Set<string>();
    path.criteria.forEach((crit: any) => {
      template.links.filter((l: any) => l.fromId === crit.id && l.type === EDGE_TYPES.CO)
        .forEach((l: any) => outIds.add(l.toId));
    });
    path.outcome = (template.entities.outcome || []).filter((e: any) => outIds.has(e.id));

    const actIds = new Set<string>();
    path.outcome.forEach((out: any) => {
      template.links.filter((l: any) => l.fromId === out.id && l.type === EDGE_TYPES.OA)
        .forEach((l: any) => actIds.add(l.toId));
    });
    path.criteria.forEach((crit: any) => {
      template.links.filter((l: any) => l.fromId === crit.id && l.type === EDGE_TYPES.CA)
        .forEach((l: any) => actIds.add(l.toId));
    });
    path.action = (template.entities.action || []).filter((e: any) => actIds.has(e.id));

    return path;
  }, [template?.entities, template?.links, stack]);

  const activeType = focus?.type || null;
  const stackTypes = new Set(stack.map((s: any) => s.type));

  const getStepState = (stepType: string): "completed" | "active" | "skipped" | "upcoming" => {
    if (skippedEntityTypes?.has(stepType)) return "skipped";
    if (stepType === activeType) return "active";
    if (stackTypes.has(stepType)) return "completed";
    if (templatePath[stepType]?.length > 0) return "completed";
    return "upcoming";
  };

  const getEntityName = (stepType: string): string | null => {
    const stackItem = stack.find((s: any) => s.type === stepType);
    if (stackItem) return stackItem.name;
    const pathItems = templatePath[stepType];
    if (pathItems?.length === 1) return pathItems[0].name;
    if (pathItems?.length > 1) return `${pathItems.length} ${laneTitle[stepType]}`;
    return null;
  };

  const getChildCount = (stepType: string): number | null => {
    const state = getStepState(stepType);
    if (state !== "completed" && state !== "active") return null;
    const pathItems = templatePath[stepType];
    if (!pathItems || pathItems.length === 0) return null;
    return pathItems.length;
  };

  const buildStackToEntity = (targetEntity: any): any[] => {
    const result: any[] = [];
    let current = targetEntity;
    const visited = new Set<string>();

    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      result.unshift(current);
      if (current.type === TYPES.solution) break;

      const parentLink = template.links.find((l: any) => l.toId === current.id);
      if (!parentLink) break;

      let parentType: string | null = null;
      if (parentLink.type === EDGE_TYPES.SComp) parentType = TYPES.solution;
      else if (parentLink.type === EDGE_TYPES.SC) parentType = TYPES.solution;
      else if (parentLink.type === EDGE_TYPES.CC) parentType = TYPES.component;
      else if (parentLink.type === EDGE_TYPES.CO) parentType = TYPES.criteria;
      else if (parentLink.type === EDGE_TYPES.OA) parentType = TYPES.outcome;
      else if (parentLink.type === EDGE_TYPES.CA) parentType = TYPES.criteria;
      if (!parentType) break;

      const parentEntity = (template.entities[parentType] || []).find((e: any) => e.id === parentLink.fromId);
      if (!parentEntity) break;
      current = parentEntity;
    }
    return result;
  };

  const navigateToType = (targetType: string) => {
    const targetEntity = templatePath[targetType]?.[0];
    if (!targetEntity) return;
    const newStack = buildStackToEntity(targetEntity);
    if (newStack.length > 0) setStack(newStack);
  };

  const handleStepClick = (stepType: string, state: string) => {
    if (state === "upcoming") return;
    if (state === "skipped") {
      if (stepType === TYPES.component) {
        setStack(stack.slice(0, 1));
      } else if (stepType === TYPES.outcome) {
        const critIdx = stack.findIndex((s: any) => s.type === TYPES.criteria);
        if (critIdx >= 0) setStack(stack.slice(0, critIdx + 1));
      }
      if (removeSkippedType) removeSkippedType(stepType);
      return;
    }
    const stackIndex = stack.findIndex((s: any) => s.type === stepType);
    if (stackIndex >= 0) {
      setStack(stack.slice(0, stackIndex + 1));
      return;
    }
    navigateToType(stepType);
  };

  if (stack.length === 0) return null;

  const rootSolution = stack[0];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="mb-4 rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 px-4 py-3">
        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100 dark:border-gray-700">
          {rootSolution.solutionIcon || rootSolution.solutionIconName ? (
            <SolutionGraphic graphic={rootSolution.solutionIcon} icon={rootSolution.solutionIconName} className="w-5 h-5" />
          ) : (
            <PackageIcon size={16} className="text-indigo-500 dark:text-indigo-400" />
          )}
          <span className="text-sm font-semibold text-slate-800 dark:text-gray-200 truncate">{rootSolution.name}</span>
        </div>
        <div className="flex items-center">
          {STEP_DEFS.map((step, index) => {
            const state = getStepState(step.type);
            const name = getEntityName(step.type);
            const count = getChildCount(step.type);
            const isLast = index === STEP_DEFS.length - 1;
            const isClickable = state !== "upcoming";
            const nextState = !isLast ? getStepState(STEP_DEFS[index + 1].type) : null;

            return (
              <React.Fragment key={step.type}>
                <div className="flex flex-col items-center min-w-[64px] transition-all duration-300">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => handleStepClick(step.type, state)}
                        disabled={!isClickable}
                        className={`
                          relative flex items-center justify-center rounded-full transition-all duration-300
                          ${state === "active" ? `w-10 h-10 ${step.bg} ${step.bgDark} text-white ring-4 ${step.ring} step-active-pulse` : ""}
                          ${state === "completed" ? `w-9 h-9 ${step.bg} ${step.bgDark} text-white cursor-pointer hover:scale-110` : ""}
                          ${state === "skipped" ? "w-9 h-9 bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-pointer hover:scale-110 border-2 border-dashed border-gray-400 dark:border-gray-500" : ""}
                          ${state === "upcoming" ? "w-8 h-8 bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 border-2 border-gray-200 dark:border-gray-600 cursor-default" : ""}
                        `}
                      >
                        {state === "completed" && <Check size={16} strokeWidth={3} />}
                        {state === "active" && (() => {
                          if (step.type === TYPES.solution) return <PackageIcon size={16} className="text-white" />;
                          if (step.type === TYPES.component) return <Component size={16} />;
                          if (step.type === TYPES.criteria) return <LayoutListIcon size={16} className="text-white" />;
                          if (step.type === TYPES.outcome) return <CircleCheckBigIcon size={16} className="text-white" />;
                          if (step.type === TYPES.action) return <ActivityIcon size={16} className="text-white" />;
                          return null;
                        })()}
                        {state === "skipped" && <SkipForward size={14} />}
                        {state === "upcoming" && (
                          <span className="text-[10px] font-bold">{index + 1}</span>
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={8} className="max-w-xs z-[100]">
                      <div className="text-center">
                        <div className="font-semibold">{step.label}</div>
                        {name && <div className="text-xs text-muted-foreground">{name}</div>}
                        {count !== null && count > 0 && (
                          <div className="text-xs text-muted-foreground">{count} {laneTitle[step.type] || t("validationCriteriaTemplateBuilder.items")} {t("validationCriteriaTemplateBuilder.total")}</div>
                        )}
                        {state === "skipped" && <div className="text-xs text-muted-foreground italic">{t("validationCriteriaTemplateBuilder.skippedClickToGoBack")}</div>}
                        {state === "completed" && <div className="text-xs text-muted-foreground">{t("validationCriteriaTemplateBuilder.clickToNavigate")}</div>}
                        {state === "active" && <div className="text-xs text-muted-foreground">{t("validationCriteriaTemplateBuilder.currentlyHere")}</div>}
                        {state === "upcoming" && <div className="text-xs text-muted-foreground">{t("validationCriteriaTemplateBuilder.notReachedYet")}</div>}
                      </div>
                    </TooltipContent>
                  </Tooltip>

                  <span className={`mt-1.5 text-[10px] font-semibold tracking-wide transition-colors duration-300 ${
                    state === "active" ? step.text :
                    state === "completed" ? step.text :
                    state === "skipped" ? "text-gray-400 dark:text-gray-500 line-through" :
                    "text-gray-400 dark:text-gray-500"
                  }`}>
                    {step.label}
                  </span>

                  {state === "skipped" && (
                    <span className="text-[9px] text-gray-400 dark:text-gray-500 italic">{t("validationCriteriaTemplateBuilder.skipped")}</span>
                  )}

                  {count !== null && count > 0 && (
                    <span className={`mt-0.5 inline-flex items-center justify-center rounded-full px-1.5 py-0 text-[9px] font-bold ${
                      state === "active"
                        ? `${step.bg} ${step.bgDark} text-white`
                        : "bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300"
                    }`}>
                      {count}
                    </span>
                  )}
                </div>

                {!isLast && (
                  <div className="flex-1 flex items-center px-1 -mt-3">
                    {nextState === "skipped" || state === "skipped" ? (
                      <div className="w-full border-t-2 border-dashed border-gray-300 dark:border-gray-600" />
                    ) : state === "completed" || state === "active" ? (
                      <div className={`w-full h-0.5 ${step.lineBg} transition-all duration-500`} />
                    ) : (
                      <div className="w-full h-0.5 bg-gray-200 dark:bg-gray-700" />
                    )}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}

// ---------- Sub-Component: Conveyor
interface ConveyorProps {
  template: any;
  setTemplate: React.Dispatch<React.SetStateAction<any>>;
  byId: any;
  stack: any[];
  setStack: React.Dispatch<React.SetStateAction<any[]>>;
  focus: any;
  onAddRootSolution: (item: any) => void;
  staging: any[];
  setStaging: React.Dispatch<React.SetStateAction<any[]>>;
  queueItem: (item: any) => void;
  skippedEntityTypes: Set<string>;
  addSkippedType: (type: string) => void;
  removeSkippedType: (type: string) => void;
  solutionLinkMode: 'component' | 'criteria' | null;
  setSolutionLinkMode: (mode: 'component' | 'criteria' | null) => void;
  t: TFunction;
}
function Conveyor({ template, setTemplate, byId, stack, setStack, focus, onAddRootSolution, staging, setStaging, queueItem, skippedEntityTypes, addSkippedType, removeSkippedType, solutionLinkMode, setSolutionLinkMode, t }: ConveyorProps){
  // ALL HOOKS MUST BE DECLARED FIRST (before any early returns)
  const { toast } = useToast();
  const [dragDepth, setDragDepth] = useState(0);

  // Early return if template doesn't have entities yet (still loading)
  if (!template || !template.entities || !template.links) {
    return <BuilderPlaceholder t={t} />;
  }

  const isAddingRoot = !template.rootSolutionId;

  const childrenOf = (from:any)=>{ 
    if(!from) return[]; 
    const t=from.type; 

    // For solutions, check BOTH solution-to-component AND solution-to-criteria links
    let relevantLinks;
    if (t === TYPES.solution) {
      relevantLinks = template.links.filter((l:any) => 
        (l.type === EDGE_TYPES.SComp || l.type === EDGE_TYPES.SC) && l.fromId === from.id
      );
    } else if (t === TYPES.criteria) {
      relevantLinks = template.links.filter((l:any) => 
        (l.type === EDGE_TYPES.CO || l.type === EDGE_TYPES.CA) && l.fromId === from.id
      );
    } else {
      const edge = edgeFor(t);
      relevantLinks = template.links.filter((l:any) => l.type === edge && l.fromId === from.id);
    }

    const children = relevantLinks.map((link:any) => {
      const childId = link.toId;
      let childType;
      if (link.type === EDGE_TYPES.SComp) childType = TYPES.component;
      else if (link.type === EDGE_TYPES.SC) childType = TYPES.criteria;
      else if (link.type === EDGE_TYPES.CC) childType = TYPES.criteria;
      else if (link.type === EDGE_TYPES.CO) childType = TYPES.outcome;
      else if (link.type === EDGE_TYPES.OA) childType = TYPES.action;
      else if (link.type === EDGE_TYPES.CA) childType = TYPES.action;
      else childType = nextType(t);

      return byId[`${childType}-${childId}`] || byId[childId];
    }).filter(Boolean);

    return children;
  };

  const unlinkEntity = (entity: any) => {
    if (!entity) return;

    // Recursive function to collect all descendant IDs
    const getDescendantIds = (entityId: string, entityType: string, links: any[]): Set<string> => {
      const descendants = new Set<string>([entityId]);

      // For solutions, check BOTH solution-to-component AND solution-to-criteria links
      let childLinks;
      if (entityType === TYPES.solution) {
        childLinks = links.filter(l => 
          l.fromId === entityId && (l.type === EDGE_TYPES.SComp || l.type === EDGE_TYPES.SC)
        );
      } else if (entityType === TYPES.criteria) {
        childLinks = links.filter(l => 
          l.fromId === entityId && (l.type === EDGE_TYPES.CO || l.type === EDGE_TYPES.CA)
        );
      } else {
        const edge = edgeFor(entityType);
        if (!edge) return descendants;
        childLinks = links.filter(l => l.fromId === entityId && l.type === edge);
      }

      childLinks.forEach(link => {
        // Determine child type from link type instead of nextType
        let childType;
        if (link.type === EDGE_TYPES.SComp) childType = TYPES.component;
        else if (link.type === EDGE_TYPES.SC) childType = TYPES.criteria;
        else if (link.type === EDGE_TYPES.CC) childType = TYPES.criteria;
        else if (link.type === EDGE_TYPES.CO) childType = TYPES.outcome;
        else if (link.type === EDGE_TYPES.OA) childType = TYPES.action;
        else if (link.type === EDGE_TYPES.CA) childType = TYPES.action;
        else childType = nextType(entityType); // Fallback

        // Recursively collect descendants - the child must exist in template for recursion to continue
        if (childType) {
          getDescendantIds(link.toId, childType, links).forEach(id => descendants.add(id));
        }
      });
      return descendants;
    };

    // Get all IDs to remove (entity + all descendants)
    const idsToRemove = getDescendantIds(entity.id, entity.type, template.links);

    const edge = edgeFor(focus.type);
    const newLinks = template.links.filter((l: any) => {
      // Remove the primary link from focus to entity
      if (l.fromId === focus.id && l.toId === entity.id && l.type === edge) return false;
      // Remove any links involving descendants
      if (idsToRemove.has(l.fromId) || idsToRemove.has(l.toId)) return false;
      return true;
    });

    const newEntities = {
      solution: template.entities.solution.filter((e: any) => !idsToRemove.has(e.id)),
      component: template.entities.component.filter((e: any) => !idsToRemove.has(e.id)),
      value_mapping: (template.entities.value_mapping || []).filter((e: any) => !idsToRemove.has(e.id)),
      criteria: template.entities.criteria.filter((e: any) => !idsToRemove.has(e.id)),
      outcome: template.entities.outcome.filter((e: any) => !idsToRemove.has(e.id)),
      action: template.entities.action.filter((e: any) => !idsToRemove.has(e.id))
    };

    setTemplate((prev: any) => {
      // Guard against null state
      if (!prev) return prev;
      return { ...prev, links: newLinks, entities: newEntities };
    });

    const count = idsToRemove.size;
    const description = count > 1 
      ? `${entity.name} and ${count - 1} dependent ${count - 1 === 1 ? 'item' : 'items'} removed`
      : `${entity.name} has been removed from ${focus.name}`;

    showSuccessToast(`${singularTitle[entity.type]} unlinked`, description);
  };

  let rightType = focus?nextType(focus.type):null;
  if (focus?.type === TYPES.solution && solutionLinkMode === 'criteria') {
    rightType = TYPES.criteria;
  } else if (skippedEntityTypes?.has(TYPES.component) && focus?.type === TYPES.solution) {
    rightType = skippedEntityTypes?.has(TYPES.value_mapping) ? TYPES.criteria : TYPES.value_mapping;
  } else if (skippedEntityTypes?.has(TYPES.value_mapping) && focus?.type === TYPES.component) {
    rightType = TYPES.criteria;
  } else if (skippedEntityTypes?.has(TYPES.outcome) && focus?.type === TYPES.criteria) {
    rightType = TYPES.action;
  }
  const hasLink = (fromId:string,toId:string,type:string)=>template.links.some((l:any)=>l.fromId===fromId&&l.toId===toId&&l.type===type);

  const removeStaged = (id:string)=> setStaging(prev=>prev.filter(x=>x.id!==id));

  const applyStaging = ()=>{
    if(!focus) return;
    if(staging.length===0) return;

    const toAdd = staging;  // All staged items are new instances with unique IDs

    // Create links with context-aware edge types (pass both parent and child types)
    const newLinks=toAdd.map(it=>({fromId:focus.id,toId:it.id,type:edgeFor(focus.type, it.type)}));

    setTemplate((prev:any) => {
      // Guard against null state during async loads
      if (!prev || !prev.entities || !prev.links) return prev;

      const newEntities = {
        solution: [...prev.entities.solution],
        component: [...prev.entities.component],
        value_mapping: [...(prev.entities.value_mapping || [])],
        criteria: [...prev.entities.criteria],
        outcome: [...prev.entities.outcome],
        action: [...prev.entities.action]
      };
      // Add all instances (no duplicate check needed - each has unique ID)
      toAdd.forEach(entity => {
        newEntities[entity.type as keyof typeof newEntities] = [...newEntities[entity.type as keyof typeof newEntities], entity];
      });
      const allLinks = [...prev.links, ...newLinks];

      return { 
        id: prev.id,
        name: prev.name,
        rootSolutionId: prev.rootSolutionId,
        icon: prev.icon,
        isStarred: prev.isStarred,
        links: allLinks, 
        entities: newEntities 
      };
    });

    setStaging([]);

    // Auto-navigate into newly linked component to show Criteria library
    if (toAdd.length === 1 && toAdd[0].type === TYPES.component) {
      const linkedComponent = toAdd[0];
      setStack([...stack, linkedComponent]);
    }

    const typeLabel = toAdd.length > 1 ? laneTitle[toAdd[0].type as keyof typeof laneTitle] : singularTitle[toAdd[0].type as keyof typeof singularTitle];

    const undoCallback = () => {
      setTemplate((d:any) => {
        // Guard against null state
        if (!d || !d.links) return d;
        const newLinksSet = new Set(newLinks.map(l => `${l.fromId}:${l.toId}:${l.type}`));
        return { ...d, links: d.links.filter((l:any) => !newLinksSet.has(`${l.fromId}:${l.toId}:${l.type}`)) };
      });
    };

    toast({
      variant: "success",
      title: `${toAdd.length} ${typeLabel} linked`,
      description: `Successfully linked to ${focus.name}`,
      action: <ToastAction altText="Undo" onClick={undoCallback}>Undo</ToastAction>
    });
  };

  // Build breadcrumb with skip state awareness
  let breadcrumb = stack.map((x:any)=>x.name).join(" › ");
  if (skippedEntityTypes?.has(TYPES.component)) {
    breadcrumb += " › Skipped Components";
  }
  if (skippedEntityTypes?.has(TYPES.outcome)) {
    breadcrumb += " › Skipped Expected Outcomes";
  }

  const linked = focus?childrenOf(focus):[];
  const isOver = dragDepth>0;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); 
    setDragDepth(0);
    const raw = e.dataTransfer.getData("application/json") || e.dataTransfer.getData("text/plain");
    if (!raw) return;
    try {
      const payload = JSON.parse(raw);
      // Accept Solutions when adding root OR when at root level with no focus (adding additional solutions)
      if (payload.type === TYPES.solution && (!focus || isAddingRoot)) {
        onAddRootSolution(payload);
      } else if (payload && payload.type && rightType && payload.type === rightType) {
        queueItem(payload);
      }
    } catch {}
  };

  if (isAddingRoot) {
    return (
      <div 
        className={`flex h-full min-h-[500px] flex-col items-center justify-center text-center rounded-xl border-2 ${isOver ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 dark:border-indigo-500" : "border-dashed border-slate-300 dark:border-gray-600"} transition-colors p-8`}
        onDragOver={e=>e.preventDefault()}
        onDragEnter={e=>{e.preventDefault(); setDragDepth(d=>d+1);}}
        onDragLeave={e=>{e.preventDefault(); setDragDepth(d=>Math.max(0,d-1));}}
        onDrop={handleDrop}
      >
        <div className="mb-4 rounded-full bg-indigo-100 dark:bg-indigo-900/30 p-6">
          <svg className="w-16 h-16 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <h3 className="text-2xl font-semibold mb-3 text-slate-900 dark:text-gray-100">{t("validationCriteriaTemplateBuilder.selectRootSolution")}</h3>
        <p className="text-base text-slate-600 dark:text-gray-400 max-w-md">{t("validationCriteriaTemplateBuilder.dragClickSolutionToBegin")}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <StepIndicator
        stack={stack}
        setStack={setStack}
        skippedEntityTypes={skippedEntityTypes}
        addSkippedType={addSkippedType}
        removeSkippedType={removeSkippedType}
        template={template}
        focus={focus}
      />
      <div className="mb-3 min-h-[20%] rounded-xl border bg-slate-50 dark:bg-gray-800 dark:border-gray-700 p-3">
        <div className="mb-1 text-base font-semibold flex items-center gap-2">
          <FocusIcon size={18} className="text-blue-600" />
          <span>{t("validationCriteriaTemplateBuilder.currentFocus")}: <span className="capitalize">{focus?singularTitle[focus.type]:t("validationCriteriaTemplateBuilder.rootLevel")}</span></span>
        </div>
        {focus ? (
          <div className="flex flex-wrap gap-2 items-start">
            <div className={`inline-block rounded-xl border px-3 py-2 ${colors[focus.type]}`}>
              <div className="text-sm font-medium flex items-center gap-2">
                {getEntityIcon(focus)}
                {focus.name}
              </div>
              <div className="text-[11px] text-slate-500 capitalize">{focus.type}</div>
            </div>
            {skippedEntityTypes?.has(TYPES.component) && (
              <div className={`inline-block rounded-xl border px-3 py-2 ${colors[TYPES.component]} opacity-60`}>
                <div className="text-sm font-medium flex items-center gap-2">
                  <SkipForward size={14} />
                  {t("validationCriteriaTemplateBuilder.skippedComponents")}
                </div>
              </div>
            )}
            {skippedEntityTypes?.has(TYPES.outcome) && (
              <div className={`inline-block rounded-xl border px-3 py-2 ${colors[TYPES.outcome]} opacity-60`}>
                <div className="text-sm font-medium flex items-center gap-2">
                  <SkipForward size={14} />
                  {t("validationCriteriaTemplateBuilder.skippedExpectedOutcomes")}
                </div>
              </div>
            )}
          </div>
        ) : (<div className="text-sm text-slate-500">{t("validationCriteriaTemplateBuilder.dragSolutionFromRight")}</div>)}
        {stack.length>0 && (<div className="mt-2 text-xs text-slate-500">{breadcrumb}</div>)}
        <div className="mt-2 flex flex-wrap gap-2">
          <button onClick={()=>setStack(stack.slice(0,-1))} disabled={stack.length===0} className="focus-ring rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-2 py-1 text-xs disabled:opacity-50 flex items-center gap-1">
            <ArrowLeftIcon size={14} />
            {t("common.back")}
          </button>
          {stack.length === 2 && (
            <button
              onClick={()=>setStack(stack.slice(0,1))}
              className="focus-ring rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-2 py-1 text-xs flex items-center gap-1"
            >
              <PackageIcon size={14} />{t("validationCriteriaTemplateBuilder.backToSolution")}
            </button>
          )}
          {stack.length === 3 && (
            <button
              onClick={()=>setStack(stack.slice(0,2))}
              className="focus-ring rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-2 py-1 text-xs flex items-center gap-1"
            >
              <LayoutListIcon size={14} />{t("validationCriteriaTemplateBuilder.backToCriteria")}
            </button>
          )}
          {stack.length >= 4 && (
            <button
              onClick={()=>setStack(stack.slice(0,3))}
              className="focus-ring rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-2 py-1 text-xs flex items-center gap-1"
            >
              <CircleCheckBigIcon size={14} />{t("validationCriteriaTemplateBuilder.backToExpectedOutcome")}
            </button>
          )}
        </div>
      </div>

      <div
        className={`relative flex-1 rounded-xl border-2 ${isOver?"border-indigo-400 bg-indigo-50":"border-dashed"} p-4 text-sm transition-colors`}
        onDragOver={e=>e.preventDefault()}
        onDragEnter={e=>{e.preventDefault(); setDragDepth(d=>d+1);}}
        onDragLeave={e=>{e.preventDefault(); setDragDepth(d=>Math.max(0,d-1));}}
        onDrop={handleDrop}
      >
        {focus? (
          <div className="text-slate-700 dark:text-gray-300 h-full flex flex-col">
            {focus.type === TYPES.solution && solutionLinkMode === null ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 py-8">
                <h3 className="text-base font-semibold text-slate-700 dark:text-gray-200">{t("validationCriteriaTemplateBuilder.howToBuildUnderSolution")}</h3>
                <p className="text-xs text-slate-500 dark:text-gray-400 text-center max-w-sm">{t("validationCriteriaTemplateBuilder.chooseOrganizeFor", { name: focus.name })}</p>
                <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                  <button
                    onClick={() => setSolutionLinkMode('component')}
                    className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 p-5 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors group"
                  >
                    <div className="rounded-full bg-blue-100 dark:bg-blue-800/50 p-3 group-hover:bg-blue-200 dark:group-hover:bg-blue-800 transition-colors">
                      <LucideIcons.Boxes size={24} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">{t("validationCriteriaTemplateBuilder.addComponents")}</span>
                    <span className="text-[11px] text-slate-500 dark:text-gray-400 text-center">{t("validationCriteriaTemplateBuilder.groupCriteriaUnderComponents")}</span>
                  </button>
                  <button
                    onClick={() => { setSolutionLinkMode('criteria'); addSkippedType(TYPES.component); }}
                    className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20 p-5 hover:border-purple-500 dark:hover:border-purple-500 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors group"
                  >
                    <div className="rounded-full bg-purple-100 dark:bg-purple-800/50 p-3 group-hover:bg-purple-200 dark:group-hover:bg-purple-800 transition-colors">
                      <LucideIcons.ListChecks size={24} className="text-purple-600 dark:text-purple-400" />
                    </div>
                    <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">{t("validationCriteriaTemplateBuilder.addCriteriaDirectly")}</span>
                    <span className="text-[11px] text-slate-500 dark:text-gray-400 text-center">{t("validationCriteriaTemplateBuilder.linkCriteriaWithoutGrouping")}</span>
                  </button>
                </div>
                {linked.length > 0 && (
                  <div className="w-full max-w-md mt-2">
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400">Already linked ({linked.length})</div>
                    <div className="grid grid-cols-2 gap-2">
                      {linked.map((child: any) => (
                        <div key={child.id} className={`rounded-lg border p-2 text-xs ${colors[child.type]}`}>
                          <div className="flex items-center gap-2">
                            {getEntityIcon(child, 12)}
                            <span className="font-medium">{child.name}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 capitalize">{child.type}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
            <>
            <div className="flex-1 overflow-auto">
              <div className="mb-3 text-xs text-slate-500 dark:text-gray-400">
                Drag {rightType ? laneTitle[rightType] : "—"} from the right, or click Link.
                {focus.type === TYPES.solution && solutionLinkMode && (
                  <button
                    onClick={() => { setSolutionLinkMode(null); setStaging([]); }}
                    className="ml-2 text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    (change path)
                  </button>
                )}
              </div>
              <div className="mb-4">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Queued to add ({staging.length})</div>
                {staging.length===0? (
                  <div className="rounded-lg border bg-slate-50 dark:bg-gray-800 dark:border-gray-700 p-3 text-xs text-slate-500 dark:text-gray-400">{t("validationCriteriaTemplateBuilder.noItemsQueued")}</div>
                ):(
                  <div className="grid grid-cols-2 gap-2">
                    {staging.map((it:any)=> (
                      <div key={it.id} className={`relative rounded-lg border p-2 ${colors[it.type]}`}>
                        <button aria-label={t("validationCriteriaTemplateBuilder.remove")} onClick={()=>removeStaged(it.id)} className="focus-ring absolute right-1 top-1 rounded-full hover:bg-slate-100 p-0.5">
                          <CircleMinus className="h-4 w-4 text-slate-500 hover:text-slate-700" />
                        </button>
                        <div className="text-sm font-medium flex items-center gap-2">
                          {getEntityIcon(it)}
                          {it.name}
                        </div>
                        <div className="text-[11px] text-slate-500 capitalize">Queued {it.type}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="mb-16">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Already linked ({linked.length})</div>
                {linked.length===0? (
                  <div className="rounded-lg border bg-slate-50 dark:bg-gray-800 dark:border-gray-700 p-3 text-xs text-slate-500 dark:text-gray-400">{t("validationCriteriaTemplateBuilder.noChildrenYet")}</div>
                ):(
                  <div className="grid grid-cols-2 gap-2">
                    {linked.map((child:any)=> (
                      <div key={child.id} className={`relative rounded-lg border p-2 ${colors[child.type]}`}>
                        <button aria-label={t("validationCriteriaTemplateBuilder.unlink")} onClick={() => unlinkEntity(child)} className="focus-ring absolute right-1 top-1 rounded-full hover:bg-slate-100 p-0.5">
                          <CircleMinus className="h-4 w-4 text-slate-500 hover:text-slate-700" />
                        </button>
                        <div className="text-sm font-medium flex items-center gap-2">
                          {getEntityIcon(child)}
                          {child.name}
                        </div>
                        <div className="text-[11px] text-slate-500 capitalize">Linked {child.type}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="absolute bottom-3 left-3 right-3 pointer-events-auto shrink-0 mt-2 flex items-center justify-between rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-700 p-2 shadow-sm">
              <div className="text-xs text-slate-600 dark:text-gray-400">{staging.length} queued</div>
              <div className="flex items-center gap-2">
                <button onClick={()=>staging.forEach((it:any)=>removeStaged(it.id))} disabled={staging.length===0} className="focus-ring rounded-md border px-3 py-1 text-xs disabled:opacity-50">{t("validationCriteriaTemplateBuilder.clear")}</button>
                <button onClick={applyStaging} disabled={staging.length===0} className="focus-ring rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1 text-xs disabled:opacity-50 flex items-center gap-1.5">
                  <Pin size={14} />
                  Apply
                </button>
              </div>
            </div>
            </>
            )}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <h3 className="text-lg font-semibold mb-2">{t("validationCriteriaTemplateBuilder.addAdditionalSolutions")}</h3>
            <p className="text-sm text-slate-500">{t("validationCriteriaTemplateBuilder.dragClickSolutionsToAdd")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Sub-Component: RightPalette (Library)
function RightPalette({ template, setTemplate, globalLibrary, focus, stack, setStack, onAddRootSolution, staging, queueItem, focusedSolutionLibraryId, skippedEntityTypes, addSkippedType, removeSkippedType, solutionLinkMode, setSolutionLinkMode, t }: any){
  // ALL HOOKS MUST BE DECLARED FIRST (before any early returns)
  const [q,setQ]=useState("");
  const [showHidden,setShowHidden]=useState(false);
  const [showAllDescriptions, setShowAllDescriptions] = useState(false);
  const [openDescriptions, setOpenDescriptions] = useState<Record<string, boolean>>({});

  // Safe destructuring with defaults for template data
  const { rootSolutionId, links = [], entities = { solution: [], component: [], criteria: [], outcome: [], action: [] } } = template || {};

  // Calculate rightType with solution link mode + skip state override
  let rightType = !rootSolutionId ? TYPES.solution : (focus ? nextType(focus.type) : TYPES.solution);

  // Override rightType based on solution link mode or skip state
  if (focus?.type === TYPES.solution && solutionLinkMode === 'criteria') {
    rightType = TYPES.criteria;
  } else if (skippedEntityTypes?.has(TYPES.component) && focus?.type === TYPES.solution) {
    rightType = skippedEntityTypes?.has(TYPES.value_mapping) ? TYPES.criteria : TYPES.value_mapping;
  } else if (skippedEntityTypes?.has(TYPES.value_mapping) && focus?.type === TYPES.component) {
    rightType = TYPES.criteria;
  } else if (skippedEntityTypes?.has(TYPES.outcome) && focus?.type === TYPES.criteria) {
    rightType = TYPES.action;
  }

  const edge=focus ? edgeFor(focus.type, rightType) : null;

  // Skip button logic - removed stack length dependencies
  const handleSkipComponents = () => {
    if (rightType !== TYPES.component) return;
    addSkippedType(TYPES.component);
  };

  const handleSkipExpectedOutcomes = () => {
    if (rightType !== TYPES.outcome) return;
    addSkippedType(TYPES.outcome);
  };

  const handleSkipActionsTaken = () => {
    if (rightType !== TYPES.action) return;

    if (!stack || stack.length === 0) return;

    const solution = stack[0];
    if (!solution) return;

    const hasComponents = links.some((l: any) => 
      l.type === EDGE_TYPES.SComp && l.fromId === solution.id
    );

    if (hasComponents) {
      const solutionComponents = entities.component.filter((c: any) => 
        links.some((l: any) => l.type === EDGE_TYPES.SComp && l.fromId === solution.id && l.toId === c.id)
      );

      if (solutionComponents.length > 0) {
        setStack([solution, solutionComponents[0]]);
      } else {
        setStack([solution]);
      }
    } else {
      addSkippedType(TYPES.component);
      setStack([solution]);
    }
  };

  // Determine which skip button to show - hide skip components when user already chose via solution link mode
  const showSkipComponents = rightType === TYPES.component && solutionLinkMode !== 'component';
  const showSkipExpectedOutcomes = rightType === TYPES.outcome;
  const showSkipActionsTaken = rightType === TYPES.action;

  const hasLinkedComponents = focus ? links.some((l: any) => l.type === EDGE_TYPES.SComp && l.fromId === focus.id) : false;
  const hasLinkedOutcomes = focus ? links.some((l: any) => l.type === EDGE_TYPES.CO && l.fromId === focus.id) : false;
  const hasLinkedActions = focus ? links.some((l: any) => (l.type === EDGE_TYPES.OA || l.type === EDGE_TYPES.CA) && l.fromId === focus.id) : false;
  const skipComponentsDisabled = hasLinkedComponents;
  const skipOutcomesDisabled = hasLinkedOutcomes;
  const skipActionsDisabled = hasLinkedActions;

  // For Solutions: hide if already in template (check by ID since solutions are library entities)
  const existingSolutionIds = new Set(entities.solution.map((s:any) => s.id));

  // For Criteria/Outcome/Action: hide if already linked to current parent (check by libraryId)
  // Get instance IDs that are linked to current focus
  const linkedInstanceIds = new Set(
    focus ? links.filter((l:any)=>l.type===edge&&l.fromId===focus.id).map((l:any)=>l.toId) : []
  );

  // Get the libraryIds of those linked instances
  const linkedLibraryIds = new Set(
    (rightType && entities[rightType])
      ? entities[rightType]
          .filter((e:any) => linkedInstanceIds.has(e.id))
          .map((e:any) => e.libraryId || e.id)
      : []
  );

  // Build global link maps (same as Matrix view)
  const globalLinkMaps = useMemo(() => {
    const maps = {
      solutionToComponent: {} as Record<number, Set<number>>,
      solutionToCriteria: {} as Record<number, Set<number>>,
      componentToCriteria: {} as Record<number, Set<number>>,
      criteriaToOutcome: {} as Record<number, Set<number>>,
      outcomeToAction: {} as Record<number, Set<number>>
    };

    if (!globalLibrary.links || !Array.isArray(globalLibrary.links)) return maps;

    globalLibrary.links.forEach((link: any) => {
      const fromId = link.fromId;
      const toId = link.toId;

      if (link.type === EDGE_TYPES.SComp) {
        if (!maps.solutionToComponent[fromId]) maps.solutionToComponent[fromId] = new Set();
        maps.solutionToComponent[fromId].add(toId);
      } else if (link.type === EDGE_TYPES.SC) {
        if (!maps.solutionToCriteria[fromId]) maps.solutionToCriteria[fromId] = new Set();
        maps.solutionToCriteria[fromId].add(toId);
      } else if (link.type === EDGE_TYPES.CC) {
        if (!maps.componentToCriteria[fromId]) maps.componentToCriteria[fromId] = new Set();
        maps.componentToCriteria[fromId].add(toId);
      } else if (link.type === EDGE_TYPES.CO) {
        if (!maps.criteriaToOutcome[fromId]) maps.criteriaToOutcome[fromId] = new Set();
        maps.criteriaToOutcome[fromId].add(toId);
      } else if (link.type === EDGE_TYPES.OA) {
        if (!maps.outcomeToAction[fromId]) maps.outcomeToAction[fromId] = new Set();
        maps.outcomeToAction[fromId].add(toId);
      }
    });

    return maps;
  }, [globalLibrary.links]);

  // Memoized filtering with global linkage logic
  const { alignedItems, hiddenItems } = useMemo(() => {
    // Calculate stagedIds inside useMemo to ensure reactivity
    const stagedIds = new Set(staging.map((s:any) => s.libraryId || s.id));

    const all = rightType ? (globalLibrary[rightType] || []) : [];

    // Short-circuit if no rightType (end of chain)
    if (!rightType) {
      return { alignedItems: [], hiddenItems: [] };
    }

    // Filter by search text first
    const searchFiltered = all.filter((e: any) => 
      e.name.toLowerCase().includes(q.toLowerCase())
    );

    const aligned: any[] = [];
    const hidden: any[] = [];

    searchFiltered.forEach((item: any) => {
      // For Solutions: skip if already in template or staged
      if (rightType === TYPES.solution) {
        if (existingSolutionIds.has(item.id) || stagedIds.has(item.id)) {
          return; // Skip already used solutions
        }
        aligned.push(item);
        return;
      }

      // For other entity types: check if globally linked to focused solution
      // Use fallback: if no solution is focused, use template's first solution
      const effectiveSolutionId = focusedSolutionLibraryId ?? 
        (template?.entities?.solution?.[0]?.libraryId || template?.entities?.solution?.[0]?.id);

      let isGloballyLinked = false;

      // FIRST: Check if item has "All Solutions" flag (solutionIds is null/undefined/empty array)
      // If so, it's linked to ALL solutions regardless of global links
      const solutionIds = item.solutionIds;
      if (solutionIds === null || solutionIds === undefined || (Array.isArray(solutionIds) && solutionIds.length === 0)) {
        isGloballyLinked = true;
      } else if (effectiveSolutionId !== null && effectiveSolutionId !== undefined) {
        // SECOND: Check global link relationships
        if (rightType === TYPES.component) {
          isGloballyLinked = globalLinkMaps.solutionToComponent[effectiveSolutionId]?.has(item.id) ?? false;
        } else if (rightType === TYPES.criteria) {
          // Criteria can be linked directly OR through components
          if (globalLinkMaps.solutionToCriteria[effectiveSolutionId]?.has(item.id)) {
            isGloballyLinked = true;
          } else {
            // Check through components
            const linkedComps = globalLinkMaps.solutionToComponent[effectiveSolutionId] ?? new Set();
            isGloballyLinked = Array.from(linkedComps).some(compId =>
              globalLinkMaps.componentToCriteria[compId]?.has(item.id)
            );
          }
        } else if (rightType === TYPES.outcome) {
          // Find all criteria linked to focused solution
          const linkedCriteria = new Set<number>();
          const directCrit = globalLinkMaps.solutionToCriteria[effectiveSolutionId] ?? new Set();
          directCrit.forEach(c => linkedCriteria.add(c));

          const linkedComps = globalLinkMaps.solutionToComponent[effectiveSolutionId] ?? new Set();
          linkedComps.forEach(compId => {
            const compCrit = globalLinkMaps.componentToCriteria[compId] ?? new Set();
            compCrit.forEach(c => linkedCriteria.add(c));
          });

          // Check if any criteria links to this outcome
          isGloballyLinked = Array.from(linkedCriteria).some(critId =>
            globalLinkMaps.criteriaToOutcome[critId]?.has(item.id)
          );
        } else if (rightType === TYPES.action) {
          // Similar to outcome logic, but one level deeper
          const linkedCriteria = new Set<number>();
          const directCrit = globalLinkMaps.solutionToCriteria[effectiveSolutionId] ?? new Set();
          directCrit.forEach(c => linkedCriteria.add(c));

          const linkedComps = globalLinkMaps.solutionToComponent[effectiveSolutionId] ?? new Set();
          linkedComps.forEach(compId => {
            const compCrit = globalLinkMaps.componentToCriteria[compId] ?? new Set();
            compCrit.forEach(c => linkedCriteria.add(c));
          });

          const linkedOutcomes = new Set<number>();
          linkedCriteria.forEach(critId => {
            const outcomes = globalLinkMaps.criteriaToOutcome[critId] ?? new Set();
            outcomes.forEach(o => linkedOutcomes.add(o));
          });

          isGloballyLinked = Array.from(linkedOutcomes).some(outId =>
            globalLinkMaps.outcomeToAction[outId]?.has(item.id)
          );
        }
      }

      if (!isGloballyLinked) {
        // Not globally linked to focused solution: goes to hidden
        hidden.push(item);
        return;
      }

      // Item is globally linked: check if already linked/staged in template
      const isAlreadyUsed = linkedLibraryIds.has(item.id) || stagedIds.has(item.id);

      if (isAlreadyUsed) {
        return; // Skip already linked/staged items
      }

      // Globally linked and not yet used: show in aligned list
      aligned.push(item);
    });

    return { alignedItems: aligned, hiddenItems: hidden };
  }, [rightType, globalLibrary, q, existingSolutionIds, linkedLibraryIds, focusedSolutionLibraryId, staging, globalLinkMaps]);

  // Combine aligned and hidden items based on showHidden toggle
  const items = showHidden ? [...alignedItems, ...hiddenItems] : alignedItems;

  // Calculate stagedIds for library item rendering
  const stagedIds = new Set(staging.map((s:any) => s.libraryId || s.id));

  // Auto-apply showAllDescriptions when library type or items change
  useEffect(() => {
    if (showAllDescriptions) {
      const newState: Record<string, boolean> = {};
      items.forEach((item: any) => { newState[item.id] = true; });
      setOpenDescriptions(newState);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((it: any) => it.id).join(','), showAllDescriptions]);

  // NOW safe to do early returns (after all hooks)
  // Early return if template doesn't have entities yet (still loading)
  if (!template || !template.entities) {
    return <BuilderPlaceholder isRightPalette={true} t={t} />;
  }

  const toggleDescription = (id: string) => {
    setOpenDescriptions(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleAllDescriptions = (checked: boolean, itemIds: string[]) => {
    if (checked) {
      // Open all visible item descriptions
      const newState: Record<string, boolean> = {};
      itemIds.forEach(id => { newState[id] = true; });
      setOpenDescriptions(newState);
    } else {
      // Close all descriptions
      setOpenDescriptions({});
    }
  };

  const onQueue = (item: any) => {
    if (!rootSolutionId || !focus) {
      // Adding a root/additional solution
      onAddRootSolution(item);
    } else {
      // Queue item to Conveyor staging
      queueItem(item);
    }
  };

  if (focus?.type === TYPES.solution && solutionLinkMode === null && rootSolutionId) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center py-12">
        <div className="rounded-full bg-slate-100 dark:bg-gray-800 p-4 mb-4">
          <LucideIcons.MousePointerClick size={32} className="text-slate-400 dark:text-gray-500" />
        </div>
        <h3 className="text-base font-semibold text-slate-700 dark:text-gray-200 mb-2">{t("validationCriteriaTemplateBuilder.choosePathFirst")}</h3>
        <p className="text-sm text-slate-500 dark:text-gray-400 max-w-xs">{t("validationCriteriaTemplateBuilder.selectComponentsOrCriteria")}</p>
      </div>
    );
  }

  if (rightType === null && rootSolutionId) {
     return (
      <div className="flex h-full flex-col">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold">{t("validationCriteriaTemplateBuilder.reachedEnd")}</div>
        </div>
        <div className="text-sm text-slate-500">{t("validationCriteriaTemplateBuilder.branchEndsHere")}</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-base font-semibold flex items-center gap-2">
          {getLibraryIcon(rightType ?? '')}
          {t("validationCriteriaTemplateBuilder.library")}: {laneTitle[rightType as keyof typeof laneTitle] ?? ''}
        </div>
        <div className="flex items-center gap-2">
          <label className="focus-ring rounded flex items-center gap-1 text-xs text-slate-600">
            <input 
              type="checkbox" 
              checked={showAllDescriptions} 
              onChange={e => {
                const checked = e.target.checked;
                setShowAllDescriptions(checked);
                toggleAllDescriptions(checked, items.map((it:any) => it.id));
              }} 
            /> 
            {t("validationCriteriaTemplateBuilder.showDescriptions")}
          </label>
          <label className="focus-ring rounded flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" checked={showHidden} onChange={e=>setShowHidden(e.target.checked)} /> {t("validationCriteriaTemplateBuilder.showHidden")}</label>
        </div>
      </div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder={`Search ${laneTitle[rightType as keyof typeof laneTitle]}`} className="focus-ring flex-1 rounded-md border px-2 py-1 text-sm" />

        {showSkipComponents && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleSkipComponents}
                  disabled={skipComponentsDisabled}
                  className={`focus-ring rounded-md px-2 py-1 text-xs flex items-center gap-1 ${skipComponentsDisabled ? "bg-muted text-muted-foreground cursor-not-allowed opacity-50" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
                >
                  <SkipForward size={14} />
                  {t("validationCriteriaTemplateBuilder.skipComponents", "Skip Components")}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{skipComponentsDisabled ? "Remove linked Components first to skip" : "Skip Components and add Criteria directly to Solution"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {showSkipExpectedOutcomes && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleSkipExpectedOutcomes}
                  disabled={skipOutcomesDisabled}
                  className={`focus-ring rounded-md px-2 py-1 text-xs flex items-center gap-1 ${skipOutcomesDisabled ? "bg-muted text-muted-foreground cursor-not-allowed opacity-50" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
                >
                  <SkipForward size={14} />
                  {t("validationCriteriaTemplateBuilder.skipExpectedOutcomes", "Skip Expected Outcomes")}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{skipOutcomesDisabled ? "Remove linked Expected Outcomes first to skip" : "Skip Expected Outcomes and proceed to Actions"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {showSkipActionsTaken && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleSkipActionsTaken}
                  disabled={skipActionsDisabled}
                  className={`focus-ring rounded-md px-2 py-1 text-xs flex items-center gap-1 ${skipActionsDisabled ? "bg-muted text-muted-foreground cursor-not-allowed opacity-50" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
                >
                  <SkipForward size={14} />
                  {t("validationCriteriaTemplateBuilder.skipActionsTaken", "Skip Actions Taken")}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{skipActionsDisabled ? "Remove linked Actions first to skip" : `Skip Actions and return to ${links.some((l: any) => l.type === EDGE_TYPES.SC && l.fromId === stack[0].id) ? 'Components' : 'Criteria'}`}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <div className="flex-1 space-y-2 overflow-auto">
        {items.map((it:any)=>{
          // Check if this library item is linked/staged based on context
          const isLinked = rightType === TYPES.solution 
            ? existingSolutionIds.has(it.id) 
            : linkedLibraryIds.has(it.id);
          const isStaged = stagedIds.has(it.id);
          const disabled = (isLinked||isStaged) && !!rootSolutionId;

          // Check if this item is in the hiddenItems array (non-aligned)
          const isNonAligned = hiddenItems.some((h: any) => h.id === it.id);

          return (
            <div key={it.id} draggable={!disabled} onDragStart={e=>!disabled&&e.dataTransfer.setData("application/json",JSON.stringify(it))} onDoubleClick={()=>!disabled&&onQueue(it)} className={`rounded-xl border p-2 ${disabled?"opacity-50":"cursor-grab hover:bg-slate-50"} ${colors[rightType as keyof typeof colors]}`}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium flex items-center gap-2">
                  {getEntityIcon(it)}
                  <span style={{ color: it.isActive === false ? '#3B82F6' : 'inherit' }}>{it.name}</span>
                  {isLinked && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px]">linked</span>}
                  {isStaged && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px]">queued</span>}
                  {!it.isActive && <span className="rounded bg-blue-200 px-1.5 py-0.5 text-[10px] text-blue-800">inactive</span>}
                  {isNonAligned && showHidden && <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-700">N/A</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleDescription(it.id)} className="focus-ring rounded-full p-1" title={t("validationCriteriaTemplateBuilder.toggleDescription")}>
                    <span className={`inline-block transition-transform ${openDescriptions[it.id] ? 'rotate-90' : ''}`}>
                      <ChevronIcon size={14} />
                    </span>
                  </button>
                  <button onClick={()=>onQueue(it)} disabled={disabled} className="focus-ring flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-2 py-0.5 text-xs disabled:opacity-40 disabled:hover:bg-primary">
                    <SquareMousePointerIcon size={12} />
                    {rootSolutionId ? "Link" : "Select"}
                  </button>
                </div>
              </div>
              {openDescriptions[it.id] && (
                <p className="mt-2 text-xs text-slate-600 border-t pt-2">{it.description || "No description."}</p>
              )}
            </div>
          );
        })}
        {items.length===0 && <div className="text-sm text-slate-500">{t("validationCriteriaTemplateBuilder.noItemsTryShowHidden")}</div>}
      </div>

      {/* Informational tip about Show Hidden checkbox */}
      <div className="mt-3 flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 dark:border-gray-700 dark:bg-gray-800 p-3 text-sm text-slate-600 dark:text-gray-400">
        <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-medium text-slate-700 dark:text-gray-200">{t("validationCriteriaTemplateBuilder.showHidden")}</span> {t("validationCriteriaTemplateBuilder.showHiddenRevealsTip")}: (1) items already linked to the current solution (shown with <span className="rounded bg-slate-200 dark:bg-gray-600 dark:text-gray-200 px-1 py-0.5 text-[10px] mx-0.5">linked</span> badge, grayed out), and (2) items not aligned to the focused solution (shown with <span className="rounded bg-gray-200 dark:bg-gray-500 dark:text-gray-200 px-1 py-0.5 text-[10px] text-gray-700 mx-0.5">N/A</span> badge). Non-aligned items can still be linked but are not standard to this solution. Proceed with caution.
        </div>
      </div>
    </div>
  );
}

// ---------- Tab: Preview (NOT a modal)
function PreviewView({ template, allLibraryEntitiesById, t }:any){
  const [step,setStep]=useState(0);
  const [sel,setSel]=useState<any>({solution:null,component:null,criteria:null,outcome:null,action:null});
  const { entities = { solution: [], component: [], criteria: [], outcome: [], action: [] }, links = [] } = template || {};

  const forward=(fromIds:string[],type:any)=>{ 
    const edgeType=type===TYPES.criteria?EDGE_TYPES.SC:type===TYPES.outcome?EDGE_TYPES.CO:EDGE_TYPES.OA; 
    const toIds=new Set(links.filter((l:any)=>l.type===edgeType&&fromIds.includes(l.fromId)).map((l:any)=>l.toId)); 
    return Object.values(allLibraryEntitiesById).filter((e:any) => e.type === type && toIds.has(e.id));
  };

  const solutions=entities.solution;
  const criteria=sel.solution?forward([sel.solution.id],TYPES.criteria):[];
  const outcomes=sel.criteria?forward([sel.criteria.id],TYPES.outcome):[];
  const actions=sel.outcome?forward([sel.outcome.id],TYPES.action):[];

  const steps=[{title:"Choose Solution",items:solutions,key:"solution"},{title:"Choose Criteria",items:criteria,key:"criteria"},{title:"Choose Expected Outcome",items:outcomes,key:"outcome"},{title:"Choose Action Taken",items:actions,key:"action"}] as const;
  const active=steps[step] as any;

  const pick=(item:any)=>{ 
    const k=active.key; 
    const ns={...sel,[k]:item} as any; 
    if(k==="solution") ns.criteria=ns.outcome=ns.action=null; 
    if(k==="criteria") ns.outcome=ns.action=null; 
    if(k==="outcome") ns.action=null; 
    setSel(ns); 

    let nextItems = [];
    if (k === 'solution') nextItems = forward([item.id], TYPES.criteria);
    else if (k === 'criteria') nextItems = forward([item.id], TYPES.outcome);
    else if (k === 'outcome') nextItems = forward([item.id], TYPES.action);

    if (step < 3 && nextItems.length > 0) {
      setStep(step + 1);
    } else if (step < 3) {
      setStep(3);
    }
  };

  return ( 
    <div className="mx-auto max-w-4xl px-4 py-8"> 
      <div className="mb-4 text-center text-lg font-semibold">Preview: {template.name}</div> 
      <div className="mb-6 flex items-center justify-center gap-2 text-sm">
        {["Solution","Criteria","Outcome","Action"].map((t,i)=>(
          <div key={t} className={`rounded-full px-3 py-1 ${i===step?"bg-slate-900 text-white":"bg-slate-200"}`}>{t}</div>
        ))}
      </div> 
      <div className="rounded-2xl border bg-white p-4"> 
        <div className="mb-3 text-sm font-semibold">{active.title}</div> 
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2"> 
          {active.items.map((item:any)=>(
            <button key={item.id} onClick={()=>pick(item)} className="focus-ring rounded-xl border bg-slate-50 p-3 text-left hover:bg-slate-100">
              <div className="font-medium flex items-center gap-2">
                {getEntityIcon(item)}
                {item.name}
              </div>
            </button>
          ))} 
          {active.items.length===0 && <div className="text-sm text-slate-500">{t("validationCriteriaTemplateBuilder.noOptionsConfigured")}</div>}
        </div> 
      </div> 
      <div className="mt-6 rounded-2xl border bg-white p-4"> 
        <div className="mb-2 text-sm font-semibold">{t("validationCriteriaTemplateBuilder.summary")}</div>
        <ul className="text-sm space-y-2">
          <li>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Solution:</span> 
              {sel.solution ? (
                <div className="flex items-center gap-2">
                  {getEntityIcon(sel.solution)}
                  <span>{sel.solution.name}</span>
                </div>
              ) : "—"}
            </div>
            {sel.solution?.description && <p className="ml-4 text-xs text-slate-600">{sel.solution.description}</p>}
          </li>
          <li>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Criteria:</span> 
              {sel.criteria ? (
                <div className="flex items-center gap-2">
                  {getEntityIcon(sel.criteria)}
                  <span>{sel.criteria.name}</span>
                </div>
              ) : (sel.solution && criteria.length === 0 && step >= 1 ? <span className="text-red-600 font-medium">MISSING</span> : "—")}
            </div>
            {sel.criteria?.description && <p className="ml-4 text-xs text-slate-600">{sel.criteria.description}</p>}
          </li>
          <li>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Outcome:</span> 
              {sel.outcome ? (
                <div className="flex items-center gap-2">
                  {getEntityIcon(sel.outcome)}
                  <span>{sel.outcome.name}</span>
                </div>
              ) : (sel.criteria && outcomes.length === 0 && step >= 2 ? <span className="text-red-600 font-medium">MISSING</span> : "—")}
            </div>
            {sel.outcome?.description && <p className="ml-4 text-xs text-slate-600">{sel.outcome.description}</p>}
          </li>
          <li>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Action:</span> 
              {sel.action ? (
                <div className="flex items-center gap-2">
                  {getEntityIcon(sel.action)}
                  <span>{sel.action.name}</span>
                </div>
              ) : (sel.outcome && actions.length === 0 && step >= 3 ? <span className="text-red-600 font-medium">MISSING</span> : "—")}
            </div>
            {sel.action?.description && <p className="ml-4 text-xs text-slate-600">{sel.action.description}</p>}
          </li>
        </ul> 
      </div> 
    </div> 
  );
}

// ---------- Save Template Dialog
function SaveTemplateDialog({ open, onOpenChange, template, globalLibrary, onSave, t }: any) {
  const [templateName, setTemplateName] = useState(template.name || "");
  const [templateDescription, setTemplateDescription] = useState(template.description || "");
  const [templateIcon, setTemplateIcon] = useState(template.icon || "LayoutTemplate");
  const [isSaving, setIsSaving] = useState(false);

  // Sync state when dialog opens or template changes
  useEffect(() => {
    if (open) {
      setTemplateName(template.name || "");
      setTemplateDescription(template.description || "");
      setTemplateIcon(template.icon || "LayoutTemplate");
    }
  }, [open, template.name, template.description, template.icon]);

  const analysisResults = useMemo(() => {
    return runAnalysis(template, globalLibrary);
  }, [template, globalLibrary]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({ ...template, name: templateName, description: templateDescription, icon: templateIcon });
      onOpenChange(false); // Close dialog on successful save
    } catch (err) {
      // Toast is handled by parent, keep dialog open on error
    }
    setIsSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {template.id 
              ? t("validationCriteriaTemplateBuilder.updateTemplate", "Update Template")
              : t("validationCriteriaTemplateBuilder.saveTemplate", "Save Template")
            }
          </DialogTitle>
          <DialogDescription>
            {template.id
              ? t("validationCriteriaTemplateBuilder.updateTemplateDescription", "Update template details and review analysis before saving changes.")
              : t("validationCriteriaTemplateBuilder.saveTemplateDescription", "Configure template details and review analysis before saving.")
            }
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
          <div>
            <h3 className="text-sm font-semibold mb-4">{t("validationCriteriaTemplateBuilder.templateDetails")}</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="templateName" className="text-sm font-medium text-slate-700">{t("validationCriteriaTemplateBuilder.templateName")}</label>
                <input
                  id="templateName"
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                  placeholder={t("validationCriteriaTemplateBuilder.templateNamePlaceholder")}
                  className="focus-ring mt-1 w-full rounded-md border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="templateDescription" className="text-sm font-medium text-slate-700">{t("common.description")}</label>
                <textarea
                  id="templateDescription"
                  value={templateDescription}
                  onChange={e => setTemplateDescription(e.target.value)}
                  placeholder={t("validationCriteriaTemplateBuilder.descriptionPlaceholder")}
                  className="focus-ring mt-1 w-full rounded-md border px-3 py-2 text-sm field-sizing-content min-h-[80px] max-h-[300px] overflow-y-auto resize-none"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">{t("validationCriteriaTemplateBuilder.templateIcon")}</label>
                <div className="mt-1">
                  <LucideIconPicker
                    value={templateIcon}
                    onChange={setTemplateIcon}
                  />
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-4">{t("validationCriteriaTemplateBuilder.templateAnalysis")}</h3>
            <div className="space-y-2">
              {analysisResults.map(test => (
                <div key={test.name} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${test.pass ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {test.pass ? <CheckIcon size={12} /> : <AlertTriangleIcon size={12} />}
                  </span>
                  <div>
                    <div className="font-medium">{test.name}</div>
                    <div className={`text-xs ${test.pass ? "text-slate-500" : "text-red-600"}`}>
                      {test.pass ? t("validationCriteriaTemplateBuilder.looksGood") : test.details}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !templateName?.trim()}>
            {isSaving ? t("common.saving", "Saving...") : template.id ? t("common.saveChanges", "Save Changes") : t("validationCriteriaTemplateBuilder.createAndSave", "Create & Save Template")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}