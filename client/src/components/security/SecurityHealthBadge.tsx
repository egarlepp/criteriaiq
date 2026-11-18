import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertTriangle, XCircle, ShieldUser } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export interface SecurityHealth {
  enabled: boolean;
  method: 'totp' | 'webauthn' | null;
  enrolledAt: string | null;
  recoveryCount: number;
  passkeyCount: number;
  health: 'green' | 'amber' | 'red';
}

interface SecurityHealthBadgeProps {
  securityHealth: SecurityHealth;
  size?: 'sm' | 'md' | 'lg';
  showDetails?: boolean;
  className?: string;
}

export function SecurityHealthBadge({
  securityHealth,
  size = 'md',
  showDetails = false,
  className
}: SecurityHealthBadgeProps) {
  const { t } = useTranslation();

  function getHealthConfig(health: 'green' | 'amber' | 'red') {
    switch (health) {
      case 'green':
        return {
          variant: 'default' as const,
          bgColor: 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800',
          textColor: 'text-green-800 dark:text-green-100',
          icon: CheckCircle,
          label: t('security.healthBadge.secure'),
          description: t('security.healthBadge.secureDescription')
        };
      case 'amber':
        return {
          variant: 'secondary' as const,
          bgColor: 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800',
          textColor: 'text-yellow-800 dark:text-yellow-100',
          icon: AlertTriangle,
          label: t('security.healthBadge.partial'),
          description: t('security.healthBadge.partialDescription')
        };
      case 'red':
      default:
        return {
          variant: 'destructive' as const,
          bgColor: 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800',
          textColor: 'text-red-800 dark:text-red-100',
          icon: XCircle,
          label: t('security.healthBadge.insecure'),
          description: t('security.healthBadge.insecureDescription')
        };
    }
  }

  function getSizeClasses(size: 'sm' | 'md' | 'lg') {
    switch (size) {
      case 'sm':
        return {
          badge: 'text-xs px-2 py-0.5',
          icon: 'h-3 w-3',
          text: 'text-xs'
        };
      case 'lg':
        return {
          badge: 'text-sm px-3 py-1',
          icon: 'h-5 w-5',
          text: 'text-sm'
        };
      case 'md':
      default:
        return {
          badge: 'text-xs px-2.5 py-0.5',
          icon: 'h-4 w-4',
          text: 'text-xs'
        };
    }
  }

  const config = getHealthConfig(securityHealth.health);
  const sizeClasses = getSizeClasses(size);
  const IconComponent = config.icon;

  if (!showDetails) {
    // Simple badge version with explicit colors for clear differentiation
    return (
      <Badge
        variant={config.variant}
        className={cn(
          "inline-flex items-center gap-1.5 font-semibold border",
          sizeClasses.badge,
          // Explicit color classes to ensure clear green/amber/red differentiation
          securityHealth.health === 'green' && "bg-green-50 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-100 dark:border-green-800",
          securityHealth.health === 'amber' && "bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-100 dark:border-yellow-800",
          securityHealth.health === 'red' && "bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-100 dark:border-red-800",
          className
        )}
        title={config.description}
      >
        <IconComponent className={sizeClasses.icon} />
        {config.label}
      </Badge>
    );
  }

  // Detailed version with additional info
  return (
    <div className={cn(
      "inline-flex items-center gap-2 p-2 rounded-lg border",
      config.bgColor,
      className
    )}>
      <div className="flex items-center gap-1.5">
        <IconComponent className={cn(sizeClasses.icon, config.textColor)} />
        <Badge
          variant={config.variant}
          className={cn("font-semibold", sizeClasses.badge)}
        >
          {config.label}
        </Badge>
      </div>

      {showDetails && (
        <div className={cn("flex items-center gap-3", sizeClasses.text, config.textColor)}>
          <div className="flex items-center gap-1">
            <ShieldUser className="h-3 w-3" />
            <span>{t('security.healthBadge.mfaLabel')} {securityHealth.enabled ? t('security.healthBadge.mfaOn') : t('security.healthBadge.mfaOff')}</span>
          </div>

          {securityHealth.enabled && (
            <>
              <span>•</span>
              <span>{t('security.healthBadge.methodLabel')} {securityHealth.method?.toUpperCase() || t('security.healthBadge.noneMethod')}</span>

              {securityHealth.recoveryCount > 0 && (
                <>
                  <span>•</span>
                  <span>{t('security.healthBadge.recoveryCodes', { count: securityHealth.recoveryCount })}</span>
                </>
              )}

              {securityHealth.passkeyCount > 0 && (
                <>
                  <span>•</span>
                  <span>{t('security.healthBadge.passkeys', { count: securityHealth.passkeyCount })}</span>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
