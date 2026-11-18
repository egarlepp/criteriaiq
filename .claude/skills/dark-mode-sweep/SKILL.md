---
name: dark-mode-sweep
description: Audit and fix dark-mode coverage in CriteriaIQ React components. Scans a folder for Tailwind color classes that lack matching `dark:` siblings, applies the project's idiomatic light/dark pairs, and reports residual gaps. Use when the user says "sweep dark mode", "audit dark mode in X", "fix dark mode for the Y feature", or notices a UI section that breaks in dark mode.
---

# dark-mode-sweep — find and fix Tailwind dark-mode gaps

CriteriaIQ enforces dark-mode support on every UI component. This skill scans for missing `dark:` variants on color classes, proposes the canonical light/dark pairs from the project's documented conventions, and applies the fixes.

**Current coverage baseline (as of audit):** ~54% of components in `client/src/components/` have any `dark:` class. That leaves ~165 component files with partial or zero dark-mode coverage. This skill is the workhorse for closing that gap folder by folder.

## Inputs

Take a target argument from the user. Acceptable forms:

- A folder path: `client/src/components/projects/`
- A single file: `client/src/components/projects/ProjectsSection.tsx`
- A feature name: "projects" → resolves to `client/src/components/projects/`
- Empty: ask the user which folder/feature to sweep — don't try to sweep the entire app in one pass (too large to review safely).

## Step 1 — Scan for missing dark variants

Walk the target folder and grep for Tailwind color classes that are missing a `dark:` sibling. The patterns to flag:

| Light class pattern | Should have a `dark:` sibling like… |
|---|---|
| `bg-white` | `dark:bg-gray-900` or `dark:bg-card` (depending on context) |
| `bg-gray-50` / `bg-gray-100` | `dark:bg-gray-800` / `dark:bg-gray-900` |
| `bg-blue-50` / `bg-red-50` / `bg-green-50` (any color-50/100 background) | `dark:bg-<color>-900/20` (the /20 alpha is the project standard for dark tinted backgrounds) |
| `text-gray-900` | `dark:text-gray-100` |
| `text-gray-700` | `dark:text-gray-300` |
| `text-gray-500` | `dark:text-gray-400` |
| `text-gray-600` | `dark:text-gray-300` or `dark:text-gray-400` (judgment call by context) |
| `border-gray-200` | `dark:border-gray-700` or `dark:border-gray-800` |
| `border-blue-200` / colored borders | `dark:border-<color>-800` |
| `divide-gray-200` | `dark:divide-gray-700` |
| `ring-gray-200` | `dark:ring-gray-700` |
| `shadow-*` | usually fine without a dark variant; but verify `shadow-sm` on white cards has `dark:` background underneath |

**Where to scan:** any `className="…"` attribute, plus `clsx(...)` / `cn(...)` / `cva(...)` argument blocks. Don't blindly regex — class names appear in template strings, conditional spreads, and constants. Use ripgrep with PCRE if needed.

**What to ignore:**
- The `ui/` shadcn primitives (`client/src/components/ui/*`) — they use CSS variables (`bg-card`, `text-foreground`, `border-border`) that already adapt via the `:where(.dark, .dark *)` selector in `index.css`. **Don't add `dark:` to CSS-variable classes.** Only flag `bg-card` etc. if there's a sibling hard-coded color (e.g. `bg-card text-gray-900` is wrong — the text should be `text-foreground`).
- Comments and string content (`<p>This is dark mode…</p>` doesn't need styling on the text).
- Tooltip/portal layers handled by Radix — they get the correct theme via context.

## Step 2 — Group findings by file and produce a fix plan

Output the audit as a table the user can scan:

```
File: client/src/components/projects/ProjectsSection.tsx
─────────────────────────────────────────────────────────
  Line 47  bg-white                  → add dark:bg-gray-900
  Line 89  text-gray-700             → add dark:text-gray-300
  Line 134 border-blue-200           → add dark:border-blue-800
  Line 201 bg-red-50 text-red-700    → add dark:bg-red-900/20 dark:text-red-300

File: client/src/components/projects/ProjectBoard.tsx
─────────────────────────────────────────────────────
  Line 12  bg-gray-100               → add dark:bg-gray-800
  …
```

If the count is small (≤ 30 changes), apply automatically and report what changed.

If the count is large (> 30 changes) or any change feels semantically risky (e.g., a status badge where the color carries meaning beyond decoration), **show the plan first and ask the user to confirm** before applying.

## Step 3 — Apply the fixes

Use the Edit tool to insert the `dark:` variant **adjacent** to its light counterpart, preserving the existing class order:

```tsx
// Before
className="bg-white text-gray-900 border-gray-200 rounded-lg p-4"

// After
className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-700 rounded-lg p-4"
```

**Conventions:**
- Each `dark:` variant immediately follows its light sibling — don't bunch them all at the end.
- Prefer the project's documented pairs over inventing new ones. The `bg-<color>-50` → `dark:bg-<color>-900/20` and `text-<color>-700` → `dark:text-<color>-300` pairs are conventional.
- For badges/status pills with colored backgrounds, also flip the text-color contrast: `bg-amber-50 text-amber-800` → `bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300`.
- Charts: don't try to fix chart colors here — those flow through the `useChartTheme` hook (`@/hooks/useChartTheme`). Flag chart components as a separate concern.

## Step 4 — Verify after applying

After the edits, run a final scan of the same target folder. Coverage should be near 100% on the patterns flagged in Step 1. Report:

- ✅ Files touched: N
- ✅ Total class additions: N `dark:` variants
- ✅ Coverage on this folder: X% → 100% (or whatever the residual is)
- ⚠️ Files that still have non-standard color usage (custom hex codes, `style={{color: '#fff'}}`, etc.) — flag for manual review, don't try to fix.

## Step 5 — Suggest follow-up tests

Tell the user to:
- Toggle the theme via the theme toggle in the sidebar and visually inspect the changed components.
- For any component with conditional rendering (modals, drawers, error states), check both the open and closed states.
- If the changed area has Storybook or visual regression tests, run those.

## Anti-patterns to avoid

- ❌ Don't apply `dark:` to CSS-variable classes (`bg-card`, `text-foreground`, `border-border`) — they already adapt.
- ❌ Don't add `dark:` to non-color classes (`p-4`, `rounded-lg`, `flex`) — they don't change with theme.
- ❌ Don't change the light variant; only ADD the `dark:` counterpart.
- ❌ Don't sweep the entire `client/src/components/` tree in one shot — work folder by folder so review is tractable.
- ❌ Don't try to fix chart colors here — refer the user to `useChartTheme`.
- ❌ Don't change inline `style={{}}` color values — flag for manual review (could be a brand-color-driven component that intentionally bypasses theming).
