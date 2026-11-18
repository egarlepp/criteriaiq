// Brand theme colors for Admin › Appearance › Theming.
//
// A theme recolors the app's chrome only: the header bar, the sidebar, the
// Admin menu, and Primary (buttons, switches, focus rings and the active
// sidebar item, through the shadcn `--primary` token). Page content keeps the
// shadcn tokens in index.css untouched, by design (Eric, 2026-10-16).
//
// Every field is a light/dark pair. The client writes them to
// `--brand-<field>-light|dark` custom properties on :root
// (client/src/lib/theme-apply.ts) and index.css resolves `--brand-<field>`
// for the current mode, falling back to the CriteriaIQ Classic values below
// when no theme is active.
//
// The presets are VectorIQ's set (same keys and values, also used by
// ImpactIQ) so the three apps offer the same starting points. VectorIQ has no
// header text, sidebar heading or Admin menu color, so `fromVectorIq` derives
// them: header text is whichever ink reads best on both header stops, the
// sidebar heading is VectorIQ's app-name color, and the Admin menu takes the
// sidebar's bottom color plus the sidebar's text, hover, highlight and border.

export const THEME_COLOR_FIELDS = [
  "primary",
  "topbarGradientFrom",
  "topbarGradientTo",
  "topbarText",
  "sidebarBgTop",
  "sidebarBgBottom",
  "sidebarHeading",
  "sidebarText",
  "navHoverBg",
  "sidebarHighlight",
  "sidebarActiveText",
  "sidebarBorder",
  "userPillName",
  "userPillSubtitle",
  "adminMenuBg",
  "adminMenuHeading",
  "adminMenuText",
  "adminMenuHoverBg",
  "adminMenuHighlight",
  "adminMenuActiveText",
  "adminMenuBorder",
] as const;

export type ThemeColorField = (typeof THEME_COLOR_FIELDS)[number];
export type ThemeColorMode = "light" | "dark";
export type ThemeColorKey = `${ThemeColorField}${"Light" | "Dark"}`;
export type ThemeColors = Record<ThemeColorKey, string>;

export const THEME_COLOR_KEYS: ThemeColorKey[] = THEME_COLOR_FIELDS.flatMap((field) => [
  `${field}Light` as ThemeColorKey,
  `${field}Dark` as ThemeColorKey,
]);

/** Editor sections, in order. Labels are `appearance.theming.groups.<id>`. */
export const THEME_FIELD_GROUPS: Array<{ id: string; fields: ThemeColorField[] }> = [
  { id: "accents", fields: ["primary"] },
  { id: "header", fields: ["topbarGradientFrom", "topbarGradientTo", "topbarText"] },
  {
    id: "sidebar",
    fields: [
      "sidebarBgTop", "sidebarBgBottom", "sidebarHeading", "sidebarText", "navHoverBg",
      "sidebarHighlight", "sidebarActiveText", "sidebarBorder", "userPillName", "userPillSubtitle",
    ],
  },
  {
    id: "adminMenu",
    fields: [
      "adminMenuBg", "adminMenuHeading", "adminMenuText", "adminMenuHoverBg",
      "adminMenuHighlight", "adminMenuActiveText", "adminMenuBorder",
    ],
  },
];

export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** "#2D6EE6" style color, the only format a theme stores. */
export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR_RE.test(value);
}

/**
 * CriteriaIQ Classic: today's look (navy header gradient, white sidebar,
 * #001cab headings). Also the CSS fallback when no theme is active, so these
 * values must match index.css.
 */
export const CLASSIC_COLORS: ThemeColors = {
  primaryLight: "#2D6EE6", primaryDark: "#3C83F6",
  topbarGradientFromLight: "#050B39", topbarGradientFromDark: "#050B39",
  topbarGradientToLight: "#001CAB", topbarGradientToDark: "#001CAB",
  topbarTextLight: "#FFFFFF", topbarTextDark: "#FFFFFF",
  sidebarBgTopLight: "#FFFFFF", sidebarBgTopDark: "#1F2937",
  sidebarBgBottomLight: "#FFFFFF", sidebarBgBottomDark: "#1F2937",
  sidebarHeadingLight: "#001CAB", sidebarHeadingDark: "#93C5FD",
  sidebarTextLight: "#374151", sidebarTextDark: "#D1D5DB",
  navHoverBgLight: "#F3F4F6", navHoverBgDark: "#374151",
  sidebarHighlightLight: "#DBEAFE", sidebarHighlightDark: "#1F3058",
  sidebarActiveTextLight: "#1D4ED8", sidebarActiveTextDark: "#60A5FA",
  sidebarBorderLight: "#E5E7EB", sidebarBorderDark: "#374151",
  userPillNameLight: "#111827", userPillNameDark: "#F3F4F6",
  userPillSubtitleLight: "#6B7280", userPillSubtitleDark: "#9CA3AF",
  adminMenuBgLight: "#F9FAFB", adminMenuBgDark: "#111827",
  adminMenuHeadingLight: "#111827", adminMenuHeadingDark: "#F3F4F6",
  adminMenuTextLight: "#374151", adminMenuTextDark: "#D1D5DB",
  adminMenuHoverBgLight: "#F3F4F6", adminMenuHoverBgDark: "#374151",
  adminMenuHighlightLight: "#DBEAFE", adminMenuHighlightDark: "#1F3058",
  adminMenuActiveTextLight: "#1D4ED8", adminMenuActiveTextDark: "#60A5FA",
  adminMenuBorderLight: "#E5E7EB", adminMenuBorderDark: "#374151",
};

/**
 * The Admin menu once took its text, hover, highlight and border colors from
 * the sidebar. A theme saved before it had its own fields keeps that look:
 * each missing Admin menu field copies the theme's sidebar field.
 */
const ADMIN_MENU_SOURCES: Partial<Record<ThemeColorField, ThemeColorField>> = {
  adminMenuHeading: "userPillName",
  adminMenuText: "sidebarText",
  adminMenuHoverBg: "navHoverBg",
  adminMenuHighlight: "sidebarHighlight",
  adminMenuActiveText: "sidebarActiveText",
  adminMenuBorder: "sidebarBorder",
};

/**
 * Fills any missing or malformed field from CriteriaIQ Classic, except the
 * Admin menu fields above, which follow the theme's own sidebar.
 */
export function withThemeDefaults(colors?: Partial<Record<string, unknown>> | null): ThemeColors {
  const result = { ...CLASSIC_COLORS };
  if (!colors) return result;
  for (const key of THEME_COLOR_KEYS) {
    const value = colors[key];
    if (isHexColor(value)) result[key] = value.toUpperCase();
  }
  for (const [field, source] of Object.entries(ADMIN_MENU_SOURCES) as Array<[ThemeColorField, ThemeColorField]>) {
    for (const suffix of ["Light", "Dark"] as const) {
      const key = `${field}${suffix}` as ThemeColorKey;
      if (!isHexColor(colors[key])) result[key] = result[`${source}${suffix}`];
    }
  }
  return result;
}

// ─── contrast ────────────────────────────────────────────────────────────────

export const LIGHT_INK = "#FFFFFF";
export const DARK_INK = "#0F172A";

function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG contrast ratio between two hex colors (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  if (!isHexColor(a) || !isHexColor(b)) return 21;
  const la = relativeLuminance(a) + 0.05;
  const lb = relativeLuminance(b) + 0.05;
  return la > lb ? la / lb : lb / la;
}

/** The ink (white or near-black) with the best worst-case contrast on every background given. */
export function readableTextOn(...backgrounds: string[]): string {
  const worst = (ink: string) => Math.min(...backgrounds.map((bg) => contrastRatio(ink, bg)));
  return worst(LIGHT_INK) >= worst(DARK_INK) ? LIGHT_INK : DARK_INK;
}

/** WCAG AA for normal text. */
export const MIN_TEXT_CONTRAST = 4.5;

/**
 * Text-on-background pairs the editor checks, per mode. A pair under
 * MIN_TEXT_CONTRAST shows a warning; it never blocks saving.
 */
export const CONTRAST_CHECKS: Array<{ text: ThemeColorField; backgrounds: ThemeColorField[] }> = [
  { text: "topbarText", backgrounds: ["topbarGradientFrom", "topbarGradientTo"] },
  { text: "sidebarText", backgrounds: ["sidebarBgTop", "sidebarBgBottom"] },
  { text: "sidebarActiveText", backgrounds: ["sidebarHighlight"] },
  { text: "userPillName", backgrounds: ["sidebarBgBottom"] },
  { text: "adminMenuText", backgrounds: ["adminMenuBg"] },
  { text: "adminMenuHeading", backgrounds: ["adminMenuBg"] },
  { text: "adminMenuActiveText", backgrounds: ["adminMenuHighlight"] },
];

export interface ContrastIssue {
  text: ThemeColorField;
  background: ThemeColorField;
  mode: ThemeColorMode;
  ratio: number;
}

export function findContrastIssues(colors: ThemeColors): ContrastIssue[] {
  const issues: ContrastIssue[] = [];
  for (const mode of ["light", "dark"] as const) {
    const suffix = mode === "light" ? "Light" : "Dark";
    for (const check of CONTRAST_CHECKS) {
      for (const bg of check.backgrounds) {
        const ratio = contrastRatio(colors[`${check.text}${suffix}`], colors[`${bg}${suffix}`]);
        if (ratio < MIN_TEXT_CONTRAST) issues.push({ text: check.text, background: bg, mode, ratio });
      }
    }
  }
  return issues;
}

// ─── CriteriaIQ logo variant ─────────────────────────────────────────────────

/**
 * The sidebar shows the CriteriaIQ logo in one of two bundled versions:
 * `dark_text` (navy wordmark, for light sidebars) or `light_text` (white
 * wordmark, for dark sidebars). Admin › Appearance › Media sets which one each
 * mode uses; a theme can override either mode, so a theme with a dark sidebar
 * in light mode can still show a readable logo.
 */
export const LOGO_VARIANTS = ["dark_text", "light_text"] as const;
export type LogoVariant = (typeof LOGO_VARIANTS)[number];
export type LogoVariants = Record<ThemeColorMode, LogoVariant>;

/** Today's behavior: navy logo in light mode, white logo in dark mode. */
export const DEFAULT_LOGO_VARIANTS: LogoVariants = { light: "dark_text", dark: "light_text" };

export function isLogoVariant(value: unknown): value is LogoVariant {
  return typeof value === "string" && (LOGO_VARIANTS as readonly string[]).includes(value);
}

/** Fills a missing or unknown mode from DEFAULT_LOGO_VARIANTS. */
export function withLogoVariantDefaults(value?: Partial<Record<string, unknown>> | null): LogoVariants {
  return {
    light: isLogoVariant(value?.light) ? value.light : DEFAULT_LOGO_VARIANTS.light,
    dark: isLogoVariant(value?.dark) ? value.dark : DEFAULT_LOGO_VARIANTS.dark,
  };
}

/** The logo version that reads best on the sidebar's background in `mode`. */
export function suggestedLogoVariant(colors: ThemeColors, mode: ThemeColorMode): LogoVariant {
  const suffix = mode === "light" ? "Light" : "Dark";
  const ink = readableTextOn(colors[`sidebarBgTop${suffix}`], colors[`sidebarBgBottom${suffix}`]);
  return ink === LIGHT_INK ? "light_text" : "dark_text";
}

export function suggestedLogoVariants(colors: ThemeColors): LogoVariants {
  return { light: suggestedLogoVariant(colors, "light"), dark: suggestedLogoVariant(colors, "dark") };
}

/**
 * The logo each mode actually shows: the theme's own choice when it has one,
 * otherwise the Media setting.
 */
export function resolveLogoVariants(
  theme: { logoVariantLight?: string | null; logoVariantDark?: string | null } | null | undefined,
  media: LogoVariants,
): LogoVariants {
  return {
    light: isLogoVariant(theme?.logoVariantLight) ? theme.logoVariantLight : media.light,
    dark: isLogoVariant(theme?.logoVariantDark) ? theme.logoVariantDark : media.dark,
  };
}

// ─── presets ─────────────────────────────────────────────────────────────────

type VectorIqField =
  | "primary" | "topbarGradientFrom" | "topbarGradientTo" | "sidebarBgTop" | "sidebarBgBottom"
  | "sidebarText" | "sidebarActiveText" | "sidebarHighlight" | "sidebarBorder" | "navHoverBg"
  | "userPillName" | "userPillSubtitle" | "appName";
type VectorIqColors = Record<`${VectorIqField}${"Light" | "Dark"}`, string>;

function fromVectorIq(v: VectorIqColors): ThemeColors {
  return {
    primaryLight: v.primaryLight, primaryDark: v.primaryDark,
    topbarGradientFromLight: v.topbarGradientFromLight, topbarGradientFromDark: v.topbarGradientFromDark,
    topbarGradientToLight: v.topbarGradientToLight, topbarGradientToDark: v.topbarGradientToDark,
    topbarTextLight: readableTextOn(v.topbarGradientFromLight, v.topbarGradientToLight),
    topbarTextDark: readableTextOn(v.topbarGradientFromDark, v.topbarGradientToDark),
    sidebarBgTopLight: v.sidebarBgTopLight, sidebarBgTopDark: v.sidebarBgTopDark,
    sidebarBgBottomLight: v.sidebarBgBottomLight, sidebarBgBottomDark: v.sidebarBgBottomDark,
    sidebarHeadingLight: v.appNameLight, sidebarHeadingDark: v.appNameDark,
    sidebarTextLight: v.sidebarTextLight, sidebarTextDark: v.sidebarTextDark,
    navHoverBgLight: v.navHoverBgLight, navHoverBgDark: v.navHoverBgDark,
    sidebarHighlightLight: v.sidebarHighlightLight, sidebarHighlightDark: v.sidebarHighlightDark,
    sidebarActiveTextLight: v.sidebarActiveTextLight, sidebarActiveTextDark: v.sidebarActiveTextDark,
    sidebarBorderLight: v.sidebarBorderLight, sidebarBorderDark: v.sidebarBorderDark,
    userPillNameLight: v.userPillNameLight, userPillNameDark: v.userPillNameDark,
    userPillSubtitleLight: v.userPillSubtitleLight, userPillSubtitleDark: v.userPillSubtitleDark,
    adminMenuBgLight: v.sidebarBgBottomLight, adminMenuBgDark: v.sidebarBgBottomDark,
    adminMenuHeadingLight: v.userPillNameLight, adminMenuHeadingDark: v.userPillNameDark,
    adminMenuTextLight: v.sidebarTextLight, adminMenuTextDark: v.sidebarTextDark,
    adminMenuHoverBgLight: v.navHoverBgLight, adminMenuHoverBgDark: v.navHoverBgDark,
    adminMenuHighlightLight: v.sidebarHighlightLight, adminMenuHighlightDark: v.sidebarHighlightDark,
    adminMenuActiveTextLight: v.sidebarActiveTextLight, adminMenuActiveTextDark: v.sidebarActiveTextDark,
    adminMenuBorderLight: v.sidebarBorderLight, adminMenuBorderDark: v.sidebarBorderDark,
  };
}

export interface ThemePreset {
  /** Label is `appearance.theming.presets.<key>`. */
  key: string;
  colors: ThemeColors;
}

export const THEME_PRESETS: ThemePreset[] = [
  { key: "criteriaiq_classic", colors: CLASSIC_COLORS },
  {
    key: "midnight_slate",
    colors: fromVectorIq({
      primaryLight: "#4F46E5", primaryDark: "#818CF8",
      topbarGradientFromLight: "#FFFFFF", topbarGradientFromDark: "#020617",
      topbarGradientToLight: "#EEF2FF", topbarGradientToDark: "#1E1B4B",
      sidebarBgTopLight: "#FFFFFF", sidebarBgTopDark: "#0F172A",
      sidebarBgBottomLight: "#EEF2FF", sidebarBgBottomDark: "#020617",
      sidebarTextLight: "#334155", sidebarTextDark: "#CBD5E1",
      sidebarActiveTextLight: "#3730A3", sidebarActiveTextDark: "#E0E7FF",
      sidebarHighlightLight: "#C7D2FE", sidebarHighlightDark: "#312E81",
      sidebarBorderLight: "#E2E8F0", sidebarBorderDark: "#1E293B",
      navHoverBgLight: "#E0E7FF", navHoverBgDark: "#1E293B",
      userPillNameLight: "#0F172A", userPillNameDark: "#F1F5F9",
      userPillSubtitleLight: "#475569", userPillSubtitleDark: "#94A3B8",
      appNameLight: "#4338CA", appNameDark: "#A5B4FC",
    }),
  },
  {
    key: "warm_neutral",
    colors: fromVectorIq({
      primaryLight: "#C2410C", primaryDark: "#FB923C",
      topbarGradientFromLight: "#FFFFFF", topbarGradientFromDark: "#0C0A09",
      topbarGradientToLight: "#FFF7ED", topbarGradientToDark: "#431407",
      sidebarBgTopLight: "#FFFFFF", sidebarBgTopDark: "#1C1917",
      sidebarBgBottomLight: "#FFF7ED", sidebarBgBottomDark: "#0C0A09",
      sidebarTextLight: "#44403C", sidebarTextDark: "#D6D3D1",
      sidebarActiveTextLight: "#9A3412", sidebarActiveTextDark: "#FFEDD5",
      sidebarHighlightLight: "#FED7AA", sidebarHighlightDark: "#7C2D12",
      sidebarBorderLight: "#E7E5E4", sidebarBorderDark: "#292524",
      navHoverBgLight: "#FFEDD5", navHoverBgDark: "#292524",
      userPillNameLight: "#1C1917", userPillNameDark: "#FAFAF9",
      userPillSubtitleLight: "#57534E", userPillSubtitleDark: "#A8A29E",
      appNameLight: "#C2410C", appNameDark: "#FDBA74",
    }),
  },
  {
    key: "forest_green",
    colors: fromVectorIq({
      primaryLight: "#15803D", primaryDark: "#4ADE80",
      topbarGradientFromLight: "#FFFFFF", topbarGradientFromDark: "#07110C",
      topbarGradientToLight: "#F0FDF4", topbarGradientToDark: "#052E16",
      sidebarBgTopLight: "#FFFFFF", sidebarBgTopDark: "#0F1F17",
      sidebarBgBottomLight: "#F0FDF4", sidebarBgBottomDark: "#07110C",
      sidebarTextLight: "#3F4E3E", sidebarTextDark: "#CBD8C8",
      sidebarActiveTextLight: "#14532D", sidebarActiveTextDark: "#DCFCE7",
      sidebarHighlightLight: "#BBF7D0", sidebarHighlightDark: "#14532D",
      sidebarBorderLight: "#DCE7DA", sidebarBorderDark: "#17301F",
      navHoverBgLight: "#DCFCE7", navHoverBgDark: "#17301F",
      userPillNameLight: "#14251A", userPillNameDark: "#F1F5EF",
      userPillSubtitleLight: "#4B5B4A", userPillSubtitleDark: "#9CB09A",
      appNameLight: "#15803D", appNameDark: "#86EFAC",
    }),
  },
  {
    key: "ocean_blue",
    colors: fromVectorIq({
      primaryLight: "#0369A1", primaryDark: "#38BDF8",
      topbarGradientFromLight: "#FFFFFF", topbarGradientFromDark: "#06121F",
      topbarGradientToLight: "#E0F2FE", topbarGradientToDark: "#082F49",
      sidebarBgTopLight: "#FFFFFF", sidebarBgTopDark: "#0B1E30",
      sidebarBgBottomLight: "#F0F9FF", sidebarBgBottomDark: "#06121F",
      sidebarTextLight: "#334E68", sidebarTextDark: "#CBDCEB",
      sidebarActiveTextLight: "#075985", sidebarActiveTextDark: "#E0F2FE",
      sidebarHighlightLight: "#BAE6FD", sidebarHighlightDark: "#0C4A6E",
      sidebarBorderLight: "#D6E6F2", sidebarBorderDark: "#102A42",
      navHoverBgLight: "#E0F2FE", navHoverBgDark: "#102A42",
      userPillNameLight: "#0C4A6E", userPillNameDark: "#F0F9FF",
      userPillSubtitleLight: "#486581", userPillSubtitleDark: "#9FB3C8",
      appNameLight: "#0369A1", appNameDark: "#7DD3FC",
    }),
  },
  {
    key: "purple",
    colors: fromVectorIq({
      primaryLight: "#7C3AED", primaryDark: "#A78BFA",
      topbarGradientFromLight: "#FFFFFF", topbarGradientFromDark: "#0E0A18",
      topbarGradientToLight: "#F5F3FF", topbarGradientToDark: "#2E1065",
      sidebarBgTopLight: "#FFFFFF", sidebarBgTopDark: "#1A1528",
      sidebarBgBottomLight: "#F5F3FF", sidebarBgBottomDark: "#0E0A18",
      sidebarTextLight: "#4B3B5C", sidebarTextDark: "#D9CFEA",
      sidebarActiveTextLight: "#5B21B6", sidebarActiveTextDark: "#EDE9FE",
      sidebarHighlightLight: "#DDD6FE", sidebarHighlightDark: "#4C1D95",
      sidebarBorderLight: "#E9E3F7", sidebarBorderDark: "#251D38",
      navHoverBgLight: "#EDE9FE", navHoverBgDark: "#251D38",
      userPillNameLight: "#2E1065", userPillNameDark: "#F5F3FF",
      userPillSubtitleLight: "#6B5B80", userPillSubtitleDark: "#A99BC0",
      appNameLight: "#6D28D9", appNameDark: "#C4B5FD",
    }),
  },
  {
    key: "darker_purple",
    colors: fromVectorIq({
      primaryLight: "#5B21B6", primaryDark: "#8B5CF6",
      topbarGradientFromLight: "#FFFFFF", topbarGradientFromDark: "#0F0820",
      topbarGradientToLight: "#EDE9FE", topbarGradientToDark: "#2E1065",
      sidebarBgTopLight: "#F5F3FF", sidebarBgTopDark: "#1E1036",
      sidebarBgBottomLight: "#EDE9FE", sidebarBgBottomDark: "#0F0820",
      sidebarTextLight: "#3B2A5C", sidebarTextDark: "#DCD0F0",
      sidebarActiveTextLight: "#3B0764", sidebarActiveTextDark: "#F5F3FF",
      sidebarHighlightLight: "#C4B5FD", sidebarHighlightDark: "#5B21B6",
      sidebarBorderLight: "#DDD6FE", sidebarBorderDark: "#2A1748",
      navHoverBgLight: "#DDD6FE", navHoverBgDark: "#2A1748",
      userPillNameLight: "#1E0B45", userPillNameDark: "#F5F3FF",
      userPillSubtitleLight: "#5B4B75", userPillSubtitleDark: "#AE9DCB",
      appNameLight: "#5B21B6", appNameDark: "#C4B5FD",
    }),
  },
  {
    key: "sunset_coral",
    colors: fromVectorIq({
      primaryLight: "#E11D48", primaryDark: "#FB7185",
      topbarGradientFromLight: "#FFFFFF", topbarGradientFromDark: "#120B0E",
      topbarGradientToLight: "#FFF1F2", topbarGradientToDark: "#4C0519",
      sidebarBgTopLight: "#FFFFFF", sidebarBgTopDark: "#1F1418",
      sidebarBgBottomLight: "#FFF1F2", sidebarBgBottomDark: "#120B0E",
      sidebarTextLight: "#4A3C42", sidebarTextDark: "#E5D6DA",
      sidebarActiveTextLight: "#9F1239", sidebarActiveTextDark: "#FFE4E6",
      sidebarHighlightLight: "#FECDD3", sidebarHighlightDark: "#881337",
      sidebarBorderLight: "#F5DDE0", sidebarBorderDark: "#2C1D22",
      navHoverBgLight: "#FFE4E6", navHoverBgDark: "#2C1D22",
      userPillNameLight: "#1F1418", userPillNameDark: "#FFF7F8",
      userPillSubtitleLight: "#6B5960", userPillSubtitleDark: "#B49FA6",
      appNameLight: "#BE123C", appNameDark: "#FDA4AF",
    }),
  },
  {
    key: "dark_blue",
    colors: fromVectorIq({
      primaryLight: "#1D4ED8", primaryDark: "#60A5FA",
      topbarGradientFromLight: "#FFFFFF", topbarGradientFromDark: "#0A0F24",
      topbarGradientToLight: "#DBEAFE", topbarGradientToDark: "#172554",
      sidebarBgTopLight: "#1E3A8A", sidebarBgTopDark: "#172554",
      sidebarBgBottomLight: "#0B132B", sidebarBgBottomDark: "#0A0F24",
      sidebarTextLight: "#DBEAFE", sidebarTextDark: "#DBEAFE",
      sidebarActiveTextLight: "#FFFFFF", sidebarActiveTextDark: "#FFFFFF",
      sidebarHighlightLight: "#2563EB", sidebarHighlightDark: "#1D4ED8",
      sidebarBorderLight: "#1E40AF", sidebarBorderDark: "#1E3A8A",
      navHoverBgLight: "#1E40AF", navHoverBgDark: "#1E3A8A",
      userPillNameLight: "#FFFFFF", userPillNameDark: "#FFFFFF",
      userPillSubtitleLight: "#BFDBFE", userPillSubtitleDark: "#93C5FD",
      appNameLight: "#FFFFFF", appNameDark: "#BFDBFE",
    }),
  },
  {
    key: "dark_purple",
    colors: fromVectorIq({
      primaryLight: "#6D28D9", primaryDark: "#A78BFA",
      topbarGradientFromLight: "#FFFFFF", topbarGradientFromDark: "#0D0620",
      topbarGradientToLight: "#EDE9FE", topbarGradientToDark: "#2E1065",
      sidebarBgTopLight: "#4C1D95", sidebarBgTopDark: "#2E1065",
      sidebarBgBottomLight: "#140A2B", sidebarBgBottomDark: "#0D0620",
      sidebarTextLight: "#EDE9FE", sidebarTextDark: "#EDE9FE",
      sidebarActiveTextLight: "#FFFFFF", sidebarActiveTextDark: "#FFFFFF",
      sidebarHighlightLight: "#7C3AED", sidebarHighlightDark: "#6D28D9",
      sidebarBorderLight: "#5B21B6", sidebarBorderDark: "#4C1D95",
      navHoverBgLight: "#5B21B6", navHoverBgDark: "#4C1D95",
      userPillNameLight: "#FFFFFF", userPillNameDark: "#FFFFFF",
      userPillSubtitleLight: "#DDD6FE", userPillSubtitleDark: "#C4B5FD",
      appNameLight: "#FFFFFF", appNameDark: "#DDD6FE",
    }),
  },
  {
    key: "dark_green",
    colors: fromVectorIq({
      primaryLight: "#15803D", primaryDark: "#22C55E",
      topbarGradientFromLight: "#FFFFFF", topbarGradientFromDark: "#04140B",
      topbarGradientToLight: "#DCFCE7", topbarGradientToDark: "#052E16",
      sidebarBgTopLight: "#14532D", sidebarBgTopDark: "#0B2E1A",
      sidebarBgBottomLight: "#052E16", sidebarBgBottomDark: "#04140B",
      sidebarTextLight: "#DCFCE7", sidebarTextDark: "#DCFCE7",
      sidebarActiveTextLight: "#FFFFFF", sidebarActiveTextDark: "#FFFFFF",
      sidebarHighlightLight: "#15803D", sidebarHighlightDark: "#166534",
      sidebarBorderLight: "#166534", sidebarBorderDark: "#14532D",
      navHoverBgLight: "#166534", navHoverBgDark: "#14532D",
      userPillNameLight: "#FFFFFF", userPillNameDark: "#FFFFFF",
      userPillSubtitleLight: "#BBF7D0", userPillSubtitleDark: "#86EFAC",
      appNameLight: "#FFFFFF", appNameDark: "#BBF7D0",
    }),
  },
  {
    key: "gray",
    colors: fromVectorIq({
      primaryLight: "#4B5563", primaryDark: "#D1D5DB",
      topbarGradientFromLight: "#FFFFFF", topbarGradientFromDark: "#111827",
      topbarGradientToLight: "#F3F4F6", topbarGradientToDark: "#1F2937",
      sidebarBgTopLight: "#F9FAFB", sidebarBgTopDark: "#1F2937",
      sidebarBgBottomLight: "#E5E7EB", sidebarBgBottomDark: "#111827",
      sidebarTextLight: "#374151", sidebarTextDark: "#D1D5DB",
      sidebarActiveTextLight: "#111827", sidebarActiveTextDark: "#FFFFFF",
      sidebarHighlightLight: "#FFFFFF", sidebarHighlightDark: "#4B5563",
      sidebarBorderLight: "#D1D5DB", sidebarBorderDark: "#374151",
      navHoverBgLight: "#D1D5DB", navHoverBgDark: "#374151",
      userPillNameLight: "#111827", userPillNameDark: "#F9FAFB",
      userPillSubtitleLight: "#4B5563", userPillSubtitleDark: "#9CA3AF",
      appNameLight: "#111827", appNameDark: "#F9FAFB",
    }),
  },
  {
    key: "dark",
    colors: fromVectorIq({
      primaryLight: "#18181B", primaryDark: "#F4F4F5",
      topbarGradientFromLight: "#FFFFFF", topbarGradientFromDark: "#09090B",
      topbarGradientToLight: "#F4F4F5", topbarGradientToDark: "#18181B",
      sidebarBgTopLight: "#27272A", sidebarBgTopDark: "#18181B",
      sidebarBgBottomLight: "#09090B", sidebarBgBottomDark: "#09090B",
      sidebarTextLight: "#D4D4D8", sidebarTextDark: "#D4D4D8",
      sidebarActiveTextLight: "#FFFFFF", sidebarActiveTextDark: "#FFFFFF",
      sidebarHighlightLight: "#52525B", sidebarHighlightDark: "#3F3F46",
      sidebarBorderLight: "#3F3F46", sidebarBorderDark: "#27272A",
      navHoverBgLight: "#3F3F46", navHoverBgDark: "#27272A",
      userPillNameLight: "#FAFAFA", userPillNameDark: "#FAFAFA",
      userPillSubtitleLight: "#A1A1AA", userPillSubtitleDark: "#A1A1AA",
      appNameLight: "#FFFFFF", appNameDark: "#FFFFFF",
    }),
  },
];
