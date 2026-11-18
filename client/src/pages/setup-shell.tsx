import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Sun, Moon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { AppVersionFooter } from "@/components/shared/AppVersionFooter";

import criteriaIqLogoDark from "@assets/system/branding/criteriaiq-logo-dark.png";
import worldBg from "@assets/system/branding/world.webp";

/**
 * Shared chrome for every screen mounted at `/setup` (Task #420).
 *
 * Renders the dark blue gradient backdrop, the faint world-map layer,
 * the top-left theme toggle, the top-right "Get Help" button +
 * language switcher, the centered CriteriaIQ logo + title/subtitle
 * header, and the bottom-left version footer. Children are dropped
 * into the centered max-w-2xl column directly under the header.
 *
 * Both the wizard step view (`setup.tsx`) and the read-only health-
 * check view (`setup-health-check-view.tsx`) wrap their inner card
 * in this shell so the operator sees identical branding across the
 * pre- and post-completion `/setup` URLs. The original wizard
 * implementation inlined all of this chrome AFTER an early-return
 * that swapped in `<SetupHealthCheckView>`, which silently bypassed
 * the entire wrapper — operators saw a bare card on a white
 * background after every Dokploy/Docker redeploy.
 *
 * The optional `pills` slot is for the wizard's step-pills row. The
 * health-check view passes `null`; rendering pills on a completed
 * install would be misleading.
 *
 * Stable test selectors preserved verbatim so the existing wizard
 * suites (`setup-version-footer`, `setup-restart-and-running-server`,
 * `setup-health-check-view`, etc.) keep matching:
 *   - `setup-backdrop`
 *   - `button-theme-toggle`
 *   (no `button-get-help`: setup runs before a support email exists)
 *   - `app-version-footer`
 */
interface SetupShellProps {
  children: ReactNode;
  /**
   * Optional step-pills row. Wizard passes its rendered pills; the
   * health-check view passes `null` (or omits the prop) so the row
   * is hidden.
   */
  pills?: ReactNode;
}

export function SetupShell({ children, pills = null }: SetupShellProps) {
  const { t } = useTranslation();
  const { toggleTheme } = useTheme();

  return (
    <>
      {/* Fixed-viewport backdrop: gradient + faint world map. Lives
          outside the scroll container so it always covers the visible
          viewport even when a tall step (Secrets / SMTP / Done)
          scrolls past the fold. */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(to right, #050b39, #001cab)",
          zIndex: -1,
        }}
        aria-hidden="true"
        data-testid="setup-backdrop"
      >
        <div
          className="absolute inset-0 opacity-25 pointer-events-none"
          style={{
            backgroundImage: `url(${worldBg})`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center center",
            backgroundSize: "cover",
          }}
        />
      </div>

      <div
        // Top-aligned scrollable shell — see the inline comment block
        // in setup.tsx (history) for the full rationale. tldr:
        // `min-h-screen h-screen` + `overflow-y-auto` is what actually
        // makes tall content scroll inside a viewport-pinned wrapper
        // when index.css sets `body { overflow: hidden }`.
        className="min-h-screen h-screen relative flex items-start justify-center px-6 py-10 overflow-y-auto"
      >
        {/* Theme Toggle — Top Left */}
        <div className="absolute top-4 left-4 z-20">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            className="h-8 w-8 px-0 text-white hover:bg-white/10"
            title={t("setup.themeToggle")}
            data-testid="button-theme-toggle"
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-white" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-white" />
            <span className="sr-only">{t("setup.themeToggle")}</span>
          </Button>
        </div>

        {/* Language Switcher — Top Right. (No Get Help button: setup runs
            before any support contact email can be configured.) */}
        <div className="absolute top-4 right-4 z-20 flex items-center gap-4">
          <LanguageSwitcher onDarkBackground />
        </div>

        <div className="w-full max-w-2xl space-y-6 relative z-10">
          <div className="text-center text-white">
            <div className="flex justify-center mb-2">
              <img
                src={criteriaIqLogoDark}
                alt="CriteriaIQ"
                className="h-48 object-contain"
              />
            </div>
            <h1 className="text-3xl font-bold">{t("setup.title")}</h1>
            <p className="text-blue-200 mt-2">{t("setup.subtitle")}</p>
          </div>

          {pills}

          {children}
        </div>
      </div>

      {/* Bottom-left version footer — same shared component the login
          screen uses so both screens always show the same build
          identifier. */}
      <AppVersionFooter />
    </>
  );
}

export default SetupShell;
