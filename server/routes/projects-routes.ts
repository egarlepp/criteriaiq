// Project routes (Phase 8 extraction #12) — core CRUD slice.
//
// 10 handlers covering the primary /api/projects surface:
//
//   GET    /api/projects
//   GET    /api/projects/kanban
//   PATCH  /api/projects/:id/status
//   POST   /api/projects/kanban/audit
//   GET    /api/projects/:id
//   POST   /api/projects
//   PUT    /api/projects/:id
//   PATCH  /api/projects/:id
//   POST   /api/projects/:id/customer-artifacts
//   DELETE /api/projects/:id
//
// Notes:
//   - Demo-mode filtering and per-customer access checks govern which
//     projects each session sees.
//   - Status changes broadcast via WebSocket and may dispatch a
//     status-change notification email.
//   - PATCH /api/projects/:id is the lighter "kanban-and-cards" path
//     that uses trackProjectChanges to write audit log entries.
//
// Other project-adjacent routes (gaps, assumptions, dependencies,
// audit, activities, notification-settings) live elsewhere in
// routes.ts and will be extracted in subsequent slices.
import { filterProjectsForViewer, isListedOnProject } from "../lib/project-list-access";
import type { Express } from "express";
import { eq, and, or, sql } from "drizzle-orm";
import { z } from "zod";
import { storage } from "../storage";
import { db } from "../db";
import { projects, customers, users, kanbanAuditEvents } from "@shared/schema";
import { insertProjectSchema } from "@shared/schema";
import { resolveProjectTeam } from "../lib/project-team-fields";
import { resolveProjectInfrastructureProfile } from "../lib/project-infrastructure-profile";
import { isAuthenticated } from "../auth/simpleAuth";
import { hasCustomerAccess } from "../lib/customer-access";
import { hasProjectEditAccess } from "../lib/project-access";
import { isExternalRole, requireInternalUser } from "../lib/internal-access";
import { projectForViewer, projectsForViewer } from "../lib/external-fields";
import { isCurrentRequestDemo } from "../lib/demo-mode";
import { trackProjectChanges } from "../auditHelper";
import { getBroadcaster } from "../services/websocket-broadcaster";
import { emitProjectCreated, emitProjectUpdated } from "../services/automation-events";
import {
  applyProjectCrmValues,
  crmLinkRefusal,
  evaluationLinkMatches,
  normalizeProjectCrmFields,
  parseProjectCrmFilters,
} from "../lib/crm-record-fields";
import { getCrmProviderId } from "../crm/provider-setting";
import { validationRecordRequired } from "@shared/crm-provider";
import { pickEndDateFlag } from "@shared/end-date-flags";

/** "YYYY-MM-DD" of a date in the server's local time, as the Kanban flags count. */
function localIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Fields that must NEVER be writable through PUT/PATCH /api/projects/:id.
 *
 * Two reasons a field lands here:
 *
 *   1. **Audit / ownership integrity.** `createdBy`, `archivedBy`,
 *      `archivedAt`, `archiveReason`, timestamps — these are managed
 *      by the server (createPoc / archiveProject) and have no
 *      legitimate caller-supplied value. Allowing them in a mass
 *      assignment lets any user with edit access on a project rewrite
 *      its history.
 *
 *   2. **Internal id form skips.** `primaryEngineerId`,
 *      `specialistEngineerId`, `supportingEngineers`,
 *      `accountRepresentativeId`, `opportunityEngineerId` — the form
 *      submits these via friendly keys (`primarySe`, `specialistSe`,
 *      etc.) which the route translates below. Accepting the *internal*
 *      ids straight from the body bypasses any future server-side
 *      sanitization on the friendly keys and is therefore disallowed
 *      defensively.
 *
 * Keep this list narrow — only fields with no legitimate POST/PUT
 * caller. Adding too many breaks the form. The downstream
 * `Object.keys(updates).forEach(...)` cleanup loop is unaffected.
 */
const DANGEROUS_PROJECT_FIELDS: ReadonlySet<string> = new Set([
  "id",
  "createdAt",
  "updatedAt",
  "createdBy",
  "archivedAt",
  "archivedBy",
  "archiveReason",
  "primaryEngineerId",
  "specialistEngineerId",
  "supportingEngineers",
  "accountRepresentativeId",
  "opportunityEngineerId",
  // Only the project owner (or an Admin) changes it, through
  // PATCH /api/projects/:id/map-scheduling.
  "scheduleByTaskOwner",
]);

function stripDangerousProjectFields(body: any): Record<string, any> {
  const out: Record<string, any> = {};
  if (!body || typeof body !== "object") return out;
  for (const [k, v] of Object.entries(body)) {
    if (DANGEROUS_PROJECT_FIELDS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Project fields a Customer, Partner or Guest with "Edit" access may change
 * through PATCH /api/projects/:id. Their edit access is for working the
 * project (MAP tasks, success criteria, Account Status); the project record
 * itself — team, access lists, dates, internal status — stays with staff.
 */
const EXTERNAL_EDITABLE_PROJECT_FIELDS: ReadonlySet<string> = new Set(["customerStatus"]);

export function registerProjectsRoutes(app: Express) {
  app.get('/api/projects', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const userEmail = req.session.user.email;
      const { status, customerName, search, limit = '50', offset = '0' } = req.query;

      // CRM lookup filters (crmOpportunityId, crmAccountId, evaluationId).
      // Salesforce ids match in 15- or 18-character form. Results go
      // through the same access rules below as an unfiltered list.
      const crmFilters = parseProjectCrmFilters(req.query);
      if (!crmFilters.ok) {
        return res.status(400).json({ message: crmFilters.message });
      }

      // Add pagination to prevent loading too much data at once
      const paginationOptions = {
        status: status as string,
        customerName: customerName as string,
        search: search as string,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        ...crmFilters.filters,
      };

      let projects = await storage.getProjects(userId, paginationOptions);

      const evaluationId = crmFilters.filters.evaluationId;
      if (evaluationId) {
        projects = projects.filter((project) => evaluationLinkMatches(project.salesforceEvaluationLink, evaluationId));
      }

      // Apply access control for restricted roles
      projects = filterProjectsForViewer(projects, userId, userRole, userEmail);

      // Add cache headers for better performance
      res.set({
        'Cache-Control': 'private, max-age=30', // Cache for 30 seconds
        'ETag': `"projects-${userId}-${Date.now()}"`
      });

      res.json(projectsForViewer(userRole, projects));
    } catch (error: any) {
      console.error("Error fetching Projects:", error);
      res.status(500).json({ message: "Failed to fetch Projects" });
    }
  });

  // Kanban Board endpoints
  // Staff only: the board lists every project with deal fields, and its raw
  // snake_case rows slip past projectsForViewer's field stripping.
  app.get('/api/projects/kanban', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const { view = 'all', dimension, filters } = req.query;

      // Fetch active end date flags for flag calculation
      const activeFlags = await storage.getActiveEndDateFlags();

      // Parse filters if provided as JSON string
      let parsedFilters: any = {};
      if (filters && typeof filters === 'string') {
        try {
          parsedFilters = JSON.parse(filters);
        } catch (e) {
          return res.status(400).json({ message: "Invalid filters JSON" });
        }
      }

      // Build WHERE clauses
      const whereClauses: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      // Apply "mine" filter
      if (view === 'mine') {
        params.push(userId);
        whereClauses.push(`(
          p.account_representative_id = $${paramIndex} 
          OR p.primary_engineer_id = $${paramIndex} 
          OR p.specialist_engineer_id = $${paramIndex} 
          OR $${paramIndex} = ANY(p.supporting_engineers)
        )`);
        paramIndex++;
      }

      // Apply status filters based on dimension
      if (parsedFilters.status && Array.isArray(parsedFilters.status) && parsedFilters.status.length > 0) {
        const statusPlaceholders = parsedFilters.status.map((_: any, i: number) => `$${paramIndex + i}`).join(', ');
        params.push(...parsedFilters.status);
        
        if (dimension === 'internal') {
          whereClauses.push(`p.status IN (${statusPlaceholders})`);
        } else if (dimension === 'risk') {
          whereClauses.push(`p.risk IN (${statusPlaceholders})`);
        } else if (dimension === 'ranking') {
          whereClauses.push(`p.ranking IN (${statusPlaceholders})`);
        }
        paramIndex += parsedFilters.status.length;
      }

      // Apply ACV range filter
      if (parsedFilters.acvMin !== undefined || parsedFilters.acvMax !== undefined) {
        const acvMin = parsedFilters.acvMin ? parseFloat(parsedFilters.acvMin) : 0;
        const acvMax = parsedFilters.acvMax ? parseFloat(parsedFilters.acvMax) : 999999999;
        
        params.push(acvMin, acvMax);
        whereClauses.push(`CAST(p.opportunity_acv_value AS NUMERIC) >= $${paramIndex} AND CAST(p.opportunity_acv_value AS NUMERIC) <= $${paramIndex + 1}`);
        paramIndex += 2;
      }

      // Apply tags filter
      if (parsedFilters.tags && Array.isArray(parsedFilters.tags) && parsedFilters.tags.length > 0) {
        params.push(parsedFilters.tags);
        whereClauses.push(`p.tags && $${paramIndex}::text[]`);
        paramIndex++;
      }

      // Demo-mode isolation — mirror the same filter that storage.getProjects() applies.
      // When demo is active the board shows only is_demo=true projects; when off it
      // shows only is_demo=false projects. Without this, demo data leaks through after
      // demo mode is toggled off because the raw SQL bypasses applyDemoFilter().
      // NOTE: embed the boolean as a SQL literal rather than a $N parameter — this raw
      // query uses sql.raw() which doesn't thread the params array into pg for booleans.
      // The value is server-derived (not user input) so there is no injection risk.
      const isDemoActive = isCurrentRequestDemo();
      whereClauses.push(`p.is_demo = ${isDemoActive ? 'true' : 'false'}`);

      // Build final WHERE clause
      const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      // Execute query with joins
      const queryText = `
        SELECT 
          p.*,
          json_build_object(
            'id', ar.id,
            'email', ar.email,
            'firstName', ar.first_name,
            'lastName', ar.last_name,
            'fullName', CONCAT(ar.first_name, ' ', ar.last_name),
            'role', json_build_object(
              'name', ar.role,
              'displayName', ar_role.display_name,
              'color', ar_role.color
            )
          ) as account_rep,
          json_build_object(
            'id', pe.id,
            'email', pe.email,
            'firstName', pe.first_name,
            'lastName', pe.last_name,
            'fullName', CONCAT(pe.first_name, ' ', pe.last_name),
            'role', json_build_object(
              'name', pe.role,
              'displayName', pe_role.display_name,
              'color', pe_role.color
            )
          ) as primary_engineer,
          json_build_object(
            'id', se.id,
            'email', se.email,
            'firstName', se.first_name,
            'lastName', se.last_name,
            'fullName', CONCAT(se.first_name, ' ', se.last_name),
            'role', json_build_object(
              'name', se.role,
              'displayName', se_role.display_name,
              'color', se_role.color
            )
          ) as specialist_engineer,
          COALESCE(
            (
              SELECT array_agg(DISTINCT prod.abbreviation ORDER BY prod.abbreviation)
              FROM products prod
              CROSS JOIN unnest(
                CASE 
                  WHEN p.solution_name IS NULL OR p.solution_name = '' THEN ARRAY[]::text[]
                  ELSE string_to_array(p.solution_name, ',')
                END
              ) AS solution_part_raw
              CROSS JOIN LATERAL (
                SELECT regexp_replace(trim(both from solution_part_raw), E'[\\u00A0\\r\\n\\t]+', ' ', 'g') AS solution_part
              ) AS normalized
              WHERE prod.is_active = true
                AND prod.abbreviation IS NOT NULL 
                AND prod.abbreviation != ''
                AND (
                  LOWER(TRIM(prod.name)) = LOWER(TRIM(normalized.solution_part))
                )
            ),
            ARRAY[]::text[]
          ) as product_abbreviations,
          c.region as customer_region,
          i.id as customer_industry_id,
          i.name as customer_industry_name,
          i.icon as customer_industry_icon
        FROM projects p
        LEFT JOIN users ar ON p.account_representative_id = ar.id
        LEFT JOIN roles ar_role ON ar.role = ar_role.name
        LEFT JOIN users pe ON p.primary_engineer_id = pe.id
        LEFT JOIN roles pe_role ON pe.role = pe_role.name
        LEFT JOIN users se ON p.specialist_engineer_id = se.id
        LEFT JOIN roles se_role ON se.role = se_role.name
        LEFT JOIN customers c ON LOWER(TRIM(p.customer_name)) = LOWER(TRIM(c.account_name))
        LEFT JOIN industries i ON c.industry_id = i.id
        ${whereClause}
      `;

      const result = await db.execute((sql.raw as any)(queryText, params));
      const rows = result.rows as any[];

      // Helper function to compute ACV band
      const getAcvBand = (acvValue: string | null): string => {
        if (!acvValue) return '0-10k';
        const numValue = parseFloat(acvValue);
        if (isNaN(numValue)) return '0-10k';
        
        if (numValue <= 10000) return '0-10k';
        if (numValue <= 25000) return '11k-25k';
        if (numValue <= 50000) return '26k-50k';
        if (numValue <= 75000) return '51k-75k';
        if (numValue <= 100000) return '76k-100k';
        if (numValue <= 200000) return '100k-200k';
        if (numValue <= 300000) return '200k-300k';
        return '300k+';
      };

      // Helper function to compute LOE days
      const getLoeDays = (startDate: string | null, endDate: string | null): number | null => {
        if (!startDate || !endDate) return null;
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffTime = end.getTime() - start.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays > 0 ? diffDays : null;
      };

      // Which end date flag applies to a project (shared/end-date-flags.ts).
      // Working-day flags skip weekends and the default holiday calendars.
      const todayIso = localIsoDate(new Date());
      const flagCalendar = {
        holidays:
          (await storage.getHolidayDatesForUsers(
            [null],
            todayIso,
            localIsoDate(new Date(Date.now() + 400 * 86_400_000)),
          )).get(null) ?? new Set<string>(),
      };
      const getEndDateFlag = (endDate: string | null, projectStatus: string | null, flags: any[]): any => {
        if (!endDate || !flags || flags.length === 0) return null;
        try {
          // ISO ("2025-10-29T00:00:00.000Z"), datetime ("2025-10-29 00:00:00") or date-only.
          const raw = endDate as unknown;
          const dueIso = raw instanceof Date ? localIsoDate(raw) : String(raw).slice(0, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dueIso)) return null;
          const topFlag = pickEndDateFlag(flags, { todayIso, dueIso, projectStatus, calendar: flagCalendar });
          if (!topFlag) return null;
          // Return only the fields needed for border color
          return {
            name: topFlag.name,
            badgeColor: topFlag.badgeColor,
            priority: topFlag.priority
          };
        } catch (error: any) {
          console.error('Error calculating end date flag:', error);
          return null;
        }
      };

      // Map results to Kanban format
      const kanbanProjects = rows.map((row) => {
        const { account_rep, primary_engineer, specialist_engineer, product_abbreviations, ...project } = row;
        
        // Calculate which end date flag applies to this project
        const endDateFlag = getEndDateFlag(project.end_date, project.status, activeFlags);
        
        return {
          ...project,
          accountRep: account_rep?.id ? account_rep : null,
          primaryEngineer: primary_engineer?.id ? primary_engineer : null,
          specialistEngineer: specialist_engineer?.id ? specialist_engineer : null,
          accountRepId: project.account_representative_id,
          primaryEngineerId: project.primary_engineer_id,
          specialistEngineerId: project.specialist_engineer_id,
          productAbbreviations: product_abbreviations || [],
          acvBand: getAcvBand(project.opportunity_acv_value),
          loeDays: getLoeDays(project.start_date, project.end_date),
          startDate: project.start_date,
          endDate: project.end_date,
          completedDate: project.completed_date,
          endDateFlag: endDateFlag,
        };
      });

      res.json(projectsForViewer(userRole, kanbanProjects));
    } catch (error: any) {
      console.error("Error fetching Kanban projects:", error);
      res.status(500).json({ message: "Failed to fetch Kanban projects" });
    }
  });

  app.patch('/api/projects/:id/status', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.id as string);
      const { dimension, statusId } = req.body;
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const userEmail = req.session.user.email;

      if (!dimension || !statusId) {
        return res.status(400).json({ message: "dimension and statusId are required" });
      }

      // RBAC: Check if user has edit access to this project
      const hasEditAccess = await hasProjectEditAccess(userId, userRole, userEmail, projectId);
      if (!hasEditAccess) {
        return res.status(403).json({ message: "You do not have permission to update this project's status" });
      }

      // Map dimension to field
      let fieldToUpdate: string;
      if (dimension === 'internal') {
        fieldToUpdate = 'status';
      } else if (dimension === 'risk') {
        fieldToUpdate = 'risk';
      } else if (dimension === 'ranking') {
        fieldToUpdate = 'ranking';
      } else {
        return res.status(400).json({ message: "Invalid dimension. Must be 'internal', 'risk', or 'ranking'" });
      }

      // Update project
      const updateData: any = {
        [fieldToUpdate]: statusId,
        updatedAt: new Date(),
      };

      const originalProject = await storage.getPoc(projectId);

      const [updatedProject] = await db
        .update(projects)
        .set(updateData)
        .where(eq(projects.id, projectId))
        .returning();

      if (!updatedProject) {
        return res.status(404).json({ message: "Project not found" });
      }

      if (originalProject) {
        emitProjectUpdated(originalProject, updatedProject, userId);
      }

      // Broadcast WebSocket event
      const broadcaster = getBroadcaster();
      if (broadcaster) {
        broadcaster.broadcastMapUpdate({
          type: 'map_update',
          action: 'updated',
          targetType: 'map_project',
          targetId: projectId,
          projectId: projectId,
          userId: req.session.user.id,
          data: { dimension, statusId }
        });
      }

      // Push the change to Salesforce if this project is linked (queued,
      // debounced, retried; never blocks or fails this save).
      void import('../salesforce/index.js')
        .then(({ salesforceSyncService }) => salesforceSyncService.queueOutboundSyncIfLinked('project', String(projectId), userId))
        .catch((sfError) => console.error('Failed to queue Salesforce sync:', sfError));

      res.json(projectForViewer(req.session.user.role, updatedProject));
    } catch (error: any) {
      console.error("Error updating project status:", error);
      res.status(500).json({ message: "Failed to update project status" });
    }
  });

  app.post('/api/projects/kanban/audit', isAuthenticated, async (req: any, res) => {
    try {
      const { events } = req.body;

      if (!events || !Array.isArray(events)) {
        return res.status(400).json({ message: "events array is required" });
      }

      if (events.length === 0) {
        return res.json({ success: true, count: 0 });
      }

      // Insert audit events
      await db.insert(kanbanAuditEvents).values(events);

      res.json({ success: true, count: events.length });
    } catch (error: any) {
      console.error("Error persisting Kanban audit events:", error);
      res.status(500).json({ message: "Failed to persist audit events" });
    }
  });

  app.get('/api/projects/:id', isAuthenticated, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id as string);
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const userEmail = req.session.user.email;

      const project = await storage.getPoc(projectId);

      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Apply access control for restricted roles
      const restrictedRoles = ['Customer', 'Guest', 'Sales', 'Partner', 'CX', 'Product'];
      if (restrictedRoles.includes(userRole as string)) {
        let hasAccess = false;

        // Check if user is assigned engineer
        if (project.primaryEngineerId === userId ||
            project.specialistEngineerId === userId ||
            (project.supportingEngineers && project.supportingEngineers.includes(userId))) {
          hasAccess = true;
        }

        // Check customer access and additional access (stored or enriched entry shape)
        if (!hasAccess && isListedOnProject(project, userId, userEmail)) {
          hasAccess = true;
        }

        if (!hasAccess) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      // Map customerArtifacts back to uploadedFiles for frontend compatibility
      if (project.customerArtifacts) {
        (project as any).uploadedFiles = project.customerArtifacts;
      }

      // Track last accessed project for Flight Deck "Resume" widget
      try {
        await storage.db
          .update(users)
          .set({ lastAccessedProjectId: projectId })
          .where(eq(users.id, userId));
      } catch (trackError) {
        console.error("Error tracking last accessed project:", trackError);
      }

      // Add audit count to response (matches projects list endpoint)
      const auditCount = await storage.getProjectAuditCount(projectId);

      res.json(projectForViewer(userRole, { ...project, auditCount: String(auditCount) }));
    } catch (error: any) {
      console.error("Error fetching Project:", error);
      res.status(500).json({ message: "Failed to fetch Project" });
    }
  });

  app.post('/api/projects', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;

      // Convert date strings to Date objects if they exist
      const requestBody = { ...req.body };
      delete requestBody.projectCompetingWith;
      if (requestBody.startDate && typeof requestBody.startDate === 'string') {
        requestBody.startDate = new Date(requestBody.startDate);
      }
      if (requestBody.endDate && typeof requestBody.endDate === 'string') {
        requestBody.endDate = new Date(requestBody.endDate);
      }

      // Convert solutionName from array to string (join with commas)
      if (requestBody.solutionName && Array.isArray(requestBody.solutionName)) {
        requestBody.solutionName = requestBody.solutionName.join(", ");
      }

      // Map projectName from form to name field in database
      if (requestBody.projectName) {
        requestBody.name = requestBody.projectName;
        delete requestBody.projectName;
      }

      // Convert string IDs for SE fields (user IDs, not SE IDs)
      if (requestBody.primarySe) {
        requestBody.primaryEngineerId = requestBody.primarySe; // Keep as string since these are user IDs
        delete requestBody.primarySe;
      }
      if (requestBody.specialistSe && requestBody.specialistSe !== "none") {
        requestBody.specialistEngineerId = requestBody.specialistSe; // Keep as string since these are user IDs
        delete requestBody.specialistSe;
      } else if (requestBody.specialistSe === "none") {
        requestBody.specialistEngineerId = null;
        delete requestBody.specialistSe;
      }
      if (requestBody.supportingSalesEngineers) {
        requestBody.supportingSes = requestBody.supportingSalesEngineers; // Keep as string array
        delete requestBody.supportingSalesEngineers;
      }
      if (requestBody.additionalSupportingTeam) {
        requestBody.additionalSupportingTeam = requestBody.additionalSupportingTeam; // Keep as string array
      }
      if (requestBody.accountRepresentative) {
        requestBody.accountRepresentativeId = requestBody.accountRepresentative; // Keep as string since it's a user ID
        delete requestBody.accountRepresentative;
      }
      if (requestBody.opportunityEngineer && requestBody.opportunityEngineer !== "none") {
        requestBody.opportunityEngineerId = requestBody.opportunityEngineer; // Keep as string since it's a user ID
        delete requestBody.opportunityEngineer;
      } else if (requestBody.opportunityEngineer === "none") {
        requestBody.opportunityEngineerId = null;
        delete requestBody.opportunityEngineer;
      }

      const crm = normalizeProjectCrmFields(requestBody);
      if (!crm.ok) {
        return res.status(400).json({ message: crm.message });
      }
      const installCrm = await getCrmProviderId();
      const crmRefusal = crmLinkRefusal(crm.values, null, installCrm);
      if (crmRefusal) {
        return res.status(400).json({ message: crmRefusal, errorCode: "crm_provider_mismatch" });
      }
      applyProjectCrmValues(requestBody, crm.values);

      // The validation record link is required only while a CRM is active.
      const evaluationLink =
        typeof requestBody.salesforceEvaluationLink === "string" ? requestBody.salesforceEvaluationLink.trim() : "";
      if (!evaluationLink && validationRecordRequired(installCrm)) {
        return res.status(400).json({
          message: "A validation record link is required while a CRM is in use",
          errorCode: "validation_record_required",
        });
      }
      requestBody.salesforceEvaluationLink = evaluationLink || null;

      // Owning team: as sent, else the primary engineer's default team, else
      // the creator's. Teams only organize and filter (docs/features/teams.md).
      const teamFields = await resolveProjectTeam(requestBody, null, storage);
      if (!teamFields.ok) {
        return res.status(400).json({ message: teamFields.message, errorCode: teamFields.code });
      }
      delete requestBody.teamId;
      delete requestBody.subteamId;
      Object.assign(requestBody, teamFields.values);
      if (requestBody.teamId === undefined) {
        const owner = typeof requestBody.primaryEngineerId === "string" ? requestBody.primaryEngineerId : userId;
        requestBody.teamId = (await storage.getDefaultTeamId(owner)) ?? (await storage.getDefaultTeamId(userId));
      }

      // Infrastructure Discovery profile: must be one of the chosen account's.
      const infraProfile = await resolveProjectInfrastructureProfile(requestBody, null, storage);
      if (!infraProfile.ok) {
        return res.status(400).json({ message: infraProfile.message, errorCode: infraProfile.code });
      }
      delete requestBody.infrastructureProfileId;
      Object.assign(requestBody, infraProfile.values);

      const projectData = insertProjectSchema.parse({
        ...requestBody,
        assignedSeId: userId,
        createdBy: userId, // Track who created this project
      });

      const project = await storage.createPoc(projectData);

      // Append project ID to the name to ensure uniqueness (e.g., "RBS-NA-NDC" becomes "RBS-NA-NDC-17")
      if (project.name && !project.name.endsWith(`-${project.id}`)) {
        const updatedName = `${project.name}-${project.id}`;
        await storage.updatePoc(project.id, { name: updatedName });
        project.name = updatedName; // Update local reference for response
      }

      // Increment template usage count if project was created from a template
      if (projectData.templateId) {
        await storage.incrementTemplateUsage(projectData.templateId);
      }

      // Create project MAP from template if mapTemplateId is provided
      if (req.body.mapTemplateId) {
        try {
          console.log(`Creating project MAP from template ${req.body.mapTemplateId} for project ${project.id}`);
          await storage.createProjectMapFromTemplate(project.id, parseInt(req.body.mapTemplateId), userId);
          console.log(`Successfully created project MAP for project ${project.id}`);
        } catch (mapError) {
          console.error("Error creating project MAP from template:", mapError);
          // Log the error but don't fail the project creation
        }
      }

      // Save customer access permissions if provided
      if (req.body.customerUsers && Array.isArray(req.body.customerUsers)) {
        await storage.setCustomerAccessForPoc(project.id, req.body.customerUsers);
      }

      // Handle additional access for new project
      if (req.body.additionalAccess) {
        await storage.updatePoc(project.id, { additionalAccess: req.body.additionalAccess });
      }

      // Handle uploaded files for new project - map to customerArtifacts
      if (req.body.uploadedFiles) {
        await storage.updatePoc(project.id, { customerArtifacts: req.body.uploadedFiles });
      }

      // Log activity
      await storage.createActivityLog({
        projectId: project.id,
        userId,
        action: "created",
        details: `Created Project: ${project.solutionName}`,
        targetType: "project",
        targetId: project.id,
      });

      emitProjectCreated(project, userId);

      res.status(201).json(project);
    } catch (error: any) {
      console.error("Error creating Project:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.issues });
      }
      res.status(500).json({ message: "Failed to create Project" });
    }
  });

  app.put('/api/projects/:id', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.id as string);
      if (isNaN(projectId)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const userEmail = req.session.user.email;

      // RBAC: Check edit access before reading or mutating the project.
      // Without this, any authenticated user (Customer / Guest / Partner)
      // could mutate any project by incrementing the integer id.
      const hasEditAccess = await hasProjectEditAccess(userId, userRole, userEmail, projectId);
      if (!hasEditAccess) {
        return res.status(403).json({ message: "You do not have permission to edit this project" });
      }

      // Get original project data for audit tracking
      const originalProject = await storage.getPoc(projectId);

      // Strip fields that should NEVER be writable via this route, then
      // spread the rest. The downstream pipeline already maps the form
      // shape (primarySe → primaryEngineerId, etc.), so this blocklist
      // only blocks fields that the form has no legitimate reason to
      // send — anything that would let a caller take over ownership,
      // un-archive a row, rewrite audit fields, or swap engineer ids
      // by their *internal* names (the legit path goes through the
      // primarySe/specialistSe form keys, which then get translated).
      const updates = stripDangerousProjectFields(req.body);
      delete updates.projectCompetingWith;

      if (updates.startDate && typeof updates.startDate === 'string') {
        updates.startDate = new Date(updates.startDate);
      }
      if (updates.endDate && typeof updates.endDate === 'string') {
        updates.endDate = new Date(updates.endDate);
      }

      // Convert solutionName from array to string (join with commas)
      if (updates.solutionName && Array.isArray(updates.solutionName)) {
        updates.solutionName = updates.solutionName.join(", ");
      }

      // Map projectName from form to name field in database
      if (updates.projectName !== undefined) {
        updates.name = updates.projectName;
        delete updates.projectName;
      }

      // Ensure opportunityAcvValue is preserved even if it's an empty string
      if (updates.opportunityAcvValue !== undefined) {
        if (updates.opportunityAcvValue === '' || updates.opportunityAcvValue === null) {
          updates.opportunityAcvValue = '$0.00';
        }
      }

      // Convert SE fields (these are user IDs - keep as strings)
      console.log("Engineer field data received:", {
        primarySe: updates.primarySe,
        specialistSe: updates.specialistSe,
        supportingSalesEngineers: updates.supportingSalesEngineers
      });

      if (updates.primarySe !== undefined) {
        console.log("Processing primarySe:", updates.primarySe, "type:", typeof updates.primarySe);
        if (updates.primarySe === "" || updates.primarySe === "none") {
          updates.primaryEngineerId = null;
          console.log("Set primaryEngineerId to null");
        } else {
          updates.primaryEngineerId = updates.primarySe; // Keep as string since it's a user ID
          console.log("Set primaryEngineerId to:", updates.primaryEngineerId);
        }
        delete updates.primarySe;
      }
      if (updates.specialistSe !== undefined) {
        console.log("Processing specialistSe:", updates.specialistSe, "type:", typeof updates.specialistSe);
        if (updates.specialistSe === "none" || updates.specialistSe === "") {
          updates.specialistEngineerId = null;
          console.log("Set specialistEngineerId to null");
        } else {
          updates.specialistEngineerId = updates.specialistSe; // Keep as string since it's a user ID
          console.log("Set specialistEngineerId to:", updates.specialistEngineerId);
        }
        delete updates.specialistSe;
      }
      if (updates.supportingSalesEngineers !== undefined) {
        console.log("Processing supportingSalesEngineers:", updates.supportingSalesEngineers, "type:", typeof updates.supportingSalesEngineers, "isArray:", Array.isArray(updates.supportingSalesEngineers));
        if (Array.isArray(updates.supportingSalesEngineers)) {
          updates.supportingEngineers = updates.supportingSalesEngineers; // Keep as string array since these are user IDs
          console.log("Set supportingEngineers to:", updates.supportingEngineers);
        } else {
          updates.supportingEngineers = [];
          console.log("Set supportingEngineers to empty array");
        }
        delete updates.supportingSalesEngineers;
      }
      if (updates.additionalSupportingTeam !== undefined) {
        console.log("Processing additionalSupportingTeam:", updates.additionalSupportingTeam, "type:", typeof updates.additionalSupportingTeam, "isArray:", Array.isArray(updates.additionalSupportingTeam));
        if (Array.isArray(updates.additionalSupportingTeam)) {
          updates.additionalSupportingTeam = updates.additionalSupportingTeam; // Keep as string array since these are user IDs
          console.log("Set additionalSupportingTeam to:", updates.additionalSupportingTeam);
        } else {
          updates.additionalSupportingTeam = [];
          console.log("Set additionalSupportingTeam to empty array");
        }
      }
      if (updates.accountRepresentative !== undefined) {
        console.log("Processing accountRepresentative:", updates.accountRepresentative, "type:", typeof updates.accountRepresentative);
        if (updates.accountRepresentative === "none" || updates.accountRepresentative === "") {
          updates.accountRepresentativeId = null;
          console.log("Set accountRepresentativeId to null");
        } else {
          updates.accountRepresentativeId = updates.accountRepresentative; // Keep as string since it's a user ID
          console.log("Set accountRepresentativeId to:", updates.accountRepresentativeId);
        }
        delete updates.accountRepresentative;
      }
      if (updates.opportunityEngineer !== undefined) {
        console.log("Processing opportunityEngineer:", updates.opportunityEngineer, "type:", typeof updates.opportunityEngineer);
        if (updates.opportunityEngineer === "none" || updates.opportunityEngineer === "") {
          updates.opportunityEngineerId = null;
          console.log("Set opportunityEngineerId to null");
        } else {
          updates.opportunityEngineerId = updates.opportunityEngineer; // Keep as string since it's a user ID
          console.log("Set opportunityEngineerId to:", updates.opportunityEngineerId);
        }
        delete updates.opportunityEngineer;
      }

      // CRM record ids: normalize (Salesforce ids to 18 characters) and
      // apply after the cleanup below, so a blank value clears the field
      // instead of being dropped.
      const crm = normalizeProjectCrmFields(updates);
      if (!crm.ok) {
        return res.status(400).json({ message: crm.message });
      }
      const installCrm = await getCrmProviderId();
      const crmRefusal = crmLinkRefusal(crm.values, originalProject?.crmProvider, installCrm);
      if (crmRefusal) {
        return res.status(400).json({ message: crmRefusal, errorCode: "crm_provider_mismatch" });
      }
      applyProjectCrmValues(updates, {});
      const teamFields = await resolveProjectTeam(updates, originalProject ?? null, storage);
      if (!teamFields.ok) {
        return res.status(400).json({ message: teamFields.message, errorCode: teamFields.code });
      }
      delete updates.teamId;
      delete updates.subteamId;
      const infraProfile = await resolveProjectInfrastructureProfile(updates, originalProject ?? null, storage);
      if (!infraProfile.ok) {
        return res.status(400).json({ message: infraProfile.message, errorCode: infraProfile.code });
      }
      delete updates.infrastructureProfileId;
      // A blank validation record link clears it only when no CRM is in use;
      // with a CRM the cleanup below drops it and the saved link is kept.
      if (updates.salesforceEvaluationLink === "" && !validationRecordRequired(installCrm)) {
        updates.salesforceEvaluationLink = null;
      }

      // Clean up any undefined or empty string values that might cause issues
      // BUT preserve date fields and opportunityAcvValue field even if empty
      Object.keys(updates).forEach(key => {
        if (key !== 'opportunityAcvValue' && key !== 'startDate' && key !== 'endDate' &&
            (updates[key] === undefined || updates[key] === '' || updates[key] === 'undefined')) {
          delete updates[key];
        }
      });

      Object.assign(updates, crm.values, teamFields.values, infraProfile.values);

      // Handle customer access permissions if provided
      if (req.body.customerUsers && Array.isArray(req.body.customerUsers)) {
        await storage.setCustomerAccessForPoc(projectId, req.body.customerUsers);
      }

      // Handle additional access storage - store in database as JSON
      if (req.body.additionalAccess !== undefined) {
        updates.additionalAccess = req.body.additionalAccess;
      }

      // Handle uploaded files - map to customerArtifacts in database
      if (req.body.uploadedFiles !== undefined) {
        console.log("Processing uploadedFiles:", req.body.uploadedFiles);
        updates.customerArtifacts = req.body.uploadedFiles;
      }

      console.log("Cleaned updates to be sent to database:", updates);
      console.log("Engineer field updates being processed:", {
        primaryEngineerId: updates.primaryEngineerId,
        specialistEngineerId: updates.specialistEngineerId,
        supportingEngineers: updates.supportingEngineers
      });

      const updatedProject = await storage.updatePoc(projectId, updates);
      console.log("Updated Project result with engineer fields:", {
        id: updatedProject.id,
        primaryEngineerId: updatedProject.primaryEngineerId,
        specialistEngineerId: updatedProject.specialistEngineerId,
        supportingEngineers: updatedProject.supportingEngineers
      });

      // Track changes for audit
      if (originalProject) {
        await trackProjectChanges(
          projectId,
          originalProject,
          updatedProject,
          userId,
          req.session.user.email || '',
          `${req.session.user.firstName || ''} ${req.session.user.lastName || ''}`.trim() || req.session.user.email || 'Unknown User'
        );
      }

      // Log activity
      await storage.createActivityLog({
        projectId,
        userId,
        action: "updated",
        details: `Updated Project: ${updatedProject.solutionName}`,
        targetType: "project",
        targetId: projectId,
      });

      if (originalProject) {
        emitProjectUpdated(originalProject, updatedProject, userId);
      }

      // Push the change to Salesforce if this project is linked (queued,
      // debounced, retried; never blocks or fails this save).
      void import('../salesforce/index.js')
        .then(({ salesforceSyncService }) => salesforceSyncService.queueOutboundSyncIfLinked('project', String(projectId), userId))
        .catch((sfError) => console.error('Failed to queue Salesforce sync:', sfError));

      res.json(projectForViewer(req.session.user.role, updatedProject));
    } catch (error: any) {
      console.error("Error updating Project:", error);
      res.status(500).json({ message: "Failed to update Project" });
    }
  });

  app.patch('/api/projects/:id', isAuthenticated, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.id as string);

      // Validate project ID
      if (isNaN(projectId)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const userEmail = req.session.user.email;

      // RBAC: same gate as PUT — see comment there for rationale.
      const hasEditAccess = await hasProjectEditAccess(userId, userRole, userEmail, projectId);
      if (!hasEditAccess) {
        return res.status(403).json({ message: "You do not have permission to edit this project" });
      }

      if (isExternalRole(userRole)) {
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const blocked = Object.keys(body).filter((key) => !EXTERNAL_EDITABLE_PROJECT_FIELDS.has(key));
        if (blocked.length > 0) {
          return res.status(403).json({ message: "You do not have permission to change these project fields" });
        }
      }

      const updates = stripDangerousProjectFields(req.body);

      const crm = normalizeProjectCrmFields(updates);
      if (!crm.ok) {
        return res.status(400).json({ message: crm.message });
      }
      applyProjectCrmValues(updates, crm.values);

      // Validate that risk and ranking values are valid if provided
      if (updates.risk && !['Low', 'Medium', 'High'].includes(updates.risk)) {
        return res.status(400).json({ message: "Risk level must be Low, Medium, or High" });
      }

      if (updates.ranking && !['1 - High', '2 - Medium', '3 - Low'].includes(updates.ranking)) {
        return res.status(400).json({ message: "Ranking must be 1 - High, 2 - Medium, or 3 - Low" });
      }

      // Get original project for audit tracking
      const originalProject = await storage.getPoc(projectId);
      if (!originalProject) {
        return res.status(404).json({ message: "Project not found" });
      }
      const crmRefusal = crmLinkRefusal(crm.values, originalProject.crmProvider, await getCrmProviderId());
      if (crmRefusal) {
        return res.status(400).json({ message: crmRefusal, errorCode: "crm_provider_mismatch" });
      }
      const teamFields = await resolveProjectTeam(updates, originalProject, storage);
      if (!teamFields.ok) {
        return res.status(400).json({ message: teamFields.message, errorCode: teamFields.code });
      }
      delete updates.teamId;
      delete updates.subteamId;
      Object.assign(updates, teamFields.values);
      const infraProfile = await resolveProjectInfrastructureProfile(updates, originalProject, storage);
      if (!infraProfile.ok) {
        return res.status(400).json({ message: infraProfile.message, errorCode: infraProfile.code });
      }
      delete updates.infrastructureProfileId;
      Object.assign(updates, infraProfile.values);

      // Handle customer access permissions if provided
      if (req.body.customerUsers && Array.isArray(req.body.customerUsers)) {
        await storage.setCustomerAccessForPoc(projectId, req.body.customerUsers);
      }

      // Handle additional access storage - store in database as JSON
      if (req.body.additionalAccess !== undefined) {
        updates.additionalAccess = req.body.additionalAccess;
      }

      const updatedProject = await storage.updatePoc(projectId, updates);

      // Track changes for audit
      await trackProjectChanges(
        projectId,
        originalProject,
        updatedProject,
        userId,
        req.session.user.email || '',
        `${req.session.user.firstName || ''} ${req.session.user.lastName || ''}`.trim() || req.session.user.email || 'Unknown User'
      );

      // Log activity
      await storage.createActivityLog({
        projectId,
        userId,
        action: "updated",
        details: `Updated Project: ${updatedProject.solutionName}`,
        targetType: "project",
        targetId: projectId,
      });

      if (originalProject) {
        emitProjectUpdated(originalProject, updatedProject, userId);
      }

      // Push the change to Salesforce if this project is linked (queued,
      // debounced, retried; never blocks or fails this save).
      void import('../salesforce/index.js')
        .then(({ salesforceSyncService }) => salesforceSyncService.queueOutboundSyncIfLinked('project', String(projectId), userId))
        .catch((sfError) => console.error('Failed to queue Salesforce sync:', sfError));

      res.json(projectForViewer(req.session.user.role, updatedProject));
    } catch (error: any) {
      console.error("Error updating Project:", error);
      res.status(500).json({ message: "Failed to update Project" });
    }
  });

  // Customer artifacts upload endpoint
  app.post('/api/projects/:id/customer-artifacts', isAuthenticated, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.id as string);
      const userId = req.session.user.id;
      const { fileName, fileType, fileData } = req.body;

      // Get current project to append to existing customer artifacts
      const project = await storage.getPoc(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const currentArtifacts = project.customerArtifacts || [];
      const newArtifact = {
        name: fileName,
        type: fileType,
        data: fileData,
        uploadedBy: userId,
        uploadedAt: new Date().toISOString()
      };

      const updatedArtifacts = [...(currentArtifacts as any[]), newArtifact];

      // Update project with new customer artifacts
      await storage.updatePoc(projectId, { customerArtifacts: updatedArtifacts });

      // Log activity
      await storage.createActivityLog({
        projectId,
        userId,
        action: "uploaded_customer_artifact",
        details: `Uploaded customer artifact: ${fileName}`,
        targetType: "project",
        targetId: projectId,
      });

      res.json({ success: true, artifact: newArtifact });
    } catch (error: any) {
      console.error("Error uploading customer artifact:", error);
      res.status(500).json({ message: "Failed to upload customer artifact" });
    }
  });

  app.delete('/api/projects/:id', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.id as string);
      if (isNaN(projectId)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const userEmail = req.session.user.email;

      // RBAC: archive (soft-delete) requires edit access — same gate as
      // PUT/PATCH. Without this, any authenticated user could archive
      // any project by guessing the integer id.
      const hasEditAccess = await hasProjectEditAccess(userId, userRole, userEmail, projectId);
      if (!hasEditAccess) {
        return res.status(403).json({ message: "You do not have permission to archive this project" });
      }

      // Get project details for logging before archival
      const project = await storage.getPoc(projectId);
      const projectName = project?.solutionName || `Project ${projectId}`;

      // Pull the operator-supplied reason (if any) from the request body so it
      // is persisted alongside the archived row. Falls back to the legacy
      // sentinel when no reason was provided to keep older clients working.
      const rawReason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
      const reason = rawReason.length > 0 ? rawReason : 'Archived via delete action';

      // Archive the project instead of deleting it
      await storage.archiveProject(projectId, userId, reason);

      res.status(204).send();
    } catch (error: any) {
      console.error("Error archiving Project:", error);
      res.status(500).json({ message: "Failed to archive project" });
    }
  });
}
