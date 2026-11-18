import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { BentoCard } from "@/components/customer-workspace/BentoTiles";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { isMapExternalRole } from "@shared/map-drawer-tabs";
import { handoffKey, useHandoffTeam } from "./use-value-journey";

/** A staff member the handoff team can be picked from (GET /api/users). */
export interface HandoffCandidate {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  role?: string | null;
}

const MAX_MEMBERS = 10;

function displayName(user: HandoffCandidate): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email || user.id;
}

interface Draft {
  key: number;
  userId: string;
  responsibility: string;
}

/**
 * The Pro Services people who take the customer over after the sale (the
 * warm handoff). Staff only: the page renders it for internal users alone.
 */
export function HandoffTeamCard({
  projectId,
  canEdit,
  users,
}: {
  projectId: number;
  canEdit: boolean;
  users: HandoffCandidate[];
}) {
  const { t } = useTranslation();
  const { data: team = [], isLoading } = useHandoffTeam(projectId);
  const [editing, setEditing] = useState(false);

  if (isLoading) return null;

  return (
    <BentoCard
      title={
        <span className="inline-flex items-center gap-2">
          <UsersRound className="h-4 w-4 text-primary" aria-hidden="true" />
          {t("valueJourney.handoff.title")}
        </span>
      }
      action={
        canEdit ? (
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditing(true)} data-testid="handoff-edit">
            <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            {t("valueJourney.handoff.edit")}
          </Button>
        ) : null
      }
      data-testid="handoff-team"
    >
      {team.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("valueJourney.handoff.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {team.map((member) => (
            <li key={member.userId} className="flex items-baseline justify-between gap-3 text-sm" data-testid={`handoff-member-${member.userId}`}>
              <span className="min-w-0">
                <span className="font-medium text-slate-900 dark:text-slate-100">{member.name || member.email || t("valueJourney.handoff.unknownUser")}</span>
                {member.role ? <span className="ml-1.5 text-xs text-slate-500 dark:text-slate-400">{member.role}</span> : null}
              </span>
              {member.responsibility ? (
                <span className="truncate text-xs text-slate-600 dark:text-slate-300">{member.responsibility}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <HandoffTeamDialog
          open={editing}
          onOpenChange={setEditing}
          projectId={projectId}
          users={users}
          initial={team.map((member) => ({ userId: member.userId, responsibility: member.responsibility ?? "" }))}
        />
      ) : null}
    </BentoCard>
  );
}

function HandoffTeamDialog({
  open,
  onOpenChange,
  projectId,
  users,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  users: HandoffCandidate[];
  initial: Array<{ userId: string; responsibility: string }>;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Draft[]>([]);

  useEffect(() => {
    if (open) setRows(initial.map((row, index) => ({ key: index, ...row })));
    // Reset only when the dialog opens, not on every refetch while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Staff only, Pro Services first so the usual pick is at the top.
  const options = useMemo<SearchableSelectOption[]>(() => {
    const staff = users.filter((user) => !isMapExternalRole(user.role));
    const rank = (user: HandoffCandidate) => (user.role === "ProServ" ? 0 : 1);
    return [...staff]
      .sort((a, b) => rank(a) - rank(b) || displayName(a).localeCompare(displayName(b)))
      .map((user) => ({ value: user.id, label: user.role ? `${displayName(user)} · ${user.role}` : displayName(user) }));
  }, [users]);

  const save = useMutation({
    mutationFn: () => {
      const seen = new Set<string>();
      const members = rows
        .filter((row) => row.userId && !seen.has(row.userId) && seen.add(row.userId))
        .map((row) => ({ userId: row.userId, responsibility: row.responsibility.trim() || null }));
      return apiRequest("PUT", handoffKey(projectId), { members });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [handoffKey(projectId)] });
      showSuccessToast("valueJourney.handoff.savedTitle", "valueJourney.handoff.savedDescription");
      onOpenChange(false);
    },
    onError: () => showErrorToast("common.error", "valueJourney.handoff.saveFailed"),
  });

  const update = (key: number, patch: Partial<Draft>) => setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const nextKey = rows.reduce((max, row) => Math.max(max, row.key), -1) + 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="handoff-dialog">
        <DialogHeader>
          <DialogTitle>{t("valueJourney.handoff.dialogTitle")}</DialogTitle>
          <DialogDescription>{t("valueJourney.handoff.dialogDescription")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {rows.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">{t("valueJourney.handoff.empty")}</p> : null}
          {rows.map((row) => (
            <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
              <SearchableSelect
                options={options}
                value={row.userId}
                onValueChange={(userId) => update(row.key, { userId })}
                placeholder={t("valueJourney.handoff.pickPerson")}
                searchPlaceholder={t("valueJourney.handoff.searchPeople")}
                emptyText={t("valueJourney.handoff.noPeople")}
              />
              <Input
                value={row.responsibility}
                onChange={(e) => update(row.key, { responsibility: e.target.value })}
                placeholder={t("valueJourney.handoff.responsibilityPlaceholder")}
                aria-label={t("valueJourney.handoff.responsibility")}
                maxLength={100}
                className="h-9"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40"
                onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                aria-label={t("valueJourney.handoff.remove")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {rows.length < MAX_MEMBERS ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => setRows((prev) => [...prev, { key: nextKey, userId: "", responsibility: "" }])}
              data-testid="handoff-add"
            >
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
              {t("valueJourney.handoff.add")}
            </Button>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={() => save.mutate()} disabled={save.isPending} data-testid="handoff-save">
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
