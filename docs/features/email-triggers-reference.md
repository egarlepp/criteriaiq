# CriteriaIQ Workflow Automation Triggers Reference

**Version:** v0.12.0 <!-- @managed-version: written by ./update-version.sh from version.json -->  
**Last Updated:** April 23, 2026  
**Total Triggers:** 82

## Overview

CriteriaIQ's Workflow Automation system uses triggers to fire automated emails when specific events occur. Triggers are the foundation of the automation rules engine, enabling notifications, alerts, and workflow-driven communications.

## Architecture

### How Triggers Work

```
Event Occurs → Trigger Fires → Rules Evaluate → Conditions Check → Actions Execute
```

1. **Event Source**: An action occurs in the system (project created, task assigned, etc.)
2. **Trigger Detection**: The system detects the event and fires the corresponding trigger
3. **Rule Evaluation**: All active rules using that trigger are evaluated
4. **Condition Checking**: Rule conditions are checked against event metadata
5. **Action Execution**: If conditions pass, email actions are executed

### Single Source of Truth

All triggers are defined in `server/email-trigger-registry.ts`. On server startup, the auto-registration service syncs triggers to the database. This ensures:
- Consistent trigger availability across the system
- Automatic addition of new triggers on deployment
- UI components always reflect current triggers

### Trigger Flow

```
email-trigger-registry.ts (Source of Truth)
        ↓ (on server startup)
email-trigger-registration.ts (Auto-sync)
        ↓
email_triggers database table
        ↓ (via /api/email-automation/triggers)
Frontend UI (Trigger Origins, Create Rule)
```

---

## Trigger Categories

### 1. Authentication (10 triggers)

Triggers related to user authentication, security events, and account management.

| Trigger Key | Type | Description | Default |
|-------------|------|-------------|---------|
| `login.failed` | action | User login attempt fails | Enabled |
| `mfa.enabled` | action | User enables multi-factor authentication | Enabled |
| `mfa.disabled` | security_event | User disables MFA | Enabled |
| `password.changed` | security_event | User changes their password | Enabled |
| `password.reset_requested` | action | User requests password reset | Enabled |
| `password.reset_completed` | action | User completes password reset | Enabled |
| `account.locked` | security_event | Account locked after failed attempts | Enabled |
| `session.expired` | authentication_event | User session expires | Enabled |
| `user.created` | lifecycle | New user account created | Enabled |
| `user.approved` | lifecycle | User account approved by admin | Enabled |

**Metadata Schema Example (login.failed):**
```json
{
  "email": "string",
  "attempts": "number",
  "ipAddress": "string"
}
```

### 2. Project Notifications (10 triggers)

Triggers for project lifecycle events, status changes, and deadline alerts.

| Trigger Key | Type | Description | Default |
|-------------|------|-------------|---------|
| `project.created` | lifecycle | New project created | Enabled |
| `project.updated` | action | Project details updated | Enabled |
| `project.status_changed` | status_change | Project status changes | Enabled |
| `project.assigned` | assignment | Project assigned to engineer | Enabled |
| `project.deadline_approaching` | deadline | Project deadline approaching | Enabled |
| `project.end_date_approaching` | deadline | Project end date approaching | Enabled |
| `project.completed` | milestone | Project marked complete | Enabled |
| `project.archived` | lifecycle | Project archived | Enabled |
| `project.team_member_added` | assignment | Team member added to project | Enabled |
| `project.team_member_removed` | assignment | Team member removed from project | Enabled |

**Metadata Schema Example (project.status_changed):**
```json
{
  "projectId": "string",
  "projectName": "string",
  "oldStatus": "string",
  "newStatus": "string"
}
```

### 3. MAP - Mutual Action Plan (23 triggers)

Comprehensive triggers for MAP phases, steps, and tasks lifecycle.

The app raises only `map.<phase|step|task>.assigned`, `.completed`,
`.status_changed` and `.due_soon`; rules on those run and can email the
item's assignee, subject to each recipient's MAP email choices
([`working-calendar.md`](working-calendar.md#map-emails)). The other MAP
keys are registered but never raised.

#### Phase Triggers
| Trigger Key | Type | Description | Default |
|-------------|------|-------------|---------|
| `map.phase_started` | milestone | MAP phase started | Enabled |
| `map.phase_completed` | milestone | MAP phase completed | Enabled |
| `map.phase.started` | lifecycle | Phase started (alternate) | Enabled |
| `map.phase.completed` | milestone | Phase completed (alternate) | Enabled |
| `map.phase.assigned` | assignment | Phase assigned to user | Enabled |
| `map.phase.due_soon` | deadline | Phase due date approaching | Enabled |
| `map.phase.status_changed` | status_change | Phase status changes | Enabled |

#### Step Triggers
| Trigger Key | Type | Description | Default |
|-------------|------|-------------|---------|
| `map.step_started` | milestone | MAP step started | Enabled |
| `map.step_completed` | milestone | MAP step completed | Enabled |
| `map.step.started` | lifecycle | Step started (alternate) | Enabled |
| `map.step.completed` | milestone | Step completed (alternate) | Enabled |
| `map.step.assigned` | assignment | Step assigned to user | Enabled |
| `map.step.due_soon` | deadline | Step due date approaching | Enabled |
| `map.step.status_changed` | status_change | Step status changes | Enabled |

#### Task Triggers
| Trigger Key | Type | Description | Default |
|-------------|------|-------------|---------|
| `map.task_assigned` | assignment | MAP task assigned | Enabled |
| `map.task_completed` | milestone | MAP task completed | Enabled |
| `map.task_overdue` | deadline | MAP task overdue | Enabled |
| `map.task.started` | lifecycle | Task started | Enabled |
| `map.task.completed` | milestone | Task completed (alternate) | Enabled |
| `map.task.assigned` | assignment | Task assigned (alternate) | Enabled |
| `map.task.due_soon` | deadline | Task due date approaching | Enabled |
| `map.task.status_changed` | status_change | Task status changes | Enabled |

#### Overall MAP
| Trigger Key | Type | Description | Default |
|-------------|------|-------------|---------|
| `map.status_changed` | status_change | Overall MAP status changes | Enabled |

**Metadata Schema Example (map.task.assigned):**
```json
{
  "projectId": "string",
  "stepId": "string",
  "taskId": "string",
  "taskName": "string",
  "assignedTo": "string"
}
```

### 4. Communication (3 triggers)

Triggers for collaboration and file sharing events.

| Trigger Key | Type | Description | Default |
|-------------|------|-------------|---------|
| `comment.added` | content_update | Comment added to project | Enabled |
| `mention.user` | notification | User mentioned in comment/note | Enabled |
| `file.uploaded` | content_update | File uploaded to project | Enabled |

**Metadata Schema Example (mention.user):**
```json
{
  "projectId": "number",
  "mentionedUserId": "string",
  "mentionedBy": "string",
  "context": "string",
  "timestamp": "ISO8601 datetime"
}
```

### 5. Customer Portal (2 triggers)

Triggers for customer portal activity tracking.

| Trigger Key | Type | Description | Default |
|-------------|------|-------------|---------|
| `customer.portal_accessed` | activity | Customer accesses their portal | Enabled |
| `customer.document_viewed` | activity | Customer views a document | Enabled |

**Metadata Schema Example (customer.portal_accessed):**
```json
{
  "customerId": "string",
  "customerName": "string",
  "projectId": "string",
  "userId": "string",
  "accessedAt": "ISO8601 datetime"
}
```

### 6. Success Criteria (3 triggers)

Triggers for success criteria and validation workflow events.

| Trigger Key | Type | Description | Default |
|-------------|------|-------------|---------|
| `criteria.updated` | content_update | Success criteria updated | Enabled |
| `criteria.completed` | milestone | Success criteria completed | Enabled |
| `criteria.outcome_achieved` | milestone | Expected outcome achieved | Enabled |

**Metadata Schema Example (criteria.completed):**
```json
{
  "projectId": "string",
  "criteriaId": "string",
  "criteriaName": "string",
  "completedBy": "string",
  "completionDate": "ISO8601 datetime"
}
```

### 7. Risk Analysis (2 triggers)

Triggers for AI-powered risk analysis events.

| Trigger Key | Type | Description | Default |
|-------------|------|-------------|---------|
| `risk.level_changed` | status_change | Project risk level changes | Enabled |
| `risk.ai_analysis_completed` | notification | AI risk analysis completed | Enabled |

**Metadata Schema Example (risk.level_changed):**
```json
{
  "projectId": "string",
  "projectName": "string",
  "previousLevel": "string",
  "newLevel": "string",
  "changedBy": "string"
}
```

### 8. User Management (4 triggers)

Triggers for user lifecycle and role management.

| Trigger Key | Type | Description | Default |
|-------------|------|-------------|---------|
| `user.created` | lifecycle | New user account created | Enabled |
| `user.approved` | lifecycle | User account approved | Enabled |
| `user.role_changed` | security_event | User role changed | Enabled |
| `user.deactivated` | lifecycle | User account deactivated | Enabled |

**Metadata Schema Example (user.role_changed):**
```json
{
  "userId": "string",
  "email": "string",
  "previousRole": "string",
  "newRole": "string",
  "changedBy": "string"
}
```

### 9. Reports (2 triggers)

Triggers for report generation and sharing.

| Trigger Key | Type | Description | Default |
|-------------|------|-------------|---------|
| `report.generated` | content_creation | Report generated | Enabled |
| `report.shared` | notification | Report shared with users | Enabled |

**Metadata Schema Example (report.shared):**
```json
{
  "reportId": "number",
  "sharedBy": "string",
  "sharedWith": "array",
  "timestamp": "ISO8601 datetime"
}
```

### 10. System Alerts (9 triggers)

Triggers for system events, errors, and administrative actions.

| Trigger Key | Type | Description | Default |
|-------------|------|-------------|---------|
| `system.maintenance_scheduled` | notification | Maintenance scheduled | Enabled |
| `system.error` | action | System error requiring attention | Disabled |
| `system.error_occurred` | error | Critical system error | Disabled |
| `system.backup_completed` | notification | System backup completed | Disabled |
| `report.scheduled` | action | Scheduled report ready | Enabled |
| `feature.request.created` | lifecycle | Feature request created | Enabled |
| `support.request.created` | lifecycle | Support request created | Enabled |
| `support.request.updated` | action | Support request updated | Enabled |
| `system.announcement_published` | notification | System announcement published | Enabled |

### 11. Salesforce Integration (8 triggers) - NEW

Triggers for Salesforce sync events, record linking, and integration monitoring.

| Trigger Key | Type | Description | Default |
|-------------|------|-------------|---------|
| `salesforce.sync_completed` | notification | Salesforce sync run completes successfully | Enabled |
| `salesforce.sync_failed` | error | Salesforce sync run fails with errors | Enabled |
| `salesforce.record_linked` | action | CriteriaIQ record linked to Salesforce record | Enabled |
| `salesforce.record_unlinked` | action | Salesforce record link removed or broken | Enabled |
| `salesforce.update_pushed` | action | Workflow automation pushes update to Salesforce | Enabled |
| `salesforce.update_failed` | error | Workflow Salesforce update action fails | Enabled |
| `salesforce.connection_expired` | security_event | OAuth tokens expire and need re-authentication | Enabled |
| `salesforce.field_mapping_changed` | action | Admin creates/updates/deletes field mapping | Enabled |

**Metadata Schema Example (salesforce.sync_completed):**
```json
{
  "syncRunId": "number",
  "syncType": "string",
  "entity": "string",
  "recordsProcessed": "number",
  "recordsSucceeded": "number",
  "recordsFailed": "number",
  "duration": "number",
  "triggeredBy": "string",
  "timestamp": "ISO8601 datetime"
}
```

**Metadata Schema Example (salesforce.update_failed):**
```json
{
  "ruleId": "number",
  "ruleName": "string",
  "objectType": "string",
  "salesforceId": "string",
  "errorMessage": "string",
  "errorCode": "string",
  "retryAttempt": "number",
  "projectId": "string",
  "timestamp": "ISO8601 datetime"
}
```

### 12. Webhook Delivery (8 triggers) - NEW

Triggers for webhook delivery monitoring, retry tracking, and lifecycle events.

| Trigger Key | Type | Description | Default |
|-------------|------|-------------|---------|
| `webhook.delivery_succeeded` | notification | Webhook successfully delivered to endpoint | Enabled |
| `webhook.delivery_failed` | error | Webhook delivery attempt fails | Enabled |
| `webhook.retry_exhausted` | error | All webhook retry attempts exhausted | Enabled |
| `webhook.endpoint_unreachable` | error | Webhook endpoint unreachable (network/DNS failure) | Enabled |
| `webhook.response_error` | error | Webhook endpoint returns error response (4xx/5xx) | Enabled |
| `webhook.created` | lifecycle | New webhook configuration created | Enabled |
| `webhook.updated` | action | Webhook configuration modified | Enabled |
| `webhook.disabled` | action | Webhook disabled or deactivated | Enabled |

**Metadata Schema Example (webhook.delivery_succeeded):**
```json
{
  "webhookId": "number",
  "webhookName": "string",
  "endpointUrl": "string",
  "httpStatus": "number",
  "responseTime": "number",
  "ruleId": "number",
  "projectId": "string",
  "timestamp": "ISO8601 datetime"
}
```

**Metadata Schema Example (webhook.retry_exhausted):**
```json
{
  "webhookId": "number",
  "webhookName": "string",
  "endpointUrl": "string",
  "totalAttempts": "number",
  "lastErrorMessage": "string",
  "firstAttemptAt": "ISO8601 datetime",
  "lastAttemptAt": "ISO8601 datetime",
  "ruleId": "number",
  "projectId": "string",
  "timestamp": "ISO8601 datetime"
}
```

---

## Adding New Triggers

### Step-by-Step Guide

1. **Add to Registry** (`server/email-trigger-registry.ts`):

```typescript
{
  key: "your.trigger_key",
  category: "Your Category",
  type: "action|milestone|lifecycle|status_change|deadline|notification|security_event",
  origin: "source_system",
  defaultEnabled: true,
  description: "Description of when this trigger fires",
  metadataSchema: {
    field1: "string",
    field2: "number",
    timestamp: "ISO8601 datetime"
  }
}
```

2. **Restart Server**: The auto-registration service will add the trigger to the database

3. **Fire the Trigger** (in your code):

```typescript
import { evaluateAutomationRules } from './email-automation-service';

await evaluateAutomationRules({
  triggerKey: 'your.trigger_key',
  metadata: {
    field1: 'value1',
    field2: 123,
    timestamp: new Date().toISOString()
  }
});
```

### Best Practices

1. **Naming Convention**: Use dot notation for hierarchy (e.g., `project.status_changed`)
2. **Category Consistency**: Use existing categories when possible
3. **Metadata Schema**: Document all fields for rule conditions
4. **Default State**: Enable triggers that are commonly used
5. **Description**: Be specific about when the trigger fires

---

## Trigger Types Reference

| Type | Description | Example |
|------|-------------|---------|
| `action` | User performs an action | Login, upload, submit |
| `lifecycle` | Entity lifecycle event | Created, archived, deleted |
| `milestone` | Achievement or completion | Phase complete, task done |
| `status_change` | Status field changes | Status, risk level change |
| `deadline` | Time-based alert | Approaching due date |
| `notification` | Informational event | Mention, share, alert |
| `security_event` | Security-related | MFA change, password update |
| `assignment` | Ownership changes | Assigned, reassigned |
| `content_update` | Content modified | Comment, file, note |
| `error` | Error occurred | System error, failure |

---

## Trigger Origins Reference

| Origin | Description |
|--------|-------------|
| `authentication` | Login, MFA, session events |
| `project` | Project lifecycle events |
| `map` | Overall MAP events |
| `map_phase` | MAP phase events |
| `map_step` | MAP step events |
| `map_task` | MAP task events |
| `customer` | Customer portal events |
| `criteria` | Success criteria events |
| `risk` | Risk analysis events |
| `user` | User management events |
| `system` | System-wide events |
| `salesforce` | Salesforce integration events |
| `webhook` | Webhook delivery events |

---

## UI Integration

### Trigger Origins Page
Displays all triggers grouped by category with:
- Enable/disable toggle
- Trigger count by category
- Metadata schema preview

### Create Rule - Triggers Tab
Dropdown showing all available triggers for rule creation:
- Grouped by category
- Searchable
- Shows trigger description

### Accessing via API

```bash
GET /api/email-automation/triggers
```

Response includes all trigger details needed for UI rendering.

---

## Database Schema

The `email_triggers` table stores all triggers:

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| key | varchar | Unique trigger identifier |
| category | varchar | Grouping category |
| type | varchar | Trigger type |
| origin | varchar | Event source |
| source | varchar | 'system' or 'custom' |
| default_enabled | boolean | Default state |
| description | text | Trigger description |
| metadata_schema | jsonb | Expected metadata fields |
| created_at | timestamp | Creation time |
| updated_at | timestamp | Last update time |
