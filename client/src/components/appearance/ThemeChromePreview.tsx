import { useTranslation } from "react-i18next";
import { readableTextOn, type LogoVariant, type ThemeColors, type ThemeColorMode } from "@shared/theme-colors";
import { LOGO_ASSETS } from "./logo-variants";

/**
 * A drawing of the app chrome (header bar, sidebar, Admin menu and a Primary
 * button) in one mode, painted straight from `colors` so light and dark can
 * sit side by side while the theme is edited. Sized close to the real app so
 * text and contrast read the way they will on screen.
 */
export function ThemeChromePreview({
  colors,
  mode,
  logoVariant,
}: {
  colors: ThemeColors;
  mode: ThemeColorMode;
  logoVariant: LogoVariant;
}) {
  const { t } = useTranslation();
  const s = mode === "light" ? "Light" : "Dark";
  const c = (field: string) => colors[`${field}${s}` as keyof ThemeColors];
  const pageBg = mode === "light" ? "#F9FAFB" : "#111827";
  const cardBg = mode === "light" ? "#FFFFFF" : "#1F2937";
  const cardBorder = mode === "light" ? "#E5E7EB" : "#374151";

  return (
    <figure className="space-y-1.5" data-testid={`theme-preview-${mode}`}>
      <figcaption className="text-xs font-medium text-gray-600 dark:text-gray-400">
        {t(`appearance.theming.mode.${mode}`)}
      </figcaption>
      <div className="overflow-hidden rounded-md border border-gray-200 dark:border-gray-700" aria-hidden="true">
        <div className="flex h-[260px] text-xs" style={{ backgroundColor: pageBg }}>
          <div
            className="flex w-[30%] min-w-[150px] flex-col gap-1 border-r p-3"
            style={{
              backgroundImage: `linear-gradient(to bottom, ${c("sidebarBgTop")}, ${c("sidebarBgBottom")})`,
              borderColor: c("sidebarBorder"),
            }}
          >
            <img
              src={LOGO_ASSETS[logoVariant].full}
              alt=""
              className="mb-2 h-6 w-auto max-w-full self-start object-contain"
              data-testid={`theme-preview-${mode}-logo-${logoVariant}`}
            />
            <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: c("sidebarHeading") }}>
              {t("appearance.theming.preview.heading")}
            </span>
            <span className="truncate rounded px-2 py-1" style={{ backgroundColor: c("primary"), color: readableTextOn(c("primary")) }}>
              {t("appearance.theming.preview.activeItem")}
            </span>
            <span className="truncate rounded px-2 py-1" style={{ backgroundColor: c("navHoverBg"), color: c("userPillName") }}>
              {t("appearance.theming.preview.hoverItem")}
            </span>
            <span className="truncate rounded px-2 py-1" style={{ backgroundColor: c("sidebarHighlight"), color: c("sidebarActiveText") }}>
              {t("appearance.theming.preview.activeSubItem")}
            </span>
            <span className="truncate px-2 py-1" style={{ color: c("sidebarText") }}>
              {t("appearance.theming.preview.item")}
            </span>
            <span className="mt-auto truncate border-t px-2 pt-2" style={{ borderColor: c("sidebarBorder") }}>
              <span className="block truncate font-medium" style={{ color: c("userPillName") }}>{t("appearance.theming.preview.userName")}</span>
              <span className="block truncate text-[11px]" style={{ color: c("userPillSubtitle") }}>{t("appearance.theming.preview.userRole")}</span>
            </span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div
              className="flex h-10 shrink-0 items-center px-3 text-sm font-bold"
              style={{
                background: `linear-gradient(to right, ${c("topbarGradientFrom")}, ${c("topbarGradientTo")})`,
                color: c("topbarText"),
              }}
            >
              {t("appearance.theming.preview.pageTitle")}
            </div>
            <div className="flex min-h-0 flex-1">
              <div
                className="flex w-[44%] min-w-[120px] flex-col gap-1 border-r p-2"
                style={{ backgroundColor: c("adminMenuBg"), borderColor: c("adminMenuBorder") }}
              >
                <span className="truncate px-2 py-1 font-semibold" style={{ color: c("adminMenuHeading") }}>
                  {t("appearance.theming.preview.adminMenu")}
                </span>
                <span className="ml-2 truncate rounded px-2 py-1" style={{ backgroundColor: c("adminMenuHighlight"), color: c("adminMenuActiveText") }}>
                  {t("appearance.theming.preview.activeSubItem")}
                </span>
                <span className="ml-2 truncate rounded px-2 py-1" style={{ backgroundColor: c("adminMenuHoverBg"), color: c("adminMenuHeading") }}>
                  {t("appearance.theming.preview.hoverItem")}
                </span>
                <span className="ml-2 truncate px-2 py-1" style={{ color: c("adminMenuText") }}>
                  {t("appearance.theming.preview.adminItem")}
                </span>
              </div>
              <div className="flex flex-1 items-start p-3">
                <div className="w-full rounded-md border p-3" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
                  <span
                    className="inline-block rounded-md px-3 py-1.5 font-medium"
                    style={{ backgroundColor: c("primary"), color: readableTextOn(c("primary")) }}
                  >
                    {t("appearance.theming.preview.button")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}
