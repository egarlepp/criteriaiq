// A person's work week and time off. Used on Profile Settings › Calendar
// (their own) and in the user dialog of Admin › User Management (anyone's,
// for people who can edit users). MAP scheduling counts days outside the
// work week and days off like holidays. See docs/features/working-calendar.md.
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertCircle, CalendarOff, CalendarRange, Loader2, Plus, RotateCcw, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { DangerIconButton } from "@/components/shared/danger-icon-button";
import { apiRequest, isApiError, queryClient } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { formatHolidayDate } from "@/components/configuration/holiday-calendar-api";
import { useMyOutlookConnection } from "@/hooks/use-my-outlook-connection";
import type { TimeOffEntry, WorkScheduleView } from "@shared/work-schedule";

/** Monday first, as most calendars show it. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Query key for a person's schedule; no id = the signed-in person. */
export function workScheduleKey(userId?: string) {
  return [userId ? `/api/users/${userId}/work-schedule` : "/api/work-schedule/me"] as const;
}

/** Short weekday name in the viewer's language. 2026-01-04 was a Sunday. */
function weekdayName(day: number, language: string): string {
  return new Date(Date.UTC(2026, 0, 4 + day)).toLocaleDateString(language, { weekday: "short", timeZone: "UTC" });
}

const KNOWN_ERRORS = new Set(["end_before_start", "too_long", "from_outlook", "forbidden"]);

function errorKey(error: unknown): string {
  const code =
    isApiError(error) && error.details && typeof error.details === "object"
      ? (error.details as { code?: unknown }).code
      : undefined;
  return typeof code === "string" && KNOWN_ERRORS.has(code)
    ? `profile.workSchedule.errors.${code}`
    : "profile.workSchedule.errors.generic";
}

function rangeLabel(entry: TimeOffEntry, language: string): string {
  const start = formatHolidayDate(entry.startDate, language, true);
  return entry.startDate === entry.endDate ? start : `${start} – ${formatHolidayDate(entry.endDate, language, true)}`;
}

interface WorkScheduleEditorProps {
  /** Someone else's schedule (User Management); leave out for the signed-in person. */
  userId?: string;
}

export function WorkScheduleEditor({ userId }: WorkScheduleEditorProps) {
  const { t, i18n } = useTranslation();
  const key = workScheduleKey(userId);
  const base = key[0];
  const { data, isLoading, isError } = useQuery<WorkScheduleView>({ queryKey: key });
  // Only on the person's own Profile: whether their Outlook out-of-office days come in.
  const { data: outlook } = useMyOutlookConnection(!userId);

  const [draftDays, setDraftDays] = useState<number[] | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");
  const [pendingDelete, setPendingDelete] = useState<TimeOffEntry | null>(null);

  const onSaved = (view: WorkScheduleView) => {
    queryClient.setQueryData(key, view);
  };
  const onError = (error: unknown) => showErrorToast(t("profile.workSchedule.errorTitle"), t(errorKey(error)));

  const saveDays = useMutation({
    mutationFn: (workDays: number[]) => apiRequest("PUT", base, { workDays }) as Promise<WorkScheduleView>,
    onSuccess: (view) => {
      onSaved(view);
      setDraftDays(null);
      showSuccessToast(t("profile.workSchedule.workWeekSaved"));
    },
    onError,
  });
  const resetDays = useMutation({
    mutationFn: () => apiRequest("DELETE", base) as Promise<WorkScheduleView>,
    onSuccess: (view) => {
      onSaved(view);
      setDraftDays(null);
      showSuccessToast(t("profile.workSchedule.workWeekReset"));
    },
    onError,
  });
  const addTimeOff = useMutation({
    mutationFn: () =>
      apiRequest("POST", `${base}/time-off`, {
        startDate,
        endDate: endDate || startDate,
        ...(note.trim() ? { note: note.trim() } : {}),
      }) as Promise<WorkScheduleView>,
    onSuccess: (view) => {
      onSaved(view);
      setStartDate("");
      setEndDate("");
      setNote("");
      showSuccessToast(t("profile.workSchedule.timeOffAdded"));
    },
    onError,
  });
  const removeTimeOff = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `${base}/time-off/${id}`) as Promise<WorkScheduleView>,
    onSuccess: (view) => {
      onSaved(view);
      showSuccessToast(t("profile.workSchedule.timeOffRemoved"));
    },
    onError,
  });

  if (isLoading) {
    return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label={t("profile.workSchedule.loading")} />;
  }
  if (isError || !data) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{t("profile.workSchedule.loadFailed")}</span>
      </div>
    );
  }

  const days = draftDays ?? data.workDays;
  const dirty = draftDays !== null && draftDays.join(",") !== data.workDays.join(",");
  const toggle = (day: number) => {
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
    setDraftDays(next.sort((a, b) => a - b));
  };
  const rangeInvalid = !!startDate && !!endDate && endDate < startDate;

  return (
    <div className="space-y-6" data-testid="work-schedule-editor">
      <section>
        <div className="mb-1 flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <h4 className="font-medium text-gray-900 dark:text-gray-100">{t("profile.workSchedule.workWeekHeading")}</h4>
          {data.source === "outlook" && (
            <Badge variant="secondary" className="text-[10px]">
              {t("profile.workSchedule.fromOutlook")}
            </Badge>
          )}
        </div>
        <p className="mb-3 text-sm text-muted-foreground">{t("profile.workSchedule.workWeekHelp")}</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("profile.workSchedule.workWeekHeading")}>
          {WEEK_ORDER.map((day) => {
            const on = days.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(day)}
                className={
                  on
                    ? "min-w-14 rounded-md border border-blue-600 bg-blue-600 px-3 py-1.5 text-sm font-medium text-white dark:border-blue-500 dark:bg-blue-700"
                    : "min-w-14 rounded-md border border-gray-300 bg-background px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                }
                data-testid={`work-day-${day}`}
              >
                {weekdayName(day, i18n.language)}
              </button>
            );
          })}
        </div>
        {days.length === 0 && (
          <p className="mt-2 text-xs text-red-700 dark:text-red-300">{t("profile.workSchedule.pickOneDay")}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => saveDays.mutate(days)}
            disabled={!dirty || days.length === 0 || saveDays.isPending}
            data-testid="work-week-save"
          >
            {saveDays.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            {t("profile.workSchedule.saveWorkWeek")}
          </Button>
          {!data.isDefault && (
            <Button type="button" size="sm" variant="outline" onClick={() => resetDays.mutate()} disabled={resetDays.isPending}>
              <RotateCcw className="mr-1 h-4 w-4" />
              {t("profile.workSchedule.resetWorkWeek")}
            </Button>
          )}
        </div>
      </section>

      <section>
        <div className="mb-1 flex items-center gap-2">
          <CalendarOff className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <h4 className="font-medium text-gray-900 dark:text-gray-100">{t("profile.workSchedule.timeOffHeading")}</h4>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">{t("profile.workSchedule.timeOffHelp")}</p>
        {!userId && outlook?.connected && (
          <p className="mb-3 text-xs text-muted-foreground" data-testid="time-off-outlook-note">
            {t("profile.workSchedule.outlookNote")}
          </p>
        )}

        <div className="grid grid-cols-1 gap-3 rounded-lg border bg-gray-50 p-3 md:grid-cols-[10rem_10rem_1fr_auto] dark:border-gray-700 dark:bg-gray-900">
          <div>
            <Label htmlFor={`time-off-start-${userId ?? "me"}`} className="text-xs">
              {t("profile.workSchedule.startDate")}
            </Label>
            <Input
              id={`time-off-start-${userId ?? "me"}`}
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor={`time-off-end-${userId ?? "me"}`} className="text-xs">
              {t("profile.workSchedule.endDate")}
            </Label>
            <Input
              id={`time-off-end-${userId ?? "me"}`}
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor={`time-off-note-${userId ?? "me"}`} className="text-xs">
              {t("profile.workSchedule.note")}
            </Label>
            <Input
              id={`time-off-note-${userId ?? "me"}`}
              value={note}
              maxLength={200}
              placeholder={t("profile.workSchedule.notePlaceholder")}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              size="sm"
              onClick={() => addTimeOff.mutate()}
              disabled={!startDate || rangeInvalid || addTimeOff.isPending}
              data-testid="time-off-add"
            >
              {addTimeOff.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
              {t("profile.workSchedule.addTimeOff")}
            </Button>
          </div>
          {rangeInvalid && (
            <p className="text-xs text-red-700 md:col-span-4 dark:text-red-300">{t("profile.workSchedule.errors.end_before_start")}</p>
          )}
        </div>

        {data.timeOff.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground" data-testid="time-off-empty">
            {t("profile.workSchedule.noTimeOff")}
          </p>
        ) : (
          <ul className="mt-3 divide-y rounded-lg border dark:divide-gray-700 dark:border-gray-700" data-testid="time-off-list">
            {data.timeOff.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <CalendarOff className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
                <span className="font-medium text-gray-900 dark:text-gray-100">{rangeLabel(entry, i18n.language)}</span>
                {entry.note && <span className="truncate text-gray-600 dark:text-gray-400">{entry.note}</span>}
                {entry.source === "outlook" && (
                  <Badge variant="secondary" className="text-[10px]">
                    {t("profile.workSchedule.fromOutlook")}
                  </Badge>
                )}
                <div className="ml-auto">
                  {entry.source === "manual" ? (
                    <DangerIconButton
                      onClick={() => setPendingDelete(entry)}
                      aria-label={t("profile.workSchedule.removeTimeOff")}
                      title={t("profile.workSchedule.removeTimeOff")}
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">{t("profile.workSchedule.changeInOutlook")}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmationDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("profile.workSchedule.removeTitle")}
        description={pendingDelete ? t("profile.workSchedule.removeDescription", { dates: rangeLabel(pendingDelete, i18n.language) }) : ""}
        confirmLabel={t("profile.workSchedule.removeConfirm")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          if (pendingDelete) removeTimeOff.mutate(pendingDelete.id);
          setPendingDelete(null);
        }}
        variant="destructive"
      />
    </div>
  );
}
