import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImportUsersDocumentation } from "@/components/accounts/ImportUsersDocumentation";
import {
  Upload, Download, FileSpreadsheet, AlertTriangle, CheckCircle2,
  XCircle, Users, Info, X, ArrowLeft, Loader2, Copy, Check, BookOpen
} from "lucide-react";

interface ImportUsersDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
}

interface ParsedUser {
  rowNumber: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  title: string;
  department: string;
  region: string;
  timezone: string;
  isActive: boolean;
  receiveEmails: boolean;
  errors: string[];
  warnings: string[];
  isDuplicate: boolean;
}

interface ImportResult {
  success: boolean;
  created: number;
  failed: number;
  skipped: number;
  defaultPassword: string;
  results: {
    rowNumber: number;
    email: string;
    status: "created" | "failed" | "skipped";
    reason?: string;
  }[];
}

const VALID_ROLES = [
  "Admin", "Manager", "se", "CX", "Engineer", "Support", "Services",
  "Sales", "Product", "Customer", "Guest", "Partner"
];

const VALID_DEPARTMENTS = [
  "C-Level", "HR", "Finance", "Marketing", "Sales", "Operations",
  "Engineering", "Security", "Network", "R&D", "Support", "IT",
  "CX", "Services", "Product", "Other"
];

const VALID_REGIONS = [
  "North America", "South America", "Europe", "Asia Pacific",
  "Middle East & Africa", "Global"
];

const REQUIRED_COLUMNS = ["firstName", "lastName", "email", "role", "title", "department", "region"];
const OPTIONAL_COLUMNS = ["timezone", "isActive", "receiveEmails"];
const ALL_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];

const COLUMN_ALIASES: Record<string, string> = {
  "first_name": "firstName",
  "first name": "firstName",
  "firstname": "firstName",
  "last_name": "lastName",
  "last name": "lastName",
  "lastname": "lastName",
  "email_address": "email",
  "emailaddress": "email",
  "email address": "email",
  "job_title": "title",
  "jobtitle": "title",
  "job title": "title",
  "time_zone": "timezone",
  "time zone": "timezone",
  "is_active": "isActive",
  "active": "isActive",
  "receive_emails": "receiveEmails",
  "receiveemails": "receiveEmails",
  "receive emails": "receiveEmails",
};

type ImportStep = "upload" | "preview" | "results";

export default function ImportUsersDialog({ isOpen, onClose, onImportComplete }: ImportUsersDialogProps) {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();

  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ImportStep>("upload");
  const [parsedUsers, setParsedUsers] = useState<ParsedUser[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [skipWelcomeEmails, setSkipWelcomeEmails] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [showDocumentation, setShowDocumentation] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [selectedAccessCodeId, setSelectedAccessCodeId] = useState<number | null>(null);
  const [selectedEmailTemplateId, setSelectedEmailTemplateId] = useState<number | null>(null);

  const { data: existingUsers = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
    enabled: isOpen,
  });

  const { data: roles = [] } = useQuery<any[]>({
    queryKey: ["/api/roles"],
    enabled: isOpen,
  });

  // Fetch active access codes when on the preview step
  const { data: accessCodesData = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/access-codes"],
    enabled: step === "preview",
  });

  // Fetch email templates when on the preview step and not skipping welcome emails
  const { data: emailTemplatesData = [] } = useQuery<any[]>({
    queryKey: ["/api/email-templates/for-announcements"],
    enabled: step === "preview" && !skipWelcomeEmails,
  });

  const validRoleNames = roles.length > 0
    ? roles.map((r: any) => r.name)
    : VALID_ROLES;

  const resetState = () => {
    setStep("upload");
    setParsedUsers([]);
    setImportResult(null);
    setSkipWelcomeEmails(false);
    setFileName("");
    setPasswordCopied(false);
    setSelectedRows(new Set());
    setSelectedAccessCodeId(null);
    setSelectedEmailTemplateId(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const normalizeColumnName = (header: string): string => {
    const cleaned = header.trim().toLowerCase().replace(/[^a-z0-9_ ]/g, "");
    if (COLUMN_ALIASES[cleaned]) return COLUMN_ALIASES[cleaned];
    const camelCase = cleaned.replace(/[_ ](.)/g, (_, c) => c.toUpperCase());
    if (ALL_COLUMNS.includes(camelCase)) return camelCase;
    return cleaned;
  };

  const parseCSV = (content: string) => {
    const lines = content.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) {
      showErrorToast(t("accounts.importUsers.errors.invalidCsvTitle"), t("accounts.importUsers.errors.invalidCsvHeaderAndData"));
      return;
    }

    const headerLine = lines[0];
    if (headerLine.startsWith("##") || headerLine.startsWith("INSTRUCTIONS")) {
      const dataStartIdx = lines.findIndex((l, i) => i > 0 && !l.startsWith("##") && !l.startsWith("#") && l.includes(","));
      if (dataStartIdx === -1) {
        showErrorToast(t("accounts.importUsers.errors.invalidCsvTitle"), t("accounts.importUsers.errors.invalidCsvNoDataAfterInstructions"));
        return;
      }
      lines.splice(0, dataStartIdx);
    }

    const headers = parseCSVLine(lines[0]).map(normalizeColumnName);

    const missingRequired = REQUIRED_COLUMNS.filter((col) => !headers.includes(col));
    if (missingRequired.length > 0) {
      showErrorToast(t("accounts.importUsers.errors.missingColumnsTitle"), t("accounts.importUsers.errors.missingColumnsBody", { columns: missingRequired.join(", ") }));
      return;
    }

    const existingEmails = new Set(existingUsers.map((u: any) => u.email?.toLowerCase()));
    const seenEmails = new Set<string>();

    const parsed: ParsedUser[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.every((v) => !v.trim())) continue;

      const row: Record<string, string> = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] || "";
      });

      const errors: string[] = [];
      const warnings: string[] = [];

      if (!row.firstName?.trim()) errors.push(t("accounts.importUsers.errors.firstNameRequired"));
      if (!row.lastName?.trim()) errors.push(t("accounts.importUsers.errors.lastNameRequired"));
      if (!row.email?.trim()) errors.push(t("accounts.importUsers.errors.emailRequired"));
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email.trim())) errors.push(t("accounts.importUsers.errors.invalidEmail"));
      if (!row.role?.trim()) errors.push(t("accounts.importUsers.errors.roleRequired"));
      else if (!validRoleNames.some((r: string) => r.toLowerCase() === row.role.trim().toLowerCase()))
        errors.push(t("accounts.importUsers.errors.invalidRole", { value: row.role, valid: validRoleNames.join(", ") }));
      if (!row.title?.trim()) errors.push(t("accounts.importUsers.errors.titleRequired"));
      if (!row.department?.trim()) errors.push(t("accounts.importUsers.errors.departmentRequired"));
      else if (!VALID_DEPARTMENTS.some((d) => d.toLowerCase() === row.department.trim().toLowerCase()))
        errors.push(t("accounts.importUsers.errors.invalidDepartment", { value: row.department, valid: VALID_DEPARTMENTS.join(", ") }));
      if (!row.region?.trim()) errors.push(t("accounts.importUsers.errors.regionRequired"));
      else if (!VALID_REGIONS.some((r) => r.toLowerCase() === row.region.trim().toLowerCase()))
        errors.push(t("accounts.importUsers.errors.invalidRegion", { value: row.region, valid: VALID_REGIONS.join(", ") }));

      const email = row.email?.trim().toLowerCase();
      let isDuplicate = false;
      if (email && existingEmails.has(email)) {
        errors.push(t("accounts.importUsers.errors.emailExistsSystem"));
        isDuplicate = true;
      }
      if (email && seenEmails.has(email)) {
        errors.push(t("accounts.importUsers.errors.duplicateEmailFile"));
        isDuplicate = true;
      }
      if (email) seenEmails.add(email);

      const matchRole = (val: string) => {
        const found = validRoleNames.find((r: string) => r.toLowerCase() === val.trim().toLowerCase());
        return found || val.trim();
      };

      const matchDepartment = (val: string) => {
        const found = VALID_DEPARTMENTS.find((d) => d.toLowerCase() === val.trim().toLowerCase());
        return found || val.trim();
      };

      const matchRegion = (val: string) => {
        const found = VALID_REGIONS.find((r) => r.toLowerCase() === val.trim().toLowerCase());
        return found || val.trim();
      };

      parsed.push({
        rowNumber: i + 1,
        firstName: row.firstName?.trim() || "",
        lastName: row.lastName?.trim() || "",
        email: email || "",
        role: matchRole(row.role || ""),
        title: row.title?.trim() || "",
        department: matchDepartment(row.department || ""),
        region: matchRegion(row.region || ""),
        timezone: row.timezone?.trim() || "America/New_York",
        isActive: row.isActive ? row.isActive.trim().toLowerCase() !== "false" && row.isActive.trim() !== "0" : true,
        receiveEmails: row.receiveEmails ? row.receiveEmails.trim().toLowerCase() !== "false" && row.receiveEmails.trim() !== "0" : true,
        errors,
        warnings,
        isDuplicate,
      });
    }

    setParsedUsers(parsed);
    const validRowNumbers = new Set(parsed.filter(u => u.errors.length === 0).map(u => u.rowNumber));
    setSelectedRows(validRowNumbers);
    setStep("preview");
  };

  const handleFileSelect = (file: File) => {
    if (!file.name.endsWith(".csv")) {
      showErrorToast(t("accounts.importUsers.errors.invalidFileTitle"), t("accounts.importUsers.errors.invalidFileBody"));
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      parseCSV(content);
    };
    reader.readAsText(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [existingUsers, validRoleNames]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const downloadTemplate = () => {
    const instructions = [
      "## CriteriaIQ User Import Template",
      "## Instructions:",
      `## Required columns: ${REQUIRED_COLUMNS.join(", ")}`,
      `## Optional columns: ${OPTIONAL_COLUMNS.join(", ")}`,
      "##",
      `## Role options: ${validRoleNames.join(", ")}`,
      `## Department options: ${VALID_DEPARTMENTS.join(", ")}`,
      `## Region options: ${VALID_REGIONS.join(", ")}`,
      "## Timezone: Use IANA timezone format (e.g., America/New_York, Europe/London, Asia/Tokyo)",
      "## isActive: true or false (default: true)",
      "## receiveEmails: true or false (default: true)",
      "##",
      "## Notes:",
      "## - Specializations (Solutions & Stakeholder Types) will default to 'None'",
      "##   Update each user's specializations after import via their profile",
      "## - All imported users will receive a system-generated default password",
      "## - Users will be required to change their password on first login",
      "## - Remove these instruction lines (##) before importing, or leave them - they will be skipped",
      "##",
    ];

    const header = ALL_COLUMNS.join(",");
    const sampleRow = [
      "John",
      "Smith",
      "john.smith@company.com",
      "se",
      "Solutions Engineer",
      "Engineering",
      "North America",
      "America/New_York",
      "true",
      "true",
    ].join(",");

    const csvContent = [...instructions, header, sampleRow].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "criteriaiq_user_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importMutation = useMutation({
    mutationFn: async (data: {
      users: ParsedUser[];
      skipWelcomeEmails: boolean;
      selectedRows: Set<number>;
      accessCodeId: number | null;
      emailTemplateId: number | null;
    }) => {
      // `apiRequest` returns the parsed JSON body directly — calling
      // `.json()` on it would throw and silently bounce the mutation
      // into its error branch (task #754).
      return await apiRequest("POST", "/api/users/import", {
        users: data.users
          .filter((u) => u.errors.length === 0 && data.selectedRows.has(u.rowNumber))
          .map((u) => ({
            firstName: u.firstName,
            lastName: u.lastName,
            email: u.email,
            role: u.role,
            title: u.title,
            department: u.department,
            region: u.region,
            timezone: u.timezone,
            isActive: u.isActive,
            receiveEmails: u.receiveEmails,
          })),
        skipWelcomeEmails: data.skipWelcomeEmails,
        accessCodeId: data.accessCodeId,
        emailTemplateId: data.emailTemplateId,
      });
    },
    onSuccess: (data: ImportResult) => {
      setImportResult(data);
      setStep("results");
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      if (data.created > 0) {
        showSuccessToast(t("accounts.importUsers.errors.importCompleteTitle"), t("accounts.importUsers.errors.importCompleteBody", { count: data.created }));
        onImportComplete?.();
      }
    },
    onError: (error: any) => {
      showErrorToast(t("accounts.importUsers.errors.importFailedTitle"), error.message || t("accounts.importUsers.errors.importFailedBody"));
    },
  });

  const validUsers = parsedUsers.filter((u) => u.errors.length === 0);
  const invalidUsers = parsedUsers.filter((u) => u.errors.length > 0);
  const selectedCount = validUsers.filter(u => selectedRows.has(u.rowNumber)).length;
  const allValidSelected = validUsers.length > 0 && validUsers.every(u => selectedRows.has(u.rowNumber));

  // Access code capacity check
  const selectedCode = accessCodesData.find((c: any) => c.id === selectedAccessCodeId);
  const remainingUses = selectedCode
    ? selectedCode.maxUses - (selectedCode.currentUses ?? selectedCode.usesCount ?? 0)
    : null;
  const capacityWarning = selectedCode !== undefined && remainingUses !== null && remainingUses < selectedCount;

  const toggleRow = (rowNumber: number) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  };

  const toggleAll = () => {
    if (allValidSelected) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(validUsers.map(u => u.rowNumber)));
    }
  };

  const copyPassword = () => {
    if (importResult?.defaultPassword) {
      navigator.clipboard.writeText(importResult.defaultPassword);
      setPasswordCopied(true);
      setTimeout(() => setPasswordCopied(false), 2000);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-[750px] w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            {t("accounts.importUsers.title")}
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && t("accounts.importUsers.stepUploadDescription")}
            {step === "preview" && t("accounts.importUsers.stepPreviewDescription")}
            {step === "results" && t("accounts.importUsers.stepResultsDescription")}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                isDragging
                  ? "border-primary bg-primary/5 dark:bg-primary/10"
                  : "border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500"
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 text-gray-400 dark:text-gray-500" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("accounts.importUsers.dragDropPrompt")}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t("accounts.importUsers.onlyCsv")}
              </p>
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
                  {t("accounts.importUsers.downloadCsvTemplate")}
                </Button>
                <Button size="sm" onClick={() => setShowDocumentation(true)}>
                  <BookOpen className="h-4 w-4 mr-2" />
                  {t("accounts.importUsers.howToImport")}
                </Button>
              </div>
              <Button variant="outline" onClick={handleClose}>
                {t("common.cancel")}
              </Button>
            </div>

            <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <AlertDescription className="text-blue-800 dark:text-blue-200 text-xs">
                <strong>{t("accounts.importUsers.templateIncludesTitle")}</strong> {t("accounts.importUsers.templateIncludesBody")}
              </AlertDescription>
            </Alert>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {t("accounts.importUsers.selectedCount", { count: selectedCount, total: validUsers.length })}
                </Badge>
                {invalidUsers.length > 0 && (
                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
                    <XCircle className="h-3 w-3 mr-1" />
                    {t("accounts.importUsers.errorCount", { count: invalidUsers.length })}
                  </Badge>
                )}
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400">{fileName}</span>
            </div>

            {invalidUsers.length > 0 && (
              <Alert className="bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800">
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                <AlertDescription className="text-red-800 dark:text-red-200 text-xs">
                  {t("accounts.importUsers.errorRowsBanner", { count: invalidUsers.length })}
                </AlertDescription>
              </Alert>
            )}

            <ScrollArea className="max-h-[350px] border rounded-lg">
              <div className="min-w-[600px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 z-10">
                    <tr>
                      <th className="p-2 w-8">
                        <Checkbox
                          checked={allValidSelected}
                          onCheckedChange={toggleAll}
                          disabled={validUsers.length === 0}
                          aria-label={t("accounts.importUsers.selectAllValidUsers")}
                        />
                      </th>
                      <th className="text-left p-2 font-medium text-gray-600 dark:text-gray-400">{t("accounts.importUsers.tableHeaderRow")}</th>
                      <th className="text-left p-2 font-medium text-gray-600 dark:text-gray-400">{t("accounts.importUsers.tableHeaderStatus")}</th>
                      <th className="text-left p-2 font-medium text-gray-600 dark:text-gray-400">{t("accounts.importUsers.tableHeaderName")}</th>
                      <th className="text-left p-2 font-medium text-gray-600 dark:text-gray-400">{t("accounts.importUsers.tableHeaderEmail")}</th>
                      <th className="text-left p-2 font-medium text-gray-600 dark:text-gray-400">{t("accounts.importUsers.tableHeaderRole")}</th>
                      <th className="text-left p-2 font-medium text-gray-600 dark:text-gray-400">{t("accounts.importUsers.tableHeaderDepartment")}</th>
                      <th className="text-left p-2 font-medium text-gray-600 dark:text-gray-400">{t("accounts.importUsers.tableHeaderIssues")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedUsers.map((user) => {
                      const hasErrors = user.errors.length > 0;
                      const isSelected = selectedRows.has(user.rowNumber);
                      return (
                        <tr
                          key={user.rowNumber}
                          className={`border-t ${
                            hasErrors
                              ? "bg-red-50/50 dark:bg-red-900/10 opacity-60"
                              : isSelected
                                ? "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                                : "opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                          }`}
                        >
                          <td className="p-2">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleRow(user.rowNumber)}
                              disabled={hasErrors}
                              aria-label={t("accounts.importUsers.selectUserAriaLabel", { firstName: user.firstName, lastName: user.lastName })}
                            />
                          </td>
                          <td className="p-2 text-gray-500 dark:text-gray-400">{user.rowNumber}</td>
                          <td className="p-2">
                            {hasErrors ? (
                              <XCircle className="h-4 w-4 text-red-500" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            )}
                          </td>
                          <td className="p-2 font-medium dark:text-gray-200">{user.firstName} {user.lastName}</td>
                          <td className="p-2 text-gray-600 dark:text-gray-400">{user.email}</td>
                          <td className="p-2">
                            <Badge variant="outline" className="text-[10px]">{user.role}</Badge>
                          </td>
                          <td className="p-2 text-gray-600 dark:text-gray-400">{user.department}</td>
                          <td className="p-2">
                            {hasErrors && (
                              <div className="space-y-0.5">
                                {user.errors.map((err, idx) => (
                                  <p key={idx} className="text-red-600 dark:text-red-400 text-[10px]">{err}</p>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </ScrollArea>

            <Alert className="bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
              <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertDescription className="text-amber-800 dark:text-amber-200 text-xs">
                <strong>{t("accounts.importUsers.specializationsReminderTitle")}</strong> {t("accounts.importUsers.specializationsReminderBody")}
              </AlertDescription>
            </Alert>

            {/* Access Code Selector */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("accounts.importUsers.accessCodeLabel")}{" "}
                <span className="text-muted-foreground font-normal text-xs">
                  ({t("accounts.importUsers.optionalLabel")})
                </span>
              </Label>
              <Select
                value={selectedAccessCodeId?.toString() ?? ""}
                onValueChange={(v) => setSelectedAccessCodeId(v ? Number(v) : null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("accounts.importUsers.accessCodePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t("accounts.importUsers.accessCodePlaceholder")}</SelectItem>
                  {accessCodesData
                    .filter((c: any) => c.isActive)
                    .map((c: any) => {
                      const remaining = c.maxUses - (c.currentUses ?? c.usesCount ?? 0);
                      return (
                        <SelectItem key={c.id} value={c.id.toString()}>
                          {c.code}{c.description ? ` — ${c.description}` : ""} ({remaining} {t("accounts.importUsers.usesRemaining")})
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("accounts.importUsers.accessCodeDesc")}
              </p>
              {capacityWarning && (
                <Alert className="py-2 border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <AlertDescription className="text-xs text-amber-800 dark:text-amber-200">
                    {t("accounts.importUsers.accessCodeCapacityWarning", {
                      remaining: remainingUses,
                      count: selectedCount,
                    })}
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Email Template Selector — only shown when not skipping emails */}
            {!skipWelcomeEmails && (
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t("accounts.importUsers.emailTemplateLabel")}
                </Label>
                <Select
                  value={selectedEmailTemplateId?.toString() ?? ""}
                  onValueChange={(v) => setSelectedEmailTemplateId(v ? Number(v) : null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("accounts.importUsers.emailTemplatePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t("accounts.importUsers.emailTemplatePlaceholder")}</SelectItem>
                    {emailTemplatesData.map((tmpl: any) => (
                      <SelectItem key={tmpl.id} value={tmpl.id.toString()}>
                        {tmpl.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedEmailTemplateId && (
                  <p className="text-xs text-muted-foreground">
                    {t("accounts.importUsers.emailTemplateSubjectPreview")}:{" "}
                    {emailTemplatesData.find((tmpl: any) => tmpl.id === selectedEmailTemplateId)?.subject ?? ""}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="skip-welcome-emails-import"
                  checked={skipWelcomeEmails}
                  onCheckedChange={(checked) => setSkipWelcomeEmails(!!checked)}
                />
                <Label htmlFor="skip-welcome-emails-import" className="text-sm text-gray-600 dark:text-gray-400">
                  {t("accounts.importUsers.skipWelcomeEmailsLabel")}
                </Label>
              </div>

              <div className="flex items-center justify-between">
                <Button variant="outline" onClick={() => { setStep("upload"); setParsedUsers([]); setFileName(""); setSelectedRows(new Set()); }}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  {t("accounts.importUsers.backToFile")}
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleClose}>
                    {t("common.cancel")}
                  </Button>
                  <Button
                    onClick={() => importMutation.mutate({ users: parsedUsers, skipWelcomeEmails, selectedRows, accessCodeId: selectedAccessCodeId, emailTemplateId: selectedEmailTemplateId })}
                    disabled={selectedCount === 0 || importMutation.isPending}
                  >
                    {importMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        {t("accounts.importUsers.importing")}
                      </>
                    ) : (
                      <>
                        <Users className="h-4 w-4 mr-1" />
                        {t("accounts.importUsers.importNUsers", { count: selectedCount })}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === "results" && importResult && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {importResult.created > 0 && (
                <Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {t("accounts.importUsers.createdBadge", { count: importResult.created })}
                </Badge>
              )}
              {importResult.failed > 0 && (
                <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800">
                  <XCircle className="h-3 w-3 mr-1" />
                  {t("accounts.importUsers.failedBadge", { count: importResult.failed })}
                </Badge>
              )}
              {importResult.skipped > 0 && (
                <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {t("accounts.importUsers.skippedBadge", { count: importResult.skipped })}
                </Badge>
              )}
            </div>

            {importResult.created > 0 && (
              <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <AlertDescription className="text-blue-800 dark:text-blue-200">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">{t("accounts.importUsers.defaultPasswordLabel")}</p>
                    <div className="flex items-center gap-2">
                      <code className="bg-white dark:bg-gray-800 px-3 py-1.5 rounded border border-blue-200 dark:border-blue-700 font-mono text-sm select-all">
                        {importResult.defaultPassword}
                      </code>
                      <Button variant="ghost" size="sm" className="h-8 px-2" onClick={copyPassword}>
                        {passwordCopied ? (
                          <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      {t("accounts.importUsers.defaultPasswordHelp")}
                    </p>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <ScrollArea className="max-h-[250px] border rounded-lg">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="text-left p-2 font-medium text-gray-600 dark:text-gray-400">{t("accounts.importUsers.tableHeaderRow")}</th>
                    <th className="text-left p-2 font-medium text-gray-600 dark:text-gray-400">{t("accounts.importUsers.tableHeaderEmail")}</th>
                    <th className="text-left p-2 font-medium text-gray-600 dark:text-gray-400">{t("accounts.importUsers.tableHeaderStatus")}</th>
                    <th className="text-left p-2 font-medium text-gray-600 dark:text-gray-400">{t("accounts.importUsers.tableHeaderDetails")}</th>
                  </tr>
                </thead>
                <tbody>
                  {importResult.results.map((result, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="p-2 text-gray-500 dark:text-gray-400">{result.rowNumber}</td>
                      <td className="p-2 dark:text-gray-300">{result.email}</td>
                      <td className="p-2">
                        {result.status === "created" && (
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px]">{t("accounts.importUsers.statusCreated")}</Badge>
                        )}
                        {result.status === "failed" && (
                          <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[10px]">{t("accounts.importUsers.statusFailed")}</Badge>
                        )}
                        {result.status === "skipped" && (
                          <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 text-[10px]">{t("accounts.importUsers.statusSkipped")}</Badge>
                        )}
                      </td>
                      <td className="p-2 text-gray-500 dark:text-gray-400">{result.reason || t("accounts.importUsers.successDefault")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>

            <div className="flex justify-end pt-2 border-t border-gray-200 dark:border-gray-700">
              <Button onClick={handleClose}>
                <X className="h-4 w-4 mr-1" />
                {t("accounts.importUsers.close")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>

      <ImportUsersDocumentation
        isOpen={showDocumentation}
        onClose={() => setShowDocumentation(false)}
        validRoles={validRoleNames}
        validDepartments={VALID_DEPARTMENTS}
        validRegions={VALID_REGIONS}
      />
    </Dialog>
  );
}
