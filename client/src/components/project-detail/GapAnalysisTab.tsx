import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { showSuccessToast, showErrorToast } from "@/lib/toast-helper";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ResponsiveTableActionsMenu } from "@/components/ui/table-actions-menu";
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
import { GapFormDialog } from "@/components/gap-analysis/GapFormDialog";
import { AddGapDrawer } from "@/components/gap-analysis/AddGapDrawer";
import type { Gap } from "@shared/schema";
import { AlignVerticalSpaceAround, Plus, Edit, Trash2, Eye, Building2, LinkIcon, Unlink } from "lucide-react";

interface GapAnalysisTabProps {
  projectId: number;
  customerId: number | null;
  solutions: string[];
  availableProducts: { id: number; name: string; solutionIcon?: string | null }[];
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

export function GapAnalysisTab({
  projectId,
  customerId,
  solutions,
  availableProducts,
}: GapAnalysisTabProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isAddDrawerOpen, setIsAddDrawerOpen] = useState(false);
  const [gapToEdit, setGapToEdit] = useState<Gap | null>(null);
  const [gapToDelete, setGapToDelete] = useState<Gap | null>(null);

  type GapWithMeta = Gap & { 
    reportedByName?: string; 
    isLinked?: boolean;
    linkId?: number;
    sourceProjectName?: string;
  };

  const { data, isLoading } = useQuery<{
    projectGaps: GapWithMeta[];
    relatedAccountGaps: (Gap & { projectName?: string; reportedByName?: string })[];
    customerId: number | null;
  }>({
    queryKey: [`/api/projects/${projectId}/gaps`],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/gaps`);
      if (!response.ok) throw new Error("Failed to fetch gaps");
      return response.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (gapId: number) => {
      return apiRequest("DELETE", `/api/gaps/${gapId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/gaps`] });
      queryClient.invalidateQueries({ queryKey: ["/api/gaps"] });
      showSuccessToast(t('projects.gapAnalysis.gapDeletedSuccess'));
      setGapToDelete(null);
    },
    onError: (error: any) => {
      showErrorToast(t('projects.gapAnalysis.errorDeletingGap'), error.message);
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async (linkId: number) => {
      return apiRequest("DELETE", `/api/projects/${projectId}/unlink-gap/${linkId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/gaps`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/available-gaps`] });
      showSuccessToast(t('projects.gapAnalysis.gapUnlinkedSuccess'));
    },
    onError: (error: any) => {
      showErrorToast(t('projects.gapAnalysis.errorUnlinkingGap'), error.message);
    },
  });

  const handleEdit = (gap: Gap) => {
    setGapToEdit(gap);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setGapToEdit(null);
  };

  const projectGaps = data?.projectGaps || [];
  const relatedAccountGaps = data?.relatedAccountGaps || [];
  const resolvedCustomerId = data?.customerId || customerId;

  const renderGapTable = (
    gaps: GapWithMeta[],
    showProject = false,
    allowEdit = true
  ) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('projects.gapAnalysis.gapName')}</TableHead>
          <TableHead className="w-[120px]">{t('projects.gapAnalysis.criticality')}</TableHead>
          <TableHead>{t('projects.gapAnalysis.impactedSolution')}</TableHead>
          <TableHead>{t('projects.gapAnalysis.gapType')}</TableHead>
          <TableHead className="max-w-[300px]">{t('common.description')}</TableHead>
          <TableHead>{t('common.status')}</TableHead>
          {showProject && <TableHead>{t('projects.gapAnalysis.project')}</TableHead>}
          <TableHead>{t('projects.gapAnalysis.reportedBy')}</TableHead>
          <TableHead className="w-[80px]">{t('common.actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {gaps.length === 0 ? (
          <TableRow>
            <TableCell colSpan={showProject ? 9 : 8} className="text-center py-8 text-muted-foreground">
              No gaps recorded
            </TableCell>
          </TableRow>
        ) : (
          gaps.map((gap) => (
            <TableRow key={gap.isLinked ? `linked-${gap.id}` : gap.id}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  {gap.gapName}
                  {gap.isLinked && (
                    <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                      <LinkIcon className="h-3 w-3 mr-1" />
                      Linked
                    </Badge>
                  )}
                </div>
                {gap.isLinked && gap.sourceProjectName && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    From: {gap.sourceProjectName}
                  </div>
                )}
              </TableCell>
              <TableCell>
                <Badge className={getCriticalityColor(gap.criticality)}>
                  {gap.criticality}
                </Badge>
              </TableCell>
              <TableCell>{gap.impactedSolution}</TableCell>
              <TableCell>{gap.gapType}</TableCell>
              <TableCell className="max-w-[300px] truncate" title={gap.description}>
                {gap.description}
              </TableCell>
              <TableCell>
                <Badge className={getStatusColor(gap.status)}>{gap.status}</Badge>
              </TableCell>
              {showProject && <TableCell>{(gap as any).projectName || "N/A"}</TableCell>}
              <TableCell>{gap.reportedByName || "Unknown"}</TableCell>
              <TableCell>
                <ResponsiveTableActionsMenu
                  actions={[
                    {
                      id: "view",
                      label: "View Details",
                      icon: Eye,
                      onClick: () => handleEdit(gap),
                    },
                    ...(allowEdit && !gap.isLinked
                      ? [
                          {
                            id: "edit",
                            label: "Edit",
                            icon: Edit,
                            onClick: () => handleEdit(gap),
                          },
                          {
                            id: "delete",
                            label: "Delete",
                            icon: Trash2,
                            variant: "destructive" as const,
                            onClick: () => setGapToDelete(gap),
                          },
                        ]
                      : []),
                    ...(gap.isLinked && gap.linkId
                      ? [
                          {
                            id: "unlink",
                            label: "Unlink from Project",
                            icon: Unlink,
                            variant: "warning" as const,
                            onClick: () => unlinkMutation.mutate(gap.linkId!),
                          },
                        ]
                      : []),
                  ]}
                />
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="relative overflow-hidden">
        <DecorativeCardIcon icon={AlignVerticalSpaceAround} />
        <CardHeader className="flex flex-row items-center justify-between relative z-10">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlignVerticalSpaceAround className="h-6 w-6 text-blue-500" />
              Project Solution Gaps Identified
            </CardTitle>
            <CardDescription>
              Solution limitations identified during this project
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setIsAddDrawerOpen(true)}>
              <LinkIcon className="h-4 w-4 mr-2" />
              Add Solution Gap
            </Button>
            <Button onClick={() => setIsFormOpen(true)}>
              <AlignVerticalSpaceAround className="h-4 w-4 mr-2" />
              Log Solution Gap
            </Button>
          </div>
        </CardHeader>
        <CardContent className="relative z-10">{renderGapTable(projectGaps, false, true)}</CardContent>
      </Card>

      {relatedAccountGaps.length > 0 && (
        <Card className="relative overflow-hidden">
          <DecorativeCardIcon icon={Building2} />
          <CardHeader className="relative z-10">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>{t('projects.gapAnalysis.accountInsights')}</CardTitle>
                <CardDescription>
                  Gaps from other projects for this customer (filtered to project solutions)
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="relative z-10">{renderGapTable(relatedAccountGaps as GapWithMeta[], true, false)}</CardContent>
        </Card>
      )}

      <GapFormDialog
        open={isFormOpen}
        onOpenChange={handleCloseForm}
        gapToEdit={gapToEdit}
        projectContext={{
          id: projectId,
          customerId: resolvedCustomerId,
          solutions,
        }}
        availableProducts={availableProducts}
      />

      <AddGapDrawer
        open={isAddDrawerOpen}
        onOpenChange={setIsAddDrawerOpen}
        projectId={projectId}
      />

      <AlertDialog open={!!gapToDelete} onOpenChange={() => setGapToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('projects.gapAnalysis.deleteGapTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this gap? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => gapToDelete && deleteMutation.mutate(gapToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
