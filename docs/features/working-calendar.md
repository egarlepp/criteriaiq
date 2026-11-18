# Working Calendar (MAP dates)

Mutual Action Plan dates count working days. Weekends and the holidays on a
person's holiday calendars ([`holiday-calendars.md`](holiday-calendars.md))
are days off, so a MAP never puts a start or due date on one.

Code: `shared/working-calendar.ts` (date maths, no database),
`server/storage/map.ts` (`createProjectMapFromTemplate`,
`getProjectScheduling`, `setProjectScheduleByTaskOwner`),
`server/storage/holiday-calendars.ts` (`getHolidayDatesForUsers`),
`server/services/map-scheduling.ts` (moving a task's dates to its new owner),
`server/routes/map-project-routes.ts` (task update and the setting route),
`client/src/components/map/MapSchedulingCard.tsx` (the switch, on the MAP
drawer's Timeline tab), `server/services/map-due-soon.ts` (the due-soon
reminder job). Column: `projects.schedule_by_task_owner` and
`archived_projects.schedule_by_task_owner` (migration 103).

## Whose calendar

A person's days off are:

- their holidays: their own holiday calendars when an admin has given them
  some, else their customer account's calendars (for customer, guest and
  partner users whose account has some), else the organization's default
  calendars;
- the days outside their **work week** (Monday to Friday unless they change
  it);
- their **time off**.

Each person sets their work week and time off on Profile Settings ›
Calendar, which also lists the holiday calendars that apply to them. People
who can edit users (User Management edit, or Admin) can change anyone's from
the **Work week and time off** section of the user dialog in Admin › User
Management; it saves on its own, apart from Update User. Time off changes
only dates planned or moved afterwards: dates already on a MAP stay put.

Code: `shared/work-schedule.ts`, `server/storage/work-schedule.ts`
(`getWorkingCalendarsForUsers`, which every MAP scheduling path reads),
`server/routes/work-schedule-routes.ts`,
`client/src/components/accounts/work-schedule-editor.tsx`. Tables
`user_work_schedules` and `user_time_off` (migration 107).

| Route | Who |
| --- | --- |
| `GET/PUT/DELETE /api/work-schedule/me` | anyone, for themselves (`PUT` body `{ "workDays": [1,2,3,4] }`, 0 = Sunday; `DELETE` = back to Monday to Friday) |
| `POST /api/work-schedule/me/time-off`, `DELETE …/time-off/:id` | anyone, for themselves (body `{ startDate, endDate, note? }`, at most a year per entry) |
| the same under `/api/users/:userId/work-schedule` | User Management view to read, edit to change |

Organization-wide counts that have no single person (end-date flags, the
Project Status Check alert, unassigned MAP items) keep the default calendar:
Monday to Friday and the default holidays.

## From Outlook

For everyone who linked Outlook on Profile Settings › Integrations
([`profile-integrations.md`](profile-integrations.md#outlook-calendar)), the
Scheduler job **Outlook calendar sync** (`outlook_schedule_sync`, 05:30
daily, Maintenance group, run time editable) and a one-off run right after
they link Outlook read their calendar from 7 days back to 180 days ahead:

- Each all-day event shown as **Out of office** (not cancelled) becomes time
  off, marked "From Outlook". Moving or deleting the event in Outlook moves or
  removes it on the next run; it can't be removed in CriteriaIQ. The event's
  subject is never stored.
- When the admin turned on **Read working days from Outlook** on the Outlook
  sign-in card, the person's Outlook working days (`MailboxSettings.Read`)
  become their work week, unless they or an admin set one by hand, which
  always wins. Someone who linked Outlook before the switch was turned on
  keeps Monday to Friday (or their own setting) until they reconnect.
  Turning the switch off drops work weeks that came from Outlook.
- Unlinking Outlook, or the admin removing the Outlook app, removes what came
  from Outlook. Customer, Guest and Partner users never link Outlook.
- A person whose link Microsoft refuses is counted as "need to reconnect" in
  the run's message and skipped; the others still sync.

Code: `server/outlook/calendar.ts` (Graph reads),
`server/services/outlook-schedule-sync.ts`.

The Scheduler job is **Outlook calendar sync** (it was "Outlook out-of-office
sync"); it also runs the write-back below.

## Outlook write-back

With **Add MAP due dates to Outlook** on (Admin › Integrations › Overview ›
Outlook sign-in, off by default, Eric's choice 2026-10-29), each internal
person who linked Outlook gets an event in their own Outlook for every open
MAP phase, step and task they own that is due from 30 days ago to a year
ahead (demo projects left out):

- All day on the due date, in the person's time zone, shown as **Free** so it
  never blocks meeting time, no reminder. Subject "Due: <item> (<project>)",
  with "Due" in the person's language; the body is a link to the project's
  MAP.
- A moved due date moves the event; finishing, cancelling or deferring the
  item, giving it to someone else, or deleting it removes the event. Changes
  made in the MAP drawer reach Outlook about 10 seconds later; anything else
  (a MAP made from a template, dates moved by scheduling) at the next daily
  run. If the person deletes the event in Outlook, the next change or run
  adds it back.
- CriteriaIQ remembers each event it made (`outlook_map_events`, migration
  111) and only ever changes or removes those.
- Sign-in asks for `Calendars.ReadWrite` while the switch is on. People who
  linked Outlook before must reconnect; until they do, the run's message
  counts them as "must reconnect to allow due dates".
- Turning the switch off removes the events from everyone's Outlook.
  Unlinking Outlook removes that person's. Removing the Outlook app leaves
  them (there's no token left to remove them with).

Code: `server/outlook/calendar-write.ts` (Graph writes),
`server/services/outlook-map-due-dates.ts`.

## Creating a MAP from a template

Template offsets (`defaultStartOffsetDays` / `defaultDueOffsetDays` on
phases, steps and tasks) are counted in working days:

- Phases count from the project start date, or today when the project starts
  in the past or has no start date.
- Steps count from their phase's start date; tasks from their step's start
  date.
- Days off come from the project owner (Primary Engineer), else the
  organization defaults, since nobody owns the tasks yet.
- A due date is never before its start date.

Admins and Engineers set the offsets in the MAP template editor (Library ›
Template Management › MAP Library): each phase, step and task has **Starts after**
and **Due after**, in working days, with a note saying what it counts from.
The header of each row shows its span as working days from the start of the
MAP (for example "WD 3–8"), adding up its parents' start offsets. The editor
won't save a due offset that is before the start offset. A 0 is kept as 0
(before, a due offset of 0 was saved as 7). Code:
`client/src/components/map/map-template-offset-fields.tsx`,
`PUT /api/map/templates/:id/content` (`templateOffset`).

Dates are stored at noon UTC, so the date reads the same in every time zone
from UTC−11 to UTC+11.

## Assigning a task

When a task gets a new owner (internal assignee, else customer assignee) and
the request doesn't set dates itself, any start or due date that falls on the
new owner's day off moves to their next working day. Dates on working days
stay where they are; nothing moves earlier.

## The project setting

**Use each task owner's holiday calendar** (MAP drawer › Timeline ›
Scheduling), on by default. Off: dates stay on the project owner's calendar
and assigning a task never moves them. Only Admins and the project's Primary
Engineer can change it (`PATCH /api/projects/:projectId/map-scheduling`, body
`{ "scheduleByTaskOwner": boolean }`); the general project update route
ignores the field. Each change is written to the project's activity log.

## Due-soon reminders

A daily Scheduler job, **MAP due-soon reminders** (`map_due_soon`, 07:00,
Notifications group, run time editable), looks at every open MAP phase, step
and task that has an owner and a due date (demo projects left out). From 2
working days before the due date on the owner's own calendar up to the due
date itself, the owner gets one bell notification ("is due Fri, Oct 30" or
"is due today"), which the daily digest email includes for people who turned
it on. The same run sends `map.phase.due_soon` / `map.step.due_soon` /
`map.task.due_soon` to subscribed webhooks, with `daysRemaining` in working
days.

- One reminder per owner, item and due date. Moving the due date reminds
  again; running the job twice in a day doesn't.
- The owner must still be active and able to open the project.
- Items marked complete, cancelled or deferred are skipped.
- A Workflow Automation rule on a due-soon trigger can also email (see MAP
  emails below).

## MAP emails

Workflow Automation rules run for the MAP events the app raises:
`map.phase|step|task.assigned`, `.completed`, `.status_changed` (MAP drawer
updates) and `.due_soon` (the job above). Nothing is emailed unless an admin
has a rule for the event (Eric's choice, 2026-10-29). Code:
`server/services/map-email-rules.ts` (runs the rules),
`server/email/map-email-preferences.ts` (who wants which email).

- **Recipient:** a Send Email or Schedule Digest action on a rule with a MAP
  trigger can pick **The item's assignee** (saved as `item_assignee`; the
  internal assignee, else the customer assignee, or the owner for due soon)
  as well as named people.
- **Each recipient's choices apply.** Profile › Notifications "Do Not Send"
  for phases, steps or tasks stops that kind. Otherwise the project's MAP ›
  Notifications tab decides which events they get; with nothing set there,
  phases and steps send **completed** and tasks send **assigned**. **Do Not
  Send Any Emails** stops every automated email except sign-in emails. (It
  used to read a column that doesn't exist and blocked rule emails for anyone
  who had saved their preferences.)
- **Duplicates:** a rule fires once per item and change within an hour, so
  two tasks assigned in the same project each get their email, but saving the
  same task twice doesn't send twice.

## Upcoming counts

"Upcoming" on the MAP progress analytics and on the drawer's Assignments tab
means due within 5 working days: on the task owner's calendar for the
analytics (the organization's defaults for unassigned tasks), and on each
person's own calendar for their workload row. Overdue is unchanged: past its
due date and not completed.

## End-date flags

A "days before" end-date flag (Admin › Field Settings › End Date Flags) can
**Count working days**: weekends and the organization's default holiday
calendars don't count, so a project due Monday is 1 working day away on
Friday. New flags count working days by default. The built-in flags moved
over with migration 106, keeping their meaning: **Due Soon** 5 calendar days
became 3 working days, **Due This Week** 7 calendar days became 5 working
days. A built-in flag an admin had already edited, and custom flags, keep
counting calendar days until someone ticks the box. "Days after" (overdue)
and "exact date" flags always count calendar days.

The rule lives in `shared/end-date-flags.ts`, used by the project badge
(`client/src/components/shared/end-date-badge.tsx`, which reads the default
holidays from `GET /api/holiday-calendars/default-dates`) and by the Kanban
border colour (`GET /api/projects/kanban`), so the two always agree.

## Deadline alerts

The Workflow Automation **Project Status Check** action's alert threshold
counts working days on the default calendar too (default 5). Schedules saved
before keep their number, now read as working days.

## Project duration

A project template (Library › Template Management) has **Working days**
next to Timeline: how long projects made from it run (1 to 260; empty means
14). On Create Project, picking a start date sets the end date that many
working days later, skipping weekends and the organization's default
holidays, and the end date hint suggests the same from today. The timeline
box counts **Total Working Days** from start to end, both included, on the
same calendar. Editing a project never moves its end date. Code:
`shared/project-duration.ts`, `client/src/components/project-form/`
(`project-form.tsx`, `utils.ts` `countWorkingDays`), column
`project_templates.duration_working_days` (migration 110).

Customer holidays: an admin can give a customer account its own holiday
calendars ([`holiday-calendars.md`](holiday-calendars.md#who-gets-which-calendar)),
which then count for that account's users.
