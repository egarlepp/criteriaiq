// MAP management / import / analytics routes (Phase 8 extraction #9e).
//
// Final live MAP slice — three operationally-distinct read/write paths:
//   GET  /api/map/management                               (aggregated cross-project view)
//   POST /api/map/import-csv                               (admin-only bulk CSV import)
//   GET  /api/projects/:projectId/map/assignment-analytics (workload distribution)
//
// Plus the four backward-compatibility stubs that surfaced when the
// deprecated mapAssignments table was retired (they each return
// `deprecated: true` and exist solely so old clients don't 404):
//   POST   /api/projects/:projectId/map/assignments/bulk
//   DELETE /api/projects/:projectId/map/assignments/bulk
//   POST   /api/projects/:projectId/map/assignments
//   GET    /api/projects/:projectId/map/assignments
//
// The CSV import path requires a multer instance — it's injected via
// the existing DI pattern (same shape as compliance / support-requests).
import type { Express } from "express";
import type { Multer } from "multer";
import fs from "fs";
import { sql, inArray } from "drizzle-orm";
import { storage } from "../storage";
import { isAuthenticated } from "../auth/simpleAuth";
import { mapPhases, mapSteps, mapTasks, teams, users } from "@shared/schema";
import { hasProjectAccess } from "../lib/project-access";
import { requireInternalUser } from "../lib/internal-access";
import { isUpcoming, upcomingLimits } from "../services/map-scheduling";
import { isMapItemComplete, mapItemStatusSchema } from "@shared/map-status";

export function registerMapManagementRoutes(
  app: Express,
  { csvUpload }: { csvUpload: Multer },
) {
  // Backward-compat stubs for the retired mapAssignments table.
  app.post("/api/projects/:projectId/map/assignments/bulk", isAuthenticated, async (req, res) => {
    res.json({ success: true, assignmentsCreated: 0, assignments: [], deprecated: true, message: "Assignments are now managed directly through entity update endpoints" });
  });

  app.delete("/api/projects/:projectId/map/assignments/bulk", isAuthenticated, async (req, res) => {
    res.json({ success: true, assignmentsDeleted: 0, deprecated: true, message: "Assignments are now managed directly through entity update endpoints" });
  });

  app.post("/api/projects/:projectId/map/assignments", isAuthenticated, async (req, res) => {
    res.json({ success: true, deprecated: true, message: "Use entity update endpoints instead" });
  });

  app.get("/api/projects/:projectId/map/assignments", isAuthenticated, async (req, res) => {
    res.json({ assignments: [], deprecated: true, message: "Assignments are now stored in entity columns" });
  });

  // GET MAP Management data - aggregated view across all accessible projects
  app.get("/api/map/management", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const userEmail = req.session.user.email;

      // Get accessible projects for this user
      let accessibleProjects = [];

      if (userRole === 'Admin') {
        // Admins can see all projects
        accessibleProjects = await storage.getProjects(userId);
      } else {
        // Get projects user has access to based on their role and assignments
        accessibleProjects = await storage.getUserAccessibleProjects(userId);
      }

      if (accessibleProjects.length === 0) {
        return res.json([]);
      }

      const projectIds = accessibleProjects.map((p: any) => p.id);
      const mapItems: any[] = [];

      // Create project lookup map
      const projectMap = new Map();
      accessibleProjects.forEach((p: any) => {
        projectMap.set(p.id, p);
      });

      // Get all phases across accessible projects (no joins to avoid Drizzle bug)
      const phases = await storage.db
        .select()
        .from(mapPhases)
        .where(inArray(mapPhases.projectId, projectIds));

      // Get all steps across accessible projects (no joins)
      const steps = await storage.db
        .select()
        .from(mapSteps)
        .where(inArray(mapSteps.projectId, projectIds));

      // Get all tasks across accessible projects (no joins)
      const tasks = await storage.db
        .select()
        .from(mapTasks)
        .where(inArray(mapTasks.projectId, projectIds));

      // Get all unique user IDs that need to be looked up
      const userIds = new Set<string>();
      steps.forEach(step => {
        if (step.assignedToUserId) userIds.add(step.assignedToUserId as string);
      });
      tasks.forEach(task => {
        if (task.assignedToUserId) userIds.add(task.assignedToUserId as string);
      });

      // Get user data for assignments
      const userMap = new Map();
      if (userIds.size > 0) {
        const usersData = await storage.db
          .select()
          .from(users)
          .where(inArray(users.id, Array.from(userIds)));

        usersData.forEach(user => {
          userMap.set(user.id, user);
        });
      }

      // Create phase lookup map
      const phaseMap = new Map();
      phases.forEach(phase => {
        phaseMap.set(phase.id, phase);
      });

      // Transform phases to MapItem format
      phases.forEach(phase => {
        const project = projectMap.get(phase.projectId);
        mapItems.push({
          id: phase.id,
          projectId: phase.projectId,
          projectName: project?.name || 'Unknown Project',
          customerName: project?.customerName || 'Unknown Customer',
          phaseId: phase.id,
          phaseName: phase.name,
          title: phase.name,
          description: phase.description,
          status: phase.status || 'not_started',
          owner: null, // Phases typically don't have direct owners
          assignedTo: null,
          dueDate: phase.dueDate,
          createdAt: phase.createdAt,
          updatedAt: phase.updatedAt || phase.createdAt,
          isBlocked: phase.status === 'blocked',
          isLate: phase.dueDate && new Date(phase.dueDate) < new Date() && !isMapItemComplete(phase.status),
          type: 'phase',
          documentsCount: 0, // TODO: Implement document counts
          linksCount: 0, // TODO: Implement links counts
          externalEmails: phase.sendExternalEmails || false,
        });
      });

      // Create step lookup map for tasks
      const stepMap = new Map();
      steps.forEach(step => {
        stepMap.set(step.id, step);
      });

      // Transform steps to MapItem format
      steps.forEach(step => {
        const project = projectMap.get(step.projectId);
        const phase = phaseMap.get(step.phaseId);
        const assignedUser = step.assignedToUserId ? userMap.get(step.assignedToUserId) : null;
        const assignedName = (assignedUser?.firstName && assignedUser?.lastName)
          ? `${assignedUser.firstName} ${assignedUser.lastName}`
          : null;

        mapItems.push({
          id: step.id,
          projectId: step.projectId,
          projectName: project?.name || 'Unknown Project',
          customerName: project?.customerName || 'Unknown Customer',
          phaseId: step.phaseId,
          phaseName: phase?.name || 'Unknown Phase',
          stepId: step.id,
          stepName: step.name,
          title: step.name,
          description: step.description,
          status: step.status || 'not_started',
          owner: assignedName,
          assignedTo: assignedName,
          dueDate: step.dueDate,
          createdAt: step.createdAt,
          updatedAt: step.updatedAt || step.createdAt,
          isBlocked: step.status === 'blocked',
          isLate: step.dueDate && new Date(step.dueDate) < new Date() && !isMapItemComplete(step.status),
          type: 'step',
          documentsCount: 0, // TODO: Implement document counts
          linksCount: 0, // TODO: Implement links counts
          externalEmails: step.sendExternalEmails || false,
        });
      });

      // Transform tasks to MapItem format
      tasks.forEach(task => {
        const project = projectMap.get(task.projectId);
        const step = stepMap.get(task.stepId);
        const phase = step ? phaseMap.get(step.phaseId) : null;
        const assignedUser = task.assignedToUserId ? userMap.get(task.assignedToUserId) : null;
        const assignedName = (assignedUser?.firstName && assignedUser?.lastName)
          ? `${assignedUser.firstName} ${assignedUser.lastName}`
          : null;

        mapItems.push({
          id: task.id,
          projectId: task.projectId,
          projectName: project?.name || 'Unknown Project',
          customerName: project?.customerName || 'Unknown Customer',
          phaseId: phase?.id,
          phaseName: phase?.name,
          stepId: task.stepId,
          stepName: step?.name || 'Unknown Step',
          taskId: task.id,
          taskName: task.name,
          title: task.name,
          description: task.description,
          status: task.status || 'not_started',
          owner: assignedName,
          assignedTo: assignedName,
          dueDate: task.dueDate,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt || task.createdAt,
          isBlocked: task.status === 'blocked',
          isLate: task.dueDate && new Date(task.dueDate) < new Date() && !isMapItemComplete(task.status),
          type: 'task',
          documentsCount: 0, // TODO: Implement document counts
          linksCount: 0, // TODO: Implement links counts
          externalEmails: task.sendExternalEmails || false,
        });
      });

      // Sort by project name, then by type (phases first, then steps, then tasks), then by order
      mapItems.sort((a, b) => {
        if (a.projectName !== b.projectName) {
          return a.projectName.localeCompare(b.projectName);
        }

        const typeOrder: any = { phase: 1, step: 2, task: 3 };
        if (typeOrder[a.type] !== typeOrder[b.type]) {
          return typeOrder[a.type] - typeOrder[b.type];
        }

        return a.id - b.id; // Secondary sort by ID for consistent ordering
      });

      console.log(`MAP Management: Retrieved ${mapItems.length} items across ${accessibleProjects.length} projects for user ${userId}`);
      res.json(mapItems);
    } catch (error: any) {
      console.error("Error fetching MAP management data:", error);
      res.status(500).json({ message: "Failed to fetch MAP management data" });
    }
  });

  // Import MAP data from CSV file (admin only)
  app.post("/api/map/import-csv", isAuthenticated, csvUpload.single('csvFile'), async (req: any, res) => {
    try {
      // Check if user is ADMIN
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Only administrators can import MAP data" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No CSV file uploaded" });
      }

      const csvContent = fs.readFileSync(req.file.path, 'utf-8');
      try { fs.unlinkSync(req.file.path); } catch {}
      const lines = csvContent.split('\n').filter(line => line.trim());

      if (lines.length < 2) {
        return res.status(400).json({ message: "CSV file must contain header and at least one data row" });
      }

      const headers = lines[0].split(',').map(h => h.replace(/['"]/g, '').trim());
      const expectedHeaders = ['type', 'templateId', 'name', 'description', 'parentPhase', 'parentStep', 'status', 'dueDate', 'assignedTo', 'orderIndex'];

      // Validate headers
      const missingHeaders = expectedHeaders.filter(h => !headers.includes(h));
      if (missingHeaders.length > 0) {
        return res.status(400).json({
          message: `Missing required headers: ${missingHeaders.join(', ')}`,
          details: { errors: [`Headers must include: ${expectedHeaders.join(', ')}`] }
        });
      }

      let phasesCreated = 0, stepsCreated = 0, tasksCreated = 0;
      let errors: string[] = [];
      const createdItems: { phases: any[]; steps: any[]; tasks: any[] } = { phases: [], steps: [], tasks: [] };

      // Get existing templates for reference
      const templates = await storage.getMapTemplates();

      for (let i = 1; i < lines.length; i++) {
        try {
          const values = lines[i].split(',').map(v => v.replace(/^["']|["']$/g, '').trim());
          const rowData: any = {};

          headers.forEach((header, index) => {
            rowData[header] = values[index] || '';
          });

          // Validate required fields
          if (!rowData.type || !rowData.name) {
            errors.push(`Row ${i + 1}: Missing required fields (type, name)`);
            continue;
          }

          // Validate type
          if (!['phase', 'step', 'task'].includes(rowData.type.toLowerCase())) {
            errors.push(`Row ${i + 1}: Invalid type "${rowData.type}". Must be phase, step, or task`);
            continue;
          }

          const type = rowData.type.toLowerCase();
          const templateId = rowData.templateId ? parseInt(rowData.templateId) : 1; // Default to template 1

          // Prepare data based on type
          let itemData: any = {
            name: rowData.name,
            description: rowData.description || '',
            orderIndex: rowData.orderIndex ? parseInt(rowData.orderIndex) : 0,
            templateId
          };

          const csvStatus = mapItemStatusSchema.safeParse(rowData.status);
          if (rowData.status && csvStatus.success) {
            itemData.status = csvStatus.data;
          }

          try {
            if (type === 'phase') {
              const phase = await storage.createMapPhase(itemData);
              phasesCreated++;
              createdItems.phases.push({ id: phase.id, name: phase.name });
            } else if (type === 'step') {
              // For steps, we need to find the parent phase
              if (rowData.parentPhase) {
                // Find phase by name
                const phases = await storage.getMapPhasesByTemplate(templateId);
                const parentPhase = phases.find((p: any) => p.name === rowData.parentPhase);
                if (parentPhase) {
                  itemData.phaseId = parentPhase.id;
                  const step = await storage.createMapStep(itemData);
                  stepsCreated++;
                  createdItems.steps.push({ id: step.id, name: step.name, phase: parentPhase.name });
                } else {
                  errors.push(`Row ${i + 1}: Parent phase "${rowData.parentPhase}" not found`);
                  continue;
                }
              } else {
                errors.push(`Row ${i + 1}: Parent phase required for steps`);
                continue;
              }
            } else if (type === 'task') {
              // For tasks, we need to find the parent step
              if (rowData.parentStep) {
                // Find step by name and phase
                const phases = await storage.getMapPhasesByTemplate(templateId);
                let parentStep = null;

                for (const phase of phases) {
                  const steps = await storage.getMapStepsByPhase(phase.id);
                  parentStep = steps.find((s: any) => s.name === rowData.parentStep);
                  if (parentStep) break;
                }

                if (parentStep) {
                  itemData.stepId = parentStep.id;
                  if (rowData.dueDate) {
                    itemData.dueDate = new Date(rowData.dueDate);
                  }

                  const task = await storage.createMapTask(itemData);
                  tasksCreated++;
                  createdItems.tasks.push({ id: task.id, name: task.name, step: parentStep.name });

                  // Handle assignment if provided
                  if (rowData.assignedTo) {
                    try {
                      // Find user by email or name
                      const users: any[] = await storage.getUsers();
                      const assignedUser = users.find(u =>
                        u.email === rowData.assignedTo ||
                        `${u.firstName} ${u.lastName}` === rowData.assignedTo
                      );

                      if (assignedUser) {
                        await storage.createMapAssignment({
                          projectId: null as any, // Will be set when template is applied to project
                          entityType: 'task',
                          entityId: task.id,
                          userId: assignedUser.id,
                          isOwner: true
                        });
                      }
                    } catch (assignError) {
                      console.warn(`Warning: Could not assign task to ${rowData.assignedTo}:`, assignError);
                    }
                  }
                } else {
                  errors.push(`Row ${i + 1}: Parent step "${rowData.parentStep}" not found`);
                  continue;
                }
              } else {
                errors.push(`Row ${i + 1}: Parent step required for tasks`);
                continue;
              }
            }
          } catch (createError: any) {
            console.error(`Error creating ${type}:`, createError);
            errors.push(`Row ${i + 1}: Failed to create ${type} - ${createError.message}`);
            continue;
          }
        } catch (rowError: any) {
          console.error(`Error processing row ${i + 1}:`, rowError);
          errors.push(`Row ${i + 1}: Processing error - ${rowError.message}`);
        }
      }

      const summary = {
        imported: phasesCreated + stepsCreated + tasksCreated,
        phases: phasesCreated,
        steps: stepsCreated,
        tasks: tasksCreated,
        errors: errors.length,
        details: errors,
        created: createdItems
      };

      console.log('MAP CSV import summary:', summary);

      if (errors.length > 0) {
        return res.status(207).json({ // 207 Multi-Status for partial success
          message: `Import completed with ${errors.length} errors`,
          ...summary
        });
      }

      res.json({
        message: `Successfully imported ${summary.imported} MAP items`,
        ...summary
      });
    } catch (error: any) {
      console.error("Error importing MAP CSV:", error);
      res.status(500).json({ message: "Failed to import MAP CSV file" });
    }
  });

  // Get comprehensive assignment tracking analytics for a project
  app.get("/api/projects/:projectId/map/assignment-analytics", isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.projectId as string);
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const userEmail = req.session.user.email;

      if (isNaN(projectId)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      // Check if user has access to this project
      const hasAccess = await hasProjectAccess(userId, userRole, userEmail, projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied - insufficient project permissions" });
      }

      // Get MAP data - phases, steps, and tasks with assignment fields
      const { phases, steps, tasks } = await storage.getProjectMap(projectId);

      // Helper function to check if a value is empty (null, undefined, empty string, or display placeholders)
      const isEmpty = (value: any): boolean => {
        return !value || value === '' || value === 'N/A' || value === 'Unassigned';
      };

      // Helper function to check if an entity has any assignments
      const hasAssignments = (entity: any): boolean => {
        return !isEmpty(entity.teamOwned) ||
               !isEmpty(entity.assignedToCustomerUserId) ||
               !isEmpty(entity.assignedToTeamId) ||
               !isEmpty(entity.assignedToUserId) ||
               !isEmpty(entity.additionalInternalUserId);
      };

      // Collect all unique user IDs and load user details
      const userIds = new Set<string>();

      // Extract user IDs from phases
      phases.forEach(phase => {
        if (!isEmpty(phase.assignedToCustomerUserId)) userIds.add(phase.assignedToCustomerUserId as string);
        if (!isEmpty(phase.assignedToUserId)) userIds.add(phase.assignedToUserId as string);
        if (!isEmpty(phase.additionalInternalUserId)) userIds.add(phase.additionalInternalUserId as string);
      });

      // Extract user IDs from steps
      steps.forEach(step => {
        if (!isEmpty(step.assignedToCustomerUserId)) userIds.add(step.assignedToCustomerUserId as string);
        if (!isEmpty(step.assignedToUserId)) userIds.add(step.assignedToUserId as string);
        if (!isEmpty(step.additionalInternalUserId)) userIds.add(step.additionalInternalUserId as string);
      });

      // Extract user IDs from tasks
      tasks.forEach(task => {
        if (!isEmpty(task.assignedToCustomerUserId)) userIds.add(task.assignedToCustomerUserId as string);
        if (!isEmpty(task.assignedToUserId)) userIds.add(task.assignedToUserId as string);
        if (!isEmpty(task.additionalInternalUserId)) userIds.add(task.additionalInternalUserId as string);
      });

      // Fetch user details for all assigned users
      const userDetailsMap = new Map();
      if (userIds.size > 0) {
        const userDetails = await storage.db
          .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            role: users.role,
          })
          .from(users)
          .where(sql`${users.id} IN (${sql.join(Array.from(userIds).map(id => sql`${id}`), sql`, `)})`);

        userDetails.forEach(user => {
          userDetailsMap.set(user.id, user);
        });
      }

      // Internal teams that own items ("Our team") get their own workload row,
      // keyed "team:<id>" so they never collide with a user id. The client
      // shows the team name and a Team badge from isTeam/teamName.
      const teamIds = new Set<number>();
      [...phases, ...steps, ...tasks].forEach(entity => {
        if (typeof entity.assignedToTeamId === 'number') teamIds.add(entity.assignedToTeamId);
      });
      if (teamIds.size > 0) {
        const teamRows = await storage.db
          .select({ id: teams.id, name: teams.name })
          .from(teams)
          .where(inArray(teams.id, Array.from(teamIds)));
        teamRows.forEach(team => {
          userDetailsMap.set(`team:${team.id}`, {
            id: `team:${team.id}`,
            firstName: team.name,
            lastName: '',
            email: null,
            role: null,
            isTeam: true,
            teamName: team.name,
          });
        });
      }

      // Group assignments by user
      const userWorkloads = new Map<string, {
        user: any;
        totalAssignments: number;
        phases: number;
        steps: number;
        tasks: number;
        completedItems: number;
        pendingItems: number;
        overdueItems: number;
        upcomingDeadlines: number;
        assignments: any[];
      }>();

      const now = new Date();
      // Upcoming: due within UPCOMING_WORKING_DAYS working days on each person's calendar.
      const upcomingLimit = await upcomingLimits(Array.from(userIds), now);

      // Helper to process entity assignments for a user
      const processEntityAssignment = (
        userId: string,
        entity: any,
        entityType: 'map_phase' | 'map_step' | 'map_task'
      ) => {
        const user = userDetailsMap.get(userId);
        if (!user) return;

        if (!userWorkloads.has(userId)) {
          userWorkloads.set(userId, {
            user,
            totalAssignments: 0,
            phases: 0,
            steps: 0,
            tasks: 0,
            completedItems: 0,
            pendingItems: 0,
            overdueItems: 0,
            upcomingDeadlines: 0,
            assignments: []
          });
        }

        const workload = userWorkloads.get(userId)!;

        // Add assignment details
        workload.assignments.push({
          entityType,
          entityId: entity.id,
          entityName: entity.name || entity.title || `${entityType} ${entity.id}`,
          entityStatus: entity.status,
          entityDueDate: entity.dueDate,
          entityDescription: entity.description
        });

        // Update counters
        workload.totalAssignments++;

        // Count by type
        if (entityType === 'map_phase') workload.phases++;
        else if (entityType === 'map_step') workload.steps++;
        else if (entityType === 'map_task') workload.tasks++;

        // Count by status
        if (isMapItemComplete(entity.status)) {
          workload.completedItems++;
        } else {
          workload.pendingItems++;
        }

        // Check for overdue items
        if (entity.dueDate && new Date(entity.dueDate) < now && !isMapItemComplete(entity.status)) {
          workload.overdueItems++;
        }

        // Check for upcoming deadlines (within UPCOMING_WORKING_DAYS working days)
        if (isUpcoming(entity.dueDate, now, upcomingLimit.get(userId))) {
          workload.upcomingDeadlines++;
        }
      };

      // Process all phases
      phases.forEach(phase => {
        if (!isEmpty(phase.assignedToCustomerUserId)) {
          processEntityAssignment(phase.assignedToCustomerUserId as string, phase, 'map_phase');
        }
        if (!isEmpty(phase.assignedToUserId)) {
          processEntityAssignment(phase.assignedToUserId as string, phase, 'map_phase');
        }
        if (!isEmpty(phase.additionalInternalUserId)) {
          processEntityAssignment(phase.additionalInternalUserId as string, phase, 'map_phase');
        }
        if (typeof phase.assignedToTeamId === 'number') {
          processEntityAssignment(`team:${phase.assignedToTeamId}`, phase, 'map_phase');
        }
      });

      // Process all steps
      steps.forEach(step => {
        if (!isEmpty(step.assignedToCustomerUserId)) {
          processEntityAssignment(step.assignedToCustomerUserId as string, step, 'map_step');
        }
        if (!isEmpty(step.assignedToUserId)) {
          processEntityAssignment(step.assignedToUserId as string, step, 'map_step');
        }
        if (!isEmpty(step.additionalInternalUserId)) {
          processEntityAssignment(step.additionalInternalUserId as string, step, 'map_step');
        }
        if (typeof step.assignedToTeamId === 'number') {
          processEntityAssignment(`team:${step.assignedToTeamId}`, step, 'map_step');
        }
      });

      // Process all tasks
      tasks.forEach(task => {
        if (!isEmpty(task.assignedToCustomerUserId)) {
          processEntityAssignment(task.assignedToCustomerUserId as string, task, 'map_task');
        }
        if (!isEmpty(task.assignedToUserId)) {
          processEntityAssignment(task.assignedToUserId as string, task, 'map_task');
        }
        if (!isEmpty(task.additionalInternalUserId)) {
          processEntityAssignment(task.additionalInternalUserId as string, task, 'map_task');
        }
        if (typeof task.assignedToTeamId === 'number') {
          processEntityAssignment(`team:${task.assignedToTeamId}`, task, 'map_task');
        }
      });

      // Convert map to array and calculate distribution metrics
      const userWorkloadArray = Array.from(userWorkloads.values());

      // Calculate workload distribution statistics
      const totalAssignments = userWorkloadArray.reduce((sum, w) => sum + w.totalAssignments, 0);
      const averageWorkload = totalAssignments / Math.max(userWorkloadArray.length, 1);
      const maxWorkload = Math.max(...userWorkloadArray.map(w => w.totalAssignments), 0);
      const minWorkload = userWorkloadArray.length > 0 ? Math.min(...userWorkloadArray.map(w => w.totalAssignments)) : 0;

      // Identify workload balance issues
      const overloadedUsers = userWorkloadArray.filter(w => w.totalAssignments > averageWorkload * 1.5);
      const underloadedUsers = userWorkloadArray.filter(w => w.totalAssignments < averageWorkload * 0.5);

      // Calculate assignment distribution by entity type - count entities with ANY assignment
      const entityDistribution = {
        phases: {
          total: phases.length,
          assigned: phases.filter(p => hasAssignments(p)).length,
          unassigned: phases.filter(p => !hasAssignments(p)).length
        },
        steps: {
          total: steps.length,
          assigned: steps.filter(s => hasAssignments(s)).length,
          unassigned: steps.filter(s => !hasAssignments(s)).length
        },
        tasks: {
          total: tasks.length,
          assigned: tasks.filter(t => hasAssignments(t)).length,
          unassigned: tasks.filter(t => !hasAssignments(t)).length
        }
      };

      // For assignment timeline metrics, we can't track "recent assignments" without timestamps
      // So we'll use updatedAt as a proxy for assignment changes
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const recentlyUpdatedEntities = [
        ...phases.filter(p => hasAssignments(p) && p.updatedAt && new Date(p.updatedAt) >= weekAgo),
        ...steps.filter(s => hasAssignments(s) && s.updatedAt && new Date(s.updatedAt) >= weekAgo),
        ...tasks.filter(t => hasAssignments(t) && t.updatedAt && new Date(t.updatedAt) >= weekAgo)
      ];

      const assignmentAnalytics = {
        projectId,
        userWorkloads: userWorkloadArray.sort((a, b) => b.totalAssignments - a.totalAssignments),
        distributionMetrics: {
          totalUsers: userWorkloadArray.length,
          totalAssignments,
          averageWorkload: Math.round(averageWorkload * 100) / 100,
          maxWorkload,
          minWorkload,
          workloadSpread: maxWorkload - minWorkload,
          balanceScore: totalAssignments > 0 ? Math.max(0, 100 - (((maxWorkload - minWorkload) / Math.max(averageWorkload, 1)) * 25)) : 100
        },
        workloadBalance: {
          isBalanced: overloadedUsers.length === 0 && underloadedUsers.length === 0,
          overloadedUsers: overloadedUsers.map(u => ({
            userId: u.user.id,
            name: `${u.user.firstName || ''} ${u.user.lastName || ''}`.trim() || u.user.email,
            assignments: u.totalAssignments,
            overloadRatio: Math.round((u.totalAssignments / Math.max(averageWorkload, 1)) * 100) / 100
          })),
          underloadedUsers: underloadedUsers.map(u => ({
            userId: u.user.id,
            name: `${u.user.firstName || ''} ${u.user.lastName || ''}`.trim() || u.user.email,
            assignments: u.totalAssignments,
            underloadRatio: Math.round((u.totalAssignments / Math.max(averageWorkload, 1)) * 100) / 100
          }))
        },
        entityDistribution,
        assignmentTimeline: {
          recentAssignments: recentlyUpdatedEntities.length,
          totalOverdueItems: userWorkloadArray.reduce((sum, w) => sum + w.overdueItems, 0),
          totalUpcomingDeadlines: userWorkloadArray.reduce((sum, w) => sum + w.upcomingDeadlines, 0),
          completionRate: Math.round((userWorkloadArray.reduce((sum, w) => sum + w.completedItems, 0) / Math.max(totalAssignments, 1)) * 100)
        },
        lastUpdated: new Date().toISOString()
      };

      res.json(assignmentAnalytics);
    } catch (error: any) {
      console.error("Error fetching assignment analytics:", error);
      res.status(500).json({ message: "Failed to fetch assignment analytics" });
    }
  });
}
