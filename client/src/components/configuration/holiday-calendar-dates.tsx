import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarPlus, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast } from "@/lib/toast-helper";
import type { HolidayDate } from "@shared/holiday-calendars";
import { formatHolidayDate, holidayDatesKey, holidayErrorKey, invalidateHolidayCalendars } from "./holiday-calendar-api";

// The days in one holiday calendar, by year, with add and remove. Opens
// under a calendar's row on Admin › System Settings › Calendar.
export function HolidayCalendarDates({ calendarId }: { calendarId: number }) {
  const { t, i18n } = useTranslation();
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");
  const thisYear = String(new Date().getFullYear());
  const [year, setYear] = useState<string | null>(null);

  const { data: dates = [], isLoading } = useQuery<HolidayDate[]>({ queryKey: holidayDatesKey(calendarId) });

  const years = useMemo(() => {
    const set = new Set(dates.map((d) => d.date.slice(0, 4)));
    return [...set].sort();
  }, [dates]);
  const shownYear = year ?? (years.includes(thisYear) ? thisYear : (years[years.length - 1] ?? thisYear));
  const shown = dates.filter((d) => d.date.startsWith(`${shownYear}-`));

  const addDate = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/holiday-calendars/${calendarId}/dates`, { date: newDate, name: newName.trim() }),
    onSuccess: () => {
      setYear(newDate.slice(0, 4));
      setNewDate("");
      setNewName("");
      invalidateHolidayCalendars(calendarId);
    },
    onError: (error) => showErrorToast(t("configuration.holidays.errorTitle"), t(holidayErrorKey(error))),
  });

  const removeDate = useMutation({
    mutationFn: (dateId: number) => apiRequest("DELETE", `/api/admin/holiday-calendars/${calendarId}/dates/${dateId}`),
    onSuccess: () => invalidateHolidayCalendars(calendarId),
    onError: (error) => showErrorToast(t("configuration.holidays.errorTitle"), t(holidayErrorKey(error))),
  });

  return (
    <div className="space-y-3 border-t border-gray-100 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-900/40">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">{t("configuration.holidays.dateLabel")}</Label>
          <DatePickerInput
            value={newDate}
            onChange={setNewDate}
            placeholder={t("configuration.holidays.datePlaceholder")}
            className="h-8 w-44"
          />
        </div>
        <div className="min-w-[180px] flex-1 space-y-1">
          <Label htmlFor={`holiday-name-${calendarId}`} className="text-xs">
            {t("configuration.holidays.nameLabel")}
          </Label>
          <Input
            id={`holiday-name-${calendarId}`}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("configuration.holidays.namePlaceholder")}
            maxLength={200}
            className="h-8"
            data-testid={`holiday-date-name-${calendarId}`}
          />
        </div>
        <Button
          size="sm"
          onClick={() => addDate.mutate()}
          disabled={!newDate || !newName.trim() || addDate.isPending}
          data-testid={`holiday-date-add-${calendarId}`}
        >
          {addDate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          {t("configuration.holidays.addDate")}
        </Button>
        {years.length > 1 && (
          <div className="ml-auto flex flex-col gap-1">
            <Label className="text-xs">{t("configuration.holidays.yearLabel")}</Label>
            <Select value={shownYear} onValueChange={setYear}>
              <SelectTrigger className="h-8 w-28" aria-label={t("configuration.holidays.yearLabel")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label={t("configuration.holidays.loading")} />
      ) : shown.length === 0 ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarPlus className="h-3.5 w-3.5" />
          {t("configuration.holidays.noDates", { year: shownYear })}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-x-4 gap-y-0.5 text-sm md:grid-cols-2">
          {shown.map((d) => (
            <li
              key={d.id}
              className="flex items-center gap-3 rounded px-2 py-1 hover:bg-white dark:hover:bg-gray-800"
              data-testid={`holiday-date-${d.id}`}
            >
              <span className="w-32 shrink-0 text-xs tabular-nums text-muted-foreground">
                {formatHolidayDate(d.date, i18n.language, true)}
              </span>
              <span className="flex-1 truncate text-gray-800 dark:text-gray-200">{d.name}</span>
              <button
                type="button"
                onClick={() => removeDate.mutate(d.id)}
                disabled={removeDate.isPending}
                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                aria-label={t("configuration.holidays.removeDate", { name: d.name })}
                title={t("configuration.holidays.removeDate", { name: d.name })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
