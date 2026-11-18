import { useState, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  X,
  Download,
  BookOpen,
  CircleCheckBig,
  AlertTriangle,
  Info,
  Loader2,
  ArrowLeft,
  Eye,
  SquareCheck,
  SquareMinus,
} from "lucide-react";
import { CriteriaImportDocumentation } from "./CriteriaImportDocumentation";

interface CsvImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ImportResult {
  success: boolean;
  message: string;
  details?: {
    solutionsCreated: number;
    solutionsUpdated: number;
    solutionsSkipped: number;
    componentsCreated: number;
    componentsUpdated: number;
    componentsSkipped: number;
    valueMappingsCreated: number;
    valueMappingsUpdated: number;
    valueMappingsSkipped: number;
    criteriaCreated: number;
    criteriaUpdated: number;
    criteriaSkipped: number;
    outcomesCreated: number;
    outcomesUpdated: number;
    outcomesSkipped: number;
    actionsCreated: number;
    actionsUpdated: number;
    actionsSkipped: number;
    errors: string[];
  };
}

interface PreviewRow {
  rowIndex: number;
  category: string;
  name: string;
  description: string;
  solutions: string;
  abbreviation: string;
  tags: string;
  component: string;
  status: "create" | "update" | "skip" | "error";
  errors: string[];
}

type DialogStep = "upload" | "preview" | "importing" | "results";

const statusConfig = {
  create: { label: "New", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300", icon: CheckCircle2 },
  update: { label: "Update", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300", icon: Info },
  skip: { label: "Skip", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300", icon: AlertTriangle },
  error: { label: "Error", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300", icon: AlertCircle },
};

const categoryColors: Record<string, string> = {
  Solution: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  Component: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  "Value Mapping": "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  Criteria: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  Outcome: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  Action: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
};

export function CsvImportDialog({ isOpen, onClose }: CsvImportDialogProps) {
  const { user } = useAuth();
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [step, setStep] = useState<DialogStep>("upload");
  const [isProcessing, setIsProcessing] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showDocumentation, setShowDocumentation] = useState(false);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  const isAdmin = (user as any)?.role === "Admin";

  const handleFileSelect = useCallback((file: File) => {
    if (file.type === "text/csv" || file.name.endsWith(".csv")) {
      setSelectedFile(file);
      setImportResult(null);
      setStep("upload");
      setPreviewRows([]);
      setSelectedRows(new Set());
    } else {
      showErrorToast("Invalid file type", "Please select a CSV file.");
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handlePreview = async () => {
    if (!selectedFile || !isAdmin) return;

    setIsProcessing(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append("csvFile", selectedFile);

      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 15, 90));
      }, 150);

      const response = await fetch("/api/success-criteria/import/preview", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Preview failed");
      }

      const result = await response.json();
      setPreviewRows(result.rows);

      const importable = result.rows.filter((r: PreviewRow) => r.status !== 'error');
      setSelectedRows(new Set(importable.map((r: PreviewRow) => r.rowIndex)));

      setStep("preview");
    } catch (error) {
      console.error("Preview error:", error);
      showErrorToast("Preview Error", error instanceof Error ? error.message : "Failed to preview CSV file");
    } finally {
      setIsProcessing(false);
      setUploadProgress(0);
    }
  };

  const handleImport = async () => {
    if (!selectedFile || !isAdmin) return;

    setStep("importing");
    setIsProcessing(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append("csvFile", selectedFile);
      formData.append("selectedRows", JSON.stringify(Array.from(selectedRows)));

      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const response = await fetch("/api/success-criteria/import", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Import failed");
      }

      const result: ImportResult = await response.json();
      setImportResult(result);
      setStep("results");

      if (result.success) {
        showSuccessToast("Import Successful", result.message);

        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        queryClient.invalidateQueries({ queryKey: ["/api/components"] });
        queryClient.invalidateQueries({ queryKey: ["/api/value-mappings"] });
        queryClient.invalidateQueries({ queryKey: ["/api/criteria"] });
        queryClient.invalidateQueries({ queryKey: ["/api/outcomes"] });
        queryClient.invalidateQueries({ queryKey: ["/api/actions"] });
      } else {
        showErrorToast("Import Failed", result.message);
      }
    } catch (error) {
      console.error("Import error:", error);
      showErrorToast("Import Error", error instanceof Error ? error.message : "Failed to import CSV file");
      setImportResult({
        success: false,
        message: error instanceof Error ? error.message : "Import failed",
      });
      setStep("results");
    } finally {
      setIsProcessing(false);
      setUploadProgress(0);
    }
  };

  const downloadTemplate = () => {
    // Sample data is intentionally product-agnostic. It exercises every
    // category (Solution, Component, Value Mapping, Criteria, Outcome,
    // Action) and every column behavior (single-solution link, multi-
    // solution link, Component link, empty-solution shared row) so an
    // admin can see the schema in one glance without re-reading the
    // docs. Tags reference real entries from SYSTEM_TAGS in
    // client/src/lib/tagUtils.ts so the sample import doesn't trip on
    // unknown-tag warnings against a fresh database.
    const csvContent = `Category,Name,Description,Solutions,Abbreviation,Tags,Component
"Solution","Identity Governance","Centralized identity lifecycle, access certification, and policy enforcement","","IG","IGA,Compliance",""
"Solution","Endpoint Protection","Endpoint security with threat detection, response, and posture management","","EP","Endpoint,ITDR",""
"Solution","Cloud Security","Cloud workload protection with posture management, data security, and runtime monitoring","","CS","SaaS,DSPM",""
"Component","Access Certification","Periodic review and recertification of user access rights","Identity Governance","","",""
"Component","Data Classifier","Machine-learning-powered data classification module","Cloud Security","","",""
"Value Mapping","Risk Reduction","Quantify and reduce organizational risk exposure across identity, endpoint, and cloud","Identity Governance,Endpoint Protection,Cloud Security","","",""
"Value Mapping","Compliance Assurance","Demonstrate continuous compliance with frameworks like SOC 2, HIPAA, and ISO 27001","Identity Governance,Cloud Security","","",""
"Criteria","Privileged Access Review","Confirm all privileged accounts are reviewed quarterly with documented sign-off","Identity Governance","","PAM,Audit","Access Certification"
"Criteria","Sensitive Data Discovery","Identify and classify sensitive data across managed cloud workloads","Cloud Security","","Classification,DLP","Data Classifier"
"Criteria","Endpoint Threat Detection","Detect, contain, and respond to threats on managed endpoints within 15 minutes","Endpoint Protection","","Endpoint,ITDR",""
"Criteria","Shared Success Metric","Applies to all current and future solutions — used for cross-cutting validation","","","",""
"Outcome","Privileged Access Recertified","All privileged accounts have a documented quarterly review on file","Identity Governance","","",""
"Outcome","Sensitive Data Catalogued","All discovered PII, PHI, and confidential data is properly tagged in the catalog","Cloud Security","","",""
"Outcome","Mean Time to Respond Under 15m","Endpoint threats are contained within the documented SLA window","Endpoint Protection","","",""
"Action","Schedule Quarterly Access Review","Configure recurring access certification campaigns with approver assignments","Identity Governance","","",""
"Action","Deploy Data Classification Rules","Roll out automated data classification policies across in-scope cloud workloads","Cloud Security","","",""
"Action","Tune Endpoint Detection Rules","Calibrate detection rules to minimize false positives without missing threats","Endpoint Protection","","",""`;

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'validation_criteria_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const resetDialog = () => {
    setSelectedFile(null);
    setImportResult(null);
    setStep("upload");
    setPreviewRows([]);
    setSelectedRows(new Set());
    setIsProcessing(false);
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClose = () => {
    resetDialog();
    onClose();
  };

  const toggleRowSelection = (rowIndex: number) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowIndex)) {
        next.delete(rowIndex);
      } else {
        next.add(rowIndex);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    const importableRows = previewRows.filter(r => r.status !== 'error');
    const allSelected = importableRows.every(r => selectedRows.has(r.rowIndex));
    if (allSelected) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(importableRows.map(r => r.rowIndex)));
    }
  };

  const importableRows = previewRows.filter(r => r.status !== 'error');
  const errorRows = previewRows.filter(r => r.status === 'error');
  const selectedCount = Array.from(selectedRows).filter(idx => importableRows.some(r => r.rowIndex === idx)).length;

  if (!isAdmin) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CircleCheckBig className="h-5 w-5" />
              Import Validation Criteria
            </DialogTitle>
            <DialogDescription>
              Import Solutions, Components, Criteria, Outcomes, and Actions from CSV file
            </DialogDescription>
          </DialogHeader>
          <Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            <AlertDescription className="text-red-800 dark:text-red-200">
              Only administrators can import validation criteria data.
            </AlertDescription>
          </Alert>
          <div className="flex justify-end">
            <Button variant="outline" onClick={handleClose}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const getDialogDescription = () => {
    switch (step) {
      case "upload": return selectedFile ? "File selected. Click Preview to review before importing." : "Upload a CSV file to bulk import Solutions, Components, Criteria, Outcomes, and Actions.";
      case "preview": return `Review ${previewRows.length} rows. Select which ones to import, then confirm.`;
      case "importing": return "Importing selected rows...";
      case "results": return "Import complete. Review the results below.";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className={`${step === "preview" ? "sm:max-w-[900px]" : "sm:max-w-[600px]"} max-h-[85vh] overflow-hidden flex flex-col`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CircleCheckBig className="h-5 w-5" />
            Import Validation Criteria
          </DialogTitle>
          <DialogDescription>
            {getDialogDescription()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1">
          {step === "upload" && !isProcessing && (
            <>
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                  isDragging
                    ? "border-primary bg-primary/5 dark:bg-primary/10"
                    : selectedFile
                    ? "border-green-400 bg-green-50 dark:border-green-600 dark:bg-green-900/20"
                    : "border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500"
                }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                {selectedFile ? (
                  <>
                    <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-500 dark:text-green-400" />
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {(selectedFile.size / 1024).toFixed(1)} KB — Click to change file
                    </p>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 text-gray-400 dark:text-gray-500" />
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Drag and drop a CSV file here, or click to browse
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Only .csv files are supported
                    </p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                    e.target.value = "";
                  }}
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={downloadTemplate}>
                    <Download className="h-4 w-4 mr-2" />
                    Download CSV Template
                  </Button>
                  <Button size="sm" onClick={() => setShowDocumentation(true)}>
                    <BookOpen className="h-4 w-4 mr-2" />
                    How to Import
                  </Button>
                </div>
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
              </div>

              <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <AlertDescription className="text-blue-800 dark:text-blue-200 text-xs">
                  <strong>Template includes:</strong> Sample rows for all six categories (Solutions, Components, Value Mappings, Criteria, Outcomes, Actions) with proper formatting, tag examples, and component linking. Duplicates are automatically detected and skipped.
                </AlertDescription>
              </Alert>
            </>
          )}

          {step === "upload" && isProcessing && (
            <div className="space-y-4 py-4">
              <div className="text-center">
                <Loader2 className="h-10 w-10 mx-auto mb-3 text-blue-500 animate-spin" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Analyzing your CSV file...</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Validating {selectedFile?.name}</p>
              </div>
              <Progress value={uploadProgress} className="w-full" />
              <p className="text-xs text-center text-gray-500 dark:text-gray-400">{uploadProgress}% complete</p>
            </div>
          )}

          {step === "upload" && !isProcessing && selectedFile && (
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              <Button variant="outline" onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
                Clear File
              </Button>
              <Button onClick={handlePreview}>
                <Eye className="h-4 w-4 mr-1" />
                Preview Import
              </Button>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  {previewRows.filter(r => r.status === 'create').length > 0 && (
                    <Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      {previewRows.filter(r => r.status === 'create').length} New
                    </Badge>
                  )}
                  {previewRows.filter(r => r.status === 'update').length > 0 && (
                    <Badge className="bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
                      <Info className="h-3 w-3 mr-1" />
                      {previewRows.filter(r => r.status === 'update').length} Updates
                    </Badge>
                  )}
                  {previewRows.filter(r => r.status === 'skip').length > 0 && (
                    <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {previewRows.filter(r => r.status === 'skip').length} Unchanged
                    </Badge>
                  )}
                  {errorRows.length > 0 && (
                    <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      {errorRows.length} Error{errorRows.length !== 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {selectedCount} of {importableRows.length} selected
                </div>
              </div>

              <ScrollArea className="max-h-[400px] border rounded-lg dark:border-gray-700">
                <div className="min-w-[700px]">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 z-10">
                      <tr>
                        <th className="text-left p-2 w-8">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button onClick={toggleSelectAll} className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
                                  {importableRows.length > 0 && importableRows.every(r => selectedRows.has(r.rowIndex)) ? (
                                    <SquareCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                  ) : selectedCount > 0 ? (
                                    <SquareMinus className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                  ) : (
                                    <Checkbox checked={false} className="h-4 w-4" />
                                  )}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Select/deselect all</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </th>
                        <th className="text-left p-2 font-medium text-gray-600 dark:text-gray-400 w-10">Row</th>
                        <th className="text-left p-2 font-medium text-gray-600 dark:text-gray-400">Category</th>
                        <th className="text-left p-2 font-medium text-gray-600 dark:text-gray-400">Name</th>
                        <th className="text-left p-2 font-medium text-gray-600 dark:text-gray-400">Solutions</th>
                        <th className="text-center p-2 font-medium text-gray-600 dark:text-gray-400">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row) => {
                        const isError = row.status === 'error';
                        const isSelected = selectedRows.has(row.rowIndex);
                        const config = statusConfig[row.status];
                        const StatusIcon = config.icon;

                        return (
                          <tr
                            key={row.rowIndex}
                            className={`border-t border-gray-100 dark:border-gray-700 ${
                              isError ? "bg-red-50/50 dark:bg-red-900/10" :
                              !isSelected ? "opacity-50" : ""
                            }`}
                          >
                            <td className="p-2">
                              {!isError ? (
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleRowSelection(row.rowIndex)}
                                  className="h-4 w-4"
                                />
                              ) : (
                                <AlertCircle className="h-4 w-4 text-red-400" />
                              )}
                            </td>
                            <td className="p-2 text-gray-400 dark:text-gray-500 font-mono">{row.rowIndex}</td>
                            <td className="p-2">
                              <Badge className={`${categoryColors[row.category] || "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"} text-[10px]`}>
                                {row.category}
                              </Badge>
                            </td>
                            <td className="p-2">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-gray-900 dark:text-gray-100 truncate block max-w-[200px] cursor-default">{row.name}</span>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom" className="max-w-[300px]">
                                    <p className="font-medium">{row.name}</p>
                                    <p className="text-xs text-gray-400 mt-1">{row.description || "No description"}</p>
                                    {row.component && <p className="text-xs text-indigo-400 mt-1">Component: {row.component}</p>}
                                    {row.tags && <p className="text-xs text-gray-400 mt-1">Tags: {row.tags}</p>}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </td>
                            <td className="p-2">
                              <span className="text-gray-500 dark:text-gray-400 truncate block max-w-[150px]">
                                {row.solutions || "All"}
                              </span>
                            </td>
                            <td className="p-2 text-center">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="inline-flex items-center">
                                      <Badge className={`${config.color} text-[10px]`}>
                                        <StatusIcon className="h-3 w-3 mr-0.5" />
                                        {config.label}
                                      </Badge>
                                    </div>
                                  </TooltipTrigger>
                                  {row.errors.length > 0 && (
                                    <TooltipContent side="left" className="max-w-[300px]">
                                      <div className="space-y-1">
                                        {row.errors.map((err, i) => (
                                          <p key={i} className="text-xs text-red-300">{err}</p>
                                        ))}
                                      </div>
                                    </TooltipContent>
                                  )}
                                </Tooltip>
                              </TooltipProvider>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </ScrollArea>

              {errorRows.length > 0 && (
                <Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
                  <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  <AlertDescription className="text-red-800 dark:text-red-200 text-xs">
                    <strong>{errorRows.length} row{errorRows.length !== 1 ? "s have" : " has"} errors</strong> and cannot be imported. Fix your CSV file and re-upload, or proceed with the valid rows.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
                <Button variant="outline" size="sm" onClick={() => { setStep("upload"); setPreviewRows([]); setSelectedRows(new Set()); }}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back to File
                </Button>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleImport}
                    disabled={selectedCount === 0}
                  >
                    <Upload className="h-4 w-4 mr-1" />
                    Import {selectedCount} Row{selectedCount !== 1 ? "s" : ""}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {step === "importing" && (
            <div className="space-y-4 py-4">
              <div className="text-center">
                <Loader2 className="h-10 w-10 mx-auto mb-3 text-blue-500 animate-spin" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Importing {selectedCount} selected rows...</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Processing {selectedFile?.name}</p>
              </div>
              <Progress value={uploadProgress} className="w-full" />
              <p className="text-xs text-center text-gray-500 dark:text-gray-400">{uploadProgress}% complete</p>
            </div>
          )}

          {step === "results" && importResult && (
            <div className="space-y-4">
              <Alert className={importResult.success
                ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
                : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
              }>
                {importResult.success ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                )}
                <AlertDescription className={importResult.success
                  ? "text-green-800 dark:text-green-200"
                  : "text-red-800 dark:text-red-200"
                }>
                  {importResult.message}
                </AlertDescription>
              </Alert>

              {importResult.details && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    {(importResult.details.solutionsCreated + (importResult.details.componentsCreated || 0) + (importResult.details.valueMappingsCreated || 0) + importResult.details.criteriaCreated + importResult.details.outcomesCreated + importResult.details.actionsCreated) > 0 && (
                      <Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        {importResult.details.solutionsCreated + (importResult.details.componentsCreated || 0) + (importResult.details.valueMappingsCreated || 0) + importResult.details.criteriaCreated + importResult.details.outcomesCreated + importResult.details.actionsCreated} Created
                      </Badge>
                    )}
                    {(importResult.details.solutionsUpdated + (importResult.details.componentsUpdated || 0) + (importResult.details.valueMappingsUpdated || 0) + importResult.details.criteriaUpdated + importResult.details.outcomesUpdated + importResult.details.actionsUpdated) > 0 && (
                      <Badge className="bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
                        <Info className="h-3 w-3 mr-1" />
                        {importResult.details.solutionsUpdated + (importResult.details.componentsUpdated || 0) + (importResult.details.valueMappingsUpdated || 0) + importResult.details.criteriaUpdated + importResult.details.outcomesUpdated + importResult.details.actionsUpdated} Updated
                      </Badge>
                    )}
                    {(importResult.details.solutionsSkipped + (importResult.details.componentsSkipped || 0) + (importResult.details.valueMappingsSkipped || 0) + importResult.details.criteriaSkipped + importResult.details.outcomesSkipped + importResult.details.actionsSkipped) > 0 && (
                      <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        {importResult.details.solutionsSkipped + (importResult.details.componentsSkipped || 0) + (importResult.details.valueMappingsSkipped || 0) + importResult.details.criteriaSkipped + importResult.details.outcomesSkipped + importResult.details.actionsSkipped} Skipped
                      </Badge>
                    )}
                    {importResult.details.errors.length > 0 && (
                      <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        {importResult.details.errors.length} Error{importResult.details.errors.length !== 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>

                  <ScrollArea className="max-h-[300px] border rounded-lg dark:border-gray-700">
                    <div className="min-w-[500px]">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 z-10">
                          <tr>
                            <th className="text-left p-2.5 font-medium text-gray-600 dark:text-gray-400">Category</th>
                            <th className="text-center p-2.5 font-medium text-gray-600 dark:text-gray-400">Created</th>
                            <th className="text-center p-2.5 font-medium text-gray-600 dark:text-gray-400">Updated</th>
                            <th className="text-center p-2.5 font-medium text-gray-600 dark:text-gray-400">Skipped</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            { name: "Solutions", created: importResult.details.solutionsCreated, updated: importResult.details.solutionsUpdated, skipped: importResult.details.solutionsSkipped, color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
                            { name: "Components", created: importResult.details.componentsCreated || 0, updated: importResult.details.componentsUpdated || 0, skipped: importResult.details.componentsSkipped || 0, color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300" },
                            { name: "Value Mappings", created: importResult.details.valueMappingsCreated || 0, updated: importResult.details.valueMappingsUpdated || 0, skipped: importResult.details.valueMappingsSkipped || 0, color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300" },
                            { name: "Criteria", created: importResult.details.criteriaCreated, updated: importResult.details.criteriaUpdated, skipped: importResult.details.criteriaSkipped, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
                            { name: "Outcomes", created: importResult.details.outcomesCreated, updated: importResult.details.outcomesUpdated, skipped: importResult.details.outcomesSkipped, color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
                            { name: "Actions", created: importResult.details.actionsCreated, updated: importResult.details.actionsUpdated, skipped: importResult.details.actionsSkipped, color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
                          ].map((row) => (
                            <tr key={row.name} className="border-t border-gray-100 dark:border-gray-700">
                              <td className="p-2.5">
                                <Badge className={`${row.color} text-[10px]`}>{row.name}</Badge>
                              </td>
                              <td className="p-2.5 text-center">
                                <span className={row.created > 0 ? "font-medium text-green-600 dark:text-green-400" : "text-gray-400 dark:text-gray-500"}>
                                  {row.created}
                                </span>
                              </td>
                              <td className="p-2.5 text-center">
                                <span className={row.updated > 0 ? "font-medium text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-gray-500"}>
                                  {row.updated}
                                </span>
                              </td>
                              <td className="p-2.5 text-center">
                                <span className={row.skipped > 0 ? "font-medium text-amber-600 dark:text-amber-400" : "text-gray-400 dark:text-gray-500"}>
                                  {row.skipped}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </ScrollArea>

                  {importResult.details.errors.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-medium text-red-700 dark:text-red-400">Errors:</h4>
                      <ScrollArea className="max-h-[120px]">
                        <div className="bg-red-50 dark:bg-red-900/20 p-2.5 rounded-md border border-red-200 dark:border-red-800 space-y-1">
                          {importResult.details.errors.map((error, index) => (
                            <div key={index} className="flex items-start gap-1.5 text-xs text-red-700 dark:text-red-300">
                              <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
                              <span>{error}</span>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end pt-2 border-t border-gray-200 dark:border-gray-700">
                <Button onClick={handleClose}>
                  <X className="h-4 w-4 mr-1" />
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>

      <CriteriaImportDocumentation
        isOpen={showDocumentation}
        onClose={() => setShowDocumentation(false)}
        onDownloadTemplate={downloadTemplate}
      />
    </Dialog>
  );
}
