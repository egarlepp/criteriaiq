import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Clock,
  TrendingUp,
  ArrowLeft,
  Users,
  ShieldUser,
  KeyRound,
  ShieldAlert,
  Eye,
} from "lucide-react";
import { LoginMethodBadge } from "@/components/audit/LoginMethodBadge";
import { LoginEventStatusBadge } from "@/components/audit/LoginEventStatusBadge";
import { BruteForceLockoutBadge } from "@/components/audit/BruteForceLockoutBadge";
import { describeLoginMethod } from "@/lib/loginMethod";
import { describeLoginFailureReason } from "@/lib/loginFailureReason";
import {
  groupLockoutStreaks,
  selectLockoutStreakRows,
  type AuditLogEntry,
} from "@/lib/loginAuditGrouping";

interface AuditLogin {
  id: number;
  userId: string;
  userEmail: string;
  userName: string;
  loginTime: string;
  loginMethod: string;
  action?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt?: string;
  success?: boolean | null;
  /**
   * Raw `audit_logins.failure_reason` value. The MFA challenge route
   * writes the sentinel `"mfa_rate_limited"` when a brute-force
   * lockout fires (Task #613); the Activity Log uses that to swap in
   * the distinct icon, label, and tooltip (Task #619). Task #767's
   * secret_reveal rows reuse this field for the deny reason code.
   */
  failureReason?: string | null;
  /**
   * Task #767: `'login'` (the default for every existing call site)
   * or `'secret_reveal'` for rows written when an admin reveals a
   * sensitive value (SESSION_SECRET, ENCRYPTION_KEY, DATABASE_URL,
   * or a per-row db-connections URL).
   */
  eventType?: string | null;
  /**
   * Task #767: for `eventType === 'secret_reveal'`, the key that was
   * revealed (e.g. `'SESSION_SECRET'`, `'DATABASE_URL'`,
   * `'db-connection:42'`). Always null for login events.
   */
  eventSubject?: string | null;
}

/**
 * Sentinel values for the Event Type filter. `secret_reveal` matches
 * the literal string the server writes into `audit_logins.event_type`
 * (see `recordSecretRevealAudit` in `server/auth/simpleAuth.ts`); the
 * other two are sent verbatim to the report endpoint, where 'all'
 * skips the filter and 'login' matches the default value the existing
 * audit writers use.
 */
type EventTypeFilterValue = "all" | "login" | "secret_reveal";

type StatusFilterValue = "all" | "success" | "failed" | "lockouts";

interface LoginAuditReportProps {
  onBack: () => void;
}

export default function LoginAuditReport({ onBack }: LoginAuditReportProps) {
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });
  // Status filter for the per-event list (Task #635). Stat cards
  // intentionally continue to use the unfiltered `auditData` so the
  // headline numbers keep representing the full date range. Task #619
  // adds the "lockouts" option, which narrows the list to just the
  // brute-force lockout streaks (each lockout row plus the failed
  // attempts that triggered it).
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all");
  // Task #767: filter the report by event type so an admin can pull
  // up just the secret-reveal trail when responding to "who looked at
  // the production database URL last Tuesday?". The filter is sent to
  // the server (rather than applied client-side) so the report
  // endpoint does not have to ship every login row to the browser
  // when the admin only wants reveal events.
  const [eventTypeFilter, setEventTypeFilter] =
    useState<EventTypeFilterValue>("all");

  const { data: auditData = [], isLoading } = useQuery<AuditLogin[]>({
    queryKey: ["/api/audit-logins/report", startDate, endDate, eventTypeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ startDate, endDate });
      if (eventTypeFilter !== "all") {
        params.set("eventType", eventTypeFilter);
      }
      const response = await fetch(
        `/api/audit-logins/report?${params.toString()}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch audit report");
      }
      return response.json();
    },
  });

  // Surface recovery-code redemptions as a top-line metric on the
  // audit report so an admin can see at a glance whether anyone has
  // had to fall back to a recovery code in the selected window
  // (Task #603).
  const recoveryCodeUses = useMemo(
    () =>
      auditData.filter((login) => describeLoginMethod(login.loginMethod).isRecovery)
        .length,
    [auditData],
  );

  // Compute the success rate from the actual `success` column on
  // each audit row (Task #621). Rows default to `success: true` in
  // the schema, so treat null/undefined as success and only count
  // explicit `false` values as failures.
  const successRateLabel = useMemo(() => {
    if (auditData.length === 0) return "—";
    const successCount = auditData.filter((login) => login.success !== false).length;
    return `${Math.round((successCount / auditData.length) * 100)}%`;
  }, [auditData]);

  // Surface brute-force MFA lockouts as a top-line metric (Task #619)
  // so an admin scanning the dashboard immediately sees whether any
  // account has been temporarily locked out by the 5-failure ceiling
  // in the selected window — without having to scroll the event list
  // or read the failureReason column on individual rows.
  const bruteForceLockouts = useMemo(
    () =>
      auditData.filter(
        (login) =>
          describeLoginFailureReason(login.failureReason).isBruteForceLockout,
      ).length,
    [auditData],
  );

  // Apply the status filter to the event list only — the stat cards
  // above keep using `auditData` so their numbers don't shift when
  // the admin narrows the list (Task #635). Task #619 adds the
  // "lockouts" branch, which delegates to the grouping helper so the
  // visible rows are exactly the streak rows (lockout + the failures
  // that triggered it).
  const filteredAuditData = useMemo(() => {
    if (statusFilter === "all") return auditData;
    if (statusFilter === "failed") {
      return auditData.filter((login) => login.success === false);
    }
    if (statusFilter === "lockouts") {
      return selectLockoutStreakRows(auditData);
    }
    return auditData.filter((login) => login.success !== false);
  }, [auditData, statusFilter]);

  // Group the visible rows so each brute-force lockout visually
  // subsumes the preceding ~5 failed MFA attempts that triggered it.
  // The group is rendered as a single bordered container in the event
  // list below, making the streak-then-lockout pattern read as one
  // event instead of six (Task #619).
  const eventGroups = useMemo<AuditLogEntry<AuditLogin>[]>(
    () => groupLockoutStreaks(filteredAuditData),
    [filteredAuditData],
  );

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
        <p className="text-sm text-gray-600 dark:text-gray-400">Loading audit report...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              onClick={onBack}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Reports
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Return to the main analytics dashboard
          </TooltipContent>
        </Tooltip>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="start-date">Start Date:</Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-auto"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="end-date">End Date:</Label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-auto"
            />
          </div>
          {/*
           * Task #767: Event Type filter. Defaults to "all" so admins
           * land on the same page they used to see; switching to
           * "Secret reveals" issues a fresh fetch with
           * ?eventType=secret_reveal so the report endpoint returns
           * just those rows instead of the browser having to filter
           * thousands of login rows down to a handful of reveal events.
           */}
          <div className="flex items-center gap-2">
            <Label htmlFor="event-type-filter">Event:</Label>
            <Select
              value={eventTypeFilter}
              onValueChange={(value) =>
                setEventTypeFilter(value as EventTypeFilterValue)
              }
            >
              <SelectTrigger
                id="event-type-filter"
                className="w-44"
                data-testid="login-audit-event-type-filter"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  value="all"
                  data-testid="login-audit-event-type-filter-all"
                >
                  All events
                </SelectItem>
                <SelectItem
                  value="login"
                  data-testid="login-audit-event-type-filter-login"
                >
                  Logins only
                </SelectItem>
                <SelectItem
                  value="secret_reveal"
                  data-testid="login-audit-event-type-filter-secret-reveal"
                >
                  Secret reveals
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="status-filter">Status:</Label>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as StatusFilterValue)}
            >
              <SelectTrigger
                id="status-filter"
                className="w-44"
                data-testid="login-audit-status-filter"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="login-audit-status-filter-all">All</SelectItem>
                <SelectItem value="success" data-testid="login-audit-status-filter-success">Success</SelectItem>
                <SelectItem value="failed" data-testid="login-audit-status-filter-failed">Failed</SelectItem>
                {/*
                 * Task #619: one-click filter that narrows the list to
                 * the brute-force lockout streaks (each lockout row +
                 * the failed MFA attempts that triggered it). The
                 * sentinel value "lockouts" is consumed by the
                 * `filteredAuditData` memo above.
                 */}
                <SelectItem
                  value="lockouts"
                  data-testid="login-audit-status-filter-lockouts"
                >
                  Brute-force lockouts only
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldUser data-title-icon className="h-5 w-5" />
            <CardTitle>Login Audit Report</CardTitle>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            User authentication activity from {new Date(startDate).toLocaleDateString()} to {new Date(endDate).toLocaleDateString()}
          </p>
        </CardHeader>
        <CardContent>
          {auditData.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <ShieldUser className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>No login activity found for the selected date range.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Logins</p>
                        <p className="text-2xl font-bold">{auditData.length}</p>
                      </div>
                      <Users className="h-8 w-8 text-blue-500" />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Unique Users</p>
                        <p className="text-2xl font-bold">{new Set(auditData.map((a) => a.userEmail)).size}</p>
                      </div>
                      <ShieldUser className="h-8 w-8 text-green-500" />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Success Rate</p>
                        <p className="text-2xl font-bold" data-testid="login-audit-success-rate">{successRateLabel}</p>
                      </div>
                      <TrendingUp className="h-8 w-8 text-emerald-500" />
                    </div>
                  </CardContent>
                </Card>
                <Card
                  className={
                    recoveryCodeUses > 0
                      ? "border-amber-300 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-900/20"
                      : ""
                  }
                  data-testid="recovery-code-stat"
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Recovery Code Logins</p>
                        <p className="text-2xl font-bold">{recoveryCodeUses}</p>
                      </div>
                      <KeyRound
                        className={
                          recoveryCodeUses > 0
                            ? "h-8 w-8 text-amber-600 dark:text-amber-400"
                            : "h-8 w-8 text-gray-400 dark:text-gray-500"
                        }
                      />
                    </div>
                  </CardContent>
                </Card>
                {/*
                 * Task #619: lockout count card. Lights up red when at
                 * least one brute-force lockout fired in the window so
                 * an admin glancing at the report sees the brute-force
                 * pattern instead of having to scroll the event list.
                 */}
                <Card
                  className={
                    bruteForceLockouts > 0
                      ? "border-red-300 bg-red-50/60 dark:border-red-700 dark:bg-red-900/20"
                      : ""
                  }
                  data-testid="brute-force-lockout-stat"
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Brute-force Lockouts</p>
                        <p className="text-2xl font-bold">{bruteForceLockouts}</p>
                      </div>
                      <ShieldAlert
                        className={
                          bruteForceLockouts > 0
                            ? "h-8 w-8 text-red-600 dark:text-red-400"
                            : "h-8 w-8 text-gray-400 dark:text-gray-500"
                        }
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium">Login Events</h4>
                {filteredAuditData.length === 0 ? (
                  <div
                    className="text-center py-6 text-sm text-gray-500 dark:text-gray-400"
                    data-testid="login-audit-events-empty"
                  >
                    No login events match the selected status filter.
                  </div>
                ) : null}
                {eventGroups.map((group) => {
                  if (group.kind === "lockout-streak") {
                    const { lockout, preceding } = group;
                    const lockoutInfo = describeLoginFailureReason(
                      lockout.failureReason,
                    );
                    return (
                      <div
                        key={`lockout-${lockout.id}`}
                        className="rounded-lg border-2 border-red-300 bg-red-50/40 p-3 space-y-2 dark:border-red-700 dark:bg-red-900/10"
                        data-testid="brute-force-lockout-group"
                        data-lockout-id={lockout.id}
                        data-preceding-count={preceding.length}
                      >
                        <LockoutEventRow login={lockout} info={lockoutInfo} />
                        {preceding.length > 0 && (
                          <div
                            className="ml-6 border-l-2 border-red-300 dark:border-red-700 pl-4 space-y-2"
                            data-testid="brute-force-lockout-streak"
                          >
                            <p
                              className="text-xs font-medium uppercase tracking-wide text-red-700 dark:text-red-300"
                              data-testid="brute-force-lockout-streak-label"
                            >
                              {preceding.length === 1
                                ? "1 failed MFA attempt that triggered the lockout"
                                : `${preceding.length} failed MFA attempts that triggered the lockout`}
                            </p>
                            {preceding.map((login) => (
                              <StandardEventRow
                                key={login.id}
                                login={login}
                                inStreak
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Task #767: secret_reveal rows get their own
                  // distinct row layout so they don't masquerade as
                  // logins (the Eye icon + "Secret reveal" badge make
                  // the event class obvious at a scroll), and so the
                  // key whose value was revealed is rendered on the
                  // row itself.
                  if (group.login.eventType === "secret_reveal") {
                    return (
                      <SecretRevealEventRow
                        key={group.login.id}
                        login={group.login}
                      />
                    );
                  }

                  return <StandardEventRow key={group.login.id} login={group.login} />;
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Shared row layout for non-lockout audit entries. Recovery-code
 * redemptions keep their amber accent (Task #603); inside a lockout
 * streak the row is rendered with `inStreak` so the per-row card
 * dropping its border avoids visually competing with the surrounding
 * lockout group container (Task #619).
 */
function StandardEventRow({
  login,
  inStreak = false,
}: {
  login: AuditLogin;
  inStreak?: boolean;
}) {
  const methodInfo = describeLoginMethod(login.loginMethod);
  return (
    <div
      className={
        methodInfo.isRecovery
          ? "flex items-center justify-between p-3 border border-amber-300 bg-amber-50/60 rounded-lg dark:border-amber-700 dark:bg-amber-900/20"
          : inStreak
            ? "flex items-center justify-between p-2 rounded-md bg-white/60 dark:bg-gray-900/30"
            : "flex items-center justify-between p-3 border rounded-lg"
      }
      data-testid={inStreak ? "brute-force-lockout-streak-row" : "login-event-row"}
    >
      <div className="flex items-center gap-3">
        <div
          className={
            methodInfo.isRecovery
              ? "p-2 bg-amber-100 dark:bg-amber-800/40 rounded-full"
              : "p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full"
          }
        >
          {methodInfo.isRecovery ? (
            <KeyRound className="h-4 w-4 text-amber-700 dark:text-amber-300" />
          ) : (
            <ShieldUser className="h-4 w-4 text-blue-600" />
          )}
        </div>
        <div>
          <p className="font-medium text-sm">{login.userName}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{login.userEmail}</p>
        </div>
      </div>
      <div className="text-right">
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <Clock className="h-3 w-3" />
          {new Date(login.loginTime).toLocaleString()}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 justify-end">
          <LoginMethodBadge method={login.loginMethod} />
          <LoginEventStatusBadge success={login.success} />
        </div>
      </div>
    </div>
  );
}

/**
 * Distinct row layout for `event_type='secret_reveal'` rows
 * (Task #767). Renders the actor + IP just like a login row but
 * swaps in:
 *   - an Eye icon to make "this is a reveal, not a sign-in" obvious
 *     when scrolling the timeline
 *   - the key that was revealed (SESSION_SECRET / ENCRYPTION_KEY /
 *     DATABASE_URL / db-connection:N) as a small badge
 *   - a "Denied" badge with the deny-reason code when the row is a
 *     guard rejection rather than a successful reveal, so brute-force
 *     or unauthorized attempts read as such instead of masquerading
 *     as just-another-failed-login.
 *
 * The component intentionally does NOT render the loginMethod badge
 * (which would say "Email") because secret_reveal rows have no
 * meaningful login method — `loginMethod` carries the column default.
 */
function SecretRevealEventRow({ login }: { login: AuditLogin }) {
  const isFailure = login.success === false;
  const subject = login.eventSubject ?? "secret";
  return (
    <div
      className={
        isFailure
          ? "flex items-center justify-between p-3 border border-red-300 bg-red-50/40 rounded-lg dark:border-red-700 dark:bg-red-900/10"
          : "flex items-center justify-between p-3 border border-purple-200 bg-purple-50/40 rounded-lg dark:border-purple-800 dark:bg-purple-900/10"
      }
      data-testid="secret-reveal-event-row"
      data-event-subject={subject}
      data-success={isFailure ? "false" : "true"}
    >
      <div className="flex items-center gap-3">
        <div
          className={
            isFailure
              ? "p-2 rounded-full bg-red-100 dark:bg-red-800/40"
              : "p-2 rounded-full bg-purple-100 dark:bg-purple-800/40"
          }
        >
          <Eye
            className={
              isFailure
                ? "h-4 w-4 text-red-700 dark:text-red-300"
                : "h-4 w-4 text-purple-700 dark:text-purple-300"
            }
          />
        </div>
        <div>
          <p className="font-medium text-sm">{login.userName}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{login.userEmail}</p>
          <p
            className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
            data-testid="secret-reveal-subject"
          >
            Revealed: <span className="font-mono">{subject}</span>
          </p>
        </div>
      </div>
      <div className="text-right">
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <Clock className="h-3 w-3" />
          {new Date(login.loginTime).toLocaleString()}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 justify-end mt-1">
          <Badge
            variant="outline"
            className="text-xs gap-1 border-purple-300 bg-purple-50 text-purple-800 dark:border-purple-700 dark:bg-purple-900/30 dark:text-purple-200"
          >
            <Eye className="h-3 w-3" aria-hidden="true" />
            Secret reveal
          </Badge>
          {isFailure ? (
            <Badge
              variant="outline"
              className="text-xs text-red-600 dark:text-red-400 border-red-300 dark:border-red-800"
              title={login.failureReason ?? undefined}
              data-testid="secret-reveal-deny-badge"
              data-deny-reason={login.failureReason ?? ""}
            >
              Denied{login.failureReason ? `: ${login.failureReason}` : ""}
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-xs text-green-600"
              data-testid="secret-reveal-success-badge"
            >
              Success
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Distinct row layout for the brute-force lockout entry itself
 * (Task #619). The row swaps the generic blue "shield user" icon for
 * a red `ShieldAlert`, replaces the "Failed" badge with the
 * <BruteForceLockoutBadge /> (which carries the explanatory tooltip),
 * and drops the loginMethod badge — at the lockout point the method
 * field is cosmetic and would visually compete with the new badge.
 */
function LockoutEventRow({
  login,
  info,
}: {
  login: AuditLogin;
  info: ReturnType<typeof describeLoginFailureReason>;
}) {
  return (
    <div
      className="flex items-center justify-between p-2 rounded-md"
      data-testid="brute-force-lockout-row"
      data-failure-reason={info.raw}
    >
      <div className="flex items-center gap-3">
        <div
          className="p-2 rounded-full bg-red-100 dark:bg-red-800/40"
          title={info.tooltip}
        >
          <ShieldAlert className="h-4 w-4 text-red-700 dark:text-red-300" />
        </div>
        <div>
          <p className="font-medium text-sm">{login.userName}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{login.userEmail}</p>
        </div>
      </div>
      <div className="text-right">
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <Clock className="h-3 w-3" />
          {new Date(login.loginTime).toLocaleString()}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 justify-end">
          <BruteForceLockoutBadge />
        </div>
      </div>
    </div>
  );
}
