# Page Usage

Admins can see how often each page was opened, and by how many people, at
**Admin › Monitoring & Audit › Page Usage**
(`/admin?tab=page-usage`). The point is to find pages
nobody uses so they can be removed (parity plan item P4-4, candidates: the
builders under Insights). Wait for 4 to 6 weeks of counts before deciding.

Code: `client/src/lib/page-view-key.ts` (naming a page),
`client/src/hooks/use-page-view-tracking.ts` (sending a view),
`server/routes/page-views-routes.ts` (routes),
`server/storage/page-views.ts` (queries),
`server/services/page-view-cleanup.ts` (pruning) and
`client/src/components/configuration/system-health/PageUsageTab.tsx`
(the screen).

## What is counted

`PageLayout` sends one view each time a signed-in person moves to a
different page. Changing filters or in-page tabs on the same page is not
another view. Nothing is sent while an Admin is in Persona View Mode, and a
failed request is ignored.

A page is named by its sidebar entry's `id` (`sidebar-nav-config.ts`): the
open view of an Admin page, else the open child, else the item. Routes
outside the menu have fixed keys in `UNLISTED_PAGES` / `DYNAMIC_PAGES`
(`page-project-detail`, `page-tags`, …). Unknown URLs and the
error test page are not counted. A test fails if a signed-in route in
`App.tsx` has no key, or a menu link resolves to another entry's key, so a
new page is picked up from the menu with no extra step.

## What is stored

`page_view_daily` (migration 095): one row per UTC day, page key and user,
with the number of views and the time of the last one. Rows go when the user
is deleted, and rows older than 400 days are pruned daily by the
`page_view_cleanup` job (Configuration › Scheduler).

The server only accepts keys matching `PAGE_KEY_PATTERN`
(`shared/page-views.ts`) and records a view for the session user only. Once
a person has 300 distinct pages in a day, further new keys that day are
dropped, so a script can't fill the table with made-up keys.

Rows are per person so "how many people" can be counted across days. The
screen and its route (`GET /api/admin/page-usage`, Admin only) return
totals per page, never who opened what. Backups include the table like
every other.

## The screen

- Period: last 30, 90 (default), 180 or 365 days.
- Cards: the first day with any count, people active in the period, and
  pages with no views in the period.
- Table: every page in the menu plus the pages outside it, least used first,
  with views, people and the last view. Every column header sorts the table
  (click again to reverse); the sort is kept in the URL. Pages only Admins can see are
  marked, since a page few roles can see naturally gets fewer views. A key
  recorded for a page that has since left the menu is still listed, marked
  "No longer in the menu".
