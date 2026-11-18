import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import {
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Cloud,
  Save,
  Zap,
  Server,
  Database,
  ArrowUpRight,
  Info,
  ChevronRight,
} from "lucide-react";

const MASKED = "••••••••";

// Provider views are the page's top tab bar (the Storage Providers sidebar
// link's `views` in sidebar-nav-config.ts), selected via ?subtab=.
const PROVIDER_TABS = ["gcs", "aws", "azure", "db", "local"] as const;
type ProviderTab = (typeof PROVIDER_TABS)[number];

function isProviderTab(value: string | null | undefined): value is ProviderTab {
  return !!value && (PROVIDER_TABS as readonly string[]).includes(value);
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

interface FilesDbInfo {
  ready: boolean;
  error: string | null;
  dbName: string | null;
  source: "derived" | "override" | null;
  host: string | null;
  derivedFromMainDbName: string | null;
}

interface StorageConfigApiResponse {
  dbConfig: StorageDbConfig | null;
  activeProvider: string;
  configSource: "db" | "env" | "local";
  filesDb?: FilesDbInfo;
}

interface StorageSavePayload {
  provider: string;
  enabled: boolean;
  gcsBucketName?: string;
  gcsKeyJson?: string;
  awsRegion?: string;
  awsBucketName?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  azureAccountName?: string;
  azureContainerName?: string;
  azureAccountKey?: string;
  azureSasToken?: string;
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

export function StorageProvidersSection() {
  const queryClient = useQueryClient();

  const { data: configData, isLoading: configLoading } = useQuery<StorageConfigApiResponse>({
    queryKey: ["storage-config"],
    queryFn: async () => {
      const response = await fetch("/api/admin/storage/config");
      if (!response.ok) throw new Error("Failed to fetch storage config");
      return response.json();
    },
  });

  const [, setLocation] = useLocation();
  const search = useSearch();
  const urlTab = new URLSearchParams(search).get("subtab");
  // Without a valid ?subtab= the page opens on the saved provider.
  const savedProvider = configData?.dbConfig?.provider ?? configData?.activeProvider;
  const defaultTab: ProviderTab = isProviderTab(savedProvider) ? savedProvider : "gcs";
  const activeTab: ProviderTab = isProviderTab(urlTab) ? urlTab : defaultTab;
  const [enabled, setEnabled] = useState(true);

  const [gcsFields, setGcsFields] = useState({ gcsBucketName: "", gcsKeyJson: "" });
  const [awsFields, setAwsFields] = useState({ awsRegion: "", awsBucketName: "", awsAccessKeyId: "", awsSecretAccessKey: "" });
  const [azureFields, setAzureFields] = useState({ azureAccountName: "", azureContainerName: "", azureAccountKey: "", azureSasToken: "" });

  const [testResult, setTestResult] = useState<{ ok: boolean; latencyMs?: number; message?: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    if (configData?.dbConfig) {
      const c = configData.dbConfig;
      setEnabled(c.enabled ?? true);
      setGcsFields({ gcsBucketName: c.gcsBucketName || "", gcsKeyJson: c.gcsKeyJson || "" });
      setAwsFields({ awsRegion: c.awsRegion || "", awsBucketName: c.awsBucketName || "", awsAccessKeyId: c.awsAccessKeyId || "", awsSecretAccessKey: c.awsSecretAccessKey || "" });
      setAzureFields({ azureAccountName: c.azureAccountName || "", azureContainerName: c.azureContainerName || "", azureAccountKey: c.azureAccountKey || "", azureSasToken: c.azureSasToken || "" });
    }
  }, [configData]);

  // Write the default provider into the URL so the top tab bar highlights it.
  useEffect(() => {
    if (configLoading || isProviderTab(urlTab)) return;
    setLocation(`/admin?tab=storage-providers&subtab=${defaultTab}`, { replace: true });
  }, [configLoading, urlTab, defaultTab, setLocation]);

  function buildPayload(): StorageSavePayload {
    const payload: StorageSavePayload = { provider: activeTab, enabled };
    if (activeTab === "gcs") Object.assign(payload, gcsFields);
    else if (activeTab === "aws") Object.assign(payload, awsFields);
    else if (activeTab === "azure") Object.assign(payload, azureFields);
    // 'db' and 'local' carry no credential fields.
    return payload;
  }

  const saveMutation = useMutation<Record<string, unknown>, Error, StorageSavePayload>({
    mutationFn: async (payload: StorageSavePayload) => {
      const response = await fetch("/api/admin/storage/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to save");
      }
      return response.json();
    },
    onSuccess: () => {
      showSuccessToast("Storage configuration saved", "The storage driver has been updated.");
      queryClient.invalidateQueries({ queryKey: ["storage-config"] });
      queryClient.invalidateQueries({ queryKey: ["system-health-storage"] });
    },
    onError: (err: Error) => {
      showErrorToast("Save failed", err.message);
    },
  });

  function handleSave() {
    saveMutation.mutate(buildPayload());
  }

  // Test posts the CURRENT form values so the result reflects what the admin
  // typed (validated server-side against a throwaway driver), not the saved
  // provider.
  async function handleTest() {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/storage/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const json = await res.json();
      if (!res.ok) {
        setTestResult({ ok: false, message: json.message || `Server error ${res.status}` });
      } else {
        setTestResult(json);
      }
    } catch (err: unknown) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="relative overflow-hidden">
        <DecorativeCardIcon icon={Cloud} />
        <CardHeader className="relative z-10">
          <div className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <CardTitle className="text-2xl font-bold">Storage Providers</CardTitle>
          </div>
          <CardDescription>
            Choose where uploaded files (account logos, branding images, project
            artifacts) are stored. Credentials are encrypted at rest. Priority
            order: this configuration &gt; environment variables &gt; local disk.
          </CardDescription>
          {configData && (
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-xs">
                Active: <span className="font-semibold ml-1">{providerLabel(configData.activeProvider)}</span>
              </Badge>
              <Badge variant="outline" className="text-xs">
                Source: <span className="font-semibold ml-1">{configData.configSource}</span>
              </Badge>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {configLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading configuration…
            </div>
          ) : (
            <div className="space-y-4">
              {/* Active-vs-selected reconciliation banner. Without this, an admin
                  who clicks a different tab sees "Test Connection: OK" yet the
                  Active badge still reads the previously-saved provider — and
                  it's not obvious that Save is the action that actually
                  switches. This banner spells it out. */}
              {configData && configData.activeProvider !== activeTab && (
                <div className="flex items-start gap-2 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-900 dark:text-amber-200">
                  <Info className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <div>
                      <strong>{providerLabel(configData.activeProvider)}</strong> is currently active.
                      You're viewing <strong>{providerLabel(activeTab)}</strong>.
                    </div>
                    <div className="text-xs mt-0.5">
                      Click <strong>Save Configuration</strong> below to switch the active provider to {providerLabel(activeTab)}.
                      <em> Test Connection</em> only validates the credentials typed on this tab — it does not change the active provider.
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <Switch checked={enabled} onCheckedChange={setEnabled} id="storage-enabled" className="mt-1" />
                <div>
                  <Label htmlFor="storage-enabled" className="cursor-pointer">
                    Use the saved provider for uploads
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Master switch on the saved row. When <strong>off</strong>, the app ignores this configuration
                    and falls back to <code className="bg-muted px-1 rounded text-[10px]">GCS_BUCKET_NAME</code> /
                    <code className="bg-muted px-1 rounded text-[10px] ml-1">AWS_*</code> /
                    <code className="bg-muted px-1 rounded text-[10px] ml-1">AZURE_*</code> environment variables,
                    then to local disk. Most installs leave this <strong>on</strong>.
                  </p>
                </div>
              </div>

              <Tabs value={activeTab}>
                <TabsContent value="gcs" className="space-y-4 mt-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-1">
                      <Label>Bucket Name</Label>
                      <Input
                        placeholder="my-gcs-bucket"
                        value={gcsFields.gcsBucketName}
                        onChange={(e) => setGcsFields((f) => ({ ...f, gcsBucketName: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Service Account Key JSON <span className="text-xs text-muted-foreground">(encrypted at rest)</span></Label>
                      <Textarea
                        placeholder={`{"type":"service_account","project_id":"..."}`}
                        className="font-mono text-xs min-h-[80px]"
                        value={gcsFields.gcsKeyJson}
                        onChange={(e) => setGcsFields((f) => ({ ...f, gcsKeyJson: e.target.value }))}
                      />
                      <p className="text-xs text-muted-foreground">Leave blank to use GOOGLE_APPLICATION_CREDENTIALS env var or ADC</p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="aws" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label>AWS Region</Label>
                      <Input
                        placeholder="us-east-1"
                        value={awsFields.awsRegion}
                        onChange={(e) => setAwsFields((f) => ({ ...f, awsRegion: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>S3 Bucket Name</Label>
                      <Input
                        placeholder="my-s3-bucket"
                        value={awsFields.awsBucketName}
                        onChange={(e) => setAwsFields((f) => ({ ...f, awsBucketName: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Access Key ID <span className="text-xs text-muted-foreground">(encrypted)</span></Label>
                      <Input
                        placeholder={MASKED}
                        value={awsFields.awsAccessKeyId}
                        onChange={(e) => setAwsFields((f) => ({ ...f, awsAccessKeyId: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Secret Access Key <span className="text-xs text-muted-foreground">(encrypted)</span></Label>
                      <Input
                        type="password"
                        placeholder={MASKED}
                        value={awsFields.awsSecretAccessKey}
                        onChange={(e) => setAwsFields((f) => ({ ...f, awsSecretAccessKey: e.target.value }))}
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="azure" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label>Storage Account Name</Label>
                      <Input
                        placeholder="myaccount"
                        value={azureFields.azureAccountName}
                        onChange={(e) => setAzureFields((f) => ({ ...f, azureAccountName: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Container Name</Label>
                      <Input
                        placeholder="my-container"
                        value={azureFields.azureContainerName}
                        onChange={(e) => setAzureFields((f) => ({ ...f, azureContainerName: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Account Key <span className="text-xs text-muted-foreground">(encrypted)</span></Label>
                      <Input
                        type="password"
                        placeholder={MASKED}
                        value={azureFields.azureAccountKey}
                        onChange={(e) => setAzureFields((f) => ({ ...f, azureAccountKey: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>SAS Token <span className="text-xs text-muted-foreground">(encrypted, used if no Account Key)</span></Label>
                      <Input
                        type="password"
                        placeholder={MASKED}
                        value={azureFields.azureSasToken}
                        onChange={(e) => setAzureFields((f) => ({ ...f, azureSasToken: e.target.value }))}
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="db" className="mt-4">
                  <div className="space-y-3">
                    {/* Live status panel — shows what's actually wired up so the
                        admin doesn't have to guess what "Database" points at. */}
                    <div className="rounded-md border border-blue-200 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/30 p-4 text-sm space-y-3">
                      <div className="flex items-center gap-2 font-medium text-blue-900 dark:text-blue-200">
                        <Database className="h-4 w-4" />
                        Database Storage (recommended for self-hosted without cloud)
                      </div>

                      {configData?.filesDb ? (
                        <div className="rounded border border-blue-200/70 dark:border-blue-900/70 bg-background p-3 space-y-1.5">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">Currently configured</div>
                          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
                            <dt className="text-muted-foreground">Files database</dt>
                            <dd className="font-mono">{configData.filesDb.dbName ?? "(not initialized)"}</dd>
                            <dt className="text-muted-foreground">Host</dt>
                            <dd className="font-mono">{configData.filesDb.host ?? "(unknown)"}</dd>
                            <dt className="text-muted-foreground">Source</dt>
                            <dd>
                              {configData.filesDb.source === "override" ? (
                                <span>
                                  <code className="bg-muted px-1 rounded text-xs">FILES_DATABASE_URL</code> environment override
                                </span>
                              ) : configData.filesDb.source === "derived" ? (
                                <span>
                                  Derived from the active <strong>Database Connection</strong>{configData.filesDb.derivedFromMainDbName ? <> (<code className="bg-muted px-1 rounded text-xs">{configData.filesDb.derivedFromMainDbName}</code>)</> : null}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">(not initialized)</span>
                              )}
                            </dd>
                            <dt className="text-muted-foreground">Status</dt>
                            <dd>
                              {configData.filesDb.ready ? (
                                <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400">
                                  <CheckCircle2 className="h-4 w-4" /> Ready
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-400">
                                  <AlertTriangle className="h-4 w-4" /> Not ready
                                  {configData.filesDb.error ? <span className="text-muted-foreground"> — {configData.filesDb.error}</span> : null}
                                </span>
                              )}
                            </dd>
                          </dl>
                          {configData.filesDb.source === "derived" && (
                            <div className="pt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                              <a
                                href="/admin?tab=database-connection"
                                className="inline-flex items-center text-sm text-blue-700 dark:text-blue-300 hover:underline"
                              >
                                View Database Connections
                                <ArrowUpRight className="h-3.5 w-3.5 ml-0.5" />
                              </a>
                              <span className="text-xs text-muted-foreground">
                                Switching the active connection there changes which server the files DB is created on.
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-muted-foreground italic text-xs">Loading database information…</p>
                      )}

                      <p className="text-muted-foreground">
                        Uploaded files are stored as binary rows in a dedicated{" "}
                        <code className="bg-background px-1 rounded text-xs">
                          {configData?.filesDb?.dbName ?? "<main>_files"}
                        </code>{" "}
                        database on the <strong>same Postgres server</strong> as your application data — kept
                        separate so main-database backups stay small. Uploaded files{" "}
                        <strong>survive redeploys with zero deployment configuration</strong>. No credentials
                        needed here: it reuses the application's database connection.
                      </p>

                      <details className="group rounded border border-blue-200/70 dark:border-blue-900/70 bg-background">
                        <summary className="flex items-center gap-1.5 cursor-pointer select-none px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50 rounded">
                          <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
                          How this works
                        </summary>
                        <div className="px-3 pb-3 pt-1 space-y-3 text-sm text-muted-foreground">
                          <div>
                            <div className="font-medium text-foreground mb-1">Auto-create on first boot</div>
                            <p>
                              The app reads your active Database Connection, swaps the database name to{" "}
                              <code className="bg-muted px-1 rounded text-xs">&lt;main&gt;_files</code>, and
                              issues <code className="bg-muted px-1 rounded text-xs">CREATE DATABASE</code>{" "}
                              against the Postgres maintenance database if it doesn't already exist. It then
                              ensures the <code className="bg-muted px-1 rounded text-xs">uploaded_files</code>{" "}
                              table (id, object_key, mime_type, size_bytes, data BYTEA, sha256, uploaded_by,
                              timestamps) with an idempotent{" "}
                              <code className="bg-muted px-1 rounded text-xs">CREATE TABLE IF NOT EXISTS</code>.
                              No migration runner involved — the files DB is self-managed.
                            </p>
                          </div>
                          <div>
                            <div className="font-medium text-foreground mb-1">Required privilege</div>
                            <p>
                              The app's database user needs the{" "}
                              <code className="bg-muted px-1 rounded text-xs">CREATEDB</code> privilege (true
                              for the self-hosted docker-compose superuser and local dev). On managed Postgres
                              without it, auto-create fails gracefully — the app still boots, but the Database
                              tab shows "Not ready" with the Postgres error. To recover: pre-create the
                              database and grant access, or set{" "}
                              <code className="bg-muted px-1 rounded text-xs">FILES_DATABASE_URL</code>.
                            </p>
                          </div>
                          <div>
                            <div className="font-medium text-foreground mb-1">Serving uploaded files</div>
                            <p>
                              Requests to <code className="bg-muted px-1 rounded text-xs">/api/files/:key</code>{" "}
                              look up the row in the files DB first and stream the BYTEA back; if not found,
                              they fall through to <code className="bg-muted px-1 rounded text-xs">uploads/</code>{" "}
                              and bundled defaults — so existing local-disk files keep working during the switch.
                            </p>
                          </div>
                          <div>
                            <div className="font-medium text-foreground mb-1">Backups</div>
                            <p>
                              Back up the two databases independently:{" "}
                              <code className="bg-muted px-1 rounded text-xs">pg_dump &lt;main&gt;</code> stays
                              small and fast (no blobs);{" "}
                              <code className="bg-muted px-1 rounded text-xs">pg_dump &lt;main&gt;_files</code>{" "}
                              captures the upload bytes. Restore them together to keep file references intact.
                            </p>
                          </div>
                          <div>
                            <div className="font-medium text-foreground mb-1">Sizing &amp; performance</div>
                            <p>
                              Postgres BYTEA storage scales linearly with upload volume. Best for small /
                              medium installs (under a few GB of uploads). For very large media libraries
                              or high-throughput download workloads, prefer a cloud provider — object stores
                              are purpose-built for that and won't compete with transactional queries for
                              connection-pool slots.
                            </p>
                          </div>
                        </div>
                      </details>

                      <details className="group rounded border border-blue-200/70 dark:border-blue-900/70 bg-background">
                        <summary className="flex items-center gap-1.5 cursor-pointer select-none px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50 rounded">
                          <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
                          Want to put files on a completely separate database server?
                        </summary>
                        <div className="px-3 pb-3 pt-1 space-y-3 text-sm text-muted-foreground">
                          <p>
                            Yes — fully supported. Set the{" "}
                            <code className="bg-muted px-1 rounded text-xs">FILES_DATABASE_URL</code>{" "}
                            environment variable to a Postgres connection string pointing at any database
                            (different server, different cluster, different cloud, managed Postgres, anything
                            that speaks the wire protocol). On next boot the app uses that URL instead of
                            deriving one from the main connection. The <em>Source</em> field above will switch
                            from "Derived from the active Database Connection" to "FILES_DATABASE_URL
                            environment override" so you can confirm it took effect.
                          </p>
                          <div>
                            <div className="font-medium text-foreground mb-1">When this makes sense</div>
                            <ul className="list-disc ml-5 space-y-0.5">
                              <li>Your main DB is managed Postgres without{" "}
                                <code className="bg-muted px-1 rounded text-xs">CREATEDB</code> privilege.</li>
                              <li>You want to back up file blobs on a different schedule (e.g. weekly vs
                                hourly for the main DB) or to a different storage tier.</li>
                              <li>You want to isolate I/O — heavy upload activity on a separate instance
                                so it can't compete with transactional queries on the main DB.</li>
                              <li>You're scaling past a few GB of uploads and want to move them off the
                                application database without committing to a cloud provider yet.</li>
                            </ul>
                          </div>
                          <div>
                            <div className="font-medium text-foreground mb-1">Performance trade-offs</div>
                            <p>
                              If the separate server is on the same VPC / private network, latency is
                              negligible (sub-millisecond). If it's across the internet or a different
                              region, every upload and download pays a network round-trip — fine for
                              account logos and branding, slower for frequent large-file access. The app
                              keeps a dedicated connection pool for the files DB, so it won't starve the
                              main DB's pool.
                            </p>
                          </div>
                          <div>
                            <div className="font-medium text-foreground mb-1">Sizing</div>
                            <p>
                              Plan storage for the sum of all uploads at their original size (BYTEA is not
                              compressed by default beyond TOAST). 1,000 logos averaging 200 KB ≈ 200 MB.
                              10,000 project artifacts averaging 2 MB ≈ 20 GB. A small managed Postgres
                              instance (e.g. 1 vCPU / 2 GB RAM / 20 GB storage) is plenty for typical
                              installs.
                            </p>
                          </div>
                          <div>
                            <div className="font-medium text-foreground mb-1">Backup</div>
                            <p>
                              Independent <code className="bg-muted px-1 rounded text-xs">pg_dump</code> /
                              point-in-time recovery on the files server — completely decoupled from the main
                              DB's backup schedule. Just remember to coordinate restores: a main-DB row
                              referencing <code className="bg-muted px-1 rounded text-xs">/api/files/foo.png</code>{" "}
                              is meaningless without the matching row in the files DB.
                            </p>
                          </div>
                          <div>
                            <div className="font-medium text-foreground mb-1">How to set this</div>
                            <p>
                              <code className="bg-muted px-1 rounded text-xs">FILES_DATABASE_URL</code>{" "}
                              is read from the process environment at boot — it is <strong>not</strong>{" "}
                              managed in the <em>Database Connections</em> page (that page manages only the
                              main application database). Set it at the host / deploy layer, then restart
                              the app. The <em>Source</em> row above will flip to "FILES_DATABASE_URL
                              environment override" once it's picked up.
                            </p>
                            <ul className="list-disc ml-5 mt-1 space-y-0.5">
                              <li><strong>Dokploy / Coolify:</strong> add it as an Environment Variable on the
                                app, then redeploy.</li>
                              <li><strong>docker-compose:</strong> add{" "}
                                <code className="bg-muted px-1 rounded text-xs">FILES_DATABASE_URL=postgres://user:pass@host:5432/dbname</code>{" "}
                                to the app's <code className="bg-muted px-1 rounded text-xs">.env</code> (or
                                under <code className="bg-muted px-1 rounded text-xs">environment:</code> in
                                the service), then <code className="bg-muted px-1 rounded text-xs">docker compose up -d</code>.</li>
                              <li><strong>systemd unit:</strong> add an{" "}
                                <code className="bg-muted px-1 rounded text-xs">Environment=</code> line or
                                an <code className="bg-muted px-1 rounded text-xs">EnvironmentFile=</code>,
                                then <code className="bg-muted px-1 rounded text-xs">systemctl daemon-reload &amp;&amp; systemctl restart criteriaiq</code>.</li>
                              <li><strong>Local dev (.env):</strong> add the line to{" "}
                                <code className="bg-muted px-1 rounded text-xs">.env</code> at the repo root.</li>
                            </ul>
                          </div>
                          <div>
                            <div className="font-medium text-foreground mb-1">Bottom line</div>
                            <p>
                              For most self-hosted installs, the default (same-server, auto-created files DB)
                              gives you all the persistence benefits with zero ops overhead. Reach for{" "}
                              <code className="bg-muted px-1 rounded text-xs">FILES_DATABASE_URL</code>{" "}
                              when you have a concrete reason (privilege, isolation, scale, backup policy).
                              If you outgrow even a separate Postgres, switch to a cloud provider — same
                              UI, just pick the GCS / AWS / Azure tab.
                            </p>
                          </div>
                        </div>
                      </details>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="local" className="mt-4">
                  <div className="rounded-md bg-muted p-4 text-sm space-y-2">
                    <div className="flex items-center gap-2 font-medium">
                      <Server className="h-4 w-4" />
                      Local Disk Storage
                    </div>
                    <p className="text-muted-foreground">
                      Files are saved to <code className="bg-background px-1 rounded text-xs">uploads/</code> on
                      the server and served via <code className="bg-background px-1 rounded text-xs">/api/files/:key</code>.
                      No credentials required.
                    </p>
                    <div className="rounded border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-amber-900 dark:text-amber-200">
                      <div className="flex items-center gap-2 font-medium">
                        <AlertTriangle className="h-4 w-4" />
                        Requires a persistent volume to survive redeploys
                      </div>
                      <p className="mt-1">
                        Containers have ephemeral filesystems. Unless your deployment mounts a persistent
                        volume at <code className="bg-background px-1 rounded text-xs">/app/uploads</code>, uploaded files are
                        <strong> lost on every redeploy or restart</strong>. To use local disk safely:
                      </p>
                      <ul className="list-disc ml-5 mt-1 space-y-0.5">
                        <li><strong>Dokploy / Coolify:</strong> add a volume mount in the app's Volumes/Mounts panel mapping a named volume to <code className="bg-background px-1 rounded text-xs">/app/uploads</code>.</li>
                        <li><strong>docker-compose:</strong> the <code className="bg-background px-1 rounded text-xs">app_uploads:/app/uploads</code> volume is already declared — ensure it isn't recreated on deploy.</li>
                        <li><strong>No volume available?</strong> Use the <strong>Database</strong> provider above (zero config) or a cloud provider instead.</li>
                      </ul>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex items-center gap-3 pt-2 border-t">
                <Button onClick={handleSave} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Configuration
                </Button>

                <Button variant="outline" onClick={handleTest} disabled={isTesting}>
                  {isTesting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4 mr-2" />
                  )}
                  Test Connection
                </Button>

                {testResult && (
                  <span className={`text-sm flex items-center gap-1 ${testResult.ok ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                    {testResult.ok ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <AlertTriangle className="h-4 w-4" />
                    )}
                    {testResult.ok
                      ? `Connected (${testResult.latencyMs}ms)`
                      : testResult.message || "Connection failed"}
                  </span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
