import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CalendarHeart,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  Star,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { cn } from "@/lib/utils";
import {
  MAX_DEFAULT_CALENDARS,
  type HolidayCalendarSummary,
  type HolidayRefreshResult,
} from "@shared/holiday-calendars";
import { HOLIDAY_CALENDARS_KEY, formatHolidayDate, holidayErrorKey, invalidateHolidayCalendars } from "./holiday-calendar-api";
import { HolidayCalendarDates } from "./holiday-calendar-dates";
import { HolidayCalendarAddDialog, type AddCalendarMode } from "./holiday-calendar-add-dialog";
import { HolidayCalendarAssignments } from "./holiday-calendar-assignments";

// Admin › System Settings › Calendar › Holiday Calendars, ported from
// ImpactIQ's Admin › Calendars: download a country's public holidays, keep
// custom lists of company closures, choose the organization defaults, and
// give users their own calendars. See docs/features/holiday-calendars.md.
export function HolidayCalendarsSection() {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [addMode, setAddMode] = useState<AddCalendarMode | null>(null);
  const [toDelete, setToDelete] = useState<HolidayCalendarSummary | null>(null);

  const { data: calendars = [], isLoading } = useQuery<HolidayCalendarSummary[]>({ queryKey: HOLIDAY_CALENDARS_KEY });
  const defaultCount = calendars.filter((c) => c.isDefault).length;
  const hasCountry = calendars.some((c) => c.isCountry);

  const refreshAll = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/holiday-calendars/refresh", {}) as Promise<HolidayRefreshResult[]>,
    onSuccess: (results) => {
      invalidateHolidayCalendars();
      const failed = results.filter((r) => r.error).length;
      if (failed > 0) {
        showErrorToast(
          t("configuration.holidays.errorTitle"),
          t("configuration.holidays.refreshPartial", { ok: results.length - failed, failed }),
        );
      } else {
        showSuccessToast(t("configuration.holidays.refreshedTitle"), t("configuration.holidays.refreshedAll", { count: results.length }));
      }
    },
    onError: (error) => showErrorToast(t("configuration.holidays.errorTitle"), t(holidayErrorKey(error))),
  });

  const refreshOne = useMutation({
    mutationFn: (cal: HolidayCalendarSummary) =>
      apiRequest("POST", `/api/admin/holiday-calendars/${cal.id}/refresh`, {}) as Promise<HolidayRefreshResult>,
    onSuccess: (result, cal) => {
      invalidateHolidayCalendars(cal.id);
      showSuccessToast(t("configuration.holidays.refreshedTitle"), t("configuration.holidays.refreshedOne", { name: cal.name, count: result.added }));
    },
    onError: (error) => showErrorToast(t("configuration.holidays.errorTitle"), t(holidayErrorKey(error))),
  });

  const toggleDefault = useMutation({
    mutationFn: (cal: HolidayCalendarSummary) =>
      apiRequest("PATCH", `/api/admin/holiday-calendars/${cal.id}`, { isDefault: !cal.isDefault }),
    onSuccess: () => invalidateHolidayCalendars(),
    onError: (error) => showErrorToast(t("configuration.holidays.errorTitle"), t(holidayErrorKey(error), { max: MAX_DEFAULT_CALENDARS })),
  });

  const remove = useMutation({
    mutationFn: (cal: HolidayCalendarSummary) => apiRequest("DELETE", `/api/admin/holiday-calendars/${cal.id}`),
    onSuccess: (_res, cal) => {
      if (expanded === cal.id) setExpanded(null);
      invalidateHolidayCalendars();
      showSuccessToast(t("configuration.holidays.deletedTitle"), t("configuration.holidays.deletedBody", { name: cal.name }));
    },
    onError: (error) => showErrorToast(t("configuration.holidays.errorTitle"), t(holidayErrorKey(error))),
  });

  return (
    <div className="space-y-4">
      <Card data-testid="holiday-calendars-card">
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <CalendarHeart className="h-5 w-5 text-primary" />
                {t("configuration.holidays.title")}
              </CardTitle>
              <CardDescription className="pt-1.5">{t("configuration.holidays.description")}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {hasCountry && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refreshAll.mutate()}
                  disabled={refreshAll.isPending}
                  title={t("configuration.holidays.refreshAllHint")}
                  data-testid="holiday-refresh-all"
                >
                  {refreshAll.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  {t("configuration.holidays.refreshAll")}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setAddMode("custom")} data-testid="holiday-add-custom">
                <Plus className="mr-2 h-4 w-4" />
                {t("configuration.holidays.addCustom")}
              </Button>
              <Button size="sm" onClick={() => setAddMode("country")} data-testid="holiday-add-country">
                <Download className="mr-2 h-4 w-4" />
                {t("configuration.holidays.downloadButton")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {t("configuration.holidays.defaultsHint", { count: defaultCount, max: MAX_DEFAULT_CALENDARS })}
          </p>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label={t("configuration.holidays.loading")} />
          ) : calendars.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-muted-foreground dark:border-gray-700">
              {t("configuration.holidays.empty")}
            </div>
          ) : (
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-700">
              {calendars.map((cal) => {
                const open = expanded === cal.id;
                const atMax = !cal.isDefault && defaultCount >= MAX_DEFAULT_CALENDARS;
                return (
                  <Fragment key={cal.id}>
                    <div className="flex flex-wrap items-center gap-3 px-3 py-2.5" data-testid={`holiday-calendar-${cal.code}`}>
                      <button
                        type="button"
                        onClick={() => setExpanded(open ? null : cal.id)}
                        className="flex min-w-0 flex-1 basis-56 items-center gap-2 text-left"
                        aria-expanded={open}
                      >
                        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" /> : <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" />}
                        <span className="truncate font-medium text-gray-900 dark:text-gray-100" title={cal.name}>{cal.name}</span>
                        {/* A custom calendar's code is long and only matters on people's chips below. */}
                        {cal.isCountry ? (
                          <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                            {cal.code}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="shrink-0 text-[10px]" title={cal.code}>
                            {t("configuration.holidays.customBadge")}
                          </Badge>
                        )}
                      </button>
                      <div className="flex flex-col text-xs text-muted-foreground sm:w-64">
                        <span>{t("configuration.holidays.dateCount", { count: cal.dateCount })}</span>
                        {cal.nextHoliday && (
                          <span className="truncate">
                            {t("configuration.holidays.nextHoliday", {
                              date: formatHolidayDate(cal.nextHoliday.date, i18n.language),
                              name: cal.nextHoliday.name,
                            })}
                          </span>
                        )}
                        {cal.isCountry && cal.lastRefreshedAt && (
                          <span>
                            {t("configuration.holidays.lastRefreshed", {
                              date: new Date(cal.lastRefreshedAt).toLocaleDateString(i18n.language, { year: "numeric", month: "short", day: "numeric" }),
                            })}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-end gap-1 sm:w-52">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleDefault.mutate(cal)}
                          disabled={toggleDefault.isPending || atMax}
                          title={atMax ? t("configuration.holidays.errors.too_many_defaults", { max: MAX_DEFAULT_CALENDARS }) : t("configuration.holidays.defaultHint")}
                          className={cn(
                            "h-8 px-2 text-xs",
                            cal.isDefault && "text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300",
                          )}
                          aria-pressed={cal.isDefault}
                          data-testid={`holiday-default-${cal.code}`}
                        >
                          <Star className={cn("mr-1 h-3.5 w-3.5", cal.isDefault && "fill-current")} />
                          {cal.isDefault ? t("configuration.holidays.defaultOn") : t("configuration.holidays.defaultOff")}
                        </Button>
                        {cal.isCountry && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => refreshOne.mutate(cal)}
                            disabled={refreshOne.isPending}
                            title={t("configuration.holidays.refreshOne")}
                            aria-label={t("configuration.holidays.refreshOne")}
                          >
                            {refreshOne.isPending && refreshOne.variables?.id === cal.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-gray-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                          onClick={() => setToDelete(cal)}
                          title={t("configuration.holidays.delete")}
                          aria-label={t("configuration.holidays.delete")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {open && <HolidayCalendarDates calendarId={cal.id} />}
                  </Fragment>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {calendars.length > 0 && <HolidayCalendarAssignments calendars={calendars} />}

      <HolidayCalendarAddDialog
        mode={addMode}
        existingCodes={calendars.map((c) => c.code)}
        onOpenChange={(o) => {
          if (!o) setAddMode(null);
        }}
      />
      <ConfirmationDialog
        open={toDelete !== null}
        onOpenChange={(o) => {
          if (!o) setToDelete(null);
        }}
        title={t("configuration.holidays.deleteTitle", { name: toDelete?.name ?? "" })}
        description={t("configuration.holidays.deleteDescription")}
        confirmLabel={t("configuration.holidays.delete")}
        cancelLabel={t("configuration.holidays.cancel")}
        variant="destructive"
        onConfirm={() => {
          if (toDelete) remove.mutate(toDelete);
          setToDelete(null);
        }}
      />
    </div>
  );
}
