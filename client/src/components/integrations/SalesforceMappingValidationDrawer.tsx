import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ShieldCheck,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Loader2,
  Eye,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast } from "@/lib/toast-helper";
import { cn } from "@/lib/utils";

interface ValidationIssue {
  severity: "error" | "warning";
  mappingId: number | null;
  cqiEntity: string;
  cqiFieldKey: string;
  sfObjectApiName: string;
  sfFieldApiName: string;
  code: string;
  message: string;
}

interface ValidationReport {
  checkedAt: string;
  entity: string | null;
  mappingCount: number;
  errorCount: number;
  warningCount: number;
  issues: ValidationIssue[];
}

interface PreviewResult {
  updateData: Record<string, unknown>;
  changes: Array<{ field: string; oldValue: unknown; newValue: unknown }>;
  conflicts: Array<{ field: string; cqiValue: unknown; sfValue: unknown; resolvedValue: unknown; resolvedBy: string }>;
  translationErrors: Array<{ field: string; rawValue: unknown; error: string }>;
  sfObjectType: string;
  sfRecordId: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Entity to scope validation to, or 'all' for every entity. Passed
   *  through from the Field Mappings tab's own entity filter so the
   *  drawer's default scope matches what the admin is currently looking
   *  at. */
  defaultEntity?: string;
  getEntityLabel: (entity: string) => string;
}

const SYNCABLE_ENTITIES = ["project", "customer", "user"] as const;

export function SalesforceMappingValidationDrawer({ open, onClose, defaultEntity, getEntityLabel }: Props) {
  const queryClient = useQueryClient();
  const [report, setReport] = useState<ValidationReport | null>(null);

  const [previewEntity, setPreviewEntity] = useState<string>("project");
  const [previewRecordId, setPreviewRecordId] = useState("");
  const [previewDirection, setPreviewDirection] = useState<"inbound" | "outbound">("outbound");
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);

  const validateMutation = useMutation({
    mutationFn: async () => {
      const entity = defaultEntity && defaultEntity !== "all" ? defaultEntity.split(":")[0] : undefined;
      return apiRequest("POST", "/api/admin/salesforce/mappings/validate", { entity });
    },
    onSuccess: (data) => setReport(data.report),
    onError: (err: any) => showErrorToast("Validation Failed", err?.message || "Could not validate mappings"),
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/salesforce/mappings/preview", {
        entity: previewEntity,
        cqiRecordId: previewRecordId,
        direction: previewDirection,
      });
    },
    onSuccess: (data) => setPreviewResult(data.preview),
    onError: (err: any) => {
      setPreviewResult(null);
      showErrorToast("Preview Failed", err?.responseBody?.message || err?.message || "Could not build preview");
    },
  });

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      onClose();
      return;
    }
    if (!report && !validateMutation.isPending) {
      validateMutation.mutate();
    }
  };

  const errorIssues = report?.issues.filter((i) => i.severity === "error") ?? [];
  const warningIssues = report?.issues.filter((i) => i.severity === "warning") ?? [];

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Validate Field Mappings
          </SheetTitle>
          <SheetDescription>
            Static checks plus live Salesforce field checks (via the 24-hour Describe
            cache). Read-only — no data is written or synced by validating.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {validateMutation.isPending ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : report ? (
            <>
              <div className="grid grid-cols-4 gap-3">
                <div className="rounded-lg border p-3 text-center dark:border-gray-700">
                  <div className="text-2xl font-semibold">{report.mappingCount}</div>
                  <div className="text-xs text-muted-foreground">Mappings</div>
                </div>
                <div className="rounded-lg border p-3 text-center border-red-200 dark:border-red-900/50">
                  <div className="text-2xl font-semibold text-red-600 dark:text-red-400">{report.errorCount}</div>
                  <div className="text-xs text-muted-foreground">Errors</div>
                </div>
                <div className="rounded-lg border p-3 text-center border-yellow-200 dark:border-yellow-900/50">
                  <div className="text-2xl font-semibold text-yellow-600 dark:text-yellow-400">{report.warningCount}</div>
                  <div className="text-xs text-muted-foreground">Warnings</div>
                </div>
                <div className="rounded-lg border p-3 text-center border-green-200 dark:border-green-900/50">
                  <div className="text-2xl font-semibold text-green-600 dark:text-green-400">
                    {report.mappingCount - report.errorCount - report.warningCount > 0
                      ? report.mappingCount - errorIssues.length - warningIssues.length
                      : 0}
                  </div>
                  <div className="text-xs text-muted-foreground">Clean</div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => validateMutation.mutate()}
                  disabled={validateMutation.isPending}
                >
                  Re-run Validation
                </Button>
                <span className="text-xs text-muted-foreground">
                  Checked {new Date(report.checkedAt).toLocaleString()}
                </span>
              </div>

              {report.issues.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-500" />
                  <p>No issues found.</p>
                </div>
              ) : (
                <Accordion type="single" collapsible className="space-y-2">
                  {[...errorIssues, ...warningIssues].map((issue, idx) => (
                    <AccordionItem
                      key={`${issue.mappingId ?? "none"}-${issue.code}-${idx}`}
                      value={String(idx)}
                      className="border rounded-lg px-4 dark:border-gray-700"
                    >
                      <AccordionTrigger className="hover:no-underline py-3">
                        <div className="flex items-center gap-3 w-full pr-4 text-left">
                          {issue.severity === "error" ? (
                            <XCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                          ) : (
                            <AlertTriangle className="h-5 w-5 shrink-0 text-yellow-600 dark:text-yellow-400" />
                          )}
                          <div className="flex-1">
                            <div className="text-sm font-medium">
                              {issue.cqiEntity ? getEntityLabel(issue.cqiEntity) : "General"}
                              {issue.cqiFieldKey ? ` · ${issue.cqiFieldKey}` : ""}
                            </div>
                            <div className="text-xs text-muted-foreground">{issue.code}</div>
                          </div>
                          <Badge
                            className={cn(
                              "text-xs",
                              issue.severity === "error"
                                ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                                : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
                            )}
                          >
                            {issue.severity}
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-4 text-sm">
                        {issue.message}
                        {issue.sfObjectApiName && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {issue.sfObjectApiName}
                            {issue.sfFieldApiName ? `.${issue.sfFieldApiName}` : ""}
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  <h4 className="text-sm font-semibold">Preview a Sync (zero-write dry run)</h4>
                </div>
                <p className="text-xs text-muted-foreground">
                  Shows exactly what a real sync would write for one linked record, without
                  writing anything to Salesforce or CriteriaIQ. Only available for entities
                  with a live sync implementation (Project, Customer, User).
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Entity</Label>
                    <Select value={previewEntity} onValueChange={setPreviewEntity}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SYNCABLE_ENTITIES.map((e) => (
                          <SelectItem key={e} value={e}>{getEntityLabel(e)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Record ID</Label>
                    <Input
                      value={previewRecordId}
                      onChange={(e) => setPreviewRecordId(e.target.value)}
                      placeholder="e.g. 42"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Direction</Label>
                    <Select value={previewDirection} onValueChange={(v) => setPreviewDirection(v as "inbound" | "outbound")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="outbound">Outbound (CIQ → SF)</SelectItem>
                        <SelectItem value="inbound">Inbound (SF → CIQ)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => previewMutation.mutate()}
                  disabled={!previewRecordId || previewMutation.isPending}
                >
                  {previewMutation.isPending ? "Building preview..." : "Preview"}
                </Button>

                {previewResult && (
                  <div className="space-y-3 mt-2">
                    {previewResult.translationErrors.length > 0 && (
                      <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded text-red-700 dark:text-red-300 text-xs">
                        {previewResult.translationErrors.length} field(s) would be skipped —
                        strict-mode value translation found no match:{" "}
                        {previewResult.translationErrors.map((e) => e.field).join(", ")}
                      </div>
                    )}
                    {previewResult.changes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No changes — target is already up to date.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-muted-foreground border-b dark:border-gray-700">
                              <th className="py-1 pr-2">Field</th>
                              <th className="py-1 pr-2">Current</th>
                              <th className="py-1">Would become</th>
                            </tr>
                          </thead>
                          <tbody>
                            {previewResult.changes.map((c, i) => (
                              <tr key={i} className="border-b last:border-0 dark:border-gray-800">
                                <td className="py-1 pr-2 font-mono">{c.field}</td>
                                <td className="py-1 pr-2 text-muted-foreground">{String(c.oldValue ?? "—")}</td>
                                <td className="py-1 font-medium">{String(c.newValue ?? "—")}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {previewResult.conflicts.length > 0 && (
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded text-yellow-800 dark:text-yellow-300 text-xs">
                        {previewResult.conflicts.length} conflict(s) detected — resolved by
                        the entity's configured conflict strategy.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
