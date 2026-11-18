// Task #723 — Faker-based Demo Mode seeder + transactional wipe.
// Seeder: every row inserted has is_demo=true. Additive — never edits
// existing rows. Wipe: DELETE WHERE is_demo=true per table inside a
// transaction with pre/post non-demo-row count safety check.
import { PROJECT_TYPES } from "@shared/project-types";
import { faker } from "@faker-js/faker";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  customers,
  projects,
  projectAudits,
  projectTemplates,
  activityLogs,
  mapPhases,
  mapSteps,
  mapTasks,
  mapTemplates,
  mapTemplatePhases,
  mapTemplateSteps,
  mapTemplateTasks,
  customReports,
  tags,
  assumptions,
  dependencies,
  assumptionCategories,
  dependencyCategories,
  emailTemplates,
  aiProviderConfigs,
  products,
  customerAccess,
  users,
  industries,
  journeyStages,
  mapTaskCriteria,
  criteriaAgreements,
  projectHandoffContacts,
  successCriteria,
  projectOutcomes,
  outcomeRequests,
  projectRiskPredictions,
  riskAlerts,
  assessmentRulesets,
  riskCriteria,
  supportRequests,
  evaluationRequests,
  userNotifications,
  projectGaps,
  projectMaps,
  mapTemplateApplications,
  projectMessages,
} from "@shared/schema";
import { DEMO_CATALOG, demoQuickPlanStageId, seedDemoLibrary, type DemoSolution } from "./demo-library";
import { seedDemoTeams } from "./demo-teams";
import { demoAccountAbbreviation, demoProjectBaseName } from "./demo-project-names";
import { seedDemoCompetitors, type DemoCompetitorProject } from "./demo-competitors";
import { seedDemoMetricHistory } from "../services/metric-snapshot-service";
import { getCrmProviderId } from "../crm/provider-setting";
import { seedDemoReportSchedules } from "./demo-report-schedules";
import { seedDemoProjectExtras } from "./demo-project-extras";
import { seedDemoIntegrationHistory, type DemoHistoryProject } from "./demo-integration-history";
import { seedDemoAutomation } from "./demo-automation";
import { seedDemoCriteriaTemplates } from "./demo-criteria-templates";
import { seedDemoArtifacts, type DemoArtifactAccount, type DemoArtifactProject } from "./demo-artifacts";
import { seedDemoPortalResources } from "./demo-portal-resources";

// The wipe lives in demo-wipe.ts; re-exported so callers keep one import.
import { wipeDemoData, type WipeResult } from "./demo-wipe";
export { wipeDemoData, type WipeResult };
import {
  DEMO_MAP_PLAN,
  createDemoCustomerUser,
  ensureDemoStaff,
  fakeCrmIds,
  planActivity,
  planCriteria,
  planStatusHistory,
  demoStaffEmail,
  demoStaffName,
  validationProgress,
  planMapItems,
  planMessages,
  criterionPriorityFor,
  demoAgreementFor,
  planNotifications,
  planOutcome,
  planRiskAssessment,
  planSupportRequest,
  planGaps,
  pickConfigured,
  planDemoStatuses,
  planAccountStatuses,
  salesStageFor,
  forecastCategoryFor,
  DEMO_ENVIRONMENTS,
  DEMO_CUSTOMER_USERS_PER_ACCOUNT,
  stageForStatus,
  type DemoStage,
} from "./demo-story";
import { agreementSnapshot } from "@shared/value-journey";
import type { WorkingCalendar } from "@shared/working-calendar";

export interface SeedOptions {
  customers?: number;
  projectsPerCustomer?: number;
  mapDepth?: number;
  includeAi?: boolean;
}

export interface SeedResult {
  customers: number;
  projects: number;
  mapTemplates: number;
  mapPhases: number;
  mapSteps: number;
  mapTasks: number;
  activityLogs: number;
  tags: number;
  assumptions: number;
  dependencies: number;
  /** Project assumptions and dependencies, and account infrastructure profiles. */
  projectExtras: number;
  /** Alerts raised by high and critical demo risk runs. */
  riskAlerts: number;
  emailTemplates: number;
  aiProviderConfigs: number;
  products: number;
  users: number;
  successCriteria: number;
  outcomes: number;
  supportRequests: number;
  evaluationRequests: number;
  notifications: number;
  /** Demo components, criteria, outcomes, actions taken and value mappings. */
  libraryItems: number;
  gaps: number;
  /** Weekly KPI and MAP history points for the dashboard sparklines. */
  metricSnapshots: number;
  /** Scheduled reports with run history for Analytics › Calendar. */
  reportSchedules: number;
  teams: number;
  subteams: number;
  /** Demo technology spaces and competitors (Competitor Intelligence). */
  competitors: number;
  /** Demo documents, links and code scripts (Artifacts) and Resource Content links. */
  artifacts: number;
  /** Email logs, webhook deliveries, MCP calls and announcements for the integration pages. */
  integrationHistory: number;
  /** Workflow Automation rules and their run history. */
  automation: number;
  /** One-off AI assessment jobs. */
  assessmentJobs: number;
  /** Criteria Builder templates, one per demo solution. */
  criteriaTemplates: number;
}

const DEMO_ASSUMPTIONS = [
  { title: "Customer provides a test HR feed", category: "Data & Scope", description: "A sanitized HR extract with at least 500 identities is available before environment setup starts." },
  { title: "Read-only directory access", category: "Access & Permissions", description: "A service account with read access to Active Directory is approved within the first week." },
  { title: "Stakeholders join weekly", category: "Operations", description: "The customer's IAM lead and an auditor attend the weekly working session." },
  { title: "Sandbox, not production", category: "Environment", description: "All testing runs in a sandbox tenant; no production identities are changed." },
];

const DEMO_DEPENDENCIES = [
  { title: "Firewall change for the connector", category: "Network", description: "The customer's network team opens outbound HTTPS from the connector host." },
  { title: "Security questionnaire approved", category: "Operations", description: "Vendor security review completes before any customer data is loaded." },
  { title: "SSO test application", category: "Integrations", description: "The customer registers a test application in their identity provider." },
  { title: "Auditor availability", category: "Operations", description: "Internal audit reviews the evidence export before the readout." },
];

const DEMO_EMAIL_TEMPLATES = [
  {
    name: "Validation kickoff",
    description: "Sent to the customer team when a validation starts.",
    subject: "Kickoff: your technical validation starts this week",
    body: "Hello,\n\nThank you for making time for the technical validation. Attached are the agreed success criteria and the plan for the next few weeks. Our first working session covers environment setup and access.\n\nPlease reply with anyone else who should join the weekly sessions.",
  },
  {
    name: "Weekly validation status",
    description: "Weekly summary of criteria met, open tasks and risks.",
    subject: "Weekly status: technical validation",
    body: "Hello,\n\nHere is this week's status: criteria met so far, tasks due next week, and any risks we need your help with. The full detail is on the shared project page.\n\nSee you at the next working session.",
  },
];

// Shared demo reports, using fields the Report Builder offers for projects.
const DEMO_REPORTS = [
  {
    name: "Pipeline by forecast category",
    description: "Open validations with their sales stage, forecast category and ACV.",
    selectedFields: ["opportunityName", "accountName", "solutionName", "salesStage", "forecastCategory", "opportunityAcvValue", "endDate"],
    sortBy: "forecastCategory",
    sortOrder: "asc",
  },
  {
    name: "Validation results by solution",
    description: "Status, close date and ACV of every validation, grouped by solution.",
    selectedFields: ["solutionName", "opportunityName", "status", "completedDate", "opportunityAcvValue"],
    sortBy: "solutionName",
    sortOrder: "asc",
  },
  {
    name: "Success criteria status",
    description: "Each project's criteria with component, expected outcome and status.",
    selectedFields: ["opportunityName", "productName", "componentName", "criterion", "expectedOutcome", "criterionStatus"],
    sortBy: "opportunityName",
    sortOrder: "asc",
  },
];

const DEMO_TAGS = [
  { name: "Audit Driven", color: "#2563EB" },
  { name: "Competitive", color: "#DC2626" },
  { name: "Expansion", color: "#059669" },
  { name: "Net New", color: "#7C3AED" },
  { name: "Executive Sponsor", color: "#D97706" },
  { name: "Cloud First", color: "#0891B2" },
];


// ── Industry-aware content for Project Purpose & Goals ────────────────────
const INDUSTRY_CONTEXT: Record<
  string,
  { problem: string; objective: string; policy: string }
> = {
  Healthcare: {
    problem:
      "The organization struggles with protecting patient data across distributed clinical systems while meeting HIPAA audit requirements and managing privileged access to EMR platforms.",
    objective:
      "Achieve continuous HIPAA compliance posture, reduce time-to-detect unauthorized access to patient records, and automate access certifications for clinical staff.",
    policy:
      "HIPAA Security Rule, HITECH Act, state-level patient privacy regulations, and internal Minimum Necessary Access policy.",
  },
  Finance: {
    problem:
      "Fragmented identity governance across on-premises and cloud financial systems creates SOX audit gaps and limits visibility into who has access to sensitive financial data.",
    objective:
      "Implement a unified access governance program to satisfy SOX Section 404, reduce audit findings, and demonstrate least-privilege enforcement to regulators.",
    policy:
      "SOX, PCI-DSS, FFIEC guidelines, GLBA, and the organization's internal Segregation of Duties policy.",
  },
  Government: {
    problem:
      "Legacy directory infrastructure and manual access reviews leave the agency unable to meet FISMA requirements or demonstrate continuous monitoring to oversight bodies.",
    objective:
      "Automate NIST 800-53 control evidence collection, remediate stale privileged accounts, and reduce mean-time-to-revoke access for separated personnel.",
    policy:
      "FISMA, NIST SP 800-53, FedRAMP, DISA STIGs, and OMB memoranda on zero-trust adoption.",
  },
  Manufacturing: {
    problem:
      "Mergers and acquisitions have created overlapping Active Directory forests with no consistent governance, increasing the risk of lateral movement from operational technology networks.",
    objective:
      "Consolidate identity governance across acquired entities, enforce segregation between IT and OT environments, and pass ISO 27001 certification audit.",
    policy:
      "ISO 27001, NIST Cybersecurity Framework, IEC 62443 for OT environments, and export-control regulations (EAR/ITAR).",
  },
  Technology: {
    problem:
      "Rapid SaaS sprawl and DevOps-speed deployments have outpaced manual access reviews, resulting in excessive standing privileges and shadow IT accounts in cloud environments.",
    objective:
      "Establish continuous access intelligence across hybrid environments, cut SaaS account sprawl by 40%, and integrate identity governance into the CI/CD pipeline.",
    policy:
      "SOC 2 Type II, ISO 27001, internal cloud security baseline, and vendor-specific SaaS acceptable-use policies.",
  },
  Education: {
    problem:
      "High staff and student turnover creates unmanaged orphaned accounts and over-privileged shared credentials in student information systems and research data repositories.",
    objective:
      "Automate joiner-mover-leaver provisioning for faculty and students, secure research data access, and meet FERPA compliance requirements for the upcoming accreditation review.",
    policy:
      "FERPA, NIST 800-171 (for research data), state education-sector data privacy laws, and institutional data classification policy.",
  },
  Retail: {
    problem:
      "Point-of-sale systems and e-commerce platforms share privileged credentials across franchises, and no central visibility exists over who accesses cardholder data environments.",
    objective:
      "Eliminate shared admin accounts in cardholder data environments, achieve PCI-DSS Level 1 compliance, and reduce access-related fraud risk in seasonal workforce cycles.",
    policy:
      "PCI-DSS, state consumer privacy laws (CCPA), and internal franchise IT security standards.",
  },
  Energy: {
    problem:
      "Critical infrastructure systems require strict separation of IT and OT access, but current tools cannot enforce or audit privileged sessions across SCADA and ICS environments.",
    objective:
      "Secure privileged access to operational technology, meet NERC CIP requirements for bulk electric systems, and provide a complete audit trail for FERC reporting.",
    policy:
      "NERC CIP, FERC regulations, NIST SP 800-82, and internal critical asset protection policy.",
  },
};

const GENERIC_CONTEXT = {
  problem:
    "The organization lacks centralized visibility into user access, privileged accounts go unreviewed, and manual compliance processes create audit risk.",
  objective:
    "Establish a scalable identity governance program, automate access certifications, and achieve continuous compliance posture aligned to industry frameworks.",
  policy:
    "Applicable regulatory frameworks for the industry, internal information security policy, and vendor contractual obligations.",
};

function buildPurposeGoals(
  industryName: string | null | undefined,
  solutionName: string,
): {
  businessProblem: string;
  solutionDescription: string;
  customerObjective: string;
  policyConsiderations: string;
  notes: string;
} {
  const ctx =
    (industryName && INDUSTRY_CONTEXT[industryName]) || GENERIC_CONTEXT;
  const cleanSolution = solutionName.replace(/^\[demo\]\s*/i, "");
  return {
    businessProblem: ctx.problem,
    solutionDescription: `${cleanSolution} addresses the customer's core identity security challenges by providing unified visibility, automated governance workflows, and continuous compliance reporting across hybrid environments. The solution integrates with existing directory services and cloud platforms to accelerate time-to-value.`,
    customerObjective: ctx.objective,
    policyConsiderations: ctx.policy,
    notes:
      "Initial scoping call completed. Customer stakeholders include CISO, IT Director, and Compliance Officer. Technical environment documentation requested.",
  };
}

/**
 * Insert deterministic demo content. Caller (route handler) is admin
 * and supplies `createdBy` (their user id) so audit columns are correct.
 */
/**
 * A project's dates by stage, so open projects aren't overdue on day one
 * and closed ones spread over the last five quarters (Fiscal Trends).
 */
function demoProjectWindow(stage: DemoStage): { startDate: Date; endDate: Date; createdAt: Date } {
  const DAY = 86_400_000;
  const now = Date.now();
  const at = (minDays: number, maxDays: number) => new Date(now + faker.number.int({ min: minDays, max: maxDays }) * DAY);
  const created = (start: Date) => new Date(start.getTime() - faker.number.int({ min: 3, max: 21 }) * DAY);
  switch (stage) {
    case "won":
    case "lost": {
      // About a third closed in the last few weeks, so this quarter's Won
      // and Lost KPIs have numbers; the rest spread over five quarters.
      if (faker.datatype.boolean({ probability: 0.35 })) {
        const endDate = at(-40, -3);
        const startDate = new Date(endDate.getTime() - faker.number.int({ min: 45, max: 100 }) * DAY);
        return { startDate, endDate, createdAt: created(startDate) };
      }
      const startDate = at(-460, -75);
      const endDate = new Date(Math.min(startDate.getTime() + faker.number.int({ min: 45, max: 110 }) * DAY, now - 5 * DAY));
      return { startDate, endDate, createdAt: created(startDate) };
    }
    case "early": {
      const startDate = at(-14, -2);
      return { startDate, endDate: at(60, 120), createdAt: created(startDate) };
    }
    case "late": {
      const startDate = at(-120, -60);
      return { startDate, endDate: at(5, 20), createdAt: created(startDate) };
    }
    default: {
      const startDate = at(-90, -20);
      return { startDate, endDate: at(30, 90), createdAt: created(startDate) };
    }
  }
}

/** A phase or step's status and dates, from the tasks under it. */
function rollUp(items: ReturnType<typeof planMapItems>): {
  status: string;
  startDate: Date | null;
  dueDate: Date | null;
  completedDate: Date | null;
} {
  if (items.length === 0) return { status: "not_started", startDate: null, dueDate: null, completedDate: null };
  const allDone = items.every((i) => i.status === "complete");
  const started = items.some((i) => i.status !== "not_started");
  const dueDate = items[items.length - 1].dueDate;
  return {
    status: allDone ? "complete" : started ? "in_progress" : "not_started",
    startDate: items[0].startDate,
    dueDate,
    completedDate: allDone ? dueDate : null,
  };
}

export async function seedDemoData(
  opts: SeedOptions,
  createdBy: string,
): Promise<SeedResult> {
  faker.seed(Date.now() % 1_000_000);
  const customerCount = clamp(opts.customers ?? 6, 1, 50);
  const projectsPerCustomer = clamp(opts.projectsPerCustomer ?? 2, 0, 20);
  const mapDepth = clamp(opts.mapDepth ?? 3, 0, 5);

  // Look up the seeding admin's email once — customer_access keys on
  // userEmail (not userId), so we need it to link demo access rows.
  const [adminRow] = await db.select({ email: users.email }).from(users).where(eq(users.id, createdBy)).limit(1);
  const adminEmail = adminRow?.email ?? null;

  const result: SeedResult = {
    customers: 0,
    projects: 0,
    mapTemplates: 0,
    mapPhases: 0,
    mapSteps: 0,
    mapTasks: 0,
    activityLogs: 0,
    tags: 0,
    assumptions: 0,
    dependencies: 0,
    projectExtras: 0,
    riskAlerts: 0,
    emailTemplates: 0,
    aiProviderConfigs: 0,
    products: 0,
    users: 0,
    successCriteria: 0,
    outcomes: 0,
    supportRequests: 0,
    evaluationRequests: 0,
    notifications: 0,
    libraryItems: 0,
    gaps: 0,
    metricSnapshots: 0,
    reportSchedules: 0,
    teams: 0,
    subteams: 0,
    competitors: 0,
    artifacts: 0,
    integrationHistory: 0,
    automation: 0,
    assessmentJobs: 0,
    criteriaTemplates: 0,
  };

  // ─── Tags (cross-cutting) ────────────────────────────────────────────────
  const tagRows = await db
    .insert(tags)
    .values(
      DEMO_TAGS.map((t) => ({
        name: `[demo] ${t.name}`,
        category: "demo",
        color: t.color,
        createdBy,
        isDemo: true,
      })),
    )
    .onConflictDoNothing({ target: tags.name })
    .returning({ id: tags.id, name: tags.name });
  result.tags = tagRows.length;
  const demoTagNames = tagRows.map((t) => t.name);

  // ─── Demo Staff own every demo project (never real engineers, so no
  //     real person is attached to fake work). See demo-story.ts.
  const staff = await ensureDemoStaff();
  result.users += staff.all.length;

  // Demo teams and subteams staffed by Demo Staff; each demo project is
  // owned by one of them (demo-teams.ts).
  const demoTeams = await seedDemoTeams(staff);
  result.teams = demoTeams.teams;
  result.subteams = demoTeams.subteams;

  // Demo projects carry ids in the format of the CRM this install uses.
  const crmProvider = await getCrmProviderId();
  const calendar = { holidays: new Set<string>() };

  // ─── Validation Criteria library: demo solutions with their components,
  //     criteria, outcomes, actions, value mappings and Quick plan templates.
  //     Projects are built on these solutions (demo-library.ts).
  const library = await seedDemoLibrary(staff.specialist);
  result.products = library.solutions.length;
  result.libraryItems = library.libraryItems;

  // ─── Map template (created BEFORE the project loop so demo projects
  //     can link to it via mapTemplateId/mapTemplateName). One master
  //     template plus its full child hierarchy under map_template_*.
  // The value journey stages, in order: the demo plan's phases are tagged
  // with them one to one (Kickoff → Plan, Setup → Build, Testing → Validate,
  // Readout → Decide), as the default MAP template's are.
  const stageIds = (
    await db.select({ id: journeyStages.id }).from(journeyStages).orderBy(journeyStages.orderIndex, journeyStages.id)
  ).map((row) => row.id);
  const stageForPhase = (index: number): number | null =>
    stageIds.length > 0 ? stageIds[Math.min(index, stageIds.length - 1)] : null;
  // A Quick plan's one phase is the validation itself (demo-library.ts).
  const quickPlanStageId = await demoQuickPlanStageId();

  let demoMapTemplate: { id: number; name: string } | null = null;
  if (mapDepth > 0) {
    const tmplName = "[demo] Identity Governance Full Validation";
    const [tmpl] = await db
      .insert(mapTemplates)
      .values({
        name: tmplName,
        description: "Kickoff to readout plan for an identity governance validation.",
        scope: "project",
        visibility: "public",
        isActive: true,
        isSystem: false,
        isDemo: true,
        createdByUserId: staff.lead,
      } as typeof mapTemplates.$inferInsert)
      .returning({ id: mapTemplates.id, name: mapTemplates.name });
    demoMapTemplate = { id: tmpl.id, name: tmpl.name ?? tmplName };
    result.mapTemplates++;

    // Full template hierarchy — every child row is_demo=true and the
    // wipe deletes them in dependency order before the parent template.
    for (let ph = 0; ph < DEMO_MAP_PLAN.length; ph++) {
      const phaseLocalKey = `phase_${ph + 1}_${faker.string.alphanumeric(4)}`;
      await db.insert(mapTemplatePhases).values({
        templateId: tmpl.id,
        localKey: phaseLocalKey,
        name: DEMO_MAP_PLAN[ph].phase,
        description: `${DEMO_MAP_PLAN[ph].phase} for an identity governance validation.`,
        orderIndex: ph,
        stageId: stageForPhase(ph),
        isDemo: true,
      } as typeof mapTemplatePhases.$inferInsert);

      for (let st = 0; st < mapDepth; st++) {
        const stepLocalKey = `step_${ph + 1}_${st + 1}_${faker.string.alphanumeric(4)}`;
        await db.insert(mapTemplateSteps).values({
          templateId: tmpl.id,
          phaseLocalKey,
          localKey: stepLocalKey,
          name: DEMO_MAP_PLAN[ph].steps[st].step,
          orderIndex: st,
          isDemo: true,
        } as typeof mapTemplateSteps.$inferInsert);

        for (let ti = 0; ti < mapDepth; ti++) {
          await db.insert(mapTemplateTasks).values({
            templateId: tmpl.id,
            phaseLocalKey,
            stepLocalKey,
            name: DEMO_MAP_PLAN[ph].steps[st].tasks[ti],
            orderIndex: ti,
            isDemo: true,
          } as typeof mapTemplateTasks.$inferInsert);
        }
      }
    }
  }

  // ─── Pre-loop lookups — query real config data once so projects get
  //     realistic statuses, solutions and industries.
  // 1-3. Internal statuses, Risk and Ranking as configured (Field
  //      Settings). The storage getters create the defaults on a new
  //      install, where nobody has opened Field Settings yet.
  const STATUS_NAMES: string[] = (await storage.getStatusConfigs()).map((r) => r.name);
  if (STATUS_NAMES.length === 0) STATUS_NAMES.push("In Progress");
  const CUSTOMER_STATUSES: string[] = (await storage.getCustomerStatusConfigs()).map((r) => r.name);
  if (CUSTOMER_STATUSES.length === 0) CUSTOMER_STATUSES.push("On Time");
  const RISK_NAMES = (await storage.getRiskLevelConfigs()).map((r) => r.name);
  const RANKING_NAMES = (await storage.getRankingConfigs()).map((r) => r.name);

  // 4. Real industries — assign to demo customers for industry-aware content
  const _industryRows = await db
    .select({ id: industries.id, name: industries.name })
    .from(industries)
    .where(eq(industries.isActive, true));

  // 5. AI risk ruleset — demo projects carry two runs of it, so AI
  //    Assessments and the R-Index have scores. Skipped when none exists.
  const [riskRuleset] = await db
    .select({ id: assessmentRulesets.id, name: assessmentRulesets.name })
    .from(assessmentRulesets)
    .where(and(eq(assessmentRulesets.category, "risk"), eq(assessmentRulesets.isActive, true)))
    .orderBy(desc(assessmentRulesets.isDefault))
    .limit(1);
  const riskCriteriaNames: string[] = riskRuleset
    ? (await db
        .select({ name: riskCriteria.name })
        .from(riskCriteria)
        .where(and(eq(riskCriteria.rulesetId, riskRuleset.id), eq(riskCriteria.isActive, true))))
        .map((r) => r.name)
    : [];

  // ─── Plan-mix tracking — guarantees ≥1 full MAP and ≥1 Quick plan across
  //     the whole seed run when total demo projects >= 2, regardless
  //     of customerCount × projectsPerCustomer split (covers the
  //     edge case where customers=2, projectsPerCustomer=1, etc.).
  const totalProjects = customerCount * projectsPerCustomer;
  let mapCount = 0;
  let quickCount = 0;
  let projectIndex = 0;
  let closedSeen = 0;
  const competitorProjects: DemoCompetitorProject[] = [];
  const artifactAccounts: DemoArtifactAccount[] = [];
  const artifactProjects: DemoArtifactProject[] = [];
  const historyProjects: DemoHistoryProject[] = [];
  const championEmailByAccount = new Map<number, string>();
  const demoStatuses = planDemoStatuses(STATUS_NAMES, totalProjects);
  const demoAccountStatuses = planAccountStatuses(demoStatuses, CUSTOMER_STATUSES);
  // ─── Customers + projects + per-project map (phase/step/task) ──────────
  // mapPhases/mapSteps/mapTasks belong to a *project*, not to mapTemplates
  // (the canonical template structure lives in `map_template_*` tables).
  // We attach the demo map directly to each demo project so wiping a
  // demo project also cascades the map rows.
  //
  // Realistic mix: ~75% of demo projects get the full demo MAP (the demo
  // template's phases, steps and tasks), the other ~40% a Quick plan (one
  // phase of steps from their solution's plan template). We
  // force at least one of each per customer when 2+ projects exist so
  // the dashboard always shows the mix.
  for (let c = 0; c < customerCount; c++) {
    const accountName = `[demo] ${faker.company.name()}`;
    // Pick a real industry so purpose/goals content is industry-aware
    const customerIndustry =
      _industryRows.length > 0
        ? faker.helpers.arrayElement(_industryRows)
        : null;
    const [customer] = await db
      .insert(customers)
      .values({
        accountName,
        abbreviation: demoAccountAbbreviation(accountName),
        region: faker.location.country(),
        industryId: customerIndustry?.id ?? undefined,
        isActive: true,
        isPartner: false,
        isDemo: true,
        // Accounts predate their oldest projects, so the KPI history counts them.
        createdAt: new Date(Date.now() - faker.number.int({ min: 480, max: 540 }) * 86_400_000),
      } as typeof customers.$inferInsert)
      .returning({ id: customers.id, accountName: customers.accountName, abbreviation: customers.abbreviation });
    result.customers++;
    artifactAccounts.push({ id: customer.id, accountName: customer.accountName, ownerId: staff.sales });

    // The account's customer-side people (Customer role): its technical
    // champion and economic buyer. Opened with View As to show the customer
    // portal; they never sign in. Listed as the account's contacts, which is
    // where Create Project looks for account users.
    const accountUsers = [];
    for (let i = 0; i < DEMO_CUSTOMER_USERS_PER_ACCOUNT; i++) {
      accountUsers.push(await createDemoCustomerUser(customer.id, customer.accountName, i));
    }
    const champion = accountUsers[0];
    championEmailByAccount.set(customer.id, champion.email);
    result.users += accountUsers.length;
    await db.update(customers).set({
      contactUsers: accountUsers.map((u) => ({ userId: u.id, stakeholderTypes: [u.stakeholderType] })),
      accountRepresentativeId: staff.sales,
      accountEngineerId: faker.helpers.arrayElement(staff.engineers),
    }).where(eq(customers.id, customer.id));

    // One support request per account, raised by its champion and worked
    // by a demo SE; one evaluation request on every other account.
    const support = planSupportRequest(customer.accountName);
    await db.insert(supportRequests).values({
      ...support,
      customerId: customer.id,
      submittedByUserId: champion.id,
      submittedByName: champion.name,
      submittedByEmail: champion.email,
      assignedToUserId: faker.helpers.arrayElement(staff.engineers),
    } as typeof supportRequests.$inferInsert);
    result.supportRequests++;
    if (c % 2 === 0) {
      await db.insert(evaluationRequests).values({
        userId: staff.sales,
        customerId: customer.id,
        startDate: faker.date.soon({ days: 21 }),
        endDate: faker.date.soon({ days: 75, refDate: new Date(Date.now() + 21 * 86_400_000) }),
        topReasons: "Failed the last access-review audit; manual certifications take six weeks each quarter.",
        compellingEvent: "External audit next quarter; the board wants the findings closed first.",
        status: "open",
      } as typeof evaluationRequests.$inferInsert);
      result.evaluationRequests++;
    }

    const accountSolutions = new Set<string>();
    for (let p = 0; p < projectsPerCustomer; p++) {
      // Decide plan size — target ~75% full MAP / 25% Quick plan. The
      // guarantee is run-scoped: across all `totalProjects` we
      // ensure at least one full MAP and at least one Quick plan whenever
      // totalProjects >= 2. The final project(s) are forced to fill
      // a missing bucket; everything before that follows ~75/25
      // probability.
      const remaining = totalProjects - projectIndex;
      let isMapProject: boolean;
      if (!demoMapTemplate) {
        isMapProject = false;
      } else if (totalProjects >= 2 && mapCount === 0 && remaining <= 1) {
        isMapProject = true;
      } else if (totalProjects >= 2 && quickCount === 0 && remaining <= 1) {
        isMapProject = false;
      } else if (totalProjects >= 2 && mapCount === 0 && remaining <= 2 && quickCount > 0) {
        isMapProject = true;
      } else if (totalProjects >= 2 && quickCount === 0 && remaining <= 2 && mapCount > 0) {
        isMapProject = false;
      } else {
        isMapProject = faker.datatype.boolean({ probability: 0.75 });
      }
      if (isMapProject) mapCount++; else quickCount++;
      projectIndex++;

      // Demo Staff team: a primary SE, the specialist, and the other SE or
      // the manager supporting.
      const primaryEngineerId = faker.helpers.arrayElement(staff.engineers);
      const supportingEngineers = [
        faker.helpers.arrayElement([...staff.engineers.filter((id) => id !== primaryEngineerId), staff.lead]),
      ];
      // The person who seeds supports every other project, so the views that
      // open on "my projects" (Manage Projects, Project Schedules) show work
      // when they present the demo. Their place goes with the project on wipe.
      if (projectIndex % 2 === 1) supportingEngineers.push(createdBy);

      const acvK = faker.number.int({ min: 25, max: 500 });

      // ── Status mix: about a third open and in progress, a third closed
      //    (won more often than lost), the rest planning, late or on hold.
      const projectStatus = demoStatuses[projectIndex - 1];
      const stage: DemoStage = stageForStatus(projectStatus);

      // Project window by stage: closed projects ended recently, open ones
      // run into the future, so nothing open is overdue on the first day.
      const { startDate, endDate, createdAt } = demoProjectWindow(stage);
      const closed = stage === "won" || stage === "lost";

      // ── Account status that fits the Internal Status (planned above).
      const customerStatus = demoAccountStatuses[projectIndex - 1];

      // ── Solutions from the demo library: usually one, sometimes two.
      const projectSolutions: DemoSolution[] = faker.helpers.arrayElements(
        library.solutions,
        faker.datatype.boolean({ probability: 0.25 }) ? 2 : 1,
      );
      const solutionName = projectSolutions.map((sol) => sol.name).join(", ");
      projectSolutions.forEach((sol) => accountSolutions.add(sol.name));

      // ── Industry-aware Project Purpose & Goals
      const purposeGoals = buildPurposeGoals(customerIndustry?.name, solutionName);

      const projectType = faker.helpers.arrayElement(PROJECT_TYPES);
      const projectValues: typeof projects.$inferInsert = {
        // Named like the project form names one; the id is appended below.
        name: demoProjectBaseName(
          customer.abbreviation ?? demoAccountAbbreviation(customer.accountName),
          projectSolutions.map((sol) => sol.abbreviation),
        ),
        customerName: customer.accountName,
        customerId: customer.id,
        solutionName,
        salesforceEvaluationLink:
          `https://example.invalid/demo/${faker.string.alphanumeric(8)}`,
        status: projectStatus,
        customerStatus,
        type: projectType,
        // The account name already carries the "[demo] " prefix.
        opportunityName: `${customer.accountName} ${solutionName} ${projectType}`,
        opportunityAcvValue: `$${(acvK * 1000).toLocaleString("en-US")}`,
        startDate,
        endDate,
        completedDate: closed ? endDate : null,
        createdAt,
        updatedAt: closed ? endDate : new Date(Date.now() - faker.number.int({ min: 0, max: 6 }) * 86_400_000),
        environment: faker.helpers.arrayElement(DEMO_ENVIRONMENTS),
        risk: pickConfigured(RISK_NAMES, "None", stage === "mid" || stage === "late" ? 0.45 : 0.15),
        ranking: pickConfigured(RANKING_NAMES, "In Quarter", closed ? 0.1 : 0.5),
        salesStage: salesStageFor(stage),
        forecastCategory: forecastCategoryFor(stage),
        tags: demoTagNames.length > 0 ? faker.helpers.arrayElements(demoTagNames, { min: 1, max: 2 }) : undefined,
        enableGapAnalysis: true,
        currentSituation: closed ? null : "Weekly working sessions with the customer's IAM team; next milestone is the pilot readout.",
        primaryEngineerId,
        specialistEngineerId: staff.specialist,
        supportingEngineers,
        accountRepresentativeId: staff.sales,
        customerUserId: champion.id,
        customerUsers: accountUsers.map((u) => ({ userId: u.id, permission: "View" })),
        ...demoTeams.placeFor(primaryEngineerId),
        ...(fakeCrmIds(crmProvider) ?? {}),
        isDemo: true,
        ...purposeGoals,
      };
      // Every project links back to the MAP template its plan came from
      // via map_template_id / map_template_name (columns added by
      // migration 054): the full demo MAP, or the solution's Quick plan.
      const planTemplate = isMapProject && demoMapTemplate ? demoMapTemplate : projectSolutions[0].planTemplate;
      projectValues.mapTemplateId = planTemplate.id;
      projectValues.mapTemplateName = planTemplate.name;

      const [project] = await db
        .insert(projects)
        .values(projectValues)
        .returning({ id: projects.id, name: projects.name });
      // Same as the create route: the id makes the name unique.
      const projectName = project.name ? `${project.name}-${project.id}` : `Project ${project.id}`;
      if (project.name) {
        await db.update(projects).set({ name: projectName }).where(eq(projects.id, project.id));
      }
      result.projects++;
      // Status history (project_audits), as if the team had moved the
      // project along; it cascades with the project.
      const history = planStatusHistory(projectStatus, customerStatus, STATUS_NAMES, CUSTOMER_STATUSES, { start: startDate, end: endDate });
      if (history.length > 0) {
        await db.insert(projectAudits).values(history.map((change) => {
          const by = change.fieldName === "customerStatus" ? champion.id : primaryEngineerId;
          return {
            projectId: project.id,
            userId: by,
            userEmail: change.fieldName === "customerStatus" ? champion.email : (demoStaffEmail(by) ?? ""),
            userName: change.fieldName === "customerStatus" ? champion.name : (demoStaffName(by) ?? ""),
            fieldName: change.fieldName,
            oldValue: change.oldValue,
            newValue: change.newValue,
            changeType: "update",
            createdAt: change.at,
          };
        }));
      }

      historyProjects.push({ id: project.id, name: projectName, accountName: customer.accountName, status: projectStatus });
      artifactProjects.push({
        id: project.id,
        name: projectName,
        customerId: customer.id,
        accountName: customer.accountName,
        solutionIds: projectSolutions.map((sol) => sol.id),
        solutionNames: projectSolutions.map((sol) => sol.name),
        type: projectType,
        stage,
        ownerId: primaryEngineerId,
        startDate,
      });
      competitorProjects.push({
        id: project.id,
        customerId: customer.id,
        solutionIds: projectSolutions.map((sol) => sol.id),
        closed,
      });

      // customer_access: the seeding admin can edit every demo project and
      // the account's champion can view it (the customer portal). The wipe
      // cleans these rows up via is_demo=true.
      const accessRows = [
        ...(adminEmail ? [{ projectId: project.id, userEmail: adminEmail, permission: "edit", isDemo: true }] : []),
        ...accountUsers.map((u) => ({ projectId: project.id, userEmail: u.email, permission: "view", isDemo: true })),
      ];
      await db.insert(customerAccess).values(accessRows as Array<typeof customerAccess.$inferInsert>);

      // Per-project map content. Full MAP projects get the demo template's
      // phases, steps and tasks sized by mapDepth; the rest get a Quick plan
      // (their solution's one-phase template). Items run end to end over the
      // project window on working days, are owned by the demo team or the
      // champion, and are done as far as the stage implies.
      // The plan's phases and their tasks, in order, so the criteria can be
      // placed in the phase that tests them and linked to a task there.
      const planPhases: Array<{ id: number; taskIds: number[]; items: ReadonlyArray<{ status: string }> }> = [];
      if (!isMapProject) {
        const quick = projectSolutions[0].planTemplate;
        await db.insert(projectMaps).values({
          projectId: project.id,
          mapName: `MAP#${project.id} - ${customer.accountName} - ${createdAt.toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" })}`,
          templateName: quick.name,
          createdAt,
        });
        await db.insert(mapTemplateApplications).values({
          templateId: quick.id,
          projectId: project.id,
          appliedAt: createdAt,
          isDemo: true,
        } as typeof mapTemplateApplications.$inferInsert);
        const stepPlan = planMapItems(quick.steps.length, { start: startDate, end: endDate }, stage, calendar);
        const [phase] = await db
          .insert(mapPhases)
          .values({
            projectId: project.id,
            name: quick.name.replace(/^\[demo\]\s*/, ""),
            orderIndex: 0,
            stageId: quickPlanStageId,
            ...rollUp(stepPlan),
            assignedToUserId: primaryEngineerId,
            sendExternalEmails: false,
            isDemo: true,
          } as typeof mapPhases.$inferInsert)
          .returning({ id: mapPhases.id });
        result.mapPhases++;
        planPhases.push({ id: phase.id, taskIds: [], items: stepPlan });
        const stepRows = await db
          .insert(mapSteps)
          .values(
            quick.steps.map((name, index) => ({
              projectId: project.id,
              phaseId: phase.id,
              name,
              orderIndex: index,
              ...stepPlan[index],
              assignedToUserId: faker.helpers.arrayElement([primaryEngineerId, staff.specialist]),
              sendExternalEmails: false,
              isDemo: true,
            })) as Array<typeof mapSteps.$inferInsert>,
          )
          .returning({ id: mapSteps.id });
        result.mapSteps += stepRows.length;
      }
      if (isMapProject && demoMapTemplate) {
        // The MAP's name and where it came from, as applying a template does
        // (storage/map.ts): MAP#<id> - <account> - <date created>. Both
        // cascade with the project.
        await db.insert(projectMaps).values({
          projectId: project.id,
          mapName: `MAP#${project.id} - ${customer.accountName} - ${createdAt.toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" })}`,
          templateName: demoMapTemplate.name,
          createdAt,
        });
        await db.insert(mapTemplateApplications).values({
          templateId: demoMapTemplate.id,
          projectId: project.id,
          appliedAt: createdAt,
          isDemo: true,
        } as typeof mapTemplateApplications.$inferInsert);
      }
      if (isMapProject) {
        // Every phase of the plan, one per journey stage, so the value
        // journey runs Plan to Handoff; Map depth sets steps and tasks.
        const tasksPerPhase = mapDepth * mapDepth;
        const taskPlan = planMapItems(tasksPerPhase * DEMO_MAP_PLAN.length, { start: startDate, end: endDate }, stage, calendar);
        let taskIndex = 0;
        for (let ph = 0; ph < DEMO_MAP_PLAN.length; ph++) {
          const phasePlan = taskPlan.slice(ph * tasksPerPhase, (ph + 1) * tasksPerPhase);
          const [phase] = await db
            .insert(mapPhases)
            .values({
              projectId: project.id,
              name: DEMO_MAP_PLAN[ph].phase,
              orderIndex: ph,
              stageId: stageForPhase(ph),
              ...rollUp(phasePlan),
              assignedToUserId: primaryEngineerId,
              isDemo: true,
            } as typeof mapPhases.$inferInsert)
            .returning({ id: mapPhases.id });
          result.mapPhases++;
          const planPhase = { id: phase.id, taskIds: [] as number[], items: phasePlan };
          planPhases.push(planPhase);

          for (let st = 0; st < mapDepth; st++) {
            const stepPlan = phasePlan.slice(st * mapDepth, (st + 1) * mapDepth);
            const [step] = await db
              .insert(mapSteps)
              .values({
                projectId: project.id,
                phaseId: phase.id,
                name: DEMO_MAP_PLAN[ph].steps[st].step,
                orderIndex: st,
                ...rollUp(stepPlan),
                assignedToUserId: primaryEngineerId,
                isDemo: true,
              } as typeof mapSteps.$inferInsert)
              .returning({ id: mapSteps.id });
            result.mapSteps++;

            const taskRows = await db
              .insert(mapTasks)
              .values(
                Array.from({ length: mapDepth }).map((_, ti) => {
                  const planned = taskPlan[taskIndex++];
                  const customerOwned = ti % 3 === 2;
                  return {
                    projectId: project.id,
                    phaseId: phase.id,
                    stepId: step.id,
                    name: DEMO_MAP_PLAN[ph].steps[st].tasks[ti],
                    orderIndex: ti,
                    ...planned,
                    teamOwned: customerOwned ? "Customer" : "Internal",
                    assignedToUserId: customerOwned ? null : faker.helpers.arrayElement([primaryEngineerId, staff.specialist]),
                    assignedToCustomerUserId: customerOwned ? champion.id : null,
                    isDemo: true,
                  };
                }) as Array<typeof mapTasks.$inferInsert>,
              )
              .returning({ id: mapTasks.id });
            result.mapTasks += taskRows.length;
            planPhase.taskIds.push(...taskRows.map((row) => row.id));
          }
        }
      }

      // Success criteria, with statuses matching how far the project has
      // come. The last third are nice-to-haves. Each is tested in the plan's
      // validation phase (the third phase, or the last one of a shorter
      // plan) and linked to one of its tasks.
      const testPhase = planPhases[Math.min(2, planPhases.length - 1)] ?? null;
      const criteria = planCriteria(
        stage,
        projectSolutions.flatMap((sol) => sol.criteria),
        testPhase ? validationProgress(testPhase.items) : undefined,
      );
      const criterionRows = await db
        .insert(successCriteria)
        .values(
          criteria.map((cr, i) => ({
            projectId: project.id,
            productName: projectSolutions[0].name,
            ...cr,
            lineNumber: i + 1,
            isActive: true,
            priority: criterionPriorityFor(i, criteria.length),
            mapPhaseId: testPhase?.id ?? null,
          })) as Array<typeof successCriteria.$inferInsert>,
        )
        .returning();
      result.successCriteria += criteria.length;
      if (testPhase && testPhase.taskIds.length > 0) {
        await db.insert(mapTaskCriteria).values(
          criterionRows.map((row, i) => ({
            projectId: project.id,
            taskId: testPhase.taskIds[i % testPhase.taskIds.length],
            criterionId: row.id,
          })),
        );
      }

      // The customer's agreement to the criteria: sent and waiting on new
      // projects, agreed by the champion a week in on the rest. Mid-test
      // projects reworded a criterion since, so they ask to re-agree.
      const agreement = demoAgreementFor(stage, planPhases.length > 1 ? validationProgress(planPhases[0].items).ended : stage !== "early");
      const requestedAt = new Date(startDate.getTime() + 2 * 86_400_000);
      const agreedAt = new Date(startDate.getTime() + 6 * 86_400_000);
      const snapshot = agreementSnapshot(criterionRows);
      if (agreement === "changed" && snapshot.length > 0) {
        snapshot[0] = { ...snapshot[0], expectedOutcome: `${snapshot[0].expectedOutcome ?? ""} (first draft)`.trim() };
      }
      await db.insert(criteriaAgreements).values({
        projectId: project.id,
        requestedByUserId: primaryEngineerId,
        requestedAt,
        recipientUserIds: [champion.id],
        ...(agreement === "sent"
          ? {}
          : {
              agreedByUserId: champion.id,
              agreedByName: champion.name,
              agreedByTitle: champion.title,
              agreedAt: agreedAt.getTime() < Date.now() ? agreedAt : new Date(),
              criteriaSnapshot: snapshot,
            }),
      });

      // Won projects name the Pro Services people taking the customer over.
      if (stage === "won" && staff.proserv.length > 0) {
        await db.insert(projectHandoffContacts).values(
          staff.proserv.map((userId, index) => ({
            projectId: project.id,
            userId,
            responsibility: index === 0 ? "Implementation lead" : "Solution architect",
            orderIndex: index,
          })),
        );
      }

      // Solution gaps found during the validation (Gap Analysis). They
      // cascade with the project.
      for (const sol of projectSolutions) {
        const gaps = planGaps(stage, sol.name, sol.componentNames);
        if (gaps.length === 0) continue;
        await db.insert(projectGaps).values(gaps.map((g) => ({
          ...g,
          projectId: project.id,
          customerId: customer.id,
          resolutionOwner: "Product Management",
          reportedBy: primaryEngineerId,
          createdAt: new Date(startDate.getTime() + 14 * 86_400_000),
          finalDispositionDate: closed ? endDate : null,
        })) as Array<typeof projectGaps.$inferInsert>);
        result.gaps += gaps.length;
      }

      // Closed projects carry their recorded outcome, so Outcome
      // Intelligence has data. The third one is left without, so Missing
      // Outcomes has something to show.
      const outcome = planOutcome(stage, projectStatus);
      if (outcome) closedSeen++;
      if (outcome && closedSeen !== 3) {
        await db.insert(projectOutcomes).values({ projectId: project.id, ...outcome } as typeof projectOutcomes.$inferInsert);
        result.outcomes++;
      } else if (outcome) {
        // "preexisting" (closed before capture rules) lists it as missing
        // without the reminder and escalation an open request would send.
        await db.insert(outcomeRequests).values({
          projectId: project.id,
          outcomeType: outcome.outcomeType,
          source: "preexisting",
          status: "preexisting",
          required: false,
          closedAt: endDate,
        });
      }

      // AI risk assessment: an earlier run and the current one.
      if (riskRuleset) {
        const runs = planRiskAssessment(stage, riskCriteriaNames);
        const lastRun = new Date(Date.now() - faker.number.int({ min: 1, max: 6 }) * 86_400_000);
        const firstRun = new Date(lastRun.getTime() - 14 * 86_400_000);
        const predictionRows = await db.insert(projectRiskPredictions).values(
          ([[runs.previous, firstRun], [runs.latest, lastRun]] as const).map(([run, at]) => ({
            projectId: project.id,
            rulesetId: riskRuleset.id,
            overallRiskScore: run.overallRiskScore.toString(),
            riskLevel: run.riskLevel,
            criteriaScores: run.criteriaScores,
            analysisResults: run.analysisResults,
            confidence: run.confidence.toString(),
            triggerReasons: run.triggerReasons,
            recommendations: run.recommendations,
            aiProvider: "demo",
            createdAt: at,
          })),
        ).returning({ id: projectRiskPredictions.id });
        // A high or critical run raises an alert, as the risk engine does;
        // closed projects' alerts were acknowledged by the primary engineer.
        if (runs.latest.riskLevel === "high" || runs.latest.riskLevel === "critical") {
          await db.insert(riskAlerts).values({
            projectId: project.id,
            riskPredictionId: predictionRows[1]?.id ?? null,
            alertType: runs.latest.riskLevel === "critical" ? "critical" : "high_risk",
            severity: runs.latest.riskLevel,
            message: `Project risk level: ${runs.latest.riskLevel}. ${runs.latest.analysisResults.summary}`,
            sentAt: lastRun,
            acknowledged: closed,
            acknowledgedBy: closed ? primaryEngineerId : null,
            acknowledgedAt: closed ? endDate : null,
          });
          result.riskAlerts++;
        }
        await db.update(projects).set({
          riskScore: runs.latest.overallRiskScore.toString(),
          riskPredictionData: {
            riskLevel: runs.latest.riskLevel,
            criteriaScores: runs.latest.criteriaScores,
            analysisResults: runs.latest.analysisResults,
            confidence: runs.latest.confidence,
            triggerReasons: runs.latest.triggerReasons,
            recommendations: runs.latest.recommendations,
            previousScore: runs.previous.overallRiskScore,
            aiProvider: "demo",
            aiModel: null,
          },
          lastRiskAnalysis: lastRun,
        }).where(eq(projects.id, project.id));
      }

      // Activity history that reads like the project's story.
      const logRows = await db
        .insert(activityLogs)
        .values(
          planActivity(stage, solutionName).map((entry) => ({
            projectId: project.id,
            userId: createdBy,
            ...entry,
            isDemo: true,
          })),
        )
        .returning({ id: activityLogs.id });
      result.activityLogs += logRows.length;

      // A few bell notifications for the seeding admin; they cascade with
      // the project. Written directly because the seed request is not in
      // demo context; the bell shows them only while in demo.
      // A short conversation between the champion and the engineer
      // (cascades with the project).
      const conversation = planMessages(stage, solutionName);
      if (conversation.length > 0) {
        await db.insert(projectMessages).values(
          conversation.map((m) => ({
            projectId: project.id,
            authorUserId: m.from === "customer" ? champion.id : primaryEngineerId,
            body: m.body,
            createdAt: new Date(Date.now() - m.hoursAgo * 3_600_000),
          })),
        );
      }

      const notes = planNotifications({ id: project.id, solutionName, customerName: customer.accountName }, stage);
      if (notes.length > 0) {
        await db.insert(userNotifications).values(
          notes.map((n) => ({ userId: createdBy, projectId: project.id, actorUserId: primaryEngineerId, ...n })),
        );
        result.notifications += notes.length;
      }
    }

    // The account's Solutions list is what its projects validate.
    if (accountSolutions.size > 0) {
      await db.update(customers)
        .set({ productInterests: [...accountSolutions] })
        .where(eq(customers.id, customer.id));
    }
  }

  // Competitor Intelligence: generic spaces and fictional vendors, linked
  // to the demo solutions, projects and accounts (demo-competitors.ts).
  const demoCompetitors = await seedDemoCompetitors(library.solutions, competitorProjects, staff.specialist);
  result.competitors = demoCompetitors.spaces + demoCompetitors.competitors;

  // Artifacts: documents (with stored PDFs), links and code scripts for the
  // demo solutions, accounts and projects (demo-artifacts.ts).
  const demoArtifacts = await seedDemoArtifacts(library.solutions, artifactAccounts, artifactProjects, staff.specialist);
  result.artifacts = demoArtifacts.documents + demoArtifacts.links + demoArtifacts.codeScripts;

  // Resource Content: a few resources by Demo Staff (demo-portal-resources.ts).
  result.artifacts += await seedDemoPortalResources(staff.engineers[0] ?? staff.specialist, staff.specialist);

  // Criteria Builder templates — one per demo solution, used by the demo
  // projects of that solution and by its project template.
  const criteriaTemplates = await seedDemoCriteriaTemplates(library.solutions, artifactProjects, staff.specialist);
  result.criteriaTemplates = criteriaTemplates.size;

  // Project templates — one per demo solution, built from its library
  // criteria and MAP template; flagged demo so the wipe cleans them up.
  const templateStamp = Date.now();
  const planBySolution = new Map(DEMO_CATALOG.map((c) => [c.name, c.plan] as const));
  await db.insert(projectTemplates).values(
    library.solutions.map((sol) => {
      const plan = planBySolution.get(sol.name);
      const useMap = sol.abbreviation === "IGA" && demoMapTemplate !== null;
      return {
        id: `demo-tpl-${sol.abbreviation.toLowerCase()}-${templateStamp}`,
        name: `[demo] ${sol.name} Proof of Concept`,
        description: `Standard ${sol.name} validation: ${sol.componentNames.join(", ")}.`,
        industry: plan?.environment ?? "SaaS",
        solutionType: sol.name,
        type: "POC",
        solutionName: [sol.name],
        estimatedDuration: "4-6 weeks",
        durationWorkingDays: 25,
        businessProblem: `Manual ${sol.componentNames[0].toLowerCase()} work and audit findings the current tools cannot close.`,
        customerObjective: `Prove ${sol.name} meets the agreed success criteria in the customer's environment.`,
        tags: [sol.abbreviation, "POC"],
        successCriteriaTemplates: sol.criteria,
        isActive: true,
        isSystem: false,
        mapTemplateId: useMap ? demoMapTemplate!.id : sol.planTemplate.id,
        mapTemplateName: useMap ? demoMapTemplate!.name : sol.planTemplate.name,
        validationCriteriaTemplateId: criteriaTemplates.get(sol.id)?.id ?? null,
        validationCriteriaTemplateName: criteriaTemplates.get(sol.id)?.name ?? null,
        usageCount: 0,
        isDemo: true,
        createdBy: staff.lead,
        updatedBy: staff.lead,
      } as typeof projectTemplates.$inferInsert;
    }),
  );

  // ─── Library: assumptions, dependencies, products, email tpls, AI ────────
  // Categories are the install's own (Field Settings); a missing name stays blank.
  const assumptionCategoryIds = new Map(
    (await db.select({ id: assumptionCategories.id, name: assumptionCategories.name }).from(assumptionCategories))
      .map((c) => [c.name, c.id]),
  );
  const dependencyCategoryIds = new Map(
    (await db.select({ id: dependencyCategories.id, name: dependencyCategories.name }).from(dependencyCategories))
      .map((c) => [c.name, c.id]),
  );
  const aRows = await db
    .insert(assumptions)
    .values(
      DEMO_ASSUMPTIONS.map((a) => ({
        title: `[demo] ${a.title}`,
        description: a.description,
        categoryId: assumptionCategoryIds.get(a.category) ?? null,
        isActive: true,
        isDemo: true,
        createdBy,
        updatedBy: createdBy,
      })),
    )
    .returning({ id: assumptions.id });
  result.assumptions = aRows.length;

  const dRows = await db
    .insert(dependencies)
    .values(
      DEMO_DEPENDENCIES.map((d) => ({
        title: `[demo] ${d.title}`,
        description: d.description,
        categoryId: dependencyCategoryIds.get(d.category) ?? null,
        isActive: true,
        isAllSolutions: true,
        isDemo: true,
        createdBy,
        updatedBy: createdBy,
      })),
    )
    .returning({ id: dependencies.id });
  result.dependencies = dRows.length;

  // Discovery profiles on the accounts; assumptions and dependencies on the projects.
  result.projectExtras = await seedDemoProjectExtras({
    accounts: artifactAccounts,
    projects: artifactProjects,
    assumptionIds: aRows.map((r) => r.id),
    dependencyIds: dRows.map((r) => r.id),
    championEmailByAccount,
    createdBy: staff.specialist,
  });


  const tplRows = await db
    .insert(emailTemplates)
    .values(
      DEMO_EMAIL_TEMPLATES.map((t, i) => ({
        name: `[demo] ${t.name}`,
        templateKey: `demo_tpl_${Date.now()}_${i}_${faker.string.alphanumeric(6)}`,
        description: t.description,
        category: "demo",
        emailType: "general",
        subject: `[demo] ${t.subject}`,
        emailContent: t.body,
        isActive: true,
        isDemo: true,
        recipientType: "individual",
        createdBy,
        updatedBy: createdBy,
      })) as Array<typeof emailTemplates.$inferInsert>,
    )
    .returning({ id: emailTemplates.id, templateKey: emailTemplates.templateKey });
  result.emailTemplates = tplRows.length;

  // ─── Custom reports: shared, built on the demo projects' real fields ────
  const reportRows = await db
    .insert(customReports)
    .values(
      DEMO_REPORTS.map((r) => ({
        ...r,
        name: `[demo] ${r.name}`,
        reportType: "table",
        chartType: null,
        dataSource: "projects",
        createdBy,
        isShared: true,
        isDemo: true,
      })) as Array<typeof customReports.$inferInsert>,
    )
    .returning({ id: customReports.id, name: customReports.name });

  // ─── Scheduled reports for Analytics › Calendar (never run, see the file) ─
  result.reportSchedules = await seedDemoReportSchedules(staff, reportRows);

  // ─── Email Logs, webhooks, MCP activity and announcements ────────────────
  const history = await seedDemoIntegrationHistory(historyProjects, staff.all, staff.specialist);
  result.integrationHistory = history.emailLogs + history.webhookDeliveries + history.mcpCalls + history.announcements;

  // ─── Workflow Automation rules with run history, and AI assessment jobs ──
  const automation = await seedDemoAutomation(
    {
      leadId: staff.lead,
      emailTemplate: tplRows[0] ? { id: tplRows[0].id, templateKey: tplRows[0].templateKey } : null,
      rulesetId: riskRuleset?.id ?? null,
      rulesetName: riskRuleset?.name ?? null,
      createdBy: staff.specialist,
    },
    artifactProjects.map((p) => ({ id: p.id, name: p.name, stage: p.stage })),
  );
  result.automation = automation.rules + automation.runs;
  result.assessmentJobs = automation.assessmentJobs;

  if (opts.includeAi) {
    const aiRows = await db
      .insert(aiProviderConfigs)
      .values([
        {
          provider: "openai",
          displayName: `[demo] OpenAI Sandbox`,
          // No key: api_key is stored AES-GCM encrypted, so a plaintext
          // placeholder here made the AI Providers list fail to decrypt
          // and 500. The stub is non-functional by design (isActive=false).
          apiKey: "",
          isActive: false,
          isDefault: false,
          isDemo: true,
          createdBy,
        } as typeof aiProviderConfigs.$inferInsert,
      ])
      .returning({ id: aiProviderConfigs.id });
    result.aiProviderConfigs = aiRows.length;
  }

  // Weekly KPI and MAP history for the dashboard sparklines, computed from
  // the demo projects as they stood each week.
  result.metricSnapshots = await seedDemoMetricHistory();

  return result;
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

/**
 * True when any demo data is present. Seeding is one data set at a time
 * (as in ImpactIQ): a second seed would duplicate the demo library and
 * solutions, so callers reseed instead.
 */
export async function demoDataExists(): Promise<boolean> {
  for (const table of [customers, projects, products] as const) {
    const [row] = await db.select({ id: table.id }).from(table).where(eq(table.isDemo, true)).limit(1);
    if (row) return true;
  }
  return false;
}

/**
 * Replaces the demo data with a fresh set: the wipe, then a seed with
 * `opts`. Dates are relative to today, so a reseed brings an old demo up
 * to date. If the seed fails after the wipe, the demo is left empty and
 * the error is thrown; nothing outside Demo Mode is touched either way.
 */
export async function reseedDemoData(
  opts: SeedOptions,
  createdBy: string,
): Promise<{ wiped: WipeResult; seeded: SeedResult }> {
  const wiped = await wipeDemoData();
  const seeded = await seedDemoData(opts, createdBy);
  return { wiped, seeded };
}
