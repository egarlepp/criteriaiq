# AI Assessment System

## Overview

The AI Assessment System is a multi-ruleset, AI-powered project analysis engine built into CriteriaIQ. It enables Solution Engineers and Administrators to define custom assessment rulesets with configurable criteria, control exactly which project data each criterion evaluates, and run AI-driven analysis against any project in the system.

The system supports multiple assessment categories (Risk, Product Readiness, Engagement Health, Technical Review, Compliance, CoachIQ) and produces structured scoring, risk level classification, actionable recommendations, and full audit trails.

**Key Capabilities:**
- Multi-ruleset architecture with category-based organization
- Per-criterion data source selection (60+ available fields across 8 categories)
- Custom AI instructions per ruleset for tailored analysis behavior
- Custom output format templates for alternative response structures (e.g., coaching mode)
- Configurable AI provider and model per ruleset
- Full audit trail with raw prompt/response storage
- Batch analysis across multiple projects
- Real-time dashboard widgets (Risk Distribution Bar, Recent Runs Feed)
- Automated risk alerts for high/critical scores

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐│
│  │ Assessment    │ │ Criteria     │ │ Assessment Audit     ││
│  │ Ruleset Form │ │ Form         │ │ Drawer               ││
│  └──────┬───────┘ └──────┬───────┘ └──────────┬───────────┘│
│         │                │                     │            │
│  ┌──────┴────────────────┴─────────────────────┴──────────┐│
│  │             AI Assessments Page                         ││
│  │  ┌─────────────────┐  ┌──────────────────────────────┐ ││
│  │  │ Project Analysis│  │ Assessment Criteria Tab       │ ││
│  │  │ Tab (Dashboard) │  │ (Rulesets + Criteria CRUD)    │ ││
│  │  └─────────────────┘  └──────────────────────────────┘ ││
│  └────────────────────────────────────────────────────────┘│
└────────────────────────────┬────────────────────────────────┘
                             │ REST API
┌────────────────────────────┴────────────────────────────────┐
│                    Backend (Express)                         │
│  ┌──────────────────┐  ┌────────────────────────────────┐  │
│  │  API Routes       │  │  AI Risk Engine                │  │
│  │  /api/assessment/ │  │  (aiRiskEngine.ts)             │  │
│  │  /api/risk/       │  │  - analyzeProject()            │  │
│  │                   │  │  - buildAnalysisPrompt()       │  │
│  │                   │  │  - fetchRelatedData()          │  │
│  │                   │  │  - processAnalysisResponse()   │  │
│  └────────┬─────────┘  └──────────┬─────────────────────┘  │
│           │                       │                         │
│  ┌────────┴───────────────────────┴─────────────────────┐  │
│  │  Data Source Registry (assessment-data-sources.ts)    │  │
│  │  8 categories, 60+ fields                             │  │
│  └────────┬─────────────────────────────────────────────┘  │
│           │                                                 │
│  ┌────────┴─────────────────────────────────────────────┐  │
│  │  AI Service Abstraction Layer (ai-service.ts)        │  │
│  │  OpenAI, Gemini, Anthropic, xAI, Azure OpenAI        │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────┴────────────────────────────────┐
│                    PostgreSQL Database                       │
│  assessment_rulesets │ risk_criteria │ project_risk_predictions│
│  risk_alerts         │ projects (riskScore, riskPredictionData)│
└─────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### `assessment_rulesets` Table

Defines assessment rulesets that group related criteria together.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial (PK) | Auto-incrementing primary key |
| `name` | varchar | Ruleset display name (e.g., "Risk Assessment") |
| `category` | varchar | Category classification: `risk`, `product`, `engagement`, `general`, `technical`, `compliance`, `coachiq` |
| `description` | text | Purpose and scope description |
| `default_ai_provider` | varchar | Preferred AI provider for this ruleset (e.g., "openai", "anthropic") |
| `default_ai_model` | varchar | Preferred AI model (e.g., "gpt-4o", "claude-sonnet-4-20250514") |
| `additional_instructions` | text | Extra guidance injected into the AI prompt (e.g., "Focus on enterprise readiness") |
| `output_format_template` | text | Custom JSON output format for non-standard response structures |
| `total_weight` | decimal(5,2) | Target total weight for criteria (default: 1.00) |
| `is_active` | boolean | Whether this ruleset is available for use |
| `is_default` | boolean | Default ruleset for its category |
| `run_count` | integer | Number of times this ruleset has been used |
| `last_used_at` | timestamp | When this ruleset was last used for analysis |
| `created_by` | varchar (FK → users.id) | User who created the ruleset |
| `created_at` | timestamp | Creation timestamp |
| `updated_at` | timestamp | Last update timestamp |

### `risk_criteria` Table

Individual assessment criteria belonging to a ruleset.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial (PK) | Auto-incrementing primary key |
| `ruleset_id` | integer (FK → assessment_rulesets.id) | Parent ruleset |
| `name` | varchar | Criterion name (e.g., "Timeline Risk") |
| `description` | text | What this criterion evaluates |
| `category` | varchar | Category: `timeline`, `technical`, `resource`, `customer`, `success_criteria`, `performance`, `custom` |
| `weight_factor` | decimal(3,2) | Weight factor 0.0–1.0 (higher = more impact on overall score) |
| `data_sources` | jsonb | Array of data source keys this criterion evaluates (e.g., `["project.startDate", "related.mapPhases"]`) |
| `trigger_conditions` | jsonb | Reserved for future conditional trigger logic |
| `severity` | varchar | Severity level: `low`, `medium`, `high`, `critical` |
| `is_active` | boolean | Whether this criterion is included in analysis |
| `created_by` | varchar (FK → users.id) | User who created the criterion |
| `created_at` | timestamp | Creation timestamp |
| `updated_at` | timestamp | Last update timestamp |

### `project_risk_predictions` Table

Stores the results of each AI assessment run.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial (PK) | Auto-incrementing primary key |
| `project_id` | integer (FK → projects.id) | Project that was analyzed |
| `ruleset_id` | integer (FK → assessment_rulesets.id) | Ruleset used for analysis |
| `overall_risk_score` | decimal(5,2) | Overall score 0–100 |
| `risk_level` | varchar | Classified level: `low`, `medium`, `high`, `critical` |
| `criteria_scores` | jsonb | Per-criterion scores (e.g., `{"Timeline Risk": 45, "Technical Complexity Risk": 72}`) |
| `analysis_results` | jsonb | Structured results: summary, keyRisks, mitigationStrategies, confidenceFactors |
| `confidence` | decimal(3,2) | AI confidence in the analysis (0.0–1.0) |
| `trigger_reasons` | text[] | Why the assessment was triggered |
| `recommendations` | text[] | Actionable recommendations from the AI |
| `alerts_sent` | boolean | Whether alerts have been dispatched |
| `ai_provider` | varchar | AI provider used (e.g., "openai") |
| `ai_model` | varchar | AI model used (e.g., "gpt-4o") |
| `raw_prompt` | text | Full prompt sent to the AI (for audit) |
| `raw_response` | text | Raw AI response text (for audit) |
| `created_at` | timestamp | When the analysis was performed |

### `risk_alerts` Table

Tracks alerts generated when projects score high or critical.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial (PK) | Auto-incrementing primary key |
| `project_id` | integer (FK → projects.id) | Related project |
| `risk_prediction_id` | integer (FK → project_risk_predictions.id) | Related prediction |
| `alert_type` | varchar | Alert type: `risk_increase`, `risk_decrease`, `new_risk`, `critical`, `high_risk` |
| `severity` | varchar | Alert severity level |
| `message` | text | Alert message content |
| `recipients` | text[] | User IDs who were notified |
| `sent_at` | timestamp | When the alert was sent |
| `acknowledged` | boolean | Whether the alert has been acknowledged |
| `acknowledged_by` | varchar (FK → users.id) | Who acknowledged the alert |
| `acknowledged_at` | timestamp | When the alert was acknowledged |

---

## Data Source Registry

**File:** `server/assessment-data-sources.ts`

The Data Source Registry defines all available project fields that criteria can evaluate. It organizes 60+ fields into 8 categories, each with structured metadata.

### Registry Structure

```typescript
interface DataSourceField {
  key: string;           // Unique identifier (e.g., "project.startDate")
  label: string;         // Human-readable label (e.g., "Start Date")
  description: string;   // Help text for the admin UI
  group: string;         // Parent group key
  fieldType: "text" | "date" | "number" | "array" | "json" | "boolean" | "relation";
  relatedTable?: string; // For "relation" type, the table to query
}

interface DataSourceGroup {
  key: string;           // Group identifier
  label: string;         // Display label
  description: string;   // Group description
  fields: DataSourceField[];
}
```

### Available Categories

| Category | Key | Fields | Description |
|----------|-----|--------|-------------|
| Core Project Info | `core` | 9 | Project name, customer, solution, status, industry, environment, type, tags |
| Timeline & Dates | `timeline` | 7 | Start/end/completed dates, days remaining, days since start, total duration, % elapsed |
| Business Context | `business` | 7 | Business problem, solution description, objectives, ACV, Salesforce link, sales stage, forecast |
| Team & Resources | `team` | 6 | Primary/specialist engineers, supporting engineers, stakeholder, support team, account rep |
| Risk & Classification | `risk_status` | 4 | Risk level, ranking, previous AI score, last analysis date |
| Notes & Documentation | `notes` | 6 | Policy considerations, general notes, feedback, mgmt notes, current situation, engineer notes |
| Related Data (Tables) | `related` | 8 | Success criteria, MAP phases, gap analysis, activity log, compliance, project links, artifacts, infrastructure profiles |
| Closure & TCC | `closure` | 3 | TCC committee approval, TAP TCC approved, plan mode |

### Key Functions

| Function | Purpose |
|----------|---------|
| `getAllDataSourceKeys()` | Returns flat array of all available data source keys |
| `getDataSourceByKey(key)` | Looks up a single field definition by its key |
| `getRelatedDataSources(keys)` | Filters for `related.*` keys and returns their table names |

### Data Source Key Format

Keys follow a dot-notation convention:
- **`project.*`** — Direct project table fields (e.g., `project.startDate`)
- **`computed.*`** — Calculated values derived at runtime (e.g., `computed.daysRemaining`)
- **`related.*`** — Data from joined tables (e.g., `related.successCriteria`)

---

## AI Engine

**File:** `server/aiRiskEngine.ts`

The `AIRiskEngine` class is the core analysis engine. It is instantiated as a singleton (`aiRiskEngine`) and handles the full lifecycle of an AI assessment.

### Class: `AIRiskEngine`

#### `analyzeProject(project, rulesetId?)`

Entry point for analyzing a single project.

**Flow:**
1. Loads active criteria (from specific ruleset or all active criteria)
2. Loads the ruleset configuration (if rulesetId provided)
3. Calls `fetchRelatedData()` to pull data from related tables
4. Calls `buildAnalysisPrompt()` to construct the AI prompt
5. Sends the prompt to the AI service via `aiService.chat()`
6. Parses the JSON response and validates via `processAnalysisResponse()`
7. Returns a `RiskAnalysisResult` with scores, recommendations, and audit data

#### `analyzeMultipleProjects(projects, rulesetId?)`

Batch analysis that iterates through projects sequentially, saving results and tracking success/failure counts.

#### `fetchRelatedData(project, criteria)`

Intelligently fetches data from related tables based on what criteria need:
- Scans all criteria for `dataSources` arrays
- Collects unique `related.*` keys
- Queries each related table once, regardless of how many criteria need it
- Returns a shared `relatedData` object used by all criteria

**Supported Related Data:**

| Key | Table | Fields Returned |
|-----|-------|-----------------|
| `related.successCriteria` | success_criteria | productName, criterion, expectedOutcome, actionItem, status, notes |
| `related.mapPhases` | map_phases/steps/tasks | totalPhases, totalSteps, totalTasks, completedTasks, phase names/statuses |
| `related.activityLog` | activity_log | Last 20 entries: action, details, createdAt, userName |
| `related.gapAnalysis` | project_gaps | title, description, criticality, status, impact |

#### `buildAnalysisPrompt(project, criteria, ruleset?, relatedData)`

Constructs the full AI prompt with these sections:

1. **Project Data** — Either targeted data from selected sources OR legacy full-project dump (backward compatible)
2. **Criteria Info** — Name, description, category, severity, weight, and `evaluateUsing` field labels
3. **Additional Instructions** — Injected from ruleset if configured
4. **Analysis Requirements** — Standard scoring instructions
5. **Output Format** — Custom template from ruleset OR default JSON structure

**Backward Compatibility:**
When criteria have no `dataSources` configured, the engine falls back to a legacy project info structure containing core identification fields (id, customerName, status, dates, engineers, etc.).

#### `extractProjectField(project, key)`

Maps data source keys to actual project object values. Handles:
- Direct field access (e.g., `project.status` → `project.status`)
- Computed values (e.g., `computed.daysRemaining` → calculated from `endDate`)
- Relation resolution (e.g., `project.primaryEngineer` → `primarySe.firstName + lastName`)

#### `buildProjectDataFromSources(project, dataSources, relatedData)`

Builds a clean data object using only the selected data sources, with human-readable labels as keys.

#### `processAnalysisResponse(data, criteria)`

Validates and normalizes the AI response:
- Clamps `overallRiskScore` to 0–100
- Derives `riskLevel` from score thresholds (0–25: low, 26–50: medium, 51–75: high, 76–100: critical)
- Validates per-criterion scores (falls back to overall score if missing)
- Limits arrays to reasonable sizes (keyRisks: 5, recommendations: 5, etc.)
- Sets default confidence of 0.7 if not provided

#### `savePrediction(projectId, analysis, rulesetId?)`

Persists the analysis result:
1. Creates a `project_risk_predictions` record with all analysis data
2. Updates the project's `riskScore`, `riskPredictionData`, and `lastRiskAnalysis` fields
3. Creates a `risk_alert` if the risk level is high or critical

### Risk Level Thresholds

| Score Range | Risk Level | Color |
|-------------|------------|-------|
| 0–25 | Low | Green |
| 26–50 | Medium | Yellow |
| 51–75 | High | Orange |
| 76–100 | Critical | Red |

---

## API Endpoints

### Assessment Rulesets

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/assessment/rulesets` | List all rulesets |
| `GET` | `/api/assessment/rulesets/active` | List active rulesets only |
| `GET` | `/api/assessment/rulesets/:id` | Get a single ruleset by ID |
| `POST` | `/api/assessment/rulesets` | Create a new ruleset (Admin only) |
| `PUT` | `/api/assessment/rulesets/:id` | Update a ruleset (Admin only) |
| `DELETE` | `/api/assessment/rulesets/:id` | Delete a ruleset (Admin only) |
| `POST` | `/api/assessment/rulesets/:id/clone` | Clone/duplicate a ruleset (Admin only) |
| `GET` | `/api/assessment/rulesets/:id/criteria` | Get criteria for a specific ruleset |

### Assessment Criteria

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/risk/criteria` | List all criteria |
| `POST` | `/api/risk/criteria` | Create a new criterion (Admin only) |
| `PUT` | `/api/risk/criteria/:id` | Update a criterion (Admin only) |
| `DELETE` | `/api/risk/criteria/:id` | Delete a criterion (Admin only) |

### Analysis & Results

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/risk/analyze-all` | Run analysis on selected projects with a chosen ruleset |
| `GET` | `/api/risk/recent-runs` | Get last 5 assessment runs (for dashboard widget) |

### Data Sources

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/assessment/data-sources` | Get the full data source registry (8 groups, 60+ fields) |

### Create/Update Payload Examples

**Create Ruleset:**
```json
{
  "name": "Risk Assessment v2",
  "category": "risk",
  "description": "Enhanced risk analysis with data source targeting",
  "defaultAiProvider": "openai",
  "defaultAiModel": "gpt-4o",
  "additionalInstructions": "Focus on enterprise deployment readiness",
  "outputFormatTemplate": null,
  "totalWeight": "1.00",
  "isActive": true,
  "isDefault": false
}
```

**Create Criterion:**
```json
{
  "name": "Timeline Risk",
  "description": "Risk related to project timeline constraints",
  "category": "timeline",
  "weight": 0.20,
  "rulesetId": 1,
  "isActive": true,
  "dataSources": [
    "project.status",
    "project.startDate",
    "project.endDate",
    "computed.daysRemaining",
    "computed.percentTimeElapsed",
    "related.mapPhases"
  ]
}
```

---

## Frontend Components

### Page: AI Assessments

**Location:** Accessed via sidebar navigation under "AI Assessments"

**Two-Tab Layout:**

1. **Project Analysis Tab** — Dashboard view with:
   - Metrics row: Total Projects Analyzed, Average Index Score, Score Trend, Active Rulesets
   - Risk Distribution Bar widget (clickable stacked bar with filter)
   - Recent Runs Feed widget (last 5 analysis runs)
   - "Analyze Projects" button to trigger new analysis

2. **Assessment Criteria Tab** — Configuration view with:
   - Dual-card layout showing all rulesets
   - Each card shows ruleset name, category (color-coded), criteria count, run count
   - Expand to see individual criteria with edit/delete actions
   - Create/Edit/Clone/Delete ruleset actions

### Component: `AssessmentRulesetForm`

**File:** `client/src/components/assessment-ruleset-form.tsx`

Dialog form for creating/editing rulesets with fields:
- Name, Category (7 categories with icons and colors)
- Description
- Default AI Provider (dropdown of active providers) and Default AI Model
- Total Weight with progress bar indicator
- Additional Instructions (textarea for custom AI guidance)
- Output Format Template (monospace textarea for custom JSON format)
- Active and Default checkboxes

### Component: `RiskCriteriaForm`

**File:** `client/src/components/risk-criteria-form.tsx`

Dialog form for creating/editing individual criteria with fields:
- Name, Category (7 categories)
- Description
- Data Sources — Grouped, collapsible multi-select with:
  - 8 collapsible category groups
  - Per-group "Select All" checkbox with indeterminate state
  - Selected count badge
  - Individual field checkboxes with labels and descriptions
  - 200px scrollable area
- Weight Factor (0.0–1.0)
- Active checkbox

### Component: `AssessmentAuditDrawer`

**File:** `client/src/components/assessment-audit-drawer.tsx`

Sliding drawer that shows full audit details for a completed assessment:
- Project info, ruleset used, AI provider/model
- Overall score with risk level badge
- Per-criterion scores breakdown
- Analysis summary, key risks, mitigation strategies
- Recommendations list
- Confidence score
- Raw prompt and raw response (expandable, for debugging)

### Dashboard Widgets

**`RiskDistributionBar`** (`client/src/components/dashboard-widgets/RiskDistributionBar.tsx`)
- Stacked horizontal bar showing distribution of projects by risk level
- Clickable segments to filter project list
- Color-coded: green (low), yellow (medium), orange (high), red (critical)

**`RecentRunsFeed`** (`client/src/components/dashboard-widgets/RecentRunsFeed.tsx`)
- Mini-feed showing the last 5 assessment runs
- Displays project name, ruleset, score, risk level, and timestamp
- Links to full audit drawer

---

## Pre-Built Starter Rulesets

The system initializes with 3 default rulesets on first run:

### Risk Assessment (Category: risk)

| Criterion | Category | Weight | Data Sources |
|-----------|----------|--------|-------------|
| Timeline Risk | timeline | 0.20 | Status, dates, days remaining, % elapsed, MAP phases (10 fields) |
| Technical Complexity Risk | technical | 0.25 | Solution, environment, business problem, success criteria, gaps, infrastructure (10 fields) |
| Resource Availability Risk | resource | 0.15 | Status, all team/engineer fields, dates, days remaining (10 fields) |
| Customer Engagement Risk | customer | 0.10 | Customer status, stakeholder, feedback, activity log, MAP phases (7 fields) |
| Success Criteria Definition Risk | success_criteria | 0.15 | Status, objectives, business problem, success criteria table (4 fields) |
| Past Project Performance Risk | performance | 0.15 | Status, risk fields, ranking, timeline, activity log, TCC approval (13 fields) |

### Product Readiness (Category: product)

| Criterion | Category | Weight |
|-----------|----------|--------|
| Feature Completeness | technical | 0.25 |
| Solution Stability | technical | 0.20 |
| Documentation Quality | resource | 0.15 |
| Integration Readiness | technical | 0.20 |
| Performance Benchmarks | performance | 0.20 |

### Engagement Health (Category: engagement)

| Criterion | Category | Weight | Data Sources |
|-----------|----------|--------|-------------|
| Stakeholder Involvement | customer | 0.25 | Customer status, stakeholder, account rep, feedback, activity log, MAP phases (7 fields) |
| Communication Responsiveness | customer | 0.20 | Customer status, feedback, notes, timeline progress, activity log (7 fields) |
| Decision Making Velocity | customer | 0.15 | Status, timeline progress, activity log, MAP phases, success criteria (8 fields) |
| Resource Commitment | resource | 0.20 | Customer status, environment, stakeholder, engineer notes, infrastructure, activity log, gaps (8 fields) |
| Executive Sponsorship | customer | 0.20 | Stakeholder, account rep, ACV, sales stage, forecast, feedback, mgmt notes, activity log (9 fields) |

---

## Category Color Coding

| Category | Color | Icon |
|----------|-------|------|
| Risk Assessment | Red (#ef4444) | ShieldAlert |
| Product Evaluation | Blue (#3b82f6) | Package |
| Engagement Analysis | Green (#22c55e) | Handshake |
| General Assessment | Gray (#6b7280) | LayoutGrid |
| Technical Review | Purple (#8b5cf6) | Wrench |
| Compliance Check | Orange (#f97316) | ClipboardCheck |
| CoachIQ | Cyan (#0ea5e9) | GraduationCap |

---

## Configuration & Customization

### Custom AI Instructions

Ruleset-level `additionalInstructions` are injected into the AI prompt before the analysis requirements. Use this to:
- Adjust the AI's focus (e.g., "Prioritize security concerns for healthcare customers")
- Set tone (e.g., "Be coaching-oriented rather than purely analytical")
- Add domain-specific context (e.g., "This customer is in a regulated industry")

### Custom Output Format

Ruleset-level `outputFormatTemplate` replaces the default JSON response structure. This enables:
- Coaching-style responses with narrative feedback
- Simplified scoring formats
- Domain-specific output structures

When set, the AI is instructed to use the custom format instead of the standard risk scoring JSON. The `processAnalysisResponse()` method still attempts to parse the response, but custom formats may require additional processing.

### Data Source Selection Strategy

When selecting data sources for criteria:
- **Fewer, targeted sources** produce more focused AI analysis
- **Related data sources** (success criteria, MAP, gaps) provide rich context but increase prompt size
- **Computed fields** (days remaining, % elapsed) give the AI quantitative signals
- **Notes fields** provide qualitative context but may contain unstructured data

---

## Analysis Flow (End-to-End)

```
1. User clicks "Analyze Projects" on the AI Assessments page
2. User selects projects and chooses a ruleset
3. Frontend sends POST /api/risk/analyze-all with projectIds and rulesetId
4. Backend loads the ruleset and its active criteria
5. For each project:
   a. Scans all criteria for dataSources arrays
   b. Fetches related table data (success criteria, MAP, gaps, activity log)
   c. Builds targeted prompt with only selected data per criterion
   d. Injects ruleset's additionalInstructions (if any)
   e. Uses custom outputFormatTemplate or default JSON structure
   f. Sends prompt to AI provider via aiService.chat()
   g. Parses JSON response, validates scores, clamps values
   h. Saves prediction to project_risk_predictions table
   i. Updates project's riskScore and riskPredictionData
   j. Creates risk_alert if score is high/critical
6. Returns batch results summary (success/failed counts)
7. Frontend refreshes dashboard widgets and project list
```

---

## AI Providers (Admin › Integrations › AI Providers)

Admins add one or more provider connections (OpenAI, Google Gemini, Anthropic, xAI, Azure OpenAI, or a Webhook such as n8n). The model field is free text; the dropdown offers curated suggestions from `PROVIDER_DEFAULTS` in `server/ai/ai-provider-service.ts`, refreshed against each vendor's model docs (last on 2026-11-02). Defaults: `gpt-6-astra` (OpenAI and Azure), `gemini-3.8-flash`, `claude-opus-5-5`, `grok-4.7`.

- API keys are stored AES-256-GCM encrypted. A row whose key cannot be decrypted no longer breaks the list: it shows a masked key and asks the admin to enter the key again; Test Connection reports the same message.
- Request shapes follow current vendor rules: OpenAI and Azure send `max_completion_tokens` (reasoning models reject `max_tokens`) and skip `temperature` for o-series and GPT-5.x; Anthropic never sends `temperature` (rejected from Claude Opus 4.7 on) and joins the `text` blocks of the reply, since content can start with a `thinking` block. Azure uses API version `2024-10-21`.
- Demo Mode: providers are system settings, so real providers stay visible and usable in Demo Mode, and a provider added during Demo Mode is saved as a real one (not removed by the demo wipe). The demo stub provider is shown only in Demo Mode.
- Demo Mode: assessment jobs carry `is_demo` (migration 135). The job list and job detail show only the jobs of the current mode, and an Analyze All started in a demo is a demo job. The demo seed adds three jobs; see [demo-mode.md](../admin/demo-mode.md).

---

## File Reference

| File | Purpose |
|------|---------|
| `shared/schema.ts` | Database schema definitions (assessment_rulesets, risk_criteria, project_risk_predictions, risk_alerts) |
| `server/aiRiskEngine.ts` | Core AI analysis engine (AIRiskEngine class) |
| `server/assessment-data-sources.ts` | Data source registry (8 groups, 60+ fields) |
| `server/ai/ai-service.ts` | Multi-provider AI service abstraction layer |
| `server/routes.ts` | API route handlers for all assessment endpoints |
| `server/storage/audit-risk.ts` | Storage mixin: Assessment Rulesets + Risk Criteria/Alerts CRUD |
| `client/src/components/assessment-ruleset-form.tsx` | Ruleset create/edit dialog form |
| `client/src/components/risk-criteria-form.tsx` | Criteria create/edit dialog form with data source selection |
| `client/src/components/assessment-audit-drawer.tsx` | Assessment result audit drawer |
| `client/src/components/dashboard-widgets/RiskDistributionBar.tsx` | Risk distribution stacked bar widget |
| `client/src/components/dashboard-widgets/RecentRunsFeed.tsx` | Recent runs mini-feed widget |
| `client/src/components/RiskIndicator.tsx` | Risk level badge/indicator component |

---

## Extending the System

### Adding a New Data Source

1. Add the field definition to `DATA_SOURCE_GROUPS` in `server/assessment-data-sources.ts`
2. Add the field mapping to `extractProjectField()` in `server/aiRiskEngine.ts`
3. If it's a `related.*` source, add the query logic to `fetchRelatedData()`
4. The frontend data source picker automatically includes new fields

### Adding a New Ruleset Category

1. Add the category value to the `rulesetFormSchema` enum in `assessment-ruleset-form.tsx`
2. Add the category config (label, icon, color) to `categoryConfig` in the same file
3. Update the `category` column comment in `shared/schema.ts`

### Adding a New Related Data Source

1. Add the field to the `related` group in `assessment-data-sources.ts` with `fieldType: "relation"` and `relatedTable`
2. Add the data fetch logic in `fetchRelatedData()` in `aiRiskEngine.ts`
3. The data will automatically be included in prompts when criteria select it

### Custom Scoring Logic

Override `processAnalysisResponse()` in `aiRiskEngine.ts` to change:
- Risk level thresholds (currently 0–25, 26–50, 51–75, 76–100)
- Score clamping behavior
- Default confidence values
- Array size limits

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "No active assessment criteria found" | No criteria with `isActive: true` | Create criteria or activate existing ones |
| Analysis returns generic scores | No data sources configured | Select relevant data sources per criterion |
| Custom output format not working | Template doesn't produce valid JSON | Ensure the template produces parseable JSON |
| Related data not appearing in prompt | Data source not selected | Check that `related.*` keys are in criterion's dataSources |
| Scores all identical | AI couldn't differentiate criteria | Add more targeted data sources to each criterion |
| High token usage | Too many data sources selected | Reduce data sources to only relevant fields per criterion |
