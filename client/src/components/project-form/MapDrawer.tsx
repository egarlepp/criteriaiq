// The Mutual Action Plan drawer. Tabs: Plan (phase stepper, Next up / Full
// plan, detail pane on demand), Assignments, Timeline, Automation (internal
// users only, see shared/map-drawer-tabs.ts) and Notifications.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CalendarClock,
  Check,
  FolderGit2,
  ListChecks,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { MapTemplateSelector } from "./MapTemplateSelector";
import { MapAssignmentDialog } from "@/components/map/MapAssignmentDialog";
import { MapAssignmentTracker } from "@/components/map/MapAssignmentTracker";
import { MapProjectAutomationTab } from "@/components/map/MapProjectAutomationTab";
import { MapProjectNotificationsTab } from "@/components/map/MapProjectNotificationsTab";
import { MapCalendarTimeline } from "@/components/map/MapCalendarTimeline";
import { MapActivityTimeline } from "@/components/map/MapActivityTimeline";
import { MapSchedulingCard } from "@/components/map/MapSchedulingCard";
import { MAP_PLAN_MUTATION_KEY, MapPlanTab } from "@/components/map/plan/MapPlanTab";
import { MapRolesSetting } from "@/components/map/plan/MapRolesSetting";
import { MapOverallProgress } from "@/components/map/plan/MapOverallProgress";
import { QuickPlanStart } from "@/components/map/plan/QuickPlanStart";
import { formatShortDate } from "@/components/map/plan/map-plan-utils";
import type { ProjectMapData } from "@/types/map";
import { useMapRealtime } from "@/hooks/useMapRealtime";
import { useAuth } from "@/hooks/useAuth";
import { isMapExternalRole, mapDrawerTabsForRole, type MapDrawerTab } from "@shared/map-drawer-tabs";

interface MapDrawerProps {
  projectId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accessLevel?: "edit" | "view" | "read" | "none";
}

const PIN_STORAGE_KEY = "criteriaiq.mapPlan.detailPinned";

function readPinned(): boolean {
  try {
    return window.localStorage.getItem(PIN_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function storePinned(pinned: boolean) {
  try {
    window.localStorage.setItem(PIN_STORAGE_KEY, pinned ? "1" : "0");
  } catch {
    // Not remembered; the pane still opens on click.
  }
}

const TAB_ICON: Record<MapDrawerTab, typeof ListChecks> = {
  plan: ListChecks,
  assignments: UserPlus,
  timeline: CalendarClock,
  automation: FolderGit2,
  notifications: Bell,
};

interface AutomationConfigMeta {
  _metadata?: { isProjectSpecific?: boolean };
}

export function MapDrawer({ projectId, open, onOpenChange, accessLevel = "view" }: MapDrawerProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const role = user?.role ?? null;
  const isExternal = isMapExternalRole(role);
  const tabs = mapDrawerTabsForRole(role);
  // Admins and Engineers can always edit; anyone else needs edit access on the
  // project (the server checks the same thing on every write).
  const canEdit = accessLevel === "edit" || role === "Admin" || role === "Engineer";

  const [isTemplateSelectorOpen, setIsTemplateSelectorOpen] = useState(false);
  const [isAssignmentDialogOpen, setIsAssignmentDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<MapDrawerTab>("plan");
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [detailPinned, setDetailPinned] = useState(readPinned);
  const [detailOpen, setDetailOpen] = useState(detailPinned);

  useMapRealtime({ projectId });

  const { data: mapData, isLoading, error: mapError } = useQuery<ProjectMapData>({
    queryKey: ["/api/projects", projectId, "map"],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/map`),
    enabled: open && !!projectId,
    staleTime: 0,
  });

  const { data: automationConfig } = useQuery<AutomationConfigMeta | null>({
    queryKey: ["/api/projects", projectId, "map-automation-config"],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/map-automation-config`);
      if (!response.ok) return null;
      return response.json();
    },
    enabled: open && !!projectId && tabs.includes("automation"),
  });

  const saving = useIsMutating({ mutationKey: MAP_PLAN_MUTATION_KEY }) > 0;

  const renameMutation = useMutation({
    mutationFn: (mapName: string) => apiRequest("PUT", `/api/projects/${projectId}/map/name`, { mapName }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "map"] });
      setIsEditingName(false);
    },
    onError: () => showErrorToast("projects.form.mapDrawer.updateFailed", "projects.form.mapDrawer.updateFailedDescription"),
  });

  useEffect(() => {
    if (mapData?.metadata?.mapName) setEditedName(mapData.metadata.mapName);
  }, [mapData?.metadata?.mapName]);

  // A tab this role can't see (e.g. a remembered Automation tab after a role change) falls back to Plan.
  useEffect(() => {
    if (!tabs.includes(activeTab)) setActiveTab("plan");
  }, [tabs, activeTab]);

  const hasMap = !!mapData && mapData.phases.length > 0;
  const paneShown = activeTab === "plan" && hasMap && detailOpen;

  const togglePinned = () => {
    const next = !detailPinned;
    setDetailPinned(next);
    storePinned(next);
    setDetailOpen(next);
  };

  const saveName = () => {
    const next = editedName.trim();
    if (next && next !== mapData?.metadata?.mapName) renameMutation.mutate(next);
    else {
      setIsEditingName(false);
      setEditedName(mapData?.metadata?.mapName ?? "");
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className={cn(
            "flex w-full flex-col gap-0 overflow-y-auto p-0 transition-[max-width,width] duration-200",
            paneShown ? "sm:w-[1400px] sm:max-w-[96vw]" : "sm:w-[1000px] sm:max-w-[1000px]",
          )}
          data-testid="map-drawer"
        >
          <SheetHeader className="sticky top-0 z-10 space-y-0 border-b border-gray-200 bg-white px-6 py-3 pr-12 dark:border-gray-800 dark:bg-gray-950">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <SheetTitle className="flex items-center gap-2 text-base">
                  {isEditingName ? (
                    <span className="flex items-center gap-1">
                      <Input
                        id="map-drawer-name"
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveName();
                          if (e.key === "Escape") {
                            setIsEditingName(false);
                            setEditedName(mapData?.metadata?.mapName ?? "");
                          }
                        }}
                        aria-label={t("projects.form.mapDrawer.mapName")}
                        placeholder={t("projects.form.mapDrawer.enterMapName")}
                        className="h-8 w-[320px]"
                        maxLength={255}
                        autoFocus
                      />
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={saveName} disabled={renameMutation.isPending} aria-label={t("common.save")}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => {
                          setIsEditingName(false);
                          setEditedName(mapData?.metadata?.mapName ?? "");
                        }}
                        aria-label={t("common.cancel")}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </span>
                  ) : (
                    <>
                      <span className="truncate">{mapData?.metadata?.mapName || t("projects.form.mapDrawer.title")}</span>
                      {hasMap && canEdit && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-gray-500"
                          onClick={() => setIsEditingName(true)}
                          aria-label={t("mapPlan.header.rename")}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </>
                  )}
                </SheetTitle>
                <SheetDescription className="flex flex-wrap items-center gap-x-2 text-xs">
                  <span>{t("projects.form.mapDrawer.title")}</span>
                  {mapData?.metadata?.templateName && (
                    <span>· {t("mapPlan.header.fromTemplate", { name: mapData.metadata.templateName })}</span>
                  )}
                  {mapData?.metadata?.updatedAt && (
                    <span>· {t("mapPlan.header.updated", { date: formatShortDate(mapData.metadata.updatedAt, i18n.language) })}</span>
                  )}
                </SheetDescription>
              </div>
              {hasMap && (
                <div className="flex flex-none items-center gap-2">
                  <span
                    className={cn(
                      "flex items-center gap-1 text-xs",
                      saving ? "text-gray-500 dark:text-gray-400" : "text-green-700 dark:text-green-400",
                    )}
                    aria-live="polite"
                    data-testid="map-save-state"
                  >
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                    {saving ? t("mapPlan.header.saving") : t("mapPlan.header.saved")}
                  </span>
                  {activeTab === "plan" && (
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant={detailPinned ? "secondary" : "ghost"}
                            size="icon"
                            className="h-8 w-8"
                            onClick={togglePinned}
                            aria-pressed={detailPinned}
                            aria-label={detailPinned ? t("mapPlan.header.unpinDetail") : t("mapPlan.header.pinDetail")}
                            data-testid="map-detail-pin"
                          >
                            {detailPinned ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{detailPinned ? t("mapPlan.header.unpinDetail") : t("mapPlan.header.pinDetail")}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {canEdit && !isExternal && activeTab === "plan" && (
                    <MapRolesSetting projectId={projectId} stored={mapData?.metadata?.assignmentRoles} />
                  )}
                  {canEdit && !isExternal && (
                    <Button size="sm" variant="outline" className="h-8" onClick={() => setIsAssignmentDialogOpen(true)}>
                      <Users className="mr-1.5 h-3.5 w-3.5" />
                      {t("projects.form.mapDrawer.assignMapUsers")}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </SheetHeader>

          <div className="flex-1 px-6 py-4">
            {mapError ? (
              <Card className="border-red-200 dark:border-red-800">
                <CardContent className="pt-6 text-sm text-red-600 dark:text-red-400">
                  {t("projects.form.mapDrawer.failedToLoadMapData")}
                </CardContent>
              </Card>
            ) : isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-8 w-1/2" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : !hasMap ? (
              <QuickPlanStart projectId={projectId} canEdit={canEdit} onUseTemplate={() => setIsTemplateSelectorOpen(true)} />
            ) : (
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as MapDrawerTab)} className="w-full">
                <MapOverallProgress mapData={mapData} />
                {/* Underline tabs (page-tab-nav in index.css), left-aligned on one rule. */}
                <div className="page-tab-nav border-b border-gray-200 dark:border-gray-800">
                <TabsList className="h-auto justify-start gap-1 bg-transparent p-0 dark:bg-transparent">
                  {tabs.map((tab) => {
                    const Icon = TAB_ICON[tab];
                    return (
                      <TabsTrigger
                        key={tab}
                        value={tab}
                        className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 data-[state=active]:font-semibold"
                        data-testid={`map-tab-${tab}`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {t(`mapPlan.tabs.${tab}`)}
                        {tab === "automation" && automationConfig?._metadata?.isProjectSpecific && (
                          <Badge
                            variant="secondary"
                            className="ml-1 h-4 border-purple-200 bg-purple-100 px-1 py-0 text-[10px] text-purple-700 dark:border-purple-800 dark:bg-purple-900/30 dark:text-purple-300"
                          >
                            {t("mapPlan.tabs.custom")}
                          </Badge>
                        )}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
                </div>

                <TabsContent value="plan" className="mt-4">
                  <MapPlanTab
                    projectId={projectId}
                    mapData={mapData}
                    canEdit={canEdit}
                    isExternal={isExternal}
                    currentUserId={user?.id ?? null}
                    detailOpen={detailOpen}
                    onDetailOpenChange={(next) => setDetailOpen(next || detailPinned)}
                  />
                </TabsContent>

                {tabs.includes("assignments") && (
                  <TabsContent value="assignments" className="mt-4 space-y-4">
                    <MapAssignmentTracker projectId={projectId} />
                  </TabsContent>
                )}

                <TabsContent value="timeline" className="mt-4 space-y-3">
                  {!isExternal && <MapSchedulingCard projectId={projectId} />}
                  <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                    <MapCalendarTimeline projectId={projectId} />
                    <MapActivityTimeline projectId={projectId} compact />
                  </div>
                </TabsContent>

                {tabs.includes("automation") && (
                  <TabsContent value="automation" className="mt-4 space-y-4">
                    <MapProjectAutomationTab projectId={projectId} accessLevel={canEdit ? "edit" : "view"} />
                  </TabsContent>
                )}

                {tabs.includes("notifications") && (
                  <TabsContent value="notifications" className="mt-4 space-y-4">
                    <MapProjectNotificationsTab projectId={projectId} />
                  </TabsContent>
                )}
              </Tabs>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <MapTemplateSelector
        open={isTemplateSelectorOpen}
        onOpenChange={setIsTemplateSelectorOpen}
        projectId={projectId}
        onTemplateSelected={() => {
          setIsTemplateSelectorOpen(false);
          void queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "map"] });
          showSuccessToast("projects.form.mapDrawer.mapCreated", "projects.form.mapDrawer.mapCreatedDescription");
        }}
      />

      {hasMap && (
        <MapAssignmentDialog
          isOpen={isAssignmentDialogOpen}
          onOpenChange={setIsAssignmentDialogOpen}
          projectId={projectId}
          phases={mapData.phases}
          steps={mapData.steps}
          tasks={mapData.tasks}
          onAssignmentsUpdate={() => {
            void queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "map"] });
            showSuccessToast("projects.form.mapDrawer.assignmentUpdated", "projects.form.mapDrawer.assignmentUpdatedDescription");
          }}
        />
      )}
    </>
  );
}
