import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, ShieldUser, ShieldCheck, ShieldAlert, Key, Smartphone, Fingerprint, Calendar, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SecurityHealthBadge } from "@/components/security/SecurityHealthBadge";
import { SecurityJourney } from "@/components/security/SecurityJourney";
import { Button } from "@/components/ui/button";
import MFASetupDialog from "@/components/security/MFASetupDialog";

interface SecurityStatusDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  securityHealth?: any;
}

export function SecurityStatusDrawer({ isOpen, onClose, securityHealth }: SecurityStatusDrawerProps) {
  const { t } = useTranslation();
  const [showMFASetup, setShowMFASetup] = useState(false);

  if (!isOpen) return null;

  const health = securityHealth?.health || 'red';
  const isEnabled = securityHealth?.enabled || false;
  const recoveryCount = securityHealth?.recoveryCount || 0;
  const passkeyCount = securityHealth?.passkeyCount || 0;

  // Get overall security status display
  const getSecurityStatus = () => {
    switch (health) {
      case 'green':
        return {
          icon: ShieldCheck,
          color: 'text-green-600 dark:text-green-400',
          bg: 'bg-green-50 dark:bg-green-900/30',
          title: t('security.statusDrawer.statusComplete'),
          description: t('security.statusDrawer.statusCompleteDescription')
        };
      case 'amber':
        return {
          icon: ShieldUser,
          color: 'text-amber-600 dark:text-amber-400',
          bg: 'bg-amber-50 dark:bg-amber-900/30',
          title: t('security.statusDrawer.statusPartial'),
          description: t('security.statusDrawer.statusPartialDescription')
        };
      case 'red':
      default:
        return {
          icon: ShieldAlert,
          color: 'text-red-600 dark:text-red-400',
          bg: 'bg-red-50 dark:bg-red-900/30',
          title: t('security.statusDrawer.statusIncomplete'),
          description: t('security.statusDrawer.statusIncompleteDescription')
        };
    }
  };

  const status = getSecurityStatus();
  const StatusIcon = status.icon;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-96 bg-white dark:bg-slate-900 shadow-xl z-50 transform transition-transform duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b dark:border-slate-700">
          <div className="flex items-center gap-3">
            <StatusIcon className={cn("w-6 h-6", status.color)} />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('security.statusDrawer.title')}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-md transition-colors"
            aria-label={t('security.statusDrawer.closeAria')}
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto h-full pb-20">
          {/* Overall Status */}
          <div className={cn("p-4 rounded-lg", status.bg)}>
            <div className="flex items-start gap-3">
              <StatusIcon className={cn("w-8 h-8 mt-0.5", status.color)} />
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{status.title}</h3>
                <p className="text-sm text-gray-700 dark:text-gray-300">{status.description}</p>
              </div>
            </div>
          </div>

          {/* Security Health Badge */}
          <div className="space-y-3">
            <h3 className="font-medium text-gray-900 dark:text-gray-100">{t('security.statusDrawer.healthHeading')}</h3>
            <SecurityHealthBadge
              securityHealth={{
                health,
                enabled: isEnabled,
                method: securityHealth?.method,
                enrolledAt: securityHealth?.enrolledAt,
                recoveryCount,
                passkeyCount
              }}
              className="w-full justify-start"
            />
          </div>

          {/* Security Features Overview */}
          <div className="space-y-4">
            <h3 className="font-medium text-gray-900 dark:text-gray-100">{t('security.statusDrawer.featuresHeading')}</h3>

            {/* MFA Status */}
            <div className="flex items-center justify-between p-3 border dark:border-slate-700 rounded-lg">
              <div className="flex items-center gap-3">
                <Key className={cn("w-5 h-5", isEnabled ? "text-green-600 dark:text-green-400" : "text-gray-400 dark:text-gray-500")} />
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{t('security.statusDrawer.mfaTitle')}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {isEnabled ? t('security.statusDrawer.mfaEnabled', { method: securityHealth?.method || 'TOTP' }) : t('security.statusDrawer.mfaDisabled')}
                  </p>
                </div>
              </div>
              <div className={cn(
                "w-3 h-3 rounded-full",
                isEnabled ? "bg-green-500 dark:bg-green-400" : "bg-gray-300 dark:bg-slate-600"
              )} />
            </div>

            {/* Recovery Codes */}
            <div className="flex items-center justify-between p-3 border dark:border-slate-700 rounded-lg">
              <div className="flex items-center gap-3">
                <Smartphone className={cn("w-5 h-5", recoveryCount > 0 ? "text-green-600 dark:text-green-400" : "text-gray-400 dark:text-gray-500")} />
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{t('security.statusDrawer.recoveryTitle')}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {recoveryCount > 0 ? t('security.statusDrawer.recoveryAvailable', { count: recoveryCount }) : t('security.statusDrawer.recoveryNotConfigured')}
                  </p>
                </div>
              </div>
              <div className={cn(
                "w-3 h-3 rounded-full",
                recoveryCount > 0 ? "bg-green-500 dark:bg-green-400" : "bg-gray-300 dark:bg-slate-600"
              )} />
            </div>

            {/* Passkeys */}
            <div className="flex items-center justify-between p-3 border dark:border-slate-700 rounded-lg">
              <div className="flex items-center gap-3">
                <Fingerprint className={cn("w-5 h-5", passkeyCount > 0 ? "text-green-600 dark:text-green-400" : "text-gray-400 dark:text-gray-500")} />
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{t('security.statusDrawer.passkeysTitle')}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {passkeyCount > 0 ? t('security.statusDrawer.passkeysRegistered', { count: passkeyCount }) : t('security.statusDrawer.passkeysNotConfigured')}
                  </p>
                </div>
              </div>
              <div className={cn(
                "w-3 h-3 rounded-full",
                passkeyCount > 0 ? "bg-green-500 dark:bg-green-400" : "bg-gray-300 dark:bg-slate-600"
              )} />
            </div>
          </div>

          {/* Security Journey Timeline */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <h3 className="font-medium text-gray-900 dark:text-gray-100">{t('security.statusDrawer.journeyHeading')}</h3>
            </div>
            <SecurityJourney securityHealth={securityHealth} />
          </div>

          {/* Quick Actions */}
          <div className="space-y-3">
            <h3 className="font-medium text-gray-900 dark:text-gray-100">{t('security.statusDrawer.quickActions')}</h3>
            <div className="space-y-2">
              <Button
                onClick={() => setShowMFASetup(true)}
                variant="outline"
                className="w-full justify-between group hover:bg-blue-50 dark:hover:bg-blue-900/20"
              >
                <div className="flex items-center gap-2">
                  <ShieldUser className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  {isEnabled ? t('security.statusDrawer.manageMfa') : t('security.statusDrawer.setupMfa')}
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* MFA Setup Dialog */}
      <MFASetupDialog
        isOpen={showMFASetup}
        onClose={() => setShowMFASetup(false)}
        onGoToStatus={() => {
          // Task #583: closing the wizard from the drawer drops the
          // operator back onto the drawer itself, which IS the
          // security Status surface (this drawer renders the security
          // health panel + Setup/Manage MFA controls). So we just
          // close the wizard — the drawer remains open underneath.
          setShowMFASetup(false);
        }}
      />
    </>
  );
}
