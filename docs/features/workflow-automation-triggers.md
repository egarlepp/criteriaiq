# Workflow Automation Triggers - Technical Documentation

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [System vs Custom Triggers](#system-vs-custom-triggers)
4. [Automatic Registration](#automatic-registration)
5. [Optional Sync Mechanism](#optional-sync-mechanism)
6. [Adding New Triggers](#adding-new-triggers)
7. [Database Schema](#database-schema)
8. [API Reference](#api-reference)
9. [Future Roadmap](#future-roadmap)

---

## Overview

The Workflow Automation Trigger system provides a centralized, rule-based framework for triggering automated email workflows based on events throughout the CriteriaIQ application. This system enables:

- **Event-driven notifications** triggered by user actions, project changes, MAP milestones, and system events
- **Automatic trigger registration** from a code-based registry (no manual database work required)
- **Custom trigger support** for organization-specific events
- **Safe synchronization** between code definitions and database state

### Key Features

✅ **82 pre-defined system triggers** across 12 categories  
✅ **Zero-config automatic registration** on server startup  
✅ **Safe update mechanism** that preserves custom triggers  
✅ **Visual distinction** between system and custom triggers in the UI  
✅ **Future-ready** architecture supporting full CRUD operations  
✅ **Salesforce Integration triggers** for sync events and record linking  
✅ **Webhook Delivery triggers** for delivery monitoring and error handling  

---

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Workflow Automation System                   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐        ┌──────────────────┐          │
│  │ Trigger Registry │◄───────┤ Auto-Registration│          │
│  │ (Code-based)     │        │ Service          │          │
│  └────────┬─────────┘        └─────────┬────────┘          │
│           │                             │                    │
│           │                             ▼                    │
│           │                    ┌────────────────┐           │
│           │                    │   Database     │           │
│           │                    │ email_triggers │           │
│           │                    └────────┬───────┘           │
│           │                             │                    │
│           │                             ▼                    │
│           │                    ┌────────────────┐           │
│           └───────────────────►│  Email Rules   │           │
│                                │   & Actions    │           │
│                                └────────────────┘           │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Server Startup** → Auto-registration service checks for new system triggers
2. **Code Registry** → Defines trigger structure and metadata
3. **Database Sync** → Adds missing triggers, preserves existing ones
4. **UI Display** → Shows triggers with source badges (System/Custom)
5. **Rule Creation** → Users select triggers for automation rules

---

## System vs Custom Triggers

The system distinguishes between two types of triggers using the `source` field:

### System Triggers (`source: 'system'`)

**Definition:** Triggers defined in the code registry and automatically managed by the application.

**Characteristics:**
- ✅ Defined in `server/email-trigger-registry.ts`
- ✅ Auto-registered on server startup
- ✅ Can be synced/updated via admin endpoint
- ✅ Guaranteed to exist across all environments
- ❌ Cannot be deleted through UI (protected)

**Examples:**
- `project.created`
- `map.phase_completed`
- `login.failed`

### Custom Triggers (`source: 'custom'`)

**Definition:** Organization-specific triggers added manually to the database or through the UI (future feature).

**Characteristics:**
- ✅ Manually added to database or via UI
- ✅ Never modified by auto-sync
- ✅ Fully editable in the UI (future)
- ✅ Can be deleted if not in use
- ❌ Not guaranteed across environments

**Examples:**
- `custom.sales_handoff`
- `custom.executive_review_requested`
- `custom.compliance_check_failed`

### Visual Distinction

In the **Trigger Origins** UI, triggers display badges indicating their source:

- **System Trigger**: Blue badge with "System" label
- **Custom Trigger**: Purple badge with "Custom" label

---

## Automatic Registration

### How It Works

The automatic registration service runs **once during server startup** and performs the following operations:

```typescript
For each trigger in SYSTEM_TRIGGERS:
  1. Check if trigger.key exists in database
  2. If EXISTS:
     - Skip (preserve existing data)
  3. If NOT EXISTS:
     - Insert new trigger with source='system'
```

### Safety Guarantees

The auto-registration system is designed with **safety-first principles**:

| Scenario | Behavior | Data Preserved |
|----------|----------|----------------|
| New system trigger in code | ✅ Added to database | N/A |
| Existing system trigger (unchanged) | ⏭️ Skipped | ✅ All fields preserved |
| Existing system trigger (description changed) | ⏭️ Skipped (no auto-update) | ✅ All fields preserved |
| Custom trigger in database | ⏭️ Skipped | ✅ All fields preserved |
| Trigger removed from code | ⏭️ Left in database | ✅ All fields preserved |

**Key Insight:** Auto-registration is **additive only**. It never modifies or deletes existing triggers.

### Process Flow

```
┌────────────────┐
│ Server Starts  │
└───────┬────────┘
        │
        ▼
┌────────────────────────┐
│ Load Trigger Registry  │
│ (SYSTEM_TRIGGERS)      │
└───────┬────────────────┘
        │
        ▼
┌───────────────────────────┐
│ Query Database for        │
│ existing trigger keys     │
└───────┬───────────────────┘
        │
        ▼
┌──────────────────────────┐
│ For each system trigger: │
│  - Check if key exists   │
│  - Insert if missing     │
└───────┬──────────────────┘
        │
        ▼
┌────────────────────────┐
│ Log registration stats │
│ (X added, Y skipped)   │
└────────────────────────┘
```

### Configuration

**Location:** `server/email-trigger-registration.ts`

The registration service is called automatically during server initialization in `server/index.ts`:

```typescript
import { registerSystemTriggers } from './email-trigger-registration';

// During server startup
await registerSystemTriggers(storage);
```

---

## Optional Sync Mechanism

While auto-registration handles **new triggers**, the optional sync mechanism allows administrators to **update existing system trigger descriptions** when they change in code.

### When to Use Sync

Use the sync endpoint when:
- ✅ You've updated trigger descriptions in the registry
- ✅ You want to standardize trigger metadata across environments
- ✅ You need to refresh system trigger definitions

**Important:** Sync only affects `source='system'` triggers. Custom triggers are never touched.

### Sync Behavior

```typescript
For each trigger in SYSTEM_TRIGGERS:
  1. Check if trigger.key exists with source='system'
  2. If EXISTS:
     - UPDATE description, category, type, origin, metadataSchema
     - PRESERVE: id, key, source, defaultEnabled, createdAt
  3. If NOT EXISTS:
     - INSERT new trigger (same as auto-registration)
  4. If EXISTS with source='custom':
     - SKIP (never modify custom triggers)
```

### API Endpoint

**POST** `/api/admin/email-automation/sync-triggers`

**Authentication:** Admin role required

**Request:**
```json
POST /api/admin/email-automation/sync-triggers
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "dryRun": false
}
```

**Response:**
```json
{
  "success": true,
  "stats": {
    "added": 3,
    "updated": 12,
    "skipped": 8,
    "customPreserved": 8
  },
  "details": [
    {
      "key": "project.created",
      "action": "added",
      "source": "system"
    },
    {
      "key": "map.phase_completed",
      "action": "updated",
      "source": "system",
      "changes": ["description"]
    }
  ]
}
```

**Dry Run Mode:**
```json
{
  "dryRun": true
}
```
Performs a simulation without making changes, returning what would happen.

---

## Adding New Triggers

### Developer Guide

To add a new system trigger to the application, follow these steps:

#### Step 1: Add to Registry

Edit `server/email-trigger-registry.ts` and add your trigger definition to the `SYSTEM_TRIGGERS` array:

```typescript
{
  key: "your.trigger_key",
  category: "Project Notifications", // Choose appropriate category
  type: "status_change", // creation, status_change, assignment, milestone, deadline, etc.
  origin: "project", // authentication, project, map_phase, map_step, map_task, system
  defaultEnabled: true, // Should this trigger be active by default?
  description: "Clear description of when this trigger fires",
  metadataSchema: {
    // Define the expected data structure
    projectId: "number",
    userId: "string",
    customField: "string",
    timestamp: "ISO8601 datetime"
  }
}
```

#### Step 2: Restart Server

The trigger will be automatically registered on the next server restart. No manual database work required!

#### Step 3: Verify Registration

Check the **Communications → Workflow Automation → Trigger Origins** tab to confirm your trigger appears with a "System" badge.

#### Step 4: Fire the Trigger

In your application code, call the workflow automation engine when the event occurs:

```typescript
import { getEmailAutomationEngine } from './email-automation-engine';

// In your event handler
const engine = getEmailAutomationEngine();
await engine.evaluateTrigger({
  triggerKey: 'your.trigger_key',
  projectId: projectId.toString(),
  userId: currentUser.id,
  metadata: {
    projectId: projectId,
    userId: currentUser.id,
    customField: 'some value',
    timestamp: new Date().toISOString()
  }
});
```

### Best Practices

**Naming Conventions:**
- Use dot notation: `origin.event_name`
- Be specific: `map.phase_completed` not `map.update`
- Use past tense: `project.created` not `project.create`

**Categories:**
- Authentication
- Project Notifications
- MAP
- System Alerts
- Communication
- Reports

**Metadata Schema:**
- Always include `timestamp: "ISO8601 datetime"`
- Include IDs for relevant entities (`projectId`, `userId`, etc.)
- Document the data type for each field
- Keep schema minimal but complete

---

## Database Schema

### Table: `email_triggers`

```sql
CREATE TABLE email_triggers (
  id SERIAL PRIMARY KEY,
  key VARCHAR NOT NULL UNIQUE,           -- Trigger identifier (e.g., 'project.created')
  category VARCHAR NOT NULL,              -- Category for grouping
  type VARCHAR NOT NULL,                  -- Event type classification
  origin VARCHAR NOT NULL,                -- Source system/module
  source VARCHAR NOT NULL DEFAULT 'custom', -- 'system' | 'custom'
  default_enabled BOOLEAN DEFAULT true,   -- Default activation state
  description TEXT,                       -- Human-readable description
  metadata_schema JSONB,                  -- Expected payload structure
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_email_triggers_category ON email_triggers(category);
CREATE INDEX idx_email_triggers_origin ON email_triggers(origin);
CREATE INDEX idx_email_triggers_source ON email_triggers(source);
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `id` | serial | Auto-incrementing primary key |
| `key` | varchar | Unique trigger identifier (e.g., `project.created`) |
| `category` | varchar | Group category (Authentication, MAP, etc.) |
| `type` | varchar | Event type (status_change, milestone, etc.) |
| `origin` | varchar | Source module (project, map_phase, authentication) |
| **`source`** | varchar | **'system' or 'custom' - determines update behavior** |
| `default_enabled` | boolean | Default active state when creating rules |
| `description` | text | Human-readable description of trigger |
| `metadata_schema` | jsonb | JSON schema defining expected event payload |
| `created_at` | timestamp | Record creation timestamp |
| `updated_at` | timestamp | Last modification timestamp |

---

## API Reference

### GET /api/email-automation/triggers

Fetch all available triggers with usage statistics.

**Authentication:** Required

**Response:**
```json
{
  "triggers": [
    {
      "id": 1,
      "key": "project.created",
      "category": "Project Notifications",
      "type": "creation",
      "origin": "project",
      "source": "system",
      "defaultEnabled": true,
      "description": "Triggered when a new project is created",
      "metadataSchema": { ... },
      "ruleCount": 3,
      "lastTriggered": "2025-10-20T14:30:00Z",
      "createdAt": "2025-01-15T10:00:00Z",
      "updatedAt": "2025-01-15T10:00:00Z"
    }
  ]
}
```

### POST /api/admin/email-automation/sync-triggers

Synchronize system triggers from code registry to database.

**Authentication:** Admin role required

**Request:**
```json
{
  "dryRun": false
}
```

**Response:** See [Optional Sync Mechanism](#optional-sync-mechanism) section above.

---

## Future Roadmap

### Phase 1: Current Implementation ✅

- [x] Database schema with `source` field
- [x] Trigger registry system
- [x] Automatic registration on startup
- [x] Optional sync endpoint for admins
- [x] UI badges showing trigger source
- [x] Documentation

### Phase 2: Custom Trigger Management UI (Planned)

**Goal:** Enable users to create and manage custom triggers through the UI without database access.

**Features:**
1. **Create Custom Trigger Form**
   - Input fields: Key, Category, Description
   - Metadata schema builder (JSON editor)
   - Validation against existing trigger keys
   - Preview of trigger before creation

2. **Edit Custom Trigger**
   - Modify description, category, metadata schema
   - Cannot edit key (would break existing rules)
   - Only available for `source='custom'` triggers

3. **Delete Custom Trigger**
   - Safety check: Prevent deletion if used by active rules
   - Confirmation dialog with impact analysis
   - Archive option (soft delete)

4. **Trigger Testing Tool**
   - Simulate trigger firing with test metadata
   - Dry-run mode shows which rules would match
   - Preview generated emails without sending

**UI Mockup:**
```
┌─────────────────────────────────────────────────────────────┐
│ Trigger Origins                                  [+ Add Custom] │
├─────────────────────────────────────────────────────────────┤
│ Search triggers...                     [All Categories ▼]   │
├─────────────────────────────────────────────────────────────┤
│ Authentication                                   [6 triggers]│
│ ┌───────────────────────────────────────────────────────┐  │
│ │ login.failed                              [System]     │  │
│ │ Triggered when a user login attempt fails              │  │
│ │ 3 rules • Last triggered: 2 hours ago                  │  │
│ └───────────────────────────────────────────────────────┘  │
│                                                             │
│ Project Notifications                            [8 triggers]│
│ ┌───────────────────────────────────────────────────────┐  │
│ │ custom.sales_handoff                    [Custom] [Edit]│  │
│ │ Triggered when project moves to sales team             │  │
│ │ 1 rule • Last triggered: 1 day ago                     │  │
│ └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Phase 3: Advanced Features (Future)

1. **Trigger Analytics Dashboard**
   - Frequency charts (triggers per day/week/month)
   - Performance metrics (avg processing time)
   - Rule matching rates

2. **Trigger Templates**
   - Pre-built trigger packages for common workflows
   - One-click import of trigger sets
   - Export/import for environment migration

3. **Webhook Triggers**
   - External system integration
   - Custom webhook endpoints
   - Payload validation and transformation

4. **Conditional Trigger Chains**
   - Trigger A fires → automatically triggers B if conditions met
   - Complex multi-step automation workflows
   - Dependency graph visualization

### Implementation Timeline

| Phase | Target Quarter | Status |
|-------|---------------|--------|
| Phase 1: Core System | Q4 2025 | ✅ Complete |
| Phase 2: Custom UI | Q1 2026 | 📋 Planned |
| Phase 3: Advanced | Q2 2026 | 🔮 Future |

---

## Troubleshooting

### Trigger Not Appearing in UI

**Problem:** Added trigger to registry but it doesn't show in Trigger Origins tab.

**Solution:**
1. Verify trigger was added to `SYSTEM_TRIGGERS` array in `server/email-trigger-registry.ts`
2. Restart the server to trigger auto-registration
3. Check server logs for registration confirmation
4. Query database: `SELECT * FROM email_triggers WHERE key = 'your.trigger_key';`

### Sync Endpoint Failing

**Problem:** `/api/admin/email-automation/sync-triggers` returns 403 or 500 error.

**Solution:**
1. Verify user has admin role
2. Check server logs for detailed error message
3. Ensure database connection is active
4. Try dry-run mode first: `{ "dryRun": true }`

### Custom Trigger Being Overwritten

**Problem:** Custom trigger description keeps reverting.

**Solution:**
This should **never** happen. If it does:
1. Verify trigger has `source='custom'` in database
2. Check if trigger key conflicts with system trigger
3. Review sync endpoint logs
4. Report as bug (sync should never touch custom triggers)

---

## Support & Feedback

For questions, issues, or feature requests related to the Workflow Automation Trigger system:

1. **Internal Documentation:** Review this document thoroughly
2. **Code Comments:** Check `server/email-trigger-registry.ts` for inline examples
3. **Development Team:** Contact the platform engineering team
4. **Feature Requests:** Submit via internal ticketing system

---

## Changelog

### Version 1.0.0 (October 2025)
- Initial implementation of automatic trigger registration
- Added `source` field to distinguish system vs custom triggers
- Created trigger registry with 31 pre-defined system triggers
- Implemented safe auto-registration on server startup
- Added optional sync endpoint for admins
- UI badges for trigger source visualization
- Comprehensive documentation created

---

**Last Updated:** October 23, 2025  
**Document Version:** 1.0.0  
**Maintainer:** Platform Engineering Team
