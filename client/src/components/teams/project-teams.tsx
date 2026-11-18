// Team pieces of the project lists (Manage Projects table and the board):
// the owning-team filter and badge. Teams only organize and filter projects.
import { useTranslation } from "react-i18next";
import { UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import type { TeamSummary } from "@shared/teams";
import { OUTSIDE_ROLES, useTeams } from "./teams-api";
import { NO_TEAM_FILTER } from "./user-teams";

export interface ProjectTeamRef {
  teamId?: number | null;
  subteamId?: number | null;
}

/**
 * Teams for the project lists. Outside users (Customer, Guest, Partner)
 * never see a project's team (the server strips it), so the query and the
 * team UI are skipped for them.
 */
export function useProjectTeams(): { isInternal: boolean; teams: TeamSummary[] } {
  const { user } = useAuth();
  const isInternal = !!user && !OUTSIDE_ROLES.has(user.role ?? "");
  const { data } = useTeams(isInternal);
  return { isInternal, teams: data ?? [] };
}

/** Whether a project passes the Team filter ("all", "none" or a team id). */
export function matchesProjectTeamFilter(project: ProjectTeamRef, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === NO_TEAM_FILTER) return project.teamId == null;
  return project.teamId != null && String(project.teamId) === filter;
}

/** "Team › Subteam", or "" for a project with no team; used for sorting. */
export function projectTeamLabel(teams: readonly TeamSummary[], project: ProjectTeamRef): string {
  const team = project.teamId == null ? undefined : teams.find((x) => x.id === project.teamId);
  if (!team) return "";
  const subteam = project.subteamId == null ? undefined : team.subteams.find((s) => s.id === project.subteamId);
  return subteam ? `${team.name} › ${subteam.name}` : team.name;
}

export function ProjectTeamBadge({ teams, project }: { teams: readonly TeamSummary[]; project: ProjectTeamRef }) {
  const { t } = useTranslation();
  const team = project.teamId == null ? undefined : teams.find((x) => x.id === project.teamId);
  if (!team) return <span className="text-sm text-muted-foreground">—</span>;
  const subteam = project.subteamId == null ? undefined : team.subteams.find((s) => s.id === project.subteamId);
  return (
    <div className="flex flex-col gap-0.5">
      <Badge
        variant="outline"
        className="flex w-fit items-center gap-1 px-2 py-0.5 text-xs text-gray-700 dark:text-gray-300"
        title={t("projects.teams.owningTeamTooltip")}
      >
        {team.icon ? <DynamicIcon name={team.icon} className="h-3 w-3" /> : <UsersRound className="h-3 w-3" />}
        {team.name}
      </Badge>
      {subteam && <span className="pl-1 text-xs text-muted-foreground">{subteam.name}</span>}
    </div>
  );
}

export function ProjectTeamFilterSelect({
  teams,
  value,
  onChange,
  className,
}: {
  teams: readonly TeamSummary[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className} data-testid="select-project-team-filter">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t("teams.users.allTeams")}</SelectItem>
        <SelectItem value={NO_TEAM_FILTER}>{t("projects.teams.noTeam")}</SelectItem>
        {teams.map((team) => (
          <SelectItem key={team.id} value={String(team.id)}>
            {team.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
