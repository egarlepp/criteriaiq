/**
 * Workflow Automation Trigger Registry
 * 
 * Central source of truth for all system-defined workflow automation triggers.
 * This registry is used for automatic trigger registration on server startup.
 * 
 * DO NOT manually add triggers to the database - add them here instead.
 * The auto-registration service will sync these to the database.
 * 
 * Total Triggers: 102
 * - Authentication: 10
 * - Project Notifications: 10
 * - MAP (Mutual Action Plan): 23
 * - Communication: 3
 * - Customer Portal: 2
 * - Success Criteria: 3
 * - Risk Analysis: 2
 * - User Management: 2
 * - Reports: 2
 * - System Alerts: 9
 * - Salesforce Integration: 8
 * - Webhook Delivery: 8
 * - AI & Assessment: 6
 * - Gap Analysis: 3
 * - Project Closure: 3
 * - Documentation Sync: 3
 * - Archive Management: 3
 * - Compliance: 5
 */

export interface TriggerDefinition {
  key: string;
  category: string;
  type: string;
  origin: string;
  defaultEnabled: boolean;
  description: string;
  metadataSchema?: Record<string, any>;
}

/**
 * System Trigger Registry
 * 
 * Add new triggers here following the structure below.
 * The registration service will automatically add them to the database on startup.
 */
export const SYSTEM_TRIGGERS: TriggerDefinition[] = [
  // =============================================================================
  // AUTHENTICATION TRIGGERS (10)
  // =============================================================================
  {
    key: "login.failed",
    category: "Authentication",
    type: "action",
    origin: "authentication",
    defaultEnabled: true,
    description: "Triggered when a user login attempt fails",
    metadataSchema: {
      email: "string",
      attempts: "number",
      ipAddress: "string"
    }
  },
  {
    key: "mfa.enabled",
    category: "Authentication",
    type: "action",
    origin: "authentication",
    defaultEnabled: true,
    description: "Triggered when a user enables multi-factor authentication",
    metadataSchema: {
      email: "string",
      userId: "string",
      mfaMethod: "string"
    }
  },
  {
    key: "mfa.disabled",
    category: "Authentication",
    type: "security_event",
    origin: "authentication",
    defaultEnabled: true,
    description: "Triggered when a user disables multi-factor authentication",
    metadataSchema: {
      userId: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "password.changed",
    category: "Authentication",
    type: "security_event",
    origin: "authentication",
    defaultEnabled: true,
    description: "Triggered when a user changes their password",
    metadataSchema: {
      userId: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "password.reset_requested",
    category: "Authentication",
    type: "action",
    origin: "authentication",
    defaultEnabled: true,
    description: "Triggered when a user requests a password reset",
    metadataSchema: {
      email: "string",
      userId: "string",
      resetToken: "string"
    }
  },
  {
    key: "password.reset_completed",
    category: "Authentication",
    type: "action",
    origin: "authentication",
    defaultEnabled: true,
    description: "Triggered when a user successfully resets their password",
    metadataSchema: {
      email: "string",
      userId: "string"
    }
  },
  {
    key: "account.locked",
    category: "Authentication",
    type: "security_event",
    origin: "authentication",
    defaultEnabled: true,
    description: "Triggered when a user account is locked due to multiple failed login attempts",
    metadataSchema: {
      email: "string",
      userId: "string",
      timestamp: "ISO8601 datetime",
      failedAttempts: "number"
    }
  },
  {
    key: "session.expired",
    category: "Authentication",
    type: "authentication_event",
    origin: "authentication",
    defaultEnabled: true,
    description: "Triggered when a user session expires",
    metadataSchema: {
      userId: "string",
      sessionId: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "user.created",
    category: "Authentication",
    type: "lifecycle",
    origin: "authentication",
    defaultEnabled: true,
    description: "Triggered when a new user account is created",
    metadataSchema: {
      email: "string",
      userId: "string",
      firstName: "string",
      lastName: "string"
    }
  },
  {
    key: "user.approved",
    category: "Authentication",
    type: "lifecycle",
    origin: "authentication",
    defaultEnabled: true,
    description: "Triggered when a user account is approved by an admin",
    metadataSchema: {
      email: "string",
      userId: "string",
      approvedBy: "string"
    }
  },
  {
    key: "user.registration_completed",
    category: "User Management",
    type: "lifecycle",
    origin: "authentication",
    defaultEnabled: true,
    description: "Triggered when a user completes self-service registration (via access code or open signup). Use this to send a welcome or onboarding email.",
    metadataSchema: {
      email: "string",
      userId: "string",
      firstName: "string",
      lastName: "string",
      autoApproved: "boolean",
      accessCodeUsed: "boolean",
      accountStatus: "string"
    }
  },
  {
    key: "user.first_login",
    category: "User Management",
    type: "lifecycle",
    origin: "authentication",
    defaultEnabled: true,
    description: "Triggered the very first time a user successfully logs in (loginCount transitions from 0 to 1). Fires after access-code registration and after admin-created account first login.",
    metadataSchema: {
      email: "string",
      userId: "string",
      firstName: "string",
      lastName: "string",
      loginMethod: "string",
      ipAddress: "string"
    }
  },

  // =============================================================================
  // PROJECT NOTIFICATION TRIGGERS (10)
  // =============================================================================
  {
    key: "project.created",
    category: "Project Notifications",
    type: "lifecycle",
    origin: "project",
    defaultEnabled: true,
    description: "Triggered when a new project is created",
    metadataSchema: {
      createdBy: "string",
      projectId: "string",
      customerId: "string",
      projectName: "string"
    }
  },
  {
    key: "project.updated",
    category: "Project Notifications",
    type: "action",
    origin: "project",
    defaultEnabled: true,
    description: "Triggered when project details are updated",
    metadataSchema: {
      projectId: "string",
      updatedBy: "string",
      projectName: "string",
      updatedFields: "array"
    }
  },
  {
    key: "project.status_changed",
    category: "Project Notifications",
    type: "status_change",
    origin: "project",
    defaultEnabled: true,
    description: "Triggered when project status changes",
    metadataSchema: {
      newStatus: "string",
      oldStatus: "string",
      projectId: "string",
      projectName: "string"
    }
  },
  {
    key: "project.assigned",
    category: "Project Notifications",
    type: "assignment",
    origin: "project",
    defaultEnabled: true,
    description: "Triggered when a project is assigned to an engineer",
    metadataSchema: {
      role: "string",
      projectId: "number",
      timestamp: "ISO8601 datetime",
      assignedBy: "string",
      assignedTo: "string",
      projectName: "string"
    }
  },
  {
    key: "project.deadline_approaching",
    category: "Project Notifications",
    type: "deadline",
    origin: "project",
    defaultEnabled: true,
    description: "Triggered when a project deadline is approaching",
    metadataSchema: {
      deadline: "ISO8601 datetime",
      projectId: "number",
      timestamp: "ISO8601 datetime",
      projectName: "string",
      daysRemaining: "number"
    }
  },
  {
    key: "project.end_date_approaching",
    category: "Project Notifications",
    type: "deadline",
    origin: "project",
    defaultEnabled: true,
    description: "Triggered when project end date is approaching (configurable threshold)",
    metadataSchema: {
      endDate: "string",
      projectId: "string",
      projectName: "string",
      daysRemaining: "number"
    }
  },
  {
    key: "project.completed",
    category: "Project Notifications",
    type: "milestone",
    origin: "project",
    defaultEnabled: true,
    description: "Triggered when a project is marked as completed",
    metadataSchema: {
      projectId: "number",
      timestamp: "ISO8601 datetime",
      completedBy: "string",
      projectName: "string",
      completionDate: "ISO8601 datetime"
    }
  },
  {
    key: "project.archived",
    category: "Project Notifications",
    type: "lifecycle",
    origin: "project",
    defaultEnabled: true,
    description: "Triggered when a project is archived",
    metadataSchema: {
      projectId: "string",
      archivedBy: "string",
      projectName: "string"
    }
  },
  {
    key: "project.team_member_added",
    category: "Project Notifications",
    type: "assignment",
    origin: "project",
    defaultEnabled: true,
    description: "Triggered when a team member is added to a project",
    metadataSchema: {
      projectId: "string",
      projectName: "string",
      addedUserId: "string",
      addedUserName: "string",
      addedBy: "string",
      role: "string"
    }
  },
  {
    key: "project.team_member_removed",
    category: "Project Notifications",
    type: "assignment",
    origin: "project",
    defaultEnabled: true,
    description: "Triggered when a team member is removed from a project",
    metadataSchema: {
      projectId: "string",
      projectName: "string",
      removedUserId: "string",
      removedUserName: "string",
      removedBy: "string"
    }
  },

  // =============================================================================
  // MAP (MUTUAL ACTION PLAN) TRIGGERS (23)
  // =============================================================================
  // Phase Triggers
  {
    key: "map.phase_started",
    category: "MAP",
    type: "milestone",
    origin: "map_phase",
    defaultEnabled: true,
    description: "Triggered when a MAP phase is started",
    metadataSchema: {
      mapId: "number",
      phaseId: "number",
      phaseName: "string",
      projectId: "number",
      startedBy: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "map.phase_completed",
    category: "MAP",
    type: "milestone",
    origin: "map_phase",
    defaultEnabled: true,
    description: "Triggered when a MAP phase is completed",
    metadataSchema: {
      mapId: "number",
      phaseId: "number",
      phaseName: "string",
      projectId: "number",
      timestamp: "ISO8601 datetime",
      completedBy: "string"
    }
  },
  {
    key: "map.phase.started",
    category: "MAP",
    type: "lifecycle",
    origin: "map_phase",
    defaultEnabled: true,
    description: "Triggered when a MAP phase is started",
    metadataSchema: {
      phaseId: "string",
      phaseName: "string",
      projectId: "string",
      startedBy: "string"
    }
  },
  {
    key: "map.phase.completed",
    category: "MAP",
    type: "milestone",
    origin: "map_phase",
    defaultEnabled: true,
    description: "Triggered when a MAP phase is completed",
    metadataSchema: {
      phaseId: "string",
      phaseName: "string",
      projectId: "string",
      completedBy: "string",
      completionDate: "string"
    }
  },
  {
    key: "map.phase.assigned",
    category: "MAP",
    type: "assignment",
    origin: "map_phase",
    defaultEnabled: true,
    description: "Triggered when a MAP phase is assigned to a user",
    metadataSchema: {
      phaseId: "string",
      phaseName: "string",
      projectId: "string",
      assignedBy: "string",
      assignedTo: "string"
    }
  },
  {
    key: "map.phase.team_assigned",
    category: "MAP",
    type: "assignment",
    origin: "map_phase",
    defaultEnabled: true,
    description: "Triggered when a MAP phase is assigned to an internal team (Our team); responsibility only, never access",
    metadataSchema: {
      phaseId: "string",
      phaseName: "string",
      projectId: "string",
      assignedTeamId: "number",
      previousTeamId: "number"
    }
  },
  {
    key: "map.phase.due_soon",
    category: "MAP",
    type: "deadline",
    origin: "map_phase",
    defaultEnabled: true,
    description: "Triggered when MAP phase due date is approaching",
    metadataSchema: {
      dueDate: "string",
      phaseId: "string",
      phaseName: "string",
      projectId: "string",
      daysRemaining: "number"
    }
  },
  {
    key: "map.phase.status_changed",
    category: "MAP",
    type: "status_change",
    origin: "map_phase",
    defaultEnabled: true,
    description: "Triggered when MAP phase status changes",
    metadataSchema: {
      phaseId: "string",
      newStatus: "string",
      oldStatus: "string",
      phaseName: "string",
      projectId: "string"
    }
  },
  // Step Triggers
  {
    key: "map.step_started",
    category: "MAP",
    type: "milestone",
    origin: "map_step",
    defaultEnabled: true,
    description: "Triggered when a MAP step is started",
    metadataSchema: {
      mapId: "number",
      stepId: "number",
      phaseId: "number",
      stepName: "string",
      projectId: "number",
      startedBy: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "map.step_completed",
    category: "MAP",
    type: "milestone",
    origin: "map_step",
    defaultEnabled: true,
    description: "Triggered when a MAP step is completed",
    metadataSchema: {
      mapId: "number",
      stepId: "number",
      phaseId: "number",
      stepName: "string",
      projectId: "number",
      timestamp: "ISO8601 datetime",
      completedBy: "string"
    }
  },
  {
    key: "map.step.started",
    category: "MAP",
    type: "lifecycle",
    origin: "map_step",
    defaultEnabled: true,
    description: "Triggered when a MAP step is started",
    metadataSchema: {
      stepId: "string",
      phaseId: "string",
      stepName: "string",
      projectId: "string",
      startedBy: "string"
    }
  },
  {
    key: "map.step.completed",
    category: "MAP",
    type: "milestone",
    origin: "map_step",
    defaultEnabled: true,
    description: "Triggered when a MAP step is completed",
    metadataSchema: {
      stepId: "string",
      phaseId: "string",
      stepName: "string",
      projectId: "string",
      completedBy: "string",
      completionDate: "string"
    }
  },
  {
    key: "map.step.assigned",
    category: "MAP",
    type: "assignment",
    origin: "map_step",
    defaultEnabled: true,
    description: "Triggered when a MAP step is assigned to a user",
    metadataSchema: {
      stepId: "string",
      phaseId: "string",
      stepName: "string",
      phaseName: "string",
      projectId: "string",
      assignedTo: "string"
    }
  },
  {
    key: "map.step.team_assigned",
    category: "MAP",
    type: "assignment",
    origin: "map_step",
    defaultEnabled: true,
    description: "Triggered when a MAP step is assigned to an internal team (Our team); responsibility only, never access",
    metadataSchema: {
      phaseId: "string",
      stepId: "string",
      stepName: "string",
      projectId: "string",
      assignedTeamId: "number",
      previousTeamId: "number"
    }
  },
  {
    key: "map.step.due_soon",
    category: "MAP",
    type: "deadline",
    origin: "map_step",
    defaultEnabled: true,
    description: "Triggered when MAP step due date is approaching",
    metadataSchema: {
      stepId: "string",
      dueDate: "string",
      stepName: "string",
      projectId: "string",
      daysRemaining: "number"
    }
  },
  {
    key: "map.step.status_changed",
    category: "MAP",
    type: "status_change",
    origin: "map_step",
    defaultEnabled: true,
    description: "Triggered when MAP step status changes",
    metadataSchema: {
      stepId: "string",
      stepName: "string",
      newStatus: "string",
      oldStatus: "string",
      projectId: "string"
    }
  },
  // Task Triggers
  {
    key: "map.task_assigned",
    category: "MAP",
    type: "assignment",
    origin: "map_task",
    defaultEnabled: true,
    description: "Triggered when a MAP task is assigned to a user",
    metadataSchema: {
      mapId: "number",
      taskId: "number",
      taskName: "string",
      projectId: "number",
      timestamp: "ISO8601 datetime",
      assignedBy: "string",
      assignedTo: "string"
    }
  },
  {
    key: "map.task_completed",
    category: "MAP",
    type: "milestone",
    origin: "map_task",
    defaultEnabled: true,
    description: "Triggered when a MAP task is completed",
    metadataSchema: {
      mapId: "number",
      taskId: "number",
      taskName: "string",
      projectId: "number",
      timestamp: "ISO8601 datetime",
      completedBy: "string"
    }
  },
  {
    key: "map.task_overdue",
    category: "MAP",
    type: "deadline",
    origin: "map_task",
    defaultEnabled: true,
    description: "Triggered when a MAP task becomes overdue",
    metadataSchema: {
      mapId: "number",
      taskId: "number",
      dueDate: "ISO8601 datetime",
      taskName: "string",
      projectId: "number",
      timestamp: "ISO8601 datetime",
      assignedTo: "string"
    }
  },
  {
    key: "map.task.started",
    category: "MAP",
    type: "lifecycle",
    origin: "map_task",
    defaultEnabled: true,
    description: "Triggered when a MAP task is started",
    metadataSchema: {
      stepId: "string",
      taskId: "string",
      taskName: "string",
      projectId: "string",
      startedBy: "string"
    }
  },
  {
    key: "map.task.completed",
    category: "MAP",
    type: "milestone",
    origin: "map_task",
    defaultEnabled: true,
    description: "Triggered when a MAP task is completed",
    metadataSchema: {
      stepId: "string",
      taskId: "string",
      taskName: "string",
      projectId: "string",
      completedBy: "string",
      completionDate: "string"
    }
  },
  {
    key: "map.task.assigned",
    category: "MAP",
    type: "assignment",
    origin: "map_task",
    defaultEnabled: true,
    description: "Triggered when a MAP task is assigned to a user",
    metadataSchema: {
      stepId: "string",
      taskId: "string",
      taskName: "string",
      projectId: "string",
      assignedTo: "string"
    }
  },
  {
    key: "map.task.team_assigned",
    category: "MAP",
    type: "assignment",
    origin: "map_task",
    defaultEnabled: true,
    description: "Triggered when a MAP task is assigned to an internal team (Our team); responsibility only, never access",
    metadataSchema: {
      stepId: "string",
      taskId: "string",
      taskName: "string",
      projectId: "string",
      assignedTeamId: "number",
      previousTeamId: "number"
    }
  },
  {
    key: "map.task.due_soon",
    category: "MAP",
    type: "deadline",
    origin: "map_task",
    defaultEnabled: true,
    description: "Triggered when MAP task due date is approaching",
    metadataSchema: {
      taskId: "string",
      dueDate: "string",
      taskName: "string",
      projectId: "string",
      daysRemaining: "number"
    }
  },
  {
    key: "map.task.status_changed",
    category: "MAP",
    type: "status_change",
    origin: "map_task",
    defaultEnabled: true,
    description: "Triggered when MAP task status changes",
    metadataSchema: {
      taskId: "string",
      taskName: "string",
      newStatus: "string",
      oldStatus: "string",
      projectId: "string"
    }
  },
  // Overall MAP
  {
    key: "map.status_changed",
    category: "MAP",
    type: "status_change",
    origin: "map",
    defaultEnabled: true,
    description: "Triggered when the overall MAP status changes",
    metadataSchema: {
      mapId: "number",
      changedBy: "string",
      newStatus: "string",
      projectId: "number",
      timestamp: "ISO8601 datetime",
      previousStatus: "string"
    }
  },

  // =============================================================================
  // COMMUNICATION TRIGGERS (3)
  // =============================================================================
  {
    key: "comment.added",
    category: "Communication",
    type: "content_update",
    origin: "project",
    defaultEnabled: true,
    description: "Triggered when a comment is added to a project",
    metadataSchema: {
      authorId: "string",
      commentId: "number",
      projectId: "number",
      timestamp: "ISO8601 datetime",
      commentText: "string"
    }
  },
  {
    key: "mention.user",
    category: "Communication",
    type: "notification",
    origin: "system",
    defaultEnabled: true,
    description: "Triggered when a user is mentioned in a comment or note",
    metadataSchema: {
      context: "string",
      projectId: "number",
      timestamp: "ISO8601 datetime",
      mentionedBy: "string",
      mentionedUserId: "string"
    }
  },
  {
    key: "file.uploaded",
    category: "Communication",
    type: "content_update",
    origin: "project",
    defaultEnabled: true,
    description: "Triggered when a file is uploaded to a project",
    metadataSchema: {
      fileId: "number",
      fileName: "string",
      fileSize: "number",
      projectId: "number",
      timestamp: "ISO8601 datetime",
      uploadedBy: "string"
    }
  },

  // =============================================================================
  // CUSTOMER PORTAL TRIGGERS (2) - NEW
  // =============================================================================
  {
    key: "customer.portal_accessed",
    category: "Customer Portal",
    type: "activity",
    origin: "customer",
    defaultEnabled: true,
    description: "Triggered when a customer accesses their portal",
    metadataSchema: {
      customerId: "string",
      customerName: "string",
      projectId: "string",
      userId: "string",
      accessedAt: "ISO8601 datetime"
    }
  },
  {
    key: "customer.document_viewed",
    category: "Customer Portal",
    type: "activity",
    origin: "customer",
    defaultEnabled: true,
    description: "Triggered when a customer views a document",
    metadataSchema: {
      customerId: "string",
      customerName: "string",
      documentId: "string",
      documentName: "string",
      projectId: "string",
      userId: "string",
      viewedAt: "ISO8601 datetime"
    }
  },

  // =============================================================================
  // SUCCESS CRITERIA TRIGGERS (3) - NEW
  // =============================================================================
  {
    key: "criteria.updated",
    category: "Success Criteria",
    type: "content_update",
    origin: "criteria",
    defaultEnabled: true,
    description: "Triggered when success criteria is updated",
    metadataSchema: {
      projectId: "string",
      criteriaId: "string",
      criteriaName: "string",
      updatedBy: "string",
      updatedFields: "array",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "criteria.completed",
    category: "Success Criteria",
    type: "milestone",
    origin: "criteria",
    defaultEnabled: true,
    description: "Triggered when success criteria is completed",
    metadataSchema: {
      projectId: "string",
      criteriaId: "string",
      criteriaName: "string",
      completedBy: "string",
      completionDate: "ISO8601 datetime"
    }
  },
  {
    key: "criteria.outcome_achieved",
    category: "Success Criteria",
    type: "milestone",
    origin: "criteria",
    defaultEnabled: true,
    description: "Triggered when an expected outcome is achieved",
    metadataSchema: {
      projectId: "string",
      outcomeId: "string",
      outcomeName: "string",
      criteriaId: "string",
      achievedBy: "string",
      achievedDate: "ISO8601 datetime"
    }
  },

  // =============================================================================
  // RISK ANALYSIS TRIGGERS (2) - NEW
  // =============================================================================
  {
    key: "risk.level_changed",
    category: "Risk Analysis",
    type: "status_change",
    origin: "risk",
    defaultEnabled: true,
    description: "Triggered when a project risk level changes",
    metadataSchema: {
      projectId: "string",
      projectName: "string",
      previousLevel: "string",
      newLevel: "string",
      changedBy: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "risk.ai_analysis_completed",
    category: "Risk Analysis",
    type: "notification",
    origin: "risk",
    defaultEnabled: true,
    description: "Triggered when AI risk analysis is completed",
    metadataSchema: {
      projectId: "string",
      projectName: "string",
      riskScore: "number",
      riskLevel: "string",
      analysisDate: "ISO8601 datetime",
      recommendations: "array"
    }
  },

  // =============================================================================
  // USER MANAGEMENT TRIGGERS (4) - 2 NEW
  // =============================================================================
  {
    key: "user.role_changed",
    category: "User Management",
    type: "security_event",
    origin: "user",
    defaultEnabled: true,
    description: "Triggered when a user role is changed",
    metadataSchema: {
      userId: "string",
      email: "string",
      previousRole: "string",
      newRole: "string",
      changedBy: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "user.deactivated",
    category: "User Management",
    type: "lifecycle",
    origin: "user",
    defaultEnabled: true,
    description: "Triggered when a user account is deactivated",
    metadataSchema: {
      userId: "string",
      email: "string",
      deactivatedBy: "string",
      reason: "string",
      timestamp: "ISO8601 datetime"
    }
  },

  // =============================================================================
  // REPORTS TRIGGERS (2)
  // =============================================================================
  {
    key: "report.generated",
    category: "Reports",
    type: "content_creation",
    origin: "system",
    defaultEnabled: true,
    description: "Triggered when a report is generated",
    metadataSchema: {
      reportId: "number",
      timestamp: "ISO8601 datetime",
      reportType: "string",
      generatedBy: "string"
    }
  },
  {
    key: "report.shared",
    category: "Reports",
    type: "notification",
    origin: "system",
    defaultEnabled: true,
    description: "Triggered when a report is shared with users",
    metadataSchema: {
      reportId: "number",
      sharedBy: "string",
      timestamp: "ISO8601 datetime",
      sharedWith: "array"
    }
  },

  // =============================================================================
  // SYSTEM ALERTS (6)
  // =============================================================================
  {
    key: "system.maintenance_scheduled",
    category: "System Alerts",
    type: "notification",
    origin: "system",
    defaultEnabled: true,
    description: "Triggered when system maintenance is scheduled",
    metadataSchema: {
      impact: "string",
      duration: "string",
      timestamp: "ISO8601 datetime",
      scheduledDate: "ISO8601 datetime"
    }
  },
  {
    key: "system.error",
    category: "System Alerts",
    type: "action",
    origin: "system",
    defaultEnabled: false,
    description: "Triggered when a system error occurs requiring admin attention",
    metadataSchema: {
      severity: "string",
      errorCode: "string",
      timestamp: "string",
      errorMessage: "string"
    }
  },
  {
    key: "system.error_occurred",
    category: "System Alerts",
    type: "error",
    origin: "system",
    defaultEnabled: false,
    description: "Triggered when a critical system error occurs",
    metadataSchema: {
      severity: "string",
      errorCode: "string",
      timestamp: "ISO8601 datetime",
      errorMessage: "string",
      affectedUsers: "number"
    }
  },
  {
    key: "system.backup_completed",
    category: "System Alerts",
    type: "notification",
    origin: "system",
    defaultEnabled: false,
    description: "Triggered when a system backup completes",
    metadataSchema: {
      status: "string",
      backupId: "string",
      dataSize: "number",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "report.scheduled",
    category: "System Alerts",
    type: "action",
    origin: "system",
    defaultEnabled: true,
    description: "Triggered when a scheduled report is ready for delivery",
    metadataSchema: {
      reportId: "string",
      recipients: "array",
      reportType: "string",
      generatedBy: "string"
    }
  },
  {
    key: "feature.request.created",
    category: "System Alerts",
    type: "lifecycle",
    origin: "system",
    defaultEnabled: true,
    description: "Triggered when a new feature request is created",
    metadataSchema: {
      title: "string",
      createdBy: "string",
      requestId: "string"
    }
  },
  {
    key: "support.request.created",
    category: "System Alerts",
    type: "lifecycle",
    origin: "system",
    defaultEnabled: true,
    description: "Triggered when a new support request is created",
    metadataSchema: {
      title: "string",
      priority: "string",
      createdBy: "string",
      requestId: "string"
    }
  },
  {
    key: "support.request.updated",
    category: "System Alerts",
    type: "action",
    origin: "system",
    defaultEnabled: true,
    description: "Triggered when a support request is updated",
    metadataSchema: {
      title: "string",
      status: "string",
      requestId: "string",
      updatedBy: "string"
    }
  },
  {
    key: "system.announcement_published",
    category: "System Alerts",
    type: "notification",
    origin: "system",
    defaultEnabled: true,
    description: "Triggered when a system announcement is published",
    metadataSchema: {
      announcementId: "number",
      title: "string",
      severity: "string",
      targetRoles: "array",
      startDate: "ISO8601 datetime",
      endDate: "ISO8601 datetime",
      showInHeader: "boolean",
      showInFooter: "boolean",
      sendEmail: "boolean",
      createdBy: "string",
      timestamp: "ISO8601 datetime"
    }
  },

  // =============================================================================
  // SALESFORCE INTEGRATION TRIGGERS (8) - NEW
  // =============================================================================
  {
    key: "salesforce.sync_completed",
    category: "Salesforce Integration",
    type: "notification",
    origin: "salesforce",
    defaultEnabled: true,
    description: "Triggered when a Salesforce sync run completes successfully",
    metadataSchema: {
      syncRunId: "number",
      syncType: "string",
      entity: "string",
      recordsProcessed: "number",
      recordsSucceeded: "number",
      recordsFailed: "number",
      duration: "number",
      triggeredBy: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "salesforce.sync_failed",
    category: "Salesforce Integration",
    type: "error",
    origin: "salesforce",
    defaultEnabled: true,
    description: "Triggered when a Salesforce sync run fails with errors",
    metadataSchema: {
      syncRunId: "number",
      syncType: "string",
      entity: "string",
      errorMessage: "string",
      errorCode: "string",
      recordsFailed: "number",
      triggeredBy: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "salesforce.record_linked",
    category: "Salesforce Integration",
    type: "action",
    origin: "salesforce",
    defaultEnabled: true,
    description: "Triggered when a CriteriaIQ record is linked to a Salesforce record",
    metadataSchema: {
      entity: "string",
      recordId: "string",
      salesforceId: "string",
      salesforceObject: "string",
      linkedBy: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "salesforce.record_unlinked",
    category: "Salesforce Integration",
    type: "action",
    origin: "salesforce",
    defaultEnabled: true,
    description: "Triggered when a Salesforce record link is removed or broken",
    metadataSchema: {
      entity: "string",
      recordId: "string",
      salesforceId: "string",
      salesforceObject: "string",
      reason: "string",
      unlinkedBy: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "salesforce.update_pushed",
    category: "Salesforce Integration",
    type: "action",
    origin: "salesforce",
    defaultEnabled: true,
    description: "Triggered when a workflow automation pushes an update to Salesforce",
    metadataSchema: {
      ruleId: "number",
      ruleName: "string",
      objectType: "string",
      salesforceId: "string",
      fieldsUpdated: "array",
      projectId: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "salesforce.update_failed",
    category: "Salesforce Integration",
    type: "error",
    origin: "salesforce",
    defaultEnabled: true,
    description: "Triggered when a workflow Salesforce update action fails",
    metadataSchema: {
      ruleId: "number",
      ruleName: "string",
      objectType: "string",
      salesforceId: "string",
      errorMessage: "string",
      errorCode: "string",
      retryAttempt: "number",
      projectId: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "salesforce.connection_expired",
    category: "Salesforce Integration",
    type: "security_event",
    origin: "salesforce",
    defaultEnabled: true,
    description: "Triggered when Salesforce OAuth tokens expire and need re-authentication",
    metadataSchema: {
      userId: "string",
      environment: "string",
      lastRefreshAttempt: "ISO8601 datetime",
      errorMessage: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "salesforce.field_mapping_changed",
    category: "Salesforce Integration",
    type: "action",
    origin: "salesforce",
    defaultEnabled: true,
    description: "Triggered when an admin creates, updates, or deletes a field mapping",
    metadataSchema: {
      mappingId: "number",
      action: "string",
      entity: "string",
      cqiField: "string",
      sfField: "string",
      direction: "string",
      changedBy: "string",
      timestamp: "ISO8601 datetime"
    }
  },

  // =============================================================================
  // WEBHOOK DELIVERY TRIGGERS (8) - NEW
  // =============================================================================
  {
    key: "webhook.delivery_succeeded",
    category: "Webhook Delivery",
    type: "notification",
    origin: "webhook",
    defaultEnabled: true,
    description: "Triggered when a webhook is successfully delivered to the endpoint",
    metadataSchema: {
      webhookId: "number",
      webhookName: "string",
      endpointUrl: "string",
      httpStatus: "number",
      responseTime: "number",
      ruleId: "number",
      projectId: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "webhook.delivery_failed",
    category: "Webhook Delivery",
    type: "error",
    origin: "webhook",
    defaultEnabled: true,
    description: "Triggered when a webhook delivery attempt fails",
    metadataSchema: {
      webhookId: "number",
      webhookName: "string",
      endpointUrl: "string",
      httpStatus: "number",
      errorMessage: "string",
      retryAttempt: "number",
      maxRetries: "number",
      ruleId: "number",
      projectId: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "webhook.retry_exhausted",
    category: "Webhook Delivery",
    type: "error",
    origin: "webhook",
    defaultEnabled: true,
    description: "Triggered when all webhook retry attempts have been exhausted",
    metadataSchema: {
      webhookId: "number",
      webhookName: "string",
      endpointUrl: "string",
      totalAttempts: "number",
      lastErrorMessage: "string",
      firstAttemptAt: "ISO8601 datetime",
      lastAttemptAt: "ISO8601 datetime",
      ruleId: "number",
      projectId: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "webhook.endpoint_unreachable",
    category: "Webhook Delivery",
    type: "error",
    origin: "webhook",
    defaultEnabled: true,
    description: "Triggered when a webhook endpoint is unreachable (network/DNS failure)",
    metadataSchema: {
      webhookId: "number",
      webhookName: "string",
      endpointUrl: "string",
      errorType: "string",
      errorMessage: "string",
      ruleId: "number",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "webhook.response_error",
    category: "Webhook Delivery",
    type: "error",
    origin: "webhook",
    defaultEnabled: true,
    description: "Triggered when a webhook endpoint returns an error response (4xx/5xx)",
    metadataSchema: {
      webhookId: "number",
      webhookName: "string",
      endpointUrl: "string",
      httpStatus: "number",
      responseBody: "string",
      ruleId: "number",
      projectId: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "webhook.created",
    category: "Webhook Delivery",
    type: "lifecycle",
    origin: "webhook",
    defaultEnabled: true,
    description: "Triggered when a new webhook configuration is created",
    metadataSchema: {
      webhookId: "number",
      webhookName: "string",
      webhookType: "string",
      endpointUrl: "string",
      createdBy: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "webhook.updated",
    category: "Webhook Delivery",
    type: "action",
    origin: "webhook",
    defaultEnabled: true,
    description: "Triggered when a webhook configuration is modified",
    metadataSchema: {
      webhookId: "number",
      webhookName: "string",
      updatedFields: "array",
      updatedBy: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "webhook.disabled",
    category: "Webhook Delivery",
    type: "action",
    origin: "webhook",
    defaultEnabled: true,
    description: "Triggered when a webhook is disabled or deactivated",
    metadataSchema: {
      webhookId: "number",
      webhookName: "string",
      disabledBy: "string",
      reason: "string",
      timestamp: "ISO8601 datetime"
    }
  },

  // =============================================================================
  // AI & ASSESSMENT TRIGGERS (6)
  // =============================================================================
  {
    key: "ai.assessment_created",
    category: "AI & Assessment",
    type: "lifecycle",
    origin: "ai_assessment",
    defaultEnabled: true,
    description: "Triggered when a new AI assessment is created for a project",
    metadataSchema: {
      assessmentId: "number",
      projectId: "number",
      projectName: "string",
      rulesetId: "number",
      createdBy: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "ai.assessment_completed",
    category: "AI & Assessment",
    type: "milestone",
    origin: "ai_assessment",
    defaultEnabled: true,
    description: "Triggered when an AI assessment scoring is completed",
    metadataSchema: {
      assessmentId: "number",
      projectId: "number",
      projectName: "string",
      overallScore: "number",
      riskLevel: "string",
      completedAt: "ISO8601 datetime"
    }
  },
  {
    key: "ai.assessment_failed",
    category: "AI & Assessment",
    type: "error",
    origin: "ai_assessment",
    defaultEnabled: true,
    description: "Triggered when an AI assessment fails due to provider error or timeout",
    metadataSchema: {
      assessmentId: "number",
      projectId: "number",
      errorMessage: "string",
      provider: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "ai.provider_configured",
    category: "AI & Assessment",
    type: "action",
    origin: "ai_provider",
    defaultEnabled: true,
    description: "Triggered when an AI provider is configured or updated",
    metadataSchema: {
      providerId: "number",
      providerName: "string",
      model: "string",
      configuredBy: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "ai.provider_error",
    category: "AI & Assessment",
    type: "error",
    origin: "ai_provider",
    defaultEnabled: true,
    description: "Triggered when an AI provider returns an error during API call",
    metadataSchema: {
      providerId: "number",
      providerName: "string",
      errorCode: "string",
      errorMessage: "string",
      endpoint: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "ai.recommendation_generated",
    category: "AI & Assessment",
    type: "action",
    origin: "ai_assessment",
    defaultEnabled: true,
    description: "Triggered when AI generates recommendations or predictions for a project",
    metadataSchema: {
      assessmentId: "number",
      projectId: "number",
      projectName: "string",
      recommendationType: "string",
      confidence: "number",
      timestamp: "ISO8601 datetime"
    }
  },

  // =============================================================================
  // GAP ANALYSIS TRIGGERS (3)
  // =============================================================================
  {
    key: "gap_analysis.created",
    category: "Gap Analysis",
    type: "lifecycle",
    origin: "gap_analysis",
    defaultEnabled: true,
    description: "Triggered when a new gap analysis is created for a project",
    metadataSchema: {
      gapAnalysisId: "number",
      projectId: "number",
      projectName: "string",
      createdBy: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "gap_analysis.completed",
    category: "Gap Analysis",
    type: "milestone",
    origin: "gap_analysis",
    defaultEnabled: true,
    description: "Triggered when a gap analysis is completed with findings",
    metadataSchema: {
      gapAnalysisId: "number",
      projectId: "number",
      projectName: "string",
      totalGaps: "number",
      criticalGaps: "number",
      completedBy: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "gap_analysis.gap_resolved",
    category: "Gap Analysis",
    type: "action",
    origin: "gap_analysis",
    defaultEnabled: true,
    description: "Triggered when an identified gap is marked as resolved",
    metadataSchema: {
      gapAnalysisId: "number",
      gapId: "number",
      projectId: "number",
      gapTitle: "string",
      resolvedBy: "string",
      resolution: "string",
      timestamp: "ISO8601 datetime"
    }
  },

  // =============================================================================
  // PROJECT CLOSURE / PCOS TRIGGERS (3)
  // =============================================================================
  {
    key: "project_closure.initiated",
    category: "Project Closure",
    type: "lifecycle",
    origin: "project_closure",
    defaultEnabled: true,
    description: "Triggered when a project closure process is initiated",
    metadataSchema: {
      projectId: "number",
      projectName: "string",
      initiatedBy: "string",
      closureType: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "project_closure.completed",
    category: "Project Closure",
    type: "milestone",
    origin: "project_closure",
    defaultEnabled: true,
    description: "Triggered when a project closure is finalized with outcome recorded",
    metadataSchema: {
      projectId: "number",
      projectName: "string",
      outcome: "string",
      closedBy: "string",
      lessonsLearned: "boolean",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "project_closure.outcome_recorded",
    category: "Project Closure",
    type: "action",
    origin: "project_closure",
    defaultEnabled: true,
    description: "Triggered when a project outcome intelligence record is saved",
    metadataSchema: {
      projectId: "number",
      projectName: "string",
      outcomeType: "string",
      recordedBy: "string",
      score: "number",
      timestamp: "ISO8601 datetime"
    }
  },

  // =============================================================================
  // DOCUMENTATION SYNC TRIGGERS (3)
  // =============================================================================
  {
    key: "docs_sync.completed",
    category: "Documentation Sync",
    type: "milestone",
    origin: "docs_sync",
    defaultEnabled: true,
    description: "Triggered when a documentation sync from GitHub completes successfully",
    metadataSchema: {
      repositoryId: "number",
      repositoryName: "string",
      filesProcessed: "number",
      filesUpdated: "number",
      duration: "number",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "docs_sync.failed",
    category: "Documentation Sync",
    type: "error",
    origin: "docs_sync",
    defaultEnabled: true,
    description: "Triggered when a documentation sync fails due to errors",
    metadataSchema: {
      repositoryId: "number",
      repositoryName: "string",
      errorMessage: "string",
      errorType: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "docs_sync.repository_configured",
    category: "Documentation Sync",
    type: "action",
    origin: "docs_sync",
    defaultEnabled: true,
    description: "Triggered when a new documentation repository is configured for syncing",
    metadataSchema: {
      repositoryId: "number",
      repositoryName: "string",
      owner: "string",
      branch: "string",
      configuredBy: "string",
      timestamp: "ISO8601 datetime"
    }
  },

  // =============================================================================
  // ARCHIVE MANAGEMENT TRIGGERS (3)
  // =============================================================================
  {
    key: "archive.item_archived",
    category: "Archive Management",
    type: "action",
    origin: "archive",
    defaultEnabled: true,
    description: "Triggered when a project, customer, or user is archived (soft-deleted)",
    metadataSchema: {
      entityType: "string",
      entityId: "number",
      entityName: "string",
      archivedBy: "string",
      reason: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "archive.item_restored",
    category: "Archive Management",
    type: "action",
    origin: "archive",
    defaultEnabled: true,
    description: "Triggered when an archived item is restored from the archive",
    metadataSchema: {
      entityType: "string",
      entityId: "number",
      entityName: "string",
      restoredBy: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "archive.bulk_operation",
    category: "Archive Management",
    type: "action",
    origin: "archive",
    defaultEnabled: true,
    description: "Triggered when a bulk archive or restore operation is performed",
    metadataSchema: {
      operation: "string",
      entityType: "string",
      itemCount: "number",
      performedBy: "string",
      timestamp: "ISO8601 datetime"
    }
  },

  // =============================================================================
  // COMPLIANCE TRIGGERS (5)
  // =============================================================================
  {
    key: "compliance.regulation_added",
    category: "Compliance",
    type: "lifecycle",
    origin: "compliance",
    defaultEnabled: true,
    description: "Triggered when a new compliance regulation is added to the system",
    metadataSchema: {
      regulationId: "number",
      regulationName: "string",
      category: "string",
      addedBy: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "compliance.regulation_updated",
    category: "Compliance",
    type: "action",
    origin: "compliance",
    defaultEnabled: true,
    description: "Triggered when a compliance regulation is updated or modified",
    metadataSchema: {
      regulationId: "number",
      regulationName: "string",
      updatedFields: "array",
      updatedBy: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "compliance.status_changed",
    category: "Compliance",
    type: "status_change",
    origin: "compliance",
    defaultEnabled: true,
    description: "Triggered when a project's compliance status changes",
    metadataSchema: {
      projectId: "number",
      projectName: "string",
      regulationId: "number",
      oldStatus: "string",
      newStatus: "string",
      changedBy: "string",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "compliance.review_due",
    category: "Compliance",
    type: "deadline",
    origin: "compliance",
    defaultEnabled: true,
    description: "Triggered when a compliance review deadline is approaching",
    metadataSchema: {
      regulationId: "number",
      regulationName: "string",
      projectId: "number",
      dueDate: "ISO8601 datetime",
      daysRemaining: "number",
      timestamp: "ISO8601 datetime"
    }
  },
  {
    key: "compliance.violation_detected",
    category: "Compliance",
    type: "security_event",
    origin: "compliance",
    defaultEnabled: true,
    description: "Triggered when a compliance violation or non-conformity is detected",
    metadataSchema: {
      regulationId: "number",
      regulationName: "string",
      projectId: "number",
      projectName: "string",
      severity: "string",
      description: "string",
      detectedBy: "string",
      timestamp: "ISO8601 datetime"
    }
  },
];

/**
 * Get all system triggers
 */
export function getSystemTriggers(): TriggerDefinition[] {
  return SYSTEM_TRIGGERS;
}

/**
 * Get system trigger by key
 */
export function getSystemTrigger(key: string): TriggerDefinition | undefined {
  return SYSTEM_TRIGGERS.find(t => t.key === key);
}

/**
 * Get system triggers by category
 */
export function getSystemTriggersByCategory(category: string): TriggerDefinition[] {
  return SYSTEM_TRIGGERS.filter(t => t.category === category);
}

/**
 * Get all trigger categories
 */
export function getTriggerCategories(): string[] {
  return Array.from(new Set(SYSTEM_TRIGGERS.map(t => t.category)));
}

/**
 * Get trigger count
 */
export function getTriggerCount(): number {
  return SYSTEM_TRIGGERS.length;
}
