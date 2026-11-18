import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  BookOpenText,
  BookText,
  BookType,
  Calendar,
  CheckCircle,
  CircleX,
  Clock,
  FileText,
  HelpCircle,
  Library,
  LifeBuoy,
  MessageCircle,
  Package,
  SquareMousePointer,
  Target,
  Users,
  Waypoints,
} from "lucide-react";

// ─── Topics ──────────────────────────────────────────────────────────────────
// Each topic is a tile in "Browse topics" and opens in the side drawer. The
// `urlKeys` are the ?tab= values the old tabbed Guide used; Global Search
// still links to them (server/search/searchConfig.ts), so they keep working.

export type GuideTopicKey =
  | "workspace"
  | "projectInfo"
  | "statuses"
  | "interface"
  | "map"
  | "resources"
  | "glossary"
  | "help";

export interface GuideTopic {
  key: GuideTopicKey;
  urlKey: string;
  icon: LucideIcon;
  /** Icon color + tinted tile background, light and dark. */
  iconClass: string;
  tileClass: string;
}

export const GUIDE_TOPICS: GuideTopic[] = [
  { key: "workspace",   urlKey: "workspace",    icon: BookText,           iconClass: "text-blue-600 dark:text-blue-400",       tileClass: "bg-blue-500/10 dark:bg-blue-400/15" },
  { key: "projectInfo", urlKey: "project-info", icon: FileText,           iconClass: "text-violet-600 dark:text-violet-400",   tileClass: "bg-violet-500/10 dark:bg-violet-400/15" },
  { key: "statuses",    urlKey: "statuses",     icon: BookOpenText,       iconClass: "text-cyan-600 dark:text-cyan-400",       tileClass: "bg-cyan-500/10 dark:bg-cyan-400/15" },
  { key: "interface",   urlKey: "interface",    icon: SquareMousePointer, iconClass: "text-indigo-600 dark:text-indigo-400",   tileClass: "bg-indigo-500/10 dark:bg-indigo-400/15" },
  { key: "map",         urlKey: "map",          icon: Waypoints,          iconClass: "text-orange-600 dark:text-orange-400",   tileClass: "bg-orange-500/10 dark:bg-orange-400/15" },
  { key: "resources",   urlKey: "resources",    icon: Library,            iconClass: "text-emerald-600 dark:text-emerald-400", tileClass: "bg-emerald-500/10 dark:bg-emerald-400/15" },
  { key: "glossary",    urlKey: "glossary",     icon: BookType,           iconClass: "text-pink-600 dark:text-pink-400",       tileClass: "bg-pink-500/10 dark:bg-pink-400/15" },
  { key: "help",        urlKey: "help",         icon: LifeBuoy,           iconClass: "text-slate-600 dark:text-slate-300",     tileClass: "bg-slate-500/10 dark:bg-slate-400/15" },
];

export function topicFromUrlKey(urlKey: string | null): GuideTopicKey | null {
  if (!urlKey) return null;
  return GUIDE_TOPICS.find((topic) => topic.urlKey === urlKey)?.key ?? null;
}

export function getTopic(key: GuideTopicKey): GuideTopic {
  const topic = GUIDE_TOPICS.find((candidate) => candidate.key === key);
  if (!topic) throw new Error(`Unknown guide topic: ${key}`);
  return topic;
}

// ─── Roles ───────────────────────────────────────────────────────────────────
// Names, colors and icons come from /api/roles (admin-editable); these are the
// fallbacks used before that loads or when a role has no color/icon set.

export type GuideRoleKey = "customer" | "partner" | "guest";

export const GUIDE_ROLES: { key: GuideRoleKey; roleName: string; color: string; icon: string }[] = [
  { key: "customer", roleName: "Customer", color: "#059669", icon: "User" },
  { key: "partner",  roleName: "Partner",  color: "#ca8a04", icon: "Users" },
  { key: "guest",    roleName: "Guest",    color: "#6b7280", icon: "UserPlus" },
];

// ─── Validation journey ──────────────────────────────────────────────────────

export type GuideStageKey = "before" | "during" | "after";

export const GUIDE_STAGES: GuideStageKey[] = ["before", "during", "after"];

// Checklist item keys under guide.journey.roles.<role>.<stage>. Each role gets
// only what its permissions allow: Partners work several accounts and own
// MAP tasks; Guests are view-only on one account, so their list is shorter
// and leaves out anything that edits the project.
export const ROLE_STAGE_ITEMS: Record<GuideRoleKey, Record<GuideStageKey, string[]>> = {
  customer: {
    before: ["i1", "i2", "i3", "i4", "i5", "i6"],
    during: ["i1", "i2", "i3", "i4", "i5", "i6"],
    after:  ["i1", "i2", "i3", "i4", "i5", "i6"],
  },
  partner: {
    before: ["i1", "i2", "i3", "i4", "i5", "i6"],
    during: ["i1", "i2", "i3", "i4", "i5", "i6"],
    after:  ["i1", "i2", "i3", "i4", "i5", "i6"],
  },
  guest: {
    before: ["i1", "i2", "i3"],
    during: ["i1", "i2", "i3", "i4"],
    after:  ["i1", "i2", "i3"],
  },
};

// ─── Per-role topic order, descriptions and popular searches ────────────────

export const ROLE_TOPIC_ORDER: Record<GuideRoleKey, GuideTopicKey[]> = {
  customer: ["workspace", "projectInfo", "statuses", "interface", "map", "resources", "glossary", "help"],
  partner:  ["workspace", "map", "statuses", "projectInfo", "interface", "glossary", "resources", "help"],
  guest:    ["workspace", "statuses", "glossary", "help", "projectInfo", "interface", "map", "resources"],
};

/** Topics whose card description changes for a role (key under guide.topics.<topic>). */
export const ROLE_TOPIC_DESCRIPTION: Partial<Record<GuideRoleKey, Partial<Record<GuideTopicKey, string>>>> = {
  guest: { projectInfo: "guestDescription" },
};

export function topicDescriptionKey(role: GuideRoleKey, topic: GuideTopicKey): string {
  return `guide.topics.${topic}.${ROLE_TOPIC_DESCRIPTION[role]?.[topic] ?? "description"}`;
}

/** Keys under guide.popular. Each pill's text is also the search query it runs. */
export const ROLE_POPULAR_SEARCHES: Record<GuideRoleKey, string[]> = {
  customer: ["tcc", "successCriteria", "map", "accountStatus", "support"],
  partner:  ["map", "accountStatus", "successCriteria", "tcc", "support"],
  guest:    ["successCriteria", "map", "projectStatus", "glossary", "support"],
};

// ─── Statuses ────────────────────────────────────────────────────────────────
// Shown only when the status config endpoints return nothing (fresh install).
// Status names are configuration data, so they are not translated.

export interface GuideStatus {
  name: string;
  description: string;
  color: string;
  icon: string;
}

export const FALLBACK_ACCOUNT_STATUSES: GuideStatus[] = [
  { name: "On Time",                description: "Progressing as expected",               color: "#10B981", icon: "ClipboardClock" },
  { name: "Complete",               description: "All objectives have been met",          color: "#059669", icon: "CircleCheckBig" },
  { name: "Need Assistance",        description: "Requires support or guidance",          color: "#6B7280", icon: "HelpCircle" },
  { name: "Delayed",                description: "Project is behind schedule",            color: "#EAB308", icon: "AlertCircle" },
  { name: "On Hold",                description: "Temporarily paused",                    color: "#F97316", icon: "Hourglass" },
  { name: "Pending Feedback",       description: "Waiting for review or approval",        color: "#EAB308", icon: "MessageCircle" },
  { name: "In CAB",                 description: "In Change Advisory Board review",       color: "#9333EA", icon: "Users" },
  { name: "Evaluating Competitors", description: "Additional vendor engagement required", color: "#374151", icon: "Eye" },
  { name: "Selecting Solution",     description: "Customer has selected our solution",    color: "#10B981", icon: "Pin" },
];

export const FALLBACK_PROJECT_STATUSES: GuideStatus[] = [
  { name: "Planning",    description: "Initial planning phase - scoping and preparation", color: "#64748B", icon: "ClipboardPenLine" },
  { name: "In Progress", description: "Currently being executed - active validation work", color: "#3B82F6", icon: "Target" },
  { name: "Completed",   description: "Successfully completed - all objectives met",       color: "#10B981", icon: "CircleCheckBig" },
  { name: "TCC",         description: "Technically Cleared To Close - ready for handoff",  color: "#059669", icon: "Handshake" },
  { name: "Closed Won",  description: "Successfully closed - customer moved forward",      color: "#84CC16", icon: "Trophy" },
  { name: "Closed Lost", description: "Closed without success - customer did not proceed", color: "#EF4444", icon: "CircleX" },
  { name: "On Hold",     description: "Temporarily paused - awaiting input or resources",  color: "#F59E0B", icon: "Hourglass" },
];

// ─── Project information fields ──────────────────────────────────────────────

export const PROJECT_FIELD_GROUPS: { key: "basic" | "details" | "timeline"; iconClass: string; fields: string[] }[] = [
  {
    key: "basic",
    iconClass: "text-blue-600 dark:text-blue-400",
    fields: ["accountName", "solutionName", "industry", "environment", "artifacts"],
  },
  {
    key: "details",
    iconClass: "text-emerald-600 dark:text-emerald-400",
    fields: ["businessProblem", "solutionDescription", "mutualActionPlan", "customerObjective", "policyConsiderations"],
  },
  {
    key: "timeline",
    iconClass: "text-violet-600 dark:text-violet-400",
    fields: ["startDate", "endDate", "primaryEngineer", "specialistEngineer", "supportingEngineers", "customerStakeholder"],
  },
];

// ─── Workspace ───────────────────────────────────────────────────────────────

export const WORKSPACE_CAPABILITIES: { key: string; icon: LucideIcon }[] = [
  { key: "c1", icon: BarChart3 },
  { key: "c2", icon: CheckCircle },
  { key: "c3", icon: Waypoints },
  { key: "c4", icon: FileText },
  { key: "c5", icon: BookOpen },
  { key: "c6", icon: Calendar },
  { key: "c7", icon: Users },
  { key: "c8", icon: BarChart3 },
];

// ─── MAP statuses ────────────────────────────────────────────────────────────

export const MAP_STATUSES: { key: string; icon: LucideIcon; iconClass: string }[] = [
  { key: "notStarted", icon: Clock,         iconClass: "text-gray-500 dark:text-gray-400" },
  { key: "inProgress", icon: Target,        iconClass: "text-blue-600 dark:text-blue-400" },
  { key: "blocked",    icon: AlertTriangle, iconClass: "text-red-600 dark:text-red-400" },
  { key: "complete",   icon: CheckCircle,   iconClass: "text-green-600 dark:text-green-400" },
  { key: "deferred",   icon: CircleX,       iconClass: "text-yellow-600 dark:text-yellow-400" },
  { key: "stalled",    icon: AlertTriangle, iconClass: "text-orange-600 dark:text-orange-400" },
];

// ─── Resources ───────────────────────────────────────────────────────────────

export const RESOURCES: { key: string; url: string; icon: LucideIcon; iconClass: string }[] = [
  { key: "support",          url: "https://example.com/en/support/",                                     icon: HelpCircle,    iconClass: "text-blue-600 dark:text-blue-400" },
  { key: "versions",         url: "https://example.com/en/support/supported-versions/",                  icon: Package,       iconClass: "text-green-600 dark:text-green-400" },
  { key: "guides",           url: "https://example.com/en/resources/guides/",                            icon: BookOpenText,  iconClass: "text-purple-600 dark:text-purple-400" },
  { key: "community",        url: "https://community.example.com/",                                      icon: Users,         iconClass: "text-orange-600 dark:text-orange-400" },
  { key: "securityGlossary", url: "https://example.com/en/cybersecurity-glossary/",                      icon: BookText,      iconClass: "text-indigo-600 dark:text-indigo-400" },
  { key: "attacks",          url: "https://example.com/en/cybersecurity-glossary/cyber-security-attacks/", icon: AlertTriangle, iconClass: "text-red-600 dark:text-red-400" },
  { key: "compliance",       url: "https://example.com/en/cybersecurity-glossary/compliance/",           icon: CheckCircle,   iconClass: "text-emerald-600 dark:text-emerald-400" },
  { key: "announcements",    url: "https://community.example.com/tag/announcement",                      icon: MessageCircle, iconClass: "text-cyan-600 dark:text-cyan-400" },
];

// ─── Glossary ────────────────────────────────────────────────────────────────

export const GLOSSARY_GROUPS: { key: string; icon: LucideIcon; iconClass: string; terms: string[] }[] = [
  { key: "project",  icon: FileText,  iconClass: "text-blue-600 dark:text-blue-400",     terms: ["poc", "validation", "acv", "tcc"] },
  { key: "map",      icon: Waypoints, iconClass: "text-purple-600 dark:text-purple-400", terms: ["map", "phase", "step", "task"] },
  { key: "criteria", icon: Target,    iconClass: "text-green-600 dark:text-green-400",   terms: ["successCriteria", "expectedOutcome", "actionItems"] },
  { key: "people",   icon: Users,     iconClass: "text-orange-600 dark:text-orange-400", terms: ["primaryEngineer", "stakeholder", "accountStatus", "guest"] },
];
