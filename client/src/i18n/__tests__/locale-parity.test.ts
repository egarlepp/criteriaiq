// Locks the contract between the English source-of-truth (`en-US.json`)
// and the five translated locales.
//
// Lockstep rule: every key added to `en-US.json` is added to all five
// other locale files in the same PR, with a real translation. English
// copies and `[TODO]` values don't count. i18next's `fallbackLng: 'en'`
// is a safety net for a key someone forgot, not a workflow: before this
// gate, untranslated keys piled up until a batch PR had to translate
// 1,410 of them per locale at once.
//
// For every locale this checks:
//   1. Every en-US key exists in the locale.
//   2. The leaf type matches en-US (a string stays a string), so
//      i18next never hands an object to UI code that expects copy.
//   3. The `{{interpolation}}` variables match en-US. A translator who
//      drops or renames `{{count}}` would otherwise ship copy that
//      renders the literal placeholder or silently loses the value.
//   4. No `[TODO]` placeholder values.
//
// Keys a locale has that en-US lacks are not gated. They are usually
// dead keys left behind by a rename and are harmless at runtime.
import { describe, expect, it } from "vitest";

import enUS from "../locales/en-US.json";
import deDE from "../locales/de-DE.json";
import esES from "../locales/es-ES.json";
import frFR from "../locales/fr-FR.json";
import itIT from "../locales/it-IT.json";
import ptBR from "../locales/pt-BR.json";

type LocaleTree = { [key: string]: string | LocaleTree };

// JSON imports come back with a deeply-typed literal shape (every
// concrete key spelled out). That literal type doesn't overlap
// structurally with the recursive `LocaleTree` index signature, so
// a direct `as LocaleTree` triggers TS2352. Routing through
// `unknown` is the documented escape hatch (per the compiler's own
// "If this was intentional, convert the expression to 'unknown'
// first." hint) and keeps `npm test --typecheck` green regardless
// of which locale file changes shape next.
const NON_ENGLISH_LOCALES: ReadonlyArray<{ name: string; tree: LocaleTree }> = [
  { name: "de-DE", tree: deDE as unknown as LocaleTree },
  { name: "es-ES", tree: esES as unknown as LocaleTree },
  { name: "fr-FR", tree: frFR as unknown as LocaleTree },
  { name: "it-IT", tree: itIT as unknown as LocaleTree },
  { name: "pt-BR", tree: ptBR as unknown as LocaleTree },
];

function collectLeaves(
  tree: LocaleTree,
  prefix: string[] = [],
  out = new Map<string, unknown>(),
): Map<string, unknown> {
  for (const [key, value] of Object.entries(tree)) {
    const next = [...prefix, key];
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      collectLeaves(value as LocaleTree, next, out);
    } else {
      out.set(next.join("."), value);
    }
  }
  return out;
}

// Sorted, de-duplicated interpolation variable names. `{{count, number}}`
// style format suffixes are ignored — only the variable name matters.
function interpolationVars(value: string): string {
  const names = Array.from(value.matchAll(/\{\{\s*([\w.]+)[^}]*\}\}/g), (m) => m[1]);
  return Array.from(new Set(names)).sort().join(", ");
}

function failWith(locale: string, heading: string, rows: string[]): never {
  throw new Error(
    [`Locale ${locale}: ${heading} (${rows.length}):`, ...rows.map((r) => `  - ${r}`)].join("\n"),
  );
}

describe("i18n locale structure", () => {
  const english = collectLeaves(enUS as unknown as LocaleTree);

  it("English source-of-truth is non-empty", () => {
    expect(english.size).toBeGreaterThan(0);
  });

  for (const locale of NON_ENGLISH_LOCALES) {
    const translated = collectLeaves(locale.tree);

    it(`${locale.name} has every en-US key`, () => {
      const missing: string[] = [];
      english.forEach((_value, path) => {
        if (!translated.has(path)) missing.push(path);
      });
      if (missing.length > 0) {
        failWith(
          locale.name,
          "keys missing (add the translation to this locale in the same PR)",
          missing,
        );
      }
    });

    it(`${locale.name} translated keys keep the en-US leaf type`, () => {
      // Only string leaves are checked. A handful of legacy About-page
      // entries are arrays in en-US but newline-joined strings in the
      // locales; nothing reads them with `returnObjects`, so they are
      // out of scope here.
      const wrongType: string[] = [];
      translated.forEach((value, path) => {
        if (typeof english.get(path) === "string" && typeof value !== "string") {
          wrongType.push(path);
        }
      });
      if (wrongType.length > 0) {
        failWith(locale.name, "keys whose type differs from en-US", wrongType);
      }
    });

    it(`${locale.name} translated keys keep the en-US {{interpolation}} variables`, () => {
      const mismatched: string[] = [];
      translated.forEach((value, path) => {
        const source = english.get(path);
        if (typeof value !== "string" || typeof source !== "string") return;
        const want = interpolationVars(source);
        const got = interpolationVars(value);
        if (want !== got) {
          mismatched.push(`${path}: en-US {${want}} vs ${locale.name} {${got}}`);
        }
      });
      if (mismatched.length > 0) {
        failWith(locale.name, "interpolation variables differ from en-US", mismatched);
      }
    });

    it(`${locale.name} has no [TODO] placeholder values`, () => {
      const placeholders: string[] = [];
      translated.forEach((value, path) => {
        if (typeof value === "string" && value.includes("[TODO]")) placeholders.push(path);
      });
      if (placeholders.length > 0) {
        failWith(
          locale.name,
          "[TODO] placeholders (write the real translation instead)",
          placeholders,
        );
      }
    });
  }
});
