# Application Startup & Routing

> **Last Updated:** February 28, 2026
> **Version:** v0.6.00
> **Maintainer:** Update this document when auth flow, routing, or provider hierarchy changes.

---

## Overview

When a browser loads CriteriaIQ, the application follows a strict sequence of steps to determine what the user sees. This document explains that full sequence — from the HTML entry point through provider initialization, authentication checks, and final page rendering — along with the reasoning behind each design choice.

---

## 1. Entry Point

**File:** `client/index.html` → `client/src/main.tsx`

`main.tsx` is the React application's bootstrap. It mounts the single `<App />` component into the `#root` DOM element. Everything from this point forward is controlled by React.

```
Browser loads index.html
  └─ <script src="main.tsx">
       └─ ReactDOM.createRoot(document.getElementById("root"))
            └─ <App />
```

---

## 2. Provider Hierarchy

**File:** `client/src/App.tsx` (bottom of file, the `App` export)

Before any routing or UI is rendered, `App` wraps the entire application in a layered stack of context providers. Each layer has a specific responsibility:

```
<ErrorBoundary>                   ← Catches unhandled React render errors
  <ThemeProvider>                 ← Light/dark mode, persists to localStorage
    <QueryClientProvider>         ← TanStack React Query (data fetching/caching)
      <GlobalErrorHandler>        ← Intercepts API errors globally (401, 503, etc.)
        <TooltipProvider>         ← Enables tooltips throughout the app
          <DashboardProvider>     ← Dashboard layout state (widgets, config)
            <Router />            ← All routing and auth logic lives here
          </DashboardProvider>
        </TooltipProvider>
      </GlobalErrorHandler>
    </QueryClientProvider>
  </ThemeProvider>
</ErrorBoundary>
```

**Why this order matters:**
- `ErrorBoundary` must be outermost so it can catch errors from any child, including providers
- `ThemeProvider` is next so that dark/light mode applies to every element including loading spinners
- `QueryClientProvider` must wrap `GlobalErrorHandler` because the error handler uses React Query hooks
- `GlobalErrorHandler` sits above routing so it can intercept errors before the Router processes them
- `DashboardProvider` wraps `Router` because the dashboard layout state is needed by pages rendered inside routes

---

## 3. Authentication State (`useAuth`)

**File:** `client/src/hooks/useAuth.ts`

The `Router` component's first action is calling `useAuth()`, which fetches the current session from the server.

### What it fetches

```
GET /api/auth/user
```

This request includes session cookies so the server can identify the logged-in user. `retry: false` is set so a failed request (401 Not Authenticated) does not retry — the app immediately treats the user as unauthenticated.

### What it returns

| Field | Type | Description |
|-------|------|-------------|
| `user` | `User \| null` | The logged-in user object, or null |
| `isLoading` | `boolean` | True while the initial fetch is in progress |
| `isAuthenticated` | `boolean` | Shorthand for `!!user` |
| `isMfaRequired` | `boolean` | True if the user must complete MFA setup |
| `hasCompleteMfa` | `boolean` | True if MFA is fully enrolled and health is green |

### Special flags on the `user` object

| Flag | Source | Meaning |
|------|--------|---------|
| `user.mfaSetupRequired` | Server (`simpleAuth.ts`) | Admin/Engineer role with no MFA enrolled |
| `user.forcePasswordChange` | Database, user record | User must reset their password before proceeding |

---

## Login Flow Diagram

The diagram below shows the complete sequence from landing page to dashboard — including the server-side authentication steps, session creation, and the two decision gates (force password change and MFA) that may intercept the user before reaching the Overview page.

![CriteriaIQ Login Flow](./login-flow.png)

> **Source file:** [`docs/diagrams/login-flow.excalidraw`](../diagrams/login-flow.excalidraw) — open in [Excalidraw](https://excalidraw.com) to edit.

---

## 4. Startup Decision Tree

Once `useAuth` resolves, the `Router` component evaluates several conditions in order. The first matching condition wins.

```
App starts
│
├─ /api/auth/user returns 503 (setupRequired: true)
│    └─ Hard redirect → /setup
│         Reason: Database is not yet configured (first boot).
│         The Setup Wizard runs outside normal auth flow.
│
├─ isLoading === true
│    └─ Full-screen loading spinner
│         Reason: Don't flash the login page while auth is being determined.
│
├─ Current path is /setup
│    └─ Render <Setup /> (no auth required)
│         Reason: Setup must be accessible before any DB exists.
│
├─ !isAuthenticated
│    ├─ Path is /reset-password → <ResetPassword />
│    └─ All other paths → <Landing />
│         Reason: Unauthenticated users should see the login/marketing page.
│         Reset password is the only public route besides setup.
│
├─ user.forcePasswordChange === true
│    └─ Render <ForcePasswordChangeCard /> (blocks all navigation)
│         Reason: Security policy — user cannot use the app until
│         they set a new password (e.g., after admin-created account).
│
├─ isMfaRequired === true
│    └─ Render <MFAEnforcementDialog /> (blocks all navigation)
│         Reason: every role, outside users (Customer, Guest, Partner)
│         included, must have MFA configured, unless they sign in through
│         an SSO provider whose MFA the admin trusts. A user with red
│         security health is blocked until enrollment is complete.
│         Production only. Defaults to true on error (fail-closed).
│         The server enforces the same rule: isAuthenticated answers
│         403 MFA_SETUP_REQUIRED on every API call except the
│         enrollment, status and sign-out routes
│         (server/auth/mfa-enforcement.ts).
│
└─ Authenticated, no blocks
     └─ Render full application (sidebar + route Switch)
```

### Why the order of checks matters

1. **503 check first** — must redirect to setup before any other logic runs, because without a database, all subsequent API calls will also fail
2. **Loading before auth check** — avoids a flash of the login page for users who are already logged in
3. **forcePasswordChange before isMfaRequired** — password integrity is checked before MFA, though in practice both are unlikely to fire simultaneously
4. **MFA last** — only reached by fully authenticated users, acts as a final security gate

---

## 5. Full Application: Route Definitions

**File:** `client/src/App.tsx` — the `Switch` component inside `Router`

When the user is authenticated with no blocking conditions, the app renders a sidebar layout and a `Switch` router. Routes are matched top-to-bottom; the first match wins. Unmatched routes fall through to `<NotFound />`.

| Path | Component | Notes |
|------|-----------|-------|
| `/` | `Overview` | Default landing page after login |
| `/artifacts` | `Artifacts` | Legacy artifacts page |
| `/create` | `CreateProject` | New project form |
| `/create-project` | `CreateProject` | Alias for `/create` |
| `/edit-project/:id` | `EditProjectWrapper` | Fetches project data for `PageLayout` header |
| `/templates` | `Templates` | Template management |
| `/edit-template` | `EditTemplate` | Template editor |
| `/success-criteria` | `SuccessCriteria` | Validation criteria builder |
| `/project` | `Project` | Projects workspace |
| `/project/:id` | `ProjectDetailWrapper` | Injects `customerName` into `PageLayout` |
| `/project/:id/audit` | `ProjectAuditWrapper` | Project audit history |
| `/archive-management` | — | Redirects to `/admin?tab=archive` (`AdminRedirects`) |
| `/account` | `CustomerDashboard` | Account portal |
| `/account-portal` | `CustomerDashboard` | Alias for `/account` |
| `/reports` | `Reports` | Reports: library with the scheduled-send calendar |
| `/analytics` | — | Redirects to `/reports` (`?tab=calendar` → `/reports?view=calendar`) |
| `/report-builder` | — | Redirects to `/reports` (Report Builder archived) |
| `/tags` | `Tags` | Tag management |
| `/admin` | `Admin` | Every Admin page, `?tab=<page>` (`client/src/pages/admin.tsx`) |
| `/config` | — | Redirects to `/admin` (`AdminRedirects`) |
| `/communications` | — | Redirects to `/admin?tab=email-logs` (`AdminRedirects`) |
| `/ai-risk` | `AIRisk` | AI Risk management |
| `/ai-risk-management` | `AIRisk` | Alias for `/ai-risk` |
| `/outcomes-dashboard` | `OutcomesDashboard` | No `PageLayout` wrapper |
| `/getting-started` | `GettingStarted` | Onboarding guide |
| `/about` | `About` | App info & UI library |
| `/support-features` | `SupportFeatures` | No `PageLayout` wrapper |
| `/error-test` | `ErrorTest` | Error boundary testing |
| *(fallback)* | `NotFound` | 404 page |

> For the complete tab/subtab breakdown of each route, see [`navigation-sitemap.md`](./navigation-sitemap.md).

### Wrapper components

Three routes use wrapper components instead of rendering pages directly. These wrappers exist to pre-fetch data needed by `PageLayout` (specifically the `customerName` for the page header):

- **`ProjectDetailWrapper`** — fetches project by `:id`, passes `customerName` to `PageLayout`
- **`EditProjectWrapper`** — same pattern for the edit form
- **`ProjectAuditWrapper`** — same pattern for the audit page

### Routes without `PageLayout`

`OutcomesDashboard` and `SupportFeatures` render without the standard sidebar+header layout. This allows them to present full-screen or embedded experiences.

---

## 6. Default Landing Page After Login

**File:** `client/src/pages/overview.tsx`

The root route `/` renders the `Overview` component, which renders `<MainDashboard />` directly. This is the first page a user sees after a successful login, and it appears in the sidebar as the top-level **Dashboard** item.

The page has no tabs. It previously had Dashboard and Team Management tabs driven by a `?tab=` parameter; Team Management was never built and was removed, so any legacy `/?tab=...` link simply shows the dashboard.

---

## 7. Conditional UI Elements

### Announcement banner

**File:** `client/src/App.tsx` — `AnnouncementBanner` component

The `AnnouncementBanner` is rendered in the app layout but is **hidden for users with roles: `Customer`, `Partner`, or `Guest`**. Internal team members (Admin, Engineer, etc.) see system announcements; external-facing roles do not.

### Global overlays

Two components are rendered globally within `DashboardProvider`, outside the route Switch, so they persist across navigation:

| Component | Purpose |
|-----------|---------|
| `FlightDeckModal` | Flight Deck hygiene report modal, triggered by sidebar |
| `Toaster` | Toast notification system (success, error, warning, etc.) |

These are rendered globally rather than per-page so that a notification triggered by an API call on one page continues to display if the user navigates before it dismisses.

---

## 8. How to Change the Default Landing Page

### Change the default tab on the Overview page

**File:** `client/src/pages/overview.tsx`

Edit the `getInitialTab` function's fallback value:

```typescript
// Change 'dashboard' to any value in allowedTabs
return allowedTabs.includes(tab ?? '') ? tab! : 'dashboard';
```

Also add the new tab ID to `allowedTabs` if it is not already there.

### Change the default route entirely

**File:** `client/src/App.tsx`

Change the component mapped to the `/` route in the `Switch`:

```tsx
// Before
<Route path="/" component={() => <PageLayout><Overview /></PageLayout>} />

// After (example: redirect to /project by default)
<Route path="/" component={() => <Redirect to="/project" />} />
```

Or swap `Overview` for a different page component entirely.

---

## 9. Server-Side Startup Checks

**File:** `server/index.ts`

The server performs its own startup sequence before the client ever connects. Key behaviors:

- If the database is not reachable or not configured, all `/api/*` routes return `503 Service Unavailable` with `{ setupRequired: true }`. The client's `useAuth` hook detects this and hard-redirects to `/setup`.
- The Setup Wizard (`/setup`) writes a file-based bootstrap config, then triggers a clean server restart. After restart, the database is available and the normal auth flow proceeds.

---

## 10. File Reference

| Purpose | File |
|---------|------|
| React entry point | `client/src/main.tsx` |
| Provider hierarchy + Router | `client/src/App.tsx` |
| Auth hook | `client/src/hooks/useAuth.ts` |
| Server auth & MFA logic | `server/auth/simpleAuth.ts` |
| Server startup & 503 logic | `server/index.ts` |
| Default landing page | `client/src/pages/overview.tsx` |
| Landing page (unauthenticated) | `client/src/pages/landing.tsx` |
| Setup wizard | `client/src/pages/setup.tsx` |
| Force password change | `client/src/components/auth/ForcePasswordChangeCard.tsx` |
| MFA enforcement dialog | `client/src/components/auth/MFAEnforcementDialog.tsx` |
| Full route/tab/subtab map | `docs/architecture/navigation-sitemap.md` |

---

## Maintenance Notes

**Update this document when:**
- Adding new auth gates (e.g., new blocking conditions before the full app renders)
- Adding or removing top-level routes in `App.tsx`
- Changing the default tab or page after login
- Modifying the provider hierarchy
- Changing how `setupRequired` or MFA enforcement works

**Related documents:**
- [`navigation-sitemap.md`](./navigation-sitemap.md) — full tab/subtab route map
- [`mfa-system.md`](../guides/mfa-system.md) — MFA setup and enforcement detail
- [`design-document.md`](./design-document.md) — overall system architecture
