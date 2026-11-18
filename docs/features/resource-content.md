# Resource Content

Library › Knowledge › Resource Content (`/project?tab=resource-content`). The
links on the Account Portal's Resources tab, in the **Learning &
Documentation** and **Support & Community** cards. Each card shows at most
four links, in the order chosen for it.

Code: `client/src/components/resource-content/` (`ResourceContentSection.tsx`
is the page, `ResourceTable.tsx` the grouped tables, `ResourceDialog.tsx` the
create/edit dialog, `PortalResourceCards.tsx` the two portal cards,
`PortalCardEditor.tsx` the card editor, `resource-content-api.ts` the
queries), `shared/portal-resources.ts` (validation, limits, who may change a
row), `server/routes/portal-resources-routes.ts` (routes),
`server/storage/portal-resources.ts` (data access),
`server/seed/system-portal-resources.ts` (System resources), table
`portal_resources` (migration 131).

## A resource

| Field | Notes |
| --- | --- |
| Card | Learning & Documentation or Support & Community |
| Title, description | Title up to 120 characters, description up to 500 |
| Icon, icon color | Any Lucide icon; a hex color |
| Link | An **App page** (a path inside CriteriaIQ, such as `/getting-started`, picked from the sidebar's pages or typed) or an **External link** (`https://` or `http://`). App pages open in place; external links open in a new tab. |

## The page

Laid out like Knowledge › Artifacts:

- **Search & Filters**: search (title, description, link, creator), link type,
  and whether the resource is on its portal card.
- **View:** switches between the two cards (`&subtab=learning|support`).
- The card's library, in three collapsible groups: **My Resources** (created
  by you), **Other Resources** (created by other people) and **System
  Resources** (shipped with the app). There is no inactive group: a resource
  is either on its card or not.
- Each row shows where it sits on the card ("Shown · #2") and offers Show on /
  Remove from portal card, Edit and Delete.

## Who can do what

The page has its own permission key, `project.resource-content` (None / View
/ Edit in Role Management). On first boot every role and person gets the
value they have on Artifacts (`project.artifacts`). Admins always pass.

| Action | Needs |
| --- | --- |
| See the portal cards | Any signed-in user who can open the Account Portal |
| See the page | View, internal users only |
| Create a resource; choose and order what a card shows | Edit |
| Change or delete a resource | Edit, and be its creator or an Admin |
| Change a System resource | Admin |
| Delete a System resource | Nobody: take it off the card instead |

On the Account Portal, internal people with Edit see a pencil on both cards.
It opens a dialog to tick up to four of the card's resources, order them,
add a new resource (it goes straight onto the card when there is room), or
jump to the full page.

## System resources

Eight links seeded at boot by `seedSystemPortalResources()`, keyed by
`system_key`: four per card, all on their card. A missing row is added again
on the next boot; existing rows keep an Admin's edits and card choices.

## API

| Method | Path | Body / notes |
| --- | --- | --- |
| GET | `/api/portal-resources/cards` | What each card shows, in order |
| GET | `/api/portal-resources` | Every resource (View) |
| POST | `/api/portal-resources` | `{ card, title, description?, icon, iconColor, linkType, url }` |
| PATCH | `/api/portal-resources/:id` | Any of those fields; `linkType` and `url` go together |
| DELETE | `/api/portal-resources/:id` | Not for System resources |
| PUT | `/api/portal-resources/cards/:card` | `{ ids }`: what the card shows, in order (at most 4) |

Errors carry a `code` (`invalid_link`, `link_pair`, `card_full`,
`wrong_card`, `not_owner`, `system_admin_only`, `system_locked`,
`not_found`, `invalid_input`) that the client translates.

## Demo Mode

Demo Mode adds three resources by Demo Staff (they appear under Other
Resources, off the cards) and shows them with the System resources. The
wipe removes them. Resources created during a demo session are demo rows too.
