import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  withLogoVariantDefaults,
  withThemeDefaults,
  type LogoVariants,
  type ThemeColors,
} from "@shared/theme-colors";
import { applyActiveTheme } from "@/lib/theme-apply";

/** id, name and colors are null when the app shows CriteriaIQ Classic. */
export interface ActiveThemeResponse {
  id: number | null;
  name: string | null;
  colors: ThemeColors | null;
  /** The CriteriaIQ logo version each mode shows: the theme's choice, else the Media setting. */
  logoVariants: LogoVariants;
}

export const ACTIVE_THEME_QUERY_KEY = ["/api/themes/active"] as const;

/**
 * The active brand theme (Admin › Appearance › Theming) and the CriteriaIQ
 * logo version for each mode. Public endpoint, so it also themes the sign-in
 * screens' Primary color.
 */
export function useActiveTheme() {
  return useQuery<ActiveThemeResponse>({
    queryKey: ACTIVE_THEME_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/themes/active", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as Partial<ActiveThemeResponse> | null;
      return {
        id: body?.id ?? null,
        name: body?.name ?? null,
        colors: body?.colors ? withThemeDefaults(body.colors) : null,
        logoVariants: withLogoVariantDefaults(body?.logoVariants),
      };
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

/** Keeps the page's brand colors in step with the active theme. Mounted once in App. */
export function ActiveThemeApplier(): null {
  const { data, isSuccess } = useActiveTheme();
  useEffect(() => {
    // Only a real answer changes the colors; a failed fetch keeps whatever
    // the cache painted rather than flashing back to Classic.
    if (isSuccess) applyActiveTheme(data.colors, data.logoVariants);
  }, [isSuccess, data]);
  return null;
}
