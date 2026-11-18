import { db, pool, dbSource, dbPoolMax } from '../db';
import { sql, eq, count } from 'drizzle-orm';
import { getApiMetrics } from '../lib/api-metrics';
import { storage } from '../storage';
import { WebSocketServer } from 'ws';
import { supportRequests, clientErrorLogs } from '@shared/schema';
import { getSchemaMigrationsReport } from '../lib/migrations-runner';

export interface HealthCheckResult {
  status: 'ok' | 'warning' | 'error';
  lastChecked: string;
  message?: string;
}

export interface DatabaseHealthResult extends HealthCheckResult {
  // Live snapshot of the Postgres connection pool (Task #507).
  //
  // `poolMax` mirrors the resolved `DB_POOL_MAX` value the pool was
  // actually built with at boot (see `server/db.ts`) — surfacing it
  // alongside `totalCount` / `idleCount` / `waitingCount` lets the
  // System Health page answer "is my current ceiling enough?" at a
  // glance, which is the obvious follow-up to making the ceiling
  // tunable in Task #498.
  //
  // `totalCount` / `idleCount` / `waitingCount` come straight from
  // the `DatabasePool` interface (`server/lib/db-driver.ts`), which
  // exposes the same gauges from both the Neon and node-postgres
  // drivers so this payload stays driver-agnostic.
  //
  // `totalConnections` / `idleConnections` / `maxConnections` are
  // retained as aliases for `totalCount` / `idleCount` / `poolMax`
  // so older clients (and the existing UI selectors) keep working
  // until the React surface is migrated.
  connectionPool: {
    poolMax: number;
    totalCount: number;
    idleCount: number;
    waitingCount: number;
    totalConnections: number;
    idleConnections: number;
    maxConnections: number;
  };
  tableStats: Array<{
    tableName: string;
    rowCount: number;
    sizeBytes: number;
    sizeFormatted: string;
  }>;
  orphanedRecords: {
    projectsWithoutCustomers: number;
    mapPhasesWithoutProjects: number;
    mapStepsWithoutPhases: number;
    mapTasksWithoutSteps: number;
    successCriteriaWithoutProjects: number;
  };
  databaseSize: {
    totalBytes: number;
    totalFormatted: string;
  };
  connectionSource: string;
  // Number of migration files present in `migrations/` that have NOT
  // yet been recorded in `schema_migrations` — i.e. drift between what
  // the deployed code ships and what the live database has actually
  // applied (Task #400). A non-zero value here means the auto-runner
  // either skipped a file at boot or a deploy half-succeeded; surfacing
  // it on the database tile lets an operator notice the drift from the
  // very first page-load instead of having to click into the deeper
  // Schema Migrations card on the Database tab. Stays `0` when the
  // migration count cannot be derived (no DB connection / lookup
  // failed) so the headline rollup never silently downgrades the tile
  // for a transient probe error.
  pendingMigrations: number;
  // First few filenames from `migrationsReport.missing`, in the same
  // sorted order the runner would consider them (Task #412). Capped to
  // a small list — `pendingMigrations` already carries the full count,
  // and the dashboard tooltip renders this list with a "+N more"
  // indicator. Keeping the cap on the server side avoids ballooning the
  // overview payload whenever someone leaves a large backlog of pending
  // migrations on disk. Always present; empty when there is no drift.
  pendingMigrationFiles: string[];
}

// Cap on `pendingMigrationFiles`. The Database tile tooltip surfaces
// this list inline so an operator can act on drift without leaving the
// overview; capping at 5 keeps the tooltip readable even when a deploy
// shipped a large batch of pending SQL files. The full list is still
// reachable from the Schema Migrations card on the Database tab — the
// tile click deep-links to it.
export const PENDING_MIGRATION_FILES_LIMIT = 5;

export interface EmailHealthResult extends HealthCheckResult {
  configuration: {
    isConfigured: boolean;
    enabled: boolean;
    provider: string | null;
    server: string | null;
    port: number | null;
    /** Delivery transport: 'smtp' (default) or 'graph' (Microsoft Graph). */
    authType: string;
  };
  queueStats: {
    firedToday: number;
    sent24h: number;
    failed24h: number;
    totalLogs: number;
    /** All-time email_logs rows since Monday 00:00 / the 1st of the month (DB time). */
    sentThisWeek: number;
    sentThisMonth: number;
    /** Percent of all-time email_logs rows that succeeded; 0 when there are none. */
    successRate: number;
  };
  /**
   * Most recent entry in email_logs (all-time). Used by the health tab to
   * show a "last known good" delivery status without a live probe.
   * All fields null when no emails have ever been sent.
   */
  lastSendStatus: {
    success: boolean | null;
    sentAt: string | null;
    error: string | null;
  };
  recentFailures: Array<{
    id: number;
    recipient: string;
    subject: string;
    error: string;
    sentAt: string;
  }>;
  schedulerStatus: {
    active: boolean;
    lastRun: string | null;
    /**
     * Count of email_rules rows with enabled=true. Used by the health tab
     * to distinguish "no rules configured" (intentional) from "rules exist
     * but the automation engine stopped" (a real problem).
     */
    enabledRulesCount: number;
  };
}

export interface IntegrationHealthResult extends HealthCheckResult {
  salesforce: {
    /** False while the install runs another CRM (or none); its sync failures then raise no warning. */
    active: boolean;
    connectedUsers: number;
    totalConfigurations: number;
    recentSyncCount: number;
    failedSyncs24h: number;
    lastSyncTime: string | null;
  };
  webhooks: {
    totalConfigurations: number;
    activeWebhooks: number;
    deliverySuccessRate24h: number;
    pendingRetries: number;
    recentFailures: Array<{
      webhookName: string;
      error: string;
      timestamp: string;
    }>;
  };
  aiProviders: {
    configuredProviders: number;
    activeProviders: string[];
    lastTestTime: string | null;
  };
  /**
   * n8n workflow automation integration status.
   * Read from the n8n_config DB row (no live probe at poll time —
   * lastTestResult is written by the admin "Test Connection" action).
   */
  n8n: {
    isConfigured: boolean;
    isEnabled: boolean;
    /** 'success' | 'failed' | null (null = never tested) */
    lastTestResult: string | null;
    lastTestedAt: string | null;
    lastTestError: string | null;
  };
  /**
   * OIDC single sign-on integration status (Okta SSO and Azure SSO).
   * Read from the sso_config rows — no live probe at poll time (the admin "Test
   * Connection" button writes lastTestResult / lastTestedAt). Also
   * surfaces ssoLoginsLast24h from the audit trail so the panel can
   * answer "is anyone actually using SSO".
   */
  sso: {
    isConfigured: boolean;
    isEnabled: boolean;
    /** Configured providers, comma-separated: 'okta', 'azure' or 'okta,azure'. */
    provider: string;
    /** 'success' | 'failure' | null (null = never tested) */
    lastTestResult: string | null;
    lastTestedAt: string | null;
    lastTestError: string | null;
    /** Number of successful SSO sign-ins (any provider) in the last 24 hours. */
    successfulLogins24h: number;
    /** Number of failed SSO sign-ins (any provider) in the last 24 hours. */
    failedLogins24h: number;
  };
}

export interface SecurityHealthResult extends HealthCheckResult {
  mfaStats: {
    totalUsers: number;
    usersWithMfa: number;
    mfaAdoptionRate: number;
    usersWithWebauthn: number;
    usersWithTotp: number;
  };
  /**
   * Okta SSO posture metrics. Present on deployments that have run
   * migration 071. `internalUserCount` counts active users whose role
   * is one of Admin/Manager/Engineer/CX/Sales/Support — the roles
   * eligible for the Okta path in v1. `usersWithoutMfaOrSso` counts
   * EVERY active user (internal + external) with no MFA AND no SSO
   * link — these are the accounts a stolen password fully owns, so
   * the panel surfaces them as a posture warning regardless of role.
   */
  ssoStats?: {
    isSsoEnabled: boolean;
    internalUserCount: number;
    internalUsersOnSso: number;
    ssoAdoptionRate: number;
    usersWithoutMfaOrSso: number;
  };
  loginAttempts: {
    successful24h: number;
    failed24h: number;
    failureRate: number;
    lockedAccounts: number;
  };
  sessions: {
    activeSessions: number;
    expiredSessions24h: number;
  };
  passwordSecurity: {
    usersRequiringReset: number;
    expiredPasswords: number;
  };
  recentLogins: Array<{
    userName: string | null;
    userEmail: string | null;
    success: boolean | null;
    failureReason: string | null;
    loginTime: string | null;
  }>;
}

export interface BackgroundServicesResult extends HealthCheckResult {
  websocket: {
    status: 'running' | 'stopped' | 'unknown';
    connectedClients: number;
    authenticatedClients: number;
  };
  emailScheduler: {
    status: 'active' | 'inactive' | 'unknown';
    rulesCount: number;
    triggersCount: number;
    scheduledActionsCount: number;
  };
  workflowAutomation: {
    activeRules: number;
    executionsToday: number;
    failedExecutions24h: number;
  };
  // Live snapshot of the daily expired-sessions prune job (Task #745).
  // Mirrors the in-memory snapshot kept by
  // `server/services/expired-sessions-cleanup.ts`. Surfacing it here
  // (instead of carving out a brand-new top-level health category) lets
  // the existing Background Services tab — which already shows the
  // email scheduler's status — answer "did the daily sessions sweep
  // run?" with the same affordances and without forcing operators to
  // tail `[Sessions Cleanup]` in stdout. All fields are nullable so
  // the payload stays well-formed when the scheduler hasn't started
  // (setup-wizard mode, MemoryStore-backed sessions) or has never
  // ticked yet (process just booted, first-run delay still pending).
  sessionsCleanup: {
    /**
     * `active` when the daily timer is wired up,
     * `inactive` when the scheduler intentionally short-circuited at
     *   boot (no DB / non-Postgres session store),
     * `unknown` when the snapshot lookup itself failed and we don't
     *   want to misleadingly claim either state.
     */
    status: 'active' | 'inactive' | 'unknown';
    /** ISO timestamp of the most recent tick (success or failure). */
    lastRunAt: string | null;
    /**
     * ISO timestamp of the most recent SUCCESSFUL tick. Distinct from
     * `lastRunAt` so the dashboard can label the row count as "last
     * successful prune" without mis-pairing a previous success with
     * a later failure's timestamp.
     */
    lastSuccessAt: string | null;
    /** Rows removed on the most recent SUCCESSFUL tick (paired with `lastSuccessAt`). */
    lastRowsPruned: number | null;
    /** Wall-clock duration of the most recent tick in ms. */
    lastDurationMs: number | null;
    /** Error message captured from the most recent FAILED tick. */
    lastError: string | null;
    /** ISO timestamp of the next scheduled tick (now + intervalMs). */
    nextRunAt: string | null;
    /** Configured tick interval in ms (null when scheduler not running). */
    intervalMs: number | null;
    /**
     * True when the most recent tick was skipped because
     * `dbHealth.reachable === false`. Operators use this to tell
     * "the job is healthy but the DB just came back" apart from
     * "the table was already clean".
     */
    skippedDueToUnreachableDb: boolean;
  };
}

export interface StorageHealthResult extends HealthCheckResult {
  objectStorage: {
    status: 'connected' | 'disconnected' | 'not_configured';
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
  pathSizes: Array<{
    label: string;
    pathPattern: string;
    totalSizeBytes: number;
    totalSizeFormatted: string;
    fileCount?: number;
  }>;
  /**
   * Files-database-side truth: bytes that ACTUALLY live in the
   * `uploaded_files` table right now, regardless of what the main DB's
   * `documents` / `customers.logo_size` metadata records. Present only when
   * the `db` storage provider has been initialized; null otherwise (cloud /
   * local-disk installs have no files DB to query).
   */
  filesDbStats: {
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

export interface PerformanceHealthResult extends HealthCheckResult {
  apiMetrics: {
    averageResponseTimeMs: number;
    slowQueriesCount: number;
    requestsPerMinute: number;
  };
  databasePerformance: {
    slowQueries24h: number;
    avgQueryTimeMs: number;
    cacheHitRatio: number;
    /** 'pg_stat_statements' when the extension is available; 'limited' otherwise */
    statsSource: 'pg_stat_statements' | 'limited';
  };
  connectionPool: {
    totalConnections: number;
    idleConnections: number;
    waitingRequests: number;
    maxConnections: number;
  };
  memoryUsage: {
    heapUsedMB: number;
    heapTotalMB: number;
    externalMB: number;
    rssMemoryMB: number;
  };
  uptime: {
    uptimeSeconds: number;
    uptimeFormatted: string;
  };
}

export interface ArchiveSchemaValidationResult extends HealthCheckResult {
  results: Array<{
    tableName: string;
    sourceTable: string;
    archiveTable: string;
    sourceColumnCount: number;
    archiveColumnCount: number;
    status: 'ok' | 'warning';
    missingColumns: string[];
    extraColumns: string[];
    message: string;
  }>;
  summary: {
    totalTables: number;
    tablesOk: number;
    tablesWithIssues: number;
    totalMissingColumns: number;
  };
}

/**
 * Captured demand from end-users: ideas to add to the backlog (feature
 * requests) and outright problems they need fixed (support requests).
 * Both live in `support_requests` keyed by the `type` column.
 *
 * Surfaced on System Health so operators can see at a glance whether
 * there's pending feedback to triage. Feature requests degrade to
 * `warning` because they're not blocking; support requests degrade to
 * `error` because they typically represent customer-impacting issues.
 */
export interface FeatureRequestsHealthResult extends HealthCheckResult {
  /** Total `support_requests` rows where `type='feature'`. */
  totalCount: number;
}

export interface SupportRequestsHealthResult extends HealthCheckResult {
  /** Total `support_requests` rows where `type='issue'`. */
  totalCount: number;
}

/**
 * Captured browser-side errors (uncaught exceptions, React Error
 * Boundary catches, unhandled promise rejections, mutation failures
 * — see `docs/features/client-error-capture.md` for the full capture
 * pipeline). Any row in `client_error_logs` is a bug that reached a
 * user, so the card degrades to `error` as soon as the count is > 0.
 * Operators "Clear All" from the Error Audit Log surface to reset.
 */
export interface ClientErrorsHealthResult extends HealthCheckResult {
  /** Total `client_error_logs` rows. */
  totalCount: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  
  return parts.length > 0 ? parts.join(' ') : '< 1m';
}

export class HealthMonitor {
  private wss: WebSocketServer | null = null;
  private emailSchedulerActive: boolean = false;

  setWebSocketServer(wss: WebSocketServer) {
    this.wss = wss;
  }

  setEmailSchedulerStatus(active: boolean) {
    this.emailSchedulerActive = active;
  }

  async getDatabaseHealth(): Promise<DatabaseHealthResult> {
    const lastChecked = new Date().toISOString();
    
    try {
      // Source the ceiling from the resolved `dbPoolMax` so the
      // gauge reflects the operator's actual `DB_POOL_MAX` override
      // instead of the legacy hard-coded `20` (Task #507). Both
      // `poolMax` and `maxConnections` carry the same value — the
      // latter is kept as an alias so older client code (and the
      // existing dashboard selectors) keep working without a
      // simultaneous migration.
      const poolStats = {
        poolMax: dbPoolMax,
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
        totalConnections: pool.totalCount,
        idleConnections: pool.idleCount,
        maxConnections: dbPoolMax,
      };

      // Run ANALYZE to refresh table statistics for accurate row counts
      await db.execute(sql`ANALYZE`);
      
      const tableStatsResult = await db.execute(sql`
        SELECT 
          relname as table_name,
          n_live_tup as row_count,
          pg_total_relation_size(quote_ident(relname)::regclass) as size_bytes
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(quote_ident(relname)::regclass) DESC
      `);

      const tableStats = (tableStatsResult.rows as any[]).map(row => ({
        tableName: row.table_name,
        rowCount: parseInt(row.row_count) || 0,
        sizeBytes: parseInt(row.size_bytes) || 0,
        sizeFormatted: formatBytes(parseInt(row.size_bytes) || 0)
      }));

      const dbSizeResult = await db.execute(sql`
        SELECT pg_database_size(current_database()) as total_size
      `);
      const totalBytes = parseInt((dbSizeResult.rows[0] as any)?.total_size) || 0;

      // Projects don't have a customer_id field - skip orphaned projects check
      // Projects are linked to customers via customer_name or other relationships

      const orphanedPhases = await db.execute(sql`
        SELECT COUNT(*) as count FROM map_phases mp
        LEFT JOIN projects p ON mp.project_id = p.id
        WHERE p.id IS NULL
      `);

      const orphanedSteps = await db.execute(sql`
        SELECT COUNT(*) as count FROM map_steps ms
        LEFT JOIN map_phases mp ON ms.phase_id = mp.id
        WHERE mp.id IS NULL
      `);

      const orphanedTasks = await db.execute(sql`
        SELECT COUNT(*) as count FROM map_tasks mt
        LEFT JOIN map_steps ms ON mt.step_id = ms.id
        WHERE ms.id IS NULL
      `);

      const orphanedCriteria = await db.execute(sql`
        SELECT COUNT(*) as count FROM success_criteria sc
        LEFT JOIN projects p ON sc.project_id = p.id
        WHERE p.id IS NULL
      `);

      const orphanedRecords = {
        projectsWithoutCustomers: 0, // Projects use customer_name, not FK - no orphan check needed
        mapPhasesWithoutProjects: parseInt((orphanedPhases.rows[0] as any)?.count) || 0,
        mapStepsWithoutPhases: parseInt((orphanedSteps.rows[0] as any)?.count) || 0,
        mapTasksWithoutSteps: parseInt((orphanedTasks.rows[0] as any)?.count) || 0,
        successCriteriaWithoutProjects: parseInt((orphanedCriteria.rows[0] as any)?.count) || 0
      };

      // Migration drift count (Task #400). Cross-references migration
      // files on disk against `schema_migrations` so the database tile
      // can downgrade to `warning` whenever the auto-runner left a
      // numbered file unapplied — making a half-applied deployment
      // visible from the System Health overview's three-tile rollup
      // instead of requiring the operator to click into the deeper
      // Schema Migrations card on the Database tab.
      //
      // Wrapped in its own try/catch so a migration probe failure
      // (e.g. permission denied on `schema_migrations`) doesn't take
      // out the whole database health check — we'd rather surface the
      // pool/orphan signal we already gathered and report the drift as
      // unknown (`0`) than 500 the entire `/api/system/health`
      // response. The error is logged so a regression in the lookup
      // doesn't fail silently.
      let pendingMigrations = 0;
      let pendingMigrationFiles: string[] = [];
      try {
        const migrationsReport = await getSchemaMigrationsReport(pool);
        pendingMigrations = migrationsReport.missing.length;
        // Surface the first few filenames so the Database tile tooltip
        // (Task #412) can name the exact files an admin needs to act
        // on. The full list stays available on the Schema Migrations
        // card on the Database tab — the tooltip is just the
        // "actionable preview" so the operator never has to click in
        // just to read the filenames during an incident.
        pendingMigrationFiles = migrationsReport.missing
          .slice(0, PENDING_MIGRATION_FILES_LIMIT)
          .map((m) => m.filename);
      } catch (migrationError) {
        console.error('Database health migration drift check error:', migrationError);
      }

      const hasOrphans = Object.values(orphanedRecords).some(v => v > 0);
      const poolWarning = poolStats.waitingCount > 5;
      const hasMigrationDrift = pendingMigrations > 0;

      // Status precedence: orphans / pool / drift each downgrade `ok`
      // → `warning`. We pick a single `message` string for the tile's
      // tooltip — migration drift wins so an operator scanning the
      // overview sees the most actionable signal first (a half-applied
      // deploy is more urgent than transient orphan rows or a busy
      // pool).
      const status: 'ok' | 'warning' = hasOrphans || poolWarning || hasMigrationDrift ? 'warning' : 'ok';
      const message = hasMigrationDrift
        ? `${pendingMigrations} migration(s) on disk have not been applied`
        : hasOrphans
          ? 'Orphaned records detected'
          : poolWarning
            ? 'High connection wait count'
            : 'Database healthy';

      return {
        status,
        lastChecked,
        message,
        connectionPool: poolStats,
        tableStats,
        orphanedRecords,
        databaseSize: {
          totalBytes,
          totalFormatted: formatBytes(totalBytes)
        },
        connectionSource: dbSource,
        pendingMigrations,
        pendingMigrationFiles
      };
    } catch (error) {
      console.error('Database health check error:', error);
      return {
        status: 'error',
        lastChecked,
        message: 'Failed to check database health',
        connectionPool: {
          poolMax: dbPoolMax,
          totalCount: 0,
          idleCount: 0,
          waitingCount: 0,
          totalConnections: 0,
          idleConnections: 0,
          maxConnections: dbPoolMax,
        },
        tableStats: [],
        orphanedRecords: {
          projectsWithoutCustomers: 0,
          mapPhasesWithoutProjects: 0,
          mapStepsWithoutPhases: 0,
          mapTasksWithoutSteps: 0,
          successCriteriaWithoutProjects: 0
        },
        databaseSize: { totalBytes: 0, totalFormatted: '0 B' },
        connectionSource: dbSource,
        pendingMigrations: 0,
        pendingMigrationFiles: []
      };
    }
  }

  async getEmailHealth(): Promise<EmailHealthResult> {
    const lastChecked = new Date().toISOString();

    try {
      const config = await storage.getEmailConfiguration();

      // email_logs uses 'success' boolean column, not 'status' string
      const sentLogs = await db.execute(sql`
        SELECT COUNT(*) as count FROM email_logs
        WHERE sent_at >= NOW() - INTERVAL '24 hours' AND success = true AND is_demo = false
      `);

      const failedLogs = await db.execute(sql`
        SELECT COUNT(*) as count FROM email_logs
        WHERE sent_at >= NOW() - INTERVAL '24 hours' AND success = false AND is_demo = false
      `);

      // All-time Email Log metrics (moved here from the panel that used to
      // sit under Integrations › Email Configuration). Counted in SQL rather
      // than from the /api/email-logs list so they stay right past its page
      // size. date_trunc('week') starts on Monday.
      const totalLogs = await db.execute(sql`
        SELECT
          COUNT(*) as count,
          COUNT(*) FILTER (WHERE success = true) as success_count,
          COUNT(*) FILTER (WHERE sent_at >= date_trunc('week', NOW())) as week_count,
          COUNT(*) FILTER (WHERE sent_at >= date_trunc('month', NOW())) as month_count
        FROM email_logs
        WHERE is_demo = false
      `);
      const totalsRow = totalLogs.rows[0] as any;
      const totalCount = parseInt(totalsRow?.count) || 0;
      const successCount = parseInt(totalsRow?.success_count) || 0;

      // Automation rules fired in the last 24h — a meaningful activity
      // indicator since emails have no queued/pending state in this schema
      // (they are logged synchronously after each send attempt).
      const firedTodayResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM email_rule_audits
        WHERE created_at >= NOW() - INTERVAL '24 hours' AND is_demo = false
      `);
      const firedTodayCount = parseInt((firedTodayResult.rows[0] as any)?.count) || 0;

      const recentFailuresResult = await db.execute(sql`
        SELECT id, to_email as recipient, subject, error, sent_at
        FROM email_logs
        WHERE success = false AND sent_at >= NOW() - INTERVAL '24 hours' AND is_demo = false
        ORDER BY sent_at DESC
        LIMIT 5
      `);

      const recentFailures = (recentFailuresResult.rows as any[]).map(row => ({
        id: row.id,
        recipient: row.recipient,
        subject: row.subject || 'No subject',
        error: row.error || 'Unknown error',
        sentAt: row.sent_at
      }));

      // Most recent email_logs entry (all-time) — used to derive a "last
      // known good" delivery status on the health tab without a live probe.
      const lastSendResult = await db.execute(sql`
        SELECT success, sent_at, error FROM email_logs WHERE is_demo = false ORDER BY id DESC LIMIT 1
      `);
      const lastSendRow = lastSendResult.rows[0] as any;
      const lastSendStatus = lastSendRow
        ? {
            success: lastSendRow.success as boolean,
            sentAt: lastSendRow.sent_at as string,
            error: lastSendRow.error as string | null,
          }
        : { success: null, sentAt: null, error: null };

      // Count of enabled automation rules — lets the health tab tell apart
      // "no rules configured" (gray/expected) from "rules exist but engine
      // stopped" (red/alert).
      const enabledRulesResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM email_rules WHERE enabled = true AND is_demo = false
      `);
      const enabledRulesCount = parseInt((enabledRulesResult.rows[0] as any)?.count) || 0;

      const isConfigured = !!config;
      const hasFailures = parseInt((failedLogs.rows[0] as any)?.count) > 0;

      return {
        status: !isConfigured ? 'error' : hasFailures ? 'warning' : 'ok',
        lastChecked,
        message: !isConfigured ? 'Email not configured' : hasFailures ? 'Recent email failures detected' : 'Email system operational',
        configuration: {
          isConfigured,
          enabled: config?.enabled ?? false,
          provider: config?.provider ?? null,
          server: config?.server ?? null,
          port: config?.port ?? null,
          authType: config?.authType ?? 'smtp'
        },
        queueStats: {
          firedToday: firedTodayCount,
          sent24h: parseInt((sentLogs.rows[0] as any)?.count) || 0,
          failed24h: parseInt((failedLogs.rows[0] as any)?.count) || 0,
          totalLogs: totalCount,
          sentThisWeek: parseInt(totalsRow?.week_count) || 0,
          sentThisMonth: parseInt(totalsRow?.month_count) || 0,
          successRate: totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0
        },
        lastSendStatus,
        recentFailures,
        schedulerStatus: {
          active: this.emailSchedulerActive,
          lastRun: null,
          enabledRulesCount,
        }
      };
    } catch (error) {
      console.error('Email health check error:', error);
      return {
        status: 'error',
        lastChecked,
        message: 'Failed to check email health',
        configuration: {
          isConfigured: false,
          enabled: false,
          provider: null,
          server: null,
          port: null,
          authType: 'smtp'
        },
        queueStats: { firedToday: 0, sent24h: 0, failed24h: 0, totalLogs: 0, sentThisWeek: 0, sentThisMonth: 0, successRate: 0 },
        lastSendStatus: { success: null, sentAt: null, error: null },
        recentFailures: [],
        schedulerStatus: { active: false, lastRun: null, enabledRulesCount: 0 }
      };
    }
  }

  async getIntegrationHealth(): Promise<IntegrationHealthResult> {
    const lastChecked = new Date().toISOString();

    try {
      // Use salesforce_oauth_config for SF configuration (not salesforce_configurations)
      const sfConfigs = await db.execute(sql`
        SELECT COUNT(*) as count FROM salesforce_oauth_config
      `);

      // Count users with SF tokens (user_integrations, migration 083)
      const sfConnectedUsers = await db.execute(sql`
        SELECT COUNT(*) as count FROM user_integrations
        WHERE provider = 'salesforce' AND access_token IS NOT NULL
      `);

      // Use salesforce_sync_runs for sync history (not salesforce_sync_history)
      const sfRecentSync = await db.execute(sql`
        SELECT COUNT(*) as count FROM salesforce_sync_runs
        WHERE started_at >= NOW() - INTERVAL '24 hours'
      `);

      const sfFailedSync = await db.execute(sql`
        SELECT COUNT(*) as count FROM salesforce_sync_runs
        WHERE status = 'failed' AND started_at >= NOW() - INTERVAL '24 hours'
      `);

      const sfLastSync = await db.execute(sql`
        SELECT completed_at FROM salesforce_sync_runs
        WHERE status = 'completed'
        ORDER BY completed_at DESC LIMIT 1
      `);

      // Use webhooks table (not webhook_configurations)
      const webhookConfigs = await db.execute(sql`
        SELECT COUNT(*) as count FROM webhooks
      `);

      const activeWebhooks = await db.execute(sql`
        SELECT COUNT(*) as count FROM webhooks WHERE is_active = true
      `);

      // Use webhook_deliveries table (not webhook_delivery_logs)
      const webhookDeliveries = await db.execute(sql`
        SELECT 
          COUNT(*) FILTER (WHERE success = true) as success_count,
          COUNT(*) as total_count
        FROM webhook_deliveries
        WHERE created_at >= NOW() - INTERVAL '24 hours' AND is_demo = false
      `);

      const pendingRetries = await db.execute(sql`
        SELECT COUNT(*) as count FROM webhook_deliveries
        WHERE success = false AND attempt_number < 5 AND created_at >= NOW() - INTERVAL '24 hours' AND is_demo = false
      `);

      const webhookFailures = await db.execute(sql`
        SELECT w.name as webhook_name, wd.error_message as error, wd.created_at as timestamp
        FROM webhook_deliveries wd
        JOIN webhooks w ON wd.webhook_id = w.id
        WHERE wd.success = false AND wd.created_at >= NOW() - INTERVAL '24 hours' AND wd.is_demo = false
        ORDER BY wd.created_at DESC LIMIT 5
      `);

      // Use ai_provider_configs table (not ai_provider_configurations)
      const aiProviders = await db.execute(sql`
        SELECT provider, is_active FROM ai_provider_configs
      `);

      const deliveryStats = webhookDeliveries.rows[0] as any;
      const successCount = parseInt(deliveryStats?.success_count) || 0;
      const totalCount = parseInt(deliveryStats?.total_count) || 0;
      const successRate = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 100;

      // n8n integration — read stored config + last test result. No live probe
      // here: the admin "Test Connection" action writes lastTestResult / lastTestedAt
      // so the health page reflects real state without adding external latency to
      // the 60-second poll. Wrapped in its own try/catch so a missing table on an
      // older deployment doesn't break the whole integration health check.
      let n8nData: IntegrationHealthResult['n8n'] = {
        isConfigured: false,
        isEnabled: false,
        lastTestResult: null,
        lastTestedAt: null,
        lastTestError: null,
      };
      try {
        const n8nResult = await db.execute(sql`
          SELECT host_url, is_enabled, last_tested_at, last_test_result, last_test_error
          FROM n8n_config LIMIT 1
        `);
        const row = n8nResult.rows[0] as any;
        if (row) {
          n8nData = {
            isConfigured: !!row.host_url,
            isEnabled: !!row.is_enabled,
            lastTestResult: row.last_test_result ?? null,
            lastTestedAt: row.last_tested_at ?? null,
            lastTestError: row.last_test_error ?? null,
          };
        }
      } catch {
        // n8n_config table absent on pre-migration deployment — leave defaults
      }

      // SSO integration — same pattern as n8n. The admin "Test
      // Connection" action writes lastTestResult / lastTestedAt
      // so the health page reflects real state without adding
      // OIDC discovery latency to the 60-second poll. We also
      // pull login counts from the audit trail so the panel can
      // show "is anyone actually using SSO".
      let ssoData: IntegrationHealthResult['sso'] = {
        isConfigured: false,
        isEnabled: false,
        provider: '',
        lastTestResult: null,
        lastTestedAt: null,
        lastTestError: null,
        successfulLogins24h: 0,
        failedLogins24h: 0,
      };
      try {
        // One row per provider (Okta SSO, Azure SSO — migration 078).
        // The tile reports the providers that are set up; test status
        // comes from a failing enabled provider first, else the first
        // enabled (or configured) one.
        const ssoRows = await db.execute(sql`
          SELECT provider, enabled, issuer_url, tenant_id, client_id, client_secret_enc,
                 last_test_result, last_tested_at, last_test_error
          FROM sso_config ORDER BY id
        `);
        const rows = (ssoRows.rows as any[]).map((row) => ({
          ...row,
          configured:
            !!(row.provider === 'azure' ? row.tenant_id : row.issuer_url) && !!row.client_id && !!row.client_secret_enc,
        }));
        const configuredRows = rows.filter((row) => row.configured);
        const enabledRows = configuredRows.filter((row) => row.enabled);
        const primary =
          enabledRows.find((row) => row.last_test_result === 'failure') ?? enabledRows[0] ?? configuredRows[0];
        if (configuredRows.length > 0) {
          ssoData.provider = configuredRows.map((row) => row.provider).join(',');
        }
        ssoData.isConfigured = configuredRows.length > 0;
        ssoData.isEnabled = enabledRows.length > 0;
        if (primary) {
          ssoData.lastTestResult = primary.last_test_result ?? null;
          ssoData.lastTestedAt = primary.last_tested_at ?? null;
          ssoData.lastTestError = primary.last_test_error ?? null;
        }
        const ssoLoginCounts = await db.execute(sql`
          SELECT
            COUNT(*) FILTER (WHERE success = true) AS ok_count,
            COUNT(*) FILTER (WHERE success = false) AS fail_count
          FROM audit_logins
          WHERE (login_method LIKE 'okta%' OR login_method LIKE 'azure%')
            AND login_time >= NOW() - INTERVAL '24 hours'
        `);
        const c = ssoLoginCounts.rows[0] as any;
        ssoData.successfulLogins24h = parseInt(c?.ok_count) || 0;
        ssoData.failedLogins24h = parseInt(c?.fail_count) || 0;
      } catch {
        // sso_config table absent on pre-migration deployment — leave defaults
      }

      const { isCrmProviderActive } = await import('../crm/provider-setting');
      const sfActive = await isCrmProviderActive('salesforce');

      const hasIssues =
        (sfActive && parseInt((sfFailedSync.rows[0] as any)?.count) > 0) ||
        successRate < 90 ||
        (n8nData.isEnabled && n8nData.lastTestResult === 'failed') ||
        (ssoData.isEnabled && ssoData.lastTestResult === 'failure');

      return {
        status: hasIssues ? 'warning' : 'ok',
        lastChecked,
        message: hasIssues ? 'Integration issues detected' : 'All integrations operational',
        salesforce: {
          active: sfActive,
          connectedUsers: parseInt((sfConnectedUsers.rows[0] as any)?.count) || 0,
          totalConfigurations: parseInt((sfConfigs.rows[0] as any)?.count) || 0,
          recentSyncCount: parseInt((sfRecentSync.rows[0] as any)?.count) || 0,
          failedSyncs24h: parseInt((sfFailedSync.rows[0] as any)?.count) || 0,
          lastSyncTime: (sfLastSync.rows[0] as any)?.completed_at || null
        },
        webhooks: {
          totalConfigurations: parseInt((webhookConfigs.rows[0] as any)?.count) || 0,
          activeWebhooks: parseInt((activeWebhooks.rows[0] as any)?.count) || 0,
          deliverySuccessRate24h: successRate,
          pendingRetries: parseInt((pendingRetries.rows[0] as any)?.count) || 0,
          recentFailures: (webhookFailures.rows as any[]).map(row => ({
            webhookName: row.webhook_name,
            error: row.error || 'Unknown error',
            timestamp: row.timestamp
          }))
        },
        aiProviders: {
          configuredProviders: (aiProviders.rows as any[]).length,
          activeProviders: (aiProviders.rows as any[])
            .filter(p => p.is_active)
            .map(p => p.provider),
          lastTestTime: null
        },
        n8n: n8nData,
        sso: ssoData,
      };
    } catch (error) {
      console.error('Integration health check error:', error);
      return {
        status: 'error',
        lastChecked,
        message: 'Failed to check integration health',
        salesforce: {
          active: false,
          connectedUsers: 0,
          totalConfigurations: 0,
          recentSyncCount: 0,
          failedSyncs24h: 0,
          lastSyncTime: null
        },
        webhooks: {
          totalConfigurations: 0,
          activeWebhooks: 0,
          deliverySuccessRate24h: 0,
          pendingRetries: 0,
          recentFailures: []
        },
        aiProviders: {
          configuredProviders: 0,
          activeProviders: [],
          lastTestTime: null
        },
        n8n: {
          isConfigured: false,
          isEnabled: false,
          lastTestResult: null,
          lastTestedAt: null,
          lastTestError: null,
        },
        sso: {
          isConfigured: false,
          isEnabled: false,
          provider: '',
          lastTestResult: null,
          lastTestedAt: null,
          lastTestError: null,
          successfulLogins24h: 0,
          failedLogins24h: 0,
        },
      };
    }
  }

  async getSecurityHealth(): Promise<SecurityHealthResult> {
    const lastChecked = new Date().toISOString();

    try {
      const totalUsers = await db.execute(sql`
        SELECT COUNT(*) as count FROM users WHERE is_active = true
      `);

      const mfaUsers = await db.execute(sql`
        SELECT COUNT(*) as count FROM users WHERE mfa_enabled = true AND is_active = true
      `);

      const webauthnUsers = await db.execute(sql`
        SELECT COUNT(DISTINCT user_id) as count FROM webauthn_credentials
      `);

      // Use totp_secret_enc column (not mfa_secret)
      const totpUsers = await db.execute(sql`
        SELECT COUNT(*) as count FROM users WHERE totp_secret_enc IS NOT NULL AND is_active = true
      `);

      // Use audit_logins table (not auth_audit_log)
      const successfulLogins = await db.execute(sql`
        SELECT COUNT(*) as count FROM audit_logins
        WHERE success = true AND created_at >= NOW() - INTERVAL '24 hours'
      `);

      const failedLogins = await db.execute(sql`
        SELECT COUNT(*) as count FROM audit_logins
        WHERE success = false AND created_at >= NOW() - INTERVAL '24 hours'
      `);

      // No failed_login_attempts column - check for users with repeated failures in last hour
      const lockedAccounts = await db.execute(sql`
        SELECT COUNT(*) as count FROM (
          SELECT user_id FROM audit_logins
          WHERE success = false 
          AND created_at >= NOW() - INTERVAL '1 hour'
          GROUP BY user_id
          HAVING COUNT(*) >= 5
        ) as locked_users
      `);

      const activeSessions = await db.execute(sql`
        SELECT COUNT(*) as count FROM sessions WHERE expire > NOW()
      `);

      const expiredSessions = await db.execute(sql`
        SELECT COUNT(*) as count FROM sessions
        WHERE expire <= NOW() AND expire >= NOW() - INTERVAL '24 hours'
      `);

      // Use reset_token and reset_token_expiry columns
      const pendingPasswordResets = await db.execute(sql`
        SELECT COUNT(*) as count FROM users
        WHERE reset_token IS NOT NULL AND reset_token_expiry > NOW()
      `);

      // Users flagged for a forced password change (force_password_change = true).
      // No passwordExpiresAt column exists; forcePasswordChange is the closest
      // equivalent — these accounts must reset their password on next login.
      const forcePasswordChangeUsers = await db.execute(sql`
        SELECT COUNT(*) as count FROM users
        WHERE force_password_change = true AND is_active = true
      `);

      // Last 3 login events (excludes secret-reveal audit rows) for the
      // "Login Activity Details" card — mirrors the User/Status columns of
      // the User Management → Audit table.
      const recentLoginsRes = await db.execute(sql`
        SELECT user_name, user_email, success, failure_reason, login_time
        FROM audit_logins
        WHERE event_type = 'login'
        ORDER BY login_time DESC
        LIMIT 3
      `);
      const recentLogins = recentLoginsRes.rows.map((r: any) => ({
        userName: r.user_name ?? null,
        userEmail: r.user_email ?? null,
        success: r.success ?? null,
        failureReason: r.failure_reason ?? null,
        loginTime: r.login_time ? new Date(r.login_time).toISOString() : null,
      }));

      const total = parseInt((totalUsers.rows[0] as any)?.count) || 0;
      const mfaCount = parseInt((mfaUsers.rows[0] as any)?.count) || 0;
      const mfaRate = total > 0 ? Math.round((mfaCount / total) * 100) : 0;

      // SSO posture metrics — wrapped in their own try/catch so a
      // pre-migration deployment without sso_config / users.sso_*
      // does not break the rest of the security panel.
      let ssoStats: SecurityHealthResult['ssoStats'] = undefined;
      try {
        const internalRoles = sql`('Admin','Manager','Engineer','CX','Sales','Support')`;
        const internalTotalRes = await db.execute(sql`
          SELECT COUNT(*) AS count FROM users
          WHERE is_active = true AND role IN ${internalRoles}
        `);
        const internalOnSsoRes = await db.execute(sql`
          SELECT COUNT(*) AS count FROM users
          WHERE is_active = true
            AND role IN ${internalRoles}
            AND sso_provider IS NOT NULL
        `);
        const noFactorRes = await db.execute(sql`
          SELECT COUNT(*) AS count FROM users
          WHERE is_active = true
            AND mfa_enabled = false
            AND sso_provider IS NULL
        `);
        const ssoConfigRes = await db.execute(sql`
          SELECT bool_or(enabled) AS enabled FROM sso_config
        `);
        const internalCount = parseInt((internalTotalRes.rows[0] as any)?.count) || 0;
        const onSsoCount = parseInt((internalOnSsoRes.rows[0] as any)?.count) || 0;
        ssoStats = {
          isSsoEnabled: !!(ssoConfigRes.rows[0] as any)?.enabled,
          internalUserCount: internalCount,
          internalUsersOnSso: onSsoCount,
          ssoAdoptionRate: internalCount > 0 ? Math.round((onSsoCount / internalCount) * 100) : 0,
          usersWithoutMfaOrSso: parseInt((noFactorRes.rows[0] as any)?.count) || 0,
        };
      } catch {
        // sso_config / users.sso_* not present yet — leave undefined.
      }

      const successLogins = parseInt((successfulLogins.rows[0] as any)?.count) || 0;
      const failLogins = parseInt((failedLogins.rows[0] as any)?.count) || 0;
      const failureRate = (successLogins + failLogins) > 0 
        ? Math.round((failLogins / (successLogins + failLogins)) * 100) 
        : 0;

      const locked = parseInt((lockedAccounts.rows[0] as any)?.count) || 0;
      // Flag the panel yellow when SSO is on but adoption is still
      // below 50% — usually means the rollout stalled mid-migration —
      // OR there are at-risk accounts with neither MFA nor SSO.
      const ssoIssue =
        ssoStats && ssoStats.isSsoEnabled && ssoStats.ssoAdoptionRate < 50;
      const factorlessIssue =
        ssoStats && ssoStats.usersWithoutMfaOrSso > 0;
      const hasIssues =
        mfaRate < 50 || failureRate > 20 || locked > 0 || !!ssoIssue || !!factorlessIssue;

      return {
        status: hasIssues ? 'warning' : 'ok',
        lastChecked,
        message: locked > 0 ? 'Locked accounts detected' : mfaRate < 50 ? 'Low MFA adoption' : 'Security metrics healthy',
        mfaStats: {
          totalUsers: total,
          usersWithMfa: mfaCount,
          mfaAdoptionRate: mfaRate,
          usersWithWebauthn: parseInt((webauthnUsers.rows[0] as any)?.count) || 0,
          usersWithTotp: parseInt((totpUsers.rows[0] as any)?.count) || 0
        },
        loginAttempts: {
          successful24h: successLogins,
          failed24h: failLogins,
          failureRate,
          lockedAccounts: locked
        },
        sessions: {
          activeSessions: parseInt((activeSessions.rows[0] as any)?.count) || 0,
          expiredSessions24h: parseInt((expiredSessions.rows[0] as any)?.count) || 0
        },
        passwordSecurity: {
          usersRequiringReset: parseInt((pendingPasswordResets.rows[0] as any)?.count) || 0,
          expiredPasswords: parseInt((forcePasswordChangeUsers.rows[0] as any)?.count) || 0
        },
        ssoStats,
        recentLogins
      };
    } catch (error) {
      console.error('Security health check error:', error);
      return {
        status: 'error',
        lastChecked,
        message: 'Failed to check security health',
        mfaStats: {
          totalUsers: 0,
          usersWithMfa: 0,
          mfaAdoptionRate: 0,
          usersWithWebauthn: 0,
          usersWithTotp: 0
        },
        loginAttempts: {
          successful24h: 0,
          failed24h: 0,
          failureRate: 0,
          lockedAccounts: 0
        },
        sessions: {
          activeSessions: 0,
          expiredSessions24h: 0
        },
        passwordSecurity: {
          usersRequiringReset: 0,
          expiredPasswords: 0
        },
        recentLogins: []
      };
    }
  }

  async getBackgroundServicesHealth(): Promise<BackgroundServicesResult> {
    const lastChecked = new Date().toISOString();

    try {
      let wsConnectedClients = 0;
      let wsAuthenticatedClients = 0;

      if (this.wss) {
        this.wss.clients.forEach((client: any) => {
          wsConnectedClients++;
          if (client.userId) {
            wsAuthenticatedClients++;
          }
        });
      }

      // Use email_rules table (not email_automation_rules)
      const emailRules = await db.execute(sql`
        SELECT COUNT(*) as count FROM email_rules WHERE enabled = true AND is_demo = false
      `);

      // Use email_triggers table - count triggers with default_enabled
      const emailTriggers = await db.execute(sql`
        SELECT COUNT(*) as count FROM email_triggers WHERE default_enabled = true
      `);

      // Use email_schedules for scheduled emails - uses 'active' column
      const scheduledActions = await db.execute(sql`
        SELECT COUNT(*) as count FROM email_schedules WHERE active = true
      `);

      // Active email rules — the closest equivalent to "active workflow rules"
      const emailRulesResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM email_rules WHERE enabled = true AND is_demo = false
      `);
      const workflowRulesCount = parseInt((emailRulesResult.rows[0] as any)?.count) || 0;

      // Use email_rule_audits table (not email_rule_audit)
      const todayExecutions = await db.execute(sql`
        SELECT COUNT(*) as count FROM email_rule_audits
        WHERE created_at >= CURRENT_DATE AND is_demo = false
      `);

      const failedExecutions = await db.execute(sql`
        SELECT COUNT(*) as count FROM email_rule_audits
        WHERE decision = 'failed' AND created_at >= NOW() - INTERVAL '24 hours' AND is_demo = false
      `);

      const hasFailed = parseInt((failedExecutions.rows[0] as any)?.count) > 0;

      // Fold the expired-sessions prune snapshot (Task #745) into the
      // payload. Wrapped in its own try/catch so a regression in the
      // snapshot accessor — or a future module-load order tweak —
      // can never take out the rest of the background services check.
      // We surface `unknown` status in that fallback so the dashboard
      // doesn't pretend the job is healthy.
      let sessionsCleanup: BackgroundServicesResult['sessionsCleanup'];
      try {
        const { getLastPruneSnapshot } = await import('./expired-sessions-cleanup');
        const snap = getLastPruneSnapshot();
        sessionsCleanup = {
          status: snap.schedulerActive ? 'active' : 'inactive',
          lastRunAt: snap.lastRunAt,
          lastSuccessAt: snap.lastSuccessAt,
          lastRowsPruned: snap.lastRowsPruned,
          lastDurationMs: snap.lastDurationMs,
          lastError: snap.lastError,
          nextRunAt: snap.nextRunAt,
          intervalMs: snap.intervalMs,
          skippedDueToUnreachableDb: snap.skippedDueToUnreachableDb,
        };
      } catch (snapErr) {
        console.error('Sessions cleanup snapshot lookup error:', snapErr);
        sessionsCleanup = {
          status: 'unknown',
          lastRunAt: null,
          lastSuccessAt: null,
          lastRowsPruned: null,
          lastDurationMs: null,
          lastError: null,
          nextRunAt: null,
          intervalMs: null,
          skippedDueToUnreachableDb: false,
        };
      }

      // The sessions-cleanup job downgrades the tile to `warning` when
      // the most recent tick recorded an error or is currently being
      // skipped because the DB is unreachable — same precedence the
      // tile already uses for failed workflow executions.
      const sessionsCleanupTrouble =
        !!sessionsCleanup.lastError || sessionsCleanup.skippedDueToUnreachableDb;
      const status: 'ok' | 'warning' = hasFailed || sessionsCleanupTrouble ? 'warning' : 'ok';
      const message = hasFailed
        ? 'Some background task failures'
        : sessionsCleanup.lastError
          ? 'Last expired-session prune failed'
          : sessionsCleanup.skippedDueToUnreachableDb
            ? 'Expired-session prune skipped: DB unreachable'
            : 'All services operational';

      return {
        status,
        lastChecked,
        message,
        websocket: {
          status: this.wss ? 'running' : 'unknown',
          connectedClients: wsConnectedClients,
          authenticatedClients: wsAuthenticatedClients
        },
        emailScheduler: {
          status: this.emailSchedulerActive ? 'active' : 'inactive',
          rulesCount: parseInt((emailRules.rows[0] as any)?.count) || 0,
          triggersCount: parseInt((emailTriggers.rows[0] as any)?.count) || 0,
          scheduledActionsCount: parseInt((scheduledActions.rows[0] as any)?.count) || 0
        },
        workflowAutomation: {
          activeRules: workflowRulesCount,
          executionsToday: parseInt((todayExecutions.rows[0] as any)?.count) || 0,
          failedExecutions24h: parseInt((failedExecutions.rows[0] as any)?.count) || 0
        },
        sessionsCleanup
      };
    } catch (error) {
      console.error('Background services health check error:', error);
      return {
        status: 'error',
        lastChecked,
        message: 'Failed to check background services',
        websocket: {
          status: 'unknown',
          connectedClients: 0,
          authenticatedClients: 0
        },
        emailScheduler: {
          status: 'unknown',
          rulesCount: 0,
          triggersCount: 0,
          scheduledActionsCount: 0
        },
        workflowAutomation: {
          activeRules: 0,
          executionsToday: 0,
          failedExecutions24h: 0
        },
        sessionsCleanup: {
          status: 'unknown',
          lastRunAt: null,
          lastSuccessAt: null,
          lastRowsPruned: null,
          lastDurationMs: null,
          lastError: null,
          nextRunAt: null,
          intervalMs: null,
          skippedDueToUnreachableDb: false,
        }
      };
    }
  }

  async getStorageHealth(): Promise<StorageHealthResult> {
    const lastChecked = new Date().toISOString();

    try {
      // Use documents table (not attachments) for file storage — exclude soft-deleted rows
      const documentStats = await db.execute(sql`
        SELECT 
          document_type as category,
          COUNT(*) as count,
          COALESCE(SUM(file_size), 0) as total_size
        FROM documents
        WHERE deleted_at IS NULL
        GROUP BY document_type
      `);

      const totalDocuments = await db.execute(sql`
        SELECT COUNT(*) as count, COALESCE(SUM(file_size), 0) as total_size
        FROM documents
        WHERE deleted_at IS NULL
      `);

      // Path-prefix size breakdown
      const pathStats = await db.execute(sql`
        SELECT
          CASE
            WHEN gcs_path LIKE 'accounts/%/documents/%' THEN 'Account Documents'
            WHEN gcs_path LIKE 'system/documents/%'     THEN 'General Documents'
            WHEN gcs_path LIKE 'accounts/%/logo/%'      THEN 'Customer Logos'
            WHEN gcs_path LIKE 'system/email-assets/%'  THEN 'Email Design Assets'
            WHEN gcs_path LIKE 'system/flight-deck/%'   THEN 'Flight Deck Images'
            WHEN gcs_path LIKE 'system/solution-icons/%' THEN 'Solution Icons'
            WHEN gcs_path LIKE 'system/rich-text/%'     THEN 'Rich-Text Images'
            WHEN gcs_path LIKE 'accounts/%/support-attachments/%' THEN 'Support (account)'
            WHEN gcs_path LIKE 'system/support-attachments/%'     THEN 'Support (general)'
            ELSE 'Other'
          END as label,
          CASE
            WHEN gcs_path LIKE 'accounts/%/documents/%' THEN 'accounts/{accountId}/documents/{filename}'
            WHEN gcs_path LIKE 'system/documents/%'     THEN 'system/documents/{userId}/{filename}'
            WHEN gcs_path LIKE 'accounts/%/logo/%'      THEN 'accounts/{accountId}/logo/{filename}'
            WHEN gcs_path LIKE 'system/email-assets/%'  THEN 'system/email-assets/{filename}'
            WHEN gcs_path LIKE 'system/flight-deck/%'   THEN 'system/flight-deck/{filename}'
            WHEN gcs_path LIKE 'system/solution-icons/%' THEN 'system/solution-icons/{filename}'
            WHEN gcs_path LIKE 'system/rich-text/%'     THEN 'system/rich-text/{filename}'
            WHEN gcs_path LIKE 'accounts/%/support-attachments/%' THEN 'accounts/{customerId}/support-attachments/{filename}'
            WHEN gcs_path LIKE 'system/support-attachments/%'     THEN 'system/support-attachments/{filename}'
            ELSE 'other'
          END as path_pattern,
          COALESCE(SUM(file_size), 0) as total_size,
          COUNT(*)::bigint as count
        FROM documents
        WHERE deleted_at IS NULL AND gcs_path IS NOT NULL
        GROUP BY label, path_pattern
        ORDER BY label
      `);

      // Account logos — count accounts (customers) that have a logo uploaded.
      // There is no separate company_configurations table; logos live on the
      // customers row via logo_url. companyLogosCount is kept as a field alias
      // for backwards-compatibility but is always 0 — all logo counts are
      // reflected in customerLogosCount / accountLogosCount below.
      const companyLogosCount = 0;

      const customerLogos = await db.execute(sql`
        SELECT COUNT(*) as count, COALESCE(SUM(logo_size), 0) as total_logo_size
        FROM customers WHERE logo_url IS NOT NULL
      `);

      const totalSize = parseInt((totalDocuments.rows[0] as any)?.total_size) || 0;

      const { getActiveProvider, getConfigSource, getActiveBucketName, isCloudConfigured } = await import('../lib/cloud-storage');
      const activeProvider = getActiveProvider();
      const configSource = getConfigSource();
      const isCloud = isCloudConfigured();
      const activeBucketName = getActiveBucketName();

      // Files-DB-side stats — read directly from uploaded_files so the
      // panel can show what's REALLY persisted vs. what the main DB
      // metadata records. Null when the db provider isn't initialized.
      const { getFilesDbStats, getFilesDbName, getFilesDbPathSizes } = await import('../lib/files-db');
      const filesDbRaw = await getFilesDbStats();
      const filesDbPathSizes = (await getFilesDbPathSizes()) ?? [];
      const filesDbStats = filesDbRaw === null
        ? null
        : {
            dbName: getFilesDbName(),
            totalCount: filesDbRaw.totalCount,
            totalSizeBytes: filesDbRaw.totalSizeBytes,
            totalSizeFormatted: formatBytes(filesDbRaw.totalSizeBytes),
            byPrefix: filesDbRaw.byPrefix.map(b => ({
              prefix: b.prefix,
              count: b.count,
              sizeBytes: b.sizeBytes,
              sizeFormatted: formatBytes(b.sizeBytes),
            })),
          };

      return {
        status: 'ok',
        lastChecked,
        message: isCloud ? `${activeProvider.toUpperCase()} storage connected (${configSource})` : 'Using local storage',
        objectStorage: {
          status: isCloud ? 'connected' : 'not_configured',
          bucketName: activeBucketName,
          activeProvider,
          configSource,
        },
        attachments: {
          totalCount: parseInt((totalDocuments.rows[0] as any)?.count) || 0,
          totalSizeBytes: totalSize,
          totalSizeFormatted: formatBytes(totalSize),
          byCategory: (documentStats.rows as any[]).map(row => ({
            category: row.category || 'uncategorized',
            count: parseInt(row.count) || 0,
            sizeBytes: parseInt(row.total_size) || 0
          }))
        },
        logos: {
          companyLogosCount: companyLogosCount,
          customerLogosCount: parseInt((customerLogos.rows[0] as any)?.count) || 0
        },
        pathSizes: (() => {
          // Merge per-label totals from two sources:
          //   1. main DB `documents` table (CASE-bucketed gcs_path)
          //   2. files DB `uploaded_files` table (CASE-bucketed object_key)
          // These two sources never overlap (each label maps to either the
          // documents path or the uploaded_files path, never both for a
          // single file) so we can sum bytes + counts by label safely.
          const merged = new Map<string, { label: string; pathPattern: string; totalSizeBytes: number; fileCount: number }>();
          const upsert = (label: string, pathPattern: string, bytes: number, count: number) => {
            const existing = merged.get(label);
            if (existing) {
              existing.totalSizeBytes += bytes;
              existing.fileCount += count;
              if (!existing.pathPattern && pathPattern) existing.pathPattern = pathPattern;
            } else {
              merged.set(label, { label, pathPattern, totalSizeBytes: bytes, fileCount: count });
            }
          };

          // Customer Logos count/size come from customers.logo_size, not
          // documents — special-case it so the entry exists even when no
          // logos have ever been re-uploaded after the docs sweep.
          const logoBytes = parseInt((customerLogos.rows[0] as any)?.total_logo_size) || 0;
          const logoCount = parseInt((customerLogos.rows[0] as any)?.count) || 0;
          upsert('Customer Logos', 'accounts/{accountId}/logo/{filename}', logoBytes, logoCount);

          for (const row of pathStats.rows as any[]) {
            if (row.label === 'Customer Logos') continue; // handled above
            const bytes = parseInt(row.total_size) || 0;
            const count = parseInt(row.count ?? '0') || 0;
            upsert(row.label, row.path_pattern || '', bytes, count);
          }

          for (const row of filesDbPathSizes) {
            upsert(row.label, row.pathPattern, row.totalSizeBytes, row.count);
          }

          return Array.from(merged.values()).map(e => ({
            label: e.label,
            pathPattern: e.pathPattern,
            totalSizeBytes: e.totalSizeBytes,
            totalSizeFormatted: formatBytes(e.totalSizeBytes),
            fileCount: e.fileCount,
          }));
        })(),
        filesDbStats,
      };
    } catch (error) {
      console.error('Storage health check error:', error);
      return {
        status: 'error',
        lastChecked,
        message: 'Failed to check storage health',
        objectStorage: {
          status: 'disconnected',
          bucketName: null
        },
        attachments: {
          totalCount: 0,
          totalSizeBytes: 0,
          totalSizeFormatted: '0 B',
          byCategory: []
        },
        logos: {
          companyLogosCount: 0,
          customerLogosCount: 0
        },
        pathSizes: [],
        filesDbStats: null,
      };
    }
  }

  async getPerformanceHealth(): Promise<PerformanceHealthResult> {
    const lastChecked = new Date().toISOString();

    try {
      const memUsage = process.memoryUsage();
      const uptimeSeconds = process.uptime();

      // --- Connection pool stats (always available) ---
      const connectionPool = {
        totalConnections: pool?.totalCount ?? 0,
        idleConnections: pool?.idleCount ?? 0,
        waitingRequests: pool?.waitingCount ?? 0,
        maxConnections: dbPoolMax,
      };

      // --- Cache hit ratio from pg_stat_database (built-in, no extension needed) ---
      let cacheHitRatio = 0;
      try {
        const cacheResult = await db.execute(sql`
          SELECT
            CASE WHEN (blks_hit + blks_read) > 0
              THEN ROUND(100.0 * blks_hit / (blks_hit + blks_read), 1)::float
              ELSE 0
            END AS cache_hit_ratio
          FROM pg_stat_database
          WHERE datname = current_database()
        `);
        cacheHitRatio = parseFloat((cacheResult.rows[0] as any)?.cache_hit_ratio ?? '0') || 0;
      } catch {
        // pg_stat_database unavailable (e.g. Neon serverless cold start) — leave as 0
      }

      // --- Query stats via pg_stat_statements (optional extension, graceful fallback) ---
      let avgQueryTimeMs = 0;
      let slowQueries24h = 0;
      let statsSource: 'pg_stat_statements' | 'limited' = 'limited';
      try {
        const stmtResult = await db.execute(sql`
          SELECT
            COALESCE(ROUND(AVG(mean_exec_time)::numeric, 2), 0)::float AS avg_query_ms,
            COALESCE(SUM(CASE WHEN mean_exec_time > 500 THEN 1 ELSE 0 END), 0)::int AS slow_queries
          FROM pg_stat_statements
          WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
            AND calls > 0
        `);
        const row = stmtResult.rows[0] as any;
        if (row) {
          avgQueryTimeMs = parseFloat(row.avg_query_ms) || 0;
          slowQueries24h = parseInt(row.slow_queries) || 0;
          statsSource = 'pg_stat_statements';
        }
      } catch {
        // pg_stat_statements not installed — fall back to limited stats
      }

      return {
        status: 'ok',
        lastChecked,
        message: 'Performance metrics collected',
        apiMetrics: getApiMetrics(),
        databasePerformance: {
          slowQueries24h,
          avgQueryTimeMs,
          cacheHitRatio,
          statsSource,
        },
        connectionPool,
        memoryUsage: {
          heapUsedMB: Math.round(memUsage.heapUsed / (1024 * 1024)),
          heapTotalMB: Math.round(memUsage.heapTotal / (1024 * 1024)),
          externalMB: Math.round(memUsage.external / (1024 * 1024)),
          rssMemoryMB: Math.round(memUsage.rss / (1024 * 1024))
        },
        uptime: {
          uptimeSeconds: Math.round(uptimeSeconds),
          uptimeFormatted: formatUptime(uptimeSeconds)
        }
      };
    } catch (error) {
      console.error('Performance health check error:', error);
      return {
        status: 'error',
        lastChecked,
        message: 'Failed to check performance health',
        apiMetrics: {
          averageResponseTimeMs: 0,
          slowQueriesCount: 0,
          requestsPerMinute: 0
        },
        databasePerformance: {
          slowQueries24h: 0,
          avgQueryTimeMs: 0,
          cacheHitRatio: 0,
          statsSource: 'limited',
        },
        connectionPool: {
          totalConnections: 0,
          idleConnections: 0,
          waitingRequests: 0,
          maxConnections: dbPoolMax,
        },
        memoryUsage: {
          heapUsedMB: 0,
          heapTotalMB: 0,
          externalMB: 0,
          rssMemoryMB: 0
        },
        uptime: {
          uptimeSeconds: 0,
          uptimeFormatted: 'unknown'
        }
      };
    }
  }

  async getArchiveSchemaValidation(): Promise<ArchiveSchemaValidationResult> {
    const lastChecked = new Date().toISOString();

    try {
      const tablePairs = [
        { name: 'users', sourceTable: 'users', archiveTable: 'archived_users' },
        { name: 'projects', sourceTable: 'projects', archiveTable: 'archived_projects' },
        { name: 'customers', sourceTable: 'customers', archiveTable: 'archived_customers' }
      ];

      const getTableColumns = async (tableName: string): Promise<string[]> => {
        const result = await db.execute(sql`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = ${tableName}
          ORDER BY ordinal_position
        `);
        return (result.rows as any[]).map(row => row.column_name);
      };

      const archiveMetadataColumns = ['archived_at', 'archived_by', 'archived_reason'];

      const results = await Promise.all(tablePairs.map(async (pair) => {
        const sourceColumns = await getTableColumns(pair.sourceTable);
        const archiveColumns = await getTableColumns(pair.archiveTable);

        const sourceColumnsWithoutArchiveMetadata = sourceColumns.filter(
          col => !archiveMetadataColumns.includes(col)
        );
        const archiveColumnsWithoutArchiveMetadata = archiveColumns.filter(
          col => !archiveMetadataColumns.includes(col)
        );

        const missingInArchive = sourceColumnsWithoutArchiveMetadata.filter(
          col => !archiveColumnsWithoutArchiveMetadata.includes(col)
        );

        const extraInArchive = archiveColumnsWithoutArchiveMetadata.filter(
          col => !sourceColumnsWithoutArchiveMetadata.includes(col)
        );

        const status: 'ok' | 'warning' = missingInArchive.length > 0 ? 'warning' : 'ok';
        const message = missingInArchive.length > 0
          ? `${missingInArchive.length} column(s) in source table not captured in archive table`
          : 'All source columns are captured in archive table';

        return {
          tableName: pair.name,
          sourceTable: pair.sourceTable,
          archiveTable: pair.archiveTable,
          sourceColumnCount: sourceColumnsWithoutArchiveMetadata.length,
          archiveColumnCount: archiveColumnsWithoutArchiveMetadata.length,
          status,
          missingColumns: missingInArchive,
          extraColumns: extraInArchive,
          message
        };
      }));

      const tablesWithIssues = results.filter(r => r.status !== 'ok').length;
      const totalMissingColumns = results.reduce((sum, r) => sum + r.missingColumns.length, 0);

      return {
        status: tablesWithIssues > 0 ? 'warning' : 'ok',
        lastChecked,
        results,
        summary: {
          totalTables: results.length,
          tablesOk: results.filter(r => r.status === 'ok').length,
          tablesWithIssues,
          totalMissingColumns
        }
      };
    } catch (error) {
      console.error('Archive schema validation error:', error);
      return {
        status: 'error',
        lastChecked,
        message: 'Failed to validate archive schemas',
        results: [],
        summary: {
          totalTables: 0,
          tablesOk: 0,
          tablesWithIssues: 0,
          totalMissingColumns: 0
        }
      };
    }
  }

  /**
   * Count of `support_requests` rows tagged `type='feature'`. Status:
   *  - `ok`      when 0
   *  - `warning` when > 0 (non-blocking but indicates pending triage)
   *  - `error`   only if the query itself fails (DB outage)
   */
  async getFeatureRequestsHealth(): Promise<FeatureRequestsHealthResult> {
    const lastChecked = new Date().toISOString();
    try {
      const [row] = await db
        .select({ count: count() })
        .from(supportRequests)
        .where(eq(supportRequests.type, 'feature'));
      const totalCount = Number(row?.count ?? 0);
      return {
        status: totalCount > 0 ? 'warning' : 'ok',
        lastChecked,
        message:
          totalCount > 0
            ? `${totalCount} feature request${totalCount === 1 ? '' : 's'} on file`
            : 'No feature requests on file',
        totalCount,
      };
    } catch (error) {
      console.error('Feature requests health check error:', error);
      return {
        status: 'error',
        lastChecked,
        message: 'Failed to check feature requests',
        totalCount: 0,
      };
    }
  }

  /**
   * Count of `support_requests` rows tagged `type='issue'`. Status:
   *  - `ok`    when 0
   *  - `error` when > 0 (customer-impacting issues should never sit silently)
   *  - `error` if the query itself fails
   */
  async getSupportRequestsHealth(): Promise<SupportRequestsHealthResult> {
    const lastChecked = new Date().toISOString();
    try {
      const [row] = await db
        .select({ count: count() })
        .from(supportRequests)
        .where(eq(supportRequests.type, 'issue'));
      const totalCount = Number(row?.count ?? 0);
      return {
        status: totalCount > 0 ? 'error' : 'ok',
        lastChecked,
        message:
          totalCount > 0
            ? `${totalCount} support request${totalCount === 1 ? '' : 's'} on file`
            : 'No open support requests',
        totalCount,
      };
    } catch (error) {
      console.error('Support requests health check error:', error);
      return {
        status: 'error',
        lastChecked,
        message: 'Failed to check support requests',
        totalCount: 0,
      };
    }
  }

  /**
   * Count of `client_error_logs` rows (every captured browser-side
   * error since the last admin "Clear All"). Status:
   *  - `ok`    when 0
   *  - `error` when > 0 — any captured error is a bug that reached a user
   *  - `error` if the query itself fails
   */
  async getClientErrorsHealth(): Promise<ClientErrorsHealthResult> {
    const lastChecked = new Date().toISOString();
    try {
      const [row] = await db
        .select({ count: count() })
        .from(clientErrorLogs);
      const totalCount = Number(row?.count ?? 0);
      return {
        status: totalCount > 0 ? 'error' : 'ok',
        lastChecked,
        message:
          totalCount > 0
            ? `${totalCount} captured client-side error${totalCount === 1 ? '' : 's'}`
            : 'No captured client-side errors',
        totalCount,
      };
    } catch (error) {
      console.error('Client errors health check error:', error);
      return {
        status: 'error',
        lastChecked,
        message: 'Failed to check client error logs',
        totalCount: 0,
      };
    }
  }

  async getFullHealthReport() {
    const [
      database,
      email,
      integrations,
      security,
      backgroundServices,
      storage,
      performance,
      archiveSchemaValidation,
      featureRequests,
      supportRequests,
      clientErrors,
    ] = await Promise.all([
      this.getDatabaseHealth(),
      this.getEmailHealth(),
      this.getIntegrationHealth(),
      this.getSecurityHealth(),
      this.getBackgroundServicesHealth(),
      this.getStorageHealth(),
      this.getPerformanceHealth(),
      this.getArchiveSchemaValidation(),
      this.getFeatureRequestsHealth(),
      this.getSupportRequestsHealth(),
      this.getClientErrorsHealth(),
    ]);

    const statuses = [
      database,
      email,
      integrations,
      security,
      backgroundServices,
      storage,
      performance,
      archiveSchemaValidation,
      featureRequests,
      supportRequests,
      clientErrors,
    ];
    const hasError = statuses.some(s => s.status === 'error');
    const hasWarning = statuses.some(s => s.status === 'warning');

    return {
      overallStatus: hasError ? 'error' : hasWarning ? 'warning' : 'ok',
      lastChecked: new Date().toISOString(),
      database,
      email,
      integrations,
      security,
      backgroundServices,
      storage,
      performance,
      archiveSchemaValidation,
      featureRequests,
      supportRequests,
      clientErrors,
    };
  }
}

export const healthMonitor = new HealthMonitor();
