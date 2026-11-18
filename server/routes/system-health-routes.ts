// System Health routes (Phase 8 extraction #18).
//
// 11 admin handlers exposing the operational dashboards used by ops
// and the pre-deploy audit panel:
//
//   GET   /api/system/health                              (overall + envVars folded in)
//   GET   /api/system/health/database
//   GET   /api/system/health/email
//   GET   /api/system/health/integrations
//   GET   /api/system/health/security
//   GET   /api/system/health/services
//   POST  /api/system/health/services/sessions-cleanup/run
//   GET   /api/system/health/storage
//   GET   /api/system/health/performance
//   GET   /api/system/health/archive-validation
//
// All real work routes through the healthMonitor + withEnvVars +
// withOverviewCounts helpers. Mechanical sed extraction.
//
// Every GET needs view access to Monitoring & Audit (Admin always has it).
// They used to answer any signed-in user, outside users included.
import type { Express } from "express";
import { isAuthenticated } from "../auth/simpleAuth";
import { requireSectionView } from "../lib/section-permissions";
import { healthMonitor } from "../services/health-monitor";
import { withEnvVars, withOverviewCounts } from "../lib/system-health-env-rollup";
import { getBootstrapSnapshot } from "../lib/app-config";
import { runManualAuditLoginsPrune } from "../services/audit-logins-cleanup";
import { storage } from "../storage";
import { probeEmailSender } from "../email/email-sender";

const SYSTEM_HEALTH_SECTION = "config.system-health";

export function registerSystemHealthRoutes(app: Express) {
  // GET /api/system/health - Full system health report
  //
  // For Admin callers we additionally fold in the env-var status snapshot
  // from `getBootstrapSnapshot()` (the same source the post-setup audit
  // panel reads from). This adds an `envVars` block to the response and
  // re-derives `overallStatus` so any consumer of `/api/system/health` —
  // uptime probes, status pages, future CLI checks, or the React
  // dashboard — sees a missing or file-only secret reflected in the
  // overall status without needing a second admin-only round-trip.
  // Non-admin callers keep the pre-Task-#350 shape (no env data leakage)
  // because the snapshot is admin-gated everywhere else (Task #342).
  //
  // Both responses also carry an `overviewCounts: { healthy, warning,
  // error }` block (Task #352) so the dashboard's three big tiles can
  // simply render what the server reports rather than re-implementing
  // the precedence rules client-side. For admins the counts include a
  // SINGLE entry for the env-var block — graded by the same
  // `envVars.status` that colours the one "Environment Variables" tile
  // in the grid — so the headline numbers always equal the count of
  // tiles with each border colour (Task #354). For non-admins it's just
  // the eight categories.
  app.get('/api/system/health', isAuthenticated, requireSectionView(SYSTEM_HEALTH_SECTION), async (req: any, res) => {
    try {
      const report = await healthMonitor.getFullHealthReport();
      const role = req.session?.user?.role;
      if (role === 'Admin') {
        const snap = getBootstrapSnapshot();
        // Task #741: probe `data/` writability on every admin health
        // hit. The probe is cheap (single touch-file) and surfaces
        // missing/read-only volume mounts before the operator clicks
        // any of the promote/regenerate/unmanage actions, all of which
        // would otherwise silently fail at the last `fs.writeFile`
        // step. Non-admins skip the probe — same gate as the rest of
        // the env-var data on this endpoint (Task #342).
        const { checkDataDirWritable } = await import('../lib/data-dir-health');
        const dataDirProbe = checkDataDirWritable();
        return res.json(withEnvVars(report, snap, dataDirProbe));
      }
      res.json(withOverviewCounts(report));
    } catch (error: any) {
      console.error("Error checking system health:", error);
      res.status(500).json({ message: "Failed to check system health" });
    }
  });

  // GET /api/system/health/database - Database health check
  app.get('/api/system/health/database', isAuthenticated, requireSectionView(SYSTEM_HEALTH_SECTION), async (req: any, res) => {
    try {
      const health = await healthMonitor.getDatabaseHealth();
      res.json(health);
    } catch (error: any) {
      console.error("Error checking database health:", error);
      res.status(500).json({ message: "Failed to check database health" });
    }
  });

  // GET /api/system/health/email - Email system health check
  app.get('/api/system/health/email', isAuthenticated, requireSectionView(SYSTEM_HEALTH_SECTION), async (req: any, res) => {
    try {
      const health = await healthMonitor.getEmailHealth();
      res.json(health);
    } catch (error: any) {
      console.error("Error checking email health:", error);
      res.status(500).json({ message: "Failed to check email health" });
    }
  });

  // POST /api/system/health/email/probe
  // On-demand transport connectivity check — does NOT send any email.
  //
  // SMTP:  Opens a TCP connection to the configured host:port, performs the
  //        SMTP greeting + credential exchange via nodemailer.verify(), then
  //        closes. Proves the server is reachable and the credentials work.
  //
  // Graph: Acquires a Microsoft Graph OAuth2 access token using the stored
  //        credentials (client secret or certificate). Proves the Entra app
  //        registration, tenant, client ID, and credential are valid.
  //
  // Admin-only. Returns { success, message, latencyMs, authType }.
  app.post('/api/system/health/email/probe', isAuthenticated, async (req: any, res) => {
    if (req.session.user?.role !== 'Admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    try {
      const config = await storage.getEmailConfiguration();
      if (!config) {
        return res.json({
          success: false,
          message: 'Email is not configured. Visit Configuration → System Settings → Email Configuration to set it up.',
          latencyMs: 0,
          authType: 'smtp',
        });
      }
      if (!config.enabled) {
        return res.json({
          success: false,
          message: 'Email sending is disabled in the current configuration.',
          latencyMs: 0,
          authType: config.authType ?? 'smtp',
        });
      }
      const result = await probeEmailSender(config);
      res.json({ ...result, authType: config.authType ?? 'smtp' });
    } catch (error: any) {
      console.error('[email-probe] Unexpected error:', error);
      res.status(500).json({
        success: false,
        message: `Probe failed: ${error.message ?? 'unknown error'}`,
        latencyMs: 0,
        authType: 'smtp',
      });
    }
  });

  // GET /api/system/health/integrations - Integration health check
  app.get('/api/system/health/integrations', isAuthenticated, requireSectionView(SYSTEM_HEALTH_SECTION), async (req: any, res) => {
    try {
      const health = await healthMonitor.getIntegrationHealth();
      res.json(health);
    } catch (error: any) {
      console.error("Error checking integration health:", error);
      res.status(500).json({ message: "Failed to check integration health" });
    }
  });

  // GET /api/system/health/security - Security metrics health check
  app.get('/api/system/health/security', isAuthenticated, requireSectionView(SYSTEM_HEALTH_SECTION), async (req: any, res) => {
    try {
      const health = await healthMonitor.getSecurityHealth();
      res.json(health);
    } catch (error: any) {
      console.error("Error checking security health:", error);
      res.status(500).json({ message: "Failed to check security health" });
    }
  });

  // GET /api/system/health/services - Background services health check
  app.get('/api/system/health/services', isAuthenticated, requireSectionView(SYSTEM_HEALTH_SECTION), async (req: any, res) => {
    try {
      const health = await healthMonitor.getBackgroundServicesHealth();
      res.json(health);
    } catch (error: any) {
      console.error("Error checking background services health:", error);
      res.status(500).json({ message: "Failed to check background services health" });
    }
  });

  // POST /api/system/health/services/sessions-cleanup/run
  // Admin-only "Run now" for the daily expired-sessions prune
  // (Task #752). Runs the same SQL as the scheduled tick and
  // refreshes the snapshot, but does not touch the scheduler.
  app.post('/api/system/health/services/sessions-cleanup/run', isAuthenticated, async (req: any, res) => {
    const userRole = req.session?.user?.role;
    if (userRole !== 'Admin') {
      return res.status(403).json({ message: "Only admins can trigger the expired-sessions prune" });
    }
    try {
      const { runManualPrune, getLastPruneSnapshot } = await import('../services/expired-sessions-cleanup');
      const { rowsPruned, durationMs } = await runManualPrune();
      res.json({
        rowsPruned,
        durationMs,
        snapshot: getLastPruneSnapshot(),
      });
    } catch (error: any) {
      console.error("Manual expired-sessions prune failed:", error);
      res.status(500).json({
        message: "Failed to prune expired sessions",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // GET /api/system/health/storage - Storage health check
  app.get('/api/system/health/storage', isAuthenticated, requireSectionView(SYSTEM_HEALTH_SECTION), async (req: any, res) => {
    try {
      const health = await healthMonitor.getStorageHealth();
      res.json(health);
    } catch (error: any) {
      console.error("Error checking storage health:", error);
      res.status(500).json({ message: "Failed to check storage health" });
    }
  });

  // GET /api/system/health/performance - Performance metrics health check
  app.get('/api/system/health/performance', isAuthenticated, requireSectionView(SYSTEM_HEALTH_SECTION), async (req: any, res) => {
    try {
      const health = await healthMonitor.getPerformanceHealth();
      res.json(health);
    } catch (error: any) {
      console.error("Error checking performance health:", error);
      res.status(500).json({ message: "Failed to check performance health" });
    }
  });

  // GET /api/system/health/archive-validation - Archive schema validation
  app.get('/api/system/health/archive-validation', isAuthenticated, requireSectionView(SYSTEM_HEALTH_SECTION), async (req: any, res) => {
    try {
      const health = await healthMonitor.getArchiveSchemaValidation();
      res.json(health);
    } catch (error: any) {
      console.error("Error checking archive validation:", error);
      res.status(500).json({ message: "Failed to check archive schema validation" });
    }
  });

  // GET /api/system/health/feature-requests - count of support_requests where type='feature'.
  // Sibling per-category endpoint mirroring the other 8 above. The
  // combined /api/system/health response already includes the same
  // result; this exists for future detail views that want to refresh
  // a single card without re-fetching the whole report.
  app.get('/api/system/health/feature-requests', isAuthenticated, requireSectionView(SYSTEM_HEALTH_SECTION), async (req: any, res) => {
    try {
      const health = await healthMonitor.getFeatureRequestsHealth();
      res.json(health);
    } catch (error: any) {
      console.error("Error checking feature requests health:", error);
      res.status(500).json({ message: "Failed to check feature requests health" });
    }
  });

  // GET /api/system/health/support-requests - count of support_requests where type='issue'.
  app.get('/api/system/health/support-requests', isAuthenticated, requireSectionView(SYSTEM_HEALTH_SECTION), async (req: any, res) => {
    try {
      const health = await healthMonitor.getSupportRequestsHealth();
      res.json(health);
    } catch (error: any) {
      console.error("Error checking support requests health:", error);
      res.status(500).json({ message: "Failed to check support requests health" });
    }
  });

  // GET /api/system/health/client-errors - count of client_error_logs rows.
  app.get('/api/system/health/client-errors', isAuthenticated, requireSectionView(SYSTEM_HEALTH_SECTION), async (req: any, res) => {
    try {
      const health = await healthMonitor.getClientErrorsHealth();
      res.json(health);
    } catch (error: any) {
      console.error("Error checking client errors health:", error);
      res.status(500).json({ message: "Failed to check client errors health" });
    }
  });
}
