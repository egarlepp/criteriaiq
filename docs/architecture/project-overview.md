# CriteriaIQ - Technical Validation Workspace - Project Overview

### 📌 Overview

**What is this project and why does it matter?**
CriteriaIQ - Technical Validation Workspace is a comprehensive web application designed to streamline technical validation project execution for Solution Engineers. This platform transforms how our teams manage customer technical validations by providing centralized project tracking, real-time collaboration tools, and automated reporting capabilities. The system bridges the gap between internal teams and external customers, ensuring transparency and efficiency throughout the validation lifecycle while reducing manual overhead and improving customer experience.

---

### 🎯 Goals

**What are we trying to achieve?**

* Streamline technical validation project workflows and eliminate manual tracking inefficiencies
* Provide real-time visibility and collaboration between internal teams and external customers
* Implement comprehensive analytics and reporting to improve validation success rates and identify bottlenecks
* Create a scalable platform that supports role-based access control and security for sensitive customer data

---

### ✅ Expected Outcomes

**What success looks like**

* Reduced validation project setup time by 60% through automated workflows and template systems
* Improved customer satisfaction scores through transparent progress tracking and dedicated customer portals
* Enhanced cross-team collaboration with real-time updates, activity logging, and centralized communication
* Data-driven insights through comprehensive analytics, custom reporting, and performance metrics
* Scalable role-based security ensuring proper access control across different user types and organizations

---

### 🤝 Who This Helps

**Stakeholders / Impacted Teams**

* **Solution Engineering** - Primary users managing validation projects with enhanced tools and automation
* **Sales** - Access to real-time project status and customer engagement metrics for better pipeline and forecast management
* **Customer Success** - Visibility into validation outcomes and customer experience metrics
* **Product Management** - Visibility into product gap, competitive intel, and outcome intelligence. Analytics on validation patterns and success criteria to inform product roadmap
* **ProServe** - Improve customer handoffs, improve and align SOW delivery
* **Support** - Improve insights into Technical Validation Projects while providing troubleshooting context.
* **Partners** - Dedicated portal access for collaborative validation projects. Improving collaborative project intel and strategy
* **Customers** - Transparent view of validation progress through a dedicated customer portal

---

### 📍 Status

**Current Stage:** Live (v0.12.0) - Enterprise Environment <!-- @managed-version: written by ./update-version.sh from version.json -->
**Last Updated:** 06/04/2026
**Next Review Date:** 07/04/2026

---

### 🧩 Key Milestones

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1: Core Platform | ✅ Completed | User authentication, project management, customer portal |
| Phase 2: Email Integration | ✅ Completed | Email template system, automated notifications, PDF attachments |  
| Phase 3: AI Risk Analysis | ✅ Completed | OpenAI-powered risk prediction, configurable criteria, visual indicators |
| Phase 4: Documentation System | ✅ Completed | Technical documentation with Markdown rendering, syntax highlighting |
| Phase 5: Analytics & Reporting | ✅ Completed | Custom report builder, KPI dashboard, data filtering |
| Phase 6: User Management | ✅ Completed | Role-based access control, permissions system, user approvals |
| Phase 7: Enterprise Migration | ✅ Completed | Migration from personal to Enterprise Azure environment |
| Current: Maintenance & Enhancement | 🔄 In Progress | Performance optimization, UI/UX improvements, feature refinements |

### 🎖️ Recent Achievements (v0.12.0) <!-- @managed-version: written by ./update-version.sh from version.json -->

**Microsoft Graph Email, Documentation Overhaul & Observability (v0.7.50)**

**🔒 Security Changes**
* **Microsoft Graph email transport:** Email Configuration can send via the Microsoft Graph `sendMail` API with app-only OAuth (no mailbox password) — client secret or certificate, both AES-256-GCM encrypted and in the ENCRYPTION_KEY rotation manifest. The secure replacement for SMTP Basic Auth on Microsoft 365. Includes an in-app Entra setup runbook and the least-privilege Application Access Policy guidance. See `docs/features/email-graph-sending.md` and `docs/guides/entra-app-registration.md`.

**🆕 New Features**
* **Documentation overhaul:** 11 new articles, git-derived "Posted / Updated" dates with New/Updated badges, and a refreshed global search that indexes every doc and opens it on click (`?doc=<id>` deep-link).

**🔧 Improvements**
* **Production-safe doc dates:** Dates now ship via a committed `server/doc-dates.json` (the Docker build excludes `.git`, which previously left production dates blank), guarded by a `lint:doc-dates` build gate.

**🐛 Fixes**
* **"Unexpected token '<'" page errors:** API calls that received an HTML page (mid-deploy / proxy) now surface a clear, retryable error and self-recover instead of a cryptic JSON parse failure. Also fixed the Error Audit Log infinite-render loop and a cross-platform (CRLF) false-fail in the doc-dates gate.

**Client-Error Observability, System-Health Demand Cards & Report Builder Expansion (v0.7.4x)**

**🆕 New Features**
* **Client Error Audit Log end-to-end:** Browser-side errors (uncaught exceptions, React Error Boundary catches, unhandled promise rejections, mutation failures) are captured, persisted to `client_error_logs`, and surfaced on About → Support & Features → Error Audit Log with severity classification, a "File as Support Request" action, and a one-click "Clear All". A fresh install starts the log empty (the bootstrap path clears any leftover rows when no admin exists yet). See `docs/features/client-error-capture.md`.
* **System Health demand-and-defect cards:** Three new tiles on Configuration → System Health → Overview — Feature Requests (warning when > 0), Support Requests and Client Errors (error when > 0) — counting straight from `support_requests` and `client_error_logs`. They roll into the headline Healthy / Warnings / Errors strip and click through to the matching detail surface.
* **Report Builder field-source expansion:** Per-source color-coded field groups, a registry-driven dynamic JOIN executor, and a third reportable source (Validation Criteria) with the recipe to add more. Filter-example chips moved into the per-source registry.

**🔧 Improvements**
* **Resolved user names in the Error Audit Log:** The User column now leftJoins `users` and renders a real name instead of the raw session id, with a graceful fallback for anonymous / deleted-user rows.
* **Client Errors KPI tile** added to the Support & Features header strip (admin-only, click-through to the Error Audit Log).
* **Git-derived documentation dates:** The About → Documentation Library "Posted / Updated" badges are now computed from `git log` at bundle time instead of hand-maintained strings that drifted (one had even gone into the future).

**🐛 Fixes**
* **Error Audit Log infinite-render loop:** A `useQuery` empty-array default re-created on every render fed an upward-propagation `useEffect` that re-rendered the parent until React's max-update-depth breaker tripped. Hoisted the empty-array fallback to a stable module constant and made the propagation idempotent.

**Multi-DB Management, Secret Lifecycle & Cleanup Schedulers (v0.7.20)**

**🔒 Security Changes**
* **App-Managed Bootstrap Secrets (Task #741):** `SESSION_SECRET` and `ENCRYPTION_KEY` can now be promoted out of host-env into the encrypted app file and unmanaged back, with per-row Promote/Unmanage buttons on the Bootstrap Secrets card and masked Reveal-for-10s buttons on the Environment Variables panel. Reveals are suppressed from access logs and the env-status endpoint ships a server-rendered, credentials-masked URL preview by default so plaintext never crosses the wire.
* **Encryption-Key Rotation Race Closed (Task #726):** Process-memory dual-key decrypt fallback eliminates the COMMIT/env-swap race where rows encrypted under the old key could become unreadable mid-rotation.
* **Forced Logout on Session-Secret Rotation (Task #724, #736):** Rotating `SESSION_SECRET` now invalidates every active admin session and surfaces a "you've been logged out" notice on the next page load.
* **Rotation-In-Progress Banner (Task #734):** Admins see a live status banner with countdown and re-encryption progress during the brief encryption-key rotation window.
* **Boot-Time Data-Directory Health Check (Task #741):** Server probes `/data` writability at startup and on every health check; the result is surfaced via `/api/system/health` so a read-only mount is caught before it silently breaks secret promotion or backups.

**🆕 New Features**
* **Multi-DB Connection Management (Task #739):** File-canonical store (`/data/db-config.json`) for managing multiple named database connections with AES-256-GCM-encrypted URLs, per-connection driver/SSL settings, and a typed-confirm safety gate on every destructive edit.
* **Set-Active-for-Next-Restart Flow (Task #740):** Operators can stage a database switch that takes effect on the next restart instead of mid-request, with three new endpoints (GET / POST / DELETE `/api/db-connections/pending-active`) and a banner showing the pending target.
* **Sessions Cleanup Scheduler & Admin Panel (Task #737, #745, #752):** Daily scheduler drops expired session rows; new "Sessions Cleanup" card on System Health → Database surfaces last-run timestamp, row count, duration, and exposes an admin "Run now" button.
* **Login-History Cleanup Scheduler & Admin Panel (Task #746, #751, #756):** Daily prune of `audit_logins` with configurable retention; new "Login history cleanup" card on System Health → Database surfaces last-run snapshot and an admin "Run now" button gated by a confirmation dialog (Task #758).
* **Bootstrap Secrets & Installed DB Visibility in System Settings (Task #719):** Admins can see which secrets are app-managed vs host-env-managed and which database connection the install is currently using, all from one System Settings panel.
* **Install-Time DB Row on Host-Env Installs (Task #731):** Fresh self-hosted installs now see the install-time `DATABASE_URL` rendered as a real connection row in the manager so it can be promoted, edited, or replaced through the UI like any other connection.

**🔧 Improvements**
* **Repo-Wide JSON-Parsing Antipattern Sweep (Task #754):** Eliminated the broken `JSON.parse(await response.text())` pattern across the codebase, locked in via lint rule + regression tests; this fixed several silent failures including a hidden secret-rotation copy dialog (Task #749).
* **Audit-Logins Cleanup Snapshot Persists Across Restarts (Task #757):** Last-run snapshot is now stored on disk so the System Health card survives rolling deploys and OOM kills.
* **Connection-Store Cleanup (Task #743):** Removed the unused `pendingActiveAnnouncementId` slot from the connection store — it was always null and risked cross-DB orphaned rows.
* **Documentation Sync Workflow (Task #720):** Stopped auto-creating the Documentation Sync workflow schedule on boot — admins now opt in explicitly.
* **Archived-User Notice Dismissal (Task #721):** New `dup_cleanup_notice_dismissed_at` column on `archived_users` preserves per-user dismissal state for the duplicate-cleanup notice.
* **Bootstrap-Secrets Regression Suite (Task #725, #744):** New tests pin the call-order contract for the bootstrap-secrets reveal/regenerate handlers and the `seedBootstrapDbConnection` flow.

**🐛 Fixes**
* **Hidden Secret-Rotation Copy Dialog (Task #749):** Broken JSON parsing was silently swallowing the new-key dialog after a successful rotation, leaving admins with no way to copy the freshly minted secret.

> Older release notes were removed from this document to keep it readable. The full history is in the in-app changelog and in git history.

### 🧩 Milestone Plan

| Milestone | Target Date | Status |
|----|----|----|
| Core Project Management System | 07/15/2025 | ✅ Completed |
| User Authentication & Role-Based Access | 07/20/2025 | ✅ Completed |
| Customer Portal Development | 07/25/2025 | ✅ Completed |
| Analytics & Reporting System | 08/01/2025 | ✅ Completed |
| Advanced Report Builder | 08/05/2025 | ✅ Completed |
| Security Enhancements & Production Readiness | 08/07/2025 | ✅ Completed |
| User Training & Documentation | 08/15/2025 | 🚧 In Progress |
| Organization-wide Rollout | 08/30/2025 | ⏸ Planned |

---

## 🛠 Technical Architecture

**Platform Overview:**
- **Frontend:** React with TypeScript, Tailwind CSS, and shadcn/ui components
- **Backend:** Node.js with Express.js and PostgreSQL database
- **Authentication:** Custom session-based authentication with role-based access control
- **Real-time Features:** WebSocket integration for live updates and collaboration
- **Reporting:** Advanced report builder with PDF export and scheduling capabilities

**Key Features Delivered:**
- Project lifecycle management with status tracking
- Real-time collaboration tools and activity logging
- Customer portal with progress visibility
- Comprehensive analytics and custom reporting
- Template system for rapid project creation
- Role-based security with granular permissions
- Email integration for notifications and welcome workflows

---

## 📊 Current Metrics & Performance

**System Performance:**
- Application response time: <200ms average
- Database queries optimized with proper indexing
- Real-time updates with WebSocket connectivity
- Mobile-responsive design with cross-browser compatibility

**User Adoption Readiness:**
- Production-ready deployment configuration
- Comprehensive error handling and logging
- Security controls and data validation
- Documentation and user guides in development

---

## 🚀 Next Steps

**Immediate Priorities:**
1. Complete user training materials and documentation
2. Conduct pilot testing with select Solution Engineering teams
3. Gather feedback and implement any critical improvements
4. Plan organization-wide rollout strategy

**Future Enhancements:**
- Advanced automation workflows
- Integration with existing CRM and ticketing systems
- Mobile application development
- Advanced analytics and machine learning insights