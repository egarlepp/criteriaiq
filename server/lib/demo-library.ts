// Demo Mode Validation Criteria library: the solutions demo projects are
// built on, with their components, criteria, expected outcomes, actions
// taken, value mappings and Quick plan MAP templates. Every row is is_demo = true
// (migration 114), so Demo Mode shows this library and never the real one.
// demo-wipe.ts removes it, links first.
import { db } from "../db";
import {
  products,
  components,
  criteriaLibrary,
  expectedOutcomes,
  actionItems,
  valueMappings,
  mapTemplates,
  mapTemplatePhases,
  mapTemplateSteps,
  productComponents,
  productCriteria,
  productOutcomes,
  productActions,
  productValueMappings,
  criteriaOutcomes,
  outcomeActions,
  criteriaValueMappings,
  journeyStages,
} from "@shared/schema";

interface CatalogCriterion {
  criterion: string;
  outcome: string;
  action: string;
  /** Index into the solution's valueMappings. */
  value: number;
}

interface CatalogSolution {
  name: string;
  abbreviation: string;
  icon: string;
  description: string;
  valueMappings: ReadonlyArray<{ name: string; description: string }>;
  components: ReadonlyArray<{ name: string; description: string; criteria: readonly CatalogCriterion[] }>;
  /** A one-phase MAP template (a Quick plan) for the solution. */
  plan: { name: string; environment: string; steps: readonly string[] };
}

export const DEMO_CATALOG: readonly CatalogSolution[] = [
  {
    name: "Identity Governance",
    abbreviation: "IGA",
    icon: "ShieldCheck",
    description: "Joiner-mover-leaver automation, access reviews and separation-of-duties controls.",
    valueMappings: [
      { name: "Reduce audit preparation time", description: "Evidence is produced from the platform instead of spreadsheets." },
      { name: "Lower access-related risk", description: "Fewer standing and orphaned entitlements." },
      { name: "Cut help desk workload", description: "Fewer manual access tickets." },
    ],
    components: [
      {
        name: "Lifecycle Management",
        description: "Provisioning and deprovisioning driven by the HR record.",
        criteria: [
          { criterion: "New hires get day-one access automatically from the HR record", outcome: "Provisioning completes within 1 hour of the HR hire event", action: "Ran three test hires through the HR connector", value: 2 },
          { criterion: "Leavers lose all access the day they leave", outcome: "Every account disabled within 15 minutes of termination", action: "Terminated a test user and checked each connected system", value: 1 },
        ],
      },
      {
        name: "Access Certification",
        description: "Manager and owner reviews of who has access to what.",
        criteria: [
          { criterion: "Quarterly access reviews run without spreadsheets", outcome: "Managers certify access in the product; completion above 95%", action: "Ran a pilot campaign for two departments", value: 0 },
          { criterion: "Auditors can pull evidence without IT help", outcome: "Evidence export for the top 10 controls in under 10 minutes", action: "Walked the internal auditor through the export", value: 0 },
        ],
      },
      {
        name: "Policy and SoD Controls",
        description: "Separation-of-duties rules checked before access is granted.",
        criteria: [
          { criterion: "Separation-of-duties conflicts are detected before access is granted", outcome: "Conflicting requests are blocked or routed for approval", action: "Requested a known toxic combination as a test user", value: 1 },
          { criterion: "Orphaned accounts are found and cleaned up", outcome: "Orphaned account count reduced by 90% in the pilot scope", action: "Ran the orphaned account report and remediated", value: 1 },
        ],
      },
    ],
    plan: {
      name: "Identity Governance Validation",
      environment: "CloudLAB",
      steps: [
        "Connect the HR source and two target systems",
        "Run joiner, mover and leaver test cases",
        "Launch a pilot access review for two departments",
        "Load separation-of-duties rules and test a conflict",
        "Export audit evidence with the internal auditor",
        "Readout of results against the success criteria",
      ],
    },
  },
  {
    name: "Privileged Access Management",
    abbreviation: "PAM",
    icon: "KeyRound",
    description: "Vaulting, session recording and just-in-time elevation for privileged accounts.",
    valueMappings: [
      { name: "Contain privileged account misuse", description: "No shared or standing admin credentials." },
      { name: "Pass privileged access audit findings", description: "Recorded, attributable admin sessions." },
      { name: "Speed up admin work", description: "Approved elevation in minutes, not tickets." },
    ],
    components: [
      {
        name: "Credential Vault",
        description: "Discovery, vaulting and rotation of privileged credentials.",
        criteria: [
          { criterion: "Privileged accounts are inventoried and owned", outcome: "100% of privileged accounts have a named owner", action: "Imported privileged accounts and assigned owners", value: 0 },
          { criterion: "Shared admin passwords rotate after every use", outcome: "Rotation completes within 5 minutes of check-in", action: "Checked out and returned a domain admin credential", value: 0 },
        ],
      },
      {
        name: "Session Management",
        description: "Brokered, recorded privileged sessions.",
        criteria: [
          { criterion: "Every privileged session is recorded and searchable", outcome: "Recordings searchable by user, host and command", action: "Recorded RDP and SSH sessions and searched them", value: 1 },
        ],
      },
      {
        name: "Just-in-Time Elevation",
        description: "Time-bound elevation with approval.",
        criteria: [
          { criterion: "Admins get elevation only when approved and only for a set time", outcome: "Elevation granted in under 5 minutes and removed on expiry", action: "Requested, approved and let a 30-minute elevation expire", value: 2 },
          { criterion: "Standing admin rights are removed", outcome: "Standing admin group members reduced by 80% in the pilot scope", action: "Moved pilot admins to just-in-time elevation", value: 0 },
        ],
      },
    ],
    plan: {
      name: "Privileged Access Validation",
      environment: "OnPremise PreProd",
      steps: [
        "Discover privileged accounts on pilot servers",
        "Vault and rotate the discovered credentials",
        "Broker and record RDP and SSH sessions",
        "Set up just-in-time elevation with approval",
        "Review recordings with the security team",
        "Readout of results against the success criteria",
      ],
    },
  },
  {
    name: "Access Analytics",
    abbreviation: "AAN",
    icon: "ChartNoAxesCombined",
    description: "Risk scoring and reporting across identities, entitlements and activity.",
    valueMappings: [
      { name: "See identity risk in one place", description: "One risk view across directories and applications." },
      { name: "Feed the security operations center", description: "Access signals reach the SIEM." },
    ],
    components: [
      {
        name: "Risk Scoring",
        description: "Scores identities by entitlements and behavior.",
        criteria: [
          { criterion: "High-risk identities are ranked automatically", outcome: "Top 50 risky identities listed with the reason for each", action: "Reviewed the risk list with the identity team", value: 0 },
          { criterion: "Risky access is flagged when it is granted", outcome: "New high-risk entitlements alert the owner within 1 hour", action: "Granted a high-risk entitlement to a test user", value: 1 },
        ],
      },
      {
        name: "Reporting and Integrations",
        description: "Dashboards, scale and SIEM export.",
        criteria: [
          { criterion: "The platform handles our identity volume", outcome: "Full sync of 50,000 identities in under 30 minutes", action: "Loaded the full test data set and timed the sync", value: 0 },
          { criterion: "Security events flow into the SIEM", outcome: "Access changes visible in the SIEM within 5 minutes", action: "Configured the SIEM connector and triggered test events", value: 1 },
        ],
      },
    ],
    plan: {
      name: "Access Analytics Validation",
      environment: "SaaS",
      steps: [
        "Connect directories and three applications",
        "Run the first full sync and check counts",
        "Review the identity risk ranking",
        "Connect the SIEM and trigger test events",
        "Readout of results against the success criteria",
      ],
    },
  },
];

/** One success-criteria row a demo project can use, already linked in the library. */
export interface DemoLibraryCriterion {
  productName: string;
  componentName: string;
  criterion: string;
  expectedOutcome: string;
  actionItem: string;
  valueMappingName: string;
}

/** A demo component and the library rows linked under it, by id. */
export interface DemoLibraryComponent {
  id: number;
  name: string;
  criteria: Array<{
    id: number;
    name: string;
    outcome: { id: number; name: string };
    action: { id: number; name: string };
  }>;
}

export interface DemoSolution {
  id: number;
  name: string;
  abbreviation: string;
  /** Lucide icon name of the solution. */
  icon: string;
  componentNames: string[];
  criteria: DemoLibraryCriterion[];
  /** The library under the solution, by id (for Criteria Builder templates). */
  components: DemoLibraryComponent[];
  /** The solution's Quick plan MAP template. */
  planTemplate: { id: number; name: string; steps: readonly string[] };
}

export interface DemoLibrary {
  solutions: DemoSolution[];
  /** Components, criteria, outcomes, actions and value mappings. */
  libraryItems: number;
}

/** Creates the demo solutions and their linked library. */
/**
 * The value journey stage a demo Quick plan's one phase is tagged with: the
 * third stage in order (Validate in the default list), since a Quick plan is
 * the validation itself. Null when no stages are set up.
 */
export async function demoQuickPlanStageId(): Promise<number | null> {
  const stages = await db
    .select({ id: journeyStages.id })
    .from(journeyStages)
    .orderBy(journeyStages.orderIndex, journeyStages.id);
  return stages.length > 0 ? stages[Math.min(2, stages.length - 1)].id : null;
}

export async function seedDemoLibrary(createdBy: string): Promise<DemoLibrary> {
  const result: DemoLibrary = { solutions: [], libraryItems: 0 };
  const quickPlanStageId = await demoQuickPlanStageId();
  const audit = { createdBy, updatedBy: createdBy, isActive: true, isDemo: true };

  for (const sol of DEMO_CATALOG) {
    const [product] = await db.insert(products).values({
      name: sol.name,
      abbreviation: sol.abbreviation,
      description: sol.description,
      solutionType: "Solution",
      solutionIconName: sol.icon,
      ...audit,
    } as typeof products.$inferInsert).returning({ id: products.id });

    const valueRows = await db.insert(valueMappings)
      .values(sol.valueMappings.map((v) => ({ ...v, ...audit })))
      .returning({ id: valueMappings.id });
    await db.insert(productValueMappings)
      .values(valueRows.map((v) => ({ productId: product.id, valueMappingId: v.id })));
    result.libraryItems += valueRows.length;

    const criteria: DemoLibraryCriterion[] = [];
    const libraryComponents: DemoLibraryComponent[] = [];
    for (const comp of sol.components) {
      const [component] = await db.insert(components)
        .values({ name: comp.name, description: comp.description, ...audit } as typeof components.$inferInsert)
        .returning({ id: components.id });
      await db.insert(productComponents).values({ productId: product.id, componentId: component.id });
      result.libraryItems++;
      const libraryComponent: DemoLibraryComponent = { id: component.id, name: comp.name, criteria: [] };
      libraryComponents.push(libraryComponent);

      for (const c of comp.criteria) {
        const [criterion] = await db.insert(criteriaLibrary)
          .values({ name: c.criterion, componentId: component.id, ...audit })
          .returning({ id: criteriaLibrary.id });
        const [outcome] = await db.insert(expectedOutcomes)
          .values({ name: c.outcome, ...audit })
          .returning({ id: expectedOutcomes.id });
        const [action] = await db.insert(actionItems)
          .values({ name: c.action, ...audit })
          .returning({ id: actionItems.id });
        await db.insert(productCriteria).values({ productId: product.id, criteriaId: criterion.id });
        await db.insert(productOutcomes).values({ productId: product.id, outcomeId: outcome.id });
        await db.insert(productActions).values({ productId: product.id, actionId: action.id });
        await db.insert(criteriaOutcomes).values({ criteriaId: criterion.id, outcomeId: outcome.id });
        await db.insert(outcomeActions).values({ outcomeId: outcome.id, actionId: action.id });
        await db.insert(criteriaValueMappings).values({ criteriaId: criterion.id, valueMappingId: valueRows[c.value].id });
        result.libraryItems += 3;
        libraryComponent.criteria.push({
          id: criterion.id,
          name: c.criterion,
          outcome: { id: outcome.id, name: c.outcome },
          action: { id: action.id, name: c.action },
        });
        criteria.push({
          productName: sol.name,
          componentName: comp.name,
          criterion: c.criterion,
          expectedOutcome: c.outcome,
          actionItem: c.action,
          valueMappingName: sol.valueMappings[c.value].name,
        });
      }
    }

    // The solution's plan as a MAP template with one phase (a Quick plan).
    // Customer emails start off, like every Quick plan.
    const [planTemplate] = await db.insert(mapTemplates).values({
      name: `[demo] ${sol.plan.name}`,
      description: `Standard validation plan for ${sol.name}.`,
      icon: sol.icon,
      scope: "project",
      visibility: "internal",
      createdByUserId: createdBy,
      updatedByUserId: createdBy,
      isActive: true,
      isSystem: false,
      isDemo: true,
    } as typeof mapTemplates.$inferInsert).returning({ id: mapTemplates.id, name: mapTemplates.name });
    const [planPhase] = await db.insert(mapTemplatePhases).values({
      templateId: planTemplate.id,
      name: sol.plan.name,
      orderIndex: 0,
      stageId: quickPlanStageId,
      sendExternalEmails: false,
      isDemo: true,
    } as typeof mapTemplatePhases.$inferInsert).returning({ localKey: mapTemplatePhases.localKey });
    await db.insert(mapTemplateSteps).values(
      sol.plan.steps.map((name, index) => ({
        templateId: planTemplate.id,
        phaseLocalKey: planPhase.localKey,
        name,
        orderIndex: index,
        defaultStartOffsetDays: index * 4,
        defaultDueOffsetDays: index * 4 + 4,
        sendExternalEmails: false,
        isDemo: true,
      })) as Array<typeof mapTemplateSteps.$inferInsert>,
    );

    result.solutions.push({
      id: product.id,
      name: sol.name,
      abbreviation: sol.abbreviation,
      icon: sol.icon,
      componentNames: sol.components.map((c) => c.name),
      criteria,
      components: libraryComponents,
      planTemplate: { id: planTemplate.id, name: planTemplate.name, steps: sol.plan.steps },
    });
  }
  return result;
}
