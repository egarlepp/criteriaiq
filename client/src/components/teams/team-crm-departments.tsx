// Teams from the CRM: the CRM departments picker (team dialog and subteam
// form) and the Teams page's Sync from CRM button. A team or subteam links
// up to five Salesforce departments or HubSpot teams; the daily sync (and the button) puts the
// matching people on it. See docs/features/teams.md#teams-from-the-crm.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Building2, Plus, RefreshCw, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MAX_CRM_DEPARTMENTS } from "@shared/teams";
import { invalidateTeams } from "./teams-api";

interface CrmDepartmentOptions {
  provider: string;
  options: Array<{ value: string; label: string }>;
  error?: "not_connected" | "unreadable";
}

const OPTIONS_KEY = ["/api/teams/crm-departments"] as const;

export function useCrmDepartmentOptions(enabled = true) {
  return useQuery<CrmDepartmentOptions>({
    queryKey: OPTIONS_KEY,
    queryFn: () => apiRequest("GET", "/api/teams/crm-departments"),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** Department picker for the team dialog's Details tab and the subteam form. */
export function TeamCrmDepartmentsField({
  value,
  onChange,
  subteam = false,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  /** On the subteam form: the hint says the team comes along. */
  subteam?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data, isLoading } = useCrmDepartmentOptions();
  const provider = data?.provider ?? "none";
  const options = data?.options ?? [];
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  const full = value.length >= MAX_CRM_DEPARTMENTS;
  // Salesforce departments are free text, so one can be typed in; HubSpot
  // teams are ids and must be picked from the list.
  const typed = search.trim();
  const canType =
    provider === "salesforce" &&
    typed.length > 0 &&
    !options.some((o) => o.value.toLowerCase() === typed.toLowerCase()) &&
    !value.some((v) => v.toLowerCase() === typed.toLowerCase());

  const toggle = (v: string) => {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else if (!full) onChange([...value, v]);
  };

  if (provider === "none" && !isLoading && value.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("teams.crm.noCrm")}</p>;
  }

  return (
    <div className="space-y-2" data-testid="team-crm-departments">
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((v) => (
          <Badge key={v} variant="secondary" className="flex items-center gap-1">
            <Building2 className="h-3 w-3" />
            {labelOf(v)}
            <button
              type="button"
              onClick={() => toggle(v)}
              className="ml-0.5 rounded-sm hover:bg-black/10 dark:hover:bg-white/10"
              aria-label={t("teams.crm.remove", { name: labelOf(v) })}
              title={t("teams.crm.remove", { name: labelOf(v) })}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" disabled={full || provider === "none"} data-testid="button-add-crm-department">
              <Plus className="mr-1 h-3.5 w-3.5" />
              {provider === "hubspot" ? t("teams.crm.addHubspot") : t("teams.crm.addSalesforce")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="start">
            <Command>
              <CommandInput value={search} onValueChange={setSearch} placeholder={t("teams.crm.search")} />
              <CommandList>
                <CommandEmpty>{isLoading ? t("teams.crm.loading") : t("teams.crm.noOptions")}</CommandEmpty>
                {canType && (
                  <CommandGroup>
                    <CommandItem
                      value={`typed-${typed}`}
                      onSelect={() => {
                        toggle(typed);
                        setSearch("");
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {t("teams.crm.useTyped", { name: typed })}
                    </CommandItem>
                  </CommandGroup>
                )}
                <CommandGroup>
                  {options
                    .filter((o) => !value.includes(o.value))
                    .map((o) => (
                      <CommandItem key={o.value} value={`${o.label}-${o.value}`} onSelect={() => toggle(o.value)}>
                        <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                        {o.label}
                      </CommandItem>
                    ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <p className="text-xs text-muted-foreground">
        {provider === "hubspot" ? t("teams.crm.hintHubspot") : t("teams.crm.hintSalesforce")}
        {subteam && ` ${t("teams.crm.hintSubteam")}`}
      </p>
      {data?.error === "not_connected" && (
        <p className="text-xs text-amber-700 dark:text-amber-400">{t("teams.crm.notConnected")}</p>
      )}
      {data?.error === "unreadable" && (
        <p className="text-xs text-amber-700 dark:text-amber-400">{t("teams.crm.unreadable")}</p>
      )}
    </div>
  );
}

interface SyncResult {
  added: number;
  removed: number;
  reason: "no_crm" | "nothing_linked" | "crm_unreadable" | null;
}

/** Teams page header button: runs the CRM sync now. */
export function SyncTeamsFromCrmButton() {
  const { t } = useTranslation();
  const mutation = useMutation({
    mutationFn: (): Promise<SyncResult> => apiRequest("POST", "/api/teams/crm-sync"),
    onSuccess: (result) => {
      invalidateTeams();
      if (result.reason === "crm_unreadable") {
        showErrorToast(t("teams.toasts.errorTitle"), t("teams.crm.syncUnreadable"));
      } else if (result.reason === "no_crm") {
        showErrorToast(t("teams.toasts.errorTitle"), t("teams.crm.noCrm"));
      } else if (result.reason === "nothing_linked") {
        showSuccessToast(t("teams.crm.syncNothingLinked"));
      } else {
        showSuccessToast(t("teams.crm.syncDone", { added: result.added, removed: result.removed }));
      }
    },
    onError: () => showErrorToast(t("teams.toasts.errorTitle"), t("teams.crm.syncFailed")),
  });
  return (
    <Button variant="outline" onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-sync-teams-crm">
      <RefreshCw className={`mr-2 h-4 w-4 ${mutation.isPending ? "animate-spin" : ""}`} />
      {t("teams.crm.syncNow")}
    </Button>
  );
}
