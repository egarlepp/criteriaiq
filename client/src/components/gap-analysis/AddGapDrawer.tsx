import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { showSuccessToast, showErrorToast } from "@/lib/toast-helper";
import type { Gap } from "@shared/schema";
import { AlignVerticalSpaceAround, ChevronDown, ChevronRight, Loader2, LinkIcon } from "lucide-react";

interface AddGapDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  projectName?: string;
}

function getCriticalityColor(criticality: string) {
  switch (criticality) {
    case "Blocker":
      return "bg-red-600 text-white dark:bg-red-700 dark:text-white";
    case "Must Have":
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    case "Should Have":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    case "Nice to Have":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case "Workaround Available":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case "Roadmap Candidate":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
    case "Won't Do":
      return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
  }
}

function getGapTypeColor(gapType: string) {
  switch (gapType) {
    case "Feature":
      return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200";
    case "Integration":
      return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200";
    case "Performance":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
    case "Scalability":
      return "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200";
    case "Usability":
      return "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
  }
}

interface GapWithMeta extends Gap {
  projectName?: string;
  reportedByName?: string;
}

export function AddGapDrawer({ open, onOpenChange, projectId, projectName }: AddGapDrawerProps) {
  const [selectedGapIds, setSelectedGapIds] = useState<Set<number>>(new Set());
  const [expandedGapIds, setExpandedGapIds] = useState<Set<number>>(new Set());
  const queryClient = useQueryClient();

  const { data: availableGaps = [], isLoading } = useQuery<GapWithMeta[]>({
    queryKey: [`/api/projects/${projectId}/available-gaps`],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/available-gaps`);
      if (!response.ok) throw new Error("Failed to fetch available gaps");
      return response.json();
    },
    enabled: open,
  });

  const linkMutation = useMutation({
    mutationFn: async (gapIds: number[]) => {
      const response = await fetch(`/api/projects/${projectId}/link-gaps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gapIds }),
      });
      if (!response.ok) throw new Error("Failed to link gaps");
      return response.json();
    },
    onSuccess: (data) => {
      showSuccessToast("Gaps Linked", data.message);
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/gaps`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/available-gaps`] });
      setSelectedGapIds(new Set());
      onOpenChange(false);
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to link gaps");
    },
  });

  const toggleGapSelection = (gapId: number) => {
    setSelectedGapIds(prev => {
      const next = new Set(prev);
      if (next.has(gapId)) {
        next.delete(gapId);
      } else {
        next.add(gapId);
      }
      return next;
    });
  };

  const toggleGapExpansion = (gapId: number) => {
    setExpandedGapIds(prev => {
      const next = new Set(prev);
      if (next.has(gapId)) {
        next.delete(gapId);
      } else {
        next.add(gapId);
      }
      return next;
    });
  };

  const handleLinkSelected = () => {
    if (selectedGapIds.size === 0) return;
    linkMutation.mutate(Array.from(selectedGapIds));
  };

  const selectAll = () => {
    setSelectedGapIds(new Set(availableGaps.map(g => g.id)));
  };

  const deselectAll = () => {
    setSelectedGapIds(new Set());
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[500px] sm:w-[600px] flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <AlignVerticalSpaceAround className="h-5 w-5 text-blue-500" />
            Add Solution Gap
          </SheetTitle>
          <SheetDescription>
            Select gaps from other projects that match your solutions to link to{" "}
            {projectName || "this project"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-hidden mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : availableGaps.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center text-muted-foreground">
              <AlignVerticalSpaceAround className="h-8 w-8 mb-2 opacity-50" />
              <p>No available gaps found</p>
              <p className="text-sm">
                All matching gaps are already linked to this project
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-sm text-muted-foreground">
                  {availableGaps.length} gap{availableGaps.length !== 1 ? "s" : ""} available
                </span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAll}>
                    Select All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={deselectAll}>
                    Clear
                  </Button>
                </div>
              </div>

              <ScrollArea className="h-[calc(100vh-280px)]">
                <div className="space-y-2 pr-4">
                  {availableGaps.map((gap) => (
                    <Collapsible
                      key={gap.id}
                      open={expandedGapIds.has(gap.id)}
                      onOpenChange={() => toggleGapExpansion(gap.id)}
                    >
                      <div
                        className={`border rounded-lg p-3 transition-colors ${
                          selectedGapIds.has(gap.id)
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-muted-foreground/50"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={selectedGapIds.has(gap.id)}
                            onCheckedChange={() => toggleGapSelection(gap.id)}
                            className="mt-1"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm truncate">
                                {gap.gapName}
                              </span>
                              <CollapsibleTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                  {expandedGapIds.has(gap.id) ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                </Button>
                              </CollapsibleTrigger>
                            </div>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              <Badge variant="outline" className="text-xs">
                                {gap.impactedSolution}
                              </Badge>
                              <Badge className={`text-xs ${getGapTypeColor(gap.gapType)}`}>
                                {gap.gapType}
                              </Badge>
                              <Badge className={`text-xs ${getStatusColor(gap.status)}`}>
                                {gap.status}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        <CollapsibleContent className="mt-3 pl-7 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Criticality:</span>
                            <Badge className={`text-xs ${getCriticalityColor(gap.criticality)}`}>
                              {gap.criticality}
                            </Badge>
                          </div>
                          
                          <div>
                            <span className="text-xs text-muted-foreground block mb-1">
                              Description:
                            </span>
                            <p className="text-sm text-foreground/80">
                              {gap.description}
                            </p>
                          </div>

                          {gap.workaroundDetail && (
                            <div>
                              <span className="text-xs text-muted-foreground block mb-1">
                                Proposed Workaround:
                              </span>
                              <p className="text-sm text-foreground/80">
                                {gap.workaroundDetail}
                              </p>
                            </div>
                          )}

                          {gap.projectName && (
                            <div className="text-xs text-muted-foreground">
                              From project: {gap.projectName}
                            </div>
                          )}
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}
        </div>

        <SheetFooter className="mt-4 pt-4 border-t">
          <div className="flex items-center justify-between w-full">
            <span className="text-sm text-muted-foreground">
              {selectedGapIds.size} selected
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleLinkSelected}
                disabled={selectedGapIds.size === 0 || linkMutation.isPending}
              >
                {linkMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <LinkIcon className="h-4 w-4 mr-2" />
                )}
                Link {selectedGapIds.size > 0 ? `(${selectedGapIds.size})` : ""}
              </Button>
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
