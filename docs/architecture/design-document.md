# CriteriaIQ - Technical Validation Workspace
## Design Document

### Document Information
- **Version:** 3.0
- **Date:** February 14, 2026
- **Application Version:** v0.12.0 <!-- @managed-version: written by ./update-version.sh from version.json -->
- **Author:** CriteriaIQ Development Team

### Recent Updates (v0.12.0) <!-- @managed-version: written by ./update-version.sh from version.json -->

**Multi-DB Management, Secret Lifecycle & Cleanup Schedulers (v0.7.20)**

**🔒 Security Changes**
- **App-Managed Bootstrap Secrets (Task #741):** `SESSION_SECRET` and `ENCRYPTION_KEY` can be promoted out of host-env into the encrypted app file or unmanaged back, with per-row Promote/Unmanage buttons on the Bootstrap Secrets card and masked Reveal-for-10s buttons on the Environment Variables panel. Reveal calls are suppressed from access logs and the env-status endpoint serves a server-rendered, credentials-masked URL preview by default so plaintext never crosses the wire.
- **Encryption-Key Rotation Race Closed (Task #726):** Process-memory dual-key decrypt fallback eliminates the COMMIT/env-swap race where rows encrypted under the old key could become unreadable mid-rotation.
- **Forced Logout on Session-Secret Rotation (Task #724, #736):** Rotating `SESSION_SECRET` invalidates every active admin session and surfaces a "you've been logged out" notice on the next page load.
- **Rotation-In-Progress Banner (Task #734):** Live status banner shows countdown and re-encryption progress during the brief encryption-key rotation window.
- **Boot-Time Data-Directory Health Check (Task #741):** Server probes `/data` writability at startup and on every health check; result is surfaced via `/api/system/health`.

**🆕 New Features**
- **Multi-DB Connection Management (Task #739):** File-canonical store (`/data/db-config.json`) for managing multiple named database connections with AES-256-GCM-encrypted URLs and a typed-confirm safety gate on every destructive edit.
- **Set-Active-for-Next-Restart Flow (Task #740):** Operators can stage a database switch that takes effect on the next restart instead of mid-request, via three new endpoints (GET / POST / DELETE `/api/db-connections/pending-active`) and a banner showing the pending target.
- **Sessions Cleanup Scheduler & Admin Panel (Task #737, #745, #752):** Daily scheduler drops expired session rows; new "Sessions Cleanup" card on System Health → Database surfaces last-run snapshot and an admin "Run now" button.
- **Login-History Cleanup Scheduler & Admin Panel (Task #746, #751, #756):** Daily prune of `audit_logins` with configurable retention; new "Login history cleanup" card on System Health → Database with admin "Run now" gated by a confirmation dialog (Task #758).
- **Bootstrap Secrets & Installed DB Visibility (Task #719):** New System Settings panel surfaces which secrets are app-managed vs host-env-managed and which database connection the install is currently using.
- **Install-Time DB Row on Host-Env Installs (Task #731):** Fresh self-hosted installs see the install-time `DATABASE_URL` rendered as a real connection row in the manager.

**🔧 Improvements**
- **Repo-Wide JSON-Parsing Antipattern Sweep (Task #754):** Eliminated the broken `JSON.parse(await response.text())` pattern across the codebase, locked in via lint rule + regression tests.
- **Audit-Logins Cleanup Snapshot Persists Across Restarts (Task #757):** Last-run snapshot stored on disk so the System Health card survives rolling deploys and OOM kills.
- **Connection-Store Cleanup (Task #743):** Removed the unused `pendingActiveAnnouncementId` slot from the connection store — it was always null and risked cross-DB orphaned rows.
- **Documentation Sync Workflow (Task #720):** Stopped auto-creating the Documentation Sync workflow schedule on boot; admins now opt in explicitly.
- **Archived-User Notice Dismissal (Task #721):** New `dup_cleanup_notice_dismissed_at` column on `archived_users` preserves per-user dismissal state for the duplicate-cleanup notice.
- **Bootstrap-Secrets Regression Suite (Task #725, #744):** New tests pin the call-order contract for the bootstrap-secrets reveal/regenerate handlers and the `seedBootstrapDbConnection` flow.

**🐛 Fixes**
- **Hidden Secret-Rotation Copy Dialog (Task #749):** Broken JSON parsing was silently swallowing the new-key dialog after a successful rotation, leaving admins with no way to copy the freshly minted secret.

> Older release notes were removed from this document to keep it readable. The full history is in the in-app changelog and in git history.

---

## 1. Executive Summary

CriteriaIQ is a comprehensive Technical Validation Workspace designed to streamline validation project execution for Solution Engineers. The platform provides collaborative tracking, customer portals, and real-time progress monitoring throughout the technical validation lifecycle.

### 1.1 Key Value Propositions
- **Efficiency:** Reduces manual project management overhead by 60%
- **Collaboration:** Unified platform for internal teams and external customers
- **Visibility:** Real-time project status and progress tracking
- **Scalability:** Supports multiple concurrent validation projects
- **Analytics:** Data-driven insights for project optimization

---

## 2. Product Overview

### 2.1 Target Users
- **Primary:** Solution Engineers managing technical validations
- **Secondary:** Customers participating in validation processes
- **Tertiary:** Sales teams, Professional Services, Support, and Management

### 2.2 Core Use Cases
1. **Project Lifecycle Management:** Planning to completion tracking
2. **Success Criteria Definition:** Measurable validation objectives
3. **Customer Collaboration:** Dedicated customer portal access
4. **Progress Monitoring:** Real-time status updates and reporting
5. **Template Management:** Reusable validation frameworks
6. **Analytics & Reporting:** Performance insights and KPIs

### 2.3 Business Goals
- Standardize technical validation processes
- Improve customer experience during evaluations
- Increase validation success rates
- Reduce time-to-close for technical sales
- Provide data-driven insights for process optimization

---

## 3. Technical Architecture

### 3.1 System Architecture Overview
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend      │    │   Database      │
│   (React/TS)    │◄──►│  (Express/TS)   │◄──►│  (PostgreSQL)   │
│                 │    │                 │    │                 │
│ • React Query   │    │ • REST APIs     │    │ • Drizzle ORM   │
│ • Tailwind CSS  │    │ • WebSocket     │    │ • Session Store │
│ • Wouter Router │    │ • Auth System   │    │ • File Storage  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 3.2 Technology Stack

#### Frontend Technologies
- **Framework:** React 19 with TypeScript 6
- **State Management:** TanStack React Query v5
- **Styling:** Tailwind CSS 4 (CSS-first via `@theme` directive in `client/src/index.css`) with shadcn/ui components
- **Routing:** Wouter for client-side navigation
- **Forms:** React Hook Form 7 with Zod 4 validation (via `@hookform/resolvers` 5.x)
- **Build Tool:** Vite 8 with Hot Module Replacement

#### Backend Technologies
- **Runtime:** Node.js with Express 5
- **Language:** TypeScript 6 with ES modules
- **Database ORM:** Drizzle ORM (PostgreSQL dialect)
- **Authentication:** Custom session-based with bcrypt + TOTP + WebAuthn (passkeys) + AES-256-GCM-encrypted recovery codes
- **Real-time:** WebSocket integration (singleton broadcaster, session-cookie verified, event deduplication)
- **Email:** Nodemailer (SMTP)
- **Storage Backends:** Local FS, AWS S3, Azure Blob, Google Cloud Storage (configurable via Storage Configuration singleton)
- **Internationalization:** i18next 26 / react-i18next 15 (6 languages)
- **Storage Layer Composition:** `server/storage.ts` is now a thin shell composed from 28 domain mixins under `server/storage/` (Phase 7 split). Add new methods to the matching mixin, not to `storage.ts`. See [`PROJECT_REFERENCE.md`](../../PROJECT_REFERENCE.md) → "Storage Layer Composition".

#### Data & Infrastructure
- **Primary Database:** PostgreSQL (Neon serverless)
- **Schema Organization:** 16 domain-based files under `shared/schema/`, exported through a barrel (`shared/schema/index.ts`). All application code imports from `@shared/schema`.
- **Session Storage:** PostgreSQL table-based sessions, with daily expired-session prune (Task #737)
- **File Storage:** Base64 encoding for images/logos (up to 5MB) plus configurable object-storage backends listed above
- **Migrations:** Drizzle Kit for schema management

### 3.3 Security Architecture
- **Authentication:** Session-based with secure cookie storage
- **Authorization:** Role-based access control (RBAC)
- **Password Security:** bcrypt hashing with salt rounds
- **Session Management:** Secure session tokens with expiration
- **Data Validation:** Zod schema validation on all inputs

### 3.4 Performance & Stability Architecture
- **Error Handling:** Multi-layered error boundary system with automatic recovery
- **WebSocket Management:** Singleton-pattern connection manager with automatic reconnection
- **Memory Management:** EventEmitter leak prevention and automatic cleanup
- **Performance Monitoring:** Real-time performance tracking and optimization
- **Database Optimization:** Connection pooling and query performance monitoring
- **Initialization Guards:** Prevention of multiple component initializations

---

## 4. Data Model Design

### 4.1 Core Entities

#### Users
```typescript
interface User {
  id: string;
  email: string;
  password: string; // bcrypt hashed
  firstName: string;
  lastName: string;
  role: 'engineer' | 'customer' | 'partner' | 'sales' | 'proserv' | 'support' | 'cx' | 'product' | 'admin';
  isActive: boolean;
  timezone: string;
  approvalStatus: 'pending' | 'approved' | 'rejected';
}
```

#### Projects
```typescript
interface Project {
  id: number;
  customerName: string;
  businessUnit: string;
  primaryEngineer: string;
  specialistEngineer?: string;
  solutions: string[];
  status: string;
  startDate: Date;
  targetDate: Date;
  actualCompletionDate?: Date;
  customerLogo?: string;
  tags: number[];
  industryId?: number;
}
```

#### Success Criteria
```typescript
interface SuccessCriteria {
  id: number;
  projectId: number;
  title: string;
  description: string;
  outcomes: Outcome[];
  actions: Action[];
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed';
}
```

### 4.2 Data Relationships
- **One-to-Many:** Project → Success Criteria
- **Many-to-Many:** Projects ↔ Tags, Users ↔ Projects
- **One-to-One:** Customer → Industry
- **Hierarchical:** Success Criteria → Outcomes → Actions

---

## 5. User Experience Design

### 5.1 Design Principles
- **Simplicity:** Clean, intuitive interfaces
- **Consistency:** Standardized components and patterns
- **Accessibility:** WCAG 2.1 AA compliance
- **Performance:** Sub-2 second page load times
- **Mobile-First:** Responsive design for all devices

### 5.2 User Interface Standards

#### Color Palette
- **Primary:** #212166 (Internal Blue)
- **Secondary:** #FFFFFF (White)
- **Accent:** #3B82F6 (Blue)
- **Success:** #10B981 (Green)
- **Warning:** #F59E0B (Amber)
- **Error:** #EF4444 (Red)

#### Typography
- **Headings:** Inter font family, bold weights
- **Body Text:** Inter font family, regular weights
- **Code:** Fira Code, monospace

#### Component Standards
- **Search/Filter Areas:** bg-gray-50, p-6 padding, rounded-lg borders
- **Form Labels:** text-sm font-medium text-gray-700
- **Buttons:** Consistent sizing with icon + text patterns
- **Cards:** Shadow-sm with hover states

### 5.3 Navigation Structure
```
Dashboard (Home)
├── Projects
│   ├── View All Projects
│   ├── Create New Project
│   └── Project Details
├── Analytics
│   ├── KPI Dashboard
│   ├── Custom Reports
│   └── Report Builder
├── Artifacts (Templates)
│   ├── Template Library
│   ├── Create Template
│   └── Template Management
├── Configuration
│   ├── Users & Permissions
│   ├── Customers
│   ├── Industries
│   └── System Settings
└── Help & Support
├── Error Testing (`/error-test`)
└── Documentation
```

---

## 6. Feature Specifications

### 6.1 Core Features

#### Project Management
- **CRUD Operations:** Complete project lifecycle management
- **Status Tracking:** Planning → In Progress → Completed → Cancelled
- **Timeline Management:** Start dates, target dates, completion tracking
- **Assignment Management:** Primary and specialist engineer assignments
- **Customer Integration:** Customer portal access and collaboration

#### Success Criteria Framework
- **Hierarchical Structure:** Criteria → Outcomes → Actions
- **Dynamic Validation:** Real-time progress tracking
- **Template System:** Reusable criteria frameworks
- **Outcome Tracking:** Measurable results documentation

#### Artifacts Management
- **Template Creation:** Generate templates from existing projects
- **Template Library:** Searchable template repository
- **Auto-Population:** Smart field population based on selections
- **Version Control:** Template versioning and history

#### Analytics & Reporting
- **Real-time KPIs:** Project statistics and performance metrics
- **Custom Reports:** User-defined report generation
- **PDF Export:** Professional report formatting
- **Data Visualization:** Charts and graphs for insights

### 6.2 Advanced Features

#### Error Testing & Debugging
- **Error Test Page (`/error-test`):**
    - **Purpose:** Testing and demonstration page for the application's error handling system
    - **Access:** Navigate to `/error-test` in the browser or use the direct URL
    - **Functionality:** 
        - Displays a controlled error using the ErrorDisplay component
        - Shows the gradient background with logo overlay styling
        - Demonstrates error recovery with retry functionality
        - Includes detailed error information display
        - Tests the comprehensive error handling framework
    - **Usage:** Developers and administrators can use this page to verify error handling works correctly across the application
    - **Features Demonstrated:**
        - Error boundary functionality
        - User-friendly error messaging
        - Error logging with unique IDs
        - Retry mechanisms
        - Consistent visual styling for error states

#### Authentication & Authorization
- **User Management:**
    - **Multi-Role Support:** 9 distinct user roles with granular permissions
    - **Enhanced Approval Workflow:** Role-based filtering in Dashboard User Account Approvals section for Customer, Guest, and Partner roles
    - **Session Management:** Secure, persistent sessions with timezone support
    - **Password Policies:** Complexity requirements and validation
    - **User Experience Alerts:** Comprehensive login approval notifications across project forms
- **RBAC Implementation:** Fine-grained access control
- **SSO Integration:** Potential for future single sign-on capabilities

#### Real-time Updates
- **WebSocket Integration:** Live project updates
- **Activity Logging:** Comprehensive audit trails
- **Notification System:** Email notifications for key events
- **Collaborative Editing:** Real-time form updates

#### Customer Portal
- **Dedicated Interface:** Customer-specific project views
- **Progress Tracking:** Real-time validation status
- **Document Sharing:** Secure file exchange
- **Communication Tools:** Direct messaging capabilities

---

## 7. Performance Requirements

### 7.1 Performance Targets
- **Page Load Time:** < 2 seconds (95th percentile)
- **API Response Time:** < 500ms (average)
- **Database Query Time:** < 100ms (average)
- **Concurrent Users:** Support 100+ simultaneous users
- **Uptime:** 99.9% availability target

### 7.2 Scalability Considerations
- **Database Optimization:** Indexed queries and connection pooling
- **Frontend Optimization:** Code splitting and lazy loading
- **Caching Strategy:** React Query for client-side caching
- **Asset Optimization:** Compressed images and minified code

---

## 8. Security & Compliance

### 8.1 Security Measures
- **Data Encryption:** TLS 1.3 for data in transit
- **Authentication:** Secure session management
- **Input Validation:** Comprehensive data sanitization
- **CSRF Protection:** Cross-site request forgery prevention
- **XSS Prevention:** Content Security Policy implementation

### 8.2 Data Privacy
- **GDPR Compliance:** Data protection and user rights
- **Data Minimization:** Collect only necessary information
- **Retention Policies:** Automated data cleanup procedures
- **Access Controls:** Role-based data access restrictions

---

## 9. Integration Points

### 9.1 External Systems
- **Email Service:** Nodemailer (SMTP) for transactional emails
- **Database:** Neon PostgreSQL serverless (with multi-DB connection management via `data/db-config.json` — see Task #739)
- **Authentication:** Custom session-based implementation with TOTP + WebAuthn / passkeys + encrypted recovery codes
- **File Storage:** Base64 encoding for inline images/logos plus pluggable object-storage backends (Local FS, AWS S3, Azure Blob, Google Cloud Storage)
- **Salesforce:** OAuth-based bidirectional sync via `jsforce` with admin-configurable field mappings

### 9.2 API Design
- **RESTful APIs:** Standard HTTP methods and status codes
- **Data Format:** JSON request/response format
- **Error Handling:** Consistent error response structure
- **Rate Limiting:** API usage controls and quotas

---

## 10. Deployment & Operations

### 10.1 Deployment Architecture
- **Environment:** Self-hosted Docker container (Dokploy, Coolify, or any Docker host)
- **Build Process:** Vite production builds
- **Asset Delivery:** Static file serving
- **Database:** Neon serverless PostgreSQL
- **Infrastructure:** Enterprise-grade security and scalability
- **Migration Status:** Successfully migrated from personal to enterprise environment (v0.1.28)

### 10.2 Monitoring & Maintenance
- **Error Tracking:** Comprehensive error logging
- **Performance Monitoring:** Response time tracking
- **Health Checks:** System availability monitoring
- **Backup Strategy:** Automated database backups

---

## 11. Future Roadmap

### 11.1 Phase 2 Enhancements
- **Advanced Analytics:** Predictive project success modeling
- **Mobile Application:** Native iOS/Android apps
- **API Ecosystem:** Third-party integrations
- **Advanced Workflows:** Custom validation processes

### 11.2 Integration Opportunities
- **CRM Integration:** Salesforce, HubSpot connectivity
- **Communication Tools:** Slack, Microsoft Teams integration
- **Document Management:** SharePoint, Google Drive integration
- **Calendar Systems:** Meeting scheduling and reminder automation

---

## 12. Success Metrics

### 12.1 Key Performance Indicators
- **User Adoption:** Monthly active users growth
- **Project Success Rate:** Completed vs. cancelled projects
- **Time to Value:** Average project completion time
- **User Satisfaction:** Net Promoter Score (NPS)
- **System Performance:** Uptime and response times

### 12.2 Business Impact Metrics
- **Process Efficiency:** Reduction in manual project management time
- **Customer Experience:** Improved validation process satisfaction
- **Sales Enablement:** Faster technical validation cycles
- **Data Insights:** Enhanced decision-making capabilities

---

## Appendix A: Glossary

- **POC:** Proof of Concept / Project validation
- **Success Criteria:** Measurable objectives for project validation
- **Artifacts:** Templates and reusable project frameworks
- **Solution Engineer:** Technical expert managing validations
- **Customer Portal:** External interface for customer collaboration
- **RBAC:** Role-Based Access Control
- **KPI:** Key Performance Indicator

---

*This document is maintained by the CriteriaIQ development team and updated with each major release.*