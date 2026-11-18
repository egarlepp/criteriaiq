import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showSuccessToast } from "@/lib/toast-helper";
import { Lock, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { PasswordRuleChecklist } from "@/components/shared/PasswordRuleChecklist";
import {
  ADMIN_PASSWORD_HISTORY_DEFAULT_SIZE,
  PASSWORD_RECENTLY_USED_ERROR_CODE,
  adminErrorFallback,
  validateAdminPasswordField,
} from "@shared/admin-validation";

interface ForcePasswordChangeCardProps {
  onComplete: () => void;
}

export function ForcePasswordChangeCard({ onComplete }: ForcePasswordChangeCardProps) {
  const { t } = useTranslation();
  
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  // Size of the per-user password history the server enforces. Drives the
  // up-front "cannot reuse last N" helper text under the password field so
  // the user knows the rule before they submit. Defaults to the shared
  // constant and is upgraded to the authoritative server value the first
  // time the reuse-error channel surfaces a `historySize`, keeping the
  // helper text and the inline error in lockstep — same pattern as the
  // admin Create/Edit User dialog.
  const [historySize, setHistorySize] = useState<number>(
    ADMIN_PASSWORD_HISTORY_DEFAULT_SIZE,
  );
  const [passwordReuseError, setPasswordReuseError] = useState<string | null>(null);

  const validatePassword = (password: string) => {
    const code = validateAdminPasswordField(password);
    return code ? adminErrorFallback(code) : "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setPasswordReuseError(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError(t("auth.forcePasswordChange.errors.allFieldsRequired"));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t("auth.forcePasswordChange.errors.mismatch"));
      return;
    }

    if (currentPassword === newPassword) {
      setError(t("auth.forcePasswordChange.errors.samePassword"));
      return;
    }

    const validationError = validatePassword(newPassword);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/users/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      if (!response.ok) {
        // Prefer `message` (history-match envelope), fall back to
        // `error` for the legacy shape.
        const data: {
          message?: string;
          error?: string;
          errorCode?: string;
          historySize?: number;
        } = await response.json().catch(() => ({}));
        // When the server rejects the new password as recently-used we
        // surface the message inline under the password field instead of
        // the generic alert at the top of the card — mirrors the admin
        // Create/Edit User dialog so the failure has a clear,
        // field-scoped remediation.
        if (data.errorCode === PASSWORD_RECENTLY_USED_ERROR_CODE) {
          const serverHistorySize =
            typeof data.historySize === "number" && data.historySize > 0
              ? data.historySize
              : ADMIN_PASSWORD_HISTORY_DEFAULT_SIZE;
          // Promote the authoritative server value so the up-front
          // helper text and the inline error always quote the same
          // number.
          setHistorySize(serverHistorySize);
          setPasswordReuseError(
            t("profile.security.passwordRecentlyUsed", { count: serverHistorySize }),
          );
          return;
        }
        throw new Error(
          data.message || data.error || t("auth.forcePasswordChange.errors.generic"),
        );
      }

      showSuccessToast(t("auth.forcePasswordChange.successTitle"), t("auth.forcePasswordChange.successDescription"));

      onComplete();
    } catch (err: any) {
      setError(err.message || t("auth.forcePasswordChange.errors.generic"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl">
      <CardHeader className="text-center pb-4">
        <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <ShieldCheck className="w-7 h-7 text-amber-600 dark:text-amber-400" />
        </div>
        <CardTitle className="text-xl text-gray-900 dark:text-gray-100">{t("auth.forcePasswordChange.title")}</CardTitle>
        <CardDescription className="text-gray-600 dark:text-gray-400">
          {t("auth.forcePasswordChange.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="currentPassword" className="text-gray-700 dark:text-gray-300">{t("auth.forcePasswordChange.currentPasswordLabel")}</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
              <Input
                id="currentPassword"
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="pl-10 pr-10"
                placeholder={t("auth.forcePasswordChange.currentPasswordPlaceholder")}
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword" className="text-gray-700 dark:text-gray-300">{t("auth.forcePasswordChange.newPasswordLabel")}</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
              <Input
                id="newPassword"
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  // Drop the prior reuse warning the moment the user
                  // starts typing a new candidate so it never appears
                  // stale relative to the input.
                  if (passwordReuseError) setPasswordReuseError(null);
                }}
                className="pl-10 pr-10"
                placeholder={t("auth.forcePasswordChange.newPasswordPlaceholder")}
                aria-describedby="force-pw-rules force-pw-no-reuse"
                aria-invalid={!!passwordReuseError}
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <PasswordRuleChecklist password={newPassword} id="force-pw-rules" />
            <p
              id="force-pw-no-reuse"
              className="mt-1 text-xs text-muted-foreground"
              data-testid="text-password-help-no-reuse"
            >
              {t("users.passwordHelpNoReuse", { count: historySize })}
            </p>
            {passwordReuseError && (
              <p
                className="text-sm text-red-500 mt-1"
                role="alert"
                data-testid="text-password-reuse-error"
              >
                {passwordReuseError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-gray-700 dark:text-gray-300">{t("auth.forcePasswordChange.confirmPasswordLabel")}</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
              <Input
                id="confirmPassword"
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="pl-10 pr-10"
                placeholder={t("auth.forcePasswordChange.confirmPasswordPlaceholder")}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? t("auth.forcePasswordChange.submitting") : t("auth.forcePasswordChange.submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
