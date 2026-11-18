/**
 * CRM record id backfill (Admin > Integrations > Salesforce > Sync History).
 *
 * Fills the CRM Opportunity ID and Account ID on projects that have a
 * Salesforce Evaluation link but no Opportunity id, by reading the
 * Evaluation's Opportunity lookup (the field mapped to "CRM Opportunity ID")
 * and that Opportunity's Account. "Preview" is a dry run; "Fill ids" writes
 * after a confirmation. Runs on the admin's own Salesforce connection.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table";
import { sortRows, useSortState } from "@/lib/sorting";
import { Eye, KeyRound, Loader2, Play } from "lucide-react";
import { useValidationRecordLabel } from "@/hooks/use-validation-record-label";

type ItemStatus = "would_fill" | "filled" | "skipped";
type SkipReason =
  | "no_evaluation_id"
  | "evaluation_not_found"
  | "no_opportunity_on_evaluation"
  | "invalid_opportunity_id"
  | "already_filled";

interface BackfillItem {
  projectId: number;
  projectName: string;
  evaluationId: string | null;
  opportunityId: string | null;
  accountId: string | null;
  status: ItemStatus;
  reason?: SkipReason;
}

interface BackfillReport {
  dryRun: boolean;
  evaluationObject: string;
  lookupField: string;
  candidates: number;
  filled: number;
  wouldFill: number;
  skipped: number;
  items: BackfillItem[];
}

const STATUS_CLASS: Record<ItemStatus, string> = {
  would_fill: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  filled: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  skipped: "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

export function SalesforceCrmIdBackfillCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const record = useValidationRecordLabel();
  const [report, setReport] = useState<BackfillReport | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { sortConfig, handleSort } = useSortState();

  const runMutation = useMutation({
    mutationFn: (dryRun: boolean) =>
      apiRequest("POST", "/api/admin/salesforce/crm-id-backfill", { dryRun }) as Promise<{ report: BackfillReport }>,
    onSuccess: (data) => {
      setReport(data.report);
      if (!data.report.dryRun) {
        showSuccessToast(
          t("integrations.salesforce.crmBackfill.doneTitle"),
          t("integrations.salesforce.crmBackfill.doneBody", { filled: data.report.filled, skipped: data.report.skipped }),
        );
        queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      }
    },
    onError: (error: Error) => showErrorToast(t("integrations.salesforce.crmBackfill.failed"), error.message),
  });

  const statusLabel = (item: BackfillItem) =>
    item.status === "skipped" && item.reason
      ? t(`integrations.salesforce.crmBackfill.reason.${item.reason}`, { record })
      : t(`integrations.salesforce.crmBackfill.status.${item.status}`);

  const pendingDryRun = runMutation.isPending ? runMutation.variables : null;

  return (
    <Card className="mb-4">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <KeyRound className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              {t("integrations.salesforce.crmBackfill.title")}
            </CardTitle>
            <CardDescription>{t("integrations.salesforce.crmBackfill.description", { record })}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => runMutation.mutate(true)} disabled={runMutation.isPending}>
              {pendingDryRun === true ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
              {t("integrations.salesforce.crmBackfill.preview")}
            </Button>
            <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={runMutation.isPending}>
              {pendingDryRun === false ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              {t("integrations.salesforce.crmBackfill.run")}
            </Button>
          </div>
        </div>
      </CardHeader>
      {report ? (
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {report.dryRun
              ? t("integrations.salesforce.crmBackfill.summaryDryRun", {
                  wouldFill: report.wouldFill,
                  skipped: report.skipped,
                  candidates: report.candidates,
                })
              : t("integrations.salesforce.crmBackfill.summaryRun", {
                  filled: report.filled,
                  skipped: report.skipped,
                  candidates: report.candidates,
                })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("integrations.salesforce.crmBackfill.lookupUsed", {
              object: report.evaluationObject,
              field: report.lookupField,
            })}
          </p>
          {report.items.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t("integrations.salesforce.crmBackfill.empty")}</p>
          ) : (
            <div className="max-h-[420px] overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 dark:bg-gray-800/50">
                    <SortableTableHead sortKey="projectName" sortConfig={sortConfig} onSort={handleSort}>
                      {t("integrations.salesforce.crmBackfill.colProject")}
                    </SortableTableHead>
                    <SortableTableHead sortKey="evaluationId" sortConfig={sortConfig} onSort={handleSort}>
                      {t("integrations.salesforce.crmBackfill.colEvaluation", { record })}
                    </SortableTableHead>
                    <SortableTableHead sortKey="opportunityId" sortConfig={sortConfig} onSort={handleSort}>
                      {t("integrations.salesforce.crmBackfill.colOpportunity")}
                    </SortableTableHead>
                    <SortableTableHead sortKey="accountId" sortConfig={sortConfig} onSort={handleSort}>
                      {t("integrations.salesforce.crmBackfill.colAccount")}
                    </SortableTableHead>
                    <SortableTableHead sortKey="result" sortConfig={sortConfig} onSort={handleSort}>
                      {t("integrations.salesforce.crmBackfill.colResult")}
                    </SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortRows(report.items, sortConfig, {
                    projectName: (item) => item.projectName,
                    evaluationId: (item) => item.evaluationId,
                    opportunityId: (item) => item.opportunityId,
                    accountId: (item) => item.accountId,
                    result: (item) => statusLabel(item),
                  }).map((item) => (
                    <TableRow key={item.projectId}>
                      <TableCell className="text-sm text-gray-900 dark:text-gray-100">{item.projectName}</TableCell>
                      <TableCell className="font-mono text-xs text-gray-700 dark:text-gray-300">{item.evaluationId ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-gray-700 dark:text-gray-300">{item.opportunityId ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-gray-700 dark:text-gray-300">{item.accountId ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${STATUS_CLASS[item.status]}`}>
                          {statusLabel(item)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      ) : null}
      <ConfirmationDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("integrations.salesforce.crmBackfill.confirmTitle")}
        description={t("integrations.salesforce.crmBackfill.confirmBody")}
        confirmLabel={t("integrations.salesforce.crmBackfill.confirmLabel")}
        variant="warning"
        onConfirm={() => {
          setConfirmOpen(false);
          runMutation.mutate(false);
        }}
      />
    </Card>
  );
}
