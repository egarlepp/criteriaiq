import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GapFormDialog } from "./GapFormDialog";
import type { Gap } from "@shared/schema";
import { AlignVerticalSpaceAround, ChevronRight } from "lucide-react";

interface GapDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  projectName?: string;
  projectSolutions?: string[];
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

export function GapDrawer({ open, onOpenChange, projectId, projectName, projectSolutions = [] }: GapDrawerProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [gapToEdit, setGapToEdit] = useState<Gap | null>(null);

  const { data, isLoading } = useQuery<{
    projectGaps: Gap[];
    relatedAccountGaps: Gap[];
    customerId: number | null;
  }>({
    queryKey: [`/api/projects/${projectId}/gaps`],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/gaps`);
      if (!response.ok) throw new Error("Failed to fetch gaps");
      return response.json();
    },
    enabled: open,
  });

  const { data: productsData } = useQuery<{ id: number; name: string; solutionIcon?: string | null }[]>({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const response = await fetch("/api/products");
      if (!response.ok) throw new Error("Failed to fetch products");
      return response.json();
    },
    enabled: open,
  });

  const gaps = data?.projectGaps || [];
  
  const availableProducts = (productsData || []).filter(product => {
    if (projectSolutions.length === 0) return true;
    return projectSolutions.some(sol => 
      sol.toLowerCase() === product.name.toLowerCase() ||
      sol.toLowerCase().includes(product.name.toLowerCase()) ||
      product.name.toLowerCase().includes(sol.toLowerCase())
    );
  });

  const handleGapClick = (gap: Gap) => {
    setGapToEdit(gap);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setGapToEdit(null);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <AlignVerticalSpaceAround className="h-5 w-5" />
              Gap Analysis
            </SheetTitle>
            <SheetDescription>
              {projectName ? `Gaps for ${projectName}` : "Project gaps and limitations"}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4">
            <Button
              onClick={() => {
                setGapToEdit(null);
                setIsFormOpen(true);
              }}
              size="sm"
              className="mb-4"
            >
              <AlignVerticalSpaceAround className="h-4 w-4 mr-2" />
              Log New Gap
            </Button>

            <ScrollArea className="h-[calc(100vh-200px)]">
              {isLoading ? (
                <div className="flex items-center justify-center p-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                </div>
              ) : gaps.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlignVerticalSpaceAround className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No gaps recorded for this project</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {gaps.map((gap) => (
                    <div
                      key={gap.id}
                      onClick={() => handleGapClick(gap)}
                      className="p-3 border rounded-lg cursor-pointer hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-sm">{gap.gapName}</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="text-xs text-muted-foreground mb-2">{gap.impactedSolution}</div>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className={getCriticalityColor(gap.criticality)} variant="secondary">
                          {gap.criticality}
                        </Badge>
                        <Badge className={getStatusColor(gap.status)} variant="secondary">
                          {gap.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {gap.description}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </SheetContent>
      </Sheet>

      <GapFormDialog
        open={isFormOpen}
        onOpenChange={handleCloseForm}
        gapToEdit={gapToEdit}
        projectContext={{
          id: projectId,
          customerId: data?.customerId ?? null,
          solutions: projectSolutions,
        }}
        availableProducts={availableProducts}
      />
    </>
  );
}
