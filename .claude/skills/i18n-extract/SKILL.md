---
name: i18n-extract
description: Wrap hardcoded English strings in CriteriaIQ React components with `t()` calls, generate translation keys following existing namespace conventions, and add every new key to en-US.json and, with a real translation, to the other 5 locale files in the same pass (never [TODO] or English copies — the parity test fails the build on a missing key). After running, append the file path to .i18n-allowlist.txt. Use when the user says "i18n this file", "extract strings in X for translation", "wrap with t()", or wants to bring a component up to the project's i18n standard.
---

# i18n-extract — convert hardcoded English to react-i18next keys

CriteriaIQ supports **6 languages** (en-US, pt-BR, fr-FR, es-ES, de-DE, it-IT) via i18next + react-i18next. Strict-checked adoption is currently ~42% of components (188 of 452) per the `.i18n-allowlist.txt` ratchet — run `npm run lint:i18n` for the live number. This skill helps close that gap one component at a time.

## Inputs

Take a target argument:
- A single file: `client/src/components/projects/ProjectsSection.tsx`
- A folder: `client/src/components/accounts/`
- Empty: ask the user. Don't try to i18n the whole app in one pass.

If the user gives a folder, process its files one at a time and report progress.

## Step 0 — Locate the translation files

Translation source-of-truth files live in (verify before edit — paths may have shifted):
- `client/src/i18n/locales/en-US.json` (or `client/src/locales/`, or `public/locales/en-US/translation.json` — check the project's i18next config in `client/src/main.tsx` or `client/src/i18n/`)
- Five sibling files: `pt-BR.json`, `fr-FR.json`, `es-ES.json`, `de-DE.json`, `it-IT.json`

Open `en-US.json` first to learn the existing namespace structure (`common.*`, `projects.*`, `accounts.*`, `auth.*`, etc.). New keys must extend the existing namespaces — don't invent parallel ones.

## Step 1 — Scan the target file for hardcoded English

Patterns to flag:

1. **JSX text nodes** — visible English content rendered inside elements:
   ```tsx
   <h1>Projects Dashboard</h1>
   <p>You have no active projects.</p>
   ```

2. **Common attributes** with user-visible English:
   - `placeholder="Search projects..."`
   - `title="Edit project"`
   - `aria-label="Open menu"`
   - `alt="Logo"`
   - `label="..."` (often via shadcn FormField)

3. **String literals passed to UI helpers**:
   - `toast({ title: "Saved", description: "Your changes are saved." })`
   - `showSuccessToast("Saved", "Your changes are saved.")`
   - `confirm({ title: "Delete project?", description: "..." })`
   - Button labels passed as props: `<Button>Save</Button>`

4. **Pluralizations and interpolations** — strings with variables or counts:
   ```tsx
   <span>{count} projects selected</span>
   <p>Welcome back, {user.firstName}!</p>
   ```

**What to ignore:**
- Code identifiers, prop names, route paths, API URLs, CSS class names.
- Console logs, error.message, dev-only strings.
- Strings passed to non-UI APIs (`new Date('…')`, `parseInt('…', 10)`, color hex codes).
- Strings that are clearly identifiers used by the backend (status codes, role names that match DB enum values).
- Already-translated strings (anything already inside a `t('...')` call).

## Step 2 — Generate translation keys

For each flagged string, propose a key in the form `<namespace>.<descriptiveName>`:

| Hardcoded string | Proposed key |
|---|---|
| `"Projects Dashboard"` (in projects/ folder) | `projects.dashboard.title` |
| `"You have no active projects."` | `projects.dashboard.emptyState` |
| `"Search projects..."` (placeholder) | `projects.search.placeholder` |
| `"Edit project"` (button title) | `common.actions.edit` (if generic) or `projects.actions.edit` (if context-specific) |
| `"Save"` (button label) | `common.actions.save` |
| `"Welcome back, {{name}}!"` | `dashboard.welcome` (with `{ name: user.firstName }` interpolation) |
| `"{{count}} projects selected"` | `projects.list.selectedCount` (with i18next plural rules: `selectedCount`, `selectedCount_one`, `selectedCount_other`) |

**Conventions:**
- Namespaces follow folder names: `projects/`, `accounts/`, `dashboard/`, etc. Reuse existing namespaces when possible.
- Generic, app-wide strings (Save, Cancel, Delete, Edit, Add, Close, OK) live under `common.actions.*` — search en-US.json for them first; they likely already exist.
- Generic UI patterns (Loading…, Error, No results found) live under `common.states.*`.
- Keys are **camelCase**, namespaces are **lowercase dot-segmented**.
- Don't over-segment: `projects.dashboard.header.title.text` is too deep. Three levels is the practical max.

## Step 3 — Wrap the JSX

Replace the hardcoded strings with `t()` calls. If the component doesn't already import `useTranslation`, add it:

```tsx
// At the top of the component
import { useTranslation } from "react-i18next";

// Inside the component body
const { t } = useTranslation();

// Replace:
<h1>Projects Dashboard</h1>

// With:
<h1>{t("projects.dashboard.title")}</h1>
```

**For interpolations:**
```tsx
// Before
<p>Welcome back, {user.firstName}!</p>

// After
<p>{t("dashboard.welcome", { name: user.firstName })}</p>
```

**For plurals (i18next standard):**
```tsx
// Before
<span>{count === 1 ? "1 project selected" : `${count} projects selected`}</span>

// After
<span>{t("projects.list.selectedCount", { count })}</span>
// Then in en-US.json:
//   "projects.list.selectedCount_one": "{{count}} project selected"
//   "projects.list.selectedCount_other": "{{count}} projects selected"
```

**For toast helpers:**
```tsx
// Before
showSuccessToast("Project saved", "Your changes have been persisted.");

// After
showSuccessToast(t("projects.actions.savedTitle"), t("projects.actions.savedDescription"));
```

## Step 4 — Append keys to en-US.json

Open `en-US.json`. For each new key:

- Insert into the correct nested namespace, alphabetically within that namespace if the file is alphabetized; otherwise grouped by feature.
- Preserve trailing commas and the existing JSON style (2-space indent, double quotes).
- For plurals, write both `_one` and `_other` variants.
- Don't touch keys that already exist — if a key collides, use the existing value (it may even mean your wrapping was redundant; verify).

After editing en-US.json, verify it parses as valid JSON: a stray comma or unbalanced brace breaks the entire app.

## Step 5 — Translate into the other 5 locales (same pass)

Every key added to `en-US.json` must also be added, at the same nested path, to `de-DE.json`, `es-ES.json`, `fr-FR.json`, `it-IT.json` and `pt-BR.json`, in the same change:

1. Write a real translation. Never an English copy, never a `[TODO]` value.
2. Keep every `{{variable}}` and `<tag>` exactly as in en-US, and write both plural variants (`_one` / `_other`).
3. Check how a neighbouring key was translated in that locale and reuse its terms, so wording stays consistent.
4. Leave a string untranslated only when it must stay literal (a phrase the code compares against, a product name).
5. Run `npx vitest run client/src/i18n/__tests__/locale-parity.test.ts`. It fails on a missing key, a changed `{{variable}}`, a wrong type or a `[TODO]` value.

Write the files with 2-space JSON indentation and UTF-8 characters (no `\u` escapes), matching the existing files.

## Step 6 — Final report

```
i18n-extract — <target file or folder>
─────────────────────────────────────
✅ Strings wrapped:        N
✅ Translation keys added: N (across N namespaces)
✅ en-US.json:             N new keys appended
🌐 Other locales:          N keys translated in each of de-DE, es-ES, fr-FR, it-IT, pt-BR
✅ Locale parity test:     passing

Component(s) i18n adoption: <before>% → 100% (for this file/folder)
```

## Anti-patterns to avoid

- ❌ Don't translate code identifiers, API endpoints, or DB enum values.
- ❌ Don't invent new namespaces when an existing one fits — extend the existing tree.
- ❌ Don't deep-nest beyond 3 levels (`projects.dashboard.title`, not `projects.views.dashboard.header.titleBar.text`).
- ❌ Don't break JSON validity — verify each locale file parses after editing.
- ❌ Don't forget plural variants for count-driven strings.
- ❌ Don't blindly wrap — strings that won't ever be shown to a user (debug logs, dev-only error messages, identifiers) shouldn't be translated.
- ❌ Don't mix `t()` and string concatenation — `t("hello") + ", " + name` breaks ordering in languages with different word order. Use interpolation: `t("hello", { name })`.
