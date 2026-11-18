# Cross-app identity: matching people across CriteriaIQ, ImpactIQ and VectorIQ

CriteriaIQ, ImpactIQ and VectorIQ each keep their own `users` table. Nothing
is shared between their databases, so when one app shows another app's data
about a person (ImpactIQ's SE hours on a CriteriaIQ project, CriteriaIQ's
project team inside ImpactIQ), the two sides have to agree on who that person
is. This page is the rule.

## The join key today: lower-cased email

A person is the same person in two apps when their email addresses match
after trimming spaces and lower-casing. Nothing else is compared: not names,
not user ids (every app makes its own), not roles.

Each app normalizes before it sends, so a receiver can compare strings
directly:

| Where | What is sent |
|---|---|
| CriteriaIQ `GET /api/v1/projects/.../summary` | `team[].email`, trimmed and lower-cased (`server/lib/project-summary.ts`), or `null` when the user has none |
| ImpactIQ `GET /api/v1/effort` | `byPerson[].email`, trimmed and lower-cased (`opportunityEffort.ts` in ImpactIQ) |

Rules for any new cross-app field that names a person:

- Send the email trimmed and lower-cased, and the display name next to it. The
  name is for display only; never match on it.
- A person with no email can't be matched. Show the name and leave them
  unlinked rather than guessing.
- Never send another app's user id as if it meant something here, and never
  store one as a foreign key.
- Treat an email that matches no local user as an unknown person, not an
  error. People leave, and apps are set up at different times.

Email works because all three apps sign people in with the same company
identity provider (Okta or Entra ID), and that provider's email is what each
app stores. Its weak spots: someone whose address changes (a name change or a
domain move) splits into two people until every app has the new address, and
an app that lets an admin type an address by hand can drift from the IdP.

## Outside users stay in CriteriaIQ

Customers, Partners and Guests exist only in CriteriaIQ. They are never sent
to, or matched in, ImpactIQ or VectorIQ:

- `/api/v1/*` refuses outside-user sessions (`403`), and the summary's `team`
  lists only the internal project team slots (primary, specialist,
  supporting, additional supporting, account representative, opportunity
  engineer). Customer contacts aren't included.
- The SE Effort card that shows ImpactIQ data is drawn for internal users only
  (`GET /api/projects/:id/impactiq-effort` returns `403` to an outside user).
- The VectorIQ feed (`GET /api/v1/people/summary?email=`, see
  [person-summary-api.md](../features/person-summary-api.md)) sends
  per-person counts for internal users only, with no customer names (Eric's
  call, 2026-10-26). An outside user's email gets the same `404` as an
  unknown one.

If a feature ever seems to need an outside user in another app, it needs a
product decision first. Don't ship it as a side effect of a sync.

## Later: the identity provider's own id

Each app already stores the IdP's own id for people who signed in with SSO.
That id is a better key than email, because it doesn't change when someone's
address does:

| App | Column | Okta | Entra ID (Azure) |
|---|---|---|---|
| CriteriaIQ | `users.sso_provider` + `users.sso_external_id` | `sub` | `oid` (falls back to `sub`) |
| ImpactIQ | `users.okta_id`, `users.azure_id` | `sub` | `oid` |
| VectorIQ | `users.okta_id`, `users.azure_id` | `sub` | `sub` |

The catch is Entra ID. Its `sub` is different for every app registration that
asks, so the same person gets three different `sub` values in three apps. Its
`oid` is the same everywhere in the tenant. CriteriaIQ and ImpactIQ store the
`oid`; **VectorIQ stores the `sub`**, so its Azure ids can't be compared with
the other two. Okta's `sub` is the user's id in the org and matches across
apps, provided all three apps use the same Okta org.

To move off email:

1. VectorIQ stores the Entra `oid` (a migration plus a backfill on each
   person's next Azure sign-in).
2. Every cross-app payload that names a person also sends
   `{ idp: "okta" | "azure", idpUserId }` alongside the email.
3. Receivers match on the IdP id first, then fall back to email for people
   who have never signed in with SSO.

Nothing needs this yet: email matching is fine while all three apps use one
IdP. Do it when a second IdP tenant, or address changes, start causing
mismatches.
