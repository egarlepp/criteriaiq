import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertCircle, CalendarDays, Info, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatHolidayDate } from "@/components/configuration/holiday-calendar-api";
import type { MyHolidayCalendars } from "@shared/holiday-calendars";

export const MY_HOLIDAY_CALENDARS_KEY = ["/api/holiday-calendars/me"] as const;

// Profile Settings › Profile: the holiday calendars that apply to the
// signed-in user (their own, else the organization defaults), with each
// calendar's next few holidays. Read-only: admins assign calendars at
// Admin › System Settings › Calendar.
export function ProfileCalendarsSection() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = useQuery<MyHolidayCalendars>({ queryKey: MY_HOLIDAY_CALENDARS_KEY });

  return (
    <div className="border-t pt-6 mt-6" data-testid="profile-calendars">
      <h3 className="text-lg font-medium mb-1 flex items-center gap-2">
        <CalendarDays className="h-5 w-5" />
        {t("profile.profile.calendars.heading")}
      </h3>
      <p className="mb-4 text-sm text-muted-foreground">{t("profile.profile.calendars.description")}</p>

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label={t("profile.profile.calendars.loading")} />
      ) : isError || !data ? (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t("profile.profile.calendars.loadFailed")}</span>
        </div>
      ) : data.source === "none" ? (
        <div
          className="flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300"
          data-testid="profile-calendars-none"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span>{t("profile.profile.calendars.none")}</span>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="flex items-start gap-2 text-xs text-muted-foreground" data-testid="profile-calendars-source">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {data.source === "user"
              ? t("profile.profile.calendars.sourceUser")
              : data.source === "account"
                ? t("profile.profile.calendars.sourceAccount")
                : t("profile.profile.calendars.sourceDefault")}
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {data.calendars.map((cal) => (
              <div
                key={cal.id}
                className="rounded-lg border bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900"
                data-testid={`profile-calendar-${cal.id}`}
              >
                <div className="mb-3 flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                  <span className="truncate font-medium text-gray-900 dark:text-gray-100" title={cal.name}>
                    {cal.name}
                  </span>
                  {cal.isCountry ? (
                    <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                      {cal.code}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {t("configuration.holidays.customBadge")}
                    </Badge>
                  )}
                </div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {t("profile.profile.calendars.upcoming")}
                </div>
                {cal.upcoming.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("profile.profile.calendars.noUpcoming")}</p>
                ) : (
                  <ul className="space-y-1">
                    {cal.upcoming.map((h) => (
                      <li key={h.date} className="flex justify-between gap-2 text-sm">
                        <span className="truncate text-gray-800 dark:text-gray-200" title={h.name}>
                          {h.name}
                        </span>
                        <span className="shrink-0 text-gray-500 dark:text-gray-400">
                          {formatHolidayDate(h.date, i18n.language, true)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
