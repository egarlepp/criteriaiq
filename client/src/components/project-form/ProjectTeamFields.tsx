// Owning team and subteam pickers on the project form. Teams only organize
// and filter projects; they never change who can open one.
import { useMemo } from "react";
import { UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { UsersRound } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { useAuth } from "@/hooks/useAuth";
import { OUTSIDE_ROLES, useTeams } from "@/components/teams/teams-api";
import { orderSubteams } from "@shared/teams";
import { FormData } from "./types";

/** Select value for "no team" / "no subteam". */
export const NO_PROJECT_TEAM = "none";

function toId(value: string | undefined): number | null {
  if (!value || value === NO_PROJECT_TEAM) return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * The team fields to send on save. On create, an untouched picker sends
 * nothing so the server can use the primary engineer's default team; an
 * explicit "No team" sends null. On edit, an empty picker clears the team.
 */
export function projectTeamSubmitValues(
  teamValue: string | undefined,
  subteamValue: string | undefined,
  isEdit: boolean,
): { teamId: number | null | undefined; subteamId: number | null | undefined } {
  if (!isEdit && !teamValue) return { teamId: undefined, subteamId: undefined };
  const teamId = toId(teamValue);
  return { teamId, subteamId: teamId === null ? null : toId(subteamValue) };
}

export function ProjectTeamFields({ form }: { form: UseFormReturn<FormData> }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isInternal = !!user && !OUTSIDE_ROLES.has(user.role ?? "");
  const { data: teams = [] } = useTeams(isInternal);

  const teamValue = form.watch("teamId") ?? "";
  const subteamValue = form.watch("subteamId") ?? "";
  const currentTeamId = toId(teamValue);
  const currentSubteamId = toId(subteamValue);

  // Inactive teams and subteams stay listed only while the project is on them.
  const teamChoices = useMemo(
    () => teams.filter((team) => team.isActive || team.id === currentTeamId),
    [teams, currentTeamId],
  );
  const subteamChoices = useMemo(() => {
    const team = teams.find((x) => x.id === currentTeamId);
    if (!team) return [];
    return orderSubteams(team.subteams.filter((s) => s.isActive || s.id === currentSubteamId));
  }, [teams, currentTeamId, currentSubteamId]);

  if (!isInternal) return null;

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <FormField
        control={form.control}
        name="teamId"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="dark:text-slate-200">{t("projects.form.team.owningTeam")}</FormLabel>
            <Select
              value={field.value || undefined}
              onValueChange={(value) => {
                field.onChange(value);
                // A subteam belongs to one team, so changing the team clears it.
                if (value !== teamValue) form.setValue("subteamId", "");
              }}
            >
              <FormControl>
                <SelectTrigger
                  className="dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  data-testid="select-project-team"
                >
                  <SelectValue placeholder={t("projects.form.team.selectOwningTeam")} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value={NO_PROJECT_TEAM}>{t("projects.form.team.noTeam")}</SelectItem>
                {teamChoices.map((team) => (
                  <SelectItem key={team.id} value={String(team.id)}>
                    <span className="flex items-center gap-2">
                      {team.icon ? (
                        <DynamicIcon name={team.icon} className="h-4 w-4" />
                      ) : (
                        <UsersRound className="h-4 w-4" />
                      )}
                      {team.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("projects.form.team.owningTeamHint")}</p>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="subteamId"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="dark:text-slate-200">{t("projects.form.team.subteam")}</FormLabel>
            <Select
              value={field.value || undefined}
              onValueChange={field.onChange}
              disabled={currentTeamId === null || subteamChoices.length === 0}
            >
              <FormControl>
                <SelectTrigger
                  className="dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  data-testid="select-project-subteam"
                >
                  <SelectValue
                    placeholder={
                      currentTeamId !== null && subteamChoices.length === 0
                        ? t("projects.form.team.noSubteamsOnTeam")
                        : t("projects.form.team.selectSubteam")
                    }
                  />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value={NO_PROJECT_TEAM}>{t("projects.form.team.noSubteam")}</SelectItem>
                {subteamChoices.map((subteam) => (
                  <SelectItem key={subteam.id} value={String(subteam.id)}>
                    {"— ".repeat(subteam.depth - 1)}
                    {subteam.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
