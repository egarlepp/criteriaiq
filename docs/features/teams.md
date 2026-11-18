# Teams

Admin › Team & People › Teams. Ported from ImpactIQ's Teams. A team is a
named group of internal people with an optional manager and subteams.
**Teams only organize and filter people.** They never change what anyone can
see or do: access still comes from each person's one role and the page
permissions in Role Management.

Code: `client/src/components/teams/` (`TeamsSection.tsx` is the page,
`team-dialog.tsx` the create/edit dialog, `team-subteams-panel.tsx` the
subteam tree, `user-teams.tsx` the Users page pieces, `teams-api.ts` the
queries), `server/routes/teams-routes.ts` (routes),
`server/storage/teams.ts` (queries), `shared/teams.ts` (limits, request
schemas, response types, tree helpers). Tables: `teams`, `team_members`,
`subteams`, `subteam_members` (migration 104), and `projects.team_id` /
`projects.subteam_id` (migration 105).

## Model

| Thing | Rules |
|---|---|
| Team | Name (unique, ignoring case), icon, description, optional manager, active flag. The slug is set from the first name and kept on rename, so links from other apps (ImpactIQ) keep working. |
| Membership | A person can be on several teams. One of them is their **default team**, shown first wherever their teams appear. The first team a person joins becomes the default; when the default team is removed, their oldest remaining team takes over. |
| Subteam | Belongs to one team, with a kind (Region, Type, Product, Other or none) and an optional parent subteam. Subteams nest up to 4 levels. Deleting a subteam moves its own subteams up a level. |
| Subteam people | Leaders and members, picked from the team's own members. Removing someone from the team also removes them from its subteams. |
| Manager | Shown on the team. Gives no extra access. |

Customer, Guest and Partner users never join a team (the API refuses them).
Changing a person to one of those roles in the user dialog clears their teams.

## Where teams show up

- **Teams page**: filters (search, status), KPI cards (active teams, people
  on a team, internal people on no team, subteams), and a list of teams. The
  dialog has Details, Members and Subteams tabs.
- **Users page**: a sortable **Team** column (default team first, marked
  with a star), a **Team** filter (all, no team, or one team), and a team
  picker with a default-team choice in the user dialog's Organization step.
- **Projects**: an optional **owning team** and subteam (see below), a
  sortable **Team** column and **Team** filter on Manage Projects (Table,
  Due and For Review views), a **Team** filter on the Project Board, and
  `owningTeam` on the [project summary API](project-summary-api.md).
- **Dashboard**: a **Team** filter in the Search & Filters card. It narrows
  the project list the KPI cards and widgets read, like the other filters.
- **Report Builder**: a **Teams** field group with **Owning Team** and
  **Owning Subteam** (`teamName`, `subteamName` in
  `server/lib/report-fields.ts`). Both work as columns and as filters, for
  example Owning Team equals "EMEA". The team tables are joined only when a
  report uses one of these fields.
- **Recipients**: see [Teams as recipients](#teams-as-recipients).

## Teams from SSO groups

Okta and Azure settings (Admin › Integrations › Overview, under Advanced)
have a **Group to team mapping** table next to the group to role mapping:
each row maps an IdP group (Okta group name, or Entra group object id) to a
team and, optionally, one of its subteams (`sso_config.team_mapping`,
migration 112).

Every SSO sign-in applies the table:

- The person joins every team and subteam their groups map to. A subteam
  row also puts them on its team. Inactive teams and subteams are skipped.
- Places the sign-in added earlier that their groups no longer map to are
  removed, including when the table no longer has the row.
- A team or subteam an admin added by hand is never removed, even when no
  group maps to it.

Each membership records its source (`team_members.source`,
`subteam_members.source`: `manual`, `sso` or `crm`); the Members tab shows
an **SSO** badge on people the sign-in added. If an admin removes an
SSO-added person by hand, their next sign-in adds them back while their
groups still map to the team. A team edit keeps each person's source.

The sync runs after the account checks (active, approved, allowed to use
SSO) and before the MFA step. It never blocks a sign-in: a failure is
logged and the sign-in carries on. Code: `targetsFromGroups()` /
`planSourcedMemberships()` in `shared/teams.ts`,
`storage.syncSourcedTeams()`, `syncTeamsFromGroups()` in
`server/auth/oidcAuth.ts`, and `SsoTeamMappingEditor.tsx` in
`client/src/components/integrations/`.

## Teams from the CRM

A team can link up to five CRM groups on its Details tab (**CRM
departments**, `teams.crm_departments`, migration 113). A subteam can link
up to five too, in the subteam form (`subteams.crm_departments`, migration
116):

- **Salesforce**: `User.Department` values. The picker lists the
  departments of active Salesforce users, read on the admin's own
  Salesforce connection. A department can also be typed in.
- **HubSpot**: HubSpot teams, picked from the owner copy
  (`hubspot_owners.teams`, filled by the daily owner sync). Stored as
  HubSpot team ids, so a renamed HubSpot team stays linked.

The daily **Teams from CRM** job (`team_crm_sync`, Configuration ›
Scheduler, 03:15) and the **Sync from CRM** button on the Teams page (shown
once a team is linked) run the same sync:

- Each active internal person is matched to the CRM by email. They join
  every active team, and every active subteam of an active team, linked
  to their department or one of their HubSpot teams, as `crm` places. A
  subteam place brings its team with it. Department names match ignoring
  case.
- `crm` places that no longer match are removed. Places an admin added by
  hand, or that SSO sign-in added, are never touched.
- If the CRM can't be read, nobody changes. A person the CRM answered
  about, but who isn't in it or has no department, counts as "no
  department".
- Salesforce has no org-wide connection in CriteriaIQ, so the Salesforce
  read runs on one person's own connection: the admin who clicked the
  button, else the first person with a working one.
- With no CRM chosen, the sync skips.

The Members tab shows a **CRM** badge on people the sync added, and a
subteam row lists its linked departments. Code:
`server/services/team-crm-sync.ts`, `crmTargetsFor()` and `hasCrmLinks()` in
`shared/teams.ts`, and `team-crm-departments.tsx` in
`client/src/components/teams/`. Routes: `GET /api/teams/crm-departments`
(picker options) and `POST /api/teams/crm-sync` (Sync from CRM), both Edit
on Teams.

## Fill teams automatically (setup card)

People with Edit on Teams see a **Fill teams automatically** card on the
Teams page, above the list. It shows both ways teams fill themselves:

- **Sign-in groups**: for Okta and Azure, whether sign-in is on and how
  many groups map to teams, with a **Set up** link that opens that card on
  Admin › Integrations › Overview (`?open=okta`, `?open=azure`).
- **CRM departments**: how many teams and subteams link a department, and
  the last recorded daily sync (only runs that changed someone, or
  failed, are recorded). With no CRM chosen it links to the CRM card
  (`?open=crm`).

Integrations pages are Admin only, so the links show only for Admins;
others see who sets it up. Data: `GET /api/teams/auto-fill`
(`getTeamsAutoFillStatus()` in `server/services/team-crm-sync.ts`); UI:
`team-auto-fill-card.tsx`.

## Teams as recipients

A team or subteam can stand in for a list of people. Picking a subteam
also reaches the subteams nested under it. Targets are stored as ids and
resolved when they are used, so someone who joins a team later is
included without editing anything. Inactive teams and subteams reach
nobody, and only active internal users are ever reached. Shared code:
`resolveTeamTargets()` / `owningTeamLeadIds()` in `shared/teams.ts`,
`storage.resolveTeamRecipientIds()` on the server, and
`TeamTargetsPicker` (`client/src/components/teams/team-targets-picker.tsx`)
in the UI.

| Feature | How teams are used |
|---|---|
| [System Announcements](system-announcements.md) | **Target Teams** (`target_team_ids`, `target_subteam_ids`, migration 106). Narrows the role and user targets: the banner, bell and email reach only people on those teams. |
| [Workflow Automation](workflow-automation-system.md) | Send Email and Schedule Digest actions take **Teams** (`recipientTeamIds`, `recipientSubteamIds`) next to the people list. Everyone on them gets the email. A digest with teams but no people does not fall back to the user who triggered the rule. |
| [Outcome Intelligence](outcome-intelligence-system.md) | Escalation of an overdue outcome also tells the project's owning team manager and the leaders of its subteam, besides each engineer's manager. |

## Owning team on projects

Picked in the project form's Team section (`ProjectTeamFields.tsx`).
Server rules live in `server/lib/project-team-fields.ts`:

- A new project with no team picked gets the primary engineer's default
  team, else the creator's default team, else none. Picking **No team**
  keeps it empty.
- A newly picked team must exist and be active. A project already on a team
  that was later deactivated keeps it on save.
- The subteam must belong to the project's team. Changing the team clears a
  subteam from the old team; clearing the team clears the subteam.
- Deleting a team or subteam sets the project's team or subteam to empty
  (`ON DELETE SET NULL`).
- Archiving a project keeps its team; restoring it drops a team or subteam
  that no longer exists (or a subteam that moved to another team).
- Outside users never see a project's team: `teamId` and `subteamId` are
  stripped from project responses for Customer, Guest and Partner users.

## Permissions

| Action | Needs |
|---|---|
| Read teams (`GET /api/teams`) | Signed in, internal user |
| Create, edit, delete teams and subteams, set members | Edit on Teams (`config.teams`) |
| Set one person's teams (`PUT /api/user-teams/:userId`) | Edit on Teams or Edit on Users |

`config.teams` started with the same grants as Users (`config.user-management`).

## API

| Route | Body |
|---|---|
| `GET /api/teams` | Every team with its members and subteams |
| `POST /api/teams` | `{ name, description?, icon?, managerUserId?, crmDepartments? }` |
| `PATCH /api/teams/:id` | `{ name?, description?, icon?, managerUserId?, crmDepartments?, isActive? }` |
| `DELETE /api/teams/:id` | Removes its memberships and subteams |
| `PUT /api/teams/:id/members` | `{ userIds }` replaces the member list |
| `POST /api/teams/:id/subteams` | `{ name, kind?, parentSubteamId?, crmDepartments? }` |
| `PATCH /api/teams/:id/subteams/:subteamId` | `{ name?, kind?, parentSubteamId?, crmDepartments?, isActive? }` |
| `DELETE /api/teams/:id/subteams/:subteamId` | Child subteams move up a level |
| `PUT /api/teams/:id/subteams/:subteamId/members` | `{ members: [{ userId, role: "leader" \| "member" }] }` |
| `PUT /api/user-teams/:userId` | `{ teamIds, defaultTeamId }` |
| `GET /api/teams/crm-departments` | `{ provider, options: [{ value, label }], error? }` for the CRM departments picker |
| `POST /api/teams/crm-sync` | Runs the CRM sync now; `{ added, removed, reason }` |
| `GET /api/teams/auto-fill` | Setup card: `{ sso: [{ provider, enabled, mappings }], crm: { provider, lastRun }, canOpenIntegrations }` |

Errors are `{ code, message }`; the client translates `code` (`name_taken`,
`not_found`, `invalid`, `unknown_user`, `outside_user`, `not_team_member`,
`not_in_team`, `cycle`, `too_deep`). Project saves refuse a bad team with
`400 { errorCode: "invalid_team" | "invalid_subteam" }`.

## Notes

- Archiving a user removes their team and subteam memberships; restoring
  the user does not bring them back.
- Demo Mode shows only demo teams (`teams.is_demo`, migration 115) and the
  real install never shows them. The demo seed creates two teams with
  subteams staffed by Demo Staff and owning the demo projects; the wipe
  deletes them (subteams and memberships cascade). See
  [Demo Mode](../admin/demo-mode.md).
- Account Management's "Team Users" page was renamed **Account Users** at the
  same time, since it lists outside users per account, not teams. Its URL
  and permission key (`project.team-users`) are unchanged.
