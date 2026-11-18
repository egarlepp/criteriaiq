/**
 * Configuration › Scheduler › Send Email Window. App-wide limits on
 * automated email: quiet hours (off by default; scheduled digests only, or
 * all automated email) and a max number of emails per hour. Sign-in emails
 * are never held. Enforced in server/email/send-window.ts.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";
import { Loader2, Mail, RotateCcw, Save } from "lucide-react";
import {
  SEND_WINDOW_KEY,
  formatHour,
  parseMaxEmailsPerHour,
  sendWindowPatch,
  type QuietHoursScope,
  type SendWindowSettings,
  type SendWindowState,
} from "./send-window-utils";

const SERVER_TZ = "__server__";
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const SCOPES: QuietHoursScope[] = ["digests", "all"];

function toSettings(state: SendWindowState): SendWindowSettings {
  const { quietHoursEnabled, quietHoursStart, quietHoursEnd, quietHoursScope, timezone, maxEmailsPerHour } = state;
  return { quietHoursEnabled, quietHoursStart, quietHoursEnd, quietHoursScope, timezone, maxEmailsPerHour };
}

export function SendWindowCard({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<SendWindowState>({
    queryKey: SEND_WINDOW_KEY,
    queryFn: () => apiRequest("GET", "/api/scheduler/send-window"),
    refetchInterval: 60_000,
  });

  const [draft, setDraft] = useState<SendWindowSettings | null>(null);
  const [maxInput, setMaxInput] = useState("");

  // Reset the form whenever fresh settings arrive (first load, after a save).
  const saved = useMemo(() => (data ? toSettings(data) : null), [data]);
  useEffect(() => {
    if (!saved) return;
    setDraft(saved);
    setMaxInput(String(saved.maxEmailsPerHour));
  }, [saved]);

  const serverTimezone = data?.serverTimezone ?? "UTC";
  const timezoneOptions = useMemo(() => {
    const list = TIMEZONE_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey, { defaultValue: o.label }) }));
    const current = draft?.timezone;
    if (current && current !== serverTimezone && !list.some((o) => o.value === current)) {
      list.push({ value: current, label: current });
    }
    return list.filter((o) => o.value !== serverTimezone);
  }, [draft?.timezone, serverTimezone, t]);

  const saveMutation = useMutation({
    mutationFn: (patch: Partial<SendWindowSettings>): Promise<SendWindowState> =>
      apiRequest("PUT", "/api/scheduler/send-window", patch),
    onSuccess: (result) => {
      queryClient.setQueryData(SEND_WINDOW_KEY, { ...result, serverTimezone });
      showSuccessToast(t("scheduler.sendWindow.toasts.saved"));
    },
    onError: (error: Error) => showErrorToast(t("scheduler.sendWindow.toasts.saveFailed"), error.message),
  });

  if (isLoading || !draft || !saved) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          {t("scheduler.loading")}
        </CardContent>
      </Card>
    );
  }

  const parsedMax = parseMaxEmailsPerHour(maxInput);
  const current: SendWindowSettings = { ...draft, maxEmailsPerHour: parsedMax ?? draft.maxEmailsPerHour };
  const patch = sendWindowPatch(saved, current);
  const dirty = Object.keys(patch).length > 0;
  const sameHours = draft.quietHoursStart === draft.quietHoursEnd;
  const disabled = !canEdit || saveMutation.isPending;
  const update = (change: Partial<SendWindowSettings>) => setDraft({ ...draft, ...change });
  const timezoneLabel = draft.timezone || serverTimezone;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          {t("scheduler.sendWindow.title")}
        </CardTitle>
        <CardDescription>{t("scheduler.sendWindow.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="send-window-quiet" className="text-sm font-medium">
                {t("scheduler.sendWindow.quietHours")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {draft.quietHoursEnabled
                  ? t("scheduler.sendWindow.quietHoursOn", {
                      start: formatHour(draft.quietHoursStart),
                      end: formatHour(draft.quietHoursEnd),
                      timezone: timezoneLabel,
                    })
                  : t("scheduler.sendWindow.quietHoursOff")}
              </p>
            </div>
            <Switch
              id="send-window-quiet"
              checked={draft.quietHoursEnabled}
              onCheckedChange={(checked) => update({ quietHoursEnabled: checked })}
              disabled={disabled}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="send-window-start">{t("scheduler.sendWindow.start")}</Label>
              <Select
                value={String(draft.quietHoursStart)}
                onValueChange={(v) => update({ quietHoursStart: Number(v) })}
                disabled={disabled}
              >
                <SelectTrigger id="send-window-start">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map((hour) => (
                    <SelectItem key={hour} value={String(hour)}>
                      {formatHour(hour)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="send-window-end">{t("scheduler.sendWindow.end")}</Label>
              <Select
                value={String(draft.quietHoursEnd)}
                onValueChange={(v) => update({ quietHoursEnd: Number(v) })}
                disabled={disabled}
              >
                <SelectTrigger id="send-window-end">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map((hour) => (
                    <SelectItem key={hour} value={String(hour)}>
                      {formatHour(hour)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="send-window-timezone">{t("scheduler.sendWindow.timezone")}</Label>
              <Select
                value={draft.timezone && draft.timezone !== serverTimezone ? draft.timezone : SERVER_TZ}
                onValueChange={(v) => update({ timezone: v === SERVER_TZ ? null : v })}
                disabled={disabled}
              >
                <SelectTrigger id="send-window-timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SERVER_TZ}>{t("scheduler.runTime.serverTimezone", { timezone: serverTimezone })}</SelectItem>
                  {timezoneOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {sameHours && (
            <p className="text-xs text-amber-600 dark:text-amber-400">{t("scheduler.sendWindow.sameHours")}</p>
          )}

          <div className="space-y-2">
            <Label>{t("scheduler.sendWindow.scope")}</Label>
            <RadioGroup
              value={draft.quietHoursScope}
              onValueChange={(v) => update({ quietHoursScope: v as QuietHoursScope })}
              disabled={disabled}
              className="grid grid-cols-1 gap-2 md:grid-cols-2"
              aria-label={t("scheduler.sendWindow.scope")}
            >
              {SCOPES.map((scope) => (
                <div
                  key={scope}
                  className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                    draft.quietHoursScope === scope
                      ? "border-primary bg-primary/5 dark:bg-primary/10"
                      : "border-gray-200 dark:border-gray-700"
                  }`}
                >
                  <RadioGroupItem value={scope} id={`send-window-scope-${scope}`} className="mt-0.5" />
                  <Label htmlFor={`send-window-scope-${scope}`} className="cursor-pointer space-y-0.5">
                    <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                      {t(`scheduler.sendWindow.scopes.${scope}.label`)}
                    </span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      {t(`scheduler.sendWindow.scopes.${scope}.hint`)}
                    </span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
            <p className="text-xs text-muted-foreground">{t("scheduler.sendWindow.scheduleOverride")}</p>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <Label htmlFor="send-window-max" className="text-sm font-medium">
            {t("scheduler.sendWindow.maxPerHour")}
          </Label>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              id="send-window-max"
              inputMode="numeric"
              className="w-40"
              value={maxInput}
              onChange={(e) => setMaxInput(e.target.value)}
              aria-invalid={parsedMax === null}
              disabled={disabled}
            />
            <span className="text-sm text-muted-foreground">
              {current.maxEmailsPerHour === 0
                ? t("scheduler.sendWindow.sentThisHourNoLimit", { count: data?.sentThisHour ?? 0 })
                : t("scheduler.sendWindow.sentThisHour", { count: data?.sentThisHour ?? 0, max: current.maxEmailsPerHour })}
            </span>
          </div>
          {parsedMax === null ? (
            <p className="text-xs text-red-600 dark:text-red-400">{t("scheduler.sendWindow.maxInvalid")}</p>
          ) : (
            <p className="text-xs text-muted-foreground">{t("scheduler.sendWindow.maxHint")}</p>
          )}
        </div>

        <p className="text-xs text-muted-foreground">{t("scheduler.sendWindow.exempt")}</p>

        {canEdit && (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={!dirty || saveMutation.isPending}
              onClick={() => {
                setDraft(saved);
                setMaxInput(String(saved.maxEmailsPerHour));
              }}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              {t("scheduler.sendWindow.discard")}
            </Button>
            <Button disabled={!dirty || parsedMax === null || saveMutation.isPending} onClick={() => saveMutation.mutate(patch)}>
              {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {t("common.save")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
