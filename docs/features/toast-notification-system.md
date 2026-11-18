# Toast Notification System Documentation

## Table of Contents
- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Toast Variants](#toast-variants)
- [Toast Categories](#toast-categories)
- [Implementation Guide](#implementation-guide)
- [Configuration](#configuration)
- [Internationalization](#internationalization)
- [Testing](#testing)
- [Files Reference](#files-reference)

---

## Overview

The Toast Notification System is a comprehensive, standardized UI feedback mechanism designed to provide consistent user notifications across the CriteriaIQ application. The system supports 6 distinct toast variants, 4 organizational categories, full internationalization across 6 languages, and intelligent auto-dismiss behavior.

### Key Features

✅ **6 Visual Variants** with distinct colors, icons, and durations  
✅ **4 Organizational Categories** for logical message grouping  
✅ **Smart Auto-Dismiss** with variant-specific durations  
✅ **Full i18n Support** across 6 languages (EN, ES, FR, DE, IT, PT)  
✅ **Centralized Message Management** for consistency  
✅ **TypeScript Autocomplete** support  
✅ **Dark Mode Compatible**  
✅ **Action Button Support** for interactive toasts  
✅ **Custom Icon Override** capability  

---

## System Architecture

### Component Hierarchy

```
┌─────────────────────────────────────────┐
│         Application Root                │
│  (Toaster component mounted globally)   │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│          use-toast.ts (Hook)            │
│  • Toast state management               │
│  • Queue handling                       │
│  • Auto-dismiss logic                   │
└─────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌──────────────────┐    ┌──────────────────┐
│   toast.tsx      │    │  toaster.tsx     │
│  • UI Component  │    │  • Toast Render  │
│  • Styling       │    │  • Icon Display  │
│  • Variants      │    │  • Actions       │
└──────────────────┘    └──────────────────┘
```

### Data Flow

```
User Action
    │
    ▼
Helper Function (showSuccessToast, etc.)
    │
    ▼
toast() function with i18n key
    │
    ▼
Category configuration applied (icon, duration, styling)
    │
    ▼
Toast added to queue
    │
    ▼
Toaster renders with variant styling
    │
    ▼
Auto-dismiss timer starts (variant-specific)
    │
    ▼
Toast removed from queue
```

---

## Toast Variants

### 1. **Success** 🟢
- **Color**: Green (`bg-green-50`, `text-green-800`, `border-green-200`)
- **Icon**: `CheckCircle2`
- **Duration**: 3 seconds
- **Use Cases**: Successful operations, data saved, actions completed

```typescript
toast({
  variant: "success",
  title: "Success!",
  description: "Your changes have been saved.",
});
```

### 2. **Error** 🔴
- **Color**: Red (`bg-red-50`, `text-red-800`, `border-red-200`)
- **Icon**: `XCircle`
- **Duration**: 5 seconds
- **Use Cases**: Failed operations, validation errors, system errors

```typescript
toast({
  variant: "error",
  title: "Error",
  description: "Failed to save changes. Please try again.",
});
```

### 3. **Warning** 🟠
- **Color**: Amber (`bg-amber-50`, `text-amber-800`, `border-amber-200`)
- **Icon**: `AlertTriangle`
- **Duration**: 5 seconds
- **Use Cases**: Important notices, deprecation warnings, caution messages

```typescript
toast({
  variant: "warning",
  title: "Warning",
  description: "This action cannot be undone.",
});
```

### 4. **Info** 🔵
- **Color**: Blue (`bg-blue-50`, `text-blue-800`, `border-blue-200`)
- **Icon**: `Info`
- **Duration**: 4 seconds
- **Use Cases**: General information, tips, neutral notifications

```typescript
toast({
  variant: "info",
  title: "Information",
  description: "You have 3 pending tasks.",
});
```

### 5. **Confirm** 🟣
- **Color**: Purple (`bg-purple-50`, `text-purple-800`, `border-purple-200`)
- **Icon**: `HelpCircle`
- **Duration**: 7 seconds (longer for user decision time)
- **Use Cases**: Confirmation prompts, important questions, user decisions

```typescript
toast({
  variant: "confirm",
  title: "Confirm Action",
  description: "Are you sure you want to proceed?",
  action: (
    <Button onClick={handleConfirm} size="sm">
      Confirm
    </Button>
  ),
});
```

### 6. **Loading** ⚪
- **Color**: Gray (`bg-gray-50`, `text-gray-800`, `border-gray-200`)
- **Icon**: `Loader2` (animated spinner)
- **Duration**: 30 seconds (extended for long operations)
- **Use Cases**: Loading states, processing indicators, async operations

```typescript
const toastId = toast({
  variant: "loading",
  title: "Processing...",
  description: "Please wait while we process your request.",
});

// Dismiss when done
dismiss(toastId);
```

---

## Toast Categories

Categories provide automatic icon mapping and behavior configuration for common use cases.

### 1. **System Category** ⚙️
- **Icon**: `Settings`
- **Default Duration**: 4 seconds
- **Use Cases**: Authentication, settings changes, notifications, system alerts

**Examples:**
- Login/logout events
- Password changes
- Settings updates
- System notifications

### 2. **Data Category** 💾
- **Icon**: `Database`
- **Default Duration**: 3 seconds
- **Use Cases**: CRUD operations, imports, exports, sync operations

**Examples:**
- Data created/updated/deleted
- Import success/failure
- Export completion
- Sync status updates

### 3. **Validation Category** ✅
- **Icon**: `AlertCircle`
- **Default Duration**: 5 seconds
- **Use Cases**: Form validation, field errors, duplicate detection, format issues

**Examples:**
- Required field errors
- Email format validation
- Duplicate entry warnings
- Input constraint violations

### 4. **UserActions Category** 👥
- **Icon**: `Users`
- **Default Duration**: 4 seconds
- **Use Cases**: Profile updates, invitations, permissions, role changes

**Examples:**
- Profile picture updated
- User invited to project
- Permission granted/revoked
- Role assignment changes

---

## Implementation Guide

> **Helper-first convention (Task #461).** All success / error / warning /
> info notifications in `client/src` MUST go through the shared helpers
> in `client/src/lib/toast-helper.ts`. Direct `toast({...})` calls are
> reserved for genuinely-custom toasts that need an action button, a
> custom duration, a custom icon, or one of the non-helper variants
> (`confirm`, `loading`, `default`). The helpers keep the variant naming
> ("success" / "error" / "warning" / "info") consistent across the app
> and make it trivial to swap in app-wide tone, duration, or telemetry
> changes from a single file.

### Basic Usage

#### 1. **Helper Functions Are the Default (preferred)**

```typescript
import {
  showSuccessToast,
  showErrorToast,
  showWarningToast,
  showInfoToast,
} from "@/lib/toast-helper";

// Each helper takes (titleKey, descriptionKey?) and runs both arguments
// through i18n.t() — pass either an i18n key or an already-translated
// string (the helper is a no-op for non-key strings).
showSuccessToast(t("profile.updateSuccess.title"), t("profile.updateSuccess.description"));
showErrorToast(t("profile.updateError.title"), t("profile.updateError.description"));
showWarningToast(t("session.expiringSoon.title"));
showInfoToast(t("export.queued.title"), t("export.queued.description"));
```

| Helper | Variant emitted | Color | Default duration |
| --- | --- | --- | --- |
| `showSuccessToast` | `success` | green | 3 s |
| `showErrorToast`   | `error`   | red   | 5 s |
| `showWarningToast` | `warning` | amber | 5 s |
| `showInfoToast`    | `info`    | blue  | 4 s |

> The legacy `destructive` variant has been consolidated into `error`.
> New code should call `showErrorToast(...)` instead of
> `toast({ variant: "destructive", ... })`. `destructive` styling is
> still defined for back-compat and is used by the `<Button variant="destructive">`
> pattern inside confirm-toast actions, but no toast call site in
> `client/src` should emit it directly.

#### 2. **Use `toast({...})` Directly Only for Custom Cases**

Reach for `toast({...})` (via `const { toast } = useToast();` inside a
component, or the module-level `toast` export elsewhere) only when you
need behavior the helpers cannot express:

* an `action` button,
* a non-default `duration` (or `Infinity` for sticky toasts),
* a custom `icon`,
* the `confirm` or `loading` variant,
* a manually-managed dismiss handle (`const id = toast({...}); dismiss(id);`).

```typescript
import { toast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

const { t } = useTranslation();

toast({
  variant: "loading",
  title: t("toasts.import.inProgress.title"),
  description: t("toasts.import.inProgress.description"),
  duration: Infinity,
});
```

#### 3. **Skipped Surfaces**

The task-461 sweep originally left the following call sites on
direct `toast({...})` because they predated the helper convention:

* `client/src/pages/reset-password.tsx`
* `client/src/components/security/MFAManagement.tsx`
* `client/src/components/security/MFASetupDialog.tsx`
* `client/src/components/security/MFAChallengeDialog.tsx`
* `client/src/components/security/MFAEnforcementDialog.tsx`

Task-466 swept them onto the helpers and removed them from the
`DEFAULT_ALLOWED_FILES` list in `scripts/check-toast-helper-usage.ts`.
The only surviving exemptions are now the framework files
(`toast-helper.ts`, `use-toast.ts`) and the in-app variant showcase
(`ToastShowcaseTab.tsx`). The lone direct `toast({...})` call that
remains in `MFASetupDialog.tsx` is a `variant: "warning"` toast with
an inline `action` button (Cancel / Continue) — it carries an
`action` key and so falls outside the helper-replaceable shape the
lint rule targets.

### Advanced Usage

#### Custom Icons

```typescript
import { Upload } from "lucide-react";

toast({
  variant: "success",
  icon: Upload,
  title: "Upload Complete",
  description: "Your file has been uploaded successfully.",
});
```

#### Action Buttons

```typescript
toast({
  variant: "confirm",
  title: "Delete Project?",
  description: "This action cannot be undone.",
  action: (
    <Button onClick={handleDelete} variant="destructive" size="sm">
      Delete
    </Button>
  ),
});
```

#### Manual Dismiss Control

```typescript
const toastId = toast({
  variant: "loading",
  title: "Processing...",
  duration: Infinity, // Never auto-dismiss
});

// Later...
dismiss(toastId);
```

#### Custom Duration Override

```typescript
toast({
  variant: "success",
  title: "Quick Message",
  description: "This will disappear quickly",
  duration: 1500, // Custom 1.5 second duration
});
```

---

## Configuration

### Toast Duration Map

Defined in `client/src/hooks/use-toast.ts`:

```typescript
export const TOAST_DURATION_MAP = {
  success: 3000,    // 3 seconds
  error: 5000,      // 5 seconds  
  warning: 5000,    // 5 seconds
  info: 4000,       // 4 seconds
  confirm: 7000,    // 7 seconds
  loading: 30000,   // 30 seconds
  default: 4000,    // 4 seconds
  destructive: 5000 // 5 seconds
};
```

### Category Configuration

Defined in `client/src/lib/toast-categories.ts`:

```typescript
export const TOAST_CATEGORIES = {
  System: {
    icon: Settings,
    color: "blue",
    defaultDuration: 4000,
  },
  Data: {
    icon: Database,
    color: "green",
    defaultDuration: 3000,
  },
  Validation: {
    icon: AlertCircle,
    color: "amber",
    defaultDuration: 5000,
  },
  UserActions: {
    icon: Users,
    color: "purple",
    defaultDuration: 4000,
  },
};
```

### Variant Styling

Colors and styling are defined in `client/src/components/ui/toast.tsx`:

```typescript
const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-center...",
  {
    variants: {
      variant: {
        default: "border bg-background text-foreground",
        success: "border-green-200 bg-green-50 text-green-800...",
        error: "border-red-200 bg-red-50 text-red-800...",
        warning: "border-amber-200 bg-amber-50 text-amber-800...",
        info: "border-blue-200 bg-blue-50 text-blue-800...",
        confirm: "border-purple-200 bg-purple-50 text-purple-800...",
        loading: "border-gray-200 bg-gray-50 text-gray-800...",
        destructive: "destructive group border-destructive...",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);
```

---

## Internationalization

### Message Organization

All toast messages are organized by feature/module in `client/src/lib/toast-messages.ts`:

```typescript
export const TOAST_MESSAGES = {
  // Authentication
  "auth.loginSuccess": { title: "...", description: "..." },
  "auth.loginError": { title: "...", description: "..." },
  
  // Profile
  "profile.updateSuccess": { title: "...", description: "..." },
  "profile.updateError": { title: "...", description: "..." },
  
  // Projects
  "project.createSuccess": { title: "...", description: "..." },
  "project.deleteSuccess": { title: "...", description: "..." },
  
  // ... and more
};
```

### Translation Files

Toast translations are added to all 6 language files:

- `client/src/i18n/locales/en-US.json`
- `client/src/i18n/locales/es-ES.json`
- `client/src/i18n/locales/fr-FR.json`
- `client/src/i18n/locales/de-DE.json`
- `client/src/i18n/locales/it-IT.json`
- `client/src/i18n/locales/pt-BR.json`

**Example Entry:**

```json
{
  "toasts": {
    "profile": {
      "updateSuccess": {
        "title": "Profile Updated",
        "description": "Your profile has been updated successfully."
      },
      "updateError": {
        "title": "Update Failed",
        "description": "Failed to update profile. Please try again."
      }
    }
  }
}
```

### Adding New Toast Messages

1. **Add to toast-messages.ts:**
```typescript
export const TOAST_MESSAGES = {
  "feature.action": { 
    title: "toasts.feature.action.title", 
    description: "toasts.feature.action.description" 
  },
};
```

2. **Add translations to all 6 locale files:**
```json
{
  "toasts": {
    "feature": {
      "action": {
        "title": "Action Title",
        "description": "Action description here."
      }
    }
  }
}
```

3. **Use in component:**
```typescript
showSuccessToast("feature.action");
```

---

## Testing

### Visual Testing

Visit the **Toast Showcase Page** at `/toast-showcase` to:
- See all 6 variants in action
- Test auto-dismiss durations
- Verify icon display
- Check dark mode compatibility
- Test action button interactions

### Manual Testing Checklist

- [ ] All variants display with correct colors
- [ ] Icons appear correctly for each variant
- [ ] Auto-dismiss works with correct durations
- [ ] Custom icons override default icons
- [ ] Action buttons are clickable and functional
- [ ] i18n keys resolve to correct translations
- [ ] Dark mode styling appears correctly
- [ ] Multiple toasts stack properly
- [ ] Manual dismiss works (X button)
- [ ] Loading spinner animates properly

### Integration Testing

```typescript
// Example test in your component
import { showSuccessToast } from "@/lib/toast-helper";

const handleSave = async () => {
  try {
    await saveData();
    showSuccessToast("data.saveSuccess");
  } catch (error) {
    showErrorToast("data.saveError");
  }
};
```

### Automated Testing

```typescript
import { toast } from "@/hooks/use-toast";
import { render, screen, waitFor } from "@testing-library/react";

test("displays success toast", async () => {
  toast({
    variant: "success",
    title: "Success",
    description: "Operation completed",
  });

  await waitFor(() => {
    expect(screen.getByText("Success")).toBeInTheDocument();
    expect(screen.getByText("Operation completed")).toBeInTheDocument();
  });
});
```

### Helper-Convention Lint (`npm run lint:toasts`) — Build Gate

The helper-first convention (Task #461) is enforced by an automated
lint script at `scripts/check-toast-helper-usage.ts`, exposed as
`npm run lint:toasts`. It scans every `.ts` / `.tsx` file under
`client/src` and fails (exit code 1) if any call site outside the
explicit allow-list still uses the hand-written
`toast({ variant, title, description })` shape in one of the flagged
variants (`success` / `error` / `warning` / `info` / `destructive`).

**Two enforcement paths run against the same logic** so neither humans
nor CI can forget the rule:

1. **Vitest spec** — `scripts/check-toast-helper-usage.test.ts` imports
   `checkToastHelperUsage()` directly, so any `npm test` /
   `npm run test:watch` run flags violations the moment they land.
2. **Build gate (Task #465)** — `npm run build` runs
   `npm run lint:toasts` as its **first** step, ahead of `vite build`,
   `esbuild`, and `verify-prod-bundle.mjs`. A non-zero exit short-
   circuits the entire build the same way a `tsc` failure would, so a
   bad toast call site can never reach a published bundle.

To run the check on its own (e.g. before committing):

```bash
npm run lint:toasts
```

When the check fails, the report names the offending file, line, and
variant, and points at this document for the full convention. The fix
is almost always to swap the call for the matching helper
(`showSuccessToast` / `showErrorToast` / `showWarningToast` /
`showInfoToast`) — see [Implementation Guide](#implementation-guide)
above for the call shape.

If a brand-new call site genuinely needs to stay on direct
`toast({...})` (e.g. it carries an action button, custom icon, custom
duration, or one of the non-helper variants like `confirm` /
`loading` / `default`), simply drop the
`{variant, title, description}`-only shape — the lint only flags that
exact shape, so any extra prop (`action`, `duration`, `icon`, …) makes
it pass automatically. Adding a file to the script's allow-list is
reserved for the legacy carve-outs already documented under
[Skipped Surfaces](#3-skipped-surfaces).

---

## Files Reference

### Core System Files

| File | Purpose |
|------|---------|
| `client/src/hooks/use-toast.ts` | Toast state management, queue handling, auto-dismiss logic |
| `client/src/components/ui/toast.tsx` | Toast UI component with variant styling |
| `client/src/components/ui/toaster.tsx` | Toast renderer with icon and action support |
| `client/src/lib/toast-categories.ts` | Category configurations (System, Data, Validation, UserActions) |
| `client/src/lib/toast-messages.ts` | Centralized message definitions with i18n keys |
| `client/src/lib/toast-helper.ts` | Helper functions (showToast, showSuccessToast, etc.) |
| `scripts/check-toast-helper-usage.ts` | Helper-first convention lint (`npm run lint:toasts`); also wired in front of `vite build` inside `package.json`'s `build` script (Task #465) |
| `scripts/check-toast-helper-usage.test.ts` | Vitest spec that runs the same check inside `npm test` |

### Translation Files

| File | Language |
|------|----------|
| `client/src/i18n/locales/en-US.json` | English |
| `client/src/i18n/locales/es-ES.json` | Spanish |
| `client/src/i18n/locales/fr-FR.json` | French |
| `client/src/i18n/locales/de-DE.json` | German |
| `client/src/i18n/locales/it-IT.json` | Italian |
| `client/src/i18n/locales/pt-BR.json` | Portuguese |

### Showcase & Documentation

| File | Purpose |
|------|---------|
| `client/src/pages/toast-showcase.tsx` | Visual showcase page with live examples |
| `docs/toast-notification-system.md` | This documentation file |

---

## Quick Reference

### Helper Function Signatures

```typescript
// Generic toast driven by a structured ToastMessage entry — used by code
// that picks its message from `toast-messages.ts` (category + variant
// inferred from the entry).
showToast(options: {
  message: ToastMessage;
  variables?: Record<string, string>;
  actionLabel?: string;
  onAction?: () => void;
}): void;

// The four call-site helpers. Both arguments are run through i18n.t(),
// so callers can pass either an i18n key or an already-translated
// string from a useTranslation() hook.
showSuccessToast(titleKey: string, descriptionKey?: string): void;
showErrorToast(titleKey: string, descriptionKey?: string): void;
showWarningToast(titleKey: string, descriptionKey?: string): void;
showInfoToast(titleKey: string, descriptionKey?: string): void;
```

### Common Patterns

**Success after data save:**
```typescript
showSuccessToast(t("toasts.data.saveSuccess.title"), t("toasts.data.saveSuccess.description"));
```

**Error with a dynamic message from the server:**
```typescript
showErrorToast(t("toasts.data.saveError.title"), error.message);
```

**Loading with manual dismiss:**
```typescript
const loadingToast = toast({
  variant: "loading",
  title: t("toasts.data.importing.title"),
  description: t("toasts.data.importing.description"),
});

// ... async operation ...

dismiss(loadingToast);
showSuccessToast("data.importSuccess");
```

**Confirmation with action:**
```typescript
toast({
  variant: "confirm",
  title: "Confirm Delete",
  description: "This will permanently delete the project.",
  action: (
    <Button onClick={handleDelete} variant="destructive" size="sm">
      Delete
    </Button>
  ),
});
```

---

## Best Practices

1. **Default to the helpers.** Reach for `showSuccessToast` /
   `showErrorToast` / `showWarningToast` / `showInfoToast` first; only
   drop down to `toast({...})` when you need an action button, custom
   duration, custom icon, or the `confirm` / `loading` variant.
2. **Prefer `showErrorToast` over `variant: "destructive"`.** The
   `destructive` variant is legacy; new error toasts should go through
   the helper so the variant naming stays consistent across the app.
3. **Always use i18n keys** for title and description (never hardcode strings).
4. **Choose appropriate durations** - longer for confirmations, shorter for simple feedback.
5. **Use loading toasts** for async operations that take >1 second.
6. **Provide action buttons** when user input is required.
7. **Test in dark mode** to ensure visibility.
8. **Keep descriptions concise** (under 100 characters).
9. **Use appropriate variants** - don't overuse "error" or "success".
10. **Group related messages** under the same feature key in `toast-messages.ts`.
11. **Document new categories** if you extend the system.

---

## Troubleshooting

### Toast not appearing
- Check that `<Toaster />` is mounted in `App.tsx`
- Verify i18n key exists in all locale files
- Ensure toast is called inside a React component

### Wrong duration
- Check `TOAST_DURATION_MAP` for variant-specific duration
- Verify category configuration doesn't override
- Check if custom duration is being passed

### Icon not showing
- Verify icon is imported from `lucide-react`
- Check category configuration for default icon
- Ensure icon prop is passed correctly

### Translation missing
- Add key to all 6 locale files
- Check for typos in i18n keys
- Verify t() function is called with correct namespace

---

## Future Enhancements

Potential improvements for consideration:

- [ ] Toast queue limit (max 3 visible at once)
- [ ] Position configuration (top-right, bottom-center, etc.)
- [ ] Sound effects for critical toasts
- [ ] Persistent toasts (survive page refresh)
- [ ] Toast grouping/stacking by category
- [ ] Swipe-to-dismiss on mobile
- [ ] Undo action support
- [ ] Progress bar for loading toasts
- [ ] Custom animations (slide, fade, bounce)
- [ ] Toast analytics tracking

---

**Last Updated:** April 27, 2026 (Task #465 — `lint:toasts` wired into `npm run build`)  
**Version:** v0.3.40  
**Maintained by:** CriteriaIQ Development Team
