import { SolutionGraphic } from "@/components/ui/solution-graphic";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { LayoutDashboard, Users, CheckCircle, BarChart3, Eye, EyeOff, X, HelpCircle, Play, LogIn, UserPlus, IdCardLanyard, UserCheck, LockKeyhole, CirclePower, Shield, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { showErrorToast, showInfoToast, showSuccessToast } from "@/lib/toast-helper";
import { apiRequest } from "@/lib/queryClient";
import { markSessionEstablished } from "@/lib/session-marker";
import { consumeSessionEndReason } from "@/lib/sign-in-redirect";
import { clearCameFromSetup, hasCameFromSetup } from "@/lib/from-setup-marker";
import {
  clearSetupCompleteBannerDismissed,
  hasSetupCompleteBannerDismissed,
  markSetupCompleteBannerDismissed,
} from "@/lib/setup-complete-banner-dismissed-marker";
import { TIMEZONE_OPTIONS, getTimezoneLabel } from "@/lib/timezones";
// The CriteriaIQ wordmark on this screen always uses the dark logo over the
// dark-blue gradient backdrop — it must not flip with the theme toggle. The
// background graphic always uses the white logo file at 5% opacity and is
// rendered by `<AuthShell>`, which provides the shared chrome (gradient,
// watermark, theme toggle, Get Help, language switcher, version footer).
import criteriaIqLogoDarkPath from "@assets/system/branding/criteriaiq-logo-dark.png";
import { AuthShell } from "@/components/shared/AuthShell";
import { useBrandingAsset, useBrandingTagline } from "@/hooks/useBrandingAsset";
import MFAChallengeDialog from "@/components/security/MFAChallengeDialog";
import { useTranslation } from 'react-i18next';
import { Checkbox } from "@/components/ui/checkbox";
import { SolutionBadge } from "@/components/ui/solution-badge";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { validateAdminPasswordField } from "@shared/admin-validation";

export default function Landing() {
  const { t } = useTranslation();
  // Admin-customizable branding overrides — fall through to the bundled
  // imports above when no override is set in Configuration → Media.
  const customLoginLogo = useBrandingAsset("login_logo");
  const { override: customTagline } = useBrandingTagline();
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [ssoRedirecting, setSsoRedirecting] = useState(false);

  // Fetch SSO status to decide whether the "Continue with Okta" button
  // renders. Public endpoint — no auth required. Returns `enabled:
  // false` when SSO isn't configured, the master toggle is off, or
  // SSO_DISABLE=true is set in the env (the operator escape hatch).
  const { data: ssoStatus } = useQuery<{
    enabled: boolean;
    providers?: { name: string; label: string; loginUrl: string }[];
    providerName: string;
    providerLabel: string;
  }>({
    queryKey: ["/api/auth/sso/status"],
    queryFn: () => apiRequest("GET", "/api/auth/sso/status"),
    staleTime: 60_000,
  });
  const ssoEnabled = !!ssoStatus?.enabled;
  // One button per enabled provider (Okta SSO, Azure SSO). Older servers
  // return only providerName/providerLabel, so fall back to the Okta path.
  const ssoProviders = ssoStatus?.providers?.length
    ? ssoStatus.providers
    : ssoEnabled
      ? [{ name: ssoStatus?.providerName ?? "okta", label: ssoStatus?.providerLabel ?? "Okta", loginUrl: "/api/auth/sso/login" }]
      : [];
  const [ssoRedirectingTo, setSsoRedirectingTo] = useState<string | null>(null);

  // The CriteriaIQ wordmark always renders the dark variant on this
  // screen regardless of the active theme (task #379).
  const currentCriteriaIqLogo = criteriaIqLogoDarkPath;
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [isResetLoading, setIsResetLoading] = useState(false);
  
  // Registration access code state
  const [registrationStep, setRegistrationStep] = useState<'code' | 'form'>('code');
  const [accessCode, setAccessCode] = useState('');
  const [accessCodeValidating, setAccessCodeValidating] = useState(false);
  const [validatedCodeInfo, setValidatedCodeInfo] = useState<{
    valid: boolean;
    accountId: number;
    accountName: string;
    assignedRole: string;
    isInternal?: boolean;
    codeId: number;
  } | null>(null);
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    role: '',
    company: '',
    title: '',
    department: '',
    region: '',
    timezone: 'America/New_York',
    solutions: [] as string[]
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  // Set when /api/login returned LOGIN_METHOD_NOT_ALLOWED (account is
  // Okta-only) so the error block can offer a "Continue with Okta" CTA.
  const [oktaRequired, setOktaRequired] = useState(false);
  // Task #629: when /api/login returns 429 we hold the wall-clock ms
  // at which the brute-force lockout expires so the form can render a
  // distinct "you're locked out — try again in 12:34" notice instead
  // of the generic "invalid credentials" message it shows for 401s.
  // Tracking the absolute reset time (rather than a remaining-seconds
  // counter) keeps the countdown honest across React re-renders and
  // tab-backgrounding — `setInterval` fires lazily when a tab is
  // backgrounded, so a counter that decremented in the callback would
  // drift, while subtracting `Date.now()` from the absolute target is
  // self-correcting.
  const [lockoutResetAt, setLockoutResetAt] = useState<number | null>(null);
  const [lockoutCountdown, setLockoutCountdown] = useState<string>('');
  // Task #583: when /api/login responds with `requiresMfa` we hold the
  // temporary token + email here and render <MFAChallengeDialog/>. The
  // operator only proceeds to `/` once the challenge dialog reports
  // success — until then no session cookie has been set server-side
  // and the second factor is genuinely required.
  const [mfaChallenge, setMfaChallenge] = useState<{
    temporaryToken: string;
    userEmail: string;
  } | null>(null);
  

  // "Setup already complete" callout — mirrors the in-wizard
  // adminExistsLock banner so operators who land here after a re-deploy
  // (or after walking the wizard against an already-initialized DB) get
  // the same friendly nudge instead of staring at a generic login form.
  // We only show it when BOTH:
  //   * /api/setup/status reports adminExists === true, AND
  //   * the operator just came from /setup (sessionStorage flag set by
  //     the wizard's "Go to Login" button OR document.referrer hints
  //     at /setup — covers manual back-button / typed-URL paths too).
  // Dismissal persists for the tab via sessionStorage so the banner
  // doesn't re-appear on every form interaction / re-render.
  const [showSetupCompleteBanner, setShowSetupCompleteBanner] = useState(false);

  // One-time notice when the user landed here because their session ended
  // (idle timeout, absolute TTL, revoke). useAuth and redirectToSignIn set
  // the flag; reading it clears it so it never shows twice.
  useEffect(() => {
    const reason = consumeSessionEndReason();
    if (reason === "idle") {
      showInfoToast(
        t("auth.toasts.signedOutIdleTitle"),
        t("auth.toasts.signedOutIdleDescription"),
      );
    } else if (reason === "expired") {
      showInfoToast(
        t("auth.toasts.sessionExpiredTitle"),
        t("auth.toasts.sessionExpiredDescription"),
      );
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    let cameFromSetup = false;
    // hasSetupCompleteBannerDismissed() owns the underlying
    // sessionStorage key and swallows storage errors internally
    // (Task #457).
    if (hasSetupCompleteBannerDismissed()) {
      return;
    }
    // hasCameFromSetup() owns the underlying sessionStorage key and
    // swallows storage errors internally (Task #456).
    cameFromSetup = hasCameFromSetup();
    if (!cameFromSetup) {
      try {
        const ref = document.referrer || "";
        if (ref) {
          const refUrl = new URL(ref, window.location.origin);
          if (refUrl.origin === window.location.origin && refUrl.pathname.startsWith("/setup")) {
            cameFromSetup = true;
          }
        }
      } catch { /* malformed referrer — ignore */ }
    }
    if (!cameFromSetup) return;

    (async () => {
      try {
        const res = await fetch("/api/setup/status", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (data && data.adminExists === true) {
          setShowSetupCompleteBanner(true);
        }
      } catch { /* network blip — silently skip the banner */ }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Task #629: render a live mm:ss countdown while the brute-force
  // lockout is in effect. Re-runs only when `lockoutResetAt` changes
  // (set by the catch branch after a 429), and clears itself the
  // moment the cooldown elapses so the form snaps back to a normal
  // state without forcing a re-render of the entire page. Subtracting
  // `Date.now()` from the absolute target on every tick (instead of
  // decrementing a counter) keeps the countdown accurate even if the
  // tab was backgrounded — `setInterval` callbacks are throttled in
  // hidden tabs so a naive decrement would drift behind the server.
  useEffect(() => {
    if (lockoutResetAt === null) {
      setLockoutCountdown('');
      return;
    }
    const update = () => {
      const remainingMs = lockoutResetAt - Date.now();
      if (remainingMs <= 0) {
        setLockoutResetAt(null);
        setLockoutCountdown('');
        // Clear the inline lockout error too — the cooldown has
        // elapsed so we shouldn't keep telling the user they're
        // locked out. They might still hit a fresh 401 on retry,
        // but that's a different message.
        setLoginError('');
        return;
      }
      const totalSeconds = Math.ceil(remainingMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      setLockoutCountdown(
        `${minutes}:${seconds.toString().padStart(2, '0')}`,
      );
    };
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [lockoutResetAt]);

  const dismissSetupCompleteBanner = () => {
    setShowSetupCompleteBanner(false);
    // markSetupCompleteBannerDismissed() owns the underlying
    // sessionStorage key and swallows storage errors internally
    // (Task #457).
    markSetupCompleteBannerDismissed();
    // clearCameFromSetup() owns its key and swallows storage errors
    // internally (Task #456).
    clearCameFromSetup();
  };

  // Fetch products for solutions dropdown using dedicated public endpoint
  const { data: products = [] } = useQuery({
    queryKey: ["/api/public/products", "landing"], // Use dedicated public endpoint
    queryFn: async () => {
      // Add cache-busting timestamp to ensure fresh data
      const timestamp = Date.now();
      const response = await fetch(`/api/public/products?_t=${timestamp}`);
      if (!response.ok) throw new Error("Failed to fetch public products");
      return response.json();
    },
    staleTime: 0, // Disable caching to ensure fresh data
    gcTime: 0, // Disable client-side caching
  });

  // Helper function to get product info (name and icon) from products database
  const getProductInfo = (solutionName: string) => {
    if (!solutionName) return { name: solutionName, solutionIcon: undefined };
    
    // Try exact match first
    let product = products.find((p: any) => p.name === solutionName);
    
    // If no exact match, try case-insensitive match
    if (!product) {
      product = products.find((p: any) => p.name.toLowerCase() === solutionName.toLowerCase());
    }
    
    // If still no match, try partial matching (e.g., "Acme Auditor" matches "Auditor")
    if (!product) {
      const lowerSolution = solutionName.toLowerCase();
      product = products.find((p: any) => {
        const lowerProduct = p.name.toLowerCase();
        // Check if solution name contains product name or vice versa
        return lowerSolution.includes(lowerProduct) || lowerProduct.includes(lowerSolution);
      });
    }
    
    // Return the current product name and icon from database, or fallback to template name
    return {
      name: product?.name || solutionName,
      solutionIcon: product?.solutionIcon, solutionIconName: product?.solutionIconName ?? null
    };
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    // Clear any previous login error
    setLoginError('');
    setOktaRequired(false);

    // Validation for registration
    if (authMode === 'register') {
      // Ensure access code was validated
      if (!validatedCodeInfo) {
        showErrorToast(t('auth.toasts.errorTitle'), t('auth.toasts.validateAccessCodeFirst'));
        return;
      }

      // Validate passwords match
      if (formData.password !== formData.confirmPassword) {
        showErrorToast(t('auth.toasts.validationErrorTitle'), t('auth.toasts.passwordsDoNotMatch'));
        return;
      }

      const passwordError = validatePassword(formData.password);
      if (passwordError) {
        showErrorToast(t('auth.toasts.validationErrorTitle'), passwordError);
        return;
      }

      const emailError = validateEmail(formData.email);
      if (emailError) {
        showErrorToast(t('auth.toasts.validationErrorTitle'), emailError);
        return;
      }
    }

    setIsLoading(true);

    try {
      const endpoint = authMode === 'login' ? '/api/login' : '/api/register';

      // Normalize the submitted email so a user who types
      // `Jane.Doe@example.com` resolves to the same row as the
      // one created with `jane.doe@example.com`. The server also
      // normalizes (Task #535) — this is the matching defense on the
      // browser side so the value the operator sees in their network
      // tab is the value the lookup actually runs against.
      const normalizedEmail = typeof formData.email === 'string'
        ? formData.email.trim().toLowerCase()
        : formData.email;

      // For registration, include access code info
      const payload = authMode === 'register' ? {
        email: normalizedEmail,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
        company: formData.company,
        title: formData.title,
        department: formData.department,
        region: formData.region,
        timezone: formData.timezone,
        solutions: formData.solutions,
        accessCodeId: validatedCodeInfo?.codeId,
        accountId: validatedCodeInfo?.accountId,
        role: validatedCodeInfo?.assignedRole,
      } : { ...formData, email: normalizedEmail };
      
      const data = await apiRequest('POST', endpoint, payload);

      // apiRequest already returns parsed JSON data and throws on error
      if (authMode === 'login') {
        // Task #583: MFA gate — if the server returns
        // `requiresMfa: true`, no session cookie was set and the user
        // must complete the TOTP challenge before being treated as
        // signed in. Stash the temp token + email and let the
        // MFAChallengeDialog finish the handshake. We deliberately
        // skip the wizard / session-marker bookkeeping below until
        // the challenge succeeds, since none of that should happen
        // until there's an actual session.
        if (data?.requiresMfa && data?.temporaryToken) {
          setMfaChallenge({
            temporaryToken: data.temporaryToken,
            userEmail: data.userEmail || formData.email,
          });
          return;
        }

        // Wizard hand-off is implicitly complete once the operator
        // signs in successfully. Clear the post-setup banner state so
        // a sign-out → re-show login flow in the same tab doesn't
        // resurface the "Setup already complete" callout.
        // clearCameFromSetup() owns the underlying sessionStorage
        // key and swallows storage errors internally (Task #456).
        clearCameFromSetup();
        // clearSetupCompleteBannerDismissed() owns its key and
        // swallows storage errors internally (Task #457).
        clearSetupCompleteBannerDismissed();
        // Record the sign-in time: if the server rejects the session
        // within a couple of minutes the cookie never stuck, and useAuth
        // shows the Setup health check instead of this form again.
        markSessionEstablished();
        window.location.href = '/';
      } else {
        showSuccessToast(t('auth.toasts.successTitle'), data.message);
        resetForm();
        setAuthMode('login');
      }
    } catch (error) {
      if (authMode === 'login') {
        // Task #629: distinguish a per-account/per-IP brute-force
        // lockout (HTTP 429 + `code: "LOGIN_RATE_LIMITED"`) from a
        // plain bad-credentials 401. Without this branch the form
        // showed the same "invalid credentials" message in both
        // cases, so a legitimate user who'd typo'd their password
        // 10 times in a row would keep guessing — never realising
        // the server had locked them out for 15 minutes.
        const status = (error as { status?: number } | null)?.status;
        const details = (error as { details?: { code?: unknown; retryAfterSeconds?: unknown } } | null)?.details;
        const code = details && typeof details.code === 'string' ? details.code : null;
        const retryAfterSeconds =
          details && typeof details.retryAfterSeconds === 'number' && Number.isFinite(details.retryAfterSeconds)
            ? Math.max(0, Math.floor(details.retryAfterSeconds))
            : null;
        if (code === 'LOGIN_METHOD_NOT_ALLOWED') {
          // Password was right, but an admin restricted this account to
          // Okta (per-user Allowed Login Methods). Show why and offer the
          // Okta path inline.
          setLockoutResetAt(null);
          setLoginError(t('auth.errors.loginMethodOktaOnly'));
          setOktaRequired(true);
        } else if (status === 429 || code === 'LOGIN_RATE_LIMITED') {
          if (retryAfterSeconds && retryAfterSeconds > 0) {
            // Hand the absolute reset time to the countdown effect.
            // Clear the inline `loginError` so we don't double-render
            // (the lockout block owns its own copy of the message).
            setLockoutResetAt(Date.now() + retryAfterSeconds * 1000);
            setLoginError('');
          } else {
            // Server signalled lockout but didn't give us a usable
            // cooldown — fall back to the static "wait a few minutes"
            // copy so the operator still gets the right hint.
            setLockoutResetAt(null);
            setLoginError(t('auth.errors.tooManyAttempts'));
          }
        } else {
          // Normal bad-credentials path — clear any stale lockout
          // state so a successful previous lockout doesn't keep
          // shadowing fresh 401 messages.
          setLockoutResetAt(null);
          setLoginError(t('auth.errors.invalidCredentials'));
        }
      } else {
        // Keep toast notifications for registration errors
        showErrorToast(t('auth.toasts.errorTitle'), error instanceof Error ? error.message : t('auth.toasts.genericError'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const validatePassword = (password: string) => {
    const code = validateAdminPasswordField(password);
    if (!code) return "";
    if (code === 'adminPasswordTooShort') return t('auth.errors.passwordTooShort');
    return t('auth.errors.passwordWeak');
  };

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return t('auth.errors.invalidEmail');
    }
    return "";
  };

  const resetForm = () => {
    setFormData({
      email: '',
      password: '',
      confirmPassword: '',
      firstName: '',
      lastName: '',
      role: '',
      company: '',
      title: '',
      department: '',
      region: '',
      timezone: 'America/New_York',
      solutions: []
    });
    setLoginError('');
    setOktaRequired(false);
    // Task #629: switching auth modes / resetting the form clears the
    // lockout countdown too — otherwise the cooldown notice would
    // hang around on the (now-blank) registration tab and confuse
    // anyone toggling between sign-in and sign-up.
    setLockoutResetAt(null);
    setLockoutCountdown('');
    setAccessCode('');
    setValidatedCodeInfo(null);
    setRegistrationStep('code');
  };

  const handleValidateAccessCode = async () => {
    if (!accessCode.trim()) {
      showErrorToast(t('auth.toasts.errorTitle'), t('auth.toasts.enterAccessCode'));
      return;
    }

    setAccessCodeValidating(true);
    try {
      const response = await fetch('/api/validate-access-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: accessCode.trim().toUpperCase() }),
      });
      
      const data = await response.json();
      
      if (!response.ok || !data.valid) {
        showErrorToast(t('auth.toasts.invalidCodeTitle'), data.message || t('auth.toasts.invalidCodeDescription'));
        return;
      }
      
      setValidatedCodeInfo(data);
      // The code carries the account, so prefill Company from it (locked in the
      // form). Internal accounts have no solution interests, so clear them.
      setFormData(prev => ({
        ...prev,
        company: data.accountName && data.accountName !== "Unknown Account" ? data.accountName : prev.company,
        solutions: data.isInternal ? [] : prev.solutions,
      }));
      setRegistrationStep('form');
      showSuccessToast(t('auth.toasts.codeValidatedTitle'), t('auth.toasts.codeValidatedDescription', { accountName: data.accountName }));
    } catch (error) {
      showErrorToast(t('auth.toasts.errorTitle'), t('auth.toasts.validateAccessCodeFailed'));
    } finally {
      setAccessCodeValidating(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();

    // Trim+lowercase up front so client-side validation accepts
    // copy-paste whitespace transparently (Task #535). An operator
    // who pastes "  Jane.Doe@example.com  " should not be
    // blocked by client-side regex before we even try the lookup.
    const normalizedEmail = resetEmail.trim().toLowerCase();

    if (!normalizedEmail) {
      showErrorToast(t('auth.toasts.validationErrorTitle'), t('auth.toasts.enterEmailAddress'));
      return;
    }

    const emailError = validateEmail(normalizedEmail);
    if (emailError) {
      showErrorToast(t('auth.toasts.validationErrorTitle'), emailError);
      return;
    }

    setIsResetLoading(true);

    try {
      // Same normalization the login form runs. Without this, an
      // operator who types `Jane.Doe@example.com` here while
      // their account row is `jane.doe@example.com` would have
      // hit the silent miss path and never gotten the reset email —
      // exactly the support case this hardening pass closed.
      const data = await apiRequest('POST', '/api/auth/request-password-reset', { email: normalizedEmail });

      // apiRequest already returns parsed JSON data and throws on error
      showSuccessToast(t('auth.toasts.successTitle'), data.message);
      setShowPasswordReset(false);
      setResetEmail('');
    } catch (error) {
      showErrorToast(t('auth.toasts.errorTitle'), t('auth.toasts.genericError'));
    } finally {
      setIsResetLoading(false);
    }
  };

  return (
    <AuthShell>
      <div className="container mx-auto px-4 py-16 relative z-10">
        {showSetupCompleteBanner && (
          <div
            className="mx-auto mb-6 max-w-2xl flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
            role="status"
            data-testid="banner-setup-already-complete"
          >
            <UserCheck className="w-4 h-4 mt-0.5 shrink-0" />
            <p className="flex-1">{t('landing.setupAlreadyComplete.message')}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-mr-2 -mt-1 h-6 w-6 p-0 text-amber-900 hover:bg-amber-100"
              onClick={dismissSetupCompleteBanner}
              aria-label={t('landing.setupAlreadyComplete.dismiss')}
              data-testid="button-dismiss-setup-complete-banner"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        <div className="text-center mb-16">
          {customLoginLogo.url ? (
            <>
              {/* An admin uploaded a custom login_logo via Configuration → Media —
                  render that wordmark in the prominent slot, with the CriteriaIQ
                  product mark below it at its standard small size. */}
              <div className="flex items-center justify-center mb-2">
                <img
                  src={customLoginLogo.url}
                  alt=""
                  className="h-[200px] w-[400px] object-contain mt-[-55px] mb-[-55px]"
                />
              </div>
              {customTagline ? (
                <p className="font-bold mb-6 text-[25px] text-[#2b2dbd]">{customTagline}</p>
              ) : (
                // No tagline override configured. Reserve the vertical space the
                // tagline would have taken so the surrounding logos don't shift
                // when an admin later sets one. Per product direction, fresh
                // installs render NO default tagline — admins type the
                // customer-appropriate copy themselves via Configuration → Media.
                <div className="mb-6" style={{ height: "37.5px" }} aria-hidden="true" />
              )}
              <div className="flex justify-center mt-[-7px] mb-[-7px]">
                <img
                  src={currentCriteriaIqLogo}
                  alt="CriteriaIQ"
                  className="w-[280px] h-[70px] object-contain"
                />
              </div>
            </>
          ) : (
            <>
              {/* No custom login_logo configured. Drop the bundled Internal
                  wordmark so a non-Internal install isn't forced into Internal
                  branding by default, and promote the CriteriaIQ wordmark
                  to the same prominent size the customer logo would occupy. */}
              <div className="flex items-center justify-center mb-2">
                <img
                  src={currentCriteriaIqLogo}
                  alt="CriteriaIQ"
                  className="h-[200px] w-[400px] object-contain mt-[-55px] mb-[-55px]"
                />
              </div>
              {customTagline ? (
                <p className="font-bold mb-6 text-[25px] text-[#2b2dbd]">{customTagline}</p>
              ) : (
                // No tagline override configured. Reserve the vertical space the
                // tagline would have taken so the surrounding logos don't shift
                // when an admin later sets one. Per product direction, fresh
                // installs render NO default tagline — admins type the
                // customer-appropriate copy themselves via Configuration → Media.
                <div className="mb-6" style={{ height: "37.5px" }} aria-hidden="true" />
              )}
            </>
          )}
          <p className="font-bold text-[32px] text-[#ffffff] mb-2">{t('landing.subtitle')}</p>
          <p className="text-xl mb-8 max-w-2xl mx-auto text-[#cfcfcf]">{t('landing.description')}</p>
          <Button
            size="lg"
            className="bg-primary hover:bg-blue-800 text-white px-8 py-3 flex items-center justify-center gap-2 mx-auto"
            onClick={() => {
              setAuthMode('login');
              setShowAuthDialog(true);
              resetForm();
            }}
          >
            <Play className="h-5 w-5 !text-[#47c800] [stroke:#47c800] [&>*]:[stroke:#47c800]" />
            {t('landing.getStarted')}
          </Button>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <Card className="text-center transition-transform duration-300 hover:transform hover:-translate-y-2 hover:shadow-lg">
            <CardHeader>
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/40 rounded-lg flex items-center justify-center mx-auto mb-4">
                <Users className="text-blue-600 dark:text-blue-400" size={24} />
              </div>
              <CardTitle>{t('landing.features.collaborative.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 dark:text-gray-300">{t('landing.features.collaborative.description')}</p>
            </CardContent>
          </Card>

          <Card className="text-center transition-transform duration-300 hover:transform hover:-translate-y-2 hover:shadow-lg">
            <CardHeader>
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/40 rounded-lg flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="text-green-600 dark:text-green-400" size={24} />
              </div>
              <CardTitle>{t('landing.features.tracking.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 dark:text-gray-300">{t('landing.features.tracking.description')}</p>
            </CardContent>
          </Card>

          <Card className="text-center transition-transform duration-300 hover:transform hover:-translate-y-2 hover:shadow-lg">
            <CardHeader>
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/40 rounded-lg flex items-center justify-center mx-auto mb-4">
                <BarChart3 className="text-purple-600 dark:text-purple-400" size={24} />
              </div>
              <CardTitle>{t('landing.features.analytics.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 dark:text-gray-300">{t('landing.features.analytics.description')}</p>
            </CardContent>
          </Card>
        </div>

        <div className="text-center">
          <Card className="max-w-2xl mx-auto transition-transform duration-300 hover:transform hover:-translate-y-2 hover:shadow-lg">
            <CardHeader>
              <CardTitle>{t('landing.cta.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 dark:text-gray-300 mb-6">{t('landing.cta.description')}</p>
              <div className="flex gap-4 justify-center">
                <Button
                  size="lg"
                  className="bg-primary hover:bg-blue-800 text-white flex items-center gap-2"
                  onClick={() => {
                    setAuthMode('login');
                    setShowAuthDialog(true);
                    resetForm();
                  }}
                >
                  <LogIn className="h-5 w-5 !text-[#47c800] [stroke:#47c800] [&>*]:[stroke:#47c800]" />
                  {t('landing.signIn')}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-primary text-primary hover:bg-primary hover:text-white flex items-center gap-2"
                  onClick={() => {
                    setAuthMode('register');
                    setShowAuthDialog(true);
                    resetForm();
                  }}
                >
                  <UserPlus className="h-5 w-5 !text-[#47c800]" stroke="#47c800" />
                  {t('landing.createAccount')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      {/* Authentication Dialog */}
      <Dialog open={showAuthDialog} onOpenChange={setShowAuthDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {authMode === 'login' ? (
                <>
                  <LockKeyhole className="h-5 w-5" />
                  {t('landing.signIn')}
                </>
              ) : (
                <>
                  <IdCardLanyard className="h-5 w-5" />
                  {t('landing.createUserAccount')}
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {authMode === 'login'
                ? t('landing.auth.signInDescription')
                : t('landing.auth.createAccountDescription')
              }
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-4">
              {/* Registration - Step 1: Access Code */}
              {authMode === 'register' && registrationStep === 'code' && (
                <div className="space-y-4">
                  <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <p className="text-sm text-blue-700 dark:text-blue-300">{t('auth.accessCode.instructions')}</p>
                  </div>
                  <div>
                    <Label htmlFor="accessCode">{t('auth.accessCode.codeLabel')}</Label>
                    <Input
                      id="accessCode"
                      type="text"
                      value={accessCode}
                      onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                      placeholder={t('auth.accessCode.codePlaceholder')}
                      className="font-mono text-lg tracking-wider"
                    />
                  </div>
                  <Button
                    type="button"
                    className="w-full"
                    onClick={handleValidateAccessCode}
                    disabled={accessCodeValidating}
                  >
                    <UserCheck className="h-4 w-4 mr-2" />
                    {accessCodeValidating ? t('auth.accessCode.validating') : t('auth.accessCode.validateButton')}
                  </Button>
                </div>
              )}

              {/* Registration - Step 2: User Details */}
              {authMode === 'register' && registrationStep === 'form' && validatedCodeInfo && (
                <>
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-green-800 dark:text-green-300">{t('auth.signUp.codeValidatedBanner')}</p>
                        <p className="text-xs text-green-600 dark:text-green-400">
                          {t('auth.signUp.codeValidatedAccountLabel')} <strong>{validatedCodeInfo.accountName}</strong> | {t('auth.signUp.codeValidatedRoleLabel')} <strong>{validatedCodeInfo.assignedRole || t('auth.signUp.notAssigned')}</strong>
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setRegistrationStep('code');
                          setValidatedCodeInfo(null);
                        }}
                        className="text-xs"
                      >
                        {t('auth.signUp.changeButton')}
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="firstName">{t('auth.signUp.firstNameLabel')}</Label>
                      <Input
                        id="firstName"
                        type="text"
                        value={formData.firstName}
                        onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                        required
                        placeholder={t('auth.signUp.firstNamePlaceholder')}
                      />
                    </div>
                    <div>
                      <Label htmlFor="lastName">{t('auth.signUp.lastNameLabel')}</Label>
                      <Input
                        id="lastName"
                        type="text"
                        value={formData.lastName}
                        onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                        required
                        placeholder={t('auth.signUp.lastNamePlaceholder')}
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="company">{t('auth.signUp.companyLabel')}</Label>
                    <Input
                      id="company"
                      type="text"
                      value={formData.company}
                      onChange={(e) => setFormData(prev => ({ ...prev, company: e.target.value }))}
                      required
                      disabled={!!validatedCodeInfo}
                      className={validatedCodeInfo ? "bg-gray-100 dark:bg-gray-800" : undefined}
                      placeholder={t('auth.signUp.companyPlaceholder')}
                    />
                    {validatedCodeInfo && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('auth.signUp.companyFromCode')}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="title">{t('auth.signUp.titleLabel')}</Label>
                      <Input
                        id="title"
                        type="text"
                        value={formData.title}
                        onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                        required
                        placeholder={t('auth.signUp.titlePlaceholder')}
                      />
                    </div>
                    <div>
                      <Label htmlFor="department">{t('auth.signUp.departmentLabel')}</Label>
                      <Select
                        value={formData.department}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, department: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('auth.signUp.departmentPlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="C-Level">{t('departments.cLevel')}</SelectItem>
                          <SelectItem value="HR">{t('departments.hr')}</SelectItem>
                          <SelectItem value="Finance">{t('departments.finance')}</SelectItem>
                          <SelectItem value="Marketing">{t('departments.marketing')}</SelectItem>
                          <SelectItem value="Sales">{t('departments.sales')}</SelectItem>
                          <SelectItem value="Operations">{t('departments.operations')}</SelectItem>
                          <SelectItem value="Engineering">{t('departments.engineering')}</SelectItem>
                          <SelectItem value="Security">{t('departments.security')}</SelectItem>
                          <SelectItem value="Network">{t('departments.network')}</SelectItem>
                          <SelectItem value="R&D">{t('departments.rnd')}</SelectItem>
                          <SelectItem value="Support">{t('departments.support')}</SelectItem>
                          <SelectItem value="IT">{t('departments.it')}</SelectItem>
                          <SelectItem value="CX">{t('departments.cx')}</SelectItem>
                          <SelectItem value="Services">{t('departments.services')}</SelectItem>
                          <SelectItem value="Product">{t('departments.product')}</SelectItem>
                          <SelectItem value="Other">{t('departments.other')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="region">{t('auth.signUp.regionLabel')}</Label>
                      <Select
                        value={formData.region}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, region: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('auth.signUp.regionPlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="North America">{t('regions.northAmerica')}</SelectItem>
                          <SelectItem value="South America">{t('regions.southAmerica')}</SelectItem>
                          <SelectItem value="Europe">{t('regions.europe')}</SelectItem>
                          <SelectItem value="Asia Pacific">{t('regions.asiaPacific')}</SelectItem>
                          <SelectItem value="Middle East & Africa">{t('regions.middleEastAfrica')}</SelectItem>
                          <SelectItem value="Global">{t('regions.global')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-2">
                        <Label htmlFor="role">{t('auth.signUp.roleLabel')}</Label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p>{t('auth.signUp.roleTooltip')}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <Input
                        id="role"
                        type="text"
                        value={validatedCodeInfo.assignedRole || t('auth.signUp.notAssigned')}
                        disabled
                        className="bg-gray-100 dark:bg-gray-800"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="timezone">{t('auth.signUp.timezoneLabel')}</Label>
                    <Select
                      value={formData.timezone}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, timezone: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('auth.signUp.timezonePlaceholder')} />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {TIMEZONE_OPTIONS.map((tz) => (
                          <SelectItem key={tz.value} value={tz.value}>
                            {getTimezoneLabel(tz.value, t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className={validatedCodeInfo?.isInternal ? "opacity-50 pointer-events-none" : undefined}>
                    <Label htmlFor="solutions">{t('auth.signUp.solutionsLabel')}</Label>
                    {validatedCodeInfo?.isInternal && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('auth.signUp.solutionsInternalNote')}</p>
                    )}
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {formData.solutions.map((solution: string, index: number) => {
                          const productInfo = getProductInfo(solution);
                          return (
                            <div key={`selected-solution-${index}-${solution}`} className="flex items-center gap-1 bg-secondary rounded-full px-3 py-1">
                              <SolutionBadge
                                solutionName={productInfo.name}
                                solutionIcon={productInfo.solutionIcon} solutionIconName={productInfo.solutionIconName}
                                className="border-0 p-0 bg-transparent"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const newSolutions = formData.solutions.filter((s: string) => s !== solution);
                                  setFormData(prev => ({ ...prev, solutions: newSolutions }));
                                }}
                                className="ml-1 hover:bg-black/20 rounded"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <Select onValueChange={(value) => {
                        if (value && !formData.solutions.includes(value)) {
                          setFormData(prev => ({ ...prev, solutions: [...prev.solutions, value] }));
                        }
                      }}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('auth.signUp.solutionsPlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          {products && products.length > 0 ? (
                            products
                              .filter((product: any) => product.isActive === true && !formData.solutions.includes(product.name))
                              .map((product: any) => (
                                <SelectItem key={product.id} value={product.name}>
                                  <div className="flex items-center gap-2">
                                    <SolutionGraphic graphic={product.solutionIcon} icon={product.solutionIconName} name={product.name} className="w-4 h-4 object-contain" />
                                    <span>{product.name}</span>
                                  </div>
                                </SelectItem>
                              ))
                          ) : (
                            <SelectItem value="no-solutions" disabled>
                              {t('auth.signUp.noSolutionsAvailable')}
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="email">{t('auth.signUp.emailLabel')}</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      required
                      placeholder="john@company.com"
                    />
                    <p className="text-xs text-gray-500 mt-1">{t('auth.signUp.emailHint')}</p>
                  </div>

                  <div>
                    <Label htmlFor="password">{t('auth.signUp.passwordLabel')}</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={formData.password}
                        onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                        required
                        placeholder={t('auth.signUp.passwordPlaceholder')}
                        className="hide-password-toggle"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{t('auth.signUp.passwordHint')}</p>
                  </div>

                  <div>
                    <Label htmlFor="confirmPassword">{t('auth.signUp.confirmPasswordLabel')}</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      required
                      placeholder={t('auth.signUp.confirmPasswordPlaceholder')}
                    />
                  </div>
                </>
              )}

              {/* Login Form */}
              {authMode === 'login' && (
                <>
                  {/* OIDC SSO entry points (Okta SSO, Azure SSO). Render above
                      the email/password fields only for enabled providers.
                      Each button does a full navigation to the provider's
                      server-side login route, which redirects to the IdP;
                      a full nav rather than fetch keeps the OIDC session
                      bookkeeping (state, nonce, PKCE verifier) on the
                      server-side session, which the callback reads on return. */}
                  {ssoEnabled && ssoProviders.length > 0 && (
                    <div className="space-y-3">
                      {ssoProviders.map((provider) => (
                        <Button
                          key={provider.name}
                          type="button"
                          variant="outline"
                          className="w-full h-11 border-blue-300 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950"
                          onClick={() => {
                            setSsoRedirecting(true);
                            setSsoRedirectingTo(provider.name);
                            window.location.href = provider.loginUrl;
                          }}
                          disabled={ssoRedirecting}
                          data-testid={`sso-login-button-${provider.name}`}
                        >
                          {ssoRedirecting && ssoRedirectingTo === provider.name ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Shield className="h-4 w-4 mr-2 text-blue-600 dark:text-blue-400" />
                          )}
                          {ssoRedirecting && ssoRedirectingTo === provider.name
                            ? t("auth.sso.signin.redirectingTo", { provider: provider.label })
                            : t("auth.sso.signin.button", {
                                defaultValue: "Continue with {{provider}}",
                                provider: provider.label,
                              })}
                        </Button>
                      ))}
                      <div className="relative flex items-center" aria-hidden="true">
                        <div className="flex-grow border-t border-gray-200 dark:border-gray-800" />
                        <span className="mx-3 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          {t("auth.sso.signin.divider", { defaultValue: "or" })}
                        </span>
                        <div className="flex-grow border-t border-gray-200 dark:border-gray-800" />
                      </div>
                    </div>
                  )}

                  <div>
                    <Label htmlFor="email">{t('auth.signIn.emailLabel')}</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      required
                      placeholder="john@company.com"
                    />
                  </div>

                  <div>
                    <Label htmlFor="password">{t('auth.signIn.passwordLabel')}</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={formData.password}
                        onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                        required
                        placeholder={t('auth.signIn.passwordPlaceholder')}
                        className="hide-password-toggle"
                        style={{
                          WebkitAppearance: 'none',
                          MozAppearance: 'textfield'
                        } as React.CSSProperties}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    <div className="flex justify-end items-center mt-1">
                      <button
                        type="button"
                        onClick={() => setShowPasswordReset(true)}
                        className="text-sm text-primary hover:underline"
                      >
                        {t('auth.signIn.forgotPassword')}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Task #629: brute-force lockout banner. Renders only
                  while the cooldown is active (lockoutResetAt set by
                  the catch branch when /api/login returned 429). The
                  countdown ticks every second from the absolute
                  reset target so it stays accurate even if the tab
                  was backgrounded. We deliberately render this above
                  the generic loginError block so the lockout copy
                  takes priority — they're mutually exclusive in
                  state but ordering makes the precedence obvious to
                  anyone editing this file later. */}
              {authMode === 'login' && lockoutResetAt && (
                <div
                  data-testid="login-lockout-notice"
                  role="alert"
                  className="text-red-600 dark:text-red-400 text-sm font-medium bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md px-3 py-2"
                >
                  {lockoutCountdown
                    ? t('auth.errors.tooManyAttemptsCountdown', { time: lockoutCountdown })
                    : t('auth.errors.tooManyAttempts')}
                </div>
              )}

              {/* Login Error Message */}
              {authMode === 'login' && !lockoutResetAt && loginError && (
                <div className="text-red-600 dark:text-red-400 text-sm font-medium" data-testid="login-error-notice">
                  {loginError}
                </div>
              )}
              {authMode === 'login' && oktaRequired && loginError && ssoEnabled &&
                ssoProviders.map((provider) => (
                  <Button
                    key={provider.name}
                    type="button"
                    variant="outline"
                    className="w-full border-blue-300 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950"
                    onClick={() => {
                      setSsoRedirecting(true);
                      setSsoRedirectingTo(provider.name);
                      window.location.href = provider.loginUrl;
                    }}
                    disabled={ssoRedirecting}
                    data-testid={`login-method-sso-cta-${provider.name}`}
                  >
                    <Shield className="h-4 w-4 mr-2 text-blue-600 dark:text-blue-400" />
                    {t("auth.sso.signin.button", {
                      defaultValue: "Continue with {{provider}}",
                      provider: provider.label,
                    })}
                  </Button>
                ))}
            </div>

            <div className="flex justify-between items-center pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setAuthMode(authMode === 'login' ? 'register' : 'login');
                  resetForm();
                }}
                className="text-sm"
              >
                {authMode === 'login'
                  ? t('auth.actions.needAccount')
                  : t('auth.actions.haveAccount')
                }
              </Button>

              {(authMode === 'login' || (authMode === 'register' && registrationStep === 'form')) && (
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="bg-primary hover:bg-blue-800 text-white"
                  style={{ color: 'white' }}
                >
                  {isLoading ? t('auth.actions.loading') : authMode === 'login' ? (
                    <>
                      <CirclePower className="h-4 w-4 mr-2" />
                      {t('auth.actions.signIn')}
                    </>
                  ) : (
                    <>
                      <IdCardLanyard className="h-4 w-4 mr-2" />
                      {t('auth.actions.createAccount')}
                    </>
                  )}
                </Button>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {/* Password Reset Dialog */}
      <Dialog open={showPasswordReset} onOpenChange={setShowPasswordReset}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('landing.auth.resetPassword')}</DialogTitle>
            <DialogDescription>
              {t('landing.auth.resetPasswordDescription')}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handlePasswordReset} className="space-y-4">
            <div>
              <Label htmlFor="resetEmail">{t('auth.requestReset.emailLabel')}</Label>
              <Input
                id="resetEmail"
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                required
                placeholder={t('auth.requestReset.emailPlaceholder')}
              />
            </div>

            <div className="flex justify-between items-center pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowPasswordReset(false);
                  setResetEmail('');
                }}
              >
                {t('auth.requestReset.backToSignIn')}
              </Button>

              <Button
                type="submit"
                disabled={isResetLoading || !resetEmail}
                className="bg-primary hover:bg-blue-800"
              >
                {isResetLoading ? t('auth.requestReset.sending') : t('auth.requestReset.sendResetLink')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/*
        Task #583: MFA challenge after password verification. We mount
        this dialog only while we have a live temp token in state — it
        unmounts (resetting its internal attempt counter / inputs)
        after success or cancel. On success we run the same post-login
        bookkeeping as the no-MFA branch (clear setup banners, mark
        the session as established) before navigating to `/`. On
        cancel we drop the temp token; the user is back on the login
        form with no session and can retry from scratch.
      */}
      {mfaChallenge && (
        <MFAChallengeDialog
          isOpen={true}
          userEmail={mfaChallenge.userEmail}
          temporaryToken={mfaChallenge.temporaryToken}
          onSuccess={() => {
            setMfaChallenge(null);
            clearCameFromSetup();
            clearSetupCompleteBannerDismissed();
            markSessionEstablished();
            window.location.href = '/';
          }}
          onCancel={() => {
            setMfaChallenge(null);
          }}
        />
      )}
    </AuthShell>
  );
}