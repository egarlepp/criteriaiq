import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { clearSessionEstablished } from "@/lib/session-marker";
import { LogOut, ShieldAlert, ShieldCheck, ShieldUser, SlidersHorizontal } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { SecurityStatusDrawer } from "@/components/security/SecurityStatusDrawer";
import { useAuth } from "@/hooks/useAuth";

async function signOut() {
  try {
    await fetch('/api/logout', { method: 'POST' });
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    clearSessionEstablished();
    window.location.href = '/?noautologin=true';
  }
}

// Footer icon buttons, matching ImpactIQ: My Settings (sliders) then Sign Out,
// both in the theme's sidebar text color. Icons use the nav icons' size and
// stroke (18px, 1.5) so the footer doesn't look heavier than the menu.
export const footerIconBoxClass = "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md";
export const FOOTER_ICON_SIZE = 18;
export const FOOTER_ICON_STROKE = 1.5;
const footerIconButtonClass = cn(footerIconBoxClass, "brand-sidebar-link transition-colors");

export function SidebarSettingsButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className={footerIconButtonClass}
      title={t('layout.sidebar.mySettings')}
      aria-label={t('layout.sidebar.mySettings')}
    >
      <SlidersHorizontal size={FOOTER_ICON_SIZE} strokeWidth={FOOTER_ICON_STROKE} />
    </button>
  );
}

export function SidebarLogoutButton() {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={signOut}
      className={footerIconButtonClass}
      title={t('layout.sidebar.signOut')}
      aria-label={t('layout.sidebar.signOut')}
    >
      <LogOut size={FOOTER_ICON_SIZE} strokeWidth={FOOTER_ICON_STROKE} />
    </button>
  );
}

// Collapsed footer column: security shield first, then the CRM/Outlook status
// icons, My Settings and Sign Out.
export function CollapsedSidebarButtons({ onOpenSettings, connections }: { onOpenSettings: () => void; connections?: ReactNode }) {
  const { t } = useTranslation();
  const [isSecurityDrawerOpen, setIsSecurityDrawerOpen] = useState(false);
  const { user } = useAuth();

  const { data: securityHealth } = useQuery({
    queryKey: ["/api/me/security"],
    enabled: !!user?.id,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const getShieldConfig = () => {
    const health = (securityHealth as any)?.health || 'red';

    switch (health) {
      case 'green':
        return {
          icon: ShieldCheck,
          className: "text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20",
          label: t('layout.sidebar.security.complete'),
        };
      case 'amber':
        return {
          icon: ShieldUser,
          className: "text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20",
          label: t('layout.sidebar.security.partial'),
        };
      case 'red':
      default:
        return {
          icon: ShieldAlert,
          className: "text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20",
          label: t('layout.sidebar.security.incomplete'),
        };
    }
  };

  const shieldConfig = getShieldConfig();
  const ShieldIcon = shieldConfig.icon;

  return (
    <>
      <div className="flex flex-col items-center gap-2 pb-2">
        <button
          type="button"
          onClick={() => setIsSecurityDrawerOpen(true)}
          className={cn(footerIconBoxClass, "transition-colors", shieldConfig.className)}
          title={shieldConfig.label}
          aria-label={shieldConfig.label}
        >
          <ShieldIcon size={FOOTER_ICON_SIZE} strokeWidth={FOOTER_ICON_STROKE} />
        </button>

        {connections}

        <SidebarSettingsButton onClick={onOpenSettings} />
        <SidebarLogoutButton />
      </div>

      {isSecurityDrawerOpen && (
        <SecurityStatusDrawer 
          isOpen={isSecurityDrawerOpen}
          onClose={() => setIsSecurityDrawerOpen(false)}
          securityHealth={securityHealth}
        />
      )}
    </>
  );
}
