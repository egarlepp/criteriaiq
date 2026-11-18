// @vitest-environment node
//
// Regression coverage for archive ↔ restore round-trips on users,
// projects, and customers (Task #510).
//
// Why this exists: there were silent column-mirroring drifts between
// the source tables and their `archived_*` mirrors (Task #501 and the
// "Make archive bookkeeping columns consistent across archive tables"
// task) that went unnoticed for a long time because no automated test
// ever exercised the round-trip. If a new column lands on `projects`
// but never gets backfilled onto `archived_projects`, archiving a
// project silently drops the value; if the restore path strips a
// field, that data is gone for good. These tests construct a row,
// archive it, restore it, and assert that EVERY column on the source
// row survives the round-trip unchanged. That makes the next drift a
// red CI run instead of a future incident.
//
// The test uses the real Postgres pointed at by `DATABASE_URL`. If
// none is configured (e.g. on a local dev machine without a DB), the
// suite skips itself rather than failing — same posture as the rest
// of `server/__tests__/*` for any test that needs a live driver.

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db, dbReady } from "../db";
import { storage } from "../storage";
import { healthMonitor } from "../services/health-monitor";
import {
  users,
  projects,
  customers,
  successCriteria,
  activityLogs,
  customerAccess,
  projectAudits,
  archivedUsers,
  archivedProjects,
  archivedCustomers,
  archivedSuccessCriteria,
  archivedActivityLogs,
  archivedCustomerAccess,
  archivedProjectAudits,
  archiveLog,
  components,
  criteriaLibrary,
  expectedOutcomes,
  actionItems,
  valueMappings,
  validationCriteriaTemplates,
  products as productsTable,
  assumptionCategories,
  dependencyCategories,
  assumptions,
  dependencies,
  projectAssumptions,
  projectDependencies,
  emailLogs,
  emailRules,
  emailAutomationConfig,
  emailTemplates,
  emailDesigns,
  emailConfiguration,
  assessmentRulesets,
  riskCriteria,
  aiProviderConfigs,
  assessmentJobs,
  competitors,
  projectCompetitors,
  competitorDocuments,
  competitorActivity,
  mapPhases,
  mapSteps,
  mapTasks,
  mapTemplates,
  mapAssignmentOverrides,
  allowedDomains,
  accessCodes,
  domainAuditLog,
  accessCodeAuditLog,
  userAccounts,
  customReports,
  userReportFavorites,
  reportExecutions,
  dashboardLayouts,
  dashboardConfigs,
  webhooks,
  salesforceOauthConfig,
  salesforceFieldMappings,
  salesforceRecordLinks,
  salesforceSyncPolicies,
  flightDeckConfigs,
  flightDeckTips,
  projectGaps,
  projectGapLinks,
  projectOutcomes,
  outcomeConfig,
  supportRequests,
  systemAnnouncements,
  projectTemplates,
  endDateFlags,
  evaluationRequests,
  systemSettings,
  storageConfiguration,
  docsRepositoryConfigs,
  docsSyncSchedule,
  userBoardPreferences,
  kanbanAuditEvents,
  auditLogins,
  documents,
  links,
  codeScripts,
  infrastructureProfiles,
} from "@shared/schema";
import { and } from "drizzle-orm";

// Stable marker baked into every test row so cleanup can find anything
// the test left behind even if an assertion bailed out partway through.
// Cleanup matches LIKE 'archive-roundtrip-test-%' on the human-visible
// fields (email, customer_name, account_name) AND drops any archive_log
// rows the storage layer wrote on our behalf.
const TEST_MARKER = "archive-roundtrip-test";

// `archived_by` requires a non-null varchar; "system" gives us a stable,
// recognizable value in archive_log and the archived_* tables without
// having to fabricate a real user just to satisfy the column.
const ARCHIVER = "test-runner";

/**
 * Bag of column-name → value for one row. Used so the round-trip
 * assertion can iterate every column on the source table and compare
 * the restored value field-by-field. We deliberately avoid using
 * `expect(restored).toEqual(original)` directly because Postgres can
 * round-trip some types (e.g. timestamps) into different JS shapes
 * (Date vs string) and we want a column-by-column diff in the failure
 * message so a drift points at the offending column immediately.
 */
type RowRecord = Record<string, unknown>;

function normalize(value: unknown): unknown {
  // Dates → ISO so a Date round-tripped through Postgres compares
  // equal to the Date we originally inserted (drizzle returns Date,
  // Postgres stores microsecond-precision timestamp without TZ; both
  // sides serialize identically through toISOString).
  if (value instanceof Date) return value.toISOString();
  // pg returns numeric/decimal columns as strings to preserve
  // precision; the original we inserted was also a string. Nothing to
  // do, but documenting it here so the next reader doesn't get
  // surprised.
  return value;
}

function assertRowsMatchAllColumns(
  original: RowRecord,
  restored: RowRecord,
  ignoreColumns: ReadonlySet<string> = new Set(),
): void {
  const columns = Object.keys(original);
  for (const col of columns) {
    if (ignoreColumns.has(col)) continue;
    const originalValue = normalize(original[col]);
    const restoredValue = normalize(restored[col]);
    expect(
      restoredValue,
      `Column "${col}" did not survive archive→restore round-trip`,
    ).toEqual(originalValue);
  }
}

// Cleanup helper. Idempotent. Wipes everything this suite could have
// inserted, regardless of whether the round-trip completed or not.
async function cleanupTestData(): Promise<void> {
  if (!dbReady || !db) return;

  // archive_log rows the storage layer wrote on our behalf
  await db
    .delete(archiveLog)
    .where(sql`${archiveLog.archivedBy} = ${ARCHIVER}`);

  // Task #542 sweep tables — delete by TEST_MARKER prefix so
  // half-completed runs don't leak into the next. Children before
  // parents to satisfy FK ordering.
  await db
    .delete(reportExecutions)
    .where(sql`${reportExecutions.executedBy} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(userReportFavorites)
    .where(sql`${userReportFavorites.userId} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(customReports)
    .where(sql`${customReports.name} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(userBoardPreferences)
    .where(sql`${userBoardPreferences.userId} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(kanbanAuditEvents)
    .where(sql`${kanbanAuditEvents.userId} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(auditLogins)
    .where(sql`${auditLogins.userId} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(dashboardLayouts)
    .where(sql`${dashboardLayouts.name} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(dashboardConfigs)
    .where(sql`${dashboardConfigs.userId} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(webhooks)
    .where(sql`${webhooks.name} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(salesforceFieldMappings)
    .where(sql`${salesforceFieldMappings.cqiFieldKey} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(salesforceSyncPolicies)
    .where(sql`${salesforceSyncPolicies.entity} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(salesforceRecordLinks)
    .where(sql`${salesforceRecordLinks.cqiRecordId} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(salesforceOauthConfig)
    .where(sql`${salesforceOauthConfig.clientId} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(flightDeckTips)
    .where(sql`${flightDeckTips.tipText} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(flightDeckConfigs)
    .where(sql`${flightDeckConfigs.name} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(supportRequests)
    .where(sql`${supportRequests.title} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(systemAnnouncements)
    .where(sql`${systemAnnouncements.title} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(outcomeConfig)
    .where(sql`${outcomeConfig.updatedBy} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(projectTemplates)
    .where(sql`${projectTemplates.name} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(endDateFlags)
    .where(sql`${endDateFlags.name} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(systemSettings)
    .where(sql`${systemSettings.key} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(storageConfiguration)
    .where(sql`${storageConfiguration.createdBy} LIKE ${TEST_MARKER + "-%"} OR ${storageConfiguration.updatedBy} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(docsSyncSchedule)
    .where(sql`${docsSyncSchedule.configuredBy} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(docsRepositoryConfigs)
    .where(sql`${docsRepositoryConfigs.docsPath} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(competitorActivity)
    .where(sql`${competitorActivity.createdByUserId} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(competitorDocuments)
    .where(sql`${competitorDocuments.title} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(projectCompetitors)
    .where(sql`${projectCompetitors.ownerUserId} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(competitors)
    .where(sql`${competitors.slug} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(emailLogs)
    .where(sql`${emailLogs.subject} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(emailRules)
    .where(sql`${emailRules.name} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(emailAutomationConfig)
    .where(sql`${emailAutomationConfig.updatedBy} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(emailTemplates)
    .where(sql`${emailTemplates.templateKey} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(emailDesigns)
    .where(sql`${emailDesigns.name} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(emailConfiguration)
    .where(sql`${emailConfiguration.fromAddress} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(assessmentJobs)
    .where(sql`${assessmentJobs.triggeredBy} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(aiProviderConfigs)
    .where(sql`${aiProviderConfigs.displayName} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(riskCriteria)
    .where(sql`${riskCriteria.name} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(assessmentRulesets)
    .where(sql`${assessmentRulesets.name} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(projectDependencies)
    .where(sql`${projectDependencies.createdBy} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(projectAssumptions)
    .where(sql`${projectAssumptions.createdBy} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(dependencies)
    .where(sql`${dependencies.title} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(assumptions)
    .where(sql`${assumptions.title} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(dependencyCategories)
    .where(sql`${dependencyCategories.name} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(assumptionCategories)
    .where(sql`${assumptionCategories.name} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(domainAuditLog)
    .where(sql`${domainAuditLog.domain} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(accessCodeAuditLog)
    .where(sql`${accessCodeAuditLog.code} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(accessCodes)
    .where(sql`${accessCodes.code} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(allowedDomains)
    .where(sql`${allowedDomains.domain} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(userAccounts)
    .where(sql`${userAccounts.userId} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(mapAssignmentOverrides)
    .where(sql`${mapAssignmentOverrides.fieldName} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(mapTemplates)
    .where(sql`${mapTemplates.name} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(valueMappings)
    .where(sql`${valueMappings.name} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(actionItems)
    .where(sql`${actionItems.name} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(expectedOutcomes)
    .where(sql`${expectedOutcomes.name} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(criteriaLibrary)
    .where(sql`${criteriaLibrary.name} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(components)
    .where(sql`${components.name} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(validationCriteriaTemplates)
    .where(sql`${validationCriteriaTemplates.name} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(productsTable)
    .where(sql`${productsTable.name} LIKE ${TEST_MARKER + "-%"}`);

  // These reference customers/projects/users without cascade. Clean
  // them up before the existing customer / project / user deletes so
  // those don't fail with FK violations.
  await db
    .delete(evaluationRequests)
    .where(sql`${evaluationRequests.userId} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(documents)
    .where(sql`${documents.originalName} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(links)
    .where(sql`${links.name} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(codeScripts)
    .where(sql`${codeScripts.name} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(infrastructureProfiles)
    .where(sql`${infrastructureProfiles.profileName} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(projectGapLinks)
    .where(sql`${projectGapLinks.linkedBy} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(projectGaps)
    .where(sql`${projectGaps.gapName} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(projectOutcomes)
    .where(sql`${projectOutcomes.createdBy} LIKE ${TEST_MARKER + "-%"}`);

  // Per-project related rows on both the source and archive sides.
  // Resolve project ids by the test marker on customer_name on either
  // side, then drop every dependent row before the project itself —
  // success_criteria.project_id, activity_logs.project_id,
  // project_audits.project_id, and customer_access.project_id are all
  // NOT NULL, and several have FK constraints that would block the
  // parent delete otherwise.
  //
  // Project deletes still land before the user deletes below for
  // ordering safety. Task #527 dropped the engineer-id FKs and
  // Task #533 dropped the remaining `customer_user_id`,
  // `tcc_user_id`, and `created_by` FKs back to `users(id)`, so
  // there's no longer a hard FK dependency that would block the
  // user deletes — but keeping the project-first order means a
  // future column with a real FK won't silently break this
  // helper.
  const liveProjectIds = (
    await db
      .select({ id: projects.id })
      .from(projects)
      .where(sql`${projects.customerName} LIKE ${TEST_MARKER + "-%"}`)
  ).map((r) => r.id);
  const archivedProjectIds = (
    await db
      .select({ id: archivedProjects.id })
      .from(archivedProjects)
      .where(sql`${archivedProjects.customerName} LIKE ${TEST_MARKER + "-%"}`)
  ).map((r) => r.id);
  const allProjectIds = Array.from(
    new Set([...liveProjectIds, ...archivedProjectIds]),
  );

  if (allProjectIds.length > 0) {
    // Source-side dependents
    await db
      .delete(projectAudits)
      .where(sql`${projectAudits.projectId} IN ${allProjectIds}`);
    await db
      .delete(customerAccess)
      .where(sql`${customerAccess.projectId} IN ${allProjectIds}`);
    await db
      .delete(activityLogs)
      .where(sql`${activityLogs.projectId} IN ${allProjectIds}`);
    await db
      .delete(successCriteria)
      .where(sql`${successCriteria.projectId} IN ${allProjectIds}`);
    // Archive-side dependents
    await db
      .delete(archivedSuccessCriteria)
      .where(sql`${archivedSuccessCriteria.projectId} IN ${allProjectIds}`);
    await db
      .delete(archivedActivityLogs)
      .where(sql`${archivedActivityLogs.projectId} IN ${allProjectIds}`);
    await db
      .delete(archivedCustomerAccess)
      .where(sql`${archivedCustomerAccess.projectId} IN ${allProjectIds}`);
    await db
      .delete(archivedProjectAudits)
      .where(sql`${archivedProjectAudits.projectId} IN ${allProjectIds}`);
  }

  // Now the parents themselves — projects and their archive mirrors.
  await db
    .delete(archivedProjects)
    .where(sql`${archivedProjects.customerName} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(projects)
    .where(sql`${projects.customerName} LIKE ${TEST_MARKER + "-%"}`);

  // archived_users / users by email marker
  await db
    .delete(archivedUsers)
    .where(sql`${archivedUsers.email} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(users)
    .where(sql`${users.email} LIKE ${TEST_MARKER + "-%"}`);

  // archived_customers / customers by account_name marker
  await db
    .delete(archivedCustomers)
    .where(sql`${archivedCustomers.accountName} LIKE ${TEST_MARKER + "-%"}`);
  await db
    .delete(customers)
    .where(sql`${customers.accountName} LIKE ${TEST_MARKER + "-%"}`);
}

describe.skipIf(!process.env.DATABASE_URL)(
  "archive ↔ restore round-trip",
  () => {
    beforeAll(async () => {
      await cleanupTestData();
    });

    afterEach(async () => {
      await cleanupTestData();
    });

    afterAll(async () => {
      await cleanupTestData();
    });

    describe("users", () => {
      it(
        "archiveUser → restoreUser preserves every source column",
        async () => {
          const id = `${TEST_MARKER}-user-${randomUUID()}`;
          const email = `${TEST_MARKER}-${randomUUID()}@example.com`;

          // Populate every nullable / defaulted column with a
          // distinctive non-default value so a column that gets
          // silently dropped on the round-trip shows up as a diff
          // instead of accidentally matching the schema default.
          const now = new Date("2025-06-15T12:34:56.000Z");
          await db.insert(users).values({
            id,
            email,
            password: "hashed-password",
            firstName: "Round",
            lastName: "Trip",
            profileImageUrl: "https://example.com/avatar.png",
            allAccountsAccess: true,
            title: "Senior Test Engineer",
            region: "AMER",
            role: "admin",
            department: "Engineering",
            stakeholderTypes: ["Technical Champion", "IT Admin"],
            specialties: ["Postgres", "Drizzle"],
            isApproved: true,
            approvedBy: "approver-id",
            approvedAt: now,
            isActive: true,
            timezone: "America/Los_Angeles",
            preferredLocale: "en-GB",
            theme: "dark",
            sidebarCollapsed: true,
            loginCount: 42,
            lastLogin: now,
            createdBy: "system",
            createdAt: now,
            updatedAt: now,
            receiveEmails: false,
            mfaEnabled: true,
            mfaMethod: "totp",
            totpSecretEnc: "enc:abc123",
            mfaEnrolledAt: now,
            securitySetupRequired: false,
            managerId: "manager-id",
            isProtected: false,
            sfAccessToken: "sf-access",
            sfRefreshToken: "sf-refresh",
            sfInstanceUrl: "https://example.my.salesforce.com",
            sfConnectedAt: now,
            showFlightDeck: false,
            flightDeckLastShownAt: now,
            skipWelcomeEmail: true,
            forcePasswordChange: true,
            passwordHistory: ["hash-1", "hash-2"],
            // accountId / lastAccessedProjectId left null on purpose —
            // they have FK constraints into customers/projects and
            // setting them would force the test to spin up extra
            // fixtures that aren't relevant to the round-trip claim.
          });

          const [original] = await db
            .select()
            .from(users)
            .where(eq(users.id, id));
          expect(original).toBeDefined();

          const archived = await storage.archiveUser(
            id,
            ARCHIVER,
            "round-trip test",
          );
          expect(archived).toBe(true);

          // Source row must be gone after archive.
          const sourceAfterArchive = await db
            .select()
            .from(users)
            .where(eq(users.id, id));
          expect(sourceAfterArchive).toHaveLength(0);

          // Archive row must exist with the bookkeeping fields set.
          const [archivedRow] = await db
            .select()
            .from(archivedUsers)
            .where(eq(archivedUsers.id, id));
          expect(archivedRow).toBeDefined();
          expect(archivedRow!.archivedBy).toBe(ARCHIVER);
          expect(archivedRow!.archivedReason).toBe("round-trip test");

          // archive_log must contain a 'user' entry for this id —
          // catches a regression where the storage layer stops
          // writing the audit trail without breaking the round-trip
          // itself.
          const logRows = await db
            .select()
            .from(archiveLog)
            .where(
              and(eq(archiveLog.entityType, "user"), eq(archiveLog.entityId, id)),
            );
          expect(logRows).toHaveLength(1);
          expect(logRows[0]!.archivedBy).toBe(ARCHIVER);
          expect(logRows[0]!.reason).toBe("round-trip test");

          const restored = await storage.restoreUser(id, ARCHIVER);
          expect(restored).toBe(true);

          // Archive row must be gone after restore.
          const archiveAfterRestore = await db
            .select()
            .from(archivedUsers)
            .where(eq(archivedUsers.id, id));
          expect(archiveAfterRestore).toHaveLength(0);

          const [restoredRow] = await db
            .select()
            .from(users)
            .where(eq(users.id, id));
          expect(restoredRow).toBeDefined();

          assertRowsMatchAllColumns(
            original as unknown as RowRecord,
            restoredRow as unknown as RowRecord,
          );
        },
        20_000,
      );

      it(
        "restoreUser swaps the (D) placeholder back to the user id on every project they used to own (firstName + lastName placeholder)",
        async () => {
          // Verify the round-trip for a user with a first AND last
          // name set, which makes archiveUser stamp the
          // `"First Last (D)"` placeholder into the engineer slots.
          // The fix-under-test is restoreUser scanning for that
          // placeholder and swapping it back to the user's id —
          // without this, every project the user used to own keeps
          // showing the garbled string instead of a valid user id,
          // breaking ownership lookups, dropdowns, and engineer-id
          // filters across the app.
          //
          // Historical note (Task #527): `projects.primary_engineer_id`
          // and `projects.specialist_engineer_id` USED to carry FK
          // constraints back to `users.id`, which made archiveUser's
          // placeholder UPDATE fail with `projects_primary_engineer_id_users_id_fk`
          // and rolled back the entire archive transaction — meaning
          // any user actually referenced as a primary or specialist
          // engineer simply could not be archived. Earlier revisions
          // of this test sidestepped that by pre-creating a "stand-in"
          // user whose id IS the placeholder string. The FKs have
          // since been dropped (the schema definition makes these
          // soft references, matching how `account_representative_id`
          // and the `supporting_engineers` text[] already work), so
          // the stand-in is gone and this test exercises the real
          // production path.
          const userId = `${TEST_MARKER}-user-${randomUUID()}`;
          const email = `${TEST_MARKER}-${randomUUID()}@example.com`;
          const firstName = "Engineer";
          const lastName = `RT-${randomUUID().slice(0, 8)}`;
          // The literal placeholder shape archiveUser writes when
          // the user has both a first and last name. Hardcoding it
          // here (instead of recomputing it the same way the
          // production code does) is intentional: if someone changes
          // the placeholder format in archiveUser without updating
          // restoreUser, this test should fail.
          const expectedPlaceholder = `${firstName} ${lastName} (D)`;
          // A second supporting-engineer id that has nothing to do
          // with the archived user — proves restoreUser only touches
          // the placeholder slot and leaves the rest of the array
          // (and its ordering) alone.
          const otherEngineerId = `${TEST_MARKER}-other-${randomUUID()}`;
          const customerName = `${TEST_MARKER}-${randomUUID()}`;

          await db.insert(users).values({
            id: userId,
            email,
            firstName,
            lastName,
            isApproved: true,
            isActive: true,
          });

          // Co-seed the "other" supporting engineer so the
          // supportingEngineers array carries two real ids before
          // archive — the test then asserts archive replaced ONE of
          // them with the placeholder and restore replaced that
          // placeholder back to the original id, preserving the
          // other entry in place.
          await db.insert(users).values({
            id: otherEngineerId,
            email: `${TEST_MARKER}-other-${randomUUID()}@example.com`,
            firstName: "Other",
            lastName: "Engineer",
            isApproved: true,
            isActive: true,
          });

          const inserted = await db
            .insert(projects)
            .values({
              name: "Restore-Engineer-Slots Project",
              customerName,
              // solution_name and salesforce_evaluation_link are
              // NOT NULL on the live projects table; supply
              // throwaway values so the insert succeeds — the test
              // only cares about the engineer-id columns.
              solutionName: "restore-engineer-slots",
              salesforceEvaluationLink: "https://sf.example.com/opp/restore",
              primaryEngineerId: userId,
              specialistEngineerId: userId,
              supportingEngineers: [userId, otherEngineerId],
            })
            .returning();
          const projectId = inserted[0]!.id;

          const archived = await storage.archiveUser(
            userId,
            ARCHIVER,
            "engineer-slot restore test",
          );
          expect(archived).toBe(true);

          // Sanity: archive should have stamped the placeholder
          // into all three engineer slots. If this assertion fails,
          // the bug under test is no longer about restore — it's
          // that archive no longer behaves the way restore is
          // expected to undo.
          const [afterArchive] = await db
            .select()
            .from(projects)
            .where(eq(projects.id, projectId));
          expect(afterArchive!.primaryEngineerId).toBe(expectedPlaceholder);
          expect(afterArchive!.specialistEngineerId).toBe(expectedPlaceholder);
          expect(afterArchive!.supportingEngineers).toEqual(
            expect.arrayContaining([expectedPlaceholder, otherEngineerId]),
          );
          expect(afterArchive!.supportingEngineers).toHaveLength(2);

          const restored = await storage.restoreUser(userId, ARCHIVER);
          expect(restored).toBe(true);

          const [afterRestore] = await db
            .select()
            .from(projects)
            .where(eq(projects.id, projectId));
          expect(afterRestore!.primaryEngineerId).toBe(userId);
          expect(afterRestore!.specialistEngineerId).toBe(userId);
          expect(afterRestore!.supportingEngineers).toEqual(
            expect.arrayContaining([userId, otherEngineerId]),
          );
          expect(afterRestore!.supportingEngineers).toHaveLength(2);
          // The placeholder must NOT survive anywhere in the array
          // — array_replace should have swapped it out, not merely
          // appended the user id alongside it.
          expect(afterRestore!.supportingEngineers).not.toContain(
            expectedPlaceholder,
          );
        },
        20_000,
      );

      it(
        "restoreUser swaps the email-only (D) placeholder back to the user id when the user has no name",
        async () => {
          // Mirror of the test above but for users who have no
          // firstName / lastName set. archiveUser falls back to
          // `"<email> (D)"` for the placeholder in that case, and
          // restoreUser must use the same fallback to find the
          // placeholder slots and swap them back.
          //
          // Like the firstName+lastName variant, this used to need a
          // stand-in user (id = email-form placeholder) to satisfy the
          // engineer-id FK constraints — Task #527 dropped those FKs,
          // so the workaround is gone.
          const userId = `${TEST_MARKER}-noname-${randomUUID()}`;
          const email = `${TEST_MARKER}-noname-${randomUUID()}@example.com`;
          const expectedPlaceholder = `${email} (D)`;
          const otherEngineerId = `${TEST_MARKER}-other-${randomUUID()}`;
          const customerName = `${TEST_MARKER}-${randomUUID()}`;

          await db.insert(users).values({
            id: userId,
            email,
            // firstName / lastName intentionally omitted — that's
            // the whole point of this test variant.
            isApproved: true,
            isActive: true,
          });

          await db.insert(users).values({
            id: otherEngineerId,
            email: `${TEST_MARKER}-other-${randomUUID()}@example.com`,
            firstName: "Other",
            lastName: "Engineer",
            isApproved: true,
            isActive: true,
          });

          const inserted = await db
            .insert(projects)
            .values({
              name: "Restore-Engineer-Slots Email-Placeholder Project",
              customerName,
              solutionName: "restore-engineer-slots-email",
              salesforceEvaluationLink:
                "https://sf.example.com/opp/restore-email",
              primaryEngineerId: userId,
              specialistEngineerId: userId,
              supportingEngineers: [userId, otherEngineerId],
            })
            .returning();
          const projectId = inserted[0]!.id;

          const archived = await storage.archiveUser(
            userId,
            ARCHIVER,
            "engineer-slot restore email-placeholder test",
          );
          expect(archived).toBe(true);

          const [afterArchive] = await db
            .select()
            .from(projects)
            .where(eq(projects.id, projectId));
          expect(afterArchive!.primaryEngineerId).toBe(expectedPlaceholder);
          expect(afterArchive!.specialistEngineerId).toBe(expectedPlaceholder);
          expect(afterArchive!.supportingEngineers).toEqual(
            expect.arrayContaining([expectedPlaceholder, otherEngineerId]),
          );

          const restored = await storage.restoreUser(userId, ARCHIVER);
          expect(restored).toBe(true);

          const [afterRestore] = await db
            .select()
            .from(projects)
            .where(eq(projects.id, projectId));
          expect(afterRestore!.primaryEngineerId).toBe(userId);
          expect(afterRestore!.specialistEngineerId).toBe(userId);
          expect(afterRestore!.supportingEngineers).toEqual(
            expect.arrayContaining([userId, otherEngineerId]),
          );
          expect(afterRestore!.supportingEngineers).toHaveLength(2);
          expect(afterRestore!.supportingEngineers).not.toContain(
            expectedPlaceholder,
          );
        },
        20_000,
      );

      it(
        "archiveUser → restoreUser swaps the (D) placeholder back to the user id on customer_user_id, tcc_user_id, and created_by",
        async () => {
          // Regression coverage for Task #533: `projects` carries
          // three additional user-id columns beyond the engineer
          // slots (`customer_user_id`, `tcc_user_id`, `created_by`)
          // that USED to hold FK constraints back to `users(id)`.
          // `archiveUser` did not clear them, so the final
          // `DELETE FROM users` inside the archive transaction
          // tripped whichever FK still referenced the row and
          // rolled back the entire archive — same shape as the
          // engineer-slot FK crash Task #527 fixed earlier.
          //
          // The fix mirrors the engineer-slot treatment: the FKs
          // were dropped (migration `035_drop_more_user_fks_on_projects.sql`
          // / schema cleanup in `shared/schema/projects.ts`),
          // `archiveUser` now stamps the same `"First Last (D)"`
          // placeholder string into all three slots, and
          // `restoreUser` swaps that placeholder back to the real
          // user id on restore. This test exercises the round-trip
          // without any FK-drop or stand-in workaround in the test
          // body itself — the archive must succeed against a real
          // project that holds the user id in every one of those
          // slots, and restore must replace the placeholder with
          // the original user id.
          const userId = `${TEST_MARKER}-user-${randomUUID()}`;
          const email = `${TEST_MARKER}-${randomUUID()}@example.com`;
          const firstName = "Slot";
          const lastName = `RT-${randomUUID().slice(0, 8)}`;
          const expectedPlaceholder = `${firstName} ${lastName} (D)`;
          const customerName = `${TEST_MARKER}-${randomUUID()}`;

          await db.insert(users).values({
            id: userId,
            email,
            firstName,
            lastName,
            isApproved: true,
            isActive: true,
          });

          const inserted = await db
            .insert(projects)
            .values({
              name: "Restore-Other-User-Slots Project",
              customerName,
              solutionName: "restore-other-user-slots",
              salesforceEvaluationLink:
                "https://sf.example.com/opp/restore-other-slots",
              // Park the same user id in every slot under test so
              // a single round-trip exercises archive + restore
              // for all three columns at once.
              customerUserId: userId,
              tccUserId: userId,
              createdBy: userId,
            })
            .returning();
          const projectId = inserted[0]!.id;

          // Archive must succeed — without the Task #533 sweep
          // this throws an FK violation and rolls back the whole
          // transaction. `expect(archived).toBe(true)` is the
          // primary regression assertion.
          const archived = await storage.archiveUser(
            userId,
            ARCHIVER,
            "other-user-slot restore test",
          );
          expect(archived).toBe(true);

          // Sanity: archive should have stamped the placeholder
          // into all three slots. If this assertion fails, the
          // bug under test is no longer about restore — it's that
          // archive no longer behaves the way restore is expected
          // to undo.
          const [afterArchive] = await db
            .select()
            .from(projects)
            .where(eq(projects.id, projectId));
          expect(afterArchive!.customerUserId).toBe(expectedPlaceholder);
          expect(afterArchive!.tccUserId).toBe(expectedPlaceholder);
          expect(afterArchive!.createdBy).toBe(expectedPlaceholder);

          // The user row itself must be gone after archive — same
          // contract the round-trip suite asserts above for the
          // base user case.
          const sourceAfterArchive = await db
            .select()
            .from(users)
            .where(eq(users.id, userId));
          expect(sourceAfterArchive).toHaveLength(0);

          const restored = await storage.restoreUser(userId, ARCHIVER);
          expect(restored).toBe(true);

          // After restore, every slot must hold the original user
          // id again — not the placeholder, and not null.
          const [afterRestore] = await db
            .select()
            .from(projects)
            .where(eq(projects.id, projectId));
          expect(afterRestore!.customerUserId).toBe(userId);
          expect(afterRestore!.tccUserId).toBe(userId);
          expect(afterRestore!.createdBy).toBe(userId);
        },
        20_000,
      );

      it(
        "archiveUser succeeds when the user is referenced from many other tables (Task #542 sweep)",
        async () => {
          // Regression for Task #542. Seeds a row in every table the
          // sweep touches, then asserts archiveUser succeeds. If a new
          // user FK is added without updating the sweep, this test
          // will fail with a 23503 violation.
          const userId = `${TEST_MARKER}-user-${randomUUID()}`;
          const email = `${TEST_MARKER}-${randomUUID()}@example.com`;
          const customerName = `${TEST_MARKER}-${randomUUID()}`;
          const accountName = `${TEST_MARKER}-${randomUUID()}`;
          const productName = `${TEST_MARKER}-${randomUUID()}`;
          const competitorSlug = `${TEST_MARKER}-${randomUUID()}`;

          // ------------------------------------------------------------
          // Seed: base user, customer, project, product. Everything
          // else hangs off these.
          // ------------------------------------------------------------
          await db.insert(users).values({
            id: userId,
            email,
            firstName: "Sweep",
            lastName: `Test-${randomUUID().slice(0, 8)}`,
            isApproved: true,
            isActive: true,
          });

          const [customer] = await db
            .insert(customers)
            .values({ accountName })
            .returning();
          const customerId = customer!.id;

          const [project] = await db
            .insert(projects)
            .values({
              name: `${TEST_MARKER}-Sweep Project`,
              customerName,
              solutionName: "task-542-sweep",
              salesforceEvaluationLink:
                "https://sf.example.com/opp/sweep-test",
            })
            .returning();
          const projectId = project!.id;

          const [product] = await db
            .insert(productsTable)
            .values({
              name: productName,
              createdBy: userId,
              updatedBy: userId,
            })
            .returning();
          const productId = product!.id;

          // ------------------------------------------------------------
          // Seed: products / catalog (nullable createdBy/updatedBy)
          // ------------------------------------------------------------
          const [component] = await db
            .insert(components)
            .values({
              name: `${TEST_MARKER}-component`,
              solutionId: productId,
              createdBy: userId,
              updatedBy: userId,
            })
            .returning();
          await db.insert(criteriaLibrary).values({
            name: `${TEST_MARKER}-criterion`,
            createdBy: userId,
            updatedBy: userId,
          });
          await db.insert(expectedOutcomes).values({
            name: `${TEST_MARKER}-outcome`,
            createdBy: userId,
            updatedBy: userId,
          });
          await db.insert(actionItems).values({
            name: `${TEST_MARKER}-action`,
            createdBy: userId,
            updatedBy: userId,
          });
          await db.insert(valueMappings).values({
            name: `${TEST_MARKER}-value-map`,
            createdBy: userId,
            updatedBy: userId,
          });
          // validationCriteriaTemplates: createdBy is NOT NULL with FK
          // dropped (soft ref); updatedBy is nullable.
          await db.insert(validationCriteriaTemplates).values({
            name: `${TEST_MARKER}-vct`,
            createdBy: userId,
            updatedBy: userId,
          });

          // ------------------------------------------------------------
          // Seed: assumptions / dependencies
          // ------------------------------------------------------------
          const [assumptionCat] = await db
            .insert(assumptionCategories)
            .values({
              name: `${TEST_MARKER}-acat`,
              createdBy: userId,
              updatedBy: userId,
            })
            .returning();
          const [dependencyCat] = await db
            .insert(dependencyCategories)
            .values({
              name: `${TEST_MARKER}-dcat`,
              createdBy: userId,
              updatedBy: userId,
            })
            .returning();
          const [assumption] = await db
            .insert(assumptions)
            .values({
              title: `${TEST_MARKER}-assumption`,
              categoryId: assumptionCat!.id,
              createdBy: userId,
              updatedBy: userId,
            })
            .returning();
          const [dependency] = await db
            .insert(dependencies)
            .values({
              title: `${TEST_MARKER}-dependency`,
              categoryId: dependencyCat!.id,
              createdBy: userId,
              updatedBy: userId,
            })
            .returning();
          await db.insert(projectAssumptions).values({
            assumptionId: assumption!.id,
            projectId,
            createdBy: userId,
            updatedBy: userId,
          });
          await db.insert(projectDependencies).values({
            dependencyId: dependency!.id,
            projectId,
            createdBy: userId,
            updatedBy: userId,
          });

          // ------------------------------------------------------------
          // Seed: email tables
          // ------------------------------------------------------------
          await db.insert(emailLogs).values({
            toEmail: "to@example.com",
            fromEmail: "from@example.com",
            subject: `${TEST_MARKER}-subject`,
            userId,
          });
          await db.insert(emailRules).values({
            name: `${TEST_MARKER}-rule`,
            triggerKeys: [],
            createdBy: userId,
            updatedBy: userId,
          });
          await db.insert(emailAutomationConfig).values({
            updatedBy: userId,
          });
          await db.insert(emailTemplates).values({
            name: `${TEST_MARKER}-template`,
            templateKey: `${TEST_MARKER}-tmpl-${randomUUID()}`,
            category: "general",
            emailType: "general",
            subject: "Subject",
            recipientType: "user",
            createdBy: userId,
            updatedBy: userId,
          });
          await db.insert(emailDesigns).values({
            name: `${TEST_MARKER}-design`,
            htmlRaw: "<html></html>",
            createdBy: userId,
          });
          await db.insert(emailConfiguration).values({
            provider: "smtp",
            server: "smtp.example.com",
            fromAddress: `${TEST_MARKER}-from@example.com`,
            username: "u",
            password: "p",
            createdBy: userId,
            updatedBy: userId,
          });

          // ------------------------------------------------------------
          // Seed: ai tables
          // ------------------------------------------------------------
          await db.insert(assessmentRulesets).values({
            name: `${TEST_MARKER}-ruleset`,
            category: "default",
            createdBy: userId,
          });
          await db.insert(riskCriteria).values({
            name: `${TEST_MARKER}-risk-criterion`,
            category: "default",
            createdBy: userId,
          });
          await db.insert(aiProviderConfigs).values({
            provider: "openai",
            displayName: `${TEST_MARKER}-ai`,
            apiKey: "sk-test",
            createdBy: userId,
          });
          await db.insert(assessmentJobs).values({
            triggeredBy: userId,
          });

          // ------------------------------------------------------------
          // Seed: competitors
          // ------------------------------------------------------------
          const [competitor] = await db
            .insert(competitors)
            .values({
              name: `${TEST_MARKER}-competitor`,
              slug: competitorSlug,
              createdByUserId: userId,
              reviewedByUserId: userId,
            })
            .returning();
          await db.insert(projectCompetitors).values({
            projectId,
            competitorId: competitor!.id,
            ownerUserId: userId,
          });
          await db.insert(competitorDocuments).values({
            competitorId: competitor!.id,
            title: `${TEST_MARKER}-comp-doc`,
            createdByUserId: userId,
          });
          await db.insert(competitorActivity).values({
            competitorId: competitor!.id,
            createdByUserId: userId,
          });

          // ------------------------------------------------------------
          // Seed: map (phases / steps / tasks / templates / overrides)
          // ------------------------------------------------------------
          const [phase] = await db
            .insert(mapPhases)
            .values({
              projectId,
              name: `${TEST_MARKER}-phase`,
              assignedToCustomerUserId: userId,
              assignedToUserId: userId,
              additionalInternalUserId: userId,
            })
            .returning();
          const [step] = await db
            .insert(mapSteps)
            .values({
              projectId,
              phaseId: phase!.id,
              name: `${TEST_MARKER}-step`,
              assignedToCustomerUserId: userId,
              assignedToUserId: userId,
              additionalInternalUserId: userId,
            })
            .returning();
          await db.insert(mapTasks).values({
            projectId,
            phaseId: phase!.id,
            stepId: step!.id,
            name: `${TEST_MARKER}-task`,
            assignedToCustomerUserId: userId,
            assignedToUserId: userId,
            additionalInternalUserId: userId,
          });
          await db.insert(mapTemplates).values({
            name: `${TEST_MARKER}-map-template`,
            createdByUserId: userId,
            updatedByUserId: userId,
          });
          await db.insert(mapAssignmentOverrides).values({
            projectId,
            entityType: "phase",
            entityId: phase!.id,
            fieldName: `${TEST_MARKER}-field`,
            overriddenByUserId: userId,
          });

          // ------------------------------------------------------------
          // Seed: access-control
          // ------------------------------------------------------------
          await db.insert(allowedDomains).values({
            domain: `${TEST_MARKER}-${randomUUID()}.example.com`,
            addedBy: userId,
          });
          await db.insert(accessCodes).values({
            code: `${TEST_MARKER}-${randomUUID().slice(0, 20)}`,
            createdBy: userId,
          });
          await db.insert(domainAuditLog).values({
            domain: `${TEST_MARKER}-audit.example.com`,
            action: "added",
            performedBy: userId,
          });
          await db.insert(accessCodeAuditLog).values({
            code: `${TEST_MARKER}-audit-code`,
            action: "created",
            performedBy: userId,
          });

          // ------------------------------------------------------------
          // Seed: auth (userAccounts.createdBy is nullable)
          // ------------------------------------------------------------
          await db.insert(userAccounts).values({
            userId,
            accountId: customerId,
            createdBy: userId,
          });
          await db.insert(auditLogins).values({
            userId,
            userEmail: email,
            userName: "Sweep Test",
          });

          // ------------------------------------------------------------
          // Seed: dashboard
          // ------------------------------------------------------------
          const [report] = await db
            .insert(customReports)
            .values({
              name: `${TEST_MARKER}-report`,
              reportType: "table",
              dataSource: "projects",
              selectedFields: [],
              createdBy: userId,
            })
            .returning();
          await db.insert(userReportFavorites).values({
            userId,
            reportId: report!.id,
            reportType: "custom",
          });
          await db.insert(reportExecutions).values({
            reportId: report!.id,
            executedBy: userId,
          });
          await db.insert(dashboardLayouts).values({
            name: `${TEST_MARKER}-layout`,
            layoutConfig: {},
            userId,
            createdBy: userId,
          });
          await db.insert(dashboardConfigs).values({
            userId,
            config: {},
          });
          await db.insert(userBoardPreferences).values({
            userId,
            dimension: `dim-${randomUUID()}`,
            columnOrder: [],
          });
          await db.insert(kanbanAuditEvents).values({
            userId,
            eventType: "moved",
          });

          // ------------------------------------------------------------
          // Seed: misc
          // ------------------------------------------------------------
          await db.insert(webhooks).values({
            name: `${TEST_MARKER}-webhook`,
            serviceType: "slack",
            endpointUrl: "https://example.com/hook",
            template: {},
            createdBy: userId,
            updatedBy: userId,
          });
          await db.insert(salesforceOauthConfig).values({
            clientId: `${TEST_MARKER}-${randomUUID()}`,
            clientSecret: "secret",
            createdBy: userId,
            updatedBy: userId,
          });
          await db.insert(salesforceFieldMappings).values({
            cqiEntity: "project",
            cqiFieldKey: `${TEST_MARKER}-${randomUUID()}`,
            cqiFieldLabel: "F",
            cqiFieldType: "text",
            sfObjectApiName: "Opportunity",
            sfFieldApiName: "F__c",
            sfFieldType: "text",
            customerId,
            createdBy: userId,
            updatedBy: userId,
          });
          await db.insert(salesforceRecordLinks).values({
            cqiEntityType: "project",
            cqiRecordId: `${TEST_MARKER}-${randomUUID()}`,
            sfObjectType: "Opportunity",
            sfRecordId: "0061234567890ABCDE",
            customerId,
            linkedBy: userId,
          });
          await db.insert(salesforceSyncPolicies).values({
            entity: `${TEST_MARKER}-${randomUUID()}`,
            sfObject: "Opportunity",
            customerId,
            createdBy: userId,
            updatedBy: userId,
          });
          await db.insert(flightDeckConfigs).values({
            name: `${TEST_MARKER}-fd-config`,
            createdBy: userId,
          });
          await db.insert(flightDeckTips).values({
            tipText: `${TEST_MARKER}-tip`,
            createdBy: userId,
          });
          const [gap] = await db
            .insert(projectGaps)
            .values({
              gapName: `${TEST_MARKER}-gap`,
              projectId,
              customerId,
              impactedSolution: "any",
              gapType: "feature",
              description: "test",
              status: "open",
              criticality: "low",
              reportedBy: userId,
            })
            .returning();
          await db.insert(projectGapLinks).values({
            gapId: gap!.id,
            projectId,
            linkedBy: userId,
          });
          await db.insert(projectOutcomes).values({
            projectId,
            outcomeType: "won",
            primaryReasonCode: "test",
            createdBy: userId,
          });
          await db.insert(outcomeConfig).values({
            updatedBy: userId,
          });
          await db.insert(supportRequests).values({
            type: "issue",
            title: `${TEST_MARKER}-support-req`,
            description: "test",
            applicationPage: "/test",
            submittedByUserId: userId,
            assignedToUserId: userId,
            submittedByName: "Sweep Test",
            submittedByEmail: email,
          });
          await db.insert(systemAnnouncements).values({
            title: `${TEST_MARKER}-announcement`,
            content: "Hello",
            startDate: new Date(),
            createdBy: userId,
          });

          // ------------------------------------------------------------
          // Seed: projects.ts (templates / endDateFlags / evaluation)
          // ------------------------------------------------------------
          await db.insert(projectTemplates).values({
            id: `${TEST_MARKER}-${randomUUID()}`,
            name: `${TEST_MARKER}-template`,
            createdBy: userId,
            updatedBy: userId,
          });
          await db.insert(endDateFlags).values({
            name: `${TEST_MARKER}-flag`,
            badgeText: "X",
            triggerType: "days_until_end",
            triggerValue: 7,
            createdBy: userId,
          });
          await db.insert(evaluationRequests).values({
            userId,
            customerId,
            startDate: new Date(),
            endDate: new Date(),
            topReasons: "x",
            compellingEvent: "y",
          });
          await db.insert(activityLogs).values({
            projectId,
            userId,
            userEmail: email,
            userName: "Sweep Test",
            action: "created",
          });
          await db.insert(projectAudits).values({
            projectId,
            userId,
            userEmail: email,
            userName: "Sweep Test",
            fieldName: "name",
            changeType: "update",
          });

          // ------------------------------------------------------------
          // Seed: config (singleton-style settings)
          // ------------------------------------------------------------
          await db.insert(systemSettings).values({
            key: `${TEST_MARKER}-${randomUUID()}`,
            value: {},
            updatedBy: userId,
          });
          // storage_configuration is a singleton; clear leftovers from
          // prior runs whose created_by/updated_by were NULL'd by
          // archive (and thus invisible to marker-based cleanup).
          await db.delete(storageConfiguration);
          await db.insert(storageConfiguration).values({
            createdBy: userId,
            updatedBy: userId,
          });

          // ------------------------------------------------------------
          // Seed: docs
          // ------------------------------------------------------------
          const [docsRepo] = await db
            .insert(docsRepositoryConfigs)
            .values({
              productId,
              docsPath: `${TEST_MARKER}-${randomUUID()}`,
              createdBy: userId,
            })
            .returning();
          await db.insert(docsSyncSchedule).values({
            configuredBy: userId,
          });

          // ------------------------------------------------------------
          // Seed: customers.ts NOT NULL columns (FK dropped, soft ref)
          // ------------------------------------------------------------
          await db.insert(infrastructureProfiles).values({
            customerId,
            profileName: `${TEST_MARKER}-infra`,
            createdBy: userId,
          });
          await db.insert(documents).values({
            originalName: `${TEST_MARKER}-doc.txt`,
            givenName: "doc.txt",
            fileName: "doc.txt",
            mimeType: "text/plain",
            fileSize: 1,
            uploadedByUserId: userId,
            customerId,
            owner: "test",
            ownerId: userId,
            storedPath: `/tmp/${TEST_MARKER}-doc.txt`,
          });
          await db.insert(links).values({
            name: `${TEST_MARKER}-link`,
            linkType: "external",
            url: "https://example.com",
            owner: "test",
            ownerId: userId,
          });
          await db.insert(codeScripts).values({
            name: `${TEST_MARKER}-script`,
            scriptType: "bash",
            content: "echo hi",
            owner: "test",
            ownerId: userId,
          });

          // ------------------------------------------------------------
          // Archive — this is the regression assertion. Without the
          // sweep it throws an FK violation and aborts.
          // ------------------------------------------------------------
          const archived = await storage.archiveUser(
            userId,
            ARCHIVER,
            "task-542 sweep regression",
          );
          expect(archived).toBe(true);

          // The user row itself must be gone.
          const sourceAfter = await db
            .select()
            .from(users)
            .where(eq(users.id, userId));
          expect(sourceAfter).toHaveLength(0);

          // Spot-check nullable columns are NULL on a sample of the
          // sweep-touched tables. If any of these come back !== null
          // it means the sweep is missing a column.
          const [productAfter] = await db
            .select()
            .from(productsTable)
            .where(eq(productsTable.id, productId));
          expect(productAfter!.createdBy).toBeNull();
          expect(productAfter!.updatedBy).toBeNull();
          const [emailLogAfter] = await db
            .select()
            .from(emailLogs)
            .where(sql`${emailLogs.subject} = ${`${TEST_MARKER}-subject`}`);
          expect(emailLogAfter!.userId).toBeNull();
          const [competitorAfter] = await db
            .select()
            .from(competitors)
            .where(eq(competitors.id, competitor!.id));
          expect(competitorAfter!.createdByUserId).toBeNull();
          expect(competitorAfter!.reviewedByUserId).toBeNull();
          const [phaseAfter] = await db
            .select()
            .from(mapPhases)
            .where(eq(mapPhases.id, phase!.id));
          expect(phaseAfter!.assignedToUserId).toBeNull();
          expect(phaseAfter!.assignedToCustomerUserId).toBeNull();
          expect(phaseAfter!.additionalInternalUserId).toBeNull();

          // Spot-check NOT NULL soft-reference columns still hold the
          // archived user's id. The FK was dropped in migration 036,
          // so this is allowed; restore re-INSERTs the user with the
          // same id and the soft references become whole again.
          const [reportAfter] = await db
            .select()
            .from(customReports)
            .where(eq(customReports.id, report!.id));
          expect(reportAfter!.createdBy).toBe(userId);
          const [linkAfter] = await db
            .select()
            .from(links)
            .where(sql`${links.name} = ${`${TEST_MARKER}-link`}`);
          expect(linkAfter!.ownerId).toBe(userId);
          const [docAfter] = await db
            .select()
            .from(documents)
            .where(sql`${documents.originalName} = ${`${TEST_MARKER}-doc.txt`}`);
          expect(docAfter!.uploadedByUserId).toBe(userId);

          // Per-user state must have been DELETEd by the sweep.
          const boardPrefsAfter = await db
            .select()
            .from(userBoardPreferences)
            .where(eq(userBoardPreferences.userId, userId));
          expect(boardPrefsAfter).toHaveLength(0);
          const favoritesAfter = await db
            .select()
            .from(userReportFavorites)
            .where(eq(userReportFavorites.userId, userId));
          expect(favoritesAfter).toHaveLength(0);

          // ------------------------------------------------------------
          // Restore — the soft references in NOT NULL columns must
          // become whole again now that the user row exists with the
          // same id.
          // ------------------------------------------------------------
          const restored = await storage.restoreUser(userId, ARCHIVER);
          expect(restored).toBe(true);

          // Sample several NOT NULL columns — the soft reference is
          // now satisfied by the freshly restored user row, and a
          // (users) join would now resolve.
          const restoredUserRows = await db
            .select()
            .from(users)
            .where(eq(users.id, userId));
          expect(restoredUserRows).toHaveLength(1);
          const [reportAfterRestore] = await db
            .select()
            .from(customReports)
            .where(eq(customReports.id, report!.id));
          expect(reportAfterRestore!.createdBy).toBe(userId);
          const auditAfterRestore = await db
            .select()
            .from(auditLogins)
            .where(eq(auditLogins.userId, userId));
          expect(auditAfterRestore.length).toBeGreaterThan(0);
          const [supportAfterRestore] = await db
            .select()
            .from(supportRequests)
            .where(eq(supportRequests.title, `${TEST_MARKER}-support-req`));
          expect(supportAfterRestore!.submittedByUserId).toBe(userId);

          // Manual cleanup for rows the standard cleanup misses
          // because they hold no marker after archive (e.g. the docs
          // repo config on the test product). Suppress the unused-var
          // lint by referencing the ids in an assertion.
          expect(component!.id).toBeGreaterThan(0);
          expect(docsRepo!.id).toBeGreaterThan(0);
        },
        60_000,
      );
    });

    describe("projects", () => {
      it(
        "archiveProject → restoreProject preserves every source column",
        async () => {
          const customerName = `${TEST_MARKER}-${randomUUID()}`;
          const now = new Date("2025-06-15T12:34:56.000Z");

          const inserted = await db
            .insert(projects)
            .values({
              name: "Round-Trip Project",
              customerName,
              businessProblem: "We need to verify drift never reaches prod.",
              solutionName: "Automated archive/restore tests",
              industry: "Technology",
              environment: "Production",
              type: "POC",
              opportunityName: "Opp-RT-001",
              salesforceEvaluationLink: "https://sf.example.com/opp/001",
              opportunityAcvValue: "100000",
              solutionDescription: "End-to-end drizzle round-trip coverage.",
              policyConsiderations: "None",
              notes: "Test notes",
              customerObjective: "Stop silent column drops",
              customerStakeholder: "Stakeholder Name",
              status: "active",
              customerStatus: "On Time",
              startDate: now,
              endDate: now,
              completedDate: null,
              feedbackComments: "Looks good",
              supportingEngineers: ["eng-1", "eng-2"],
              additionalSupportingTeam: ["pm-1"],
              accountRepresentativeId: "rep-1",
              opportunityEngineerId: "oe-1",
              customerAccessLevel: "edit",
              customerUsers: [{ userId: "u1", email: "u1@example.com" }],
              additionalAccess: [{ team: "alpha" }],
              tags: ["tag-a", "tag-b"],
              templateId: "tmpl-001",
              risk: "Low",
              ranking: "In Quarter",
              customerLogo: "https://example.com/logo.png",
              customerArtifacts: { docs: ["a.pdf"] },
              projectLinks: [{ name: "Wiki", url: "https://wiki" }],
              riskScore: "12.34",
              riskPredictionData: { score: 12.34, factors: ["a", "b"] },
              lastRiskAnalysis: now,
              tccUseProjectUser: false,
              tccFirstName: "TCC-First",
              tccLastName: "TCC-Last",
              tccCommitteeApproval: true,
              complianceRegulations: [1, 2, 3],
              salesStage: "Negotiation",
              forecastCategory: "Commit",
              mgmtNotes: "Mgmt notes",
              currentSituation: "Current situation",
              engineerNotes: "Eng notes",
              tapTccApproved: true,
              enableGapAnalysis: true,
              deliverablesVisibility: { cardVisible: false, tabs: {} },
              createdAt: now,
              updatedAt: now,
              // FK-bearing columns (customerUserId, primaryEngineerId,
              // specialistEngineerId, tccUserId, validationCriteriaTemplateId,
              // createdBy) left null on
              // purpose — exercising them would require seeding extra
              // rows in unrelated tables that have nothing to do with
              // the archive/restore round-trip.
            })
            .returning();

          const projectId = inserted[0]!.id;
          const [original] = await db
            .select()
            .from(projects)
            .where(eq(projects.id, projectId));

          // Seed each per-project linked table so the round-trip claim
          // covers the deliverables, audit trail, customer-access
          // grants, and activity log too — not just the project row
          // itself. Without this, archive→restore could silently drop
          // these rows (Task #517) and the source-only assertion below
          // would still pass.
          //
          // activity_logs.user_id and project_audits.user_id reference
          // `users.id`, so we materialize a throwaway user for the
          // duration of this test. Cleanup wipes it via the email
          // marker (see cleanupTestData above).
          const seedUserId = `${TEST_MARKER}-user-${randomUUID()}`;
          const seedUserEmail = `${TEST_MARKER}-${randomUUID()}@example.com`;
          await db.insert(users).values({
            id: seedUserId,
            email: seedUserEmail,
            firstName: "Seed",
            lastName: "User",
            role: "se",
            isActive: true,
            isApproved: true,
          });

          const seededCriteria = await db
            .insert(successCriteria)
            .values([
              {
                projectId,
                productName: "Product A",
                criterion: "Customer can do X",
                expectedOutcome: "Outcome X happens",
                actionItem: "Demo X",
                status: "pending",
                notes: "First criterion notes",
                isActive: true,
                lineNumber: 1,
                componentName: "Component-A",
                valueMappingName: "VM-1",
                createdAt: now,
                updatedAt: now,
              },
              {
                projectId,
                productName: "Product B",
                criterion: "Customer can do Y",
                expectedOutcome: "Outcome Y happens",
                actionItem: "Demo Y",
                status: "complete",
                notes: "Second criterion notes",
                isActive: false,
                lineNumber: 2,
                componentName: "Component-B",
                valueMappingName: "VM-2",
                createdAt: now,
                updatedAt: now,
              },
            ])
            .returning();

          const seededActivity = await db
            .insert(activityLogs)
            .values([
              {
                projectId,
                userId: seedUserId,
                action: "project.created",
                details: "initial create",
                targetType: "project",
                targetId: projectId,
                createdAt: now,
              },
              {
                projectId,
                userId: seedUserId,
                action: "project.updated",
                details: "status flip",
                targetType: "status",
                targetId: 7,
                createdAt: now,
              },
            ])
            .returning();

          const seededAccess = await db
            .insert(customerAccess)
            .values([
              {
                projectId,
                userEmail: "alice@example.com",
                permission: "read",
                createdAt: now,
                updatedAt: now,
              },
              {
                projectId,
                userEmail: "bob@example.com",
                permission: "edit",
                createdAt: now,
                updatedAt: now,
              },
            ])
            .returning();

          const seededAudits = await db
            .insert(projectAudits)
            .values([
              {
                projectId,
                userId: seedUserId,
                userEmail: seedUserEmail,
                userName: "Seed User",
                fieldName: "status",
                oldValue: "planning",
                newValue: "active",
                changeType: "update",
                createdAt: now,
              },
              {
                projectId,
                userId: seedUserId,
                userEmail: seedUserEmail,
                userName: "Seed User",
                fieldName: "notes",
                oldValue: "old notes",
                newValue: "new notes",
                changeType: "update",
                createdAt: now,
              },
            ])
            .returning();

          // Snapshot every related row before archive so the post-restore
          // assertion can diff column-by-column. We compare on values
          // (not row count alone) — that's the whole reason this test
          // exists: the previous bug was that the rows disappeared, so
          // a count check would catch it but a value check is stricter
          // and explains *which* column drifted if the bug ever
          // partially regresses.
          const originalCriteria = [...seededCriteria].sort(
            (a, b) => a.id - b.id,
          );
          const originalActivity = [...seededActivity].sort(
            (a, b) => a.id - b.id,
          );
          const originalAccess = [...seededAccess].sort(
            (a, b) => a.id - b.id,
          );
          const originalAudits = [...seededAudits].sort(
            (a, b) => a.id - b.id,
          );

          const archived = await storage.archiveProject(
            projectId,
            ARCHIVER,
            "round-trip test",
          );
          expect(archived).toBe(true);

          const sourceAfterArchive = await db
            .select()
            .from(projects)
            .where(eq(projects.id, projectId));
          expect(sourceAfterArchive).toHaveLength(0);

          // Source-side related tables must be empty for this project
          // after archive (the storage layer deletes them once it has
          // copied them into the archive companion tables).
          expect(
            await db
              .select()
              .from(successCriteria)
              .where(eq(successCriteria.projectId, projectId)),
          ).toHaveLength(0);
          expect(
            await db
              .select()
              .from(activityLogs)
              .where(eq(activityLogs.projectId, projectId)),
          ).toHaveLength(0);
          expect(
            await db
              .select()
              .from(customerAccess)
              .where(eq(customerAccess.projectId, projectId)),
          ).toHaveLength(0);
          expect(
            await db
              .select()
              .from(projectAudits)
              .where(eq(projectAudits.projectId, projectId)),
          ).toHaveLength(0);

          // Archive companion tables must now hold the same rows. This
          // is the assertion that fails if the storage layer ever
          // reverts to the old "select-but-never-insert" behavior.
          const archivedCriteriaRows = await db
            .select()
            .from(archivedSuccessCriteria)
            .where(eq(archivedSuccessCriteria.projectId, projectId));
          expect(archivedCriteriaRows).toHaveLength(originalCriteria.length);
          const archivedActivityRows = await db
            .select()
            .from(archivedActivityLogs)
            .where(eq(archivedActivityLogs.projectId, projectId));
          expect(archivedActivityRows).toHaveLength(originalActivity.length);
          const archivedAccessRows = await db
            .select()
            .from(archivedCustomerAccess)
            .where(eq(archivedCustomerAccess.projectId, projectId));
          expect(archivedAccessRows).toHaveLength(originalAccess.length);
          const archivedAuditRows = await db
            .select()
            .from(archivedProjectAudits)
            .where(eq(archivedProjectAudits.projectId, projectId));
          expect(archivedAuditRows).toHaveLength(originalAudits.length);

          const [archivedRow] = await db
            .select()
            .from(archivedProjects)
            .where(eq(archivedProjects.id, projectId));
          expect(archivedRow).toBeDefined();
          expect(archivedRow!.archivedBy).toBe(ARCHIVER);
          expect(archivedRow!.archivedReason).toBe("round-trip test");

          // archive_log must contain a 'project' entry for this id —
          // mirrors the user/customer audit-trail assertion.
          const logRows = await db
            .select()
            .from(archiveLog)
            .where(
              and(
                eq(archiveLog.entityType, "project"),
                eq(archiveLog.entityId, projectId.toString()),
              ),
            );
          expect(logRows).toHaveLength(1);
          expect(logRows[0]!.archivedBy).toBe(ARCHIVER);
          expect(logRows[0]!.reason).toBe("round-trip test");

          const restored = await storage.restoreProject(projectId, ARCHIVER);
          expect(restored).toBe(true);

          // Archive row must be gone after restore — same parity
          // check we make for users, kept here so a regression that
          // copies data back without removing the archive row gets
          // flagged for projects too.
          const archiveAfterRestore = await db
            .select()
            .from(archivedProjects)
            .where(eq(archivedProjects.id, projectId));
          expect(archiveAfterRestore).toHaveLength(0);

          const [restoredRow] = await db
            .select()
            .from(projects)
            .where(eq(projects.id, projectId));
          expect(restoredRow).toBeDefined();

          assertRowsMatchAllColumns(
            original as unknown as RowRecord,
            restoredRow as unknown as RowRecord,
          );

          // Each per-project linked table must have the same rows
          // back, with id, project_id, and every payload column intact
          // — this is the actual regression guard for Task #517. Sort
          // by id so a stable per-row diff lands in the failure
          // message instead of an order-dependent mismatch.
          const restoredCriteria = (
            await db
              .select()
              .from(successCriteria)
              .where(eq(successCriteria.projectId, projectId))
          ).sort((a, b) => a.id - b.id);
          expect(restoredCriteria).toHaveLength(originalCriteria.length);
          originalCriteria.forEach((origRow, idx) => {
            assertRowsMatchAllColumns(
              origRow as unknown as RowRecord,
              restoredCriteria[idx]! as unknown as RowRecord,
            );
          });

          const restoredActivity = (
            await db
              .select()
              .from(activityLogs)
              .where(eq(activityLogs.projectId, projectId))
          ).sort((a, b) => a.id - b.id);
          expect(restoredActivity).toHaveLength(originalActivity.length);
          originalActivity.forEach((origRow, idx) => {
            assertRowsMatchAllColumns(
              origRow as unknown as RowRecord,
              restoredActivity[idx]! as unknown as RowRecord,
            );
          });

          const restoredAccess = (
            await db
              .select()
              .from(customerAccess)
              .where(eq(customerAccess.projectId, projectId))
          ).sort((a, b) => a.id - b.id);
          expect(restoredAccess).toHaveLength(originalAccess.length);
          originalAccess.forEach((origRow, idx) => {
            assertRowsMatchAllColumns(
              origRow as unknown as RowRecord,
              restoredAccess[idx]! as unknown as RowRecord,
            );
          });

          const restoredAudits = (
            await db
              .select()
              .from(projectAudits)
              .where(eq(projectAudits.projectId, projectId))
          ).sort((a, b) => a.id - b.id);
          expect(restoredAudits).toHaveLength(originalAudits.length);
          originalAudits.forEach((origRow, idx) => {
            assertRowsMatchAllColumns(
              origRow as unknown as RowRecord,
              restoredAudits[idx]! as unknown as RowRecord,
            );
          });

          // Companion archive tables must also be empty for this
          // project after restore — mirrors the single-row archive
          // emptiness check above.
          expect(
            await db
              .select()
              .from(archivedSuccessCriteria)
              .where(eq(archivedSuccessCriteria.projectId, projectId)),
          ).toHaveLength(0);
          expect(
            await db
              .select()
              .from(archivedActivityLogs)
              .where(eq(archivedActivityLogs.projectId, projectId)),
          ).toHaveLength(0);
          expect(
            await db
              .select()
              .from(archivedCustomerAccess)
              .where(eq(archivedCustomerAccess.projectId, projectId)),
          ).toHaveLength(0);
          expect(
            await db
              .select()
              .from(archivedProjectAudits)
              .where(eq(archivedProjectAudits.projectId, projectId)),
          ).toHaveLength(0);
        },
        20_000,
      );

      it(
        "permanentlyDeleteArchivedProject purges every companion archive row",
        async () => {
          const customerName = `${TEST_MARKER}-${randomUUID()}`;
          const now = new Date("2025-06-15T12:34:56.000Z");

          const inserted = await db
            .insert(projects)
            .values({
              name: "Purge Project",
              customerName,
              solutionName: "Purge solution",
              salesforceEvaluationLink: "https://sf.example.com/opp/purge",
              createdAt: now,
              updatedAt: now,
            })
            .returning();
          const projectId = inserted[0]!.id;

          const seedUserId = `${TEST_MARKER}-user-${randomUUID()}`;
          const seedUserEmail = `${TEST_MARKER}-${randomUUID()}@example.com`;
          await db.insert(users).values({
            id: seedUserId,
            email: seedUserEmail,
            firstName: "Purge",
            lastName: "User",
            role: "se",
            isActive: true,
            isApproved: true,
          });

          // Seed one row in each linked table so the archive
          // companion tables receive content to purge.
          await db
            .insert(successCriteria)
            .values({ projectId, criterion: "C", createdAt: now, updatedAt: now });
          await db.insert(activityLogs).values({
            projectId,
            userId: seedUserId,
            action: "created",
            createdAt: now,
          });
          await db.insert(customerAccess).values({
            projectId,
            userEmail: "x@example.com",
            permission: "read",
            createdAt: now,
            updatedAt: now,
          });
          await db.insert(projectAudits).values({
            projectId,
            userId: seedUserId,
            userEmail: seedUserEmail,
            userName: "Purge User",
            fieldName: "status",
            oldValue: "a",
            newValue: "b",
            changeType: "update",
            createdAt: now,
          });

          await storage.archiveProject(projectId, ARCHIVER, "purge test");

          // Sanity: companion archives populated by the archive step.
          expect(
            await db
              .select()
              .from(archivedSuccessCriteria)
              .where(eq(archivedSuccessCriteria.projectId, projectId)),
          ).toHaveLength(1);

          const purged =
            await storage.permanentlyDeleteArchivedProject(projectId);
          expect(purged).toBe(true);

          // The parent archived_projects row AND every companion
          // archive row must be gone — no orphaned audit/access/
          // deliverable/activity rows left behind.
          expect(
            await db
              .select()
              .from(archivedProjects)
              .where(eq(archivedProjects.id, projectId)),
          ).toHaveLength(0);
          expect(
            await db
              .select()
              .from(archivedSuccessCriteria)
              .where(eq(archivedSuccessCriteria.projectId, projectId)),
          ).toHaveLength(0);
          expect(
            await db
              .select()
              .from(archivedActivityLogs)
              .where(eq(archivedActivityLogs.projectId, projectId)),
          ).toHaveLength(0);
          expect(
            await db
              .select()
              .from(archivedCustomerAccess)
              .where(eq(archivedCustomerAccess.projectId, projectId)),
          ).toHaveLength(0);
          expect(
            await db
              .select()
              .from(archivedProjectAudits)
              .where(eq(archivedProjectAudits.projectId, projectId)),
          ).toHaveLength(0);
        },
        20_000,
      );

      it(
        "permanentlyDeleteAllArchivedProjects purges every companion archive row",
        async (ctx) => {
          // `permanentlyDeleteAllArchivedProjects` is a TRUNCATE-style
          // bulk operation — it wipes every row from
          // `archived_projects` and the four companion archive tables,
          // not just rows inserted by this test. Running it against a
          // shared database that already contains real archived data
          // would destroy that data, so skip the test if any
          // non-test-marker archived projects are present rather than
          // risk wiping them.
          const preexistingArchived = await db
            .select({ id: archivedProjects.id })
            .from(archivedProjects)
            .where(
              sql`${archivedProjects.customerName} NOT LIKE ${TEST_MARKER + "-%"}`,
            );
          if (preexistingArchived.length > 0) {
            ctx.skip();
            return;
          }

          const now = new Date("2025-06-15T12:34:56.000Z");
          const customerNames = [
            `${TEST_MARKER}-${randomUUID()}`,
            `${TEST_MARKER}-${randomUUID()}`,
          ];
          const seedUserId = `${TEST_MARKER}-user-${randomUUID()}`;
          const seedUserEmail = `${TEST_MARKER}-${randomUUID()}@example.com`;
          await db.insert(users).values({
            id: seedUserId,
            email: seedUserEmail,
            firstName: "BulkPurge",
            lastName: "User",
            role: "se",
            isActive: true,
            isApproved: true,
          });

          const projectIds: number[] = [];
          for (const customerName of customerNames) {
            const [row] = await db
              .insert(projects)
              .values({
                name: "Bulk Purge Project",
                customerName,
                solutionName: "Bulk purge solution",
                salesforceEvaluationLink:
                  "https://sf.example.com/opp/bulk-purge",
                createdAt: now,
                updatedAt: now,
              })
              .returning();
            projectIds.push(row!.id);
            await db
              .insert(successCriteria)
              .values({
                projectId: row!.id,
                criterion: "C",
                createdAt: now,
                updatedAt: now,
              });
            await db.insert(projectAudits).values({
              projectId: row!.id,
              userId: seedUserId,
              userEmail: seedUserEmail,
              userName: "BulkPurge User",
              fieldName: "f",
              oldValue: "a",
              newValue: "b",
              changeType: "update",
              createdAt: now,
            });
            await storage.archiveProject(row!.id, ARCHIVER, "bulk purge test");
          }

          // Companion archives populated for each project before the
          // bulk delete runs.
          expect(
            await db
              .select()
              .from(archivedSuccessCriteria)
              .where(
                sql`${archivedSuccessCriteria.projectId} IN ${projectIds}`,
              ),
          ).toHaveLength(2);
          expect(
            await db
              .select()
              .from(archivedProjectAudits)
              .where(
                sql`${archivedProjectAudits.projectId} IN ${projectIds}`,
              ),
          ).toHaveLength(2);

          await storage.permanentlyDeleteAllArchivedProjects();

          // Bulk delete must wipe every companion archive table — not
          // just `archived_projects`. Scope the asserts to our test
          // project ids so the test stays meaningful even if the
          // skip-guard above is later relaxed.
          expect(
            await db
              .select()
              .from(archivedSuccessCriteria)
              .where(
                sql`${archivedSuccessCriteria.projectId} IN ${projectIds}`,
              ),
          ).toHaveLength(0);
          expect(
            await db
              .select()
              .from(archivedActivityLogs)
              .where(sql`${archivedActivityLogs.projectId} IN ${projectIds}`),
          ).toHaveLength(0);
          expect(
            await db
              .select()
              .from(archivedCustomerAccess)
              .where(
                sql`${archivedCustomerAccess.projectId} IN ${projectIds}`,
              ),
          ).toHaveLength(0);
          expect(
            await db
              .select()
              .from(archivedProjectAudits)
              .where(
                sql`${archivedProjectAudits.projectId} IN ${projectIds}`,
              ),
          ).toHaveLength(0);
          expect(
            await db
              .select()
              .from(archivedProjects)
              .where(sql`${archivedProjects.id} IN ${projectIds}`),
          ).toHaveLength(0);
        },
        20_000,
      );
    });

    describe("customers", () => {
      it(
        "archiveCustomer → restoreCustomer preserves every source column",
        async () => {
          const accountName = `${TEST_MARKER}-${randomUUID()}`;
          const now = new Date("2025-06-15T12:34:56.000Z");

          const inserted = await db
            .insert(customers)
            .values({
              accountName,
              abbreviation: "RT-CO",
              region: "EMEA",
              productInterests: ["product-a", "product-b"],
              contactUsers: [
                { userId: "u1", stakeholderTypes: ["Technical Champion"] },
              ],
              salesforceAccountUrl: "https://sf.example.com/acct/001",
              logoUrl: "https://example.com/logo.png",
              logoSize: 2048,
              accountRepresentativeId: "rep-1",
              accountEngineerId: "eng-1",
              isActive: true,
              isPartner: false,
              createdAt: now,
              updatedAt: now,
              // industryId left null on purpose — it has a FK into
              // industries, which is irrelevant for this round-trip.
            })
            .returning();

          const customerId = inserted[0]!.id;
          const [original] = await db
            .select()
            .from(customers)
            .where(eq(customers.id, customerId));

          const archived = await storage.archiveCustomer(
            customerId,
            ARCHIVER,
            "round-trip test",
          );
          expect(archived).toBe(true);

          const sourceAfterArchive = await db
            .select()
            .from(customers)
            .where(eq(customers.id, customerId));
          expect(sourceAfterArchive).toHaveLength(0);

          const [archivedRow] = await db
            .select()
            .from(archivedCustomers)
            .where(eq(archivedCustomers.id, customerId));
          expect(archivedRow).toBeDefined();
          expect(archivedRow!.archivedBy).toBe(ARCHIVER);
          expect(archivedRow!.archivedReason).toBe("round-trip test");

          // archive_log must contain a 'customer' entry for this id —
          // mirrors the user/project audit-trail assertion.
          const logRows = await db
            .select()
            .from(archiveLog)
            .where(
              and(
                eq(archiveLog.entityType, "customer"),
                eq(archiveLog.entityId, customerId.toString()),
              ),
            );
          expect(logRows).toHaveLength(1);
          expect(logRows[0]!.archivedBy).toBe(ARCHIVER);
          expect(logRows[0]!.reason).toBe("round-trip test");

          const restored = await storage.restoreCustomer(customerId, ARCHIVER);
          expect(restored).toBe(true);

          // Archive row must be gone after restore — parity with the
          // user / project tests so a regression that copies data
          // back without removing the archive row gets flagged for
          // customers too.
          const archiveAfterRestore = await db
            .select()
            .from(archivedCustomers)
            .where(eq(archivedCustomers.id, customerId));
          expect(archiveAfterRestore).toHaveLength(0);

          const [restoredRow] = await db
            .select()
            .from(customers)
            .where(eq(customers.id, customerId));
          expect(restoredRow).toBeDefined();

          // The live `customers` table still carries leftover
          // `archived_at` / `archived_by` / `archived_reason` columns
          // (Task #501). They are not part of the source-of-truth for
          // the round-trip — `restoreCustomer` deliberately strips
          // them — so we exclude them from the equality check rather
          // than asserting on dead columns.
          assertRowsMatchAllColumns(
            original as unknown as RowRecord,
            restoredRow as unknown as RowRecord,
            new Set(["archivedAt", "archivedBy", "archivedReason"]),
          );
        },
        20_000,
      );
    });

    describe("archive schema validation health check", () => {
      it("reports status 'ok' for users / projects / customers", async () => {
        const result = await healthMonitor.getArchiveSchemaValidation();

        // Every per-table verdict should be ok. If any pair is in
        // 'warning' state, surface its details (tableName + missing
        // columns) directly in the failure message so the operator
        // doesn't have to grep through health-monitor output.
        const offenders = result.results.filter((r) => r.status !== "ok");
        expect(
          offenders,
          `Archive schema validation reported drift: ${JSON.stringify(
            offenders,
            null,
            2,
          )}`,
        ).toEqual([]);

        // And the rolled-up status that drives the system health
        // page's badge should also be green.
        expect(result.status).toBe("ok");
        expect(result.summary.tablesWithIssues).toBe(0);
        expect(result.summary.totalMissingColumns).toBe(0);

        // Sanity: the health check should be inspecting all three of
        // the table pairs this suite covers. If a future refactor
        // drops one, this assertion makes that very obvious.
        const tableNames = result.results.map((r) => r.tableName).sort();
        expect(tableNames).toEqual(["customers", "projects", "users"]);
      });
    });
  },
);

