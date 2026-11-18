# CRM provider (one CRM per install)

CriteriaIQ talks to **one** CRM per install: Salesforce, HubSpot, or none.
HubSpot is an alternative to Salesforce, never an add-on. The rules come
from ImpactIQ, which learned them while adding HubSpot (its
`docs/crm-providers.md`); this page covers what CriteriaIQ has so far.
Phase 1 of the parity work adds the rest in order (provider interface,
Salesforce standing down, HubSpot connection, linking, link checks).

## The setting

- `system_settings` key `crm_provider`, value `{ "provider": "salesforce" | "hubspot" | "none" }`
  (`shared/crm-provider.ts`, read by `server/crm/provider-setting.ts`).
- **None is the default.** An install with no saved row, or a row that can't
  be parsed, reads as None: projects and accounts are created and changed in
  CriteriaIQ only, never in a CRM. An admin chooses Salesforce or HubSpot on
  Admin › Integrations › Overview › CRM. An install that was using Salesforce
  before the setting existed has to choose Salesforce there once, or its
  Salesforce features stay off. A brief settings read failure keeps the last
  known CRM rather than switching a working CRM off.
- The value is cached for 30 seconds per process. A write from this process
  updates the cache at once; another replica sees it within 30 seconds.
- `GET /api/crm/provider` (any signed-in user) returns `{ provider }` so
  screens can hide or rename CRM fields. It never returns the counts below.

## The lock

Record ids from one CRM mean nothing in another, so once projects or accounts
hold ids from one CRM, the install can only keep that CRM or choose **None**.
None never deletes an id, so switching back later restores every link.

Which CRM the data came from is read from the data itself
(`countCrmLinkedData()` in `server/storage/integrations.ts`), not stored
separately, so it can't drift:

| Counts as Salesforce data | Counts as HubSpot data |
| ------------------------- | ---------------------- |
| projects and archived projects with `crm_provider = 'salesforce'` | projects and archived projects with `crm_provider = 'hubspot'` |
| projects with no `crm_provider` but an evaluation link or a CRM record id (these predate the column) | |
| accounts and archived accounts with a Salesforce account URL | |
| any `salesforce_record_links` row | |

Demo rows (`is_demo = true`) never count: demo data is made up and removable.

The rule is `crmProviderChangeAllowed()`: with no linked data any CRM can be
chosen; with data from one CRM only that CRM or None; with data from both
(only possible through an import) only None and the current choice.

## Admin › Integrations › Overview › CRM

- `GET /api/admin/integrations/crm-provider` (Admin) returns the choice, the
  linked-data counts, the CRMs it may switch to (`allowed`) and whether each
  CRM's connection is saved (`configured`).
- `PUT /api/admin/integrations/crm-provider` (Admin) with `{ provider }`
  saves a change, or answers **409** `crm_provider_locked` with the current
  state when the lock refuses it.
- A CRM can be chosen **before** its connection is set up; the card shows an
  amber warning until it is. HubSpot reads as set up once a token is saved on
  its card (see "HubSpot connection" below).
- Every change asks for confirmation and writes a Login History row
  (`audit_logins.event_type = 'crm_provider_change'`, subject `from -> to`).
- The CRM card is collapsed like the other Overview cards (its pill names the
  current CRM) and heads a group: the Salesforce, HubSpot and Validation
  Record cards show right under it only while it is open (Configure). The CRM that isn't chosen (both, with
  None) is grayed out there with a **Not chosen** pill and can't be
  configured, and its own settings pages are hidden: the sidebar entry
  (`crm` on the link in `sidebar-nav-config.ts`, applied by
  `filterSidebarNav()`), so also the tab bar and Global Search. An old link to
  `subtab=salesforce` or `subtab=hubspot` opens the Overview instead.

## Setup wizard

Step 7 of the [first-run wizard](first-run-setup.md) asks for the CRM, with
Salesforce preselected. Like SMTP, the wizard runs before the full app, so
`POST /api/setup/crm-provider` stages the choice in `data/db-config.json` and
`hydrateDeferredCrmProvider()` saves it on the next boot. An install that
already has a saved CRM keeps it, and the lock still applies.

## Provider interface

Routes ask the active CRM for work instead of calling Salesforce code
directly (`server/crm/`, modeled on ImpactIQ's `services/crm/`):

- `server/crm/types.ts` defines `CrmProvider` (`id`, `isRecordId()`,
  `connectForUser()`) and `CrmUserSession`, one signed-in user's live access
  (`opportunitiesForAccount()`, `opportunitiesForAccountId()`,
  `validationRecordsForOpportunity()`, `searchAccounts()`, `readAccounts()`).
  Reads
  run on the user's own CRM connection. Record shapes use CriteriaIQ's
  kinds (Opportunity, Account, validation record); a provider translates its
  own objects at this boundary.
- `server/crm/salesforce-provider.ts` is a thin adapter over the existing
  Salesforce services. Its test pins the exact SOQL text, so Salesforce
  installs see no change.
- `server/crm/hubspot-provider.ts` reads Companies and their Deals through
  the portal token (see "HubSpot linking" below).
- `server/crm/index.ts` holds the registry. `getActiveCrmProvider()` returns
  null for None.
  `requireCrmProvider('salesforce')` answers 409 `crm_provider_mismatch`
  when the install uses another CRM (see below).
- CRM-neutral routes (`server/routes/crm-routes.ts`):
  - `GET /api/crm/status` → `{provider, connected}`, for any signed-in user;
    outside users (Customer, Guest, Partner) are never connected.
  - `GET /api/crm/opportunities/by-account?accountName=` or `?crmAccountId=`
    (a linked account's Opportunities by its CRM id; the id must be the
    active CRM's shape, else 400 `crm_invalid_record_id`)
  - `GET /api/crm/validation-records/by-opportunity?opportunityId=`
  - `GET /api/crm/accounts/search?q=` (2–100 characters)

  The last three are for internal users only (403 otherwise). They answer 409 `crm_not_active` with no CRM, 401 `crm_not_connected` when
  the user hasn't connected it, and the validation-record route 400
  `crm_invalid_record_id` for an id that isn't the active CRM's shape. The
  older `/api/salesforce/opportunities/by-account` and
  `/api/salesforce/evaluations/by-opportunity` routes now call the same
  Salesforce adapter and keep their responses.

## When Salesforce isn't the CRM

Choosing HubSpot or None switches Salesforce off everywhere, on the server
and not only on screen. Nothing is deleted; choosing Salesforce again turns
it all back on.

- **Routes.** `registerSalesforceRouteGuard()` (`server/crm/salesforce-route-guard.ts`)
  runs before every Salesforce route and answers 409 `crm_provider_mismatch`
  on `/api/admin/salesforce/*`, `/api/salesforce/*` and `/api/auth/salesforce/*`.
  One guard on the prefixes, so a Salesforce route added later is covered
  without anyone remembering to; a test fails if a route naming Salesforce
  sits outside them. Open whichever CRM is active:
  - the connection settings (`/api/admin/salesforce/credentials`, its `/test`,
    and `/mock-mode`), so an admin can set Salesforce up before switching;
  - `GET /api/auth/salesforce/status`, which answers `active: false`;
  - `POST /api/auth/salesforce/disconnect`, so a user can always remove their tokens.
  - on HubSpot (not None), the field sync routes the HubSpot screens share:
    mappings, value translations, metadata, policies, sync runs, history and
    issues (`isSharedSyncPath()`). Their data is stored per CRM, so on HubSpot
    they read and write HubSpot's rows (see "HubSpot sync" below).

  The OAuth callback is a browser redirect, so instead of a 409 it sends the
  user back to their profile with a message.
- **Jobs.** The sync queue, the nightly link check and each scheduled object
  sync are wrapped in `onlyWhenCrmActive('salesforce', ...)`: a tick returns
  `skipped`, which writes no run row and sends no error email (ImpactIQ's
  "stand down quietly"). The Workflow Automation `salesforce_sync` action
  returns a skipped result the same way, and saving a project or account no
  longer queues a Salesforce sync.
- **Health.** System Health's integration check reports `salesforce.active`
  and ignores Salesforce sync failures while it is off.
- **Screens.**
  - The sidebar's CRM icon and the Salesforce card in My Settings › Integrations are hidden.
  - Admin › Integrations › Salesforce keeps the Connection tab and shows a
    notice; Field Mappings, Sync Policies and Sync History are empty until
    Salesforce is chosen.
  - On the project form, the Opportunity and validation-record pickers fall
    back to plain inputs. With **None**, the CRM record id fields are hidden;
    the form still sends the stored ids back, so they are never cleared.
  - The validation record link (Evaluation / POC / POV ...) is required only
    while a CRM is in use. With **None** it is optional: no asterisk, it
    doesn't count toward the Essentials section, and a blank link is saved
    as empty (migration 091 made the column nullable). With a CRM, creating
    a project without one is refused (`validation_record_required`).
  - The project TAP drawer hides its Salesforce Data section.

## HubSpot connection

Admin › Integrations › Overview › **HubSpot** (Admin only). Ported from
ImpactIQ's model: one portal-wide **private app token**, no OAuth.

- **Storage.** The token lives in the single-row `hubspot_connection` table
  (migration 089), AES-256-GCM encrypted under `ENCRYPTION_KEY` and listed in
  `ENCRYPTED_COLUMN_MANIFEST`, so key rotation re-encrypts it. Only the last
  four characters are ever sent to the browser.
- **Saving checks first.** `PUT /api/admin/hubspot/key` asks HubSpot who the
  token belongs to before storing it; a token HubSpot rejects is never saved.
- **Portal lock.** Record ids are per portal. Once any project or account
  holds a HubSpot id, a token for a different portal (or one whose portal
  can't be named) is refused with `portal_locked`. A new portal's owner copy
  is cleared.
- **Access check.** `POST /api/admin/hubspot/check` probes each capability
  with one small request (reads fetch one record; writes PATCH record id 0,
  which HubSpot scope-checks before the lookup, so nothing changes). 403 is
  *missing*, anything else inconclusive is *unknown*. The card lists the
  private app scope for each so the HubSpot admin knows what to tick.
- **Owners.** `hubspot_owners` is a copy of the portal's owners, refreshed on
  save, from the card, and by the daily `hubspot_owner_sync` job (Scheduler,
  02:30, stands down unless HubSpot is the CRM). Internal users match an
  owner by email; the card lists who doesn't match. Each owner's HubSpot
  teams are kept too (`hubspot_owners.teams`), for linking CriteriaIQ teams
  to them ([Teams](teams.md#teams-from-the-crm)).
- **The token reads the whole portal**, so CriteriaIQ is the access gate:
  later PRs show each user only what their own project access allows.
- **Remove** is refused (`in_use`) while HubSpot is the CRM: choose None
  first. Removing keeps the ids already saved on projects and accounts.
- **Client.** All calls go through `server/hubspot/client.ts`: a fixed host
  (`api.hubapi.com`, paths only), in-process rate limiting that follows
  HubSpot's reported limits, retries on per-second 429s, and no redirects.
- Saving and removing the token write Login History rows
  (`hubspot_key_saved`, `hubspot_key_removed`).

## HubSpot linking

- **Who can query HubSpot.** The portal token reads everything, so only an
  active internal user matched to an active HubSpot owner gets a session.
  Everyone else sees the plain inputs, as with Salesforce when not connected.
- **Projects.** The Opportunity picker lists the Deals of the Companies whose
  name matches the account (newest first, stage labels from the deal
  pipelines, owner names from the owner sync). Picking a Deal saves
  `crmProvider = hubspot`, the Deal id and its Company id. The validation
  record list reads the HubSpot object type chosen under Validation Record
  (Admin › Integrations › Overview); with none chosen it is empty.
- **Accounts.** The account link (`customers.salesforce_account_url`) holds a
  Salesforce Account URL or a HubSpot Company URL, whichever the install
  uses. The account dialog labels it for the CRM, offers a search that fills
  it, and hides it with None (the link is then optional). The lock counts a
  `hubspot.com` link as HubSpot data and any other link as Salesforce data.
- **One CRM on save.** A project's new CRM link must be the active CRM's
  (`crmLinkRefusal`), and so must an account's new link
  (`accountLinkRefusal`); both answer 400 `crm_provider_mismatch`. A value
  already stored is kept, so a None install can still save older projects.

## HubSpot sync

Field sync on HubSpot reuses the Salesforce sync machinery: the same field
mappings, value translations, sync policies, queue, retries, runs, Sync
History and Sync Issues. Each of the `salesforce_field_mappings`,
`salesforce_record_links`, `salesforce_sync_policies` and
`salesforce_sync_runs` rows carries a `crm_provider` (migration 090,
existing rows are `salesforce`), and every read and write is scoped to
`syncCrm()` (`server/crm/sync-crm.ts`): the active CRM, or Salesforce while
the CRM is None. The lock keeps one install from ever holding links for two
CRMs at once.

- **What syncs.** Projects with HubSpot **Deals** and accounts with HubSpot
  **Companies** (`HUBSPOT_OBJECT_FOR_ENTITY`, `server/hubspot/records.ts`);
  users don't sync on HubSpot. A new mapping for any other pair is refused
  with 400 `hubspot_mapping_unsupported`. Accounts only ever read from the
  CRM (see "Account CRM link"), on either CRM.
- **Links.** There is no separate "link to HubSpot" step. A project links the
  Deal named on it (`crm_opportunity_id` with `crm_provider = 'hubspot'`), an
  account the Company in its HubSpot URL. `ensureHubspotLink()`
  (`server/hubspot/sync-links.ts`) runs on every save before the outbound
  sync is queued: it creates the link, moves it when the record changed, and
  archives it when the record no longer names one. A Deal or Company already
  linked to another record stays with that record.
- **Sync.** `syncRecord()` hands HubSpot links to `syncHubspotRecord()`: it
  reads only the mapped properties (`GET /crm/v3/objects/{deals|companies}/{id}`),
  builds the change set with `server/hubspot/sync-payload.ts` (HubSpot keeps
  every value as a string: `YYYY-MM-DD` dates, `true`/`false`, `a;b` for
  multiple checkboxes) and PATCHes only what differs. It runs on the
  install's private app token, so it needs no user's connection. A 404 marks
  the link broken; a 400 (rejected value) or 403 (missing scope) fails
  without retrying; anything else retries with the policy's backoff.
- **Job.** `hubspot_sync_queue` (Configuration › Scheduler, every minute)
  processes the queue while HubSpot is the CRM and has a token saved.
- **Screens.** Admin › Integrations › HubSpot has Field Mappings, Sync
  Policies and Sync History, the same screens as Salesforce without the
  Salesforce-only parts (OAuth credentials, mock mode, mapping validation,
  scheduled sync, the link check and the CRM id backfill). Fields come from
  `/crm/v3/properties/{object}` (`server/hubspot/metadata.ts`, cached ten
  minutes); read-only and calculated properties are marked not updateable.
- **Never deletes.** Deleting a project or account never deletes anything in
  HubSpot (Eric's call: create and update, never delete).

## Creating Deals in HubSpot

A project with no Deal shows **Create Deal in HubSpot** under its CRM record
ids. Creating is only ever that click, never a side effect of saving, so a
Deal that already exists in HubSpot but hasn't been picked yet is never
duplicated. The button appears only when HubSpot is the CRM and the user can
use it (an internal user matched to a HubSpot owner), and is disabled until
the project has been saved, because the server builds the Deal from the
saved project.

Accounts never create a Company: account fields flow only from the CRM into
CriteriaIQ (Eric, 2026-11-02), so an account links a Company that already
exists. The account dialog's **Create Company in HubSpot** button and
`POST /api/crm/customers/:id/create-record` were removed.

- **Route.** `POST /api/crm/projects/:id/create-record` (internal user with
  edit access to the project) answers 201 with
  `{ objectType, id, url, companyId }`, else an `errorCode`:
  `crm_not_active`, `crm_not_connected`, `portal_unknown` (run the access
  check first), `already_linked`, `in_progress`, `hubspot_forbidden` (the key
  lacks the write scope), `hubspot_rejected` (a mapped value HubSpot refused)
  or `hubspot_failed`. API keys can't call them.
- **What the Deal starts with** (`server/hubspot/create-records.ts`): every
  outbound field mapping that has a value, the project name when no mapping
  sets one, and the creating user as `hubspot_owner_id` when no
  mapping sets the owner. A Deal with no mapped stage opens in the default
  pipeline's first open stage, and is associated with the project's Company
  (its CRM account id, else its account's Company) as primary company.
- **Afterwards.** The new id is saved on the project (`crm_opportunity_id`,
  plus `crm_account_id` when it was empty), the sync link is created and
  marked synced, and the project gets a project audit entry. Later saves sync through the ordinary queue.
- **One at a time.** A record already being created on this server is
  refused with `in_progress`, so a double click can't make two Deals.

## HubSpot link check

Every night at 03:15 (Configuration › Scheduler, job `hubspot_link_check`,
standing down unless HubSpot is the CRM) and on **Check links now** in the
Sync Issues panel, `checkHubspotLinkHealth()` (`server/hubspot/link-health.ts`)
reads every active or broken HubSpot link with one batch read per 100 ids per
object.

- **Only a confirmed miss breaks a link.** A link is marked broken only when
  HubSpot answers `OBJECT_NOT_FOUND` for its id. A failed batch changes
  nothing, and a rejected key stops the run, so an outage never flags real
  links.
- **Self-healing.** A broken link whose record is found again goes back to
  active.
- **Merges.** When HubSpot answers a merged-away id with the surviving record
  (`hs_merged_object_ids`), the link, the project's `crm_opportunity_id` (with a
  project audit entry) or the account's CRM link URL and its projects'
  `crm_account_id` move to the survivor. If another record already syncs with
  the survivor, the link is marked broken instead.
- **Runs** are recorded in the sync history (entity `link`, mode `link_check`).
  The Salesforce link check now reads only Salesforce links, since a HubSpot id
  can look like a Salesforce one.

## Account CRM link

With a CRM chosen, every account is linked to one CRM account (Salesforce
Account or HubSpot Company). The link is still entered as a record URL in
`customers.salesforce_account_url`; on every save, storage parses the id out
of it into `customers.crm_provider` + `crm_account_id` (migration 121,
`withCrmColumns()` in `server/lib/account-crm-link.ts`). Accounts saved
before that column existed are filled at boot by
`backfillCustomerCrmAccountIds()`.

- **One CRM account, one CriteriaIQ account.** A unique index on
  `(crm_provider, crm_account_id)` refuses a second link. Create and edit
  answer **409** `crm_account_already_linked` with `existingAccount`
  (`{ id, accountName }`), and the dialog names that account. A 15-character
  Salesforce id matches its 18-character form. If the backfill finds two
  accounts on one CRM account, the first keeps the id and the others are
  logged and left without one. Restoring an archived account whose CRM
  account was linked elsewhere in the meantime restores it without the id.
- **Link required, Admin exception.** Without a link, `POST /api/customers`
  answers **403** `crm_link_required` for anyone but an Admin. An Admin must
  send `crmLinkExceptionReason` (at most 500 characters; **400**
  `crm_link_reason_required` without it). The account stores the reason, who
  approved it and when (`crm_link_exception_*`), and linking it later clears
  them. Removing a link from a linked account follows the same rule, so
  unlinking is Admin-only.
- **Accounts saved unlinked before this rule** stay editable without a link.
  An Admin can record an exception on one by giving a reason.
- **Asking for an exception.** In the account dialog, a non-Admin who can't
  find the account in the CRM clicks **Request an exception**.
  `POST /api/customers/crm-link-exception-requests` (`{ accountName, reason }`,
  internal users) sends every Admin an `account_link_exception_requested`
  bell notification, which is also in the daily digest. Nothing is queued:
  the Admin creates the account.
- Internal accounts never need a link, and with **None** none of this applies.
- The CRM columns and the exception are internal fields: outside users never
  see them (`INTERNAL_CUSTOMER_FIELDS`).

### CRM-owned fields on a linked account

A linked account takes five fields from its CRM account, one way, CRM →
CriteriaIQ (migration 122; `server/crm/account-fields.ts`,
`server/crm/account-refresh.ts`). CriteriaIQ never writes account fields to
the CRM.

| CRM value | CriteriaIQ field | Copied (and read-only) when |
|---|---|---|
| Name | Account name | always, once linked |
| Industry (HubSpot `industry`) | Industry | it matches an active industry's name, ignoring case, spaces, `_` and `&` |
| Billing country (HubSpot `country`) | Region | the country is in the country → region table |
| Website (HubSpot `website`, else `domain`) | `customers.website` | it is a web address |
| Owner email | Account Representative | it is an active internal CriteriaIQ user's email |

The fields the CRM filled are listed in `customers.crm_managed_fields`. A
field that doesn't map stays editable, so the CRM never leaves a required
field blank and locked. Everything else (abbreviation, logo, domains,
flags, engineer, contact users, solution interests, competitors,
infrastructure, Account Users) stays CriteriaIQ's.

- **Read-only, on the server too.** While the link stays the same, a save
  keeps the stored account name and every field in `crm_managed_fields`,
  whatever the form sent (`lockedAccountFields()`). The account dialog shows
  those fields disabled with a **Managed in Salesforce/HubSpot** badge.
- **Linking.** Picking a CRM account (or pasting its link) previews the
  change before saving: `POST /api/customers/crm-link-preview`
  (`{ url, customerId? }`, internal users) reads the record on the user's own
  connection and answers the values, the fields they lock, the changes
  (`{ field, from, to }`) and any other account already linked to it. The
  dialog fills the form from it. On save, the server pulls the CRM fields
  again on the saving user's connection and records them as
  `crm_linked_by`. A user who can't reach the CRM still saves the link; the
  next refresh fills the fields.
- **Unlinking** is Admin-only with a reason (the link rule above). The
  account keeps its last CRM values, and they become editable again
  (`crm_managed_fields`, `crm_linked_by`, `crm_synced_at` and
  `crm_record_missing_at` are cleared).
- **Refresh.** `POST /api/customers/:id/crm-refresh` (internal users) pulls
  the fields on the user's connection; the dialog's **Refresh** button calls
  it, and opening a linked account calls it with `ifOlderThanHours: 24`, so
  an account that synced in the last day isn't read again. Answers
  `{ status: refreshed | missing | fresh, customer }`, or 401
  `not_connected`, 409 `not_linked` / `crm_not_active`.
- **Nightly.** After the link checks, `hubspot_link_check` and the
  Salesforce link check job refresh every linked account
  (`refreshLinkedAccounts()`): HubSpot in batches on the portal token,
  Salesforce on the connection of the user who linked each account (there
  is no org-wide connection). Accounts whose linker can't connect are
  skipped until a connected user opens them. Renames reach the account's
  projects through `updateCustomer()` (migration 120).
- **CRM record gone.** Only an id the CRM answers "not found" for sets
  `crm_record_missing_at`; the account keeps its last values and the dialog
  says so. A failed read changes nothing. A HubSpot merge is followed by the
  link check, which moves the link to the surviving Company.
- **Account mappings are inbound only.** Migration 122 turns bidirectional
  account field mappings inbound and switches outbound-only ones off;
  creating or changing an account mapping to anything but inbound answers
  400 `account_mapping_inbound_only`, and `getMappingsForSync('customer',
  'outbound')` returns nothing.

### Suggested CRM matches and the Directory's CRM link column

An unlinked account's dialog lists up to three CRM accounts it may be
(`server/crm/account-matching.ts`, `server/crm/account-suggestions.ts`),
strongest first:

| Strength | When |
|---|---|
| Strong match | one of the account's approved email domains is the CRM account's website domain |
| Likely match | the names are equal once case, punctuation, accents and company suffixes (Inc, LLC, GmbH, S.A., …) are dropped |
| Possible match | the normalized names are at least 85% alike (Levenshtein ratio, `calculateSimilarity` in `server/salesforce/fuzzy-matcher.ts`) |

- **On demand, never stored.** `GET /api/customers/:id/crm-suggestions`
  (internal users) searches the CRM on the user's own connection for the
  account's name and its first word (when it has four letters or more), reads
  the candidates' websites, and ranks them. CRM accounts already linked to
  any account, ones the CRM says are gone, and dismissed ones are left out.
  With no CRM, no connection, a linked account or the internal account the
  answer is an empty list with a `status`.
- **Domain matches need a name hit first.** The CRM is searched by name, so
  a CRM account whose name shares nothing with the account's isn't found
  even when its domain matches. Searching by domain is a possible follow-up.
- **Link** fills the CRM link, which runs the before/after preview; the
  save links as usual. **Not this one**
  (`POST /api/customers/:id/crm-suggestions/dismiss { crmAccountId }`,
  Account Management edit) stores the pair in `account_crm_dismissals`
  (migration 123) so it isn't suggested again. Archiving the account drops
  its dismissals.
- **Account Directory.** With a CRM chosen, a sortable **CRM link** column
  and filter show each account's state from its own row, with no CRM call:
  Linked, Record missing, Unlinked (approved), Needs link, or Internal.
  Sorting puts the accounts that need someone first. Suggestions themselves
  appear only in the dialog, because computing them for every row would
  mean a CRM search per account.

### Picking the account from the CRM on Create Project

With a CRM chosen and the user connected to it, Create Project's
**Account Name** has a **CRM | CriteriaIQ** toggle. It opens on CRM; with
no CRM, or no connection, only the CriteriaIQ list shows, as before. Editing
a project never shows it.

- **CRM** searches the CRM (`GET /api/crm/accounts/search`). Each result says
  **In CriteriaIQ** when an account is already linked to it, or **New**.
- **The pick is resolved first.** `POST /api/crm/accounts/resolve { url }`
  (internal users, `server/crm/account-resolve.ts`) writes nothing:
  - an account already linked to that CRM account → the form selects it;
  - otherwise it reads the CRM account and returns its values plus up to
    three **look-alikes**: CriteriaIQ accounts that aren't linked to this
    CRM, aren't the internal account, haven't been dismissed against this
    CRM account, and match by the same rules as the suggestions above
    (same email domain, same name, close name).
- **Look-alikes come before a new account.** "Is this an account you
  already have?" lists them. An Account Management editor can **Link to
  Salesforce/HubSpot**, which opens that account's dialog with the CRM
  link filled: the preview shows what changes, and saving links it and
  takes the CRM's name. Without edit access the choice is **Use this
  account** as it is. **Create a new account** goes on.
- **A new account** opens Create Account with the CRM link filled, so its
  CRM-owned fields come from the CRM and are locked, as on any linked
  account. After saving, the form selects it under the CRM's name.
- **Opportunities by id.** A project whose account is linked lists the
  Opportunities (Deals) of that CRM account by id: `AccountId = …` in
  Salesforce, the Company's associated Deals in HubSpot. Unlinked accounts
  still match by name, as before.

### Account Users from CRM contacts

A linked account's dialog has a **Salesforce/HubSpot contacts** panel under
Account Access (`CrmContactsPanel.tsx`; `server/crm/account-contacts.ts`).
It lists the Contacts on the Account (HubSpot: the contacts associated with
the Company) on the user's own connection. Tick contacts to import them as
Account Users; every action applies at once, apart from the dialog's Save.

| A contact | In the panel |
|---|---|
| Already imported | **Imported**, ticked. Unticking stops the sync; the user stays, as added in CriteriaIQ, with their access |
| Email belongs to an outside user of this account | **Links to existing user**: importing ties that user to the contact, never a second user |
| Email on one of the account's approved domains | **Can import** |
| Email on another domain | **Admin only** |
| No email, a personal domain, a user of another account or staff, a user tied to another contact | **Can't import**, with the reason |
| Email on the internal account's domain | Not listed: staff aren't Account Users |

The rules live in `server/crm/contact-eligibility.ts`. The import reads the
contacts from the CRM again rather than trusting the request, and applies
the same rules.

**Security rules (confirmed by Eric, 2026-11-02):**
- **Importing makes a profile, not a login.** Imported users are role
  Customer, inactive and not approved. **Invite** (User Management edit)
  activates and approves them and sends the welcome email, so a CRM edit
  never grants anyone access.
- **The email is the login.** A different email in the CRM is stored in
  `users.crm_email` and shown as "Email differs in Salesforce/HubSpot". An
  Admin can **Use as login email**, which is refused if another user has it.
- **A contact gone from the CRM account is flagged, not deactivated.**
  `users.crm_contact_missing_at` is set and the panel lists the user under
  "No longer on this CRM account". The account's editors decide; **Keep as
  added in CriteriaIQ** clears the link.

**What syncs.** First name, last name and title follow the contact: they are
read-only in the user dialog, and `PUT /api/users/:id` keeps the stored
values (`shared/crm-contact-fields.ts`). Role, access, projects, MFA and
notifications stay CriteriaIQ's. The sync runs when the panel opens and
nightly after the link checks: HubSpot uses the portal token, Salesforce the
connection of the user who linked the account. A phone number isn't
copied, because users have no phone field.

**Designation.** Account Users shows **From Salesforce/HubSpot** or **Added
in CriteriaIQ** under each name, plus the two flags (`UserSourceBadge.tsx`).

**Columns and routes.**
- Migration 124 adds `users.crm_provider`, `crm_contact_id`, `crm_synced_at`,
  `crm_email` and `crm_contact_missing_at`, unique on provider + contact id.
- Archiving a user drops the link, so a restored user comes back as added in
  CriteriaIQ.
- Routes (`server/routes/account-contacts-routes.ts`, internal users only):

  | Route | Who may call it |
  |---|---|
  | `GET /api/customers/:id/crm-contacts` | Account Users or Account Directory view |
  | `POST …/crm-contacts/import { contactIds }` | Account Users edit; up to 100 per call |
  | `POST …/crm-contacts/:userId/stop-sync` | Account Users edit |
  | `POST …/crm-contacts/:userId/invite` | User Management edit |
  | `POST …/crm-contacts/:userId/accept-email` | Admin only |

- **HubSpot needs the contacts read scope** (`crm.objects.contacts.read`)
  on the private app. Without it the panel says so (403 `scope_missing`).
  The HubSpot card already lists the scope as optional.

## The CRM's name in wording

Text that names the CRM writes `{{crm}}` (or `{{crmShort}}` where English
says "SF") in every locale instead of "Salesforce". i18next fills both with
no `t()` argument: `applyCrmWording()` (`client/src/i18n/index.ts`) sets them
from the install's CRM whenever `useCrmProvider()` loads it (every page does,
through `PageLayout`), and re-renders translated text. With no CRM chosen
they read "CRM". Names come from `CRM_DISPLAY_NAMES` in
`shared/crm-provider.ts`, so adding a CRM means adding it there, not editing
translations. An explicit `t(key, { crm })` still wins.

A screen that configures one CRM whichever CRM is active (Admin ›
Integrations › Salesforce or › HubSpot, and its value translations dialog)
uses `useCrmViewTranslation(crm)`, whose `{{crm}}` names that screen's CRM.
Their CRM-naming strings live under `crmSync.*`. Screens that only ever talk
to Salesforce (OAuth credentials, mock mode, scheduled sync) keep the name
Salesforce.

## Not yet

Scheduled object syncs on HubSpot arrive in a later Phase 1 PR.
