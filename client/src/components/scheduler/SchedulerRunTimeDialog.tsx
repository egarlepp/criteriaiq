/**
 * Configuration › Scheduler › "Change run time" dialog for jobs that run
 * once a day at a clock time (e.g. the nightly Salesforce link check).
 * The time is read in the chosen timezone; "Server time" keeps it on the
 * server's own clock.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";
import { Loader2, Save, X } from "lucide-react";
import { fromTimeInputValue, toTimeInputValue, type JobConfigBody, type SchedulerJob } from "./scheduler-utils";

const SERVER_TZ = "__server__";

interface SchedulerRunTimeDialogProps {
  job: SchedulerJob | null;
  serverTimezone: string;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (job: SchedulerJob, body: JobConfigBody) => void;
}

export function SchedulerRunTimeDialog({ job, serverTimezone, saving, onOpenChange, onSave }: SchedulerRunTimeDialogProps) {
  const { t } = useTranslation();
  const [time, setTime] = useState("03:00");
  const [timezone, setTimezone] = useState(SERVER_TZ);

  useEffect(() => {
    if (!job?.dailyAt) return;
    setTime(toTimeInputValue(job.dailyAt));
    setTimezone(job.timezone && job.timezone !== serverTimezone ? job.timezone : SERVER_TZ);
  }, [job, serverTimezone]);

  const options = useMemo(() => {
    const list = TIMEZONE_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey, { defaultValue: o.label }) }));
    // A timezone saved earlier (or set by another admin) that isn't in the short list.
    if (job?.timezone && job.timezone !== serverTimezone && !list.some((o) => o.value === job.timezone)) {
      list.push({ value: job.timezone, label: job.timezone });
    }
    return list.filter((o) => o.value !== serverTimezone);
  }, [job, serverTimezone, t]);

  const parsed = fromTimeInputValue(time);
  const name = job ? t(`scheduler.jobNames.${job.key}.name`, { defaultValue: job.key }) : "";

  const save = () => {
    if (!job || !parsed) return;
    onSave(job, { dailyAt: parsed, timezone: timezone === SERVER_TZ ? null : timezone });
  };

  return (
    <Dialog open={job !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("scheduler.runTime.title", { name })}</DialogTitle>
          <DialogDescription>{t("scheduler.runTime.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="scheduler-run-time">{t("scheduler.runTime.timeLabel")}</Label>
            <Input
              id="scheduler-run-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              aria-invalid={!parsed}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="scheduler-run-timezone">{t("scheduler.runTime.timezoneLabel")}</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger id="scheduler-run-timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SERVER_TZ}>{t("scheduler.runTime.serverTimezone", { timezone: serverTimezone })}</SelectItem>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            <X className="mr-2 h-4 w-4" />
            {t("common.cancel")}
          </Button>
          <Button onClick={save} disabled={!parsed || saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
