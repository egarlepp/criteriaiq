// The four delivery counts at the top of the Reports page, for this month.
import { useTranslation } from "react-i18next";
import { CalendarClock, CalendarCheck2, MailCheck, MailWarning } from "lucide-react";
import { MetricCard } from "@/components/shared/MetricCard";
import { REPORT_SCHEDULE_FREQUENCIES } from "@shared/report-schedule-calendar";
import type { ReportKpis } from "./reports-library-utils";

export function ReportsKpiCards({ kpis, loading }: { kpis: ReportKpis; loading: boolean }) {
  const { t, i18n } = useTranslation();
  const dayFormat = new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric" });
  const nextDayFormat = new Intl.DateTimeFormat(i18n.language, { weekday: "short", day: "numeric" });
  const timeFormat = new Intl.DateTimeFormat(i18n.language, { hour: "numeric", minute: "2-digit" });

  const frequencySummary = REPORT_SCHEDULE_FREQUENCIES.filter((f) => (kpis.byFrequency[f] ?? 0) > 0)
    .map((f) => t("analytics.reports.kpis.frequencyCount", {
      count: kpis.byFrequency[f],
      frequency: t(`analytics.calendar.frequency.${f}`).toLowerCase(),
    }))
    .join(", ");

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4" data-testid="reports-kpis">
      <MetricCard
        title={t("analytics.reports.kpis.scheduled")}
        value={kpis.activeSchedules}
        sub={frequencySummary || t("analytics.reports.kpis.scheduledNone")}
        icon={<CalendarClock className="h-4 w-4" />}
        color="blue"
        loading={loading}
      />
      <MetricCard
        title={t("analytics.reports.kpis.sent")}
        value={kpis.sentThisMonth}
        sub={t("analytics.reports.kpis.sentSub", { count: kpis.sentToPeople })}
        icon={<MailCheck className="h-4 w-4" />}
        color="green"
        loading={loading}
      />
      <MetricCard
        title={t("analytics.reports.kpis.failed")}
        value={kpis.failedThisMonth}
        sub={
          kpis.lastFailure
            ? t("analytics.reports.kpis.failedSub", {
                name: kpis.lastFailure.reportName || t("analytics.calendar.untitledReport"),
                date: dayFormat.format(new Date(kpis.lastFailure.at)),
              })
            : t("analytics.reports.kpis.failedNone")
        }
        icon={<MailWarning className="h-4 w-4" />}
        color={kpis.failedThisMonth > 0 ? "rose" : "green"}
        loading={loading}
      />
      <MetricCard
        title={t("analytics.reports.kpis.nextSend")}
        value={kpis.nextSend ? nextDayFormat.format(new Date(kpis.nextSend.at)) : t("analytics.reports.kpis.nextSendNoneValue")}
        sub={
          kpis.nextSend
            ? t("analytics.reports.kpis.nextSendSub", {
                name: kpis.nextSend.reportName || t("analytics.calendar.untitledReport"),
                time: timeFormat.format(new Date(kpis.nextSend.at)),
              })
            : t("analytics.reports.kpis.nextSendNone")
        }
        icon={<CalendarCheck2 className="h-4 w-4" />}
        color="purple"
        loading={loading}
      />
    </div>
  );
}
