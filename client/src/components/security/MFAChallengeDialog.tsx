import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { startAuthentication } from "@simplewebauthn/browser";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";

import { 
  ShieldUser, 
  Smartphone, 
  Key,
  Fingerprint,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  ArrowLeft,
  Clock,
  Monitor,
  ShieldCheck
} from "lucide-react";

interface MFAChallengeDialogProps {
  isOpen: boolean;
  onSuccess: (sessionData?: any) => void;
  onCancel: () => void;
  userEmail: string;
  temporaryToken?: string; // Token from successful password verification
}

// Shape of a successful /api/mfa/challenge response. The recovery-
// code count fields are optional because older server builds don't
// include them. See Task #602 (recovery branch), Task #615 (TOTP
// branch), and Task #632 (passkey branch) for the server-side
// contract — all three MFA paths now attach the count fields when
// the user has stored recovery codes.
interface MfaChallengeSuccessData {
  message?: string;
  recoveryCodesRemaining?: number;
  recoveryCodesLow?: boolean;
}

/**
 * Stable, machine-readable code the server returns in the 429 JSON
 * body when the per-user MFA brute-force ceiling has fired
 * (`/api/mfa/challenge` — Task #637). Mirrors the `LOGIN_RATE_LIMITED`
 * pattern the password-login form keys off (Task #629). MUST stay in
 * sync with `MFA_CHALLENGE_RATE_LIMIT_CODE` in
 * `server/auth/mfaChallengeRoute.ts` — renaming one without the
 * other will silently regress the dialog's lockout messaging.
 */
const MFA_CHALLENGE_RATE_LIMIT_CODE = "MFA_CHALLENGE_RATE_LIMITED";

/**
 * Pull the rate-limit signal off the error thrown by `apiRequest`.
 * `apiRequest` packages the response into an `ApiError` carrying
 * `.status` (HTTP code) and `.details` (parsed JSON body). We treat
 * either a 429 status OR the explicit `MFA_CHALLENGE_RATE_LIMITED`
 * code as a lockout so a future load balancer that strips status
 * codes (or a server that returns 200/4xx with the code in the body)
 * still routes into the right branch — same robustness contract the
 * /api/login lockout banner uses on the landing page.
 */
function readRateLimitSignal(error: unknown): {
  isRateLimited: boolean;
  retryAfterSeconds: number | null;
} {
  if (!error || typeof error !== 'object') {
    return { isRateLimited: false, retryAfterSeconds: null };
  }
  const status = (error as { status?: unknown }).status;
  const details = (error as { details?: { code?: unknown; retryAfterSeconds?: unknown } | null })
    .details;
  const code = details && typeof details.code === 'string' ? details.code : null;
  const isRateLimited =
    status === 429 || code === MFA_CHALLENGE_RATE_LIMIT_CODE;
  const rawRetry = details?.retryAfterSeconds;
  const retryAfterSeconds =
    typeof rawRetry === 'number' && Number.isFinite(rawRetry)
      ? Math.max(0, Math.floor(rawRetry))
      : null;
  return { isRateLimited, retryAfterSeconds };
}

export default function MFAChallengeDialog({ 
  isOpen, 
  onSuccess, 
  onCancel, 
  userEmail,
  temporaryToken 
}: MFAChallengeDialogProps) {
  const { t } = useTranslation();
  // State management
  const [activeTab, setActiveTab] = useState<'totp' | 'recovery' | 'passkey'>('totp');
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);
  const [showRecoveryOption, setShowRecoveryOption] = useState(false);
  // Task #602: After a successful recovery-code login the dialog
  // pivots to a confirmation screen that surfaces how many backup
  // codes the operator has left and (when below the server-side
  // low-water threshold) prompts them to regenerate before they
  // burn through the rest. We hold the post-success payload here
  // — the original `onSuccess` only fires once the operator
  // explicitly chooses to continue, so the warning is unmissable.
  const [recoverySuccess, setRecoverySuccess] = useState<{
    remaining: number;
    low: boolean;
    sessionData: any;
  } | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regeneratedCodes, setRegeneratedCodes] = useState<string[] | null>(null);
  // Task #637: brute-force lockout state. `lockoutResetAt` is the
  // absolute unix-millis timestamp at which the server-side rate
  // limit window closes (computed from the 429 response's
  // `retryAfterSeconds`). When non-null we pivot the dialog to a
  // dedicated lockout banner with a live mm:ss countdown, mirroring
  // the password-login lockout copy added in Task #629 — without it
  // a user who fat-fingered their TOTP six times saw the same
  // "invalid code" toast and kept guessing.
  const [lockoutResetAt, setLockoutResetAt] = useState<number | null>(null);
  const [lockoutCountdown, setLockoutCountdown] = useState<string>('');
  // Defensive fallback message for the rare case where the server
  // signals a 429 but didn't (or couldn't) include a usable
  // `retryAfterSeconds` payload — we still want to tell the user
  // they're locked out, just without the live countdown. Same
  // belt-and-braces branch the landing-page lockout banner uses.
  const [lockoutFallbackMessage, setLockoutFallbackMessage] = useState<string>('');

  // Auto-focus on input when dialog opens
  const totpInputRef = useRef<HTMLInputElement>(null);
  const recoveryInputRef = useRef<HTMLInputElement>(null);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setActiveTab('totp');
      setTotpCode('');
      setRecoveryCode('');
      setTrustDevice(false);
      setAttemptsRemaining(3);
      setShowRecoveryOption(false);
      setRecoverySuccess(null);
      setIsRegenerating(false);
      setRegeneratedCodes(null);
      // Task #637: clear any stale lockout state from a previous
      // open/close so a brand-new MFA prompt doesn't inherit a
      // cooldown banner from a prior attempt that has long since
      // expired.
      setLockoutResetAt(null);
      setLockoutCountdown('');
      setLockoutFallbackMessage('');
      
      // Focus on TOTP input after a brief delay
      setTimeout(() => {
        totpInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Task #637: render a live mm:ss countdown while the brute-force
  // lockout is in effect. Re-runs only when `lockoutResetAt` changes
  // (set by the catch branches after a 429), and clears itself the
  // moment the cooldown elapses so the dialog snaps back to the
  // verify form without forcing the parent to remount it.
  // Subtracting `Date.now()` from the absolute target on every tick
  // (instead of decrementing a counter) keeps the countdown
  // accurate even if the tab was backgrounded — `setInterval`
  // callbacks are throttled in hidden tabs so a naive decrement
  // would drift behind the server.
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
        setLockoutFallbackMessage('');
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

  // Focus on the appropriate input when switching tabs
  useEffect(() => {
    if (activeTab === 'totp') {
      setTimeout(() => totpInputRef.current?.focus(), 100);
    } else if (activeTab === 'recovery') {
      setTimeout(() => recoveryInputRef.current?.focus(), 100);
    }
    // Passkey tab has no input — the user clicks the button to invoke
    // navigator.credentials.get() so there is nothing to focus here.
  }, [activeTab]);

  // Auto-submit when TOTP code reaches 6 digits — but suppress
  // while the brute-force lockout banner is up so we don't keep
  // firing requests against a closed bucket the moment the user
  // (still hopefully) types another code into the field. The
  // input is also `disabled` during lockout, but this guard is
  // belt-and-braces in case the disabled prop ever gets bypassed.
  useEffect(() => {
    if (totpCode.length === 6 && activeTab === 'totp' && lockoutResetAt === null) {
      handleVerifyTotp();
    }
  }, [totpCode]);

  /**
   * Task #637: shared 429-handling for all three verifier mutations
   * (TOTP, recovery, passkey). Returns `true` if the error was a
   * brute-force lockout (in which case the caller should bail
   * BEFORE running its per-attempt failure path — otherwise we'd
   * decrement `attemptsRemaining` for an attempt the server never
   * verified, or burn a recovery code against a closed bucket).
   * Returns `false` for any other error so the caller can fall
   * through to its existing invalid-code/invalid-recovery branch.
   *
   * Sets `lockoutResetAt` from `retryAfterSeconds` when present,
   * or `lockoutFallbackMessage` when the server signalled lockout
   * but didn't give us a usable cooldown — the dialog renders the
   * countdown banner in the former case and the static
   * "wait a few minutes" copy in the latter, mirroring the
   * landing-page lockout banner's two-mode fallback (Task #629).
   */
  const handleRateLimit = (error: unknown): boolean => {
    const { isRateLimited, retryAfterSeconds } = readRateLimitSignal(error);
    if (!isRateLimited) return false;
    if (retryAfterSeconds && retryAfterSeconds > 0) {
      setLockoutResetAt(Date.now() + retryAfterSeconds * 1000);
      setLockoutFallbackMessage('');
    } else {
      setLockoutResetAt(null);
      setLockoutFallbackMessage(
        i18n.t('security.mfa.challenge.lockout.tooManyAttempts'),
      );
    }
    return true;
  };

  // Verify TOTP code mutation
  const verifyTotpMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await apiRequest('POST', '/api/mfa/challenge', {
        type: 'totp',
        code,
        trustDevice,
        temporaryToken
      });
      return response;
    },
    onSuccess: (data: MfaChallengeSuccessData) => {
      // Task #615: pivot to the regenerate prompt only when the
      // server flagged the stored count as low. Healthy counts
      // fall through so authenticator users aren't nagged on
      // every login. Older server builds omit the field, in which
      // case `=== true` keeps the original flow.
      if (data?.recoveryCodesLow === true && typeof data?.recoveryCodesRemaining === 'number') {
        setRecoverySuccess({
          remaining: data.recoveryCodesRemaining,
          low: true,
          sessionData: data,
        });
        return;
      }
      showSuccessToast(
        "security.mfa.challenge.toasts.successTitle",
        "security.mfa.challenge.toasts.successDescription",
      );
      onSuccess(data);
    },
    onError: (error: any) => {
      // Task #637: 429 brute-force lockout MUST take precedence over
      // the per-attempt invalid-code path — otherwise the dialog
      // decrements `attemptsRemaining` for an attempt the server
      // never even verified, and shows the misleading "invalid
      // code" toast for what is actually a lockout. The lockout
      // banner replaces the verify form so subsequent code is
      // unreachable until the cooldown elapses.
      if (handleRateLimit(error)) {
        setTotpCode('');
        return;
      }
      const remaining = Math.max(0, attemptsRemaining - 1);
      setAttemptsRemaining(remaining);
      
      if (remaining === 0) {
        showErrorToast(
          "security.mfa.challenge.toasts.failedTitle",
          "security.mfa.challenge.toasts.tooManyDescription",
        );
        onCancel();
      } else {
        showErrorToast(
          i18n.t("security.mfa.challenge.toasts.invalidCodeTitle"),
          i18n.t("security.mfa.challenge.toasts.invalidCodeWithRemaining", { count: remaining }),
        );
        
        // Show recovery option after 2 failed attempts
        if (remaining === 1) {
          setShowRecoveryOption(true);
        }
      }
      
      setTotpCode('');
    },
  });

  // Task #634: tracks whether `/api/webauthn/authenticate/begin` has
  // set the `mfa_login_challenge` HttpOnly cookie since we last
  // cleared it. Used to decide whether to fire the cancel endpoint
  // when the user backs out (cancels the authenticator prompt,
  // switches tabs away from passkey, closes the dialog). A ref
  // instead of state because flipping it must not trigger a re-render
  // and the value is read inside event handlers, not the JSX.
  const passkeyChallengeIssuedRef = useRef(false);

  // Best-effort cleanup that drops the `mfa_login_challenge` cookie
  // server-side (Task #634). Fire-and-forget — the cookie is
  // HMAC-bound to the user and expires in 5 minutes anyway, so a
  // failed cancel call is not a security issue, just untidy. Reset
  // the ref before issuing the request so re-entrant cancellations
  // (e.g. user clicks Cancel while the cancel POST is already in
  // flight) don't spam the endpoint.
  const cancelPasskeyChallenge = () => {
    if (!passkeyChallengeIssuedRef.current) return;
    passkeyChallengeIssuedRef.current = false;
    apiRequest('POST', '/api/webauthn/authenticate/cancel', {}).catch(() => {});
  };

  // Verify passkey (WebAuthn) mutation. Two-step round-trip:
  //   1. POST /api/webauthn/authenticate/begin with the temp token to
  //      fetch the assertion options + a server-issued challenge.
  //   2. Hand them to the browser via startAuthentication() so the
  //      authenticator (Touch ID, Windows Hello, security key, etc.)
  //      produces a signed assertion.
  //   3. POST /api/mfa/challenge with type='webauthn' so the server
  //      verifies the assertion against the stored credential, sets
  //      the session cookie, and we land in the same `onSuccess`
  //      branch the TOTP path uses.
  const verifyPasskeyMutation = useMutation({
    mutationFn: async () => {
      const beginResponse = await apiRequest(
        'POST',
        '/api/webauthn/authenticate/begin',
        { temporaryToken },
      );
      // Task #634: from here on the `mfa_login_challenge` cookie is
      // sitting in the browser. If anything below throws (user
      // cancels the authenticator, the verify POST errors out), the
      // onError handler must fire the cancel endpoint so the cookie
      // doesn't loiter for the rest of its 5-minute TTL.
      passkeyChallengeIssuedRef.current = true;
      const assertion = await startAuthentication(beginResponse);
      // The HMAC-signed challenge token (Task #611) used to ride back
      // in the body of /begin and we echoed it back in this body —
      // Task #624 swapped that for an HttpOnly cookie set by /begin
      // and read by /challenge so the token stays out of DevTools and
      // any error-tracking tool that snapshots request bodies. The
      // cookie is sent automatically because apiRequest uses
      // credentials: 'include' and the cookie is path-scoped to
      // /api/mfa/challenge. The flow remains stateless on the server
      // (the cookie value IS the signed token) so passkey login still
      // survives restarts and multi-worker deployments.
      const response = await apiRequest('POST', '/api/mfa/challenge', {
        type: 'webauthn',
        assertion,
        trustDevice,
        temporaryToken,
      });
      // Task #634: /api/mfa/challenge always emits a Set-Cookie
      // clearing the challenge cookie now (every branch, not just
      // webauthn), so once the verify POST returns the cookie is
      // gone — no need for the cancel endpoint to also fire.
      passkeyChallengeIssuedRef.current = false;
      return response;
    },
    onSuccess: (data: MfaChallengeSuccessData) => {
      // Task #632: pivot to the regenerate prompt when the server
      // flagged the stored count as low — same contract the TOTP
      // (#615) and recovery (#602) branches use. A passkey-only
      // operator could otherwise drift down to zero recovery codes
      // and never see the nudge. Healthy counts fall through so
      // passkey users aren't nagged on every login. Older server
      // builds (pre-#632) omit the field, in which case the
      // `=== true` check keeps the original toast + onSuccess flow.
      if (data?.recoveryCodesLow === true && typeof data?.recoveryCodesRemaining === 'number') {
        setRecoverySuccess({
          remaining: data.recoveryCodesRemaining,
          low: true,
          sessionData: data,
        });
        return;
      }
      showSuccessToast(
        "security.mfa.challenge.toasts.successTitle",
        "security.mfa.challenge.toasts.successDescription",
      );
      onSuccess(data);
    },
    onError: (error: any) => {
      // Task #637: surface the brute-force lockout for the passkey
      // surface too — the rate limiter on /api/mfa/challenge is
      // shared across all three verifier types (TOTP, recovery,
      // passkey), so an attacker hammering one branch can lock the
      // user out of the others. Without this branch the passkey tab
      // would only show the generic "passkey failed" toast and the
      // user would have no idea the server had locked them out.
      if (handleRateLimit(error)) {
        return;
      }
      // Distinguish the user cancelling the authenticator prompt
      // (NotAllowedError / AbortError raised by the WebAuthn API) from
      // a true verification failure so the toast doesn't shame the user
      // for hitting Cancel.
      const name = error?.name || '';
      const wasCancelled = name === 'NotAllowedError' || name === 'AbortError';
      // Task #634: the user backed out of the authenticator prompt
      // (or the verify POST errored before /challenge could clear
      // the cookie itself). Drop the leftover `mfa_login_challenge`
      // cookie now so it doesn't sit around for its 5-minute TTL.
      cancelPasskeyChallenge();
      showErrorToast(
        i18n.t("security.mfa.challenge.toasts.passkeyFailedTitle"),
        wasCancelled
          ? i18n.t("security.mfa.challenge.toasts.passkeyCancelledDescription")
          : (error?.message || i18n.t("security.mfa.challenge.toasts.passkeyFailedDescription")),
      );
    },
  });

  // Verify recovery code mutation
  const verifyRecoveryMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await apiRequest('POST', '/api/mfa/challenge', {
        type: 'recovery',
        code,
        trustDevice,
        temporaryToken
      });
      return response;
    },
    onSuccess: (data: any) => {
      // Task #602: the server tells us how many recovery codes are
      // left and whether the count is below the warning threshold.
      // When the warning payload is present we pivot to the
      // confirmation view instead of immediately handing control
      // back — the operator must explicitly continue (or
      // regenerate) so the "X codes remaining" notice and the
      // regenerate prompt can't be dismissed by a stray redirect.
      // Older server builds (pre-#602) won't include the field; in
      // that case fall back to the original toast + onSuccess flow
      // so the dialog never blocks the post-recovery login.
      if (typeof data?.recoveryCodesRemaining === 'number') {
        setRecoverySuccess({
          remaining: data.recoveryCodesRemaining,
          low: data.recoveryCodesLow === true,
          sessionData: data,
        });
        return;
      }
      showSuccessToast(
        "security.mfa.challenge.toasts.successTitle",
        "security.mfa.challenge.toasts.successRecoveryDescription",
      );
      onSuccess(data);
    },
    onError: (error: any) => {
      // Task #637: same shared 429 lockout the TOTP/passkey
      // branches handle — surface the cooldown banner instead of
      // the generic "invalid recovery code" toast so a user who's
      // tripped the limiter doesn't keep burning recovery codes
      // against a closed bucket.
      if (handleRateLimit(error)) {
        setRecoveryCode('');
        return;
      }
      showErrorToast(
        i18n.t("security.mfa.challenge.toasts.invalidRecoveryTitle"),
        error?.message || i18n.t("security.mfa.challenge.toasts.invalidRecoveryDescription"),
      );
      setRecoveryCode('');
    },
  });

  // Task #602: Regenerate recovery codes mutation. Hits the existing
  // /api/mfa/recovery/regenerate endpoint which now resolves because
  // the recovery-code challenge already established the
  // authenticated session. We surface the freshly-issued codes so
  // the operator can save them before clicking Continue — the same
  // contract the post-setup screen uses.
  const regenerateMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/mfa/recovery/regenerate', {});
    },
    onSuccess: (data: any) => {
      const codes: string[] = Array.isArray(data?.recoveryCodes) ? data.recoveryCodes : [];
      setRegeneratedCodes(codes);
      setIsRegenerating(false);
      showSuccessToast(
        "security.mfa.challenge.recoveryWarning.regenerateSuccessTitle",
        "security.mfa.challenge.recoveryWarning.regenerateSuccessDescription",
      );
    },
    onError: (error: any) => {
      setIsRegenerating(false);
      showErrorToast(
        i18n.t("security.mfa.challenge.recoveryWarning.regenerateFailedTitle"),
        error?.message || i18n.t("security.mfa.challenge.recoveryWarning.regenerateFailedDescription"),
      );
    },
  });

  const handleRegenerateNow = () => {
    setIsRegenerating(true);
    regenerateMutation.mutate();
  };

  const handleContinueAfterRecovery = () => {
    const sessionData = recoverySuccess?.sessionData;
    setRecoverySuccess(null);
    setRegeneratedCodes(null);
    onSuccess(sessionData);
  };

  const handleVerifyTotp = () => {
    if (!totpCode.trim() || totpCode.length !== 6) {
      showErrorToast(
        "security.mfa.challenge.toasts.invalidCodeTitle",
        "security.mfa.challenge.toasts.enterSixDigit",
      );
      return;
    }
    verifyTotpMutation.mutate(totpCode.trim());
  };

  const handleVerifyRecovery = () => {
    if (!recoveryCode.trim()) {
      showErrorToast(
        "security.mfa.challenge.toasts.recoveryRequiredTitle",
        "security.mfa.challenge.toasts.recoveryRequiredDescription",
      );
      return;
    }
    verifyRecoveryMutation.mutate(recoveryCode.trim());
  };

  const handleKeyPress = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      action();
    }
  };

  const isPending =
    verifyTotpMutation.isPending ||
    verifyRecoveryMutation.isPending ||
    verifyPasskeyMutation.isPending;

  // Task #637: while the brute-force lockout is in effect (or the
  // server signalled a lockout we couldn't compute a countdown
  // for) we treat every verifier surface as disabled — the user
  // has nothing useful to do until the cooldown elapses, and
  // letting them keep typing/clicking just produces a stream of
  // 429s that don't even get audited as fresh attempts.
  const isLockedOut = lockoutResetAt !== null || lockoutFallbackMessage !== '';
  const isVerifierDisabled = isPending || isLockedOut;

  const handleVerifyPasskey = () => {
    verifyPasskeyMutation.mutate();
  };

  // Task #634: wraps the prop-supplied `onCancel` so any leftover
  // `mfa_login_challenge` cookie set by /begin gets dropped before
  // the dialog goes away. Used by the Cancel button and the
  // outside-click / Escape branches of the Dialog.onOpenChange
  // callback. Safe to call regardless of which tab the user is on
  // because `cancelPasskeyChallenge` no-ops when no challenge has
  // been issued since the last cleanup.
  const handleDialogCancel = () => {
    cancelPasskeyChallenge();
    onCancel();
  };

  // Task #634: when the user switches away from the passkey tab
  // after kicking off /begin (e.g. cancels the authenticator prompt
  // and decides to fall back to TOTP), drop the cookie now instead
  // of waiting for /api/mfa/challenge to clear it on the next
  // verify. Without this the cookie sits in the browser through
  // the entire TOTP retry sequence even though it can't be used.
  const handleTabChange = (next: string) => {
    if (next !== 'passkey') {
      cancelPasskeyChallenge();
    }
    setActiveTab(next as 'totp' | 'recovery' | 'passkey');
  };

  // Once the recovery-success warning is showing, the dialog is in a
  // post-auth state — the regenerate mutation may still be in
  // flight, but the original verify mutations are not, so we use a
  // distinct flag to gate the post-success buttons.
  const isPostRecoveryPending = isRegenerating || regenerateMutation.isPending;

  // Task #602: render a self-contained post-success view inside the
  // same dialog so the warning + regenerate prompt are unmissable.
  // The dialog cannot be dismissed via outside-click while the
  // notice is up — the operator must click Continue (or
  // Regenerate → Continue) to surface the new session in the parent.
  if (recoverySuccess) {
    const { remaining, low } = recoverySuccess;
    const warningTone = low ? 'red' : remaining < 6 ? 'amber' : 'green';
    const toneClasses = warningTone === 'red'
      ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 text-red-900 dark:text-red-200'
      : warningTone === 'amber'
        ? 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-900 text-yellow-900 dark:text-yellow-200'
        : 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900 text-green-900 dark:text-green-200';
    const ToneIcon = warningTone === 'red' ? AlertTriangle : warningTone === 'amber' ? AlertCircle : CheckCircle;
    return (
      <Dialog open={isOpen} onOpenChange={() => !isPostRecoveryPending && handleContinueAfterRecovery()}>
        <DialogContent
          className="max-w-md"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => isPostRecoveryPending && e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-500" />
              {t("security.mfa.challenge.recoveryWarning.title")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className={`rounded-lg border p-3 ${toneClasses}`} data-testid="recovery-codes-remaining-notice">
              <div className="flex items-start gap-2">
                <ToneIcon className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium mb-1">
                    {t("security.mfa.challenge.recoveryWarning.remaining", { count: remaining })}
                  </p>
                  {low ? (
                    <p>{t("security.mfa.challenge.recoveryWarning.lowDescription")}</p>
                  ) : (
                    <p>{t("security.mfa.challenge.recoveryWarning.healthyDescription")}</p>
                  )}
                </div>
              </div>
            </div>

            {regeneratedCodes && regeneratedCodes.length > 0 && (
              <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 p-3" data-testid="regenerated-codes-list">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">
                  {t("security.mfa.challenge.recoveryWarning.newCodesTitle")}
                </p>
                <p className="text-xs text-blue-800 dark:text-blue-300 mb-2">
                  {t("security.mfa.challenge.recoveryWarning.newCodesDescription")}
                </p>
                <div className="grid grid-cols-1 gap-1 font-mono text-xs bg-white dark:bg-slate-900 border border-blue-100 dark:border-blue-900 rounded p-2 max-h-48 overflow-auto">
                  {regeneratedCodes.map((c) => (
                    <div key={c}>{c}</div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              {!regeneratedCodes && (
                <Button
                  variant={low ? "default" : "outline"}
                  onClick={handleRegenerateNow}
                  disabled={isPostRecoveryPending}
                  className="flex-1"
                  data-testid="button-regenerate-recovery-codes"
                >
                  {regenerateMutation.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      {t("security.mfa.challenge.recoveryWarning.regenerating")}
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      {t("security.mfa.challenge.recoveryWarning.regenerateButton")}
                    </>
                  )}
                </Button>
              )}
              <Button
                onClick={handleContinueAfterRecovery}
                disabled={isPostRecoveryPending}
                className="flex-1"
                variant={regeneratedCodes ? "default" : low && !regeneratedCodes ? "outline" : "default"}
                data-testid="button-continue-after-recovery"
              >
                {regeneratedCodes
                  ? t("security.mfa.challenge.recoveryWarning.continueAfterRegenerate")
                  : low
                    ? t("security.mfa.challenge.recoveryWarning.continueWithoutRegenerate")
                    : t("security.mfa.challenge.recoveryWarning.continueButton")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={() => !isPending && handleDialogCancel()}>
      <DialogContent className="max-w-md" onPointerDownOutside={(e) => isPending && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldUser className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            {t("security.mfa.challenge.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* User Info */}
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium text-blue-900 dark:text-blue-200 font-mono">
                {t("security.mfa.challenge.signingInAs", { email: userEmail })}
              </span>
            </div>
          </div>

          {/* Task #637: brute-force lockout banner. Renders only
              when the server returned 429 from /api/mfa/challenge,
              and takes precedence over the per-attempt
              "attemptsRemaining" notice — they're mutually
              exclusive in practice (a 429 short-circuits the
              client-side counter), but ordering here makes the
              precedence obvious to anyone editing this file later.
              The countdown ticks every second from the absolute
              reset target so it stays accurate even if the tab was
              backgrounded. Mirrors the password-login lockout
              banner introduced for /api/login in Task #629. */}
          {isLockedOut && (
            <div
              data-testid="mfa-challenge-lockout-notice"
              role="alert"
              className="text-red-700 dark:text-red-300 text-sm font-medium bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md px-3 py-2"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  {lockoutCountdown
                    ? t('security.mfa.challenge.lockout.tooManyAttemptsCountdown', { time: lockoutCountdown })
                    : (lockoutFallbackMessage || t('security.mfa.challenge.lockout.tooManyAttempts'))}
                </span>
              </div>
            </div>
          )}

          {/* Attempts Warning */}
          {!isLockedOut && attemptsRemaining < 3 && (
            <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
                <span className="text-sm text-yellow-800 dark:text-yellow-300">
                  {t("security.mfa.challenge.attemptsRemaining", { count: attemptsRemaining })}
                </span>
              </div>
            </div>
          )}

          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            {/* One compact card: the method title on the left, an icon-only
                Authenticator / Passkey / Recovery toggle on the right. */}
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 p-4 pb-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <CardTitle className="text-base">{t(`security.mfa.challenge.${activeTab}.title`)}</CardTitle>
                  <CardDescription className="text-xs">
                    {t(`security.mfa.challenge.${activeTab}.description`)}
                  </CardDescription>
                </div>
                <TabsList className="h-8 w-auto! shrink-0 gap-0.5 p-0.5! border-b-0!" aria-label={t("security.mfa.challenge.tabs.label")}>
                  {([
                    { value: "totp", icon: Smartphone, label: t("security.mfa.challenge.tabs.authenticator") },
                    { value: "passkey", icon: Fingerprint, label: t("security.mfa.challenge.tabs.passkey") },
                    { value: "recovery", icon: Key, label: t("security.mfa.challenge.tabs.recovery") },
                  ] as const).map(({ value, icon: Icon, label }) => (
                    <TabsTrigger
                      key={value}
                      value={value}
                      title={label}
                      aria-label={label}
                      disabled={value === "recovery" && !showRecoveryOption && activeTab === 'totp'}
                      className="h-7 w-8 grow-0 px-0 py-0 text-gray-500 dark:text-gray-400"
                      data-testid={`tab-${value}`}
                    >
                      <Icon className="h-4 w-4" />
                    </TabsTrigger>
                  ))}
                </TabsList>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {/* TOTP Tab */}
                <TabsContent value="totp" className="mt-0 space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="totp-code">{t("security.mfa.challenge.totp.codeLabel")}</Label>
                    <Input
                      ref={totpInputRef}
                      id="totp-code"
                      type="text"
                      placeholder={t("security.mfa.challenge.totp.codePlaceholder")}
                      maxLength={6}
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                      onKeyPress={(e) => handleKeyPress(e, handleVerifyTotp)}
                      className="text-center text-lg tracking-widest font-mono"
                      disabled={isVerifierDisabled}
                      autoComplete="one-time-code"
                    />
                  </div>
                  
                  <Button 
                    onClick={handleVerifyTotp}
                    disabled={isVerifierDisabled || totpCode.length !== 6}
                    className="w-full"
                  >
                    {verifyTotpMutation.isPending ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        {t("security.mfa.challenge.totp.verifying")}
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        {t("security.mfa.challenge.totp.verifyButton")}
                      </>
                    )}
                  </Button>

                  {/* Recovery Option */}
                  {showRecoveryOption && (
                    <div className="text-center">
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {t("security.mfa.challenge.totpHelp.havingTrouble")}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTabChange('recovery')}
                        disabled={isVerifierDisabled}
                      >
                        <Key className="h-4 w-4 mr-2" />
                        {t("security.mfa.challenge.totpHelp.useRecoveryButton")}
                      </Button>
                    </div>
                  )}
                </TabsContent>

                {/* Passkey Tab */}
                <TabsContent value="passkey" className="mt-0 space-y-3">
                  <Button
                    onClick={handleVerifyPasskey}
                    disabled={isVerifierDisabled}
                    className="w-full"
                    data-testid="button-verify-passkey"
                  >
                    {verifyPasskeyMutation.isPending ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        {t("security.mfa.challenge.passkey.verifying")}
                      </>
                    ) : (
                      <>
                        <Fingerprint className="h-4 w-4 mr-2" />
                        {t("security.mfa.challenge.passkey.verifyButton")}
                      </>
                    )}
                  </Button>
                </TabsContent>

                {/* Recovery Tab */}
                <TabsContent value="recovery" className="mt-0 space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="recovery-code">{t("security.mfa.challenge.recovery.codeLabel")}</Label>
                    <Input
                      ref={recoveryInputRef}
                      id="recovery-code"
                      type="text"
                      placeholder={t("security.mfa.challenge.recovery.codePlaceholder")}
                      value={recoveryCode}
                      onChange={(e) => setRecoveryCode(e.target.value.trim())}
                      onKeyPress={(e) => handleKeyPress(e, handleVerifyRecovery)}
                      className="text-center font-mono"
                      disabled={isVerifierDisabled}
                    />
                  </div>
                  
                  <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-500 mt-0.5 shrink-0" />
                      <div className="text-sm text-yellow-800 dark:text-yellow-300">
                        <p className="font-medium mb-1">{t("security.mfa.challenge.recovery.importantTitle")}</p>
                        <p>{t("security.mfa.challenge.recovery.importantDescription")}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button 
                      variant="outline"
                      onClick={() => handleTabChange('totp')}
                      disabled={isVerifierDisabled}
                      className="flex-1"
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      {t("security.mfa.challenge.recovery.backButton")}
                    </Button>
                    
                    <Button 
                      onClick={handleVerifyRecovery}
                      disabled={isVerifierDisabled || !recoveryCode.trim()}
                      className="flex-1"
                    >
                      {verifyRecoveryMutation.isPending ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          {t("security.mfa.challenge.recovery.verifying")}
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-4 w-4 mr-2" />
                          {t("security.mfa.challenge.recovery.verifyButton")}
                        </>
                      )}
                    </Button>
                  </div>
                </TabsContent>
              </CardContent>
            </Card>
          </Tabs>

          {/* Trust Device Option */}
          <div className="border-t pt-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="trust-device"
                checked={trustDevice}
                onCheckedChange={(checked) => setTrustDevice(checked === true)}
                disabled={isPending}
              />
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                <Label htmlFor="trust-device" className="text-sm cursor-pointer">
                  {t("security.mfa.challenge.trustDevice.label")}
                </Label>
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
              {t("security.mfa.challenge.trustDevice.description")}
            </p>
          </div>

          {/* Footer Actions */}
          <Separator />
          
          <div className="flex justify-between items-center text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{t("security.mfa.challenge.sessionExpires")}</span>
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDialogCancel}
              disabled={isPending}
            >
              {t("security.mfa.challenge.cancel")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
