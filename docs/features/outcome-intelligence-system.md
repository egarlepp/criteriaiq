# Outcome Intelligence System (PCOS)

## Overview

The Project Closure Outcome & Intelligence System (PCOS) is a hygiene layer designed to capture technical intelligence when projects close. It provides structured data collection for analyzing win/loss patterns, technical fit assessments, and competitive intelligence across technical validation projects.

## Purpose

The Outcome Intelligence System serves several critical business functions:

1. **Technical Intelligence Capture** - Document what worked and what didn't in technical validation
2. **Win/Loss Analysis** - Understand patterns that lead to successful or unsuccessful outcomes
3. **Competitive Intelligence** - Track competitor involvement and their impact on outcomes
4. **Gap Analysis Integration** - Link outcomes to specific product gaps that influenced results
5. **Trend Identification** - Identify patterns across projects to improve future success rates

## Architecture

### Database Schema

The system uses two primary database tables:

#### project_outcomes Table
Stores individual project outcome records with technical intelligence metrics.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial | Primary key |
| `projectId` | integer | Foreign key to projects table (unique constraint - one outcome per project) |
| `outcomeType` | varchar(20) | 'won', 'lost', or 'cancelled' |
| `technicalFitScore` | integer | 1-100 scale measuring solution-requirements alignment |
| `tccApproved` | boolean | TCC (Technically Chosen) - was the solution technically selected |
| `politicalAlignmentScore` | integer | 1-100 scale measuring stakeholder buy-in level |
| `painRating` | integer | 1-10 scale measuring customer pain level |
| `primaryReasonCode` | varchar(100) | Main categorized reason for outcome |
| `executiveSummary` | text | Rich text summary of the outcome |
| `competitors` | text[] | Array of competitor names involved |
| `linkedGapIds` | integer[] | Foreign keys to project_gaps that contributed to outcome |
| `primaryGapId` | integer | The main gap that influenced the outcome |
| `externalSystemId` | varchar(100) | For Salesforce sync integration |
| `createdBy` | varchar | User who recorded the outcome |
| `createdAt` | timestamp | Record creation timestamp |
| `updatedAt` | timestamp | Last update timestamp |

#### outcome_config Table
Controls when outcome reports are required based on configurable business rules.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial | Primary key |
| `enabled` | boolean | Master enable/disable for outcome requirements |
| `acvThreshold` | decimal | Minimum ACV value to require outcome capture |
| `frequencyInterval` | integer | Every Nth closure requires outcome (2-5) |
| `logicMode` | varchar(30) | Logic mode for requirement calculation |
| `closureCounter` | integer | Running count of project closures (not of saved outcomes); the Nth closure is required when N is a multiple of `frequencyInterval` |
| `triggerSource` | varchar(20) | What counts as a closure: `status` (Internal Status lists below), `crm` (the CRM's closed/won flags, or Sales Stage Closed Won / Closed Lost), `either` (default, whichever comes first) |
| `wonStatuses` / `lostStatuses` / `cancelledStatuses` | text[] | Internal Status names that mean Won / Lost / Cancelled. Defaults: none, none, `Cancelled`. Matched case-insensitively; a status in two lists reads as cancelled, then lost |
| `enforcement` | varchar(20) | `optional` (banner only, no notifications or reminders), `prompt` (default: dialog opens once per browser session), `required` (dialog opens on every visit, red banner) |
| `wonRule` / `lostRule` / `cancelledRule` | varchar(20) | Per outcome type: `rules` (default, apply the logic mode), `always`, `never` |
| `graceDays` | integer | Days after closure before the owners get a reminder (default 7, 1–90) |
| `escalateAfterDays` | integer, nullable | Days after closure before the owners' managers are told; null = never (1–180) |
| `updatedBy` | varchar | Last user to update configuration |
| `updatedAt` | timestamp | Last configuration update |

#### outcome_requests Table
One row per closed project: the decision, made once when the project closed, on whether its outcome is required. Written by `server/services/outcome-requests.ts`; migration `097_outcome_requests.sql`.

| Column | Type | Description |
|--------|------|-------------|
| `projectId` | integer | The project (unique, cascade delete) |
| `outcomeType` | varchar(20) | How it closed: `won`, `lost`, `cancelled` |
| `source` | varchar(20) | `status` (Internal Status), `crm` (CRM flags or Sales Stage), or `preexisting` (closed before this table existed) |
| `required` | boolean | What the rules decided at closure |
| `reason` | text | Why, in English (e.g. "ACV 250000 meets the threshold 100000") |
| `status` | varchar(20) | `open` (waiting), `captured`, `not_required` (recording one is still allowed), `preexisting` |
| `closedAt` / `capturedAt` | timestamp | When it closed / when the outcome was saved |
| `remindedAt` / `escalatedAt` | timestamp | When the owners were reminded / their managers told (each happens once) |

#### project_crm_close_state Table
The CRM's own closed/won flags for each linked project, as last read by the `outcome_crm_close_check` job (migration `098_outcome_capture_rules.sql`). Kept out of `projects` so project payloads and CRM write-back are unchanged. Columns: `projectId` (PK, cascade), `crmProvider`, `isClosed`, `isWon`, `checkedAt`. Flags are used only while `crmProvider` matches the project's CRM.

How a request is written:
- Every project save emits `project.updated`; the listener re-checks the project. The `outcome_crm_close_check` job re-checks projects whose CRM flags changed.
- Closed depends on `triggerSource`. Internal Status is checked against the three status lists (Cancelled first). The CRM path uses the stored CRM flags when the deal is closed there, otherwise Sales Stage "Closed Won" / "Closed Lost" (case-insensitive). With `either`, the status lists are read first; the first signal wins and is recorded in `source`.
- The first time a project is seen closed, the closure counter goes up by one and the rules are applied: a per-type `always` / `never` overrides the logic mode for that outcome type. The decision is stored and never re-rolled, so "every 3rd closure" stays stable.
- A project that reopens before its outcome is recorded loses its request; closing it again counts a new closure.
- Saving an outcome marks the request `captured`. Deleting the outcome puts the request back to what the rules decided.
- When the outcome is required and enforcement isn't `optional`, the project's primary and specialist engineers get an `outcome_requested` bell notification (internal, active users only; not the person who made the change).
- Projects already closed when migration 097 ran were recorded as `preexisting` (or `captured` when they had an outcome), so nobody is prompted for old projects.

### Background Jobs (Configuration › Scheduler)

| Job | When | What |
|-----|------|------|
| `outcome_reminders` | Daily 09:00 | For open required requests: after `graceDays`, one `outcome_reminder` to the engineers; after `escalateAfterDays`, one `outcome_overdue` to each engineer's manager (`users.managerId`) and to the project's owning team manager and subteam leaders ([Teams](teams.md#teams-as-recipients)). Skipped when capture is off or enforcement is `optional`. |
| `outcome_crm_close_check` | Hourly (min 15 min) | Reads closed/won flags for projects linked to an Opportunity/Deal: Salesforce `IsClosed`/`IsWon` (200 per SOQL query, using the primary engineer's connection; projects whose engineer isn't connected are skipped), HubSpot `hs_is_closed`/`hs_is_closed_won` (batch read of 100). A failed query changes nothing. On the first look, a deal already closed is recorded as `not_required` with source `crm`, so turning this on never prompts for old deals. Stands down with no CRM chosen, capture off, or trigger `status`. |

### "Required" does not block the status change

`required` enforcement re-opens the capture dialog on every visit and shows a red banner; it does not stop a project from being closed. Closes also arrive from the CRM sync, kanban drags and bulk edits, and blocking those saves would break them. Reminders and escalation carry the rest.

### Logic Modes

The system supports six configurable logic modes for determining when outcome capture is required:

| Mode | Description |
|------|-------------|
| `never` | Outcomes are optional for all projects |
| `always` | Outcomes are required for all closed projects |
| `acv_only` | Required only when project ACV exceeds threshold |
| `frequency_only` | Required every N closures (configurable interval) |
| `acv_and_frequency` | Must meet both ACV threshold AND frequency interval |
| `acv_or_frequency` | Required if either condition is met |

## Component Architecture

### Frontend Components

#### ProjectOutcomeDialog
**Location:** `client/src/components/outcomes/ProjectOutcomeDialog.tsx`

A modal dialog for capturing or editing project outcomes. Features:
- Outcome type selection (Won, Lost, Cancelled)
- Technical Fit Score slider (1-100) with descriptive labels
- TCC Approved checkbox
- Political Alignment Score slider (1-100)
- Pain Rating slider (1-10)
- Primary Reason Code dropdown (context-aware based on outcome type)
- Executive Summary rich text field
- Competitors multi-entry field
- Gap linkage for Lost outcomes (links to Gap Analysis system)
- Primary Gap selector

**Reason Codes by Outcome Type:**

**Won Reasons:**
- Technical Fit
- Pricing
- Relationship
- Competitive Displacement
- Business Need
- Other

**Lost Reasons:**
- Technical Gap
- Pricing
- Competitive Loss
- No Decision
- Internal Politics
- Budget Constraints
- Timing
- Other

**Cancelled Reasons:**
- Budget Cut
- Project Deprioritized
- Stakeholder Change
- Merger/Acquisition
- Vendor Consolidation
- Other

#### OutcomesDashboard
**Location:** `client/src/pages/outcomes-dashboard.tsx`

The main analytics dashboard with multiple visualization tabs:

1. **Quadrant Analysis** - Scatter plot mapping Technical Fit vs Political Alignment, with outcomes color-coded by type and sized by pain rating

2. **Pain Index Distribution** - Bar chart showing distribution of customer pain ratings across all outcomes

3. **Summary Statistics** - Pie chart breakdown of won/lost/cancelled ratios with key metrics

4. **Missing Outcomes** - Table listing closed projects without recorded outcomes, with quick action buttons

5. **All Outcomes** - Complete list of all recorded outcomes with filtering and search

#### OutcomeConfigurationManager
**Location:** `client/src/components/configuration/OutcomeConfigurationManager.tsx`

Admin-only configuration panel (translated, `outcomes.config.*`):
- Enable/disable capture (the rest is disabled while off)
- Trigger: Internal Status / CRM / Either (CRM options note when no CRM is chosen)
- Status mapping: each Internal Status from `/api/status-configs` set to Open / Won / Lost / Cancelled
- Enforcement (Optional / Prompt / Required), reminder grace days, escalation days
- Logic mode with ACV threshold and frequency
- Per-type rules (Won / Lost / Cancelled: follow rules, always, never)
- View current closure counter
- Missing outcomes alert with quick navigation

### Backend Hooks

**Location:** `client/src/hooks/useOutcomeRequirement.ts`

| Hook | Purpose |
|------|---------|
| `useOutcomeRequirement(projectId)` | Check if outcome is required for a specific project |
| `useOutcomeConfig()` | Fetch current outcome configuration |
| `useProjectOutcome(projectId)` | Get existing outcome for a project |
| `useAllProjectOutcomes(filters)` | Fetch all outcomes with optional filtering |
| `useOutcomeStatistics()` | Get aggregate statistics (won/lost/cancelled counts) |
| `useMissingOutcomes()` | Get list of closed projects without outcomes |

## API Endpoints

Outcomes hold deal intelligence, so outside users (Customer, Guest, Partner) are refused on every outcome route. Request bodies are validated with `insertProjectOutcomeSchema` / `updateOutcomeConfigSchema`, and the primary reason must belong to the outcome type.

### Project Outcomes

| Method | Endpoint | Who | Description |
|--------|----------|-----|-------------|
| GET | `/api/project-outcomes` | Outcome Intelligence view permission (or an API key with the projects scope) | All outcomes, optional filters |
| GET | `/api/project-outcomes/statistics` | same | Aggregate statistics |
| GET | `/api/project-outcomes/missing` | same | Closed projects whose required outcome is missing (open required requests, plus pre-existing closed projects) |
| GET | `/api/project-outcomes/:projectId` | project access | Outcome for one project |
| POST | `/api/project-outcomes` | project edit access | Create (409 if the project already has one) |
| PATCH | `/api/project-outcomes/:id` | project edit access | Update; `projectId` in the body is ignored |
| DELETE | `/api/project-outcomes/:id` | project edit access | Delete |
| GET | `/api/project-outcomes/check-required/:projectId` | project access | Whether the outcome is required, from the stored decision |
| GET | `/api/projects/:id/outcome-request` | project access | `{ request, hasOutcome, canRecord, enforcement }` for the project page prompt |

### Outcome Configuration

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/outcome-config` | Get current configuration |
| PATCH | `/api/outcome-config` | Update configuration (Admin only) |

### Query Parameters

**GET /api/project-outcomes supports:**
- `outcomeType` - `won`, `lost` or `cancelled`
- `fromDate` / `toDate` - creation date range

## Scoring System

### Technical Fit Score (1-100)

Measures how well the solution matched customer requirements:

| Range | Label | Description |
|-------|-------|-------------|
| 1-25 | Poor Fit | Solution did not meet core requirements |
| 26-50 | Partial Fit | Solution met some requirements with gaps |
| 51-75 | Good Fit | Solution met most requirements |
| 76-100 | Excellent Fit | Solution exceeded requirements |

### Political Alignment Score (1-100)

Measures stakeholder buy-in and internal sponsorship:

| Range | Label | Description |
|-------|-------|-------------|
| 1-25 | No Buy-in | No internal champion or support |
| 26-50 | Limited Buy-in | Some support but resistance exists |
| 51-75 | Good Buy-in | Strong sponsor with some detractors |
| 76-100 | Strong Champion | Executive-level sponsorship |

### Pain Rating (1-10)

Measures customer's urgency and pain level:

| Range | Label | Description |
|-------|-------|-------------|
| 1-3 | Low Pain | Nice-to-have, no urgency |
| 4-6 | Moderate Pain | Important but not critical |
| 7-10 | Critical Pain | Must-have, urgent business need |

## Navigation & Menu Location

### Sidebar Navigation

1. **Admin › Projects & Rules › Outcome Intelligence** (`/admin?tab=outcome-configuration`): the capture rules (Admin only).
2. **Insights › Outcome Intelligence** (`/project?tab=validation&subtab=outcome-intelligence`): Quadrant Analysis, Reason Codes, Missing Outcomes and All Outcomes views (`subtab2=quadrant|reasons|missing|all`).

### Project Page Prompt

`ProjectOutcomePrompt` (`client/src/components/outcomes/ProjectOutcomePrompt.tsx`) shows a banner on a closed project when the rules require its outcome and none is recorded, to people who can edit the project. With `prompt` enforcement the banner is amber and the capture dialog opens by itself once per browser session per project; with `required` the banner is red and the dialog opens on every visit; with `optional` the dialog never opens by itself. The banner's **Record outcome** button always opens it.

### FlightDeck Integration

The FlightDeck welcome modal includes a **hygiene_alerts** widget that displays the count of projects missing outcomes, providing immediate visibility to team leads.

## Usage Workflow

### Recording an Outcome

1. When a project closes (per the configured trigger: a mapped Internal Status, the CRM, or either), the rules decide whether its outcome is required. If so, the project page prompts the people who can edit it

2. Users click "Record Outcome" from:
   - The project detail page
   - The Outcomes Dashboard
   - The Missing Outcomes table

3. Complete the outcome form:
   - Select outcome type (Won/Lost/Cancelled)
   - Adjust the Technical Fit Score slider
   - Mark TCC Approved if applicable
   - Adjust Political Alignment Score
   - Set Pain Rating
   - Select Primary Reason Code
   - Add Executive Summary
   - List Competitors (for lost deals)
   - Link related Gaps (for lost deals)

4. Submit to save the outcome intelligence

### Analyzing Outcomes

1. Navigate to the Outcomes Dashboard
2. Use the Quadrant Analysis to identify patterns:
   - Upper-right quadrant = High fit + High alignment (ideal)
   - Lower-left quadrant = Low fit + Low alignment (difficult deals)
3. Review Pain Index Distribution to understand customer urgency patterns
4. Examine reason code trends in the Summary tab
5. Follow up on Missing Outcomes to ensure data completeness

## Integration Points

### Gap Analysis System

Lost outcomes can link to gaps tracked in the Gap Analysis system:
- `linkedGapIds` - Multiple gaps that contributed to the loss
- `primaryGapId` - The single most impactful gap

This creates a feedback loop for product improvement.

### Salesforce Integration

The `externalSystemId` field supports bidirectional sync with Salesforce Opportunity records when configured.

### FlightDeck Widget

The `hygiene_alerts` FlightDeck widget queries the missing outcomes count to display proactive alerts to users.

## Icon

The Outcome Intelligence System uses the **BrainCircuit** icon throughout the interface, representing the analytical nature of the intelligence gathering.

## Best Practices

1. **Capture outcomes promptly** - Record outcomes while details are fresh
2. **Be honest in scoring** - Accurate scores enable better pattern analysis
3. **Link gaps explicitly** - For lost deals, always link the specific gaps that contributed
4. **Use consistent reason codes** - Avoid "Other" when a more specific code applies
5. **Complete executive summaries** - Narrative context adds value to the data
6. **Review missing outcomes regularly** - Use the dashboard to ensure complete data
7. **Configure thresholds appropriately** - Set ACV thresholds based on your organization's deal sizes

## Technical Notes

- One outcome per project (unique constraint on projectId)
- Outcomes are deleted when parent project is deleted (cascade)
- Primary gap reference is set to null if the gap is deleted
- Outside users (Customer, Guest, Partner) can't read or write outcomes
- Configuration changes require Admin role
- Reason codes are stored in English; the dialog translates their labels (`outcomes.reasons.*`)
