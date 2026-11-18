import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ListTodo, Info, Waypoints, CircleCheckBig, FolderOpen, Bot, AlignVerticalSpaceAround, ShieldAlert, BookMarked } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface TabVisibility {
  map?: boolean;
  "success-criteria"?: boolean;
  artifacts?: boolean;
  "projectiq-coach"?: boolean;
  gaps?: boolean;
  "assumptions-dependencies"?: boolean;
}

interface DeliverabilityVisibilityValue {
  cardVisible: boolean;
  tabs: TabVisibility;
}

interface DeliverabilityVisibilityModalProps {
  open: boolean;
  onClose: () => void;
  projectId: number;
  currentVisibility: DeliverabilityVisibilityValue | null | undefined;
  isAdmin: boolean;
}

const DEFAULT_VISIBILITY: DeliverabilityVisibilityValue = {
  cardVisible: true,
  tabs: {
    map: true,
    "success-criteria": true,
    artifacts: true,
    "projectiq-coach": false,
    gaps: false,
    "assumptions-dependencies": true,
  },
};

function mergeWithDefaults(v: DeliverabilityVisibilityValue | null | undefined): DeliverabilityVisibilityValue {
  if (!v) return DEFAULT_VISIBILITY;
  return {
    cardVisible: v.cardVisible ?? true,
    tabs: {
      map: v.tabs?.map ?? true,
      "success-criteria": v.tabs?.["success-criteria"] ?? true,
      artifacts: v.tabs?.artifacts ?? true,
      "projectiq-coach": v.tabs?.["projectiq-coach"] ?? false,
      gaps: v.tabs?.gaps ?? false,
      "assumptions-dependencies": v.tabs?.["assumptions-dependencies"] ?? true,
    },
  };
}

interface TabRow {
  key: keyof TabVisibility;
  label: string;
  icon: React.ReactNode;
  adminOnly: boolean;
}

export function DeliverabilityVisibilityModal({
  open,
  onClose,
  projectId,
  currentVisibility,
  isAdmin,
}: DeliverabilityVisibilityModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const visibility = mergeWithDefaults(currentVisibility);

  const saveMutation = useMutation({
    mutationFn: (payload: DeliverabilityVisibilityValue) =>
      apiRequest("PATCH", `/api/projects/${projectId}/deliverables-visibility`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
    },
  });

  function setCardVisible(value: boolean) {
    const next: DeliverabilityVisibilityValue = { ...visibility, cardVisible: value };
    saveMutation.mutate(next);
  }

  function setTabVisible(key: keyof TabVisibility, value: boolean) {
    const next: DeliverabilityVisibilityValue = {
      ...visibility,
      tabs: { ...visibility.tabs, [key]: value },
    };
    saveMutation.mutate(next);
  }

  const cardHidden = !visibility.cardVisible;
  const tabsDisabled = cardHidden;

  const tabRows: TabRow[] = [
    {
      key: "map",
      label: t('project.deliverables.tabs.map'),
      icon: <Waypoints className="h-4 w-4 text-blue-500" />,
      adminOnly: false,
    },
    {
      key: "success-criteria",
      label: t('project.deliverables.tabs.successCriteria'),
      icon: <CircleCheckBig className="h-4 w-4 text-blue-500" />,
      adminOnly: false,
    },
    {
      key: "assumptions-dependencies",
      label: t('project.deliverables.tabs.assumptionsDependencies'),
      icon: <BookMarked className="h-4 w-4 text-blue-500" />,
      adminOnly: false,
    },
    {
      key: "artifacts",
      label: t('project.deliverables.tabs.artifacts'),
      icon: <FolderOpen className="h-4 w-4 text-blue-500" />,
      adminOnly: false,
    },
    {
      key: "gaps",
      label: t('project.deliverables.tabs.gapAnalysis'),
      icon: <AlignVerticalSpaceAround className="h-4 w-4 text-blue-500" />,
      adminOnly: true,
    },
    {
      key: "projectiq-coach",
      label: t('project.deliverables.tabs.projectIqCoach'),
      icon: <Bot className="h-4 w-4 text-blue-500" />,
      adminOnly: true,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListTodo className="h-5 w-5 text-purple-700" />
            {t('project.deliverables.title')}
          </DialogTitle>
        </DialogHeader>

        {/* Info callout */}
        <div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40 px-4 py-3 text-sm text-blue-800 dark:text-blue-200">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="space-y-1.5">
            <p><span className="font-semibold">{t('project.deliverables.affectedRolesLabel')}</span> {t('project.deliverables.affectedRolesText')}</p>
            <p><span className="font-semibold">{t('project.deliverables.shareLabel')}</span> {t('project.deliverables.shareText')} <span className="font-semibold">{t('project.deliverables.hideLabel')}</span> {t('project.deliverables.hideText')}</p>
            <p className="font-semibold text-blue-900 dark:text-blue-100">{t('project.deliverables.precedenceNote')}</p>
            <p className="flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span><span className="font-semibold text-amber-800 dark:text-amber-300">{t('project.deliverables.internalOnlyToolsLabel')}</span> {t('project.deliverables.internalOnlyToolsText')}</span>
            </p>
          </div>
        </div>

        {/* Card-level row */}
        <div className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 px-4 py-3">
          <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-slate-100">
            <ListTodo className="h-4 w-4 text-purple-700" />
            {t('project.deliverables.projectDeliverables')}
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${cardHidden ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
              {cardHidden ? t('project.deliverables.hidden') : t('project.deliverables.shared')}
            </span>
            <Switch
              checked={visibility.cardVisible}
              onCheckedChange={setCardVisible}
              disabled={saveMutation.isPending}
              className={cardHidden ? "[&>span]:bg-red-500 bg-red-200 dark:bg-red-900" : ""}
            />
          </div>
        </div>

        <Separator />

        {/* Tab rows */}
        <div className={`space-y-2 transition-opacity ${tabsDisabled ? "opacity-40 pointer-events-none" : ""}`}>
          <p className="text-xs text-gray-500 dark:text-slate-400 font-medium uppercase tracking-wide px-1">
            {t('project.deliverables.tabVisibility')}
          </p>
          {tabRows.map(({ key, label, icon, adminOnly }) => {
            const tabVisible = visibility.tabs[key] ?? (adminOnly ? false : true);
            const tabHidden = !tabVisible;
            const switchDisabled = saveMutation.isPending || tabsDisabled || (adminOnly && !isAdmin);

            return (
              <div
                key={key}
                className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-slate-700 px-4 py-2.5"
              >
                <div className="flex items-center gap-2 text-sm text-gray-800 dark:text-slate-200">
                  {icon}
                  {label}
                  {adminOnly && !isAdmin && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-700">
                      <ShieldAlert className="h-3 w-3" />
                      {t('project.deliverables.adminUnhideOnly')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!(adminOnly && !isAdmin) && (
                    <span className={`text-xs font-medium ${tabHidden ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                      {tabHidden ? t('project.deliverables.hidden') : t('project.deliverables.shared')}
                    </span>
                  )}
                  <Switch
                    checked={tabVisible}
                    onCheckedChange={(v) => setTabVisible(key, v)}
                    disabled={switchDisabled}
                    className={
                      adminOnly && !isAdmin
                        ? "opacity-40 cursor-not-allowed"
                        : tabHidden
                        ? "[&>span]:bg-red-500 bg-red-200 dark:bg-red-900"
                        : ""
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>

        {tabsDisabled && (
          <p className="text-xs text-red-600 dark:text-red-400 text-center">
            {t('project.deliverables.tabsOverriddenWarning')}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
