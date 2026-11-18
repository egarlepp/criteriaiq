# Mutual Action Plan (MAP) System Architecture

## Overview

The Mutual Action Plan (MAP) system is a comprehensive project execution framework integrated into CriteriaIQ. It provides a structured, collaborative approach to managing technical validation projects through well-defined phases, steps, and tasks.

### What is a MAP?

A Mutual Action Plan (MAP) is a shared roadmap between a sales team and a buyer that outlines key steps, responsibilities, and deadlines to close a deal. It helps both sides stay aligned, improves communication, and ensures smoother progress toward a successful purchase. MAPs facilitate intricate purchasing processes in technology, ensuring that sellers and buyers are harmonized to attain mutual success.

### Quick plans and full MAPs

Every project's plan is a MAP. A project starts its plan in one of two ways from the MAP drawer's empty state (`QuickPlanStart.tsx`):

- **Quick plan**: one phase named "Plan" (in the creator's language) and an
  optional list of steps pasted one per line (bullets and numbering are
  stripped). Customer emails are off and there are no dates, so a simple
  checklist never emails the customer or shows as overdue by surprise.
- **From a MAP template**: the full phase, step and task structure.

Either plan grows in place: **Add** on the Plan tab (`MapAddItemDialog.tsx`)
adds a phase, step or task next to the item open in the detail pane. The
phase stepper hides while a plan has a single phase.

**MAP template permissions.** Any internal user with Template Management ›
MAP Library edit can create MAP templates and change or delete their own;
only an Admin can change system templates or anyone else's, or mark a
template system or inactive.

## System Architecture

### Database Schema

The MAP system uses 11 interconnected PostgreSQL tables managed by Drizzle ORM:

#### Core Entities

**1. `map_configs`** - Global and project-specific MAP configurations
```typescript
{
  id: serial (primary key)
  name: varchar(255)
  description: text
  createdBy: integer (references users.id)
  isActive: boolean
  projectId: integer (nullable, references projects.id)
  _metadata: jsonb // Contains isProjectSpecific flag
}
```

**2. `map_phases`** - Top-level project milestones
```typescript
{
  id: serial (primary key)
  configId: integer (references map_configs.id)
  name: varchar(255)
  description: text
  orderIndex: integer
  status: map_status_enum
  startDate: timestamp
  dueDate: timestamp
  completedDate: timestamp (nullable)
  teamOwned: boolean
  assignedToCustomerUserId: integer (nullable)
  assignedToUserId: integer (nullable)
  additionalInternalUserId: integer (nullable)
}
```

**3. `map_steps`** - Mid-level actionable items within phases
```typescript
{
  id: serial (primary key)
  phaseId: integer (references map_phases.id)
  name: varchar(255)
  description: text
  orderIndex: integer
  status: map_status_enum
  startDate: timestamp
  dueDate: timestamp
  completedDate: timestamp (nullable)
  teamOwned: boolean
  assignedToCustomerUserId: integer (nullable)
  assignedToUserId: integer (nullable)
  additionalInternalUserId: integer (nullable)
}
```

**4. `map_tasks`** - Granular work items within steps
```typescript
{
  id: serial (primary key)
  stepId: integer (references map_steps.id)
  name: varchar(255)
  description: text
  orderIndex: integer
  status: map_status_enum
  estimatedHours: numeric(5,2) (nullable)
  startDate: timestamp
  dueDate: timestamp
  completedDate: timestamp (nullable)
  teamOwned: boolean
  assignedToCustomerUserId: integer (nullable)
  assignedToUserId: integer (nullable)
  additionalInternalUserId: integer (nullable)
}
```

#### Assignment Architecture

Each MAP entity (Phase/Step/Task) supports **5 assignment fields** stored as direct table columns (the role list and column names are in `shared/map-assignment-roles.ts`):

1. **`teamOwned`** (text) - The customer department that owns the item (`"N/A"` means unset). Shown as "{Customer} team" in the drawer
2. **`assignedToCustomerUserId`** (text, nullable) - Customer owner ("{Customer} owner")
3. **`assignedToTeamId`** (integer, nullable, references `teams.id`, set null when the team is deleted) - "Our team": one of the Teams (Admin › Team & People › Teams), for work any engineer on that team can pick up. Added by migration 118
4. **`assignedToUserId`** (text, nullable) - Our owner (internal or partner user)
5. **`additionalInternalUserId`** (text, nullable) - A second person from our side ("Also from us")

**"Our team" is responsibility only.** It never grants access: who can edit an item is unchanged (Admins and Engineers edit every MAP; anyone else needs edit access on the project). This keeps the rule that Teams only organize and filter. What it does:
- Shows as a team chip (sky blue, people icon) and carries down from phase to step to task like the other roles
- Counts in the Plan tab's **Us** filter, and in **Me** for members of that team
- Gets its own row on the Assignments tab (marked "Team")
- Tells each team member in the bell (`map_item_team_assigned`), through the `map.<phase|step|task>.team_assigned` event. Only internal members who can open the project are told, and never the person who made the change. The event is separate from `map.*.assigned`, so person-based email rules don't fire for a team; it's also offered to webhooks
- Only internal users can set it, and only to a team that exists (`PUT /api/map/{phases|steps|tasks}/:id` returns 403 / 400 otherwise). Outside users never see the role or team names
- Every change is still logged in the MAP activity log with who made it ("Internal Team"). Opening an item isn't logged

**Roles used per plan:** `project_maps.assignment_roles` (text[], null = every role) lists the roles a plan uses. Internal editors set it from **Plan roles** in the drawer header (`PUT /api/projects/:projectId/map/assignment-roles`, internal users with project edit access; body `{ roles: [...] | null }`, at least one role). A switched-off role is hidden from chips, row avatars and the assign picker; values already saved stay in the database and come back when the role is switched on again.

**Inheritance (display only):**
- A step or task with no value for a role shows its step's, else its phase's, value faded with "From Phase N" / "From Step N"
- Nothing is copied into the child row; setting the child's own value overrides what it inherits
- The Plan tab's audience filter (Everyone / Customer / Us / Me) counts inherited values

#### Activity Tracking

**5. `map_activity_logs`** - Comprehensive audit trail
```typescript
{
  id: serial (primary key)
  projectId: integer (references projects.id)
  targetType: varchar(50) // 'phase', 'step', 'task'
  targetId: integer
  action: varchar(50) // 'created', 'updated', 'deleted', 'status_changed'
  details: text
  userId: integer (references users.id)
  createdAt: timestamp
}
```

#### Supporting Tables

**6. `map_automation_triggers`** - Event-based automation rules
```typescript
{
  id: serial (primary key)
  configId: integer (references map_configs.id)
  eventType: varchar(100)
  targetType: varchar(50)
  conditions: jsonb
  actions: jsonb
  isActive: boolean
}
```

**7. `map_notification_preferences`** - User notification settings
```typescript
{
  id: serial (primary key)
  userId: integer (references users.id)
  projectId: integer (references projects.id)
  notifyOnPhaseChange: boolean
  notifyOnStepChange: boolean
  notifyOnTaskChange: boolean
  notifyOnAssignment: boolean
  emailEnabled: boolean
  inAppEnabled: boolean
}
```

**8-11. Template System Tables**
- `map_template_categories` - Template organization
- `map_templates` - Reusable MAP configurations
- `map_template_phases` - Template phase definitions
- `map_template_steps` - Template step definitions

### Status Management

MAP items use the 8 statuses in `shared/map-status.ts` (`MAP_ITEM_STATUSES`): `not_started`, `in_progress`, `blocked`, `complete`, `deferred`, `stalled`, `at_risk`, `cancelled`. Older rows may hold `completed`; `isMapItemComplete()` treats it as `complete`.

**Saving:** the three `PUT /api/map/{phases|steps|tasks}/:id` routes validate the body with `mapItemUpdateSchema` (400 with Zod issues on a bad body) and apply `withCompletionDate()` (`shared/map-status.ts`): becoming Complete or Cancelled stamps `completedDate` (shown as the End date), reopening clears it, and an explicit `completedDate` in the request wins. Leaving Not Started stamps `startDate` with today when it is empty or a planned date still in the future; an earlier start date is kept, and an explicit `startDate` wins. The Plan tab applies the same helper to its optimistic update, so the dates change before the save returns. A step or phase that completes automatically when its last child finishes (`updateMapStep` / `updateMapPhase` in `server/storage/map.ts`) stamps `completedDate` too.

**Roll-up (display only):** a step with tasks, and every phase, shows a status rolled up from its children (`rollupStatus()` in `client/src/components/map/plan/map-plan-utils.ts`: all done → Complete; any Blocked → Blocked; then At risk, Stalled; any started → In progress). The stored status is not changed; when it differs, the detail pane offers "Use that status". A phase that started while an earlier one hasn't shows an out-of-order notice.

**Visual Indicators:**
- Not Started: Gray (Clock icon)
- In Progress: Blue (Target icon)
- Complete: Green (CheckCircle icon)
- Blocked: Red (AlertTriangle icon)
- Deferred: Yellow (CircleArrowUp icon)

### Real-Time Synchronization

**WebSocket Integration:**
- Broadcasts MAP changes across all connected clients
- Event types: `map:phase:updated`, `map:step:updated`, `map:task:updated`
- Automatic query invalidation triggers UI updates
- Event deduplication prevents duplicate processing

**Event Fingerprinting:**
```typescript
const fingerprint = `${eventType}:${data.id}:${data.projectId}`;
// Prevents duplicate event processing across multiple hook instances
```

## API Endpoints

### Core CRUD Operations

**Starting a plan** (project edit access):
- `POST /api/projects/:id/map/quick` - Start a Quick plan: one phase (`phaseName`, sent in the creator's language) and up to 50 steps, customer emails off, no dates. 409 when the project already has a plan.
- `POST /api/projects/:id/map/from-template` - Build the plan from a MAP template.

**Project MAP Access:**
- `GET /api/projects/:id/map` - Get complete MAP data
- `PUT /api/projects/:id/map/name` - Rename the plan
- `PUT /api/projects/:id/map/assignment-roles` - Roles used on this plan

**Adding to a live plan** (project edit access):
- `POST /api/projects/:id/map/items` - Add a phase, a step under a phase (`parentId` = phase id) or a task under a step (`parentId` = step id), last in its parent, with an optional `dueDate` (YYYY-MM-DD). New items start Not Started and take the customer-email setting of the item they sit under; a new phase copies the plan's first phase (off on an empty plan). 400 when the parent is not in the project. Body schema: `newMapItemSchema` in `shared/map-plan-items.ts`.

**Phase / Step / Task Operations:**
- `PUT /api/map/phases/:id`, `PUT /api/map/steps/:id`, `PUT /api/map/tasks/:id` - Update
- `DELETE /api/map/phases/:id`, `DELETE /api/map/steps/:id`, `DELETE /api/map/tasks/:id` - Delete

**Activity & Analytics:**
- `GET /api/projects/:id/map/activity` - Get activity log
- `GET /api/projects/:id/map/summary` - Get summary statistics

### Automation Framework

**Access:** `GET /api/map-automation-config` needs an internal user; `PUT` needs Workflow Automation edit. A project's config (`/api/projects/:id/map-automation-config`) needs an internal user with project access to read, and project edit access to save or delete.

**Automation Configuration:**
- `GET /api/map-automation/:configId/triggers` - List automation rules
- `POST /api/map-automation/:configId/triggers` - Create automation rule
- `PUT /api/map-automation/triggers/:id` - Update automation rule
- `DELETE /api/map-automation/triggers/:id` - Delete automation rule

**Supported Event Types:**
```typescript
const eventTypes = [
  'phase_created', 'phase_status_changed', 'phase_completed',
  'step_created', 'step_status_changed', 'step_completed',
  'task_created', 'task_status_changed', 'task_completed',
  'assignment_changed', 'due_date_approaching'
];
```

## Frontend Components

### Core Components

**MapDrawer** (`client/src/components/project-form/MapDrawer.tsx`)
- Sliding drawer with an editable plan name, "Saved / Saving…" indicator, and a pin that keeps the detail pane open (remembered per browser)
- Tabs: Plan, Assignments, Timeline, Automation, Notifications. The tab list comes from `mapDrawerTabsForRole()` in `shared/map-drawer-tabs.ts`
- **Tab access by role:** external roles (Customer, Guest, Partner) see only Plan and Timeline; Assignments, Automation and Notifications are internal only. The server enforces it on the automation config routes (see Automation Framework) and on `GET /api/projects/:id/map/assignment-analytics` (`requireInternalUser`). External users don't see the Timeline's scheduling card or Assign MAP Users

**Plan tab** (`client/src/components/map/plan/`)
- `MapOverallProgress` - the overall completion bar above the tabs (done / in progress / blocked, at risk or stalled), with the plan's date span and late count
- `MapPhaseStepper` - one card per phase: completion ring, start → due dates with days early or late, done count and late count. Clicking a card opens it in Full plan
- Two views (remembered per browser): **Next up** (open work items grouped Late / This week / Later, with a checkbox to complete; finished items fold into an expandable list at the bottom) and **Full plan** (`MapPlanTable`, a grouped table: Item, Owners, Progress, Due, Status). External users open on Next up filtered to the customer
- Full plan keeps plan order, so its columns are not sortable. Phase rows are tinted headers with a completion ring; phases and steps expand and collapse (Expand all / Collapse all). Finished phases start collapsed. Phase, step and task rows use the Template Summary icons (ClipboardPenLine purple, Boxes blue, PackageCheck green)
- **Due dates** show days early (+, green) or late (-, red) in brackets, e.g. `Nov 14 (-3)` (`dueVariance()` in `map-plan-utils.ts`). A finished item compares its completed date with its due date; an open item shows a number only once it is past due; no number when on target. A phase or step finished through its children uses the latest child completed date when it has none of its own. Hovering a Complete status pill shows the completed date
- Status pills use the MAP status icons and colors (`MapStatusPill`, same set as the project page's MAP legend)
- Toolbar (one row, icon-only buttons with tooltips): a single view toggle that shows the current view's icon and switches between Next up and Full plan; in Full plan, a single Expand all / Collapse all button that flips once everything is open; and the audience filter on the right (Everyone, {Customer}, Us, Me as icons)
- `MapDetailPane` - opens on click beside the list: name, status, a Dates row (Start, plus End once the item is Complete or Cancelled), a Due row below it with the days early or late (a cancelled item shows no number), people, description, ↑ ↓ to walk the plan, Delete (through `ConfirmationDialog`)
- `MapAssignPicker` - "+ Assign" asks for the role first, then the person, department or team, so a row only shows the roles actually set. Only the plan's roles are offered (see Roles used per plan)
- `MapRolesSetting` - the **Plan roles** popover in the drawer header (internal editors, Plan tab)
- Edits save optimistically to the `["/api/projects", id, "map"]` cache and roll back with a toast on failure

**Timeline tab** (MapDrawer): a one-line scheduling bar (`MapSchedulingCard`, internal users only), then the calendar and the activity feed side by side on wide screens (stacked below `xl`).

**MapCalendarTimeline** (`client/src/components/map/MapCalendarTimeline.tsx`)
- Calendar visualization of MAP dates
- Start/end date badges with entity counts
- Month navigation with project date boundaries
- Multi-select entity type filtering

**MapActivityTimeline** (`client/src/components/map/MapActivityTimeline.tsx`; `compact` gives the drawer's tighter header and icon-only filter button)
- Real-time activity feed with live status indicator
- Filterable by Phase/Step/Task
- User attribution and timestamps
- Visual timeline connector lines

**MapAssignmentTracker** (`client/src/components/MapAssignmentTracker.tsx`)
- Comprehensive assignment overview
- User-based and entity-based views
- Team ownership visualization
- Assignment statistics

### Supporting Components

- **MapTemplateSelector** - Template selection dialog
- **MapAssignmentDialog** - Bulk assignment management
- **MapProjectAutomationTab** - Automation rule configuration
- **MapProjectNotificationsTab** - Notification preferences

## Key Features

### 1. Flexible Assignment System
- 4 distinct assignment types per entity
- Cascading assignment inheritance
- Team vs. individual ownership tracking
- Customer stakeholder involvement

### 2. Comprehensive Metrics
- Progress percentage calculation
- Status distribution tracking
- Total hours estimation (task-level)
- Timeline duration analytics
- Entity counts (Phases/Steps/Tasks)

### 3. Template System
- Reusable MAP templates, created by any internal user with MAP Library edit
- A project starts from a template or as a Quick plan, then grows in place
- Global vs. project-specific templates

### 4. Automation Framework
- Event-driven trigger system
- Conditional action execution
- Status change automation
- Assignment cascade rules

### 5. Real-Time Collaboration
- WebSocket-based updates
- Multi-user synchronization
- Activity log broadcasting
- Live status indicators

## Configuration Management

### Global Configurations
```typescript
{
  name: "Standard Validation MAP",
  description: "Default MAP for technical validations",
  isActive: true,
  projectId: null, // Global configuration
  _metadata: { isProjectSpecific: false }
}
```

### Project-Specific Configurations
```typescript
{
  name: "Custom Enterprise MAP",
  description: "Tailored MAP for enterprise customer",
  isActive: true,
  projectId: 123, // Specific project
  _metadata: { isProjectSpecific: true }
}
```

### Configuration Precedence
1. Project-specific configuration (if exists)
2. Active global configuration
3. Auto-initialize from default template

## Best Practices

### For Administrators

1. **Template Design**
   - Create reusable templates for common validation types
   - Use clear, descriptive phase/step/task names
   - Set realistic time estimates at task level
   - Define standard assignment patterns

2. **Automation Setup**
   - Start with simple status-based triggers
   - Test automation rules in non-production projects
   - Document custom automation logic
   - Monitor automation execution via activity logs

3. **Configuration Management**
   - Maintain a primary global configuration
   - Use project-specific configs only when necessary
   - Archive inactive configurations
   - Version control template changes

4. **Performance Optimization**
   - Limit active automation triggers (<50 per config)
   - Archive completed project MAPs quarterly
   - Monitor activity log growth
   - Use database indexes on foreign keys

5. **Security & Access Control**
   - Restrict automation configuration to Admins
   - Review assignment permissions regularly
   - Audit activity logs for unauthorized changes
   - Implement role-based template access

### Schema Modifications

When modifying the MAP schema:

1. **Never manually write SQL migrations** - Use `npm run db:push` or `npm run db:push --force`
2. **Update Drizzle schemas first** - Modify the MAP tables in `shared/schema/map.ts` before pushing (the schema was split from a single `shared/schema.ts` into 16 domain files under `shared/schema/`, re-exported through the `shared/schema/index.ts` barrel — always import from `@shared/schema`, never from a domain file directly)
3. **Test with sample data** - Verify changes in development environment
4. **Document schema changes** - Update this documentation
5. **Coordinate with frontend** - Ensure TypeScript types align with schema changes

### Data Integrity

**Cascading Deletes:**
- Deleting a Phase deletes all child Steps and Tasks
- Deleting a Step deletes all child Tasks
- Deleting a Config deletes all associated Phases/Steps/Tasks
- Activity logs are preserved (no cascade delete)

**Referential Integrity:**
- All foreign keys have ON DELETE CASCADE or ON DELETE SET NULL
- Assignments reference valid users (enforced at API level)
- Status values must match enum constraints

## Troubleshooting

### Common Issues

**Issue: Order indices are all 0**
- **Cause**: Database migration issue or bulk insert without orderIndex
- **Solution**: MAPs use `phasesWithSteps` hierarchy for correct ordering in UI
- **Impact**: Display order is correct despite database values

**Issue: Assignments not cascading**
- **Cause**: Automation rules disabled or misconfigured
- **Solution**: Check automation triggers in Automation tab, verify isActive flag

**Issue: Real-time updates not working**
- **Cause**: WebSocket connection failure
- **Solution**: Check browser console for WebSocket errors, verify server WebSocket manager

**Issue: Template initialization fails**
- **Cause**: Missing template data or foreign key constraint violation
- **Solution**: Verify template exists, check user permissions, review activity logs

### Debug Tools

**Activity Log Diagnostics:**
```sql
-- Recent MAP activity for a project
SELECT * FROM map_activity_logs 
WHERE project_id = ? 
ORDER BY created_at DESC 
LIMIT 50;
```

**Assignment Audit:**
```sql
-- All assignments for a project
SELECT 
  p.name AS phase_name,
  p.assigned_to_user_id,
  p.assigned_to_customer_user_id,
  p.team_owned
FROM map_phases p
WHERE p.config_id IN (
  SELECT id FROM map_configs WHERE project_id = ?
);
```

**Automation Trigger Status:**
```sql
-- Active automation triggers
SELECT * FROM map_automation_triggers 
WHERE config_id = ? AND is_active = true;
```

## Related Documentation

- [Email Automation System](./email-triggers-reference.md) - Integration with MAP triggers
- [WebSocket Stability Guide](../guides/websocket-stability-guide.md) - Real-time update architecture
- [Backup & Restore](./backup-restore.md) - Whole-database export and restore

## Version History

- **v1.0** (Initial Release) - Core MAP functionality with 11 tables
- **v1.1** - Added Timeline Calendar and Activity Timeline components
- **v1.2** - Enhanced assignment architecture with 4-field system
- **v1.3** - Integrated automation framework with event-driven triggers
- **v1.4** - Redesigned drawer: phase stepper, Next up / Full plan, audience filter, detail pane on demand, role-first assign picker, role-gated tabs; saving fixes for the second internal owner and notification settings
- **v1.5** - "Our team" assignment (responsibility only, bell notifications to team members) and roles used per plan
- **v1.6** - Plan tab polish: overall completion bar, phase cards with rings and dates, Full plan as a grouped table, days early/late on due dates, completed date on hover, status icons; compact Notifications cards grouped Internal / External
- **v1.7** - Task dates: Start is stamped when work begins, End is stamped on Complete or Cancelled; the detail pane shows Start | End with Due below and the days early/late
- **v1.8** - Plan toolbar on one row with icon-only buttons (single view toggle, single expand/collapse); Timeline tab tightened (one-line scheduling bar, compact calendar beside the activity feed); Automation rule cards in two columns
- **v1.9** - MAP is the only plan type: Quick plans, Add to plan on a live MAP, internal users create their own MAP templates
