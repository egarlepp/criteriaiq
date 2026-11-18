# Evaluation Requests

An evaluation request asks the team to start a validation (Evaluation, POC,
POV — the name comes from Admin › System Settings › Terminology) for an
account. It records the solutions wanted, the requested start and end dates,
the top reasons and the compelling event. A request is `open` or `closed`.

Code: `server/routes/evaluation-requests-routes.ts` (routes),
`server/storage/requests.ts` (queries), `shared/schema/projects.ts`
(`evaluation_requests`, `evaluation_request_products`, and the
`createEvaluationRequestSchema` / `updateEvaluationRequestSchema` request
bodies), `client/src/components/requests/` (UI).

## Where users see them

- **Account Directory** and **Account Users**: the cube icon in a row's actions
  opens the Requests drawer for that account or user.
- **Account Portal**: the icon in the account header opens the same drawer.
- **Header**: "Request a new …" opens the submit dialog.
- **Work › Projects Workspace › {{record}} Requests**
  (`/project?tab=validation&subtab=evaluation-requests`): every request the
  viewer can see, across accounts (`EvaluationRequestsSection`). Search,
  Status and Account filters sit in Search & Filters with a New Request
  button; Total / Open / Closed cards; a sortable, paged table whose row
  actions are View, Edit and Delete (Delete for the requester or an Admin,
  behind a confirmation). Same visibility as the API (see Who sees
  what below).

The menu and tab label read `{{record}}` from i18next's default variables:
`useValidationRecordLabel()` calls `applyRecordWording()` (in
`client/src/i18n/index.ts`), and the sidebar calls the hook so every page
has it. Strings that pass `record` explicitly are unaffected.

## Who sees what

Requests come from the account's customers, not from staff, so every
internal role (Admin, SE, Sales, CX, Product, ... — anything but Customer,
Guest and Partner) sees every request on every account, and may filter by
`customerId` / `userId`. Outside users see only the requests they submitted,
on accounts that list them as a contact; their `userId` filter is ignored.
The list and the count share this rule (`evaluationRequestScope` in the
routes file). Opening, editing and status changes use `hasCustomerAccess`
(internal roles pass; outside users must be a contact on the account);
delete is the requester or an Admin.

## Drawer and dialog

`RequestsDrawer` lists requests with search (account, requester, solutions,
reasons, compelling event) and an Open / Closed filter. Each card's **View**
and **Edit** open `EvaluationRequestDialog` for that request; closing the
dialog returns to the drawer.

`EvaluationRequestDialog` has three modes:

- **create** (default): submit a new request.
- **view**: read-only details (`EvaluationRequestDetails`) with Close Request /
  Reopen Request and Edit.
- **edit**: the same form as create, prefilled; the account is locked and a
  Status field is shown. Cancel goes back to view when the dialog opened in
  view.

Start and end dates are stored as midnight UTC; the client reads the
`yyyy-MM-dd` part of the string so the picked day shows in every time zone
(`evaluation-request-utils.ts`).

## API

| Method | Endpoint | Notes |
|--------|----------|-------|
| POST | `/api/evaluation-requests` | Body: `customerId`, `solutionIds`, `startDate`, `endDate`, `topReasons`, `compellingEvent`. Unknown fields (including `userId`) are rejected; the requester is the session user. |
| GET | `/api/evaluation-requests` | Filters `customerId`, `userId`, `status`. Each row adds `customerName`, `requesterName`, `solutionIds`, `requestedSolutions`. See Who sees what. |
| GET | `/api/evaluation-requests/count` | Open requests by default. |
| GET | `/api/evaluation-requests/:id` | Same shape as a list row. |
| PATCH | `/api/evaluation-requests/:id` | Any of `startDate`, `endDate`, `topReasons`, `compellingEvent`, `solutionIds` (replaces the list), `status`. Other fields are rejected. A status change notifies the requester. |
| DELETE | `/api/evaluation-requests/:id` | Requester or Admin. |
