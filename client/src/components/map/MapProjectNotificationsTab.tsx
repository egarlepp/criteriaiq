// The MAP drawer's Notifications tab (internal users only): which MAP email
// events each person on the project gets, per phases / steps / tasks. People
// are split into Internal (collapsed by default) and External (customers,
// guests and partners; expanded by default). Each card is compact: the edit
// button is an icon in its top-right corner, and the avatar uses the color of
// the person's role (Admin › Role Management).
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BellOff, Check, ChevronDown, ChevronRight, Clock, Info, Mail, Settings2, Users, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";
import { formatFullName } from "@/lib/nameUtils";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { cn } from "@/lib/utils";
import { isMapExternalRole } from "@shared/map-drawer-tabs";

interface MapProjectNotificationsTabProps {
  projectId: number;
}

type Preference = "do_not_send" | "project_decides";

interface UserNotificationSettings {
  userId: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  /** Database-driven, from Role Management. */
  role: string;
  projectRole: string;
  overallPreference: Preference;
  phasesPreference: Preference;
  stepsPreference: Preference;
  tasksPreference: Preference;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  phasesSettings: string[];
  stepsSettings: string[];
  tasksSettings: string[];
  phasesEditable: boolean;
  stepsEditable: boolean;
  tasksEditable: boolean;
  canEdit: boolean;
}

interface NotificationSettingsResponse {
  users: UserNotificationSettings[];
  currentUserId: number;
  canEditAll: boolean;
}

interface RoleConfig {
  name: string;
  color?: string | null;
  icon?: string | null;
}

const EVENTS = ["assigned", "completed", "due_soon", "status_changed"] as const;
type EventType = (typeof EVENTS)[number];

/** Server project-role labels → translation keys. */
const PROJECT_ROLE_KEY: Record<string, string> = {
  "Account Representative": "accountRepresentative",
  "Primary Engineer": "primaryEngineer",
  "Specialist Engineer": "specialistEngineer",
  "Supporting Engineer": "supportingEngineer",
  "Additional Supporting Team": "additionalSupportingTeam",
  "Customer User": "customerUser",
  "Additional Access": "additionalAccess",
};

const FALLBACK_ROLE_COLOR = "#6b7280";

function initials(user: UserNotificationSettings): string {
  if (user.firstName && user.lastName) return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
  if (user.firstName) return user.firstName.slice(0, 2).toUpperCase();
  return user.email.slice(0, 2).toUpperCase();
}

function useQuietHours() {
  const { i18n } = useTranslation();
  return (start: number, end: number) => {
    const fmt = (hour: number) => {
      const d = new Date(2000, 0, 1, hour);
      try {
        return new Intl.DateTimeFormat(i18n.language || "en-US", { hour: "numeric" }).format(d);
      } catch {
        return new Intl.DateTimeFormat("en-US", { hour: "numeric" }).format(d);
      }
    };
    return `${fmt(start)} – ${fmt(end)}`;
  };
}

interface EventsPickerProps {
  id: string;
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  disabled: boolean;
}

function EventsPicker({ id, label, value, onChange, disabled }: EventsPickerProps) {
  const { t } = useTranslation();
  const eventLabel = (event: EventType) => t(`mapNotifications.events.${event}`);
  const display =
    value.length === 0
      ? t("mapNotifications.picker.none")
      : value.length === EVENTS.length
        ? t("mapNotifications.picker.all")
        : value.length === 1 && (EVENTS as readonly string[]).includes(value[0])
          ? eventLabel(value[0] as EventType)
          : t("mapNotifications.picker.some", { count: value.length });
  const toggle = (event: EventType) =>
    onChange(value.includes(event) ? value.filter((v) => v !== event) : [...value, event]);

  return (
    <div className="min-w-0 space-y-0.5">
      <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{label}</div>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-full justify-between px-2 text-left text-xs font-normal disabled:bg-gray-50 dark:disabled:bg-gray-800/60"
            disabled={disabled}
            data-testid={`map-notify-${id}`}
          >
            <span className="truncate">{display}</span>
            <ChevronDown className="ml-1 h-3.5 w-3.5 flex-none opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-60 p-2" align="start">
          <div className="mb-1 flex gap-1 border-b border-gray-100 pb-1 dark:border-gray-800">
            <Button variant="ghost" size="sm" className="h-7 flex-1 text-xs" onClick={() => onChange([...EVENTS])}>
              <Check className="mr-1 h-3 w-3" />
              {t("mapNotifications.picker.selectAll")}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 flex-1 text-xs" onClick={() => onChange([])}>
              <X className="mr-1 h-3 w-3" />
              {t("mapNotifications.picker.clearAll")}
            </Button>
          </div>
          {EVENTS.map((event) => {
            const checkboxId = `${id}-${event}`;
            return (
              <div key={event} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-800">
                <Checkbox id={checkboxId} checked={value.includes(event)} onCheckedChange={() => toggle(event)} />
                <label htmlFor={checkboxId} className="flex-1 cursor-pointer text-sm text-gray-800 dark:text-gray-200">
                  {eventLabel(event)}
                </label>
              </div>
            );
          })}
        </PopoverContent>
      </Popover>
    </div>
  );
}

interface PersonCardProps {
  user: UserNotificationSettings;
  projectId: number;
  role: RoleConfig | undefined;
}

function PersonCard({ user, projectId, role }: PersonCardProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const quietHours = useQuietHours();
  const [isEditing, setIsEditing] = useState(false);
  const [phases, setPhases] = useState(user.phasesSettings);
  const [steps, setSteps] = useState(user.stepsSettings);
  const [tasks, setTasks] = useState(user.tasksSettings);
  const blocked = user.overallPreference === "do_not_send";
  const roleColor = role?.color || FALLBACK_ROLE_COLOR;
  const name = formatFullName(user.firstName, user.lastName) || user.email;
  const projectRoleKey = PROJECT_ROLE_KEY[user.projectRole];

  const save = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/projects/${projectId}/users/${user.userId}/notification-settings`, {
        phasesSettings: phases,
        stepsSettings: steps,
        tasksSettings: tasks,
      }),
    onSuccess: () => {
      showSuccessToast("mapNotifications.toasts.saved.title", "mapNotifications.toasts.saved.description");
      void queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "notification-settings"] });
      setIsEditing(false);
    },
    onError: () => showErrorToast("mapNotifications.toasts.saveFailed.title", "mapNotifications.toasts.saveFailed.description"),
  });

  const cancel = () => {
    setPhases(user.phasesSettings);
    setSteps(user.stepsSettings);
    setTasks(user.tasksSettings);
    setIsEditing(false);
  };

  const iconButton = (label: string, icon: ReactNode, onClick: () => void, testId: string, primary = false) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant={primary ? "default" : "ghost"}
          className="h-7 w-7"
          onClick={onClick}
          disabled={save.isPending}
          aria-label={label}
          data-testid={testId}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );

  return (
    <Card
      className={cn(
        "border",
        blocked && "border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-900/10",
      )}
      data-testid={`map-notify-person-${user.userId}`}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs font-semibold text-white" style={{ backgroundColor: roleColor }}>
              {initials(user)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{name}</span>
              <Badge
                className="flex w-fit shrink-0 items-center gap-1 px-1.5 py-0 text-[10px] text-white"
                style={{ backgroundColor: roleColor }}
              >
                {role?.icon?.trim() ? <DynamicIcon name={role.icon} className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                {user.role}
              </Badge>
              <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">
                {projectRoleKey ? t(`mapNotifications.projectRoles.${projectRoleKey}`) : user.projectRole}
              </Badge>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-500 dark:text-gray-400">
              <span className="flex min-w-0 items-center gap-1">
                <Mail className="h-3 w-3 flex-none" />
                <span className="truncate">{user.email}</span>
              </span>
              {user.quietHoursStart !== null && user.quietHoursEnd !== null && (
                <span className="flex items-center gap-1 text-purple-700 dark:text-purple-300">
                  <Clock className="h-3 w-3" />
                  {t("mapNotifications.quietHours", { hours: quietHours(user.quietHoursStart, user.quietHoursEnd) })}
                </span>
              )}
              {blocked && (
                <span className="flex items-center gap-1 font-medium text-red-700 dark:text-red-300">
                  <BellOff className="h-3 w-3" />
                  {t("mapNotifications.blocked")}
                </span>
              )}
            </div>
          </div>
          {user.canEdit && (
            <div className="flex flex-none items-center gap-1">
              {isEditing ? (
                <>
                  {iconButton(t("mapNotifications.save"), <Check className="h-3.5 w-3.5" />, () => save.mutate(), "map-notify-save", true)}
                  {iconButton(t("common.cancel"), <X className="h-3.5 w-3.5" />, cancel, "map-notify-cancel")}
                </>
              ) : (
                iconButton(t("mapNotifications.edit"), <Settings2 className="h-3.5 w-3.5" />, () => setIsEditing(true), "map-notify-edit")
              )}
            </div>
          )}
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2">
          <EventsPicker
            id={`${user.userId}-phases`}
            label={t("mapNotifications.levels.phases")}
            value={isEditing ? phases : user.phasesSettings}
            onChange={setPhases}
            disabled={!isEditing || !user.phasesEditable}
          />
          <EventsPicker
            id={`${user.userId}-steps`}
            label={t("mapNotifications.levels.steps")}
            value={isEditing ? steps : user.stepsSettings}
            onChange={setSteps}
            disabled={!isEditing || !user.stepsEditable}
          />
          <EventsPicker
            id={`${user.userId}-tasks`}
            label={t("mapNotifications.levels.tasks")}
            value={isEditing ? tasks : user.tasksSettings}
            onChange={setTasks}
            disabled={!isEditing || !user.tasksEditable}
          />
        </div>
      </CardContent>
    </Card>
  );
}

interface GroupProps {
  id: "internal" | "external";
  users: UserNotificationSettings[];
  defaultOpen: boolean;
  projectId: number;
  roleFor: (name: string) => RoleConfig | undefined;
}

function PeopleGroup({ id, users, defaultOpen, projectId, roleFor }: GroupProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-lg border border-gray-200 dark:border-gray-800" data-testid={`map-notify-group-${id}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800/60"
      >
        <ChevronRight className={cn("h-4 w-4 transition-transform", open && "rotate-90")} />
        {t(`mapNotifications.groups.${id}`)}
        <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
          {users.length}
        </Badge>
      </button>
      {open && (
        <div className="space-y-2 border-t border-gray-100 p-2 dark:border-gray-800">
          {users.length === 0 ? (
            <p className="px-2 py-3 text-xs text-gray-500 dark:text-gray-400">{t("mapNotifications.groups.empty")}</p>
          ) : (
            users.map((user) => <PersonCard key={user.userId} user={user} projectId={projectId} role={roleFor(user.role)} />)
          )}
        </div>
      )}
    </section>
  );
}

export function MapProjectNotificationsTab({ projectId }: MapProjectNotificationsTabProps) {
  const { t } = useTranslation();
  const { data, isLoading, error } = useQuery<NotificationSettingsResponse>({
    queryKey: ["/api/projects", projectId, "notification-settings"],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/notification-settings`),
  });
  const { data: roles = [] } = useQuery<RoleConfig[]>({ queryKey: ["/api/roles"] });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{t("mapNotifications.loadFailed")}</AlertDescription>
      </Alert>
    );
  }

  const users = data?.users ?? [];
  const roleFor = (name: string) => roles.find((r) => r.name === name);
  const internal = users.filter((u) => !isMapExternalRole(u.role));
  const external = users.filter((u) => isMapExternalRole(u.role));
  const blockedCount = users.filter((u) => u.overallPreference === "do_not_send").length;
  const quietCount = users.filter((u) => u.quietHoursStart !== null && u.quietHoursEnd !== null).length;

  const stats = [
    { key: "total", value: users.length, icon: Users, tone: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" },
    { key: "blocked", value: blockedCount, icon: BellOff, tone: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
    { key: "quiet", value: quietCount, icon: Clock, tone: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" },
  ] as const;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-3">
        <Alert className="py-2">
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">{t("mapNotifications.intro")}</AlertDescription>
        </Alert>

        <div className="grid grid-cols-3 gap-2">
          {stats.map(({ key, value, icon: Icon, tone }) => (
            <div key={key} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800">
              <span className={cn("rounded-md p-1.5", tone)}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{value}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{t(`mapNotifications.stats.${key}`)}</span>
            </div>
          ))}
        </div>

        {users.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">{t("mapNotifications.empty")}</p>
        ) : (
          <>
            <PeopleGroup id="internal" users={internal} defaultOpen={false} projectId={projectId} roleFor={roleFor} />
            <PeopleGroup id="external" users={external} defaultOpen projectId={projectId} roleFor={roleFor} />
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
