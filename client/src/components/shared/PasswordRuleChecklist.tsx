import { Check, Circle } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  ADMIN_PASSWORD_MIN_LENGTH,
  adminPasswordRuleStatus,
  adminPasswordStrengthScore,
  type AdminPasswordRuleId,
  type AdminPasswordStrengthLabel,
} from "@shared/admin-validation";

const ADMIN_PASSWORD_RULE_ORDER: AdminPasswordRuleId[] = [
  "length",
  "uppercase",
  "lowercase",
  "digit",
  "special",
];

/**
 * Tailwind color classes per coarse strength bucket. Kept next to the
 * checklist so the bar and the text label always agree on color, and so a
 * future bucket only needs editing in one place.
 */
const ADMIN_PASSWORD_STRENGTH_STYLES: Record<
  AdminPasswordStrengthLabel,
  { fill: string; text: string }
> = {
  weak: {
    fill: "bg-red-500 dark:bg-red-500",
    text: "text-red-600 dark:text-red-500",
  },
  fair: {
    fill: "bg-amber-500 dark:bg-amber-500",
    text: "text-amber-600 dark:text-amber-500",
  },
  strong: {
    fill: "bg-green-500 dark:bg-green-500",
    text: "text-green-600 dark:text-green-500",
  },
};

export interface PasswordStrengthBarProps {
  password: string;
}

/**
 * Standalone five-segment strength bar used by surfaces that want the
 * colored bar without the full per-rule checklist (e.g. the admin
 * user-create dialog, where the inline error already explains rule
 * failures). Re-exported so every admin password field renders the same
 * bar driven by `adminPasswordStrengthScore`.
 */
export function PasswordStrengthBar({ password }: PasswordStrengthBarProps) {
  const { t } = useTranslation();
  const { score, segments, label } = adminPasswordStrengthScore(password);
  const styles = ADMIN_PASSWORD_STRENGTH_STYLES[label];
  const hasInput = password.length > 0;
  return (
    <div className="mt-1 space-y-1" data-testid="admin-password-strength">
      <div
        className="flex gap-1"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={segments}
        aria-valuenow={score}
        aria-valuetext={hasInput ? t(`setup.admin.passwordRules.strength.${label}`) : undefined}
        aria-label={t("setup.admin.passwordRules.strength.barLabel")}
        data-strength-label={label}
        data-strength-score={score}
      >
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-sm ${
              i < score ? styles.fill : "bg-muted"
            }`}
            data-testid={`admin-password-strength-segment-${i}`}
            data-filled={i < score ? "true" : "false"}
          />
        ))}
      </div>
      {hasInput && (
        <p
          className={`text-xs font-medium ${styles.text}`}
          data-testid="admin-password-strength-label"
        >
          {t(`setup.admin.passwordRules.strength.${label}`)}
        </p>
      )}
    </div>
  );
}

interface PasswordRuleChecklistProps {
  password: string;
  /**
   * DOM id used by the surrounding password input via `aria-describedby` so
   * screen readers announce the rule list when the field gains focus.
   */
  id: string;
  className?: string;
}

/**
 * Live per-rule checklist (with a colored strength bar) for the admin
 * password field. Reused across the setup wizard's Create Admin step, the
 * Profile / Change Password tab, the forced password-change card, and the
 * password-reset page so all four surfaces stay in lockstep with the
 * server's validation rules.
 *
 * The boolean status of each rule is derived from `adminPasswordRuleStatus`
 * in `shared/admin-validation.ts`, the same module the server uses, so the
 * UI can never claim a rule is satisfied that the server would still reject.
 */
export function PasswordRuleChecklist({
  password,
  id,
  className,
}: PasswordRuleChecklistProps) {
  const { t } = useTranslation();
  const status = adminPasswordRuleStatus(password);
  return (
    <>
      <PasswordStrengthBar password={password} />
      <ul
        id={id}
        className={`mt-1 space-y-0.5 text-xs ${className ?? ""}`.trim()}
        data-testid="admin-password-checklist"
        aria-label={t("setup.admin.passwordChecklistLabel")}
      >
        {ADMIN_PASSWORD_RULE_ORDER.map((rule) => {
          const met = status[rule];
          const label =
            rule === "length"
              ? t("setup.admin.passwordRules.length", { min: ADMIN_PASSWORD_MIN_LENGTH })
              : t(`setup.admin.passwordRules.${rule}`);
          return (
            <li
              key={rule}
              className={`flex items-center gap-1.5 ${
                met ? "text-green-600 dark:text-green-500" : "text-muted-foreground"
              }`}
              data-testid={`admin-password-rule-${rule}`}
              data-met={met ? "true" : "false"}
            >
              {met ? (
                <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <Circle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              )}
              <span>{label}</span>
              <span className="sr-only">
                {met
                  ? t("setup.admin.passwordRules.metSr")
                  : t("setup.admin.passwordRules.unmetSr")}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export default PasswordRuleChecklist;
