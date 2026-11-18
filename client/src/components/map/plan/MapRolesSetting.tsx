// "Plan roles" in the MAP drawer header: which assignment roles this plan
// uses. Switching a role off only hides it in the drawer (chips, picker,
// row avatars); values already saved stay and come back when it's switched
// on again. Internal editors only; the route is staff-only too.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast } from "@/lib/toast-helper";
import { cn } from "@/lib/utils";
import { MAP_ASSIGNMENT_ROLES, enabledMapAssignmentRoles, type MapAssignmentRole } from "@shared/map-assignment-roles";
import { ROLE_AVATAR } from "./MapAssignees";

interface MapRolesSettingProps {
  projectId: number;
  /** project_maps.assignment_roles; null means every role. */
  stored: readonly string[] | null | undefined;
}

export function MapRolesSetting({ projectId, stored }: MapRolesSettingProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // Same query (and cache entry) the Plan tab's people list reads.
  const { data: project } = useQuery<{ customerName?: string | null }>({
    queryKey: ["/api/projects", projectId],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}`),
  });
  const customerName = project?.customerName ?? "";
  const [open, setOpen] = useState(false);
  const enabled = enabledMapAssignmentRoles(stored);

  const mutation = useMutation({
    mutationFn: (roles: MapAssignmentRole[]) =>
      apiRequest("PUT", `/api/projects/${projectId}/map/assignment-roles`, {
        roles: roles.length === MAP_ASSIGNMENT_ROLES.length ? null : roles,
      }),
    onError: () => showErrorToast("mapPlan.roles.saveFailed.title", "mapPlan.roles.saveFailed.description"),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "map"] });
    },
  });

  const toggle = (role: MapAssignmentRole, on: boolean) => {
    const next = MAP_ASSIGNMENT_ROLES.filter((r) => (r === role ? on : enabled.includes(r)));
    if (next.length === 0) return;
    mutation.mutate(next);
  };

  const label = (role: MapAssignmentRole) =>
    t(`mapPlan.assign.roles.${role}`, { customer: customerName || t("mapPlan.assign.customerFallback") });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-8" data-testid="map-roles-open">
          <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
          {t("mapPlan.roles.button")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t("mapPlan.roles.title")}</p>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{t("mapPlan.roles.description")}</p>
        <div className="mt-3 flex flex-col gap-2">
          {MAP_ASSIGNMENT_ROLES.map((role) => {
            const checked = enabled.includes(role);
            const last = checked && enabled.length === 1;
            const id = `map-role-${role}`;
            return (
              <div key={role} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={checked}
                  disabled={last || mutation.isPending}
                  onCheckedChange={(value) => toggle(role, value === true)}
                  data-testid={`map-roles-${role}`}
                />
                <span className={cn("h-2.5 w-2.5 flex-none rounded-full", ROLE_AVATAR[role])} aria-hidden="true" />
                <Label htmlFor={id} className="text-sm font-normal text-gray-800 dark:text-gray-200">
                  {label(role)}
                </Label>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-gray-500 dark:text-gray-400">{t("mapPlan.roles.hint")}</p>
      </PopoverContent>
    </Popover>
  );
}
