import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { showErrorToast } from "@/lib/toast-helper";
import {
  DatabaseZap, X, Save, SquarePen, Trash2,
  CheckCircle, XCircle, Loader2, Circle, Zap, RotateCcw, AlertTriangle,
  Lock, Star, GitBranch, Server, FlaskConical,
  ChevronDown, ChevronRight, MonitorCheck, KeyRound, Eye, EyeOff, Copy, RefreshCw, ShieldAlert, LogOut,
  ArrowUpToLine, ArrowDownFromLine, HardDrive
} from "lucide-react";
import { safeCopyToClipboard } from "@/lib/clipboard";
import { FieldSourceBadge } from "@/components/configuration/FieldSourceBadge";
import { mapDatabaseUrlSource } from "@/lib/env-source-badges";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { applyDriverChoice, readDriverChoice, type DriverChoice } from "@/lib/db-driver-param";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { RotationStatusBanner } from "@/components/configuration/RotationStatusBanner";

// Task #739: branch dropdown is fixed to the canonical triad
// (production / staging / development) rather than the earlier
// six-value list. Server-side normalization in
// `server/db-bootstrap.ts:LEGACY_BRANCH_MAP` quietly migrates any
// stored "testing"/"qa"/"sandbox"/"other" rows the next time they
// load, so no client-side fallback is needed for legacy data.
const BRANCH_OPTIONS = [
  { value: "production", label: "Production", icon: Server, colorClasses: "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800", itemColorClasses: "border-green-100 bg-green-50/30 dark:border-green-900/40 dark:bg-green-950/10", iconColorClass: "text-green-600 dark:text-green-400" },
  { value: "staging", label: "Staging", icon: FlaskConical, colorClasses: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800", itemColorClasses: "border-amber-100 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/10", iconColorClass: "text-amber-600 dark:text-amber-400" },
  { value: "development", label: "Development", icon: GitBranch, colorClasses: "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800", itemColorClasses: "border-blue-100 bg-blue-50/30 dark:border-blue-900/40 dark:bg-blue-950/10", iconColorClass: "text-blue-600 dark:text-blue-400" },
];

interface DbConnectionRecord {
  id: number;
  name: string;
  connectionUrlPreview: string;
  // Server-supplied (Task #484) — mirrors the operator's "Database
  // Driver" dropdown choice baked into the stored URL's `?driver=`
  // param. Drives both the per-row badge below and the seed value
  // for the Edit dialog's dropdown so editing a row no longer
  // silently resets the choice to "auto".
  driverOverride: "auto" | "neon" | "pg";
  branch: string;
  isActive: boolean;
  isDefault: boolean;
  isSystem: boolean;
  notes: string | null;
  lastTestedAt: string | null;
  lastTestSuccess: boolean | null;
  lastTestLatencyMs: number | null;
  createdAt: string;
  updatedAt: string;
}

// Driver badge styling (Task #484). Three flavors so the visual
// hierarchy matches the wire enum: a neutral grey for "Auto" (the
// default and most common case — should not draw the eye), an
// indigo accent for forced Neon, and a slate accent for forced pg.
// Indigo/slate were picked to harmonize with the Default/Active
// badges already on each row instead of fighting them for attention.
const DRIVER_BADGE: Record<
  "auto" | "neon" | "pg",
  { label: string; classes: string }
> = {
  auto: {
    label: "Auto",
    classes:
      "bg-zinc-100 text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700",
  },
  neon: {
    label: "Neon",
    classes:
      "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800",
  },
  pg: {
    label: "Postgres",
    classes:
      "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300 border-slate-300 dark:border-slate-700",
  },
};

interface ConnectionsResponse {
  connections: DbConnectionRecord[];
}

// Subset of /api/system/env-status we care about for the source-of-truth
// badge. Mirrors the shape EnvStatusPanel consumes so both surfaces stay
// driven by the exact same bootstrap snapshot field — see task #372.
// `sessionSecretSource` and `encryptionKeySource` (added for Task #719)
// drive the new Bootstrap Secrets subsection below the connections list:
// they decide which secrets can be revealed/regenerated and whether the
// "New secrets will be generated" banner shows up in the Add modal.
interface EnvStatusSnapshot {
  databaseUrlSource: "env" | "wizard" | "none";
  sessionSecretSource: "env" | "file" | "none";
  encryptionKeySource: "env" | "file" | "none";
}

// Read-only snapshot of /api/admin/storage/config so the active
// Database Connection card can advertise where uploaded files land
// today, and so the "Set Active" confirm dialog can warn that the
// files DB will follow a main-DB swap unless FILES_DATABASE_URL is
// pinning it elsewhere.
interface StorageConfigSnapshot {
  activeProvider: string;
  configSource: "db" | "env" | "local";
  filesDb?: {
    ready: boolean;
    error: string | null;
    dbName: string | null;
    source: "derived" | "override" | null;
    host: string | null;
    derivedFromMainDbName: string | null;
  };
}

function storageProviderLabel(p: string): string {
  switch (p) {
    case "gcs": return "Google Cloud Storage";
    case "aws": return "AWS S3";
    case "azure": return "Azure Blob";
    case "db": return "Database (separate logical DB)";
    case "local": return "Local Disk";
    default: return p;
  }
}

type SecretKey = "SESSION_SECRET" | "ENCRYPTION_KEY";

const SECRET_LABELS: Record<SecretKey, { title: string; description: string }> = {
  SESSION_SECRET: {
    title: "SESSION_SECRET",
    description:
      "Signs session cookies. Rotating invalidates every existing user session — operators will be signed out and have to log back in.",
  },
  ENCRYPTION_KEY: {
    title: "ENCRYPTION_KEY",
    description:
      "Encrypts database connection URLs, MFA secrets, OAuth tokens, and webhook signing keys. Rotating re-encrypts every stored value in a single transaction; the operation is atomic but slow on large installs.",
  },
};

interface TestResult {
  success: boolean;
  latencyMs: number;
  error?: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function DatabaseConnectionSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DbConnectionRecord | null>(null);
  // `driver` carries the same `?driver=neon|pg` override that the
  // setup wizard exposes (Task #481) so the override travels with the
  // saved URL instead of being dropped on the way to the encrypted
  // store. Defaults to "auto" — matching the server-side hostname
  // auto-detection — and is folded into `connectionUrl` via
  // `applyDriverChoice` only at submit time so the textbox the operator
  // sees never gets mutated under their fingers.
  const [addForm, setAddForm] = useState({ name: "", connectionUrl: "", notes: "", branch: "production", isDefault: false, driver: "auto" as DriverChoice });
  const [editForm, setEditForm] = useState({ name: "", connectionUrl: "", notes: "", branch: "production", isDefault: false, driver: "auto" as DriverChoice });
  // Typed-confirmation gate for editing the URL of the currently
  // active connection. The server rejects this with errorCode
  // `pending_active_required`; until Task #740 wires the
  // pendingActive workflow, the gate exists so the operator
  // intentionally types the connection's name (preventing accidental
  // saves) and gets a clear "Set Active workflow not yet available"
  // toast back instead of a generic error.
  const [pendingActiveConfirm, setPendingActiveConfirm] = useState<
    | null
    | {
        targetId: number;
        targetName: string;
        body: { name: string; connectionUrl?: string; notes: string; branch: string; isDefault: boolean };
      }
  >(null);
  const [pendingActiveTypedName, setPendingActiveTypedName] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  function toggleGroup(value: string) {
    setCollapsedGroups(prev => {
      const n = new Set(prev);
      n.has(value) ? n.delete(value) : n.add(value);
      return n;
    });
  }

  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, TestResult>>({});
  const [restartRequired, setRestartRequired] = useState(false);
  const [restarting, setRestarting] = useState(false);
  // Per-row connection URL reveal (Task #739). Same 10-second
  // auto-clear pattern as the bootstrap-secrets reveal above so the
  // value never lingers on screen — admins can copy it to a host
  // secret manager and move on.
  const [revealedConnections, setRevealedConnections] = useState<Record<number, string>>({});
  const [revealingConnectionId, setRevealingConnectionId] = useState<number | null>(null);
  // Bootstrap secrets state (Task #719). `revealedValues` holds raw
  // secret strings keyed by SecretKey for the brief reveal window
  // (auto-clears after 10s — see handleReveal). `regenerateTarget`
  // gates the confirmation dialog so a stray click can't rotate by
  // accident. `generatedSecretsDialog` carries one-time values
  // returned by POST /api/db-connections when the server lazy-
  // generated them, so we can show a copy-now dialog before they
  // disappear behind the masked Reveal flow.
  const [revealedValues, setRevealedValues] = useState<Partial<Record<SecretKey, string>>>({});
  const [regenerateTarget, setRegenerateTarget] = useState<SecretKey | null>(null);
  const [regeneratingKey, setRegeneratingKey] = useState<SecretKey | null>(null);
  const [revealingKey, setRevealingKey] = useState<SecretKey | null>(null);
  // Task #741: Promote/Unmanage flow state. `promoteTarget` opens the
  // single-step confirm dialog; `unmanageTarget` opens the typed-confirm
  // dialog (mirroring the pendingActiveConfirm pattern above), with
  // `unmanageTypedName` holding the user's input until it matches the
  // key. `promotingKey` / `unmanagingKey` drive the per-row spinner so
  // the row's other actions can be visually disabled while the
  // request is in flight.
  const [promoteTarget, setPromoteTarget] = useState<SecretKey | null>(null);
  const [promotingKey, setPromotingKey] = useState<SecretKey | null>(null);
  const [unmanageTarget, setUnmanageTarget] = useState<SecretKey | null>(null);
  const [unmanageTypedName, setUnmanageTypedName] = useState("");
  const [unmanagingKey, setUnmanagingKey] = useState<SecretKey | null>(null);
  // `sessionsInvalidated` is only set when the dialog is opened by a
  // SESSION_SECRET rotation (Task #736). It drives the "you've been
  // logged out everywhere, including this tab" notice rendered inside
  // the existing copy-now dialog so the admin sees a heads-up before
  // the next API call returns 401 and bounces them to /login.
  const [generatedSecretsDialog, setGeneratedSecretsDialog] =
    useState<{
      sessionSecret?: string;
      encryptionKey?: string;
      sessionsInvalidated?: boolean;
    } | null>(null);

  const { data, isLoading } = useQuery<ConnectionsResponse>({
    queryKey: ["/api/db-connections"],
  });

  // Bootstrap snapshot drives the source-of-truth badge so the wording +
  // colour grammar match what EnvStatusPanel and the Setup wizard show
  // (task #372). On a 403/error the badge collapses to "Not set" via the
  // shared mapper, so the section keeps rendering.
  const { data: envStatus } = useQuery<EnvStatusSnapshot>({
    queryKey: ["/api/system/env-status"],
    retry: false,
  });
  const databaseUrlSource = mapDatabaseUrlSource(envStatus?.databaseUrlSource);

  // Storage configuration snapshot — drives the read-only "File storage"
  // row on the active connection card and the files-DB-follow-through
  // warning in the Set Active dialog. Admin-gated upstream; non-admins
  // get a 403 and the queries silently no-op (the UI just doesn't show
  // the storage row).
  const { data: storageConfig } = useQuery<StorageConfigSnapshot>({
    queryKey: ["storage-config"],
    queryFn: async () => {
      const response = await fetch("/api/admin/storage/config");
      if (!response.ok) throw new Error("forbidden");
      return response.json();
    },
    retry: false,
  });

  const addMutation = useMutation({
    mutationFn: async (body: { name: string; connectionUrl: string; notes: string; branch: string; isDefault: boolean }) => {
      // `apiRequest` already returns the parsed JSON body, so we
      // consume it directly and pick off `generatedSecrets`
      // (Task #719) — the server returns one-time values when it
      // lazy-generates SESSION_SECRET / ENCRYPTION_KEY for an
      // install that didn't have them yet.
      const json = await apiRequest("POST", "/api/db-connections", body);
      return json as { generatedSecrets?: { sessionSecret?: string; encryptionKey?: string } };
    },
    onSuccess: (json) => {
      queryClient.invalidateQueries({ queryKey: ["/api/db-connections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/system/env-status"] });
      setAddForm({ name: "", connectionUrl: "", notes: "", branch: "production", isDefault: false, driver: "auto" });
      if (json?.generatedSecrets && (json.generatedSecrets.sessionSecret || json.generatedSecrets.encryptionKey)) {
        // Hold the modal open until the operator dismisses the
        // generated-secrets dialog so they can't accidentally
        // navigate away before copying the values.
        setAddOpen(false);
        setGeneratedSecretsDialog(json.generatedSecrets);
      } else {
        setAddOpen(false);
        toast({ title: "Connection added" });
      }
    },
    onError: (e: any) => {
      showErrorToast("Failed to add connection", e.message);
    },
  });

  const revealMutation = useMutation({
    mutationFn: async (key: SecretKey) => {
      const json = await apiRequest("POST", "/api/system/secrets/reveal", { key });
      return json as { key: SecretKey; value: string; source: string };
    },
    onSuccess: (data) => {
      setRevealedValues((prev) => ({ ...prev, [data.key]: data.value }));
      // Auto-hide after 10s — matches the wizard's reveal timer so
      // an unattended browser doesn't leave the secret on screen.
      setTimeout(() => {
        setRevealedValues((prev) => {
          const n = { ...prev };
          delete n[data.key];
          return n;
        });
      }, 10000);
    },
    onError: (e: any) => {
      showErrorToast("Could not reveal secret", e.message);
    },
    onSettled: () => setRevealingKey(null),
  });

  const regenerateMutation = useMutation({
    mutationFn: async (key: SecretKey) => {
      const json = await apiRequest("POST", "/api/system/secrets/regenerate", {
        key,
        confirm: true,
      });
      return json as {
        key: SecretKey;
        value: string;
        source: string;
        reencrypted?: { tables: number; rows: number };
        // Server flag (Task #724/#736): when true, every existing
        // session — including the rotating admin's — has been
        // invalidated in-process, so the next API call from this
        // browser will 401 and the global handler will redirect to
        // /login. The dialog uses this to render an explicit notice
        // before the redirect happens.
        sessionsInvalidated?: boolean;
      };
    },
    onSuccess: (data) => {
      // Show the freshly generated value in the same one-time
      // dialog the post-create flow uses. Operator copies it into
      // their host secret manager; the masked Reveal row stays
      // available afterwards.
      setGeneratedSecretsDialog(
        data.key === "SESSION_SECRET"
          ? {
              sessionSecret: data.value,
              sessionsInvalidated: data.sessionsInvalidated === true,
            }
          : { encryptionKey: data.value },
      );
      setRegenerateTarget(null);
      queryClient.invalidateQueries({ queryKey: ["/api/system/env-status"] });
      // Force the rotation-status banner (Task #734) to fetch
      // immediately so it appears in the same tick as the success
      // dialog rather than waiting up to a poll-interval. The banner
      // itself only polls while `active` is true, so this single
      // invalidation is what hands off control from the click to the
      // banner's own refetch loop.
      queryClient.invalidateQueries({
        queryKey: ["/api/system/secrets/rotation-status"],
      });
      // Drop any cached reveal of the old value.
      setRevealedValues((prev) => {
        const n = { ...prev };
        delete n[data.key];
        return n;
      });
      const summary =
        data.reencrypted && (data.reencrypted.tables || data.reencrypted.rows)
          ? ` Re-encrypted ${data.reencrypted.rows} value(s) across ${data.reencrypted.tables} table(s).`
          : "";
      const logoutNotice =
        data.key === "SESSION_SECRET" && data.sessionsInvalidated === true
          ? " You've been logged out — sign in again after copying the new value."
          : "";
      toast({
        title: `${data.key} rotated`,
        description: `Save the new value before closing this dialog.${summary}${logoutNotice}`,
      });
    },
    onError: (e: any) => {
      showErrorToast("Rotation failed", e.message);
    },
    onSettled: () => setRegeneratingKey(null),
  });

  // Task #741: Promote a host-env-supplied secret into the encrypted
  // app file. Server pulls the value from its boot snapshot of the
  // host env and writes it to data/db-config.json, so the value
  // survives a container rebuild that drops the host env.
  //
  // SESSION_SECRET branch sets `sessionsInvalidated` exactly as the
  // regenerate flow does — the server runs the same hot-swap +
  // sign-everyone-out path, so we surface the same logout banner via
  // the existing generated-secrets dialog (used here purely as the
  // "you've been logged out" host since no fresh secret was created).
  const promoteMutation = useMutation({
    mutationFn: async (key: SecretKey) => {
      const json = await apiRequest("POST", "/api/system/secrets/promote", { key });
      return json as { key: SecretKey; source: string; sessionsInvalidated?: boolean };
    },
    onSuccess: (data) => {
      setPromoteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["/api/system/env-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/system/health"] });
      toast({
        title: `${data.key} promoted`,
        description:
          data.key === "SESSION_SECRET" && data.sessionsInvalidated
            ? "Stored in the app file. Every signed-in user (including this tab) has been logged out."
            : "Stored in the app file. It will now survive a container rebuild.",
      });
      if (data.key === "SESSION_SECRET" && data.sessionsInvalidated) {
        // Reuse the same logout-notice dialog the regenerate flow uses
        // so the admin sees the heads-up before the next API call 401s.
        setGeneratedSecretsDialog({ sessionsInvalidated: true });
      }
    },
    onError: (e: any) => {
      showErrorToast("Promote failed", e.message);
    },
    onSettled: () => setPromoteTarget(null),
  });

  // Task #741: Remove an app-file-managed secret so the host env
  // becomes the source of truth again. Server enforces a typed-
  // confirm match + several safety guards (env_not_set,
  // encryption_key_mismatch). When the server returns one of those
  // structured errors we surface the message inline rather than as
  // a generic toast so the operator can react without losing the
  // dialog state.
  const [unmanageError, setUnmanageError] = useState<string | null>(null);
  const unmanageMutation = useMutation({
    mutationFn: async (vars: { key: SecretKey; confirmName: string }) => {
      const json = await apiRequest("POST", "/api/system/secrets/unmanage", vars);
      return json as { key: SecretKey; source: string; sessionsInvalidated?: boolean };
    },
    onSuccess: (data) => {
      setUnmanageTarget(null);
      setUnmanageTypedName("");
      setUnmanageError(null);
      queryClient.invalidateQueries({ queryKey: ["/api/system/env-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/system/health"] });
      toast({
        title: `${data.key} removed from app file`,
        description:
          data.key === "SESSION_SECRET" && data.sessionsInvalidated
            ? "The host env value is now in use. Every signed-in user (including this tab) has been logged out."
            : "The host env value is now in use.",
      });
      if (data.key === "SESSION_SECRET" && data.sessionsInvalidated) {
        setGeneratedSecretsDialog({ sessionsInvalidated: true });
      }
    },
    onError: (e: any) => {
      // The api helper stringifies the body into the message; we keep
      // it visible inline next to the typed-confirm field so the
      // operator can fix-and-retry (e.g. set the host env then click
      // again) without dismissing the dialog.
      setUnmanageError(e?.message ?? "Unmanage failed");
    },
    onSettled: () => setUnmanagingKey(null),
  });

  function handleReveal(key: SecretKey) {
    if (revealedValues[key]) {
      // Toggle off
      setRevealedValues((prev) => {
        const n = { ...prev };
        delete n[key];
        return n;
      });
      return;
    }
    setRevealingKey(key);
    revealMutation.mutate(key);
  }

  async function handleCopySecret(key: SecretKey) {
    const cached = revealedValues[key];
    if (cached) {
      const ok = await safeCopyToClipboard(cached);
      toast({ title: ok ? "Copied" : "Copy failed", description: ok ? `${key} copied to clipboard.` : undefined });
      return;
    }
    // Fetch on demand — the user clicked Copy without first
    // revealing. Same audit trail (the server logs every reveal),
    // but the value never lands in component state.
    try {
      const json = (await apiRequest("POST", "/api/system/secrets/reveal", { key })) as { value: string };
      const ok = await safeCopyToClipboard(json.value);
      toast({ title: ok ? "Copied" : "Copy failed", description: ok ? `${key} copied to clipboard.` : undefined });
    } catch (e: any) {
      showErrorToast("Could not copy secret", e.message);
    }
  }

  const editMutation = useMutation({
    mutationFn: ({
      id,
      body,
      confirmPendingActive,
    }: {
      id: number;
      body: { name: string; connectionUrl?: string; notes: string; branch: string; isDefault: boolean };
      confirmPendingActive?: boolean;
    }) =>
      apiRequest(
        "PUT",
        `/api/db-connections/${id}${confirmPendingActive ? "?confirmPendingActive=1" : ""}`,
        body,
      ),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/db-connections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/db-connections/pending-active"] });
      setEditTarget(null);
      setPendingActiveConfirm(null);
      setPendingActiveTypedName("");
      if (vars.confirmPendingActive) {
        toast({
          title: "URL change queued for next restart",
          description:
            "The app keeps running on the old URL until you restart it from this page.",
        });
      } else {
        toast({ title: "Connection updated" });
      }
    },
    onError: (e: any) => {
      // Server returns errorCode: pending_active_required when the
      // active row's URL is edited without ?confirmPendingActive=1.
      let errorCode: string | undefined;
      let serverMsg: string | undefined;
      try {
        const parsed = JSON.parse((e?.message ?? "").replace(/^[^:]+:\s*/, ""));
        errorCode = parsed?.errorCode;
        serverMsg = parsed?.message;
      } catch {
        // body wasn't JSON — fall through to default toast
      }
      if (errorCode === "pending_active_required") {
        showErrorToast(
          "Confirmation required",
          serverMsg ??
            "Changing the active connection's URL needs typed confirmation. Reopen the edit dialog and try again.",
        );
        return;
      }
      showErrorToast("Failed to update connection", e.message);
    },
  });

  // Pending-active state — drives the yellow banner and the
  // per-row "Set Active for next restart" button.
  interface PendingActiveResponse {
    pending: null | {
      id: number | null;
      name: string;
      branch: string;
      kind: "url-edit" | "switch";
    };
  }
  const { data: pendingActiveData } = useQuery<PendingActiveResponse>({
    queryKey: ["/api/db-connections/pending-active"],
    refetchOnWindowFocus: true,
  });
  const pendingActive = pendingActiveData?.pending ?? null;

  const setPendingActiveMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/db-connections/${id}/set-pending-active`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/db-connections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/db-connections/pending-active"] });
      toast({
        title: "Switch queued for next restart",
        description:
          "The app keeps running on the current connection until you restart the server.",
      });
    },
    onError: (e: any) => {
      showErrorToast("Could not queue the switch", e.message);
    },
  });

  const cancelPendingActiveMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/db-connections/pending-active"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/db-connections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/db-connections/pending-active"] });
      toast({ title: "Pending switch cancelled" });
    },
    onError: (e: any) => {
      showErrorToast("Could not cancel pending switch", e.message);
    },
  });

  // Per-row "Set Active for next restart" confirm gate.
  const [setPendingTarget, setSetPendingTarget] = useState<DbConnectionRecord | null>(null);

  // Banner dismiss is non-destructive: hides the notice for this
  // session without cancelling the pending switch. Reappears on
  // page reload or whenever the pending target changes.
  const [pendingBannerDismissed, setPendingBannerDismissed] = useState(false);
  const dismissedKey = pendingActive
    ? `${pendingActive.id ?? "null"}:${pendingActive.kind}`
    : "";
  useEffect(() => {
    setPendingBannerDismissed(false);
  }, [dismissedKey]);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/db-connections/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/db-connections"] });
      toast({ title: "Connection deleted" });
    },
    onError: (e: any) => {
      showErrorToast("Cannot delete", e.message);
    },
  });

  async function handleRevealConnection(id: number) {
    if (revealedConnections[id]) {
      setRevealedConnections((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
      return;
    }
    setRevealingConnectionId(id);
    try {
      // `apiRequest` returns the parsed JSON body directly — calling
      // `.json()` on it would throw `TypeError: res.json is not a
      // function` and silently bounce into the catch branch (the same
      // antipattern fixed for the bootstrap-secrets card in #749 and
      // swept across the rest of the app in #754).
      const json = (await apiRequest("POST", `/api/db-connections/${id}/reveal`)) as { connectionUrl: string };
      setRevealedConnections((prev) => ({ ...prev, [id]: json.connectionUrl }));
      // Auto-mask after 10 seconds — same window the bootstrap
      // secrets reveal uses for consistency.
      window.setTimeout(() => {
        setRevealedConnections((prev) => {
          const n = { ...prev };
          delete n[id];
          return n;
        });
      }, 10_000);
    } catch (e: any) {
      showErrorToast("Could not reveal connection URL", e.message);
    } finally {
      setRevealingConnectionId(null);
    }
  }

  async function handleCopyConnection(id: number) {
    const cached = revealedConnections[id];
    if (cached) {
      const ok = await safeCopyToClipboard(cached);
      toast({ title: ok ? "Copied" : "Copy failed", description: ok ? "Connection URL copied to clipboard." : undefined });
      return;
    }
    try {
      // `apiRequest` returns the parsed JSON body directly (task #754).
      const json = (await apiRequest("POST", `/api/db-connections/${id}/reveal`)) as { connectionUrl: string };
      const ok = await safeCopyToClipboard(json.connectionUrl);
      toast({ title: ok ? "Copied" : "Copy failed", description: ok ? "Connection URL copied to clipboard." : undefined });
    } catch (e: any) {
      showErrorToast("Could not copy connection URL", e.message);
    }
  }

  async function handleTest(id: number) {
    setTestingId(id);
    try {
      // `apiRequest` returns the parsed JSON body directly (task #754).
      const result = await apiRequest("POST", `/api/db-connections/${id}/test`);
      setTestResults((prev) => ({ ...prev, [id]: result }));
      queryClient.invalidateQueries({ queryKey: ["/api/db-connections"] });
    } catch {
      setTestResults((prev) => ({ ...prev, [id]: { success: false, latencyMs: 0, error: "Request failed" } }));
    } finally {
      setTestingId(null);
      setTimeout(() => setTestResults((prev) => { const n = { ...prev }; delete n[id]; return n; }), 6000);
    }
  }

  async function handleRestart() {
    setRestarting(true);
    try {
      await apiRequest("POST", "/api/db-connections/restart");
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } catch {
      setRestarting(false);
      showErrorToast("Restart failed", "Could not restart the server.");
    }
  }

  function openEdit(conn: DbConnectionRecord) {
    setEditTarget(conn);
    // Seed the dropdown from the saved row's `driverOverride`
    // (Task #484) so editing a connection that was originally saved
    // with a forced driver doesn't silently reset the selector to
    // "auto" the moment the dialog opens. The selection only takes
    // effect when the operator actually types a replacement URL —
    // leaving the URL field blank keeps the existing stored value
    // (driver param included) untouched, matching the "leave blank
    // to keep" contract spelled out in the dialog copy below.
    setEditForm({ name: conn.name, connectionUrl: "", notes: conn.notes ?? "", branch: conn.branch || "production", isDefault: conn.isDefault, driver: conn.driverOverride ?? "auto" });
  }

  return (
    <div className="space-y-4">
      <Card className="relative overflow-hidden">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <DatabaseZap className="h-5 w-5 text-primary" />
                Database Connections
              </CardTitle>
              <CardDescription className="pt-1.5">
                Manage named PostgreSQL connections, test connectivity, and switch the active database.
              </CardDescription>
            </div>
            <Button variant="default" size="sm" onClick={() => setAddOpen(true)} className="gap-1.5 shrink-0">
              <DatabaseZap className="w-4 h-4" /> Add Database Connection
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-1.5">
          <DecorativeCardIcon icon={DatabaseZap} />
          <div className="relative z-10 space-y-3">
          <div
            className="flex flex-wrap items-center gap-2 p-3 rounded-lg border bg-muted/40 text-sm"
            data-testid="db-connections-active-source-row"
          >
            <Circle className="w-3 h-3 fill-green-500 text-green-500 shrink-0" />
            <span className="text-muted-foreground">Active source:</span>
            <span className="font-mono text-xs text-gray-900 dark:text-gray-100">
              DATABASE_URL
            </span>
            <FieldSourceBadge
              source={databaseUrlSource}
              testId="field-source-badge-database-url"
            />
          </div>

          {restartRequired && (
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 text-sm">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-amber-800 dark:text-amber-300">Restart required to apply the new active connection.</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-amber-500/50 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-950/40 shrink-0"
                onClick={handleRestart}
                disabled={restarting}
              >
                {restarting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                {restarting ? "Restarting..." : "Restart Server"}
              </Button>
            </div>
          )}

          {pendingActive && !pendingBannerDismissed && (
            <div
              className="flex items-start justify-between gap-3 p-3 rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 text-sm"
              data-testid="pending-active-banner"
            >
              <div className="flex items-start gap-2 min-w-0">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1 min-w-0">
                  <div className="font-medium text-amber-900 dark:text-amber-200">
                    {pendingActive.kind === "url-edit"
                      ? `URL change queued on "${pendingActive.name}" — restart required`
                      : `Switch queued: "${pendingActive.name}" (${pendingActive.branch}) — restart required`}
                  </div>
                  <div className="text-amber-800 dark:text-amber-300 text-xs">
                    The app is still running on the current connection.
                    Restart the server to apply the change. Your data
                    does not move automatically.
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setPendingBannerDismissed(true)}
                      className="text-xs underline text-amber-800 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-200"
                      data-testid="btn-dismiss-pending-active"
                      title="Hide this notice without cancelling the pending switch"
                    >
                      Dismiss notice
                    </button>
                    <button
                      type="button"
                      onClick={() => cancelPendingActiveMutation.mutate()}
                      disabled={cancelPendingActiveMutation.isPending}
                      className="text-xs underline text-amber-800 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-200 disabled:opacity-50"
                      data-testid="btn-cancel-pending-active"
                    >
                      {cancelPendingActiveMutation.isPending
                        ? "Cancelling..."
                        : "Cancel pending switch"}
                    </button>
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-amber-500/50 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-950/40 shrink-0"
                onClick={handleRestart}
                disabled={restarting}
                data-testid="btn-restart-for-pending-active"
              >
                {restarting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                {restarting ? "Restarting..." : "Restart Server"}
              </Button>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading connections...
            </div>
          ) : !data?.connections.length ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No connections saved yet. Add one to get started.
            </div>
          ) : (
            <div className="space-y-4">
              {BRANCH_OPTIONS.map((group) => {
                const items = (data?.connections ?? []).filter(c => (c.branch || "production") === group.value);
                if (items.length === 0) return null;
                const GroupIcon = group.icon;
                const isCollapsed = collapsedGroups.has(group.value);
                return (
                  <div key={group.value}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.value)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-semibold mb-2 cursor-pointer hover:opacity-80 transition-opacity ${group.colorClasses}`}
                    >
                      <GroupIcon className="h-3.5 w-3.5 shrink-0" />
                      {group.label}
                      <span className="px-1.5 py-0.5 rounded-full bg-white/50 dark:bg-black/20 text-[10px] font-medium">
                        {items.length}
                      </span>
                      <span className="flex-1" />
                      {isCollapsed
                        ? <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                        : <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                      }
                    </button>
                    {!isCollapsed && (
                    <div className="space-y-2">
                      {items.map((conn) => {
                        // Delete is disabled when the row is the currently
                        // active connection OR is marked isSystem (the
                        // bootstrap row, which the server also refuses).
                        // We surface the right tooltip for each case so
                        // operators understand why the button is locked.
                        const deleteDisabled = conn.isActive || conn.isSystem;
                        const deleteDisabledReason = conn.isActive
                          ? "Switch to a different connection before deleting this one"
                          : conn.isSystem
                            ? "System connections cannot be deleted"
                            : "";
                        return (
                          <div key={conn.id} className={`border rounded-lg p-4 space-y-2 ${group.itemColorClasses}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                <GroupIcon className={`h-3.5 w-3.5 shrink-0 ${group.iconColorClass}`} />
                                <span className="font-medium text-sm truncate">{conn.name}</span>
                                {conn.isDefault && (
                                  <Badge variant="secondary" className="text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700">
                                    <Star className="w-2.5 h-2.5 mr-1" />
                                    Default
                                  </Badge>
                                )}
                                {conn.isActive && (
                                  <Badge variant="default" className="text-xs shrink-0">Active</Badge>
                                )}
                                {/* Driver badge (Task #484): Auto / Neon / Postgres.
                                    Always rendered (including for "Auto") because the audit signal
                                    the task is after is being able to tell at a glance whether a row
                                    is auto-detect or a forced override. */}
                                <Badge
                                  variant="outline"
                                  className={`text-xs shrink-0 ${DRIVER_BADGE[conn.driverOverride ?? "auto"].classes}`}
                                  title={
                                    conn.driverOverride === "auto"
                                      ? "Driver auto-detected from hostname"
                                      : conn.driverOverride === "neon"
                                        ? "Forced Neon WebSocket driver (?driver=neon)"
                                        : "Forced standard Postgres driver (?driver=pg)"
                                  }
                                  data-testid={`badge-driver-${conn.id}`}
                                >
                                  Driver: {DRIVER_BADGE[conn.driverOverride ?? "auto"].label}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0"
                                  onClick={() => handleTest(conn.id)}
                                  disabled={testingId === conn.id}
                                  title="Test Database Connection"
                                >
                                  {testingId === conn.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MonitorCheck className="w-3.5 h-3.5" />}
                                </Button>
                                {!conn.isActive && (
                                  // Task #740: the canonical way to switch DBs is
                                  // the pending-active flow — queue the swap,
                                  // restart manually. Disabled when a different
                                  // switch is already queued so the operator never
                                  // has two pending swaps in flight.
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => setSetPendingTarget(conn)}
                                    disabled={
                                      setPendingActiveMutation.isPending ||
                                      (pendingActive !== null &&
                                        !(pendingActive.id === conn.id ||
                                          (pendingActive.id === null && pendingActive.name === conn.name)))
                                    }
                                    title={
                                      pendingActive &&
                                      !(pendingActive.id === conn.id ||
                                        (pendingActive.id === null && pendingActive.name === conn.name))
                                        ? "Cancel the pending switch first"
                                        : "Queue this connection for the next restart"
                                    }
                                    data-testid={`db-conn-set-pending-active-${conn.id}`}
                                  >
                                    {setPendingActiveMutation.isPending && setPendingTarget?.id === conn.id
                                      ? <Loader2 className="w-3 h-3 animate-spin" />
                                      : <><Zap className="w-3 h-3 mr-1" />Set Active</>}
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0"
                                  onClick={() => handleRevealConnection(conn.id)}
                                  disabled={revealingConnectionId === conn.id}
                                  title={revealedConnections[conn.id] ? "Hide connection URL" : "Reveal connection URL for 10s"}
                                  data-testid={`db-conn-reveal-${conn.id}`}
                                >
                                  {revealingConnectionId === conn.id
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : revealedConnections[conn.id]
                                      ? <EyeOff className="w-3.5 h-3.5" />
                                      : <Eye className="w-3.5 h-3.5" />}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0"
                                  onClick={() => handleCopyConnection(conn.id)}
                                  title="Copy connection URL"
                                  data-testid={`db-conn-copy-${conn.id}`}
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(conn)}>
                                  <SquarePen className="w-3.5 h-3.5" />
                                </Button>
                                {deleteDisabled ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-muted-foreground cursor-not-allowed"
                                    disabled
                                    title={deleteDisabledReason}
                                    data-testid={`db-conn-delete-disabled-${conn.id}`}
                                  >
                                    <Lock className="w-3.5 h-3.5" />
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                    onClick={() => deleteMutation.mutate(conn.id)}
                                    disabled={deleteMutation.isPending}
                                    title="Delete this connection"
                                    data-testid={`db-conn-delete-${conn.id}`}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </div>
                            </div>

                            <p
                              className="text-xs text-muted-foreground font-mono truncate"
                              data-testid={`db-conn-url-${conn.id}`}
                            >
                              {revealedConnections[conn.id] ?? conn.connectionUrlPreview}
                            </p>

                            {conn.notes && (
                              <p className="text-xs text-muted-foreground">{conn.notes}</p>
                            )}

                            <div className="flex items-center gap-2 flex-wrap">
                              {testResults[conn.id] && (
                                <span className={`text-xs flex items-center gap-1 ${testResults[conn.id].success ? "text-green-700" : "text-red-600"}`}>
                                  {testResults[conn.id].success
                                    ? <><CheckCircle className="w-3 h-3" />{testResults[conn.id].latencyMs}ms</>
                                    : <><XCircle className="w-3 h-3" />{testResults[conn.id].error || "Failed"}</>}
                                </span>
                              )}
                              {conn.lastTestedAt && !testResults[conn.id] && (
                                <span className={`text-xs flex items-center gap-1 ${conn.lastTestSuccess ? "text-green-700" : "text-red-600"}`}>
                                  {conn.lastTestSuccess
                                    ? <><CheckCircle className="w-3 h-3" />{conn.lastTestLatencyMs}ms</>
                                    : <><XCircle className="w-3 h-3" />Failed</>}
                                  <span className="text-muted-foreground">&middot; {timeAgo(conn.lastTestedAt)}</span>
                                </span>
                              )}
                            </div>

                            {/* FYI-only "File storage" row — surfaces what the
                                active Storage Provider is (and, for the DB
                                provider, which files DB it resolves to)
                                without making it editable here. Edited in
                                Storage Providers. Shown only on the active
                                row so the panel doesn't get noisy. */}
                            {conn.isActive && storageConfig && (
                              <div className="mt-1 rounded border border-blue-200/70 dark:border-blue-900/70 bg-blue-50/40 dark:bg-blue-950/20 px-3 py-2 text-xs space-y-1">
                                <div className="flex items-center gap-1.5 text-blue-900 dark:text-blue-200">
                                  <HardDrive className="h-3.5 w-3.5" />
                                  <span className="font-medium">File storage:</span>
                                  <span>{storageProviderLabel(storageConfig.activeProvider)}</span>
                                </div>
                                {storageConfig.activeProvider === "db" && storageConfig.filesDb && (
                                  <div className="ml-5 text-muted-foreground space-y-0.5">
                                    <div>
                                      Files database:{" "}
                                      <code className="bg-background px-1 rounded text-[10px]">
                                        {storageConfig.filesDb.dbName ?? "(not initialized)"}
                                      </code>
                                      {storageConfig.filesDb.source === "override" && (
                                        <Badge variant="outline" className="ml-1.5 text-[10px] py-0">
                                          FILES_DATABASE_URL override
                                        </Badge>
                                      )}
                                      {storageConfig.filesDb.source === "derived" && (
                                        <Badge variant="outline" className="ml-1.5 text-[10px] py-0">
                                          Derived from this connection
                                        </Badge>
                                      )}
                                    </div>
                                    {!storageConfig.filesDb.ready && storageConfig.filesDb.error && (
                                      <div className="text-red-600 dark:text-red-400">
                                        Not ready — {storageConfig.filesDb.error}
                                      </div>
                                    )}
                                  </div>
                                )}
                                <div className="ml-5 text-muted-foreground">
                                  Manage in{" "}
                                  <a
                                    href="/admin?tab=storage-providers"
                                    className="text-blue-700 dark:text-blue-300 hover:underline"
                                  >
                                    Storage Providers
                                  </a>
                                  .
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          </div>
        </CardContent>
      </Card>

      {/* Bootstrap Secrets subsection (Task #719 + Task #739).
          Surfaces the two file-managed secrets the wizard generates
          (SESSION_SECRET + ENCRYPTION_KEY) so admins can audit, copy,
          and rotate them from the same panel that owns the database
          connection. The card now ALWAYS renders (Task #739) so
          env-managed installs see obfuscated rows for the two
          secrets too — that lets the operator confirm what's in use
          and use the "Promote to file" affordance to take ownership
          inside the app. */}
      {envStatus && (
          <Card className="relative overflow-hidden">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-2xl">
                <KeyRound className="h-5 w-5 text-primary" />
                Bootstrap Secrets
              </CardTitle>
              <CardDescription className="pt-1.5">
                The session and encryption keys that secure cookies and stored credentials.
                Reveal them once to copy into your host secret manager, or rotate to issue fresh values.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-1.5">
              <DecorativeCardIcon icon={KeyRound} />
              <div className="relative z-10 space-y-3">
                {/* Live "rotation in progress" banner (Task #734). Mounted
                    inside the bootstrap-secrets card so it sits directly
                    above the same Rotate button that triggered it; the
                    component renders nothing while no rotation tail is
                    active, so steady-state operators see no extra chrome. */}
                <RotationStatusBanner />
                {(["SESSION_SECRET", "ENCRYPTION_KEY"] as const).map((key) => {
                  const source =
                    key === "SESSION_SECRET"
                      ? envStatus.sessionSecretSource
                      : envStatus.encryptionKeySource;
                  const revealed = revealedValues[key];
                  const isRevealing = revealingKey === key;
                  const isRegenerating = regeneratingKey === key;
                  const isFile = source === "file";
                  const isEnv = source === "env";
                  return (
                    <div
                      key={key}
                      className="border rounded-lg p-4 space-y-2 bg-muted/20"
                      data-testid={`bootstrap-secret-${key.toLowerCase()}`}
                    >
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-semibold">{SECRET_LABELS[key].title}</span>
                            <Badge
                              variant="outline"
                              className={
                                isFile
                                  ? "text-xs bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300 border-green-200 dark:border-green-800"
                                  : isEnv
                                    ? "text-xs bg-zinc-100 text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700"
                                    : "text-xs bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                              }
                            >
                              {isFile ? "From wizard file" : isEnv ? "From host env" : "Not generated"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {SECRET_LABELS[key].description}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => handleReveal(key)}
                            disabled={!isFile || isRevealing}
                            title={
                              isFile
                                ? revealed
                                  ? "Hide value"
                                  : "Reveal value for 10 seconds"
                                : isEnv
                                  ? "Managed by host env — view in your secret manager"
                                  : "Not yet generated"
                            }
                            data-testid={`button-reveal-${key.toLowerCase()}`}
                          >
                            {isRevealing ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : revealed ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => handleCopySecret(key)}
                            disabled={!isFile}
                            title={isFile ? "Copy value to clipboard" : "Cannot copy — managed elsewhere"}
                            data-testid={`button-copy-${key.toLowerCase()}`}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                          {/* Task #741: Promote — copy the host-env value
                              into data/db-config.json so it survives a
                              container rebuild. Only meaningful when the
                              row is currently sourced from the host env;
                              hidden otherwise to keep the action bar from
                              gaining a permanently-disabled button. */}
                          {isEnv && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs gap-1.5"
                              onClick={() => setPromoteTarget(key)}
                              disabled={promotingKey === key || promoteMutation.isPending}
                              title="Promote to app file — store the host env value in data/db-config.json so it survives container rebuilds"
                              data-testid={`button-promote-${key.toLowerCase()}`}
                            >
                              {promotingKey === key ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <ArrowDownFromLine className="w-3.5 h-3.5" />
                              )}
                              <span>Promote to app file</span>
                            </Button>
                          )}
                          {/* Task #741: Unmanage — remove the file-managed
                              copy so the host env becomes the source of
                              truth again. Only shown when source === 'file'
                              and gated by the typed-confirm dialog below. */}
                          {isFile && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs gap-1.5"
                              onClick={() => {
                                setUnmanageError(null);
                                setUnmanageTypedName("");
                                setUnmanageTarget(key);
                              }}
                              disabled={unmanagingKey === key || unmanageMutation.isPending}
                              title="Unmanage from app — delete the app-file copy and fall back to the host env value"
                              data-testid={`button-unmanage-${key.toLowerCase()}`}
                            >
                              {unmanagingKey === key ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <ArrowUpToLine className="w-3.5 h-3.5" />
                              )}
                              <span>Unmanage from app</span>
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={() => setRegenerateTarget(key)}
                            disabled={isEnv || source === "none" || isRegenerating}
                            title={
                              isEnv
                                ? "Managed by host env — rotate in your secret manager"
                                : source === "none"
                                  ? "Not generated yet — save a database connection first"
                                  : "Generate a fresh value (irreversible)"
                            }
                            data-testid={`button-regenerate-${key.toLowerCase()}`}
                          >
                            {isRegenerating ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        </div>
                      </div>
                      <div
                        className="font-mono text-xs break-all p-2 rounded bg-background border"
                        data-testid={`secret-value-${key.toLowerCase()}`}
                      >
                        {revealed ? (
                          <span className="text-foreground">{revealed}</span>
                        ) : (
                          <span className="text-muted-foreground">{"•".repeat(48)}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {(envStatus.sessionSecretSource === "none" ||
                  envStatus.encryptionKeySource === "none") && (
                  <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 text-xs">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span className="text-amber-800 dark:text-amber-300">
                      One or more bootstrap secrets have not been generated yet. They will be created automatically
                      the next time you save a database connection.
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DatabaseZap className="w-5 h-5" />
              Add Database Connection
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {envStatus &&
              (envStatus.sessionSecretSource === "none" ||
                envStatus.encryptionKeySource === "none") && (
                <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 text-xs">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-amber-800 dark:text-amber-300">
                    <strong>New bootstrap secrets will be generated.</strong>{" "}
                    {envStatus.sessionSecretSource === "none" && envStatus.encryptionKeySource === "none"
                      ? "SESSION_SECRET and ENCRYPTION_KEY are missing"
                      : envStatus.sessionSecretSource === "none"
                        ? "SESSION_SECRET is missing"
                        : "ENCRYPTION_KEY is missing"}{" "}
                    on this install. Saving will create fresh value(s) and show them once for you to copy into your host secret manager.
                  </div>
                </div>
              )}
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                placeholder="e.g. Production, Staging, Neon Dev"
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Connection URL</Label>
              <Input
                type="password"
                placeholder="postgresql://user:password@host:5432/dbname"
                value={addForm.connectionUrl}
                onChange={(e) => {
                  const url = e.target.value;
                  setAddForm((f) => ({ ...f, connectionUrl: url, driver: readDriverChoice(url) }));
                }}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">Stored encrypted with AES-256-GCM</p>
            </div>
            <div className="space-y-2">
              <Label>Database Driver</Label>
              <Select
                value={addForm.driver}
                onValueChange={(val) => setAddForm((f) => ({ ...f, driver: val as DriverChoice }))}
              >
                <SelectTrigger data-testid="select-add-conn-driver">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto-detect (recommended)</SelectItem>
                  <SelectItem value="neon">Neon WebSocket</SelectItem>
                  <SelectItem value="pg">Standard Postgres</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Auto-detect picks Neon for <code className="font-mono">*.neon.tech</code> hostnames and standard Postgres for everything else. Override only if your DB is fronted by a proxy.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Description or notes about this connection"
                value={addForm.notes}
                onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Branch</Label>
              <Select value={addForm.branch} onValueChange={(val) => setAddForm((f) => ({ ...f, branch: val }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {BRANCH_OPTIONS.map((opt) => {
                    const OptIcon = opt.icon;
                    return (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex items-center gap-2">
                          <OptIcon className="h-4 w-4" />
                          {opt.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="add-conn-default"
                className="h-4 w-4 rounded border-gray-300 accent-indigo-600"
                checked={addForm.isDefault}
                onChange={(e) => setAddForm((f) => ({ ...f, isDefault: e.target.checked }))}
              />
              <Label htmlFor="add-conn-default" className="cursor-pointer font-normal">Set as default for this branch</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              <X className="w-4 h-4 mr-1.5" /> Cancel
            </Button>
            <Button
              onClick={() => addMutation.mutate({
                name: addForm.name,
                // Fold the dropdown choice into the URL just before
                // POST so the encrypted store carries the override
                // (existing `stripDriverParam` on the server peels it
                // back off when the URL is handed to the pool driver).
                connectionUrl: applyDriverChoice(addForm.connectionUrl, addForm.driver),
                notes: addForm.notes,
                branch: addForm.branch,
                isDefault: addForm.isDefault,
              })}
              disabled={addMutation.isPending || !addForm.name || !addForm.connectionUrl}
            >
              {addMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
              Save Connection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SquarePen className="w-5 h-5" />
              Edit Database Connection
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Connection URL</Label>
              {editTarget && (
                <p className="text-xs text-muted-foreground font-mono">{editTarget.connectionUrlPreview}</p>
              )}
              <Input
                type="password"
                placeholder="Leave blank to keep existing connection URL"
                value={editForm.connectionUrl}
                onChange={(e) => {
                  const url = e.target.value;
                  setEditForm((f) => ({
                    ...f,
                    connectionUrl: url,
                    driver: url ? readDriverChoice(url) : f.driver,
                  }));
                }}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">Only enter a new URL if you want to replace the stored one</p>
            </div>
            <div className="space-y-2">
              <Label>Database Driver</Label>
              <Select
                value={editForm.driver}
                onValueChange={(val) => setEditForm((f) => ({ ...f, driver: val as DriverChoice }))}
              >
                <SelectTrigger data-testid="select-edit-conn-driver">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto-detect (recommended)</SelectItem>
                  <SelectItem value="neon">Neon WebSocket</SelectItem>
                  <SelectItem value="pg">Standard Postgres</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Only applied when you also enter a replacement URL above. Auto-detect picks Neon for <code className="font-mono">*.neon.tech</code> hostnames and standard Postgres for everything else.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={editForm.notes}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Branch</Label>
              <Select value={editForm.branch} onValueChange={(val) => setEditForm((f) => ({ ...f, branch: val }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {BRANCH_OPTIONS.map((opt) => {
                    const OptIcon = opt.icon;
                    return (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex items-center gap-2">
                          <OptIcon className="h-4 w-4" />
                          {opt.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-conn-default"
                className="h-4 w-4 rounded border-gray-300 accent-indigo-600"
                checked={editForm.isDefault}
                onChange={(e) => setEditForm((f) => ({ ...f, isDefault: e.target.checked }))}
              />
              <Label htmlFor="edit-conn-default" className="cursor-pointer font-normal">Set as default for this branch</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              <X className="w-4 h-4 mr-1.5" /> Cancel
            </Button>
            <Button
              onClick={() => {
                if (!editTarget) return;
                const body: { name: string; notes: string; branch: string; isDefault: boolean; connectionUrl?: string } = {
                  name: editForm.name,
                  notes: editForm.notes,
                  branch: editForm.branch,
                  isDefault: editForm.isDefault,
                };
                if (editForm.connectionUrl.trim()) {
                  // Driver dropdown only applies when a replacement
                  // URL is actually being saved — leaving the URL
                  // blank keeps the existing stored URL (and its
                  // existing `?driver=` override, if any) untouched.
                  body.connectionUrl = applyDriverChoice(editForm.connectionUrl.trim(), editForm.driver);
                }
                // Typed-confirmation gate: changing the URL on the
                // currently-active row requires the operator to type
                // the connection's name first. Other edits (name,
                // branch, notes, default flag) save immediately.
                if (editTarget.isActive && body.connectionUrl) {
                  setPendingActiveConfirm({
                    targetId: editTarget.id,
                    targetName: editTarget.name,
                    body,
                  });
                  setPendingActiveTypedName("");
                  return;
                }
                editMutation.mutate({ id: editTarget.id, body });
              }}
              disabled={editMutation.isPending || !editForm.name}
            >
              {editMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task #740: confirm dialog for the per-row "Set Active for
          next restart" button. Lighter-weight than the typed-confirm
          modal below — switching to a different non-active row is
          recoverable (just hit "Cancel pending switch" before
          restarting), so a single OK is enough. */}
      <Dialog
        open={!!setPendingTarget}
        onOpenChange={(open) => !open && setSetPendingTarget(null)}
      >
        <DialogContent className="max-w-lg" data-testid="dialog-set-pending-active">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-600" />
              Queue this connection for next restart?
            </DialogTitle>
            <DialogDescription className="pt-2 space-y-2">
              <span className="block">
                On the next restart, the app will boot against{" "}
                <span className="font-mono font-semibold">
                  {setPendingTarget?.name ?? ""}
                </span>{" "}
                ({setPendingTarget?.branch ?? ""}). Until then, it
                keeps using the current connection.
              </span>
              <span className="block text-amber-700 dark:text-amber-400">
                Your data does NOT move automatically. Make sure the
                target database has the schema and data you expect.
              </span>
              {/* Files DB follow-through reminder — only shown when the
                  Storage Provider is `db` AND the files DB is derived
                  from the active main connection (the case where a
                  swap actually moves the files DB). If
                  FILES_DATABASE_URL is in play, the override wins on
                  the new main DB too, so no reminder is needed. */}
              {storageConfig?.activeProvider === "db"
                && storageConfig.filesDb?.source === "derived" && (
                <span className="block rounded border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30 p-2 text-blue-900 dark:text-blue-200">
                  <span className="flex items-center gap-1 font-medium">
                    <HardDrive className="w-3.5 h-3.5" />
                    File storage will follow this connection
                  </span>
                  <span className="block mt-1">
                    Your Storage Provider is set to{" "}
                    <strong>Database</strong>, derived from the active
                    main connection. On restart, the files DB will become{" "}
                    <code className="bg-background px-1 rounded text-[11px]">
                      {setPendingTarget?.name
                        ? setPendingTarget.name.toLowerCase().replace(/[^a-z0-9]+/g, "_") + "_files"
                        : "<new_main>_files"}
                    </code>{" "}
                    on the new server.
                    Existing uploads stored in the previous{" "}
                    <code className="bg-background px-1 rounded text-[11px]">
                      {storageConfig.filesDb.dbName ?? "<old_main>_files"}
                    </code>{" "}
                    <strong>will not move automatically</strong> — back them up and restore them onto the new server, or set{" "}
                    <code className="bg-background px-1 rounded text-[11px]">FILES_DATABASE_URL</code>{" "}
                    to pin the files DB to its current location regardless of which main connection is active.
                  </span>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSetPendingTarget(null)}>
              <X className="w-4 h-4 mr-1.5" /> Cancel
            </Button>
            <Button
              onClick={() => {
                if (!setPendingTarget) return;
                setPendingActiveMutation.mutate(setPendingTarget.id, {
                  onSuccess: () => setSetPendingTarget(null),
                });
              }}
              disabled={setPendingActiveMutation.isPending}
              data-testid="btn-set-pending-active-confirm"
            >
              {setPendingActiveMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Zap className="w-4 h-4 mr-1.5" />
              )}
              Queue for next restart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Typed-confirmation modal for editing the URL of the
          currently-active connection. The operator must type the
          connection's name verbatim to enable Confirm. Confirming
          re-issues the PUT with `?confirmPendingActive=1`, which on
          the server captures the prior URL, writes the new one, and
          queues the active-row swap for the next restart (Task
          #740). The app keeps running on the old URL until the
          operator restarts it. */}
      <Dialog
        open={!!pendingActiveConfirm}
        onOpenChange={(open) => {
          if (!open) {
            setPendingActiveConfirm(null);
            setPendingActiveTypedName("");
          }
        }}
      >
        <DialogContent className="max-w-lg" data-testid="dialog-active-url-confirm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-destructive" />
              Queue URL change for next restart?
            </DialogTitle>
            <DialogDescription className="pt-2 space-y-2">
              <span className="block">
                You're changing the database URL on the connection the
                app is currently running against. The app will keep
                using the old URL until you restart it — the new URL
                takes effect on the next boot. Your data does NOT
                move; make sure the new database has the schema and
                data you expect.
              </span>
              <span className="block text-amber-700 dark:text-amber-400">
                Type the connection name to confirm:{" "}
                <span className="font-mono font-semibold">
                  {pendingActiveConfirm?.targetName ?? ""}
                </span>
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="active-url-confirm-name">Connection name</Label>
            <Input
              id="active-url-confirm-name"
              value={pendingActiveTypedName}
              onChange={(e) => setPendingActiveTypedName(e.target.value)}
              placeholder={pendingActiveConfirm?.targetName ?? ""}
              autoComplete="off"
              data-testid="input-active-url-confirm-name"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPendingActiveConfirm(null);
                setPendingActiveTypedName("");
              }}
            >
              <X className="w-4 h-4 mr-1.5" /> Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                !pendingActiveConfirm ||
                pendingActiveTypedName.trim() !== pendingActiveConfirm.targetName ||
                editMutation.isPending
              }
              onClick={() => {
                if (!pendingActiveConfirm) return;
                editMutation.mutate({
                  id: pendingActiveConfirm.targetId,
                  body: pendingActiveConfirm.body,
                  confirmPendingActive: true,
                });
              }}
              data-testid="btn-active-url-confirm"
            >
              {editMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <ShieldAlert className="w-4 h-4 mr-1.5" />
              )}
              Queue for next restart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Regenerate confirmation dialog. Two-step click-through (open
          → "Yes, rotate") plus a server-side `confirm: true` flag is
          deliberate — accidental rotation of ENCRYPTION_KEY would
          require the operator to re-enter every credential or restore
          from a backup. */}
      <Dialog open={!!regenerateTarget} onOpenChange={(open) => !open && setRegenerateTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-destructive" />
              Rotate {regenerateTarget}?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <p>{regenerateTarget && SECRET_LABELS[regenerateTarget].description}</p>
            {regenerateTarget === "SESSION_SECRET" && (
              <div className="flex items-start gap-2 p-3 rounded-md border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span className="text-amber-800 dark:text-amber-300">
                  Every signed-in user will be logged out the moment you confirm.
                </span>
              </div>
            )}
            {regenerateTarget === "ENCRYPTION_KEY" && (
              <div className="flex items-start gap-2 p-3 rounded-md border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span className="text-amber-800 dark:text-amber-300">
                  Every encrypted column will be re-encrypted in a single transaction. The new value will be shown
                  once for you to copy into your host secret manager — save it before closing the next dialog.
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRegenerateTarget(null)}
              disabled={regenerateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!regenerateTarget) return;
                setRegeneratingKey(regenerateTarget);
                regenerateMutation.mutate(regenerateTarget);
              }}
              disabled={regenerateMutation.isPending}
              data-testid="button-confirm-regenerate"
            >
              {regenerateMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-1.5" />
              )}
              Yes, rotate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* One-time copy dialog for freshly-generated secrets — opens
          after lazy-generation during connection-create AND after
          explicit rotation. The operator MUST acknowledge before the
          values disappear back behind the masked Reveal flow. */}
      <Dialog
        open={!!generatedSecretsDialog}
        onOpenChange={(open) => {
          if (!open) {
            setGeneratedSecretsDialog(null);
            queryClient.invalidateQueries({ queryKey: ["/api/system/env-status"] });
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" />
              Save these values now
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-2 p-3 rounded-md border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 text-xs">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span className="text-amber-800 dark:text-amber-300">
                Copy each value into your host secret manager (Dokploy, Docker, Kubernetes — wherever you set
                env vars). The masked Reveal action will keep working from the wizard file, but moving the
                value into your env layer is the only way to survive a container rebuild.
              </span>
            </div>
            {/* Heads-up notice (Task #736): when SESSION_SECRET was just
                rotated the server has already invalidated every session —
                including this admin's own cookie — so the next API call
                from this tab will 401 and the global auth handler will
                redirect to /login. Surface that explicitly here, beside
                the copy fields, so the operator finishes copying the new
                value before getting bounced. */}
            {generatedSecretsDialog?.sessionsInvalidated && (
              <div
                className="flex items-start gap-2 p-3 rounded-md border border-red-500/30 bg-red-50 dark:bg-red-950/20 text-xs"
                role="status"
                data-testid="notice-sessions-invalidated"
              >
                <LogOut className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span className="text-red-800 dark:text-red-300">
                  You've been logged out everywhere, including this tab. Copy the new
                  SESSION_SECRET above, then sign in again — the next request from this
                  browser will return you to the login screen.
                </span>
              </div>
            )}
            {generatedSecretsDialog?.sessionSecret && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="font-mono text-xs">SESSION_SECRET</Label>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={async () => {
                      const ok = await safeCopyToClipboard(generatedSecretsDialog!.sessionSecret!);
                      toast({ title: ok ? "Copied" : "Copy failed" });
                    }}
                    data-testid="button-copy-generated-session-secret"
                  >
                    <Copy className="w-3.5 h-3.5 mr-1" /> Copy
                  </Button>
                </div>
                <div className="font-mono text-xs break-all p-2 rounded bg-muted border">
                  {generatedSecretsDialog.sessionSecret}
                </div>
              </div>
            )}
            {generatedSecretsDialog?.encryptionKey && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="font-mono text-xs">ENCRYPTION_KEY</Label>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={async () => {
                      const ok = await safeCopyToClipboard(generatedSecretsDialog!.encryptionKey!);
                      toast({ title: ok ? "Copied" : "Copy failed" });
                    }}
                    data-testid="button-copy-generated-encryption-key"
                  >
                    <Copy className="w-3.5 h-3.5 mr-1" /> Copy
                  </Button>
                </div>
                <div className="font-mono text-xs break-all p-2 rounded bg-muted border">
                  {generatedSecretsDialog.encryptionKey}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setGeneratedSecretsDialog(null);
                queryClient.invalidateQueries({ queryKey: ["/api/system/env-status"] });
              }}
              data-testid="button-acknowledge-generated-secrets"
            >
              I've saved them
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task #741: Promote-to-app-file confirm. Single-step click-
          through (open → "Yes, promote") matches the regenerate dialog
          pattern. Extra warning for SESSION_SECRET because the server
          runs the same hot-swap path as regenerate, so the admin will
          be logged out immediately. ENCRYPTION_KEY is non-destructive
          (the value stays the same; only its persistence layer
          changes), so its dialog is plain. */}
      <Dialog open={!!promoteTarget} onOpenChange={(open) => !open && setPromoteTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowDownFromLine className="w-5 h-5 text-primary" />
              Promote {promoteTarget} to app file?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <p>
              The current host-env value of {promoteTarget} will be copied into the
              encrypted app file (<code className="font-mono text-xs">data/db-config.json</code>).
              That copy survives a container rebuild that drops the host env, so you
              can safely remove the value from your hosting platform afterwards.
            </p>
            {promoteTarget === "SESSION_SECRET" && (
              <div className="flex items-start gap-2 p-3 rounded-md border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span className="text-amber-800 dark:text-amber-300">
                  Every signed-in user will be logged out the moment you confirm — the
                  app re-syncs the in-process session secret to keep the file copy and
                  the runtime in lock-step.
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPromoteTarget(null)}
              disabled={promoteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!promoteTarget) return;
                setPromotingKey(promoteTarget);
                promoteMutation.mutate(promoteTarget);
              }}
              disabled={promoteMutation.isPending}
              data-testid="button-confirm-promote"
            >
              {promoteMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <ArrowDownFromLine className="w-4 h-4 mr-1.5" />
              )}
              Yes, promote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task #741: Unmanage-from-app typed-confirm dialog. Mirrors the
          pendingActiveConfirm pattern above — operator must type the
          key name exactly before the destructive button enables. The
          inline `unmanageError` field surfaces server-side guard
          failures (env_not_set / encryption_key_mismatch) so the
          operator can act on them without losing the dialog state. */}
      <Dialog
        open={!!unmanageTarget}
        onOpenChange={(open) => {
          if (!open) {
            setUnmanageTarget(null);
            setUnmanageTypedName("");
            setUnmanageError(null);
          }
        }}
      >
        <DialogContent className="max-w-lg" data-testid="dialog-unmanage-secret">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-destructive" />
              Remove {unmanageTarget} from app file?
            </DialogTitle>
            <DialogDescription className="pt-2 space-y-2">
              <span className="block">
                The app-managed copy in <code className="font-mono text-xs">data/db-config.json</code>{" "}
                will be deleted. The host environment value (which was set when the app
                booted) becomes the source of truth again.
              </span>
              {unmanageTarget === "SESSION_SECRET" && (
                <span className="block text-amber-700 dark:text-amber-400">
                  Every signed-in user will be logged out — the in-process secret is
                  re-synced to the host value before the response returns.
                </span>
              )}
              {unmanageTarget === "ENCRYPTION_KEY" && (
                <span className="block text-amber-700 dark:text-amber-400">
                  The host ENCRYPTION_KEY must byte-match the app-file value, otherwise
                  every encrypted column in the database would become unreadable. The
                  server refuses the action if they differ.
                </span>
              )}
              <span className="block text-amber-700 dark:text-amber-400">
                Type the secret name to confirm:{" "}
                <span className="font-mono font-semibold">{unmanageTarget ?? ""}</span>
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="unmanage-confirm-name">Secret name</Label>
            <Input
              id="unmanage-confirm-name"
              value={unmanageTypedName}
              onChange={(e) => {
                setUnmanageTypedName(e.target.value);
                if (unmanageError) setUnmanageError(null);
              }}
              placeholder={unmanageTarget ?? ""}
              autoComplete="off"
              data-testid="input-unmanage-confirm-name"
            />
            {unmanageError && (
              <div
                className="flex items-start gap-2 p-3 rounded-md border border-red-500/30 bg-red-50 dark:bg-red-950/20 text-xs"
                role="alert"
                data-testid="unmanage-error"
              >
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span className="text-red-800 dark:text-red-300">{unmanageError}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUnmanageTarget(null);
                setUnmanageTypedName("");
                setUnmanageError(null);
              }}
              disabled={unmanageMutation.isPending}
            >
              <X className="w-4 h-4 mr-1.5" /> Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                !unmanageTarget ||
                unmanageTypedName.trim() !== unmanageTarget ||
                unmanageMutation.isPending
              }
              onClick={() => {
                if (!unmanageTarget) return;
                setUnmanagingKey(unmanageTarget);
                setUnmanageError(null);
                unmanageMutation.mutate({
                  key: unmanageTarget,
                  confirmName: unmanageTypedName.trim(),
                });
              }}
              data-testid="btn-unmanage-confirm"
            >
              {unmanageMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-1.5" />
              )}
              Remove from app file
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
