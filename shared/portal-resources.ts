// Resource Content (Library › Knowledge › Resource Content): the links shown
// on the Account Portal's Resources tab, in the "Learning & Documentation"
// and "Support & Community" cards. See docs/features/resource-content.md.
//
// Each resource belongs to one card and opens either an app page (a path
// such as /getting-started) or an external http(s) URL. Each card shows at
// most PORTAL_CARD_LIMIT resources, in the order chosen for it. System
// resources ship with the app (server/seed/system-portal-resources.ts).
import { z } from "zod";

/** Page permission for the Resource Content page and the portal card editors. */
export const RESOURCE_CONTENT_SECTION = "project.resource-content";

export const PORTAL_RESOURCE_CARDS = ["learning", "support"] as const;
export type PortalResourceCard = (typeof PORTAL_RESOURCE_CARDS)[number];

export const PORTAL_RESOURCE_LINK_TYPES = ["internal", "external"] as const;
export type PortalResourceLinkType = (typeof PORTAL_RESOURCE_LINK_TYPES)[number];

/** Resources a portal card shows at most. */
export const PORTAL_CARD_LIMIT = 4;

/** Icon color used when none is chosen. */
export const DEFAULT_RESOURCE_ICON_COLOR = "#3b82f6";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
/** Lucide icon names are PascalCase words and digits ("FileText", "Users2"). */
const ICON_NAME = /^[A-Z][A-Za-z0-9]{0,59}$/;

/**
 * An app page: one leading slash, no scheme, no protocol-relative "//",
 * no backslashes or whitespace. Query strings and anchors are fine.
 */
export function isInternalPath(value: string): boolean {
  return /^\/(?![/\\])[^\s\\]*$/.test(value) && value.length <= 500;
}

/** An absolute http(s) URL. */
export function isExternalUrl(value: string): boolean {
  if (value.length > 2000) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !!url.hostname;
  } catch {
    return false;
  }
}

/** Whether a link fits its type. */
export function isValidResourceLink(linkType: PortalResourceLinkType, url: string): boolean {
  return linkType === "internal" ? isInternalPath(url) : isExternalUrl(url);
}

const fields = {
  card: z.enum(PORTAL_RESOURCE_CARDS),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).default(""),
  icon: z.string().trim().regex(ICON_NAME),
  iconColor: z.string().trim().regex(HEX_COLOR),
  linkType: z.enum(PORTAL_RESOURCE_LINK_TYPES),
  url: z.string().trim().min(1).max(2000),
};

const linkMatchesType = (v: { linkType?: PortalResourceLinkType; url?: string }) =>
  v.linkType === undefined || v.url === undefined || isValidResourceLink(v.linkType, v.url);
const linkIssue = { message: "invalid_link", path: ["url"] };

export const portalResourceCreateSchema = z.object(fields).strict().refine(linkMatchesType, linkIssue);
export type PortalResourceCreate = z.infer<typeof portalResourceCreateSchema>;

/** A change always sends the link type and URL together, so both can be checked. */
export const portalResourceUpdateSchema = z
  .object({
    card: fields.card.optional(),
    title: fields.title.optional(),
    description: z.string().trim().max(500).optional(),
    icon: fields.icon.optional(),
    iconColor: fields.iconColor.optional(),
    linkType: fields.linkType.optional(),
    url: fields.url.optional(),
  })
  .strict()
  .refine((v) => (v.linkType === undefined) === (v.url === undefined), { message: "link_pair", path: ["url"] })
  .refine(linkMatchesType, linkIssue)
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to change" });
export type PortalResourceUpdate = z.infer<typeof portalResourceUpdateSchema>;

/** What a portal card shows, in order. Ids must belong to the card. */
export const portalCardSelectionSchema = z
  .object({
    ids: z
      .array(z.number().int().positive())
      .max(PORTAL_CARD_LIMIT)
      .refine((ids) => new Set(ids).size === ids.length, { message: "duplicate_ids" }),
  })
  .strict();

/** A resource as the API returns it. */
export interface PortalResourceView {
  id: number;
  card: PortalResourceCard;
  title: string;
  description: string;
  icon: string;
  iconColor: string;
  linkType: PortalResourceLinkType;
  url: string;
  isSystem: boolean;
  /** Position on its portal card (0-based), or null when the card leaves it out. */
  portalPosition: number | null;
  ownerId: string | null;
  ownerName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Who may change or delete a resource: its owner or an Admin; System rows are Admin-only and never deleted. */
export function canChangeResource(
  resource: Pick<PortalResourceView, "isSystem" | "ownerId">,
  user: { id: string; isAdmin: boolean },
): { edit: boolean; remove: boolean } {
  if (resource.isSystem) return { edit: user.isAdmin, remove: false };
  const mine = resource.ownerId === user.id;
  return { edit: mine || user.isAdmin, remove: mine || user.isAdmin };
}
