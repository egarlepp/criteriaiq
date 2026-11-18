import { useTranslation } from "react-i18next";
import { CalendarClock } from "lucide-react";
import { ProfileCalendarsSection } from "./profile-calendars-section";
import { WorkScheduleEditor } from "./work-schedule-editor";

// Profile Settings › Calendar: the person's work week and time off, which
// they edit, and the holiday calendars that apply to them, which admins set.
// MAP dates count all three. See docs/features/working-calendar.md.
export function ProfileCalendarTab() {
  const { t } = useTranslation();
  return (
    <div data-testid="profile-calendar-tab">
      <h3 className="mb-1 flex items-center gap-2 text-lg font-medium">
        <CalendarClock className="h-5 w-5" />
        {t("profile.workSchedule.heading")}
      </h3>
      <p className="mb-4 text-sm text-muted-foreground">{t("profile.workSchedule.description")}</p>
      <WorkScheduleEditor />
      <ProfileCalendarsSection />
    </div>
  );
}
