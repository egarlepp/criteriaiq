import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  rankingConfigs,
  endDateFlags,
  industries,
  tags,
  assumptionCategories,
  dependencyCategories,
  systemSettings,
} from "@shared/schema";

export type ResetSummary = {
  table: string;
  inserted: number;
  updated: number;
  totalDefaults: number;
  resetAt: string;
};

export type ResetActor = {
  userId: string;
  userEmail: string | null;
  userName: string | null;
};

export const DEFAULT_RANKING_CONFIGS = [
  { name: "In Quarter",   color: "#14B8A6", icon: "CalendarHeart",      description: "Expected to close this quarter" },
  { name: "Upside",       color: "#3B82F6", icon: "CalendarArrowUp",    description: "Potential upside opportunity" },
  { name: "Stretch",      color: "#FACC15", icon: "CalendarArrowDown",  description: "Stretch goal" },
  { name: "Out Quarter",  color: "#F97316", icon: "CalendarClock",      description: "Expected beyond this quarter" },
  { name: "Burn it Down", color: "#DC2626", icon: "CalendarX",          description: "Not pursuing" },
] as const;

export const DEFAULT_END_DATE_FLAGS = [
  {
    name: "Due Soon",
    description: "Shows when project end date is within 3 working days",
    badgeText: "Due soon!",
    badgeColor: "#F59E0B",
    triggerType: "days_before",
    triggerValue: 3,
    workingDays: true,
    priority: 2,
    projectStatuses: ["Planning", "In Progress", "TCC", "On Hold"],
  },
  {
    name: "Due This Week",
    description: "Shows when project end date is within 5 working days",
    badgeText: "Due This Week",
    badgeColor: "#FACC15",
    triggerType: "days_before",
    triggerValue: 5,
    workingDays: true,
    priority: 1,
    projectStatuses: ["Planning", "In Progress", "TCC", "On Hold"],
  },
  {
    name: "Due Today",
    description: "Shows when project is due today",
    badgeText: "Due today!",
    badgeColor: "#01714b",
    triggerType: "exact_date",
    triggerValue: 0,
    workingDays: false,
    priority: 3,
    projectStatuses: ["Planning", "In Progress", "TCC", "On Hold"],
  },
  {
    name: "Overdue",
    description: "Shows when project end date has passed",
    badgeText: "Overdue!",
    badgeColor: "#EF4444",
    triggerType: "days_after",
    triggerValue: 1,
    workingDays: false,
    priority: 4,
    projectStatuses: ["Planning", "In Progress", "TCC", "On Hold"],
  },
] as const;

export const DEFAULT_INDUSTRIES = [
  { name: "Technology",                  description: "Software, hardware, IT services, and internet companies",        icon: "Cpu" },
  { name: "Healthcare",                  description: "Hospitals, clinics, medical providers, and health services",     icon: "Stethoscope" },
  { name: "Financial Services",          description: "Banks, investment firms, payment processors, and fintech",       icon: "Landmark" },
  { name: "Insurance",                   description: "Insurance carriers, brokers, and reinsurance providers",         icon: "ShieldCheck" },
  { name: "Manufacturing",               description: "Industrial, discrete, and process manufacturing",                icon: "Factory" },
  { name: "Retail",                      description: "Brick-and-mortar retail, e-commerce, and consumer goods sales",  icon: "ShoppingBag" },
  { name: "Energy & Utilities",          description: "Oil & gas, power generation, water, and renewable energy",       icon: "Zap" },
  { name: "Telecommunications",          description: "Wireless carriers, ISPs, and communications infrastructure",     icon: "Antenna" },
  { name: "Government",                  description: "Federal, state, and local government agencies",                  icon: "Building" },
  { name: "Education",                   description: "K-12 schools, higher education, and edtech",                     icon: "GraduationCap" },
  { name: "Media & Entertainment",       description: "Publishing, broadcasting, gaming, and streaming services",       icon: "Clapperboard" },
  { name: "Real Estate",                 description: "Commercial and residential real estate, property management",    icon: "Home" },
  { name: "Transportation & Logistics",  description: "Airlines, shipping, trucking, rail, and supply chain",           icon: "Truck" },
  { name: "Pharmaceutical & Biotech",    description: "Drug manufacturers, biotech research, and life sciences",        icon: "FlaskConical" },
  { name: "Consumer Goods",              description: "CPG, food & beverage, apparel, and household products",          icon: "Package" },
  { name: "Professional Services",       description: "Consulting, legal, accounting, and advisory firms",              icon: "Briefcase" },
  { name: "Non-Profit",                  description: "Charities, foundations, and social-impact organizations",        icon: "HeartHandshake" },
  { name: "Hospitality & Travel",        description: "Hotels, restaurants, tourism, and travel services",              icon: "Hotel" },
] as const;

export const DEFAULT_SYSTEM_TAGS = [
  { name: "FIM/SCM",        color: "#EF4444", description: "File Integrity Monitoring and Security Configuration Management" },
  { name: "Compliance",     color: "#10B981", description: "Compliance and regulatory features" },
  { name: "ERP/CRM",        color: "#F59E0B", description: "Compliance across NetSuite and Salesforce." },
  { name: "Passwords",      color: "#8B5CF6", description: "Passwords" },
  { name: "Recovery",       color: "#06B6D4", description: "Comprehensive recovery" },
  { name: "Classification", color: "#84CC16", description: "Discover, classify, and secure sensitive data" },
  { name: "Endpoint",       color: "#64748B", description: "Endpoint Management" },
  { name: "AD-Security",    color: "#1E40AF", description: "AD Security-related" },
  { name: "Audit",          color: "#DC2626", description: "Audit trails and logging" },
  { name: "DLP",            color: "#059669", description: "Data Loss Prevention" },
  { name: "ITDR",           color: "#7C3AED", description: "Identity Threat Detection and Response" },
  { name: "DSPM",           color: "#0891B2", description: "Data Security Posture Management" },
  { name: "IGA",            color: "#2563EB", description: "Identity Governance and Administration" },
  { name: "PAM",            color: "#9333EA", description: "Privileged Access Management" },
  { name: "SaaS",           color: "#0D9488", description: "Software as a Service deployment" },
  { name: "On-Prem",        color: "#475569", description: "On-Premises deployment" },
  { name: "Hybrid",         color: "#EA580C", description: "Hybrid cloud/on-premises deployment" },
] as const;

export const DEFAULT_ASSUMPTION_DEPENDENCY_CATEGORIES = [
  { name: "Access & Permissions", description: "Requirements related to user access, roles, and permission configurations", icon: "KeyRound" },
  { name: "Telemetry / Logging",  description: "Log collection, telemetry pipelines, and observability requirements",      icon: "Activity" },
  { name: "Integrations",         description: "Third-party system integrations, APIs, and connector dependencies",        icon: "Plug" },
  { name: "Network",              description: "Network topology, firewall rules, VPN, and connectivity requirements",     icon: "Network" },
  { name: "Data & Scope",         description: "Data sources, scope definitions, data quality, and volume assumptions",    icon: "Database" },
  { name: "Operations",           description: "Operational processes, runbooks, maintenance windows, and staffing",       icon: "Cpu" },
  { name: "Environment",          description: "Environment configuration, infrastructure, cloud/on-prem specifics",       icon: "Server" },
] as const;

const RESET_AUDIT_KEY_PREFIX = "audit.field_settings_reset.";
const MAX_AUDIT_EVENTS = 50;

async function appendResetAudit(table: string, summary: ResetSummary, actor: ResetActor): Promise<void> {
  const auditKey = `${RESET_AUDIT_KEY_PREFIX}${table}`;
  const event = {
    resetAt: summary.resetAt,
    resetBy: {
      userId: actor.userId,
      userEmail: actor.userEmail,
      userName: actor.userName,
    },
    summary: {
      inserted: summary.inserted,
      updated: summary.updated,
      totalDefaults: summary.totalDefaults,
    },
  };

  const [existing] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, auditKey))
    .limit(1);

  let events: any[] = [];
  if (existing && existing.value && typeof existing.value === "object") {
    const v = existing.value as { events?: any[] };
    if (Array.isArray(v.events)) events = v.events;
  }
  events.push(event);
  if (events.length > MAX_AUDIT_EVENTS) {
    events = events.slice(events.length - MAX_AUDIT_EVENTS);
  }

  await db
    .insert(systemSettings)
    .values({
      key: auditKey,
      value: { events },
      description: `Audit trail of "${table}" field settings reset events`,
      updatedBy: actor.userId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: {
        value: { events },
        updatedBy: actor.userId,
        updatedAt: new Date(),
      },
    });

  console.log(
    `[field-settings-reset] table=${table} by=${actor.userEmail ?? actor.userId} ` +
    `inserted=${summary.inserted} updated=${summary.updated} total=${summary.totalDefaults}`
  );
}

function nowIso(): string {
  return new Date().toISOString();
}

// ── Rankings ─────────────────────────────────────────────────────────────────
export async function resetRankingDefaults(actor: ResetActor): Promise<ResetSummary> {
  let inserted = 0;
  let updated = 0;
  for (const def of DEFAULT_RANKING_CONFIGS) {
    const [existing] = await db
      .select()
      .from(rankingConfigs)
      .where(eq(rankingConfigs.name, def.name))
      .limit(1);
    if (!existing) {
      await db.insert(rankingConfigs).values({
        name: def.name,
        color: def.color,
        icon: def.icon,
        description: def.description,
        isActive: true,
      });
      inserted++;
    } else {
      await db
        .update(rankingConfigs)
        .set({
          color: def.color,
          icon: def.icon,
          description: def.description,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(rankingConfigs.id, existing.id));
      updated++;
    }
  }
  const summary: ResetSummary = {
    table: "rankings",
    inserted,
    updated,
    totalDefaults: DEFAULT_RANKING_CONFIGS.length,
    resetAt: nowIso(),
  };
  await appendResetAudit(summary.table, summary, actor);
  return summary;
}

// ── End-Date Flags ───────────────────────────────────────────────────────────
export async function resetEndDateFlagDefaults(actor: ResetActor): Promise<ResetSummary> {
  let inserted = 0;
  let updated = 0;
  for (const def of DEFAULT_END_DATE_FLAGS) {
    const [existing] = await db
      .select()
      .from(endDateFlags)
      .where(and(eq(endDateFlags.name, def.name), eq(endDateFlags.isSystem, true)))
      .limit(1);
    if (!existing) {
      await db.insert(endDateFlags).values({
        name: def.name,
        description: def.description,
        badgeText: def.badgeText,
        badgeColor: def.badgeColor,
        triggerType: def.triggerType,
        triggerValue: def.triggerValue,
        workingDays: def.workingDays,
        priority: def.priority,
        projectStatuses: [...def.projectStatuses],
        targetField: "project.endDate",
        isActive: true,
        isSystem: true,
        createdBy: actor.userId,
      });
      inserted++;
    } else {
      await db
        .update(endDateFlags)
        .set({
          description: def.description,
          badgeText: def.badgeText,
          badgeColor: def.badgeColor,
          triggerType: def.triggerType,
          triggerValue: def.triggerValue,
          workingDays: def.workingDays,
          priority: def.priority,
          projectStatuses: [...def.projectStatuses],
          targetField: "project.endDate",
          isActive: true,
          isSystem: true,
          updatedAt: new Date(),
        })
        .where(eq(endDateFlags.id, existing.id));
      updated++;
    }
  }
  const summary: ResetSummary = {
    table: "end_date_flags",
    inserted,
    updated,
    totalDefaults: DEFAULT_END_DATE_FLAGS.length,
    resetAt: nowIso(),
  };
  await appendResetAudit(summary.table, summary, actor);
  return summary;
}

// ── Industries ───────────────────────────────────────────────────────────────
export async function resetIndustryDefaults(actor: ResetActor): Promise<ResetSummary> {
  let inserted = 0;
  let updated = 0;
  for (const def of DEFAULT_INDUSTRIES) {
    const [existing] = await db
      .select()
      .from(industries)
      .where(eq(industries.name, def.name))
      .limit(1);
    if (!existing) {
      await db.insert(industries).values({
        name: def.name,
        description: def.description,
        icon: def.icon,
        isActive: true,
      });
      inserted++;
    } else {
      await db
        .update(industries)
        .set({
          description: def.description,
          icon: def.icon,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(industries.id, existing.id));
      updated++;
    }
  }
  const summary: ResetSummary = {
    table: "industries",
    inserted,
    updated,
    totalDefaults: DEFAULT_INDUSTRIES.length,
    resetAt: nowIso(),
  };
  await appendResetAudit(summary.table, summary, actor);
  return summary;
}

// ── System Tags ──────────────────────────────────────────────────────────────
export async function resetSystemTagDefaults(actor: ResetActor): Promise<ResetSummary> {
  let inserted = 0;
  let updated = 0;
  for (const def of DEFAULT_SYSTEM_TAGS) {
    const [existing] = await db
      .select()
      .from(tags)
      .where(eq(tags.name, def.name))
      .limit(1);
    if (!existing) {
      await db.insert(tags).values({
        name: def.name,
        color: def.color,
        description: def.description,
        createdBy: "system",
      });
      inserted++;
    } else if (existing.createdBy === "system") {
      await db
        .update(tags)
        .set({
          color: def.color,
          description: def.description,
        })
        .where(eq(tags.id, existing.id));
      updated++;
    }
    // If a non-system tag already exists with the same name, leave it alone —
    // creating it as system would violate the unique-name constraint and
    // overwriting it would clobber a user customization.
  }
  const summary: ResetSummary = {
    table: "system_tags",
    inserted,
    updated,
    totalDefaults: DEFAULT_SYSTEM_TAGS.length,
    resetAt: nowIso(),
  };
  await appendResetAudit(summary.table, summary, actor);
  return summary;
}

// ── Assumption Categories ────────────────────────────────────────────────────
export async function resetAssumptionCategoryDefaults(actor: ResetActor): Promise<ResetSummary> {
  let inserted = 0;
  let updated = 0;
  for (const def of DEFAULT_ASSUMPTION_DEPENDENCY_CATEGORIES) {
    const [existing] = await db
      .select()
      .from(assumptionCategories)
      .where(eq(assumptionCategories.name, def.name))
      .limit(1);
    if (!existing) {
      await db.insert(assumptionCategories).values({
        name: def.name,
        description: def.description,
        icon: def.icon,
        isSystem: true,
        isActive: true,
        createdBy: null,
      });
      inserted++;
    } else if (existing.isSystem) {
      await db
        .update(assumptionCategories)
        .set({
          description: def.description,
          icon: def.icon,
          isSystem: true,
          isActive: true,
          updatedBy: actor.userId,
          updatedAt: new Date(),
        })
        .where(eq(assumptionCategories.id, existing.id));
      updated++;
    }
    // Non-system categories with the same name are user customizations — skip.
  }
  const summary: ResetSummary = {
    table: "assumption_categories",
    inserted,
    updated,
    totalDefaults: DEFAULT_ASSUMPTION_DEPENDENCY_CATEGORIES.length,
    resetAt: nowIso(),
  };
  await appendResetAudit(summary.table, summary, actor);
  return summary;
}

// ── Dependency Categories ────────────────────────────────────────────────────
export async function resetDependencyCategoryDefaults(actor: ResetActor): Promise<ResetSummary> {
  let inserted = 0;
  let updated = 0;
  for (const def of DEFAULT_ASSUMPTION_DEPENDENCY_CATEGORIES) {
    const [existing] = await db
      .select()
      .from(dependencyCategories)
      .where(eq(dependencyCategories.name, def.name))
      .limit(1);
    if (!existing) {
      await db.insert(dependencyCategories).values({
        name: def.name,
        description: def.description,
        icon: def.icon,
        isSystem: true,
        isActive: true,
        createdBy: null,
      });
      inserted++;
    } else if (existing.isSystem) {
      await db
        .update(dependencyCategories)
        .set({
          description: def.description,
          icon: def.icon,
          isSystem: true,
          isActive: true,
          updatedBy: actor.userId,
          updatedAt: new Date(),
        })
        .where(eq(dependencyCategories.id, existing.id));
      updated++;
    }
  }
  const summary: ResetSummary = {
    table: "dependency_categories",
    inserted,
    updated,
    totalDefaults: DEFAULT_ASSUMPTION_DEPENDENCY_CATEGORIES.length,
    resetAt: nowIso(),
  };
  await appendResetAudit(summary.table, summary, actor);
  return summary;
}
