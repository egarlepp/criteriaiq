import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { ExternalLink, Link2, Save, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LucideIconPicker } from "@/components/ui/lucide-icon-picker";
import { ColorPicker } from "@/components/ui/color-picker";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import {
  DEFAULT_RESOURCE_ICON_COLOR,
  PORTAL_RESOURCE_CARDS,
  isValidResourceLink,
  type PortalResourceCard,
  type PortalResourceLinkType,
  type PortalResourceView,
} from "@shared/portal-resources";
import { CARD_META, invalidatePortalResources, resourceErrorKey, useInternalPageOptions } from "./resource-content-api";

interface ResourceDialogProps {
  /** The resource to edit, or null to create one. */
  resource: PortalResourceView | null;
  /** Card a new resource starts in. */
  defaultCard: PortalResourceCard;
  onClose: () => void;
  onSaved?: (saved: PortalResourceView) => void;
}

const NO_PAGE = "__custom__";

/** Create or edit one resource: card, title, description, icon and color, and its link. */
export function ResourceDialog({ resource, defaultCard, onClose, onSaved }: ResourceDialogProps) {
  const { t } = useTranslation();
  const isNew = resource === null;
  const pages = useInternalPageOptions();

  const [card, setCard] = useState<PortalResourceCard>(resource?.card ?? defaultCard);
  const [title, setTitle] = useState(resource?.title ?? "");
  const [description, setDescription] = useState(resource?.description ?? "");
  const [icon, setIcon] = useState(resource?.icon ?? "FileText");
  const [iconColor, setIconColor] = useState(resource?.iconColor ?? DEFAULT_RESOURCE_ICON_COLOR);
  const [linkType, setLinkType] = useState<PortalResourceLinkType>(resource?.linkType ?? "external");
  const [url, setUrl] = useState(resource?.url ?? "");

  useEffect(() => {
    // Switching link type clears a link that no longer fits it.
    if (url && !isValidResourceLink(linkType, url.trim())) setUrl("");
    // Only on a type switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkType]);

  const trimmedUrl = url.trim();
  const linkValid = trimmedUrl.length > 0 && isValidResourceLink(linkType, trimmedUrl);
  const colorValid = /^#[0-9a-f]{6}$/i.test(iconColor);
  const canSave = title.trim().length > 0 && !!icon && colorValid && linkValid;

  const saveMutation = useMutation({
    mutationFn: async (): Promise<PortalResourceView> => {
      const body = {
        card,
        title: title.trim(),
        description: description.trim(),
        icon,
        iconColor: iconColor.toLowerCase(),
        linkType,
        url: trimmedUrl,
      };
      return isNew
        ? apiRequest("POST", "/api/portal-resources", body)
        : apiRequest("PATCH", `/api/portal-resources/${resource.id}`, body);
    },
    onSuccess: (saved) => {
      invalidatePortalResources();
      showSuccessToast(t(isNew ? "resourceContent.toasts.created" : "resourceContent.toasts.saved", { title: saved.title }));
      onSaved?.(saved);
      onClose();
    },
    onError: (error) => showErrorToast(t("resourceContent.toasts.errorTitle"), t(resourceErrorKey(error))),
  });

  const pageValue = pages.some((p) => p.value === trimmedUrl) ? trimmedUrl : NO_PAGE;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isNew ? t("resourceContent.dialog.createTitle") : t("resourceContent.dialog.editTitle")}</DialogTitle>
          <DialogDescription>{t("resourceContent.dialog.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("resourceContent.dialog.card")}</Label>
              <Select value={card} onValueChange={(v) => setCard(v as PortalResourceCard)}>
                <SelectTrigger data-testid="select-resource-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PORTAL_RESOURCE_CARDS.map((c) => (
                    <SelectItem key={c} value={c}>
                      <span className="flex items-center gap-2">
                        <DynamicIcon name={CARD_META[c].icon} className={`h-4 w-4 ${CARD_META[c].iconClass}`} />
                        {t(CARD_META[c].labelKey)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isNew && resource.card !== card && resource.portalPosition !== null && (
                <p className="text-xs text-amber-700 dark:text-amber-400">{t("resourceContent.dialog.cardMoveHint")}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="resource-title">{t("resourceContent.dialog.title")}</Label>
              <Input
                id="resource-title"
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("resourceContent.dialog.titlePlaceholder")}
                data-testid="input-resource-title"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="resource-description">{t("resourceContent.dialog.descriptionLabel")}</Label>
            <Textarea
              id="resource-description"
              value={description}
              maxLength={500}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("resourceContent.dialog.descriptionPlaceholder")}
            />
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label>{t("resourceContent.dialog.icon")}</Label>
              <div className="flex h-10 items-center">
                <LucideIconPicker value={icon} onChange={setIcon} compact />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("resourceContent.dialog.iconColor")}</Label>
              <ColorPicker value={iconColor} onChange={setIconColor} size="md" />
            </div>
            <div className="space-y-2">
              <Label>{t("resourceContent.dialog.preview")}</Label>
              <div className="flex h-10 min-w-[220px] items-center gap-3 rounded-md border border-gray-200 bg-white px-3 dark:border-gray-700 dark:bg-gray-900">
                <DynamicIcon name={icon} className="h-4 w-4 shrink-0" style={{ color: iconColor }} />
                <span className="truncate text-xs font-medium text-slate-900 dark:text-slate-100">
                  {title.trim() || t("resourceContent.dialog.titlePlaceholder")}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-[180px_1fr]">
            <div className="space-y-2">
              <Label>{t("resourceContent.dialog.linkType")}</Label>
              <Select value={linkType} onValueChange={(v) => setLinkType(v as PortalResourceLinkType)}>
                <SelectTrigger data-testid="select-resource-link-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">
                    <span className="flex items-center gap-2">
                      <Link2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      {t("resourceContent.linkTypes.internal")}
                    </span>
                  </SelectItem>
                  <SelectItem value="external">
                    <span className="flex items-center gap-2">
                      <ExternalLink className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      {t("resourceContent.linkTypes.external")}
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              {linkType === "internal" ? (
                <>
                  <Label>{t("resourceContent.dialog.appPage")}</Label>
                  <Select value={pageValue} onValueChange={(v) => v !== NO_PAGE && setUrl(v)}>
                    <SelectTrigger data-testid="select-resource-app-page">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value={NO_PAGE}>{t("resourceContent.dialog.customPath")}</SelectItem>
                      {pages.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={url}
                    maxLength={500}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="/getting-started"
                    aria-label={t("resourceContent.dialog.path")}
                    data-testid="input-resource-path"
                  />
                </>
              ) : (
                <>
                  <Label htmlFor="resource-url">{t("resourceContent.dialog.url")}</Label>
                  <Input
                    id="resource-url"
                    value={url}
                    maxLength={2000}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://"
                    data-testid="input-resource-url"
                  />
                </>
              )}
              {trimmedUrl.length > 0 && !linkValid && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  {t(linkType === "internal" ? "resourceContent.dialog.pathInvalid" : "resourceContent.dialog.urlInvalid")}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            <X className="mr-2 h-4 w-4" />
            {t("common.cancel")}
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={!canSave || saveMutation.isPending} data-testid="button-save-resource">
            <Save className="mr-2 h-4 w-4" />
            {isNew ? t("resourceContent.dialog.create") : t("resourceContent.dialog.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
