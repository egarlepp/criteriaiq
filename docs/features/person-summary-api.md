# Person Summary API (v1)

A read-only, versioned endpoint VectorIQ uses for its readiness view: how
many validations a person has been on in CriteriaIQ, how many were won, and
how many success criteria were met. It is **counts only**. It carries no
project names, customer names, CRM ids or project ids, so a leaked key shows
how much someone has done, never for whom (Eric's call, 2026-10-26).

Code: `server/routes/api-v1-routes.ts` (route),
`server/storage/project-summary.ts` (`getPersonSummaryData`),
`server/lib/person-summary.ts` (counting rules),
`shared/person-summary.ts` (the `PersonSummaryV1` type).

## Endpoint

| Method and path | Returns |
|---|---|
| `GET /api/v1/people/summary?email=<address>` | `{ "data": PersonSummaryV1 }` |

One person per call. The email is required, trimmed and matched without
regard to case (people are matched across apps by email, see
[cross-app-identity.md](../architecture/cross-app-identity.md)). There is no
list form, so the endpoint can't export everyone.

Errors: `400` for a missing, repeated or malformed email, `401` without a
session or key, `403` for a caller who isn't allowed (below), and `404` for
an email that matches no one **or** matches a Customer, Guest or Partner.
Both get the same answer, so the endpoint can't be used to find out who has
an account.

## Who can call it

- **API keys with `people:read`.** Create one in Admin › Integrations › n8n
  › API keys with the **People summary only (VectorIQ)** access preset. That
  key can call this endpoint and nothing else: not the project summaries,
  not `/api/projects`, not `/api/users`. `people:read` is in no other preset,
  so a Read only or Read and write key can't call it either. Send
  `Authorization: Bearer <key>`.
- **Admins**, signed in, for anyone.
- **Anyone internal, signed in, for themselves** (their own email).
- Customer, Guest and Partner sessions get `403`.
- Demo projects are only counted in demo mode.

## Response

```json
{
  "data": {
    "version": 1,
    "email": "jane.doe@example.com",
    "validations": { "total": 12, "active": 3, "completed": 9, "won": 6, "lost": 2, "cancelled": 1 },
    "roles": {
      "primary_engineer": { "total": 8, "won": 5 },
      "supporting_engineer": { "total": 4, "won": 1 }
    },
    "criteria": { "total": 140, "met": 102, "failed": 9, "open": 21, "excluded": 8 },
    "firstStartAt": "2025-02-03T00:00:00.000Z",
    "lastCompletedAt": "2026-10-01T00:00:00.000Z"
  }
}
```

Responses are sent with `Cache-Control: private, no-store`.

## Counting rules

- **Validations** are the projects where the person holds any team slot:
  primary engineer, specialist engineer, supporting engineer, additional
  supporting team, account representative or opportunity engineer. Each
  project counts once in `validations`, however many slots the person holds.
- **completed**: the project has a completed date, or its status is
  `completed`, `complete` or `closed`. Everything else is **active**.
- **won / lost / cancelled** come from the outcome recorded in Outcome
  Intelligence. A project with no recorded outcome counts in none of the
  three, so `won + lost + cancelled` can be less than `completed`.
- **roles** has one entry per slot the person has held. A person in two
  slots on one project counts once in each, so the role totals can add up to
  more than `validations.total`. Slots never held are left out.
- **criteria** are the active success criteria across those projects, in
  the same buckets as the project summary: `met` = `complete`, `failed` =
  `fail`, `excluded` = `cancelled` or `deferred`, `open` = the rest.
- **firstStartAt** is the earliest start date and **lastCompletedAt** the
  latest completed date across those projects, or `null`.

## Versioning

Same rule as the project summary: v1 only ever gains fields. Nothing is
renamed, removed or given a new meaning. A breaking change ships as
`/api/v2` next to v1.
