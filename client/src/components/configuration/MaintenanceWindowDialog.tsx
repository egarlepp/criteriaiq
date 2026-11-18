import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CalendarX, Loader2, Save, SquarePen, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { MAINTENANCE_QUERY_KEY } from "@/components/layout/MaintenanceBanner";
import {
  MAINTENANCE_MAX_MINUTES,
  MAINTENANCE_MESSAGE_MAX,
  MAINTENANCE_MIN_MINUTES,
  maintenanceWindowSchema,
  type MaintenancePhase,
  type MaintenanceWindow,
} from "@shared/maintenance";

const ADMIN_KEY = ["/api/admin/maintenance"] as const;

interface Draft {
  startsAtLocal: string;
  durationMinutes: string;
  message: string;
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function emptyDraft(): Draft {
  return { startsAtLocal: "", durationMinutes: "30", message: "" };
}

/** The saved maintenance window, unless it has already ended. */
function useMaintenanceWindow() {
  const query = useQuery<{ window: MaintenanceWindow | null; phase: MaintenancePhase | null }>({
    queryKey: ADMIN_KEY,
    queryFn: async () => await apiRequest("GET", "/api/admin/maintenance"),
  });
  const current = query.data?.window && query.data.phase !== "ended" ? query.data.window : null;
  return { ...query, current, phase: query.data?.phase ?? null };
}

function useFormatWhen() {
  const { i18n } = useTranslation();
  return (iso: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

/**
 * Communications › System Announcements › Maintenance window strip: what is
 * scheduled (or running) with Edit, shown above the announcements list. Hidden
 * when nothing is scheduled; "New Maintenance Announcement" schedules one.
 */
export function MaintenanceWindowSummary({ onEdit }: { onEdit: () => void }) {
  const { t } = useTranslation();
  const { current, phase } = useMaintenanceWindow();
  const formatWhen = useFormatWhen();
  if (!current) return null;

  return (
    <div
      className="mb-4 flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
      data-testid="maintenance-summary"
    >
      <div className="flex items-start gap-2">
        <Wrench className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">{t("configuration.maintenance.title")}</p>
          <p className="text-xs">
            {t(phase === "active" ? "configuration.maintenance.currentActive" : "configuration.maintenance.currentUpcoming", {
              when: formatWhen(current.startsAt),
              minutes: current.durationMinutes,
            })}
            {current.message ? ` ${current.message}` : ""}
          </p>
        </div>
      </div>
      <Button size="sm" variant="outline" className="h-7 shrink-0 self-start text-xs sm:self-center" onClick={onEdit} data-testid="maintenance-edit">
        <SquarePen className="mr-1 h-3.5 w-3.5" />
        {t("configuration.maintenance.edit")}
      </Button>
    </div>
  );
}

/**
 * Communications › System Announcements › New Maintenance Announcement.
 * Announces a maintenance window: every signed-in user sees a countdown
 * banner until it starts and a "maintenance in progress" banner while it
 * runs. Saving it only shows the banner; the redeploy itself is still done
 * in Dokploy. One window at a time, so the same modal edits or cancels it.
 */
export function MaintenanceWindowDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const { data, isLoading, current, phase } = useMaintenanceWindow();
  const formatWhen = useFormatWhen();

  // Reload the form from the saved window each time the modal opens.
  useEffect(() => {
    if (!open || !data) return;
    setDraft(
      current
        ? {
            startsAtLocal: toLocalInput(current.startsAt),
            durationMinutes: String(current.durationMinutes),
            message: current.message ?? "",
          }
        : emptyDraft(),
    );
  }, [open, data, current]);

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ADMIN_KEY }),
      qc.invalidateQueries({ queryKey: MAINTENANCE_QUERY_KEY }),
    ]);

  const startsAt = draft.startsAtLocal ? new Date(draft.startsAtLocal) : null;
  const candidate = {
    startsAt: startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt.toISOString() : "",
    durationMinutes: Number(draft.durationMinutes),
    message: draft.message.trim() || null,
  };
  const valid = maintenanceWindowSchema.safeParse(candidate).success && !!startsAt && startsAt.getTime() > Date.now();

  const save = useMutation({
    mutationFn: async () => await apiRequest("PUT", "/api/admin/maintenance", candidate),
    onSuccess: async () => {
      showSuccessToast("configuration.maintenance.toasts.saved");
      onOpenChange(false);
      await refresh();
    },
    onError: () => showErrorToast("common.error", "configuration.maintenance.toasts.failed"),
  });

  const cancel = useMutation({
    mutationFn: async () => await apiRequest("DELETE", "/api/admin/maintenance"),
    onSuccess: async () => {
      setConfirmCancel(false);
      showSuccessToast("configuration.maintenance.toasts.cancelled");
      onOpenChange(false);
      await refresh();
    },
    onError: () => showErrorToast("common.error", "configuration.maintenance.toasts.failed"),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl" data-testid="maintenance-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-sky-700 dark:text-sky-400" />
              {t("configuration.maintenance.title")}
            </DialogTitle>
            <DialogDescription>{t("configuration.maintenance.subtitle")}</DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-gray-400 dark:text-gray-500" />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-gray-600 dark:text-gray-300" data-testid="maintenance-current">
                {current
                  ? t(phase === "active" ? "configuration.maintenance.currentActive" : "configuration.maintenance.currentUpcoming", {
                      when: formatWhen(current.startsAt),
                      minutes: current.durationMinutes,
                    })
                  : t("configuration.maintenance.none")}
              </p>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="maintenance-start" className="text-[11px]">
                    {t("configuration.maintenance.startLabel")}
                  </Label>
                  <Input
                    id="maintenance-start"
                    type="datetime-local"
                    value={draft.startsAtLocal}
                    onChange={(e) => setDraft({ ...draft, startsAtLocal: e.target.value })}
                    className="h-8 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="maintenance-duration" className="text-[11px]">
                    {t("configuration.maintenance.durationLabel")}
                  </Label>
                  <Input
                    id="maintenance-duration"
                    type="number"
                    min={MAINTENANCE_MIN_MINUTES}
                    max={MAINTENANCE_MAX_MINUTES}
                    value={draft.durationMinutes}
                    onChange={(e) => setDraft({ ...draft, durationMinutes: e.target.value })}
                    className="h-8 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  />
                </div>
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <Label htmlFor="maintenance-message" className="text-[11px]">
                    {t("configuration.maintenance.messageLabel")}
                  </Label>
                  <Textarea
                    id="maintenance-message"
                    value={draft.message}
                    maxLength={MAINTENANCE_MESSAGE_MAX}
                    rows={3}
                    placeholder={t("configuration.maintenance.messagePlaceholder")}
                    onChange={(e) => setDraft({ ...draft, message: e.target.value })}
                    className="text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  />
                </div>
              </div>

              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {t("configuration.maintenance.hint", { min: MAINTENANCE_MIN_MINUTES, max: MAINTENANCE_MAX_MINUTES })}
              </p>
            </div>
          )}

          <DialogFooter className="flex-wrap gap-2 sm:justify-between">
            <div>
              {current && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmCancel(true)}
                  disabled={cancel.isPending}
                  data-testid="maintenance-cancel"
                >
                  <CalendarX className="mr-1 h-3.5 w-3.5" />
                  {t("configuration.maintenance.cancel")}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.close")}
              </Button>
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !valid} data-testid="maintenance-save">
                {save.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
                {current ? t("configuration.maintenance.update") : t("configuration.maintenance.schedule")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={t("configuration.maintenance.cancelConfirmTitle")}
        description={t("configuration.maintenance.cancelConfirmDescription")}
        confirmLabel={t("configuration.maintenance.cancel")}
        cancelLabel={t("configuration.maintenance.keep")}
        variant="warning"
        onConfirm={() => cancel.mutate()}
      />
    </>
  );
}
