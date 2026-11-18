import { useEffect, useRef, useState } from "react";
import {
  CheckCircle, Database, AlertCircle, Loader2, RefreshCw, ChevronRight,
  Shield, Globe, UserPlus, Mail, Sparkles, Cloud, Brain, History, Eye, EyeOff, Copy, Check,
  KeyRound, Download, ExternalLink, Zap,
} from "lucide-react";
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
import { useTranslation, Trans } from "react-i18next";
import type { TFunction } from "i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { showErrorToast, showInfoToast, showSuccessToast } from "@/lib/toast-helper";
import { PasswordRuleChecklist } from "@/components/shared/PasswordRuleChecklist";
import {
  validateAdminEmailField,
  validateAdminFirstNameField,
  validateAdminPasswordField,
  type AdminInputErrorCode,
} from "@shared/admin-validation";
import { safeCopyToClipboard } from "@/lib/clipboard";
import { markCameFromSetup } from "@/lib/from-setup-marker";
import {
  applyDriverChoice,
  readDriverChoice,
  type DriverChoice,
} from "@/lib/db-driver-param";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type EnvHelperSource as SharedEnvHelperSource,
  type EnvHelperSources as SharedEnvHelperSources,
  envSourceBadgeClass,
  mapPublicUrlSource as sharedMapPublicUrlSource,
  mapSecretSource as sharedMapSecretSource,
} from "@/lib/env-source-badges";
import { SetupHealthCheckView } from "./setup-health-check-view";
import { SetupShell } from "./setup-shell";
import { SetupTokenGate } from "./setup-token-gate";
import { getSetupToken, setupFetch, SETUP_TOKEN_REJECTED_EVENT } from "@/lib/setup-token";
import { CRM_PROVIDER_IDS, DEFAULT_CRM_PROVIDER, type CrmProviderId } from "@shared/crm-provider";

// Re-export the shared types/helpers under the original names so existing
// importers (notably the setup-env-helper test suite) keep compiling. The
// implementations now live in `client/src/lib/env-source-badges.ts` so the
// post-setup System Settings panel can reuse them without dragging the
// entire wizard module into its bundle.
export type EnvHelperSource = SharedEnvHelperSource;
export type EnvHelperSources = SharedEnvHelperSources;
export const mapSecretSource = sharedMapSecretSource;
export const mapPublicUrlSource = sharedMapPublicUrlSource;

type StepId =
  | "connect"
  | "initialize"
  | "secrets"
  | "public-url"
  | "admin"
  | "smtp"
  | "crm"
  | "done";

type InterpolationParams = Record<string, string | number | undefined>;

type LocalizedMessage =
  | { kind: "key"; key: string; params?: InterpolationParams }
  | { kind: "raw"; text: string };

function resolveMessage(t: TFunction, m: LocalizedMessage | null | undefined): string {
  if (!m) return "";
  if (m.kind === "raw") return m.text;
  return m.params ? t(m.key, m.params) : t(m.key);
}

/**
 * Build a LocalizedMessage from a server JSON response. Server endpoints
 * return a stable `errorCode` plus the original English `error` text. We
 * translate the code under `setup.errors.<code>` and pass `errorParams` for
 * interpolation. The English `error` text is used as `defaultValue` so an
 * unknown code still falls back to the server-provided string instead of
 * showing the raw key. Falls back to a localized generic message when the
 * server returned no error info at all.
 */
function serverErrorMessage(
  data: { error?: unknown; errorCode?: unknown; errorParams?: unknown } | null | undefined,
  fallbackKey: string,
): LocalizedMessage {
  const code = typeof data?.errorCode === "string" ? data.errorCode : null;
  const rawText = typeof data?.error === "string" ? data.error : null;
  const params =
    data?.errorParams && typeof data.errorParams === "object"
      ? (data.errorParams as InterpolationParams)
      : undefined;
  if (code) {
    return {
      kind: "key",
      key: `setup.errors.${code}`,
      // i18next reads `defaultValue` to render when the key is missing, so
      // operators on out-of-date locale bundles still see the server text.
      params: { ...params, defaultValue: rawText ?? code } as InterpolationParams,
    };
  }
  if (rawText) return { kind: "raw", text: rawText };
  return { kind: "key", key: fallbackKey };
}

type MigrationTipKey =
  | "migrationTimedOut"
  | "connectionTimeout"
  | "tooManyConnections"
  | "readOnlyTarget"
  | "scramMismatch"
  | "insufficientPrivileges"
  | "roleMismatch"
  | "sslRequired"
  | "versionTooOld";
interface TestResult {
  success: boolean;
  latencyMs: number;
  error?: LocalizedMessage;
  // Best-guess "most likely cause" returned by the server's classifier so the
  // Connect step can surface the same localized tip (and "Most likely" badge)
  // that the migration step shows on failure. `null` means we could not
  // confidently classify the error; the wizard then just shows the raw text.
  tipKey?: MigrationTipKey | null;
  // Task #451: server-only signal that the URL we just tested is byte-for-byte
  // the same one the host process is currently using and the live probe is
  // failing against. The server NEVER echoes the live URL or its password —
  // only this boolean. When true and the live probe is unreachable, the
  // wizard swaps the "Continue is enabled" reassurance for a sharper warning
  // that says re-saving the same URL won't repair anything.
  matchesLiveUrl?: boolean;
}
interface InitPhase { phase: string; ok: boolean; detail?: string; ms?: number }
const MIGRATION_TIP_KEYS: MigrationTipKey[] = [
  "migrationTimedOut",
  "connectionTimeout",
  "tooManyConnections",
  "readOnlyTarget",
  "scramMismatch",
  "insufficientPrivileges",
  "roleMismatch",
  "sslRequired",
  "versionTooOld",
];
function isMigrationTipKey(value: unknown): value is MigrationTipKey {
  return typeof value === "string" && (MIGRATION_TIP_KEYS as string[]).includes(value);
}
// Literal English snippets paired with each tip. They are SQL / URL / shell
// fragments meant to be copied verbatim into psql or a connection URL, so they
// must not be translated. The surrounding label that explains where to paste
// them is localized via `setup.initialize.migrationOutput.snippetLabels.*`.
const MIGRATION_TIP_SNIPPETS: Record<MigrationTipKey, string> = {
  insufficientPrivileges: "GRANT ALL ON SCHEMA public TO your_user;",
  roleMismatch: 'psql "$DATABASE_URL" -c "SELECT current_user, current_database();"',
  sslRequired: "?sslmode=require",
  versionTooOld: "SELECT version();",
  migrationTimedOut: "",
  connectionTimeout: "",
  tooManyConnections: "",
  readOnlyTarget: "",
  scramMismatch: "",
};
interface HealthCheck {
  nameKey: string;
  ok: boolean;
  detail?: LocalizedMessage;
}
interface SecretsSnapshot {
  hasConnectionUrl: boolean;
  databaseUrlSource: "env" | "wizard" | "none";
  hasSessionSecret: boolean;
  sessionSecretSource: "env" | "file" | "none";
  sessionSecretValue?: string;
  hasEncryptionKey: boolean;
  encryptionKeySource: "env" | "file" | "none";
  encryptionKeyValue?: string;
  publicAppUrl: string;
  publicAppUrlSource: "env" | "file" | "default";
  // SMTP host source — there is no SMTP_HOST env var the server reads
  // today (the wizard always defers to data/db-config.json, applied on
  // next boot via server/lib/smtp-hydrate.ts), so this is realistically
  // `'file'` or `'none'`. Modelled in the same shape as the secrets so
  // a future SMTP_HOST env can promote to `'env'` without churn. See
  // task-370 for why we surface this from the snapshot rather than
  // inferring from the locally-typed input value.
  smtpHostSource: "env" | "file" | "none";
}
type DbErrorCode =
  | "authFailed"
  | "connRefused"
  | "hostNotFound"
  | "dbMissing"
  | "timeout"
  | "unknown";

interface SetupStatus {
  setupRequired: boolean;
  adminExists: boolean;
  publicAppUrl: string;
  hasSessionSecret: boolean;
  hasEncryptionKey: boolean;
  // ISO timestamp persisted by POST /api/setup/complete the first time
  // the wizard's Done step is acknowledged. When non-null, /setup
  // re-entries render the read-only SetupHealthCheckView instead of
  // restarting the wizard at step 1. Optional so older locale bundles
  // / mocks that pre-date task-378 keep type-checking.
  setupCompletedAt?: string | null;
  // True while the wizard's routes need the first-run setup token.
  setupTokenRequired?: boolean;
  // `host` is the sanitized `hostname[:port]` of the LIVE `DATABASE_URL`
  // the running process resolved (Task #452). Userinfo is stripped on
  // the server, so this never leaks the password / username. Optional
  // because pre-task locale bundles / mocks may not include it.
  dbHealth?: { reachable: boolean; lastErrorCode: DbErrorCode | null; host?: string | null };
  // The bootstrap snapshot is merged into /api/setup/status so the Done
  // step can show operators which env vars the running process actually
  // sees right now (vs. what they saved into Dokploy / Coolify but the
  // container was never redeployed to pick up). All four are optional
  // because pre-task locale bundles / older mocks may not include them.
  databaseUrlSource?: "env" | "wizard" | "none";
  sessionSecretSource?: "env" | "file" | "none";
  encryptionKeySource?: "env" | "file" | "none";
  publicAppUrlSource?: "env" | "file" | "default";
}

// Plain-English origin labels for the Done step's "What the running
// server sees" panel. Every source value collapses to one of three
// buckets: loaded from the host's env editor (best), loaded from
// data/db-config.json (still works but vanishes on container rebuild
// unless the volume is persistent), or not visible at all (the most
// common cause of every-check-red after an in-app Restart that didn't
// actually re-launch the container).
type RunningSourceState = "env" | "file" | "missing";

/**
 * Task #681: payload shape returned by `GET /api/admin/runtime-info`,
 * mirroring `server/lib/runtime-info.ts` `RuntimeInfo`. Kept as a
 * minimal client-side mirror (rather than an `@shared` import) so the
 * server can evolve its detection internals without dragging the
 * wizard bundle along — the wire shape here is the contract.
 */
type RuntimeInfo = {
  runtime: "coolify" | "dokploy" | "docker" | "standalone";
  envEditorUrl: string | null;
  controlApi: {
    available: boolean;
    capabilities: ReadonlyArray<string>;
    tokenEnvVar: string | null;
    unavailableReason:
      | "unsupportedRuntime"
      | "missingToken"
      | "missingResourceUuid"
      | "missingHostUrl"
      | null;
  };
  signals: ReadonlyArray<string>;
};

function classifyRunningSource(
  source: SetupStatus["databaseUrlSource"]
    | SetupStatus["sessionSecretSource"]
    | SetupStatus["encryptionKeySource"]
    | SetupStatus["publicAppUrlSource"]
    | undefined,
): RunningSourceState {
  if (source === "env") return "env";
  if (source === "file" || source === "wizard") return "file";
  // "none" / "default" / undefined → process truly does not see it
  return "missing";
}

const DB_ERROR_CODE_KEYS: Record<DbErrorCode, string> = {
  authFailed: "setup.dbUnreachable.code.authFailed",
  connRefused: "setup.dbUnreachable.code.connRefused",
  hostNotFound: "setup.dbUnreachable.code.hostNotFound",
  dbMissing: "setup.dbUnreachable.code.dbMissing",
  timeout: "setup.dbUnreachable.code.timeout",
  unknown: "setup.dbUnreachable.code.unknown",
};

const DB_URL_EXAMPLE =
  "postgresql://USER:PASSWORD@HOST:5432/DB?sslmode=require";

const STEP_IDS: StepId[] = [
  "connect",
  "initialize",
  "secrets",
  "public-url",
  "admin",
  "smtp",
  "crm",
  "done",
];

const STEP_LABEL_KEYS: Record<StepId, string> = {
  connect: "setup.steps.connect",
  initialize: "setup.steps.initialize",
  secrets: "setup.steps.secrets",
  "public-url": "setup.steps.publicUrl",
  admin: "setup.steps.admin",
  smtp: "setup.steps.smtp",
  crm: "setup.steps.crm",
  done: "setup.steps.done",
};

// Task #707: cap the auto-resume chain so a perpetually-throttled host
// doesn't loop the wizard forever against itself. After this many
// consecutive 429s we stop scheduling auto-resumes and the AlertDialog
// falls back to the manual "Retry in Ns" / re-enabled action behavior
// from Task #700. The grace milliseconds buffer the auto-fire to the
// far side of the host's window so we never re-hit it inside.
const MAX_AUTO_RETRY_ATTEMPTS = 3;
const AUTO_RETRY_GRACE_MS = 500;

export default function Setup() {
  const { toast } = useToast();
  const { t } = useTranslation();
  

  const [step, setStep] = useState<StepId>("connect");

  // Read-only health-check landing state (task-378). When
  // /api/setup/status reports a non-null `setupCompletedAt` we render
  // the SetupHealthCheckView component instead of the 7-step wizard so
  // an accidental visit (or post-Redeploy bounce) does NOT silently
  // restart configuration. The operator must explicitly confirm a
  // "Reconfigure…" dialog to flip `reconfigureRequested = true` and
  // open the wizard.
  const [setupCompletedAt, setSetupCompletedAt] = useState<string | null>(null);
  const [statusFetched, setStatusFetched] = useState(false);
  // First-run setup token: the wizard asks for it before any step can run.
  const [needsSetupToken, setNeedsSetupToken] = useState(false);
  useEffect(() => {
    const onRejected = () => setNeedsSetupToken(true);
    window.addEventListener(SETUP_TOKEN_REJECTED_EVENT, onRejected);
    return () => window.removeEventListener(SETUP_TOKEN_REJECTED_EVENT, onRejected);
  }, []);
  const [reconfigureRequested, setReconfigureRequested] = useState(false);
  // True when the page was opened via the post-Redeploy useAuth bounce
  // (URL carries `?reentry=1`). Forwarded to SetupHealthCheckView so
  // it expands the failing check and surfaces the explanation banner.
  const reentry =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("reentry") === "1"
      : false;

  // Step 1
  const [connectionUrl, setConnectionUrl] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  // "Database Driver" override (Task #481) — surfaces the
  // `?driver=neon|pg` URL escape hatch from Task #479 as a dropdown
  // so operators don't have to hand-edit the URL when the
  // hostname-based auto-detection picks the wrong driver (e.g.
  // pgbouncer fronting a Neon URL, or a Neon-compatible proxy with
  // a self-hosted hostname). The choice is the source of truth: it
  // gets re-applied to `connectionUrl` on every change so the
  // textarea, the test/initialize POSTs, and the env-helper copy
  // panel all stay in lockstep with whatever the dropdown shows.
  const [driverChoice, setDriverChoice] = useState<DriverChoice>("auto");

  // Step 2
  const [initializing, setInitializing] = useState(false);
  const [initPhases, setInitPhases] = useState<InitPhase[]>([]);
  const [initError, setInitError] = useState<LocalizedMessage | null>(null);
  const [migrationOutput, setMigrationOutput] = useState<string | null>(null);
  const [migrationTipKey, setMigrationTipKey] = useState<MigrationTipKey | null>(null);

  // Step 3
  const [secrets, setSecrets] = useState<SecretsSnapshot | null>(null);
  const [showSecrets, setShowSecrets] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Step 4
  const [publicUrl, setPublicUrl] = useState("");
  const [savingUrl, setSavingUrl] = useState(false);
  const [urlError, setUrlError] = useState<LocalizedMessage | null>(null);

  // Step 5
  const [adminEmail, setAdminEmail] = useState("");
  const [adminFirst, setAdminFirst] = useState("");
  const [adminLast, setAdminLast] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [adminError, setAdminError] = useState<LocalizedMessage | null>(null);
  // Admin-already-exists lock. The bootstrap admin endpoint refuses to
  // create a second approved admin (responds 403 with errorCode
  // `adminAlreadyExists`). When the operator re-runs the wizard against a
  // database that already has admins (re-deploy, container reset with the
  // same DATABASE_URL, etc.) we surface a friendly callout with a Skip
  // button so they don't get stuck staring at a red error every time they
  // submit valid credentials. Pre-populated from /api/setup/status when
  // the admin step mounts so the lock appears before the operator even
  // tries to submit.
  const [adminLocked, setAdminLocked] = useState(false);
  // Inline field-level validation. We only surface errors for fields the
  // operator has interacted with (blurred at least once) so the form does
  // not start the wizard step screaming red. Once a field is touched it
  // re-validates on every keystroke so corrections clear the error
  // immediately.
  const [adminTouched, setAdminTouched] = useState<{
    email: boolean;
    firstName: boolean;
    password: boolean;
  }>({ email: false, firstName: false, password: false });

  const adminEmailErrorCode: AdminInputErrorCode | null = validateAdminEmailField(adminEmail.trim());
  const adminFirstNameErrorCode: AdminInputErrorCode | null = validateAdminFirstNameField(adminFirst);
  const adminPasswordErrorCode: AdminInputErrorCode | null = validateAdminPasswordField(adminPassword);
  const adminFormHasErrors =
    adminEmailErrorCode !== null ||
    adminFirstNameErrorCode !== null ||
    adminPasswordErrorCode !== null;

  // Step 6 — SMTP (skippable)
  const [smtpSkipped, setSmtpSkipped] = useState(false);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpResult, setSmtpResult] = useState<{ ok: boolean; message: LocalizedMessage } | null>(null);
  const [crmChoice, setCrmChoice] = useState<CrmProviderId>(DEFAULT_CRM_PROVIDER);
  const [crmSaving, setCrmSaving] = useState(false);
  const [crmResult, setCrmResult] = useState<LocalizedMessage | null>(null);

  // Step 7 — Done & restart
  const [restarting, setRestarting] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [healthChecks, setHealthChecks] = useState<HealthCheck[]>([]);

  // Tracks whether the operator has saved at least one config value that
  // only takes effect after a process restart (admin save, SMTP save,
  // SMTP skip). Drives the "Restart required" callout shown at the top
  // of the SMTP step and on the Done step so the operator is never
  // surprised by red checks at the end of the wizard.
  const [restartHinted, setRestartHinted] = useState(false);
  // Operator-dismissed flag for the same callout. Reset whenever the
  // operator completes another save so the callout reappears after the
  // next change.
  const [restartHintDismissed, setRestartHintDismissed] = useState(false);

  // Snapshot of the four `*Source` fields the bootstrap snapshot exposes.
  // Populated alongside the health-check list so the Done step can show
  // a plain-English "What the running server sees" panel without making
  // a second round-trip. `null` means we haven't run the checks yet.
  const [runningSources, setRunningSources] = useState<{
    databaseUrl: RunningSourceState;
    sessionSecret: RunningSourceState;
    encryptionKey: RunningSourceState;
    publicAppUrl: RunningSourceState;
  } | null>(null);

  // Banner state. Only set when status reports a probed-but-unreachable
  // DB; missing-config case omits dbHealth so the banner stays hidden.
  const [dbUnreachable, setDbUnreachable] = useState(false);
  const [dbUnreachableCode, setDbUnreachableCode] = useState<DbErrorCode>("unknown");
  // Sanitized `hostname[:port]` of the live `DATABASE_URL` that failed
  // the boot probe (Task #452). Surfaced in the banner so operators can
  // tell at a glance whether the broken URL is the one they just pasted
  // or a stale value the host has saved. `null` means the server did not
  // include a host (e.g. older bundle / no URL configured yet).
  const [dbUnreachableHost, setDbUnreachableHost] = useState<string | null>(null);
  const [copiedExample, setCopiedExample] = useState(false);

  // Task #681: Reconfigure-mode runtime helper. Loaded once when the
  // wizard enters Reconfigure mode so the operator gets a one-click
  // "Open env-var editor" link (and, on Coolify with COOLIFY_API_TOKEN
  // set, an admin-confirmed "Apply DATABASE_URL & restart" button)
  // alongside the existing manual docs hint. `null` while loading or
  // when the route returned an error — the docs hint stays visible
  // either way so the operator never loses the manual fallback.
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo | null>(null);
  // Open/close + in-flight + result state for the Apply-via-control-API
  // confirm dialog. Kept separate from the general init/test state so a
  // failed swap doesn't leak into the Database step's testResult banner.
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [applyingSwap, setApplyingSwap] = useState(false);
  const [applyResult, setApplyResult] = useState<
    | { kind: "success"; message: string }
    | { kind: "error"; message: LocalizedMessage }
    | null
  >(null);
  // Task #700: when the host's control API returns 429 with a
  // `Retry-After` header, the server forwards the parsed seconds in
  // the JSON response. We hold the deadline (epoch ms) here rather
  // than a counter so the countdown stays accurate across re-renders
  // and across tab background-throttling, and so the AlertDialog's
  // Apply action can simply check `Date.now() < retryDeadlineMs` to
  // decide whether to disable itself. `null` means "no countdown
  // active" — either there was no Retry-After header or the wait
  // already elapsed.
  const [retryDeadlineMs, setRetryDeadlineMs] = useState<number | null>(null);
  const [retrySecondsRemaining, setRetrySecondsRemaining] = useState<number>(0);
  // Task #707: track consecutive 429s so the wizard can auto-resume the
  // apply request as soon as the host's Retry-After window elapses,
  // turning the rate-limit recovery into a self-healing flow instead of
  // requiring the operator to babysit a click-after-each-429 loop. We
  // cap the chain at MAX_AUTO_RETRY_ATTEMPTS so a stuck host (or a
  // perpetually-throttled shared cloud proxy) eventually falls back to
  // the existing manual-retry UI rather than hammering the host
  // forever. Reset on success, on a non-429 error, and on dialog close.
  const [autoRetryCount, setAutoRetryCount] = useState<number>(0);
  // Tracks whether an auto-resume timer is currently armed. We use a
  // separate boolean (not just `retrySecondsRemaining > 0`) because
  // the timer fires `seconds * 1000 + AUTO_RETRY_GRACE_MS` after the
  // 429, which is strictly later than when the visible countdown
  // reaches zero. Without this, the AlertDialog action would briefly
  // flip back to the manual "Apply & redeploy" copy during the grace
  // tail and then again to the spinner — a flash that contradicts the
  // "the wizard is going to handle this for you" promise. The
  // boolean stays true for the full armed window (deadline + grace)
  // and is cleared when the timer fires, when the chain succeeds /
  // errors out, when the operator closes the dialog, or on unmount.
  const [autoRetryPending, setAutoRetryPending] = useState<boolean>(false);
  // Refs so the scheduled timer reads the latest values regardless of
  // closure staleness (the timer is created in the same render that
  // received the 429, but may fire several renders later — e.g. after
  // an unrelated state update or a re-render triggered by the ticker).
  const autoRetryTimerRef = useRef<number | null>(null);
  const autoRetryCountRef = useRef<number>(0);
  const showApplyDialogRef = useRef<boolean>(false);
  const applyingSwapRef = useRef<boolean>(false);
  // Task #701: dry-run preview state for the "see what will change"
  // disclosure inside the AlertDialog. We hold the unified diff string
  // (precomputed server-side so the client doesn't ship a diff lib),
  // a loading flag while the preview round-trip is in flight, and an
  // error message for the "couldn't fetch the preview" path. The state
  // is reset whenever the dialog closes so re-opening it after a URL
  // edit always re-fetches against the current candidate.
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewDiff, setPreviewDiff] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<LocalizedMessage | null>(null);

  // Tick the countdown once per second while a deadline is active.
  // We compute the remaining seconds from the deadline (instead of
  // decrementing a counter) so a backgrounded tab catches up to the
  // real wall-clock time on resume rather than under-counting. When
  // the deadline passes we clear it so the Apply button re-enables
  // and the rendered banner falls back to the generic rate-limit
  // copy on the next render path.
  useEffect(() => {
    if (retryDeadlineMs === null) {
      setRetrySecondsRemaining(0);
      return;
    }
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((retryDeadlineMs - Date.now()) / 1000),
      );
      setRetrySecondsRemaining(remaining);
      if (remaining === 0) {
        setRetryDeadlineMs(null);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [retryDeadlineMs]);

  // Task #707: keep the refs the auto-resume timer reads in sync with
  // the live state. The timer captures these via ref so the close,
  // cancel, and "another apply already in flight" gates always see
  // current values regardless of when the timer was scheduled.
  useEffect(() => {
    showApplyDialogRef.current = showApplyDialog;
    if (!showApplyDialog) {
      // Operator cancelled, hit Escape, or clicked outside — drop any
      // pending auto-resume so we don't fire after they navigated away.
      // Also reset the consecutive-429 counter so the next apply starts
      // fresh against the cap.
      if (autoRetryTimerRef.current !== null) {
        window.clearTimeout(autoRetryTimerRef.current);
        autoRetryTimerRef.current = null;
      }
      autoRetryCountRef.current = 0;
      setAutoRetryCount(0);
      setAutoRetryPending(false);
      setRetryDeadlineMs(null);
    }
  }, [showApplyDialog]);

  useEffect(() => {
    applyingSwapRef.current = applyingSwap;
  }, [applyingSwap]);

  // Task #707: clear any pending auto-resume timer when the component
  // unmounts (e.g. operator navigates away mid-countdown) so we don't
  // try to set state on an unmounted tree.
  useEffect(() => {
    return () => {
      if (autoRetryTimerRef.current !== null) {
        window.clearTimeout(autoRetryTimerRef.current);
        autoRetryTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const r = await setupFetch("/api/setup/status");
        const s: SetupStatus = await r.json();
        if (cancelled) return;
        if (s.dbHealth && s.dbHealth.reachable === false) {
          setDbUnreachable(true);
          const code = s.dbHealth.lastErrorCode;
          setDbUnreachableCode(
            code && code in DB_ERROR_CODE_KEYS ? code : "unknown",
          );
          setDbUnreachableHost(
            typeof s.dbHealth.host === "string" && s.dbHealth.host.length > 0
              ? s.dbHealth.host
              : null,
          );
        } else if (s.dbHealth && s.dbHealth.reachable === true) {
          setDbUnreachable(false);
          setDbUnreachableHost(null);
        }
        // Track setup-completed marker for the wizard-vs-health-check
        // landing branch. We only set `statusFetched` once so the
        // initial render shows a momentary loader rather than flashing
        // the wizard before the marker arrives.
        setSetupCompletedAt(
          typeof s.setupCompletedAt === "string" ? s.setupCompletedAt : null,
        );
        if (s.setupTokenRequired === true && !getSetupToken()) {
          setNeedsSetupToken(true);
        }
        setStatusFetched(true);
      } catch {
        // Network blip — mark fetched so the wizard still renders
        // (failing safe to the existing pre-task-378 behaviour).
        setStatusFetched(true);
      }
    };
    check();
    const id = window.setInterval(check, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  async function copyDbUrlExample() {
    const ok = await safeCopyToClipboard(DB_URL_EXAMPLE);
    if (ok) {
      setCopiedExample(true);
      window.setTimeout(() => setCopiedExample(false), 1800);
    } else {
      showErrorToast(t("setup.envHelper.copyFailed"), t("setup.envHelper.copyFailedHint"));
    }
  }

  // Auto-load secrets snapshot when entering the secrets step
  useEffect(() => {
    if (step !== "secrets") return;
    setupFetch("/api/setup/secrets").then((r) => r.json()).then(setSecrets).catch(() => setSecrets(null));
  }, [step]);

  // Task #681: load runtime detection once Reconfigure mode is entered
  // so the helper UI can pivot on the host's capabilities. We fire on
  // the same boolean (`isReconfigureMode`) the callout itself reads so
  // the bundle isn't paying for an extra fetch on first-run installs.
  // Failure leaves `runtimeInfo` as null, which the renderer treats as
  // "no helper buttons" — the docs hint stays as the manual fallback.
  useEffect(() => {
    if (!setupCompletedAt || !reconfigureRequested) return;
    let cancelled = false;
    fetch("/api/admin/runtime-info", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: RuntimeInfo | null) => {
        if (cancelled) return;
        if (data && typeof data.runtime === "string") {
          setRuntimeInfo(data);
        }
      })
      .catch(() => {
        /* leave runtimeInfo null — docs hint is the fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [setupCompletedAt, reconfigureRequested]);

  // Task #701: fetch the dry-run env diff so the AlertDialog's
  // "see what will change" disclosure can show a unified diff of the
  // current env vs. the proposed merge BEFORE the operator commits.
  // The server enforces that this path is read-only (no
  // saveEnvironment / deploy calls fire) — see
  // `applyDatabaseUrlVia{Coolify,Dokploy}` for the contract. We
  // deliberately do NOT block the Apply button on this fetch failing:
  // the preview is a safety net, not a precondition, and a
  // momentarily-flaky control API shouldn't strand the operator.
  async function loadEnvDiffPreview() {
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewDiff(null);
    try {
      const res = await fetch("/api/admin/runtime-apply-database-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          connectionUrl: applyDriverChoice(connectionUrl.trim(), driverChoice),
          dryRun: true,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && typeof data.diff === "string") {
        setPreviewDiff(data.diff);
      } else {
        setPreviewError(
          serverErrorMessage(
            data,
            "setup.reconfigureMode.runtimeHelper.previewError",
          ),
        );
      }
    } catch {
      setPreviewError({
        kind: "key",
        key: "setup.reconfigureMode.runtimeHelper.previewError",
      });
    } finally {
      setPreviewLoading(false);
    }
  }

  // Task #681: drive the "Apply DATABASE_URL & restart" path on
  // supported hosts (today: Coolify with COOLIFY_API_TOKEN). The
  // server endpoint re-tests the URL itself and does the swap +
  // redeploy in one call; here we just gate on the AlertDialog
  // confirm and surface the result inline so the operator sees
  // either a green "applied — N ms" line or the localized error
  // banner. Failure does not retry — the operator can re-open the
  // dialog (the runtime info itself never changes mid-session) or
  // fall back to the deep link or manual edit.
  async function handleApplyViaControlApi() {
    if (!testResult?.success) return; // belt-and-braces; UI also gates
    // Defense in depth: even though the Apply button is disabled
    // while a Retry-After countdown is active, a stray Enter key on
    // the AlertDialog action could still fire this path. Bail out
    // here too so we never re-hit the host inside its rate-limit
    // window — which would just earn us another 429 and reset the
    // operator's countdown.
    if (retryDeadlineMs !== null && Date.now() < retryDeadlineMs) return;
    // Task #707: extra in-flight gate for the auto-resume path. When
    // the auto-retry timer fires it calls this handler directly; if
    // the operator also somehow triggers a manual click in the same
    // tick, this guard keeps us from issuing two parallel POSTs.
    if (applyingSwapRef.current) return;
    applyingSwapRef.current = true;
    setApplyingSwap(true);
    setApplyResult(null);
    // Task #707: any in-flight apply replaces a pending auto-retry —
    // we're firing now, so the deferred fire would be redundant.
    if (autoRetryTimerRef.current !== null) {
      window.clearTimeout(autoRetryTimerRef.current);
      autoRetryTimerRef.current = null;
    }
    setAutoRetryPending(false);
    try {
      const res = await fetch("/api/admin/runtime-apply-database-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          connectionUrl: applyDriverChoice(connectionUrl.trim(), driverChoice),
          confirm: true,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setApplyResult({
          kind: "success",
          message: t("setup.reconfigureMode.runtimeHelper.applied", {
            ms: data.latencyMs ?? 0,
            defaultValue: "DATABASE_URL applied; redeploy triggered ({{ms}} ms).",
          }),
        });
        setShowApplyDialog(false);
        setRetryDeadlineMs(null);
        // Task #707: success ends the consecutive-429 chain — reset
        // the cap counter so a future apply (e.g. operator changes
        // their mind, re-opens the dialog, gets rate-limited) starts
        // fresh against the auto-resume budget.
        autoRetryCountRef.current = 0;
        setAutoRetryCount(0);
        setAutoRetryPending(false);
      } else {
        // Task #700: surface the host's rate-limit hint when the
        // server forwarded a Retry-After. We swap in the
        // countdown-shaped translation (`controlApiRateLimitedCountdown`)
        // so the banner says "try again in N seconds" instead of the
        // generic "wait a moment" copy. We trust ONLY the JSON body
        // here (`retryAfterSeconds`) — the server has already parsed
        // the host's raw `Retry-After` header into seconds via
        // `parseRetryAfterHeader` and is the single source of truth
        // for this value. Re-parsing the response header on the
        // client would invite drift with the server parser (e.g.
        // disagreeing on past-dated HTTP-dates or float rejection).
        const isRateLimited = data?.errorCode === "controlApiRateLimited";
        const seconds =
          typeof data?.retryAfterSeconds === "number"
          && Number.isFinite(data.retryAfterSeconds)
          && data.retryAfterSeconds >= 0
            ? Math.floor(data.retryAfterSeconds)
            : null;
        if (isRateLimited && typeof seconds === "number" && seconds > 0) {
          // Seed `retrySecondsRemaining` synchronously alongside the
          // deadline. The useEffect ticker re-derives it on the next
          // render, but without this seed there's a one-frame window
          // where `retryDeadlineMs !== null` but
          // `retrySecondsRemaining === 0`, which would briefly render
          // the generic rate-limit copy before the countdown
          // appears. React batches both setters into the same render.
          setRetryDeadlineMs(Date.now() + seconds * 1000);
          setRetrySecondsRemaining(seconds);
          setApplyResult({
            kind: "error",
            message: {
              kind: "key",
              key: "setup.errors.controlApiRateLimitedCountdown",
              params: { seconds },
            },
          });
          // Task #707: count this 429 against the auto-resume cap and,
          // if we still have budget, schedule the next apply to fire
          // automatically once the host's window elapses (+ a small
          // grace so we never re-hit the host inside the window). At
          // the cap we deliberately do NOT schedule — the AlertDialog
          // falls back to its existing manual "Retry in Ns" UX so a
          // stuck host never loops the wizard against itself.
          const newCount = autoRetryCountRef.current + 1;
          autoRetryCountRef.current = newCount;
          setAutoRetryCount(newCount);
          if (newCount < MAX_AUTO_RETRY_ATTEMPTS) {
            const fireInMs = seconds * 1000 + AUTO_RETRY_GRACE_MS;
            // Mark the auto-resume as armed for the full window
            // (countdown + grace) so the AlertDialog action keeps
            // showing "Retrying automatically…" until the timer
            // actually fires — not just until the visible countdown
            // hits zero. Cleared by the timer body itself, by the
            // in-flight gate at the top of this handler, by the
            // dialog-close effect, by success, by error, or on
            // unmount.
            setAutoRetryPending(true);
            autoRetryTimerRef.current = window.setTimeout(() => {
              autoRetryTimerRef.current = null;
              setAutoRetryPending(false);
              // Re-check at fire time: the operator may have closed
              // the dialog (cancel/escape/outside-click) during the
              // wait — the close path also clears this timer, but a
              // race where the timer is already in the task queue
              // when the close happens would still execute it. The
              // showApplyDialogRef guard catches that race; the
              // applyingSwapRef guard catches a concurrent manual
              // click during the grace window.
              if (!showApplyDialogRef.current) return;
              if (applyingSwapRef.current) return;
              void handleApplyViaControlApi();
            }, fireInMs);
          } else {
            // Cap reached — make sure the auto-retry hint isn't
            // stranded on from a previous render in the chain. The
            // button label falls back to the manual countdown copy.
            setAutoRetryPending(false);
          }
        } else {
          setRetryDeadlineMs(null);
          setApplyResult({
            kind: "error",
            message: serverErrorMessage(
              data,
              "setup.reconfigureMode.runtimeHelper.applyFailedNetwork",
            ),
          });
          // Task #707: a non-429 error ends the consecutive-429 chain —
          // reset the cap counter so the operator's next apply starts
          // fresh against the auto-resume budget.
          autoRetryCountRef.current = 0;
          setAutoRetryCount(0);
          setAutoRetryPending(false);
        }
      }
    } catch {
      setApplyResult({
        kind: "error",
        message: {
          kind: "key",
          key: "setup.reconfigureMode.runtimeHelper.applyFailedNetwork",
        },
      });
      // Task #707: a network error is not a host rate-limit signal —
      // reset the consecutive-429 chain so the operator's next manual
      // retry starts fresh against the auto-resume budget.
      autoRetryCountRef.current = 0;
      setAutoRetryCount(0);
      setAutoRetryPending(false);
    } finally {
      setApplyingSwap(false);
      applyingSwapRef.current = false;
    }
  }

  // Pre-check the admin lock when the operator lands on the admin step.
  // /api/setup/status reports whether an approved admin already exists; if
  // it does, the bootstrap admin endpoint will reject any submission with
  // 403 + errorCode `adminAlreadyExists`. Surfacing the lock proactively
  // turns the otherwise-confusing red error into a clear "this database
  // already has an admin — skip ahead" callout.
  useEffect(() => {
    if (step !== "admin") return;
    let cancelled = false;
    setupFetch("/api/setup/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: SetupStatus | null) => {
        if (cancelled) return;
        if (s && s.adminExists) setAdminLocked(true);
      })
      .catch(() => {
        /* status endpoint unreachable — fall through to per-submit detection */
      });
    return () => {
      cancelled = true;
    };
  }, [step]);

  // Default the public URL field to current origin when entering step 4
  useEffect(() => {
    if (step === "public-url" && !publicUrl) {
      setPublicUrl(window.location.origin);
    }
  }, [step, publicUrl]);

  // Auto-run the health-check suite the first time the operator lands on
  // the Done step. Without this the "What the running server sees" panel
  // (which keys off `runningSources`, populated inside runHealthChecks)
  // stays hidden until the operator hits "Re-run checks" — defeating the
  // whole point of surfacing the diagnostic up front. We only fire when
  // healthChecks is empty so a subsequent Restart-then-Done navigation
  // doesn't clobber a fresh post-restart result.
  useEffect(() => {
    if (step !== "done") return;
    if (healthChecks.length > 0) return;
    void runHealthChecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function handleTestConnection() {
    if (!connectionUrl.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await setupFetch("/api/setup/test-connection", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionUrl: applyDriverChoice(connectionUrl.trim(), driverChoice),
        }),
      });
      const data = await res.json();
      setTestResult({
        success: !!data.success,
        latencyMs: data.latencyMs ?? 0,
        error: data.error || data.errorCode
          ? serverErrorMessage(data, "setup.connect.networkError")
          : undefined,
        tipKey: isMigrationTipKey(data.tipKey) ? data.tipKey : null,
        matchesLiveUrl: data.matchesLiveUrl === true,
      });
    } catch {
      setTestResult({
        success: false,
        latencyMs: 0,
        error: { kind: "key", key: "setup.connect.networkError" },
        tipKey: null,
      });
    } finally { setTesting(false); }
  }

  // Task #682: detect the post-install stub response (`409 { code:
  // "SETUP_ALREADY_COMPLETE" }`) the server now mounts in place of the
  // bootstrap-only wizard endpoints once `setupCompletedAt` is set. A
  // stale browser tab POSTing to /api/setup/initialize, /public-url,
  // /create-admin, /smtp, or /complete after the install was completed
  // would otherwise fall through to the SPA 404 HTML and surface as a
  // misleading "Network error" toast. We instead clear inline error
  // state and switch the wizard into the existing Reconfigure-mode
  // callout (Task #679) so the operator sees a friendly explainer
  // pointing at the env-var-swap docs path.
  function isSetupAlreadyCompleteResponse(
    res: Response,
    data: unknown,
  ): boolean {
    if (res.status !== 409) return false;
    if (!data || typeof data !== "object") return false;
    const codeField = (data as { code?: unknown; errorCode?: unknown }).code;
    const errorCodeField = (data as { errorCode?: unknown }).errorCode;
    return (
      codeField === "SETUP_ALREADY_COMPLETE" ||
      errorCodeField === "SETUP_ALREADY_COMPLETE"
    );
  }

  // Switch the wizard into the existing Reconfigure-mode callout. We
  // refresh /api/setup/status first so the callout's `setupCompletedAt`
  // gating reflects the real persisted timestamp; if that fetch fails
  // (or the field is missing in older bundles) we synthesize one so the
  // callout still renders. `reconfigureRequested` keeps the wizard
  // shell visible (rather than the read-only SetupHealthCheckView) so
  // the explainer is the very first thing the operator sees on the
  // step they were trying to submit.
  async function enterReconfigureModeFromStaleClient() {
    try {
      const r = await setupFetch("/api/setup/status");
      if (r.ok) {
        const s = (await r.json()) as SetupStatus;
        if (typeof s.setupCompletedAt === "string") {
          setSetupCompletedAt(s.setupCompletedAt);
        } else {
          setSetupCompletedAt((prev) => prev ?? new Date().toISOString());
        }
      } else {
        setSetupCompletedAt((prev) => prev ?? new Date().toISOString());
      }
    } catch {
      setSetupCompletedAt((prev) => prev ?? new Date().toISOString());
    }
    setReconfigureRequested(true);
    // Clear any in-flight inline errors / per-step result banners so
    // the Reconfigure-mode callout is the only thing the operator
    // sees about the failed POST. A leftover red panel below the
    // callout would muddy the message.
    setInitError(null);
    setUrlError(null);
    setAdminError(null);
    setSmtpResult(null);
  }

  async function handleInitialize() {
    setInitializing(true);
    setInitError(null);
    setInitPhases([]);
    setMigrationOutput(null);
    setMigrationTipKey(null);
    try {
      const res = await setupFetch("/api/setup/initialize", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionUrl: applyDriverChoice(connectionUrl.trim(), driverChoice),
        }),
      });
      const data = await res.json();
      if (isSetupAlreadyCompleteResponse(res, data)) {
        // Stale-tab fallthrough — show the Reconfigure-mode callout
        // instead of a red "Initialize failed" banner.
        await enterReconfigureModeFromStaleClient();
        return;
      }
      setInitPhases(data.phases || []);
      setMigrationOutput(typeof data.migrationOutput === "string" ? data.migrationOutput : null);
      setMigrationTipKey(isMigrationTipKey(data.migrationTipKey) ? data.migrationTipKey : null);
      if (data.success) {
        setStep("secrets");
      } else {
        setInitError(serverErrorMessage(data, "setup.initialize.failedFallback"));
      }
    } catch {
      setInitError({ kind: "key", key: "setup.initialize.networkError" });
    } finally { setInitializing(false); }
  }

  async function handleSavePublicUrl() {
    setSavingUrl(true);
    setUrlError(null);
    try {
      const res = await setupFetch("/api/setup/public-url", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicAppUrl: publicUrl.trim() }),
      });
      const data = await res.json();
      if (isSetupAlreadyCompleteResponse(res, data)) {
        // Stale-tab fallthrough — surface the Reconfigure-mode callout
        // (Task #682) instead of "Failed to save URL".
        await enterReconfigureModeFromStaleClient();
        return;
      }
      if (data.success) {
        // task-375: re-fetch /api/setup/secrets so the wizard's
        // cached SecretsSnapshot reflects the freshly-written
        // PUBLIC_APP_URL value. The Public URL field-source badge
        // reads `secrets?.publicAppUrlSource` (so a previously-saved
        // value shows "From wizard file" the moment the wizard loads
        // on a return visit), but within a single wizard session the
        // snapshot the wizard cached on the Secrets step is now
        // stale and would leave the badge stuck on "Not set" if the
        // operator routes back to the Public URL step later in the
        // same session. Refreshing here flips the badge to "From
        // wizard file" the moment the value is persisted — matching
        // the post-save refresh task-371 added to handleSaveSmtp.
        // We deliberately await so the snapshot is current before
        // navigating to Admin; if the refresh fails we still
        // navigate (the badge will catch up on the next reload) so
        // a transient secrets-fetch hiccup can't strand the operator
        // mid-wizard.
        try {
          const sres = await setupFetch("/api/setup/secrets");
          // Only commit the refreshed snapshot if the server actually
          // returned a 2xx — otherwise a 4xx/5xx error body could
          // overwrite the wizard's good snapshot with a malformed
          // shape and mis-render every downstream source badge.
          if (sres.ok) {
            const snapshot = await sres.json();
            setSecrets(snapshot);
          }
        } catch {
          /* refresh failure is non-fatal — see comment above */
        }
        setStep("admin");
      } else {
        setUrlError(serverErrorMessage(data, "setup.publicUrl.saveError"));
      }
    } catch {
      setUrlError({ kind: "key", key: "setup.publicUrl.networkError" });
    } finally { setSavingUrl(false); }
  }

  async function handleCreateAdmin() {
    // Trip touched on every field so any pre-existing problems become
    // visible inline before/instead of hitting the server.
    setAdminTouched({ email: true, firstName: true, password: true });
    if (adminFormHasErrors) {
      setAdminError(null);
      return;
    }
    setCreatingAdmin(true);
    setAdminError(null);
    try {
      const res = await setupFetch("/api/setup/create-admin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: adminEmail.trim(),
          firstName: adminFirst.trim(),
          lastName: adminLast.trim(),
          password: adminPassword,
        }),
      });
      const data = await res.json();
      if (isSetupAlreadyCompleteResponse(res, data)) {
        // Stale-tab fallthrough — surface the Reconfigure-mode callout
        // (Task #682) instead of "Failed to create admin".
        await enterReconfigureModeFromStaleClient();
        return;
      }
      if (data.success) {
        // Admin save just wrote the bootstrap admin row to the DB. The
        // running session middleware still uses the *boot-time* session
        // secret / encryption key, so even though the DB now has an
        // admin the session round-trip on the Done step won't fully
        // green-light until the process restarts and re-reads the
        // wizard-managed values from data/db-config.json. Trip the
        // restart hint so the SMTP step's banner appears immediately.
        setRestartHinted(true);
        setRestartHintDismissed(false);
        setStep("smtp");
      } else if (res.status === 403 && data?.errorCode === "adminAlreadyExists") {
        // Server has confirmed the bootstrap endpoint is locked. Flip the
        // lock state so the operator sees the friendly callout + Skip
        // button instead of the raw error message — the form is now
        // useless and we don't want them to keep retrying it.
        setAdminLocked(true);
        setAdminError(null);
      } else if (res.status === 503 && data?.errorCode === "adminProbeFailed") {
        // Transient: the server couldn't reach the database to verify
        // whether an admin already exists, so it refused to insert one
        // (silently creating a duplicate would be worse than failing
        // loudly). Surface a localized, retry-oriented message and
        // leave every form field intact so the operator can simply
        // click Create Admin again once the DB hiccup clears. We keep
        // `adminLocked` false so the Create button stays enabled.
        setAdminError({ kind: "key", key: "setup.errors.adminProbeFailed" });
      } else {
        setAdminError(serverErrorMessage(data, "setup.admin.failed"));
      }
    } catch {
      setAdminError({ kind: "key", key: "setup.admin.networkError" });
    } finally { setCreatingAdmin(false); }
  }

  async function handleLaunch() {
    setRestarting(true);
    setHealthChecks([]);
    // Persist the setup-completed marker BEFORE restarting (task-378).
    // The marker is what flips /setup re-entries to the read-only
    // health-check view; without it, every post-Redeploy bounce drops
    // operators back at step 1. Idempotent on the server (COALESCE)
    // so re-launching from the Done step never moves the timestamp.
    // Failures are non-fatal — we still proceed with the restart so
    // the operator can recover by hitting Restart again, but we log
    // for diagnostics.
    try {
      const r = await setupFetch("/api/setup/complete", { method: "POST" });
      if (!r.ok) {
        // Task #682: detect the post-install 409 stub and switch to
        // the Reconfigure-mode callout instead of silently logging
        // and proceeding with a restart we have no permission to
        // trigger.
        try {
          const data = await r.clone().json();
          if (isSetupAlreadyCompleteResponse(r, data)) {
            await enterReconfigureModeFromStaleClient();
            setRestarting(false);
            return;
          }
        } catch {
          /* non-JSON body — fall through to the original warn */
        }
        console.warn("[setup] /api/setup/complete returned", r.status);
      }
    } catch (e) {
      console.warn("[setup] /api/setup/complete failed:", e);
    }
    // Task #688: /api/setup/restart is NOT one of the bootstrap-only POSTs
    // task-682 stubbed with a 409 — it stays mounted post-install but
    // flips to `restartRequiresAdmin: true` (see
    // server/routes/setup-routes.ts → registerSetupStatusRoutes), so a stale
    // browser tab landing on this branch without an admin session gets
    // a 401 `unauthenticated` (or 403 `forbidden` if logged in as a
    // non-Admin) instead. Without this branch the failure is swallowed
    // by the surrounding `try/catch` and we drop straight into the
    // 12-second poll loop, leaving the operator staring at "Server is
    // restarting…" forever even though no restart was ever attempted.
    // Surface the same Reconfigure-mode callout the bootstrap-only
    // stubs trigger so the operator gets a clear, actionable explainer
    // instead of an indefinite countdown.
    try {
      const restartRes = await setupFetch("/api/setup/restart", { method: "POST" });
      if (restartRes.status === 401 || restartRes.status === 403) {
        await enterReconfigureModeFromStaleClient();
        setRestarting(false);
        return;
      }
    } catch {
      /* network blip — fall through to the poll loop so a transient
         restart in flight (the server killing itself before the
         response can be flushed is a known-and-expected race) still
         lands the operator on the post-restart health view. */
    }
    // Poll until the server responds again, then run the full health suite
    // and SHOW the results — operator will click "Go to Login" themselves.
    let count = 12;
    setCountdown(count);
    const interval = setInterval(async () => {
      count -= 1;
      setCountdown(count);
      try {
        const ping = await fetch("/api/health", { cache: "no-store" });
        if (ping.ok) {
          clearInterval(interval);
          setCountdown(null);
          await runHealthChecks();
          setRestarting(false);
          return;
        }
      } catch { /* still down */ }
      if (count <= 0) {
        clearInterval(interval);
        setCountdown(null);
        await runHealthChecks();
        setRestarting(false);
      }
    }, 1000);
  }

  async function runHealthChecks() {
    const checks: HealthCheck[] = [];
    // /api/health — generic liveness
    try {
      const h = await fetch("/api/health");
      const hj = await h.json();
      checks.push({
        nameKey: "setup.done.checks.serverAlive",
        ok: !!hj.ok,
        detail: hj.uptimeSec
          ? { kind: "key", key: "setup.done.checks.uptime", params: { seconds: hj.uptimeSec } }
          : undefined,
      });
    } catch (e: any) {
      checks.push({
        nameKey: "setup.done.checks.serverAlive",
        ok: false,
        detail: e?.message ? { kind: "raw", text: String(e.message) } : undefined,
      });
    }
    // /api/setup/status — config + admin presence
    try {
      const r = await setupFetch("/api/setup/status");
      const s: SetupStatus = await r.json();
      // Capture per-var source state for the Done step's "What the
      // running server sees" panel. We do it inside runHealthChecks
      // (rather than a separate fetch) so the panel is always
      // perfectly in sync with the rest of the health list — same
      // round-trip, same view of process.env.
      setRunningSources({
        databaseUrl: classifyRunningSource(s.databaseUrlSource),
        sessionSecret: classifyRunningSource(s.sessionSecretSource),
        encryptionKey: classifyRunningSource(s.encryptionKeySource),
        publicAppUrl: classifyRunningSource(s.publicAppUrlSource),
      });
      checks.push({
        nameKey: "setup.done.checks.dbReachable",
        ok: !s.setupRequired,
        detail: {
          kind: "key",
          key: s.setupRequired
            ? "setup.done.checks.dbConfigMissing"
            : "setup.done.checks.dbConnected",
        },
      });
      checks.push({ nameKey: "setup.done.checks.adminExists", ok: s.adminExists });
      checks.push({ nameKey: "setup.done.checks.sessionSecretSet", ok: s.hasSessionSecret });
      checks.push({ nameKey: "setup.done.checks.encryptionKeySet", ok: s.hasEncryptionKey });
      // Real reachability probe — fetch /api/health from the configured
      // PUBLIC_APP_URL to confirm DNS + TLS + reverse-proxy actually land
      // back on this server (not just that the value is set). Task #582:
      // when the running process is still on the localhost fallback
      // (`publicAppUrlSource === 'default'`) the URL the snapshot
      // returns is literally `http://localhost:5000` — probing it from
      // the operator's browser will *always* fail and the resulting
      // "http://localhost:5000 unreachable" detail is misleading (the
      // real cause is "the server hasn't loaded the saved value yet").
      // Skip the probe in that state and surface the same "not loaded
      // — restart the server to apply" wording the post-completion
      // health-check view uses, so the two surfaces stay consistent.
      if (s.publicAppUrlSource === "default") {
        checks.push({
          nameKey: "setup.done.checks.publicUrlResolves",
          ok: false,
          detail: { kind: "key", key: "setup.done.checks.publicUrlNotLoaded" },
        });
      } else if (s.publicAppUrl) {
        try {
          const probeUrl = s.publicAppUrl.replace(/\/$/, "") + "/api/health";
          const ph = await fetch(probeUrl, { cache: "no-store", credentials: "omit" });
          checks.push({
            nameKey: "setup.done.checks.publicUrlResolves",
            ok: ph.ok,
            detail: {
              kind: "key",
              key: ph.ok
                ? "setup.done.checks.publicUrlOk"
                : "setup.done.checks.publicUrlReturned",
              params: { url: s.publicAppUrl, status: ph.status },
            },
          });
        } catch (e: any) {
          checks.push({
            nameKey: "setup.done.checks.publicUrlResolves",
            ok: false,
            detail: {
              kind: "key",
              key: "setup.done.checks.publicUrlUnreachable",
              params: {
                url: s.publicAppUrl,
                error: e?.message ?? "",
              },
            },
          });
        }
      } else {
        checks.push({
          nameKey: "setup.done.checks.publicUrlConfigured",
          ok: false,
          detail: { kind: "key", key: "setup.done.checks.publicUrlNotSet" },
        });
      }
    } catch (e: any) {
      checks.push({
        nameKey: "setup.done.checks.statusEndpoint",
        ok: false,
        detail: e?.message ? { kind: "raw", text: String(e.message) } : undefined,
      });
    }
    // Session round-trip — unauthenticated /api/auth/user should return 401 cleanly
    try {
      const u = await fetch("/api/auth/user");
      checks.push({
        nameKey: "setup.done.checks.authRoundTrip",
        ok: u.status === 401 || u.status === 200,
        detail: {
          kind: "key",
          key: "setup.done.checks.authStatus",
          params: { status: u.status },
        },
      });
    } catch (e: any) {
      checks.push({
        nameKey: "setup.done.checks.authRoundTrip",
        ok: false,
        detail: e?.message ? { kind: "raw", text: String(e.message) } : undefined,
      });
    }
    setHealthChecks(checks);
  }

  async function handleSaveSmtp() {
    setSmtpSaving(true);
    setSmtpResult(null);
    try {
      const res = await setupFetch("/api/setup/smtp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: smtpHost.trim(), port: Number(smtpPort), user: smtpUser.trim(), pass: smtpPass, from: smtpFrom.trim() }),
      });
      const data = await res.json();
      if (isSetupAlreadyCompleteResponse(res, data)) {
        // Stale-tab fallthrough — surface the Reconfigure-mode callout
        // (Task #682) instead of "SMTP save failed".
        await enterReconfigureModeFromStaleClient();
        return;
      }
      if (data.success) {
        setSmtpResult({ ok: true, message: { kind: "key", key: "setup.smtp.saved" } });
        // SMTP credentials live in db-config.json and only become
        // active after the next process boot — surface the restart
        // hint on the Done step immediately so the operator isn't
        // surprised when the auth round-trip / publicUrl checks come
        // back red because the boot-time config is still empty.
        setRestartHinted(true);
        setRestartHintDismissed(false);
        // task-371: re-fetch /api/setup/secrets so the wizard's
        // cached SecretsSnapshot reflects the freshly-written SMTP
        // block. Task-370 wired the SMTP host badge to read its
        // source-of-truth from `secrets?.smtpHostSource` (so a
        // previously-deferred host shows "From wizard file" the
        // moment the wizard loads on a return visit), but within a
        // single wizard session the snapshot the wizard cached on
        // the Secrets step is now stale and would leave the badge
        // stuck on "Not set" right after the operator clicked Save
        // SMTP. Refreshing here flips the badge to "From wizard
        // file" the moment the deferred row is written — matching
        // what the operator just did, without waiting for a page
        // reload. We deliberately await so the snapshot is current
        // before navigating to Done; if the refresh fails we still
        // navigate (the badge will catch up on the next reload) so
        // a transient secrets-fetch hiccup can't strand the operator
        // mid-wizard.
        try {
          const sres = await setupFetch("/api/setup/secrets");
          // Only commit the refreshed snapshot if the server actually
          // returned a 2xx — otherwise a 4xx/5xx error body could
          // overwrite the wizard's good snapshot with a malformed
          // shape and mis-render every downstream source badge.
          if (sres.ok) {
            const snapshot = await sres.json();
            setSecrets(snapshot);
          }
        } catch {
          /* refresh failure is non-fatal — see comment above */
        }
        setStep("crm");
      } else {
        setSmtpResult({
          ok: false,
          message: serverErrorMessage(data, "setup.smtp.failed"),
        });
      }
    } catch (e: any) {
      setSmtpResult({
        ok: false,
        message: e?.message
          ? { kind: "raw", text: String(e.message) }
          : { kind: "key", key: "setup.actions.networkError" },
      });
    } finally { setSmtpSaving(false); }
  }

  async function handleSaveCrm() {
    setCrmSaving(true);
    setCrmResult(null);
    try {
      const res = await setupFetch("/api/setup/crm-provider", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: crmChoice }),
      });
      const data = await res.json();
      if (isSetupAlreadyCompleteResponse(res, data)) {
        await enterReconfigureModeFromStaleClient();
        return;
      }
      if (data.success) {
        // Applied on the next start, like SMTP, so the restart hint applies.
        setRestartHinted(true);
        setRestartHintDismissed(false);
        setStep("done");
      } else {
        setCrmResult(serverErrorMessage(data, "setup.crm.failed"));
      }
    } catch (e: any) {
      setCrmResult(
        e?.message ? { kind: "raw", text: String(e.message) } : { kind: "key", key: "setup.actions.networkError" },
      );
    } finally { setCrmSaving(false); }
  }

  // Wraps safeCopyToClipboard so any unexpected exception (insecure context,
  // browser-level permission denial, missing execCommand fallback, etc.) shows
  // a localized destructive toast WITHOUT the secret value in the
  // description — the bare `navigator.clipboard.writeText(value)` call this
  // used to make threw a TypeError on plain-HTTP deployments because
  // `navigator.clipboard` is `undefined` outside a secure context, and we
  // must never echo SESSION_SECRET / ENCRYPTION_KEY back through a toast
  // body where it could leak via screen recordings or browser-side log
  // capture. The toast points at the field instead so the operator can
  // open it and copy manually.
  async function copyToClipboard(label: string, value: string) {
    const ok = await safeCopyToClipboard(value);
    if (!ok) {
      showErrorToast(t("setup.envHelper.copyFailed"), t("setup.envHelper.copyFailedHint"));
      return;
    }
    setCopiedField(label);
    setTimeout(
      () => setCopiedField((prev) => (prev === label ? null : prev)),
      1500,
    );
  }

  // Helper for the env-var copy-paste panel below. We pass the most current
  // values the wizard knows about (DATABASE_URL from step 1, the persisted
  // SESSION_SECRET / ENCRYPTION_KEY values when the server has them in the
  // file source, and the operator-edited PUBLIC_APP_URL) into the panel so
  // the operator can paste a complete KEY=VALUE block into Dokploy / Coolify
  // / Railway. Secrets stored in the operator's env are never round-tripped
  // back to the browser, so for those we leave the value blank and offer a
  // "Generate" button that produces a fresh `openssl rand -base64 48`-grade
  // string client-side via crypto.getRandomValues.
  const envHelperValues = {
    // The "DATABASE_URL" copy block needs to carry the same `?driver=`
    // override the test/initialize POSTs use, so a value the operator
    // pastes back into Dokploy/Coolify/Railway preserves the choice on
    // the next process restart instead of silently reverting to the
    // hostname-detected default. (Task #481)
    databaseUrl: applyDriverChoice(connectionUrl.trim(), driverChoice),
    sessionSecret: secrets?.sessionSecretValue ?? "",
    encryptionKey: secrets?.encryptionKeyValue ?? "",
    // Suppress the `default`-sourced snapshot value (server's localhost
    // fallback) so it doesn't leak into the env-helper Copy paths.
    publicAppUrl:
      publicUrl.trim() ||
      (secrets?.publicAppUrlSource === "default"
        ? ""
        : secrets?.publicAppUrl || ""),
    // Per-row source tags drive the small "env / file / wizard / not set"
    // badges inside EnvHelperPanel so operators can tell at a glance which
    // values still need to be promoted into their hosting platform's env
    // editor before the next redeploy. We trust the snapshot from
    // /api/setup/secrets for SESSION_SECRET / ENCRYPTION_KEY / PUBLIC_APP_URL,
    // and for DATABASE_URL we mirror the snapshot but promote a locally-typed
    // value to "wizard" if the operator just entered it on step 1 and the
    // server hasn't seen the persisted store yet (snapshot returns 'none').
    sources: {
      databaseUrl: ((): EnvHelperSource => {
        const fromSnapshot = secrets?.databaseUrlSource;
        if (fromSnapshot === "env") return "env";
        if (fromSnapshot === "wizard") return "wizard";
        return connectionUrl.trim() ? "wizard" : "not-set";
      })(),
      sessionSecret: mapSecretSource(secrets?.sessionSecretSource),
      encryptionKey: mapSecretSource(secrets?.encryptionKeySource),
      publicAppUrl: mapPublicUrlSource(secrets?.publicAppUrlSource),
    },
  };

  // Copy a literal English snippet (SQL / URL fragment / shell command) to the
  // clipboard from the migrate-failure tips. We surface a localized toast so
  // operators on any locale see confirmation, but the snippet itself stays
  // verbatim because it is paste-into-psql-or-URL text.
  // navigator.clipboard.writeText returns a Promise that rejects on permission
  // failure (insecure context, denied site permission, etc.). We await it so a
  // denied copy shows an error toast instead of a misleading "copied" message.
  async function copyMigrationSnippet(tipKey: MigrationTipKey, snippet: string) {
    const fieldLabel = `migration-snippet:${tipKey}`;
    const ok = await safeCopyToClipboard(snippet);
    if (!ok) {
      // Migration snippets are public English SQL/URL fragments (not
      // secrets), but we still keep the toast description generic so the
      // failure UX matches the secret-row Copy buttons and operators can
      // see the snippet inline by re-opening the tip card.
      showErrorToast(t("setup.initialize.migrationOutput.copyFailedToastTitle"), t("setup.envHelper.copyFailedHint"));
      return;
    }
    setCopiedField(fieldLabel);
    setTimeout(
      () => setCopiedField((prev) => (prev === fieldLabel ? null : prev)),
      1500,
    );
    showSuccessToast(t("setup.initialize.migrationOutput.copyToastTitle"), snippet);
  }

  const stepIndex = STEP_IDS.findIndex((id) => id === step);

  // Task #679: post-install Reconfigure mode — mutating wizard
  // endpoints aren't mounted, so disable forward-progress buttons
  // and show a callout pointing at the env-var-swap path.
  const isReconfigureMode = !!setupCompletedAt && reconfigureRequested;

  // Wizard-vs-health-check landing branch (task-378). When the server
  // reports a persisted `setup_completed_at` timestamp AND the operator
  // has not explicitly clicked "Reconfigure…" we render the read-only
  // SetupHealthCheckView component. This catches both the intentional
  // "/setup after install" visit AND the post-Redeploy useAuth bounce
  // (which arrives with `?reentry=1`) so neither path silently
  // restarts the wizard at step 1 and overwrites saved configuration.
  if (statusFetched && setupCompletedAt && !reconfigureRequested) {
    return (
      <SetupHealthCheckView
        setupCompletedAt={setupCompletedAt}
        reentry={reentry}
        onReconfigure={() => setReconfigureRequested(true)}
      />
    );
  }

  if (needsSetupToken) {
    return (
      <SetupShell>
        <SetupTokenGate onUnlocked={() => setNeedsSetupToken(false)} />
      </SetupShell>
    );
  }

  return (
    <SetupShell
      pills={
        <div className="flex items-center justify-center gap-1 text-xs flex-wrap">
          {STEP_IDS.map((id, i) => (
            <div key={id} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="w-3 h-3 text-blue-300 opacity-50" />}
              <span className={`px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${
                step === id ? "bg-white text-blue-900"
                : i < stepIndex ? "bg-blue-400 text-white"
                : "bg-blue-800 text-blue-300"
              }`}>
                {t("setup.stepNumber", { n: i + 1, label: t(STEP_LABEL_KEYS[id]) })}
              </span>
            </div>
          ))}
        </div>
      }
    >

        {/* Task #679: pinned above every step in Reconfigure mode.
            Task #681: extended with a runtime-aware helper row that
            offers a one-click "Open env-var editor" deep link and (on
            Coolify with COOLIFY_API_TOKEN set) a confirmed
            "Apply DATABASE_URL & restart" button. The original docs
            hint stays as the manual fallback for unknown runtimes and
            for operators who'd rather edit the env panel themselves. */}
        {isReconfigureMode && (
          <div
            data-testid="callout-reconfigure-mode"
            className="rounded-md border border-blue-200 bg-blue-50 text-blue-900 p-4 space-y-3"
            role="status"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-blue-600" />
              <div className="flex-1 space-y-1">
                <div className="font-semibold">
                  {t("setup.reconfigureMode.title")}
                </div>
                <p className="text-sm">
                  {t("setup.reconfigureMode.body")}
                </p>
                <p className="text-xs text-blue-800">
                  <Trans
                    i18nKey="setup.reconfigureMode.docsHint"
                    components={[<code className="font-mono bg-white border border-blue-200 rounded px-1 py-0.5" />]}
                  />
                </p>
              </div>
            </div>

            {runtimeInfo && (
              <div
                data-testid="reconfigure-runtime-helper"
                data-runtime={runtimeInfo.runtime}
                className="rounded border border-blue-200 bg-white p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-xs text-blue-900">
                    <span className="font-semibold">
                      {t("setup.reconfigureMode.runtimeHelper.detectedLabel", {
                        defaultValue: "Detected runtime:",
                      })}
                    </span>{" "}
                    <span
                      className="font-mono"
                      data-testid="runtime-helper-runtime-name"
                    >
                      {t(
                        `setup.reconfigureMode.runtimeHelper.runtime.${runtimeInfo.runtime}`,
                        { defaultValue: runtimeInfo.runtime },
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {runtimeInfo.envEditorUrl ? (
                      <a
                        href={runtimeInfo.envEditorUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="button-open-env-editor"
                        className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded border border-blue-300 bg-blue-50 text-blue-900 hover:bg-blue-100"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        {t("setup.reconfigureMode.runtimeHelper.openEditor", {
                          defaultValue: "Open env-var editor",
                        })}
                      </a>
                    ) : (
                      <span
                        data-testid="env-editor-unavailable"
                        className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded border border-blue-200 bg-white text-blue-500"
                        title={t(
                          "setup.reconfigureMode.runtimeHelper.openEditorUnavailableHint",
                          {
                            defaultValue:
                              "We couldn't detect a known host UI for this runtime. Edit DATABASE_URL on your platform manually.",
                          },
                        )}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        {t(
                          "setup.reconfigureMode.runtimeHelper.openEditorUnavailable",
                          { defaultValue: "No deep link available" },
                        )}
                      </span>
                    )}
                    {runtimeInfo.controlApi.available ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="default"
                        data-testid="button-apply-database-url"
                        disabled={!testResult?.success || applyingSwap}
                        title={
                          !testResult?.success
                            ? t(
                                "setup.reconfigureMode.runtimeHelper.applyDisabledHint",
                                {
                                  defaultValue:
                                    "Run Test Connection on a candidate URL first.",
                                },
                              )
                            : undefined
                        }
                        onClick={() => {
                          setApplyResult(null);
                          // Task #701: reset the dry-run preview state
                          // every time the dialog opens so the operator
                          // never sees a stale diff from a previous
                          // candidate URL that they may have edited
                          // since the last open.
                          setPreviewExpanded(false);
                          setPreviewDiff(null);
                          setPreviewError(null);
                          setPreviewLoading(false);
                          setShowApplyDialog(true);
                        }}
                      >
                        <Zap className="w-3.5 h-3.5 mr-1.5" />
                        {t("setup.reconfigureMode.runtimeHelper.applyButton", {
                          defaultValue: "Apply DATABASE_URL & restart",
                        })}
                      </Button>
                    ) : (
                      runtimeInfo.controlApi.tokenEnvVar &&
                      runtimeInfo.controlApi.unavailableReason ===
                        "missingToken" && (
                        <span
                          data-testid="apply-button-unavailable"
                          className="text-xs text-blue-700"
                        >
                          {t(
                            "setup.reconfigureMode.runtimeHelper.applyMissingToken",
                            {
                              tokenEnvVar:
                                runtimeInfo.controlApi.tokenEnvVar,
                              defaultValue:
                                "Set {{tokenEnvVar}} on your host to enable one-click apply.",
                            },
                          )}
                        </span>
                      )
                    )}
                  </div>
                </div>
                {applyResult && (() => {
                  // Task #700: when the banner is showing the
                  // rate-limit countdown variant, keep its seconds
                  // value bound to the live `retrySecondsRemaining`
                  // tick (the same source the disabled action button
                  // reads). Once the countdown hits 0, downgrade the
                  // banner from the countdown copy back to the
                  // generic `controlApiRateLimited` "wait a moment"
                  // copy so the banner doesn't strand at "try again
                  // in 0 seconds" after the window has elapsed.
                  let renderedMessage: string;
                  if (applyResult.kind === "success") {
                    renderedMessage = applyResult.message;
                  } else if (
                    applyResult.message.kind === "key"
                    && applyResult.message.key
                      === "setup.errors.controlApiRateLimitedCountdown"
                  ) {
                    if (retrySecondsRemaining > 0) {
                      renderedMessage = resolveMessage(t, {
                        kind: "key",
                        key: "setup.errors.controlApiRateLimitedCountdown",
                        params: { seconds: retrySecondsRemaining },
                      });
                    } else {
                      renderedMessage = resolveMessage(t, {
                        kind: "key",
                        key: "setup.errors.controlApiRateLimited",
                      });
                    }
                  } else {
                    renderedMessage = resolveMessage(t, applyResult.message);
                  }
                  return (
                    <div
                      data-testid={
                        applyResult.kind === "success"
                          ? "apply-result-success"
                          : "apply-result-error"
                      }
                      className={`text-xs px-2 py-1.5 rounded border ${
                        applyResult.kind === "success"
                          ? "border-green-200 bg-green-50 text-green-800"
                          : "border-red-200 bg-red-50 text-red-800"
                      }`}
                    >
                      {renderedMessage}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* Task #681: confirm dialog for the Apply-via-control-API
            path. Mounted at the top level so it's rendered regardless
            of which step the operator is on when they click Apply.
            The actual apply logic (re-test + Coolify PATCH+restart)
            runs server-side; this dialog just captures the explicit
            confirm. */}
        <AlertDialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
          <AlertDialogContent data-testid="dialog-confirm-apply-database-url">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t(
                  "setup.reconfigureMode.runtimeHelper.confirmTitle",
                  { defaultValue: "Apply new DATABASE_URL and redeploy?" },
                )}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t(
                  "setup.reconfigureMode.runtimeHelper.confirmBody",
                  {
                    defaultValue:
                      "This will write the URL you just tested into your host's environment editor and trigger a redeploy. Existing logged-in sessions will be ended when the container restarts. There is no automatic rollback — keep the current URL handy in case you need to revert.",
                  },
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {/* Task #701: dry-run env-diff expander. Lets the operator
                see exactly which lines the merge would write to their
                host's env BEFORE they commit the swap, so accidental
                clobbers from a malformed line-anchored regex match
                show up here rather than after the redeploy fires.
                Read-only on the server side — no saveEnvironment /
                deploy calls — see `applyDatabaseUrlVia*` in
                `server/lib/runtime-info.ts`. */}
            <div
              className="text-xs"
              data-testid="env-diff-preview-section"
            >
              <button
                type="button"
                data-testid="button-toggle-env-diff-preview"
                aria-expanded={previewExpanded}
                className="text-blue-700 hover:text-blue-900 underline underline-offset-2"
                onClick={() => {
                  if (!previewExpanded) {
                    setPreviewExpanded(true);
                    if (previewDiff === null && !previewLoading) {
                      void loadEnvDiffPreview();
                    }
                  } else {
                    setPreviewExpanded(false);
                  }
                }}
              >
                {previewExpanded
                  ? t("setup.reconfigureMode.runtimeHelper.previewHide")
                  : t("setup.reconfigureMode.runtimeHelper.previewToggle")}
              </button>
              {previewExpanded && (
                <div
                  className="mt-2 space-y-2"
                  data-testid="env-diff-preview-body"
                >
                  <p className="text-[11px] text-muted-foreground">
                    {t("setup.reconfigureMode.runtimeHelper.previewIntro")}
                  </p>
                  {previewLoading && (
                    <div
                      className="text-xs text-muted-foreground inline-flex items-center gap-1.5"
                      data-testid="env-diff-preview-loading"
                    >
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {t("setup.reconfigureMode.runtimeHelper.previewLoading")}
                    </div>
                  )}
                  {!previewLoading && previewError && (
                    <div
                      data-testid="env-diff-preview-error"
                      className="text-xs px-2 py-1.5 rounded border border-red-200 bg-red-50 text-red-800"
                    >
                      {resolveMessage(t, previewError)}
                    </div>
                  )}
                  {!previewLoading && !previewError && previewDiff !== null && (
                    previewDiff.trim().length === 0
                    || previewDiff
                      .split(/\r?\n/)
                      .every(
                        (line) =>
                          line.length === 0
                          || line.startsWith(" ")
                          || line.startsWith("---")
                          || line.startsWith("+++"),
                      ) ? (
                      <div
                        data-testid="env-diff-preview-empty"
                        className="text-xs px-2 py-1.5 rounded border border-blue-200 bg-blue-50 text-blue-800"
                      >
                        {t("setup.reconfigureMode.runtimeHelper.previewEmpty")}
                      </div>
                    ) : (
                      <pre
                        data-testid="env-diff-preview-diff"
                        className="text-[11px] font-mono whitespace-pre-wrap break-all max-h-48 overflow-auto rounded border border-slate-200 bg-slate-50 p-2"
                      >
                        {previewDiff.split(/\r?\n/).map((line, idx) => {
                          let cls = "text-slate-700";
                          if (line.startsWith("+++") || line.startsWith("---")) {
                            cls = "text-slate-500";
                          } else if (line.startsWith("+")) {
                            cls = "text-green-700 bg-green-50";
                          } else if (line.startsWith("-")) {
                            cls = "text-red-700 bg-red-50";
                          }
                          return (
                            <div key={idx} className={cls}>
                              {line.length === 0 ? "\u00A0" : line}
                            </div>
                          );
                        })}
                      </pre>
                    )
                  )}
                </div>
              )}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel
                disabled={applyingSwap}
                data-testid="button-cancel-apply"
              >
                {t("common.cancel", { defaultValue: "Cancel" })}
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={
                  applyingSwap
                  || retrySecondsRemaining > 0
                  // Task #707: also keep the button disabled during the
                  // +grace tail of an armed auto-resume — the visible
                  // countdown has already hit zero but the wizard is
                  // about to fire the request itself, so we don't want
                  // the operator to race the timer with a manual click.
                  || autoRetryPending
                }
                data-retry-after-seconds={
                  retrySecondsRemaining > 0 ? retrySecondsRemaining : undefined
                }
                data-auto-retrying={
                  // Task #707: surface the auto-resume state on the
                  // DOM so end-to-end tests (and operators inspecting
                  // the live dialog) can distinguish the "wizard will
                  // re-fire automatically" window from the manual
                  // fallback after the cap is hit. Bound to
                  // `autoRetryPending` so the marker stays present for
                  // the full armed window (countdown + grace), not
                  // only while the visible countdown is non-zero.
                  autoRetryPending ? "true" : undefined
                }
                onClick={(e) => {
                  // Stop the dialog from closing automatically on click —
                  // we close it explicitly only on success so the
                  // operator can see the in-flight spinner.
                  e.preventDefault();
                  void handleApplyViaControlApi();
                }}
                data-testid="button-confirm-apply"
              >
                {applyingSwap ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    {t(
                      "setup.reconfigureMode.runtimeHelper.applying",
                      { defaultValue: "Applying…" },
                    )}
                  </>
                ) : autoRetryPending ? (
                  // Task #707: while the auto-resume timer is armed,
                  // replace the manual "Retry in Ns" copy with a
                  // "Retrying automatically…" hint so the operator
                  // knows the wizard will re-fire the apply on its
                  // own as soon as the host's window elapses. We
                  // bind to `autoRetryPending` rather than the
                  // visible countdown so the hint stays in place for
                  // the entire armed window, including the +grace
                  // tail after the countdown reaches zero. The button
                  // stays disabled either way, but the copy change
                  // avoids the "am I supposed to click this when it
                  // re-enables?" ambiguity. Falls back to the Task
                  // #700 countdown label once the cap is hit.
                  t(
                    "setup.reconfigureMode.runtimeHelper.retryingAutomatically",
                    { defaultValue: "Retrying automatically…" },
                  )
                ) : retrySecondsRemaining > 0 ? (
                  // Task #700: while the host's Retry-After window is
                  // still open AND the auto-resume budget is exhausted,
                  // swap the action label for an inline countdown so
                  // the operator can see at a glance when the button
                  // will re-enable for a manual retry. Falls back to
                  // the plain "Apply & redeploy" copy as soon as the
                  // window elapses.
                  t(
                    "setup.reconfigureMode.runtimeHelper.retryIn",
                    {
                      seconds: retrySecondsRemaining,
                      defaultValue: "Retry in {{seconds}}s",
                    },
                  )
                ) : (
                  t(
                    "setup.reconfigureMode.runtimeHelper.confirmAction",
                    { defaultValue: "Apply & redeploy" },
                  )
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* DB-unreachable callout (task #361). Shown above every step
            when the boot/status probe reports a configured-but-broken
            DATABASE_URL. Body uses only the normalized code, never raw
            driver text. Forward-progress buttons gate on dbUnreachable. */}
        {dbUnreachable && (
          <div
            data-testid="callout-db-unreachable"
            className="rounded-md border border-red-200 bg-red-50 text-red-900 p-4 space-y-3"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-red-600" />
              <div className="flex-1 space-y-1">
                <div className="font-semibold">
                  {t("setup.dbUnreachable.title")}
                  {dbUnreachableHost && (
                    <>
                      {" "}
                      <span
                        className="font-normal text-red-800"
                        data-testid="db-unreachable-host"
                      >
                        {t("setup.dbUnreachable.atHost", { host: dbUnreachableHost })}
                      </span>
                    </>
                  )}
                </div>
                <p className="text-sm">
                  <span data-testid="db-unreachable-code">
                    {t(DB_ERROR_CODE_KEYS[dbUnreachableCode])}
                  </span>
                  {" — "}
                  {t("setup.dbUnreachable.body")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-white border border-red-200 rounded px-2 py-1 truncate">
                {DB_URL_EXAMPLE}
              </code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={copyDbUrlExample}
                data-testid="button-copy-db-url-example"
                className="shrink-0"
              >
                {copiedExample ? (
                  <><Check className="w-3.5 h-3.5 mr-1" />{t("setup.envHelper.copied")}</>
                ) : (
                  <><Copy className="w-3.5 h-3.5 mr-1" />{t("setup.dbUnreachable.exampleLabel")}</>
                )}
              </Button>
            </div>
          </div>
        )}

        {step === "connect" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Database className="w-5 h-5" />{t("setup.connect.title")}</CardTitle>
              <CardDescription>{t("setup.connect.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="url">{t("setup.connect.urlLabel")}</Label>
                <Input id="url" type="password" placeholder={t("setup.connect.urlPlaceholder")}
                  value={connectionUrl}
                  onChange={(e) => {
                    const next = e.target.value;
                    setConnectionUrl(next);
                    setTestResult(null);
                    // Re-sync the dropdown from the URL so a pasted
                    // `?driver=neon` (or a value typed by hand) shows
                    // up in the selector instead of being silently
                    // overwritten back to "auto" the next time the
                    // operator changes the dropdown. (Task #481)
                    setDriverChoice(readDriverChoice(next));
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleTestConnection()}
                  className="font-mono text-sm" />
                <p className="text-xs text-muted-foreground">{t("setup.connect.urlHint")}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="driver">{t("setup.connect.driverLabel")}</Label>
                <Select
                  value={driverChoice}
                  onValueChange={(value) => {
                    const next = value as DriverChoice;
                    setDriverChoice(next);
                    // Mirror the dropdown into the URL field so what
                    // the operator sees in the Connection URL input is
                    // exactly what gets POSTed to test-connection /
                    // initialize and (after Initialize) what gets
                    // persisted to data/db-config.json.
                    setConnectionUrl((prev) => applyDriverChoice(prev, next));
                    setTestResult(null);
                  }}
                >
                  <SelectTrigger id="driver" data-testid="select-setup-driver">
                    <SelectValue placeholder={t("setup.connect.driverOptions.auto")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto" data-testid="select-setup-driver-auto">
                      {t("setup.connect.driverOptions.auto")}
                    </SelectItem>
                    <SelectItem value="neon" data-testid="select-setup-driver-neon">
                      {t("setup.connect.driverOptions.neon")}
                    </SelectItem>
                    <SelectItem value="pg" data-testid="select-setup-driver-pg">
                      {t("setup.connect.driverOptions.pg")}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t("setup.connect.driverHint")}</p>
              </div>
              {testResult && (
                <div className={`flex items-start gap-2 p-3 rounded-md text-sm ${testResult.success ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-800"}`}>
                  {testResult.success ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                  <div className="flex-1 space-y-2">
                    <div>{testResult.success ? <><strong>{t("setup.connect.connectionOk")}</strong> — {testResult.latencyMs}ms</> : <><strong>{t("setup.connect.connectionFailed")}</strong>{testResult.error ? ` — ${resolveMessage(t, testResult.error)}` : ""}</>}</div>
                    {!testResult.success && testResult.tipKey && (
                      <div
                        className="rounded border border-red-200 bg-white/60 px-2 py-2 text-red-900"
                        data-testid={`connect-tip-${testResult.tipKey}`}
                      >
                        <div className="font-medium">
                          <span>{t(`setup.initialize.migrationOutput.tips.${testResult.tipKey}`)}</span>
                          <span className="ml-1 inline-block rounded bg-red-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-red-800">
                            {t("setup.initialize.migrationOutput.mostLikelyBadge")}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {testResult?.success && dbUnreachable && (
                testResult.matchesLiveUrl ? (
                  // Task #451: the URL the operator just tested is byte-for-byte
                  // the same one the host process is using and the live probe
                  // is failing against. Saving it again won't change anything,
                  // so swap the reassuring "Continue is enabled" note for a
                  // sharper warning that nudges them to actually edit the URL
                  // (password / host / db name) before clicking Continue.
                  <div
                    className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                    data-testid="callout-same-url-as-broken"
                  >
                    <div className="font-medium">
                      {t("setup.connect.sameUrlAsBroken.title")}
                    </div>
                    <p className="mt-1">
                      {t("setup.connect.sameUrlAsBroken.body")}
                    </p>
                  </div>
                ) : (
                  <div
                    className="rounded-md border border-muted bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
                    data-testid="callout-continue-despite-live-probe"
                  >
                    <div className="font-medium text-foreground">
                      {t("setup.connect.continueDespiteLiveProbe.title")}
                    </div>
                    <p className="mt-1">
                      {t("setup.connect.continueDespiteLiveProbe.body")}
                    </p>
                  </div>
                )
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleTestConnection} disabled={testing || !connectionUrl.trim()} className="flex-1">
                  {testing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("setup.connect.testing")}</> : t("setup.connect.testButton")}
                </Button>
                {/*
                  Task #450: do NOT gate Continue on `dbUnreachable` here.
                  The Database step exists to repair a bad live `DATABASE_URL`
                  — gating its own Continue button on the live probe creates a
                  chicken-and-egg deadlock (operator types a working URL,
                  Test Connection passes green, but Continue stays disabled
                  forever because the host's broken `DATABASE_URL` still
                  fails the background probe). Later steps (Initialize,
                  Secrets, Public URL, Admin, SMTP) intentionally keep the
                  `dbUnreachable` gate from Task #361 so the wizard can't
                  finish against a broken live DB.
                */}
                <Button
                  onClick={() => setStep("initialize")}
                  disabled={!testResult?.success || isReconfigureMode}
                  title={isReconfigureMode ? t("setup.reconfigureMode.disabledHint") : undefined}
                  className="flex-1"
                  data-testid="button-continue-connect"
                >
                  {t("setup.actions.continue")}<ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "initialize" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5" />{t("setup.initialize.title")}</CardTitle>
              <CardDescription>{t("setup.initialize.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted rounded-md p-3 text-sm space-y-1">
                <p className="font-medium">{t("setup.initialize.phasesLabel")}</p>
                <ul className="text-muted-foreground list-disc list-inside space-y-0.5">
                  <li>{t("setup.initialize.phaseConnect")}</li>
                  <li>{t("setup.initialize.phaseSecrets")}</li>
                  <li>{t("setup.initialize.phaseTables")}</li>
                  <li>{t("setup.initialize.phaseConfig")}</li>
                </ul>
              </div>
              {initPhases.length > 0 && (
                <div className="space-y-1.5">
                  {initPhases.map((p) => {
                    const fallback = p.phase.replace("-", " ");
                    const translatedPhase = t(`setup.initialize.phaseStatuses.${p.phase}`, { defaultValue: fallback });
                    const isFallback = translatedPhase === fallback;
                    return (
                      <div key={p.phase} className={`flex items-start gap-2 text-sm p-2 rounded border ${p.ok ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                        {p.ok ? <CheckCircle className="w-4 h-4 mt-0.5 text-green-600" /> : <AlertCircle className="w-4 h-4 mt-0.5 text-red-600" />}
                        <div className="flex-1">
                          <span className={`font-medium${isFallback ? " capitalize" : ""}`}>{translatedPhase}</span>
                          {p.ms !== undefined && <span className="ml-2 text-xs text-muted-foreground">{p.ms}ms</span>}
                          {!p.ok && p.detail && (
                            p.phase === "migrate" ? (
                              <div className="mt-1 text-xs text-red-700 space-y-2">
                                <div className="rounded border border-red-200 bg-white/60 px-2 py-2">
                                  <div className="font-medium">
                                    {t("setup.initialize.migrationOutput.commonCausesTitle")}
                                  </div>
                                  <ul className="mt-1 list-disc list-outside pl-5 space-y-2">
                                    {MIGRATION_TIP_KEYS.map((tipKey) => {
                                      const isMostLikely = migrationTipKey === tipKey;
                                      const snippet = MIGRATION_TIP_SNIPPETS[tipKey];
                                      const fieldLabel = `migration-snippet:${tipKey}`;
                                      const isCopied = copiedField === fieldLabel;
                                      return (
                                        <li
                                          key={tipKey}
                                          className={isMostLikely ? "font-medium" : undefined}
                                          data-testid={`migration-tip-${tipKey}`}
                                        >
                                          <span>
                                            {t(`setup.initialize.migrationOutput.tips.${tipKey}`)}
                                            {isMostLikely && (
                                              <span className="ml-1 inline-block rounded bg-red-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-red-800">
                                                {t("setup.initialize.migrationOutput.mostLikelyBadge")}
                                              </span>
                                            )}
                                          </span>
                                          <div className="mt-1 font-normal">
                                            <div className="text-[11px] text-muted-foreground">
                                              {t(`setup.initialize.migrationOutput.snippetLabels.${tipKey}`)}
                                            </div>
                                            <div className="mt-1 flex items-center gap-2">
                                              <code
                                                className="font-mono text-[11px] bg-background border rounded px-2 py-1.5 flex-1 overflow-x-auto whitespace-nowrap text-red-900"
                                                lang="en"
                                                dir="ltr"
                                                data-testid={`migration-snippet-${tipKey}`}
                                              >
                                                {snippet}
                                              </code>
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                onClick={() => copyMigrationSnippet(tipKey, snippet)}
                                                className="shrink-0"
                                                data-testid={`button-copy-migration-snippet-${tipKey}`}
                                                aria-label={t("setup.initialize.migrationOutput.copyButton")}
                                              >
                                                {isCopied ? (
                                                  <>
                                                    <Check className="w-3.5 h-3.5 mr-1" />
                                                    {t("setup.initialize.migrationOutput.copied")}
                                                  </>
                                                ) : (
                                                  <>
                                                    <Copy className="w-3.5 h-3.5 mr-1" />
                                                    {t("setup.initialize.migrationOutput.copyButton")}
                                                  </>
                                                )}
                                              </Button>
                                            </div>
                                          </div>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                </div>
                                <details className="rounded border border-red-200 bg-white/60">
                                  <summary className="cursor-pointer px-2 py-1 font-medium select-none">
                                    {t("setup.initialize.migrationOutput.title")}
                                  </summary>
                                  <div className="px-2 pb-2 pt-1 space-y-1">
                                    <div className="text-muted-foreground">
                                      {t("setup.initialize.migrationOutput.description")}
                                    </div>
                                    <pre className="whitespace-pre-wrap" lang="en" dir="ltr">{migrationOutput ?? p.detail}</pre>
                                  </div>
                                </details>
                              </div>
                            ) : (
                              <div className="mt-1 text-xs text-red-700">
                                <div className="font-medium">{t("setup.initialize.serverResponse")}</div>
                                <pre className="whitespace-pre-wrap">{p.detail}</pre>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {initError && (
                <div className="flex items-start gap-2 p-3 rounded-md text-sm bg-red-50 border border-red-200 text-red-800">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div><strong>{t("setup.initialize.failed")}</strong> — {resolveMessage(t, initError)}</div>
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("connect")} className="flex-1" disabled={initializing}>{t("setup.actions.back")}</Button>
                <Button
                  onClick={handleInitialize}
                  disabled={initializing || dbUnreachable || isReconfigureMode}
                  title={isReconfigureMode ? t("setup.reconfigureMode.disabledHint") : undefined}
                  className="flex-1"
                  data-testid="button-initialize"
                >
                  {initializing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("setup.initialize.initializing")}</> : initError ? t("setup.initialize.retry") : t("setup.initialize.initialize")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "secrets" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5" />{t("setup.secrets.title")}</CardTitle>
              <CardDescription>
                {secrets?.sessionSecretSource === "env" || secrets?.encryptionKeySource === "env"
                  ? t("setup.secrets.descriptionEnv")
                  : t("setup.secrets.descriptionFile")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!secrets ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />{t("setup.actions.loading")}</div>
              ) : (
                <div className="space-y-3 text-sm">
                  <SecretRow
                    label="SESSION_SECRET" present={secrets.hasSessionSecret} source={secrets.sessionSecretSource}
                    value={secrets.sessionSecretValue} showAll={showSecrets}
                    onCopy={(v) => copyToClipboard("SESSION_SECRET", v)}
                    copied={copiedField === "SESSION_SECRET"}
                    t={t}
                    badgeTestId="field-source-badge-session-secret"
                  />
                  <SecretRow
                    label="ENCRYPTION_KEY" present={secrets.hasEncryptionKey} source={secrets.encryptionKeySource}
                    value={secrets.encryptionKeyValue} showAll={showSecrets}
                    onCopy={(v) => copyToClipboard("ENCRYPTION_KEY", v)}
                    copied={copiedField === "ENCRYPTION_KEY"}
                    t={t}
                    badgeTestId="field-source-badge-encryption-key"
                  />
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowSecrets((v) => !v)}>
                      {showSecrets ? <><EyeOff className="w-3.5 h-3.5 mr-1.5" />{t("setup.secrets.hideValues")}</> : <><Eye className="w-3.5 h-3.5 mr-1.5" />{t("setup.secrets.revealValues")}</>}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <Trans
                      i18nKey="setup.secrets.storedNotice"
                      components={[
                        <code className="bg-muted px-1 rounded" />,
                        <code className="bg-muted px-1 rounded" />,
                        <code className="bg-muted px-1 rounded" />,
                      ]}
                    />
                  </p>
                </div>
              )}
              <EnvHelperPanel
                {...envHelperValues}
                testIdPrefix="secrets"
                t={t}
                toast={toast}
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("initialize")} className="flex-1">{t("setup.actions.back")}</Button>
                <Button
                  onClick={() => setStep("public-url")}
                  disabled={!secrets || dbUnreachable || isReconfigureMode}
                  title={isReconfigureMode ? t("setup.reconfigureMode.disabledHint") : undefined}
                  className="flex-1"
                  data-testid="button-continue-secrets"
                >{t("setup.actions.continue")}<ChevronRight className="w-4 h-4 ml-1" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "public-url" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Globe className="w-5 h-5" />{t("setup.publicUrl.title")}</CardTitle>
              <CardDescription>{t("setup.publicUrl.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Label htmlFor="purl">{t("setup.publicUrl.label")}</Label>
                  {/* Source-of-truth pill — driven by the same
                      publicAppUrlSource snapshot the Done step shows.
                      When the host already exports PUBLIC_APP_URL the
                      badge turns blue and tells the operator that
                      saving here will not override it (host env always
                      wins). See task-367. */}
                  <FieldSourceBadge
                    source={mapPublicUrlSource(secrets?.publicAppUrlSource)}
                    t={t}
                    testId="field-source-badge-public-url"
                  />
                </div>
                <Input id="purl" value={publicUrl} onChange={(e) => setPublicUrl(e.target.value)} placeholder={t("setup.publicUrl.placeholder")} className="font-mono text-sm" />
                <p className="text-xs text-muted-foreground">{t("setup.publicUrl.hint")}</p>
              </div>
              {/* Inline help — explains exactly what `PUBLIC_APP_URL`
                  drives downstream (password reset links, WebAuthn
                  origin, OIDC redirects, browser clipboard secure
                  context) so operators don't have to leave the wizard
                  to look it up. The amber callout reuses the same
                  visual language as the env-helper "promote into env"
                  hint. */}
              <div
                className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 space-y-1.5"
                data-testid="public-url-help"
              >
                <p className="font-medium">
                  {t("setup.publicUrl.help.title")}
                </p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>{t("setup.publicUrl.help.bullets.scheme")}</li>
                  <li>{t("setup.publicUrl.help.bullets.webauthn")}</li>
                  <li>{t("setup.publicUrl.help.bullets.email")}</li>
                  <li>{t("setup.publicUrl.help.bullets.clipboard")}</li>
                </ul>
              </div>
              {urlError && <div className="flex items-start gap-2 p-3 rounded-md text-sm bg-red-50 border border-red-200 text-red-800"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><div>{resolveMessage(t, urlError)}</div></div>}
              <EnvHelperPanel
                {...envHelperValues}
                testIdPrefix="public-url"
                t={t}
                toast={toast}
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("secrets")} className="flex-1">{t("setup.actions.back")}</Button>
                <Button
                  onClick={handleSavePublicUrl}
                  disabled={savingUrl || !publicUrl.trim() || dbUnreachable || isReconfigureMode}
                  title={isReconfigureMode ? t("setup.reconfigureMode.disabledHint") : undefined}
                  className="flex-1"
                  data-testid="button-save-public-url"
                >
                  {savingUrl ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("setup.actions.saving")}</> : <>{t("setup.actions.continue")}<ChevronRight className="w-4 h-4 ml-1" /></>}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "admin" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><UserPlus className="w-5 h-5" />{t("setup.admin.title")}</CardTitle>
              <CardDescription>{t("setup.admin.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {adminLocked && (
                // Friendly skip path for re-runs against a database that
                // already has an approved admin. Without this, the
                // bootstrap endpoint just keeps returning 403 and the
                // operator has no way forward without editing the form
                // they can't successfully submit.
                <div
                  className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
                  data-testid="admin-already-exists-lock"
                  role="status"
                >
                  <div className="flex items-start gap-2">
                    <Shield className="w-4 h-4 mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <p className="font-medium">
                        {t("setup.admin.adminExistsLock.title")}
                      </p>
                      <p className="text-xs">
                        {t("setup.admin.adminExistsLock.description")}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setStep("smtp")}
                    // Block forward motion while DB is unreachable.
                    disabled={dbUnreachable}
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                    data-testid="button-skip-admin-step"
                  >
                    {t("setup.admin.adminExistsLock.skip")}
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="afn">{t("setup.admin.firstName")}</Label>
                  <Input
                    id="afn"
                    value={adminFirst}
                    onChange={(e) => setAdminFirst(e.target.value)}
                    onBlur={() => setAdminTouched((s) => ({ ...s, firstName: true }))}
                    aria-invalid={adminTouched.firstName && adminFirstNameErrorCode ? true : undefined}
                    aria-describedby={
                      adminTouched.firstName && adminFirstNameErrorCode ? "afn-error" : undefined
                    }
                    // When the database already has an approved admin we
                    // grey out every input so the form *visibly* explains
                    // why the Submit button can't fire — leaving the
                    // fields editable would let the operator type a full
                    // password, hit Create, and only then learn the
                    // bootstrap is locked.
                    disabled={adminLocked}
                    data-testid="input-admin-first-name"
                  />
                  {adminTouched.firstName && adminFirstNameErrorCode && (
                    <p
                      id="afn-error"
                      className="text-xs text-red-600"
                      data-testid="error-admin-first-name"
                    >
                      {t(`setup.errors.${adminFirstNameErrorCode}`)}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="aln">{t("setup.admin.lastName")}</Label>
                  <Input id="aln" value={adminLast} onChange={(e) => setAdminLast(e.target.value)} disabled={adminLocked} data-testid="input-admin-last-name" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ae">{t("setup.admin.email")}</Label>
                <Input
                  id="ae"
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  onBlur={() => setAdminTouched((s) => ({ ...s, email: true }))}
                  aria-invalid={adminTouched.email && adminEmailErrorCode ? true : undefined}
                  aria-describedby={
                    adminTouched.email && adminEmailErrorCode ? "ae-error" : undefined
                  }
                  disabled={adminLocked}
                  data-testid="input-admin-email"
                />
                {adminTouched.email && adminEmailErrorCode && (
                  <p
                    id="ae-error"
                    className="text-xs text-red-600"
                    data-testid="error-admin-email"
                  >
                    {t(`setup.errors.${adminEmailErrorCode}`)}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap">{t("setup.admin.password")}</Label>
                <div className="relative">
                  <Input
                    id="ap"
                    type={showSecrets ? "text" : "password"}
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    onBlur={() => setAdminTouched((s) => ({ ...s, password: true }))}
                    aria-invalid={adminTouched.password && adminPasswordErrorCode ? true : undefined}
                    aria-describedby={
                      adminTouched.password && adminPasswordErrorCode
                        ? "ap-error ap-rules"
                        : "ap-rules"
                    }
                    disabled={adminLocked}
                    className="font-mono pr-10"
                    data-testid="input-admin-password"
                  />
                  <button type="button" onClick={() => setShowSecrets((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" tabIndex={-1}>
                    {showSecrets ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {/*
                  The checklist is always visible (not gated on `touched`) so the
                  operator sees the full requirement list before they start
                  typing — this is the whole point of the live strength meter.
                  The blur-triggered red error below is kept as a louder signal
                  that the field still blocks submission.
                */}
                <PasswordRuleChecklist password={adminPassword} id="ap-rules" />
                {adminTouched.password && adminPasswordErrorCode && (
                  <p
                    id="ap-error"
                    className="text-xs text-red-600"
                    data-testid="error-admin-password"
                  >
                    {t(`setup.errors.${adminPasswordErrorCode}`)}
                  </p>
                )}
              </div>
              {adminError && <div className="flex items-start gap-2 p-3 rounded-md text-sm bg-red-50 border border-red-200 text-red-800"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><div>{resolveMessage(t, adminError)}</div></div>}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("public-url")} className="flex-1">{t("setup.actions.back")}</Button>
                <Button
                  onClick={handleCreateAdmin}
                  // Disable submission when the database already has an
                  // approved admin — there is nothing the operator can
                  // do to make this form succeed and clicking Submit
                  // would just re-trigger the 403 → red error toast
                  // loop. The amber lock callout above provides the
                  // Skip path. Also disabled in Task #679 reconfigure mode.
                  disabled={creatingAdmin || adminLocked || dbUnreachable || isReconfigureMode}
                  title={isReconfigureMode ? t("setup.reconfigureMode.disabledHint") : undefined}
                  className="flex-1"
                  data-testid="button-create-admin"
                >
                  {creatingAdmin ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("setup.admin.creating")}</> : <>{t("setup.admin.create")}<ChevronRight className="w-4 h-4 ml-1" /></>}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "smtp" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Mail className="w-5 h-5" />{t("setup.smtp.title")}</CardTitle>
              <CardDescription>{t("setup.smtp.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-xs text-blue-900">
                <Trans
                  i18nKey="setup.smtp.info"
                  components={[
                    <strong />,
                    <code />,
                    <code />,
                    <strong />,
                  ]}
                />
              </div>

              {restartHinted && !restartHintDismissed && (
                <RestartRequiredCallout
                  t={t}
                  restarting={restarting}
                  onRestart={handleLaunch}
                  onDismiss={() => setRestartHintDismissed(true)}
                />
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2">
                  <Label htmlFor="smtp-from">{t("setup.smtp.fromAddress")}</Label>
                  <Input id="smtp-from" type="email" placeholder={t("setup.smtp.fromPlaceholder")} value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Label htmlFor="smtp-host">{t("setup.smtp.host")}</Label>
                    {/* SMTP host source-of-truth badge. Reads
                        `secrets?.smtpHostSource` from the bootstrap
                        snapshot rather than inferring from the local
                        input value, so a previously-deferred SMTP
                        host (saved into data/db-config.json on a
                        prior wizard run) shows the "From wizard file"
                        wording the moment the wizard loads — without
                        the operator having to re-type it. There is no
                        SMTP_HOST env var the server reads today, but
                        the snapshot still grades it in the
                        `env`/`file`/`none` shape so a future
                        env-promoted value would render the blue
                        "From host env" badge automatically. See
                        task-367 (badge grammar) and task-370
                        (snapshot-driven source). */}
                    <FieldSourceBadge
                      source={mapSecretSource(secrets?.smtpHostSource)}
                      t={t}
                      testId="field-source-badge-smtp-host"
                    />
                  </div>
                  <Input id="smtp-host" placeholder={t("setup.smtp.hostPlaceholder")} value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtp-port">{t("setup.smtp.port")}</Label>
                  <Input id="smtp-port" type="number" placeholder={t("setup.smtp.portPlaceholder")} value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtp-user">{t("setup.smtp.username")}</Label>
                  <Input id="smtp-user" placeholder={t("setup.smtp.userPlaceholder")} value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtp-pass">{t("setup.smtp.passwordField")}</Label>
                  <Input id="smtp-pass" type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} />
                </div>
              </div>

              {smtpResult && (
                <div className={`flex items-start gap-2 p-3 rounded-md text-sm ${smtpResult.ok ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-800"}`}>
                  {smtpResult.ok ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                  <div>{resolveMessage(t, smtpResult.message)}</div>
                </div>
              )}

              {smtpSkipped && (
                <div className="flex items-start gap-2 p-3 rounded-md text-sm bg-amber-50 border border-amber-200 text-amber-900">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <Trans i18nKey="setup.smtp.skippedWarning" components={[<strong />]} />
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("admin")} className="flex-1" disabled={smtpSaving}>{t("setup.actions.back")}</Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSmtpSkipped(true);
                    // Skipping SMTP is still a wizard-side decision
                    // and the prior admin/secrets writes still need a
                    // restart to be observed by the running middleware,
                    // so the Done-step restart callout must appear in
                    // the skip path too — not only after a successful
                    // SMTP save.
                    setRestartHinted(true);
                    setRestartHintDismissed(false);
                    setStep("crm");
                  }}
                  className="flex-1"
                  disabled={smtpSaving || dbUnreachable || isReconfigureMode}
                  title={isReconfigureMode ? t("setup.reconfigureMode.disabledHint") : undefined}
                  data-testid="button-skip-smtp"
                >{t("setup.smtp.skipForNow")}</Button>
                <Button
                  onClick={handleSaveSmtp}
                  className="flex-1"
                  disabled={smtpSaving || !smtpHost || !smtpUser || !smtpFrom || dbUnreachable || isReconfigureMode}
                  title={isReconfigureMode ? t("setup.reconfigureMode.disabledHint") : undefined}
                  data-testid="button-save-smtp"
                >
                  {smtpSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("setup.actions.saving")}</> : t("setup.smtp.saveContinue")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "crm" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Cloud className="w-5 h-5" />{t("setup.crm.title")}</CardTitle>
              <CardDescription>{t("setup.crm.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div role="radiogroup" aria-label={t("setup.crm.title")} className="grid gap-2">
                {CRM_PROVIDER_IDS.map((id) => (
                  <label
                    key={id}
                    className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors ${
                      crmChoice === id
                        ? "border-primary bg-primary/5 dark:bg-primary/10"
                        : "border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/60"
                    }`}
                    data-testid={`option-crm-${id}`}
                  >
                    <input
                      type="radio"
                      name="crm-provider"
                      value={id}
                      checked={crmChoice === id}
                      onChange={() => setCrmChoice(id)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block font-medium text-gray-900 dark:text-gray-100">{t(`setup.crm.options.${id}.name`)}</span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">{t(`setup.crm.options.${id}.description`)}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("setup.crm.lockNote")}</p>

              {crmResult && (
                <div className="flex items-start gap-2 p-3 rounded-md text-sm bg-red-50 border border-red-200 text-red-800 dark:bg-red-950/40 dark:border-red-800 dark:text-red-300">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>{resolveMessage(t, crmResult)}</div>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("smtp")} className="flex-1" disabled={crmSaving}>{t("setup.actions.back")}</Button>
                <Button
                  onClick={handleSaveCrm}
                  className="flex-1"
                  disabled={crmSaving || dbUnreachable || isReconfigureMode}
                  title={isReconfigureMode ? t("setup.reconfigureMode.disabledHint") : undefined}
                  data-testid="button-save-crm"
                >
                  {crmSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("setup.actions.saving")}</> : t("setup.crm.saveContinue")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "done" && (() => {
          // Critical checks — must all be green before we let the operator
          // click "Go to Login". If any of these is red the auth round-trip
          // will fail and they'd just bounce back to /setup.
          const REQUIRED_CRITICAL_KEYS = [
            "setup.done.checks.serverAlive",
            "setup.done.checks.dbReachable",
            "setup.done.checks.adminExists",
            "setup.done.checks.sessionSecretSet",
            "setup.done.checks.encryptionKeySet",
            "setup.done.checks.authRoundTrip",
          ];
          const requiredAllPass = REQUIRED_CRITICAL_KEYS.every(
            (name) => healthChecks.find((c) => c.nameKey === name)?.ok === true,
          );
          // PUBLIC_APP_URL probe is critical too — runHealthChecks pushes
          // either `publicUrlResolves` (when set) or `publicUrlConfigured`
          // (when not set, always red); both gate readiness.
          const publicUrlOk =
            healthChecks.find(
              (c) =>
                c.nameKey === "setup.done.checks.publicUrlResolves" ||
                c.nameKey === "setup.done.checks.publicUrlConfigured",
            )?.ok === true;
          const isReady =
            healthChecks.length > 0 && requiredAllPass && publicUrlOk;
          const HeaderIcon = isReady ? CheckCircle : AlertCircle;
          const headerIconColor = isReady ? "text-green-500" : "text-amber-500";
          const titleKey = isReady ? "setup.done.title" : "setup.done.incompleteTitle";
          const descKey = isReady ? "setup.done.description" : "setup.done.incompleteDescription";
          return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><HeaderIcon className={`w-5 h-5 ${headerIconColor}`} />{t(titleKey)}</CardTitle>
              <CardDescription>{t(descKey)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {restartHinted && !restartHintDismissed && (
                <RestartRequiredCallout
                  t={t}
                  restarting={restarting}
                  onRestart={handleLaunch}
                  onDismiss={() => setRestartHintDismissed(true)}
                />
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <SuggestedCard icon={<Cloud className="w-5 h-5" />} title={t("setup.done.cloudTitle")} desc={t("setup.done.cloudDesc")} link="/admin?tab=storage-providers" />
                <SuggestedCard icon={<Brain className="w-5 h-5" />} title={t("setup.done.aiTitle")} desc={t("setup.done.aiDesc")} link="/admin?tab=salesforce-configuration&subtab=ai-providers" />
                <SuggestedCard icon={<History className="w-5 h-5" />} title={t("setup.done.restoreTitle")} desc={t("setup.done.restoreDesc")} link="/admin?tab=backup" />
              </div>
              <EnvHelperPanel
                {...envHelperValues}
                testIdPrefix="done"
                t={t}
                toast={toast}
              />
              {runningSources && (
                <RunningServerSeesPanel
                  sources={runningSources}
                  values={{
                    DATABASE_URL: envHelperValues.databaseUrl,
                    SESSION_SECRET: envHelperValues.sessionSecret,
                    ENCRYPTION_KEY: envHelperValues.encryptionKey,
                    PUBLIC_APP_URL: envHelperValues.publicAppUrl,
                  }}
                  t={t}
                  toast={toast}
                />
              )}
              {healthChecks.length > 0 && (
                <div className="space-y-1.5 mt-2">
                  <p className="text-sm font-medium">{t("setup.done.healthChecks")}</p>
                  {healthChecks.map((c, idx) => {
                    const name = t(c.nameKey);
                    const detail = resolveMessage(t, c.detail);
                    return (
                      <div key={`${c.nameKey}-${idx}`} className={`flex items-start gap-2 text-sm p-2 rounded border ${c.ok ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                        {c.ok ? <CheckCircle className="w-4 h-4 mt-0.5 text-green-600" /> : <AlertCircle className="w-4 h-4 mt-0.5 text-red-600" />}
                        <span>{name}{detail ? ` — ${detail}` : ""}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {restarting ? (
                <div className="text-center space-y-3 py-2">
                  <RefreshCw className="w-8 h-8 mx-auto animate-spin text-blue-600" />
                  <p className="font-medium">{t("setup.done.restarting")}</p>
                  {countdown !== null && countdown > 0 && <p className="text-sm text-muted-foreground">{t("setup.done.waiting", { count: countdown })}</p>}
                </div>
              ) : (
                <div className="space-y-2">
                  {healthChecks.length > 0 && (
                    <p className="text-sm text-muted-foreground text-center">
                      {t("setup.done.reviewHint")}
                    </p>
                  )}
                  {!isReady && (
                    <p className="text-xs text-amber-700 dark:text-amber-400 text-center" data-testid="text-login-disabled-help">
                      {t("setup.done.loginDisabledHelp")}
                    </p>
                  )}
                  <Button
                    onClick={() => {
                      // Tell the login (Landing) page that we just came
                      // from the wizard — it uses this together with
                      // /api/setup/status.adminExists to decide whether
                      // to surface the "Setup already complete" banner.
                      // Helper swallows storage errors; if the write
                      // fails the banner just won't show.
                      markCameFromSetup();
                      window.location.href = "/";
                    }}
                    className="w-full"
                    size="lg"
                    disabled={!isReady || restarting}
                    data-testid="button-go-to-login"
                  >
                    {t("setup.done.goToLogin")}<ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                  <Button
                    onClick={handleLaunch}
                    variant="outline"
                    className="w-full"
                    size="lg"
                    disabled={restarting || isReconfigureMode}
                    data-testid="button-restart-server"
                    title={isReconfigureMode ? t("setup.reconfigureMode.disabledHint") : t("setup.done.restartServerHelp")}
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />{t("setup.done.restartServer")}
                  </Button>
                  <p
                    className="text-[11px] text-muted-foreground text-center"
                    data-testid="text-restart-server-help"
                  >
                    {t("setup.done.restartServerHelp")}
                  </p>
                  {healthChecks.length > 0 && (
                    <Button onClick={runHealthChecks} variant="ghost" className="w-full" size="sm" data-testid="button-rerun-checks">
                      {t("setup.done.rerun")}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          );
        })()}
    </SetupShell>
  );
}

// Compact source-of-truth pill rendered next to each persisted-config
// input on the wizard (Public URL, Session Secret, Encryption Key, SMTP
// Host). Reuses the same `*Source` snapshot the Done step shows so
// operators can tell at a glance whether saving the field will actually
// take effect — host-env values always win over data/db-config.json,
// and a "From host env (changes here won't override)" badge prevents
// the "I saved it but it didn't take effect" reports we've been
// getting. See task-367.
function FieldSourceBadge({
  source, t, testId,
}: {
  source: EnvHelperSource;
  t: TFunction;
  testId?: string;
}) {
  return (
    <span
      className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded font-medium ${envSourceBadgeClass(source)}`}
      data-testid={testId}
      data-source={source}
      role="status"
    >
      {t(`setup.envHelper.fieldBadge.${source}`)}
    </span>
  );
}

function SecretRow({
  label, present, source, value, showAll, onCopy, copied, t, badgeTestId,
}: {
  label: string; present: boolean; source: "env" | "file" | "none";
  value?: string; showAll: boolean; onCopy: (v: string) => void; copied: boolean;
  t: TFunction;
  // Optional test id forwarded to the operator-friendly source-of-truth
  // badge added under the label so e2e / unit tests can assert each
  // SecretRow renders its own indicator distinctly.
  badgeTestId?: string;
}) {
  const masked = value ? (showAll ? value : `${value.slice(0, 6)}…${value.slice(-4)}`) : null;
  // Map the snapshot's three-value source ("env" | "file" | "none") to
  // the four-value EnvHelperSource the FieldSourceBadge accepts so the
  // operator-friendly wording stays in sync with the Public URL / SMTP
  // Host badges and with the Done step's running-server panel.
  const fieldSource: EnvHelperSource = mapSecretSource(source);
  return (
    <div className="p-3 bg-muted rounded-md space-y-2">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <code className="font-mono text-xs">{label}</code>
          <p className="text-xs text-muted-foreground mt-0.5">
            {source === "env" && t("setup.secrets.sourceEnv")}
            {source === "file" && t("setup.secrets.sourceFile")}
            {source === "none" && t("setup.secrets.sourceNone")}
          </p>
          <FieldSourceBadge source={fieldSource} t={t} testId={badgeTestId} />
        </div>
        <div className="flex items-center gap-2">
          {present ? <Check className="w-4 h-4 text-green-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}
          <span className={`text-xs px-2 py-0.5 rounded ${source === "env" ? "bg-blue-100 text-blue-800" : source === "file" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{t(`setup.secrets.badge.${source}`)}</span>
        </div>
      </div>
      {masked && (
        <div className="flex items-center gap-2">
          <code className="font-mono text-[11px] bg-background border rounded px-2 py-1.5 flex-1 overflow-x-auto whitespace-nowrap">{masked}</code>
          <Button type="button" size="sm" variant="outline" onClick={() => onCopy(value!)} className="shrink-0">
            {copied ? <><Check className="w-3.5 h-3.5 mr-1" />{t("setup.secrets.copied")}</> : <><Copy className="w-3.5 h-3.5 mr-1" />{t("setup.secrets.copy")}</>}
          </Button>
        </div>
      )}
    </div>
  );
}

function SuggestedCard({ icon, title, desc, link }: { icon: React.ReactNode; title: string; desc: string; link: string }) {
  return (
    <a href={link} className="block p-3 border rounded-md hover:bg-muted transition-colors">
      <div className="flex items-center gap-2 mb-1">{icon}<span className="font-medium text-sm">{title}</span></div>
      <p className="text-xs text-muted-foreground">{desc}</p>
    </a>
  );
}

// Amber callout shown immediately after admin creation (top of the SMTP
// step) and again at the top of the Done step. Operators reported
// reaching the Done step with every check red and not realising the
// values they had saved earlier in the wizard had not yet been
// re-read by the running server. The callout makes the restart
// requirement explicit and explains that on Docker / Dokploy / Coolify
// the in-app Restart button only signals an exit — the host's
// container supervisor (or a redeploy) is what actually re-launches
// the process with the new env.
function RestartRequiredCallout({
  t,
  restarting,
  onRestart,
  onDismiss,
}: {
  t: TFunction;
  restarting: boolean;
  onRestart: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className="flex items-start gap-3 p-3 rounded-md text-sm bg-amber-50 border border-amber-200 text-amber-900"
      data-testid="callout-restart-required"
    >
      <RefreshCw className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="flex-1 space-y-2">
        <p className="font-medium">
          {t("setup.restartRequired.title")}
        </p>
        <p className="text-xs">
          {t("setup.restartRequired.body")}
        </p>
        <p className="text-xs">
          <Trans i18nKey="setup.restartRequired.dockerNote" components={[<strong />]} />
        </p>
        <div className="flex items-center gap-2 pt-1 flex-wrap">
          <Button
            type="button"
            size="sm"
            onClick={onRestart}
            disabled={restarting}
            data-testid="button-restart-required-restart"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            {t("setup.restartRequired.restartButton")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onDismiss}
            data-testid="button-restart-required-dismiss"
          >
            {t("setup.restartRequired.dismiss")}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Plain-English summary of what process.env actually contains right now,
// rendered on the Done step alongside the existing health-check list.
// Operators copy/pasted the wizard's "Required environment variables"
// block into Dokploy and then clicked Restart in the Dokploy UI — but
// because Dokploy's "Restart" reuses the existing container (it does
// not re-read the Environment tab), the running process never saw the
// new values and every Done-step check came back red. This panel maps
// the four `*Source` fields the bootstrap snapshot already returns to
// three buckets (env / file / missing) so the operator can see at a
// glance which variables the running process actually has access to;
// when at least one is missing we surface a Dokploy-specific tip block
// pointing them at Redeploy + a persistent volume for `data/`.
function RunningServerSeesPanel({
  sources,
  values,
  t,
  toast,
}: {
  sources: {
    databaseUrl: RunningSourceState;
    sessionSecret: RunningSourceState;
    encryptionKey: RunningSourceState;
    publicAppUrl: RunningSourceState;
  };
  // Current wizard-known value for each variable. Used to assemble the
  // KEY=value block emitted by "Copy missing env vars" so operators can
  // paste straight into Dokploy / Coolify's Environment tab without
  // scrolling back up to the EnvHelperPanel and copying each row by hand.
  // Optional so older callers (and tests) keep compiling — when omitted
  // the copy button is hidden because we have nothing to put on the
  // clipboard.
  values?: {
    DATABASE_URL: string;
    SESSION_SECRET: string;
    ENCRYPTION_KEY: string;
    PUBLIC_APP_URL: string;
  };
  t: TFunction;
  // Optional for the same compatibility reason as `values`. When absent we
  // simply don't render the copy button — the panel still works as a
  // read-only diagnostic display.
  toast?: ReturnType<typeof useToast>["toast"];
}) {
  const [copiedMissing, setCopiedMissing] = useState(false);
  const rows: Array<{
    key: "DATABASE_URL" | "SESSION_SECRET" | "ENCRYPTION_KEY" | "PUBLIC_APP_URL";
    state: RunningSourceState;
  }> = [
    { key: "DATABASE_URL", state: sources.databaseUrl },
    { key: "SESSION_SECRET", state: sources.sessionSecret },
    { key: "ENCRYPTION_KEY", state: sources.encryptionKey },
    { key: "PUBLIC_APP_URL", state: sources.publicAppUrl },
  ];
  const anyMissing = rows.some((r) => r.state === "missing");

  // Build the KEY=value block from rows that are both (a) missing from the
  // running process and (b) have a value the wizard actually knows. We
  // intentionally skip missing rows with empty values rather than emit
  // `KEY=` lines, because pasting a literal empty assignment into Dokploy /
  // Coolify would silently overwrite any inherited / file-sourced value
  // and surprise the operator on the next redeploy.
  const missingBlock = values
    ? rows
        .filter((r) => r.state === "missing" && values[r.key])
        .map((r) => `${r.key}=${values[r.key]}`)
        .join("\n")
    : "";

  async function handleCopyMissing() {
    if (!toast) return;
    if (!missingBlock) {
      // Every missing row is also empty in the wizard — there is literally
      // nothing to put on the clipboard. We mirror the EnvHelperPanel's
      // failure UX (destructive toast + "open the field and copy it
      // manually" hint) so the surrounding wizard's copy-error story stays
      // consistent.
      showErrorToast(t("setup.done.runningServerSees.copyMissingNoneAvailable"), t("setup.envHelper.copyFailedHint"));
      return;
    }
    const ok = await safeCopyToClipboard(missingBlock);
    if (!ok) {
      // safeCopyToClipboard already exhausted the navigator.clipboard +
      // execCommand fallback chain. Surface a generic destructive toast
      // (no secret material in the description, same rationale as the
      // EnvHelperPanel copy buttons) so the operator can fall back to
      // copying each row manually.
      showErrorToast(t("setup.done.runningServerSees.copyMissingFailed"), t("setup.envHelper.copyFailedHint"));
      return;
    }
    setCopiedMissing(true);
    setTimeout(() => setCopiedMissing(false), 1500);
    showSuccessToast(t("setup.done.runningServerSees.copyMissingToastTitle"), t("setup.done.runningServerSees.copyMissingToastBody"));
  }

  function rowClasses(state: RunningSourceState) {
    if (state === "env") return "bg-green-50 border-green-200 text-green-900";
    if (state === "file") return "bg-amber-50 border-amber-200 text-amber-900";
    return "bg-red-50 border-red-200 text-red-900";
  }

  function rowIcon(state: RunningSourceState) {
    if (state === "env") return <CheckCircle className="w-4 h-4 mt-0.5 text-green-600 shrink-0" />;
    if (state === "file") return <AlertCircle className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" />;
    return <AlertCircle className="w-4 h-4 mt-0.5 text-red-600 shrink-0" />;
  }

  function stateLabel(state: RunningSourceState) {
    if (state === "env") return t("setup.done.runningServerSees.fromEnv");
    if (state === "file") return t("setup.done.runningServerSees.fromFile");
    return t("setup.done.runningServerSees.notVisible");
  }

  return (
    <div className="space-y-1.5 mt-2" data-testid="panel-running-server-sees">
      <p className="text-sm font-medium">
        {t("setup.done.runningServerSees.title")}
      </p>
      <p className="text-xs text-muted-foreground">
        {t("setup.done.runningServerSees.description")}
      </p>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div
            key={r.key}
            className={`flex items-start gap-2 text-sm p-2 rounded border ${rowClasses(r.state)}`}
            data-testid={`running-server-row-${r.key}`}
          >
            {rowIcon(r.state)}
            <span className="flex-1">
              <code className="font-mono text-xs">{r.key}</code>
              {" — "}
              <span data-testid={`running-server-state-${r.key}`}>
                {stateLabel(r.state)}
              </span>
            </span>
          </div>
        ))}
      </div>
      {anyMissing && (
        <div
          className="mt-2 p-3 rounded-md text-xs bg-blue-50 border border-blue-200 text-blue-900 space-y-2"
          data-testid="callout-dokploy-tip"
        >
          <p className="font-medium">
            {t("setup.done.runningServerSees.dokployTitle")}
          </p>
          <p>
            <Trans
              i18nKey="setup.done.runningServerSees.dokployBody"
              components={[<strong />]}
            />
          </p>
          <p>
            <Trans
              i18nKey="setup.done.runningServerSees.persistentVolumeNote"
              components={[<code />]}
            />
          </p>
          {/* One-click shortcut so operators don't have to scroll back up
              to the EnvHelperPanel and copy each missing row individually
              before pasting into Dokploy / Coolify's Environment tab.
              The button stays mounted whenever any row is missing (per
              the task contract) — if every missing row is empty in the
              wizard, the click handler falls through to a destructive
              toast explaining there's nothing to copy. */}
          {toast && (
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <Button
                type="button"
                size="sm"
                variant="default"
                onClick={handleCopyMissing}
                data-testid="button-copy-missing-env-vars"
                aria-label={t("setup.done.runningServerSees.copyMissingEnvVars")}
              >
                {copiedMissing ? (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1" />
                    {t("setup.done.runningServerSees.copiedMissingEnvVars")}
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 mr-1" />
                    {t("setup.done.runningServerSees.copyMissingEnvVars")}
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Generates a fresh secret equivalent to `openssl rand -base64 48`: 48 random
// bytes encoded as standard base64 (so it pastes cleanly into env editors that
// don't tolerate URL-safe variants). We use `crypto.getRandomValues` rather
// than `Math.random` because the value is used for SESSION_SECRET /
// ENCRYPTION_KEY, which must be cryptographically strong. `crypto` is part of
// the global Web Crypto API in every browser the wizard targets; the fallback
// branch only fires in pathological environments (very old browsers, JSDOM
// without polyfills) and we surface a translated error instead of silently
// returning a weak value so operators are not lulled into pasting an insecure
// secret into production.
function generateSecureSecret(): string | null {
  if (typeof crypto === "undefined" || typeof crypto.getRandomValues !== "function") {
    return null;
  }
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

type EnvHelperKey =
  | "DATABASE_URL"
  | "SESSION_SECRET"
  | "ENCRYPTION_KEY"
  | "PUBLIC_APP_URL";

export function EnvHelperPanel({
  databaseUrl,
  sessionSecret,
  encryptionKey,
  publicAppUrl,
  sources,
  testIdPrefix,
  t,
  toast,
}: {
  databaseUrl: string;
  sessionSecret: string;
  encryptionKey: string;
  publicAppUrl: string;
  // Optional so older callers (and tests that pre-date the badges) keep
  // compiling — when omitted every row falls back to "not-set", which renders
  // a neutral badge and never makes a misleading claim about where the value
  // came from.
  sources?: EnvHelperSources;
  testIdPrefix: string;
  t: TFunction;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  // Locally-generated overrides for the two secret rows. We keep them in
  // component state so the operator can click "Generate" repeatedly and the
  // newest value sticks even if the parent re-renders. We do NOT persist
  // generated values back to the parent — the panel is a copy-paste helper,
  // not a configuration writer (writing to disk / host APIs is explicitly
  // out of scope for this task).
  const [generatedSession, setGeneratedSession] = useState<string>("");
  const [generatedEncryption, setGeneratedEncryption] = useState<string>("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const effectiveSession = generatedSession || sessionSecret;
  const effectiveEncryption = generatedEncryption || encryptionKey;

  // Once the operator clicks "Generate" we know the value lives only in the
  // browser — it has not been written to env or to db-config.json — so the
  // badge needs to reflect that. We treat a freshly-generated SESSION_SECRET /
  // ENCRYPTION_KEY as still needing to be promoted, which is the same action
  // a `file`-sourced row prompts. Reusing the `file` badge keeps the call to
  // action consistent ("paste this into your host's env editor").
  const sessionSource: EnvHelperSource = generatedSession
    ? "file"
    : sources?.sessionSecret ?? "not-set";
  const encryptionSource: EnvHelperSource = generatedEncryption
    ? "file"
    : sources?.encryptionKey ?? "not-set";

  const rows: Array<{
    key: EnvHelperKey;
    value: string;
    canGenerate: boolean;
    placeholderKey: string;
    source: EnvHelperSource;
  }> = [
    {
      key: "DATABASE_URL",
      value: databaseUrl,
      canGenerate: false,
      placeholderKey: "setup.envHelper.placeholders.databaseUrl",
      source: sources?.databaseUrl ?? "not-set",
    },
    {
      key: "SESSION_SECRET",
      value: effectiveSession,
      canGenerate: true,
      placeholderKey: "setup.envHelper.placeholders.sessionSecret",
      source: sessionSource,
    },
    {
      key: "ENCRYPTION_KEY",
      value: effectiveEncryption,
      canGenerate: true,
      placeholderKey: "setup.envHelper.placeholders.encryptionKey",
      source: encryptionSource,
    },
    {
      key: "PUBLIC_APP_URL",
      value: publicAppUrl,
      canGenerate: false,
      placeholderKey: "setup.envHelper.placeholders.publicAppUrl",
      source: sources?.publicAppUrl ?? "not-set",
    },
  ];

  const hasMissing = rows.some((r) => !r.value);
  // "file" / "wizard" rows still live only in the wizard's local store and
  // will vanish on the next container rebuild unless the operator copies them
  // into their hosting platform's env editor. The hint message switches from
  // the generic "fill in the missing values" to a more actionable "promote
  // these into env" callout when we detect any such row, because that's the
  // single most common reason a freshly-deployed app comes back with broken
  // sessions/encryption after an unrelated redeploy.
  const hasFileSourced = rows.some(
    (r) => r.source === "file" || r.source === "wizard",
  );
  // KEY=VALUE block ready for the operator's host UI. We only emit rows that
  // actually have a value so the paste doesn't accidentally set a key to an
  // empty string in the host's editor.
  const allLines = rows
    .filter((r) => r.value)
    .map((r) => `${r.key}=${r.value}`)
    .join("\n");

  async function copyValue(label: string, value: string) {
    // safeCopyToClipboard transparently falls back to an off-screen
    // textarea + document.execCommand('copy') when navigator.clipboard is
    // unavailable (insecure HTTP context, headless browser, etc.) so the
    // "Copy all" toast no longer breaks for operators self-hosting on a
    // plain `*.traefik.me` test domain.
    const ok = await safeCopyToClipboard(value);
    if (!ok) {
      // Both `value` (single row) and `allLines` (Copy all) frequently
      // contain SESSION_SECRET / ENCRYPTION_KEY material. Surfacing them
      // verbatim in a destructive toast description risks leaking the
      // secret into screen recordings, accessibility readers, and any
      // browser-side log capture the host might run, so the toast stays
      // generic and the operator can still read the key directly from
      // the env-helper code block above.
      showErrorToast(t("setup.envHelper.copyFailed"), t("setup.envHelper.copyFailedHint"));
      return;
    }
    setCopiedKey(label);
    setTimeout(
      () => setCopiedKey((prev) => (prev === label ? null : prev)),
      1500,
    );
  }

  function handleGenerate(key: "SESSION_SECRET" | "ENCRYPTION_KEY") {
    const value = generateSecureSecret();
    if (!value) {
      showErrorToast(t("setup.envHelper.generateFailed"));
      return;
    }
    if (key === "SESSION_SECRET") setGeneratedSession(value);
    else setGeneratedEncryption(value);
  }

  // Build a real `.env` file the operator can drop next to their
  // docker-compose.yml. We prepend a localized comment header that explains
  // where to put the file, then the same KEY=VALUE block "Copy all" produces
  // (empty values already filtered out above), with a trailing newline so
  // shells / parsers don't choke on the last line. The download is triggered
  // via a Blob + temporary <a download> click — the file never leaves the
  // browser, and the secrets stay client-side just like with "Copy all".
  function handleDownload() {
    if (!allLines) return;
    try {
      const header = t("setup.envHelper.downloadHeader");
      const content = `${header}\n${allLines}\n`;
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "criteriaiq.env";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Defer revoke so Safari has time to start the download before the
      // object URL is invalidated.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showInfoToast(t("setup.envHelper.downloadToast"));
    } catch {
      showErrorToast(t("setup.envHelper.downloadFailed"));
    }
  }

  return (
    <details
      // The arbitrary variant `[&[open]_.disclosure-chevron]:rotate-90`
      // animates the leading chevron into a downward-pointing affordance
      // when the disclosure expands so operators get a familiar twirly
      // arrow and can tell at a glance which env-helper panels are
      // already open as they scroll the wizard.
      className="rounded-md border bg-muted/40 [&[open]_.disclosure-chevron]:rotate-90"
      data-testid={`${testIdPrefix}-env-helper`}
    >
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium select-none flex items-center gap-2">
        <ChevronRight
          className="disclosure-chevron w-4 h-4 shrink-0 text-muted-foreground transition-transform"
          aria-hidden="true"
        />
        <KeyRound className="w-4 h-4" />
        {t("setup.envHelper.title")}
      </summary>
      <div className="px-3 pb-3 pt-1 space-y-3">
        <p className="text-xs text-muted-foreground">
          {t("setup.envHelper.description")}
        </p>
        <div className="space-y-2">
          {rows.map((r) => {
            const display = r.value || t(r.placeholderKey);
            const isCopied = copiedKey === r.key;
            // Mute the value-portion of unset rows so the placeholder reads
            // as a hint rather than a copyable assignment.
            const isUnset = !r.value;
            // Tailwind class lookup by source — same colour grammar as the
            // SecretRow badges on the Secrets step (env=blue, file=green,
            // wizard=amber to flag "still needs to be promoted to env",
            // not-set=red) so operators see a consistent traffic-light story
            // across the wizard. The mapping lives in
            // `@/lib/env-source-badges` so the post-setup System Settings
            // panel can reuse it.
            const badgeClass = envSourceBadgeClass(r.source);
            return (
              <div key={r.key} className="space-y-1">
                <div className="flex items-center gap-2">
                  <code
                    className="font-mono text-[11px] bg-background border rounded px-2 py-1.5 flex-1 overflow-x-auto whitespace-nowrap"
                    lang="en"
                    dir="ltr"
                    data-testid={`env-row-${r.key}`}
                    data-unset={isUnset ? "true" : "false"}
                  >
                    <span>{r.key}=</span>
                    <span
                      className={isUnset ? "text-muted-foreground/70 italic" : ""}
                      data-testid={`env-row-value-${r.key}`}
                    >
                      {display}
                    </span>
                  </code>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${badgeClass}`}
                    data-testid={`env-badge-${r.key}`}
                    aria-label={t(`setup.envHelper.sourceLabel.${r.source}`)}
                    title={t(`setup.envHelper.sourceTooltip.${r.source}`)}
                  >
                    {t(`setup.envHelper.badge.${r.source}`)}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => copyValue(r.key, `${r.key}=${r.value}`)}
                    disabled={!r.value}
                    className="shrink-0"
                    data-testid={`button-copy-env-${r.key}`}
                    aria-label={t("setup.envHelper.copy")}
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 mr-1" />
                        {t("setup.envHelper.copied")}
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 mr-1" />
                        {t("setup.envHelper.copy")}
                      </>
                    )}
                  </Button>
                </div>
                {r.canGenerate && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      handleGenerate(r.key as "SESSION_SECRET" | "ENCRYPTION_KEY")
                    }
                    className="h-7 text-xs"
                    data-testid={`button-generate-env-${r.key}`}
                  >
                    <RefreshCw className="w-3 h-3 mr-1.5" />
                    {r.value
                      ? t("setup.envHelper.regenerate")
                      : t("setup.envHelper.generate")}
                  </Button>
                )}
                {/* One-line inline reminder under the PUBLIC_APP_URL row
                    so operators see *why* this var matters (clipboard
                    secure context, WebAuthn binding, email link base)
                    even when they're glancing at the env-helper without
                    scrolling back to the URL step. The full multi-bullet
                    explanation lives on the Public URL step itself; this
                    is the elevator-pitch version that survives in the
                    helper panel that ships on multiple wizard steps. */}
                {r.key === "PUBLIC_APP_URL" && (
                  <p
                    className="text-[11px] text-muted-foreground pl-1"
                    data-testid="env-row-PUBLIC_APP_URL-help"
                  >
                    {t("setup.envHelper.publicAppUrlHelp")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            size="sm"
            variant="default"
            onClick={() => copyValue("__ALL__", allLines)}
            disabled={!allLines}
            data-testid={`button-copy-all-env-${testIdPrefix}`}
          >
            {copiedKey === "__ALL__" ? (
              <>
                <Check className="w-3.5 h-3.5 mr-1" />
                {t("setup.envHelper.copiedAll")}
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 mr-1" />
                {t("setup.envHelper.copyAll")}
              </>
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleDownload}
            disabled={!allLines}
            data-testid={`button-download-env-${testIdPrefix}`}
          >
            <Download className="w-3.5 h-3.5 mr-1" />
            {t("setup.envHelper.download")}
          </Button>
          {hasFileSourced ? (
            <span
              className="text-xs text-amber-700"
              data-testid={`env-promote-hint-${testIdPrefix}`}
            >
              {t("setup.envHelper.promoteHint")}
            </span>
          ) : (
            hasMissing && (
              <span
                className="text-xs text-muted-foreground"
                data-testid={`env-missing-hint-${testIdPrefix}`}
              >
                {t("setup.envHelper.missingHint")}
              </span>
            )
          )}
        </div>
      </div>
    </details>
  );
}
