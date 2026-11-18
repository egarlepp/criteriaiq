import { useEffect, useMemo, useRef, useState } from "react";
import { useSearch, Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthShell } from "@/components/shared/AuthShell";
import MFAChallengeDialog from "@/components/security/MFAChallengeDialog";
import { apiRequest } from "@/lib/queryClient";
import { markSessionEstablished } from "@/lib/session-marker";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { AlertTriangle, Lock, Loader2 } from "lucide-react";

/**
 * SSO outcome / error landing page. Three roles:
 *
 *  1. Display the user-facing message for a failed Okta SSO or Azure SSO
 *     callback (`?reason=...&provider=okta|azure`). The OIDC callback in server/auth/oidcAuth.ts
 *     redirects here on any branch that isn't a successful session
 *     established.
 *
 *  2. Drive the link-existing-user-to-SSO confirmation flow. When
 *     `reason=link_password_required`, render a small password form
 *     that calls POST /api/auth/sso/link-confirm. Without explicit
 *     re-confirmation we'd auto-link any password account by email
 *     match — that's the account-takeover hole called out in the
 *     plan's security gap list.
 *
 *  3. Finish an SSO sign-in that needs CriteriaIQ MFA. When
 *     `reason=mfa_required`, fetch the parked challenge once from
 *     POST /api/auth/sso/mfa-pending and show the same MFAChallengeDialog
 *     password sign-in uses (server/auth/ssoMfaHandoff.ts).
 *
 *  4. Offer the user a path back: retry the same provider, or use
 *     password sign-in.
 */

// Retry paths per provider; must match PROVIDERS in server/auth/oidcAuth.ts.
const SSO_LOGIN_PATHS = {
  okta: "/api/auth/sso/login",
  azure: "/api/auth/sso/azure/login",
} as const;
type SsoProviderName = keyof typeof SSO_LOGIN_PATHS;

function isSsoProviderName(value: string | null): value is SsoProviderName {
  return value === "okta" || value === "azure";
}
export default function SsoError() {
  const { t } = useTranslation();
  const search = useSearch();
  const [, navigate] = useLocation();

  const params = useMemo(() => new URLSearchParams(search), [search]);
  const reason = params.get("reason") ?? "idp_returned_error";
  const email = params.get("email") ?? "";
  const providerParam = params.get("provider");
  const provider: SsoProviderName = isSsoProviderName(providerParam) ? providerParam : "okta";
  const providerLabel = t(`auth.sso.providers.${provider}`);

  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [reason]);

  const isMfaFlow = reason === "mfa_required";
  const [mfaChallenge, setMfaChallenge] = useState<{ temporaryToken: string; userEmail: string } | null>(null);
  const [mfaLoading, setMfaLoading] = useState(isMfaFlow);
  // The server hands the challenge out once, so a second effect run
  // (React strict mode) must not ask again.
  const mfaRequested = useRef(false);

  useEffect(() => {
    if (!isMfaFlow || mfaRequested.current) return;
    mfaRequested.current = true;
    apiRequest("POST", "/api/auth/sso/mfa-pending", {})
      .then((data: { temporaryToken?: string; userEmail?: string }) => {
        if (data?.temporaryToken) {
          setMfaChallenge({ temporaryToken: data.temporaryToken, userEmail: data.userEmail ?? "" });
        } else {
          setError(t("auth.sso.error.mfa_required.expired"));
        }
      })
      .catch(() => setError(t("auth.sso.error.mfa_required.expired")))
      .finally(() => setMfaLoading(false));
  }, [isMfaFlow, t]);

  // Reasons → translated messaging. Each branch lists a title +
  // description so the user always sees an actionable explanation.
  const messageFor = (r: string): { title: string; description: string } => {
    switch (r) {
      case "email_not_verified":
        return {
          title: t("auth.sso.error.email_not_verified.title", { defaultValue: "Email not verified" }),
          description: t("auth.sso.error.email_not_verified.description", { provider: providerLabel }),
        };
      case "external_role_not_eligible":
        return {
          title: t("auth.sso.error.external_role.title", { defaultValue: "SSO is for internal users" }),
          description: t("auth.sso.error.external_role.description", {
            defaultValue:
              "Single sign-on is currently available to internal staff only. Please use the email + password sign-in.",
          }),
        };
      case "domain_not_allowed":
        return {
          title: t("auth.sso.error.domain_not_allowed.title", { defaultValue: "Domain not approved" }),
          description: t("auth.sso.error.domain_not_allowed.description", {
            defaultValue:
              "Your email domain isn't on the approved list. Contact your CriteriaIQ administrator.",
          }),
        };
      case "pending_admin_approval":
        return {
          title: t("auth.sso.error.pending_approval.title", { defaultValue: "Pending administrator approval" }),
          description: t("auth.sso.error.pending_approval.description", {
            defaultValue:
              "Your account has been created and is awaiting administrator approval. You'll receive an email when access is granted.",
          }),
        };
      case "user_inactive":
        return {
          title: t("auth.sso.error.user_inactive.title", { defaultValue: "Account is inactive" }),
          description: t("auth.sso.error.user_inactive.description", {
            defaultValue: "Your CriteriaIQ account is inactive. Contact your administrator to restore access.",
          }),
        };
      case "callback_expired":
        return {
          title: t("auth.sso.error.callback_expired.title", { defaultValue: "Sign-in expired" }),
          description: t("auth.sso.error.callback_expired.description", {
            defaultValue: "Your sign-in attempt timed out or was reloaded. Please try again.",
          }),
        };
      case "rate_limited":
        return {
          title: t("auth.sso.error.rate_limited.title", { defaultValue: "Too many attempts" }),
          description: t("auth.sso.error.rate_limited.description", {
            defaultValue: "Too many sign-in attempts from your network. Please wait a few minutes and try again.",
          }),
        };
      case "sso_disabled":
        return {
          title: t("auth.sso.error.sso_disabled.title", { defaultValue: "Single sign-on is disabled" }),
          description: t("auth.sso.error.sso_disabled.description", {
            defaultValue: "SSO is not currently enabled on this CriteriaIQ instance.",
          }),
        };
      case "link_password_required":
        return {
          title: t("auth.sso.error.link_password.title", { defaultValue: "Link your CriteriaIQ account" }),
          description: t("auth.sso.error.link_password.description", { provider: providerLabel }),
        };
      case "mfa_required":
        return {
          title: t("auth.sso.error.mfa_required.title"),
          description: t("auth.sso.error.mfa_required.description", { provider: providerLabel }),
        };
      case "sso_not_allowed":
        return {
          title: t("auth.sso.error.sso_not_allowed.title", { defaultValue: "Password sign-in required" }),
          description: t("auth.sso.error.sso_not_allowed.description", {
            defaultValue:
              "Your administrator has set this account to sign in with a password. Please use the email and password form instead.",
          }),
        };
      case "no_account":
        return {
          title: t("auth.sso.error.no_account.title"),
          description: t("auth.sso.error.no_account.description", { provider: providerLabel }),
        };
      case "linked_to_other_identity":
        return {
          title: t("auth.sso.error.linked_to_other_identity.title"),
          description: t("auth.sso.error.linked_to_other_identity.description", { provider: providerLabel }),
        };
      // "okta_returned_error" is the pre-Azure name for idp_returned_error;
      // kept so an old bookmarked URL still renders the right message.
      case "idp_returned_error":
      case "okta_returned_error":
      default:
        return {
          title: t("auth.sso.error.okta_returned.title", { defaultValue: "Sign-in failed" }),
          description: t("auth.sso.error.okta_returned.description", { provider: providerLabel }),
        };
    }
  };

  const message = messageFor(reason);
  const isLinkFlow = reason === "link_password_required";
  // Retrying can't succeed when the account is password-only, has no
  // CriteriaIQ account (JIT off), or is bound to a different identity.
  const canRetry = !["sso_not_allowed", "no_account", "linked_to_other_identity"].includes(reason);

  const handleLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest("POST", "/api/auth/sso/link-confirm", { password });
      markSessionEstablished();
      showSuccessToast(
        t("auth.sso.error.link_password.success_title", { defaultValue: "Accounts linked" }),
        t("auth.sso.error.link_password.success_message", { provider: providerLabel }),
      );
      window.location.href = "/";
    } catch (err: any) {
      const body = err?.responseBody ?? {};
      const code = body.code as string | undefined;
      const messageText =
        code === "invalid_password"
          ? t("auth.sso.error.link_password.invalid_password", { defaultValue: "Incorrect password." })
          : code === "sso_not_allowed"
            ? t("auth.sso.error.sso_not_allowed.description", {
                defaultValue:
                  "Your administrator has set this account to sign in with a password. Please use the email and password form instead.",
              })
          : code === "link_expired"
            ? t("auth.sso.error.link_password.expired", { defaultValue: "Link request expired. Please start sign-in again." })
            : (body.message ?? "Link failed");
      setError(messageText);
      showErrorToast(t("auth.sso.error.link_password.failed_title", { defaultValue: "Link failed" }), messageText);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <div className="w-full max-w-md">
        <Card className="bg-white dark:bg-gray-950">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {isLinkFlow || isMfaFlow ? (
                <Lock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              )}
              {message.title}
            </CardTitle>
            <CardDescription>{message.description}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {isLinkFlow ? (
              <form onSubmit={handleLinkSubmit} className="space-y-4">
                {email && (
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500 dark:text-gray-400">
                      {t("auth.sso.error.link_password.email_label", { defaultValue: "Email" })}
                    </Label>
                    <p className="text-sm font-medium">{email}</p>
                  </div>
                )}
                <div className="space-y-1">
                  <Label htmlFor="link-password">
                    {t("auth.sso.error.link_password.password_label", { defaultValue: "Current CriteriaIQ password" })}
                  </Label>
                  <Input
                    id="link-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" disabled={submitting || !password} className="w-full">
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {t("auth.sso.error.link_password.confirm", { defaultValue: "Link my account" })}
                </Button>
              </form>
            ) : (
              <div className="flex flex-col gap-2">
                {isMfaFlow && mfaLoading && (
                  <div className="flex justify-center py-2" data-testid="sso-mfa-loading">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-500 dark:text-gray-400" />
                  </div>
                )}
                {isMfaFlow && error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                {canRetry && (
                  <Button onClick={() => (window.location.href = SSO_LOGIN_PATHS[provider])}>
                    {t("auth.sso.error.try_again", { defaultValue: "Try signing in again" })}
                  </Button>
                )}
                <Button variant="outline" onClick={() => navigate("/")}>
                  {t("auth.sso.error.back_to_signin", { defaultValue: "Back to sign-in" })}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {mfaChallenge && (
        <MFAChallengeDialog
          isOpen={true}
          userEmail={mfaChallenge.userEmail}
          temporaryToken={mfaChallenge.temporaryToken}
          onSuccess={() => {
            setMfaChallenge(null);
            markSessionEstablished();
            window.location.href = "/";
          }}
          onCancel={() => setMfaChallenge(null)}
        />
      )}
    </AuthShell>
  );
}
