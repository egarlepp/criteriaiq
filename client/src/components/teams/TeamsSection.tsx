import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { Edit, Network, Plus, Power, PowerOff, Search, Trash2, UserRound, Users, UsersRound, UserX } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { usePermissions } from "@/hooks/usePermissions";
import { SearchFiltersSection, FilterLabel } from "@/components/ui/search-filters-section";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { MetricCard } from "@/components/shared/MetricCard";
import { TEAMS_SECTION, hasCrmLinks, type TeamSummary } from "@shared/teams";
import { invalidateTeams, personName, teamErrorKey, useTeamPeople, useTeams } from "./teams-api";
import { SyncTeamsFromCrmButton } from "./team-crm-departments";
import { TeamDialog } from "./team-dialog";
import { TeamsAutoFillCard } from "./team-auto-fill-card";

type StatusFilter = "all" | "active" | "inactive";

/**
 * Admin › Team & People › Teams, modeled on ImpactIQ's Teams page. Teams,
 * their subteams, manager and members only organize and filter people; they
 * never change what anyone can see or do.
 */
export function TeamsSection() {
  const { t } = useTranslation();
  const { canEdit } = usePermissions();
  const canEditTeams = canEdit(TEAMS_SECTION);

  const { data: teams = [], isLoading } = useTeams();
  const { data: people = [] } = useTeamPeople();
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [dialogTeam, setDialogTeam] = useState<TeamSummary | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TeamSummary | null>(null);

  const activeFilterCount = [search.trim() !== "", status !== "all"].filter(Boolean).length;
  const clearFilters = () => {
    setSearch("");
    setStatus("all");
  };

  const visibleTeams = useMemo(() => {
    const q = search.trim().toLowerCase();
    return teams.filter((team) => {
      if (status === "active" && !team.isActive) return false;
      if (status === "inactive" && team.isActive) return false;
      if (!q) return true;
      if (team.name.toLowerCase().includes(q) || (team.description ?? "").toLowerCase().includes(q)) return true;
      if (team.subteams.some((s) => s.name.toLowerCase().includes(q))) return true;
      return team.members.some((m) => personName(peopleById.get(m.userId)).toLowerCase().includes(q));
    });
  }, [teams, search, status, peopleById]);

  const kpis = useMemo(() => {
    const onATeam = new Set(teams.flatMap((team) => team.members.map((m) => m.userId)));
    return {
      active: teams.filter((team) => team.isActive).length,
      inactive: teams.filter((team) => !team.isActive).length,
      onATeam: people.filter((p) => onATeam.has(p.id)).length,
      withoutTeam: people.filter((p) => !onATeam.has(p.id)).length,
      subteams: teams.reduce((sum, team) => sum + team.subteams.length, 0),
    };
  }, [teams, people]);

  const toggleMutation = useMutation({
    mutationFn: (team: TeamSummary) => apiRequest("PATCH", `/api/teams/${team.id}`, { isActive: !team.isActive }),
    onSuccess: (_data, team) => {
      invalidateTeams();
      showSuccessToast(
        team.isActive ? t("teams.toasts.deactivated", { name: team.name }) : t("teams.toasts.activated", { name: team.name }),
      );
    },
    onError: (error) => showErrorToast(t("teams.toasts.errorTitle"), t(teamErrorKey(error))),
  });

  const deleteMutation = useMutation({
    mutationFn: (team: TeamSummary) => apiRequest("DELETE", `/api/teams/${team.id}`),
    onSuccess: (_data, team) => {
      invalidateTeams();
      showSuccessToast(t("teams.toasts.deleted", { name: team.name }));
    },
    onError: (error) => showErrorToast(t("teams.toasts.errorTitle"), t(teamErrorKey(error))),
  });

  return (
    <div className="space-y-4">
      <SearchFiltersSection activeFilterCount={activeFilterCount} onClearFilters={clearFilters}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <FilterLabel htmlFor="teams-search">{t("teams.filters.search")}</FilterLabel>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="teams-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("teams.filters.searchPlaceholder")}
                className="pl-9"
              />
            </div>
          </div>
          <div>
            <FilterLabel>{t("teams.filters.status")}</FilterLabel>
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("teams.filters.allStatuses")}</SelectItem>
                <SelectItem value="active">{t("teams.status.active")}</SelectItem>
                <SelectItem value="inactive">{t("teams.status.inactive")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </SearchFiltersSection>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard
          title={t("teams.kpis.teams")}
          value={kpis.active}
          sub={t("teams.kpis.teamsSub", { count: kpis.inactive })}
          icon={<UsersRound />}
          color="blue"
          loading={isLoading}
        />
        <MetricCard
          title={t("teams.kpis.onATeam")}
          value={kpis.onATeam}
          sub={t("teams.kpis.onATeamSub")}
          icon={<Users />}
          color="green"
          loading={isLoading}
        />
        <MetricCard
          title={t("teams.kpis.withoutTeam")}
          value={kpis.withoutTeam}
          sub={t("teams.kpis.withoutTeamSub")}
          icon={<UserX />}
          color={kpis.withoutTeam > 0 ? "amber" : "green"}
          loading={isLoading}
        />
        <MetricCard
          title={t("teams.kpis.subteams")}
          value={kpis.subteams}
          sub={t("teams.kpis.subteamsSub")}
          icon={<Network />}
          color="blue"
          loading={isLoading}
        />
      </div>

      {canEditTeams && <TeamsAutoFillCard teams={teams} />}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <UsersRound className="h-5 w-5 text-primary" />
                {t("teams.list.title")}
              </CardTitle>
              <CardDescription>{t("teams.list.description")}</CardDescription>
            </div>
            {canEditTeams && (
              <div className="flex flex-wrap gap-2">
                {hasCrmLinks(teams) && <SyncTeamsFromCrmButton />}
                <Button size="sm" onClick={() => setDialogTeam("new")} data-testid="button-add-team">
                  <Plus className="mr-2 h-4 w-4" />
                  {t("teams.list.add")}
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("teams.list.loading")}</p>
          ) : visibleTeams.length === 0 ? (
            <div className="py-8 text-center text-gray-500 dark:text-gray-400">
              <UsersRound className="mx-auto mb-4 h-12 w-12 text-gray-300 dark:text-gray-600" />
              <p>{teams.length === 0 ? t("teams.list.empty") : t("teams.list.noMatches")}</p>
              {teams.length === 0 && canEditTeams && <p className="text-sm">{t("teams.list.emptyHint")}</p>}
            </div>
          ) : (
            visibleTeams.map((team) => {
              const manager = team.managerUserId ? peopleById.get(team.managerUserId) : undefined;
              return (
                <div
                  key={team.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                  data-testid={`team-row-${team.id}`}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <DynamicIcon
                      name={team.icon || "UsersRound"}
                      className={`mt-0.5 h-5 w-5 shrink-0 ${team.isActive ? "text-primary" : "text-gray-400 dark:text-gray-500"}`}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={`font-medium ${team.isActive ? "text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-400"}`}>
                          {team.name}
                        </p>
                        {!team.isActive && (
                          <Badge variant="secondary" className="gap-1 text-xs">
                            <PowerOff className="h-3 w-3" />
                            {t("teams.status.inactive")}
                          </Badge>
                        )}
                      </div>
                      {team.description && <p className="text-sm text-gray-500 dark:text-gray-400">{team.description}</p>}
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
                        <span className="inline-flex items-center gap-1">
                          <UserRound className="h-3.5 w-3.5" />
                          {manager ? t("teams.list.manager", { name: personName(manager) }) : t("teams.list.noManager")}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {t("teams.list.members", { count: team.members.length })}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Network className="h-3.5 w-3.5" />
                          {t("teams.list.subteams", { count: team.subteams.length })}
                        </span>
                      </div>
                    </div>
                  </div>
                  {canEditTeams && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setDialogTeam(team)}
                        title={t("teams.list.edit")}
                        aria-label={t("teams.list.edit")}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => toggleMutation.mutate(team)}
                        disabled={toggleMutation.isPending}
                        title={team.isActive ? t("teams.list.deactivate") : t("teams.list.activate")}
                        aria-label={team.isActive ? t("teams.list.deactivate") : t("teams.list.activate")}
                      >
                        {team.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                        onClick={() => setPendingDelete(team)}
                        title={t("teams.list.delete")}
                        aria-label={t("teams.list.delete")}
                      >
                        <Trash2 className="h-4 w-4 red-trash-icon" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {dialogTeam !== null && (
        <TeamDialog
          team={dialogTeam === "new" ? null : (teams.find((x) => x.id === dialogTeam.id) ?? dialogTeam)}
          people={people}
          onClose={() => setDialogTeam(null)}
          onCreated={(created) => setDialogTeam(created)}
        />
      )}

      <ConfirmationDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("teams.deleteDialog.title", { name: pendingDelete?.name ?? "" })}
        description={t("teams.deleteDialog.description")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          if (pendingDelete) deleteMutation.mutate(pendingDelete);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
        variant="destructive"
      />
    </div>
  );
}
