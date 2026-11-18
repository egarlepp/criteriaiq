import { Button } from "@/components/ui/button";
import { Plus, HelpCircle, Mail, MessageSquarePlus, X, BookOpen } from "lucide-react";
import { useLocation, useSearch } from "wouter";
import { guideTopicForLocation } from "@/components/layout/sidebar-nav-config";
import { getTopic } from "@/components/guide/guide-data";
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { DevPersonaSwitcher } from "@/components/layout/DevPersonaSwitcher";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { SupportFeatureDialog } from "@/components/support/support-feature-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import criteriaIqGraphic from '@assets/system/branding/criteriaiq-logo_white.png';
import { useBrandingAsset, useBrandingSidebarLogoUrl, useBrandingSupportEmail } from '@/hooks/useBrandingAsset';

interface HeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  onCreateTemplate?: () => void;
  onCreateSolution?: () => void;
  onCreateCriteria?: () => void;
  onCreateOutcome?: () => void;
  onCreateAction?: () => void;
  customButtons?: React.ReactNode;
}

export function Header({ 
  title, 
  subtitle, 
  icon: Icon,
  onCreateTemplate,
  onCreateSolution,
  onCreateCriteria,
  onCreateOutcome,
  onCreateAction,
  customButtons 
}: HeaderProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [showSupportDialog, setShowSupportDialog] = useState(false);
  const [showHelpChoiceDialog, setShowHelpChoiceDialog] = useState(false);

  const handleGetHelpClick = () => {
    setShowHelpChoiceDialog(true);
  };

  // The Guide topic for the current page (sidebar-nav-config `guideTopic`).
  const [location, navigate] = useLocation();
  const search = useSearch();
  const guideTopic = getTopic(guideTopicForLocation(location, search));
  const handleOpenGuide = () => {
    setShowHelpChoiceDialog(false);
    navigate(`/getting-started?tab=${guideTopic.urlKey}`);
  };

  // Admin-configured support email (Admin → Appearance → Media).
  // When none is set, the "Email Support" option is hidden.
  const { email: supportEmail } = useBrandingSupportEmail();

  const handleEmailSupport = () => {
    setShowHelpChoiceDialog(false);
    if (!supportEmail) return;
    const subject = encodeURIComponent("Inquiry - CriteriaIQ Technical Validation");
    window.open(`mailto:${supportEmail}?subject=${subject}`, '_blank');
  };

  const handleSubmitRequest = () => {
    setShowHelpChoiceDialog(false);
    setShowSupportDialog(true);
  };
  return (
    <header className="brand-topbar shadow-sm border-b h-[70px] shrink-0 print:hidden flex items-center justify-between gap-4 pl-6 pr-3" data-testid="app-header">
      <div className="flex items-center min-w-0">
        {Icon && <Icon className="h-6 w-6 mr-2 shrink-0" />}
        <div className="min-w-0">
          <h2 className="text-2xl font-bold truncate">{title || subtitle}</h2>
          {title && subtitle && <p className="text-sm opacity-80 truncate">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center space-x-1">
          {onCreateTemplate && (
            <Button onClick={onCreateTemplate}>
              <Plus className="h-4 w-4 mr-2 stroke-current fill-none stroke-2" />
              {t('header.createTemplate')}
            </Button>
          )}
          {/* Success Criteria buttons with 5px spacing */}
          {onCreateSolution && (
            <Button onClick={onCreateSolution} style={{ marginLeft: '5px' }}>
              <Plus className="h-4 w-4 mr-2 stroke-current fill-none stroke-2" />
              {t('header.addSolution')}
            </Button>
          )}
          {onCreateCriteria && (
            <Button onClick={onCreateCriteria} style={{ marginLeft: '5px' }}>
              <Plus className="h-4 w-4 mr-2 stroke-current fill-none stroke-2" />
              {t('header.addCriteria')}
            </Button>
          )}
          {onCreateOutcome && (
            <Button onClick={onCreateOutcome} style={{ marginLeft: '5px' }}>
              <Plus className="h-4 w-4 mr-2 stroke-current fill-none stroke-2" />
              {t('header.addOutcome')}
            </Button>
          )}
          {onCreateAction && (
            <Button onClick={onCreateAction} style={{ marginLeft: '5px' }}>
              <Plus className="h-4 w-4 mr-2 stroke-current fill-none stroke-2" />
              {t('header.addAction')}
            </Button>
          )}
          {customButtons}
        </div>

        {/* Notification bell, global search, language switcher and help */}
        <div className="flex items-center space-x-2">
          <DevPersonaSwitcher />
          <NotificationBell
            enabled={!!user}
            announcementsEnabled={!!user && !['Customer', 'Partner', 'Guest'].includes(user.role || '')}
          />
          <GlobalSearch />
          <LanguageSwitcher />
          <button
            onClick={handleGetHelpClick}
            className="p-2 brand-topbar-icon-btn rounded-md transition-all duration-200 bg-transparent border-0"
            title={t('header.help.tooltip')}
          >
            <HelpCircle className="h-5 w-5 stroke-current fill-none stroke-2" />
          </button>
        </div>

        <CompanyLogo />
      </div>

      {/* Help Choice Dialog */}
      <Dialog open={showHelpChoiceDialog} onOpenChange={setShowHelpChoiceDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              {t('header.help.title')}
            </DialogTitle>
            <DialogDescription>
              {t('header.help.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-4 px-4"
              onClick={handleOpenGuide}
              data-testid="help-open-guide"
            >
              <BookOpen className="h-5 w-5 mr-3 text-primary" />
              <div className="text-left">
                <div className="font-medium">{t('header.help.guide.title')}</div>
                <div className="text-sm text-muted-foreground">
                  {t('header.help.guide.description', { topic: t(`guide.topics.${guideTopic.key}.title`) })}
                </div>
              </div>
            </Button>
            {supportEmail && (
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-4 px-4"
              onClick={handleEmailSupport}
            >
              <Mail className="h-5 w-5 mr-3 text-blue-600 dark:text-blue-400" />
              <div className="text-left">
                <div className="font-medium">{t('header.help.emailSupport.title')}</div>
                <div className="text-sm text-muted-foreground">
                  {t('header.help.emailSupport.description')}
                </div>
              </div>
            </Button>
            )}
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-4 px-4"
              onClick={handleSubmitRequest}
            >
              <MessageSquarePlus className="h-5 w-5 mr-3 text-green-600 dark:text-green-400" />
              <div className="text-left">
                <div className="font-medium">{t('header.help.submitRequest.title')}</div>
                <div className="text-sm text-muted-foreground">
                  {t('header.help.submitRequest.description')}
                </div>
              </div>
            </Button>
          </div>
          <div className="flex justify-end pt-2 border-t">
            <Button onClick={() => setShowHelpChoiceDialog(false)}>
              <X className="h-4 w-4 mr-2" />
              {t('common.cancel')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Support Dialog for submitting requests */}
      <SupportFeatureDialog
        open={showSupportDialog}
        onOpenChange={setShowSupportDialog}
        openedFromGetHelp={true}
        prefilledData={{ type: "issue" }}
        onSuccess={() => setShowSupportDialog(false)}
      />
    </header>
  );
}

/**
 * The customer's Company Logo at the far right of the header (Admin →
 * Appearance → Media), in the current light/dark version. Until one is
 * uploaded the bundled CriteriaIQ graphic shows, faded. Links to the
 * configured Company Logo link when one is set.
 */
function CompanyLogo() {
  const { t } = useTranslation();
  const logo = useBrandingAsset("company_logo");
  const { url: linkUrl } = useBrandingSidebarLogoUrl();

  const img = (
    <img
      src={logo.url ?? criteriaIqGraphic}
      alt={t('header.companyLogoAlt')}
      className="h-[54px] w-auto max-w-[180px] object-contain"
      style={{ opacity: logo.url ? 1 : 0.35 }}
      data-testid="header-company-logo"
    />
  );

  return linkUrl ? (
    <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">
      {img}
    </a>
  ) : img;
}
