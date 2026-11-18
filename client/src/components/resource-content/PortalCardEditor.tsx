// Picks which resources an Account Portal card shows (at most four) and in
// what order. Opened from the pencil on the card; new resources can be added
// here, and the full list lives on Library › Knowledge › Resource Content.
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, LibraryBig, Plus, Save, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { PORTAL_CARD_LIMIT, type PortalResourceCard, type PortalResourceView } from "@shared/portal-resources";
import {
  CARD_META,
  cardIds,
  invalidatePortalResources,
  resourceErrorKey,
  saveCardSelection,
  usePortalResources,
} from "./resource-content-api";
import { ResourceDialog } from "./ResourceDialog";

interface PortalCardEditorProps {
  card: PortalResourceCard;
  onClose: () => void;
}

export function PortalCardEditor({ card, onClose }: PortalCardEditorProps) {
  const { t } = useTranslation();
  const cardLabel = t(CARD_META[card].labelKey);
  const { data: resources = [], isLoading } = usePortalResources();
  const options = useMemo(
    () => resources.filter((r) => r.card === card).sort((a, b) => a.title.localeCompare(b.title)),
    [resources, card],
  );
  const byId = useMemo(() => new Map(options.map((r) => [r.id, r])), [options]);

  const [selected, setSelected] = useState<number[] | null>(null);
  const [creating, setCreating] = useState(false);
  // Start from what the card shows once the list has loaded.
  useEffect(() => {
    if (selected === null && !isLoading) setSelected(cardIds(resources, card));
  }, [selected, isLoading, resources, card]);
  const chosen = (selected ?? []).filter((id) => byId.has(id));
  const full = chosen.length >= PORTAL_CARD_LIMIT;

  const toggle = (id: number, checked: boolean) =>
    setSelected((prev) => {
      const list = (prev ?? []).filter((x) => x !== id);
      return checked ? [...list, id] : list;
    });

  const move = (index: number, delta: -1 | 1) =>
    setSelected((prev) => {
      const list = [...(prev ?? [])].filter((id) => byId.has(id));
      const target = index + delta;
      if (target < 0 || target >= list.length) return list;
      [list[index], list[target]] = [list[target], list[index]];
      return list;
    });

  const saveMutation = useMutation({
    mutationFn: () => saveCardSelection(card, chosen),
    onSuccess: () => {
      invalidatePortalResources();
      showSuccessToast(t("resourceContent.toasts.cardSaved", { card: cardLabel }));
      onClose();
    },
    onError: (error) => showErrorToast(t("resourceContent.toasts.errorTitle"), t(resourceErrorKey(error))),
  });

  const onCreated = (saved: PortalResourceView) => {
    // A new resource goes straight onto the card when there is room.
    if (saved.card === card) setSelected((prev) => ((prev ?? []).length < PORTAL_CARD_LIMIT ? [...(prev ?? []), saved.id] : prev));
  };

  return (
    <>
      <Dialog open={!creating} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DynamicIcon name={CARD_META[card].icon} className={`h-5 w-5 ${CARD_META[card].iconClass}`} />
              {t("resourceContent.editor.title", { card: cardLabel })}
            </DialogTitle>
            <DialogDescription>{t("resourceContent.editor.description", { limit: PORTAL_CARD_LIMIT })}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t("resourceContent.editor.onCard", { count: chosen.length, limit: PORTAL_CARD_LIMIT })}
              </p>
              {chosen.length === 0 ? (
                <p className="rounded-md border border-dashed border-gray-300 p-3 text-sm text-muted-foreground dark:border-gray-600">
                  {t("resourceContent.editor.noneChosen")}
                </p>
              ) : (
                <ol className="space-y-1.5" data-testid="portal-card-order">
                  {chosen.map((id, index) => {
                    const r = byId.get(id)!;
                    return (
                      <li key={id} className="flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/60">
                        <span className="w-4 text-xs font-semibold text-gray-500 dark:text-gray-400">{index + 1}</span>
                        <DynamicIcon name={r.icon} className="h-4 w-4 shrink-0" style={{ color: r.iconColor }} />
                        <span className="flex-1 truncate text-sm text-gray-900 dark:text-gray-100">{r.title}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index === 0} onClick={() => move(index, -1)} aria-label={t("resourceContent.editor.moveUp")}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index === chosen.length - 1} onClick={() => move(index, 1)} aria-label={t("resourceContent.editor.moveDown")}>
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("resourceContent.editor.available")}</p>
              <div className="max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200 dark:divide-gray-800 dark:border-gray-700">
                {isLoading ? (
                  <p className="p-4 text-sm text-muted-foreground">{t("common.loading")}</p>
                ) : (
                  options.map((r) => {
                    const checked = chosen.includes(r.id);
                    return (
                      <label
                        key={r.id}
                        className={`flex items-center gap-3 px-3 py-2 ${!checked && full ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60"}`}
                      >
                        <Checkbox checked={checked} disabled={!checked && full} onCheckedChange={(v) => toggle(r.id, v === true)} />
                        <DynamicIcon name={r.icon} className="h-4 w-4 shrink-0" style={{ color: r.iconColor }} />
                        <span className="flex-1 truncate text-sm text-gray-900 dark:text-gray-100">{r.title}</span>
                        <Badge variant="outline" className="text-[10px] text-gray-600 dark:text-gray-300">
                          {r.isSystem ? t("resourceContent.table.system") : r.ownerName ?? "—"}
                        </Badge>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setCreating(true)} data-testid="button-editor-new-resource">
                <Plus className="mr-2 h-4 w-4" />
                {t("resourceContent.newResource")}
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/project?tab=resource-content&subtab=${card}`} onClick={onClose}>
                  <LibraryBig className="mr-2 h-4 w-4" />
                  {t("resourceContent.editor.manageAll")}
                </Link>
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                <X className="mr-2 h-4 w-4" />
                {t("common.cancel")}
              </Button>
              <Button onClick={() => saveMutation.mutate()} disabled={selected === null || saveMutation.isPending} data-testid="button-save-portal-card">
                <Save className="mr-2 h-4 w-4" />
                {t("resourceContent.editor.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {creating && <ResourceDialog resource={null} defaultCard={card} onClose={() => setCreating(false)} onSaved={onCreated} />}
    </>
  );
}
