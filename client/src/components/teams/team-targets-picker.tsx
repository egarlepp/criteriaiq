// Pick teams and subteams as recipients (announcements, Workflow Automation
// actions). Saves ids; the server resolves them to people when it sends, so
// later membership changes apply without editing the announcement or rule.
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Network, UsersRound, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { orderSubteams, resolveTeamTargets, type TeamTargets } from "@shared/teams";
import { useTeams } from "./teams-api";

interface TeamTargetsPickerProps {
  value: TeamTargets;
  onChange: (value: TeamTargets) => void;
  /** Shown on the button when nothing is picked. */
  emptyLabel: string;
  className?: string;
}

function toggle(list: number[], id: number): number[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function TeamTargetsPicker({ value, onChange, emptyLabel, className }: TeamTargetsPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data: teams = [] } = useTeams();

  // Inactive teams and subteams stay listed only while they are picked.
  const choices = useMemo(
    () =>
      teams
        .filter((team) => team.isActive || value.teamIds.includes(team.id))
        .map((team) => ({
          team,
          subteams: orderSubteams(
            team.subteams.filter((s) => s.isActive || value.subteamIds.includes(s.id)),
          ),
        })),
    [teams, value.teamIds, value.subteamIds],
  );

  const reached = useMemo(() => resolveTeamTargets(teams, value).length, [teams, value]);
  const pickedCount = value.teamIds.length + value.subteamIds.length;

  const pickedBadges = [
    ...value.teamIds.map((id) => {
      const team = teams.find((x) => x.id === id);
      return { key: `team-${id}`, label: team?.name ?? `#${id}`, icon: team?.icon ?? null, remove: () => onChange({ ...value, teamIds: toggle(value.teamIds, id) }), subteam: false };
    }),
    ...value.subteamIds.map((id) => {
      const team = teams.find((x) => x.subteams.some((s) => s.id === id));
      const subteam = team?.subteams.find((s) => s.id === id);
      const label = subteam && team ? `${team.name} › ${subteam.name}` : `#${id}`;
      return { key: `subteam-${id}`, label, icon: null, remove: () => onChange({ ...value, subteamIds: toggle(value.subteamIds, id) }), subteam: true };
    }),
  ];

  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full justify-start text-left font-normal"
            data-testid="button-team-targets"
          >
            <UsersRound className="mr-2 h-4 w-4" />
            {pickedCount > 0 ? t("teams.targets.selected", { count: pickedCount }) : emptyLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <Command>
            <CommandInput placeholder={t("teams.targets.search")} />
            <CommandList>
              <CommandEmpty>{t("teams.targets.noTeams")}</CommandEmpty>
              {choices.map(({ team, subteams }) => (
                <CommandGroup key={team.id} heading={team.name}>
                  <CommandItem value={`team-${team.id}-${team.name}`} onSelect={() => onChange({ ...value, teamIds: toggle(value.teamIds, team.id) })}>
                    <Checkbox checked={value.teamIds.includes(team.id)} className="mr-2" />
                    {team.icon ? <DynamicIcon name={team.icon} className="mr-2 h-4 w-4" /> : <UsersRound className="mr-2 h-4 w-4" />}
                    <span>{t("teams.targets.wholeTeam", { name: team.name })}</span>
                  </CommandItem>
                  {subteams.map((s) => (
                    <CommandItem
                      key={s.id}
                      value={`subteam-${s.id}-${team.name}-${s.name}`}
                      onSelect={() => onChange({ ...value, subteamIds: toggle(value.subteamIds, s.id) })}
                    >
                      <Checkbox checked={value.subteamIds.includes(s.id)} className="mr-2" />
                      <Network className="mr-2 h-4 w-4 text-muted-foreground" />
                      <span>
                        {"— ".repeat(s.depth - 1)}
                        {s.name}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {pickedCount > 0 && (
        <div className="mt-2 space-y-1.5">
          <div className="flex flex-wrap gap-1.5">
            {pickedBadges.map((b) => (
              <Badge
                key={b.key}
                variant="secondary"
                className="flex cursor-pointer items-center gap-1"
                onClick={b.remove}
                title={t("teams.targets.remove")}
              >
                {b.subteam ? (
                  <Network className="h-3 w-3" />
                ) : b.icon ? (
                  <DynamicIcon name={b.icon} className="h-3 w-3" />
                ) : (
                  <UsersRound className="h-3 w-3" />
                )}
                {b.label}
                <X className="ml-0.5 h-3 w-3" />
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t("teams.targets.reach", { count: reached })}</p>
        </div>
      )}
    </div>
  );
}
