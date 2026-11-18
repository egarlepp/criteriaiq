// Library › Knowledge › Resource Content: the links on the Account Portal's
// "Learning & Documentation" and "Support & Community" cards. Laid out like
// Knowledge › Artifacts: Search & Filters, a "View:" switch between the two
// cards, and the resources grouped into My / Other / System.
// See docs/features/resource-content.md.
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { FolderCog, FolderHeart, FolderLock, GraduationCap, Headphones, Plus, Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchFiltersSection, FilterLabel } from "@/components/ui/search-filters-section";
import { SubNavPopover } from "@/components/ui/sub-nav-popover";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import {
  PORTAL_CARD_LIMIT,
  PORTAL_RESOURCE_CARDS,
  RESOURCE_CONTENT_SECTION,
  canChangeResource,
  type PortalResourceCard,
  type PortalResourceView,
} from "@shared/portal-resources";
import {
  CARD_META,
  cardIds,
  invalidatePortalResources,
  resourceErrorKey,
  saveCardSelection,
  usePortalResources,
} from "./resource-content-api";
import { ResourceDialog } from "./ResourceDialog";
import { ResourceGroup, ResourceTable } from "./ResourceTable";

const ALL = "all";
type LinkFilter = typeof ALL | "internal" | "external";
type PortalFilter = typeof ALL | "shown" | "hidden";

function cardFromUrl(): PortalResourceCard {
  const subtab = new URLSearchParams(window.location.search).get("subtab");
  return (PORTAL_RESOURCE_CARDS as readonly string[]).includes(subtab ?? "") ? (subtab as PortalResourceCard) : "learning";
}

export function ResourceContentSection() {
  const { t } = useTranslation();
  const [location] = useLocation();
  const { user } = useAuth();
  const { canEdit } = usePermissions();
  const canEditPage = canEdit(RESOURCE_CONTENT_SECTION);
  const me = useMemo(() => ({ id: user?.id ?? "", isAdmin: user?.role?.toLowerCase() === "admin" }), [user?.id, user?.role]);

  const [card, setCard] = useState<PortalResourceCard>(cardFromUrl);
  const [search, setSearch] = useState("");
  const [linkFilter, setLinkFilter] = useState<LinkFilter>(ALL);
  const [portalFilter, setPortalFilter] = useState<PortalFilter>(ALL);
  const [expanded, setExpanded] = useState({ my: true, other: true, system: true });
  const [editing, setEditing] = useState<PortalResourceView | null | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<PortalResourceView | null>(null);

  // Sidebar and back/forward navigation change ?subtab=.
  useEffect(() => {
    setCard(cardFromUrl());
  }, [location]);
  useEffect(() => {
    const onPop = () => setCard(cardFromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const { data: resources = [], isLoading } = usePortalResources();

  const selectCard = (value: string) => {
    setCard(value as PortalResourceCard);
    window.history.pushState(null, "", `/project?tab=resource-content&subtab=${value}`);
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return resources.filter((r) => {
      if (r.card !== card) return false;
      if (linkFilter !== ALL && r.linkType !== linkFilter) return false;
      if (portalFilter === "shown" && r.portalPosition === null) return false;
      if (portalFilter === "hidden" && r.portalPosition !== null) return false;
      if (!q) return true;
      return [r.title, r.description, r.url, r.ownerName ?? ""].some((v) => v.toLowerCase().includes(q));
    });
  }, [resources, card, search, linkFilter, portalFilter]);

  const groups = useMemo(
    () => ({
      my: visible.filter((r) => !r.isSystem && r.ownerId === me.id),
      other: visible.filter((r) => !r.isSystem && r.ownerId !== me.id),
      system: visible.filter((r) => r.isSystem),
    }),
    [visible, me.id],
  );

  const shownCount = useMemo(() => cardIds(resources, card).length, [resources, card]);

  const toggleMutation = useMutation({
    mutationFn: async (row: PortalResourceView) => {
      const current = cardIds(resources, row.card);
      const next = row.portalPosition === null ? [...current, row.id] : current.filter((id) => id !== row.id);
      await saveCardSelection(row.card, next);
      return { row, added: row.portalPosition === null };
    },
    onSuccess: ({ row, added }) => {
      invalidatePortalResources();
      showSuccessToast(t(added ? "resourceContent.toasts.addedToCard" : "resourceContent.toasts.removedFromCard", { title: row.title, card: t(CARD_META[row.card].labelKey) }));
    },
    onError: (error) => showErrorToast(t("resourceContent.toasts.errorTitle"), t(resourceErrorKey(error))),
  });

  const deleteMutation = useMutation({
    mutationFn: (row: PortalResourceView) => apiRequest("DELETE", `/api/portal-resources/${row.id}`),
    onSuccess: (_data, row) => {
      invalidatePortalResources();
      showSuccessToast(t("resourceContent.toasts.deleted", { title: row.title }));
    },
    onError: (error) => showErrorToast(t("resourceContent.toasts.errorTitle"), t(resourceErrorKey(error))),
  });

  const permissionsFor = (row: PortalResourceView) =>
    canEditPage ? canChangeResource(row, me) : { edit: false, remove: false };

  const onTogglePortal = (row: PortalResourceView) => {
    if (row.portalPosition === null && cardIds(resources, row.card).length >= PORTAL_CARD_LIMIT) {
      showErrorToast(t("resourceContent.toasts.errorTitle"), t("resourceContent.errors.card_full"));
      return;
    }
    toggleMutation.mutate(row);
  };

  const viewItems = PORTAL_RESOURCE_CARDS.map((c) => ({
    id: c,
    label: t(CARD_META[c].labelKey),
    icon: c === "learning" ? GraduationCap : Headphones,
  }));

  const activeFilters = (search.trim() ? 1 : 0) + (linkFilter !== ALL ? 1 : 0) + (portalFilter !== ALL ? 1 : 0);
  const tableProps = { canEditPortal: canEditPage, permissionsFor, onEdit: (r: PortalResourceView) => setEditing(r), onDelete: setPendingDelete, onTogglePortal };
  const CardIcon = card === "learning" ? GraduationCap : Headphones;

  return (
    <TooltipProvider>
      <div className="space-y-4" data-testid="resource-content">
        <SearchFiltersSection
          activeFilterCount={activeFilters}
          onClearFilters={() => {
            setSearch("");
            setLinkFilter(ALL);
            setPortalFilter(ALL);
          }}
        >
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div>
              <FilterLabel>{t("resourceContent.filters.search")}</FilterLabel>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 text-gray-400 dark:text-gray-500" size={14} />
                <Input
                  placeholder={t("resourceContent.filters.searchPlaceholder")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 pl-8 text-sm"
                  data-testid="input-resource-search"
                />
              </div>
            </div>
            <div>
              <FilterLabel>{t("resourceContent.filters.linkType")}</FilterLabel>
              <Select value={linkFilter} onValueChange={(v) => setLinkFilter(v as LinkFilter)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("resourceContent.filters.allLinkTypes")}</SelectItem>
                  <SelectItem value="internal">{t("resourceContent.linkTypes.internal")}</SelectItem>
                  <SelectItem value="external">{t("resourceContent.linkTypes.external")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <FilterLabel>{t("resourceContent.filters.portal")}</FilterLabel>
              <Select value={portalFilter} onValueChange={(v) => setPortalFilter(v as PortalFilter)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("resourceContent.filters.allPortal")}</SelectItem>
                  <SelectItem value="shown">{t("resourceContent.filters.shown")}</SelectItem>
                  <SelectItem value="hidden">{t("resourceContent.filters.hidden")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </SearchFiltersSection>

        <div className="space-y-2">
          <SubNavPopover items={viewItems} activeId={card} onSelect={selectCard} title={t("resourceContent.viewTitle")} />

          <Card className="relative overflow-hidden">
            <DecorativeCardIcon icon={CardIcon} />
            <CardHeader className="relative z-10 flex flex-row items-start justify-between py-4">
              <div className="mr-4 flex-1">
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <CardIcon data-title-icon className={`h-5 w-5 ${CARD_META[card].iconClass}`} />
                  {t(CARD_META[card].labelKey)}
                </CardTitle>
                <CardDescription className="mt-1.5">
                  {t("resourceContent.libraryDescription", { shown: shownCount, limit: PORTAL_CARD_LIMIT })}
                </CardDescription>
              </div>
              {canEditPage && (
                <Button size="sm" onClick={() => setEditing(null)} className="flex shrink-0 items-center gap-2" data-testid="button-new-resource">
                  <Plus className="h-4 w-4" />
                  {t("resourceContent.newResource")}
                </Button>
              )}
            </CardHeader>
            <CardContent className="relative z-10 space-y-3 px-6 pb-4">
              {isLoading ? (
                <div className="animate-pulse space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 rounded bg-gray-200 dark:bg-gray-700" />
                  ))}
                </div>
              ) : (
                <>
                  <ResourceGroup
                    label={t("resourceContent.groups.my")}
                    icon={FolderHeart}
                    iconClass="text-red-500 dark:text-red-400"
                    count={groups.my.length}
                    expanded={expanded.my}
                    onToggle={() => setExpanded((e) => ({ ...e, my: !e.my }))}
                    emptyText={t("resourceContent.groups.myEmpty")}
                    testId="resource-group-my"
                  >
                    <ResourceTable rows={groups.my} sortPrefix="rcMy" {...tableProps} />
                  </ResourceGroup>
                  <ResourceGroup
                    label={t("resourceContent.groups.other")}
                    icon={FolderCog}
                    iconClass="text-orange-500 dark:text-orange-400"
                    count={groups.other.length}
                    expanded={expanded.other}
                    onToggle={() => setExpanded((e) => ({ ...e, other: !e.other }))}
                    emptyText={t("resourceContent.groups.otherEmpty")}
                    testId="resource-group-other"
                  >
                    <ResourceTable rows={groups.other} sortPrefix="rcOther" {...tableProps} />
                  </ResourceGroup>
                  <ResourceGroup
                    label={t("resourceContent.groups.system")}
                    icon={FolderLock}
                    iconClass="text-blue-600 dark:text-blue-400"
                    count={groups.system.length}
                    expanded={expanded.system}
                    onToggle={() => setExpanded((e) => ({ ...e, system: !e.system }))}
                    emptyText={t("resourceContent.groups.systemEmpty")}
                    testId="resource-group-system"
                  >
                    <ResourceTable rows={groups.system} sortPrefix="rcSystem" {...tableProps} />
                  </ResourceGroup>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {editing !== undefined && <ResourceDialog resource={editing} defaultCard={card} onClose={() => setEditing(undefined)} />}

        <ConfirmationDialog
          open={pendingDelete !== null}
          onOpenChange={(open) => !open && setPendingDelete(null)}
          title={t("resourceContent.deleteDialog.title")}
          description={t("resourceContent.deleteDialog.description", { title: pendingDelete?.title ?? "" })}
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
    </TooltipProvider>
  );
}
