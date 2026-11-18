# Project Page

The project page (`/project/:id`) is the page customers and internal teams
share for one validation project. It was redesigned in November 2026 as the
customer workspace layout: a light header with the project's identity,
status and pill tabs, and an Overview tab built from bento tiles, a roadmap
and a side panel. (Option B, a gradient header band, shipped first and was
replaced.)

Code: `client/src/pages/project-detail.tsx` (page, data, tab contents),
`client/src/components/project-detail/ProjectHero.tsx` (header),
`ProjectHeroStatus.tsx` (status controls), `project-overview-utils.ts`
(criteria and schedule numbers), and the shared workspace pieces in
`client/src/components/customer-workspace/`: `ProjectWorkspaceOverview.tsx`
(Overview layout), `BentoTiles.tsx`, `RoadmapChart.tsx` with
`roadmap-utils.ts` and `roadmap-rows.ts` (lanes shared with the Account
Portal), `WorkspaceAside.tsx` (to-dos and team) and
`workspace-utils.ts`.

## Header

A light card surface edge to edge under the app header. It shows:

- Account, project number, environment and approver, then the project name,
  the end-date flag and the solution badges.
- Account Status and its status guide. Users with edit access get the
  picker; everyone else sees the status as a `StatusBadge` pill, not a
  greyed-out picker.
- Internal Project Status (`StatusBadge`, `solid`) and the sales stage, for
  internal users only. The sales stage is hidden from Customer and Guest.
- TAP and the Share / hide project tabs button (Engineer and Admin), and
  Save Updates (edit access).
- On every tab but Overview, a ring with the share of active validation
  criteria marked complete (cancelled and inactive criteria leave the
  total). The Overview shows the same number in its criteria tile.
- The tabs as a pill segmented control: Overview, then Mutual Action Plan,
  Success Criteria, Assumptions & Dependencies, Artifacts, Gap Analysis and
  ProjectIQ Coach.

The page background logo (Admin › Appearance › Media) is not drawn behind
this page or the Account Portal.

## Overview tab

Opens first unless the URL names a tab (`?tab=map`, `?tab=success-criteria`
and so on; the old `?tab=gap-analysis` opens Gap Analysis). Two columns that
stack on narrow screens:

Main column, top to bottom:

- Value journey (`ValueJourneyCard.tsx`; "Your value journey" for outside
  users): the project's journey stages as one track in the stage colors,
  with the criteria agreement as a diamond before the gate stage. Done
  stages show a check and the current stage is lit. The details under the
  track start collapsed; the chevron by the stage count opens and closes
  them, and picking a stage opens them on that stage. They show its
  description, its MAP phases, tasks done and the criteria proven in it;
  tiles under it count must-haves met, all criteria met and plan tasks
  done. With no plan, staff see a short note and outside users see nothing.
  See [value-journey.md](value-journey.md).
- Number tiles: Progress (plan tasks done and the current phase; MAP
  projects only), Time left (days to the end date), Waiting on you /
  Waiting on the customer (open customer tasks and how many are overdue;
  MAP projects only) and Success criteria (x of y met, one bar segment per
  criterion; shown when the Success Criteria tab is visible to the viewer).
  The whole criteria tile opens that tab.
- Roadmap (MAP projects with phases), in the Account Portal's style: first
  the project's own lane, as on the portal (account status icon, status and
  open to-dos under the name, a bar that fills to plan progress and leads
  with the current journey stage, "Build · 44% done"). Then one lane per
  phase: a status icon (done, in progress, overdue, up next), the status and
  the customer's open to-dos in that phase under its name, and a bar colored
  by `phaseTone` that leads with the phase's journey stage icon and fills to
  the share of its tasks done ("Build · 25% done"). A line marks today. The
  range spans whole months and stretches to today when today is within a
  month.
- Project brief (`ProjectBriefCard.tsx`): a date ribbon from start to end
  with today marked and the length in days, the "Updated" date and the
  customer logo, then a rail that switches between Problem, Objective,
  Solution and Policy (with the chosen compliance regulations). Only
  sections with text are listed. It replaced the Purpose & Goals and
  Timeline cards.
- Now: the current phase (the first phase not complete) and its tasks, with
  a link to the full plan.
- Then, for internal users: the outcome prompt, the after-action review on
  closed projects, the handoff team and SE Effort from ImpactIQ (see
  [value-journey.md](value-journey.md#after-the-sale)).

Side panel:

- Your to-dos (outside users) or Waiting on <account> (internal users): the
  open customer tasks, overdue first.
  Rows start compact (the name, red when overdue, and the tick box), eight
  to a list; the icon button at the bottom right switches to detailed rows
  (number, step, due date), five to a list. When there are more to-dos than
  five, the list keeps the same height in both modes, and Show N more opens
  the rest in place.
  A row the viewer may change has a round Mark done button. A ticked row
  moves to "Done just now" with Undo until the page is left.
- Messages: the project's conversation between the customer and the project
  team (`ProjectMessagesCard.tsx`). Plain text up to 4,000 characters,
  newest at the bottom, the viewer's own side on the right. Enter sends,
  Shift+Enter adds a line. It refreshes every 30 seconds. The project notes
  sit pinned at the top (Markdown from the rich-text editor, shown with
  `MarkdownContent`); users with edit access change them in place
  (`PATCH /api/projects/:id { notes }`). Readers don't see the block while
  the notes are empty.
- Calendar (`WorkspaceCalendarCard.tsx`, shared with the Account Portal):
  the project's start and end, each phase's due date and the customer's
  to-dos as colored dots on a month grid. Under it, what falls in the month,
  or on the day picked.
- Team, in two parts, each person with a round Email button (a `mailto:`
  link):
  - Our team: the primary SE, opportunity engineer, account representative,
    specialist SE, supporting SEs, the additional supporting team, and
    other people on the plan or given extra access (not engineers, sales or
    customers).
  - Your team (outside users) or <account> team (internal users): the
    customer users with access to the project, Project Admins first, with
    their stakeholder types. Internal users also see whether each can edit
    or only view. Staff given customer access are left out.
  Each part shows six people, then Show all.

## Marking a to-do done

`POST /api/projects/:projectId/customer-actions/:taskId/status` with
`{ done: true }` sets the task to complete; `{ done: false, previousStatus }`
undoes it (`previousStatus` is one of not started, in progress, blocked, at
risk or stalled; in progress when left out). Only the status changes
(`server/routes/customer-workspace-routes.ts`). The rules
(`canCompleteCustomerAction` in `shared/customer-actions.ts`):

- The task must be a customer-side task of this project (a task id from
  another project answers 404).
- The viewer must be able to open the project. Customer, Partner and Guest
  users also need the MAP tab shared with them.
- Outside users may tick tasks assigned to them, or customer-team tasks with
  no named person. A task assigned to a colleague stays read-only.
- Internal users need project edit access.

The customer-actions routes return `canComplete` on each row, worked out by
the same rule, so the button shows only where the change is allowed. When an
outside user marks a to-do done, the project's internal team gets a
notification (bell and digest). The change is logged in the project
activity and broadcast like any MAP edit.

## Project messages

Stored in `project_messages` (migration `127_project_messages.sql`), read
and written through `server/storage/project-messages.ts`:

- `GET /api/projects/:projectId/messages`: the latest 200, oldest first,
  with the author's name, side (outside user or project team) and whether
  the viewer may delete it.
- `POST /api/projects/:projectId/messages` `{ body }`: anyone who can open
  the project, including Customer, Partner and Guest users. The project's
  internal team and customer users (except the author) get a notification
  with a short excerpt; each recipient is checked against project access.
- `DELETE /api/projects/:projectId/messages/:messageId`: the author or an
  Admin. The message stays in the list as "Message deleted" with its text
  removed.

- `POST /api/projects/:projectId/messages/read` `{ messageId }`: records
  that the viewer has read the project's messages up to that one
  (`project_message_reads`, migration `130_project_message_reads.sql`; it
  never moves back). The conversation calls it whenever its newest message
  changes, on the project page and on the Account Portal. Skipped under View
  As, which is read only.
- `GET /api/project-messages?projectIds=…`: the latest 30 messages across
  the listed projects (up to 100), deleted ones left out, for the Account
  Portal's "All" view.
- `GET /api/project-messages/unread?projectIds=…`: per project with
  messages, how many the viewer hasn't read (written by someone else after
  the newest one they've read, deleted ones left out) and when the newest
  was posted.

The two cross-project reads leave out projects the user can't open.

Notifications are not written in Demo Mode (as for every notification).
Demo Mode seeds a short conversation between the account's champion and the
project's engineer on each live project (`planMessages` in
`server/lib/demo-story.ts`).

## What is waiting on the customer

`GET /api/projects/:projectId/customer-actions` returns the open MAP tasks
the customer side owns (`shared/customer-actions.ts`). A task counts when it
has a customer owner, or its team names the customer side ("Customer",
"Client"). Complete, cancelled and deferred tasks are left out. Overdue
tasks come first, then by due date.

Customers, Partners and Guests see it as "Your to-dos"; internal users
see "Waiting on <account>". It shows only on MAP projects, and outside
users see it only when the MAP tab is shared with them (the route checks
this too). The Account Portal shows the same list across all of an
account's projects (`GET /api/customer-actions?projectIds=…`).

## Who can open the page

Customer, Guest, Partner, Sales, CX and Product see a project only when they
are an assigned engineer or are listed in its customer users or additional
access. `GET /api/projects/:id`, the project list filter and the MAP access
checks all use one matcher, `findProjectAccessEntry` in
`server/lib/project-list-access.ts`. It accepts the stored entry shape
(`userId`, `userEmail`) and the enriched shape the storage layer returns
(`id`, `email`), compares emails without case, and never matches on a
missing email. Before November 2026 the page and the list read only the
stored shape, so customers listed on a project got "Access denied".

## Artifacts tab

Three sections, each heading with its own icon: Project Documents (cards),
Project Links (chips) and Customer Artifacts (rows). Each document and
artifact shows its type's icon and color, and each link its link type's
icon, from `client/src/components/artifacts/artifact-type-icons.ts` (the
same icons as the Upload Document type list and Artifacts › Links). A
missing or unknown type gets the Other icon.

## Sharing tabs with outside users

The Share / hide project tabs button opens the deliverables visibility
setting. The window lists the tabs in page order. Mutual Action Plan,
Success Criteria, Assumptions & Dependencies and Artifacts are shared by
default; Gap Analysis and ProjectIQ Coach are hidden by default and only an
Admin can share them. Outside users do not see hidden tabs; internal users
see them with a dashed red outline. When the whole deliverables area is hidden, outside
users see only the Overview tab.

## Download PDF

The Download PDF and Back buttons were removed from the page header in
November 2026 (the sidebar and the browser's Back cover navigation). The
export code in `project-detail.tsx` still listens for the
`downloadProjectPDF` event but nothing sends it; see the backlog. When it
ran, it captured the header, then each visible tab in turn
(`.pdf-capture-area`, `.pdf-tabs-section`, triggers with `data-tab-value`).
