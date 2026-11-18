// Assignment chips for a phase, step or task. Only filled roles show; a role
// the item inherits from its step or phase shows faded with where it comes
// from. "+ Assign" opens one picker: choose a role, then a person (or a
// department for the customer team, or a team for "Our team"). Only the roles
// the plan has switched on (people.roles) show; values saved under a
// switched-off role are kept, just hidden.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Building2, Check, Plus, Users, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getDepartmentLabel } from "@/config/departments";
import type { MapPeople } from "./use-map-people";
import {
  type AssignableItem,
  type AssignmentRole,
  assignmentValue,
  initialsOf,
} from "./map-plan-utils";

/** Avatar colors per role: teal for the customer's side, sky/indigo/purple for ours, amber for a customer team. */
export const ROLE_AVATAR: Record<AssignmentRole, string> = {
  customerTeam: "bg-amber-600 dark:bg-amber-500",
  customerOwner: "bg-teal-700 dark:bg-teal-500",
  internalTeam: "bg-sky-700 dark:bg-sky-500",
  internalOwner: "bg-indigo-700 dark:bg-indigo-500",
  additionalInternal: "bg-purple-700 dark:bg-purple-500",
};

export interface InheritSource {
  item: AssignableItem;
  /** "Step 3" / "Phase 1", already translated. */
  label: string;
}

interface Assignment {
  role: AssignmentRole;
  value: string;
  inheritedFrom?: string;
}

function useAssignments(item: AssignableItem, parents: readonly InheritSource[], roles: readonly AssignmentRole[]): Assignment[] {
  const out: Assignment[] = [];
  for (const role of roles) {
    const own = assignmentValue(item, role);
    if (own) {
      out.push({ role, value: own });
      continue;
    }
    for (const parent of parents) {
      const value = assignmentValue(parent.item, role);
      if (value) {
        out.push({ role, value, inheritedFrom: parent.label });
        break;
      }
    }
  }
  return out;
}

function useAssignmentLabel(people: MapPeople) {
  const { t } = useTranslation();
  return (assignment: { role: AssignmentRole; value: string }) => {
    if (assignment.role === "customerTeam") return getDepartmentLabel(assignment.value, t);
    if (assignment.role === "internalTeam") return people.teamNameFor(assignment.value) ?? t("mapPlan.assign.unknownTeam");
    return people.nameFor(assignment.value) ?? t("mapPlan.assign.unknownPerson");
  };
}

export function useRoleLabel(people: MapPeople) {
  const { t } = useTranslation();
  return (role: AssignmentRole) =>
    t(`mapPlan.assign.roles.${role}`, { customer: people.customerName || t("mapPlan.assign.customerFallback") });
}

function Avatar({ role, label, size = "md" }: { role: AssignmentRole; label: string; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "inline-grid flex-none place-items-center rounded-full font-bold text-white",
        size === "sm" ? "h-5 w-5 text-[9px]" : "h-6 w-6 text-[10px]",
        ROLE_AVATAR[role],
      )}
      aria-hidden="true"
    >
      {role === "customerTeam" ? (
        <Building2 className="h-3 w-3" />
      ) : role === "internalTeam" ? (
        <Users className="h-3 w-3" />
      ) : (
        initialsOf(label)
      )}
    </span>
  );
}

interface AvatarStackProps {
  item: AssignableItem;
  parents: readonly InheritSource[];
  people: MapPeople;
}

/** Compact owners for a row: one overlapping avatar per filled role, inherited ones faded. */
export function MapAvatarStack({ item, parents, people }: AvatarStackProps) {
  const assignments = useAssignments(item, parents, people.roles);
  const labelOf = useAssignmentLabel(people);
  const roleLabel = useRoleLabel(people);
  const { t } = useTranslation();
  if (assignments.length === 0) {
    return <span className="text-[11px] text-gray-400 dark:text-gray-500">{t("mapPlan.assign.nobody")}</span>;
  }
  return (
    <TooltipProvider delayDuration={200}>
      <span className="inline-flex items-center">
        {assignments.map((a, index) => (
          <Tooltip key={a.role}>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "rounded-full ring-2 ring-white dark:ring-gray-900",
                  index > 0 && "-ml-1.5",
                  a.inheritedFrom && "opacity-50",
                )}
              >
                <Avatar role={a.role} label={labelOf(a)} size="sm" />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-medium">{labelOf(a)}</p>
              <p className="text-xs opacity-80">
                {roleLabel(a.role)}
                {a.inheritedFrom ? ` · ${t("mapPlan.assign.inheritedFrom", { source: a.inheritedFrom })}` : ""}
              </p>
            </TooltipContent>
          </Tooltip>
        ))}
      </span>
    </TooltipProvider>
  );
}

interface AssigneeChipsProps extends AvatarStackProps {
  canEdit: boolean;
  /** Roles to show and offer; defaults to the plan's (people.roles). */
  roles?: readonly AssignmentRole[];
  onAssign: (role: AssignmentRole, value: string | null) => void;
}

/** Full chips with names and roles, plus "+ Assign" for editors. Used in the detail pane. */
export function MapAssigneeChips({ item, parents, people, canEdit, roles = people.roles, onAssign }: AssigneeChipsProps) {
  const { t } = useTranslation();
  const assignments = useAssignments(item, parents, roles);
  const labelOf = useAssignmentLabel(people);
  const roleLabel = useRoleLabel(people);

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="map-assignee-chips">
      {assignments.length === 0 && !canEdit && (
        <span className="text-xs text-gray-500 dark:text-gray-400">{t("mapPlan.assign.nobody")}</span>
      )}
      {assignments.map((a) => (
        <span
          key={a.role}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border bg-white py-0.5 pl-0.5 pr-2 text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-200",
            a.inheritedFrom
              ? "border-dashed border-gray-300 opacity-70 dark:border-gray-600"
              : "border-gray-200 dark:border-gray-700",
          )}
          data-testid={`map-assignee-${a.role}`}
        >
          <Avatar role={a.role} label={labelOf(a)} />
          <span className="font-medium">{labelOf(a)}</span>
          <span className="text-[10px] text-gray-500 dark:text-gray-400">
            {a.inheritedFrom ? t("mapPlan.assign.inheritedFrom", { source: a.inheritedFrom }) : roleLabel(a.role)}
          </span>
          {canEdit && !a.inheritedFrom && (
            <button
              type="button"
              onClick={() => onAssign(a.role, null)}
              className="ml-0.5 rounded-full p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              aria-label={t("mapPlan.assign.remove", { role: roleLabel(a.role) })}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      {canEdit && <MapAssignPicker item={item} people={people} roles={roles} onAssign={onAssign} />}
    </div>
  );
}

interface AssignPickerProps {
  item: AssignableItem;
  people: MapPeople;
  roles: readonly AssignmentRole[];
  onAssign: (role: AssignmentRole, value: string | null) => void;
}

function MapAssignPicker({ item, people, roles, onAssign }: AssignPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<AssignmentRole | null>(null);
  const roleLabel = useRoleLabel(people);
  const labelOf = useAssignmentLabel(people);

  const choose = (value: string | null) => {
    if (role) onAssign(role, value);
    setOpen(false);
    setRole(null);
  };

  const current = role ? assignmentValue(item, role) : null;
  const options =
    role === "customerTeam"
      ? people.departments.map((d) => ({ id: d.value, name: getDepartmentLabel(d.value, t), detail: undefined as string | undefined }))
      : role
        ? people.options[role]
        : [];

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setRole(null);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-blue-600 px-2 py-0.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-950/50"
          data-testid="map-assign-open"
        >
          <Plus className="h-3 w-3" />
          {t("mapPlan.assign.add")}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        {!role ? (
          <div className="p-1" role="listbox" aria-label={t("mapPlan.assign.pickRole")}>
            <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t("mapPlan.assign.pickRole")}
            </p>
            {roles.map((r) => {
              const value = assignmentValue(item, r);
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
                  data-testid={`map-assign-role-${r}`}
                >
                  <span className="flex items-center gap-2">
                    <span className={cn("h-2.5 w-2.5 rounded-full", ROLE_AVATAR[r])} aria-hidden="true" />
                    {roleLabel(r)}
                  </span>
                  <span className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {value ? labelOf({ role: r, value }) : t("mapPlan.assign.notSet")}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <Command>
            <div className="flex items-center gap-1 border-b border-gray-100 px-1 py-1 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setRole(null)}
                className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                aria-label={t("mapPlan.assign.back")}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{roleLabel(role)}</span>
            </div>
            <CommandInput placeholder={t("mapPlan.assign.search")} />
            <CommandList>
              <CommandEmpty>{t(role === "internalTeam" ? "mapPlan.assign.noTeams" : "mapPlan.assign.noPeople")}</CommandEmpty>
              <CommandGroup>
                {current && (
                  <CommandItem value={`__unassign__ ${t("mapPlan.assign.unassign")}`} onSelect={() => choose(null)}>
                    <X className="mr-2 h-3.5 w-3.5" />
                    {t("mapPlan.assign.unassign")}
                  </CommandItem>
                )}
                {options.map((person) => (
                  <CommandItem key={person.id} value={`${person.name} ${person.id}`} onSelect={() => choose(person.id)}>
                    <Check className={cn("mr-2 h-3.5 w-3.5", current === person.id ? "opacity-100" : "opacity-0")} />
                    <span className="flex-1 truncate">{person.name}</span>
                    {person.detail && (
                      <span className="ml-2 truncate text-[10px] text-gray-500 dark:text-gray-400">
                        {t(`mapPlan.assign.detail.${person.detail}`, { defaultValue: person.detail })}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}
