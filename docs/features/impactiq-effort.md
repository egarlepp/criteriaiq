# SE Effort from ImpactIQ

Internal users see the SE hours logged in ImpactIQ against a project's CRM
Opportunity on the project page, in an **SE Effort (ImpactIQ)** card at the
bottom of the Overview tab. It shows total hours, the number of
activities, the last activity date, and the top people and activity types.
With ImpactIQ v1.449+ it can also show the total cost, and its button opens
ImpactIQ's activities drawer for that Opportunity.

Code: `server/impactiq/` (settings and the ImpactIQ client),
`server/routes/impactiq-routes.ts` (routes), `shared/impactiq.ts` (shapes),
`client/src/components/integrations/ImpactiqConnectionForm.tsx` (the
Integrations card) and `client/src/components/project-detail/ImpactiqEffortCard.tsx`
(the project card). ImpactIQ's side is its `docs/effort-api.md` (v1.448+).

## Setup

1. In ImpactIQ, a Team Leader or admin opens **My Settings › API Keys** and
   creates a key with only the `effort:read` scope. That key reads hour totals
   per Opportunity and nothing else in ImpactIQ.
2. In CriteriaIQ, an Admin opens **Admin › Integrations › Overview › ImpactIQ ›
   Configure**, enters ImpactIQ's address and the key, and saves.

The card's **How to connect ImpactIQ** panel lists these steps plus the other
two parts of the link: the Read only key ImpactIQ uses to read projects here
(Admin › Integrations › API Keys) and the webhook behind its live
refresh (see `project-summary-api.md`). ImpactIQ carries the same steps, with
troubleshooting, in How to Use ImpactIQ › Connecting CriteriaIQ; change both
when a menu moves. The panel is open until a connection is saved.

Saving checks the address and key with ImpactIQ first (a call with an id no
record has), so a key that doesn't work never replaces one that does. The
key is stored AES-256-GCM encrypted in `impactiq_connection.api_key` (one row,
covered by ENCRYPTION_KEY rotation) and is never sent back to the browser,
only its last four characters. Saving and removing it are recorded in Login
History (`impactiq_key_saved`, `impactiq_key_removed`).

## Behavior

- `GET /api/projects/:id/impactiq-effort` is for internal users who can open
  the project (Customer, Partner and Guest get 403; a missing or not-allowed
  project gets the same 404). It answers `{ status: "hidden" }` when ImpactIQ
  isn't connected, is switched off, or the project has no CRM Opportunity, and
  the card isn't drawn.
- Every call to ImpactIQ goes through the outbound URL guard, refuses
  redirects and times out after 8 seconds. Answers are cached for five
  minutes per Opportunity; saving, checking or removing the connection clears
  the cache.
- When ImpactIQ refuses or can't be reached, the card says why
  (`{ status: "unavailable", errorCode }`) instead of showing numbers.
- Hours come from submitted ImpactIQ activities on that Opportunity, from the
  teams the key's owner can see now. If the owner stops leading a team in
  ImpactIQ, the key stops working.
- **Cost** (ImpactIQ v1.449+) is one total for the Opportunity, in US dollars:
  hours times each person's ImpactIQ cost rate, plus travel costs. ImpactIQ
  never sends cost per person or per activity type, since that would reveal a
  person's rate. CriteriaIQ sends the total only to Admin and to roles granted
  **SE Cost (ImpactIQ)** in Role Management (`impactiq_cost`, view or higher).
  No grant means no cost; it does not inherit from Project Workspace. When some
  activities' owners have no cost rate in ImpactIQ, the card says how many.
- **View activities in ImpactIQ** links to
  `<ImpactIQ address>/?openOpportunity=<id>&name=<Opportunity name>`, which
  opens ImpactIQ's activities drawer for that Opportunity. What it lists
  follows the person's own ImpactIQ access, not the key's. An older ImpactIQ
  opens its home page instead.
- **Demo Mode:** demo projects aren't in ImpactIQ, so ImpactIQ is never
  called. The card and the Activities column show made-up figures from
  `server/impactiq/demo-effort.ts` (see [Demo Mode](../admin/demo-mode.md)),
  whether or not ImpactIQ is connected, with no link to ImpactIQ
  (`impactiqUrl` and `activitiesUrl` are null).

## Activity counts on Manage Projects

Manage Projects can show an **Activities** column: how many ImpactIQ
activities of admin-chosen types are linked to each project. It needs
ImpactIQ v1.454+ (`GET /api/v1/effort/activity-types` and
`POST /api/v1/effort/project-counts`, both behind the same `effort:read` key).

- **Setup.** Under the ImpactIQ connection (Admin › Integrations › Overview ›
  ImpactIQ), **Activity counts on Manage Projects** lists ImpactIQ's active
  activity type names. The Admin ticks the types that count (Eval Work / POx
  Work today, more later). Nothing ticked keeps the column hidden. Saved in
  `system_settings` key `impactiq_activity_counts`
  (`server/impactiq/activity-count-settings.ts`).
- **What counts.** Submitted ImpactIQ activities of a chosen type whose
  Project link is this project: the CriteriaIQ project itself (when ImpactIQ
  uses CriteriaIQ as its Project source) or the CRM record in the project's
  Evaluation link (Salesforce Evaluation, or a HubSpot project record).
  ImpactIQ only links an activity to a Project when its type has a Project
  picker, so the list marks chosen types without one ("No Project picker").
  A saved name ImpactIQ no longer has, for example after a Terminology
  rename, shows as "Not found in ImpactIQ".
- **Opportunity fallback** (off by default). Also counts chosen-type
  activities that have no Project link but are on the project's Opportunity
  and dated between its start and end dates. ImpactIQ can't tell which
  project such an activity belongs to, so two projects on the same
  Opportunity with overlapping dates both count it; the setting carries a
  warning saying so, and each cell's hover says how many came in this way.
  Projects without both dates get nothing from it.
- **Fetching.** `GET /api/impactiq/project-activity-counts` (internal users)
  takes the projects the viewer may list (the same rules as
  `GET /api/projects`, `server/lib/project-list-access.ts`), never ids from the
  browser, and sends ImpactIQ only the CriteriaIQ id, the CRM project id, the
  Opportunity id and the dates. Projects go in batches of 200; answers are
  cached five minutes per project and settings. One ImpactIQ failure turns
  the whole column into a warning icon with the reason
  (`not_supported` = ImpactIQ older than v1.454).
- **The cell** shows the count (sortable), with hours and last activity on
  hover. A count above zero opens the **activities drawer**. Code:
  `client/src/components/projects/impactiq-activity-column.tsx` and
  `client/src/components/integrations/ImpactiqActivityCountsSettings.tsx`.
- **The activities drawer** lists the activities behind the count in a
  sortable table: type (with ImpactIQ's icon for it, in the type's color; a
  gray activity icon when ImpactIQ has none), the person who logged it, hours, start and end (in the
  viewer's time zone), newest first. A route icon marks an activity counted
  only through the Opportunity fallback. When the project has an Opportunity,
  **Open in ImpactIQ** links to ImpactIQ's own activities drawer for it.
  `GET /api/projects/:id/impactiq-activities` (internal users who can open the
  project; the same 404 for missing and not allowed) sends ImpactIQ the same
  project fields and activity type settings as the column and calls
  `POST /api/v1/effort/project-activities` (ImpactIQ v1.479+; older versions
  answer `not_supported`). ImpactIQ shares the matching code between the two
  calls, so the list always adds up to the count. ImpactIQ never sends titles,
  notes or cost. Answers are cached five minutes; ImpactIQ lists at most 500
  activities and says when there are more. In Demo Mode the list is made up
  from the same figures as the column (`demoImpactiqActivities()`), and
  nothing is sent to ImpactIQ. Code:
  `client/src/components/projects/impactiq-activities-drawer.tsx`.
