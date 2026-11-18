import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, AlertCircle } from "lucide-react";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { apiRequest } from "@/lib/queryClient";
import { AuthShell } from "@/components/shared/AuthShell";
import { PasswordRuleChecklist } from "@/components/shared/PasswordRuleChecklist";
import { markSessionEstablished } from "@/lib/session-marker";
import {
  ADMIN_PASSWORD_HISTORY_DEFAULT_SIZE,
  PASSWORD_RECENTLY_USED_ERROR_CODE,
  adminErrorFallback,
  validateAdminPasswordField,
} from "@shared/admin-validation";

export default function ResetPassword() {
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isValid, setIsValid] = useState(true);
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

  useEffect(() => {
    // Get token from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token');

    // Trim defensively. Mail clients sometimes append a stray space or
    // newline when the operator copies the link by hand, and the token
    // is a hex string so whitespace can never be legitimate. Without
    // this, the server-side lookup produces a "token not found" miss
    // and the user sees a generic "invalid or expired" error even
    // though their click was on an unexpired link (Task #535).
    const trimmedToken = tokenParam?.trim() ?? "";

    if (trimmedToken) {
      setToken(trimmedToken);
    } else {
      setIsValid(false);
      showErrorToast(
        t("auth.resetPassword.invalid.toastTitle"),
        t("auth.resetPassword.invalid.toastDescription"),
      );
    }
  }, [t]);

  const validatePassword = (password: string) => {
    const code = validateAdminPasswordField(password);
    return code ? adminErrorFallback(code) : "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordReuseError(null);

    if (!token) {
      showErrorToast(
        t("auth.resetPassword.errors.missingTokenTitle"),
        t("auth.resetPassword.errors.missingTokenDescription"),
      );
      return;
    }

    // Trim before every check so the validation gate, the mismatch
    // check, and the wire payload all see the exact same string. The
    // login form (handleAuth in landing.tsx) does NOT trim the typed
    // password, so a reset that stored `"NewP@ss1 "` (with a trailing
    // space copy-pasted from the email body) would pass our checklist
    // here but then never match at sign-in. The server also trims as
    // defense-in-depth; this trims first so the FE's mismatch check
    // and complexity rules see the canonical value (Task #535).
    const trimmedNewPassword = newPassword.trim();
    const trimmedConfirmPassword = confirmPassword.trim();

    const passwordError = validatePassword(trimmedNewPassword);
    if (passwordError) {
      showErrorToast(
        t("auth.resetPassword.errors.validationTitle"),
        passwordError,
      );
      return;
    }

    if (trimmedNewPassword !== trimmedConfirmPassword) {
      showErrorToast(
        t("auth.resetPassword.errors.mismatchTitle"),
        t("auth.resetPassword.errors.mismatchDescription"),
      );
      return;
    }

    setIsLoading(true);

    try {
      // `apiRequest` returns parsed JSON on 2xx and throws an
      // `ApiError` (with `.status`/`.details`) on non-2xx. The previous
      // implementation treated the resolved value as a `Response`
      // object and called `.ok` / `.json()` on it — both undefined,
      // so the success path silently fell through to the catch block
      // and showed a generic error toast even though the password had
      // actually been reset on the server. That mismatch was the root
      // cause of the production support call this task closed
      // (Task #535).
      const data = await apiRequest('POST', '/api/auth/reset-password', {
        token,
        newPassword: trimmedNewPassword,
      });

      // Auto-login probe: the server now echoes the canonical email
      // back on the success envelope so we can sign the user in
      // immediately without making them re-type the password they
      // just chose. This keeps the post-reset experience identical to
      // the post-login experience (markSessionEstablished + navigate
      // to "/"). On any failure of the silent login (account locked,
      // MFA-required-but-not-yet-enrolled, etc.) we fall back to the
      // manual sign-in copy and let the user finish the flow on the
      // landing page (Task #535).
      const echoedEmail = typeof data?.email === "string" ? data.email : "";
      if (echoedEmail) {
        try {
          await apiRequest('POST', '/api/login', {
            email: echoedEmail,
            password: trimmedNewPassword,
          });
          markSessionEstablished();
          showSuccessToast(
            t("auth.resetPassword.successTitle"),
            t("auth.resetPassword.successAutoLoginDescription"),
          );
          // Hard navigation so the auth context reloads with the new
          // session cookie — same handoff landing.tsx does on
          // successful login.
          window.location.href = "/";
          return;
        } catch (loginError) {
          // Reset succeeded; auto sign-in didn't. Tell the user
          // exactly that — no false-positive success and no false
          // claim that the reset itself failed. Stay on this page so
          // the message is unmissable; the "Back to Login" link is
          // already visible for the manual sign-in path.
          showErrorToast(
            t("auth.resetPassword.errors.autoLoginFailedTitle"),
            t("auth.resetPassword.errors.autoLoginFailedDescription"),
          );
          return;
        }
      }

      // Older servers (or future code paths that drop the email echo)
      // fall back to the legacy "go log in" message instead of an
      // auto-login attempt. Unreachable today but kept so a partial
      // rollout never silently strands the user.
      showSuccessToast(
        t("auth.resetPassword.successTitle"),
        data?.message ?? t("auth.resetPassword.successManualLoginDescription"),
      );
      setTimeout(() => {
        navigate("/");
      }, 2000);
    } catch (error: any) {
      // When the server rejects the new password as recently-used we
      // surface the message inline under the password field instead of
      // a generic toast — mirrors the admin Create/Edit User dialog so
      // the failure has a clear, field-scoped remediation.
      const details = error?.details;
      if (details?.errorCode === PASSWORD_RECENTLY_USED_ERROR_CODE) {
        const serverHistorySize =
          typeof details.historySize === "number" && details.historySize > 0
            ? details.historySize
            : ADMIN_PASSWORD_HISTORY_DEFAULT_SIZE;
        // Promote the authoritative server value so the up-front helper
        // text and the inline error always quote the same number.
        setHistorySize(serverHistorySize);
        setPasswordReuseError(
          t("users.passwordRecentlyUsed", { count: serverHistorySize }),
        );
        return;
      }
      // Surface the server-supplied message when present (e.g.
      // "Invalid or expired reset token") so the user knows whether
      // to ask for a new link or just retry. Falls back to a generic
      // copy when the failure is something the API didn't articulate.
      const serverMessage = typeof error?.message === "string" ? error.message : "";
      showErrorToast(
        t("auth.resetPassword.errors.genericTitle"),
        serverMessage || t("auth.resetPassword.errors.genericDescription"),
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (!isValid) {
    // Wrapped in <AuthShell> so the operator following the emailed
    // reset link sees the same chrome (gradient, white-logo
    // watermark, theme toggle, Get Help, language switcher, version
    // footer) they see on login and on the sibling MFA / force-
    // password-change blocking screens. See task-434.
    return (
      <AuthShell>
        <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-16">
          <Card className="max-w-md w-full mx-auto">
            <CardHeader>
              <div className="flex items-center justify-center mb-4">
                <AlertCircle className="h-12 w-12 text-red-500" />
              </div>
              <CardTitle className="text-center">{t("auth.resetPassword.invalid.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 dark:text-gray-400 text-center mb-4">
                {t("auth.resetPassword.invalid.description")}
              </p>
              <Button
                className="w-full bg-primary hover:bg-blue-800"
                onClick={() => navigate("/")}
              >
                {t("auth.resetPassword.backToLogin")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </AuthShell>
    );
  }

  // Wrapped in <AuthShell> so the operator following the emailed
  // reset link sees the same chrome (gradient, white-logo
  // watermark, theme toggle, Get Help, language switcher, version
  // footer) they see on login and on the sibling MFA / force-
  // password-change blocking screens. See task-434.
  return (
    <AuthShell>
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-16">
        <Card className="max-w-md w-full mx-auto">
          <CardHeader>
            <CardTitle className="text-center">{t("auth.resetPassword.cardTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="newPassword">{t("auth.resetPassword.newPasswordLabel")}</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      // Drop the prior reuse warning the moment the user
                      // starts typing a new candidate so it never appears
                      // stale relative to the input.
                      if (passwordReuseError) setPasswordReuseError(null);
                    }}
                    required
                    placeholder={t("auth.resetPassword.newPasswordPlaceholder")}
                    aria-describedby="reset-pw-rules reset-pw-no-reuse"
                    aria-invalid={!!passwordReuseError}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <PasswordRuleChecklist password={newPassword} id="reset-pw-rules" />
                <p
                  id="reset-pw-no-reuse"
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

              <div>
                <Label htmlFor="confirmPassword">{t("auth.resetPassword.confirmPasswordLabel")}</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder={t("auth.resetPassword.confirmPasswordPlaceholder")}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={isLoading || !newPassword || !confirmPassword}
                className="w-full bg-primary hover:bg-blue-800"
              >
                {isLoading ? t("auth.resetPassword.submitting") : t("auth.resetPassword.submit")}
              </Button>

              <div className="text-center">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => navigate("/")}
                  className="text-sm"
                >
                  {t("auth.resetPassword.backToLogin")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AuthShell>
  );
}
