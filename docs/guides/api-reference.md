# CriteriaIQ API Reference

**Version:** v0.12.0 <!-- @managed-version: written by ./update-version.sh from version.json -->  
**Last Updated:** April 23, 2026  
**Base URL:** `/api`

## Overview

CriteriaIQ provides a comprehensive REST API for managing technical validation projects, customers, success criteria, workflow automation, and more. All API endpoints (except authentication and public endpoints) require session-based authentication.

**Schema Validation:** All API requests are validated using Zod schemas. For complete field definitions and validation rules, refer to `shared/schema.ts` and the route handlers in `server/routes.ts`.

## Authentication

### Session-Based Authentication
All API requests require an authenticated session. Sessions are managed via HTTP-only cookies.

**Protected Endpoints:** Most endpoints use the `isAuthenticated` middleware which:
- Validates the user session
- Returns 401 Unauthorized if not authenticated
- Provides `req.session.user` with user details

**Public Endpoints:**
- `GET /api/version` - System version info
- `GET /api/public/products` - Public product list
- `POST /api/auth/*` - Authentication endpoints

---

## API Categories

### 1. Core System

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/version` | Get system version, build date, git commit | No |
| GET | `/api/solution-icons` | List available solution icons | Yes |
| GET | `/api/assets` | List uploaded assets | Yes |
| POST | `/api/assets` | Upload new asset | Yes |

### 2. Authentication & Users

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/auth/user` | Get current authenticated user | Yes |
| POST | `/api/auth/login` | User login | No |
| POST | `/api/auth/logout` | User logout | Yes |
| POST | `/api/auth/register` | Register new user | No |
| POST | `/api/auth/request-password-reset` | Request password reset email | No |
| POST | `/api/auth/reset-password` | Reset password with token | No |
| GET | `/api/users` | List all users | Yes |
| GET | `/api/users/:userId` | Get specific user | Yes |
| PUT | `/api/users/:userId` | Update user | Yes |
| DELETE | `/api/users/:userId` | Delete user | Yes |
| GET | `/api/pending-users` | List pending approval users | Yes (Admin) |
| POST | `/api/approve-user/:userId` | Approve user registration | Yes (Admin) |
| POST | `/api/reject-user/:userId` | Reject user registration | Yes (Admin) |

### 3. Multi-Factor Authentication (MFA)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/mfa/status/:userId` | Get MFA status for user | Yes |
| POST | `/api/mfa/totp/setup` | Initialize TOTP setup | Yes |
| POST | `/api/mfa/totp/verify` | Verify TOTP code | Yes |
| POST | `/api/mfa/challenge` | Submit MFA challenge | Yes |
| GET | `/api/me/security` | Get current user security info | Yes |
| POST | `/api/mfa/recovery/regenerate` | Regenerate recovery codes | Yes |
| POST | `/api/mfa/disable` | Disable MFA | Yes |
| GET | `/api/admin/users/:id/security` | Admin view user security | Yes (Admin) |
| POST | `/api/admin/users/:id/mfa/reset` | Admin reset user MFA | Yes (Admin) |

### 4. Roles & Permissions

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/roles` | List all roles | Yes |
| GET | `/api/roles/:id` | Get specific role | Yes |
| POST | `/api/roles` | Create new role | Yes (Admin) |
| PUT | `/api/roles/:id` | Update role | Yes (Admin) |
| DELETE | `/api/roles/:id` | Delete role | Yes (Admin) |
| GET | `/api/roles/:id/permissions` | Get role permissions | Yes |
| PUT | `/api/roles/:id/permissions` | Update role permissions | Yes (Admin) |

### 5. Projects

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/projects` | List projects (with pagination) | Yes |
| GET | `/api/projects/kanban` | Get Kanban board data | Yes |
| GET | `/api/projects/:id` | Get project details | Yes |
| POST | `/api/projects` | Create new project | Yes |
| PUT | `/api/projects/:id` | Update project | Yes |
| DELETE | `/api/projects/:id` | Archive project | Yes |
| PATCH | `/api/projects/:id/status` | Update project status | Yes |
| GET | `/api/projects/:id/audit` | Get project audit log | Yes |
| GET | `/api/projects/:id/audit/count` | Get audit log count | Yes |
| GET | `/api/projects/:id/activity` | Get project activity | Yes |
| POST | `/api/projects/:id/customer-artifacts` | Upload customer artifact | Yes |

**Query Parameters for `/api/projects`:**
- `status` - Filter by status
- `customerName` - Filter by customer
- `search` - Search term
- `limit` - Results per page (default: 50)
- `offset` - Pagination offset
- `crmOpportunityId` - Projects linked to this CRM Opportunity (Salesforce Opportunity id or HubSpot Deal id). Salesforce ids match in 15- or 18-character form.
- `crmAccountId` - Projects linked to this CRM Account (Salesforce Account id or HubSpot Company id). Salesforce ids match in 15- or 18-character form.
- `evaluationId` - Projects whose `salesforceEvaluationLink` points at this Salesforce Evaluation record (15 or 18 characters). Matches the record id inside the link, not a substring.

Filters combine with AND. A malformed id returns `400`. Filtered results use the same access rules and API key scope (`projects:read`) as the unfiltered list, and the response is the same array of projects (empty when nothing matches).

**CRM record id fields on a project** (returned by `GET /api/projects` and `GET /api/projects/:id`; writable on `POST /api/projects`, `PUT`/`PATCH /api/projects/:id`):

| Field | Type | Notes |
|-------|------|-------|
| `crmProvider` | `"salesforce"` \| `"hubspot"` \| `null` | The CRM the ids came from. Inferred from the ids when omitted. |
| `crmOpportunityId` | string \| `null` | Salesforce Opportunity id or HubSpot Deal id. |
| `crmAccountId` | string \| `null` | Salesforce Account id or HubSpot Company id. |

On save, each id field accepts a bare id or a record URL. Salesforce ids are stored in their 18-character form (15-character input is converted). A blank value clears the field; omitting it leaves it unchanged. An invalid id returns `400`. `opportunityName`, `customerName` and `salesforceEvaluationLink` are unchanged and remain available as fallbacks for projects without ids.

Example: `GET /api/projects?crmOpportunityId=006A0000004kzLq` returns every project the caller can see whose `crmOpportunityId` is `006A0000004kzLqIAI`.

**Query Parameters for `/api/projects/kanban`:**
- `view` - "all" or "mine"
- `dimension` - "internal", "risk", or "ranking"
- `filters` - JSON string with filter criteria

### 6. Customers

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/customers` | List all customers | Yes |
| GET | `/api/customers/accessible` | List accessible customers | Yes |
| GET | `/api/customers/:id` | Get customer details | Yes |
| POST | `/api/customers` | Create customer (with logo) | Yes |
| PUT | `/api/customers/:id` | Update customer | Yes |
| DELETE | `/api/customers/:id` | Delete customer | Yes |
| GET | `/api/customers/:id/customer-users` | List customer users | Yes |
| GET | `/api/customers/:customerId/documents` | List customer documents | Yes |
| POST | `/api/customers/:customerId/documents` | Upload customer document | Yes |
| GET | `/api/customer-access/:pocId` | Get the customer users on a project (viewer must be able to open the project) | Yes |

### 7. Configuration & Settings

#### Backup & Restore
See `docs/features/backup-restore.md`.

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/admin/backup/info` | Table and row counts, schema version, upload limit | Yes (Admin) |
| GET | `/api/admin/backup/export` | Download the whole database as a gzip file | Yes (Admin) |
| POST | `/api/admin/backup/import` | Upload a backup (raw body) and get a preview; changes nothing | Yes (Admin) |
| DELETE | `/api/admin/backup/import/:token` | Drop a pending upload | Yes (Admin) |
| POST | `/api/admin/backup/import/:token/apply` | Replace the database; body `{ "confirmation": "RESTORE" }` | Yes (Admin) |

#### Page Usage
See `docs/features/page-usage.md`.

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/page-views` | Count one view of a page by the caller; body `{ "pageKey": "<sidebar entry id>" }` | Yes |
| GET | `/api/admin/page-usage?days=30\|90\|180\|365` | Views and distinct people per page for the window; totals only | Yes (Admin) |

#### Status Configurations
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/status-configs` | List project status configs | Yes |
| POST | `/api/status-configs` | Create status config | Yes (Admin) |
| PUT | `/api/status-configs/:id` | Update status config | Yes (Admin) |
| DELETE | `/api/status-configs/:id` | Delete status config | Yes (Admin) |
| GET | `/api/customer-status-configs` | List customer status configs | Yes |

#### Risk Level Configurations
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/risk-level-configs` | List risk level configs | Yes |
| POST | `/api/risk-level-configs` | Create risk config | Yes (Admin) |
| PUT | `/api/risk-level-configs/:id` | Update risk config | Yes (Admin) |
| DELETE | `/api/risk-level-configs/:id` | Delete risk config | Yes (Admin) |

#### Ranking Configurations
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/ranking-configs` | List ranking configs | Yes |
| POST | `/api/ranking-configs` | Create ranking config | Yes (Admin) |
| PUT | `/api/ranking-configs/:id` | Update ranking config | Yes (Admin) |
| DELETE | `/api/ranking-configs/:id` | Delete ranking config | Yes (Admin) |

#### Tags
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/tags` | List all tags | Yes |
| GET | `/api/tags/system` | List system tags | Yes |
| POST | `/api/tags` | Create tag | Yes (Admin) |
| PUT | `/api/tags/:id` | Update tag | Yes (Admin) |
| DELETE | `/api/tags/:id` | Delete tag | Yes (Admin) |

#### Industries
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/industries` | List industries | Yes |
| POST | `/api/industries` | Create industry | Yes (Admin) |
| PUT | `/api/industries/:id` | Update industry | Yes (Admin) |
| DELETE | `/api/industries/:id` | Delete industry | Yes (Admin) |

#### End Date Flags
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/end-date-flags` | List all end date flags | Yes |
| GET | `/api/end-date-flags/active` | List active flags | Yes |
| POST | `/api/end-date-flags` | Create flag | Yes (Admin) |
| PUT | `/api/end-date-flags/:id` | Update flag | Yes (Admin) |
| DELETE | `/api/end-date-flags/:id` | Delete flag | Yes (Admin) |

### 8. Success Criteria System

The Validation Criteria hierarchy follows this order: **Solution → Component → Value Mapping → Criteria → Expected Outcome → Action Taken**

#### Solutions/Components
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/components` | List all components | Yes |
| GET | `/api/components/by-solution/:solutionId` | Components by solution | Yes |
| POST | `/api/components` | Create component | Yes |
| PUT | `/api/components/:id` | Update component | Yes |
| PATCH | `/api/components/:id` | Partial update | Yes |
| DELETE | `/api/components/:id` | Delete component | Yes |

#### Value Mappings
Value Mappings define why a validation is being conducted and help choose the right criteria. Positioned between Components and Criteria in the hierarchy.
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/value-mappings` | List all value mappings | Yes |
| GET | `/api/value-mappings/by-solution/:solutionId` | Value mappings by solution | Yes |
| POST | `/api/value-mappings` | Create value mapping | Yes |
| PUT | `/api/value-mappings/:id` | Update value mapping | Yes |
| DELETE | `/api/value-mappings/:id` | Set value mapping inactive | Yes |

#### Criteria
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/criteria` | List all criteria | Yes |
| GET | `/api/criteria/:id` | Get specific criteria | Yes |
| GET | `/api/criteria/by-solution/:solutionId` | Criteria by solution | Yes |
| GET | `/api/criteria/counts` | Get criteria counts | Yes |
| POST | `/api/criteria` | Create criteria | Yes |
| DELETE | `/api/criteria/:id` | Delete criteria | Yes |

#### Expected Outcomes
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/outcomes` | List all outcomes | Yes |
| GET | `/api/outcomes/:id` | Get specific outcome | Yes |
| GET | `/api/outcomes/by-solution/:solutionId` | Outcomes by solution | Yes |
| POST | `/api/outcomes` | Create outcome | Yes |
| DELETE | `/api/outcomes/:id` | Delete outcome | Yes |

#### Actions
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/actions` | List all actions | Yes |
| GET | `/api/actions/:id` | Get specific action | Yes |
| GET | `/api/actions/by-solution/:solutionId` | Actions by solution | Yes |
| POST | `/api/actions` | Create action | Yes |
| DELETE | `/api/actions/:id` | Delete action | Yes |

#### Hierarchical Links
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/success-criteria/links/products-for-criteria/:id` | Get linked products | Yes |
| GET | `/api/success-criteria/links/criteria-for-outcome/:id` | Get linked criteria | Yes |
| GET | `/api/success-criteria/links/outcomes-for-action/:id` | Get linked outcomes | Yes |

### 9. Templates

#### Project Templates
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/templates` | List project templates | Yes |
| GET | `/api/templates/:id` | Get template details | Yes |
| POST | `/api/templates` | Create template | Yes |
| PUT | `/api/templates/:id` | Update template | Yes |
| DELETE | `/api/templates/:id` | Delete template | Yes |

#### Validation Criteria Templates
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/validation-criteria-templates` | List validation templates | Yes |
| GET | `/api/validation-criteria-templates/:id` | Get template details | Yes |
| POST | `/api/validation-criteria-templates` | Create template | Yes |
| PUT | `/api/validation-criteria-templates/:id` | Update template | Yes |
| DELETE | `/api/validation-criteria-templates/:id` | Delete template | Yes |

### 10. Mutual Action Plan (MAP) System

#### MAP Templates
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/map/templates` | List MAP templates | Yes |
| GET | `/api/map/templates/:id` | Get template | Yes |
| POST | `/api/map/templates` | Create template | Yes |
| PUT | `/api/map/templates/:id` | Update template | Yes |
| DELETE | `/api/map/templates/:id` | Delete template | Yes |
| GET | `/api/map/templates/:id/content` | Get template content | Yes |
| PUT | `/api/map/templates/:id/content` | Update template content | Yes |
| POST | `/api/map/templates/:id/duplicate` | Duplicate template | Yes |
| GET | `/api/map/templates/:id/stats` | Get template stats | Yes |

#### Project MAP
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/projects/:projectId/map` | Get project MAP | Yes |
| GET | `/api/projects/:projectId/map/analytics` | Get MAP analytics | Yes |
| POST | `/api/projects/:projectId/map/from-template` | Create MAP from template | Yes |
| PUT | `/api/projects/:projectId/map/name` | Update MAP name | Yes |
| GET | `/api/projects/:projectId/map/assignment-analytics` | Assignment analytics | Yes |

#### MAP Entities
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| PUT | `/api/map/phases/:id` | Update phase | Yes |
| PUT | `/api/map/steps/:id` | Update step | Yes |
| PUT | `/api/map/tasks/:id` | Update task | Yes |
| DELETE | `/api/map/phases/:id` | Delete phase | Yes |
| DELETE | `/api/map/steps/:id` | Delete step | Yes |
| DELETE | `/api/map/tasks/:id` | Delete task | Yes |

#### MAP Assignments
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/projects/:projectId/map/assignments` | List assignments | Yes |
| POST | `/api/projects/:projectId/map/assignments` | Create assignment | Yes |
| POST | `/api/projects/:projectId/map/assignments/bulk` | Bulk create | Yes |
| DELETE | `/api/projects/:projectId/map/assignments/:assignmentId` | Delete assignment | Yes |
| DELETE | `/api/projects/:projectId/map/assignments/bulk` | Bulk delete | Yes |

#### MAP Automation
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/map-automation-config` | Get global config | Yes |
| PUT | `/api/map-automation-config` | Update global config | Yes |
| GET | `/api/projects/:projectId/map-automation-config` | Get project config | Yes |
| PUT | `/api/projects/:projectId/map-automation-config` | Update project config | Yes |
| DELETE | `/api/projects/:projectId/map-automation-config` | Delete project config | Yes |
| GET | `/api/map/management` | MAP management data | Yes |
| POST | `/api/map/initialize` | Initialize MAP system | Yes |

### 11. Workflow Automation

#### Triggers
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/email-automation/triggers` | List all triggers | Yes |
| GET | `/api/email-automation/triggers/:id` | Get trigger details | Yes |
| POST | `/api/email-automation/triggers` | Create trigger | Yes (Admin) |
| PUT | `/api/email-automation/triggers/:id` | Update trigger | Yes (Admin) |
| DELETE | `/api/email-automation/triggers/:id` | Delete trigger | Yes (Admin) |

#### Rules
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/email-automation/rules` | List all rules | Yes |
| GET | `/api/email-automation/rules/:id` | Get rule details | Yes |
| POST | `/api/email-automation/rules` | Create rule | Yes |
| PUT | `/api/email-automation/rules/:id` | Update rule | Yes |
| DELETE | `/api/email-automation/rules/:id` | Delete rule | Yes |
| POST | `/api/email-automation/evaluate` | Evaluate rules | Yes |
| POST | `/api/email-automation/execute` | Execute automation | Yes |

#### Schedules
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/email-automation/schedules` | List schedules | Yes |
| GET | `/api/email-automation/schedules/:id` | Get schedule | Yes |
| POST | `/api/email-automation/schedules` | Create schedule | Yes |
| PUT | `/api/email-automation/schedules/:id` | Update schedule | Yes |
| DELETE | `/api/email-automation/schedules/:id` | Delete schedule | Yes |

#### Configuration & Logs
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/email-automation/config` | Get automation config | Yes |
| PUT | `/api/email-automation/config` | Update automation config | Yes |
| GET | `/api/email-configuration` | Get email config | Yes |
| PUT | `/api/email-configuration` | Update email config | Yes |
| POST | `/api/email-configuration/test` | Test email config | Yes |
| GET | `/api/email-providers` | List email providers | Yes |
| GET | `/api/email-logs` | Get email logs | Yes |

#### Email Templates & Designs
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/email-templates` | List email templates | Yes |
| GET | `/api/email-templates/:id` | Get template | Yes |
| POST | `/api/email-templates` | Create template | Yes |
| PUT | `/api/email-templates/:id` | Update template | Yes |
| DELETE | `/api/email-templates/:id` | Delete template | Yes |
| GET | `/api/email-designs` | List email designs | Yes |
| GET | `/api/email-designs/:id` | Get design | Yes |
| POST | `/api/email-designs` | Create design | Yes |
| PUT | `/api/email-designs/:id` | Update design | Yes |
| DELETE | `/api/email-designs/:id` | Delete design | Yes |

### 12. Risk Analysis (AI-Powered)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/risk/criteria` | List risk criteria | Yes |
| POST | `/api/risk/criteria` | Create risk criteria | Yes |
| PUT | `/api/risk/criteria/:id` | Update risk criteria | Yes |
| DELETE | `/api/risk/criteria/:id` | Delete risk criteria | Yes |
| POST | `/api/risk/initialize` | Initialize risk system | Yes |
| POST | `/api/projects/:id/analyze-risk` | Analyze project risk (AI) | Yes |
| GET | `/api/projects/:id/risk-prediction` | Get risk prediction | Yes |
| POST | `/api/risk/analyze-all` | Analyze all projects | Yes (Admin) |

### 13. Reports & Analytics

#### Custom Reports
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/custom-reports` | List custom reports | Yes |
| GET | `/api/custom-reports/:reportId` | Get report details | Yes |
| POST | `/api/custom-reports` | Create report | Yes |
| PUT | `/api/custom-reports/:reportId` | Update report | Yes |
| DELETE | `/api/custom-reports/:reportId` | Delete report | Yes |
| GET | `/api/custom-reports/:reportId/execute` | Execute report | Yes |
| GET | `/api/report-builder/fields` | Get available fields | Yes |
| GET | `/api/report-schedules?from=&to=` | Scheduled reports with runs and upcoming occurrences for a day range (Reports page calendar) | Yes (staff + Reports or Scheduler view) |
| GET | `/api/built-in-reports/:reportId/results` | Run a built-in report (up to 1,000 rows) for Reports › Run | Yes (staff + Reports view) |

#### Audit & Login Reports
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/audit-logins` | List login audit | Yes |
| GET | `/api/audit-logins/report` | Generate login report | Yes |
| POST | `/api/audit/cleanup` | Cleanup old audits | Yes (Admin) |

### 14. Documents & Files

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/documents` | List documents | Yes |
| GET | `/api/documents/:id` | Get document | Yes |
| POST | `/api/documents` | Upload document | Yes |
| PUT | `/api/documents/:id` | Update document | Yes |
| DELETE | `/api/documents/:id` | Delete document | Yes |
| GET | `/api/documents/:id/download` | Download document | Yes |
| POST | `/api/upload-images` | Upload rich text images | Yes |
| GET | `/api/links` | List links | Yes |

### 15. Compliance & Regulations

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/compliance` | List compliance items | Yes |
| GET | `/api/compliance/:id` | Get compliance item | Yes |
| POST | `/api/compliance` | Create compliance item | Yes |
| PUT | `/api/compliance/:id` | Update compliance item | Yes |
| DELETE | `/api/compliance/:id` | Delete compliance item | Yes |
| GET | `/api/compliance/download-template` | Download CSV template | Yes |
| POST | `/api/compliance/import` | Import from CSV | Yes |

### 16. Support & Feature Requests

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/support-requests` | List support requests | Yes |
| GET | `/api/support-requests/:id` | Get request details | Yes |
| POST | `/api/support-requests` | Create request | Yes |
| PATCH | `/api/support-requests/:id` | Update request | Yes |
| DELETE | `/api/support-requests/:id` | Delete request | Yes |
| GET | `/api/support-requests/count` | Get request count | Yes |
| POST | `/api/support-requests/upload` | Upload attachment | Yes |
| GET | `/api/support-requests/download/:filename` | Download attachment | Yes |
| GET | `/api/evaluation-requests` | List evaluation requests | Yes |
| POST | `/api/evaluation-requests` | Create evaluation request | Yes |
| GET | `/api/evaluation-requests/:id` | Get one evaluation request with account, requester and solution names | Yes |
| PATCH | `/api/evaluation-requests/:id` | Edit dates, reasons, compelling event, solutions or status | Yes |
| DELETE | `/api/evaluation-requests/:id` | Delete (requester or Admin) | Yes |

### 17. Archive System

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/archive/users` | List archived users | Yes |
| GET | `/api/archive/users/:id` | Get archived user | Yes |
| POST | `/api/archive/users/:userId/restore` | Restore user | Yes (Admin) |
| GET | `/api/archive/projects` | List archived projects | Yes |
| POST | `/api/archive/projects/:projectId/restore` | Restore project | Yes |
| GET | `/api/archive/customers` | List archived customers | Yes |
| POST | `/api/archive/customers/:customerId/restore` | Restore customer | Yes |
| GET | `/api/archive/log` | View archive log | Yes |

### 18. User Preferences

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/board-preferences/:userId/:dimension` | Get board preferences | Yes |
| POST | `/api/board-preferences/:userId/:dimension` | Save board preferences | Yes |
| GET | `/api/projects/:projectId/notification-settings` | Get notification settings | Yes |
| PUT | `/api/projects/:projectId/users/:targetUserId/notification-settings` | Update notification settings | Yes |

### 19. Global Search

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/search` | Search across all entities (projects, customers, users, etc.) | Yes (Internal roles only) |

**Query Parameters for `/api/search`:**
- `q` - Search query string (required)
- `limit` - Maximum results to return (default: 20, max: 50)

**Response Fields:**
- `entityType` - Type of entity (project, customer, user, map_template, navigation, documentation, getting_started)
- `id` - Entity identifier
- `label` - Primary display text
- `subLabel` - Secondary display text
- `url` - Navigation URL
- `score` - Relevance score

**Notes:** External roles (Customer, Partner, Guest) receive empty results. Internal roles only.

### 20. Webhooks

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/webhooks` | List all webhooks | Yes |
| GET | `/api/webhooks/:id` | Get webhook details | Yes |
| POST | `/api/webhooks` | Create new webhook | Yes (Admin) |
| PUT | `/api/webhooks/:id` | Update webhook | Yes (Admin) |
| DELETE | `/api/webhooks/:id` | Delete webhook | Yes (Admin) |
| POST | `/api/webhooks/:id/test` | Send test payload to webhook | Yes (Admin) |
| GET | `/api/webhooks/:id/deliveries` | Get webhook delivery history | Yes |
| POST | `/api/webhooks/:id/toggle` | Enable/disable webhook | Yes (Admin) |

**Request Body (POST/PUT):**
- `name` (required) - Webhook name
- `url` (required) - Destination URL
- `eventTypes` - Array of event types to trigger webhook
- `signingSecret` - Secret for HMAC-SHA256 payload signing
- `retryEnabled` - Enable retry on failure (default: true)
- `isActive` - Enable/disable webhook

**Response Fields:**
- `id`, `name`, `url`, `eventTypes`, `isActive`, `retryEnabled`
- `hasSigningSecret` - Boolean indicating if signing secret is set (secret never exposed)
- `lastDeliveryAt`, `lastDeliveryStatus`, `createdAt`, `updatedAt`

**Technical Implementation:**
- HMAC-SHA256 payload signing (X-CriteriaIQ-Signature, plus timestamp-bound X-CriteriaIQ-Signature-V2)
- AES-256-GCM encrypted secret storage
- Retry with exponential backoff (1s, 5s, 15s delays)
- Handlebars templating for payloads

### 21. System Announcements

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/announcements/active` | Get active announcements for current user | Yes |
| POST | `/api/announcements/:id/read` | Mark announcement as read | Yes |
| GET | `/api/admin/announcements` | List all announcements | Yes (Admin) |
| POST | `/api/admin/announcements` | Create new announcement | Yes (Admin) |
| PATCH | `/api/admin/announcements/:id` | Update announcement | Yes (Admin) |
| DELETE | `/api/admin/announcements/:id` | Delete announcement | Yes (Admin) |

### 22. Flight Deck Engine

#### Tips Management
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/admin/flight-deck-tips` | List all Flight Deck tips | Yes (Admin) |
| POST | `/api/admin/flight-deck-tips` | Create new tip | Yes (Admin) |
| PUT | `/api/admin/flight-deck-tips/:id` | Update tip | Yes (Admin) |
| DELETE | `/api/admin/flight-deck-tips/:id` | Delete tip | Yes (Admin) |
| POST | `/api/admin/flight-deck-tips/seed` | Seed default tips | Yes (Admin) |

**Tip Fields:** `id`, `tipText`, `isActive`, `displayOrder`, `createdBy`, `createdAt`, `updatedAt`

#### Configuration Management
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/admin/flight-deck-configs` | List all Flight Deck configurations | Yes (Admin) |
| POST | `/api/admin/flight-deck-configs` | Create new configuration | Yes (Admin) |
| PUT | `/api/admin/flight-deck-configs/:id` | Update configuration | Yes (Admin) |
| DELETE | `/api/admin/flight-deck-configs/:id` | Delete configuration | Yes (Admin) |
| GET | `/api/admin/flight-deck-configs/:id/preview` | Preview configuration with widgets | Yes (Admin) |

**Configuration Fields:**
- `name`, `targetRole`, `scenario` (onboarding|daily|every_login|weekly)
- `startDate`, `endDate`, `isEnabled`, `priority`
- `enabledWidgets` - Array of widget IDs to display
- `widgetSettings` - JSON object with widget-specific settings
- `headerText`, `tipDisplayLocation`, `headerImageUrl`, `footerImageUrl`

#### User Endpoints
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/user/flight-deck-data` | Get Flight Deck data for current user | Yes |
| PUT | `/api/user/flight-deck-preference` | Update user's Flight Deck visibility preference | Yes |

**User Data Response:** Returns matched configuration based on user role and scenario, plus widget data (health pulse metrics, risk radar, resume project info, checklist status, tips).

### 23. Salesforce Integration

**Prerequisite:** User must have Salesforce OAuth connected. Endpoints return 403 if Salesforce integration is not configured for the user.

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/salesforce/opportunities/search` | Search Salesforce opportunities | Yes |
| GET | `/api/salesforce/opportunities/:id` | Get opportunity details | Yes |
| POST | `/api/salesforce/opportunities/:id/stage` | Update opportunity stage | Yes |
| GET | `/api/salesforce/stages` | Get available Salesforce stages | Yes |
| POST | `/api/salesforce/enrich` | Enrich project with Salesforce data | Yes |
| GET | `/api/salesforce/sync/last/:projectId` | Get last sync timestamp for project | Yes (internal users, project access) |

**Query Parameters:**
- `/opportunities/search`: `query` (search term), `limit` (default: 20)
- `/enrich`: Body requires `projectId` and `opportunityId`
- `/sync/last/:projectId`: Returns `{ lastSyncAt: ISO timestamp | null }`

**Technical Details:**
- User-context OAuth with encrypted token storage (AES-256-GCM)
- Automatic token refresh on expiration
- Bidirectional sync: Projects↔Opportunities, Customers↔Accounts
- Conflict detection with acknowledgment workflow

### 24. Gap Analysis System

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/gaps` | List all gaps (global catalog) | Yes |
| POST | `/api/gaps` | Create new gap | Yes |
| PATCH | `/api/gaps/:id` | Update gap | Yes |
| DELETE | `/api/gaps/:id` | Delete gap | Yes |
| GET | `/api/projects/:id/gaps` | Get gaps linked to a project | Yes |
| GET | `/api/projects/:id/available-gaps` | Get gaps available to link to project | Yes |
| POST | `/api/projects/:id/link-gaps` | Link gaps to a project | Yes |
| DELETE | `/api/projects/:projectId/unlink-gap/:linkId` | Unlink gap from project | Yes |
| PATCH | `/api/projects/:id/toggle-gaps` | Toggle gap tracking for project | Yes |

**Gap Fields (Request/Response):**
- `id`, `title` (required), `description`
- `type` - feature|integration|performance|scalability|documentation|other
- `criticality` - must_have|should_have|nice_to_have (MoSCoW)
- `status` - workaround_available|roadmap_candidate|wont_do
- `workaroundDescription`, `affectedProducts`, `discoveredInProjectId`
- `createdBy`, `createdAt`, `updatedAt`

**Link Gaps Request Body:**
- `gapIds` - Array of gap IDs to link to the project

**Query Parameters:**
- `/api/gaps`: `type`, `criticality`, `status`, `search` for filtering

### 25. Project Outcomes & Intelligence (PCOS)

#### Project Outcomes
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/project-outcomes` | List all project outcomes | Yes |
| GET | `/api/project-outcomes/:projectId` | Get outcome for specific project | Yes |
| POST | `/api/project-outcomes` | Create project outcome | Yes |
| PATCH | `/api/project-outcomes/:id` | Update project outcome | Yes |
| DELETE | `/api/project-outcomes/:id` | Delete project outcome | Yes |
| GET | `/api/project-outcomes/statistics` | Get outcome statistics dashboard | Yes |
| GET | `/api/project-outcomes/missing` | Get projects missing outcomes | Yes |
| GET | `/api/project-outcomes/check-required/:projectId` | Check if outcome capture is required | Yes |

**Outcome Fields (Request/Response):**
- `projectId` (required), `outcome` (won|lost|no_decision)
- Moneyball Metrics: `technicalFitScore` (1-10), `politicalAlignmentScore` (1-10), `painRating` (1-10)
- `reasonCodes` - Array of reason codes for win/loss analysis
- `linkedGapIds` - Array of gap IDs linked to this outcome
- `notes`, `competitorInfo`, `lessonsLearned`
- `capturedBy`, `capturedAt`

**Statistics Response:**
- Win/loss counts and percentages
- Average Moneyball scores
- Reason code frequency distribution
- Quadrant analysis data

#### Outcome Configuration
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/outcome-config` | Get outcome configuration | Yes (Admin) |
| PATCH | `/api/outcome-config` | Update outcome configuration | Yes (Admin) |

**Configuration Fields:**
- `enabled` - Enable/disable outcome capture prompts
- `logicMode` - never|always|acv_only|frequency_only|acv_and_frequency|acv_or_frequency
- `acvThreshold` - Minimum ACV to trigger capture
- `frequencyInterval` - Projects count before prompting
- `closureCounter` - Current closure count

---

## Response Formats

### Success Response
```json
{
  "id": 1,
  "name": "Example",
  "createdAt": "2025-11-26T10:00:00.000Z",
  ...
}
```

### Error Response
```json
{
  "message": "Error description",
  "error": "Detailed error information"
}
```

### Paginated Response
```json
{
  "data": [...],
  "total": 100,
  "limit": 50,
  "offset": 0
}
```

---

## HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 204 | No Content (successful delete) |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (not logged in) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 500 | Internal Server Error |

---

## Rate Limiting

The API implements rate limiting on authentication endpoints to prevent abuse:
- Login attempts: Limited per IP address
- Password reset: Limited per email address

---

## WebSocket Events

CriteriaIQ uses WebSocket for real-time updates. Events are broadcast when:
- Project status changes
- MAP entities are updated
- Email automation triggers fire
- Configuration changes occur

---

## Adding New API Endpoints

### Technical Guide for Developers

1. **Define the route in `server/routes.ts`:**
```typescript
app.get('/api/your-endpoint', isAuthenticated, async (req: any, res) => {
  try {
    // Your logic here
    res.json(result);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Error message" });
  }
});
```

2. **Add storage methods to the matching mixin under `server/storage/<domain>.ts`** if database access is needed (see `server/storage/_mixins.ts` for the composition pattern). Avoid putting new method bodies in `server/storage.ts` itself — that file is now a thin composition shell.

3. **Add schema definitions in `shared/schema/`** for new tables (16 domain-based files; see `PROJECT_REFERENCE.md` → "Adding New Database Tables" for the picker)

4. **Use the `isAuthenticated` middleware** for protected endpoints

5. **Broadcast WebSocket events** for real-time updates:
```typescript
const broadcaster = getBroadcaster();
if (broadcaster) {
  broadcaster.broadcastMapUpdate({
    type: 'update_type',
    action: 'created',
    targetType: 'entity_type',
    targetId: entityId,
    data: { ... }
  });
}
```

---

## Best Practices

1. **Always use authentication** - Apply `isAuthenticated` middleware
2. **Validate input** - Use Zod schemas for request validation
3. **Handle errors gracefully** - Return appropriate status codes
4. **Log errors** - Use console.error for debugging
5. **Apply RBAC** - Check user roles for admin operations
6. **Use transactions** - For multi-step database operations
7. **Cache where appropriate** - Add cache headers for read endpoints
