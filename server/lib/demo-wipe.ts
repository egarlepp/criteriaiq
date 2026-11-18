// Demo Mode wipe: removes everything the seeder (or a demo session) created.
// Every tagged row goes by `is_demo = true` inside one transaction with a
// non-demo row-count check; demo users go afterwards (demo-story.ts).
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  customers,
  projects,
  projectTemplates,
  activityLogs,
  mapPhases,
  mapSteps,
  mapTasks,
  mapLinks,
  mapTemplates,
  mapTemplatePhases,
  mapTemplateSteps,
  mapTemplateTasks,
  mapTemplateApplications,
  customReports,
  dashboardLayouts,
  tags,
  assumptions,
  dependencies,
  emailTemplates,
  aiProviderConfigs,
  products,
  customerAccess,
  components,
  criteriaLibrary,
  expectedOutcomes,
  actionItems,
  valueMappings,
  emailSchedules,
  teams,
  technologySpaces,
  competitors,
  documents,
  links,
  codeScripts,
  portalResources,
  emailLogs,
  webhooks,
  webhookDeliveries,
  mcpToolCalls,
  systemAnnouncements,
  emailRules,
  emailRuleAudits,
  assessmentJobs,
  validationCriteriaTemplates,
} from "@shared/schema";
import { removeDemoUsers } from "./demo-story";
import { removeDemoMetricHistory } from "../services/metric-snapshot-service";
import { deleteFile } from "./cloud-storage";

export interface WipeResult {
  customers: number;
  customerAccess: number;
  projects: number;
  projectTemplates: number;
  activityLogs: number;
  mapTemplates: number;
  mapPhases: number;
  mapSteps: number;
  mapTasks: number;
  mapLinks: number;
  customReports: number;
  dashboardLayouts: number;
  tags: number;
  assumptions: number;
  dependencies: number;
  emailTemplates: number;
  aiProviderConfigs: number;
  products: number;
  /** Demo components, criteria, expected outcomes, actions taken and value mappings. */
  libraryItems: number;
  /** Demo scheduled reports (Analytics › Calendar); their run logs cascade. */
  reportSchedules: number;
  /** Demo teams; their subteams and memberships go with them. */
  teams: number;
  /** Demo technology spaces and competitors; their links cascade. */
  competitors: number;
  /** Demo documents, links and code scripts (Artifacts) and Resource Content links. */
  artifacts: number;
  /** Demo email logs, webhook deliveries, MCP calls and announcements (webhooks go with them). */
  integrationHistory: number;
  /** Demo Workflow Automation rules and their run history. */
  automation: number;
  /** Demo AI assessment jobs. */
  assessmentJobs: number;
  /** Demo Criteria Builder templates. */
  criteriaTemplates: number;
  /** Rows of untagged tables removed or detached because they hung off demo rows. */
  untaggedChildren: number;
  /** Demo Staff and demo customer users removed. */
  users: number;
  /** Demo sparkline history points removed. */
  metricSnapshots: number;
}

const DEMO_PROJECT_IDS = sql`(SELECT id FROM projects WHERE is_demo = true)`;
const DEMO_CUSTOMER_IDS = sql`(SELECT id FROM customers WHERE is_demo = true)`;

/**
 * Flags `is_demo = true` on rows of tagged tables that hang off a demo
 * project (project_id) or demo account (customer_id) but were written
 * without the flag. Tables are checked for those columns at run time, so
 * a tagged table that gains one is covered without a code change.
 */
async function claimUntaggedDemoRows(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<void> {
  // Never projects or customers themselves: a real project on a demo
  // account is a mistake to report, not something to delete.
  const CLAIMABLE = TAGGED_TABLES.filter((t) => t !== "projects" && t !== "customers");
  const r = await tx.execute(sql`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND column_name IN ('project_id', 'customer_id')
      AND table_name IN (${sql.join(CLAIMABLE.map((t) => sql`${t}`), sql`, `)})`);
  const rows = ((r as unknown as { rows?: Array<{ table_name: string; column_name: string }> }).rows
    ?? (r as unknown as Array<{ table_name: string; column_name: string }>));
  for (const { table_name: table, column_name: column } of rows) {
    const parents = column === "project_id" ? DEMO_PROJECT_IDS : DEMO_CUSTOMER_IDS;
    await tx.execute(sql`UPDATE ${sql.identifier(table)} SET is_demo = true
      WHERE is_demo = false AND ${sql.identifier(column)} IN ${parents}`);
  }
}

/**
 * Clears rows of untagged tables that point at demo projects or demo
 * accounts through a RESTRICT foreign key. Only rows whose project_id /
 * customer_id / account_id is a demo row are touched. Returns the number
 * of rows deleted or detached.
 */
async function wipeUntaggedDemoChildren(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<number> {
  const statements = [
    // Children before parents: risk alerts may sit on a prediction's project.
    sql`DELETE FROM risk_alerts WHERE project_id IN ${DEMO_PROJECT_IDS}`,
    sql`DELETE FROM project_risk_predictions WHERE project_id IN ${DEMO_PROJECT_IDS}`,
    sql`DELETE FROM kanban_audit_events WHERE project_id IN ${DEMO_PROJECT_IDS}`,
    // evaluation_request_products cascades from evaluation_requests.
    sql`DELETE FROM evaluation_requests WHERE customer_id IN ${DEMO_CUSTOMER_IDS}`,
    sql`DELETE FROM support_requests WHERE customer_id IN ${DEMO_CUSTOMER_IDS}`,
    // email_logs rows are referenced by email_rule_audits, so keep them and detach.
    sql`UPDATE email_logs SET project_id = NULL WHERE project_id IN ${DEMO_PROJECT_IDS}`,
    sql`UPDATE map_templates SET customer_id = NULL WHERE customer_id IN ${DEMO_CUSTOMER_IDS}`,
    sql`UPDATE users SET account_id = NULL WHERE account_id IN ${DEMO_CUSTOMER_IDS}`,
    sql`UPDATE archived_users SET account_id = NULL WHERE account_id IN ${DEMO_CUSTOMER_IDS}`,
  ];
  let touched = 0;
  for (const statement of statements) {
    const r = await tx.execute(statement);
    touched += (r as unknown as { rowCount?: number | null }).rowCount ?? 0;
  }
  return touched;
}

/**
 * Hard-deletes every row flagged `is_demo = true` across all tagged
 * tables, inside a single Postgres transaction. Child tables run
 * before parents so we never trip an unguarded FK. Each statement uses
 * `WHERE is_demo = true` — production rows are never inspected.
 *
 * Pre/post safety check: we capture `COUNT(*) WHERE is_demo = false`
 * for every tagged table BEFORE running any DELETE, and assert the
 * count is unchanged AFTER all DELETEs but BEFORE COMMIT. Any
 * deviation aborts the transaction.
 */
const TAGGED_TABLES = [
  "customers", "customer_access", "projects", "project_templates",
  "activity_logs",
  "map_templates", "map_template_phases", "map_template_steps",
  "map_template_tasks", "map_template_applications",
  "map_phases", "map_steps", "map_tasks", "map_links",
  "custom_reports", "dashboard_layouts", "tags",
  "assumptions", "dependencies", "email_templates",
  "ai_provider_configs", "products",
  "components", "criteria_library", "expected_outcomes", "action_items",
  "value_mappings", "email_schedules", "teams",
  "technology_spaces", "competitors",
  "documents", "links", "code_scripts", "portal_resources",
  "webhooks", "system_announcements",
  "email_rules", "validation_criteria_templates",
  // email_logs, webhook_deliveries, mcp_tool_calls, email_rule_audits and
  // assessment_jobs are tagged too, but stay out of this list: real sends,
  // deliveries, MCP calls, rule runs, scheduled assessments and the
  // retention cleanup change their non-demo counts at any moment, which
  // would abort the wipe. They are deleted by is_demo = true only.
];

/**
 * Link rows of the Validation Criteria library that touch a demo solution
 * or a demo library item, on either side. Run before the rows they link.
 */
const DEMO_LIBRARY_LINKS = [
  sql`DELETE FROM product_criteria WHERE product_id IN (SELECT id FROM products WHERE is_demo = true)
        OR criteria_id IN (SELECT id FROM criteria_library WHERE is_demo = true)`,
  sql`DELETE FROM product_components WHERE product_id IN (SELECT id FROM products WHERE is_demo = true)
        OR component_id IN (SELECT id FROM components WHERE is_demo = true)`,
  sql`DELETE FROM product_outcomes WHERE product_id IN (SELECT id FROM products WHERE is_demo = true)
        OR outcome_id IN (SELECT id FROM expected_outcomes WHERE is_demo = true)`,
  sql`DELETE FROM product_actions WHERE product_id IN (SELECT id FROM products WHERE is_demo = true)
        OR action_id IN (SELECT id FROM action_items WHERE is_demo = true)`,
  sql`DELETE FROM product_value_mappings WHERE product_id IN (SELECT id FROM products WHERE is_demo = true)
        OR value_mapping_id IN (SELECT id FROM value_mappings WHERE is_demo = true)`,
  sql`DELETE FROM criteria_outcomes WHERE criteria_id IN (SELECT id FROM criteria_library WHERE is_demo = true)
        OR outcome_id IN (SELECT id FROM expected_outcomes WHERE is_demo = true)`,
  sql`DELETE FROM outcome_actions WHERE outcome_id IN (SELECT id FROM expected_outcomes WHERE is_demo = true)
        OR action_id IN (SELECT id FROM action_items WHERE is_demo = true)`,
  sql`DELETE FROM criteria_value_mappings WHERE criteria_id IN (SELECT id FROM criteria_library WHERE is_demo = true)
        OR value_mapping_id IN (SELECT id FROM value_mappings WHERE is_demo = true)`,
];

async function countNonDemo(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  table: string,
): Promise<number> {
  const r = await tx.execute(sql.raw(
    `SELECT COUNT(*)::int AS n FROM "${table}" WHERE is_demo = false`,
  ));
  const row = (r as unknown as { rows?: Array<{ n: number }> }).rows?.[0]
    ?? (Array.isArray(r) ? (r[0] as { n: number }) : undefined);
  return row && typeof row.n === "number" ? row.n : 0;
}

export async function wipeDemoData(): Promise<WipeResult> {
  const { result, documentFiles } = await wipeDemoRows();
  await removeDemoDocumentFiles(documentFiles);
  // Demo users go after the transaction, one at a time: one that real
  // data still points at is deactivated instead of failing the wipe.
  const { removed } = await removeDemoUsers();
  const metricSnapshots = await removeDemoMetricHistory();
  return { ...result, users: removed, metricSnapshots };
}

/**
 * Deletes the stored files of wiped demo documents, after the rows are
 * gone. A file is kept when a remaining (real) document still points at
 * it. Best effort: a storage error is logged, never fails the wipe.
 */
async function removeDemoDocumentFiles(keys: string[]): Promise<void> {
  for (const key of new Set(keys)) {
    try {
      const [stillUsed] = await db.select({ id: documents.id }).from(documents)
        .where(sql`${documents.gcsPath} = ${key} OR ${documents.storedPath} = ${key}`).limit(1);
      if (!stillUsed) await deleteFile(key);
    } catch (err) {
      console.warn(`[demo-mode] Could not delete demo document file ${key}:`, err instanceof Error ? err.message : err);
    }
  }
}

async function wipeDemoRows(): Promise<{ result: WipeResult; documentFiles: string[] }> {
  return await db.transaction(async (tx) => {
    const result: WipeResult = {
      customers: 0, customerAccess: 0, projects: 0, projectTemplates: 0,
      activityLogs: 0, mapTemplates: 0, mapPhases: 0, mapSteps: 0,
      mapTasks: 0, mapLinks: 0, customReports: 0, dashboardLayouts: 0,
      tags: 0, assumptions: 0, dependencies: 0, emailTemplates: 0,
      aiProviderConfigs: 0, products: 0, libraryItems: 0,
      reportSchedules: 0, teams: 0, competitors: 0, artifacts: 0, integrationHistory: 0,
      automation: 0, assessmentJobs: 0, criteriaTemplates: 0, untaggedChildren: 0, users: 0, metricSnapshots: 0,
    };

    // Capture non-demo row counts for every tagged table before we
    // touch anything. If any of these counts changes during the wipe,
    // we have a safety violation and roll back.
    // Rows of tagged tables created on a demo project or account without
    // the flag (e.g. a MAP task added during a demo) would be removed by the
    // cascade and trip the count check below. Claim them for the demo first.
    await claimUntaggedDemoRows(tx);

    const before: Record<string, number> = {};
    for (const t of TAGGED_TABLES) before[t] = await countNonDemo(tx, t);

    // Each statement is hand-written (rather than through a generic
    // helper) because Drizzle column types are nominal per-table.
    // ORDER MATTERS: child rows first so we never trip an unguarded FK.

    // map_tasks.depends_on_task_id is a self-referential FK with no ON DELETE
    // clause (defaults to RESTRICT). Null it out before any deletes so
    // PostgreSQL does not reject the upcoming DELETE on demo task rows.
    // Covers both (a) demo→demo refs and (b) non-demo tasks pointing to demo tasks.
    await tx.execute(
      sql`UPDATE map_tasks SET depends_on_task_id = NULL
          WHERE is_demo = true
             OR depends_on_task_id IN (SELECT id FROM map_tasks WHERE is_demo = true)`
    );

    const ml = await tx.delete(mapLinks).where(eq(mapLinks.isDemo, true)).returning({ id: mapLinks.id });
    result.mapLinks = ml.length;
    const mt = await tx.delete(mapTasks).where(eq(mapTasks.isDemo, true)).returning({ id: mapTasks.id });
    result.mapTasks = mt.length;
    const ms = await tx.delete(mapSteps).where(eq(mapSteps.isDemo, true)).returning({ id: mapSteps.id });
    result.mapSteps = ms.length;
    const mp = await tx.delete(mapPhases).where(eq(mapPhases.isDemo, true)).returning({ id: mapPhases.id });
    result.mapPhases = mp.length;
    // map_template_* children must die before their parent map_templates row.
    await tx.delete(mapTemplateApplications).where(eq(mapTemplateApplications.isDemo, true));
    await tx.delete(mapTemplateTasks).where(eq(mapTemplateTasks.isDemo, true));
    await tx.delete(mapTemplateSteps).where(eq(mapTemplateSteps.isDemo, true));
    await tx.delete(mapTemplatePhases).where(eq(mapTemplatePhases.isDemo, true));
    const mtpl = await tx.delete(mapTemplates).where(eq(mapTemplates.isDemo, true)).returning({ id: mapTemplates.id });
    result.mapTemplates = mtpl.length;
    const al = await tx.delete(activityLogs).where(eq(activityLogs.isDemo, true)).returning({ id: activityLogs.id });
    result.activityLogs = al.length;
    const rs = await tx.delete(emailSchedules).where(eq(emailSchedules.isDemo, true)).returning({ id: emailSchedules.id });
    result.reportSchedules = rs.length;
    const cr = await tx.delete(customReports).where(eq(customReports.isDemo, true)).returning({ id: customReports.id });
    result.customReports = cr.length;
    const dl = await tx.delete(dashboardLayouts).where(eq(dashboardLayouts.isDemo, true)).returning({ id: dashboardLayouts.id });
    result.dashboardLayouts = dl.length;
    const tg = await tx.delete(tags).where(eq(tags.isDemo, true)).returning({ id: tags.id });
    result.tags = tg.length;
    const asm = await tx.delete(assumptions).where(eq(assumptions.isDemo, true)).returning({ id: assumptions.id });
    result.assumptions = asm.length;
    const dep = await tx.delete(dependencies).where(eq(dependencies.isDemo, true)).returning({ id: dependencies.id });
    result.dependencies = dep.length;
    const et = await tx.delete(emailTemplates).where(eq(emailTemplates.isDemo, true)).returning({ id: emailTemplates.id });
    result.emailTemplates = et.length;
    const ai = await tx.delete(aiProviderConfigs).where(eq(aiProviderConfigs.isDemo, true)).returning({ id: aiProviderConfigs.id });
    result.aiProviderConfigs = ai.length;

    // Integration history (migration 133). An automation audit row may
    // point at a demo email log; keep the audit and detach it.
    await tx.execute(sql`UPDATE email_rule_audits SET email_log_id = NULL
      WHERE email_log_id IN (SELECT id FROM email_logs WHERE is_demo = true)`);
    const el = await tx.delete(emailLogs).where(eq(emailLogs.isDemo, true)).returning({ id: emailLogs.id });
    const wd = await tx.delete(webhookDeliveries).where(eq(webhookDeliveries.isDemo, true)).returning({ id: webhookDeliveries.id });
    await tx.delete(webhooks).where(eq(webhooks.isDemo, true));
    const mc = await tx.delete(mcpToolCalls).where(eq(mcpToolCalls.isDemo, true)).returning({ id: mcpToolCalls.id });
    const sa = await tx.delete(systemAnnouncements).where(eq(systemAnnouncements.isDemo, true)).returning({ id: systemAnnouncements.id });
    result.integrationHistory = el.length + wd.length + mc.length + sa.length;

    // Workflow Automation, AI assessments and Criteria Builder (migration
    // 135). A rule's conditions and actions cascade; its digest schedules
    // are demo schedules and went above.
    const era = await tx.delete(emailRuleAudits).where(eq(emailRuleAudits.isDemo, true)).returning({ id: emailRuleAudits.id });
    const er = await tx.delete(emailRules).where(eq(emailRules.isDemo, true)).returning({ id: emailRules.id });
    result.automation = era.length + er.length;
    const aj = await tx.delete(assessmentJobs).where(eq(assessmentJobs.isDemo, true)).returning({ id: assessmentJobs.id });
    result.assessmentJobs = aj.length;
    const vct = await tx.delete(validationCriteriaTemplates).where(eq(validationCriteriaTemplates.isDemo, true))
      .returning({ id: validationCriteriaTemplates.id });
    result.criteriaTemplates = vct.length;
    const pjt = await tx.delete(projectTemplates).where(eq(projectTemplates.isDemo, true)).returning({ id: projectTemplates.id });
    result.projectTemplates = pjt.length;
    // Rows of untagged tables that a demo session (or a background job)
    // attached to demo projects or accounts. Their FKs have no ON DELETE
    // clause (RESTRICT), so one uploaded document or one AI risk run on a
    // demo project used to make the whole wipe roll back. They belong to
    // the demo, so they go with it; logs and links kept for audit are
    // detached (project/account set to NULL) instead.
    result.untaggedChildren = await wipeUntaggedDemoChildren(tx);

    // Demo Artifacts (migration 126), before the projects and accounts they
    // point at (no ON DELETE clause). Rows uploaded during a demo session on
    // a demo project or account were claimed above. The stored files go
    // after the commit (removeDemoDocumentFiles).
    const doc = await tx.delete(documents).where(eq(documents.isDemo, true))
      .returning({ gcsPath: documents.gcsPath, storedPath: documents.storedPath });
    const lk = await tx.delete(links).where(eq(links.isDemo, true)).returning({ id: links.id });
    const cs0 = await tx.delete(codeScripts).where(eq(codeScripts.isDemo, true)).returning({ id: codeScripts.id });
    const prs = await tx.delete(portalResources).where(eq(portalResources.isDemo, true)).returning({ id: portalResources.id });
    result.artifacts = doc.length + lk.length + cs0.length + prs.length;
    const documentFiles = doc
      .map((d) => d.gcsPath ?? d.storedPath)
      .filter((key): key is string => !!key && !key.includes("..") && !/^[a-z]+:\/\//i.test(key));

    // users.last_accessed_project_id is a FK to projects.id with no ON DELETE
    // clause (defaults to RESTRICT). Null it out for any user whose last-accessed
    // project is a demo project before we delete those project rows.
    await tx.execute(
      sql`UPDATE users SET last_accessed_project_id = NULL
          WHERE last_accessed_project_id IN (SELECT id FROM projects WHERE is_demo = true)`
    );
    const pj = await tx.delete(projects).where(eq(projects.isDemo, true)).returning({ id: projects.id });
    result.projects = pj.length;
    const ca = await tx.delete(customerAccess).where(eq(customerAccess.isDemo, true)).returning({ id: customerAccess.id });
    result.customerAccess = ca.length;
    const cs = await tx.delete(customers).where(eq(customers.isDemo, true)).returning({ id: customers.id });
    result.customers = cs.length;

    // Demo Competitor Intelligence. Space, solution, tag, document, link,
    // activity and account links cascade with the competitor;
    // project_competitors.space_id has no ON DELETE clause, so any project
    // row naming a demo space or competitor goes first.
    await tx.execute(sql`DELETE FROM project_competitors
      WHERE space_id IN (SELECT id FROM technology_spaces WHERE is_demo = true)
         OR competitor_id IN (SELECT id FROM competitors WHERE is_demo = true)`);
    const cmp = await tx.delete(competitors).where(eq(competitors.isDemo, true)).returning({ id: competitors.id });
    const tsp = await tx.delete(technologySpaces).where(eq(technologySpaces.isDemo, true)).returning({ id: technologySpaces.id });
    result.competitors = cmp.length + tsp.length;

    // The demo Validation Criteria library and its solutions go last: demo
    // requests (evaluation_request_products) point at them. Links first, then criteria before the components they
    // name, then the solutions.
    for (const statement of DEMO_LIBRARY_LINKS) await tx.execute(statement);
    const lc = await tx.delete(criteriaLibrary).where(eq(criteriaLibrary.isDemo, true)).returning({ id: criteriaLibrary.id });
    const lo = await tx.delete(expectedOutcomes).where(eq(expectedOutcomes.isDemo, true)).returning({ id: expectedOutcomes.id });
    const la = await tx.delete(actionItems).where(eq(actionItems.isDemo, true)).returning({ id: actionItems.id });
    const lv = await tx.delete(valueMappings).where(eq(valueMappings.isDemo, true)).returning({ id: valueMappings.id });
    const lcomp = await tx.delete(components).where(eq(components.isDemo, true)).returning({ id: components.id });
    result.libraryItems = lc.length + lo.length + la.length + lv.length + lcomp.length;
    const pr = await tx.delete(products).where(eq(products.isDemo, true)).returning({ id: products.id });
    result.products = pr.length;

    // Demo teams after the projects that name them. Subteams and team and
    // subteam memberships cascade (real people added to a demo team in a
    // demo session lose only that place).
    const tm = await tx.delete(teams).where(eq(teams.isDemo, true)).returning({ id: teams.id });
    result.teams = tm.length;

    // Pre/post non-demo count assertion. If a single production row
    // disappeared, throw and the transaction rolls back.
    for (const t of TAGGED_TABLES) {
      const after = await countNonDemo(tx, t);
      if (after !== before[t]) {
        throw new Error(
          `[demo-mode] WIPE ABORT — non-demo row count drifted on ${t}: ` +
          `before=${before[t]} after=${after}`,
        );
      }
    }

    return { result, documentFiles };
  });
}
