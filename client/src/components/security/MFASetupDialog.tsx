import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/use-theme";
import { useToast } from "@/hooks/use-toast";
import { showErrorToast, showInfoToast, showSuccessToast } from "@/lib/toast-helper";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { clearSessionEstablished } from "@/lib/session-marker";
import { safeCopyToClipboard } from "@/lib/clipboard";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogPortal } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SecurityHealthBadge, type SecurityHealth } from "./SecurityHealthBadge";

import { 
  ShieldUser, 
  Smartphone, 
  Key, 
  QrCode,
  Copy,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Download,
  RefreshCw,
  Eye,
  EyeOff,
  LogOut,
  Target,
  AlertCircle,
  Fingerprint,
  X,
  Shield,
  ShieldOff,
  ShieldCheck,
  FolderCode
} from "lucide-react";

import { cn } from "@/lib/utils";
import { startRegistration } from '@simplewebauthn/browser';

interface MFASetupDialogProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string; // Optional - if provided, manage MFA for specific user (admin use)
  isEnforcementMode?: boolean; // If true, dialog cannot be closed (login/setup required). If false, user can close (profile management)
  // Optional: when supplied, the post-recovery-download "what to do next"
  // callout's button calls this instead of just closing the dialog. Lets
  // the parent surface (profile editor / security drawer) actively land
  // the operator on their Status tab, rather than dropping them back
  // wherever they happened to be. Falls back to onClose() when omitted
  // (Task #583).
  onGoToStatus?: () => void;
}

interface MFASetupData {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

interface UserMFAStatus {
  enabled: boolean;
  method: 'totp' | 'webauthn' | null;
  enrolledAt: string | null;
  recoveryCount: number;
  passkeyCount: number;
  securityHealth: SecurityHealth;
}

export default function MFASetupDialog({ isOpen, onClose, userId, isEnforcementMode = false, onGoToStatus }: MFASetupDialogProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const criteriaIqLogoUrl = theme === "dark"
    ? "/attached_assets/system/branding/criteriaiq-logo-dark.png"
    : "/attached_assets/system/branding/criteriaiq-logo-light.png";
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State management
  const [activeTab, setActiveTab] = useState<'status' | 'setup' | 'recovery' | 'passkeys'>('status');
  const [totpCode, setTotpCode] = useState('');
  const [showCodes, setShowCodes] = useState(false);
  const [setupData, setSetupData] = useState<MFASetupData | null>(null);
  const [mfaStatus, setMfaStatus] = useState<UserMFAStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Tracks whether the operator has downloaded their freshly-generated
  // recovery codes during this dialog session. Once true, we surface a
  // "what to do next" callout at the bottom of the recovery tab — without
  // it, users finish the wizard with no idea they still need to log out
  // and back in to actually exercise the MFA challenge on next login.
  const [codesDownloaded, setCodesDownloaded] = useState(false);
  // Lets the operator dismiss the post-download "what to do next"
  // callout once they've read it. Reset every time the dialog re-opens
  // so a fresh setup session always sees the guidance again.
  const [nextStepDismissed, setNextStepDismissed] = useState(false);

  // Disable MFA confirmation state
  const [disableMfaConfirmOpen, setDisableMfaConfirmOpen] = useState(false);

  // Determine target user (self or admin managing another user)
  const targetUser = userId || currentUser?.id;
  const isAdminMode = userId && userId !== currentUser?.id;

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setActiveTab('status');
      setTotpCode('');
      setShowCodes(false);
      setSetupData(null);
      setCodesDownloaded(false);
      setNextStepDismissed(false);
      fetchMFAStatus();
    }
  }, [isOpen]);

  // Fetch current MFA status with proper validation
  const fetchMFAStatus = async () => {
    if (!targetUser) return;
    
    try {
      setIsLoading(true);
      const response = await apiRequest('GET', `/api/mfa/status/${targetUser}`);
      
      // Validate response and compute securityHealth if missing
      const validatedStatus: UserMFAStatus = {
        enabled: response.enabled || false,
        method: response.method || null,
        enrolledAt: response.enrolledAt || null,
        recoveryCount: response.recoveryCount || 0,
        passkeyCount: response.passkeyCount || 0,
        securityHealth: response.securityHealth || {
          enabled: response.enabled || false,
          method: response.method || null,
          enrolledAt: response.enrolledAt || null,
          recoveryCount: response.recoveryCount || 0,
          passkeyCount: response.passkeyCount || 0,
          health: !response.enabled ? 'red' : // RED only when MFA is disabled
            (response.recoveryCount > 0 && response.passkeyCount > 0 ? 'green' : 
             response.recoveryCount > 0 ? 'amber' : 'amber') // AMBER when MFA enabled (even without recovery codes)
        }
      };
      
      setMfaStatus(validatedStatus);
    } catch (error: any) {
      showErrorToast(
        i18n.t("security.mfa.setup.toasts.fetchStatusErrorTitle"),
        error?.message || i18n.t("security.mfa.setup.toasts.fetchStatusErrorDescription"),
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Setup TOTP mutation with admin mode support
  const setupTotpMutation = useMutation({
    mutationFn: async () => {
      const endpoint = isAdminMode ? `/api/mfa/totp/setup/${userId}` : '/api/mfa/totp/setup';
      const response = await apiRequest('POST', endpoint);
      
      // Validate and normalize response
      const normalizedData: MFASetupData = {
        secret: response.secret || response.totpSecret || '',
        qrCodeUrl: response.qrPngDataUrl || response.qrCodeUrl || response.qrCodeDataUrl || '',
        backupCodes: response.backupCodes || response.recoveryCodes || []
      };
      
      return normalizedData;
    },
    onSuccess: (data) => {
      setSetupData(data);
      setActiveTab('setup');
      showInfoToast(
        "security.mfa.setup.toasts.totpStartedTitle",
        "security.mfa.setup.toasts.totpStartedDescription",
      );
    },
    onError: (error: any) => {
      showErrorToast(
        i18n.t("security.mfa.setup.toasts.setupFailedTitle"),
        error?.message || i18n.t("security.mfa.setup.toasts.setupFailedDescription"),
      );
    },
  });

  // Verify TOTP and complete setup with admin mode support
  const verifyTotpMutation = useMutation({
    mutationFn: async (code: string) => {
      const endpoint = isAdminMode ? `/api/mfa/totp/verify/${userId}` : '/api/mfa/totp/verify';
      const response = await apiRequest('POST', endpoint, {
        code
      });
      
      // Normalize response
      return {
        ...response,
        recoveryCodes: response.recoveryCodes || response.backupCodes || []
      };
    },
    onSuccess: (data) => {
      setMfaStatus({
        enabled: true,
        method: 'totp',
        enrolledAt: new Date().toISOString(),
        recoveryCount: data.recoveryCodes?.length || 10,
        passkeyCount: 0,
        securityHealth: {
          enabled: true,
          method: 'totp',
          enrolledAt: new Date().toISOString(),
          recoveryCount: data.recoveryCodes?.length || 10,
          passkeyCount: 0,
          health: 'amber' // amber because no passkeys yet
        }
      });
      
      setSetupData(prev => prev ? { ...prev, backupCodes: data.recoveryCodes } : null);
      setActiveTab('recovery');
      setTotpCode('');
      
      showSuccessToast(
        "security.mfa.setup.toasts.mfaEnabledTitle",
        "security.mfa.setup.toasts.mfaEnabledDescription",
      );

      // Refresh MFA status after successful verification
      fetchMFAStatus();
    },
    onError: (error: any) => {
      showErrorToast(
        i18n.t("security.mfa.setup.toasts.verificationFailedTitle"),
        error?.message || i18n.t("security.mfa.setup.toasts.verificationFailedDescription"),
      );
    },
  });

  // Disable MFA mutation with admin mode support
  const disableMfaMutation = useMutation({
    mutationFn: async () => {
      const endpoint = isAdminMode ? `/api/mfa/disable/${userId}` : '/api/mfa/disable';
      const response = await apiRequest('POST', endpoint);
      return response;
    },
    onSuccess: () => {
      setMfaStatus({
        enabled: false,
        method: null,
        enrolledAt: null,
        recoveryCount: 0,
        passkeyCount: 0,
        securityHealth: {
          enabled: false,
          method: null,
          enrolledAt: null,
          recoveryCount: 0,
          passkeyCount: 0,
          health: 'red'
        }
      });
      
      setActiveTab('status');
      showSuccessToast(
        "security.mfa.setup.toasts.mfaDisabledTitle",
        "security.mfa.setup.toasts.mfaDisabledDescription",
      );

      // Refresh MFA status after disabling
      fetchMFAStatus();
    },
    onError: (error: any) => {
      showErrorToast(
        i18n.t("security.mfa.setup.toasts.disableFailedTitle"),
        error?.message || i18n.t("security.mfa.setup.toasts.disableFailedDescription"),
      );
    },
  });

  // Generate new recovery codes with admin mode support
  const regenerateCodesMutation = useMutation({
    mutationFn: async () => {
      const endpoint = isAdminMode ? `/api/mfa/recovery-codes/regenerate/${userId}` : '/api/mfa/recovery-codes/regenerate';
      const response = await apiRequest('POST', endpoint);
      
      // Normalize response
      return {
        ...response,
        recoveryCodes: response.recoveryCodes || response.backupCodes || []
      };
    },
    onSuccess: (data) => {
      setSetupData(prev => prev ? { ...prev, backupCodes: data.recoveryCodes } : {
        secret: '',
        qrCodeUrl: '',
        backupCodes: data.recoveryCodes
      });
      
      showSuccessToast(
        "security.mfa.setup.toasts.codesRegeneratedTitle",
        "security.mfa.setup.toasts.codesRegeneratedDescription",
      );
    },
    onError: (error: any) => {
      showErrorToast(
        i18n.t("security.mfa.setup.toasts.regenerationFailedTitle"),
        error?.message || i18n.t("security.mfa.setup.toasts.regenerationFailedDescription"),
      );
    },
  });

  // Handler to show warning confirmation before regenerating codes
  const handleRegenerateClick = () => {
    const { dismiss } = toast({
      title: t("security.mfa.setup.regenerateConfirm.title"),
      description: t("security.mfa.setup.regenerateConfirm.description"),
      variant: "warning",
      action: (
        <div className="flex gap-2 w-full">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => dismiss()}
          >
            {t("security.mfa.setup.regenerateConfirm.cancel")}
          </Button>
          <Button
            size="sm"
            variant="default"
            className="flex-1"
            onClick={() => {
              dismiss();
              regenerateCodesMutation.mutate();
            }}
          >
            {t("security.mfa.setup.regenerateConfirm.continue")}
          </Button>
        </div>
      ),
    });
  };

  // Task #652: tracks whether /api/webauthn/register/begin has issued a
  // challenge cookie (`webauthn_register_challenge` for self-mode,
  // `webauthn_register_admin_challenge` for admin-mode) that has not yet
  // been consumed/cleared by /finish. We use a ref instead of state
  // because the value is read inside event handlers (close, unmount,
  // mutation onError) and flipping it must not trigger a re-render.
  // Mirrors the login-side `passkeyChallengeIssuedRef` in
  // MFAChallengeDialog (Task #634).
  const passkeyChallengeIssuedRef = useRef(false);

  // Best-effort cleanup that drops the registration challenge cookie
  // server-side when the user backs out before /finish runs (closes
  // the dialog, dismisses the authenticator prompt, navigates away).
  // Fire-and-forget — the cookie is HMAC-bound to a user id and
  // expires in 5 minutes anyway, so a failed cancel call is not a
  // security issue, just untidy. Reset the ref before issuing the
  // request so re-entrant cancellations (e.g. unmount fires while
  // onError already flushed) don't spam the endpoint. Uses plain
  // `fetch` (not `apiRequest`) so a Persona view-mode session can
  // still cleanly drop the cookie — the apiRequest persona guard
  // would otherwise block this and leave the cookie dangling.
  const cancelPasskeyChallenge = () => {
    if (!passkeyChallengeIssuedRef.current) return;
    passkeyChallengeIssuedRef.current = false;
    const cancelEndpoint = isAdminMode
      ? `/api/webauthn/register/cancel/${userId}`
      : '/api/webauthn/register/cancel';
    fetch(cancelEndpoint, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {});
  };

  // WebAuthn passkey registration
  const registerPasskeyMutation = useMutation({
    mutationFn: async () => {
      // Step 1: Get registration options from server (admin mode support)
      const beginEndpoint = isAdminMode ? `/api/webauthn/register/begin/${userId}` : '/api/webauthn/register/begin';
      const beginResponse = await apiRequest('POST', beginEndpoint);
      
      // Handle wrapped response shape if needed
      const options = beginResponse.options || beginResponse;
      if (!('publicKey' in options) && !('challenge' in options)) {
        throw new Error('Invalid registration options received from server');
      }
      
      // Task #652: from here on the challenge cookie is sitting in
      // the browser. If the authenticator prompt is dismissed or the
      // finish POST errors out below, the onError handler must fire
      // the cancel endpoint so the cookie doesn't loiter for the
      // rest of its 5-minute TTL. Set BEFORE startRegistration so a
      // user pressing Cancel during the prompt also routes through
      // the cleanup path.
      passkeyChallengeIssuedRef.current = true;

      // Step 2: Use browser WebAuthn API to create credential
      const registrationResponse = await startRegistration(options);
      
      // Step 3: Send credential to server for verification and storage (admin mode support)
      const finishEndpoint = isAdminMode ? `/api/webauthn/register/finish/${userId}` : '/api/webauthn/register/finish';
      const finishResponse = await apiRequest('POST', finishEndpoint, {
        response: registrationResponse,
        deviceName: navigator.userAgent.includes('Chrome') ? 'Chrome Browser' : 
                   navigator.userAgent.includes('Firefox') ? 'Firefox Browser' :
                   navigator.userAgent.includes('Safari') ? 'Safari Browser' : 'Unknown Browser'
      });

      // /finish always emits a Set-Cookie clearing the challenge
      // cookie (success and 400/expired branches both drop it), so
      // once the POST returns the cookie is gone — flip the ref so
      // a later onClose / unmount doesn't fire a redundant cancel.
      passkeyChallengeIssuedRef.current = false;

      return finishResponse;
    },
    onSuccess: () => {
      showSuccessToast(
        "security.mfa.setup.toasts.passkeyRegisteredTitle",
        "security.mfa.setup.toasts.passkeyRegisteredDescription",
      );
      
      // Refresh MFA status to update passkey count
      fetchMFAStatus();
    },
    onError: (error: any) => {
      const errorName = error.name || '';
      const errorMessage = error.message || i18n.t("security.mfa.setup.toasts.passkeyFailedDefault");
      console.error('WebAuthn registration error:', error);

      // Task #652: the user backed out of the authenticator prompt
      // (NotAllowedError / AbortError) or the finish POST errored
      // before /finish could clear the cookie itself. Drop the
      // leftover challenge cookie now so it doesn't sit around for
      // its 5-minute TTL.
      cancelPasskeyChallenge();

      showErrorToast(
        i18n.t("security.mfa.setup.toasts.passkeyFailedTitle"),
        errorName === 'NotAllowedError' || errorMessage.includes('NotAllowedError')
          ? i18n.t("security.mfa.setup.toasts.passkeyFailedNotAllowed")
          : errorName === 'NotSupportedError' || errorMessage.includes('NotSupportedError')
          ? i18n.t("security.mfa.setup.toasts.passkeyFailedNotSupported")
          : errorMessage,
      );
    },
  });

  // Task #652: belt-and-braces cleanup so a stale challenge cookie
  // doesn't outlive the dialog if the user closes/navigates away
  // while the registration mutation is mid-flight. The onClose +
  // onOpenChange branches below also call this synchronously when
  // possible; the unmount effect catches the cases where the parent
  // tears the dialog down without going through those paths (route
  // change, parent component re-render dropping it, enforcement
  // dialog auto-dismiss after a successful sibling flow). No-ops
  // when the ref is already false, so it's safe to fire on every
  // unmount.
  useEffect(() => {
    return () => {
      cancelPasskeyChallenge();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/logout', { 
        method: 'POST',
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Logout failed');
      }
      // Handle different response types (JSON or empty)
      try {
        return await response.json();
      } catch (e) {
        // Server might return 204 No Content
        return { message: 'Logout successful' };
      }
    },
    onSuccess: () => {
      showInfoToast(
        "security.mfa.setup.toasts.logoutSuccessTitle",
        "security.mfa.setup.toasts.logoutSuccessDescription",
      );
      // Task #420: clear the "had a session" marker so the next
      // visit to `/` lands on the login form, not the read-only
      // health-check view.
      clearSessionEstablished();
      // Refresh the page to clear auth state and go to login
      window.location.href = '/';
    },
    onError: (error: any) => {
      showErrorToast(
        i18n.t("security.mfa.setup.toasts.logoutFailedTitle"),
        error?.message || i18n.t("security.mfa.setup.toasts.logoutFailedDescription"),
      );
    },
  });

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const handleSetupTotp = () => {
    setupTotpMutation.mutate();
  };

  const handleVerifyCode = () => {
    if (!totpCode.trim()) {
      showErrorToast(
        "security.mfa.setup.toasts.codeRequiredTitle",
        "security.mfa.setup.toasts.codeRequiredDescription",
      );
      return;
    }
    verifyTotpMutation.mutate(totpCode.trim());
  };

  const handleDisableMfa = () => {
    setDisableMfaConfirmOpen(true);
  };

  const confirmDisableMfa = () => {
    disableMfaMutation.mutate();
  };

  const handleCopyCode = async (code: string) => {
    // Self-hosted CriteriaIQ deployments often run on plain HTTP (e.g. the
    // Dokploy *.traefik.me default), where `navigator.clipboard` is
    // `undefined` and a bare `writeText()` call throws — surfacing as the
    // generic "Copy Failed" toast operators kept reporting. The shared
    // `safeCopyToClipboard` helper falls back to an off-screen
    // `<textarea>` + `execCommand('copy')` so the button works in any
    // browser/context the dialog might run in.
    const ok = await safeCopyToClipboard(code);
    if (ok) {
      showSuccessToast(
        "security.mfa.setup.toasts.copiedTitle",
        "security.mfa.setup.toasts.copiedDescription",
      );
    } else {
      showErrorToast(
        "security.mfa.setup.toasts.copyFailedTitle",
        "security.mfa.setup.toasts.copyFailedDescription",
      );
    }
  };

  const handleDownloadCodes = () => {
    if (!setupData?.backupCodes) return;
    
    const content = `${i18n.t("security.mfa.setup.downloadFile.header")}
${i18n.t("security.mfa.setup.downloadFile.generated", { date: new Date().toLocaleDateString() })}
${i18n.t("security.mfa.setup.downloadFile.user", { email: currentUser?.email })}

${i18n.t("security.mfa.setup.downloadFile.warning")}

${setupData.backupCodes.map((code, index) => `${index + 1}. ${code}`).join('\n')}

${i18n.t("security.mfa.setup.downloadFile.footer")}`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `criteriaiq-recovery-codes-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setCodesDownloaded(true);

    showSuccessToast(
      "security.mfa.setup.toasts.downloadedTitle",
      "security.mfa.setup.toasts.downloadedDescription",
    );
  };

  // "Go to my Status" handler for the post-recovery-download callout.
  // When the parent surface (profile editor / security drawer) supplies
  // an `onGoToStatus` callback we delegate to it so the operator lands
  // directly on the Status tab they're being asked to visit. When no
  // callback is supplied (e.g. enforcement dialog) we fall back to
  // closing the dialog, which drops the user back wherever they came
  // from.
  const handleGoToStatus = () => {
    if (onGoToStatus) {
      onGoToStatus();
    } else {
      onClose();
    }
  };

  return (
    <>
    <Dialog open={isOpen} onOpenChange={(open) => {
      // Only allow closing if NOT in enforcement mode
      if (!open && !isEnforcementMode) {
        // Task #652: drop any in-flight passkey-registration challenge
        // cookie before the dialog goes away — covers the outside-click
        // and Escape-key close paths in addition to the explicit close
        // button below.
        cancelPasskeyChallenge();
        onClose();
      }
    }}>
      <DialogPortal>
        {/* Radix DialogOverlay with landing page gradient background and CriteriaIQ logo */}
        <DialogPrimitive.Overlay 
          className="fixed inset-0 z-50"
          style={{
            background: 'linear-gradient(to right, #050b39, #001cab)',
          }}
        >
          {/* CriteriaIQ logo background at 25% opacity */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `url('${criteriaIqLogoUrl}')`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center center',
              backgroundSize: 'contain',
              opacity: 0.25
            }}
          />
          {/* 40% opacity overlay to dim the background */}
          <div className="absolute inset-0 bg-black/40 pointer-events-none" />
        </DialogPrimitive.Overlay>
        
        <DialogPrimitive.Content
        className={cn(
          "w-[700px] h-[600px] overflow-hidden fixed left-[50%] top-[50%] z-[100] translate-x-[-50%] translate-y-[-50%] border-none bg-background shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg flex flex-col min-h-0 pointer-events-auto"
        )}
        onPointerDownOutside={(e) => {
          // Only prevent closing if in enforcement mode (login/setup required)
          if (isEnforcementMode) {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={(e) => {
          // Only prevent closing if in enforcement mode (login/setup required)
          if (isEnforcementMode) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4 relative">
          <DialogTitle className="flex items-center gap-2">
            <ShieldUser className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            {t("security.mfa.setup.title")}
            {isAdminMode && (
              <Badge variant="outline">{t("security.mfa.setup.adminMode")}</Badge>
            )}
          </DialogTitle>
          {/* Close button - only show when NOT in enforcement mode */}
          {!isEnforcementMode && (
            <button
              onClick={() => {
                // Task #652: explicit close button must also drop any
                // pending passkey-registration challenge cookie before
                // the dialog tears down — onOpenChange below covers the
                // outside-click/Escape branches but Radix doesn't fire
                // it for direct onClose calls.
                cancelPasskeyChallenge();
                onClose();
              }}
              className="absolute top-6 right-6 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label={t("security.mfa.setup.closeAria")}
            >
              <X className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            </button>
          )}
          {/* CriteriaIQ Logo - position adjusted when close button is visible */}
          <img 
            src={criteriaIqLogoUrl}
            alt="CriteriaIQ" 
            className={cn(
              "absolute top-[8px] w-[165px] h-[37px]",
              isEnforcementMode ? "right-[23px]" : "right-[60px]"
            )}
          />
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab as any} className="w-full flex flex-col flex-1 overflow-hidden min-h-0">
          <TabsList className="grid grid-cols-4 shrink-0 mx-6 bg-gray-50 dark:bg-slate-800 rounded-lg p-1 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus:shadow-none focus-visible:shadow-none" tabIndex={-1} style={{ outline: "none", boxShadow: "none" }}>
            <TabsTrigger value="status" className="flex items-center gap-2 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0">
              <ShieldUser className="h-4 w-4" />
              {t("security.mfa.setup.tabs.status")}
            </TabsTrigger>
            <TabsTrigger value="setup" className="flex items-center gap-2 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0">
              <Smartphone className="h-4 w-4" />
              {t("security.mfa.setup.tabs.setup")}
            </TabsTrigger>
            <TabsTrigger value="passkeys" className="flex items-center gap-2 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0">
              <Fingerprint className="h-4 w-4" />
              {t("security.mfa.setup.tabs.passkeys")}
            </TabsTrigger>
            <TabsTrigger value="recovery" className="flex items-center gap-2 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0">
              <Key className="h-4 w-4" />
              {t("security.mfa.setup.tabs.recovery")}
            </TabsTrigger>
          </TabsList>

          {/* Status Tab */}
          <TabsContent value="status" className="flex-1 overflow-auto px-6 pb-6 space-y-4 pt-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0">
            <Card className="mt-2">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    {t("security.mfa.setup.status.cardTitle")}
                  </div>
                  {mfaStatus && (
                    <SecurityHealthBadge 
                      securityHealth={mfaStatus.securityHealth}
                      size="md"
                    />
                  )}
                </CardTitle>
                <CardDescription>
                  {t("security.mfa.setup.status.cardDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin text-gray-400 dark:text-gray-500" />
                    <span className="ml-2 text-gray-600 dark:text-gray-400">{t("security.mfa.setup.status.loading")}</span>
                  </div>
                ) : mfaStatus ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{t("security.mfa.setup.status.mfaStatusLabel")}</span>
                      <Badge variant={mfaStatus.enabled ? "default" : "destructive"}>
                        {mfaStatus.enabled ? t("security.mfa.common.enabled") : t("security.mfa.common.disabled")}
                      </Badge>
                    </div>
                    
                    {mfaStatus.enabled && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{t("security.mfa.setup.status.methodLabel")}</span>
                          <Badge variant="outline">
                            {mfaStatus.method?.toUpperCase()}
                          </Badge>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{t("security.mfa.setup.status.recoveryCodesLabel")}</span>
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {t("security.mfa.setup.status.recoveryCodesAvailable", { count: mfaStatus.recoveryCount })}
                          </span>
                        </div>
                        
                        {mfaStatus.enrolledAt && (
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{t("security.mfa.setup.status.enrolledLabel")}</span>
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              {new Date(mfaStatus.enrolledAt).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                      </>
                    )}

                    <Separator />

                    {/* Security Journey Card */}
                    {mfaStatus.enabled && (
                      <Card className={cn(
                        "border-2 mt-4",
                        mfaStatus.securityHealth.health === 'amber' && "border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/30",
                        mfaStatus.securityHealth.health === 'green' && "border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30",
                        mfaStatus.securityHealth.health === 'red' && "border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30"
                      )}>
                        <CardHeader className="pb-3">
                          <CardTitle className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                            <Target className="h-5 w-5" />
                            {t("security.mfa.setup.status.journeyTitle")}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {mfaStatus.securityHealth.health === 'amber' && (
                            <div className="space-y-3">
                              <div className="flex items-start gap-3">
                                <div className="shrink-0 w-6 h-6 bg-green-100 dark:bg-green-900/40 border border-green-300 dark:border-green-800 rounded-full flex items-center justify-center">
                                  <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-500" />
                                </div>
                                <div className="text-sm">
                                  <div className="font-medium text-green-800 dark:text-green-300">{t("security.mfa.setup.status.journeyMfaEnabledTitle")}</div>
                                  <div className="text-gray-600 dark:text-gray-400">{t("security.mfa.setup.status.journeyMfaEnabledDescription")}</div>
                                </div>
                              </div>
                              <div className="flex items-start gap-3">
                                <div className="shrink-0 w-6 h-6 bg-green-100 dark:bg-green-900/40 border border-green-300 dark:border-green-800 rounded-full flex items-center justify-center">
                                  <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-500" />
                                </div>
                                <div className="text-sm">
                                  <div className="font-medium text-green-800 dark:text-green-300">{t("security.mfa.setup.status.journeyRecoveryTitle")}</div>
                                  <div className="text-gray-600 dark:text-gray-400">{t("security.mfa.setup.status.journeyRecoveryDescription", { count: mfaStatus.recoveryCount })}</div>
                                </div>
                              </div>
                              <div className="flex items-start gap-3">
                                <div className="shrink-0 w-6 h-6 bg-yellow-100 dark:bg-yellow-900/40 border border-yellow-300 dark:border-yellow-800 rounded-full flex items-center justify-center">
                                  <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
                                </div>
                                <div className="flex-1 text-sm">
                                  <div className="font-medium text-yellow-800 dark:text-yellow-300">{t("security.mfa.setup.status.journeyPasskeysTitle")}</div>
                                  <div className="text-gray-600 dark:text-gray-400 mb-2">{t("security.mfa.setup.status.journeyPasskeysDescription")}</div>
                                  <Button
                                    onClick={() => setActiveTab('passkeys')}
                                    size="sm"
                                    className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white"
                                  >
                                    {t("security.mfa.setup.status.addPasskeysOptional")}
                                  </Button>
                                </div>
                              </div>
                              <div className="mt-4 p-3 bg-white dark:bg-slate-900 rounded border border-yellow-200 dark:border-yellow-900">
                                <div className="text-sm text-gray-700 dark:text-gray-300">
                                  <div className="font-semibold mb-1 text-blue-700 dark:text-blue-400">{t("security.mfa.setup.status.readyToTestTitle")}</div>
                                  <div>{t("security.mfa.setup.status.readyToTestDescription")}</div>
                                </div>
                              </div>
                            </div>
                          )}
                          {mfaStatus.securityHealth.health === 'green' && (
                            <div className="text-center py-2">
                              <div className="text-green-800 dark:text-green-300 font-semibold">{t("security.mfa.setup.status.fullSecurityTitle")}</div>
                              <div className="text-sm text-green-600 dark:text-green-400 mt-1">{t("security.mfa.setup.status.fullSecurityDescription")}</div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    <Separator />

                    <div className="flex flex-col gap-2">
                      {!mfaStatus.enabled ? (
                        <Button 
                          onClick={handleSetupTotp}
                          disabled={setupTotpMutation.isPending}
                          className="w-full"
                        >
                          {setupTotpMutation.isPending ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              {t("security.mfa.setup.status.settingUp")}
                            </>
                          ) : (
                            <>
                              <Smartphone className="h-4 w-4 mr-2" />
                              {t("security.mfa.setup.status.enableMfaButton")}
                            </>
                          )}
                        </Button>
                      ) : (
                        <>
                          <div className="flex gap-2 mb-3">
                            <Button 
                              variant="default"
                              onClick={() => setActiveTab('recovery')}
                              className="flex-1"
                            >
                              <Key className="h-4 w-4 mr-2" />
                              {t("security.mfa.setup.status.manageRecovery")}
                            </Button>
                            <Button 
                              variant="destructive"
                              onClick={handleDisableMfa}
                              disabled={disableMfaMutation.isPending}
                              className="flex-1"
                            >
                              {disableMfaMutation.isPending ? (
                                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <XCircle className="h-4 w-4 mr-2" />
                              )}
                              {t("security.mfa.setup.status.disableMfaButton")}
                            </Button>
                          </div>
                          
                          {/* Test Login Button - Only show for self-management, not admin mode */}
                          {!isAdminMode && (
                            <Button
                              onClick={handleLogout}
                              className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800"
                              disabled={logoutMutation.isPending}
                            >
                              {logoutMutation.isPending ? (
                                <>
                                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                  {t("security.mfa.setup.status.loggingOut")}
                                </>
                              ) : (
                                <>
                                  <LogOut className="h-4 w-4 mr-2" />
                                  {t("security.mfa.setup.status.logoutTestButton")}
                                </>
                              )}
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    {t("security.mfa.setup.status.loadFailed")}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Setup Tab */}
          <TabsContent value="setup" className="flex-1 overflow-auto px-6 pb-6 space-y-4 pt-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0">
            {mfaStatus?.method === 'totp' && !setupData ? (
              // TOTP already configured - show status and management options
              <Card className="mt-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-500" />
                    {t("security.mfa.setup.totpAlready.title")}
                  </CardTitle>
                  <CardDescription>
                    {t("security.mfa.setup.totpAlready.description")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Shield className="h-5 w-5 text-green-600 dark:text-green-500 mt-0.5 shrink-0" />
                      <div className="text-sm">
                        <p className="font-medium text-green-800 dark:text-green-300 mb-1">
                          {t("security.mfa.setup.totpAlready.protectionActiveTitle")}
                        </p>
                        <p className="text-green-700 dark:text-green-400">
                          {t("security.mfa.setup.totpAlready.protectionActiveDescription")}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button 
                      variant="default"
                      onClick={handleSetupTotp}
                      disabled={setupTotpMutation.isPending}
                      className="flex-1"
                    >
                      {setupTotpMutation.isPending ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          {t("security.mfa.setup.totpAlready.initializing")}
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          {t("security.mfa.setup.totpAlready.reconfigureButton")}
                        </>
                      )}
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => disableMfaMutation.mutate()}
                      disabled={disableMfaMutation.isPending}
                      className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/30"
                    >
                      {disableMfaMutation.isPending ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          {t("security.mfa.setup.totpAlready.disabling")}
                        </>
                      ) : (
                        <>
                          <ShieldOff className="h-4 w-4 mr-2" />
                          {t("security.mfa.setup.totpAlready.disableTotpButton")}
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 mt-0.5 shrink-0" />
                      <div className="text-sm">
                        <p className="font-medium text-yellow-800 dark:text-yellow-300 mb-1">
                          {t("security.mfa.setup.totpAlready.importantNotesTitle")}
                        </p>
                        <ul className="text-yellow-700 dark:text-yellow-400 space-y-1 list-disc list-inside">
                          <li>{t("security.mfa.setup.totpAlready.importantNote1")}</li>
                          <li>{t("security.mfa.setup.totpAlready.importantNote2")}</li>
                          <li>{t("security.mfa.setup.totpAlready.importantNote3")}</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : !setupData ? (
              // TOTP not configured - show initial setup
              <Card className="mt-2">
                <CardHeader>
                  <CardTitle>{t("security.mfa.setup.initial.title")}</CardTitle>
                  <CardDescription>
                    {t("security.mfa.setup.initial.description")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    onClick={handleSetupTotp}
                    disabled={setupTotpMutation.isPending}
                    className="w-full"
                  >
                    {setupTotpMutation.isPending ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        {t("security.mfa.setup.initial.initializing")}
                      </>
                    ) : (
                      <>
                        <QrCode className="h-4 w-4 mr-2" />
                        {t("security.mfa.setup.initial.startButton")}
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              // Active setup in progress - show QR code and verification

              <div className="space-y-4">
                <Card className="mt-2">
                  <CardHeader>
                    <CardTitle>{t("security.mfa.setup.qrStep.title")}</CardTitle>
                    <CardDescription>
                      {t("security.mfa.setup.qrStep.description")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-center space-y-4">
                    {setupData.qrCodeUrl && (
                      <div className="flex justify-center">
                        <img 
                          src={setupData.qrCodeUrl} 
                          alt={t("security.mfa.setup.qrStep.qrAlt")}
                          className="border rounded-lg p-4 bg-white dark:bg-slate-100"
                        />
                      </div>
                    )}
                    
                    <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                      <p>{t("security.mfa.setup.qrStep.popularApps")}</p>
                      <div className="flex flex-wrap justify-center gap-2">
                        <Badge variant="outline">{t("security.mfa.brands.googleAuthenticator")}</Badge>
                        <Badge variant="outline">{t("security.mfa.brands.microsoftAuthenticator")}</Badge>
                        <Badge variant="outline">{t("security.mfa.brands.authy")}</Badge>
                        <Badge variant="outline">{t("security.mfa.brands.onePassword")}</Badge>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{t("security.mfa.setup.qrStep.manualEntryLabel")}</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-gray-100 dark:bg-slate-800 px-3 py-2 rounded text-sm font-mono">
                          {setupData.secret}
                        </code>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyCode(setupData.secret)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t("security.mfa.setup.verifyStep.title")}</CardTitle>
                    <CardDescription>
                      {t("security.mfa.setup.verifyStep.description")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="totp-code">{t("security.mfa.setup.verifyStep.codeLabel")}</Label>
                      <Input
                        id="totp-code"
                        type="text"
                        placeholder={t("security.mfa.setup.verifyStep.codePlaceholder")}
                        maxLength={6}
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                        className="text-center text-lg tracking-widest font-mono"
                      />
                    </div>
                    
                    <Button 
                      onClick={handleVerifyCode}
                      disabled={verifyTotpMutation.isPending || totpCode.length !== 6}
                      className="w-full"
                    >
                      {verifyTotpMutation.isPending ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          {t("security.mfa.setup.verifyStep.verifying")}
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-4 w-4 mr-2" />
                          {t("security.mfa.setup.verifyStep.completeButton")}
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* Recovery Tab */}
          <TabsContent value="recovery" className="flex-1 overflow-auto px-6 pb-6 space-y-4 pt-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0">
            <Card className="mt-2">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FolderCode className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    {t("security.mfa.setup.recovery.title")}
                  </div>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleRegenerateClick}
                    disabled={regenerateCodesMutation.isPending}
                  >
                    {regenerateCodesMutation.isPending ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        {t("security.mfa.setup.recovery.regenerating")}
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        {t("security.mfa.setup.recovery.regenerateButton")}
                      </>
                    )}
                  </Button>
                </CardTitle>
                <CardDescription>
                  {t("security.mfa.setup.recovery.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {setupData?.backupCodes ? (
                  // Active setup - show newly generated codes (can view, download, copy)
                  <>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowCodes(!showCodes)}
                        >
                          {showCodes ? (
                            <>
                              <EyeOff className="h-4 w-4 mr-2" />
                              {t("security.mfa.setup.recovery.hideCodes")}
                            </>
                          ) : (
                            <>
                              <Eye className="h-4 w-4 mr-2" />
                              {t("security.mfa.setup.recovery.showCodes")}
                            </>
                          )}
                        </Button>
                      </div>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadCodes}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        {t("security.mfa.setup.recovery.downloadButton")}
                      </Button>
                    </div>

                    {showCodes && (
                      <div className="grid grid-cols-2 gap-2">
                        {setupData.backupCodes.map((code, index) => (
                          <div 
                            key={index}
                            className="flex items-center gap-2 p-2 border rounded bg-gray-50 dark:bg-slate-800"
                          >
                            <code className="flex-1 text-sm font-mono">
                              {code}
                            </code>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCopyCode(code)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 mt-0.5 shrink-0" />
                        <div className="text-sm">
                          <p className="font-medium text-yellow-800 dark:text-yellow-300 mb-1">
                            {t("security.mfa.setup.recovery.importantInfoTitle")}
                          </p>
                          <ul className="text-yellow-700 dark:text-yellow-400 space-y-1 list-disc list-inside">
                            <li>{t("security.mfa.setup.recovery.importantInfo1")}</li>
                            <li>{t("security.mfa.setup.recovery.importantInfo2")}</li>
                            <li>{t("security.mfa.setup.recovery.importantInfo3")}</li>
                            <li>{t("security.mfa.setup.recovery.importantInfo4")}</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/*
                      "What to do next" callout — appears once the operator
                      has actually downloaded their freshly-generated codes.
                      Without this, users finish the setup wizard with no
                      idea they still need to leave the dialog and exercise
                      the MFA challenge on their next login. The button
                      drops them back onto the surface that opened this
                      dialog (the profile dialog's MFA & Security tab or
                      the Security Status drawer), where the manage/setup
                      MFA controls and the Sign Out action live.
                    */}
                    {codesDownloaded && !nextStepDismissed && (
                      <div
                        className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 relative"
                        data-testid="mfa-setup-next-step-callout"
                      >
                        <button
                          type="button"
                          onClick={() => setNextStepDismissed(true)}
                          className="absolute top-2 right-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 p-1 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/40"
                          aria-label={t("security.mfa.setup.recovery.nextStepDismiss")}
                          data-testid="button-mfa-setup-next-step-dismiss"
                        >
                          <X className="h-4 w-4" />
                        </button>
                        <div className="flex items-start gap-3 pr-6">
                          <CheckCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                          <div className="text-sm flex-1 space-y-3">
                            <div>
                              <p className="font-medium text-blue-800 dark:text-blue-200 mb-1">
                                {t("security.mfa.setup.recovery.nextStepTitle")}
                              </p>
                              <p className="text-blue-700 dark:text-blue-300">
                                {t("security.mfa.setup.recovery.nextStepDescription")}
                              </p>
                            </div>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={handleGoToStatus}
                              data-testid="button-mfa-setup-go-to-status"
                            >
                              <ShieldUser className="h-4 w-4 mr-2" />
                              {t("security.mfa.setup.recovery.nextStepButton")}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : mfaStatus?.recoveryCount && mfaStatus.recoveryCount > 0 ? (
                  // Existing codes - show status and regenerate option (codes are hashed, cannot be retrieved)
                  <>
                    <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-500 mt-0.5 shrink-0" />
                        <div className="text-sm flex-1">
                          <p className="font-medium text-green-800 dark:text-green-300 mb-1">
                            {t("security.mfa.setup.recovery.activeTitle")}
                          </p>
                          <p className="text-green-700 dark:text-green-400">
                            {t("security.mfa.setup.recovery.activeDescription", { count: mfaStatus.recoveryCount })}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                        <div className="text-sm">
                          <p className="font-medium text-blue-800 dark:text-blue-300 mb-2">
                            {t("security.mfa.setup.recovery.aboutTitle")}
                          </p>
                          <ul className="text-blue-700 dark:text-blue-400 space-y-1 list-disc list-inside">
                            <li>{t("security.mfa.setup.recovery.about1")}</li>
                            <li>{t("security.mfa.setup.recovery.about2")}</li>
                            <li>{t("security.mfa.setup.recovery.about3")}</li>
                            <li>{t("security.mfa.setup.recovery.about4")}</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 mt-0.5 shrink-0" />
                        <div className="text-sm flex-1">
                          <p className="font-medium text-yellow-800 dark:text-yellow-300 mb-2">
                            {t("security.mfa.setup.recovery.needNewTitle")}
                          </p>
                          <p className="text-yellow-700 dark:text-yellow-400 mb-3">
                            {t("security.mfa.setup.recovery.needNewDescription")}
                          </p>
                          <p className="text-yellow-700 dark:text-yellow-400 text-xs">
                            {t("security.mfa.setup.recovery.needNewWarning")}
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  // No codes - show setup prompt
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <Key className="h-12 w-12 mx-auto mb-4 text-gray-400 dark:text-gray-500" />
                    <p>{t("security.mfa.setup.recovery.noneTitle")}</p>
                    <p className="text-sm">{t("security.mfa.setup.recovery.noneDescription")}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Passkeys Tab */}
          <TabsContent value="passkeys" className="flex-1 overflow-auto px-6 pb-6 space-y-4 pt-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0">
            <Card className="mt-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Fingerprint className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  {t("security.mfa.setup.passkeys.title")}
                </CardTitle>
                <CardDescription>
                  {t("security.mfa.setup.passkeys.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Fingerprint className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                    <div className="text-sm">
                      <p className="font-semibold text-blue-800 dark:text-blue-300 mb-1">{t("security.mfa.setup.passkeys.whatTitle")}</p>
                      <p className="text-blue-700 dark:text-blue-400">
                        {t("security.mfa.setup.passkeys.whatDescription")}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Show current passkeys if any */}
                {mfaStatus?.securityHealth?.passkeyCount && mfaStatus.securityHealth.passkeyCount > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{t("security.mfa.setup.passkeys.registeredLabel")}</span>
                      <Badge variant="outline">
                        {t("security.mfa.setup.passkeys.activeCount", { count: mfaStatus?.securityHealth?.passkeyCount })}
                      </Badge>
                    </div>
                    <div className="text-sm text-green-600 dark:text-green-400">
                      {t("security.mfa.setup.passkeys.enabledMessage")}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-center py-6">
                      <Fingerprint className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
                      <p className="text-gray-600 dark:text-gray-400 mb-4">{t("security.mfa.setup.passkeys.noneRegistered")}</p>
                      <Button
                        className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800"
                        onClick={() => registerPasskeyMutation.mutate()}
                        disabled={registerPasskeyMutation.isPending}
                      >
                        <Fingerprint className="h-4 w-4 mr-2" />
                        {registerPasskeyMutation.isPending
                          ? t("security.mfa.setup.passkeys.registering")
                          : t("security.mfa.setup.passkeys.registerButton")}
                      </Button>
                    </div>
                    
                    <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 mt-0.5 shrink-0" />
                        <div className="text-sm">
                          <p className="font-semibold text-yellow-800 dark:text-yellow-300 mb-1">{t("security.mfa.setup.passkeys.requirementsTitle")}</p>
                          <ul className="text-yellow-700 dark:text-yellow-400 space-y-1">
                            <li>• {t("security.mfa.setup.passkeys.req1")}</li>
                            <li>• {t("security.mfa.setup.passkeys.req2")}</li>
                            <li>• {t("security.mfa.setup.passkeys.req3")}</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>

    {/* Disable MFA Confirmation Dialog */}
    <ConfirmationDialog
      open={disableMfaConfirmOpen}
      onOpenChange={setDisableMfaConfirmOpen}
      title={t("security.mfa.setup.disableConfirm.title")}
      description={t("security.mfa.setup.disableConfirm.description")}
      confirmLabel={t("security.mfa.setup.disableConfirm.confirm")}
      cancelLabel={t("security.mfa.setup.disableConfirm.cancel")}
      onConfirm={confirmDisableMfa}
      variant="warning"
    />
    </>
  );
}