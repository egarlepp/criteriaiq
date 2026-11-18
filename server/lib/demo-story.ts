// Demo Mode "story" content: the people, plan, criteria, outcomes and
// requests that make a seeded demo look like a real validation practice.
// demo-seeder.ts decides how many accounts and projects to create; this
// module decides what each one contains.
//
// Demo people are real `users` rows (the users table has no is_demo
// column) marked by an email under DEMO_USER_EMAIL_DOMAIN. ".invalid" is a
// reserved TLD, so no mailbox or identity provider can ever own one: they
// have no password and cannot sign in, but an Admin can open any of them
// with View As. The wipe removes them by that domain.
import { faker } from "@faker-js/faker";
import { eq, like, sql } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/schema";
import { toPageValues } from "@shared/permissions";
import type { CriterionPriority } from "@shared/value-journey";
import {
  addWorkingDays,
  fromIsoDate,
  toIsoDate,
  type WorkingCalendar,
} from "@shared/working-calendar";
import { storage } from "../storage";

export const DEMO_USER_EMAIL_DOMAIN = "demo.criteriaiq.invalid";
const DEMO_USER_EMAIL_PATTERN = `%@${DEMO_USER_EMAIL_DOMAIN}`;

export function isDemoUserEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${DEMO_USER_EMAIL_DOMAIN}`);
}

// ── Demo Staff ──────────────────────────────────────────────────────────────

type StaffSlot = "se" | "specialist" | "sales" | "lead" | "proserv";

interface StaffSpec {
  slot: StaffSlot;
  id: string;
  firstName: string;
  lastName: string;
  title: string;
  role: string;
}

/** Fixed ids so a second seed reuses the same people instead of adding more. */
const DEMO_STAFF: readonly StaffSpec[] = [
  { slot: "se", id: "demo-staff-se-1", firstName: "Jordan", lastName: "Rivera", title: "Solutions Engineer", role: "Engineer" },
  { slot: "se", id: "demo-staff-se-2", firstName: "Aisha", lastName: "Okafor", title: "Solutions Engineer", role: "Engineer" },
  { slot: "specialist", id: "demo-staff-specialist", firstName: "Priya", lastName: "Natarajan", title: "Identity Specialist", role: "Engineer" },
  { slot: "sales", id: "demo-staff-sales", firstName: "Marcus", lastName: "Chen", title: "Account Executive", role: "Sales" },
  { slot: "lead", id: "demo-staff-lead", firstName: "Elena", lastName: "Sokolova", title: "SE Manager", role: "Engineer" },
  // The Pro Services people named on won projects' handoff teams.
  { slot: "proserv", id: "demo-staff-proserv-1", firstName: "Tomas", lastName: "Herrera", title: "Implementation Consultant", role: "ProServ" },
  { slot: "proserv", id: "demo-staff-proserv-2", firstName: "Grace", lastName: "Liu", title: "Solution Architect", role: "ProServ" },
];

/** "First Last (Demo)" for a Demo Staff id, as the user list shows it; null for anyone else. */
export function demoStaffName(id: string): string | null {
  const s = DEMO_STAFF.find((staff) => staff.id === id);
  return s ? `${s.firstName} ${s.lastName} (Demo)` : null;
}

/** The Demo Staff member's email, as the seed creates it; null for anyone else. */
export function demoStaffEmail(id: string): string | null {
  const s = DEMO_STAFF.find((staff) => staff.id === id);
  return s ? `${s.firstName}.${s.lastName}@${DEMO_USER_EMAIL_DOMAIN}`.toLowerCase() : null;
}

export interface DemoStaff {
  engineers: string[];
  specialist: string;
  sales: string;
  lead: string;
  proserv: string[];
  all: string[];
}

/** Starts a demo user with its role's page permissions, as a new user would. */
async function copyRolePermissions(userId: string, role: string): Promise<void> {
  const roleRow = await storage.getRoleByName(role);
  if (!roleRow) return;
  const defaults = toPageValues(await storage.getRolePermissions(roleRow.id));
  if (defaults.length > 0) await storage.setUserPermissions(userId, defaults);
}

async function upsertDemoUser(values: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  title: string;
  role: string;
  accountId?: number | null;
}): Promise<void> {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.id, values.id)).limit(1);
  if (existing) {
    await db
      .update(users)
      .set({ accountId: values.accountId ?? null, isActive: true, updatedAt: new Date() })
      .where(eq(users.id, values.id));
    return;
  }
  await db.insert(users).values({
    ...values,
    password: null,
    isActive: true,
    // Approved so View As can open them; with no password and an .invalid
    // address they still have no way to sign in.
    isApproved: true,
    receiveEmails: false,
    skipWelcomeEmail: true,
  } as typeof users.$inferInsert);
  await copyRolePermissions(values.id, values.role);
}

export async function ensureDemoStaff(): Promise<DemoStaff> {
  for (const s of DEMO_STAFF) {
    await upsertDemoUser({
      id: s.id,
      email: demoStaffEmail(s.id)!,
      firstName: s.firstName,
      lastName: `${s.lastName} (Demo)`,
      title: s.title,
      role: s.role,
    });
  }
  const bySlot = (slot: StaffSlot) => DEMO_STAFF.filter((s) => s.slot === slot).map((s) => s.id);
  return {
    engineers: bySlot("se"),
    specialist: bySlot("specialist")[0],
    sales: bySlot("sales")[0],
    lead: bySlot("lead")[0],
    proserv: bySlot("proserv"),
    all: DEMO_STAFF.map((s) => s.id),
  };
}

export interface DemoCustomerUser {
  id: string;
  email: string;
  name: string;
  /** Stakeholder type on the account's contact list. */
  stakeholderType: string;
  /** Job title, as the user list shows it. */
  title: string;
}

/** The customer-side people each demo account gets: its champion first. */
const DEMO_CUSTOMER_ROLES = [
  { suffix: "", stakeholderType: "Technical Champion", titles: ["IAM Program Manager", "Identity Architect", "Director of IT Security"] },
  { suffix: "-buyer", stakeholderType: "Economic Buyer", titles: ["CISO", "VP Information Security", "CIO"] },
] as const;

/** How many customer users each demo account gets. */
export const DEMO_CUSTOMER_USERS_PER_ACCOUNT = DEMO_CUSTOMER_ROLES.length;

/**
 * A customer-side person for one demo account (Customer role): index 0 is
 * the technical champion, index 1 the economic buyer.
 */
export async function createDemoCustomerUser(customerId: number, accountName: string, index = 0): Promise<DemoCustomerUser> {
  const role = DEMO_CUSTOMER_ROLES[Math.min(index, DEMO_CUSTOMER_ROLES.length - 1)];
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const slug = accountName.replace(/\[demo\]\s*/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
  const id = `demo-customer-${customerId}${role.suffix}`;
  const email = `${firstName}.${lastName}.${slug || customerId}@${DEMO_USER_EMAIL_DOMAIN}`.toLowerCase().replace(/[^a-z0-9.@-]/g, "");
  const title = faker.helpers.arrayElement(role.titles);
  await upsertDemoUser({
    id,
    email,
    firstName,
    lastName: `${lastName} (Demo)`,
    title,
    role: "Customer",
    accountId: customerId,
  });
  return { id, email, name: `${firstName} ${lastName}`, stakeholderType: role.stakeholderType, title };
}

/** Ids of every demo user, for the wipe. */
export async function listDemoUserIds(): Promise<string[]> {
  const rows = await db.select({ id: users.id }).from(users).where(like(users.email, DEMO_USER_EMAIL_PATTERN));
  return rows.map((r) => r.id);
}

/**
 * Removes demo users after the demo rows that pointed at them are gone.
 * Each user goes in its own statement: a demo user that something real
 * still points at (say, an Admin assigned them a real task) is kept and
 * deactivated instead, so the wipe never fails on it. Returns
 * { removed, deactivated }.
 */
export async function removeDemoUsers(): Promise<{ removed: number; deactivated: number }> {
  let removed = 0;
  let deactivated = 0;
  for (const id of await listDemoUserIds()) {
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`DELETE FROM user_permissions WHERE user_id = ${id}`);
        await tx.execute(sql`DELETE FROM user_accounts WHERE user_id = ${id}`);
        await tx.execute(sql`DELETE FROM users WHERE id = ${id}`);
      });
      removed++;
    } catch {
      await db.update(users).set({ isActive: false, updatedAt: new Date() }).where(eq(users.id, id));
      deactivated++;
    }
  }
  return { removed, deactivated };
}

// ── Project stage ───────────────────────────────────────────────────────────

export type DemoStage = "early" | "mid" | "late" | "won" | "lost" | "other";

/** Where a project is in its validation, from its Internal Status name. */
export function stageForStatus(status: string): DemoStage {
  const s = status.toLowerCase();
  if (s.includes("won")) return "won";
  if (s.includes("lost") || s.includes("cancel")) return "lost";
  if (s.includes("tcc") || s.includes("review") || s.includes("complete")) return "late";
  if (s.includes("progress") || s.includes("active")) return "mid";
  if (s.includes("plan") || s.includes("new") || s.includes("not started") || s.includes("pending")) return "early";
  return "other";
}

/** How often each stage comes up among demo projects (weights, not %). */
const STAGE_WEIGHTS: Record<DemoStage, number> = {
  mid: 32,
  won: 24,
  late: 16,
  lost: 14,
  early: 10,
  other: 4,
};

/**
 * Internal Statuses for `total` demo projects, in random order. Every
 * configured status comes up at least once when there are enough
 * projects, so each column of the board and each filter has something in
 * it. The rest follow STAGE_WEIGHTS (largest remainder), so even a small
 * seed gets a believable mix instead of a lucky draw; a stage with no
 * configured status gives its share to the others. Names within a stage
 * take turns.
 */
export function planDemoStatuses(names: readonly string[], total: number): string[] {
  if (total <= 0) return [];
  if (names.length === 0) return Array.from({ length: total }, () => "In Progress");
  const out: string[] = names.length <= total ? [...names] : faker.helpers.arrayElements([...names], total);
  const rest = total - out.length;
  if (rest > 0) {
    const byStage = new Map<DemoStage, string[]>();
    for (const n of names) {
      const stage = stageForStatus(n);
      byStage.set(stage, [...(byStage.get(stage) ?? []), n]);
    }
    const stages = [...byStage.keys()];
    const weightSum = stages.reduce((sum, st) => sum + STAGE_WEIGHTS[st], 0);
    const exact = stages.map((st) => (STAGE_WEIGHTS[st] / weightSum) * rest);
    const counts = exact.map(Math.floor);
    const order = exact.map((x, i) => [x - Math.floor(x), i] as const).sort((x, y) => y[0] - x[0]);
    const short = rest - counts.reduce((a, b) => a + b, 0);
    for (let k = 0; k < short; k++) counts[order[k][1]]++;
    stages.forEach((st, i) => {
      const pool = byStage.get(st)!;
      for (let k = 0; k < counts[i]; k++) out.push(pool[k % pool.length]);
    });
  }
  return faker.helpers.shuffle(out);
}

/** Account Status words and the project stages they make sense for. */
const ACCOUNT_STATUS_STAGES: ReadonlyArray<{ words: RegExp; stages: readonly DemoStage[] }> = [
  { words: /complete|done|closed|finished/, stages: ["won", "late"] },
  { words: /hold|pause/, stages: ["other"] },
  { words: /vendor|competit/, stages: ["lost", "mid"] },
  { words: /select|choos/, stages: ["early", "lost"] },
  { words: /cab|pending|feedback|review|approv/, stages: ["late", "mid"] },
  { words: /delay|late|risk|assist|help|block|stuck/, stages: ["mid", "early"] },
  { words: /on time|on track|green/, stages: ["mid", "early", "late"] },
];

/**
 * Whether an Account Status reads right next to a project at this stage,
 * so a demo never shows "Closed Won" beside "On Hold". Names the
 * admin made up fit any open project.
 */
export function accountStatusFits(accountStatus: string, stage: DemoStage): boolean {
  const s = accountStatus.toLowerCase();
  const rule = ACCOUNT_STATUS_STAGES.find((r) => r.words.test(s));
  const stages: readonly DemoStage[] = rule?.stages ?? ["mid", "early", "late"];
  return stages.includes(stage);
}

/**
 * An Account Status for each project (same order as `internalStatuses`).
 * Every configured Account Status is used at least once when some project
 * fits it, and each one fits its project's Internal Status. The rest lean
 * to "on time" wording for open projects, like a real book of work.
 */
export function planAccountStatuses(internalStatuses: readonly string[], accountStatuses: readonly string[]): string[] {
  const stages = internalStatuses.map(stageForStatus);
  if (accountStatuses.length === 0) return stages.map(() => "On Time");
  const fits = (status: string) => stages.map((st, i) => (accountStatusFits(status, st) ? i : -1)).filter((i) => i >= 0);
  // Hardest to place first, so a narrow status isn't crowded out. A few
  // tries, keeping the one that uses the most statuses.
  let out: (string | null)[] = [];
  for (let attempt = 0; attempt < 12; attempt++) {
    const tryOut: (string | null)[] = stages.map(() => null);
    const ordered = faker.helpers.shuffle([...accountStatuses]).sort((a, b) => fits(a).length - fits(b).length);
    for (const status of ordered) {
      const open = fits(status).filter((i) => tryOut[i] === null);
      if (open.length > 0) tryOut[faker.helpers.arrayElement(open)] = status;
    }
    if (tryOut.filter(Boolean).length > out.filter(Boolean).length) out = tryOut;
    if (out.filter(Boolean).length === Math.min(accountStatuses.length, stages.length)) break;
  }
  return out.map((picked, i) => {
    if (picked) return picked;
    const options = accountStatuses.filter((s) => accountStatusFits(s, stages[i]));
    if (options.length === 0) return faker.helpers.arrayElement([...accountStatuses]);
    const onTime = options.filter((s) => /on time|on track/i.test(s));
    if (onTime.length > 0 && stages[i] !== "won" && stages[i] !== "lost" && faker.datatype.boolean({ probability: 0.5 })) {
      return onTime[0];
    }
    return faker.helpers.arrayElement(options);
  });
}

/** One change in a project's status history (project_audits). */
export interface PlannedStatusChange {
  fieldName: "status" | "customerStatus";
  oldValue: string;
  newValue: string;
  at: Date;
}

/**
 * The Internal and Account Status changes that brought a project to where
 * it is, for its status history: Planning, then In Progress, then any late
 * status, then the final one, spread over the project window. Only
 * configured statuses are used; steps that aren't configured are skipped.
 */
export function planStatusHistory(
  finalStatus: string,
  finalAccountStatus: string,
  statusNames: readonly string[],
  accountStatusNames: readonly string[],
  window: { start: Date; end: Date },
  now: Date = new Date(),
): PlannedStatusChange[] {
  const stage = stageForStatus(finalStatus);
  const find = (want: DemoStage) => statusNames.find((n) => stageForStatus(n) === want && n !== finalStatus);
  const path: string[] = [];
  const planning = find("early");
  if (planning && stage !== "early") path.push(planning);
  const inProgress = find("mid");
  if (inProgress && stage !== "early" && stage !== "mid") path.push(inProgress);
  const late = statusNames.find((n) => /tcc/i.test(n) && n !== finalStatus);
  if (late && stage === "won") path.push(late);
  path.push(finalStatus);

  const last = Math.min(now.getTime() - 3_600_000, window.end.getTime());
  const first = window.start.getTime();
  const span = Math.max(last - first, 86_400_000);
  const at = (k: number, of: number) => new Date(first + Math.round((span * k) / Math.max(of, 1)));
  const changes: PlannedStatusChange[] = [];
  for (let k = 1; k < path.length; k++) {
    changes.push({ fieldName: "status", oldValue: path[k - 1], newValue: path[k], at: at(k, path.length) });
  }
  const onTime = accountStatusNames.find((n) => /on time|on track/i.test(n));
  if (onTime && onTime !== finalAccountStatus) {
    changes.push({ fieldName: "customerStatus", oldValue: onTime, newValue: finalAccountStatus, at: at(path.length * 2 - 1, path.length * 2) });
  }
  return changes.sort((x, y) => x.at.getTime() - y.at.getTime());
}

/** Share of the plan that is done at each stage. */
const STAGE_PROGRESS: Record<DemoStage, number> = {
  early: 0.1,
  mid: 0.45,
  late: 0.72,
  won: 1,
  lost: 0.7,
  other: 0.35,
};

// ── MAP plan ────────────────────────────────────────────────────────────────

/** Phase → steps → tasks of an identity-governance validation. */
export const DEMO_MAP_PLAN: ReadonlyArray<{ phase: string; steps: ReadonlyArray<{ step: string; tasks: readonly string[] }> }> = [
  {
    phase: "Kickoff and Discovery",
    steps: [
      { step: "Align on scope", tasks: ["Kickoff call with stakeholders", "Confirm success criteria", "Agree on timeline and owners", "Share validation plan", "Confirm executive sponsor"] },
      { step: "Current-state review", tasks: ["Inventory identity sources", "Map critical applications", "Review audit findings", "Document access review process", "Identify privileged accounts"] },
      { step: "Readiness", tasks: ["Security questionnaire", "Network and firewall approvals", "Service accounts created", "Test users provisioned", "Data handling sign-off"] },
      { step: "Plan approval", tasks: ["Validation plan sign-off", "Schedule working sessions", "Book readout date", "Confirm decision process", "Confirm budget timing"] },
      { step: "Logistics", tasks: ["Shared workspace set up", "Weekly status cadence", "Escalation path agreed", "Access to sandbox", "Customer team onboarded"] },
    ],
  },
  {
    phase: "Environment Setup",
    steps: [
      { step: "Connect sources", tasks: ["Connect Active Directory", "Connect HR system", "Connect cloud directory", "Import application catalog", "Validate attribute mapping"] },
      { step: "Configure policies", tasks: ["Joiner-mover-leaver rules", "Role model draft", "Separation-of-duties rules", "Certification campaign template", "Approval workflows"] },
      { step: "Integrations", tasks: ["SIEM integration", "Ticketing integration", "SSO configuration", "Email notifications", "API access for reporting"] },
      { step: "Data quality", tasks: ["Orphaned account report", "Duplicate identity cleanup", "Manager hierarchy check", "Entitlement descriptions", "Risk scoring baseline"] },
      { step: "Smoke test", tasks: ["End-to-end provisioning test", "Deprovisioning test", "Access request test", "Report run test", "Customer walkthrough"] },
    ],
  },
  {
    phase: "Validation Testing",
    steps: [
      { step: "Core use cases", tasks: ["Automated onboarding", "Automated offboarding", "Access certification campaign", "Privileged access review", "Self-service access request"] },
      { step: "Compliance", tasks: ["Audit evidence export", "Policy violation detection", "SoD conflict report", "Control mapping review", "Auditor walkthrough"] },
      { step: "Scale and performance", tasks: ["Load 50k identities", "Campaign at scale", "Sync time measurement", "Report performance", "Failover test"] },
      { step: "Admin experience", tasks: ["Admin console review", "Delegated administration", "Custom dashboards", "Role mining session", "Help desk workflow"] },
      { step: "Security review", tasks: ["Pen test findings review", "Encryption review", "Least-privilege review", "Log retention check", "Data residency check"] },
    ],
  },
  {
    phase: "Readout and Close",
    steps: [
      { step: "Results", tasks: ["Compile criteria results", "Business value summary", "Executive readout deck", "Technical readout", "Gap and roadmap review"] },
      { step: "Decision", tasks: ["Executive readout meeting", "Technical close sign-off", "Procurement handoff", "Reference call", "Mutual close plan"] },
      { step: "Handoff", tasks: ["Implementation kickoff plan", "ProServ handoff", "Success plan", "Customer team training plan", "Archive validation workspace"] },
      { step: "Retrospective", tasks: ["Internal retro", "Win/loss notes", "Criteria library updates", "Template improvements", "Share lessons learned"] },
      { step: "Follow-up", tasks: ["Thank-you note", "Renewal timing noted", "Expansion opportunities", "Champion check-in", "Close validation"] },
    ],
  },
  {
    phase: "Expansion",
    steps: [
      { step: "Next use cases", tasks: ["Identify phase two scope", "Cloud entitlements review", "Third-party access review", "Machine identities", "Executive check-in"] },
      { step: "Measure value", tasks: ["Hours saved report", "Audit findings trend", "Access review completion", "Risk reduction summary", "Quarterly business review"] },
      { step: "Advocacy", tasks: ["Case study draft", "Customer advisory board invite", "Conference talk", "Peer reference", "Product feedback session"] },
      { step: "Roadmap", tasks: ["Roadmap briefing", "Beta program invite", "Feature requests logged", "Integration requests logged", "Next review date"] },
      { step: "Wrap", tasks: ["Expansion proposal", "Pricing review", "Contract timing", "Stakeholder map update", "Plan next validation"] },
    ],
  },
];

export interface PlannedMapItem {
  status: "not_started" | "in_progress" | "complete" | "blocked";
  startDate: Date;
  dueDate: Date;
  completedDate: Date | null;
}

/**
 * Lays `count` items end to end across the project window on working days,
 * and marks the first share (by stage) complete (the status the MAP screens
 * use), the next one in progress and, mid-validation, the one after it
 * blocked. Nothing after an item that hasn't started is ever started.
 */
export function planMapItems(
  count: number,
  window: { start: Date; end: Date },
  stage: DemoStage,
  calendar: WorkingCalendar,
): PlannedMapItem[] {
  if (count <= 0) return [];
  const startIso = toIsoDate(window.start);
  const totalDays = Math.max(count, Math.round((window.end.getTime() - window.start.getTime()) / 86_400_000 * 5 / 7));
  const per = Math.max(1, Math.floor(totalDays / count));
  const done = Math.round(count * STAGE_PROGRESS[stage]);
  return Array.from({ length: count }, (_, i) => {
    const itemStart = fromIsoDate(addWorkingDays(startIso, i * per, calendar));
    const itemDue = fromIsoDate(addWorkingDays(startIso, (i + 1) * per - 1, calendar));
    let status: PlannedMapItem["status"] = "not_started";
    if (i < done) status = "complete";
    else if (i === done && stage !== "won" && stage !== "lost") status = "in_progress";
    else if (stage === "mid" && i === done + 1) status = "blocked";
    return { status, startDate: itemStart, dueDate: itemDue, completedDate: status === "complete" ? itemDue : null };
  });
}

// ── Value journey ───────────────────────────────────────────────────────────

/**
 * Must-have or nice-to-have for the i-th of `count` criteria: the last third
 * are nice-to-haves (at least one once there are three), the rest decide the
 * technical win.
 */
export function criterionPriorityFor(index: number, count: number): CriterionPriority {
  const nice = count >= 3 ? Math.max(1, Math.floor(count / 3)) : 0;
  return index >= count - nice ? "nice_to_have" : "must_have";
}

/**
 * Where the customer's agreement to the criteria stands. The agreement is
 * the gate into Build, so a project still planning has sent the criteria and
 * waits, and every project past planning has them agreed. About a third of
 * projects mid-test reworded a criterion after the customer agreed, so the
 * page asks them to agree again.
 */
export function demoAgreementFor(stage: DemoStage, planningDone: boolean): "sent" | "agreed" | "changed" {
  if (!planningDone) return "sent";
  if (stage === "mid" && faker.datatype.boolean({ probability: 0.35 })) return "changed";
  return "agreed";
}

/** How far a plan phase has come, from its planned items. */
export function validationProgress(items: ReadonlyArray<{ status: string }>): { share: number; started: boolean; ended: boolean } {
  if (items.length === 0) return { share: 0, started: false, ended: false };
  const done = items.filter((i) => i.status === "complete").length;
  return {
    share: done / items.length,
    started: items.some((i) => i.status !== "not_started"),
    ended: done === items.length,
  };
}

// ── Success criteria ────────────────────────────────────────────────────────

const CRITERIA_LIBRARY: ReadonlyArray<{ criterion: string; expectedOutcome: string; actionItem: string }> = [
  { criterion: "New hires get day-one access automatically from the HR record", expectedOutcome: "Provisioning completes within 1 hour of the HR hire event", actionItem: "Run three test hires through the HR connector" },
  { criterion: "Leavers lose all access the day they leave", expectedOutcome: "Every account disabled within 15 minutes of termination", actionItem: "Terminate a test user and check each connected system" },
  { criterion: "Quarterly access reviews run without spreadsheets", expectedOutcome: "Managers certify access in the product; completion above 95%", actionItem: "Run a pilot campaign for two departments" },
  { criterion: "Separation-of-duties conflicts are detected before access is granted", expectedOutcome: "Conflicting requests are blocked or routed for approval", actionItem: "Request a known toxic combination as a test user" },
  { criterion: "Auditors can pull evidence without IT help", expectedOutcome: "Evidence export for the top 10 controls in under 10 minutes", actionItem: "Walk the internal auditor through the export" },
  { criterion: "Privileged accounts are inventoried and owned", expectedOutcome: "100% of privileged accounts have a named owner", actionItem: "Import privileged accounts and assign owners" },
  { criterion: "Users request access through self-service", expectedOutcome: "Request-to-grant time under 4 hours for standard access", actionItem: "Pilot self-service with the help desk team" },
  { criterion: "Orphaned accounts are found and cleaned up", expectedOutcome: "Orphaned account count reduced by 90% in the pilot scope", actionItem: "Run the orphaned account report and remediate" },
  { criterion: "The platform handles our identity volume", expectedOutcome: "Full sync of 50,000 identities in under 30 minutes", actionItem: "Load the full test data set and time the sync" },
  { criterion: "Security events flow into the SIEM", expectedOutcome: "Access changes visible in the SIEM within 5 minutes", actionItem: "Configure the SIEM connector and trigger test events" },
];

/** A criterion to plan from: the demo library's rows carry their solution, component and value. */
export interface CriterionSource {
  criterion: string;
  expectedOutcome: string;
  actionItem: string;
  productName?: string;
  componentName?: string;
  valueMappingName?: string;
}

export interface PlannedCriterion extends CriterionSource {
  status: string;
  notes: string | null;
}

/**
 * 4–6 criteria, taken from `pool` (the project's solutions in the demo
 * library) when given. Their statuses follow the phase that tests them
 * (`validation`): nothing is met before testing starts, about as many as
 * the phase has done while it runs, and every must-have once it ends. Lost
 * projects failed one or two must-haves (the reason they lost); about half
 * of the late projects failed a nice-to-have but still went ahead. Without
 * `validation`, the project's stage stands in for it.
 */
export function planCriteria(
  stage: DemoStage,
  pool: readonly CriterionSource[] = CRITERIA_LIBRARY,
  validation?: { share: number; started: boolean; ended: boolean },
): PlannedCriterion[] {
  const source = pool.length > 0 ? pool : CRITERIA_LIBRARY;
  const count = Math.min(source.length, faker.number.int({ min: 4, max: 6 }));
  const picked = faker.helpers.arrayElements(source, count);
  const progress = validation ?? {
    share: STAGE_PROGRESS[stage],
    started: stage !== "early",
    ended: stage === "won" || stage === "late",
  };
  const mustCount = picked.filter((_, i) => criterionPriorityFor(i, picked.length) === "must_have").length;
  const met = progress.ended ? picked.length : progress.started ? Math.round(picked.length * progress.share) : 0;
  const failed = new Set<number>();
  if (stage === "lost" && mustCount > 0) {
    // The last must-haves tested are the ones that failed.
    const fails = Math.min(mustCount, faker.datatype.boolean({ probability: 0.4 }) ? 2 : 1);
    for (let k = 0; k < fails; k++) failed.add(mustCount - 1 - k);
  } else if (stage === "late" && mustCount < picked.length && faker.datatype.boolean({ probability: 0.5 })) {
    failed.add(picked.length - 1);
  }
  return picked.map((c, i) => {
    let status = "pending";
    let notes: string | null = null;
    if (failed.has(i)) {
      status = "fail";
      notes = "Did not meet the target in the customer's environment.";
    } else if (i < met) {
      status = "complete";
      notes = "Verified with the customer team.";
    } else if (i === met && progress.started && !progress.ended && stage !== "lost") {
      status = "in_progress";
    } else if (stage === "mid" && i === met + 1 && progress.started) {
      status = "at_risk";
      notes = "Waiting on the customer's firewall change.";
    }
    return { ...c, status, notes };
  });
}

// ── Deal fields ─────────────────────────────────────────────────────────────

/** The Environment options on the project form. */
export const DEMO_ENVIRONMENTS = ["CloudLAB", "OnPremise Production", "OnPremise PreProd", "SaaS"] as const;

/** Sales stage (Project Board "Sales Stage" view) for a project's stage. */
export function salesStageFor(stage: DemoStage): string {
  switch (stage) {
    case "won": return "Closed Won";
    case "lost": return "Closed Lost";
    case "late": return faker.helpers.arrayElement(["Validate", "Negotiate"]);
    case "mid": return faker.helpers.arrayElement(["Scope", "Validate"]);
    case "early": return faker.helpers.arrayElement(["Discover", "Align"]);
    default: return faker.helpers.arrayElement(["Align", "Scope"]);
  }
}

/** Forecast category (Project Board "Forecast Category" view) for a project's stage. */
export function forecastCategoryFor(stage: DemoStage): string {
  switch (stage) {
    case "won": return "Closed";
    case "lost": return "Omitted";
    case "late": return faker.helpers.arrayElement(["Commit", "Best Case"]);
    case "mid": return faker.helpers.arrayElement(["Best Case", "Pipeline"]);
    default: return "Pipeline";
  }
}

/**
 * A configured Risk or Ranking value: `usual` (when configured) most of the
 * time, any other configured value with probability `pOther`.
 */
export function pickConfigured(names: readonly string[], usual: string, pOther: number): string {
  const others = names.filter((n) => n !== usual);
  if (others.length > 0 && (!names.includes(usual) || faker.datatype.boolean({ probability: pOther }))) {
    return faker.helpers.arrayElement(others);
  }
  return usual;
}

// ── Solution gaps ───────────────────────────────────────────────────────────

const GAP_LIBRARY: ReadonlyArray<{ gapName: string; gapType: string; description: string; workaround: string | null }> = [
  { gapName: "No connector for the legacy HR system", gapType: "Integration", description: "The customer's HR system has no out-of-the-box connector; identities have to come in through a flat-file export.", workaround: "Nightly CSV export picked up by the generic file connector." },
  { gapName: "Review reminders cannot be localized", gapType: "Feature", description: "Access review reminder emails are English only; the customer has reviewers in Germany and Brazil.", workaround: null },
  { gapName: "Sync slows past 80,000 identities", gapType: "Scale/Performance", description: "Full sync time grows sharply above 80,000 identities in the customer's test load.", workaround: "Split the sync into two scheduled scopes." },
  { gapName: "No approval delegation while on leave", gapType: "Feature", description: "Approvers cannot hand their queue to a delegate while out of office.", workaround: "Admin reassigns pending approvals by hand." },
  { gapName: "SIEM export lacks a field the SOC needs", gapType: "Integration", description: "Exported access events have no source-application field, which the SOC uses to route alerts.", workaround: null },
  { gapName: "Session recordings kept only 90 days", gapType: "Policy/Compliance", description: "The customer's regulator requires 1 year of privileged session recordings.", workaround: "Archive recordings to the customer's own storage monthly." },
];

/** 0–2 gaps found during a validation; closed projects have their gaps decided. */
export function planGaps(stage: DemoStage, solutionName: string, componentNames: readonly string[]): Array<{
  gapName: string; gapType: string; description: string; status: string; criticality: string;
  impactedSolution: string; impactedComponent: string | null; workaroundDetail: string | null;
}> {
  if (stage === "early") return [];
  const count = faker.number.int({ min: stage === "mid" || stage === "late" ? 1 : 0, max: 2 });
  return faker.helpers.arrayElements(GAP_LIBRARY, count).map((g) => {
    const open = stage === "mid" || stage === "late" || stage === "other";
    const status = g.workaround
      ? "Workaround Available"
      : open
        ? faker.helpers.arrayElement(["Submitted", "Being Researched", "Working On"])
        : faker.helpers.arrayElement(["Roadmap Candidate", "Implemented", "Won't Do"]);
    return {
      gapName: g.gapName,
      gapType: g.gapType,
      description: g.description,
      status,
      criticality: faker.helpers.arrayElement(["Blocker", "Must Have", "Should Have", "Nice to Have"]),
      impactedSolution: solutionName,
      impactedComponent: componentNames.length > 0 ? faker.helpers.arrayElement(componentNames) : null,
      workaroundDetail: g.workaround,
    };
  });
}

// ── AI risk assessments ─────────────────────────────────────────────────────

/** Risk score range (0–100, higher is riskier) by stage. */
const RISK_SCORE_RANGE: Record<DemoStage, [number, number]> = {
  early: [30, 55],
  mid: [20, 72],
  late: [12, 45],
  won: [8, 25],
  lost: [55, 85],
  other: [40, 65],
};

export type DemoRiskLevel = "low" | "medium" | "high" | "critical";

/** Same thresholds as the AI risk engine (aiRiskEngine.ts). */
export function riskLevelFor(score: number): DemoRiskLevel {
  if (score > 75) return "critical";
  if (score > 50) return "high";
  if (score > 25) return "medium";
  return "low";
}

export interface DemoRiskRun {
  overallRiskScore: number;
  riskLevel: DemoRiskLevel;
  criteriaScores: Record<string, number>;
  analysisResults: { summary: string; keyRisks: string[]; mitigationStrategies: string[]; confidenceFactors: string[] };
  confidence: number;
  triggerReasons: string[];
  recommendations: string[];
}

function riskRun(score: number, criteriaNames: readonly string[]): DemoRiskRun {
  const riskLevel = riskLevelFor(score);
  const criteriaScores = Object.fromEntries(
    criteriaNames.map((n) => [n, Math.max(0, Math.min(100, score + faker.number.int({ min: -15, max: 15 })))]),
  );
  const ranked = Object.entries(criteriaScores).sort((a, b) => b[1] - a[1]).map(([n]) => n);
  const elevated = riskLevel === "high" || riskLevel === "critical";
  return {
    overallRiskScore: score,
    riskLevel,
    criteriaScores,
    analysisResults: {
      summary: elevated
        ? "The validation is behind plan and the customer's sponsor has missed the last two working sessions."
        : "The validation is on track: criteria are agreed, the environment is ready and the customer team attends weekly.",
      keyRisks: ranked.slice(0, 2),
      mitigationStrategies: elevated
        ? ["Book an executive check-in this week", "Cut scope to the must-have criteria"]
        : ["Keep the weekly working session", "Confirm the readout date with the sponsor"],
      confidenceFactors: ["Success criteria agreed", "Activity in the last 7 days"],
    },
    confidence: faker.number.float({ min: 0.7, max: 0.95, fractionDigits: 2 }),
    triggerReasons: elevated ? [`${ranked[0] ?? "Timeline Risk"} above threshold`] : [],
    recommendations: elevated
      ? ["Escalate to the account team", "Re-baseline the plan with the customer"]
      : ["No action needed"],
  };
}

/**
 * Two AI risk runs for a demo project, two weeks apart, scored per criterion
 * of the install's risk ruleset. The latest is what the project shows.
 */
export function planRiskAssessment(stage: DemoStage, criteriaNames: readonly string[]): { previous: DemoRiskRun; latest: DemoRiskRun } {
  const [min, max] = RISK_SCORE_RANGE[stage];
  const latest = faker.number.int({ min, max });
  const previous = Math.max(0, Math.min(100, latest + faker.number.int({ min: -12, max: 12 })));
  return { previous: riskRun(previous, criteriaNames), latest: riskRun(latest, criteriaNames) };
}

// ── Outcomes ────────────────────────────────────────────────────────────────

export function planOutcome(stage: DemoStage, status = ""): {
  outcomeType: "won" | "lost" | "cancelled";
  primaryReasonCode: string;
  technicalFitScore: number;
  politicalAlignmentScore: number;
  painRating: number;
  tccApproved: boolean;
  executiveSummary: string;
} | null {
  if (stage === "won") {
    return {
      outcomeType: "won",
      primaryReasonCode: faker.helpers.arrayElement(["Technical Fit", "Business Need", "Competitive Displacement", "Relationship"]),
      technicalFitScore: faker.number.int({ min: 75, max: 98 }),
      politicalAlignmentScore: faker.number.int({ min: 65, max: 95 }),
      painRating: faker.number.int({ min: 6, max: 10 }),
      tccApproved: true,
      executiveSummary: "Every must-have criterion was met in the customer's environment, and the audit team signed off on the evidence export.",
    };
  }
  if (stage === "lost" && status.toLowerCase().includes("cancel")) {
    return {
      outcomeType: "cancelled",
      primaryReasonCode: faker.helpers.arrayElement(["Budget Cut", "Project Deprioritized", "Stakeholder Change", "Vendor Consolidation"]),
      technicalFitScore: faker.number.int({ min: 50, max: 80 }),
      politicalAlignmentScore: faker.number.int({ min: 15, max: 45 }),
      painRating: faker.number.int({ min: 3, max: 6 }),
      tccApproved: false,
      executiveSummary: "The customer paused the identity program after a reorganization; the validation stopped before the readout.",
    };
  }
  if (stage === "lost") {
    return {
      outcomeType: "lost",
      primaryReasonCode: faker.helpers.arrayElement(["Technical Gap", "Pricing", "Competitive Loss", "No Decision", "Budget Constraints"]),
      technicalFitScore: faker.number.int({ min: 35, max: 70 }),
      politicalAlignmentScore: faker.number.int({ min: 20, max: 60 }),
      painRating: faker.number.int({ min: 3, max: 7 }),
      tccApproved: false,
      executiveSummary: "The customer chose to delay. The scale test fell short of the sync-time target, and budget moved to next fiscal year.",
    };
  }
  return null;
}

// ── CRM ids ─────────────────────────────────────────────────────────────────

const SF_ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** A well-formed 18-character Salesforce id with the given key prefix. */
export function fakeSalesforceId(prefix: string): string {
  return prefix + faker.string.fromCharacters(SF_ID_CHARS, 18 - prefix.length);
}

export function fakeCrmIds(provider: string): { crmProvider: string; crmOpportunityId: string; crmAccountId: string } | null {
  if (provider === "salesforce") {
    return { crmProvider: "salesforce", crmOpportunityId: fakeSalesforceId("006"), crmAccountId: fakeSalesforceId("001") };
  }
  if (provider === "hubspot") {
    return {
      crmProvider: "hubspot",
      crmOpportunityId: String(faker.number.int({ min: 10_000_000_000, max: 99_999_999_999 })),
      crmAccountId: String(faker.number.int({ min: 10_000_000_000, max: 99_999_999_999 })),
    };
  }
  return null;
}

// ── Activity, requests, notifications ───────────────────────────────────────

export function planActivity(stage: DemoStage, solutionName: string): Array<{ action: string; details: string }> {
  const rows = [
    { action: "project_created", details: `Validation workspace created for ${solutionName}.` },
    { action: "criteria_updated", details: "Success criteria agreed with the customer and added to the plan." },
  ];
  if (stage !== "early") rows.push({ action: "map_progress", details: "Environment connected; core use-case testing under way." });
  if (stage === "late" || stage === "won") rows.push({ action: "status_change", details: "Moved to technical close review after the readout." });
  if (stage === "won") rows.push({ action: "outcome_recorded", details: "Recorded as won: all must-have criteria met." });
  if (stage === "lost") rows.push({ action: "outcome_recorded", details: "Recorded as lost: decision delayed to next fiscal year." });
  return rows;
}

export function planSupportRequest(accountName: string): {
  type: "issue" | "feature";
  title: string;
  description: string;
  applicationPage: string;
  priority: string;
  status: string;
} {
  return faker.helpers.arrayElement([
    {
      type: "issue" as const,
      title: "Readout report is missing the criteria notes",
      description: `${accountName} exported the readout report and the notes column was empty for completed criteria.`,
      applicationPage: "/project",
      priority: "medium",
      status: "In Progress",
    },
    {
      type: "feature" as const,
      title: "Let our auditors see the evidence tab",
      description: `${accountName} would like read-only access for two internal auditors during the validation.`,
      applicationPage: "/project",
      priority: "low",
      status: "Not Started",
    },
  ]);
}

/** Bell notifications for the seeding admin, so the bell isn't empty in a demo. */
export function planNotifications(project: { id: number; solutionName: string; customerName: string }, stage: DemoStage): Array<{
  kind: string;
  params: Record<string, string | null>;
  linkPath: string;
}> {
  const base = { projectName: project.solutionName, customerName: project.customerName };
  if (stage === "mid") {
    return [{
      kind: "map_item_due_soon",
      params: { ...base, itemType: "task", itemName: "Access certification campaign", dueDate: toIsoDate(new Date(Date.now() + 2 * 86_400_000)), daysRemaining: "2" },
      linkPath: `/project/${project.id}?tab=map`,
    }];
  }
  if (stage === "late") {
    return [{
      kind: "criterion_completed",
      params: { ...base, criterionName: "Auditors can pull evidence without IT help" },
      linkPath: `/project/${project.id}?tab=success-criteria`,
    }];
  }
  if (stage === "won") {
    return [{ kind: "project_status_changed", params: { ...base, oldStatus: "TCC Stage", newStatus: "Closed Won" }, linkPath: `/project/${project.id}` }];
  }
  return [];
}

export interface PlannedMessage {
  /** Who writes it: the account's champion or the project's engineer. */
  from: "customer" | "team";
  body: string;
  /** How long before the seed it was posted. */
  hoursAgo: number;
}

/**
 * A short customer conversation for a live project, so the workspace and
 * Account Portal messages aren't empty in a demo. The latest is from the
 * customer on mid-stage projects (unread for the team) and from the team
 * otherwise (unread for the customer). Closed projects get none.
 */
export function planMessages(stage: DemoStage, solutionName: string): PlannedMessage[] {
  if (stage === "early") {
    return [
      { from: "team", body: `Welcome aboard! We've shared the plan for the ${solutionName} evaluation. Could you confirm who joins the kickoff?`, hoursAgo: 72 },
      { from: "customer", body: "Thanks. Our identity architect and the service desk lead will join. Is Tuesday at 10 still good?", hoursAgo: 50 },
      { from: "team", body: "Tuesday at 10 works. I'll send the invite with the agenda today.", hoursAgo: 26 },
    ];
  }
  if (stage === "mid") {
    return [
      { from: "team", body: "The lab is ready. Connector setup is done and the first sync finished overnight.", hoursAgo: 96 },
      { from: "customer", body: "Great news. Two of the test accounts didn't show up after the sync, can you take a look?", hoursAgo: 30 },
      { from: "team", body: "Found it: they were in an OU outside the sync scope. I've added it and rerun the sync.", hoursAgo: 20 },
      { from: "customer", body: "Confirmed, both accounts are there now. We'll start the access review tests tomorrow.", hoursAgo: 4 },
    ];
  }
  if (stage === "late") {
    return [
      { from: "customer", body: "Our auditors liked the evidence report. Can we get the summary deck before the readout?", hoursAgo: 48 },
      { from: "team", body: "Yes, I'll share the readout deck by Thursday along with the success criteria results.", hoursAgo: 8 },
    ];
  }
  return [];
}
