import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CalendarClock, Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { useAuth } from "@/hooks/useAuth";

interface ProjectSchedulingFields {
  id: number;
  primaryEngineerId: string | null;
  scheduleByTaskOwner?: boolean;
}

/**
 * MAP Timeline tab: how MAP dates are planned. Dates always count working
 * days (weekends and holidays skipped). With the switch on, a task's dates
 * follow its owner's holiday calendar; off, every date follows the project
 * owner's. Only the project owner (primary engineer) or an Admin can switch it.
 */
export function MapSchedulingCard({ projectId }: { projectId: number }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const projectKey = [`/api/projects/${projectId}`];
  const { data: project } = useQuery<ProjectSchedulingFields>({ queryKey: projectKey });

  const save = useMutation({
    mutationFn: (scheduleByTaskOwner: boolean) =>
      apiRequest("PATCH", `/api/projects/${projectId}/map-scheduling`, { scheduleByTaskOwner }),
    onSuccess: (_data, scheduleByTaskOwner) => {
      queryClient.setQueryData<ProjectSchedulingFields>(projectKey, (old) => (old ? { ...old, scheduleByTaskOwner } : old));
      void queryClient.invalidateQueries({ queryKey: projectKey });
      showSuccessToast("projects.form.mapDrawer.scheduling.savedTitle", "projects.form.mapDrawer.scheduling.savedDescription");
    },
    onError: () => showErrorToast("projects.form.mapDrawer.scheduling.errorTitle", "projects.form.mapDrawer.scheduling.saveFailed"),
  });

  if (!project) return null;
  const byTaskOwner = project.scheduleByTaskOwner !== false;
  const canChange = user?.role === "Admin" || (!!user?.id && user.id === project.primaryEngineerId);

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5 dark:border-gray-800 dark:bg-gray-900"
      data-testid="map-scheduling-card"
    >
      <CalendarClock className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
      <div className="min-w-0 flex-1">
        <Label htmlFor="map-schedule-by-task-owner" className="text-sm font-medium">
          <span className="font-semibold">{t("projects.form.mapDrawer.scheduling.title")}</span>
          <span className="mx-1.5 text-gray-400 dark:text-gray-500">·</span>
          {t("projects.form.mapDrawer.scheduling.byTaskOwnerLabel")}
        </Label>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t("projects.form.mapDrawer.scheduling.description")}{" "}
          {byTaskOwner ? t("projects.form.mapDrawer.scheduling.byTaskOwnerOn") : t("projects.form.mapDrawer.scheduling.byTaskOwnerOff")}
        </p>
        {!canChange && (
          <p className="mt-0.5 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t("projects.form.mapDrawer.scheduling.ownerOnly")}
          </p>
        )}
      </div>
      <Switch
        id="map-schedule-by-task-owner"
        checked={byTaskOwner}
        disabled={!canChange || save.isPending}
        onCheckedChange={(checked) => save.mutate(checked)}
        data-testid="map-schedule-by-task-owner"
      />
    </div>
  );
}
