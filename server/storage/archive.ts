// Archive operations — mixin for DatabaseStorage (Phase 7 #8).
//
// Largest mixin extracted to date — 17 methods + 2 private helpers
// covering the soft-delete archive surface for users / projects /
// customers. Includes:
//
//   archiveUser / archiveProject / archiveCustomer   (the soft-delete write path)
//   restoreUser / restoreProject / restoreCustomer   (un-archive)
//   getArchivedUsers / getArchivedProjects / getArchivedCustomers
//   getArchivedUserById / getArchivedCustomerById
//   getArchiveLog                                    (audit feed)
//   getDependenciesForArchivedX (3 variants)
//   permanentlyDeleteArchivedX (3 variants) + 3 bulk-delete-all methods
//
// Plus two private helpers:
//   lookupArchiverEmail            (resolve archiver via active or archived users)
//   populateDefaultMapTemplateChildren (used during archive flow when
//                                       a project's MAP template needs
//                                       to be reseeded)
//
// Behavior preserved verbatim. The transactional nature of each archive
// flow (move row → insert audit row → cascade-archive children) is
// kept intact. The misleadingly-named `populateDefaultMapTemplateChildren`
// helper stays here because all its call sites are in this domain.
// Archive cascade-deletion touches nearly every table in the schema,
// so use a namespace import to avoid an enormous laundry list of named
// imports. Bundler tree-shakes based on actual usage.
import { db, type Database } from "../db";
import { eq, and, or, desc, count, sql, getTableColumns } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import * as schema from "@shared/schema";
import type {
  ArchivedUser,
  ArchivedProject,
  ArchivedCustomer,
  ArchiveLog,
  User,
  Project,
} from "@shared/schema";
import { RestoreUserEmailConflictError, sanitizeCustomerFolder } from "./_errors";
import {
  DEFAULT_MAP_TEMPLATE_PHASE_DATA,
  DEFAULT_MAP_TEMPLATE_STEP_DATA,
  DEFAULT_MAP_TEMPLATE_TASK_SEEDS,
  DEFAULT_MAP_TEMPLATE_EXPECTED_TASK_COUNT,
} from "../seed/default-map-template-tasks";
import { normalizeCriterionPriority } from "@shared/value-journey";

// Re-bind schema tables under their original local names so the
// extracted method bodies (which use `users`, `projects`, etc. as
// barewords) keep working without a search-and-replace pass.
const {
  users,
  projects,
  customers,
  customerAccess,
  activityLogs,
  successCriteria,
  projectAudits,
  userPermissions,
  userBoardPreferences,
  userReportFavorites,
  mfaRecoveryCodes,
  trustedDevices,
  webauthnCredentials,
  mfaEvents,
  components,
  criteriaLibrary,
  archivedUsers,
  archivedProjects,
  archivedCustomers,
  archivedSuccessCriteria,
  archivedActivityLogs,
  archivedCustomerAccess,
  archivedProjectAudits,
  archiveLog,
  mapTemplates,
  mapTemplatePhases,
  journeyStages,
  mapTemplateSteps,
  mapTemplateTasks,
  mapTemplateApplications,
  mapPhases,
  mapSteps,
  mapTasks,
  mapAssignmentOverrides,
  expectedOutcomes,
  actionItems,
  valueMappings,
  validationCriteriaTemplates,
  assumptionCategories,
  assumptions,
  dependencies,
  dependencyCategories,
  projectAssumptions,
  projectDependencies,
  projectGaps,
  projectGapLinks,
  projectCompetitors,
  projectOutcomes,
  projectTemplates,
  competitors,
  competitorActivity,
  competitorDocuments,
  systemSettings,
  emailLogs,
  emailTemplates,
  emailDesigns,
  emailConfiguration,
  emailRules,
  emailAutomationConfig,
  endDateFlags,
  flightDeckConfigs,
  flightDeckTips,
  outcomeConfig,
  riskAlerts,
  riskCriteria,
  assessmentJobs,
  assessmentRulesets,
  aiProviderConfigs,
  storageConfiguration,
  webhooks,
  dashboardConfigs,
  dashboardLayouts,
  docsRepositoryConfigs,
  docsSyncSchedule,
  domainAuditLog,
  allowedDomains,
  accessCodes,
  accessCodeAuditLog,
  salesforceFieldMappings,
  salesforceOauthConfig,
  salesforceRecordLinks,
  salesforceSyncPolicies,
  salesforceSyncQueue,
  salesforceSyncRunItems,
  salesforceSyncRuns,
  supportRequests,
  userAccounts,
  products: productsTable,
} = schema;

export class ArchiveStorageMixin {
  // Phantom field declarations so TypeScript knows these are available
  // when applyMixins composes this into DatabaseStorage at runtime.
  // `declare` emits no runtime code — DatabaseStorage's real
  // `public db = db` and `public schema = schema` provide the values.
  declare db: Database;
  declare schema: typeof schema;

  //
  // Resolve the archiver's email at write time so the Activity Log can
  // render an identity even after the archiver is hard-deleted with no
  // `archived_users` mirror left to fall back to. Active `users` wins;
  // `archived_users` is the secondary lookup (matches the JOIN order in
  // `getArchiveLog`); NULL when the id can't be resolved at all (the
  // archive_log row will then fall through to the raw `archived_by` id
  // when the snapshot is also missing). Accepts the surrounding
  // transaction so the lookup runs inside the same atomic unit as the
  // companion `archiveLog` insert.
  private async lookupArchiverEmail(
    tx: Parameters<Parameters<typeof this.db.transaction>[0]>[0],
    archivedBy: string,
  ): Promise<string | null> {
    const [activeRow] = await tx
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, archivedBy))
      .limit(1);
    if (activeRow?.email) return activeRow.email;

    const [archivedRow] = await tx
      .select({ email: archivedUsers.email })
      .from(archivedUsers)
      .where(eq(archivedUsers.id, archivedBy))
      .limit(1);
    return archivedRow?.email ?? null;
  }

  async archiveUser(userId: string, archivedBy: string, reason?: string): Promise<boolean> {
    return await this.db.transaction(async (tx) => {
      // Get the user to archive
      const user = await tx.select().from(users).where(eq(users.id, userId)).limit(1);

      if (user.length === 0) {
        throw new Error("User not found");
      }

      const userToArchive = user[0] as User;

      // Insert into archived_users table
      await tx.insert(archivedUsers).values({
        ...userToArchive,
        archivedBy,
        archivedAt: new Date(),
        archivedReason: reason ?? null,
      });

      // Log the archive action. Snapshot the archiver's email at write
      // time (Task #552) so the Activity Log on Archive Management can
      // still render an identity even if the archiver later gets
      // hard-deleted with no `archived_users` mirror left to fall back
      // to. Resolve via active `users` first, then `archived_users`
      // (covers an admin who is themselves already archived but whose
      // session was still doing the archiving), then NULL — matching
      // the resolution order used by `getArchiveLog`.
      const archiverEmail = await this.lookupArchiverEmail(tx, archivedBy);
      await tx.insert(archiveLog).values({
        entityType: 'user',
        entityId: userId,
        entityName: `${userToArchive.firstName} ${userToArchive.lastName}`,
        archivedBy,
        userEmail: archiverEmail,
        reason,
      });

      // Mark user as deleted in projects instead of removing them
      // Update projects where this user is primary engineer
      await tx.update(projects)
        .set({
          primaryEngineerId: userToArchive.firstName && userToArchive.lastName
            ? `${userToArchive.firstName} ${userToArchive.lastName} (D)`
            : `${userToArchive.email} (D)`
        })
        .where(eq(projects.primaryEngineerId, userId));

      // Update projects where this user is specialist engineer
      await tx.update(projects)
        .set({
          specialistEngineerId: userToArchive.firstName && userToArchive.lastName
            ? `${userToArchive.firstName} ${userToArchive.lastName} (D)`
            : `${userToArchive.email} (D)`
        })
        .where(eq(projects.specialistEngineerId, userId));

      // Stamp the same `(D)` placeholder into the remaining
      // user-id columns on `projects` that still pointed at this
      // user. Without this sweep, the final `DELETE FROM users` at
      // the bottom of this transaction trips the FK on whichever
      // `customer_user_id` / `tcc_user_id` / `created_by` slot
      // still references the row, rolls back the entire archive,
      // and the operator gets a 500 with no actionable detail
      // (Task #533, same failure shape Task #527 fixed for the
      // engineer slots). The placeholder string is what
      // `restoreUser` keys on to swap the real user id back into
      // each slot when the user is brought back, so it must match
      // the format used above for the engineer slots exactly.
      const archivedPlaceholder = userToArchive.firstName && userToArchive.lastName
        ? `${userToArchive.firstName} ${userToArchive.lastName} (D)`
        : `${userToArchive.email} (D)`;

      await tx.update(projects)
        .set({ customerUserId: archivedPlaceholder })
        .where(eq(projects.customerUserId, userId));

      await tx.update(projects)
        .set({ tccUserId: archivedPlaceholder })
        .where(eq(projects.tccUserId, userId));

      await tx.update(projects)
        .set({ createdBy: archivedPlaceholder })
        .where(eq(projects.createdBy, userId));

      // Update supporting engineers arrays
      const projectsWithSupporting = await tx.select().from(projects)
        .where(sql`${projects.supportingEngineers} && ARRAY[${userId}]`);

      for (const project of projectsWithSupporting) {
        const updatedEngineers = (project.supportingEngineers as string[] | null)
          ?.filter((id: string) => id !== userId)
          .concat([userToArchive.firstName && userToArchive.lastName
            ? `${userToArchive.firstName} ${userToArchive.lastName} (D)`
            : `${userToArchive.email} (D)`]);

        await tx.update(projects)
          .set({ supportingEngineers: updatedEngineers })
          .where(eq(projects.id, project.id));
      }

      // Delete user permissions records (to maintain referential integrity)
      await tx.delete(userPermissions).where(eq(userPermissions.userId, userId));

      // Clean up all MFA data and configuration
      console.log(`Cleaning up MFA data for archived user: ${userId}`);
      
      // Delete all MFA recovery codes
      await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
      
      // Delete all trusted devices
      await tx.delete(trustedDevices).where(eq(trustedDevices.userId, userId));
      
      // Delete all WebAuthn credentials
      await tx.delete(webauthnCredentials).where(eq(webauthnCredentials.userId, userId));
      
      // Delete all MFA events
      await tx.delete(mfaEvents).where(eq(mfaEvents.userId, userId));

      console.log(`MFA data cleanup completed for user: ${userId}`);

      // Task #542 sweep: clear remaining user FK references before the
      // final DELETE. Nullable cols → UPDATE … SET NULL. NOT NULL cols
      // had their FK dropped in migration 036 and stay stamped as a
      // soft reference (restored automatically when restoreUser
      // re-INSERTs the user). CASCADE FKs are handled by Postgres.

      // Per-user state with no meaning after archive — just delete.
      await tx.delete(userBoardPreferences).where(eq(userBoardPreferences.userId, userId));
      await tx.delete(userReportFavorites).where(eq(userReportFavorites.userId, userId));
      await tx.delete(userPermissions).where(eq(userPermissions.userId, userId));

      // products / catalog tables — nullable createdBy/updatedBy
      await tx.update(productsTable).set({ createdBy: null }).where(eq(productsTable.createdBy, userId));
      await tx.update(productsTable).set({ updatedBy: null }).where(eq(productsTable.updatedBy, userId));
      await tx.update(components).set({ createdBy: null }).where(eq(components.createdBy, userId));
      await tx.update(components).set({ updatedBy: null }).where(eq(components.updatedBy, userId));
      await tx.update(criteriaLibrary).set({ createdBy: null }).where(eq(criteriaLibrary.createdBy, userId));
      await tx.update(criteriaLibrary).set({ updatedBy: null }).where(eq(criteriaLibrary.updatedBy, userId));
      await tx.update(expectedOutcomes).set({ createdBy: null }).where(eq(expectedOutcomes.createdBy, userId));
      await tx.update(expectedOutcomes).set({ updatedBy: null }).where(eq(expectedOutcomes.updatedBy, userId));
      await tx.update(actionItems).set({ createdBy: null }).where(eq(actionItems.createdBy, userId));
      await tx.update(actionItems).set({ updatedBy: null }).where(eq(actionItems.updatedBy, userId));
      await tx.update(valueMappings).set({ createdBy: null }).where(eq(valueMappings.createdBy, userId));
      await tx.update(valueMappings).set({ updatedBy: null }).where(eq(valueMappings.updatedBy, userId));
      await tx.update(validationCriteriaTemplates).set({ updatedBy: null }).where(eq(validationCriteriaTemplates.updatedBy, userId));

      // assumptions / dependencies
      await tx.update(assumptionCategories).set({ createdBy: null }).where(eq(assumptionCategories.createdBy, userId));
      await tx.update(assumptionCategories).set({ updatedBy: null }).where(eq(assumptionCategories.updatedBy, userId));
      await tx.update(dependencyCategories).set({ createdBy: null }).where(eq(dependencyCategories.createdBy, userId));
      await tx.update(dependencyCategories).set({ updatedBy: null }).where(eq(dependencyCategories.updatedBy, userId));
      await tx.update(assumptions).set({ createdBy: null }).where(eq(assumptions.createdBy, userId));
      await tx.update(assumptions).set({ updatedBy: null }).where(eq(assumptions.updatedBy, userId));
      await tx.update(dependencies).set({ createdBy: null }).where(eq(dependencies.createdBy, userId));
      await tx.update(dependencies).set({ updatedBy: null }).where(eq(dependencies.updatedBy, userId));
      await tx.update(projectAssumptions).set({ createdBy: null }).where(eq(projectAssumptions.createdBy, userId));
      await tx.update(projectAssumptions).set({ updatedBy: null }).where(eq(projectAssumptions.updatedBy, userId));
      await tx.update(projectDependencies).set({ createdBy: null }).where(eq(projectDependencies.createdBy, userId));
      await tx.update(projectDependencies).set({ updatedBy: null }).where(eq(projectDependencies.updatedBy, userId));

      // email tables
      await tx.update(emailLogs).set({ userId: null }).where(eq(emailLogs.userId, userId));
      await tx.update(emailRules).set({ createdBy: null }).where(eq(emailRules.createdBy, userId));
      await tx.update(emailRules).set({ updatedBy: null }).where(eq(emailRules.updatedBy, userId));
      await tx.update(emailAutomationConfig).set({ updatedBy: null }).where(eq(emailAutomationConfig.updatedBy, userId));
      await tx.update(emailTemplates).set({ createdBy: null }).where(eq(emailTemplates.createdBy, userId));
      await tx.update(emailTemplates).set({ updatedBy: null }).where(eq(emailTemplates.updatedBy, userId));
      await tx.update(emailDesigns).set({ createdBy: null }).where(eq(emailDesigns.createdBy, userId));
      await tx.update(emailConfiguration).set({ createdBy: null }).where(eq(emailConfiguration.createdBy, userId));
      await tx.update(emailConfiguration).set({ updatedBy: null }).where(eq(emailConfiguration.updatedBy, userId));

      // ai tables
      await tx.update(assessmentRulesets).set({ createdBy: null }).where(eq(assessmentRulesets.createdBy, userId));
      await tx.update(riskCriteria).set({ createdBy: null }).where(eq(riskCriteria.createdBy, userId));
      await tx.update(riskAlerts).set({ acknowledgedBy: null }).where(eq(riskAlerts.acknowledgedBy, userId));
      await tx.update(aiProviderConfigs).set({ createdBy: null }).where(eq(aiProviderConfigs.createdBy, userId));
      await tx.update(assessmentJobs).set({ triggeredBy: null }).where(eq(assessmentJobs.triggeredBy, userId));

      // competitors
      await tx.update(competitors).set({ reviewedByUserId: null }).where(eq(competitors.reviewedByUserId, userId));
      await tx.update(competitors).set({ createdByUserId: null }).where(eq(competitors.createdByUserId, userId));
      await tx.update(projectCompetitors).set({ ownerUserId: null }).where(eq(projectCompetitors.ownerUserId, userId));
      await tx.update(competitorDocuments).set({ createdByUserId: null }).where(eq(competitorDocuments.createdByUserId, userId));
      await tx.update(competitorActivity).set({ createdByUserId: null }).where(eq(competitorActivity.createdByUserId, userId));

      // map (phases/steps/tasks/templates/overrides)
      await tx.update(mapPhases).set({ assignedToCustomerUserId: null }).where(eq(mapPhases.assignedToCustomerUserId, userId));
      await tx.update(mapPhases).set({ assignedToUserId: null }).where(eq(mapPhases.assignedToUserId, userId));
      await tx.update(mapPhases).set({ additionalInternalUserId: null }).where(eq(mapPhases.additionalInternalUserId, userId));
      await tx.update(mapSteps).set({ assignedToCustomerUserId: null }).where(eq(mapSteps.assignedToCustomerUserId, userId));
      await tx.update(mapSteps).set({ assignedToUserId: null }).where(eq(mapSteps.assignedToUserId, userId));
      await tx.update(mapSteps).set({ additionalInternalUserId: null }).where(eq(mapSteps.additionalInternalUserId, userId));
      await tx.update(mapTasks).set({ assignedToCustomerUserId: null }).where(eq(mapTasks.assignedToCustomerUserId, userId));
      await tx.update(mapTasks).set({ assignedToUserId: null }).where(eq(mapTasks.assignedToUserId, userId));
      await tx.update(mapTasks).set({ additionalInternalUserId: null }).where(eq(mapTasks.additionalInternalUserId, userId));
      await tx.update(mapTemplates).set({ updatedByUserId: null }).where(eq(mapTemplates.updatedByUserId, userId));
      await tx.update(mapAssignmentOverrides).set({ overriddenByUserId: null }).where(eq(mapAssignmentOverrides.overriddenByUserId, userId));

      // access-control
      await tx.update(allowedDomains).set({ addedBy: null }).where(eq(allowedDomains.addedBy, userId));
      await tx.update(accessCodes).set({ createdBy: null }).where(eq(accessCodes.createdBy, userId));
      await tx.update(domainAuditLog).set({ performedBy: null }).where(eq(domainAuditLog.performedBy, userId));
      await tx.update(accessCodeAuditLog).set({ performedBy: null }).where(eq(accessCodeAuditLog.performedBy, userId));

      // auth — userAccounts.createdBy is nullable
      await tx.update(userAccounts).set({ createdBy: null }).where(eq(userAccounts.createdBy, userId));

      // dashboard. customReports.createdBy and reportExecutions.executedBy
      // are NOT NULL — their FKs were dropped in migration 036 and the
      // archived user's id stays stamped as a soft reference (resolved
      // automatically when restoreUser re-INSERTs the user).
      await tx.update(dashboardLayouts).set({ userId: null }).where(eq(dashboardLayouts.userId, userId));
      await tx.update(dashboardLayouts).set({ createdBy: null }).where(eq(dashboardLayouts.createdBy, userId));
      await tx.update(dashboardConfigs).set({ userId: null }).where(eq(dashboardConfigs.userId, userId));

      // misc
      await tx.update(webhooks).set({ createdBy: null }).where(eq(webhooks.createdBy, userId));
      await tx.update(webhooks).set({ updatedBy: null }).where(eq(webhooks.updatedBy, userId));
      await tx.update(salesforceOauthConfig).set({ createdBy: null }).where(eq(salesforceOauthConfig.createdBy, userId));
      await tx.update(salesforceOauthConfig).set({ updatedBy: null }).where(eq(salesforceOauthConfig.updatedBy, userId));
      await tx.update(salesforceFieldMappings).set({ createdBy: null }).where(eq(salesforceFieldMappings.createdBy, userId));
      await tx.update(salesforceFieldMappings).set({ updatedBy: null }).where(eq(salesforceFieldMappings.updatedBy, userId));
      await tx.update(salesforceRecordLinks).set({ linkedBy: null }).where(eq(salesforceRecordLinks.linkedBy, userId));
      await tx.update(salesforceSyncPolicies).set({ createdBy: null }).where(eq(salesforceSyncPolicies.createdBy, userId));
      await tx.update(salesforceSyncPolicies).set({ updatedBy: null }).where(eq(salesforceSyncPolicies.updatedBy, userId));
      await tx.update(salesforceSyncQueue).set({ triggeredByUserId: null }).where(eq(salesforceSyncQueue.triggeredByUserId, userId));
      await tx.update(salesforceSyncRuns).set({ triggeredByUserId: null }).where(eq(salesforceSyncRuns.triggeredByUserId, userId));
      await tx.update(salesforceSyncRunItems).set({ conflictAcknowledgedBy: null }).where(eq(salesforceSyncRunItems.conflictAcknowledgedBy, userId));
      await tx.update(flightDeckConfigs).set({ createdBy: null }).where(eq(flightDeckConfigs.createdBy, userId));
      await tx.update(flightDeckTips).set({ createdBy: null }).where(eq(flightDeckTips.createdBy, userId));
      await tx.update(projectGaps).set({ reportedBy: null }).where(eq(projectGaps.reportedBy, userId));
      await tx.update(projectGapLinks).set({ linkedBy: null }).where(eq(projectGapLinks.linkedBy, userId));
      await tx.update(projectOutcomes).set({ createdBy: null }).where(eq(projectOutcomes.createdBy, userId));
      await tx.update(outcomeConfig).set({ updatedBy: null }).where(eq(outcomeConfig.updatedBy, userId));
      await tx.update(supportRequests).set({ assignedToUserId: null }).where(eq(supportRequests.assignedToUserId, userId));

      // projects.ts — projectTemplates and endDateFlags
      await tx.update(projectTemplates).set({ createdBy: null }).where(eq(projectTemplates.createdBy, userId));
      await tx.update(projectTemplates).set({ updatedBy: null }).where(eq(projectTemplates.updatedBy, userId));
      await tx.update(endDateFlags).set({ createdBy: null }).where(eq(endDateFlags.createdBy, userId));

      // config
      await tx.update(systemSettings).set({ updatedBy: null }).where(eq(systemSettings.updatedBy, userId));
      await tx.update(storageConfiguration).set({ createdBy: null }).where(eq(storageConfiguration.createdBy, userId));
      await tx.update(storageConfiguration).set({ updatedBy: null }).where(eq(storageConfiguration.updatedBy, userId));

      // docs
      await tx.update(docsRepositoryConfigs).set({ createdBy: null }).where(eq(docsRepositoryConfigs.createdBy, userId));
      await tx.update(docsSyncSchedule).set({ configuredBy: null }).where(eq(docsSyncSchedule.configuredBy, userId));

      // Delete from original table
      await tx.delete(users).where(eq(users.id, userId));

      return true;
    });
  }

  async archiveProject(projectId: number, archivedBy: string, reason?: string): Promise<boolean> {
    return await this.db.transaction(async (tx) => {
      // Get the project to archive
      const project = await tx.select().from(projects).where(eq(projects.id, projectId)).limit(1);

      if (project.length === 0) {
        throw new Error("Project not found");
      }

      const projectToArchive = project[0] as Project;

      // Archive related success criteria first. The select-then-insert
      // pattern (rather than INSERT…SELECT) keeps the archived rows
      // and the about-to-be-deleted source rows in the same explicit
      // batch. Note: under the default READ COMMITTED isolation level
      // this does NOT prevent a concurrent transaction from inserting
      // a new related row between this SELECT and the DELETE below —
      // that row would still be deleted without ever being archived.
      // Closing that window properly requires SELECT FOR UPDATE on
      // the parent project (or SERIALIZABLE) and is left as a
      // hardening follow-up.
      const successCriteriaData = await tx.select().from(successCriteria).where(eq(successCriteria.projectId, projectId));

      // Archive activity logs
      const activityData = await tx.select().from(activityLogs).where(eq(activityLogs.projectId, projectId));

      // Archive customer access records
      const customerAccessData = await tx.select().from(customerAccess).where(eq(customerAccess.projectId, projectId));

      // Archive project audit records
      const auditData = await tx.select().from(projectAudits).where(eq(projectAudits.projectId, projectId));

      // Insert into archived_projects table
      await tx.insert(archivedProjects).values({
        ...projectToArchive,
        archivedBy,
        archivedAt: new Date(),
        archivedReason: reason ?? null,
      });

      // Log the archive action with a snapshot of the archiver's email
      // captured at write time (Task #552) — see the matching block in
      // `archiveUser` for the rationale.
      const archiverEmail = await this.lookupArchiverEmail(tx, archivedBy);
      await tx.insert(archiveLog).values({
        entityType: 'project',
        entityId: projectId.toString(),
        entityName: `${projectToArchive.customerName} - ${projectToArchive.solutionName}`,
        archivedBy,
        userEmail: archiverEmail,
        reason,
      });

      // Persist the related rows into their archive companion tables
      // BEFORE deleting them from the source tables. Skip the insert
      // when the slice is empty so drizzle doesn't throw on a zero-row
      // VALUES clause. `archived_at` is left to default to NOW().
      const archivedAt = new Date();
      if (successCriteriaData.length > 0) {
        await tx.insert(archivedSuccessCriteria).values(
          successCriteriaData.map((row) => ({ ...row, archivedAt })),
        );
      }
      if (activityData.length > 0) {
        await tx.insert(archivedActivityLogs).values(
          activityData.map((row) => ({ ...row, archivedAt })),
        );
      }
      if (customerAccessData.length > 0) {
        await tx.insert(archivedCustomerAccess).values(
          customerAccessData.map((row) => ({ ...row, archivedAt })),
        );
      }
      if (auditData.length > 0) {
        await tx.insert(archivedProjectAudits).values(
          auditData.map((row) => ({ ...row, archivedAt })),
        );
      }

      // Delete related records first (to maintain referential integrity)
      await tx.delete(projectAudits).where(eq(projectAudits.projectId, projectId));
      await tx.delete(customerAccess).where(eq(customerAccess.projectId, projectId));
      await tx.delete(activityLogs).where(eq(activityLogs.projectId, projectId));
      await tx.delete(successCriteria).where(eq(successCriteria.projectId, projectId));

      // Delete from original table
      await tx.delete(projects).where(eq(projects.id, projectId));

      return true;
    });
  }

  async archiveCustomer(customerId: number, archivedBy: string, reason?: string): Promise<boolean> {
    return await this.db.transaction(async (tx) => {
      // Get the customer to archive
      const customer = await tx.select().from(customers).where(eq(customers.id, customerId)).limit(1);

      if (customer.length === 0) {
        throw new Error("Customer not found");
      }

      const customerToArchive = customer[0];

      // Insert into archived_customers table
      await tx.insert(archivedCustomers).values({
        ...customerToArchive,
        archivedBy,
        archivedAt: new Date(),
        archivedReason: reason ?? null,
      });

      // Log the archive action with a snapshot of the archiver's email
      // captured at write time (Task #552) — see the matching block in
      // `archiveUser` for the rationale.
      const archiverEmail = await this.lookupArchiverEmail(tx, archivedBy);
      await tx.insert(archiveLog).values({
        entityType: 'customer',
        entityId: customerId.toString(),
        entityName: customerToArchive.accountName,
        archivedBy,
        userEmail: archiverEmail,
        reason,
      });

      // Delete from original table
      await tx.delete(customers).where(eq(customers.id, customerId));

      return true;
    });
  }

  // Get archived records
  //
  // The list endpoints fronting these methods used to return only the raw
  // `archivedBy` user id, which forced the Archive Management page to load
  // the full active + archived user directories into the browser just to
  // resolve a display name and email. To make that scale, we now LEFT JOIN
  // both the active `users` table and the `archived_users` mirror against
  // `archived_by` and project two synthetic columns — `archivedByName` and
  // `archivedByEmail` — that the API surfaces directly. The active row wins
  // when present (so a still-active archiver shows their current name/email),
  // and we fall back to the archived snapshot when the archiver has since
  // been archived themselves. Both fall back to NULL gracefully if the id
  // can't be resolved at all, which the client renders as a generic label.
  async getArchivedUsers(): Promise<(ArchivedUser & { archivedByName: string | null; archivedByEmail: string | null })[]> {
    try {
      const archiverActive = alias(users, 'archiverActive');
      const archiverArchived = alias(archivedUsers, 'archiverArchived');
      return await this.db
        .select({
          ...getTableColumns(archivedUsers),
          archivedByName: sql<string | null>`COALESCE(
            NULLIF(TRIM(CONCAT_WS(' ', ${archiverActive.firstName}, ${archiverActive.lastName})), ''),
            ${archiverActive.email},
            NULLIF(TRIM(CONCAT_WS(' ', ${archiverArchived.firstName}, ${archiverArchived.lastName})), ''),
            ${archiverArchived.email}
          )`.as('archivedByName'),
          archivedByEmail: sql<string | null>`COALESCE(${archiverActive.email}, ${archiverArchived.email})`.as('archivedByEmail'),
        })
        .from(archivedUsers)
        .leftJoin(archiverActive, eq(archiverActive.id, archivedUsers.archivedBy))
        .leftJoin(archiverArchived, eq(archiverArchived.id, archivedUsers.archivedBy))
        .orderBy(desc(archivedUsers.archivedAt));
    } catch (error) {
      console.error('Error fetching archived users:', error);
      return [];
    }
  }

  async getArchivedProjects(): Promise<(ArchivedProject & { archivedByName: string | null; archivedByEmail: string | null })[]> {
    try {
      const archiverActive = alias(users, 'archiverActive');
      const archiverArchived = alias(archivedUsers, 'archiverArchived');
      return await this.db
        .select({
          ...getTableColumns(archivedProjects),
          archivedByName: sql<string | null>`COALESCE(
            NULLIF(TRIM(CONCAT_WS(' ', ${archiverActive.firstName}, ${archiverActive.lastName})), ''),
            ${archiverActive.email},
            NULLIF(TRIM(CONCAT_WS(' ', ${archiverArchived.firstName}, ${archiverArchived.lastName})), ''),
            ${archiverArchived.email}
          )`.as('archivedByName'),
          archivedByEmail: sql<string | null>`COALESCE(${archiverActive.email}, ${archiverArchived.email})`.as('archivedByEmail'),
        })
        .from(archivedProjects)
        .leftJoin(archiverActive, eq(archiverActive.id, archivedProjects.archivedBy))
        .leftJoin(archiverArchived, eq(archiverArchived.id, archivedProjects.archivedBy))
        .orderBy(desc(archivedProjects.archivedAt));
    } catch (error) {
      console.error('Error fetching archived projects:', error);
      return [];
    }
  }

  async getArchivedCustomers(): Promise<(ArchivedCustomer & { archivedByName: string | null; archivedByEmail: string | null })[]> {
    try {
      const archiverActive = alias(users, 'archiverActive');
      const archiverArchived = alias(archivedUsers, 'archiverArchived');
      return await this.db
        .select({
          ...getTableColumns(archivedCustomers),
          archivedByName: sql<string | null>`COALESCE(
            NULLIF(TRIM(CONCAT_WS(' ', ${archiverActive.firstName}, ${archiverActive.lastName})), ''),
            ${archiverActive.email},
            NULLIF(TRIM(CONCAT_WS(' ', ${archiverArchived.firstName}, ${archiverArchived.lastName})), ''),
            ${archiverArchived.email}
          )`.as('archivedByName'),
          archivedByEmail: sql<string | null>`COALESCE(${archiverActive.email}, ${archiverArchived.email})`.as('archivedByEmail'),
        })
        .from(archivedCustomers)
        .leftJoin(archiverActive, eq(archiverActive.id, archivedCustomers.archivedBy))
        .leftJoin(archiverArchived, eq(archiverArchived.id, archivedCustomers.archivedBy))
        .orderBy(desc(archivedCustomers.archivedAt));
    } catch (error) {
      console.error('Error fetching archived customers:', error);
      return [];
    }
  }

  // Get archived user by ID for project display
  async getArchivedUserById(userId: string): Promise<ArchivedUser | undefined> {
    const [user] = await this.db.select().from(archivedUsers).where(eq(archivedUsers.id, userId));
    return user;
  }

  // Get archived customer by ID for project display
  async getArchivedCustomerById(customerId: number): Promise<ArchivedCustomer | undefined> {
    const [customer] = await this.db.select().from(archivedCustomers).where(eq(archivedCustomers.id, customerId));
    return customer;
  }

  async getArchiveLog(): Promise<(ArchiveLog & { archivedByName: string | null; archivedByEmail: string | null })[]> {
    try {
      // Mirror the join shape used by getArchivedUsers / getArchivedProjects /
      // getArchivedCustomers (Task #547) so the Activity Log tab can render
      // the archiver's real first/last name + email instead of falling back
      // to the email-prefix. Active `users` wins when present; we fall back
      // to the `archived_users` mirror when the archiver has since been
      // archived themselves, and finally to the snapshot `user_email`
      // captured at write time on `archive_log` for the case where the
      // archiver has been hard-deleted with no `archived_users` mirror
      // left (Task #552). Both fields collapse to NULL only when even the
      // snapshot is missing — older rows written before migration 038
      // ran simply carry NULL there and continue to fall through to the
      // raw `archived_by` id on the client.
      const archiverActive = alias(users, 'archiverActive');
      const archiverArchived = alias(archivedUsers, 'archiverArchived');
      return await this.db
        .select({
          ...getTableColumns(archiveLog),
          archivedByName: sql<string | null>`COALESCE(
            NULLIF(TRIM(CONCAT_WS(' ', ${archiverActive.firstName}, ${archiverActive.lastName})), ''),
            ${archiverActive.email},
            NULLIF(TRIM(CONCAT_WS(' ', ${archiverArchived.firstName}, ${archiverArchived.lastName})), ''),
            ${archiverArchived.email},
            ${archiveLog.userEmail}
          )`.as('archivedByName'),
          archivedByEmail: sql<string | null>`COALESCE(
            ${archiverActive.email},
            ${archiverArchived.email},
            ${archiveLog.userEmail}
          )`.as('archivedByEmail'),
        })
        .from(archiveLog)
        .leftJoin(archiverActive, eq(archiverActive.id, archiveLog.archivedBy))
        .leftJoin(archiverArchived, eq(archiverArchived.id, archiveLog.archivedBy))
        .orderBy(desc(archiveLog.archivedAt));
    } catch (error) {
      console.error('Error fetching archive log:', error);
      return [];
    }
  }

  // Restore methods (optional - to unarchive if needed)
  async restoreUser(archivedUserId: string, restoredBy: string): Promise<boolean> {
    return await this.db.transaction(async (tx) => {
      // Get the archived user
      const archivedUser = await tx.select().from(archivedUsers).where(eq(archivedUsers.id, archivedUserId)).limit(1);

      if (archivedUser.length === 0) {
        throw new Error("Archived user not found");
      }

      const userToRestore = archivedUser[0];
      const { archivedAt, archivedBy, ...userData } = userToRestore;

      // Pre-empt the case-insensitive unique-index collision from
      // `users_email_lower_unique` (migration 035). Without this
      // check, restoring an archived `Foo@x.com` while a live row
      // for `foo@x.com` already exists would surface as a raw
      // SQLSTATE 23505 from the INSERT below — the route layer
      // would dump that as a generic 500 with no useful message.
      // We do this lookup inside the same transaction so the check
      // and the INSERT see a consistent snapshot of `users`. We
      // skip the check when the archived row's email is NULL
      // because the unique index treats NULLs as distinct (Postgres
      // default) and there is therefore no collision to detect.
      // Task #543.
      if (userToRestore.email != null) {
        const collision = await tx
          .select({ id: users.id })
          .from(users)
          .where(sql`LOWER(${users.email}) = LOWER(${userToRestore.email})`)
          .limit(1);
        if (collision.length > 0) {
          throw new RestoreUserEmailConflictError({
            archivedUserId,
            archivedUserEmail: userToRestore.email,
            conflictingLiveUserId: collision[0].id,
          });
        }
      }

      // Insert back into users table.
      //
      // The pre-emptive check above closes the common case, but a
      // concurrent INSERT into `users` between the check and this
      // INSERT can still race us into the `users_email_lower_unique`
      // unique-violation. Catch SQLSTATE 23505 from that index and
      // re-raise as `RestoreUserEmailConflictError` so the route
      // layer can surface a 409 in the race case too — without
      // this, a race would still surface as a generic 500.
      // Task #543.
      try {
        // The CRM contact link isn't restored (the contact may have been
        // imported again since); the user comes back as added in CriteriaIQ.
        await tx.insert(users).values({
          ...userData,
          crmProvider: null,
          crmContactId: null,
          crmSyncedAt: null,
          crmEmail: null,
          crmContactMissingAt: null,
        });
      } catch (err: any) {
        if (
          err?.code === "23505" &&
          typeof err?.constraint === "string" &&
          (err.constraint === "users_email_lower_unique" ||
            err.constraint === "users_email_unique")
        ) {
          throw new RestoreUserEmailConflictError({
            archivedUserId,
            archivedUserEmail: userToRestore.email ?? null,
            conflictingLiveUserId: "(unknown — detected at INSERT time)",
          });
        }
        throw err;
      }

      // Re-attach the user to projects whose engineer slots still hold
      // the "(D)" placeholder string archiveUser stamped in. Without
      // this, the user is technically restored but every project they
      // used to own continues to display the garbled placeholder
      // instead of a real user id, breaking ownership lookups,
      // dropdowns, and filters that key on the user id.
      const placeholder = userToRestore.firstName && userToRestore.lastName
        ? `${userToRestore.firstName} ${userToRestore.lastName} (D)`
        : `${userToRestore.email} (D)`;

      await tx.update(projects)
        .set({ primaryEngineerId: archivedUserId })
        .where(eq(projects.primaryEngineerId, placeholder));

      await tx.update(projects)
        .set({ specialistEngineerId: archivedUserId })
        .where(eq(projects.specialistEngineerId, placeholder));

      // Swap the same placeholder back into the additional user-id
      // slots that `archiveUser` stamped (Task #533). Without this,
      // the user is restored but every project that used to carry
      // them as customer / TCC contact / creator continues to show
      // the garbled `"... (D)"` placeholder string instead of a
      // real user id, breaking the same ownership lookups,
      // dropdowns, and filters the engineer-slot restore covers
      // for primary / specialist engineer.
      await tx.update(projects)
        .set({ customerUserId: archivedUserId })
        .where(eq(projects.customerUserId, placeholder));

      await tx.update(projects)
        .set({ tccUserId: archivedUserId })
        .where(eq(projects.tccUserId, placeholder));

      await tx.update(projects)
        .set({ createdBy: archivedUserId })
        .where(eq(projects.createdBy, placeholder));

      // For supporting engineers (a text[] column), swap the
      // placeholder back to the user id in-place using array_replace
      // so we preserve the array's ordering and any other entries.
      await tx.execute(sql`
        UPDATE projects
        SET supporting_engineers = array_replace(supporting_engineers, ${placeholder}, ${archivedUserId})
        WHERE ${placeholder} = ANY(supporting_engineers)
      `);

      // Delete from archived table
      await tx.delete(archivedUsers).where(eq(archivedUsers.id, archivedUserId));

      return true;
    });
  }

  async restoreProject(archivedProjectId: number, restoredBy: string): Promise<boolean> {
    return await this.db.transaction(async (tx) => {
      // Get the archived project
      const archivedProject = await tx.select().from(archivedProjects).where(eq(archivedProjects.id, archivedProjectId)).limit(1);

      if (archivedProject.length === 0) {
        throw new Error("Archived project not found");
      }

      const projectToRestore = archivedProject[0];
      const { archivedAt, archivedBy, archivedReason, ...projectData } = projectToRestore;

      // The owning team or subteam may have been deleted while the project
      // was archived; clear what no longer exists (projects keeps FKs).
      if (projectData.teamId != null) {
        const [team] = await tx.select({ id: schema.teams.id }).from(schema.teams).where(eq(schema.teams.id, projectData.teamId));
        if (!team) projectData.teamId = null;
      }
      if (projectData.subteamId != null) {
        const [subteam] = await tx
          .select({ teamId: schema.subteams.teamId })
          .from(schema.subteams)
          .where(eq(schema.subteams.id, projectData.subteamId));
        if (!subteam || subteam.teamId !== projectData.teamId) projectData.subteamId = null;
      }

      // Insert back into projects table FIRST so the related rows we
      // restore below have a parent row to point at — successCriteria,
      // activityLogs, projectAudits, and customerAccess all carry a
      // NOT NULL `project_id` (some with FK constraints) and would be
      // rejected if the project row didn't exist yet.
      await tx.insert(projects).values(projectData);

      // Pull every companion archive row for this project, strip the
      // archive-only `archived_at` bookkeeping column, and reinsert
      // back into the source tables. The original `id` and
      // `project_id` are preserved so any lingering external
      // references (e.g. project_dependencies.success_criteria_id)
      // continue to resolve to the same row they did before archive.
      const archivedCriteriaRows = await tx
        .select()
        .from(archivedSuccessCriteria)
        .where(eq(archivedSuccessCriteria.projectId, archivedProjectId));
      if (archivedCriteriaRows.length > 0) {
        // The project's MAP phases were not archived, so the phase a
        // criterion was tested in no longer exists: clear it.
        await tx.insert(successCriteria).values(
          archivedCriteriaRows.map(({ archivedAt: _ignored, ...row }) => ({
            ...row,
            priority: normalizeCriterionPriority(row.priority),
            mapPhaseId: null,
          })),
        );
      }

      const archivedActivityRows = await tx
        .select()
        .from(archivedActivityLogs)
        .where(eq(archivedActivityLogs.projectId, archivedProjectId));
      if (archivedActivityRows.length > 0) {
        await tx.insert(activityLogs).values(
          archivedActivityRows.map(({ archivedAt: _ignored, ...row }) => row),
        );
      }

      const archivedAccessRows = await tx
        .select()
        .from(archivedCustomerAccess)
        .where(eq(archivedCustomerAccess.projectId, archivedProjectId));
      if (archivedAccessRows.length > 0) {
        await tx.insert(customerAccess).values(
          archivedAccessRows.map(({ archivedAt: _ignored, ...row }) => row),
        );
      }

      const archivedAuditRows = await tx
        .select()
        .from(archivedProjectAudits)
        .where(eq(archivedProjectAudits.projectId, archivedProjectId));
      if (archivedAuditRows.length > 0) {
        await tx.insert(projectAudits).values(
          archivedAuditRows.map(({ archivedAt: _ignored, ...row }) => row),
        );
      }

      // Delete the companion archive rows now that they live in the
      // source tables again — same parity check that
      // restoreUser/restoreCustomer make on their archive rows.
      await tx.delete(archivedSuccessCriteria).where(eq(archivedSuccessCriteria.projectId, archivedProjectId));
      await tx.delete(archivedActivityLogs).where(eq(archivedActivityLogs.projectId, archivedProjectId));
      await tx.delete(archivedCustomerAccess).where(eq(archivedCustomerAccess.projectId, archivedProjectId));
      await tx.delete(archivedProjectAudits).where(eq(archivedProjectAudits.projectId, archivedProjectId));

      // Delete from archived table
      await tx.delete(archivedProjects).where(eq(archivedProjects.id, archivedProjectId));

      return true;
    });
  }

  async restoreCustomer(archivedCustomerId: number, restoredBy: string): Promise<boolean> {
    return await this.db.transaction(async (tx) => {
      // Get the archived customer
      const archivedCustomer = await tx.select().from(archivedCustomers).where(eq(archivedCustomers.id, archivedCustomerId)).limit(1);

      if (archivedCustomer.length === 0) {
        throw new Error("Archived customer not found");
      }

      const customerToRestore = archivedCustomer[0];
      const { archivedAt, archivedBy, archivedReason, ...customerData } = customerToRestore;

      // While archived, its CRM account may have been linked to another
      // account. The CRM id is unique, so restore without it; the URL is
      // kept and the next save reports the conflict.
      if (customerData.crmProvider && customerData.crmAccountId) {
        const [holder] = await tx
          .select({ id: customers.id })
          .from(customers)
          .where(and(eq(customers.crmProvider, customerData.crmProvider), eq(customers.crmAccountId, customerData.crmAccountId)))
          .limit(1);
        if (holder) {
          customerData.crmProvider = null;
          customerData.crmAccountId = null;
          // Unlinked now, so nothing is CRM-managed any more.
          customerData.crmManagedFields = null;
          customerData.crmLinkedBy = null;
          customerData.crmRecordMissingAt = null;
        }
      }

      // Insert back into customers table
      await tx.insert(customers).values(customerData as typeof customers.$inferInsert);

      // Delete from archived table
      await tx.delete(archivedCustomers).where(eq(archivedCustomers.id, archivedCustomerId));

      return true;
    });
  }

  // Permanent delete methods for archived records with dependency checking
  async getDependenciesForArchivedUser(userId: string): Promise<{projects: {id: number, name: string}[], customers: {id: number, name: string}[]}> {
    // Check if user is referenced by any active projects (as owner/SE)
    const linkedProjects = await this.db.select({
      id: projects.id,
      name: projects.customerName
    }).from(projects).where(
      or(
        eq(projects.primaryEngineerId, userId),
        eq(projects.specialistEngineerId, userId),
        eq(projects.accountRepresentativeId, userId)
      )
    );

    // Check if user is referenced by any active customers (as account rep/engineer)
    const linkedCustomers = await this.db.select({
      id: customers.id,
      name: customers.accountName
    }).from(customers).where(
      or(
        eq(customers.accountRepresentativeId, userId),
        eq(customers.accountEngineerId, userId)
      )
    );

    return {
      projects: linkedProjects,
      customers: linkedCustomers
    };
  }

  async getDependenciesForArchivedProject(projectId: number): Promise<{customer: {id: number, name: string} | null}> {
    // Get the archived project to find its customer by name
    const archivedProject = await this.db.select().from(archivedProjects).where(eq(archivedProjects.id, projectId)).limit(1);
    
    if (archivedProject.length === 0 || !archivedProject[0].customerName) {
      return { customer: null };
    }

    // Check if a customer with the same name exists in active customers
    const customer = await this.db.select({
      id: customers.id,
      name: customers.accountName
    }).from(customers).where(eq(customers.accountName, archivedProject[0].customerName)).limit(1);

    return {
      customer: customer.length > 0 ? customer[0] : null
    };
  }

  async getDependenciesForArchivedCustomer(customerId: number): Promise<{projects: {id: number, name: string}[], users: {id: string, name: string}[]}> {
    // Find active projects linked to this customer
    const linkedProjects = await this.db.select({
      id: projects.id,
      name: projects.customerName
    }).from(projects).where(eq((projects as any).customerId, customerId));

    // Find active users with this customer as their account
    const linkedUsers = await this.db.select({
      id: users.id,
      name: sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.email}, ${users.id})`
    }).from(users).where(eq(users.accountId, customerId));

    return {
      projects: linkedProjects,
      users: linkedUsers
    };
  }

  async permanentlyDeleteArchivedUser(userId: string): Promise<boolean> {
    const result = await this.db.delete(archivedUsers).where(eq(archivedUsers.id, userId)).returning({ id: archivedUsers.id });
    return result.length > 0;
  }

  async permanentlyDeleteArchivedProject(projectId: number): Promise<boolean> {
    return await this.db.transaction(async (tx) => {
      // Purge the per-project related rows from each companion
      // archive table FIRST. Without this, "permanent delete" would
      // only drop the parent row and leave orphaned deliverables,
      // audit-trail entries, customer-access grants, and activity
      // logs behind in their respective archive companions — a data
      // retention/privacy issue once the operator has explicitly
      // asked to purge the project.
      await tx.delete(archivedSuccessCriteria).where(eq(archivedSuccessCriteria.projectId, projectId));
      await tx.delete(archivedActivityLogs).where(eq(archivedActivityLogs.projectId, projectId));
      await tx.delete(archivedCustomerAccess).where(eq(archivedCustomerAccess.projectId, projectId));
      await tx.delete(archivedProjectAudits).where(eq(archivedProjectAudits.projectId, projectId));

      const result = await tx.delete(archivedProjects).where(eq(archivedProjects.id, projectId)).returning({ id: archivedProjects.id });
      return result.length > 0;
    });
  }

  async permanentlyDeleteArchivedCustomer(customerId: number): Promise<boolean> {
    const result = await this.db.delete(archivedCustomers).where(eq(archivedCustomers.id, customerId)).returning({ id: archivedCustomers.id });
    return result.length > 0;
  }

  async permanentlyDeleteAllArchivedUsers(): Promise<number> {
    const result = await this.db.delete(archivedUsers).returning({ id: archivedUsers.id });
    return result.length;
  }

  async permanentlyDeleteAllArchivedProjects(): Promise<number> {
    return await this.db.transaction(async (tx) => {
      // Bulk purge: same reasoning as the single-project path above.
      // Truncate all four companion archive tables before deleting
      // from `archived_projects` so no orphaned related rows survive
      // a "delete all" operation.
      await tx.delete(archivedSuccessCriteria);
      await tx.delete(archivedActivityLogs);
      await tx.delete(archivedCustomerAccess);
      await tx.delete(archivedProjectAudits);

      const result = await tx.delete(archivedProjects).returning({ id: archivedProjects.id });
      return result.length;
    });
  }

  async permanentlyDeleteAllArchivedCustomers(): Promise<number> {
    const result = await this.db.delete(archivedCustomers).returning({ id: archivedCustomers.id });
    return result.length;
  }

  async initializeDefaultMapTemplate() {
    try {
      console.log('Checking for existing MAP templates...');
      const CANONICAL_NAME = "Standard Technical Validation";

      // Prefer matching the canonical row by name. If absent, only self-heal
      // a non-canonical row when it's the SOLE template in the DB (legacy
      // single-template upgrade path) — never silently take over a custom
      // template on installs that already curate multiple templates.
      const canonicalRows = await this.db
        .select()
        .from(mapTemplates)
        .where(eq(mapTemplates.name, CANONICAL_NAME))
        .limit(1);
      let existingTemplate = canonicalRows[0];
      if (!existingTemplate) {
        const allRows = await this.db.select().from(mapTemplates).limit(2);
        if (allRows.length === 1) {
          existingTemplate = allRows[0];
        }
        // allRows.length >= 2 → leave existingTemplate undefined so a fresh
        // canonical template is created alongside the curated custom rows.
      }

      const EXPECTED_PHASE_COUNT = DEFAULT_MAP_TEMPLATE_PHASE_DATA.length;
      const EXPECTED_STEP_COUNT = DEFAULT_MAP_TEMPLATE_STEP_DATA.length;
      const EXPECTED_TASK_COUNT = DEFAULT_MAP_TEMPLATE_EXPECTED_TASK_COUNT;

      const [phaseCountRow, stepCountRow, taskCountRow] = existingTemplate
        ? await Promise.all([
            this.db
              .select({ count: count() })
              .from(mapTemplatePhases)
              .where(eq(mapTemplatePhases.templateId, existingTemplate.id))
              .then((r) => r[0]),
            this.db
              .select({ count: count() })
              .from(mapTemplateSteps)
              .where(eq(mapTemplateSteps.templateId, existingTemplate.id))
              .then((r) => r[0]),
            this.db
              .select({ count: count() })
              .from(mapTemplateTasks)
              .where(eq(mapTemplateTasks.templateId, existingTemplate.id))
              .then((r) => r[0]),
          ])
        : [undefined, undefined, undefined];

      const phaseCount = Number(phaseCountRow?.count ?? 0);
      const stepCount = Number(stepCountRow?.count ?? 0);
      const taskCount = Number(taskCountRow?.count ?? 0);

      if (!existingTemplate) {
        console.log('No MAP templates found, creating default template...');

        const [defaultTemplate] = await this.db
          .insert(mapTemplates)
          .values({
            name: "Standard Technical Validation",
            description: "Default MAP template for technical validation projects",
            scope: "org",
            visibility: "org",
            isSystem: true,
            createdByUserId: null,
          })
          .returning();

        console.log(`Created default MAP template with ID: ${defaultTemplate.id}`);

        await this.populateDefaultMapTemplateChildren(defaultTemplate.id);
        await this.tagDefaultMapTemplateStages(defaultTemplate.id);

        console.log(
          `Created default MAP template with ${EXPECTED_PHASE_COUNT} phases, ${EXPECTED_STEP_COUNT} steps, ${EXPECTED_TASK_COUNT} tasks`,
        );
        return defaultTemplate;
      }

      // Backfill the platform-owned ownership markers (`isSystem=true`,
      // `createdByUserId=null`) but never rewrite the template's
      // `name` / `description` — admins are free to rename the seed
      // row (Task #704: "Admin-customized MAP templates are still
      // preserved"). The canonical name is only used to *find* the
      // row above; once located it is treated as the platform seed
      // regardless of what the admin chose to call it.
      if (
        existingTemplate.isSystem !== true ||
        existingTemplate.createdByUserId !== null
      ) {
        await this.db
          .update(mapTemplates)
          .set({ isSystem: true, createdByUserId: null })
          .where(eq(mapTemplates.id, existingTemplate.id));
        console.log(
          `MAP template ${existingTemplate.id}: backfilled isSystem=true, createdByUserId=null`,
        );
      }

      if (
        phaseCount === EXPECTED_PHASE_COUNT &&
        stepCount === EXPECTED_STEP_COUNT &&
        taskCount === EXPECTED_TASK_COUNT
      ) {
        await this.tagDefaultMapTemplateStages(existingTemplate.id);
        console.log(
          `MAP template complete (${phaseCount} phases / ${stepCount} steps / ${taskCount} tasks), skipping`,
        );
        return null;
      }

      console.log(
        `MAP template incomplete (${phaseCount}/${EXPECTED_PHASE_COUNT} phases, ` +
          `${stepCount}/${EXPECTED_STEP_COUNT} steps, ${taskCount}/${EXPECTED_TASK_COUNT} tasks), rebuilding...`,
      );
      const templateId = existingTemplate.id;

      // Cascade-clean to ensure deterministic rebuild.
      await this.db.delete(mapTemplateTasks).where(eq(mapTemplateTasks.templateId, templateId));
      await this.db.delete(mapTemplateSteps).where(eq(mapTemplateSteps.templateId, templateId));
      await this.db.delete(mapTemplatePhases).where(eq(mapTemplatePhases.templateId, templateId));
      await this.db
        .delete(mapTemplateApplications)
        .where(eq(mapTemplateApplications.templateId, templateId));

      await this.populateDefaultMapTemplateChildren(templateId);
      await this.tagDefaultMapTemplateStages(templateId);

      console.log(
        `Rebuilt template ${templateId} with ${EXPECTED_PHASE_COUNT} phases, ${EXPECTED_STEP_COUNT} steps, ${EXPECTED_TASK_COUNT} tasks`,
      );
      return existingTemplate;
    } catch (error) {
      console.error('Error initializing default MAP template:', error);
      throw error;
    }
  }

  /**
   * Tags the default template's phases with the journey stages, one stage per
   * phase in order (Planning → Plan … Onboarding → Handoff). Runs only while
   * none of its phases carries a stage, so an admin's own tagging stays.
   */
  private async tagDefaultMapTemplateStages(templateId: number): Promise<void> {
    const phases = await this.db
      .select({ id: mapTemplatePhases.id, stageId: mapTemplatePhases.stageId })
      .from(mapTemplatePhases)
      .where(eq(mapTemplatePhases.templateId, templateId))
      .orderBy(mapTemplatePhases.orderIndex, mapTemplatePhases.id);
    if (phases.length === 0 || phases.some((phase) => phase.stageId !== null)) return;
    const stages = await this.db
      .select({ id: journeyStages.id })
      .from(journeyStages)
      .orderBy(journeyStages.orderIndex, journeyStages.id);
    if (stages.length === 0) return;
    for (const [index, phase] of phases.entries()) {
      const stage = stages[Math.min(index, stages.length - 1)];
      await this.db
        .update(mapTemplatePhases)
        .set({ stageId: stage.id })
        .where(eq(mapTemplatePhases.id, phase.id));
    }
  }

  /**
   * Insert the canonical 5 phases / 11 steps / 29 tasks under
   * the given template id, using STABLE SLUG `local_key` values
   * so the join shape (`step.phase_local_key = phase.local_key`,
   * `task.{phase,step}_local_key = …`) matches across every
   * install. Shared between the create and rebuild branches of
   * `initializeDefaultMapTemplate` so the seed payload only ever
   * lives in one place.
   */
  private async populateDefaultMapTemplateChildren(templateId: number): Promise<void> {
    // Phases
    for (const phase of DEFAULT_MAP_TEMPLATE_PHASE_DATA) {
      await this.db.insert(mapTemplatePhases).values({
        templateId,
        localKey: phase.localKey,
        name: phase.name,
        description: phase.description,
        orderIndex: phase.orderIndex,
        sendExternalEmails: true,
        defaultStartOffsetDays: phase.orderIndex * 7,
        defaultDueOffsetDays: phase.orderIndex * 7 + 14,
      });
    }

    // Steps
    for (const step of DEFAULT_MAP_TEMPLATE_STEP_DATA) {
      await this.db.insert(mapTemplateSteps).values({
        templateId,
        phaseLocalKey: step.phaseLocalKey,
        localKey: step.localKey,
        name: step.name,
        description: step.description,
        orderIndex: step.orderIndex,
        defaultStatus: "not_started",
        sendExternalEmails: true,
        defaultStartOffsetDays: 0,
        defaultDueOffsetDays: 7,
        expectedDays: 1,
      });
    }

    // Tasks (29 rows, sourced from server/seed/default-map-template-tasks.ts)
    for (const task of DEFAULT_MAP_TEMPLATE_TASK_SEEDS) {
      await this.db.insert(mapTemplateTasks).values({
        templateId,
        phaseLocalKey: task.phase_local_key,
        stepLocalKey: task.step_local_key,
        name: task.name,
        description: task.description,
        orderIndex: task.order_index,
        defaultStatus: task.default_status,
        expectedHours: task.expected_hours,
        teamOwned: task.team_owned,
        sendExternalEmails: task.send_external_emails,
        defaultStartOffsetDays: task.default_start_offset_days,
        defaultDueOffsetDays: task.default_due_offset_days,
      });
    }
  }
}
