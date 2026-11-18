import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface LoginEventStatusBadgeProps {
  /**
   * Raw `audit_logins.success` value. The column defaults to `true` in
   * the schema, so we treat `null`/`undefined` as a successful login
   * and only show the red "Failed" badge for an explicit `false`.
   */
  success: boolean | null | undefined;
  className?: string;
}

export function LoginEventStatusBadge({
  success,
  className,
}: LoginEventStatusBadgeProps) {
  const { t } = useTranslation();
  const isFailure = success === false;

  if (isFailure) {
    return (
      <Badge
        variant="outline"
        className={cn("text-xs text-red-600 dark:text-red-400 border-red-300 dark:border-red-700", className)}
        data-testid="login-event-status-badge"
        data-login-success="false"
      >
        {t("audit.loginEventStatus.failed")}
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn("text-xs text-green-600 dark:text-green-400", className)}
      data-testid="login-event-status-badge"
      data-login-success="true"
    >
      {t("audit.loginEventStatus.success")}
    </Badge>
  );
}
