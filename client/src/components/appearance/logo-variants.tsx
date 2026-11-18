import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_LOGO_VARIANTS,
  withLogoVariantDefaults,
  type LogoVariant,
  type LogoVariants,
  type ThemeColorMode,
} from "@shared/theme-colors";
import logoLight from "@/assets/criteriaiq-logo-light.png";
import logoDark from "@/assets/criteriaiq-logo-dark.png";
import logoMarkLight from "@/assets/criteriaiq-logo-mark-light.png";
import logoMarkDark from "@/assets/criteriaiq-logo-mark-dark.png";

/** The bundled CriteriaIQ logo files for each version (navy text vs white text). */
export const LOGO_ASSETS: Record<LogoVariant, { full: string; mark: string }> = {
  dark_text: { full: logoLight, mark: logoMarkLight },
  light_text: { full: logoDark, mark: logoMarkDark },
};

export const MEDIA_LOGO_VARIANTS_QUERY_KEY = ["/api/branding/logo-variants"] as const;

/** The app-wide logo version per mode set on Admin › Appearance › Media. */
export function useMediaLogoVariants() {
  const query = useQuery<LogoVariants>({ queryKey: MEDIA_LOGO_VARIANTS_QUERY_KEY });
  return {
    variants: query.data ? withLogoVariantDefaults(query.data) : DEFAULT_LOGO_VARIANTS,
    isLoading: query.isLoading,
  };
}

/** Plain page-sidebar backgrounds used when showing a logo version with no theme in play. */
const NEUTRAL_SIDEBAR: Record<ThemeColorMode, string> = { light: "#FFFFFF", dark: "#111827" };

interface LogoVariantTilesProps {
  mode: ThemeColorMode;
  value: LogoVariant;
  onChange: (variant: LogoVariant) => void;
  disabled?: boolean;
  /** Sidebar background behind the logo; defaults to a plain light or dark surface. */
  background?: string;
}

/**
 * Two clickable tiles, one per logo version, each drawn on the sidebar
 * background of `mode` so the admin can see which one reads.
 */
export function LogoVariantTiles({ mode, value, onChange, disabled, background }: LogoVariantTilesProps) {
  const { t } = useTranslation();
  const bg = background ?? NEUTRAL_SIDEBAR[mode];
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t(`appearance.logo.mode.${mode}`)}>
      {(["dark_text", "light_text"] as const).map((variant) => {
        const selected = value === variant;
        return (
          <button
            key={variant}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(variant)}
            className={cn(
              "flex flex-col gap-1.5 rounded-md border p-1.5 text-left text-xs transition-colors disabled:opacity-50",
              "border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800",
              selected && "border-primary ring-1 ring-primary",
            )}
            data-testid={`logo-variant-${mode}-${variant}`}
          >
            <span
              className="flex h-14 items-center gap-2 rounded border border-black/10 px-2"
              style={{ background: bg }}
              aria-hidden="true"
            >
              <img src={LOGO_ASSETS[variant].mark} alt="" className="h-7 w-7 shrink-0 object-contain" />
              <img src={LOGO_ASSETS[variant].full} alt="" className="h-auto min-w-0 max-w-[120px] object-contain" />
            </span>
            <span className="flex items-center gap-1 text-gray-800 dark:text-gray-200">
              {selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
              {t(`appearance.logo.variants.${variant}`)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
