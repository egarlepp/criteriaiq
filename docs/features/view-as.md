# View As (Dev Persona Switcher)

Admins can look at the app as another person sees it: the same menu, pages,
data and permission checks. Open it from the person-and-gear icon in the
header. It works in every environment, but only for Admins.

Two ways to pick who to view as:

- **Specific Users**: an exact preview of that person, using their own page
  permissions, account and project assignments.
- **A role** (Internal or External Roles): a new user with that role. It
  has the role's grants from Admin › Team & People › Role Management and no
  assigned projects or accounts. If the role has no grants there, the menu
  is empty, even when real users of that role see pages (each user has a
  copy of the grants that may since have changed). Use Specific Users to
  check what a real person sees.

Admins are never offered: viewing as an Admin would show nothing new.

## Rules

- **Read only.** Every change is refused by the server (403
  `VIEW_AS_READ_ONLY`) until you exit. Edit buttons still show where that
  person would see them; using one shows "View As is read only".
- **You stay signed in as yourself.** The amber banner names who you are
  viewing as and who is signed in. Exit from the banner or the switcher;
  switching to someone else does not need an exit first. Signing out ends
  it too.
- **MFA and password prompts are yours**, not the viewed person's: you
  already passed them.
- **Login History** records `view_as_started` and `view_as_ended` with your
  name and who you viewed as. The hourly session row names you too.
- If you are deactivated or stop being an Admin while viewing, the session
  ends at once. If the person you are viewing is deactivated, View As ends
  and you are back as yourself.
- Page views are not counted while viewing (Page Usage).

## How it works

While View As is on, the session's user **is** the person viewed, so every
server check that reads `req.session.user` answers for them with no
per-route code. The Admin is kept in `session.viewAs.realUser`.

| Piece | File |
|---|---|
| Session swap, read-only guard, Admin re-check | `server/auth/view-as.ts` |
| Routes (`GET /api/view-as/options`, `POST /api/view-as`, `DELETE /api/view-as`) | `server/routes/view-as-routes.ts` |
| Role stand-in permissions | `permissionRowsForUser` in `server/lib/section-permissions.ts` |
| Viewed user ended | `checkSessionUser` in `server/auth/session-revocation.ts` |
| MFA gate uses the Admin | `passesMfaGate` in `server/auth/mfa-enforcement.ts` |
| `/api/auth/user` adds `viewAs` | `server/auth/simpleAuth.ts` |
| Client state, start/exit (reloads the page) | `client/src/contexts/PersonaContext.tsx` |
| Switcher and banner | `client/src/components/layout/DevPersonaSwitcher.tsx`, `PersonaBanner.tsx` |

A role stand-in has the id `view-as-role:<Role>` and no database row. Pages
that load your own profile (`/api/users/me`) find nothing for it, so profile
details are blank in role mode.

The read-only guard is mounted right after the session middleware, before
every route, and lets through only `GET`/`HEAD`/`OPTIONS`, `/api/view-as`
and `/api/logout`. A `GET` that writes as a side effect (for example marking
something seen) is not blocked and is recorded against the viewed person.

Before this (March 2026 to October 2026) the switcher only changed the role
in the browser: the menu changed, but pages still loaded Admin data, and an
"Edit Mode" toggle let changes through using the Admin's own access. Both
are gone.
