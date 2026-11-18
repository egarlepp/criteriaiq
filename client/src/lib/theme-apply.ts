// Applies a brand theme (Admin › Appearance › Theming) to the page by setting
// `--brand-<field>-light|dark` custom properties on <html>. index.css resolves
// `--brand-<field>` for the current light/dark mode and falls back to
// CriteriaIQ Classic for any property that is not set.
//
// The last applied colors are cached in localStorage so the next page load can
// paint the themed chrome before /api/themes/active answers (no flash of the
// Classic colors). The cache is a convenience only: every read and write is
// guarded, and the server's answer always wins.
import {
  THEME_COLOR_FIELDS,
  readableTextOn,
  withLogoVariantDefaults,
  withThemeDefaults,
  type LogoVariants,
  type ThemeColorField,
  type ThemeColors,
} from "@shared/theme-colors";

const CACHE_KEY = "criteriaiq.activeThemeColors";
const LOGO_CACHE_KEY = "criteriaiq.activeLogoVariants";

function cssName(field: ThemeColorField | "primaryForeground", mode: "light" | "dark"): string {
  const kebab = field.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  return `--brand-${kebab}-${mode}`;
}

let lastSignature: string | null = null;

/** Applies `colors`, or with `null` removes every brand property so CriteriaIQ Classic shows. */
export function applyThemeColors(colors: ThemeColors | null): void {
  if (typeof document === "undefined") return;
  const signature = colors ? JSON.stringify(colors) : "classic";
  if (signature === lastSignature) return;
  lastSignature = signature;

  const style = document.documentElement.style;
  for (const mode of ["light", "dark"] as const) {
    const suffix = mode === "light" ? "Light" : "Dark";
    for (const field of THEME_COLOR_FIELDS) {
      if (colors) style.setProperty(cssName(field, mode), colors[`${field}${suffix}`]);
      else style.removeProperty(cssName(field, mode));
    }
    // Button text follows the button color so it stays readable.
    if (colors) style.setProperty(cssName("primaryForeground", mode), readableTextOn(colors[`primary${suffix}`]));
    else style.removeProperty(cssName("primaryForeground", mode));
  }
}

/**
 * Picks which CriteriaIQ logo version the sidebar shows in each mode, through
 * `data-logo-light` / `data-logo-dark` on <html> (rules in index.css). With
 * `null` the attributes are removed and the navy/white default shows.
 */
export function applyLogoVariants(variants: LogoVariants | null): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (variants) {
    root.setAttribute("data-logo-light", variants.light);
    root.setAttribute("data-logo-dark", variants.dark);
  } else {
    root.removeAttribute("data-logo-light");
    root.removeAttribute("data-logo-dark");
  }
}

/** Applies and remembers the active theme (null colors = CriteriaIQ Classic) and logo versions. */
export function applyActiveTheme(colors: ThemeColors | null, logoVariants: LogoVariants | null = null): void {
  applyThemeColors(colors);
  applyLogoVariants(logoVariants);
  try {
    if (colors) window.localStorage.setItem(CACHE_KEY, JSON.stringify(colors));
    else window.localStorage.removeItem(CACHE_KEY);
    if (logoVariants) window.localStorage.setItem(LOGO_CACHE_KEY, JSON.stringify(logoVariants));
    else window.localStorage.removeItem(LOGO_CACHE_KEY);
  } catch {
    // Storage blocked (private window, policy): the theme still applies.
  }
}

/** Paints the last known active theme. Called once before React mounts. */
export function applyCachedTheme(): void {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (raw) applyThemeColors(withThemeDefaults(JSON.parse(raw) as Record<string, unknown>));
    const logoRaw = window.localStorage.getItem(LOGO_CACHE_KEY);
    if (logoRaw) applyLogoVariants(withLogoVariantDefaults(JSON.parse(logoRaw) as Record<string, unknown>));
  } catch {
    // Missing or unreadable cache: Classic shows until the server answers.
  }
}
