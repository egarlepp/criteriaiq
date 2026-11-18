# Infrastructure Discovery

Each account keeps one or more **Infrastructure Discovery profiles**: a
named snapshot of the customer's environment (identity, endpoints, network,
storage, applications, security, operations, cloud). One profile per
account is the **default**. A project can have one of its account's
profiles **attached**.

Code: `client/src/components/accounts/InfrastructureDiscoveryDrawer.tsx`
(the drawer: list, create, rename, default, delete, edit, attach),
`InfrastructureDiscoveryButton.tsx` (the icon button and its hover text),
`infrastructure-profile-summary.ts` (summary query and cache keys);
`server/routes/products-criteria-routes.ts` (profile routes),
`server/storage/infrastructure-profiles.ts` (summary and lookup),
`server/lib/project-infrastructure-profile.ts` (attach rules). Tables:
`infrastructure_profiles`, `projects.infrastructure_profile_id` and its
`archived_projects` mirror (migration 125).

## Where it shows

| Place | What the user sees |
| --- | --- |
| Account Directory, Actions column | The Infrastructure Discovery icon opens the drawer. When the account has at least one profile the icon is **bold and blue**, and its hover text adds "Default profile: *name*". Its hover text shows after 300 ms (`tooltipDelay`), not the table's usual 2 s. Internal accounts have no icon. |
| Create / Edit Project, Account Name | Same icon beside the account picker, same bold state and hover text, for the chosen account. |
| Project Overview card | An **Infrastructure Profile** fact (no separate icon next to Account) shows the attached profile's name as a link that opens the drawer on that profile, or "None attached" with a **Choose** link. |

## Attaching a profile to a project

Open the drawer from the Account Name icon or from the overview card, pick a
profile and press **Attach to project**. The attached profile carries an
"Attached" badge in the drawer's table; **Detach** removes it.

- **Create Project:** the choice is a form value, saved with the project.
- **Edit Project:** attaching or detaching saves at once
  (`PATCH /api/projects/:id` with `infrastructureProfileId`), like the
  overview card's status selects.
- Choosing a different account in Create Project clears the attachment.
- Deleting the attached profile in the drawer detaches it. A profile
  deleted elsewhere leaves the id in place; the card then reads "Profile no
  longer exists" and **Choose** picks another.

Nothing is attached automatically, not even the default profile.

## Server rules

`resolveProjectInfrastructureProfile` runs on `POST /api/projects`,
`PUT /api/projects/:id` and `PATCH /api/projects/:id`:

- `infrastructureProfileId` accepts a positive integer (or numeric string),
  or `null` / `""` to detach. Anything else is a 400
  (`invalid_infrastructure_profile`).
- A newly attached profile must exist (`infrastructure_profile_not_found`)
  and belong to the project's account (`infrastructure_profile_wrong_account`).
  The account is the project's `customer_id`, else the one account whose
  name matches `customer_name`.
- An unchanged id is kept without a lookup, so a deleted profile never
  blocks saving the project.
- Moving a project to another account without resending the field detaches
  the profile.
- Outside users (Customer, Guest, Partner) cannot change it: the PATCH
  allowlist for them does not include the field.

`GET /api/infrastructure-profiles/summary` returns one row per account with
profiles: `customerId`, `profileCount`, `defaultProfileId`,
`defaultProfileName` (the default profile, else the first by name). Outside
users only get the accounts they belong to. The drawer refreshes it after
every create, rename, default change and delete.

## Who can use profiles

Every profile route (`/api/customers/:customerId/infrastructure-profiles`,
`/api/infrastructure-profiles/:id`, its `/default`, and the summary) goes
through `server/lib/infrastructure-profile-access.ts`: internal roles may
use every account's profiles; Customer, Guest and Partner users only those
of accounts they belong to (`getExternalUserAccountIds`, the same rule as
`GET /api/customers`). Anything else answers 404, so ids cannot be probed.

## Known gaps

- Archiving an account deletes its profiles (`ON DELETE CASCADE`); restoring
  the account does not bring them back.
