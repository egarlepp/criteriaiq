# Project Summary API (v1)

A versioned, read-only API that other apps (ImpactIQ, VectorIQ, n8n) use
to show a CriteriaIQ project's state next to their own data: status,
dates, success criteria met against total, MAP progress and the project
team. It is the stable contract for those integrations. The rest of
`/api/*` is the app's own internal API and can change between releases.

Code: `server/routes/api-v1-routes.ts` (routes),
`server/storage/project-summary.ts` (queries),
`server/lib/project-summary.ts` (counting rules),
`shared/project-summary.ts` (the `ProjectSummaryV1` type).

Per-person counts for VectorIQ live next to it, under their own key scope:
[person-summary-api.md](person-summary-api.md).

## Endpoints

| Method and path | Returns |
|---|---|
| `GET /api/v1/projects/:id/summary` | `{ "data": ProjectSummaryV1 }` |
| `GET /api/v1/projects/summary?crmOpportunityId=…` | `{ "data": ProjectSummaryV1[] }` |

The lookup takes `crmOpportunityId`, `crmAccountId` and `evaluationId`,
alone or together (they are AND-combined). At least one is required, so
the lookup can't be used to export every project. Salesforce ids are
accepted in 15- or 18-character form; `evaluationId` is matched against
the id inside the project's validation record link. A lookup returns at
most 25 projects, most recently updated first.

Errors: `400` for a malformed id or a lookup with no filter, `401` without
a session or key, `403` for an outside user or a key without the scope,
and `404` for a project that doesn't exist **or** that the caller can't
open (the same answer, so ids can't be probed).

## Who can call it

- **API keys** with `projects:read` (the Read only and Read and write
  presets both include it). Send `Authorization: Bearer <key>`. Writes to
  `/api/v1/*` are refused for every key.
- **Signed-in internal users.** Customer, Guest and Partner sessions get
  `403`.
- Every project goes through the same project access check as the app
  (`hasProjectAccess`), so a restricted internal role (Sales, CX, Product)
  only sees projects it was given.
- Demo projects are only returned in demo mode.

## Response

```json
{
  "data": {
    "version": 1,
    "id": 42,
    "name": "Acme DLP",
    "customerName": "Acme",
    "solutionName": "Data Security",
    "opportunityName": "Acme FY27 Expansion",
    "type": "POC",
    "status": "active",
    "customerStatus": "On Time",
    "startDate": "2026-09-01T00:00:00.000Z",
    "endDate": "2026-11-15T00:00:00.000Z",
    "completedDate": null,
    "updatedAt": "2026-10-20T12:00:00.000Z",
    "crm": {
      "provider": "salesforce",
      "opportunityId": "006A0000004kzLqIAI",
      "accountId": "001A0000006Vm9rIAC",
      "evaluationLink": "https://acme.lightning.force.com/lightning/r/Evaluation__c/a0X5e00000AbCdEEAV/view"
    },
    "criteria": { "total": 12, "met": 7, "failed": 1, "open": 3, "excluded": 1 },
    "map": {
      "phases": { "total": 4, "completed": 2 },
      "tasks": { "total": 30, "completed": 18 }
    },
    "team": [
      { "role": "primary_engineer", "userId": "u_123", "name": "Dana Lee", "email": "dana.lee@example.com" }
    ],
    "owningTeam": {
      "id": 3,
      "name": "EMEA Sales Engineering",
      "slug": "emea-sales-engineering",
      "subteam": { "id": 11, "name": "DACH" }
    },
    "url": "https://criteriaiq.example.com/project/42"
  }
}
```

### Counting rules

- **Criteria** count active success criteria only. `met` is status
  `complete`, `failed` is `fail`, `excluded` is `cancelled` or `deferred`,
  and `open` is everything else (`pending`, `in_progress`, `blocked`,
  `stalled`, `at_risk`, …). `total = met + failed + open + excluded`.
  Callers should read `met` rather than counting statuses themselves;
  status words differ between apps (ImpactIQ's "pass/passed/met" never
  occur in CriteriaIQ).
- **MAP** counts every phase and task on the project. Both `complete` and
  `completed` count as done.
- **Dates** are ISO 8601 strings or `null`.

- **Owning team** (`owningTeam`, added 2026-10) is the project's
  [team](teams.md) and optional subteam, or `null`. Match teams across apps
  by `slug`: it is set when the team is created and kept on rename.
  `subteam` is `null` when the project has a team but no subteam. Not to
  be confused with `team`, the list of people on the project.

### Matching people

Other apps match CriteriaIQ users by **email**. `team[].email` is
lower-cased; compare it lower-cased on your side too. A team slot whose
user was archived is left out rather than shown with a placeholder.
`role` is one of `primary_engineer`, `specialist_engineer`,
`supporting_engineer`, `additional_supporting`, `account_representative`,
`opportunity_engineer`. A person can appear more than once with different
roles.

## Versioning

- `v1` only gains fields. A field is never renamed, removed or given a new
  meaning, and new enum values (e.g. a new team role) may appear, so
  ignore values you don't know.
- A breaking change ships as `/api/v2/...` next to v1, and v1 keeps
  working until every known caller has moved.
- Every object carries `"version": 1`.

## Caching and refresh

Responses are `Cache-Control: private, no-store`. A caller that keeps a
copy should refresh it when a project webhook arrives
(`project.updated`, `project.status_changed`, `criteria.updated`,
`criteria.completed`, `map.task.completed`, …; the full list is
`EMITTED_EVENT_GROUPS` in `shared/automation-events.ts`) and otherwise at
most every few minutes.

### Live refresh in ImpactIQ

ImpactIQ (v1.450+) takes a signed webhook so its CriteriaIQ panels and
dashboard snapshots update within seconds of a change instead of on its
five-minute cache and nightly job. To set it up:

1. In ImpactIQ, open Admin → Integrations → Projects (POC|POV). The
   **Live refresh** section appears under the CriteriaIQ connection once that
   connection is saved (a Read only key from Admin › Integrations › n8n ›
   API Keys here). Turn it on and copy the endpoint URL and the signing
   secret it shows.
2. In CriteriaIQ, open Admin › Integrations › Webhooks › New Webhook, pick
   Generic HTTP (n8n also works), paste that URL, and paste the secret into
   Signing Secret under Advanced Settings. Subscribe it to `project.created`,
   `project.updated`, `project.status_changed`, `criteria.updated`,
   `criteria.completed` and the `map.*.status_changed` events. The wizard's
   test delivery is accepted, so ImpactIQ's card shows its time as a check. Any built-in template works: ImpactIQ reads only the event name
   and the project id from the body, then fetches the project from this API.

ImpactIQ checks `X-CriteriaIQ-Signature-V2` (below) and refuses a delivery
older than five minutes or one it has already accepted.

## Webhook signatures

Every webhook delivery with a signing secret carries two signatures:

```
X-CriteriaIQ-Signature: sha256=<hex HMAC-SHA256(secret, body)>
X-CriteriaIQ-Signature-V2: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>
```

`body` is the raw request body exactly as sent. The first header is the
original one, kept so existing n8n checks keep working; it doesn't cover
the time, so a captured delivery can be sent again. V2 signs the time with
the body: a receiver should recompute it over the raw body, compare in
constant time, and refuse a `t` more than a few minutes from its own clock.
Code: `buildSignatureHeaders` in `server/webhooks/webhook-service.ts`.
