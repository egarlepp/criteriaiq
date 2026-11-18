import { SolutionGraphic } from "@/components/ui/solution-graphic";
import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect, SearchableSelectOption } from "@/components/ui/searchable-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Plus, Target, CircleCheckBig, Clock, CheckCircle, AlertTriangle, CircleArrowUp, OctagonPause, Siren, XCircle, CircleAlert, Boxes, LayoutList, Activity, Component, HandHeart, ChevronDown, ChevronRight, Check, Link2, CirclePause, CirclePlay } from "lucide-react";
import { CriteriaComponentRow, CriteriaStatusSelect, CriteriaTableHeadRow, CRITERIA_ROW_CLASS, useCriteriaRowSort } from "./criteria-table-parts";
import { CriterionPriorityButton } from "@/components/value-journey/CriterionPriorityButton";
import { useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import { DangerIconButton } from "@/components/shared/danger-icon-button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { SuccessCriteria, SuccessCriteriaFormProps } from "./success-criteria-types";
import { isEntityNA } from "./success-criteria-utils";
import { CriterionDependenciesDrawer } from "@/components/project-detail/CriterionDependenciesDrawer";
import type { DependencyRecord } from "@/components/project-detail/AssumptionsDependenciesTab";

/**
 * Minimal shape shared by component, value-mapping, criteria, outcome and
 * action rows fetched from `/api/{kind}/by-solution/:id`. The render logic
 * only reads `id` and `name` and forwards the row to `isEntityNA`, which
 * inspects `productId`, `solutionIds`, and `isAllSolutions`.
 */
interface SolutionLinkedEntity {
  id: number;
  name: string;
  productId?: number | null;
  solutionIds?: number[];
  isAllSolutions?: boolean;
  [key: string]: unknown;
}

export function SuccessCriteriaForm({ criteria, onChange, selectedSolutions = [], showExistingCriteria = true, dependencyCount, projectDependencies }: SuccessCriteriaFormProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [accordionStep, setAccordionStep] = useState<Record<string, number>>({});
  const [criterionDrawerOpen, setCriterionDrawerOpen] = useState(false);
  const [criterionDrawerLineNumber, setCriterionDrawerLineNumber] = useState(0);
  const [criterionDrawerText, setCriterionDrawerText] = useState("");
  const [criterionDrawerDeps, setCriterionDrawerDeps] = useState<DependencyRecord[]>([]);
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { sortConfig, handleSort, sortCriteriaRows } = useCriteriaRowSort("vcTable");

  const toggleGroupCollapse = (solutionName: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(solutionName)) next.delete(solutionName);
      else next.add(solutionName);
      return next;
    });
  };

  const getAccordionStep = (tempId: string) => accordionStep[tempId] ?? 2;

  const setStep = (tempId: string, step: number) => {
    setAccordionStep(prev => ({ ...prev, [tempId]: step }));
  };

  const { data: apiProducts = [] } = useQuery({
    queryKey: ["/api/products"],
    enabled: true,
    staleTime: 0,
  });

  const findProductByName = (name: string) => {
    if (!name) return undefined;
    const products = apiProducts as any[];
    return (
      products.find((p: any) => p.name === name) ||
      products.find((p: any) => p.name.toLowerCase() === name.toLowerCase()) ||
      products.find((p: any) => {
        const pl = p.name.toLowerCase();
        const nl = name.toLowerCase();
        return pl.length > 0 && (nl.includes(pl) || pl.includes(nl));
      })
    );
  };

  useEffect(() => {
    const productsLoaded = (apiProducts as any[]).length > 0;
    const needsNormalization = criteria.some(c => 
      c.status === "pending" || 
      c.status === "n/a" || 
      c.status === "in progress" ||
      !c.activeFields ||
      !c.showHiddenFields ||
      (productsLoaded && !c.productId && c.productName)
    );

    if (needsNormalization) {
      const normalized = criteria.map(c => {
        const activeFields = c.activeFields || {
          component: !!(c.componentId || c.componentName),
          valueMapping: !!(c.valueMappingId || c.valueMappingName),
          expectedOutcome: !!(c.expectedOutcome || c.expectedOutcomeId),
          actionItem: !!(c.actionItem || c.actionItemId)
        };

        const showHiddenFields = c.showHiddenFields || {
          component: false,
          criteria: false,
          expectedOutcome: false,
          actionItem: false
        };

        const productId = c.productId || (productsLoaded && c.productName
          ? findProductByName(c.productName)?.id ?? null
          : null);

        return {
          ...c,
          productId,
          status: c.status === "pending" ? "not_started" : 
                  c.status === "n/a" ? "cancelled" :
                  c.status === "in progress" ? "in_progress" :
                  c.status,
          activeFields,
          showHiddenFields
        };
      });
      onChange(normalized);
    }
  }, [criteria, onChange, apiProducts]);

  const uniqueSolutionIds = useMemo(() => {
    const ids = new Set<number>();
    criteria.forEach(criterion => {
      const id = criterion.productId ?? findProductByName(criterion.productName || '')?.id;
      if (id) ids.add(id);
    });
    selectedSolutions.forEach(solutionName => {
      const product = findProductByName(solutionName);
      if (product?.id) ids.add(product.id);
    });
    return Array.from(ids);
  }, [criteria, apiProducts, selectedSolutions]);

  // Check if any criterion has "Show Hidden" enabled for each field type
  const showHiddenEnabled = useMemo(() => ({
    component: criteria.some(c => c.showHiddenFields?.component),
    criteria: criteria.some(c => c.showHiddenFields?.criteria),
    expectedOutcome: criteria.some(c => c.showHiddenFields?.expectedOutcome),
    actionItem: criteria.some(c => c.showHiddenFields?.actionItem),
  }), [criteria]);

  // Fetch data for all unique solutions using useQueries (safe for dynamic queries)
  const componentQueries = useQueries({
    queries: uniqueSolutionIds.map(solutionId => ({
      queryKey: [`/api/components/by-solution/${solutionId}`],
      enabled: true,
      staleTime: 30000,
    })),
  });

  const criteriaQueries = useQueries({
    queries: uniqueSolutionIds.map(solutionId => ({
      queryKey: [`/api/criteria/by-solution/${solutionId}`],
      enabled: true,
      staleTime: 30000,
    })),
  });

  const outcomeQueries = useQueries({
    queries: uniqueSolutionIds.map(solutionId => ({
      queryKey: [`/api/outcomes/by-solution/${solutionId}`],
      enabled: true,
      staleTime: 30000,
    })),
  });

  const actionQueries = useQueries({
    queries: uniqueSolutionIds.map(solutionId => ({
      queryKey: [`/api/actions/by-solution/${solutionId}`],
      enabled: true,
      staleTime: 30000,
    })),
  });

  const valueMappingQueries = useQueries({
    queries: uniqueSolutionIds.map(solutionId => ({
      queryKey: [`/api/value-mappings/by-solution/${solutionId}`],
      enabled: true,
      staleTime: 30000,
    })),
  });

  // Fetch ALL entities when "Show Hidden" is enabled (for any criterion)
  const { data: allComponents = [] } = useQuery({
    queryKey: [`/api/components/by-solution/0?includeAll=true`],
    enabled: showHiddenEnabled.component && uniqueSolutionIds.length > 0,
    staleTime: 30000,
  });

  const { data: allCriteriaList = [] } = useQuery({
    queryKey: [`/api/criteria/by-solution/0?includeAll=true`],
    enabled: showHiddenEnabled.criteria && uniqueSolutionIds.length > 0,
    staleTime: 30000,
  });

  const { data: allOutcomes = [] } = useQuery({
    queryKey: [`/api/outcomes/by-solution/0?includeAll=true`],
    enabled: showHiddenEnabled.expectedOutcome && uniqueSolutionIds.length > 0,
    staleTime: 30000,
  });

  const { data: allActions = [] } = useQuery({
    queryKey: [`/api/actions/by-solution/0?includeAll=true`],
    enabled: showHiddenEnabled.actionItem && uniqueSolutionIds.length > 0,
    staleTime: 30000,
  });


  // Build lookup maps for efficient access during render.
  // The endpoints (`/api/components/by-solution/...`, etc.) return arrays of
  // entity rows that are rendered as searchable-select options below; we type
  // them as `SolutionLinkedEntity[]` to keep the lookup strongly typed without
  // pulling in five separate Drizzle row types here.
  const solutionDataLookup = useMemo(() => {
    const lookup: Record<number, {
      components: SolutionLinkedEntity[];
      valueMappings: SolutionLinkedEntity[];
      criteria: SolutionLinkedEntity[];
      outcomes: SolutionLinkedEntity[];
      actions: SolutionLinkedEntity[];
    }> = {};

    uniqueSolutionIds.forEach((solutionId, index) => {
      lookup[solutionId] = {
        components: (componentQueries[index]?.data as SolutionLinkedEntity[] | undefined) || [],
        valueMappings: (valueMappingQueries[index]?.data as SolutionLinkedEntity[] | undefined) || [],
        criteria: (criteriaQueries[index]?.data as SolutionLinkedEntity[] | undefined) || [],
        outcomes: (outcomeQueries[index]?.data as SolutionLinkedEntity[] | undefined) || [],
        actions: (actionQueries[index]?.data as SolutionLinkedEntity[] | undefined) || [],
      };
    });

    return lookup;
  }, [uniqueSolutionIds, componentQueries, valueMappingQueries, criteriaQueries, outcomeQueries, actionQueries]);

  const addCriteria = (productName: string = "") => {
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const selectedProduct = findProductByName(productName);
    const solutionId = selectedProduct?.id || null;
    const newCriteria: Partial<SuccessCriteria> = {
      productName,
      productId: solutionId,
      componentId: null,
      componentName: "",
      valueMappingId: null,
      valueMappingName: null,
      criterion: "",
      expectedOutcome: "",
      actionItem: "",
      status: "not_started",
      criteriaId: null,
      expectedOutcomeId: null,
      actionItemId: null,
      isActive: true,
      activeFields: {
        component: true,
        valueMapping: true,
        expectedOutcome: true,
        actionItem: true,
      },
      tempId,
    };
    const updatedCriteria = [...criteria, newCriteria];
    onChange(updatedCriteria);
    const cachedComponents: any[] = solutionId
      ? (queryClient.getQueryData([`/api/components/by-solution/${solutionId}`]) as any[] | undefined) ?? []
      : [];
    const initialStep = cachedComponents.length > 0 ? 0 : 1;
    setStep(tempId, initialStep);
  };

  const updateCriteria = (index: number, field: string, value: any) => {
    const updated = [...criteria];
    updated[index] = { ...updated[index], [field]: value };

    if (!updated[index].activeFields) {
      const item = updated[index];
      updated[index].activeFields = {
        component: !!(item.componentId || item.componentName),
        valueMapping: !!(item.valueMappingId || item.valueMappingName),
        expectedOutcome: !!(item.expectedOutcome || item.expectedOutcomeId),
        actionItem: !!(item.actionItem || item.actionItemId)
      };
    }

    onChange(updated);
  };

  const updateCriteriaFields = (index: number, fields: Partial<SuccessCriteria>) => {
    const updated = [...criteria];
    updated[index] = { ...updated[index], ...fields };

    if (!updated[index].activeFields) {
      const item = updated[index];
      updated[index].activeFields = {
        component: !!(item.componentId || item.componentName),
        valueMapping: !!(item.valueMappingId || item.valueMappingName),
        expectedOutcome: !!(item.expectedOutcome || item.expectedOutcomeId),
        actionItem: !!(item.actionItem || item.actionItemId)
      };
    }

    onChange(updated);
  };

  const removeCriteria = (index: number) => {
    onChange(criteria.filter((_, i) => i !== index));
  };

  // Function to toggle "Show Hidden" checkbox for a specific field
  const toggleShowHidden = (index: number, field: 'component' | 'criteria' | 'expectedOutcome' | 'actionItem') => {
    const updated = [...criteria];
    if (updated[index]) {
      const current = updated[index].showHiddenFields || {
        component: false,
        criteria: false,
        expectedOutcome: false,
        actionItem: false
      };
      updated[index].showHiddenFields = {
        ...current,
        [field]: !current[field]
      };
      onChange(updated);
    }
  };

  // Function to toggle isActive status
  const toggleActiveStatus = (index: number) => {
    const updated = [...criteria];
    if (updated[index]) {
      // Normalize current state (undefined/true = active, false = inactive)
      const currentIsActive = updated[index]?.isActive !== false;
      // Create a new object reference with inverted normalized state
      updated[index] = { ...updated[index], isActive: !currentIsActive };
      onChange(updated);
    }
  };

  // Toggle functions for optional fields
  const toggleComponentField = (index: number) => {
    const updated = [...criteria];
    if (updated[index]) {
      // Ensure activeFields exists for backward compatibility
      if (!updated[index].activeFields) {
        const item = updated[index];
        updated[index].activeFields = {
          component: !!(item.componentId || item.componentName),
          valueMapping: !!(item.valueMappingId || item.valueMappingName),
          expectedOutcome: !!(item.expectedOutcome || item.expectedOutcomeId),
          actionItem: !!(item.actionItem || item.actionItemId)
        };
      }

      const newComponentState = !updated[index].activeFields!.component;

      updated[index] = {
        ...updated[index],
        activeFields: {
          ...updated[index].activeFields!,
          component: newComponentState
        }
      };

      // Clear component data if disabling (both componentId AND componentName)
      if (!newComponentState) {
        updated[index].componentId = null;
        updated[index].componentName = "";
      }

      onChange(updated);
    }
  };

  const toggleValueMappingField = (index: number) => {
    const updated = [...criteria];
    if (updated[index]) {
      if (!updated[index].activeFields) {
        const item = updated[index];
        updated[index].activeFields = {
          component: !!(item.componentId || item.componentName),
          valueMapping: !!(item.valueMappingId || item.valueMappingName),
          expectedOutcome: !!(item.expectedOutcome || item.expectedOutcomeId),
          actionItem: !!(item.actionItem || item.actionItemId)
        };
      }

      const newState = !updated[index].activeFields!.valueMapping;

      updated[index] = {
        ...updated[index],
        activeFields: {
          ...updated[index].activeFields!,
          valueMapping: newState
        }
      };

      if (!newState) {
        updated[index].valueMappingId = null;
        updated[index].valueMappingName = null;
      }

      onChange(updated);
    }
  };

  const toggleExpectedOutcomeField = (index: number) => {
    const updated = [...criteria];
    if (updated[index]) {
      // Ensure activeFields exists for backward compatibility
      if (!updated[index].activeFields) {
        updated[index].activeFields = {
          component: true,
          valueMapping: true,
          expectedOutcome: true,
          actionItem: true
        };
      }

      const newOutcomeState = !updated[index].activeFields!.expectedOutcome;
      updated[index] = {
        ...updated[index],
        activeFields: {
          ...updated[index].activeFields!,
          expectedOutcome: newOutcomeState,
        }
      };

      // Clear outcome data if disabling
      // Also clear action ID to prevent dangling foreign key (actions are scoped to outcomes)
      // but preserve the free-text actionItem value for user convenience
      if (!newOutcomeState) {
        updated[index].expectedOutcomeId = null;
        updated[index].expectedOutcome = "";
        updated[index].actionItemId = null;  // Clear ID to prevent dangling FK
        // Keep actionItem text value intact for user convenience
      }

      onChange(updated);
    }
  };

  const toggleActionItemField = (index: number) => {
    const updated = [...criteria];
    if (updated[index]) {
      // Ensure activeFields exists for backward compatibility
      if (!updated[index].activeFields) {
        updated[index].activeFields = {
          component: true,
          valueMapping: true,
          expectedOutcome: true,
          actionItem: true
        };
      }

      const newActionState = !updated[index].activeFields!.actionItem;
      updated[index] = {
        ...updated[index],
        activeFields: {
          ...updated[index].activeFields!,
          actionItem: newActionState
        }
      };

      // Clear action data if disabling
      if (!newActionState) {
        updated[index].actionItemId = null;
        updated[index].actionItem = "";
      }

      onChange(updated);
    }
  };

  // Calculate the accurate count of criteria actually being displayed
  // Existing criteria (with IDs) are only shown if showExistingCriteria is true
  // New criteria (without IDs) are always shown
  const existingCriteriaCount = showExistingCriteria ? criteria.filter(c => c.id).length : 0;
  const newCriteriaCount = criteria.filter(c => !c.id).length;
  const displayedCriteriaCount = existingCriteriaCount + newCriteriaCount;

  // Status, with the must-have / nice-to-have icon to its right.
  const StatusSelect = ({ criterion, globalIndex }: { criterion: Partial<SuccessCriteria>, globalIndex: number }) => (
    <div className="flex items-center gap-1">
      <div className="min-w-0 flex-1">
        <CriteriaStatusSelect
          value={criterion.status}
          onValueChange={(value) => updateCriteria(globalIndex, "status", value)}
        />
      </div>
      <CriterionPriorityButton
        priority={criterion.priority}
        onChange={(priority) => updateCriteria(globalIndex, "priority", priority)}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2 dark:text-slate-100">
          <CircleCheckBig data-title-icon className="h-5 w-5" />
          {t("successCriteria.table.title", { count: displayedCriteriaCount })}
        </CardTitle>
        {dependencyCount != null && (
          <div className="flex items-center gap-1.5 text-purple-700 dark:text-purple-300">
            <Link2 className="h-6 w-6" />
            <span className="text-sm font-semibold">{dependencyCount}</span>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {selectedSolutions.length === 0 && criteria.filter(c => !c.id).length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-slate-400">
            <p>{t("successCriteria.table.emptyTitle")}</p>
            <p className="text-sm">{t("successCriteria.table.emptyHint")}</p>
          </div>
        ) : (
          <>
            {(() => {
              const activeOrUsedCriteria = criteria.filter(c => !c.tempId && (c.isActive !== false || !!c.id));
              const groupedExisting = activeOrUsedCriteria.reduce((acc: any, criterion: any) => {
                const solutionName = criterion.productName;
                if (!acc[solutionName]) acc[solutionName] = [];
                acc[solutionName].push(criterion);
                return acc;
              }, {});

              const newCriteria = criteria.filter(c => !!c.tempId);

              const allSolutionNames = Array.from(new Set([
                ...selectedSolutions,
                ...Object.keys(groupedExisting).filter(k => typeof k === 'string' && k.trim() !== ''),
              ]));

              // Build a global display-number map: criteriaId → number (existing use stored lineNumber or position; new use provisional position)
              const displayNumberMap = new Map<number | string, number>();
              let globalCounter = 0;
              let newGlobalCounter = 0;
              const maxStoredLineNum = criteria
                .filter(c => !c.tempId && c.lineNumber != null)
                .reduce((max, c) => Math.max(max, c.lineNumber!), 0);

              for (const sn of allSolutionNames) {
                const existingSol = showExistingCriteria ? (groupedExisting[sn] || []) : [];
                const newSol = newCriteria.filter(c => c.productName === sn);
                for (const c of existingSol) {
                  globalCounter++;
                  displayNumberMap.set(c.id, c.lineNumber ?? globalCounter);
                }
                for (const c of newSol) {
                  newGlobalCounter++;
                  const tid = c.tempId!;
                  displayNumberMap.set(tid, maxStoredLineNum + newGlobalCounter);
                }
              }

              return (
                <div className="space-y-4">
                  {allSolutionNames.map((solutionName) => {
                    const solution = findProductByName(solutionName);
                    const existingForSolution = showExistingCriteria ? (groupedExisting[solutionName] || []) : [];
                    const newForSolution = newCriteria.filter(c => c.productName === solutionName);
                    const isCollapsed = collapsedGroups.has(solutionName);
                    const totalCount = existingForSolution.length + newForSolution.length;

                    return (
                      <div key={solutionName} className="border border-purple-200 dark:border-purple-800 rounded-lg overflow-hidden shadow-sm">
                        {/* Dark purple solution header */}
                        <div
                          className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
                          style={{ background: 'linear-gradient(to right, #3b0764, #4c1d95)' }}
                          onClick={() => toggleGroupCollapse(solutionName)}
                        >
                          <div className="flex items-center gap-3">
                            {solution?.solutionIcon && solution.solutionIcon !== 'none' ? (
                              <img
                                src={`/api/files/system/solution-icons/${solution.solutionIcon}`}
                                alt={solutionName}
                                className="object-contain"
                                style={{ width: '24px', height: '24px', filter: 'brightness(0) invert(1)' }}
                                onError={(e) => e.currentTarget.style.display = 'none'}
                              />
                            ) : solution?.solutionIconName ? (
                              <SolutionGraphic icon={solution.solutionIconName} className="h-5 w-5 text-purple-200 dark:text-purple-200" />
                            ) : (
                              <Boxes className="h-5 w-5 text-purple-200" />
                            )}
                            <h3 className="text-base font-semibold text-white">
                              {solutionName}
                              <span className="ml-2 text-purple-300 text-sm font-normal">({totalCount})</span>
                            </h3>
                          </div>
                          <div className="flex items-center gap-2">
                            {isCollapsed
                              ? <ChevronRight className="h-4 w-4 text-purple-300" />
                              : <ChevronDown className="h-4 w-4 text-purple-300" />
                            }
                          </div>
                        </div>

                        {!isCollapsed && (
                          <div className="bg-white dark:bg-slate-900">
                            {/* Existing criteria table */}
                            {existingForSolution.length > 0 && (
                              <div className="overflow-x-auto">
                                <table className="w-full">
                                  <thead>
                                    <CriteriaTableHeadRow sortConfig={sortConfig} onSort={handleSort} showActions />
                                  </thead>
                                  <tbody>
                                    {(() => {
                                      const noComponentItems = sortCriteriaRows(existingForSolution.filter((c: any) => !c.componentName));
                                      const withComponentItems = existingForSolution.filter((c: any) => !!c.componentName);
                                      const componentGroupMap = new Map<string, any[]>();
                                      withComponentItems.forEach((c: any) => {
                                        const key = c.componentName as string;
                                        if (!componentGroupMap.has(key)) componentGroupMap.set(key, []);
                                        componentGroupMap.get(key)!.push(c);
                                      });
                                      const renderDataRow = (criterion: any) => {
                                        const globalIndex = criteria.findIndex((c: any) => c.id === criterion.id);
                                        const isActive = criterion.isActive !== false;
                                        const displayNum = displayNumberMap.get(criterion.id);
                                        const cellText = isActive ? "text-gray-900 dark:text-slate-200" : "text-blue-500 dark:text-blue-400";
                                        const linkedDeps = projectDependencies
                                          ? (projectDependencies.filter(d =>
                                              d.successCriteriaIds?.includes(criterion.id) ||
                                              (d.successCriteriaId === criterion.id && !(d.successCriteriaIds?.length))
                                            ) as DependencyRecord[])
                                          : [];
                                        const showDepsBadge = linkedDeps.length > 0;
                                        return (
                                          <tr key={criterion.id} className={CRITERIA_ROW_CLASS}>
                                            <td className="px-3 py-3 text-center align-top w-12">
                                              {showDepsBadge ? (
                                                <TooltipProvider>
                                                  <Tooltip>
                                                    <TooltipTrigger asChild>
                                                      <button
                                                        type="button"
                                                        onClick={() => {
                                                          setCriterionDrawerLineNumber(displayNum ?? 0);
                                                          setCriterionDrawerText(criterion.criterion || '');
                                                          setCriterionDrawerDeps(linkedDeps);
                                                          setCriterionDrawerOpen(true);
                                                        }}
                                                        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/50 text-xs font-semibold tabular-nums text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800/70 transition-colors cursor-pointer"
                                                      >
                                                        {displayNum ?? '—'}
                                                      </button>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="right">
                                                      {t("successCriteria.table.linkedDependencies", { count: linkedDeps.length })}
                                                    </TooltipContent>
                                                  </Tooltip>
                                                </TooltipProvider>
                                              ) : (
                                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-slate-700 text-xs font-semibold tabular-nums text-gray-600 dark:text-slate-300">
                                                  {displayNum ?? '—'}
                                                </span>
                                              )}
                                            </td>
                                            <td className="px-3 py-3 text-sm text-gray-500 dark:text-slate-400 align-top italic">
                                              {criterion.valueMappingName || ''}
                                            </td>
                                            <td className={`px-3 py-3 text-sm align-top ${cellText}`}>
                                              {criterion.criterion}
                                            </td>
                                            <td className={`px-3 py-3 text-sm align-top ${cellText}`}>
                                              {criterion.expectedOutcome}
                                            </td>
                                            <td className={`px-3 py-3 text-sm align-top ${cellText}`}>
                                              {criterion.actionItem || t("successCriteria.table.noAction")}
                                            </td>
                                            <td className="px-3 py-3 align-top w-[180px]">
                                              <StatusSelect criterion={criterion} globalIndex={globalIndex} />
                                            </td>
                                            <td className="px-3 py-3 align-top w-[88px]">
                                              <div className="flex items-center gap-1">
                                                <TooltipProvider>
                                                  <Tooltip>
                                                    <TooltipTrigger asChild>
                                                      <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => toggleActiveStatus(globalIndex)}
                                                        aria-label={isActive ? t("successCriteria.table.makeInactive") : t("successCriteria.table.makeActive")}
                                                        className="h-8 w-8 p-0 text-gray-500 hover:text-purple-700 hover:bg-purple-50 dark:text-slate-400 dark:hover:text-purple-300 dark:hover:bg-slate-800"
                                                      >
                                                        {isActive ? <CirclePause className="h-4 w-4" /> : <CirclePlay className="h-4 w-4" />}
                                                      </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top">
                                                      {isActive ? t("successCriteria.table.makeInactive") : t("successCriteria.table.makeActive")}
                                                    </TooltipContent>
                                                  </Tooltip>
                                                </TooltipProvider>
                                                <DangerIconButton type="button" onClick={() => removeCriteria(globalIndex)} title={t("successCriteria.table.deleteCriterion")} aria-label={t("successCriteria.table.deleteCriterion")}>
                                                  <Trash2 size={16} />
                                                </DangerIconButton>
                                              </div>
                                            </td>
                                          </tr>
                                        );
                                      };
                                      const result: React.ReactElement[] = [];
                                      noComponentItems.forEach((criterion: any) => result.push(renderDataRow(criterion)));
                                      componentGroupMap.forEach((items, componentName) => {
                                        result.push(<CriteriaComponentRow key={`ch-${componentName}`} name={componentName} count={items.length} colSpan={7} />);
                                        sortCriteriaRows(items).forEach((criterion: any) => result.push(renderDataRow(criterion)));
                                      });
                                      return result;
                                    })()}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {/* New criterion forms for this solution */}
                            {newForSolution.map((criterion, newIndex) => {
                              const globalIndex = criteria.findIndex(c => c === criterion);
                              const tempId = criterion.tempId || `new-${globalIndex}`;
                              const activeStep = getAccordionStep(tempId);
                              const activeFields = criterion.activeFields || { component: true, valueMapping: true, expectedOutcome: true, actionItem: true };

                              const solutionId = (criterion.productId as number | null | undefined)
                                ?? (findProductByName(criterion.productName || '')?.id ?? null);

                              const showHiddenComponent = criterion.showHiddenFields?.component || false;
                              const showHiddenCriteria = criterion.showHiddenFields?.criteria || false;
                              const showHiddenOutcome = criterion.showHiddenFields?.expectedOutcome || false;
                              const showHiddenAction = criterion.showHiddenFields?.actionItem || false;

                              const components = showHiddenComponent ? (allComponents as any[]) : solutionId ? (solutionDataLookup[solutionId]?.components || []) : [];
                              const valueMappings = solutionId ? (solutionDataLookup[solutionId]?.valueMappings || []) : [];
                              const criteriaList = showHiddenCriteria ? (allCriteriaList as any[]) : solutionId ? (solutionDataLookup[solutionId]?.criteria || []) : [];
                              const outcomes = showHiddenOutcome ? (allOutcomes as any[]) : solutionId ? (solutionDataLookup[solutionId]?.outcomes || []) : [];
                              const actions = showHiddenAction ? (allActions as any[]) : solutionId ? (solutionDataLookup[solutionId]?.actions || []) : [];

                              const componentOptions: SearchableSelectOption[] = components.map(comp => {
                                const isNA = solutionId && isEntityNA(comp, solutionId);
                                return { value: comp.id.toString(), label: comp.name, icon: <Component className="h-4 w-4 text-gray-600" />, prefix: isNA ? "(N/A)" : undefined, bold: isNA };
                              });
                              const valueMappingOptions: SearchableSelectOption[] = valueMappings.map(vm => ({ value: vm.id.toString(), label: vm.name, icon: <HandHeart className="h-4 w-4 text-orange-600" /> }));
                              const criteriaOptions: SearchableSelectOption[] = criteriaList.map(crit => {
                                const isNA = solutionId && isEntityNA(crit, solutionId);
                                return { value: crit.id.toString(), label: crit.name, icon: <LayoutList className="h-4 w-4 text-gray-600" />, prefix: isNA ? "(N/A)" : undefined, bold: isNA };
                              });
                              const outcomeOptions: SearchableSelectOption[] = outcomes.map(outcome => {
                                const isNA = solutionId && isEntityNA(outcome, solutionId);
                                return { value: outcome.id.toString(), label: outcome.name, icon: <CircleCheckBig className="h-4 w-4 text-gray-600" />, prefix: isNA ? "(N/A)" : undefined, bold: isNA };
                              });
                              const actionOptions: SearchableSelectOption[] = actions.map(action => {
                                const isNA = solutionId && isEntityNA(action, solutionId);
                                return { value: action.id.toString(), label: action.name, icon: <Activity className="h-4 w-4 text-gray-600" />, prefix: isNA ? "(N/A)" : undefined, bold: isNA };
                              });

                              const stepData = [
                                { key: 'component', label: 'Component', required: false, Icon: Component, hasValue: !!criterion.componentId, isActive: activeFields.component },
                                { key: 'valueMapping', label: 'Value Mapping', required: false, Icon: HandHeart, hasValue: !!criterion.valueMappingId, isActive: activeFields.valueMapping },
                                { key: 'criteria', label: 'Criteria', required: true, Icon: LayoutList, hasValue: !!criterion.criteriaId, isActive: true },
                                { key: 'expectedOutcome', label: 'Expected Outcome', required: false, Icon: CircleCheckBig, hasValue: !!criterion.expectedOutcomeId, isActive: activeFields.expectedOutcome },
                                { key: 'actionItem', label: 'Actions Taken', required: true, Icon: Activity, hasValue: !!criterion.actionItemId, isActive: activeFields.actionItem },
                              ];

                              const newDisplayNum = displayNumberMap.get(tempId);

                              return (
                                <div key={tempId} className="border-t border-purple-100 dark:border-purple-900">
                                  {/* New Criterion Entry header - light purple */}
                                  <div className="flex items-center justify-between px-4 py-2.5 bg-purple-50 dark:bg-purple-900/20 border-b border-purple-100 dark:border-purple-900">
                                    <div className="flex items-center gap-2">
                                      {newDisplayNum != null && (
                                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-purple-200 dark:bg-purple-700 text-xs font-bold text-purple-800 dark:text-purple-100">
                                          {newDisplayNum}
                                        </span>
                                      )}
                                      <h4 className="text-sm font-semibold text-purple-900 dark:text-purple-200">
                                        New Criterion Entry
                                      </h4>
                                    </div>
                                    {/* Progress steps */}
                                    <div className="flex items-center gap-0.5">
                                      {stepData.map((step, i) => {
                                        const isCurrent = activeStep === i;
                                        const isComplete = step.hasValue;
                                        const isSkipped = !step.isActive && !step.required;
                                        let circleClass = "";
                                        let textClass = "";
                                        let title = step.label;
                                        if (isComplete) {
                                          circleClass = "bg-purple-600 border-purple-600";
                                          textClass = "text-white";
                                          title = `${step.label} ✓`;
                                        } else if (isCurrent) {
                                          circleClass = "bg-purple-600 border-purple-600";
                                          textClass = "text-white";
                                        } else if (isSkipped) {
                                          circleClass = "bg-gray-200 border-gray-300 dark:bg-gray-700 dark:border-gray-600";
                                          textClass = "text-gray-400 dark:text-gray-500";
                                        } else if (!step.isActive) {
                                          circleClass = "bg-amber-50 border-amber-400";
                                          textClass = "text-amber-600";
                                        } else {
                                          circleClass = "bg-white border-gray-300 dark:bg-slate-800 dark:border-slate-600";
                                          textClass = "text-gray-500 dark:text-gray-400";
                                        }
                                        return (
                                          <TooltipProvider key={step.key}>
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <button
                                                  type="button"
                                                  onClick={() => setStep(tempId, i)}
                                                  className={`h-5 w-5 rounded-full border flex items-center justify-center shrink-0 transition-all cursor-pointer hover:ring-2 hover:ring-purple-300 ${circleClass}`}
                                                  title={title}
                                                >
                                                  {isComplete
                                                    ? <Check className={`h-2.5 w-2.5 ${textClass}`} />
                                                    : <span className={`text-[9px] font-bold leading-none ${textClass}`}>{i + 1}</span>
                                                  }
                                                </button>
                                              </TooltipTrigger>
                                              <TooltipContent side="top" className="text-xs">
                                                <p>{step.label}{step.required ? ' (required)' : ' (optional)'}</p>
                                              </TooltipContent>
                                            </Tooltip>
                                          </TooltipProvider>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  {/* Horizontal accordion body */}
                                  <div className="flex items-stretch bg-white dark:bg-slate-900 min-h-[80px]">
                                    {/* Accordion panels */}
                                    <div className="flex flex-1 items-stretch divide-x divide-gray-200 dark:divide-slate-700 overflow-x-auto">
                                      {stepData.map((step, i) => {
                                        const isExpanded = activeStep === i;
                                        const isComplete = step.hasValue;
                                        const isSkipped = !step.isActive && !step.required;
                                        const StepIcon = step.Icon;

                                        let iconColor = "text-gray-400 dark:text-gray-500";
                                        if (isComplete) iconColor = "text-purple-600 dark:text-purple-400";
                                        else if (isExpanded) iconColor = "text-purple-500";
                                        else if (isSkipped) iconColor = "text-gray-300 dark:text-gray-600";
                                        else if (step.required && !isComplete) iconColor = "text-amber-500";

                                        if (!isExpanded) {
                                          return (
                                            <TooltipProvider key={step.key}>
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <button
                                                    type="button"
                                                    onClick={() => setStep(tempId, i)}
                                                    className="w-10 shrink-0 flex flex-col items-center justify-center py-4 cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/10 transition-colors"
                                                  >
                                                    <StepIcon className={`h-4 w-4 ${iconColor}`} />
                                                    {isComplete && <div className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-1" />}
                                                  </button>
                                                </TooltipTrigger>
                                                <TooltipContent side="bottom" className="text-xs">
                                                  <p>{step.label}</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            </TooltipProvider>
                                          );
                                        }

                                        return (
                                          <div key={step.key} className="flex-1 min-w-[220px] p-3 bg-purple-50/30 dark:bg-purple-900/5">
                                            <div className="min-h-[28px] flex items-center justify-between gap-2 mb-1.5">
                                              <Label className="text-xs font-semibold text-purple-800 dark:text-purple-300 flex items-center gap-1.5 whitespace-nowrap">
                                                <StepIcon className="h-3.5 w-3.5" />
                                                {step.label}{step.required ? ' *' : ''}
                                              </Label>
                                              {/* Hidden checkbox for applicable steps */}
                                              {(step.key === 'component' || step.key === 'criteria' || step.key === 'expectedOutcome' || step.key === 'actionItem') && (
                                                <div className="flex items-center gap-1">
                                                  <Checkbox
                                                    id={`show-hidden-${step.key}-${globalIndex}`}
                                                    checked={
                                                      step.key === 'component' ? showHiddenComponent :
                                                      step.key === 'criteria' ? showHiddenCriteria :
                                                      step.key === 'expectedOutcome' ? showHiddenOutcome :
                                                      showHiddenAction
                                                    }
                                                    onCheckedChange={() => toggleShowHidden(globalIndex, step.key as any)}
                                                    className="h-3 w-3"
                                                  />
                                                  <TooltipProvider>
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <label
                                                          htmlFor={`show-hidden-${step.key}-${globalIndex}`}
                                                          className="text-[10px] text-gray-500 dark:text-slate-400 cursor-pointer hover:text-gray-700 dark:hover:text-slate-200"
                                                        >
                                                          Hidden
                                                        </label>
                                                      </TooltipTrigger>
                                                      <TooltipContent><p>Show entities not aligned to this solution</p></TooltipContent>
                                                    </Tooltip>
                                                  </TooltipProvider>
                                                </div>
                                              )}
                                            </div>

                                            {step.key === 'component' && (
                                              <SearchableSelect
                                                options={componentOptions}
                                                value={criterion.componentId?.toString() || ""}
                                                onValueChange={(value) => {
                                                  const id = value ? parseInt(value) : null;
                                                  const name = componentOptions.find(o => o.value === value)?.label || "";
                                                  updateCriteriaFields(globalIndex, { componentId: id, componentName: id ? name : "" });
                                                }}
                                                placeholder="Search Components..."
                                                searchPlaceholder="Search..."
                                                emptyText="No components found"
                                                disabled={!criterion.productName}
                                                className="h-8 text-xs"
                                              />
                                            )}
                                            {step.key === 'valueMapping' && (
                                              <SearchableSelect
                                                options={valueMappingOptions}
                                                value={criterion.valueMappingId?.toString() || ""}
                                                onValueChange={(value) => {
                                                  const id = value ? parseInt(value) : null;
                                                  const name = valueMappingOptions.find(o => o.value === value)?.label || "";
                                                  updateCriteriaFields(globalIndex, { valueMappingId: id, valueMappingName: id ? name : null });
                                                }}
                                                placeholder="Search Value Mappings..."
                                                searchPlaceholder="Search..."
                                                emptyText="No value mappings found"
                                                disabled={!criterion.productName}
                                                className="h-8 text-xs"
                                              />
                                            )}
                                            {step.key === 'criteria' && (
                                              <SearchableSelect
                                                options={criteriaOptions}
                                                value={criterion.criteriaId?.toString() || ""}
                                                onValueChange={(value) => {
                                                  const id = value ? parseInt(value) : null;
                                                  const text = criteriaOptions.find(o => o.value === value)?.label || "";
                                                  updateCriteriaFields(globalIndex, { criteriaId: id, criterion: id ? text : "" });
                                                }}
                                                placeholder="Search Criteria..."
                                                searchPlaceholder="Search..."
                                                emptyText="No criteria found"
                                                disabled={!criterion.productName}
                                                className="h-8 text-xs"
                                              />
                                            )}
                                            {step.key === 'expectedOutcome' && (
                                              <SearchableSelect
                                                options={outcomeOptions}
                                                value={criterion.expectedOutcomeId?.toString() || ""}
                                                onValueChange={(value) => {
                                                  const id = value ? parseInt(value) : null;
                                                  const text = outcomeOptions.find(o => o.value === value)?.label || "";
                                                  updateCriteriaFields(globalIndex, { expectedOutcomeId: id, expectedOutcome: id ? text : "" });
                                                }}
                                                placeholder="Search Outcomes..."
                                                searchPlaceholder="Search..."
                                                emptyText="No outcomes found"
                                                disabled={!criterion.productName}
                                                className="h-8 text-xs"
                                              />
                                            )}
                                            {step.key === 'actionItem' && (
                                              <SearchableSelect
                                                options={actionOptions}
                                                value={criterion.actionItemId?.toString() || ""}
                                                onValueChange={(value) => {
                                                  const id = value ? parseInt(value) : null;
                                                  const text = actionOptions.find(o => o.value === value)?.label || "";
                                                  updateCriteriaFields(globalIndex, { actionItemId: id, actionItem: id ? text : "" });
                                                }}
                                                placeholder="Search Actions..."
                                                searchPlaceholder="Search..."
                                                emptyText="No actions found"
                                                disabled={!criterion.productName}
                                                className="h-8 text-xs"
                                              />
                                            )}

                                            {/* Next step button */}
                                            {i < stepData.length - 1 && (
                                              <button
                                                type="button"
                                                onClick={() => setStep(tempId, i + 1)}
                                                className="mt-2 text-[10px] text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-200 underline"
                                              >
                                                Next →
                                              </button>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>

                                    {/* Pinned right: Status + Delete */}
                                    <div className="shrink-0 flex flex-col items-center justify-center gap-2 px-3 border-l border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                                      <StatusSelect criterion={criterion} globalIndex={globalIndex} />
                                      <DangerIconButton onClick={() => removeCriteria(globalIndex)} title="Delete criterion">
                                        <Trash2 size={15} />
                                      </DangerIconButton>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                            {/* Add Criterion button at bottom of each solution group */}
                            <div className="flex justify-end px-4 py-3 border-t border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => addCriteria(solutionName)}
                                className="bg-purple-700 hover:bg-purple-800 text-white"
                              >
                                <Plus className="h-3.5 w-3.5 mr-1.5" />
                                Add Criterion
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </>
        )}
      </div>

      {/* Explanatory note */}
      <div className="mt-2 p-3 bg-purple-50 border border-purple-200 rounded-md dark:bg-purple-900/20 dark:border-purple-800">
        <p className="text-sm text-purple-800 dark:text-purple-300">
          <strong>Note:</strong> Criteria groups are organized by the solutions selected in Project Essentials. Add solutions there to see them here.<br />
          Making a Validation Criteria <strong>Inactive</strong> will hide it from the project view, but keep it for later reactivation.
        </p>
      </div>

      {/* Criterion Dependencies Drawer — only mounted in edit mode when projectDependencies is provided */}
      {projectDependencies != null && (
        <CriterionDependenciesDrawer
          open={criterionDrawerOpen}
          onClose={() => setCriterionDrawerOpen(false)}
          lineNumber={criterionDrawerLineNumber}
          criterionText={criterionDrawerText}
          deps={criterionDrawerDeps}
          products={(apiProducts as any[]).map((p: any) => ({
            id: p.id,
            name: p.name,
            solutionIcon: p.solutionIcon ?? null,
            solutionIconName: p.solutionIconName ?? null,
          }))}
          successCriteria={
            criteria
              .filter((sc): sc is Partial<SuccessCriteria> & { id: number } => sc.id !== undefined)
              .map((sc) => ({
                id: sc.id,
                name: sc.criterion ?? `Criteria ${sc.id}`,
                productName: sc.productName ?? null,
                solutionIcon: null,
                lineNumber: sc.lineNumber ?? null,
                criterion: sc.criterion ?? null,
                componentName: sc.componentName ?? null,
                valueMappingName: sc.valueMappingName ?? null,
                expectedOutcome: sc.expectedOutcome ?? null,
              }))
          }
        />
      )}
    </div>
  );
}