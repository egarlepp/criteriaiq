import { KeyRound, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  describeLoginMethod,
  LOGIN_METHOD_RECOVERY_TAG_I18N_KEY,
  type LoginMethodDescriptor,
} from "@/lib/loginMethod";

interface LoginMethodBadgeProps {
  /** Raw `audit_logins.loginMethod` value (e.g. "email", "mfa-recovery"). */
  method: string | null | undefined;
  /** Optional override for the outer wrapper class. */
  className?: string;
}

/**
 * Render a humanized, scannable badge for a login method value.
 *
 * - Plain methods (e.g. "email") render as a neutral secondary badge.
 * - MFA-gated methods get a shield icon and a subtle accent.
 * - Recovery-code redemptions get the prominent amber treatment + an
 *   adjacent "Recovery code" tag so admins can spot them at a glance
 *   when scrolling the Recent Logins / Audit Login surfaces.
 *
 * Labels (and the "Recovery code" tag) come from the i18n bundles under
 * `profile.activity.methods.*` so admins on non-English locales see the
 * humanized strings in their own language (Task #622).
 */
export function LoginMethodBadge({ method, className }: LoginMethodBadgeProps) {
  const { t } = useTranslation();
  const info = describeLoginMethod(method, {
    translate: (key, defaultValue) => t(key, defaultValue),
  });

  if (info.isRecovery) {
    const recoveryTagLabel = t(
      LOGIN_METHOD_RECOVERY_TAG_I18N_KEY,
      "Recovery code",
    );
    return (
      <span
        className={cn("inline-flex items-center gap-1.5", className)}
        data-testid="login-method-badge"
        data-login-method={info.raw}
      >
        <Badge
          variant="outline"
          className="text-xs font-medium gap-1 border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200"
          title={info.raw}
        >
          <KeyRound className="h-3 w-3" aria-hidden="true" />
          {info.label}
        </Badge>
        <Badge
          variant="outline"
          className="text-[10px] uppercase tracking-wide border-amber-500 bg-amber-100 text-amber-900 dark:border-amber-500 dark:bg-amber-800/40 dark:text-amber-100"
          aria-label={recoveryTagLabel}
        >
          {recoveryTagLabel}
        </Badge>
      </span>
    );
  }

  if (info.isMfa) {
    return (
      <Badge
        variant="secondary"
        className={cn(
          "text-xs font-medium gap-1 border border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200",
          className,
        )}
        title={info.raw}
        data-testid="login-method-badge"
        data-login-method={info.raw}
      >
        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
        {info.label}
      </Badge>
    );
  }

  return (
    <Badge
      variant="secondary"
      className={cn("text-xs font-medium", className)}
      title={info.raw}
      data-testid="login-method-badge"
      data-login-method={info.raw}
    >
      {info.label}
    </Badge>
  );
}

export type { LoginMethodDescriptor };
