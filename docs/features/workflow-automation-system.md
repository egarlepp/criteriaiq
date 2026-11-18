# Workflow Automation System - Complete Documentation

## Table of Contents
1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Core Components](#core-components)
4. [Database Schema](#database-schema)
5. [User Interface Structure](#user-interface-structure)
6. [Usage Guide](#usage-guide)
7. [Developer Guide](#developer-guide)
8. [API Reference](#api-reference)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The **Workflow Automation System** is a comprehensive, production-ready framework for managing rule-based email communication workflows in CriteriaIQ. It provides centralized control over automated email notifications triggered by events throughout the application, with advanced features including test mode, quiet hours, digest aggregation, suppression windows, and real-time diagnostics.

### Key Capabilities

✅ **Centralized Rule Management** - Define triggers, conditions, and actions in a single interface  
✅ **29+ System Triggers** - Pre-defined events across 6 categories (Authentication, Projects, MAP, System, Communication, Reports)  
✅ **Custom Trigger Support** - Add organization-specific triggers for specialized workflows  
✅ **Test Mode** - Safely test automation without sending emails to real users  
✅ **User Preferences** - Individual control over email frequency and quiet hours  
✅ **Digest Scheduling** - Aggregate emails and send on custom cron schedules  
✅ **Suppression Windows** - Prevent duplicate notifications within configurable time periods  
✅ **Real-time Diagnostics** - Monitor rule execution, success rates, and troubleshoot issues  
✅ **3-Tier Navigation** - Sidebar supports nested sub-tab navigation with bidirectional URL sync  
✅ **WebSocket Updates** - Real-time UI updates for rule changes and execution events

### System Goals

1. **Reduce Email Fatigue** - Intelligent aggregation, suppression, and user preferences prevent inbox overload
2. **Increase Transparency** - Comprehensive audit logs and diagnostics for every rule execution
3. **Simplify Management** - Centralized interface for all workflow automation configuration
4. **Enable Customization** - Flexible rules engine supports complex business logic
5. **Ensure Reliability** - Test mode, validation, and error handling prevent broken workflows

---

## System Architecture

### High-Level Component Diagram

```
┌───────────────────────────────────────────────────────────────────────────┐
│                         Workflow Automation System                            │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐  │
│  │ Event Emitters  │─────▶│  Rule Evaluator  │─────▶│ Action Executor │  │
│  │  (App Events)   │      │  (Conditions)    │      │  (Send Email)   │  │
│  └─────────────────┘      └──────────────────┘      └─────────────────┘  │
│           │                        │                         │             │
│           │                        ▼                         ▼             │
│           │               ┌──────────────────┐     ┌─────────────────┐   │
│           │               │  Email Rules DB  │     │  Email Logs DB  │   │
│           │               └──────────────────┘     └─────────────────┘   │
│           │                                                               │
│           ▼                                                               │
│  ┌─────────────────┐                                                     │
│  │ Trigger Registry│                                                     │
│  │ (Auto-register) │                                                     │
│  └─────────────────┘                                                     │
│           │                                                               │
│           ▼                                                               │
│  ┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐ │
│  │ Test Mode       │      │ User Preferences │      │ Schedule Manager│ │
│  │ (Rerouting)     │      │ (Quiet Hours)    │      │ (Cron Digests)  │ │
│  └─────────────────┘      └──────────────────┘      └─────────────────┘ │
│                                                                            │
└───────────────────────────────────────────────────────────────────────────┘
```

### Data Flow Sequence

```
1. Event Occurs (e.g., project status changed)
   │
   ▼
2. Trigger Matched (e.g., "project.status_changed")
   │
   ▼
3. Rule Evaluation Engine Activated
   │
   ├─▶ Check if rule is enabled
   ├─▶ Check priority order (lower number = higher priority)
   ├─▶ Evaluate ALL conditions (AND logic)
   │   ├─▶ Project field checks (e.g., status == "In Progress")
   │   ├─▶ User role checks (e.g., role == "Admin")
   │   ├─▶ Time window checks (e.g., within business hours)
   │   └─▶ Custom property checks
   │
   ▼
4. If ALL conditions pass → Execute Actions
   │
   ├─▶ Check Test Mode (reroute if enabled)
   ├─▶ Check User Preferences (skip if "do_not_send")
   ├─▶ Check Quiet Hours (delay if in quiet window)
   ├─▶ Check Suppression Windows (skip if recently sent)
   ├─▶ Apply Schedule (immediate or digest aggregation)
   │
   ▼
5. Action Execution
   │
   ├─▶ Send Email (via Nodemailer + Gmail SMTP)
   ├─▶ Log to email_logs table
   ├─▶ Log to email_rule_audits table
   ├─▶ Broadcast WebSocket event (real-time UI update)
   │
   ▼
6. Post-Processing
   │
   ├─▶ Update suppression window timestamps
   ├─▶ Update schedule next_run_at (if digest)
   ├─▶ Trigger diagnostics refresh
   └─▶ Update statistics counters
```

### Key Design Principles

1. **Safe-First Execution** - Test mode prevents accidental email sends during development
2. **Fail-Safe Defaults** - Rules default to disabled, user preferences default to "project_decides"
3. **Audit Everything** - Every rule evaluation logged, regardless of outcome (fired/suppressed/skipped)
4. **Priority-Based Evaluation** - Lower priority numbers execute first (Admin override rules = priority 1)
5. **Non-Blocking Architecture** - Email sending is asynchronous, doesn't block app operations
6. **User Respect** - Quiet hours, suppression windows, and opt-out preferences honored system-wide

---

## Core Components

### 1. Email Trigger Registry

**Purpose:** Centralized catalog of all possible email trigger events in the application.

**Location:** `server/email-trigger-registry.ts`

**Features:**
- 29+ pre-defined system triggers across 6 categories
- Automatic registration on server startup
- Source distinction (`system` vs `custom`)
- Safe sync mechanism (add-only, never modifies existing triggers)

**Example Trigger Definition:**

```typescript
{
  key: "project.status_changed",
  category: "Project Notifications",
  type: "status_change",
  origin: "project",
  source: "system",
  defaultEnabled: true,
  description: "Triggered when a project's status changes (e.g., Planning → In Progress)"
}
```

**Trigger Categories:**

| Category | Count | Examples |
|----------|-------|----------|
| **Authentication** | 5 | `login.success`, `login.failed`, `mfa.enrolled` |
| **Project Notifications** | 9 | `project.created`, `project.status_changed`, `project.deadline_approaching` |
| **MAP (Mutual Action Plans)** | 7 | `map.phase_completed`, `map.step_assigned`, `map.task_overdue` |
| **System Alerts** | 4 | `system.error`, `system.maintenance_scheduled` |
| **Communication** | 3 | `message.received`, `comment.mentioned` |
| **Reports** | 2 | `report.generated`, `report.scheduled` |

**For detailed trigger documentation, see:** [EMAIL_AUTOMATION_TRIGGERS.md](./email-triggers-reference.md)

---

### 2. Rule Evaluation Engine

**Purpose:** Evaluates event payloads against configured rules to determine if actions should execute.

**Location:** `server/email-automation-engine.ts` (implementation file)

**Evaluation Logic:**

```typescript
// Pseudo-code representation
for each rule (ordered by priority ASC) {
  if (!rule.enabled) continue;
  
  if (rule.triggerKeys includes eventKey) {
    let allConditionsPass = true;
    
    for each condition in rule.conditions {
      if (!evaluateCondition(condition, eventPayload)) {
        allConditionsPass = false;
        break;
      }
    }
    
    if (allConditionsPass) {
      for each action in rule.actions {
        executeAction(action, eventPayload);
      }
      
      if (!rule.continueOnMatch) {
        break; // Stop evaluating remaining rules
      }
    }
  }
}
```

**Condition Types:**

| Condition Kind | Operator Examples | Use Case |
|----------------|-------------------|----------|
| `project_field` | `equals`, `not_equals`, `in`, `not_in` | Match project properties (status, customer, etc.) |
| `user_role` | `equals`, `in` | Target specific user roles (Admin, Engineer, etc.) |
| `timezone` | `equals`, `in` | Match user timezone for localized scheduling |
| `business_hours` | `within`, `outside` | Only send during business hours |
| `count_window` | `greater_than`, `less_than` | Rate limiting (e.g., max 3 per day) |
| `property_check` | `exists`, `not_exists` | Verify payload properties exist |

**Action Types:**

| Action | Parameters | Purpose |
|--------|------------|---------|
| `send_email` | `templateKey` or `templateId`, `recipientUserIds` (list; older rules use `recipientId`, and `"trigger_user"` means the user who fired the rule), optional `recipientTeamIds` / `recipientSubteamIds` ([teams](teams.md#teams-as-recipients), resolved to their members when the action runs) | Immediately send the email to each recipient |
| `trigger_webhook` | `webhookId`, `payload` | Send HTTP webhook to external system (Teams, Slack, etc.) |
| `update_salesforce` | `objectType`, `fieldUpdates`, `skipDirtyCheck` | Update Salesforce record fields immediately |
| `schedule_digest` | `recipientUserIds` and `recipientTeamIds` / `recipientSubteamIds` (optional; with neither set, it goes to the user who fired the rule) | Queue the event for the rule's next Email Digest schedule run (see [Digests](#digests)) |
| `suppress_for` | `duration` (e.g., `"24h"`) | Prevent duplicate sends for time window |
| `delay` | `duration`, `unit` | Not supported yet: recorded as skipped, nothing is scheduled |
| `escalate` | `escalateTo`, `afterDuration` | Send reminder if no response |
| `log_only` | - | Audit without sending (testing/debugging) |

---

### Digests

1. When a rule's **Schedule Digest** action runs, the event is queued: the
   rule's audit row (`email_rule_audits`) records the recipients under
   `metadata.executionResults[].digestRecipientIds`. Nothing is written to
   `email_schedules`.
2. An **Email Digest** schedule for the rule (Configuration → Scheduler)
   calls `processDigestSend(ruleId)`. It gathers the events queued in the
   last 31 days that each recipient hasn't received and sends each
   recipient one summary email. Test mode reroutes it like rule emails,
   and the recipient's email preferences and suppression windows apply.
3. Each recipient who got the digest is added to the audit row's
   `metadata.digestSentTo`, so the event is not sent to them again.
4. Quiet hours and the max emails per hour (Send Email Window) apply. A
   recipient over the hourly limit keeps their events for the next run.

The helpers live in `server/email/digest-utils.ts`; tests in
`server/email/__tests__/digest-utils.test.ts` and
`digest.integration.test.ts`. Earlier versions inserted blank
`email_schedules` rows and digests never sent; migration
`088_remove_blank_digest_schedules.sql` deletes those rows.

---

### Salesforce Update Action

The `update_salesforce` action enables workflow rules to directly update Salesforce records with dynamic field values. This action bypasses the normal 5-minute batch queue and executes immediately when the rule fires.

**Supported Object Types:**
- `Opportunity` - Update deal-related fields
- `Account` - Update company/organization fields
- `Contact` - Update individual person fields
- `Task` - Update Salesforce task fields

**Configuration Schema:**

```typescript
interface SalesforceUpdateAction {
  type: "update_salesforce";
  objectType: "opportunity" | "account" | "contact" | "task";
  fieldUpdates: Array<{
    salesforceField: string;       // Salesforce API field name (e.g., "StageName", "Next_Step__c")
    value: string | DynamicValue;  // Static value or dynamic expression
    updateType: "static" | "dynamic" | "template";
  }>;
  skipDirtyCheck?: boolean;  // Skip comparison, always push update (default: false)
  retryConfig?: {
    maxAttempts: number;     // Default: 3
    backoffMultiplier: number; // Default: 2 (exponential backoff)
    initialDelayMs: number;  // Default: 1000
  };
}
```

**Dynamic Value Expressions:**

Use template syntax to insert event payload values:

```json
{
  "type": "update_salesforce",
  "objectType": "opportunity",
  "fieldUpdates": [
    {
      "salesforceField": "StageName",
      "value": "Closed Won",
      "updateType": "static"
    },
    {
      "salesforceField": "Description",
      "value": "{{project.name}} - Closed on {{date}}",
      "updateType": "template"
    },
    {
      "salesforceField": "Next_Step__c",
      "value": "{{payload.nextStep}}",
      "updateType": "dynamic"
    }
  ]
}
```

**Features:**
- ✅ **Immediate Execution** - Bypasses batch queue for real-time updates
- ✅ **Dirty Check** - Only pushes updates when values have changed (configurable)
- ✅ **Exponential Backoff** - Automatic retry with increasing delays on failure
- ✅ **Template Support** - Dynamic value injection from event payload
- ✅ **Audit Trail** - All updates logged to `email_rule_audits` table

---

### 3. User Preference System

**Purpose:** Give individual users control over email frequency and timing.

**Location:** Database table `user_email_preferences`

**Preference Options:**

```typescript
interface UserEmailPreferences {
  userId: string;
  overallPreference: "do_not_send" | "project_decides";  // Global kill switch
  phasesPreference: "do_not_send" | "project_decides";   // MAP phase emails
  stepsPreference: "do_not_send" | "project_decides";    // MAP step emails
  tasksPreference: "do_not_send" | "project_decides";    // MAP task emails
  quietHoursStart: number;  // Hour (0-23) in user's timezone
  quietHoursEnd: number;    // Hour (0-23) in user's timezone
}
```

**Evaluation Logic:**

1. If `overallPreference === "do_not_send"` → Skip ALL emails (except critical system alerts)
2. If specific preference (phases/steps/tasks) === `"do_not_send"` → Skip that category
3. If current time in quiet hours window → Delay email until quiet hours end
4. Otherwise → Proceed with send (if rule conditions pass)

**Quiet Hours Example:**

```
User timezone: America/New_York (EST)
quietHoursStart: 20 (8:00 PM)
quietHoursEnd: 8 (8:00 AM)

Email triggered at 9:00 PM EST → Delayed until 8:00 AM EST next day
```

---

### 4. Test Mode System

**Purpose:** Safely test automation rules without sending emails to real users.

**Configuration:**

```typescript
interface TestModeConfig {
  enabled: boolean;
  testEmailAddresses: string[];  // All emails rerouted to these addresses
}
```

**Behavior When Enabled:**

- ✅ Rules evaluate normally
- ✅ Conditions check actual event data
- ✅ Audit logs record original recipients
- ❌ Real user email addresses **never** receive emails
- ✅ Test addresses receive all emails with special header: `[TEST MODE]`
- ✅ Prominent UI banner warns that test mode is active

**UI Location:** Communications → Workflow Automation → Overview tab → Test Mode Configuration card

---

### 5. Schedule Management System

**Purpose:** Support recurring digest emails sent on custom cron schedules.

**Features:**

- ✅ Cron expression support (e.g., `0 9 * * 1-5` = weekdays at 9 AM)
- ✅ Timezone-aware scheduling
- ✅ Next run calculation and display
- ✅ Active/inactive toggle
- ✅ Manual trigger option (Admin only)

**Use Cases:**

1. **Daily Project Summary Digest** - Aggregate all project updates from the day, send at 5 PM
2. **Weekly MAP Progress Report** - Summary of completed phases/steps/tasks, sent Friday afternoons
3. **Monthly Executive Dashboard** - High-level metrics sent first Monday of each month

**Example Schedule Configuration:**

```json
{
  "ruleId": 42,
  "cron": "0 17 * * 1-5",
  "timezone": "America/New_York",
  "active": true,
  "metadata": {
    "aggregationWindow": "24h",
    "maxItemsPerDigest": 50,
    "groupBy": "project"
  }
}
```

---

### 6. Diagnostics & Audit System

**Purpose:** Comprehensive logging and monitoring of all rule executions.

**Logged Data:**

| Field | Description | Example |
|-------|-------------|---------|
| `ruleId` | Which rule evaluated | `42` |
| `eventKey` | Trigger that fired | `"project.status_changed"` |
| `input` | Full event payload (JSONB) | `{ projectId: 5, oldStatus: "Planning", newStatus: "In Progress" }` |
| `decision` | Outcome of evaluation | `"fired"`, `"suppressed"`, `"skipped"`, `"failed"` |
| `reason` | Human-readable explanation | `"Suppressed: Sent similar email 2 hours ago"` |
| `conditionsEvaluated` | Total conditions checked | `3` |
| `conditionsPassed` | Conditions that matched | `3` |
| `actionsExecuted` | Actions successfully run | `1` |
| `actionsFailed` | Actions that errored | `0` |
| `executionTimeMs` | Performance metric | `47` |
| `emailLogId` | Link to sent email (if applicable) | `523` |
| `createdAt` | Timestamp | `2025-10-23T14:32:15Z` |

**Decision Types:**

- **`fired`** - All conditions passed, actions executed successfully
- **`suppressed`** - Conditions passed but action suppressed (quiet hours, suppression window, user preference)
- **`skipped`** - Conditions did not pass, no actions executed
- **`failed`** - Error occurred during evaluation or action execution

**UI Features:**

- Real-time execution feed (WebSocket updates)
- Filterable by rule, trigger, status, date range
- Sortable by timestamp, execution time, decision
- Expandable detail view with full JSON payloads
- Statistics cards (total executions, success rate, avg execution time)

---

## Database Schema

### Table Relationships Diagram

```
┌────────────────────┐
│  email_triggers    │
│  (Catalog)         │
└────────┬───────────┘
         │ Referenced by
         │ (triggerKeys)
         ▼
┌────────────────────┐         ┌────────────────────────┐
│  email_rules       │◀────────│ email_rule_conditions  │
│  (Rules)           │         │ (IF logic)             │
└────────┬───────────┘         └────────────────────────┘
         │
         │ Referenced by        ┌────────────────────────┐
         ├─────────────────────▶│ email_rule_actions     │
         │                      │ (THEN logic)           │
         │                      └────────────────────────┘
         │
         │ Referenced by        ┌────────────────────────┐
         ├─────────────────────▶│ email_schedules        │
         │                      │ (Cron jobs)            │
         │                      └────────────────────────┘
         │
         │ Referenced by        ┌────────────────────────┐
         └─────────────────────▶│ email_rule_audits      │
                                │ (Execution logs)       │
                                └────────┬───────────────┘
                                         │ References
                                         ▼
┌────────────────────┐         ┌────────────────────────┐
│  email_templates   │         │  email_logs            │
│  (Content)         │         │  (Sent emails)         │
└────────────────────┘         └────────────────────────┘

┌────────────────────┐
│  email_designs     │
│  (Layouts)         │
└────────────────────┘

┌─────────────────────────┐
│ user_email_preferences  │
│ (User settings)         │
└─────────────────────────┘
```

### Schema Details

#### `email_triggers`

**Purpose:** Catalog of all possible trigger events.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial | Primary key |
| `key` | varchar (unique) | Trigger identifier (e.g., `"project.status_changed"`) |
| `category` | varchar | Grouping (e.g., `"Project Notifications"`) |
| `type` | varchar | Event type (e.g., `"status_change"`, `"assignment"`) |
| `origin` | varchar | Source system (e.g., `"project"`, `"map_phase"`) |
| `source` | varchar | `"system"` or `"custom"` (auto-registered vs manual) |
| `defaultEnabled` | boolean | Default state for new installations |
| `description` | text | Human-readable explanation |
| `metadataSchema` | jsonb | JSON Schema for event payload validation |
| `createdAt` | timestamp | Record creation time |
| `updatedAt` | timestamp | Last modification time |

**Indexes:**
- `idx_email_triggers_category` on `category`
- `idx_email_triggers_origin` on `origin`
- `idx_email_triggers_source` on `source`

---

#### `email_rules`

**Purpose:** Defines when and how to send emails.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial | Primary key |
| `name` | varchar | Rule name (e.g., `"Notify Admin on Project Status Change"`) |
| `description` | text | Detailed explanation of rule purpose |
| `enabled` | boolean | Active/inactive toggle |
| `priority` | integer | Evaluation order (lower = higher priority, default 100) |
| `triggerKeys` | jsonb | Array of trigger keys this rule matches (e.g., `["project.status_changed"]`) |
| `continueOnMatch` | boolean | If true, continue evaluating lower-priority rules after match |
| `createdBy` | varchar | User ID who created rule |
| `updatedBy` | varchar | User ID who last modified rule |
| `createdAt` | timestamp | Record creation time |
| `updatedAt` | timestamp | Last modification time |

**Indexes:**
- `idx_email_rules_enabled` on `enabled`
- `idx_email_rules_priority` on `priority`

---

#### `email_rule_conditions`

**Purpose:** Defines the IF logic for rules.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial | Primary key |
| `ruleId` | integer | Foreign key to `email_rules.id` (cascade delete) |
| `kind` | varchar | Condition type (e.g., `"project_field"`, `"user_role"`) |
| `operator` | varchar | Comparison operator (e.g., `"equals"`, `"in"`, `"greater_than"`) |
| `value` | jsonb | Comparison value(s) - flexible structure based on `kind` |
| `orderIndex` | integer | Evaluation order within rule |
| `createdAt` | timestamp | Record creation time |

**Indexes:**
- `idx_email_rule_conditions_rule` on `ruleId`

**Example Condition:**

```json
{
  "kind": "project_field",
  "operator": "equals",
  "value": {
    "field": "status",
    "targetValue": "In Progress"
  }
}
```

---

#### `email_rule_actions`

**Purpose:** Defines the THEN logic for rules.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial | Primary key |
| `ruleId` | integer | Foreign key to `email_rules.id` (cascade delete) |
| `action` | varchar | Action type (e.g., `"send_email"`, `"schedule_digest"`) |
| `params` | jsonb | Action-specific parameters |
| `orderIndex` | integer | Execution order within rule |
| `createdAt` | timestamp | Record creation time |

**Indexes:**
- `idx_email_rule_actions_rule` on `ruleId`

**Example Action:**

```json
{
  "action": "send_email",
  "params": {
    "templateKey": "project_status_update",
    "designId": 1,
    "to": "{{primaryEngineerEmail}}",
    "cc": "{{specialistEngineerEmail}}"
  }
}
```

---

#### `email_schedules`

**Purpose:** Manages digest and scheduled email sends.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial | Primary key |
| `ruleId` | integer | Foreign key to `email_rules.id` (cascade delete) |
| `rrule` | text | RFC 5545 recurrence rule (complex schedules) |
| `cron` | varchar | Cron expression (simpler alternative to rrule) |
| `timezone` | varchar | Timezone for schedule evaluation (default: `"America/New_York"`) |
| `nextRunAt` | timestamp | Calculated next execution time |
| `lastRunAt` | timestamp | Last successful execution time |
| `active` | boolean | Schedule enabled/disabled |
| `metadata` | jsonb | Additional config (digest settings, aggregation rules) |
| `createdAt` | timestamp | Record creation time |
| `updatedAt` | timestamp | Last modification time |

**Indexes:**
- `idx_email_schedules_next_run` on `nextRunAt`
- `idx_email_schedules_active` on `active`

---

#### `email_rule_audits`

**Purpose:** Comprehensive logging of all rule evaluations.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial | Primary key |
| `ruleId` | integer | Foreign key to `email_rules.id` (set null on delete) |
| `eventKey` | varchar | Trigger key that fired |
| `input` | jsonb | Full event payload (for debugging) |
| `decision` | varchar | `"fired"`, `"suppressed"`, `"skipped"`, `"failed"` |
| `reason` | text | Human-readable explanation of decision |
| `emailLogId` | integer | Foreign key to `email_logs.id` (if email sent) |
| `executionTimeMs` | integer | Performance metric |
| `conditionsEvaluated` | integer | Total conditions checked |
| `conditionsPassed` | integer | Conditions that matched |
| `actionsExecuted` | integer | Actions successfully executed |
| `actionsFailed` | integer | Actions that errored |
| `metadata` | jsonb | Additional debug/context data |
| `createdAt` | timestamp | Execution timestamp |

**Indexes:**
- `idx_email_rule_audits_rule` on `ruleId`
- `idx_email_rule_audits_event` on `eventKey`
- `idx_email_rule_audits_decision` on `decision`
- `idx_email_rule_audits_created` on `createdAt`

---

#### `user_email_preferences`

**Purpose:** User-specific email notification preferences.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial | Primary key |
| `userId` | varchar (unique) | Foreign key to `users.id` (cascade delete) |
| `overallPreference` | varchar | `"do_not_send"` or `"project_decides"` (default) |
| `phasesPreference` | varchar | MAP phase email preference |
| `stepsPreference` | varchar | MAP step email preference |
| `tasksPreference` | varchar | MAP task email preference |
| `quietHoursStart` | integer | Hour (0-23) in user's timezone |
| `quietHoursEnd` | integer | Hour (0-23) in user's timezone |
| `createdAt` | timestamp | Record creation time |
| `updatedAt` | timestamp | Last modification time |

**Indexes:**
- `idx_user_email_prefs_user` on `userId`

---

#### `email_logs`

**Purpose:** Audit trail of all sent emails.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial | Primary key |
| `toEmail` | varchar | Recipient address |
| `fromEmail` | varchar | Sender address |
| `subject` | varchar | Email subject line |
| `textContent` | text | Plain text version |
| `htmlContent` | text | HTML version |
| `emailType` | varchar | Category (e.g., `"general"`, `"password_reset"`) |
| `messageId` | varchar | SMTP message ID (for tracking) |
| `userId` | varchar | Associated user (if applicable) |
| `projectId` | integer | Associated project (if applicable) |
| `success` | boolean | Delivery status |
| `error` | text | Error message (if failed) |
| `sentAt` | timestamp | Send time |
| `createdAt` | timestamp | Record creation time |

---

#### `email_templates`

**Purpose:** Reusable email content with variable interpolation.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial | Primary key |
| `name` | varchar | Human-readable name |
| `templateKey` | varchar (unique) | System key (e.g., `"project_status_update"`) |
| `description` | text | Usage explanation |
| `category` | varchar | Grouping (e.g., `"project_notifications"`) |
| `emailType` | varchar | Links to `email_logs.emailType` |
| `toField` | text | To recipients with variables (e.g., `"{{primaryEngineerEmail}}"`) |
| `ccField` | text | CC recipients with variables |
| `bccField` | text | BCC recipients with variables |
| `subject` | varchar | Subject line with variable support |
| `textContent` | text | Plain text version with variables |
| `htmlContent` | text | HTML version with variables |
| `variables` | jsonb | Available variables with descriptions |
| `isActive` | boolean | Template enabled/disabled |
| `isSystem` | boolean | System-managed (cannot delete) |
| `includeProjectPdf` | boolean | Attach project PDF |
| `triggerEvents` | text[] | Events that use this template |
| `recipientType` | varchar | `"admin"`, `"internal"`, `"external"` (comma-separated) |
| `createdBy` | varchar | User ID |
| `updatedBy` | varchar | User ID |
| `createdAt` | timestamp | Record creation time |
| `updatedAt` | timestamp | Last modification time |

---

#### `email_designs`

**Purpose:** Reusable email layouts (header, footer, styling).

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial | Primary key |
| `name` | varchar | Design name |
| `description` | text | Usage notes |
| `htmlRaw` | text | Raw HTML with placeholders (e.g., `{{TEXT_CONTENT}}`) |
| `isActive` | boolean | Design enabled/disabled |
| `isSystem` | boolean | System-managed (cannot delete) |
| `designVariables` | jsonb | Layout-specific variables |
| `createdAt` | timestamp | Record creation time |
| `updatedAt` | timestamp | Last modification time |

---

## User Interface Structure

### Navigation Hierarchy

The Workflow Automation system uses CriteriaIQ's standardized 3-tier navigation architecture:

```
Sidebar → Communications (top-level)
    └─▶ Workflow Automation (1st submenu)
            ├─▶ Overview (2nd subtab)
            ├─▶ Rules (2nd subtab)
            ├─▶ Schedules (2nd subtab)
            ├─▶ Trigger Origins (2nd subtab)
            └─▶ Diagnostics (2nd subtab)
```

**URL Structure:**

- Base: `/admin?tab=workflow-automation`
- With view: `/admin?tab=workflow-automation&subtab=rules`

**Bidirectional Sync:**

1. Clicking sidebar item updates URL and page state
2. Clicking page tab updates URL and sidebar highlighting
3. Browser back/forward buttons work correctly (popstate events)
4. Direct URL navigation highlights correct sidebar + tab

---

### Tab Breakdown

#### 1. Overview Tab

**Purpose:** High-level system status, test mode configuration, and KPI monitoring.

**Components:**

- **Test Mode Configuration Card**
  - Toggle switch (enabled/disabled)
  - Test email address management (add/remove)
  - Visual indicator of current state
  - Warning: "All automated emails will be sent to test addresses below"

- **KPI Statistics Grid** (4 cards)
  - **Active Rules**: Count of enabled rules
  - **Emails Sent**: Total sent in last 7 days
  - **Scheduled Items**: Pending digest sends
  - **Success Rate**: Percentage of successful deliveries (last 7 days)

- **Execution Feed** (Recent Activity)
  - Last 10 rule executions
  - Timestamp, rule name, decision, trigger
  - Link to full diagnostics view

**Real-time Updates:**
- WebSocket broadcasts update KPIs instantly
- New executions appear in feed without refresh

---

#### 2. Rules Tab

**Purpose:** Create, edit, enable/disable, and delete automation rules.

**Components:**

- **Search & Filter Section**
  - Text search (name, description)
  - Status filter (all, enabled, disabled)

- **Rules Table**
  - Columns: Name, Description, Triggers, Priority, Status, Actions
  - Actions: Enable/Disable toggle, Edit, Delete
  - Visual priority indicator (lower number = higher priority)
  - Trigger count badge (e.g., "3 triggers")

- **Create/Edit Rule Dialog**
  - **Basic Info**: Name, description, priority
  - **Triggers**: Multi-select dropdown (checkboxes)
  - **Conditions**: Dynamic form based on condition kind
    - Add/remove conditions (AND logic)
    - Kind selector: Project Field, User Role, Timezone, etc.
    - Operator selector: equals, in, greater_than, etc.
    - Value input: Text, dropdown, or JSON (context-sensitive)
  - **Actions**: Dynamic form based on action type
    - Add/remove actions (sequential execution)
    - Action selector: Send Email, Schedule Digest, Suppress For, etc.
    - Parameter inputs: Template, design, recipients, duration
  - **Advanced Options**: Continue on match, enabled state

**Validation:**
- At least 1 trigger required
- At least 1 action required
- Priority must be positive integer
- Condition values validated based on kind/operator

---

#### 3. Schedules (moved)

The Schedules tab was removed. Workflow schedules (digests and the other
scheduled actions) and the Send Email Window (quiet hours and max emails
per hour) now live on **Configuration → Scheduler**; old
`subtab=schedules` links redirect there. See `docs/features/scheduler.md`.

---

#### 4. Trigger Origins Tab

**Purpose:** Browse and search all available trigger events.

**Components:**

- **Search & Filter Section**
  - Text search (key, description)
  - Category filter (dropdown)

- **Triggers Grid** (Grouped by category)
  - Expandable category sections
  - Trigger cards showing:
    - Key (e.g., `"project.status_changed"`)
    - Description
    - Source badge (System = blue, Custom = purple)
    - Rule count (e.g., "Used in 3 rules")
    - Default enabled status

- **Category Icons**
  - Authentication: Shield
  - Project Notifications: FolderGit2
  - MAP: GitBranch
  - System Alerts: AlertTriangle
  - Communication: MessageSquare
  - Reports: BarChart3

**Features:**
- Click trigger to filter rules tab by that trigger
- Visual distinction between system and custom triggers
- Total trigger count with filter count (e.g., "12 of 29 triggers")

---

#### 5. Diagnostics Tab

**Purpose:** Monitor rule execution, troubleshoot issues, and analyze performance.

**Components:**

- **Statistics Cards** (4 metrics)
  - Total Executions (last 30 days)
  - Success Rate (percentage)
  - Average Execution Time (milliseconds)
  - Failed Executions (count)

- **Advanced Filters**
  - Date range picker (start/end dates)
  - Trigger filter (multi-select, checkboxes)
  - Rule filter (multi-select, checkboxes)
  - Status filter (multi-select: matched, skipped, failed)
  - Clear all filters button

- **Execution Feed Table**
  - Columns: Timestamp, Rule, Trigger, Status, Execution Time, Actions
  - Sortable columns (click header to toggle asc/desc)
  - Expandable rows showing:
    - Full event payload (JSON viewer)
    - Conditions evaluated breakdown
    - Actions executed details
    - Error messages (if failed)
    - Link to sent email (if applicable)
  - Pagination controls (limit 50 per page)

- **Export Options** (future feature)
  - CSV export of filtered results
  - JSON export of detailed logs

**Status Indicators:**

| Status | Badge Color | Icon | Description |
|--------|-------------|------|-------------|
| Matched | Green | CheckCircle | Conditions passed, actions executed |
| Skipped | Gray | MinusCircle | Conditions did not pass |
| Failed | Red | XCircle | Error during evaluation or execution |

---

## Usage Guide

### Getting Started

#### Step 1: Enable Test Mode

**Why:** Prevent accidental emails to real users during configuration.

1. Navigate to **Communications → Workflow Automation → Overview**
2. Locate **Test Mode Configuration** card
3. Toggle "Enable Test Mode" to **ON**
4. Add test email addresses:
   - Enter email in input field
   - Click **Add** or press Enter
   - Repeat for all test recipients (recommend 2-3 addresses)
5. Verify test mode banner appears at top of page

**Result:** All automated emails now route to test addresses only.

---

#### Step 2: Review Available Triggers

**Why:** Understand what events can trigger emails.

1. Navigate to **Trigger Origins** tab
2. Browse categories or use search
3. Note triggers relevant to your use case
4. Example common triggers:
   - `project.status_changed`
   - `map.phase_completed`
   - `project.deadline_approaching`

---

#### Step 3: Create Your First Rule

**Scenario:** Send email to primary engineer when project status changes to "In Progress".

1. Navigate to **Rules** tab
2. Click **Create Rule**
3. **Fill Basic Info:**
   - Name: `"Notify Engineer on Project Start"`
   - Description: `"Send email to primary engineer when project status changes to In Progress"`
   - Priority: `100` (default)
   - Enabled: ✅ (checked)
4. **Select Trigger:**
   - Open "Triggers" multi-select
   - Check `project.status_changed`
5. **Add Condition:**
   - Click **Add Condition**
   - Kind: `Project Field`
   - Operator: `equals`
   - Field: `status`
   - Value: `In Progress`
6. **Add Action:**
   - Click **Add Action**
   - Action: `Send Email`
   - Template: Select `"Project Status Update"`
   - Design: Select `"Default Design"`
   - To: `{{primaryEngineerEmail}}`
   - CC: (leave blank or add `{{specialistEngineerEmail}}`)
7. Click **Save Rule**

**Result:** Rule created and enabled. Test by changing a project status to "In Progress" (email will route to test addresses).

---

#### Step 4: Test the Rule

1. Navigate to a project
2. Change status from "Planning" to "In Progress"
3. Check test email inbox (should receive email within 1-2 minutes)
4. Navigate to **Diagnostics** tab
5. Verify execution appears in feed with status "Matched"
6. Expand row to view details

**Troubleshooting:**
- If no email received: Check Diagnostics for "Failed" or "Suppressed" status
- If status is "Skipped": Verify conditions match (check event payload in Diagnostics)
- If status is "Failed": Check error message in expanded row

---

#### Step 5: Disable Test Mode (Production Readiness)

**When:** After testing all rules and verifying behavior.

1. Navigate to **Overview** tab
2. Toggle "Enable Test Mode" to **OFF**
3. Confirm warning dialog: "Emails will now be sent to real users"
4. Test mode banner disappears
5. Verify one rule with low-risk trigger (e.g., internal notification)

**Result:** System now sends emails to actual recipients.

---

### Common Use Cases

#### Use Case 1: Daily Project Summary Digest

**Goal:** Send one email per day with all project updates.

**Setup:**

1. **Create Rule:**
   - Name: `"Daily Project Summary"`
   - Triggers: `project.status_changed`, `project.customer_added`, `project.updated`
   - Conditions: None (all projects)
   - Actions: Schedule Digest, with the recipients ticked (or none, to send to whoever triggered the rule)

2. **Create Schedule:**
   - Go to **Configuration → Scheduler → Workflow schedules**
   - Click **Add schedule** and pick **Email Digest**
   - Rule: Select `"Daily Project Summary"`
   - Cron: `0 17 * * 1-5` (weekdays at 5 PM)
   - Timezone: `America/New_York`
   - Active: ✅

**Result:** All project updates throughout the day aggregate and send as one email at 5 PM EST on weekdays.

---

#### Use Case 2: Critical Admin Alerts

**Goal:** Immediately notify admins of system errors, bypassing quiet hours and suppression.

**Setup:**

1. **Create Rule:**
   - Name: `"Critical System Alert - Admin"`
   - Priority: `1` (highest priority)
   - Triggers: `system.error`, `system.critical`
   - Conditions:
     - User Role `equals` `Admin`
   - Actions: `send_email` (template: `"System Alert"`, to: `{{adminEmail}}`)
   - Continue on match: ✅ (allow other rules to also fire)

2. **Configure Action Params:**
   - Override quiet hours: `true`
   - Override suppression: `true`

**Result:** Admins receive immediate email for critical issues, regardless of time or recent notifications.

---

#### Use Case 3: MAP Milestone Notifications

**Goal:** Notify primary engineer when MAP phase completes.

**Setup:**

1. **Create Rule:**
   - Name: `"MAP Phase Completed Notification"`
   - Triggers: `map.phase_completed`
   - Conditions:
     - Project Field `status` `not_equals` `Cancelled`
   - Actions: `send_email` (template: `"MAP Phase Milestone"`, to: `{{primaryEngineerEmail}}`)

2. **Add Suppression:**
   - Add second action: `suppress_for` (duration: `1h`)
   - Purpose: Prevent duplicate emails if multiple phases complete rapidly

**Result:** Primary engineer notified of each phase completion, with 1-hour cooldown.

---

### Managing User Preferences

**Location:** User Profile Editor → Email Preferences tab (future feature) or Admin-managed

**Options:**

1. **Overall Preference:**
   - `Project Decides` (default): Receive emails based on project role
   - `Do Not Send`: Disable ALL automated emails (except critical system alerts)

2. **MAP-Specific Preferences:**
   - Phases: Enable/disable phase completion emails
   - Steps: Enable/disable step assignment emails
   - Tasks: Enable/disable task assignment emails

3. **Quiet Hours:**
   - Start: Hour of day (0-23) in user's timezone
   - End: Hour of day (0-23) in user's timezone
   - Behavior: Emails triggered during quiet hours delayed until end time

**Admin Override:**

Admins can configure quiet hours and preferences for users via database or API (UI coming soon).

---

## Developer Guide

### Triggering an Workflow Automation Event

**Location:** Anywhere in the application where an event occurs.

**Pattern:**

```typescript
import { triggerEmailAutomation } from '../server/email-automation-engine';

// After project status update
const eventPayload = {
  projectId: project.id,
  projectName: project.name,
  oldStatus: previousStatus,
  newStatus: newStatus,
  updatedBy: userId,
  updatedByName: userName,
  timestamp: new Date().toISOString()
};

await triggerEmailAutomation('project.status_changed', eventPayload);
```

**Important:**

1. **Event Key** must match a trigger key in `email_triggers` table
2. **Payload** should include all relevant context for rule evaluation
3. **Async Call** - Use `await` to ensure logging, but doesn't block critical operations
4. **Error Handling** - Function logs errors internally, doesn't throw

---

### Adding a New Trigger

**Step 1: Define in Registry**

Edit `server/email-trigger-registry.ts`:

```typescript
{
  key: "custom.sales_handoff",
  category: "Communication",
  type: "assignment",
  origin: "custom",
  source: "system", // Will auto-register
  defaultEnabled: true,
  description: "Triggered when a project is handed off from sales to engineering"
}
```

**Step 2: Restart Server**

Trigger auto-registration:

```bash
npm run dev
```

**Step 3: Verify Registration**

1. Navigate to **Trigger Origins** tab
2. Search for `custom.sales_handoff`
3. Confirm it appears with "System" badge

**Step 4: Use in Application**

```typescript
await triggerEmailAutomation('custom.sales_handoff', {
  projectId: project.id,
  fromUser: salesRepId,
  toUser: engineerId,
  notes: handoffNotes
});
```

---

### Creating a Custom Condition Kind

**Location:** `server/email-automation-engine.ts` (condition evaluator)

**Pattern:**

```typescript
function evaluateCondition(condition, eventPayload) {
  switch (condition.kind) {
    case 'project_field':
      return checkProjectField(condition, eventPayload);
    
    case 'custom_budget_check':  // New condition kind
      const projectBudget = eventPayload.budget || 0;
      const threshold = condition.value.threshold;
      
      switch (condition.operator) {
        case 'greater_than':
          return projectBudget > threshold;
        case 'less_than':
          return projectBudget < threshold;
        default:
          return false;
      }
    
    // ... other cases
  }
}
```

**UI Integration:**

Update rule editor dialog to show custom condition form when `custom_budget_check` kind is selected.

---

### WebSocket Broadcasting

**Purpose:** Real-time UI updates when rules execute or config changes.

**Pattern:**

```typescript
import { broadcastToAll } from '../lib/websocket-manager';

// After rule execution
broadcastToAll({
  type: 'email-automation:execution',
  data: {
    ruleId: rule.id,
    decision: 'fired',
    timestamp: new Date().toISOString()
  }
});

// After rule created/updated/deleted
broadcastToAll({
  type: 'email-automation:rule-updated',
  data: {
    ruleId: rule.id,
    action: 'created' // or 'updated', 'deleted'
  }
});
```

**Client-Side Handling:**

```typescript
// client/src/hooks/useEmailAutomationRealtime.ts
useEffect(() => {
  const ws = getWebSocketInstance();
  
  const handleMessage = (event: MessageEvent) => {
    const message = JSON.parse(event.data);
    
    if (message.type === 'email-automation:execution') {
      refetchDiagnostics();
      refetchStats();
    }
    
    if (message.type === 'email-automation:rule-updated') {
      refetchRules();
    }
  };
  
  ws.addEventListener('message', handleMessage);
  return () => ws.removeEventListener('message', handleMessage);
}, []);
```

---

### Testing Strategies

#### Unit Testing Rule Evaluation

```typescript
import { evaluateRule } from '../server/email-automation-engine';

describe('Workflow Automation - Rule Evaluation', () => {
  it('should fire rule when all conditions pass', () => {
    const rule = {
      id: 1,
      triggerKeys: ['project.status_changed'],
      conditions: [
        { kind: 'project_field', operator: 'equals', value: { field: 'status', targetValue: 'In Progress' } }
      ],
      actions: [
        { action: 'send_email', params: { templateKey: 'test' } }
      ]
    };
    
    const eventPayload = {
      projectId: 5,
      status: 'In Progress'
    };
    
    const result = evaluateRule(rule, 'project.status_changed', eventPayload);
    
    expect(result.decision).toBe('fired');
    expect(result.actionsExecuted).toBe(1);
  });
});
```

#### Integration Testing with Test Mode

1. Enable test mode via API
2. Trigger event (e.g., update project status)
3. Check test email inbox
4. Query `email_rule_audits` table for execution log
5. Verify decision and audit details

---

## API Reference

### Base URL

All endpoints prefixed with `/api/email-automation`

---

### GET `/api/email-automation/config`

**Purpose:** Retrieve global automation config (test mode, suppression settings).

**Response:**

```json
{
  "testModeEnabled": true,
  "testEmailAddresses": ["test@example.com"],
  "globalSuppressionWindow": 86400,
  "createdAt": "2025-01-15T10:00:00Z",
  "updatedAt": "2025-10-23T14:00:00Z"
}
```

---

### POST `/api/email-automation/config`

**Purpose:** Update global automation config.

**Request Body:**

```json
{
  "testModeEnabled": false,
  "testEmailAddresses": ["test1@example.com", "test2@example.com"],
  "globalSuppressionWindow": 43200
}
```

**Response:** Updated config object.

---

### GET `/api/email-automation/triggers`

**Purpose:** Retrieve all triggers (optionally filtered).

**Query Parameters:**
- `category` (optional): Filter by category
- `source` (optional): Filter by source (`system` or `custom`)

**Response:**

```json
{
  "triggers": [
    {
      "id": 1,
      "key": "project.status_changed",
      "category": "Project Notifications",
      "type": "status_change",
      "origin": "project",
      "source": "system",
      "description": "Triggered when a project's status changes",
      "ruleCount": 3
    }
  ]
}
```

---

### POST `/api/email-automation/triggers/sync`

**Purpose:** Manually sync system triggers from registry (Admin only).

**Response:**

```json
{
  "added": 2,
  "skipped": 27,
  "errors": []
}
```

---

### GET `/api/email-automation/rules`

**Purpose:** Retrieve all rules.

**Query Parameters:**
- `enabled` (optional): Filter by enabled status (`true`/`false`)

**Response:**

```json
{
  "rules": [
    {
      "id": 1,
      "name": "Notify Engineer on Project Start",
      "description": "...",
      "enabled": true,
      "priority": 100,
      "triggerKeys": ["project.status_changed"],
      "continueOnMatch": false,
      "conditionCount": 1,
      "actionCount": 1,
      "createdAt": "2025-10-15T10:00:00Z"
    }
  ]
}
```

---

### GET `/api/email-automation/rules/:id`

**Purpose:** Retrieve single rule with full details (conditions, actions).

**Response:**

```json
{
  "rule": {
    "id": 1,
    "name": "Notify Engineer on Project Start",
    "enabled": true,
    "priority": 100,
    "triggerKeys": ["project.status_changed"],
    "conditions": [
      {
        "id": 1,
        "kind": "project_field",
        "operator": "equals",
        "value": { "field": "status", "targetValue": "In Progress" }
      }
    ],
    "actions": [
      {
        "id": 1,
        "action": "send_email",
        "params": { "templateKey": "project_status_update" }
      }
    ]
  }
}
```

---

### POST `/api/email-automation/rules`

**Purpose:** Create new rule.

**Request Body:**

```json
{
  "name": "Test Rule",
  "description": "Example rule",
  "enabled": true,
  "priority": 100,
  "triggerKeys": ["project.created"],
  "continueOnMatch": false,
  "conditions": [
    {
      "kind": "user_role",
      "operator": "equals",
      "value": "Admin"
    }
  ],
  "actions": [
    {
      "action": "send_email",
      "params": {
        "templateKey": "welcome_project",
        "designId": 1
      }
    }
  ]
}
```

**Response:** Created rule object with ID.

---

### PUT `/api/email-automation/rules/:id`

**Purpose:** Update existing rule.

**Request Body:** Same structure as POST (partial updates supported).

**Response:** Updated rule object.

---

### DELETE `/api/email-automation/rules/:id`

**Purpose:** Delete rule (also deletes associated conditions, actions, audits via cascade).

**Response:**

```json
{
  "success": true,
  "message": "Rule deleted successfully"
}
```

---

### GET `/api/email-automation/schedules`

**Purpose:** Retrieve all email schedules.

**Response:**

```json
{
  "schedules": [
    {
      "id": 1,
      "ruleId": 5,
      "ruleName": "Daily Summary",
      "cron": "0 17 * * 1-5",
      "timezone": "America/New_York",
      "nextRunAt": "2025-10-24T17:00:00Z",
      "lastRunAt": "2025-10-23T17:00:00Z",
      "active": true
    }
  ]
}
```

---

### POST `/api/email-automation/schedules`

**Purpose:** Create new schedule.

**Request Body:**

```json
{
  "ruleId": 5,
  "cron": "0 9 * * 1",
  "timezone": "America/Los_Angeles",
  "active": true
}
```

**Response:** Created schedule object.

---

### DELETE `/api/email-automation/schedules/:id`

**Purpose:** Delete schedule.

**Response:**

```json
{
  "success": true
}
```

---

### GET `/api/email-automation/audits`

**Purpose:** Retrieve execution audit logs (diagnostics).

**Query Parameters:**
- `limit` (default: 50): Results per page
- `offset` (default: 0): Pagination offset
- `ruleId` (optional): Filter by rule
- `eventKey` (optional): Filter by trigger
- `decision` (optional): Filter by decision (`fired`, `suppressed`, `skipped`, `failed`)
- `startDate` (optional): ISO timestamp
- `endDate` (optional): ISO timestamp
- `sortBy` (default: `createdAt`): Sort field
- `sortOrder` (default: `desc`): `asc` or `desc`

**Response:**

```json
{
  "audits": [
    {
      "id": 523,
      "ruleId": 1,
      "ruleName": "Notify Engineer on Project Start",
      "eventKey": "project.status_changed",
      "decision": "fired",
      "reason": "All conditions passed",
      "conditionsEvaluated": 1,
      "conditionsPassed": 1,
      "actionsExecuted": 1,
      "actionsFailed": 0,
      "executionTimeMs": 47,
      "emailLogId": 789,
      "createdAt": "2025-10-23T14:32:15Z"
    }
  ],
  "pagination": {
    "total": 1523,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

---

### GET `/api/email-automation/audits/:id`

**Purpose:** Retrieve single audit log with full details (input payload, metadata).

**Response:**

```json
{
  "audit": {
    "id": 523,
    "ruleId": 1,
    "eventKey": "project.status_changed",
    "input": {
      "projectId": 5,
      "oldStatus": "Planning",
      "newStatus": "In Progress",
      "updatedBy": "user_123"
    },
    "decision": "fired",
    "metadata": {
      "conditionResults": [
        { "conditionId": 1, "passed": true }
      ],
      "actionResults": [
        { "actionId": 1, "success": true, "emailLogId": 789 }
      ]
    }
  }
}
```

---

### GET `/api/email-automation/stats`

**Purpose:** Retrieve system statistics.

**Response:**

```json
{
  "activeRules": 12,
  "totalExecutions": 4523,
  "emailsSent": 3891,
  "successRate": 86,
  "avgExecutionTimeMs": 52,
  "scheduledItems": 3,
  "recentPeriod": "7d"
}
```

---

## Best Practices

### 1. Rule Design

✅ **DO:**
- Use descriptive rule names (e.g., "Notify Admin on Critical Error")
- Document rule purpose in description field
- Set appropriate priority (1-10 for critical, 100+ for normal, 1000+ for low)
- Test rules with Test Mode enabled before production use
- Use `continueOnMatch: false` for final catch-all rules

❌ **DON'T:**
- Create overly broad rules (e.g., trigger on ALL events)
- Chain too many conditions (limit to 3-5 for readability)
- Forget to add suppression for high-frequency triggers
- Leave rules enabled without testing

---

### 2. Condition Logic

✅ **DO:**
- Keep conditions simple and readable
- Use AND logic within a rule (all conditions must pass)
- Create multiple rules for OR logic (e.g., Rule A for Status=X, Rule B for Status=Y)
- Validate condition values match expected data types

❌ **DON'T:**
- Hardcode user IDs or project IDs (use roles/properties instead)
- Create circular logic (Rule A triggers event that triggers Rule A)
- Assume payload structure without validation

---

### 3. Email Frequency Management

✅ **DO:**
- Set suppression windows for non-critical events (24h for status updates)
- Use digest schedules for frequent updates (daily summaries)
- Respect user quiet hours (default 8 PM - 8 AM)
- Provide opt-out mechanism (user preferences)

❌ **DON'T:**
- Send real-time emails for every minor update
- Ignore quiet hours for non-critical notifications
- Override suppression without valid reason

---

### 4. Template & Design

✅ **DO:**
- Use variables for dynamic content (`{{projectName}}`, `{{userName}}`)
- Keep email designs responsive (mobile-friendly)
- Include unsubscribe links (legal requirement in many regions)
- Test templates with Test Mode before production

❌ **DON'T:**
- Hardcode URLs or names in templates
- Use inline styles excessively (maintain design consistency)
- Send HTML-only emails (always include plain text version)

---

### 5. Monitoring & Maintenance

✅ **DO:**
- Review Diagnostics tab weekly for failed executions
- Monitor success rate (should be >95%)
- Archive old audit logs (database cleanup after 90 days)
- Update trigger descriptions when system behavior changes

❌ **DON'T:**
- Ignore failed executions (investigate root cause)
- Let audit logs grow unbounded (performance impact)
- Disable rules without understanding impact

---

### 6. Performance Optimization

✅ **DO:**
- Index database fields used in conditions (e.g., `project.status`)
- Limit audit log queries with pagination
- Use WebSocket broadcasts for real-time updates (avoid polling)
- Cache trigger/rule lists in memory (refresh on update)

❌ **DON'T:**
- Query full audit history without filters
- Execute heavy database queries in rule conditions
- Block application operations waiting for email sends

---

## Troubleshooting

### Issue: Emails Not Sending

**Symptoms:**
- Rule shows "Fired" in Diagnostics
- No email received
- `email_logs` table has entry with `success = false`

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| **Test Mode Enabled** | Check Overview tab → Test Mode. If enabled, emails route to test addresses only. |
| **SMTP Configuration Error** | Verify Gmail credentials in environment variables (`EMAIL_USER`, `EMAIL_PASSWORD`). Check server logs for authentication errors. |
| **Invalid Recipient Address** | Check rule action params → `to` field. Verify variable interpolation (e.g., `{{primaryEngineerEmail}}`) resolves to valid email. |
| **Quiet Hours Active** | Check user preferences → Quiet Hours. Email delayed until quiet hours end. |
| **Suppression Window Active** | Check rule actions → Suppression window. Similar email sent recently, suppressed by design. |

---

### Issue: Rule Not Firing

**Symptoms:**
- Event triggered (e.g., project status changed)
- No entry in Diagnostics or entry shows "Skipped"
- Expected email not sent

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| **Rule Disabled** | Check Rules tab → Status column. Enable rule if disabled. |
| **Trigger Mismatch** | Check rule → Trigger Keys. Ensure event key (e.g., `project.status_changed`) is selected. |
| **Condition Failure** | Check Diagnostics → Expand row → View condition results. Verify event payload matches condition values. |
| **Higher Priority Rule Stopped Evaluation** | Check Rules tab → Sort by priority. If higher-priority rule has `continueOnMatch: false`, evaluation stops. |
| **User Preference Opt-Out** | Check user → Email Preferences → `overallPreference`. If `do_not_send`, emails blocked. |

---

### Issue: Slow Rule Execution

**Symptoms:**
- Diagnostics shows high `executionTimeMs` (>500ms)
- Email delays noticeable to users

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| **Complex Conditions** | Simplify condition logic. Avoid nested queries or external API calls in conditions. |
| **Large Event Payload** | Reduce payload size. Only include necessary context in `triggerEmailAutomation()` call. |
| **Database Query Performance** | Index fields used in conditions. Use `EXPLAIN ANALYZE` to identify slow queries. |
| **External Email Service Latency** | Email sending is asynchronous. If blocking, check SMTP timeout settings. |

---

### Issue: Duplicate Emails Sent

**Symptoms:**
- Single event triggers multiple emails to same recipient
- Audit logs show multiple "Fired" entries for same event

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| **Multiple Rules Match Same Event** | Check Rules tab → Filter by trigger. Consolidate rules or adjust priorities to prevent overlaps. |
| **No Suppression Window** | Add `suppress_for` action to rules. Set duration (e.g., `24h`) to prevent duplicates. |
| **Event Triggered Multiple Times** | Check application code. Ensure `triggerEmailAutomation()` called once per event, not in loops. |

---

### Issue: Diagnostics Not Updating

**Symptoms:**
- Rules execute (emails sent)
- Diagnostics tab shows stale data or empty feed

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| **WebSocket Disconnected** | Check browser console for WebSocket errors. Refresh page to reconnect. |
| **Caching Issue** | Hard refresh browser (Ctrl+Shift+R). Clear React Query cache. |
| **Database Write Failure** | Check server logs for audit log insert errors. Verify database connection. |

---

### Debug Mode (Developer Tool)

**Enable verbose logging:**

```typescript
// server/email-automation-engine.ts
const DEBUG = process.env.EMAIL_AUTOMATION_DEBUG === 'true';

if (DEBUG) {
  console.log('[Workflow Automation] Evaluating rule:', rule.id);
  console.log('[Workflow Automation] Event payload:', eventPayload);
  console.log('[Workflow Automation] Condition results:', conditionResults);
}
```

**Set environment variable:**

```bash
EMAIL_AUTOMATION_DEBUG=true npm run dev
```

**Output:**

```
[Workflow Automation] Evaluating rule: 1
[Workflow Automation] Event payload: { projectId: 5, status: 'In Progress' }
[Workflow Automation] Condition results: [{ conditionId: 1, passed: true }]
[Workflow Automation] Decision: fired
[Workflow Automation] Actions executed: 1
```

---

## Future Roadmap

### Planned Features

1. **Visual Rule Builder**
   - Drag-and-drop interface for rule creation
   - Visual condition flow diagrams
   - Template preview with sample data

2. **Advanced Scheduling**
   - Relative schedules (e.g., "2 days after project start")
   - Timezone-based user targeting (send at 9 AM in recipient's timezone)
   - Holiday skip logic (don't send on weekends/holidays)

3. **A/B Testing**
   - Split rules to test different templates/timings
   - Performance metrics (open rate, click rate)
   - Automatic winner selection

4. **Custom Trigger UI**
   - Admin interface to add/edit custom triggers
   - Trigger testing sandbox
   - Trigger analytics (usage frequency, rule count)

5. **Email Analytics Dashboard**
   - Open rate, click rate, bounce rate
   - Heatmaps for email engagement
   - Recipient behavior tracking

6. **Conditional Actions**
   - IF-THEN-ELSE logic within actions
   - Dynamic recipient selection based on payload
   - Fallback templates if primary fails

7. **Integration Webhooks**
   - Trigger external services (Slack, Teams, PagerDuty)
   - Two-way sync with CRM systems
   - Custom webhook endpoints

8. **Machine Learning Insights**
   - Predicted optimal send times
   - Anomaly detection (unusual execution patterns)
   - Suggested rule improvements

## Demo Mode

Rules (`email_rules`) and their runs (`email_rule_audits`) carry `is_demo` (migration 135). In Demo Mode the rules list, triggers, stats and Execution feed show only demo rows, and a rule created there is a demo rule; outside it, demo rows never show. The engine and the scheduler never run a demo rule. An email digest schedule takes its rule's mode and can't point at a rule of the other mode. The demo seed adds six rules with about a month of runs; see [demo-mode.md](../admin/demo-mode.md).

---

## Related Documentation

- **[Workflow Automation Triggers](./email-triggers-reference.md)** - Detailed trigger registry documentation
- **[Toast Notification System](./toast-notification-system.md)** - UI notification patterns (complementary to email)
- **[MFA System Documentation](../guides/mfa-system.md)** - Related security feature with email notifications
- **[Backup & Restore](./backup-restore.md)** - Whole-database export and restore, including workflow automation tables

---

## Support & Contact

**Questions or Issues?**

- Navigate to **About → Support & Features** in application
- Submit feature request or bug report
- Include diagnostics logs and rule configuration

**Developer Resources:**

- Codebase: `server/email-automation-engine.ts`, `server/email-trigger-registry.ts`
- UI Components: `client/src/components/communications/email-automation/`
- Database Schema: `shared/schema.ts` (lines 47-181)

---

**Document Version:** 1.0  
**Last Updated:** October 23, 2025  
**Author:** CriteriaIQ Development Team
