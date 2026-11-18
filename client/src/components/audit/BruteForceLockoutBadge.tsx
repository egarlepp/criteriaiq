import { ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { describeLoginFailureReason } from "@/lib/loginFailureReason";

interface BruteForceLockoutBadgeProps {
  /** Optional override for the outer wrapper class. */
  className?: string;
}

/**
 * Distinct visual treatment for an `mfa_rate_limited` audit row
 * (Task #619). The standard "Failed" badge buries the brute-force
 * pattern — admins shouldn't have to read the failureReason column to
 * notice a lockout. The shield-with-alert icon plus a red-accented
 * label and an explanatory tooltip make the lockout pop in the
 * Activity Log feed.
 *
 * The descriptor's tooltip text is rendered through `title` on the
 * badge and exposed via `aria-label` so screen-reader users get the
 * same explanation ("5 failed MFA attempts in 15 minutes — account
 * temporarily locked out") as a sighted admin hovering the badge.
 */
export function BruteForceLockoutBadge({
  className,
}: BruteForceLockoutBadgeProps) {
  const info = describeLoginFailureReason("mfa_rate_limited");

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs font-semibold gap-1 border-red-400 bg-red-50 text-red-800 dark:border-red-600 dark:bg-red-900/30 dark:text-red-200",
        className,
      )}
      title={info.tooltip}
      aria-label={info.tooltip}
      data-testid="brute-force-lockout-badge"
      data-failure-reason={info.raw}
    >
      <ShieldAlert className="h-3 w-3" aria-hidden="true" />
      {info.label}
    </Badge>
  );
}
