// Admin › Monitoring & Audit › Backup & Restore (Admin only). Export streams
// the whole database as a download; import uploads a backup, shows what it
// would replace, and restores only after the admin types the confirmation
// word. "Restore with masking" scrubs people, secrets and logs on the way in,
// and "Download masked backup" writes an already-scrubbed file, both for a
// sandbox or demo install. See docs/features/backup-restore.md.
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseBackup,
  Download,
  EyeOff,
  Info,
  KeyRound,
  Loader2,
  LogIn,
  RotateCcw,
  ShieldAlert,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { SortableTableHead } from "@/components/ui/sortable-table";
import { apiRequest } from "@/lib/queryClient";
import { sortRows, useSortState } from "@/lib/sorting";

interface BackupInfo {
  appVersion: string;
  schema: { lastMigration: string; migrationCount: number };
  tableCount: number;
  totalRows: number;
  maxUploadMb: number;
}
interface Issue {
  code: string;
  params?: Record<string, string | number>;
}
interface Preview {
  header: { appVersion: string; createdAt: string; schema: { lastMigration: string }; masked?: boolean };
  tables: { table: string; backupRows: number; currentRows: number }[];
  errors: Issue[];
  warnings: Issue[];
  adminsInBackup: { email: string; name: string }[];
  importerInBackup: boolean;
  keyMatches: boolean;
}

const CONFIRM_WORD = "RESTORE";
const ERROR_CODES = new Set([
  "invalid_file",
  "too_large",
  "empty_upload",
  "upload_expired",
  "confirmation_required",
  "not_restorable",
  "restore_failed",
  "server_error",
]);

function errorCodeOf(body: unknown): string {
  const code = (body as { code?: unknown } | null)?.code;
  return typeof code === "string" && ERROR_CODES.has(code) ? code : "server_error";
}

export function BackupRestoreTab() {
  const { t } = useTranslation();
  const { sortConfig: tableSort, handleSort: handleTableSort } = useSortState();
  const [info, setInfo] = useState<BackupInfo | null>(null);
  const [infoFailed, setInfoFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ token: string; preview: Preview; fileName: string } | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [mask, setMask] = useState(false);
  const [restored, setRestored] = useState<"plain" | "masked" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadInfo = useCallback(async () => {
    try {
      setInfo((await apiRequest("GET", "/api/admin/backup/info")) as BackupInfo);
      setInfoFailed(false);
    } catch {
      setInfoFailed(true);
    }
  }, []);
  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);

  const errorText = (code: string, detail?: string) =>
    t(`systemHealth.backup.errors.${code}`, { detail: detail ?? "" });

  // A plain navigation lets the browser stream the download to disk instead
  // of holding the whole database in page memory.
  const onExport = (masked: boolean) =>
    window.location.assign(masked ? "/api/admin/backup/export?masked=1" : "/api/admin/backup/export");

  const onFile = async (file: File) => {
    setUploadError(null);
    setRestoreError(null);
    setPending(null);
    setConfirmText("");
    setUploading(true);
    try {
      const res = await fetch("/api/admin/backup/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) },
        body: file,
      });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const code = errorCodeOf(body);
        const detail = (body as { message?: unknown } | null)?.message;
        setUploadError(errorText(code, typeof detail === "string" ? detail : undefined));
        return;
      }
      const data = body as { token: string; preview: Preview };
      setPending({ token: data.token, preview: data.preview, fileName: file.name });
    } catch {
      setUploadError(errorText("server_error"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onCancel = async () => {
    if (pending) await apiRequest("DELETE", `/api/admin/backup/import/${pending.token}`).catch(() => undefined);
    setPending(null);
    setConfirmText("");
    setRestoreError(null);
  };

  const onRestore = async () => {
    if (!pending) return;
    setRestoring(true);
    setRestoreError(null);
    try {
      await apiRequest("POST", `/api/admin/backup/import/${pending.token}/apply`, { confirmation: confirmText, mask });
      setRestored(mask ? "masked" : "plain");
    } catch (err) {
      const details = (err as { details?: unknown } | null)?.details ?? null;
      const code = errorCodeOf(details);
      const detail = (details as { message?: unknown } | null)?.message;
      setRestoreError(errorText(code, typeof detail === "string" ? detail : undefined));
    } finally {
      setRestoring(false);
    }
  };

  const issueText = (i: Issue) => t(`systemHealth.backup.issues.${i.code}`, i.params ?? {});
  const fmt = (n: number) => n.toLocaleString();

  if (restored) {
    return (
      <Card className="border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200">
            <CheckCircle2 className="h-5 w-5" />
            {t("systemHealth.backup.restoredTitle")}
          </CardTitle>
          <CardDescription className="text-emerald-900 dark:text-emerald-100">
            {restored === "masked" ? t("systemHealth.backup.restoredMaskedBody") : t("systemHealth.backup.restoredBody")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => window.location.assign("/")}>
            <LogIn className="mr-1.5 h-4 w-4" />
            {t("systemHealth.backup.goToSignIn")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const blocked = !!pending && pending.preview.errors.length > 0;
  const changedTables = pending
    ? sortRows(
        pending.preview.tables.filter((r) => r.backupRows > 0 || r.currentRows > 0),
        tableSort,
        { table: (r) => r.table, currentRows: (r) => r.currentRows, backupRows: (r) => r.backupRows },
      )
    : [];

  return (
    <div className="space-y-4">
      <div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-100">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-1.5">
          <p>{t("systemHealth.backup.introIncluded")}</p>
          <p>{t("systemHealth.backup.introExcluded")}</p>
          <p className="flex items-start gap-1.5">
            <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t("systemHealth.backup.introKey")}
          </p>
          <p className="flex items-start gap-1.5">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t("systemHealth.backup.introSensitive")}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4" />
            {t("systemHealth.backup.exportTitle")}
          </CardTitle>
          <CardDescription>{t("systemHealth.backup.exportBody")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {infoFailed && <p className="text-sm text-red-600 dark:text-red-400">{t("systemHealth.backup.infoFailed")}</p>}
          {info && (
            <p className="text-xs text-muted-foreground">
              {t("systemHealth.backup.exportSummary", {
                version: info.appVersion,
                schema: info.schema.lastMigration,
                tables: fmt(info.tableCount),
                rows: fmt(info.totalRows),
              })}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => onExport(false)} data-testid="backup-export">
              <DatabaseBackup className="mr-1.5 h-4 w-4" />
              {t("systemHealth.backup.exportButton")}
            </Button>
            <Button variant="outline" onClick={() => onExport(true)} data-testid="backup-export-masked">
              <EyeOff className="mr-1.5 h-4 w-4" />
              {t("systemHealth.backup.exportMaskedButton")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("systemHealth.backup.exportMaskedHelp")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4" />
            {t("systemHealth.backup.importTitle")}
          </CardTitle>
          <CardDescription>{t("systemHealth.backup.importBody")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {info && (
            <p className="text-xs text-muted-foreground">
              {t("systemHealth.backup.importLimit", { mb: fmt(info.maxUploadMb) })}
            </p>
          )}
          <div className="flex items-start gap-2 rounded-md border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-950">
            <Checkbox
              id="backup-mask"
              checked={mask}
              onCheckedChange={(v) => setMask(v === true)}
              disabled={uploading || restoring}
              className="mt-0.5"
              data-testid="backup-mask"
            />
            <div className="space-y-1">
              <label
                htmlFor="backup-mask"
                className="flex cursor-pointer items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-gray-100"
              >
                <EyeOff className="h-3.5 w-3.5" />
                {t("systemHealth.backup.maskLabel")}
              </label>
              <p className="text-xs text-gray-600 dark:text-gray-400">{t("systemHealth.backup.maskHelp")}</p>
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".gz,.cqbackup,application/gzip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading || restoring}>
            {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
            {uploading ? t("systemHealth.backup.checkingFile") : t("systemHealth.backup.chooseFile")}
          </Button>
          {uploadError && (
            <p className="flex items-start gap-1.5 text-sm text-red-600 dark:text-red-400">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {uploadError}
            </p>
          )}

          {pending && (
            <div className="space-y-4 border-t border-gray-200 pt-4 dark:border-gray-700">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {t("systemHealth.backup.previewFile", {
                  file: pending.fileName,
                  version: pending.preview.header.appVersion,
                  date: new Date(pending.preview.header.createdAt).toLocaleString(),
                })}
              </p>
              {pending.preview.header.masked && (
                <p className="flex items-start gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                  <EyeOff className="mt-0.5 h-4 w-4 shrink-0" />
                  {t("systemHealth.backup.previewMasked")}
                </p>
              )}

              {pending.preview.errors.map((e, i) => (
                <div
                  key={`e${i}`}
                  className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
                >
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {issueText(e)}
                </div>
              ))}
              {pending.preview.warnings.map((w, i) => (
                <div
                  key={`w${i}`}
                  className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {issueText(w)}
                </div>
              ))}

              {pending.preview.adminsInBackup.length > 0 && (
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  <div className="font-medium">{t("systemHealth.backup.adminsInBackup")}</div>
                  <ul className="ml-5 list-disc">
                    {pending.preview.adminsInBackup.map((a) => (
                      <li key={a.email}>
                        {a.name} ({a.email})
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="max-h-80 overflow-y-auto rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-950">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    <tr>
                      <SortableTableHead sortKey="table" sortConfig={tableSort} onSort={handleTableSort} className="h-auto px-3 py-2 text-xs uppercase">
                        {t("systemHealth.backup.colTable")}
                      </SortableTableHead>
                      <SortableTableHead sortKey="currentRows" sortConfig={tableSort} onSort={handleTableSort} align="right" className="h-auto px-3 py-2 text-xs uppercase">
                        {t("systemHealth.backup.colCurrent")}
                      </SortableTableHead>
                      <SortableTableHead sortKey="backupRows" sortConfig={tableSort} onSort={handleTableSort} align="right" className="h-auto px-3 py-2 text-xs uppercase">
                        {t("systemHealth.backup.colBackup")}
                      </SortableTableHead>
                    </tr>
                  </thead>
                  <tbody>
                    {changedTables.map((r) => (
                      <tr key={r.table} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="px-3 py-1.5 font-mono text-xs text-gray-800 dark:text-gray-200">{r.table}</td>
                        <td className="px-3 py-1.5 text-right text-gray-600 dark:text-gray-400">{fmt(r.currentRows)}</td>
                        <td className="px-3 py-1.5 text-right text-gray-900 dark:text-gray-100">{fmt(r.backupRows)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!blocked && (
                <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/30">
                  <p className="flex items-start gap-2 text-sm font-medium text-red-800 dark:text-red-200">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    {t("systemHealth.backup.confirmWarning")}
                  </p>
                  <label className="text-xs text-red-800 dark:text-red-200" htmlFor="backup-confirm">
                    {t("systemHealth.backup.confirmLabel", { word: CONFIRM_WORD })}
                  </label>
                  <Input
                    id="backup-confirm"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={CONFIRM_WORD}
                    className="max-w-xs"
                    autoComplete="off"
                    disabled={restoring}
                  />
                </div>
              )}
              {restoreError && (
                <p className="flex items-start gap-1.5 text-sm text-red-600 dark:text-red-400">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {restoreError}
                </p>
              )}
              <div className="flex items-center gap-2">
                {!blocked && (
                  <Button variant="destructive" onClick={onRestore} disabled={restoring || confirmText !== CONFIRM_WORD}>
                    {restoring ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1.5 h-4 w-4" />}
                    {restoring
                      ? t("systemHealth.backup.restoring")
                      : mask
                        ? t("systemHealth.backup.restoreMaskedButton")
                        : t("systemHealth.backup.restoreButton")}
                  </Button>
                )}
                <Button variant="ghost" onClick={onCancel} disabled={restoring}>
                  <X className="mr-1.5 h-4 w-4" />
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
