# Account Portal

The Account Portal (`/account-portal`, sidebar "Account Portal") is the
account-level page. Customers, Partners and Guests land here; internal users
pick an account from the Select Account dropdown.

Code: `client/src/pages/customer-dashboard.tsx` (page),
`client/src/components/accounts/AccountPortalHero.tsx` (header),
`client/src/components/customer-workspace/PortalWorkspaceHome.tsx` (Projects
tab home), `client/src/components/shared/ProjectCard.tsx` (project cards),
`client/src/components/dashboard-widgets/AccountMetricsWidget.tsx`,
`ProjectSchedulesWidget.tsx` and `StatusDistributionWidget.tsx` (Overview
widgets).

## Layout

The portal uses the same light header as the project page
([`project-page.md`](project-page.md)): the account's logo, region,
industry, solutions, account rep and account engineer (email links), the
account picker (internal users with more than one account), the account
users drawer, requests (an icon button the same size as the users
button), and the customer portal link. The tabs are a pill
segmented control under the header, and `?tab=` opens one directly
(`overview`, `projects-table`, `resources`, `cloudlabs`):

- **Projects** (opens first), the customer workspace home:
  - A greeting and a line saying how many to-dos are waiting.
  - Number tiles: Active projects, Waiting on you (and how many overdue),
    Next deadline (the soonest open to-do due today or later), and Criteria
    met across the active projects.
  - Your Roadmap: one lane per active project from its start to its end
    date (linked to the project), late when past its end date. Each
    project's name starts with a round icon in its account status color and
    icon (as on the status pill; a gray dashed circle when it has none).
    The bar leads with the current journey stage's icon in its color (a
    green check once every stage is done) and reads "Build · 44% done": it
    fills to the share of plan tasks done and the rest is faded. A project
    with no plan keeps a plain bar with its name.
    Under the name, its customer status and how many open to-dos it has
    (and how many are overdue). The to-dos themselves are dated in the side
    panel and calendar, not pinned on the lanes.
  - Your Active Projects (folder icon in the heading): one card per active project, up to three across
    (`PortalProjectCardsGrid.tsx`). A column is never narrower than the
    widest card's journey stages plus its buttons need, so the stages stay
    on one line: as the page narrows a row drops from three cards to two,
    then one, and on a very narrow screen a card scrolls sideways rather
    than shrink. Every card in the grid has the same height.
    Each card's small label above the solution names the project, in the
    brand color, so it matches its roadmap lane.
    Fewer projects stretch to fill the row. The journey stages are round
    icons in each stage's own icon and color (Template Management › Value
    Journey): filled once done (with a small green check) or current,
    grayed out while not started, with the name and state in a tooltip.
    The View project, Messages, View MAP (the MAP icon used across the
    app) and Account Users buttons are icon buttons beside them. The
    Messages button carries the viewer's unread count and opens the
    project's conversation in the side panel. Account Users opens the
    access drawer for that project only.
  - Side panel: all to-dos across the account (each opens its project, and
    has a Mark done button where the viewer may tick it; see
    [project-page.md](project-page.md#marking-a-to-do-done)). With to-dos on
    more than one project, pills filter the list: All, then one per project
    with its open count (a closed project with open to-dos gets one too). A
    project with no open to-dos gets no pill; with none at all, the card
    shows only its "nothing waiting" note.
    Rows start compact (name and tick box, eight shown); the icon button at
    the bottom right switches to detailed rows (five shown) at the same list
    height. "Show N more" expands it in place.
  - Messages, under the to-dos (`PortalMessagesCard.tsx`): All lists the
    latest 30 messages from the active projects, each tagged with its
    project (the tag opens that project). A project pill, with the viewer's
    unread count, opens that project's conversation with a reply box, the
    same thread as on the project page, and marks it read. Only projects
    with messages get a pill (plus the one opened from a project card's chat
    button, which is how the first message is written); with no messages at
    all, All shows a note pointing to that button. The header shows the
    total unread. The list scrolls inside a fixed height. See
    [project-page.md](project-page.md#project-messages) for the routes.
  - A calendar
    (each active project's start and end, and the to-dos' due dates; pick a
    day to list what falls on it). The account rep and account engineer are
    in the page header, and All projects, Resources and Lab environments are
    its tabs.
  - The number tiles carry an icon by the label and a large faded copy
    behind the value.
  - The Project Metrics, Project Scheduled Dates and Account Status Metrics
    widgets were removed from this tab in November 2026; the calendar card
    replaces the schedule widget.
- **All projects**: the validation projects table with search and filters.
- **Resources**: the Learning & Documentation and Support & Community cards
  (at most four links each) come from Library › Knowledge › Resource Content
  ([resource-content.md](resource-content.md)); people with Edit on that page
  get a pencil on each card to choose and order its links. Video Tutorials and
  Artifacts list the account's links and documents, and the FAQ follows.
- **CloudLABs**: unchanged.

"Active" leaves out projects whose status contains closed, won, lost,
complete, done or cancel (`isClosedProjectStatus`).

The to-dos come from `GET /api/customer-actions?projectIds=…` (up to 100
projects). It skips projects the user can't open, and for Customer, Partner
and Guest users it skips projects whose MAP tab is not shared with them.

## Customer workspace menu

Customer, Partner and Guest users get their own sidebar menu
(`client/src/components/customer-workspace/CustomerWorkspaceNav.tsx`) above
anything the staff menu still shows them: Home (`/account`), My to-dos (with
the open count; jumps to the to-do list), their active projects (a dot shows
red for overdue to-dos, orange for open ones, green for none), Resources and
Lab environments.

## What outside users see

Customer, Partner and Guest users never see Internal Project Status:

- The Project Metrics widget leaves out the Internal Project Status chart
  (`showInternalStatus={false}`) and drops "Internal" from its title.
- The validation projects table has no Internal Project Status column.
- The progress ring tooltip on a project card shows progress, not the
  internal status name.
- The MAP button tooltip leaves out the status name.

The same rule applies on the project page (`/project/:id`): the Internal
Project Status field is hidden from outside users.

These checks are in the UI only; the project payload still carries
`status`. Filtering it server-side is a backlog item.

## Customer portal link

Admins set the company's own customer portal link at Admin › Workplace ›
Terminology › Account Portal (`system_settings` key `account_portal`,
schema `shared/account-portal-settings.ts`). The link must start with
`https://`; empty hides the button.

- `GET /api/admin/account-portal`, `PUT /api/admin/account-portal`: Admin.
- `GET /api/account-portal/links`: internal users only (403 for Customer,
  Partner and Guest).

When set, internal users see a handshake button on the portal header that
opens the link in a new tab. Outside users never get the link, because the
route refuses them.

## Account Access drawer

`AccountAccessDrawer.tsx`. The header's users button opens it for the whole
account: one row per Contact User on the account (Account Management ›
account › Contact Users), with an initials avatar, their job title (the
user's own Title; a viewer without one gets a "Click to update job title"
pill on their own row that saves through `PUT /api/users/me`), their email
(a mail link) and how many of the account's
projects they are on (primary, specialist or supporting engineer, or given
access to the project). A project card's Account Users button opens it for
that project: the account contacts on it plus anyone on the project's
customer access list (`GET /api/customer-access/:projectId`), each with
View or Edit.
