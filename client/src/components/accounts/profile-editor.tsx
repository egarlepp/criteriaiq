import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { DEPARTMENTS } from "@/config/departments";
import { REGIONS } from "@/config/regions";
import { LOCALES } from "@/config/locales";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";
import { applyTheme, applyLocale } from "@/lib/prefs";
import { useTheme } from "@/hooks/use-theme";
import { Progress } from "@/components/ui/progress";
import { 
  User, 
  Shield, 
  Activity, 
  Save,
  Lock,
  Trash2,
  Monitor,
  AlertCircle,
  FolderGit2,
  LogIn,
  ChevronLast,
  RotateCcw,
  Sun,
  Moon,
  Building2,
  ArrowLeftToLine,
  Expand,
  Bell,
  Mail,
  ShieldCheck,
  ShieldUser,
  ShieldAlert,
  Key,
  Smartphone,
  Fingerprint,
  Calendar,
  ChevronRight,
  Link2,
  TicketsPlane,
  X,
  CloudCheck,
  UserCog
} from "lucide-react";
import { format } from "date-fns";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { SecurityHealthBadge } from "@/components/security/SecurityHealthBadge";
import { SecurityJourney } from "@/components/security/SecurityJourney";
import MFASetupDialog from "@/components/security/MFASetupDialog";
import { cn } from "@/lib/utils";
import type { UserProfile, UserStats, UserSession, AlignedCustomer, ProfileEditorProps, ProfileEditorTab, ProfileFormData, PasswordFormData } from "./profile-editor-types";
import { profileSchema, passwordSchema } from "./profile-editor-types";
import { calculateCompleteness } from "./profile-editor-utils";
import { ProfileIntegrationsTab } from "./profile-integrations-tab";
import { ProfileCalendarTab } from "./profile-calendar-tab";
import { useMyCrmConnection } from "@/hooks/use-my-crm-connection";
import { isCrmConnectionReady } from "@shared/my-connections";
import { NotificationDigestCard } from "./notification-digest-card";
import { PasswordRuleChecklist } from "@/components/shared/PasswordRuleChecklist";
import {
  ADMIN_PASSWORD_HISTORY_DEFAULT_SIZE,
  PASSWORD_RECENTLY_USED_ERROR_CODE,
} from "@shared/admin-validation";

interface PasswordChangeErrorBody {
  message?: string;
  error?: string;
  errorCode?: string;
  historySize?: number;
}

class PasswordChangeError extends Error {
  readonly errorCode?: string;
  readonly historySize?: number;
  constructor(message: string, errorCode?: string, historySize?: number) {
    super(message);
    this.name = "PasswordChangeError";
    this.errorCode = errorCode;
    this.historySize = historySize;
  }
}

async function parsePasswordChangeErrorBody(
  response: Response,
): Promise<PasswordChangeErrorBody> {
  try {
    const raw: unknown = await response.json();
    if (!raw || typeof raw !== "object") return {};
    const obj = raw as Record<string, unknown>;
    return {
      message: typeof obj.message === "string" ? obj.message : undefined,
      error: typeof obj.error === "string" ? obj.error : undefined,
      errorCode: typeof obj.errorCode === "string" ? obj.errorCode : undefined,
      historySize:
        typeof obj.historySize === "number" ? obj.historySize : undefined,
    };
  } catch {
    return {};
  }
}

export function ProfileEditor({ isOpen, onClose, initialTab = "profile" }: ProfileEditorProps) {
  
  const { i18n, t } = useTranslation();
  // Admin-chosen name for the validation record (Evaluation, POC, POV, ...).
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ProfileEditorTab>(initialTab);
  const [showMFASetup, setShowMFASetup] = useState(false);

  // Inline error for the per-user password history check, rendered
  // next to the new-password field instead of as a toast.
  const [passwordReuseError, setPasswordReuseError] = useState<{
    message: string;
    historySize: number;
  } | null>(null);

  // Counts toward Profile Completeness, so people see when they still need to connect.
  const { data: myCrmConnection } = useMyCrmConnection(isOpen);

  const { data: userProfile } = useQuery<UserProfile>({
    queryKey: ["/api/users/me"],
    enabled: isOpen,
  });

  const { data: userStats } = useQuery<UserStats>({
    queryKey: ["/api/me/stats"],
    enabled: isOpen && activeTab === "activity",
  });

  const { data: userSessions } = useQuery<UserSession[]>({
    queryKey: ["/api/users/me/sessions"],
    enabled: isOpen && activeTab === "security",
  });

  const { data: alignedCustomers } = useQuery<AlignedCustomer[]>({
    queryKey: ["/api/users/me/aligned-customers"],
    enabled: isOpen && activeTab === "profile",
  });

  const { data: emailPreferences } = useQuery<{
    overallPreference: string;
    phasesPreference: string;
    stepsPreference: string;
    tasksPreference: string;
    quietHoursStart: number | null;
    quietHoursEnd: number | null;
  }>({
    queryKey: ["/api/users/me/email-preferences"],
    enabled: isOpen && activeTab === "notifications",
  });

  const { data: securityHealth } = useQuery({
    queryKey: ["/api/me/security"],
    enabled: isOpen && activeTab === "mfa-security",
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refresh every minute
  });

  // State for notification preferences
  const [notifPrefs, setNotifPrefs] = useState({
    overallPreference: "project_decides",
    phasesPreference: "project_decides",
    stepsPreference: "project_decides",
    tasksPreference: "project_decides",
    quietHoursStart: null as number | null,
    quietHoursEnd: null as number | null,
  });

  // Drop the inline password-reuse warning when the sheet closes, and start
  // on the requested tab each time it opens.
  useEffect(() => {
    if (!isOpen) {
      setPasswordReuseError(null);
    } else {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Update notifPrefs when emailPreferences loads
  useEffect(() => {
    if (emailPreferences) {
      setNotifPrefs({
        overallPreference: emailPreferences.overallPreference || "project_decides",
        phasesPreference: emailPreferences.phasesPreference || "project_decides",
        stepsPreference: emailPreferences.stepsPreference || "project_decides",
        tasksPreference: emailPreferences.tasksPreference || "project_decides",
        quietHoursStart: emailPreferences.quietHoursStart,
        quietHoursEnd: emailPreferences.quietHoursEnd,
      });
    }
  }, [emailPreferences]);

  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    values: userProfile ? {
      firstName: userProfile.firstName || "",
      lastName: userProfile.lastName || "",
      accountId: userProfile.accountId || null,
      title: userProfile.title || "",
      region: userProfile.region || "",
      department: userProfile.department || "",
      timezone: userProfile.timezone || "America/New_York",
      preferredLocale: userProfile.preferredLocale || "en-US",
      theme: userProfile.theme || "light",
      sidebarCollapsed: userProfile.sidebarCollapsed || false,
      showFlightDeck: userProfile.showFlightDeck !== false,
    } : undefined,
  });

  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const response = await fetch("/api/users/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to update profile");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      
      if (data.preferredLocale) {
        applyLocale(data.preferredLocale, i18n);
      }
      if (data.theme) {
        applyTheme(data.theme as "light" | "dark");
        setTheme(data.theme as "light" | "dark");
      }
      
      showSuccessToast(t("profile.profile.updateSuccessTitle"), t("profile.profile.updateSuccessDescription"));
    },
    onError: () => {
      showErrorToast(t("profile.profile.updateErrorTitle"), t("profile.profile.updateErrorDescription"));
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: PasswordFormData) => {
      const response = await fetch("/api/users/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
        }),
        credentials: "include",
      });
      if (!response.ok) {
        const body = await parsePasswordChangeErrorBody(response);
        throw new PasswordChangeError(
          body.message ?? body.error ?? t("profile.security.changePasswordFailed"),
          body.errorCode,
          body.historySize,
        );
      }
      return response.json();
    },
    onSuccess: () => {
      passwordForm.reset();
      setPasswordReuseError(null);
      showSuccessToast(t("profile.security.successTitle"), t("profile.security.successDescription"));
    },
    onError: (error: Error) => {
      // History-match rejections show inline (toast disappears too
      // quickly for a field-scoped remediation).
      if (
        error instanceof PasswordChangeError &&
        error.errorCode === PASSWORD_RECENTLY_USED_ERROR_CODE
      ) {
        const historySize =
          typeof error.historySize === "number" && error.historySize > 0
            ? error.historySize
            : ADMIN_PASSWORD_HISTORY_DEFAULT_SIZE;
        setPasswordReuseError({
          message: t("profile.security.passwordRecentlyUsed", { count: historySize }),
          historySize,
        });
        return;
      }
      showErrorToast(t("profile.security.errorTitle"), error.message);
    },
  });

  const revokeSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await fetch("/api/users/me/sessions/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
        credentials: "include",
      });
      if (!response.ok) throw new Error(t("profile.sessions.revokeFailed"));
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me/sessions"] });
      showSuccessToast(t("profile.sessions.revokedTitle"), t("profile.sessions.revokedDescription"));
    },
  });

  const updateEmailPreferencesMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch("/api/users/me/email-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!response.ok) throw new Error(t("profile.notifications.saveFailed"));
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me/email-preferences"] });
      showSuccessToast(t("profile.notifications.savedTitle"), t("profile.notifications.savedDescription"));
    },
    onError: (error: Error) => {
      showErrorToast(t("profile.notifications.errorTitle"), error.message);
    },
  });

  const completeness = calculateCompleteness(userProfile, isCrmConnectionReady(myCrmConnection));

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent 
        side="bottom" 
        className="h-[600px] max-h-[90vh] w-full p-0 overflow-hidden"
      >
        <div className="flex flex-col h-full">
          <SheetHeader className="px-6 py-4 border-b">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <UserCog className="h-5 w-5" />
                {t("profile.header.title")}
              </SheetTitle>
              <SheetDescription>{t("profile.header.description")}</SheetDescription>
            </div>

            {completeness < 100 && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    {t("profile.header.completeness")}
                  </span>
                  <span className="font-medium">{completeness}%</span>
                </div>
                <Progress 
                  value={completeness} 
                  className={`h-2 ${
                    completeness <= 60 
                      ? '[&>div]:bg-red-500' 
                      : completeness <= 75 
                      ? '[&>div]:bg-yellow-500' 
                      : completeness <= 90 
                      ? '[&>div]:bg-orange-500' 
                      : '[&>div]:bg-green-500'
                  }`}
                />
              </div>
            )}
          </SheetHeader>

          <div className="flex-1 overflow-hidden flex">
            <div className="w-48 border-r bg-gray-50 dark:bg-gray-900/50 p-4">
              <nav className="space-y-1">
                <button
                  onClick={() => setActiveTab("profile")}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
                    activeTab === "profile"
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-gray-200 dark:hover:bg-gray-800"
                  }`}
                >
                  <User className="h-4 w-4" />
                  {t("profile.nav.profile")}
                </button>
                <button
                  onClick={() => setActiveTab("security")}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
                    activeTab === "security"
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-gray-200 dark:hover:bg-gray-800"
                  }`}
                >
                  <Shield className="h-4 w-4" />
                  {t("profile.nav.security")}
                </button>
                <button
                  onClick={() => setActiveTab("activity")}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
                    activeTab === "activity"
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-gray-200 dark:hover:bg-gray-800"
                  }`}
                >
                  <Activity className="h-4 w-4" />
                  {t("profile.nav.activity")}
                </button>
                <button
                  onClick={() => setActiveTab("notifications")}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
                    activeTab === "notifications"
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-gray-200 dark:hover:bg-gray-800"
                  }`}
                >
                  <Bell className="h-4 w-4" />
                  {t("profile.nav.notifications")}
                </button>
                <button
                  onClick={() => setActiveTab("mfa-security")}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
                    activeTab === "mfa-security"
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-gray-200 dark:hover:bg-gray-800"
                  }`}
                >
                  <ShieldCheck className="h-4 w-4" />
                  {t("profile.nav.mfaSecurity")}
                </button>
                <button
                  onClick={() => setActiveTab("calendar")}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
                    activeTab === "calendar"
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-gray-200 dark:hover:bg-gray-800"
                  }`}
                >
                  <Calendar className="h-4 w-4" />
                  {t("profile.nav.calendar")}
                </button>
                <button
                  onClick={() => setActiveTab("integrations")}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
                    activeTab === "integrations"
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-gray-200 dark:hover:bg-gray-800"
                  }`}
                >
                  <CloudCheck className="h-4 w-4" />
                  {t("profile.nav.integrations")}
                </button>
              </nav>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === "profile" && (
                <form
                  onSubmit={profileForm.handleSubmit((data) =>
                    updateProfileMutation.mutate(data)
                  )}
                  className="space-y-6"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">{t("profile.profile.emailLabel")}</Label>
                      <Input
                        id="email"
                        value={userProfile?.email || ""}
                        disabled
                        className="bg-gray-50 dark:bg-gray-900"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="role">{t("profile.profile.roleLabel")}</Label>
                      <Input
                        id="role"
                        value={userProfile?.role || ""}
                        disabled
                        className="bg-gray-50 dark:bg-gray-900"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="firstName">{t("profile.profile.firstNameLabel")}</Label>
                      <Input
                        id="firstName"
                        {...profileForm.register("firstName")}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="lastName">{t("profile.profile.lastNameLabel")}</Label>
                      <Input
                        id="lastName"
                        {...profileForm.register("lastName")}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="company">{t("profile.profile.companyLabel")}</Label>
                      <Input
                        id="company"
                        {...profileForm.register("company")}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="title">{t("profile.profile.titleLabel")}</Label>
                      <Input id="title" {...profileForm.register("title")} />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="department">{t("profile.profile.departmentLabel")}</Label>
                      <Select
                        value={profileForm.watch("department")}
                        onValueChange={(value) =>
                          profileForm.setValue("department", value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("profile.profile.departmentPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {DEPARTMENTS.map((dept) => (
                            <SelectItem key={dept.value} value={dept.value}>
                              {t(dept.labelKey, { defaultValue: dept.label })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="region">{t("profile.profile.regionLabel")}</Label>
                      <Select
                        value={profileForm.watch("region")}
                        onValueChange={(value) =>
                          profileForm.setValue("region", value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("profile.profile.regionPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {REGIONS.map((region) => (
                            <SelectItem key={region.value} value={region.value}>
                              {t(region.labelKey, { defaultValue: region.label })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="timezone">{t("profile.profile.timezoneLabel")}</Label>
                      <Select
                        value={profileForm.watch("timezone")}
                        onValueChange={(value) =>
                          profileForm.setValue("timezone", value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("profile.profile.timezonePlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {TIMEZONE_OPTIONS.map((tz) => (
                            <SelectItem key={tz.value} value={tz.value}>
                              {t(tz.labelKey, { defaultValue: tz.label })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="locale">{t("profile.profile.languageLabel")}</Label>
                      <Select
                        value={profileForm.watch("preferredLocale")}
                        onValueChange={(value) =>
                          profileForm.setValue("preferredLocale", value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LOCALES.map((locale) => (
                            <SelectItem key={locale.code} value={locale.code}>
                              <span className="flex items-center gap-2">
                                <span>{locale.flag}</span>
                                <span>{locale.name}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="theme">{t("profile.profile.themeLabel")}</Label>
                      <Select
                        value={profileForm.watch("theme")}
                        onValueChange={(value) =>
                          profileForm.setValue("theme", value as "light" | "dark")
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="light">
                            <div className="flex items-center gap-2">
                              <Sun className="h-4 w-4" />
                              {t("profile.profile.themeLight")}
                            </div>
                          </SelectItem>
                          <SelectItem value="dark">
                            <div className="flex items-center gap-2">
                              <Moon className="h-4 w-4" />
                              {t("profile.profile.themeDark")}
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sidebarCollapsed">{t("profile.profile.sidebarLabel")}</Label>
                      <Select
                        value={profileForm.watch("sidebarCollapsed") ? "collapsed" : "expanded"}
                        onValueChange={(value) =>
                          profileForm.setValue("sidebarCollapsed", value === "collapsed")
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="expanded">
                            <div className="flex items-center gap-2">
                              <Expand className="h-4 w-4" />
                              {t("profile.profile.sidebarExpanded")}
                            </div>
                          </SelectItem>
                          <SelectItem value="collapsed">
                            <div className="flex items-center gap-2">
                              <ArrowLeftToLine className="h-4 w-4" />
                              {t("profile.profile.sidebarCollapsedOption")}
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="showFlightDeck" className="flex items-center gap-2">
                        <TicketsPlane className="h-4 w-4 text-sky-600" />
                        {t("profile.profile.flightDeckLabel")}
                      </Label>
                      <div className="flex items-center justify-between p-3 rounded-lg border bg-gray-50 dark:bg-gray-900">
                        <div>
                          <div className="text-sm font-medium">{t("profile.profile.flightDeckTitle")}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{t("profile.profile.flightDeckDescription")}</div>
                        </div>
                        <Switch
                          id="showFlightDeck"
                          checked={profileForm.watch("showFlightDeck")}
                          onCheckedChange={(checked) => profileForm.setValue("showFlightDeck", checked)}
                        />
                      </div>
                    </div>
                  </div>

                  {alignedCustomers && alignedCustomers.length > 0 && (
                    <div className="border-t pt-6 mt-6">
                      <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        {t("profile.profile.alignedAccountsHeading")}
                      </h3>
                      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg border p-4">
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead>
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                  {t("profile.profile.customerNameColumn")}
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                  {t("profile.profile.regionColumn")}
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                  {t("profile.profile.industryColumn")}
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                              {alignedCustomers.map((customer: any, idx: number) => (
                                <tr key={idx} className="hover:bg-gray-100 dark:hover:bg-gray-800">
                                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                                    {customer.name}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                                    {customer.region || '-'}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                                    {customer.industry || '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={onClose}>
                      <X className="h-4 w-4 mr-2" />
                      {t("profile.profile.cancelButton")}
                    </Button>
                    <Button
                      type="submit"
                      disabled={updateProfileMutation.isPending}
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {t("profile.profile.saveChangesButton")}
                    </Button>
                  </div>
                </form>
              )}

              {activeTab === "security" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                      <Lock className="h-5 w-5" />
                      {t("profile.security.changePasswordHeading")}
                    </h3>
                    <form
                      onSubmit={passwordForm.handleSubmit((data) =>
                        changePasswordMutation.mutate(data)
                      )}
                      className="space-y-4"
                    >
                      <div className="space-y-2">
                        <Label htmlFor="currentPassword">{t("profile.security.currentPasswordLabel")}</Label>
                        <Input
                          id="currentPassword"
                          type="password"
                          {...passwordForm.register("currentPassword")}
                        />
                        {passwordForm.formState.errors.currentPassword && (
                          <p className="text-sm text-red-500">
                            {passwordForm.formState.errors.currentPassword.message}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="newPassword">{t("profile.security.newPasswordLabel")}</Label>
                        <Input
                          id="newPassword"
                          type="password"
                          aria-describedby="profile-pw-rules"
                          aria-invalid={!!passwordReuseError || !!passwordForm.formState.errors.newPassword}
                          className={passwordReuseError ? "border-red-500" : undefined}
                          {...passwordForm.register("newPassword", {
                            // Clear stale reuse warning on edit.
                            onChange: () => {
                              if (passwordReuseError) setPasswordReuseError(null);
                            },
                          })}
                        />
                        <PasswordRuleChecklist
                          password={passwordForm.watch("newPassword") ?? ""}
                          id="profile-pw-rules"
                        />
                        {passwordForm.formState.errors.newPassword && (
                          <p className="text-sm text-red-500">
                            {passwordForm.formState.errors.newPassword.message}
                          </p>
                        )}
                        {passwordReuseError && (
                          <p
                            className="text-sm text-red-500"
                            role="alert"
                            data-testid="text-profile-password-reuse-error"
                          >
                            {passwordReuseError.message}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="confirmPassword">{t("profile.security.confirmPasswordLabel")}</Label>
                        <Input
                          id="confirmPassword"
                          type="password"
                          {...passwordForm.register("confirmPassword")}
                        />
                        {passwordForm.formState.errors.confirmPassword && (
                          <p className="text-sm text-red-500">
                            {passwordForm.formState.errors.confirmPassword.message}
                          </p>
                        )}
                      </div>

                      <Button
                        type="submit"
                        disabled={changePasswordMutation.isPending}
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        {t("profile.security.changePasswordButton")}
                      </Button>
                    </form>
                  </div>

                  <div className="border-t pt-6">
                    <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                      <Monitor className="h-5 w-5" />
                      {t("profile.sessions.heading")}
                    </h3>
                    <div className="space-y-3">
                      {userSessions && userSessions.length > 0 ? (
                        userSessions.map((session: any) => (
                          <div
                            key={session.id}
                            className="flex items-center justify-between p-4 border rounded-lg"
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <Monitor className="h-4 w-4 text-gray-500" />
                                <p className="font-medium">
                                  {session.deviceName || t("profile.sessions.unknownDevice")}
                                  {session.isCurrent && (
                                    <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">
                                      {t("profile.sessions.currentBadge")}
                                    </span>
                                  )}
                                </p>
                              </div>
                              <p className="text-sm text-gray-500 mt-1">
                                {t("profile.sessions.deviceLine", { browser: session.browser, os: session.os })}
                              </p>
                              <p className="text-xs text-gray-400 mt-1">
                                {t("profile.sessions.lastActive", { date: format(new Date(session.lastActive), "PPp") })}
                              </p>
                            </div>
                            {!session.isCurrent && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => revokeSessionMutation.mutate(session.sessionId)}
                                disabled={revokeSessionMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500">{t("profile.sessions.noSessions")}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "activity" && userStats && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 border rounded-lg bg-purple-50 dark:bg-purple-950/30">
                      <div className="flex items-center gap-2">
                        <FolderGit2 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                        <p className="text-sm font-medium text-purple-700 dark:text-purple-300">{t("profile.activity.projects")}</p>
                      </div>
                      <p className="text-2xl font-bold mt-1">
                        {userStats.projectCount || 0}
                      </p>
                    </div>
                    <div className="p-4 border rounded-lg bg-blue-50 dark:bg-blue-950/30">
                      <div className="flex items-center gap-2">
                        <LogIn className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        <p className="text-sm font-medium text-blue-700 dark:text-blue-300">{t("profile.activity.totalLogins")}</p>
                      </div>
                      <p className="text-2xl font-bold mt-1">
                        {userStats.loginCount || 0}
                      </p>
                    </div>
                    <div className="p-4 border rounded-lg bg-gray-100 dark:bg-gray-800/30">
                      <div className="flex items-center gap-2">
                        <ChevronLast className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t("profile.activity.lastLogin")}</p>
                      </div>
                      <p className="text-sm font-medium mt-1">
                        {userStats.lastLogin
                          ? format(new Date(userStats.lastLogin), "PPp")
                          : t("profile.activity.never")}
                      </p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                      <ChevronLast className="h-5 w-5" />
                      {t("profile.activity.recentLogins")}
                    </h3>
                    <div className="space-y-2">
                      {userStats.recentLogins && userStats.recentLogins.length > 0 ? (
                        userStats.recentLogins.map((login: any, idx: number) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-3 border rounded-lg"
                          >
                            <div>
                              <p className="text-sm font-medium">
                                {format(new Date(login.timestamp), "PPp")}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                {t("profile.activity.ipLabel", { ip: login.ipAddress || t("profile.activity.unknownIp") })}
                              </p>
                            </div>
                            {login.success ? (
                              <span className="text-green-600 text-xs">{t("profile.activity.success")}</span>
                            ) : (
                              <span className="text-red-600 text-xs flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                {t("profile.activity.failed")}
                              </span>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500">{t("profile.activity.noHistory")}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "notifications" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                      <Bell className="h-6 w-6" />
                      {t("profile.notifications.heading")}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t("profile.notifications.description")}
                    </p>
                  </div>

                  <NotificationDigestCard />

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      updateEmailPreferencesMutation.mutate(notifPrefs);
                    }}
                    className="space-y-6"
                  >
                    {/* Overall Preference */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Mail className="h-5 w-5" />
                          {t("profile.notifications.overallTitle")}
                        </CardTitle>
                        <CardDescription>
                          {t("profile.notifications.overallDescription")}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <RadioGroup
                          value={notifPrefs.overallPreference}
                          onValueChange={(value) =>
                            setNotifPrefs({ ...notifPrefs, overallPreference: value })
                          }
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="project_decides" id="overall-project" />
                            <Label htmlFor="overall-project" className="cursor-pointer">
                              {t("profile.notifications.projectDecidesDefault")}
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="do_not_send" id="overall-block" />
                            <Label htmlFor="overall-block" className="cursor-pointer text-red-600 dark:text-red-400">
                              {t("profile.notifications.doNotSendAll")}
                            </Label>
                          </div>
                        </RadioGroup>
                      </CardContent>
                    </Card>

                    {/* Phases Preference */}
                    <Card>
                      <CardHeader>
                        <CardTitle>{t("profile.notifications.phasesTitle")}</CardTitle>
                        <CardDescription>
                          {t("profile.notifications.phasesDescription")}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <RadioGroup
                          value={notifPrefs.phasesPreference}
                          onValueChange={(value) =>
                            setNotifPrefs({ ...notifPrefs, phasesPreference: value })
                          }
                          disabled={notifPrefs.overallPreference === "do_not_send"}
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="project_decides" id="phases-project" />
                            <Label htmlFor="phases-project" className="cursor-pointer">
                              {t("profile.notifications.projectDecides")}
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="do_not_send" id="phases-block" />
                            <Label htmlFor="phases-block" className="cursor-pointer">
                              {t("profile.notifications.doNotSend")}
                            </Label>
                          </div>
                        </RadioGroup>
                      </CardContent>
                    </Card>

                    {/* Steps Preference */}
                    <Card>
                      <CardHeader>
                        <CardTitle>{t("profile.notifications.stepsTitle")}</CardTitle>
                        <CardDescription>
                          {t("profile.notifications.stepsDescription")}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <RadioGroup
                          value={notifPrefs.stepsPreference}
                          onValueChange={(value) =>
                            setNotifPrefs({ ...notifPrefs, stepsPreference: value })
                          }
                          disabled={notifPrefs.overallPreference === "do_not_send"}
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="project_decides" id="steps-project" />
                            <Label htmlFor="steps-project" className="cursor-pointer">
                              {t("profile.notifications.projectDecides")}
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="do_not_send" id="steps-block" />
                            <Label htmlFor="steps-block" className="cursor-pointer">
                              {t("profile.notifications.doNotSend")}
                            </Label>
                          </div>
                        </RadioGroup>
                      </CardContent>
                    </Card>

                    {/* Tasks Preference */}
                    <Card>
                      <CardHeader>
                        <CardTitle>{t("profile.notifications.tasksTitle")}</CardTitle>
                        <CardDescription>
                          {t("profile.notifications.tasksDescription")}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <RadioGroup
                          value={notifPrefs.tasksPreference}
                          onValueChange={(value) =>
                            setNotifPrefs({ ...notifPrefs, tasksPreference: value })
                          }
                          disabled={notifPrefs.overallPreference === "do_not_send"}
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="project_decides" id="tasks-project" />
                            <Label htmlFor="tasks-project" className="cursor-pointer">
                              {t("profile.notifications.projectDecides")}
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="do_not_send" id="tasks-block" />
                            <Label htmlFor="tasks-block" className="cursor-pointer">
                              {t("profile.notifications.doNotSend")}
                            </Label>
                          </div>
                        </RadioGroup>
                      </CardContent>
                    </Card>

                    {/* Quiet Hours */}
                    <Card>
                      <CardHeader>
                        <CardTitle>{t("profile.notifications.quietHoursTitle")}</CardTitle>
                        <CardDescription>
                          {t("profile.notifications.quietHoursDescription")}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="quietStart">{t("profile.notifications.startHour")}</Label>
                            <Input
                              id="quietStart"
                              type="number"
                              min="0"
                              max="23"
                              value={notifPrefs.quietHoursStart ?? ""}
                              onChange={(e) =>
                                setNotifPrefs({
                                  ...notifPrefs,
                                  quietHoursStart: e.target.value ? parseInt(e.target.value) : null,
                                })
                              }
                              placeholder={t("profile.notifications.startPlaceholder")}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="quietEnd">{t("profile.notifications.endHour")}</Label>
                            <Input
                              id="quietEnd"
                              type="number"
                              min="0"
                              max="23"
                              value={notifPrefs.quietHoursEnd ?? ""}
                              onChange={(e) =>
                                setNotifPrefs({
                                  ...notifPrefs,
                                  quietHoursEnd: e.target.value ? parseInt(e.target.value) : null,
                                })
                              }
                              placeholder={t("profile.notifications.endPlaceholder")}
                            />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t("profile.notifications.quietHoursExample")}
                        </p>
                      </CardContent>
                    </Card>

                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        disabled={updateEmailPreferencesMutation.isPending}
                        className="gap-2"
                      >
                        <Save className="h-4 w-4" />
                        {updateEmailPreferencesMutation.isPending ? t("profile.notifications.saving") : t("profile.notifications.savePreferences")}
                      </Button>
                    </div>
                  </form>
                </div>
              )}

              {activeTab === "mfa-security" && (
                <div className="space-y-6">
                  {(() => {
                    const health = (securityHealth as any)?.health || 'red';
                    const isEnabled = (securityHealth as any)?.enabled || false;
                    const recoveryCount = (securityHealth as any)?.recoveryCount || 0;
                    const passkeyCount = (securityHealth as any)?.passkeyCount || 0;

                    // Get overall security status display
                    const getSecurityStatus = () => {
                      switch (health) {
                        case 'green':
                          return {
                            icon: ShieldCheck,
                            color: 'text-green-600',
                            bg: 'bg-green-50 dark:bg-green-900/20',
                            title: t('profile.mfa.statusCompleteTitle'),
                            description: t('profile.mfa.statusCompleteDescription')
                          };
                        case 'amber':
                          return {
                            icon: ShieldUser,
                            color: 'text-amber-600',
                            bg: 'bg-amber-50 dark:bg-amber-900/20',
                            title: t('profile.mfa.statusPartialTitle'),
                            description: t('profile.mfa.statusPartialDescription')
                          };
                        case 'red':
                        default:
                          return {
                            icon: ShieldAlert,
                            color: 'text-red-600',
                            bg: 'bg-red-50 dark:bg-red-900/20',
                            title: t('profile.mfa.statusIncompleteTitle'),
                            description: t('profile.mfa.statusIncompleteDescription')
                          };
                      }
                    };

                    const status = getSecurityStatus();
                    const StatusIcon = status.icon;

                    return (
                      <>
                        {/* Overall Status */}
                        <div className={cn("p-4 rounded-lg", status.bg)}>
                          <div className="flex items-start gap-3">
                            <StatusIcon className={cn("w-8 h-8 mt-0.5", status.color)} />
                            <div>
                              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{status.title}</h3>
                              <p className="text-sm text-gray-700 dark:text-gray-300">{status.description}</p>
                            </div>
                          </div>
                        </div>

                        {/* Security Health Badge */}
                        <div className="space-y-3">
                          <h3 className="font-medium text-gray-900 dark:text-gray-100">{t('profile.mfa.healthHeading')}</h3>
                          <SecurityHealthBadge 
                            securityHealth={{ 
                              health,
                              enabled: isEnabled,
                              method: (securityHealth as any)?.method,
                              enrolledAt: (securityHealth as any)?.enrolledAt,
                              recoveryCount,
                              passkeyCount
                            }}
                            className="w-full justify-start" 
                          />
                        </div>

                        {/* Security Features Overview */}
                        <div className="space-y-4">
                          <h3 className="font-medium text-gray-900 dark:text-gray-100">{t('profile.mfa.featuresHeading')}</h3>
                          
                          {/* MFA Status */}
                          <div className="flex items-center justify-between p-3 border rounded-lg dark:border-gray-700">
                            <div className="flex items-center gap-3">
                              <Key className={cn("w-5 h-5", isEnabled ? "text-green-600" : "text-gray-400")} />
                              <div>
                                <p className="font-medium text-gray-900 dark:text-gray-100">{t('profile.mfa.mfaName')}</p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  {isEnabled ? t('profile.mfa.mfaEnabled', { method: (securityHealth as any)?.method || 'TOTP' }) : t('profile.mfa.mfaDisabled')}
                                </p>
                              </div>
                            </div>
                            <div className={cn(
                              "w-3 h-3 rounded-full",
                              isEnabled ? "bg-green-500" : "bg-gray-300"
                            )} />
                          </div>

                          {/* Recovery Codes */}
                          <div className="flex items-center justify-between p-3 border rounded-lg dark:border-gray-700">
                            <div className="flex items-center gap-3">
                              <Smartphone className={cn("w-5 h-5", recoveryCount > 0 ? "text-green-600" : "text-gray-400")} />
                              <div>
                                <p className="font-medium text-gray-900 dark:text-gray-100">{t('profile.mfa.recoveryCodes')}</p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  {recoveryCount > 0 ? t('profile.mfa.recoveryCount', { value: recoveryCount }) : t('profile.mfa.notConfigured')}
                                </p>
                              </div>
                            </div>
                            <div className={cn(
                              "w-3 h-3 rounded-full",
                              recoveryCount > 0 ? "bg-green-500" : "bg-gray-300"
                            )} />
                          </div>

                          {/* Passkeys */}
                          <div className="flex items-center justify-between p-3 border rounded-lg dark:border-gray-700">
                            <div className="flex items-center gap-3">
                              <Fingerprint className={cn("w-5 h-5", passkeyCount > 0 ? "text-green-600" : "text-gray-400")} />
                              <div>
                                <p className="font-medium text-gray-900 dark:text-gray-100">{t('profile.mfa.passkeys')}</p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  {passkeyCount > 0 ? t('profile.mfa.passkeyCount', { value: passkeyCount }) : t('profile.mfa.notConfigured')}
                                </p>
                              </div>
                            </div>
                            <div className={cn(
                              "w-3 h-3 rounded-full",
                              passkeyCount > 0 ? "bg-green-500" : "bg-gray-300"
                            )} />
                          </div>

                          {/* Allowed sign-in methods (admin-set, read-only) */}
                          {userProfile?.allowedLoginMethods && (
                            <div className="flex items-center justify-between p-3 border rounded-lg dark:border-gray-700" data-testid="profile-allowed-login-methods">
                              <div className="flex items-center gap-3">
                                <Lock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                <div>
                                  <p className="font-medium text-gray-900 dark:text-gray-100">{t('profile.mfa.allowedLoginMethods')}</p>
                                  <p className="text-sm text-gray-500 dark:text-gray-400">
                                    {t(`users.allowedLoginMethods.options.${userProfile.allowedLoginMethods}`, { defaultValue: userProfile.allowedLoginMethods })}
                                  </p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('profile.mfa.allowedLoginMethodsHelp')}</p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Security Journey Timeline */}
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                            <h3 className="font-medium text-gray-900 dark:text-gray-100">{t('profile.mfa.journeyHeading')}</h3>
                          </div>
                          <SecurityJourney securityHealth={securityHealth} />
                        </div>

                        {/* Quick Actions */}
                        <div className="space-y-3">
                          <h3 className="font-medium text-gray-900 dark:text-gray-100">{t('profile.mfa.quickActionsHeading')}</h3>
                          <div className="space-y-2">
                            <Button
                              onClick={() => setShowMFASetup(true)}
                              variant="outline"
                              className="w-full justify-between group hover:bg-blue-50 dark:hover:bg-blue-900/20"
                            >
                              <div className="flex items-center gap-2">
                                <ShieldUser className="w-4 h-4 text-blue-600" />
                                {isEnabled ? t('profile.mfa.manageButton') : t('profile.mfa.setupButton')}
                              </div>
                              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600" />
                            </Button>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {activeTab === "calendar" && <ProfileCalendarTab />}

              {activeTab === "integrations" && <ProfileIntegrationsTab />}
            </div>
          </div>
        </div>
      </SheetContent>
      {/* MFA Setup Dialog - isEnforcementMode=false allows user to close */}
      <MFASetupDialog 
        isOpen={showMFASetup}
        onClose={() => setShowMFASetup(false)}
        isEnforcementMode={false}
        onGoToStatus={() => {
          // Task #583: post-recovery-download "Go to my Status" lands
          // the operator on the MFA & Security tab where the security
          // health panel and the Manage MFA control live, regardless
          // of which tab they were on when they opened the wizard.
          setShowMFASetup(false);
          setActiveTab("mfa-security");
        }}
      />
    </Sheet>
  );
}
