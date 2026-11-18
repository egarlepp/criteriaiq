// The Account Portal's "Learning & Documentation" and "Support & Community"
// cards (Resources tab), fed by Resource Content. People with Edit on
// Resource Content get a pencil on each card that opens PortalCardEditor.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { usePermissions } from "@/hooks/usePermissions";
import { PORTAL_RESOURCE_CARDS, RESOURCE_CONTENT_SECTION, type PortalResourceCard } from "@shared/portal-resources";
import { CARD_META, usePortalResourceCards } from "./resource-content-api";
import { ResourceLink } from "./ResourceLink";
import { PortalCardEditor } from "./PortalCardEditor";

interface PortalResourceCardsProps {
  /** Outside users (Customer, Partner, Guest) never get the editor. */
  isExternalViewer: boolean;
}

/** Both cards, as the first two columns of the Resources tab's grid. */
export function PortalResourceCards({ isExternalViewer }: PortalResourceCardsProps) {
  const { t } = useTranslation();
  const { canEdit } = usePermissions();
  const canEditCards = !isExternalViewer && canEdit(RESOURCE_CONTENT_SECTION);
  const { data: cards, isLoading } = usePortalResourceCards();
  const [editingCard, setEditingCard] = useState<PortalResourceCard | null>(null);

  return (
    <TooltipProvider>
      {PORTAL_RESOURCE_CARDS.map((card) => {
        const meta = CARD_META[card];
        const items = cards?.[card] ?? [];
        return (
          <div
            key={card}
            className="rounded-xl border border-gray-200 bg-card p-4 text-card-foreground shadow-sm dark:border-gray-800"
            data-testid={`portal-resource-card-${card}`}
          >
            <div className="mb-3 flex items-center gap-2">
              <DynamicIcon name={meta.icon} className={`h-4 w-4 ${meta.iconClass}`} />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{t(meta.labelKey)}</p>
              {canEditCards && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto h-7 w-7 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                      onClick={() => setEditingCard(card)}
                      aria-label={t("resourceContent.portal.editCard", { card: t(meta.labelKey) })}
                      data-testid={`button-edit-portal-card-${card}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("resourceContent.portal.editCard", { card: t(meta.labelKey) })}</TooltipContent>
                </Tooltip>
              )}
            </div>
            <div className="space-y-2">
              {isLoading ? (
                [0, 1, 2, 3].map((i) => <div key={i} className="h-[60px] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />)
              ) : items.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">{t("resourceContent.portal.empty")}</p>
              ) : (
                items.map((item) => (
                  <ResourceLink
                    key={item.id}
                    resource={item}
                    className="group flex h-[60px] items-start gap-3 rounded-lg p-2 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <DynamicIcon name={item.icon} className="mt-0.5 h-4 w-4 shrink-0" style={{ color: item.iconColor }} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-900 group-hover:text-blue-600 dark:text-slate-100 dark:group-hover:text-blue-400">{item.title}</p>
                      {item.description && (
                        <p className="mt-0.5 line-clamp-2 text-[10px] text-slate-500 dark:text-slate-400">{item.description}</p>
                      )}
                    </div>
                  </ResourceLink>
                ))
              )}
            </div>
          </div>
        );
      })}
      {editingCard && <PortalCardEditor card={editingCard} onClose={() => setEditingCard(null)} />}
    </TooltipProvider>
  );
}
