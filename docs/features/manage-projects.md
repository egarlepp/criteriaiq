# Manage Projects

Project Workspace › Manage Projects (`/project?tab=validation&subtab=projects`).
One card with three views, chosen in the card header and remembered per
browser: **Due** and **For Review** group projects into cards, **Table**
lists every project. The view switch is icon-only; each icon has a tooltip
(and matching `aria-label`) that says what the view shows.

**Show My Projects** (top right of Search and Filters) starts ticked for
everyone, so the page opens on the projects you are an engineer on (primary,
specialist, opportunity or supporting). Untick it to see every project you
can open. It ticks again when you switch to another Project Workspace tab.

Code: `client/src/components/projects/ValidationProjectsPage.tsx` (filters,
data, drawers, view switch), `manage-projects-table.tsx` (Table view),
`manage-projects-table-cells.tsx` (cell pieces), `project-grouped-views.tsx`
plus `components/dashboard/DashboardProjectCard.tsx` (Due and For Review).

## Table view

`GET /api/projects` adds `competitorNames`, `statusChange` and
`customerStatusChange` (`{ by, at }`) to each project for this table; all
three are internal fields that outside users never receive
(`server/lib/external-fields.ts`). `GET /api/risk/r-index` returns each
project's latest `confidence` (0 to 1) and `runAt` alongside the score.
It is staff only, like every route in `server/routes/assessments-routes.ts`:
outside users get a 403 and the table doesn't request it for them.

Account-first, so every row opens with who the project is for.

| Column | Shows | Sort |
|---|---|---|
| Account · Project | Account name (links to the account), then `#ID · project name` (links to the project). Markers on the left: the ProjectIQ coach icon (opens the project's Coach tab; shown only when the project has coaching, so hidden until the Coach feature stores coaching), then a swords icon for projects with competitors whose hover gives the count and lists them by name. Pinned while the table scrolls sideways. | Account; the header menu switches to Project ID |
| R-Index | AI risk score. Hover shows the score, when the latest run happened and its confidence, plus a reminder that a click opens the assessment drawer. | Score |
| Risk, Ranking | Chip-sized pickers that save on change. Icons and colors come from Configuration › Field Settings. Read-only without project edit permission. | Value |
| Statuses | Internal and Account status: two round, button-sized pills side by side (`StatusBadge` with `iconOnly`): the Field Settings icon on the status color. Hover gives the full status name and who set it, and when, from the newest `project_audits` row for that field. A status nobody has changed since the project was created says so. | Internal status; the header menu switches to Account status |
| Solution | `SolutionMark` per solution: the uploaded graphic (else the solution's icon, else a package icon) plus the solution's Abbreviation (else its initials). Full name on hover. | Name |
| Type · Environment | Type, with environment underneath | Type; the menu switches to Environment |
| Team | Internal users only | Team |
| Engineers | Initials for the primary (blue) and specialist (violet) engineer; full name and role on hover | Primary; the menu switches to Specialist |
| End Date | Date, end-date badge, and days left or duration | Date |
| Activities | ImpactIQ activity counts, when that connection is on | Count |

A merged column's header has a small chevron menu ("Sort by") next to its
label. Picking a field sorts by it ascending; the header arrow then flips the
direction. This is the optional `headerAddon` prop on `SortableTableHead`.

**Density.** Compact (default) or Comfortable, set by one icon button beside
the view switch (Table view only). The icon shows the current density and a
click switches to the other; the tooltip says both. Stored in the browser
(`manage-projects-table-density`).

The page's own `SortableTable` gets `!overflow-visible` so the pinned column
sticks to the scrolling wrapper; other tables are unchanged.

## Due and For Review

Cards grouped by end date (Due) or internal status (For Review), drawn by
`DashboardProjectCard.tsx`.

Both views use the same card. Cards fill the width: as many columns as fit
at a 400px minimum (one on phones, two at 1440px, three at 1920px, four at
2560px). The card's fact list switches to two columns by the card's own
width (a container query), not the window's.

**Front of the card**

- **Header bar** uses the theme's top-bar colors (Admin › Appearance), so it
  follows the install's branding. It shows the account name, `#ID · project
  name`, and both statuses as `StatusBadge` (`darkRail`) with their Field
  Settings icons.
- **Progress ring** on the right of the header: the share of validation
  criteria marked Complete. Inactive and Cancelled criteria are left out of
  the total. It shows "—" when the project has no criteria; hover for the
  count.
- **Risk edge**: a 3px strip in the risk color across the top of the card,
  only when risk is not None. A healthy project shows no strip.
- **Facts** with icons: Ends (date and days left or overdue), Account Rep,
  Risk and Ranking. Risk and Ranking take their icon and color from
  Configuration › Field Settings.
- Business problem (two lines) and solution badges (`+N more` past three).
- **Footer**: the "Engineers & journey" expander (the project's value journey stages), then two icon buttons:
  View Project and the Mutual Action Plan (MAP).

Click the card to flip it. The back shows Business Problem, Solution
Description, Customer Objective, Policy Considerations and a criteria bar.
