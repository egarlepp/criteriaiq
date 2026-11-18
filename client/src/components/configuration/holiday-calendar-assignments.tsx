import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Building2, Loader2, Save, Search, UserRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { cn } from "@/lib/utils";
import {
  MAX_USER_CALENDARS,
  type AccountHolidayAssignment,
  type HolidayAssignment,
  type HolidayCalendarSummary,
} from "@shared/holiday-calendars";
import { HOLIDAY_ACCOUNT_ASSIGNMENTS_KEY, HOLIDAY_ASSIGNMENTS_KEY, holidayErrorKey } from "./holiday-calendar-api";

interface UserRow {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  region: string | null;
  role: string | null;
  isActive: boolean | null;
}

interface AccountRow {
  id: number;
  accountName: string;
  region?: string | null;
  isActive?: boolean | null;
}

// Customers, guests and partners don't work to the organization's calendar;
// their account's calendars (the Accounts view) apply to them instead.
const EXTERNAL_ROLES = new Set(["Customer", "Guest", "Partner"]);
const PAGE_SIZE = 50;

function displayName(u: UserRow): string {
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || u.id;
}

type View = "people" | "accounts";

// Which holiday calendars each person, or each account's people, follow (up
// to three). A person's own calendars come first, then their account's;
// anyone with neither uses the organization defaults (the starred calendars
// above).
export function HolidayCalendarAssignments({ calendars }: { calendars: HolidayCalendarSummary[] }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>("people");

  const { data: users = [], isLoading: usersLoading } = useQuery<UserRow[]>({ queryKey: ["/api/users"] });
  const { data: assignments = [], isLoading: assignLoading } = useQuery<HolidayAssignment[]>({
    queryKey: HOLIDAY_ASSIGNMENTS_KEY,
  });
  const { data: accounts = [], isLoading: accountsLoading } = useQuery<AccountRow[]>({
    queryKey: ["/api/customers"],
    enabled: view === "accounts",
  });
  const { data: accountAssignments = [], isLoading: accountAssignLoading } = useQuery<AccountHolidayAssignment[]>({
    queryKey: HOLIDAY_ACCOUNT_ASSIGNMENTS_KEY,
    enabled: view === "accounts",
  });

  const assignedByUser = useMemo(() => new Map(assignments.map((a) => [a.userId, a.calendarIds])), [assignments]);
  const assignedByAccount = useMemo(
    () => new Map(accountAssignments.map((a) => [a.accountId, a.calendarIds])),
    [accountAssignments],
  );
  const defaults = calendars.filter((c) => c.isDefault);

  const people = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => u.isActive !== false && !EXTERNAL_ROLES.has(u.role ?? ""))
      .filter((u) => !q || `${displayName(u)} ${u.email ?? ""} ${u.region ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => displayName(a).localeCompare(displayName(b)));
  }, [users, search]);

  const accountRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts
      .filter((a) => a.isActive !== false)
      .filter((a) => !q || `${a.accountName} ${a.region ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => a.accountName.localeCompare(b.accountName));
  }, [accounts, search]);

  const rows =
    view === "people"
      ? people.map((u) => ({
          id: u.id,
          title: displayName(u),
          detail: [u.email, u.region].filter(Boolean).join(" · "),
          assigned: assignedByUser.get(u.id) ?? [],
          url: `/api/admin/holiday-calendars/assignments/${encodeURIComponent(u.id)}`,
        }))
      : accountRows.map((a) => ({
          id: String(a.id),
          title: a.accountName,
          detail: a.region ?? "",
          assigned: assignedByAccount.get(a.id) ?? [],
          url: `/api/admin/holiday-calendars/account-assignments/${a.id}`,
        }));
  const loading = view === "people" ? usersLoading || assignLoading : accountsLoading || accountAssignLoading;

  return (
    <Card data-testid="holiday-assignments-card">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-2xl">
          <UserRound className="h-5 w-5 text-primary" />
          {t(view === "people" ? "configuration.holidays.assignmentsTitle" : "configuration.holidays.accountsTitle")}
        </CardTitle>
        <CardDescription className="pt-1.5">
          {view === "people"
            ? t("configuration.holidays.assignmentsDescription", { max: MAX_USER_CALENDARS })
            : t("configuration.holidays.accountsDescription", { max: MAX_USER_CALENDARS })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-md border border-gray-200 p-0.5 dark:border-gray-700" role="group">
            {(["people", "accounts"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => {
                  setView(v);
                  setSearch("");
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded px-3 py-1 text-sm",
                  view === v
                    ? "bg-primary text-primary-foreground"
                    : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800",
                )}
                data-testid={`holiday-assignments-${v}`}
              >
                {v === "people" ? <UserRound className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
                {t(v === "people" ? "configuration.holidays.viewPeople" : "configuration.holidays.viewAccounts")}
              </button>
            ))}
          </div>
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t(view === "people" ? "configuration.holidays.searchPeople" : "configuration.holidays.searchAccounts")}
              aria-label={t(view === "people" ? "configuration.holidays.searchPeople" : "configuration.holidays.searchAccounts")}
              className="pl-8"
            />
          </div>
        </div>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label={t("configuration.holidays.loading")} />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t(view === "people" ? "configuration.holidays.noPeople" : "configuration.holidays.noAccounts")}
          </p>
        ) : (
          <>
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-700">
              {rows.slice(0, PAGE_SIZE).map((row) => (
                <AssignmentRow
                  key={`${view}-${row.id}`}
                  rowId={row.id}
                  title={row.title}
                  detail={row.detail}
                  url={row.url}
                  invalidateKey={view === "people" ? HOLIDAY_ASSIGNMENTS_KEY : HOLIDAY_ACCOUNT_ASSIGNMENTS_KEY}
                  emptyText={
                    view === "accounts"
                      ? t("configuration.holidays.accountUsesOwn")
                      : defaults.length
                        ? t("configuration.holidays.usesDefaults", { names: defaults.map((d) => d.name).join(", ") })
                        : t("configuration.holidays.noCalendar")
                  }
                  assigned={row.assigned}
                  calendars={calendars}
                />
              ))}
            </div>
            {rows.length > PAGE_SIZE && (
              <p className="text-xs text-muted-foreground">
                {t(view === "people" ? "configuration.holidays.morePeople" : "configuration.holidays.moreAccounts", {
                  shown: PAGE_SIZE,
                  total: rows.length,
                })}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AssignmentRow({
  rowId,
  title,
  detail,
  url,
  invalidateKey,
  emptyText,
  assigned,
  calendars,
}: {
  rowId: string;
  title: string;
  detail: string;
  url: string;
  invalidateKey: readonly string[];
  /** Shown under the name while no calendar is picked. */
  emptyText: string;
  assigned: number[];
  calendars: HolidayCalendarSummary[];
}) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<number[]>(assigned);
  const assignedKey = [...assigned].sort((a, b) => a - b).join(",");
  useEffect(() => setPicked(assignedKey ? assignedKey.split(",").map(Number) : []), [assignedKey]);
  const dirty = [...picked].sort((a, b) => a - b).join(",") !== assignedKey;

  const save = useMutation({
    mutationFn: () => apiRequest("PUT", url, { calendarIds: picked }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: invalidateKey });
      showSuccessToast(t("configuration.holidays.assignmentSavedTitle"), t("configuration.holidays.assignmentSavedBody", { name: title }));
    },
    onError: (error) => showErrorToast(t("configuration.holidays.errorTitle"), t(holidayErrorKey(error))),
  });

  const toggle = (id: number) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX_USER_CALENDARS ? prev : [...prev, id]));

  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2" data-testid={`holiday-assignment-${rowId}`}>
      <div className="min-w-[200px] flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</p>
        <p className="text-xs text-muted-foreground">{picked.length === 0 ? emptyText : detail}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {calendars.map((c) => {
          const on = picked.includes(c.id);
          const disabled = !on && picked.length >= MAX_USER_CALENDARS;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              disabled={disabled}
              aria-pressed={on}
              title={c.name}
              className={cn(
                "rounded-md border px-2 py-0.5 font-mono text-[11px] transition-colors",
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : disabled
                    ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-600"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700",
              )}
            >
              {c.code}
            </button>
          );
        })}
        <span className="text-[11px] text-muted-foreground">
          {picked.length}/{MAX_USER_CALENDARS}
        </span>
      </div>
      <Button size="sm" variant={dirty ? "default" : "outline"} onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
        {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        {t("configuration.holidays.save")}
      </Button>
    </div>
  );
}
