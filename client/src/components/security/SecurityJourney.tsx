import { useQuery } from "@tanstack/react-query";
import { CheckCircle, Circle, Clock, AlertCircle, ShieldUser, Key, Smartphone, Fingerprint } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface SecurityJourneyProps {
  securityHealth?: any;
  userId?: string; // For admin views
  className?: string;
}

export function SecurityJourney({ securityHealth, userId, className }: SecurityJourneyProps) {
  const { t } = useTranslation();
  // Fetch security events for the journey timeline
  const { data: events } = useQuery({
    queryKey: userId ? ["/api/admin/users", userId, "security"] : ["/api/me/security/events"],
    enabled: !!securityHealth,
    staleTime: 30000,
  });

  // Define security journey steps
  const getJourneySteps = () => {
    const isEnabled = securityHealth?.enabled || false;
    const recoveryCount = securityHealth?.recoveryCount || 0;
    const passkeyCount = securityHealth?.passkeyCount || 0;

    return [
      {
        id: 'mfa_setup',
        title: t('security.journey.stepMfa'),
        description: t('security.journey.stepMfaDescription'),
        icon: Key,
        completed: isEnabled,
        status: isEnabled ? 'completed' : 'pending'
      },
      {
        id: 'recovery_codes',
        title: t('security.journey.stepRecovery'),
        description: t('security.journey.stepRecoveryDescription'),
        icon: Smartphone,
        completed: recoveryCount > 0,
        status: recoveryCount > 0 ? 'completed' : (isEnabled ? 'pending' : 'disabled'),
        requirement: t('security.journey.requiresMfa')
      },
      {
        id: 'passkeys',
        title: t('security.journey.stepPasskeys'),
        description: t('security.journey.stepPasskeysDescription'),
        icon: Fingerprint,
        completed: passkeyCount > 0,
        status: passkeyCount > 0 ? 'completed' : (isEnabled ? 'optional' : 'disabled'),
        requirement: t('security.journey.requiresMfa')
      }
    ];
  };

  const steps = getJourneySteps();

  // Get status icon and styling
  const getStepIcon = (step: any) => {
    const IconComponent = step.icon;

    switch (step.status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />;
      case 'pending':
        return <Circle className="w-5 h-5 text-amber-600 dark:text-amber-400" />;
      case 'optional':
        return <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />;
      case 'disabled':
      default:
        return <Circle className="w-5 h-5 text-gray-400 dark:text-gray-500" />;
    }
  };

  const getStepStatusText = (step: any) => {
    switch (step.status) {
      case 'completed':
        return t('security.journey.statusCompleted');
      case 'pending':
        return t('security.journey.statusRequired');
      case 'optional':
        return t('security.journey.statusOptional');
      case 'disabled':
      default:
        return t('security.journey.statusDisabled');
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Journey Steps */}
      <div className="space-y-3">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={cn(
              "flex items-start gap-3 p-3 rounded-lg transition-colors",
              step.status === 'completed' ? "bg-green-50 dark:bg-green-900/30" :
              step.status === 'pending' ? "bg-amber-50 dark:bg-amber-900/30" :
              step.status === 'optional' ? "bg-blue-50 dark:bg-blue-900/30" : "bg-gray-50 dark:bg-slate-800"
            )}
          >
            {/* Status Icon */}
            <div className="mt-0.5">
              {getStepIcon(step)}
            </div>

            {/* Step Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <h4 className="font-medium text-gray-900 dark:text-gray-100">{step.title}</h4>
                <span className={cn(
                  "text-xs px-2 py-1 rounded-full font-medium",
                  step.status === 'completed' ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300" :
                  step.status === 'pending' ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300" :
                  step.status === 'optional' ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300" : "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400"
                )}>
                  {getStepStatusText(step)}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">{step.description}</p>
              {step.requirement && step.status === 'disabled' && (
                <p className="text-xs text-gray-500 dark:text-gray-400 italic">{step.requirement}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Recent Events Timeline */}
      {(events as any)?.events && (events as any).events.length > 0 && (
        <div className="border-t dark:border-slate-700 pt-4">
          <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            {t('security.journey.recentActivity')}
          </h4>
          <div className="space-y-3">
            {((events as any).events || []).slice(0, 5).map((event: any) => (
              <div key={event.id} className="flex items-start gap-3 text-sm">
                <div className="mt-1">
                  <div className="w-2 h-2 bg-blue-600 dark:bg-blue-400 rounded-full" />
                </div>
                <div className="flex-1">
                  <p className="text-gray-900 dark:text-gray-100">{event.eventType.replace('_', ' ')}</p>
                  <p className="text-gray-500 dark:text-gray-400 text-xs">
                    {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {(!(events as any)?.events || (events as any).events.length === 0) && (
        <div className="border-t dark:border-slate-700 pt-4">
          <div className="text-center py-4">
            <ShieldUser className="w-8 h-8 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('security.journey.noEvents')}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">{t('security.journey.noEventsHint')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
