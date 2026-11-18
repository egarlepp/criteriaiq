import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Play, Trash2, FileText } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { showErrorToast } from "@/lib/toast-helper";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import ReportBuilderContent, {
  type ReportBuilderEditableReport,
} from "./ReportBuilderContent";

interface CustomReport extends ReportBuilderEditableReport {
  id: number;
  name: string;
  description: string;
  reportType?: string;
  configuration?: {
    fields?: string[];
    filters?: any[];
    outputType?: "table" | "table+chart" | "dashboard";
    chartType?: "bar" | "line" | "pie";
  };
  createdAt?: string;
  updatedAt?: string;
}

type PendingNavigation =
  | { type: "edit"; report: CustomReport }
  | { type: "create" };

export default function ReportBuilder() {
  const [editingReport, setEditingReport] = useState<CustomReport | null>(null);
  const [isReportBuilderDirty, setIsReportBuilderDirty] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] =
    useState<PendingNavigation | null>(null);
  const [formResetSignal, setFormResetSignal] = useState(0);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: customReports } = useQuery<CustomReport[]>({
    queryKey: ["/api/custom-reports"],
  });

  const executeReportMutation = useMutation({
    mutationFn: (reportId: number) =>
      apiRequest(`/api/custom-reports/${reportId}/execute`, "POST"),
    onSuccess: () => {
      toast({ title: "Report executed successfully" });
    },
    onError: () => {
      showErrorToast("Failed to execute report");
    },
  });

  const deleteReportMutation = useMutation({
    mutationFn: (reportId: number) =>
      apiRequest(`/api/custom-reports/${reportId}`, "DELETE"),
    onSuccess: () => {
      toast({ title: "Report deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/custom-reports"] });
      setEditingReport(null);
    },
    onError: () => {
      showErrorToast("Failed to delete report");
    },
  });

  const handleReportSaved = () => {
    setEditingReport(null);
    queryClient.invalidateQueries({ queryKey: ["/api/custom-reports"] });
  };

  const performEditReport = (report: CustomReport) => {
    setEditingReport(report);
  };

  const performCreateNewReport = () => {
    // Move out of edit mode (if any) and clear the form. Bumping the
    // reset signal also clears a half-built create-mode draft.
    setEditingReport(null);
    setFormResetSignal((n) => n + 1);
  };

  const handleEditReport = (report: CustomReport) => {
    // Confirm before discarding unsaved changes when switching to edit a
    // different report. This also fires when the user has a half-built
    // create-mode draft (no `editingReport`, but the form is dirty).
    if (
      isReportBuilderDirty &&
      (!editingReport || editingReport.id !== report.id)
    ) {
      setPendingNavigation({ type: "edit", report });
      setConfirmDiscardOpen(true);
      return;
    }
    performEditReport(report);
  };

  const handleCreateNewReport = () => {
    // Confirm before discarding any unsaved changes — whether the user
    // is editing a saved report or has a half-built new-report draft.
    if (isReportBuilderDirty) {
      setPendingNavigation({ type: "create" });
      setConfirmDiscardOpen(true);
      return;
    }
    performCreateNewReport();
  };

  const confirmDiscard = () => {
    if (pendingNavigation?.type === "edit") {
      performEditReport(pendingNavigation.report);
    } else if (pendingNavigation?.type === "create") {
      performCreateNewReport();
    }
    setPendingNavigation(null);
  };

  return (
    <>
      <div className="space-y-4">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Report Builder
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Create and execute custom reports with dynamic data visualization
          </p>
        </div>

        {/* Existing Reports */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Saved Reports
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.isArray(customReports) &&
                customReports.map((report: CustomReport) => (
                  <Card
                    key={report.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold text-sm">{report.name}</h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteReportMutation.mutate(report.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                        {report.description}
                      </p>
                      <div className="flex justify-between items-center">
                        <Badge variant="outline" className="text-xs">
                          {report.reportType || report.configuration?.outputType || "table"}
                        </Badge>
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditReport(report);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              executeReportMutation.mutate(report.id);
                            }}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}

              {/* Create New Report Card */}
              <Card
                className="border-dashed border-2 cursor-pointer hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
                onClick={handleCreateNewReport}
              >
                <CardContent className="p-4 flex flex-col items-center justify-center h-full min-h-[120px]">
                  <Plus className="h-8 w-8 text-gray-400 dark:text-gray-500 mb-2" />
                  <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                    Create New Report
                  </p>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        {/* Shared Report Builder Form */}
        <ReportBuilderContent
          editingReport={editingReport}
          onReportSaved={handleReportSaved}
          onCancelEdit={() => setEditingReport(null)}
          onDirtyChange={setIsReportBuilderDirty}
          formResetSignal={formResetSignal}
        />

        {/* Discard Confirmation Dialog (unsaved changes in Report Builder).
            Triggered when switching to edit a different report or clicking
            "Create New Report" while a half-built draft exists. */}
        <ConfirmationDialog
          open={confirmDiscardOpen}
          onOpenChange={setConfirmDiscardOpen}
          title="Discard unsaved changes?"
          description={
            pendingNavigation?.type === "create"
              ? "Your current report has unsaved changes. Starting a new report will discard them."
              : "Your current report has unsaved changes. Switching to a different report will discard them."
          }
          confirmLabel={
            pendingNavigation?.type === "create"
              ? "Discard and start new"
              : "Discard and switch"
          }
          cancelLabel="Keep editing"
          onConfirm={confirmDiscard}
          onCancel={() => setPendingNavigation(null)}
          variant="warning"
        />
      </div>
    </>
  );
}
