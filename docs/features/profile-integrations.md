# Profile Settings › Integrations

Each user's own connections, ported from ImpactIQ's My Settings ›
Connections. Users open it from the sidebar avatar (Profile Settings ›
Integrations tab) or by clicking the CRM or Outlook icon in the sidebar
footer, and can see at a glance whether CriteriaIQ can reach their CRM
account and their Outlook calendar.

Code: `client/src/components/accounts/profile-integrations-tab.tsx` (the tab),
`client/src/components/accounts/connection-card.tsx` (one card per
connection, shared by the CRM and Outlook cards),
`server/crm/my-connection.ts` (builds the answer),
`server/salesforce/salesforce-user-connection.ts` (Salesforce token check),
`shared/my-connections.ts` (the response type and `isCrmConnectionReady`).

## What each user sees

Every connection always has a card. One that an admin hasn't set up yet
shows grayed out with a dashed border, a "Not Set Up" pill, a note saying
who sets it up, and no buttons. One install has one CRM
([crm-provider.md](crm-provider.md)), so once a CRM is chosen the tab shows
only that CRM's card; before then the Salesforce and HubSpot cards both
show grayed out.

| CRM | Card | States |
|---|---|---|
| Salesforce | Per-user OAuth sign-in. Shows the Salesforce username and the date it was connected, with Connect, Reconnect and Disconnect. | Connected · Reconnect needed (Salesforce refused the token) · Not connected · Not set up (no OAuth credentials saved) |
| HubSpot | No per-user sign-in: the admin saves one portal-wide key. The card shows the HubSpot owner matched to the user by email. | Connected · Not matched (no active owner with that email) · Not set up (no key saved) |
| None | Salesforce and HubSpot cards, both grayed out, saying no CRM is chosen yet. | Not set up |

Customer, Guest and Partner users never use the CRM, so they see a line
saying there is nothing to connect, and no CRM icon in the sidebar.

## `GET /api/crm/me`

Signed-in users only; answers for the caller, never another user.

```json
{
  "provider": "salesforce",
  "external": false,
  "salesforce": {
    "configured": true,
    "connected": true,
    "healthy": true,
    "accountLabel": "sam@acme.com",
    "connectedAt": "2026-10-01T09:30:00.000Z"
  },
  "hubspot": null
}
```

- `healthy` is `false` only when Salesforce refuses the token
  (`invalid_grant`, `INVALID_SESSION_ID`, `INVALID_AUTH_HEADER`). A network
  error or API limit gives `null`, which the UI shows as connected: an outage
  is not the user's problem to fix.
- The check calls Salesforce's identity endpoint at most once per user every
  10 minutes (in-memory cache). Connecting or disconnecting clears it.
- On HubSpot, `hubspot.owner` comes from `hubspot_owners` (synced by the
  HubSpot owner job), matched on lower-case email, archived owners excluded.

## Sidebar CRM icon

The footer icon (`client/src/components/layout/sidebar-connections.tsx`)
reads the same endpoint. Green = ready, amber with an alert icon = needs the
user (reconnect or not matched), grey = not connected. It shows for HubSpot
too and is hidden when no CRM applies. Clicking it opens Profile Settings ›
Integrations.

## Salesforce sign-in return

The Salesforce OAuth callback returns to `/?profile=integrations&sf=connected`
(or `&sf_error=<code>`). The sidebar reads `?profile=<tab>`, opens Profile
Settings on that tab, shows a toast, and removes the parameters. The raw
error code is never shown to the user. `/profile` and `/profile?tab=<tab>`
redirect to the same place, so older links (Flight Deck presets, emails)
land on the right tab instead of Not Found.

Profile completeness counts the CRM connection as one more field when a CRM
applies to the user.

## Outlook calendar

Each internal user can link their own Outlook calendar, as in ImpactIQ's My
Settings › Outlook. A daily sync reads their all-day "Out of office" events
into their time off and, when the admin allows it, their Outlook working
days into their work week ([`working-calendar.md`](working-calendar.md#from-outlook)).
Read only, unless the admin turns on **Add MAP due dates to Outlook**: then
CriteriaIQ adds, moves and removes its own all-day due-date events and
touches nothing else ([`working-calendar.md`](working-calendar.md#outlook-write-back)).

Code: `server/outlook/` (`config.ts` the app settings, `oauth.ts` the
Microsoft calls, `user-connection.ts` token refresh and the card's check),
`server/routes/outlook-routes.ts`, `server/storage/outlook.ts`,
`shared/outlook.ts`, `client/src/components/integrations/OutlookSigninForm.tsx`
(admin card), and the Outlook card in `profile-integrations-tab.tsx`.

### Admin setup

Admin › Integrations › Overview › **Outlook sign-in** holds one Microsoft
Entra app (`outlook_signin_config`, migration 102):

1. Register an app in Microsoft Entra and add the Redirect URI the card
   shows (`<PUBLIC_APP_URL>/api/auth/microsoft/callback`, or
   `OUTLOOK_REDIRECT_URI` when set) as a **Web** redirect URI.
2. Add the delegated Microsoft Graph permissions `User.Read` and
   `Calendars.Read`, and create a client secret.
3. Optional: turn on **Read working days from Outlook** to also ask for
   `MailboxSettings.Read` at sign-in (column `read_working_hours`, migration
   108). Add that permission on the Entra app too if your directory needs
   admin consent for new permissions. People who linked Outlook before must
   reconnect to grant it; until then only their time off syncs.
4. Optional: turn on **Add MAP due dates to Outlook** to also ask for
   `Calendars.ReadWrite` (column `write_map_due_dates`, migration 111). Same
   rules as step 3: add the permission on the Entra app if consent is needed,
   and people reconnect to grant it.
5. Paste the directory (tenant) ID or domain, the application (client) ID and
   the secret, and save. `organizations` accepts any work or school account;
   `common` and `consumers` are refused (personal accounts have no work
   calendar).

Saving asks Microsoft for an app-only token with the details first, so a
wrong tenant, client ID or secret is refused before it replaces working ones
(skipped for `organizations`, which can't issue one). The secret is
encrypted with `encryptText` and listed in the key-rotation manifest; the
card only shows its last four characters and how many people are connected.
Saves and removals go to Login History (`outlook_signin_saved`,
`outlook_signin_removed`). Removing the app also removes every person's
link, since tokens from it can never be refreshed again. Due-date events
already in people's Outlook stay there after that, so turn **Add MAP due
dates to Outlook** off first (which removes them) if you mean to remove the
app. Switching it off
keeps people's links but stops them being used; each person can still
remove theirs.

This app is separate from the Email configuration's Graph app, which sends
as one shared mailbox with application permissions.

### Each person's link

| State | Shown when |
|---|---|
| Connected | A token is on file and Microsoft accepted it on the last check. Shows the mailbox and the date. |
| Reconnect needed | Microsoft refused the refresh (`invalid_grant`, consent revoked) or Graph answered 401. |
| Not connected | No token on file. |
| Not set up | Outlook sign-in isn't set up (or is switched off) and the person has no link. The card is grayed out. |

- `GET /api/auth/microsoft/connect` keeps a one-time state in the person's
  session and sends them to Microsoft. The callback stores tokens only when
  the state matches, is under 10 minutes old, and the session is still the
  same person's; anything else returns `&outlook=expired`. Outside users
  (Customer, Guest, Partner) get 403.
- Tokens are stored encrypted in `user_integrations` (provider `microsoft`)
  with `expires_at` and `account_label`. An access token is refreshed when
  it runs out, once per person at a time.
- `GET /api/outlook/me` checks the token against Graph `/me` at most once
  every 10 minutes per person. A network error reads as unknown (shown as
  connected), never as broken.
- The callback returns to `/?profile=integrations&outlook=connected` (or
  `expired`, `unavailable`, `error`); the sidebar shows a toast and removes
  the parameter. Microsoft's own error text is never shown or stored.

### Sidebar Outlook icon

Once Outlook sign-in is set up, the Outlook icon shows the person's own link
(green connected, amber when it needs a reconnect, link color to connect) and
opens Profile Settings › Integrations. Until then, and for outside users, it
still shows whether the deployment sends mail through Outlook.
