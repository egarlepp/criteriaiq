import { describe, expect, it } from "vitest";
import {
  CLASSIC_COLORS,
  DEFAULT_LOGO_VARIANTS,
  LOGO_VARIANTS,
  THEME_COLOR_FIELDS,
  THEME_COLOR_KEYS,
  THEME_FIELD_GROUPS,
  THEME_PRESETS,
  contrastRatio,
  findContrastIssues,
  isHexColor,
  readableTextOn,
  resolveLogoVariants,
  suggestedLogoVariant,
  suggestedLogoVariants,
  withLogoVariantDefaults,
  withThemeDefaults,
} from "@shared/theme-colors";
import { brandingLogoVariantsSchema, insertAppThemeSchema } from "@shared/schema";
import enUS from "../../i18n/locales/en-US.json";

describe("theme colors", () => {
  it("lists every color field in exactly one editor group", () => {
    const grouped = THEME_FIELD_GROUPS.flatMap((g) => g.fields);
    expect([...grouped].sort()).toEqual([...THEME_COLOR_FIELDS].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it("gives every preset a full set of hex colors and an English name", () => {
    const presetNames = enUS.appearance.theming.presets as Record<string, string>;
    expect(THEME_PRESETS[0].key).toBe("criteriaiq_classic");
    expect(THEME_PRESETS[0].colors).toEqual(CLASSIC_COLORS);
    for (const preset of THEME_PRESETS) {
      for (const key of THEME_COLOR_KEYS) expect(isHexColor(preset.colors[key]), `${preset.key}.${key}`).toBe(true);
      expect(presetNames[preset.key], preset.key).toBeTruthy();
    }
  });

  it("keeps header text readable on every preset", () => {
    for (const preset of THEME_PRESETS) {
      for (const mode of ["Light", "Dark"] as const) {
        const text = preset.colors[`topbarText${mode}`];
        const from = preset.colors[`topbarGradientFrom${mode}`];
        const to = preset.colors[`topbarGradientTo${mode}`];
        expect(Math.min(contrastRatio(text, from), contrastRatio(text, to)), `${preset.key} ${mode}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("fills missing or invalid colors from Classic", () => {
    const filled = withThemeDefaults({ primaryLight: "#123456", primaryDark: "blue", unknown: "#000000" });
    expect(filled.primaryLight).toBe("#123456");
    expect(filled.primaryDark).toBe(CLASSIC_COLORS.primaryDark);
    expect(Object.keys(filled).sort()).toEqual([...THEME_COLOR_KEYS].sort());
  });

  it("picks dark text on light backgrounds and white text on dark ones", () => {
    expect(readableTextOn("#FFFFFF")).not.toBe("#FFFFFF");
    expect(readableTextOn("#000000")).toBe("#FFFFFF");
  });

  it("flags unreadable text pairs", () => {
    expect(findContrastIssues(CLASSIC_COLORS)).toEqual([]);
    const bad = { ...CLASSIC_COLORS, sidebarTextLight: CLASSIC_COLORS.sidebarBgTopLight };
    expect(findContrastIssues(bad).some((i) => i.text === "sidebarText" && i.mode === "light")).toBe(true);
  });

  it("rejects themes with a blank name or a non-hex color", () => {
    expect(insertAppThemeSchema.safeParse({ name: "Brand", colors: CLASSIC_COLORS }).success).toBe(true);
    expect(insertAppThemeSchema.safeParse({ name: "  ", colors: CLASSIC_COLORS }).success).toBe(false);
    expect(insertAppThemeSchema.safeParse({ name: "Brand", colors: { ...CLASSIC_COLORS, primaryLight: "red" } }).success).toBe(false);
  });
});

describe("CriteriaIQ logo versions", () => {
  it("defaults to the navy logo in light mode and the white logo in dark mode", () => {
    expect(withLogoVariantDefaults(null)).toEqual({ light: "dark_text", dark: "light_text" });
    expect(withLogoVariantDefaults({ light: "light_text", dark: "bogus" })).toEqual({ light: "light_text", dark: "light_text" });
  });

  it("suggests the logo that reads on the sidebar background", () => {
    expect(suggestedLogoVariants(CLASSIC_COLORS)).toEqual(DEFAULT_LOGO_VARIANTS);
    const darkBlue = THEME_PRESETS.find((p) => p.key === "dark_blue")!.colors;
    expect(suggestedLogoVariant(darkBlue, "light")).toBe("light_text");
    expect(suggestedLogoVariant(darkBlue, "dark")).toBe("light_text");
  });

  it("uses the theme's own choice per mode and the Media setting otherwise", () => {
    const media = { light: "light_text", dark: "dark_text" } as const;
    expect(resolveLogoVariants(null, media)).toEqual(media);
    expect(resolveLogoVariants({ logoVariantLight: "dark_text", logoVariantDark: null }, media)).toEqual({
      light: "dark_text",
      dark: "dark_text",
    });
  });

  it("validates the Media setting and a theme's override", () => {
    expect(brandingLogoVariantsSchema.safeParse({ light: "dark_text", dark: "light_text" }).success).toBe(true);
    expect(brandingLogoVariantsSchema.safeParse({ light: "navy", dark: "light_text" }).success).toBe(false);
    expect(
      insertAppThemeSchema.safeParse({ name: "X", colors: CLASSIC_COLORS, logoVariantLight: null, logoVariantDark: "light_text" }).success,
    ).toBe(true);
    expect(insertAppThemeSchema.safeParse({ name: "X", colors: CLASSIC_COLORS, logoVariantDark: "white" }).success).toBe(false);
  });

  it("has labels for every logo version", () => {
    for (const variant of LOGO_VARIANTS) {
      expect(enUS.appearance.logo.variants[variant]).toBeTruthy();
    }
  });
});

describe("Admin menu colors", () => {
  it("copies the theme's own sidebar colors when a saved theme has no Admin menu colors", () => {
    const saved = { ...CLASSIC_COLORS, sidebarTextLight: "#111111", sidebarHighlightDark: "#222222" } as Record<string, string>;
    for (const key of Object.keys(saved)) if (key.startsWith("adminMenu") && !key.startsWith("adminMenuBg")) delete saved[key];
    const filled = withThemeDefaults(saved);
    expect(filled.adminMenuTextLight).toBe("#111111");
    expect(filled.adminMenuHighlightDark).toBe("#222222");
    expect(filled.adminMenuBgLight).toBe(CLASSIC_COLORS.adminMenuBgLight);
  });

  it("keeps Admin menu colors the theme sets", () => {
    expect(withThemeDefaults({ ...CLASSIC_COLORS, adminMenuTextLight: "#ABCDEF" }).adminMenuTextLight).toBe("#ABCDEF");
  });
});
