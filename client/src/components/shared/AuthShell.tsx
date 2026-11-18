import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { HelpCircle, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { AppVersionFooter } from "@/components/shared/AppVersionFooter";
import criteriaIqLogoBackgroundPath from "@assets/system/branding/criteriaiq-logo_white.png";
import { useBrandingAsset, useBrandingSupportEmail } from "@/hooks/useBrandingAsset";

/**
 * Shared chrome for the unauthenticated / pre-app screens (Login,
 * MFA enforcement). Renders the blue gradient backdrop, the faint
 * `criteriaiq-logo_white.png` watermark, the top-left theme toggle,
 * the top-right Get Help + LanguageSwitcher cluster, and the
 * bottom-left version footer — exactly as the Landing (login) page
 * has always rendered them. Page content is passed in as `children`
 * and renders above the watermark layer (z-10).
 *
 * The chrome JSX in this file is the canonical source for this look.
 * `landing.tsx` and `App.tsx`'s MFA enforcement branch both wrap
 * their content in `<AuthShell>` so the operator never sees a
 * different page surface between login and the MFA prompt that
 * appears immediately after login (see task-432).
 *
 * Notes:
 * - The theme toggle button is rendered inline (not the shared
 *   `<ThemeToggle>` component) because this surface needs the
 *   white-on-blue styling that doesn't fit `<ThemeToggle>`'s
 *   neutral default. The DOM is intentionally identical to the
 *   markup that previously lived inside `landing.tsx`.
 * - The watermark uses `opacity-5 pointer-events-none` and is
 *   protected by the `landing-branding-locks` test which selects
 *   on that exact class pair — keep them.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { toggleTheme } = useTheme();
  // Admin-customizable login background. When present, the uploaded image
  // replaces the dark-blue gradient; the rest of the chrome (watermark,
  // theme toggle, help, language, footer) stays put on top of it.
  const customLoginBg = useBrandingAsset("login_bg");
  const { email: supportEmail } = useBrandingSupportEmail();
  const bgStyle: CSSProperties = customLoginBg.url
    ? {
        backgroundImage: `url(${customLoginBg.url})`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center center",
        backgroundSize: "cover",
        opacity: customLoginBg.opacity / 100,
      }
    : {};

  return (
    <div
      className="min-h-screen h-screen overflow-y-auto relative"
      style={
        customLoginBg.url
          ? { backgroundColor: "#050b39" }
          : { background: "linear-gradient(to right, #050b39, #001cab)" }
      }
    >
      {customLoginBg.url ? (
        <div className="absolute inset-0 z-0 pointer-events-none" style={bgStyle} />
      ) : null}
      {/* Theme Toggle - Top Left */}
      <div className="absolute top-4 left-4 z-20">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          className="h-8 w-8 px-0 text-white hover:bg-white/10"
          title={t("shared.themeToggle.label")}
          data-testid="auth-shell-theme-toggle"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-white" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-white" />
          <span className="sr-only">{t("shared.themeToggle.label")}</span>
        </Button>
      </div>
      {/* Header with Language Switcher and Help Icon */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-4">
        {supportEmail && (
        <Button
          variant="ghost"
          size="sm"
          className="group text-white hover:bg-white/10 hover:!text-white"
          onClick={() =>
            (window.location.href =
              `mailto:${supportEmail}?subject=CriteriaIQ Support Request`)
          }
          data-testid="auth-shell-get-help"
        >
          {/* icon: white by default, black on hover */}
          <HelpCircle className="h-4 w-4 mr-2 text-white transition-colors group-hover:!text-black" />
          {/* label: force white even on hover */}
          <span className="text-white group-hover:!text-white">
            {t("header.getHelp")}
          </span>
        </Button>
        )}
        <LanguageSwitcher onDarkBackground />
      </div>
      {/* Background logo */}
      <div
        className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-4/5 h-4/5 opacity-5 pointer-events-none z-0"
        style={{
          backgroundImage: `url(${criteriaIqLogoBackgroundPath})`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center center",
          backgroundSize: "contain",
        }}
      />
      {/* Cards follow dark mode; buttons keep their light look in both modes. */}
      <div className="force-light-buttons contents">{children}</div>
      <AppVersionFooter />
    </div>
  );
}

export default AuthShell;
