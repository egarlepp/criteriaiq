import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { Building2, Edit, Plus, Power, PowerOff, Save, Trash2, Users, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  MAX_SUBTEAM_DEPTH,
  SUBTEAM_KINDS,
  checkSubteamParent,
  orderSubteams,
  type SubteamRole,
  type SubteamSummary,
  type TeamSummary,
} from "@shared/teams";
import { invalidateTeams, personName, teamErrorKey, type TeamPerson } from "./teams-api";
import { TeamCrmDepartmentsField, useCrmDepartmentOptions } from "./team-crm-departments";

const TOP_LEVEL = "__top__";
const NO_KIND = "__none__";
const NOT_IN_SUBTEAM = "__out__";
/** Left padding per tree level (1-4). */
const INDENT = ["pl-3", "pl-7", "pl-11", "pl-15"];

interface FormState {
  /** null while adding a new subteam. */
  id: number | null;
  name: string;
  kind: string;
  parent: string;
  crmDepartments: string[];
}

const emptyForm: FormState = { id: null, name: "", kind: NO_KIND, parent: TOP_LEVEL, crmDepartments: [] };

/** Subteams of one team: a tree up to MAX_SUBTEAM_DEPTH levels, each with leaders and members. */
export function TeamSubteamsPanel({ team, people }: { team: TeamSummary; people: TeamPerson[] }) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState | null>(null);
  const [membersFor, setMembersFor] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SubteamSummary | null>(null);

  const ordered = useMemo(() => orderSubteams(team.subteams), [team.subteams]);
  const byId = useMemo(() => new Map(team.subteams.map((s) => [s.id, s])), [team.subteams]);

  // Parents the form may pick: anything that keeps the tree valid.
  const parentOptions = useMemo(
    () =>
      form
        ? ordered.filter((s) => s.id !== form.id && checkSubteamParent(team.subteams, form.id, s.id) === "ok")
        : [],
    [form, ordered, team.subteams],
  );

  const onError = (error: unknown) => showErrorToast(t("teams.toasts.errorTitle"), t(teamErrorKey(error)));

  const saveMutation = useMutation({
    mutationFn: (value: FormState) => {
      const body = {
        name: value.name.trim(),
        kind: value.kind === NO_KIND ? null : value.kind,
        parentSubteamId: value.parent === TOP_LEVEL ? null : Number(value.parent),
        crmDepartments: value.crmDepartments,
      };
      return value.id === null
        ? apiRequest("POST", `/api/teams/${team.id}/subteams`, body)
        : apiRequest("PATCH", `/api/teams/${team.id}/subteams/${value.id}`, body);
    },
    onSuccess: (_data, value) => {
      invalidateTeams();
      showSuccessToast(t("teams.subteams.toasts.saved", { name: value.name.trim() }));
      setForm(null);
    },
    onError,
  });

  const toggleMutation = useMutation({
    mutationFn: (s: SubteamSummary) =>
      apiRequest("PATCH", `/api/teams/${team.id}/subteams/${s.id}`, { isActive: !s.isActive }),
    onSuccess: () => invalidateTeams(),
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: (s: SubteamSummary) => apiRequest("DELETE", `/api/teams/${team.id}/subteams/${s.id}`),
    onSuccess: (_data, s) => {
      invalidateTeams();
      showSuccessToast(t("teams.subteams.toasts.deleted", { name: s.name }));
    },
    onError,
  });

  const editing = membersFor !== null ? byId.get(membersFor) : undefined;
  const { data: crmOptions } = useCrmDepartmentOptions();
  const crmLabel = (v: string) => crmOptions?.options.find((o) => o.value === v)?.label ?? v;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t("teams.subteams.hint", { depth: MAX_SUBTEAM_DEPTH })}</p>
        {!form && (
          <Button size="sm" onClick={() => setForm(emptyForm)} data-testid="button-add-subteam">
            <Plus className="mr-2 h-4 w-4" />
            {t("teams.subteams.add")}
          </Button>
        )}
      </div>

      {form && (
        <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="subteam-name">{t("teams.subteams.name")}</Label>
              <Input
                id="subteam-name"
                value={form.name}
                maxLength={120}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("teams.subteams.kind")}</Label>
              <Select value={form.kind} onValueChange={(kind) => setForm({ ...form, kind })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_KIND}>{t("teams.subteams.kinds.none")}</SelectItem>
                  {SUBTEAM_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {t(`teams.subteams.kinds.${kind}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("teams.subteams.parent")}</Label>
              <Select value={form.parent} onValueChange={(parent) => setForm({ ...form, parent })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TOP_LEVEL}>{t("teams.subteams.topLevel")}</SelectItem>
                  {parentOptions.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {"— ".repeat(s.depth - 1)}
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>{t("teams.crm.label")}</Label>
            <TeamCrmDepartmentsField
              value={form.crmDepartments}
              onChange={(crmDepartments) => setForm({ ...form, crmDepartments })}
              subteam
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setForm(null)}>
              <X className="mr-2 h-4 w-4" />
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={() => saveMutation.mutate(form)}
              disabled={!form.name.trim() || saveMutation.isPending}
            >
              <Save className="mr-2 h-4 w-4" />
              {t("teams.subteams.save")}
            </Button>
          </div>
        </div>
      )}

      <div className="divide-y divide-gray-100 rounded-md border border-gray-200 dark:divide-gray-800 dark:border-gray-700">
        {ordered.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{t("teams.subteams.empty")}</p>
        ) : (
          ordered.map((s) => {
            const leaders = s.members.filter((m) => m.role === "leader").length;
            return (
              <div key={s.id} className={`flex items-center gap-3 py-2 pr-3 ${INDENT[s.depth - 1] ?? INDENT[INDENT.length - 1]}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{s.name}</span>
                    {s.kind && (
                      <Badge variant="outline" className="text-xs">
                        {t(`teams.subteams.kinds.${s.kind}`)}
                      </Badge>
                    )}
                    {!s.isActive && (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <PowerOff className="h-3 w-3" />
                        {t("teams.status.inactive")}
                      </Badge>
                    )}
                    {s.crmDepartments.map((d) => (
                      <Badge key={d} variant="outline" className="gap-1 text-xs" title={t("teams.crm.linkedTooltip")}>
                        <Building2 className="h-3 w-3" />
                        {crmLabel(d)}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("teams.subteams.counts", { members: s.members.length, leaders })}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setMembersFor(membersFor === s.id ? null : s.id)}
                    title={t("teams.subteams.people")}
                    aria-label={t("teams.subteams.people")}
                  >
                    <Users className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() =>
                      setForm({
                        id: s.id,
                        name: s.name,
                        kind: s.kind ?? NO_KIND,
                        parent: s.parentSubteamId === null ? TOP_LEVEL : String(s.parentSubteamId),
                        crmDepartments: s.crmDepartments,
                      })
                    }
                    title={t("teams.list.edit")}
                    aria-label={t("teams.list.edit")}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => toggleMutation.mutate(s)}
                    title={s.isActive ? t("teams.list.deactivate") : t("teams.list.activate")}
                    aria-label={s.isActive ? t("teams.list.deactivate") : t("teams.list.activate")}
                  >
                    {s.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                    onClick={() => setPendingDelete(s)}
                    title={t("teams.list.delete")}
                    aria-label={t("teams.list.delete")}
                  >
                    <Trash2 className="h-4 w-4 red-trash-icon" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {editing && (
        <SubteamPeopleEditor
          key={editing.id}
          teamId={team.id}
          subteam={editing}
          teamPeople={people.filter((p) => team.members.some((m) => m.userId === p.id))}
          onDone={() => setMembersFor(null)}
        />
      )}

      <ConfirmationDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("teams.subteams.deleteDialog.title", { name: pendingDelete?.name ?? "" })}
        description={t("teams.subteams.deleteDialog.description")}
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

function SubteamPeopleEditor({
  teamId,
  subteam,
  teamPeople,
  onDone,
}: {
  teamId: number;
  subteam: SubteamSummary;
  teamPeople: TeamPerson[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [roles, setRoles] = useState<Record<string, SubteamRole>>(() =>
    Object.fromEntries(subteam.members.map((m) => [m.userId, m.role])),
  );

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/teams/${teamId}/subteams/${subteam.id}/members`, {
        members: Object.entries(roles).map(([userId, role]) => ({ userId, role })),
      }),
    onSuccess: () => {
      invalidateTeams();
      showSuccessToast(t("teams.subteams.toasts.peopleSaved", { name: subteam.name }));
      onDone();
    },
    onError: (error) => showErrorToast(t("teams.toasts.errorTitle"), t(teamErrorKey(error))),
  });

  const setRole = (userId: string, value: string) =>
    setRoles((prev) => {
      const next = { ...prev };
      if (value === NOT_IN_SUBTEAM) delete next[userId];
      else next[userId] = value as SubteamRole;
      return next;
    });

  return (
    <div className="space-y-3 rounded-md border border-gray-200 p-3 dark:border-gray-700">
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
        {t("teams.subteams.peopleTitle", { name: subteam.name })}
      </p>
      {teamPeople.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("teams.subteams.noTeamMembers")}</p>
      ) : (
        <div className="max-h-64 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
          {teamPeople.map((p) => (
            <div key={p.id} className="flex items-center gap-3 py-1.5">
              <span className="flex-1 text-sm text-gray-900 dark:text-gray-100">{personName(p)}</span>
              <Select value={roles[p.id] ?? NOT_IN_SUBTEAM} onValueChange={(v) => setRole(p.id, v)}>
                <SelectTrigger className="h-8 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NOT_IN_SUBTEAM}>{t("teams.subteams.roles.none")}</SelectItem>
                  <SelectItem value="member">{t("teams.subteams.roles.member")}</SelectItem>
                  <SelectItem value="leader">{t("teams.subteams.roles.leader")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onDone}>
          <X className="mr-2 h-4 w-4" />
          {t("common.cancel")}
        </Button>
        <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          <Save className="mr-2 h-4 w-4" />
          {t("teams.subteams.savePeople")}
        </Button>
      </div>
    </div>
  );
}
