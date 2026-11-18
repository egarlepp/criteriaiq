// Queries and helpers shared by Library › Knowledge › Resource Content and
// the Account Portal's Resources cards. See docs/features/resource-content.md.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest, isApiError, queryClient } from "@/lib/queryClient";
import { SIDEBAR_NAV } from "@/components/layout/sidebar-nav-config";
import type { PortalResourceCard, PortalResourceView } from "@shared/portal-resources";

export const RESOURCES_KEY = ["/api/portal-resources"] as const;
export const RESOURCE_CARDS_KEY = ["/api/portal-resources/cards"] as const;

export type PortalCards = Record<PortalResourceCard, PortalResourceView[]>;

/** Every resource, for the Resource Content page (needs View on it). */
export function usePortalResources(enabled = true) {
  return useQuery<PortalResourceView[]>({
    queryKey: RESOURCES_KEY,
    queryFn: () => apiRequest("GET", "/api/portal-resources"),
    enabled,
    staleTime: 30_000,
  });
}

/** What each Account Portal card shows, in order. */
export function usePortalResourceCards(enabled = true) {
  return useQuery<PortalCards>({
    queryKey: RESOURCE_CARDS_KEY,
    queryFn: () => apiRequest("GET", "/api/portal-resources/cards"),
    enabled,
    staleTime: 60_000,
  });
}

export function invalidatePortalResources(): void {
  void queryClient.invalidateQueries({ queryKey: RESOURCES_KEY });
  void queryClient.invalidateQueries({ queryKey: RESOURCE_CARDS_KEY });
}

const KNOWN_CODES = new Set([
  "not_found",
  "wrong_card",
  "card_full",
  "invalid_link",
  "link_pair",
  "not_owner",
  "system_admin_only",
  "system_locked",
  "invalid_input",
]);

/** The translation key for a server error `code`, else the generic one. */
export function resourceErrorKey(error: unknown): string {
  const code =
    isApiError(error) && error.details && typeof error.details === "object"
      ? (error.details as { code?: unknown }).code
      : undefined;
  return typeof code === "string" && KNOWN_CODES.has(code)
    ? `resourceContent.errors.${code}`
    : "resourceContent.errors.generic";
}

/** Card titles and their header icon colors, as on the Account Portal. */
export const CARD_META: Record<PortalResourceCard, { labelKey: string; icon: "GraduationCap" | "Headphones"; iconClass: string }> = {
  learning: { labelKey: "resourceContent.cards.learning", icon: "GraduationCap", iconClass: "text-blue-500 dark:text-blue-400" },
  support: { labelKey: "resourceContent.cards.support", icon: "Headphones", iconClass: "text-purple-500 dark:text-purple-400" },
};

/**
 * App pages an internal link can open: every sidebar page outside Admin,
 * labelled as in the menu. Any other app path can be typed instead.
 */
export interface InternalPageOption {
  value: string;
  label: string;
}

export function useInternalPageOptions(): InternalPageOption[] {
  const { t } = useTranslation();
  return useMemo(() => {
    const seen = new Set<string>();
    const options: InternalPageOption[] = [];
    const add = (href: string, label: string) => {
      if (seen.has(href)) return;
      seen.add(href);
      options.push({ value: href, label });
    };
    for (const group of SIDEBAR_NAV) {
      if (group.secondTier) continue;
      for (const item of group.items) {
        if (item.children?.length) {
          for (const child of item.children) add(child.href, `${t(item.labelKey)} › ${t(child.labelKey)}`);
        } else {
          add(item.href, t(item.labelKey));
        }
      }
    }
    return options;
  }, [t]);
}

/** Saves what a portal card shows, in order. */
export function saveCardSelection(card: PortalResourceCard, ids: number[]): Promise<PortalCards> {
  return apiRequest("PUT", `/api/portal-resources/cards/${card}`, { ids });
}

/** The ids a card shows now, in order, from the full resource list. */
export function cardIds(resources: readonly PortalResourceView[], card: PortalResourceCard): number[] {
  return resources
    .filter((r) => r.card === card && r.portalPosition !== null)
    .sort((a, b) => (a.portalPosition ?? 0) - (b.portalPosition ?? 0))
    .map((r) => r.id);
}
