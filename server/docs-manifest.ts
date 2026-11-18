/**
 * Single source of truth for the in-app About page documentation viewer
 * (the routes registered in `server/routes.ts` that serve documentation
 * to `client/src/pages/about.tsx`).
 *
 * Why this file exists
 * --------------------
 * Historically, those routes read markdown straight from the `docs/`
 * directory on disk via `fs.readFileSync(path.join(process.cwd(),
 * 'docs/...'))`. That works in development because the workspace
 * is the running process, but it silently 404s in any published
 * Docker image: the runtime stage of `Dockerfile` intentionally does
 * not `COPY docs/` (and `scripts/verify-no-internal-docs.sh` actively
 * blocks the docs/ tree from leaking into the image — task #474).
 *
 * The fix (task #476) is to bundle the small set of customer-facing
 * docs into the build output at build time and have the runtime serve
 * them from there:
 *
 *   1. This manifest lists every doc the runtime actually serves and
 *      the URL(s) it serves them under.
 *   2. `scripts/bundle-runtime-docs.ts` reads this manifest at build
 *      time, slurps each source markdown file, and writes a single
 *      `dist/runtime-docs.json` of `{ source -> markdown }`. That JSON
 *      ships in the runtime image (it's part of `dist/`).
 *   3. `server/routes.ts` registers routes by iterating this manifest
 *      and resolves content from the bundled JSON at runtime. In
 *      development (no bundle on disk) it falls back to reading the
 *      live repo, so editing a doc file still hot-reflects without a
 *      rebuild.
 *
 * Adding / changing a doc
 * -----------------------
 * Add or modify an entry below. The build script will fail loudly if
 * a referenced source file does not exist. No other place needs to be
 * touched — the route registrations in `server/routes.ts` and the
 * runtime lookups all derive from this list.
 */

export interface DocsManifestHtmlRoute {
  /** Express path, e.g. "/docs/project_overview". */
  path: string;
  /** Page <title> shown in the rendered HTML wrapper. */
  title: string;
}

export interface DocsManifestEntry {
  /** Path relative to the repo root, e.g. "docs/architecture/project-overview.md". */
  source: string;
  /** API routes that should serve the raw markdown for this entry (text/plain). */
  apiRoutes?: string[];
  /**
   * HTML routes that should serve a rendered HTML page wrapping the
   * markdown for this entry. These are the legacy `/docs/<slug>` URLs
   * (NOT the React About-page consumers, which hit `/api/docs/...`).
   */
  htmlRoutes?: DocsManifestHtmlRoute[];
}

export const docsManifest: DocsManifestEntry[] = [
  // ── Project & Architecture ─────────────────────────────────────────
  {
    source: "docs/architecture/project-overview.md",
    apiRoutes: ["/api/docs/project_overview"],
    htmlRoutes: [{ path: "/docs/project_overview", title: "Project Overview" }],
  },
  {
    source: "docs/architecture/design-document.md",
    apiRoutes: ["/api/docs/design_document"],
    htmlRoutes: [{ path: "/docs/design_document", title: "Design Document" }],
  },
  {
    source: "docs/architecture/workflow-diagram.md",
    apiRoutes: ["/api/docs/workflow_diagram"],
    htmlRoutes: [{ path: "/docs/workflow_diagram", title: "Workflow Diagrams" }],
  },
  {
    source: "PROJECT_REFERENCE.md",
    apiRoutes: ["/api/docs/technical-architecture"],
    htmlRoutes: [{ path: "/docs/technical-architecture", title: "Technical Architecture" }],
  },
  {
    source: "docs/architecture/database-connection-architecture.md",
    apiRoutes: ["/api/docs/database-connection-architecture"],
  },
  {
    source: "docs/architecture/navigation-sitemap.md",
    apiRoutes: ["/api/docs/navigation-sitemap"],
  },
  {
    source: "docs/architecture/application-startup-routing.md",
    apiRoutes: ["/api/docs/application-startup-routing"],
  },

  // ── Guides ─────────────────────────────────────────────────────────
  {
    source: "docs/guides/deployment.md",
    apiRoutes: ["/api/docs/deployment"],
    htmlRoutes: [{ path: "/docs/deployment", title: "Deployment Guide" }],
  },
  {
    source: "docs/guides/self-hosting.md",
    apiRoutes: ["/api/docs/self-hosting"],
    htmlRoutes: [{ path: "/docs/self-hosting", title: "Self-Hosting Guide" }],
  },
  {
    source: "docs/guides/language-translation.md",
    apiRoutes: ["/api/docs/language_translation"],
    htmlRoutes: [
      { path: "/docs/language_translation", title: "Language Translation" },
    ],
  },
  {
    source: "docs/guides/performance-monitoring-guide.md",
    apiRoutes: ["/api/docs/performance-monitoring-guide"],
    htmlRoutes: [
      {
        path: "/docs/performance_monitoring_guide",
        title: "Performance Monitoring Guide",
      },
    ],
  },
  {
    source: "docs/guides/websocket-stability-guide.md",
    apiRoutes: ["/api/docs/websocket-stability-guide"],
    htmlRoutes: [
      {
        path: "/docs/websocket_stability_guide",
        title: "WebSocket Stability Guide",
      },
    ],
  },
  {
    source: "docs/guides/memory-management-guide.md",
    apiRoutes: ["/api/docs/memory-management-guide"],
    htmlRoutes: [
      {
        path: "/docs/memory_management_guide",
        title: "Memory Management Guide",
      },
    ],
  },
  {
    source: "docs/guides/sorting-docs.md",
    apiRoutes: ["/api/docs/sorting_docs"],
    htmlRoutes: [{ path: "/docs/sorting_docs", title: "Sorting Documentation" }],
  },
  {
    source: "docs/guides/error-handling-debug-guide.md",
    apiRoutes: ["/api/docs/error_handling_debug"],
    htmlRoutes: [
      {
        path: "/docs/error_handling_debug",
        title: "Error Handling & Debug Guide",
      },
    ],
  },
  {
    source: "docs/guides/csv-import-guide.md",
    apiRoutes: ["/api/docs/csv-import-guide"],
  },
  {
    source: "docs/features/backup-restore.md",
    apiRoutes: ["/api/docs/backup-restore"],
  },
  {
    source: "docs/guides/mfa-system.md",
    apiRoutes: ["/api/docs/mfa_system_documentation"],
  },
  {
    source: "docs/guides/okta-setup.md",
    apiRoutes: ["/api/docs/okta-setup"],
    htmlRoutes: [{ path: "/docs/okta-setup", title: "Okta SSO Setup Guide" }],
  },
  {
    source: "docs/features/single-sign-on.md",
    apiRoutes: ["/api/docs/single-sign-on"],
    htmlRoutes: [{ path: "/docs/single-sign-on", title: "Single Sign-On (Okta SSO and Azure SSO)" }],
  },
  {
    source: "docs/guides/azure-sso-setup.md",
    apiRoutes: ["/api/docs/azure-sso-setup"],
    htmlRoutes: [{ path: "/docs/azure-sso-setup", title: "Azure SSO Setup Guide" }],
  },
  {
    source: "docs/features/mcp-server.md",
    apiRoutes: ["/api/docs/mcp-server"],
    htmlRoutes: [{ path: "/docs/mcp-server", title: "MCP Server" }],
  },
  {
    source: "docs/guides/api-reference.md",
    apiRoutes: ["/api/docs/api-reference"],
  },
  {
    source: "docs/guides/version-update-guide.md",
    apiRoutes: ["/api/docs/version-update-guide"],
  },
  {
    source: "docs/guides/modern-card-styling-system.md",
    apiRoutes: ["/api/docs/modern-card-styling-system"],
  },

  // ── Features ───────────────────────────────────────────────────────
  {
    source: "docs/features/report-builder.md",
    apiRoutes: ["/api/docs/report-builder"],
    htmlRoutes: [{ path: "/docs/report-builder", title: "Report Builder" }],
  },
  {
    source: "docs/features/system-health-dashboard.md",
    apiRoutes: ["/api/docs/system-health-dashboard"],
    htmlRoutes: [
      { path: "/docs/system-health-dashboard", title: "System Health Dashboard" },
    ],
  },
  {
    source: "docs/features/encryption-key-rotation.md",
    apiRoutes: ["/api/docs/encryption-key-rotation"],
    htmlRoutes: [
      { path: "/docs/encryption-key-rotation", title: "Encryption Key Rotation" },
    ],
  },
  {
    source: "docs/features/first-run-setup.md",
    apiRoutes: ["/api/docs/first-run-setup"],
    htmlRoutes: [
      {
        path: "/docs/first-run-setup",
        title: "First-Run Setup & Bootstrap",
      },
    ],
  },
  {
    source: "docs/features/tiptap-editor-system.md",
    apiRoutes: ["/api/docs/tiptap-editor-system"],
    htmlRoutes: [
      {
        path: "/docs/tiptap-editor-system",
        title: "Tiptap Editor System Documentation",
      },
    ],
  },
  {
    source: "docs/features/icon-picker-system.md",
    apiRoutes: ["/api/docs/icon-picker-system"],
  },
  {
    source: "docs/features/toast-notification-system.md",
    apiRoutes: ["/api/docs/toast-notification-system"],
  },
  {
    source: "docs/features/color-picker-system.md",
    apiRoutes: ["/api/docs/color-picker-system"],
  },
  {
    source: "docs/features/database-connection-manager.md",
    apiRoutes: ["/api/docs/database-connection-manager"],
  },
  {
    source: "docs/features/workflow-automation-triggers.md",
    // Legacy `/api/docs/email-automation-triggers` alias kept for
    // backward compatibility with bookmarks / external references.
    apiRoutes: [
      "/api/docs/workflow-automation-triggers",
      "/api/docs/email-automation-triggers",
    ],
  },
  {
    source: "docs/features/workflow-automation-system.md",
    // Legacy alias as above.
    apiRoutes: [
      "/api/docs/workflow-automation-system",
      "/api/docs/email-automation-system",
    ],
  },
  {
    source: "docs/features/map-system-architecture.md",
    apiRoutes: ["/api/docs/map-system-architecture"],
  },
  {
    source: "docs/features/email-triggers-reference.md",
    apiRoutes: ["/api/docs/email-triggers-reference"],
  },
  {
    source: "docs/features/webhook-reference.md",
    apiRoutes: ["/api/docs/webhook-reference"],
  },
  {
    source: "docs/features/salesforce-system.md",
    apiRoutes: ["/api/docs/salesforce-system"],
  },
  {
    source: "docs/features/n8n-integration.md",
    apiRoutes: ["/api/docs/n8n-integration"],
  },
  {
    source: "docs/features/global-search-system.md",
    apiRoutes: ["/api/docs/global-search-system"],
  },
  {
    source: "docs/features/system-announcements.md",
    apiRoutes: ["/api/docs/system-announcements"],
  },
  {
    source: "docs/features/metric-history-system.md",
    apiRoutes: ["/api/docs/metric-history-system"],
  },
  {
    source: "docs/features/flight-deck.md",
    apiRoutes: ["/api/docs/flight-deck"],
  },
  {
    source: "docs/features/gap-analysis-system.md",
    apiRoutes: ["/api/docs/gap-analysis-system"],
  },
  {
    source: "docs/features/outcome-intelligence-system.md",
    apiRoutes: ["/api/docs/outcome-intelligence-system"],
  },
  {
    source: "docs/features/account-user-management.md",
    apiRoutes: ["/api/docs/account-user-management"],
  },
  {
    source: "docs/features/archive-management-system.md",
    apiRoutes: ["/api/docs/archive-management-system"],
  },
  {
    source: "docs/features/ai-assessment-system.md",
    apiRoutes: ["/api/docs/ai-assessment-system"],
  },
  {
    source: "docs/features/file-upload-system.md",
    apiRoutes: ["/api/docs/file-upload-system"],
  },
  {
    source: "docs/features/approved-email-domains.md",
    apiRoutes: ["/api/docs/approved-email-domains"],
    htmlRoutes: [
      { path: "/docs/approved-email-domains", title: "Approved Email Domains" },
    ],
  },
  {
    source: "docs/features/email-graph-sending.md",
    apiRoutes: ["/api/docs/email-graph-sending"],
    htmlRoutes: [
      { path: "/docs/email-graph-sending", title: "Email Sending — SMTP & Microsoft Graph" },
    ],
  },
  {
    source: "docs/guides/entra-app-registration.md",
    apiRoutes: ["/api/docs/entra-app-registration"],
    htmlRoutes: [
      { path: "/docs/entra-app-registration", title: "Entra App Registration Runbook (Graph Email)" },
    ],
  },
  {
    source: "docs/guides/ai-provider-webhook.md",
    apiRoutes: ["/api/docs/ai-provider-webhook"],
    htmlRoutes: [
      { path: "/docs/ai-provider-webhook", title: "Webhook AI Provider — proxy completions through n8n" },
    ],
  },
  {
    source: "docs/features/standard-table-pattern.md",
    apiRoutes: ["/api/docs/standard-table-pattern"],
    htmlRoutes: [
      { path: "/docs/standard-table-pattern", title: "Standard Table Pattern" },
    ],
  },
  {
    source: "docs/guides/storage-mixin-architecture.md",
    apiRoutes: ["/api/docs/storage-mixin-architecture"],
    htmlRoutes: [
      {
        path: "/docs/storage-mixin-architecture",
        title: "Storage Mixin Architecture",
      },
    ],
  },
  {
    source: "docs/guides/secrets-management.md",
    apiRoutes: ["/api/docs/secrets-management"],
    htmlRoutes: [
      { path: "/docs/secrets-management", title: "Secrets Management" },
    ],
  },

  // ── Admin ──────────────────────────────────────────────────────────
  {
    source: "docs/admin/demo-mode.md",
    apiRoutes: ["/api/docs/demo-mode"],
  },

  // ── Developer Guides (additional) ─────────────────────────────────
  {
    source: "docs/plans/backlog.md",
    apiRoutes: ["/api/docs/backlog"],
  },
  {
    source: "docs/guides/adding-a-new-language.md",
    apiRoutes: ["/api/docs/adding-a-new-language"],
  },
  {
    source: "docs/guides/migration-strategy.md",
    apiRoutes: ["/api/docs/migration-strategy"],
  },
  {
    source: "docs/guides/local-dev-setup.md",
    apiRoutes: ["/api/docs/local-dev-setup"],
  },
  {
    source: "docs/guides/dokploy-traefik-timeouts.md",
    apiRoutes: ["/api/docs/dokploy-traefik-timeouts"],
  },
  {
    source: "docs/guides/native-install/README.md",
    apiRoutes: ["/api/docs/native-install"],
  },

  // ── Migrations (lives outside docs/, but served by the same machinery) ──
  {
    source: "migrations/db_refactor/README.md",
    apiRoutes: ["/api/docs/db-schema-refactor"],
  },
];

/** Unique source paths referenced by the manifest, used by the build script. */
export function getDocsManifestSources(): string[] {
  return Array.from(new Set(docsManifest.map((e) => e.source)));
}
