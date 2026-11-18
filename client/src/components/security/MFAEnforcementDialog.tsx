import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SecurityHealthBadge } from "./SecurityHealthBadge";
import MFASetupDialog from "./MFASetupDialog";

import {
  ShieldUser,
  AlertTriangle,
  Lock,
  CheckCircle,
  ExternalLink,
} from "lucide-react";

interface MFAEnforcementDialogProps {
  isOpen: boolean;
  onComplete: () => void;
}

/**
 * Renders the "Security Setup Required" card shown to operators
 * whose role requires MFA but who have not yet completed setup.
 *
 * Page chrome (gradient backdrop, white-logo watermark, theme
 * toggle, Get Help, language switcher, version footer) is provided
 * by `<AuthShell>` in the parent (`App.tsx`'s MFA enforcement
 * branch) — this component only renders the centered card itself.
 *
 * Notes:
 * - The the legacy vendor logo that used to sit in the dialog header has
 *   been removed (task-432) — the form header now matches the rest
 *   of the auth surfaces (no per-vendor branding above the title).
 * - The component is no longer a Radix `<Dialog>`. Operators cannot
 *   navigate away from this screen anyway (the parent router
 *   short-circuits on `isMfaRequired`), so the card is rendered
 *   directly. This keeps the AuthShell chrome visible behind the
 *   card instead of being covered by a dialog overlay.
 * - The card is rendered as a `<section aria-labelledby=…>` rather
 *   than `role="dialog" aria-modal="true"` because nothing else is
 *   on the page — the chrome controls in `AuthShell` (theme toggle,
 *   Get Help, language switcher) are part of the SAME page surface
 *   and remain keyboard-focusable. Marking the card as an
 *   aria-modal would lie to screen readers about an overlay/focus
 *   trap that doesn't exist.
 */
export default function MFAEnforcementDialog({ isOpen, onComplete }: MFAEnforcementDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [showMFASetup, setShowMFASetup] = useState(false);

  const handleSetupComplete = () => {
    setShowMFASetup(false);
    onComplete();
  };

  if (!isOpen) return null;

  if (showMFASetup) {
    return (
      <MFASetupDialog
        isOpen={true}
        onClose={handleSetupComplete}
        isEnforcementMode={true}
      />
    );
  }

  return (
    <section
      aria-labelledby="mfa-enforcement-title"
      className="relative z-10 w-full max-w-lg rounded-lg border-none bg-background p-6 shadow-2xl"
      data-testid="mfa-enforcement-card"
    >
      <div className="mb-4">
        <h2
          id="mfa-enforcement-title"
          className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight"
        >
          <ShieldUser className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          {t("security.mfa.enforcement.title")}
        </h2>
      </div>

      <div className="space-y-6">
        {/* Security Warning */}
        <Card className="border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-yellow-800 dark:text-yellow-300">
              <AlertTriangle className="h-5 w-5" />
              {t("security.mfa.enforcement.warningTitle")}
            </CardTitle>
            <CardDescription className="text-yellow-700 dark:text-yellow-400">
              {t("security.mfa.enforcement.warningDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-yellow-800 dark:text-yellow-300">{t("security.mfa.enforcement.currentStatusLabel")}</span>
              {user?.securityHealth && (
                <SecurityHealthBadge
                  securityHealth={user.securityHealth}
                  size="sm"
                />
              )}
            </div>

            <div className="text-sm text-yellow-700 dark:text-yellow-400">
              <p className="mb-2">{t("security.mfa.enforcement.needsLabel")}</p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>{t("security.mfa.enforcement.need1")}</li>
                <li>{t("security.mfa.enforcement.need2")}</li>
                <li>{t("security.mfa.enforcement.need3")}</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Security Benefits */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-green-600 dark:text-green-500" />
              {t("security.mfa.enforcement.whyTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-500 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium">{t("security.mfa.enforcement.why1Title")}</p>
                  <p className="text-gray-600 dark:text-gray-400">{t("security.mfa.enforcement.why1Description")}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-500 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium">{t("security.mfa.enforcement.why2Title")}</p>
                  <p className="text-gray-600 dark:text-gray-400">{t("security.mfa.enforcement.why2Description")}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-500 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium">{t("security.mfa.enforcement.why3Title")}</p>
                  <p className="text-gray-600 dark:text-gray-400">{t("security.mfa.enforcement.why3Description")}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* User Information */}
        <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-900 dark:text-blue-200">{t("security.mfa.enforcement.settingUpFor")}</p>
                <p className="text-sm text-blue-700 dark:text-blue-300">{user?.email}</p>
                <p className="text-xs text-blue-600 dark:text-blue-400">{t("security.mfa.enforcement.roleLabel", { role: user?.role ?? "" })}</p>
              </div>
              <ShieldUser className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="space-y-3">
          <Button
            onClick={() => setShowMFASetup(true)}
            className="w-full"
            size="lg"
          >
            <ShieldUser className="h-4 w-4 mr-2" />
            {t("security.mfa.enforcement.setupButton")}
          </Button>

          <div className="text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              {t("security.mfa.enforcement.needHelp")}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open('https://support.microsoft.com/en-us/account-billing/download-microsoft-authenticator-351498fc-850a-45da-b7b6-27e523b8702a', '_blank')}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              {t("security.mfa.enforcement.downloadAuthenticator")}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
