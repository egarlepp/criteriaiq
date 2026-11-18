import { useState, Fragment } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useSystemHealthCategoryQuery } from "./useSystemHealthCategoryQuery";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Cloud,
  Image,
  FileText,
  ArrowUpRight,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { HealthFreshnessIndicator } from "./HealthFreshnessIndicator";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table";
import { sortRows, useSortState, useUrlSortState } from "@/lib/sorting";

interface StorageHealthData {
  status: "ok" | "warning" | "error";
  lastChecked: string;
  message: string;
  objectStorage: {
    status: "connected" | "disconnected" | "not_configured";
    bucketName: string | null;
    activeProvider?: string;
    configSource?: string;
  };
  attachments: {
    totalCount: number;
    totalSizeBytes: number;
    totalSizeFormatted: string;
    byCategory: Array<{
      category: string;
      count: number;
      sizeBytes: number;
    }>;
  };
  logos: {
    companyLogosCount: number;
    customerLogosCount: number;
  };
  pathSizes?: Array<{
    label: string;
    pathPattern: string;
    totalSizeBytes: number;
    totalSizeFormatted: string;
    fileCount?: number;
  }>;
  // Files-DB-side truth — bytes actually present in uploaded_files. Null
  // when the `db` provider isn't initialized (cloud / local-disk installs).
  filesDbStats?: {
    dbName: string | null;
    totalCount: number;
    totalSizeBytes: number;
    totalSizeFormatted: string;
    byPrefix: Array<{
      prefix: string;
      count: number;
      sizeBytes: number;
      sizeFormatted: string;
    }>;
  } | null;
}

interface StorageDbConfig {
  provider: string;
  enabled: boolean | null;
  gcsBucketName?: string | null;
  gcsKeyJson?: string | null;
  awsRegion?: string | null;
  awsBucketName?: string | null;
  awsAccessKeyId?: string | null;
  awsSecretAccessKey?: string | null;
  azureAccountName?: string | null;
  azureContainerName?: string | null;
  azureAccountKey?: string | null;
  azureSasToken?: string | null;
}

interface StorageConfigApiResponse {
  dbConfig: StorageDbConfig | null;
  activeProvider: string;
  configSource: "db" | "env" | "local";
}

function providerLabel(p: string) {
  switch (p) {
    case "gcs": return "Google Cloud Storage";
    case "aws": return "AWS S3";
    case "azure": return "Azure Blob";
    case "db": return "Database";
    default: return "Local Disk";
  }
}

// Storage Path Conventions rows. `label` is also the key the server uses in
// pathSizes and /api/admin/storage/path-files, so it is not translated here.
const PATH_CONVENTIONS: Array<{ label: string; path: string; fixedSize: string | null; expandable: boolean }> = [
  { label: "Account Documents",    path: `accounts/{accountId}/documents/{filename}`,      fixedSize: null,              expandable: true },
  { label: "General Documents",    path: `system/documents/{userId}/{filename}`,           fixedSize: null,              expandable: true },
  { label: "Customer Logos",       path: `accounts/{accountId}/logo/{filename}`,           fixedSize: null,              expandable: true },
  { label: "Email Design Assets",  path: `system/email-assets/{filename}`,                 fixedSize: null,              expandable: true },
  { label: "Flight Deck Images",   path: `system/flight-deck/{filename}`,                  fixedSize: null,              expandable: true },
  { label: "Solution Icons",       path: `system/solution-icons/{filename}`,               fixedSize: null,              expandable: true },
  { label: "Rich-Text Images",     path: `system/rich-text/{filename}`,                    fixedSize: null,              expandable: true },
  { label: "Support (account)",    path: `accounts/{customerId}/support-attachments/{filename}`, fixedSize: null,        expandable: true },
  { label: "Support (general)",    path: `system/support-attachments/{filename}`,          fixedSize: null,              expandable: true },
  { label: "Quarantine",           path: "attached_assets/quarantine/ (local only)",       fixedSize: "N/A — temporary", expandable: false },
];

interface UploadedFileSummary {
  objectKey: string;
  sizeBytes: number;
  mimeType: string | null;
  uploadedAt: string | null;
}

function formatBytesShared(bytes: number): string {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function FileListSubTable({
  files,
  isLoading,
  showFullKey,
}: {
  files: UploadedFileSummary[];
  isLoading: boolean;
  showFullKey: boolean;
}) {
  const { t } = useTranslation();
  // Local (not URL) sort: several drill-downs can be open at once.
  const { sortConfig, handleSort } = useSortState();
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading files…
      </div>
    );
  }
  if (files.length === 0) {
    return (
      <div className="py-3 text-xs italic text-muted-foreground">No files yet.</div>
    );
  }
  return (
    <div className="rounded-md border bg-muted/30 dark:bg-muted/10 px-3 py-2">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHead sortKey="objectKey" sortConfig={sortConfig} onSort={handleSort} className="h-8 py-1 text-xs">
              {showFullKey ? t("systemHealth.storage.colObjectKey") : t("systemHealth.storage.colFilename")}
            </SortableTableHead>
            <SortableTableHead sortKey="sizeBytes" sortConfig={sortConfig} onSort={handleSort} align="right" className="h-8 py-1 text-xs">
              {t("systemHealth.storage.colSize")}
            </SortableTableHead>
            <SortableTableHead sortKey="uploadedAt" sortConfig={sortConfig} onSort={handleSort} align="right" className="h-8 py-1 text-xs">
              {t("systemHealth.storage.colUploaded")}
            </SortableTableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortRows(files, sortConfig, {
            objectKey: (f) => (showFullKey ? f.objectKey : f.objectKey.split("/").pop() ?? f.objectKey),
            sizeBytes: (f) => f.sizeBytes,
            uploadedAt: (f) => (f.uploadedAt ? new Date(f.uploadedAt) : null),
          }).map((f) => {
            const display = showFullKey ? f.objectKey : f.objectKey.split("/").pop() ?? f.objectKey;
            return (
              <TableRow key={f.objectKey}>
                <TableCell className="font-mono text-xs py-1.5" title={f.objectKey}>{display}</TableCell>
                <TableCell className="text-right text-xs py-1.5">{formatBytesShared(f.sizeBytes)}</TableCell>
                <TableCell className="text-right text-xs text-muted-foreground py-1.5">
                  {f.uploadedAt ? new Date(f.uploadedAt).toLocaleDateString() : "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function StorageHealthTab() {
  const { t } = useTranslation();
  const [pathSort, handlePathSort] = useUrlSortState("storagePaths");
  const [prefixSort, handlePrefixSort] = useUrlSortState("storagePrefixes");
  const [categorySort, handleCategorySort] = useUrlSortState("storageCategories");
  // Per-row expansion state for the two drill-down tables. We key by label
  // / prefix string so the maps are stable across re-renders.
  const [expandedPathLabels, setExpandedPathLabels] = useState<Set<string>>(new Set());
  const [expandedFilesDbPrefixes, setExpandedFilesDbPrefixes] = useState<Set<string>>(new Set());

  const togglePathLabel = (label: string) =>
    setExpandedPathLabels(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  const toggleFilesDbPrefix = (prefix: string) =>
    setExpandedFilesDbPrefixes(prev => {
      const next = new Set(prev);
      next.has(prefix) ? next.delete(prefix) : next.add(prefix);
      return next;
    });

  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useSystemHealthCategoryQuery<StorageHealthData>({
    queryKey: ["system-health-storage"],
    queryFn: async () => {
      const response = await fetch("/api/system/health/storage");
      if (!response.ok) throw new Error("Failed to fetch storage health");
      return response.json();
    },
    refetchInterval: 60000,
  });

  // Read-only: the editable Provider Setup form lives on its own page
  // (Configuration → System Settings → Storage Providers). This tab keeps
  // only a status mirror.
  const { data: configData, isLoading: configLoading } = useQuery<StorageConfigApiResponse>({
    queryKey: ["storage-config"],
    queryFn: async () => {
      const response = await fetch("/api/admin/storage/config");
      if (!response.ok) throw new Error("Failed to fetch storage config");
      return response.json();
    },
  });

  const getStatusBadge = (status: "ok" | "warning" | "error") => {
    switch (status) {
      case "ok":
        return (
          <Badge variant="outline" className="bg-green-50 dark:bg-green-900/20 text-green-700 border-green-200 dark:border-green-800">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Connected
          </Badge>
        );
      case "warning":
        return (
          <Badge variant="outline" className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Warning
          </Badge>
        );
      case "error":
        return (
          <Badge variant="outline" className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Disconnected
          </Badge>
        );
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
            <AlertTriangle className="h-5 w-5" />
            <span>Failed to load storage health data.</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Status Overview ── */}
      <Card>
        <CardHeader className="relative">
          <div className="absolute top-4 right-4 flex items-center gap-3">
            {getStatusBadge(data.status)}
            <HealthFreshnessIndicator
              dataUpdatedAt={dataUpdatedAt}
              isFetching={isFetching}
              onRefresh={() => refetch()}
              testIdPrefix="storage-health"
              lastCheckedIso={data.lastChecked}
            />
          </div>
          <div className="flex items-center gap-2">
            <HardDrive className="h-6 w-6 text-blue-600" />
            <CardTitle className="text-2xl font-bold">Storage Health</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            Monitor object storage, documents, and asset management
          </p>
        </CardHeader>

        <div className="grid grid-cols-3 gap-4 px-4 pb-4 pt-0">
          <Card className="relative overflow-hidden bg-blue-50/80 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <Cloud className="h-24 w-24 opacity-10 text-blue-600" />
            </div>
            <CardContent className="relative p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Cloud className="w-5 h-5 text-blue-700" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Object Storage</h3>
              </div>
              <div className="text-2xl font-bold text-blue-600">
                {data.objectStorage.activeProvider
                  ? providerLabel(data.objectStorage.activeProvider)
                  : data.objectStorage.status === "connected"
                  ? data.objectStorage.bucketName || "Connected"
                  : "Local Storage"}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {data.objectStorage.configSource
                  ? `config: ${data.objectStorage.configSource}`
                  : data.objectStorage.status === "connected"
                  ? "cloud storage active"
                  : "storage status"}
              </p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden bg-purple-50/80 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <FileText className="h-24 w-24 opacity-10 text-purple-600" />
            </div>
            <CardContent className="relative p-4">
              <div className="flex items-center space-x-2 mb-2">
                <FileText className="w-5 h-5 text-purple-700" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Documents</h3>
              </div>
              <div className="text-2xl font-bold text-purple-600">{data.attachments.totalCount}</div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{data.attachments.totalSizeFormatted} total size</p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden bg-green-50/80 dark:bg-green-900/20 border-green-200 dark:border-green-800">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <Image className="h-24 w-24 opacity-10 text-green-600" />
            </div>
            <CardContent className="relative p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Image className="w-5 h-5 text-green-700" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Account Logos</h3>
              </div>
              <div className="text-2xl font-bold text-green-600">
                {data.logos.customerLogosCount}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                accounts with logos
              </p>
            </CardContent>
          </Card>
        </div>
      </Card>

      {/* ── Provider (read-only mirror; editing lives in System Settings) ── */}
      <Card className="relative overflow-hidden">
        <DecorativeCardIcon icon={Cloud} />
        <CardHeader className="relative z-10">
          <div className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <CardTitle className="text-xl font-bold">Storage Provider</CardTitle>
          </div>
          <CardDescription>
            Where uploaded files are stored. Configure providers in
            Configuration → System Settings → Storage Providers.
          </CardDescription>
        </CardHeader>
        <CardContent className="relative z-10">
          <div className="flex flex-wrap items-center gap-3">
            {configLoading ? (
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </span>
            ) : configData ? (
              <>
                <Badge variant="outline" className="text-xs">
                  Active: <span className="font-semibold ml-1">{providerLabel(configData.activeProvider)}</span>
                </Badge>
                <Badge variant="outline" className="text-xs">
                  Source: <span className="font-semibold ml-1">{configData.configSource}</span>
                </Badge>
              </>
            ) : null}
            <Link href="/admin?tab=storage-providers">
              <Button variant="outline" size="sm">
                Manage providers
                <ArrowUpRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* ── Path Conventions ── */}
      <Card className="relative overflow-hidden">
        <DecorativeCardIcon icon={HardDrive} />
        <CardHeader className="relative z-10">
          <div className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            <CardTitle className="text-xl font-bold">Storage Path Conventions</CardTitle>
          </div>
          <CardDescription>Object key structure used across all providers</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead sortable={false} className="w-8" />
                <SortableTableHead sortKey="label" sortConfig={pathSort} onSort={handlePathSort}>
                  {t("systemHealth.storage.colContext")}
                </SortableTableHead>
                <SortableTableHead sortKey="path" sortConfig={pathSort} onSort={handlePathSort}>
                  {t("systemHealth.storage.colPathPattern")}
                </SortableTableHead>
                <SortableTableHead sortKey="files" sortConfig={pathSort} onSort={handlePathSort} align="right">
                  {t("systemHealth.storage.colFiles")}
                </SortableTableHead>
                <SortableTableHead sortKey="size" sortConfig={pathSort} onSort={handlePathSort} align="right">
                  {t("systemHealth.storage.colTotalSize")}
                </SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortRows(PATH_CONVENTIONS, pathSort, {
                files: (row) => (row.expandable ? data.pathSizes?.find((p) => p.label === row.label)?.fileCount ?? 0 : null),
                size: (row) => (row.fixedSize ? null : data.pathSizes?.find((p) => p.label === row.label)?.totalSizeBytes ?? null),
              }).map(({ label, path, fixedSize, expandable }) => {
                const ps = data.pathSizes?.find((p) => p.label === label);
                const isExpanded = expandedPathLabels.has(label);
                const fileCount = ps?.fileCount ?? 0;
                const hasFiles = fileCount > 0;
                return (
                  <Fragment key={label}>
                    <TableRow
                      className={expandable && hasFiles ? "cursor-pointer hover:bg-muted/40" : ""}
                      onClick={expandable && hasFiles ? () => togglePathLabel(label) : undefined}
                    >
                      <TableCell className="py-1.5">
                        {expandable && hasFiles ? (
                          isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        ) : null}
                      </TableCell>
                      <TableCell className="font-medium">{label}</TableCell>
                      <TableCell className="font-mono text-xs">{path}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {expandable ? (hasFiles ? fileCount : "—") : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {fixedSize ?? (ps ? ps.totalSizeFormatted : "—")}
                      </TableCell>
                    </TableRow>
                    {expandable && isExpanded && (
                      <TableRow>
                        <TableCell colSpan={5} className="p-0">
                          <div className="px-6 py-2">
                            <PathLabelDrillDown label={label} />
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Files Database (only when the `db` provider is initialized) ──
          Shows bytes ACTUALLY persisted in the uploaded_files table, in
          contrast with Storage Path Conventions above which reads main-DB
          metadata (documents.file_size + customers.logo_size). The two can
          drift if rows were hard-deleted, an upload aborted mid-flight, or
          the active provider has been switched recently — this block is
          the source of truth for what's in DB-blob storage right now. */}
      {data.filesDbStats && (
        <Card className="relative overflow-hidden">
          <DecorativeCardIcon icon={HardDrive} />
          <CardHeader className="relative z-10">
            <div className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              <CardTitle className="text-xl font-bold">Files Database</CardTitle>
            </div>
            <CardDescription>
              Live byte counts from the{" "}
              <code className="bg-muted px-1 rounded text-xs">
                {data.filesDbStats.dbName ?? "files"}
              </code>{" "}
              database — what's actually persisted in <code className="bg-muted px-1 rounded text-xs">uploaded_files</code>.
              The Path Conventions table above is metadata-driven; this is read directly from blob storage.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap gap-2">
              <Badge variant="outline" className="text-xs">
                Files: <span className="font-semibold ml-1">{data.filesDbStats.totalCount}</span>
              </Badge>
              <Badge variant="outline" className="text-xs">
                Total size: <span className="font-semibold ml-1">{data.filesDbStats.totalSizeFormatted}</span>
              </Badge>
            </div>
            {data.filesDbStats.byPrefix.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No files stored in the files database yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead sortable={false} className="w-8" />
                    <SortableTableHead sortKey="prefix" sortConfig={prefixSort} onSort={handlePrefixSort}>
                      {t("systemHealth.storage.colTopLevelPrefix")}
                    </SortableTableHead>
                    <SortableTableHead sortKey="count" sortConfig={prefixSort} onSort={handlePrefixSort} align="right">
                      {t("systemHealth.storage.colFiles")}
                    </SortableTableHead>
                    <SortableTableHead sortKey="sizeBytes" sortConfig={prefixSort} onSort={handlePrefixSort} align="right">
                      {t("systemHealth.storage.colSize")}
                    </SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortRows(data.filesDbStats.byPrefix, prefixSort, {
                    prefix: (b) => b.prefix,
                    count: (b) => b.count,
                    sizeBytes: (b) => b.sizeBytes,
                  }).map((b) => {
                    const isExpanded = expandedFilesDbPrefixes.has(b.prefix);
                    return (
                      <Fragment key={b.prefix}>
                        <TableRow
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => toggleFilesDbPrefix(b.prefix)}
                        >
                          <TableCell className="py-1.5">
                            {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{b.prefix}/</TableCell>
                          <TableCell className="text-right">{b.count}</TableCell>
                          <TableCell className="text-right">{b.sizeFormatted}</TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={4} className="p-0">
                              <div className="px-6 py-2">
                                <FilesDbPrefixDrillDown prefix={b.prefix} />
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* (drill-down subcomponents defined below the main export) */}

      {/* ── Documents by Category ── */}

      {data.attachments.byCategory.length > 0 && (
        <Card className="relative overflow-hidden">
          <DecorativeCardIcon icon={HardDrive} />
          <CardHeader className="relative z-10">
            <div className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              <CardTitle className="text-2xl font-bold">Documents by Category</CardTitle>
            </div>
            <CardDescription>Breakdown of stored documents by type</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="category" sortConfig={categorySort} onSort={handleCategorySort}>
                    {t("systemHealth.storage.colCategory")}
                  </SortableTableHead>
                  <SortableTableHead sortKey="count" sortConfig={categorySort} onSort={handleCategorySort} align="right">
                    {t("systemHealth.storage.colCount")}
                  </SortableTableHead>
                  <SortableTableHead sortKey="sizeBytes" sortConfig={categorySort} onSort={handleCategorySort} align="right">
                    {t("systemHealth.storage.colSize")}
                  </SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortRows(data.attachments.byCategory, categorySort, {
                  category: (c) => c.category,
                  count: (c) => c.count,
                  sizeBytes: (c) => c.sizeBytes,
                }).map((cat) => (
                  <TableRow key={cat.category}>
                    <TableCell className="font-medium capitalize">
                      {cat.category || "Uncategorized"}
                    </TableCell>
                    <TableCell className="text-right">{cat.count}</TableCell>
                    <TableCell className="text-right">{formatBytes(cat.sizeBytes)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PathLabelDrillDown({ label }: { label: string }) {
  const { data, isLoading } = useQuery<{ label: string; files: UploadedFileSummary[] }>({
    queryKey: ["storage-path-files", label],
    queryFn: async () => {
      const resp = await fetch(`/api/admin/storage/path-files?label=${encodeURIComponent(label)}`);
      if (!resp.ok) throw new Error("Failed to load path files");
      return resp.json();
    },
  });
  return <FileListSubTable files={data?.files ?? []} isLoading={isLoading} showFullKey={true} />;
}

function FilesDbPrefixDrillDown({ prefix }: { prefix: string }) {
  const { data, isLoading } = useQuery<{ prefix: string; files: UploadedFileSummary[] }>({
    queryKey: ["storage-files-db-list", prefix],
    queryFn: async () => {
      const resp = await fetch(`/api/admin/storage/files-db-list?prefix=${encodeURIComponent(prefix)}`);
      if (!resp.ok) throw new Error("Failed to load prefix files");
      return resp.json();
    },
  });
  return <FileListSubTable files={data?.files ?? []} isLoading={isLoading} showFullKey={true} />;
}
