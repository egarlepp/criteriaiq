# Holiday Calendars

Admin › Configuration › System Settings › Calendar, below Calendar
Configurations. Ported from ImpactIQ's Admin › Calendars. Admins download a
country's public holidays, keep their own lists of company closures, choose
the organization's default calendars, and give people in other countries
their own. MAP dates skip these days off
(see [`working-calendar.md`](working-calendar.md)).

Code: `client/src/components/configuration/HolidayCalendarsSection.tsx` (the
page, with `holiday-calendar-dates.tsx`, `holiday-calendar-add-dialog.tsx`
and `holiday-calendar-assignments.tsx`),
`server/routes/holiday-calendar-routes.ts` (routes),
`server/services/holiday-calendars.ts` (download and the monthly job),
`server/storage/holiday-calendars.ts` (queries),
`shared/holiday-calendars.ts` (limits, request schemas, response types).
Tables: `holiday_calendars`, `holiday_dates`, `user_holiday_calendars`
(migration 101), `account_holiday_calendars` (migration 109).

## Calendars

| Kind | Code | Dates come from |
|---|---|---|
| Country | ISO country code (`US`, `DE`) | Downloaded from [date.nager.at](https://date.nager.at): this year and next, refreshed monthly |
| Custom | 3 to 40 letters, numbers, `-` or `_` (`company-closures`) | Added by hand |

- **Download holidays** picks a country (names shown in the viewer's
  language) and downloads its holidays straight away. If the feed is down,
  the calendar is still created and the admin can press Refresh later.
- Only **nationwide** holidays are kept. Nager marks regional ones
  (`global: false`, such as a single US state's day) and they are left out:
  a day only part of a country takes off isn't a day off for everyone there.
  Two holidays on one date are stored as one, with both names.
- A refresh replaces each downloaded year in one transaction, so a holiday
  that moved doesn't show twice. A year the feed has nothing for is left as
  it is. Days added by hand to a country calendar are replaced on the next
  refresh of that year; put company closures in a custom calendar instead.
- Each row shows the number of days, the next holiday, and when it was last
  downloaded. Expanding a row lists the days by year, with add and remove.

## Who gets which calendar

- **Default** (star): up to 3 calendars apply to everyone who has no
  calendars of their own.
- **People's calendars**, **People** view: up to 3 per person, for anyone
  who works to other holidays. Customers, guests and partners aren't listed.
- **Accounts** view: up to 3 per customer account. The account's users
  (customers, guests and partners linked to it) who have no calendars of
  their own get these instead of the defaults, so a task assigned to a
  customer contact skips the customer's holidays. A person's own calendars
  still win.
- Deleting a calendar removes its days and takes it off everyone who had it.

### What each person sees

Profile Settings › Calendar has a **Holiday Calendars** section
(`client/src/components/accounts/profile-calendars-section.tsx`). It lists
the calendars that apply to the signed-in person: their own if an admin
assigned any, else their account's, else the organization defaults, each
with its next three holidays. A line says which it is, or that none apply
yet. It is
read-only; people can't pick their own calendars there.

## Routes

`GET /api/holiday-calendars/me` is open to any signed-in person and returns
only their own view: `{ source: "user" | "account" | "default" | "none", calendars:
[{ id, code, name, isCountry, upcoming: [{ date, name }] }] }`.

Every `/api/admin` route is Admin only (`requireAdmin`). Errors return `{ code, message }`; the
client translates `code` (`code_taken`, `too_many_defaults`,
`feed_unavailable`, `not_found`, `invalid`).

| Route | Does |
|---|---|
| `GET /api/admin/holiday-calendars` | Calendars with day count, next holiday, last download |
| `GET /api/admin/holiday-calendars/countries` | Countries the feed covers (cached a day) |
| `POST /api/admin/holiday-calendars` | `{ code, name }`; a country code downloads at once |
| `PATCH /api/admin/holiday-calendars/:id` | `{ name?, isDefault? }` |
| `DELETE /api/admin/holiday-calendars/:id` | Deletes it, its days and assignments |
| `POST /api/admin/holiday-calendars/refresh` | Re-downloads every country calendar |
| `POST /api/admin/holiday-calendars/:id/refresh` | `{ years? }`, re-downloads one |
| `GET/POST /api/admin/holiday-calendars/:id/dates` | List, or add/rename a day `{ date, name }` |
| `DELETE /api/admin/holiday-calendars/:id/dates/:dateId` | Removes a day |
| `GET /api/admin/holiday-calendars/assignments` | Each person's calendars |
| `PUT /api/admin/holiday-calendars/assignments/:userId` | `{ calendarIds }`, max 3 |
| `GET /api/admin/holiday-calendars/account-assignments` | Each account's calendars |
| `PUT /api/admin/holiday-calendars/account-assignments/:accountId` | `{ calendarIds }`, max 3 |

## Scheduler job

`holiday_calendar_refresh` (Configuration › Scheduler, Housekeeping): every
30 days by default, re-downloads this year and next for every country
calendar so next year's holidays are there before anyone plans into them.
One failing country doesn't stop the rest; the run fails only when every
country fails.

## Network

The server calls `https://date.nager.at/api/v3/` (fixed host, no API key).
The only values in the URL are a checked two-letter code and a year. A
self-hosted install that blocks outbound traffic needs that host allowed, or
it can use custom calendars only.
