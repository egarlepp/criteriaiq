import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useSystemHealthCategoryQuery } from "./useSystemHealthCategoryQuery";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Shield,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Key,
  UserCheck,
  Lock,
  Fingerprint
} from "lucide-react";
import { HealthFreshnessIndicator } from "./HealthFreshnessIndicator";
import { useLocation } from "wouter";

interface SecurityHealthData {
  status: "ok" | "warning" | "error";
  lastChecked: string;
  message: string;
  mfaStats: {
    totalUsers: number;
    usersWithMfa: number;
    mfaAdoptionRate: number;
    usersWithWebauthn: number;
    usersWithTotp: number;
  };
  loginAttempts: {
    successful24h: number;
    failed24h: number;
    failureRate: number;
    lockedAccounts: number;
  };
  sessions: {
    activeSessions: number;
    expiredSessions24h: number;
  };
  passwordSecurity: {
    usersRequiringReset: number;
    expiredPasswords: number;
  };
  /** Okta SSO posture metrics — only present after migration 071. */
  ssoStats?: {
    isSsoEnabled: boolean;
    internalUserCount: number;
    internalUsersOnSso: number;
    ssoAdoptionRate: number;
    usersWithoutMfaOrSso: number;
  };
  recentLogins?: Array<{
    userName: string | null;
    userEmail: string | null;
    success: boolean | null;
    failureReason: string | null;
    loginTime: string | null;
  }>;
}

export function SecurityHealthTab() {
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useSystemHealthCategoryQuery<SecurityHealthData>({
    queryKey: ["system-health-security"],
    queryFn: async () => {
      const response = await fetch("/api/system/health/security");
      if (!response.ok) throw new Error("Failed to fetch security health");
      return response.json();
    },
    refetchInterval: 60000,
  });

  const [, setLocation] = useLocation();

  // Navigate to Monitoring & Audit → Login History. The config page reads the
  // tab/subtab from the URL query string and only reacts to a popstate event
  // (query-only changes don't move wouter's pathname), so we mirror the
  // sidebar's pattern: pushState + dispatch popstate + sync wouter.
  const goToAudit = () => {
    const href = "/admin?tab=login-history";
    window.history.pushState({}, "", href);
    window.dispatchEvent(new PopStateEvent("popstate"));
    setLocation(href);
  };

  const getStatusBadge = (status: "ok" | "warning" | "error") => {
    switch (status) {
      case "ok":
        return (
          <Badge variant="outline" className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Secure
          </Badge>
        );
      case "warning":
        return (
          <Badge variant="outline" className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Attention Needed
          </Badge>
        );
      case "error":
        return (
          <Badge variant="outline" className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Critical
          </Badge>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
            <AlertTriangle className="h-5 w-5" />
            <span>Failed to load security health data.</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="relative">
          <div className="absolute top-4 right-4 flex items-center gap-3">
            {getStatusBadge(data.status)}
            <HealthFreshnessIndicator
              dataUpdatedAt={dataUpdatedAt}
              isFetching={isFetching}
              onRefresh={() => refetch()}
              testIdPrefix="security-health"
              lastCheckedIso={data.lastChecked}
            />
          </div>
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-blue-600" />
            <CardTitle className="text-2xl font-bold">
              Security Metrics
            </CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            Monitor MFA adoption, login activity, and session management
          </p>
        </CardHeader> 

      <div className="grid grid-cols-4 gap-4 px-4 pb-4 pt-0">
        <Card className={`relative overflow-hidden ${
          data.mfaStats.mfaAdoptionRate >= 80 ? "bg-green-50/80 dark:bg-green-900/20 border-green-200 dark:border-green-800" :
          data.mfaStats.mfaAdoptionRate >= 50 ? "bg-yellow-50/80 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800" : "bg-red-50/80 dark:bg-red-900/20 border-red-200 dark:border-red-800"
        }`}>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Key className={`h-24 w-24 opacity-10 ${
              data.mfaStats.mfaAdoptionRate >= 80 ? "text-green-600" :
              data.mfaStats.mfaAdoptionRate >= 50 ? "text-yellow-600" : "text-red-600"
            }`} />
          </div>
          <CardContent className="relative p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Key className={`w-5 h-5 ${
                data.mfaStats.mfaAdoptionRate >= 80 ? "text-green-700 dark:text-green-300" :
                data.mfaStats.mfaAdoptionRate >= 50 ? "text-yellow-700 dark:text-yellow-300" : "text-red-700 dark:text-red-300"
              }`} />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">MFA Adoption</h3>
            </div>
            <div className={`text-2xl font-bold ${
              data.mfaStats.mfaAdoptionRate >= 80 ? "text-green-600 dark:text-green-400" :
              data.mfaStats.mfaAdoptionRate >= 50 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"
            }`}>
              {data.mfaStats.mfaAdoptionRate}%
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{data.mfaStats.usersWithMfa} of {data.mfaStats.totalUsers} users</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-blue-50/80 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Lock className="h-24 w-24 opacity-10 text-blue-600" />
          </div>
          <CardContent className="relative p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Lock className="w-5 h-5 text-blue-700 dark:text-blue-300" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Active Sessions</h3>
            </div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {data.sessions.activeSessions}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{data.sessions.expiredSessions24h} expired (24h)</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-green-50/80 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <UserCheck className="h-24 w-24 opacity-10 text-green-600" />
          </div>
          <CardContent className="relative p-4">
            <div className="flex items-center space-x-2 mb-2">
              <UserCheck className="w-5 h-5 text-green-700 dark:text-green-300" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Successful Logins</h3>
            </div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {data.loginAttempts.successful24h}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">last 24 hours</p>
          </CardContent>
        </Card>

        <Card className={`relative overflow-hidden ${
          data.loginAttempts.failed24h > 0 ? "bg-red-50/80 dark:bg-red-900/20 border-red-200 dark:border-red-800" : "bg-gray-50/80 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
        }`}>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <AlertTriangle className={`h-24 w-24 opacity-10 ${
              data.loginAttempts.failed24h > 0 ? "text-red-600" : "text-gray-600 dark:text-gray-400"
            }`} />
          </div>
          <CardContent className="relative p-4">
            <div className="flex items-center space-x-2 mb-2">
              <AlertTriangle className={`w-5 h-5 ${
                data.loginAttempts.failed24h > 0 ? "text-red-700 dark:text-red-300" : "text-gray-700 dark:text-gray-300"
              }`} />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Failed Logins</h3>
            </div>
            <div className={`text-2xl font-bold ${
              data.loginAttempts.failed24h > 0 ? "text-red-600 dark:text-red-400" : "text-gray-600 dark:text-gray-400"
            }`}>
              {data.loginAttempts.failed24h}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">last 24 hours</p>
          </CardContent>
        </Card>
      </div>
    </Card>
      
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="h-5 w-5 text-blue-500" />
              MFA Details
            </CardTitle>
            <CardDescription>Multi-factor authentication breakdown</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress 
              value={data.mfaStats.mfaAdoptionRate} 
              className={`h-3 ${
                data.mfaStats.mfaAdoptionRate >= 80 ? "[&>div]:bg-green-500" :
                data.mfaStats.mfaAdoptionRate >= 50 ? "[&>div]:bg-yellow-500" : "[&>div]:bg-red-500"
              }`}
            />
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="text-lg font-semibold">{data.mfaStats.totalUsers}</div>
                <div className="text-xs text-muted-foreground">Total Users</div>
              </div>
              <div className="text-center p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="text-lg font-semibold text-green-700 dark:text-green-300">{data.mfaStats.usersWithMfa}</div>
                <div className="text-xs text-green-600 dark:text-green-400">With MFA</div>
              </div>
              <div className="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="text-lg font-semibold">{data.mfaStats.totalUsers - data.mfaStats.usersWithMfa}</div>
                <div className="text-xs text-muted-foreground">Without MFA</div>
              </div>
            </div>
            <div className="flex gap-4 pt-2">
              <div className="flex items-center gap-2 text-sm">
                <Fingerprint className="h-4 w-4 text-purple-500" />
                <span>{data.mfaStats.usersWithWebauthn} WebAuthn</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Key className="h-4 w-4 text-blue-500" />
                <span>{data.mfaStats.usersWithTotp} TOTP</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={data.loginAttempts.lockedAccounts > 0 ? "border-red-200 dark:border-red-800" : ""}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-green-500" />
              Login Activity Details
            </CardTitle>
            <CardDescription>Authentication attempts and failures</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.loginAttempts.lockedAccounts > 0 && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
                <Lock className="h-5 w-5 text-red-600 dark:text-red-400" />
                <div>
                  <div className="font-medium text-red-700 dark:text-red-300">
                    {data.loginAttempts.lockedAccounts} Locked Account(s)
                  </div>
                  <div className="text-sm text-red-600 dark:text-red-400">
                    Accounts locked due to failed login attempts
                  </div>
                </div>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Failure Rate</span>
              <span className={`font-medium ${
                data.loginAttempts.failureRate > 20 ? "text-red-600 dark:text-red-400" : "text-gray-600 dark:text-gray-400"
              }`}>
                {data.loginAttempts.failureRate}%
              </span>
            </div>

            {/* Last 3 logins — mirrors the User Management → Audit table's User + Status columns */}
            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Recent Logins</span>
                <button
                  type="button"
                  onClick={goToAudit}
                  className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  View full audit →
                </button>
              </div>
              {data.recentLogins && data.recentLogins.length > 0 ? (
                <ul className="space-y-1.5">
                  {data.recentLogins.map((login, idx) => {
                    const isLockout = login.failureReason === "mfa_rate_limited";
                    const statusLabel = isLockout ? "Locked" : login.success ? "Success" : "Failed";
                    const badgeClass = isLockout
                      ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                      : login.success
                        ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
                        : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800";
                    const when = login.loginTime
                      ? new Date(login.loginTime).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                      : "—";
                    return (
                      <li key={idx} className="flex items-center justify-between text-sm gap-2">
                        <span className="truncate text-gray-700 dark:text-gray-300 flex-1 min-w-0" title={login.userEmail ?? undefined}>
                          {login.userName || login.userEmail || "Unknown"}
                        </span>
                        <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400 tabular-nums">{when}</span>
                        <Badge variant="outline" className={`shrink-0 ${badgeClass}`}>{statusLabel}</Badge>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No recent logins</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="h-5 w-5 text-purple-500" />
              Active Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-center">
                <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                  {data.sessions.activeSessions}
                </div>
                <div className="text-sm text-purple-600 dark:text-purple-400">Active Now</div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                <div className="text-2xl font-bold text-gray-700 dark:text-gray-300">
                  {data.sessions.expiredSessions24h}
                </div>
                <div className="text-sm text-muted-foreground">Expired (24h)</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="h-5 w-5 text-yellow-500" />
              Password Security
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className={`p-3 rounded-lg text-center ${
                data.passwordSecurity.usersRequiringReset > 0 ? "bg-yellow-50 dark:bg-yellow-900/20" : "bg-gray-50 dark:bg-gray-800"
              }`}>
                <div className={`text-2xl font-bold ${
                  data.passwordSecurity.usersRequiringReset > 0 ? "text-yellow-700 dark:text-yellow-300" : "text-gray-700 dark:text-gray-300"
                }`}>
                  {data.passwordSecurity.usersRequiringReset}
                </div>
                <div className="text-sm text-muted-foreground">Pending Resets</div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                <div className="text-2xl font-bold text-gray-700 dark:text-gray-300">
                  {data.passwordSecurity.expiredPasswords}
                </div>
                <div className="text-sm text-muted-foreground">Force Reset Required</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Single Sign-On posture — only renders on deployments that
          have run migration 071. Shows adoption rate (internal users
          on Okta / total active internal users) plus the at-risk
          count of accounts with neither MFA nor SSO. The OIDC
          callback is the actual enforcement point; this card is a
          rollout / posture lens for admins. */}
      {data.ssoStats && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-5 w-5 text-indigo-500" />
              Single Sign-On Posture
            </CardTitle>
            <CardDescription>
              {data.ssoStats.isSsoEnabled
                ? "Okta adoption across internal users plus accounts with no second factor"
                : "Okta is not currently enabled — adoption metrics will populate once the SSO config is turned on"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Internal Users on Okta</span>
                <span className="font-medium">
                  {data.ssoStats.internalUsersOnSso} / {data.ssoStats.internalUserCount}
                  {data.ssoStats.internalUserCount > 0 ? ` (${data.ssoStats.ssoAdoptionRate}%)` : ""}
                </span>
              </div>
              <Progress
                value={data.ssoStats.ssoAdoptionRate}
                className={`h-3 ${
                  !data.ssoStats.isSsoEnabled
                    ? "[&>div]:bg-gray-400 dark:[&>div]:bg-gray-600"
                    : data.ssoStats.ssoAdoptionRate >= 80
                    ? "[&>div]:bg-green-500"
                    : data.ssoStats.ssoAdoptionRate >= 50
                    ? "[&>div]:bg-yellow-500"
                    : "[&>div]:bg-red-500"
                }`}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div
                className={`p-3 rounded-lg text-center ${
                  data.ssoStats.usersWithoutMfaOrSso > 0
                    ? "bg-red-50 dark:bg-red-900/20"
                    : "bg-green-50 dark:bg-green-900/20"
                }`}
              >
                <div
                  className={`text-2xl font-bold ${
                    data.ssoStats.usersWithoutMfaOrSso > 0
                      ? "text-red-700 dark:text-red-300"
                      : "text-green-700 dark:text-green-300"
                  }`}
                >
                  {data.ssoStats.usersWithoutMfaOrSso}
                </div>
                <div
                  className={`text-xs ${
                    data.ssoStats.usersWithoutMfaOrSso > 0
                      ? "text-red-600 dark:text-red-400"
                      : "text-green-600 dark:text-green-400"
                  }`}
                >
                  No MFA AND no SSO
                </div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                <div className="text-2xl font-bold text-gray-700 dark:text-gray-300">
                  {data.ssoStats.isSsoEnabled ? "On" : "Off"}
                </div>
                <div className="text-xs text-muted-foreground">SSO Status</div>
              </div>
            </div>

            {data.ssoStats.usersWithoutMfaOrSso > 0 && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                <div className="text-sm text-red-700 dark:text-red-300">
                  {data.ssoStats.usersWithoutMfaOrSso} active account{data.ssoStats.usersWithoutMfaOrSso === 1 ? "" : "s"} can be signed into with a password alone. Enroll MFA or link Okta for these users.
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
