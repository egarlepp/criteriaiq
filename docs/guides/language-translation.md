# Language Translation System

This application uses i18next and react-i18next for internationalization, supporting multiple languages with a fallback to English. **For the active rollout plan and current coverage status, see [`i18n-sweep-plan.md`](../plans/i18n-sweep-plan.md).** This file documents the system itself.

## Current Supported Languages

- English (en-US) - Default/Fallback
- French (fr-FR) - Français
- German (de-DE) - Deutsch
- Spanish (es-ES) - Español
- Portuguese (pt-BR) - Português
- Italian (it-IT) - Italiano

i18next is configured with bare-language resource keys (`en`, `fr`, etc.); the regional codes only appear on filenames and the `<html lang>` attribute.

## Architecture

### File Structure
```
client/src/i18n/
├── index.ts                 # i18n configuration
└── locales/
    ├── en-US.json           # English translations (base)
    ├── fr-FR.json           # French translations
    ├── de-DE.json           # German translations
    ├── es-ES.json           # Spanish translations
    ├── pt-BR.json           # Portuguese translations
    └── it-IT.json           # Italian translations
```

### Key Components
- `LanguageSwitcher.tsx` - Dropdown component in header
- Translation keys organized hierarchically (e.g., `common.title`, `nav.dashboard`)
- Language persistence via localStorage
- Browser language auto-detection on first visit

## Adding New Languages

Follow [Adding a New Language](./adding-a-new-language.md). It is the maintained, step-by-step procedure (locale code, `client/src/config/locales.ts`, i18next wiring, verification and translator hand-off). The older steps that used to be here pointed at files that have since changed.

## Adding New Translation Keys

The convention is **lockstep**: every new key goes into all 6 locale files in the same PR, with real translations (never an English copy or `[TODO]`). `client/src/i18n/__tests__/locale-parity.test.ts` fails the build if any en-US key is missing from de-DE, es-ES, fr-FR, it-IT or pt-BR. The older "en-US only, translate in batches" convention and the `[TODO] English` placeholder workflow are both retired.

1. **Add the key to `en-US.json`**
   ```json
   {
     "newSection": {
       "newKey": "English Text"
     }
   }
   ```

2. **Use in Components**
   ```typescript
   import { useTranslation } from 'react-i18next';

   function MyComponent() {
     const { t } = useTranslation();
     return <div>{t('newSection.newKey')}</div>;
   }
   ```

3. **Add the translated key to the other 5 locale files in the same PR** — `de-DE.json`, `es-ES.json`, `fr-FR.json`, `it-IT.json`, `pt-BR.json` — at the same nested path, keeping every `{{variable}}` unchanged. `npx vitest run client/src/i18n/__tests__/locale-parity.test.ts` lists anything missing.

4. **Add the file to `.i18n-allowlist.txt`** if you've fully wrapped a component in `t()` calls. The build gate (`npm run lint:i18n`) verifies allowlisted files stay clean — see "Build-time enforcement" below.

## Key Naming Convention

Use hierarchical, descriptive keys:
- `common.save` - Common UI elements
- `nav.dashboard` - Navigation items
- `forms.validation.required` - Form validation
- `errors.network` - Error messages
- `users.firstName` - User-related terms
- `layout.<component>.<field>` - Layout chrome (sidebar, banners, headers)

## Build-time enforcement

A ratcheting allowlist (`.i18n-allowlist.txt` at the repo root) gates which components are strict-checked for hardcoded English strings. The strategy avoids a day-one breakage where ~92% of components would fail an across-the-board strict gate.

- **Lint script:** `scripts/check-i18n-coverage.ts`, wired as `npm run lint:i18n` and folded into the production `npm run build` pipeline.
- **What it checks:** for each path in `.i18n-allowlist.txt`, verifies the file imports `useTranslation` from `react-i18next` and contains no obviously-hardcoded English in JSX text nodes, common English-bearing JSX attributes (`placeholder`, `title`, `aria-label`, `alt`, `label`), or string literals passed positionally to toast helpers.
- **Status line:** every successful run prints `OK: i18n allowlist coverage — N of M components (X.X%) fully i18n'd. 0 violations.` That percentage is the single number to chart over time.
- **The list only grows.** As a component is wrapped in `t()`, append its path to `.i18n-allowlist.txt`. New components are exempt by default until added.

When the allowlist covers ~80% of `client/src/components/**/*.tsx`, invert the gate (allowlist becomes a `.i18n-exempt.txt` of legacy hold-outs and every other file is strict-checked by default). See `i18n-sweep-plan.md` for the rollout plan and folder-by-folder priority.

## Tooling: `/i18n-extract` skill

The `.claude/skills/i18n-extract/SKILL.md` skill automates the most common chip-away operation. Run it on a single file or folder; it wraps JSX text + the four English-bearing attributes + toast helper calls in `t()`, picks namespace keys following the existing convention, appends them to `en-US.json`, and reports the count of new strings.

## Features

### Language Persistence
- Selected language stored in localStorage
- Automatically restored on page reload
- Falls back to browser language if no preference set

### Fallback System
- Missing keys automatically fall back to English
- Console warnings for missing translations in development
- Graceful degradation ensures app never breaks

### Accessibility
- Proper ARIA labels on language switcher
- HTML lang attribute updates automatically
- Screen reader friendly

## Testing Checklist

### Basic Functionality
- [ ] Language dropdown appears in header (top-right)
- [ ] All supported languages listed in dropdown
- [ ] Current language highlighted in dropdown
- [ ] Clicking language immediately updates all visible text
- [ ] No page reload required for language changes

### Persistence & Navigation
- [ ] Selected language persists after browser refresh
- [ ] Language preference maintained across different pages/routes
- [ ] Back/forward browser navigation preserves language choice
- [ ] New tab/window respects language preference

### Fallback Behavior
- [ ] Missing translation keys display English text
- [ ] Console warnings appear for missing keys (development mode)
- [ ] App remains functional when translations incomplete
- [ ] No JavaScript errors in console

### Accessibility
- [ ] Language switcher accessible via keyboard navigation
- [ ] Screen reader announces language changes
- [ ] HTML lang attribute updates when switching languages
- [ ] Focus management works correctly

### Cross-Browser Testing
- [ ] Chrome/Chromium
- [ ] Firefox  
- [ ] Safari
- [ ] Edge

### Mobile Responsiveness
- [ ] Language dropdown works on mobile devices
- [ ] Touch interactions function correctly
- [ ] Layout remains intact across languages

### Performance
- [ ] No noticeable delay when switching languages
- [ ] Language files load efficiently
- [ ] No memory leaks during language switches

## Development Notes

- All placeholder translations are currently in English
- Professional human translation should replace placeholder content
- Console warnings help identify missing translation keys
- Language detection follows browser preferences
- Supports RTL languages (configuration needed)

## Troubleshooting

### Language Not Switching
1. Check browser console for JavaScript errors
2. Verify translation keys exist in target language file
3. Ensure language code matches between files and LanguageSwitcher

### Missing Translations
1. Check console for missing key warnings
2. Verify key exists in en.json (fallback)
3. Add missing keys to target language files

### Performance Issues
1. Check network tab for failed resource loads
2. Verify all language imports in i18n/index.ts
3. Consider lazy loading for large translation files

## Full-Site i18n Conversion Project

For the comprehensive plan to convert the entire CriteriaIQ application to use the i18n system, including scope analysis, phased implementation plan, coverage audit, and effort estimates, see:

**[docs/plans/i18n-sweep-plan.md](../plans/i18n-sweep-plan.md)**

## Recent changes

- **Ratcheting build gate added:** `.i18n-allowlist.txt` + `npm run lint:i18n` (script `scripts/check-i18n-coverage.ts`). Replaces the "propagate `[TODO]` placeholders into every locale" workflow that was producing drift.
- **Lockstep convention (Phase 1, PR 9):** every new key lands in all 6 locale files in the same PR; the locale parity test fails the build on a missing key. This replaced the earlier en-US-only write convention.
- **Layout banners i18n'd:** `ExcludedScreenNotice`, `PersonaBanner`, `SidebarDemoIndicator`, `DataDirReadOnlyBanner`, `EnvSourceWarningBanner` (5 of the 8 layout chrome components). Plus `FieldSourceBadge` and `PasswordRuleChecklist`. Current allowlist coverage: 7 of 297 components (~2.4%) — run `npm run lint:i18n` for the live number.

For the running plan and priority order of the next folders to convert, see [`i18n-sweep-plan.md`](../plans/i18n-sweep-plan.md).