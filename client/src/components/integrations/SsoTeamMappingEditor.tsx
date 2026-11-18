// SSO Group → Team table (Okta and Azure, under Advanced). Every sign-in
// puts people on the teams and subteams their groups map to and takes them
// off SSO-added ones their groups no longer map to. Teams an admin added by
// hand are never removed. Teams only organize people; they grant no access.
import { useTranslation } from "react-i18next";
import { Plus, Trash2, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTeams } from "@/components/teams/teams-api";
import { orderSubteams } from "@shared/teams";

export interface TeamMappingDraft {
  group: string;
  teamId: number | null;
  subteamId: number | null;
}

const WHOLE_TEAM = "whole";

/** Rows ready to save: a group and a team, trimmed. */
export function teamMappingPayload(rows: readonly TeamMappingDraft[]) {
  return rows
    .filter((row) => row.group.trim() && row.teamId !== null)
    .map((row) => ({ group: row.group.trim(), teamId: row.teamId as number, subteamId: row.subteamId }));
}

export function SsoTeamMappingEditor({
  provider,
  rows,
  onChange,
}: {
  provider: "okta" | "azure";
  rows: TeamMappingDraft[];
  onChange: (rows: TeamMappingDraft[]) => void;
}) {
  const { t } = useTranslation();
  const { data: teams = [] } = useTeams();
  const p = `integrations.sso.${provider}`;

  const update = (idx: number, patch: Partial<TeamMappingDraft>) => {
    const next = [...rows];
    next[idx] = { ...rows[idx], ...patch };
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2" data-testid={`sso-team-mapping-${provider}`}>
      <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{t("integrations.sso.teamMapping.title")}</p>
      <p className="text-[11px] text-gray-500 dark:text-gray-400">{t("integrations.sso.teamMapping.hint")}</p>
      {teams.length === 0 && (
        <p className="text-[11px] italic text-gray-500 dark:text-gray-400">{t("integrations.sso.teamMapping.noTeams")}</p>
      )}
      {rows.map((row, idx) => {
        const team = teams.find((x) => x.id === row.teamId);
        // Inactive teams and subteams stay listed only while a row uses them.
        const teamChoices = teams.filter((x) => x.isActive || x.id === row.teamId);
        const subteamChoices = team
          ? orderSubteams(team.subteams.filter((s) => s.isActive || s.id === row.subteamId))
          : [];
        return (
          <div key={idx} className="flex flex-wrap items-center gap-2">
            <Input
              value={row.group}
              onChange={(e) => update(idx, { group: e.target.value })}
              placeholder={t(`${p}.groupPlaceholder`)}
              aria-label={t(`${p}.groupColumn`)}
              className="min-w-[10rem] flex-1 font-mono text-sm"
            />
            <Select
              value={row.teamId === null ? undefined : String(row.teamId)}
              onValueChange={(value) => update(idx, { teamId: Number(value), subteamId: null })}
            >
              <SelectTrigger className="w-44" aria-label={t("integrations.sso.teamMapping.teamColumn")}>
                <SelectValue placeholder={t("integrations.sso.teamMapping.pickTeam")} />
              </SelectTrigger>
              <SelectContent>
                {teamChoices.map((x) => (
                  <SelectItem key={x.id} value={String(x.id)}>
                    <span className="flex items-center gap-2">
                      {x.icon ? <DynamicIcon name={x.icon} className="h-4 w-4" /> : <UsersRound className="h-4 w-4" />}
                      {x.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={row.subteamId === null ? WHOLE_TEAM : String(row.subteamId)}
              onValueChange={(value) => update(idx, { subteamId: value === WHOLE_TEAM ? null : Number(value) })}
              disabled={!team || subteamChoices.length === 0}
            >
              <SelectTrigger className="w-44" aria-label={t("integrations.sso.teamMapping.subteamColumn")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={WHOLE_TEAM}>{t("integrations.sso.teamMapping.wholeTeam")}</SelectItem>
                {subteamChoices.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {"— ".repeat(s.depth - 1)}
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(rows.filter((_, i) => i !== idx))}
              aria-label={t("integrations.sso.removeMapping")}
              title={t("integrations.sso.removeMapping")}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      })}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={teams.length === 0}
          onClick={() => onChange([...rows, { group: "", teamId: null, subteamId: null }])}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t("integrations.sso.teamMapping.add")}
        </Button>
      </div>
    </div>
  );
}
