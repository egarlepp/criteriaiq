# Personal Notifications and Daily Digest

Every signed-in person, outside users included, gets a personal list of
things that happened to them under the header bell ("For you"), and can
choose to get the unread ones by email once a day.

Code: `server/services/notifications.ts` (who is told what),
`server/storage/notifications.ts` (queries),
`server/routes/notifications-routes.ts` (routes),
`server/email/notification-digest.ts` (digest job),
`client/src/hooks/useNotifications.ts` and
`client/src/components/notifications/NotificationBell.tsx` (the bell).

## What creates a notification

`server/services/notifications.ts` listens to the app's automation events
(`onAutomationEvent`) and writes one `user_notifications` row per recipient.

| Kind | Who is told |
|---|---|
| `project_assigned` | The new primary engineer |
| `map_item_assigned` | The new assignee of a MAP phase, step or task (internal or customer) |
| `map_item_due_soon` | The owner of a MAP item due within 2 working days (`map-due-soon.ts` job) |
| `project_status_changed` | The project's internal team (status is internal) |
| `criterion_completed` | The internal team and the project's customer users |
| `support_request_status_changed` / `support_request_assigned` | The submitter / the new assignee |
| `evaluation_request_submitted` | The account's representative and engineer |
| `evaluation_request_status_changed` | The person who asked for it (closed or reopened) |
| `outcome_requested` / `outcome_reminder` / `outcome_overdue` | See [Outcome Intelligence](outcome-intelligence-system.md) |

The person who made the change is never told about it. Every recipient must
still be active and pass `hasProjectAccess` (projects) or `hasCustomerAccess`
(requests), so an outside user only hears about records they can open.

Rows store a `kind` and plain `params`, never rendered text, so the bell
translates them into the viewer's language.

## Data

`user_notifications` (`shared/schema/email.ts`, migration
`092_user_notifications.sql`): `user_id`, `kind`, `project_id`, `params`
(jsonb), `link_path`, `actor_user_id`, `read_at`, `emailed_at`, `created_at`.
The digest choice is `users.notification_digest` (`off` or `daily`, default
`off`).

## Routes

All need a signed-in session and act only on the caller's own rows.

| Route | Purpose |
|---|---|
| `GET /api/notifications` | Latest notifications and the unread count |
| `POST /api/notifications/:id/read` | Mark one read |
| `POST /api/notifications/read-all` | Mark all read |
| `GET` / `PUT /api/users/me/notification-preferences` | Read or set the digest choice |

## Daily digest

Each person picks **In-app only** or **Daily email** in their profile
(Notifications). The `notification_digest` job on the
[Scheduler](scheduler.md) sends one email per person listing unread
notifications the digest hasn't sent yet; nothing unread means no email. It
follows the Send Email Window (quiet hours and the hourly limit) and
Workflow Automation test mode. The email is English only, like every other
system email. The same job prunes read or emailed rows older than 90 days.
