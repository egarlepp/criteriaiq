# Adding a New Language

CriteriaIQ ships with 6 supported languages today (en-US, fr-FR, de-DE, es-ES, pt-BR, it-IT). The system is designed so adding a 7th language is a small, safe operation. This document is the canonical procedure.

---

## What "adding a language" means

The minimum to make a new language usable in the app:

1. **Locale file exists** — `client/src/i18n/locales/<code>.json`. It can start empty (`{}`) while being translated on a branch, but it must hold every en-US key before it is added to the parity test and shipped.
2. **Locale registered** — added to `LOCALES` in `client/src/config/locales.ts` AND imported + wired into `client/src/i18n/index.ts`.
3. **Switcher updated automatically** — `LanguageSwitcher.tsx` reads from `LOCALES`, so no edits needed in the dropdown UI.
4. **Translation content written** — every en-US key translated (the diff snippet in [`i18n-sweep-plan.md`](../plans/i18n-sweep-plan.md) → "Translator hand-off" lists what is left).
5. **Parity test updated** — add the locale to `NON_ENGLISH_LOCALES` in `client/src/i18n/__tests__/locale-parity.test.ts`. From then on every new key must be translated into it in the same PR, like the other locales.

After step 5, every keyed string the app uses renders in the new language.

---

## Step-by-step procedure

For this example, we're adding **Japanese (ja-JP)**. Substitute your own locale code throughout.

### 1. Pick the canonical locale code

Use a `<lang>-<region>` BCP-47 code:

| Locale | Code | Simple code (used by i18next resource keys) |
|---|---|---|
| Japanese | `ja-JP` | `ja` |
| Mandarin (Simplified) | `zh-CN` | `zh` |
| Mandarin (Traditional, Taiwan) | `zh-TW` | `zh-TW` (override; both flavors share `zh` simple code so disambiguate explicitly) |
| Korean | `ko-KR` | `ko` |
| Dutch | `nl-NL` | `nl` |

The `simpleCode` is what i18next's `LanguageDetector` reports from the browser, and it's what `i18n.changeLanguage(...)` accepts. The full code is what we use for the JSON filename and the `<html lang>` attribute.

### 2. Create the locale JSON file

```bash
# Empty starter — i18next will fall back to en-US for every key
echo '{}' > client/src/i18n/locales/ja-JP.json

# Or, if you want to seed with the en-US tree so translators see the
# full key map in their editor (recommended for translator hand-off):
cp client/src/i18n/locales/en-US.json client/src/i18n/locales/ja-JP.json
```

If you choose the `cp` approach, the new file's values are still English text; translators overwrite them, and every value must be translated before the locale ships. **Do NOT prefix with `[TODO]` placeholders** — the parity test rejects them.

### 3. Register the locale in `client/src/config/locales.ts`

Append a row to the `LOCALES` array:

```ts
export const LOCALES = [
  { code: 'en-US', name: 'English',    flag: '🇺🇸', simpleCode: 'en' },
  { code: 'es-ES', name: 'Español',    flag: '🇪🇸', simpleCode: 'es' },
  { code: 'fr-FR', name: 'Français',   flag: '🇫🇷', simpleCode: 'fr' },
  { code: 'de-DE', name: 'Deutsch',    flag: '🇩🇪', simpleCode: 'de' },
  { code: 'it-IT', name: 'Italiano',   flag: '🇮🇹', simpleCode: 'it' },
  { code: 'pt-BR', name: 'Português',  flag: '🇧🇷', simpleCode: 'pt' },
  { code: 'ja-JP', name: '日本語',     flag: '🇯🇵', simpleCode: 'ja' }, // ← new row
] as const;
```

The `name` field is the **endonym** (the language's name in itself — `日本語`, not `"Japanese"`) so the dropdown is recognizable to native speakers. The `flag` is a regional flag emoji; for languages that span multiple regions (Spanish, Portuguese, Mandarin) pick the flag matching your largest user base, or use a globe emoji if neutrality matters.

### 4. Wire the locale into the i18next runtime

Edit `client/src/i18n/index.ts`:

```ts
// Add the import alongside the existing five
import jaJP from './locales/ja-JP.json';

// Add to the resources object
const resources = {
  en: { translation: enUS },
  fr: { translation: frFR },
  de: { translation: deDE },
  es: { translation: esES },
  pt: { translation: ptBR },
  it: { translation: itIT },
  ja: { translation: jaJP }, // ← new entry, keyed by simpleCode
};
```

**Important:** the resource key MUST be the `simpleCode` from `LOCALES`. The browser language detector returns simple codes (`'ja'`, not `'ja-JP'`), so the i18next resource has to be keyed that way.

If you also want to handle the full-code → simple-code mapping for users who arrive with a region-specific browser locale, add a row to the `localeMap` inside the `i18n.on('languageChanged', ...)` block in the same file:

```ts
const localeMap: Record<string, string> = {
  'en': 'en-US',
  'es': 'es-ES',
  'fr': 'fr-FR',
  'de': 'de-DE',
  'it': 'it-IT',
  'pt': 'pt-BR',
  'ja': 'ja-JP', // ← new mapping
};
```

This mapping drives the `<html lang>` attribute — important for accessibility (screen readers, browser hyphenation) and for SEO.

### 5. Verify before committing

```bash
# Type-check (the LOCALES tuple is `as const` so TS will catch a malformed entry)
npm run check

# Build (locale JSON is bundled at build time)
npm run build

# Smoke-test the language switcher in the browser
npm run dev
# Then in the running app: open the dropdown, pick the new language, navigate
# a few pages. Strings translated in the locale file should render; untranslated
# strings fall back to en-US automatically.
```

### 6. Commit

```bash
git add client/src/i18n/locales/ja-JP.json \
        client/src/config/locales.ts \
        client/src/i18n/index.ts

git commit -m "i18n: add Japanese (ja-JP) locale

Adds the locale file (seeded from en-US for translator visibility),
registers in LOCALES, wires into the i18next resource map.
Translation values still need to be filled in by a native reviewer —
see docs/plans/i18n-sweep-plan.md § 'Translator hand-off'."
```

### 7. Hand off to translators

Use the diff snippet from [`i18n-sweep-plan.md`](../plans/i18n-sweep-plan.md) to enumerate every key present in `en-US.json`. Send the batch to a translation vendor or native reviewer. When translations come back, replace each English value in the new locale file with the localized version, commit, and ship.

---

## What about RTL languages (Arabic, Hebrew, Farsi, Urdu)?

Right-to-left languages need additional work beyond the procedure above:

1. The `<html dir>` attribute needs to flip between `ltr` and `rtl` based on the active locale. Currently we don't manage `dir` at all — it stays `ltr`.
2. Layout components that hardcode `flex-row` (vs. `flex-row-reverse`), absolute positioning (`left-X` vs. `right-X`), and padding directions (`pl-X` vs. `pr-X`) need to use Tailwind's logical-property variants (`ms-X`, `me-X`, `start-X`, `end-X`) or a runtime `dir`-aware wrapper.
3. Icons that imply directionality (chevrons, arrow indicators) need a directional flip in RTL mode.

**Status:** RTL is **not currently supported.** Adding RTL is a separate, larger project. If you need to add an RTL language:

- Open a tracking task that scopes the layout audit (~estimated 2-day effort given the existing component count).
- Don't add the locale to `LOCALES` until the layout work is done — exposing an Arabic option that renders LTR is worse than not exposing it at all.

---

## Removing a language

Reverse the procedure: delete the JSON file, remove the `LOCALES` row, remove the `i18n/index.ts` import + resource entry + localeMap row, commit. Make sure no users had selected that language as their preference (it's stored in localStorage as `i18nextLng`); on next visit they'll fall back to en-US gracefully.

---

## See also

- [`language-translation.md`](./language-translation.md) — how the i18n system works (hooks, fallbacks, key naming).
- [`i18n-sweep-plan.md`](../plans/i18n-sweep-plan.md) — the rollout plan for converting existing components from hardcoded English to `t()` calls.
- `client/src/i18n/index.ts` — runtime wiring.
- `client/src/config/locales.ts` — the LOCALES tuple consumed by the language switcher.
- `client/src/components/shared/LanguageSwitcher.tsx` — the dropdown component (no edits needed for new languages — it auto-updates from LOCALES).
