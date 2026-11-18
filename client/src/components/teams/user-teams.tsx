// Team pieces of the Users page: the Team column, the Team filter and the
// picker in the user dialog. Teams only organize and filter people.
import { useTranslation } from "react-i18next";
import { Star, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { teamsForUser, type TeamSummary } from "@shared/teams";

/** Team filter value for people on no team. */
export const NO_TEAM_FILTER = "none";

export interface UserTeamsDraft {
  teamIds: number[];
  defaultTeamId: number | null;
}

export const EMPTY_USER_TEAMS: UserTeamsDraft = { teamIds: [], defaultTeamId: null };

/** A person's current teams as a draft for the picker. */
export function userTeamsDraft(teams: readonly TeamSummary[], userId: string): UserTeamsDraft {
  const mine = teamsForUser(teams, userId);
  return { teamIds: mine.map((t) => t.id), defaultTeamId: mine.find((t) => t.isDefault)?.id ?? null };
}

export function sameUserTeams(a: UserTeamsDraft, b: UserTeamsDraft): boolean {
  const x = [...a.teamIds].sort((m, n) => m - n);
  const y = [...b.teamIds].sort((m, n) => m - n);
  return a.defaultTeamId === b.defaultTeamId && x.length === y.length && x.every((id, i) => id === y[i]);
}

/** Whether a person passes the Users page Team filter ("all", "none" or a team id). */
export function matchesTeamFilter(teams: readonly TeamSummary[], userId: string, filter: string): boolean {
  if (filter === "all") return true;
  const mine = teams.filter((t) => t.members.some((m) => m.userId === userId));
  if (filter === NO_TEAM_FILTER) return mine.length === 0;
  return mine.some((t) => String(t.id) === filter);
}

/** Team names for sorting the Team column: default team first. */
export function teamSortLabel(teams: readonly TeamSummary[], userId: string): string {
  return teamsForUser(teams, userId)
    .map((t) => t.name)
    .join(", ");
}

export function UserTeamBadges({ teams, userId }: { teams: readonly TeamSummary[]; userId: string }) {
  const { t } = useTranslation();
  const mine = teamsForUser(teams, userId);
  if (mine.length === 0) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {mine.map((team) => (
        <Badge
          key={team.id}
          variant="outline"
          className="flex w-fit items-center gap-1 px-2 py-0.5 text-xs text-gray-700 dark:text-gray-300"
          title={team.isDefault ? t("teams.users.defaultTeamTooltip") : undefined}
        >
          {team.isDefault ? (
            <Star className="h-3 w-3 fill-amber-400 text-amber-500 dark:fill-amber-500 dark:text-amber-400" />
          ) : team.icon ? (
            <DynamicIcon name={team.icon} className="h-3 w-3" />
          ) : (
            <UsersRound className="h-3 w-3" />
          )}
          {team.name}
        </Badge>
      ))}
    </div>
  );
}

export function UserTeamFilterSelect({
  teams,
  value,
  onChange,
}: {
  teams: readonly TeamSummary[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger data-testid="select-user-team-filter">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t("teams.users.allTeams")}</SelectItem>
        <SelectItem value={NO_TEAM_FILTER}>{t("teams.users.noTeam")}</SelectItem>
        {teams.map((team) => (
          <SelectItem key={team.id} value={String(team.id)}>
            {team.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Choose a person's teams and default team (user dialog). */
export function UserTeamsPicker({
  teams,
  value,
  onChange,
  outsideUser,
}: {
  teams: readonly TeamSummary[];
  value: UserTeamsDraft;
  onChange: (value: UserTeamsDraft) => void;
  /** Customer, Guest and Partner users never join a team. */
  outsideUser: boolean;
}) {
  const { t } = useTranslation();
  if (outsideUser) {
    return <p className="text-sm text-muted-foreground">{t("teams.users.outsideUserNote")}</p>;
  }
  // Inactive teams stay listed only while the person is still on them.
  const choices = teams.filter((team) => team.isActive || value.teamIds.includes(team.id));
  if (choices.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("teams.users.noTeamsYet")}</p>;
  }

  const toggle = (teamId: number, checked: boolean) => {
    const teamIds = checked ? [...value.teamIds, teamId] : value.teamIds.filter((id) => id !== teamId);
    let defaultTeamId = value.defaultTeamId;
    if (defaultTeamId !== null && !teamIds.includes(defaultTeamId)) defaultTeamId = null;
    // The first team picked becomes the default, as on the server.
    if (defaultTeamId === null && teamIds.length > 0) defaultTeamId = teamIds[0];
    onChange({ teamIds, defaultTeamId });
  };

  const chosen = choices.filter((team) => value.teamIds.includes(team.id));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {choices.map((team) => (
          <label
            key={team.id}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-200 px-3 py-2 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/60"
          >
            <Checkbox
              checked={value.teamIds.includes(team.id)}
              onCheckedChange={(v) => toggle(team.id, v === true)}
            />
            {team.icon ? <DynamicIcon name={team.icon} className="h-4 w-4" /> : <UsersRound className="h-4 w-4" />}
            <span className="truncate text-sm text-gray-900 dark:text-gray-100">{team.name}</span>
          </label>
        ))}
      </div>
      {chosen.length > 1 && (
        <div className="space-y-1">
          <Label>{t("teams.users.defaultTeam")}</Label>
          <Select
            value={value.defaultTeamId === null ? undefined : String(value.defaultTeamId)}
            onValueChange={(v) => onChange({ ...value, defaultTeamId: Number(v) })}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("teams.users.defaultTeam")} />
            </SelectTrigger>
            <SelectContent>
              {chosen.map((team) => (
                <SelectItem key={team.id} value={String(team.id)}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t("teams.users.defaultTeamHint")}</p>
        </div>
      )}
    </div>
  );
}
