import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { Building2, KeyRound, Network, Save, Search, Settings2, Users, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LucideIconPicker } from "@/components/ui/lucide-icon-picker";
import type { TeamRow } from "@shared/schema";
import type { TeamSummary } from "@shared/teams";
import { invalidateTeams, personName, teamErrorKey, type TeamPerson } from "./teams-api";
import { TeamSubteamsPanel } from "./team-subteams-panel";
import { TeamCrmDepartmentsField } from "./team-crm-departments";

const NO_MANAGER = "__none__";

interface TeamDialogProps {
  /** The team to edit, or null to create one. */
  team: TeamSummary | null;
  /** Everyone who can join a team (internal, active users). */
  people: TeamPerson[];
  onClose: () => void;
  /** Called after a create, so the dialog can stay open on the new team. */
  onCreated: (created: TeamSummary) => void;
}

/**
 * Create or edit a team: details (name, icon, description, manager), its
 * members, and its subteams. Members and subteams open once the team exists.
 */
export function TeamDialog({ team, people, onClose, onCreated }: TeamDialogProps) {
  const { t } = useTranslation();
  const isNew = team === null;
  const [tab, setTab] = useState("details");

  const [name, setName] = useState(team?.name ?? "");
  const [description, setDescription] = useState(team?.description ?? "");
  const [icon, setIcon] = useState(team?.icon ?? "");
  const [managerUserId, setManagerUserId] = useState(team?.managerUserId ?? NO_MANAGER);
  const [crmDepartments, setCrmDepartments] = useState<string[]>(team?.crmDepartments ?? []);

  // Re-seed the form when the dialog switches from "new" to the created team.
  const teamId = team?.id ?? null;
  useEffect(() => {
    setName(team?.name ?? "");
    setDescription(team?.description ?? "");
    setIcon(team?.icon ?? "");
    setManagerUserId(team?.managerUserId ?? NO_MANAGER);
    setCrmDepartments(team?.crmDepartments ?? []);
    // Only when the team itself changes, not on every refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const detailsMutation = useMutation({
    mutationFn: async (): Promise<TeamRow> => {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        icon: icon || null,
        managerUserId: managerUserId === NO_MANAGER ? null : managerUserId,
        crmDepartments,
      };
      return isNew ? apiRequest("POST", "/api/teams", body) : apiRequest("PATCH", `/api/teams/${team.id}`, body);
    },
    onSuccess: (row) => {
      invalidateTeams();
      if (isNew) {
        showSuccessToast(t("teams.toasts.created", { name: row.name }));
        onCreated({ ...row, members: [], subteams: [] });
        setTab("members");
      } else {
        showSuccessToast(t("teams.toasts.saved", { name: row.name }));
      }
    },
    onError: (error) => showErrorToast(t("teams.toasts.errorTitle"), t(teamErrorKey(error))),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isNew ? t("teams.dialog.createTitle") : t("teams.dialog.editTitle", { name: team.name })}</DialogTitle>
          <DialogDescription>{t("teams.dialog.description")}</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details" className="gap-2">
              <Settings2 className="h-4 w-4" />
              {t("teams.dialog.tabs.details")}
            </TabsTrigger>
            <TabsTrigger value="members" className="gap-2" disabled={isNew}>
              <Users className="h-4 w-4" />
              {t("teams.dialog.tabs.members")}
            </TabsTrigger>
            <TabsTrigger value="subteams" className="gap-2" disabled={isNew}>
              <Network className="h-4 w-4" />
              {t("teams.dialog.tabs.subteams")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 pt-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <Label htmlFor="team-name">{t("teams.dialog.name")}</Label>
                <Input
                  id="team-name"
                  value={name}
                  maxLength={120}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("teams.dialog.namePlaceholder")}
                  data-testid="input-team-name"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("teams.dialog.icon")}</Label>
                <LucideIconPicker value={icon} onChange={setIcon} compact align="end" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="team-description">{t("teams.dialog.descriptionLabel")}</Label>
              <Textarea
                id="team-description"
                value={description}
                maxLength={2000}
                rows={3}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("teams.dialog.descriptionPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("teams.dialog.manager")}</Label>
              <Select value={managerUserId} onValueChange={setManagerUserId}>
                <SelectTrigger data-testid="select-team-manager">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_MANAGER}>{t("teams.dialog.noManager")}</SelectItem>
                  {people.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {personName(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("teams.dialog.managerHint")}</p>
            </div>
            <div className="space-y-2">
              <Label>{t("teams.crm.label")}</Label>
              <TeamCrmDepartmentsField value={crmDepartments} onChange={setCrmDepartments} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                <X className="mr-2 h-4 w-4" />
                {t("common.close")}
              </Button>
              <Button
                onClick={() => detailsMutation.mutate()}
                disabled={!name.trim() || detailsMutation.isPending}
                data-testid="button-save-team"
              >
                <Save className="mr-2 h-4 w-4" />
                {isNew ? t("teams.dialog.create") : t("teams.dialog.save")}
              </Button>
            </div>
          </TabsContent>

          {team && (
            <TabsContent value="members" className="pt-4">
              <TeamMembersPanel team={team} people={people} />
            </TabsContent>
          )}

          {team && (
            <TabsContent value="subteams" className="max-h-[60vh] overflow-y-auto pt-4">
              <TeamSubteamsPanel team={team} people={people} />
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function TeamMembersPanel({ team, people }: { team: TeamSummary; people: TeamPerson[] }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(team.members.map((m) => m.userId)));

  const defaults = useMemo(() => new Set(team.members.filter((m) => m.isDefault).map((m) => m.userId)), [team.members]);
  // Added by SSO sign-in; removing them by hand lasts until their next sign-in.
  const fromSso = useMemo(() => new Set(team.members.filter((m) => m.source === "sso").map((m) => m.userId)), [team.members]);
  // Added by the CRM sync; removing them by hand lasts until the next sync.
  const fromCrm = useMemo(() => new Set(team.members.filter((m) => m.source === "crm").map((m) => m.userId)), [team.members]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => personName(p).toLowerCase().includes(q) || (p.email ?? "").toLowerCase().includes(q));
  }, [people, search]);

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/teams/${team.id}/members`, { userIds: Array.from(selected) }),
    onSuccess: () => {
      invalidateTeams();
      showSuccessToast(t("teams.toasts.membersSaved", { name: team.name }));
    },
    onError: (error) => showErrorToast(t("teams.toasts.errorTitle"), t(teamErrorKey(error))),
  });

  const toggle = (id: string, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("teams.members.hint")}</p>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("teams.members.searchPlaceholder")}
          className="pl-9"
        />
      </div>
      <div className="max-h-80 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200 dark:divide-gray-800 dark:border-gray-700">
        {visible.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{t("teams.members.noMatches")}</p>
        ) : (
          visible.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/60"
            >
              <Checkbox checked={selected.has(p.id)} onCheckedChange={(v) => toggle(p.id, v === true)} />
              <span className="flex-1 text-sm text-gray-900 dark:text-gray-100">{personName(p)}</span>
              {fromSso.has(p.id) && selected.has(p.id) && (
                <Badge
                  variant="outline"
                  className="flex items-center gap-1 px-1.5 py-0 text-[10px] text-gray-600 dark:text-gray-300"
                  title={t("teams.members.fromSsoTooltip")}
                >
                  <KeyRound className="h-3 w-3" />
                  {t("teams.members.fromSso")}
                </Badge>
              )}
              {fromCrm.has(p.id) && selected.has(p.id) && (
                <Badge
                  variant="outline"
                  className="flex items-center gap-1 px-1.5 py-0 text-[10px] text-gray-600 dark:text-gray-300"
                  title={t("teams.members.fromCrmTooltip")}
                >
                  <Building2 className="h-3 w-3" />
                  {t("teams.members.fromCrm")}
                </Badge>
              )}
              {defaults.has(p.id) && selected.has(p.id) && (
                <span className="text-xs text-muted-foreground">{t("teams.members.defaultTeam")}</span>
              )}
              <span className="hidden text-xs text-muted-foreground sm:inline">{p.email}</span>
            </label>
          ))
        )}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{t("teams.members.selected", { count: selected.size })}</span>
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-team-members">
          <Save className="mr-2 h-4 w-4" />
          {t("teams.members.save")}
        </Button>
      </div>
    </div>
  );
}
