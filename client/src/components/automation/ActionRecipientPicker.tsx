// Recipient checklist for Workflow Automation actions (Send Email and
// Schedule Digest). Saves the selected user ids to params.recipientUserIds,
// and teams and subteams to params.recipientTeamIds / recipientSubteamIds,
// which the engine reads (server/email/digest-utils.ts). For MAP rules it
// also offers "the item's assignee" (saved as "item_assignee").
import { useTranslation } from "react-i18next";
import { UserCheck } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { TeamTargetsPicker } from "@/components/teams/team-targets-picker";
import { parseTargetIds } from "@shared/teams";

interface RecipientUser {
  id: string | number;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

interface ActionRecipientPickerProps {
  users: RecipientUser[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Shown under the list when nobody is selected. */
  emptyHint?: string;
  /** Offer "the item's assignee" (rules with a MAP trigger). */
  showAssignee?: boolean;
}

/** Saved recipient value for "whoever the MAP item is assigned to". */
export const ITEM_ASSIGNEE = "item_assignee";

export function ActionRecipientPicker({ users, selectedIds, onChange, emptyHint, showAssignee = false }: ActionRecipientPickerProps) {
  const { t } = useTranslation();

  const toggle = (id: string, checked: boolean) => {
    onChange(checked ? [...selectedIds, id] : selectedIds.filter((existing) => existing !== id));
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{t("automation.actionRecipients.label")}</Label>
      <div className="border rounded-md p-2 max-h-32 overflow-y-auto bg-background dark:bg-gray-900 space-y-1">
        {(showAssignee || selectedIds.includes(ITEM_ASSIGNEE)) && (
          <label
            className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 dark:hover:bg-gray-800 rounded px-1 py-0.5 border-b border-gray-100 dark:border-gray-800 pb-1"
            title={t("automation.actionRecipients.itemAssigneeHint")}
          >
            <Checkbox
              checked={selectedIds.includes(ITEM_ASSIGNEE)}
              onCheckedChange={(checked) => toggle(ITEM_ASSIGNEE, checked === true)}
              data-testid="recipient-item-assignee"
            />
            <UserCheck className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium text-gray-700 dark:text-gray-300">{t("automation.actionRecipients.itemAssignee")}</span>
          </label>
        )}
        {users.length === 0 && (
          <p className="text-xs text-muted-foreground px-1">{t("automation.actionRecipients.noUsers")}</p>
        )}
        {users.map((user) => {
          const id = String(user.id);
          return (
            <label
              key={id}
              className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 dark:hover:bg-gray-800 rounded px-1 py-0.5"
            >
              <Checkbox checked={selectedIds.includes(id)} onCheckedChange={(checked) => toggle(id, checked === true)} />
              <span className="text-gray-700 dark:text-gray-300">
                {user.firstName} {user.lastName}
              </span>
              {user.email && <span className="text-xs text-muted-foreground">({user.email})</span>}
            </label>
          );
        })}
      </div>
      {selectedIds.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("automation.actionRecipients.selected", { count: selectedIds.length })}
        </p>
      ) : (
        emptyHint && <p className="text-xs text-muted-foreground">{emptyHint}</p>
      )}
    </div>
  );
}

/** Teams and subteams for a Send Email or Schedule Digest action. */
export function ActionTeamRecipientPicker({
  params,
  onChange,
}: {
  params: Record<string, unknown> | null | undefined;
  onChange: (teamParams: { recipientTeamIds: number[]; recipientSubteamIds: number[] }) => void;
}) {
  const { t } = useTranslation();
  const value = {
    teamIds: parseTargetIds(params?.recipientTeamIds),
    subteamIds: parseTargetIds(params?.recipientSubteamIds),
  };
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{t("teams.targets.actionLabel")}</Label>
      <TeamTargetsPicker
        value={value}
        onChange={(next) => onChange({ recipientTeamIds: next.teamIds, recipientSubteamIds: next.subteamIds })}
        emptyLabel={t("teams.targets.noTeamsPicked")}
      />
    </div>
  );
}
