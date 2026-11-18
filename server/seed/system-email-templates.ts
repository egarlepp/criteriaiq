// AUTO-GENERATED snapshot of the 19 system email templates from the dev workspace.

  import type { emailTemplates } from "@shared/schema/email";

  export type EmailTemplateInsertRow = typeof emailTemplates.$inferInsert;

  export interface SystemEmailTemplateSeed {
    name: string;
    template_key: string;
    description: string | null;
    category: string;
    email_type: string;
    subject: string;
    text_content: string | null;
    html_content: string | null;
    email_content: string | null;
    variables: string[];
    is_active: boolean;
    email_safe_mode: boolean;
    include_project_pdf: boolean;
    trigger_events: string[] | null;
    recipient_type: string;
    to_recipients: string | null;
    cc_recipients: string | null;
    bcc_recipients: string | null;
    /** Resolved at seed time via SELECT id FROM email_designs WHERE name = design_name. */
    design_name: string | null;
    /**
     * Snapshot field carried in the JSON payload — every row in this
     * file is by definition a system template (`is_system = true`).
     * The seeder hardcodes `isSystem: true` on insert/update and
     * never reads this property, but we keep the key on the seed
     * object so the JSON aggregator output is loss-less.
     */
    is_system: boolean;
  }

  export const SYSTEM_EMAIL_TEMPLATE_SEEDS: ReadonlyArray<SystemEmailTemplateSeed> = [
  {
    "name": "Account Approval Notification",
    "template_key": "account_approved",
    "description": "Sent when a user account is approved by an administrator",
    "category": "Authentication",
    "email_type": "approval",
    "subject": "Your Account Has Been Approved - Technical Validation Project Manager",
    "text_content": "Hello {{firstName}} {{lastName}},\n\nGreat news! Your account for Technical Validation Project Manager has been approved.\n\nAccount Details:\n- Email: {{userEmail}}\n- Role: {{userRole}}\n\nYou can now log in and access the platform at: {{dashboardUrl}}\n\nWelcome to the team!\n\nTechnical Validation Project Manager Team\nData Security that Starts with Identity™",
    "html_content": "<!DOCTYPE html>\n<html>\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n  <title>Solutions Engineering</title>\n</head>\n<body style=\"font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5;\">\n  <table width=\"735\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width: 735px !important; max-width: 735px !important; margin: 0 auto; background-color: #ffffff; box-shadow: 0 0 10px rgba(0,0,0,0.1);\">\n    <tr>\n      <td style=\"width: 735px !important;\">\n\n        <!-- Header -->\n        <table width=\"735\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width: 735px !important; background-color: {{HEADER_BG}} !important; margin: 0 0 30px 0; border-collapse: collapse; table-layout: fixed; height: 52px !important;\">\n          <tr style=\"height: 52px !important;\">\n\n            <!-- Logo area -->\n            <td style=\"padding: 0; background-color: {{HEADER_BG}} !important; vertical-align: middle; width: 180px; height: 52px !important; position: relative;\">\n              <table width=\"180\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"height: 52px;\">\n                <tr>\n                  <td style=\"padding: 2px 0 0 20px; vertical-align: middle; height: 52px;\">\n                    <img src=\"{{LOGO_SRC}}\" alt=\"{{LOGO_ALT}}\" width=\"{{LOGO_WIDTH}}\" height=\"{{LOGO_HEIGHT}}\" style=\"height: {{LOGO_HEIGHT}}px !important; width: {{LOGO_WIDTH}}px !important; display: block;\">\n                  </td>\n                </tr>\n              </table>\n            </td>\n\n            <!-- Right title -->\n            <td style=\"padding: 0; background-color: {{HEADER_BG}} !important; vertical-align: bottom; text-align: right; width: 555px; height: 52px !important; position: relative;\">\n              <table width=\"555\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"height: 52px;\">\n                <tr>\n                  <td style=\"padding: 0 20px 4px 0; vertical-align: bottom; text-align: right; height: 52px;\">\n                    <span style=\"color: #ffffff; font-size: 14px; font-weight: bold; line-height: 14px;\">{{RIGHT_TITLE}}</span>\n                  </td>\n                </tr>\n              </table>\n            </td>\n\n          </tr>\n        </table>\n        <!-- /Header -->\n\n      </td>\n    </tr>\n\n    <!-- Body (injected by app) -->\n    <tr>\n      <td style=\"padding: 0 30px 30px 30px; width: 735px !important;\">\n        Hello {{firstName}} {{lastName}},\n\nGreat news! Your account for Technical Validation Project Manager has been approved.\n\nAccount Details:\n- Email: {{userEmail}}\n- Role: {{userRole}}\n\nYou can now log in and access the platform at: {{dashboardUrl}}\n\nWelcome to the team!\n\nTechnical Validation Project Manager Team\nData Security that Starts with Identity™\n      </td>\n    </tr>\n    <!-- /Body -->\n\n    <!-- Footer -->\n    <tr>\n      <td style=\"background-color: #f8f9fa; padding: 20px 30px; border-top: 1px solid #e9ecef; text-align: center; font-size: 12px; color: #6c757d; width: 735px !important;\">\n        <p style=\"margin: 0;\">{{FOOTER_LINE1}}</p>\n        <p style=\"margin: 5px 0 0 0;\">{{FOOTER_LINE2}}</p>\n      </td>\n    </tr>\n    <!-- /Footer -->\n\n  </table>\n</body>\n</html>",
    "email_content": "<!-- Green Success Box with Icon Success notice (bulletproof for Outlook) -->\n<div style=\"background-color: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 10px; border-radius: 5px; margin: 10px 0;\"><strong>🎉 Great news!</strong> Your account has been approved.</div>\n<p><strong>Hello Test User,</strong></p>\n<p>Your account for CriteriaIQ Technical Validation Project Manager has been approved and is now active for logging in; details are below.</p>\n<!-- Account Details Box -->\n<div style=\"background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;\">\n<h3 style=\"margin-top: 0; color: #1e3a8a;\">Account Details:</h3>\n<ul style=\"margin: 0; padding-left: 10px;\">\n<li><strong>Email:</strong> user@example.com</li>\n<li><strong>Role:</strong> Engineer</li>\n</ul>\n</div>\n<p>You can now log in and access the platform:</p>\n<!-- Access Platform button (Outlook-safe) -->\n<table style=\"margin: 20px 0;\" role=\"presentation\" border=\"0\" cellspacing=\"0\" cellpadding=\"0\">\n<tbody>\n<tr>\n<td align=\"left\"><!-- [if !mso]><!-- --> <a style=\"display: inline-block; background: #0f3796; border-radius: 6px; color: #ffffff; font-family: Arial,Helvetica,sans-serif; font-size: 16px; font-weight: bold; line-height: 44px; text-align: center; text-decoration: none; width: 220px; -webkit-text-size-adjust: none;\" href=\"https://your-domain.example.com/dashboard\" target=\"_blank\" rel=\"noopener\"> Access Platform </a> <!--<![endif]--></td>\n</tr>\n</tbody>\n</table>\n<p><strong>Welcome to CriteriaIQ!</strong></p>",
    "variables": [
      "{{firstName}}",
      "{{lastName}}",
      "{{userEmail}}",
      "{{userRole}}",
      "{{dashboardUrl}}"
    ],
    "is_active": true,
    "is_system": true,
    "email_safe_mode": false,
    "include_project_pdf": false,
    "trigger_events": [
      "account_approved"
    ],
    "recipient_type": "{},internal,external",
    "to_recipients": "",
    "cc_recipients": "",
    "bcc_recipients": "",
    "design_name": "CriteriaIQ Default"
  },
  {
    "name": "Evaluation Request Submitted",
    "template_key": "evaluation_request_submitted",
    "description": "Notification sent when a customer submits an evaluation request for solutions",
    "category": "Project Notifications",
    "email_type": "notification",
    "subject": "Your Evaluation Request Has Been Received - {{customerName}}",
    "text_content": "Dear {{customerName}},\n\nThank you for your interest in evaluating our solutions. We have received your evaluation request and our team will review it shortly.\n\nEvaluation Request Details:\n- Customer: {{customerName}}\n- Requested Solutions: {{requestedSolutions}}\n- Submission Date: {{submissionDate}}\n- Request Status: {{requestStatus}}\n\nOur Solutions Engineering team will contact you within 1-2 business days to discuss your evaluation requirements and coordinate next steps.\n\nIf you have any questions in the meantime, please don't hesitate to contact us.\n\nBest regards,\nThe Solutions Engineering Team\n\n---\nThis email was sent from the CriteriaIQ Technical Validation\n© your organization. All rights reserved.",
    "html_content": "<p style=\"font-size: 16px; color: #374151; margin-bottom: 20px;\">Dear <strong>{{customerName}}</strong>,</p>\n      \n<p style=\"color: #374151; line-height: 1.6;\">Thank you for your interest in evaluating our solutions. We have received your evaluation request and our team will review it shortly.</p>\n\n<div style=\"background: #f9fafb; border-left: 4px solid #3b82f6; padding: 20px; margin: 20px 0; border-radius: 0 4px 4px 0;\">\n  <h3 style=\"color: #1f2937; margin: 0 0 15px 0; font-size: 18px;\">Evaluation Request Details</h3>\n  <ul style=\"color: #374151; line-height: 1.8; margin: 0; padding-left: 20px;\">\n    <li><strong>Customer:</strong> {{customerName}}</li>\n    <li><strong>Requested Solutions:</strong> {{requestedSolutions}}</li>\n    <li><strong>Submission Date:</strong> {{submissionDate}}</li>\n    <li><strong>Request Status:</strong> <span style=\"color: #059669; font-weight: bold;\">{{requestStatus}}</span></li>\n  </ul>\n</div>\n\n<p style=\"color: #374151; line-height: 1.6;\">Our Solutions Engineering team will contact you within <strong>1-2 business days</strong> to discuss your evaluation requirements and coordinate next steps.</p>\n\n<p style=\"color: #374151; line-height: 1.6;\">If you have any questions in the meantime, please don't hesitate to contact us.</p>\n\n<div style=\"margin: 30px 0; text-align: center;\">\n  <div style=\"display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; font-weight: bold;\">\n    Evaluation Request Submitted Successfully\n  </div>\n</div>\n\n<p style=\"color: #374151; margin-bottom: 30px;\">Best regards,<br><strong>The Solutions Engineering Team</strong></p>",
    "email_content": null,
    "variables": [
      "{{customerName}}",
      "{{requestedSolutions}}",
      "{{submissionDate}}",
      "{{requestStatus}}",
      "{{customerEmail}}"
    ],
    "is_active": true,
    "is_system": true,
    "email_safe_mode": true,
    "include_project_pdf": false,
    "trigger_events": [
      "evaluation_request_submitted"
    ],
    "recipient_type": "external",
    "to_recipients": "{{customerEmail}}",
    "cc_recipients": null,
    "bcc_recipients": null,
    "design_name": null
  },
  {
    "name": "MAP Phase Assigned",
    "template_key": "map_phase_assigned",
    "description": "Notification sent when a MAP phase is assigned to a user",
    "category": "MAP",
    "email_type": "notification",
    "subject": "[MAP] {{phase.name}} assigned in {{project.name}}",
    "text_content": "Hello {{assignedUser.firstName}} {{assignedUser.lastName}},\n\nYou have been assigned to a new MAP phase in the project \"{{project.name}}\".\n\nPhase Details:\n- Phase: {{phase.name}}\n- Description: {{phase.description}}\n- Start Date: {{phase.startDate}}\n- Target Completion Date: {{phase.targetDate}}\n- Status: {{phase.status}}\n- Total Steps: {{phase.totalSteps}}\n- Total Tasks: {{phase.totalTasks}}\n\nYou can view this phase and its steps at: {{projectUrl}}\n\nPlease review the phase details and begin work on the associated steps and tasks.\n\nBest regards,\nCriteriaIQ Technical Validation Team",
    "html_content": "<h2>New MAP Phase Assignment</h2>\n<p>Hello {{assignedUser.firstName}} {{assignedUser.lastName}},</p>\n<p>You have been assigned to a new MAP phase in the project \"<strong>{{project.name}}</strong>\".</p>\n\n<div style=\"background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;\">\n<h3 style=\"margin-top: 0; color: #1e3a8a;\">Phase Details</h3>\n<p><strong>Phase:</strong> {{phase.name}}</p>\n<p><strong>Description:</strong> {{phase.description}}</p>\n<p><strong>Start Date:</strong> {{phase.startDate}}</p>\n<p><strong>Target Completion Date:</strong> {{phase.targetDate}}</p>\n<p><strong>Status:</strong> {{phase.status}}</p>\n<p><strong>Total Steps:</strong> {{phase.totalSteps}}</p>\n<p><strong>Total Tasks:</strong> {{phase.totalTasks}}</p>\n</div>\n\n<p>You can view this phase and its steps at: <a href=\"{{projectUrl}}\">{{projectUrl}}</a></p>\n<p>Please review the phase details and begin work on the associated steps and tasks.</p>\n\n<p>Best regards,<br>\nCriteriaIQ Technical Validation Team</p>",
    "email_content": null,
    "variables": [
      "assignedUser",
      "phase",
      "project",
      "projectUrl"
    ],
    "is_active": true,
    "is_system": true,
    "email_safe_mode": true,
    "include_project_pdf": false,
    "trigger_events": [
      "map_phase_assigned"
    ],
    "recipient_type": "internal",
    "to_recipients": "{{assignedUserEmail}}",
    "cc_recipients": null,
    "bcc_recipients": null,
    "design_name": null
  },
  {
    "name": "MAP Phase Completed",
    "template_key": "map_phase_completed",
    "description": "Notification sent when a MAP phase is completed",
    "category": "MAP",
    "email_type": "notification",
    "subject": "[MAP] Phase Complete: {{phase.name}} ({{project.name}})",
    "text_content": "Hello {{recipientUser.firstName}} {{recipientUser.lastName}},\n\nGreat news! The MAP phase \"{{phase.name}}\" has been completed in project \"{{project.name}}\".\n\nPhase Summary:\n- Phase: {{phase.name}}\n- Completed Date: {{phase.completedDate}}\n- Total Steps: {{phase.totalSteps}}\n- Total Tasks: {{phase.totalTasks}}\n- Duration: {{phase.duration}} days\n- Progress: 100%\n\nView the project at: {{projectUrl}}\n\nCongratulations to everyone involved!\n\nBest regards,\nCriteriaIQ Technical Validation Team",
    "html_content": "<h2>MAP Phase Completed!</h2>\n<p>Hello {{recipientUser.firstName}} {{recipientUser.lastName}},</p>\n<p>Great news! The MAP phase \"<strong>{{phase.name}}</strong>\" has been completed in project \"<strong>{{project.name}}</strong>\".</p>\n\n<div style=\"background-color: #f0fdf4; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #10b981;\">\n<h3 style=\"margin-top: 0; color: #047857;\">Phase Summary</h3>\n<p><strong>Phase:</strong> {{phase.name}}</p>\n<p><strong>Completed Date:</strong> {{phase.completedDate}}</p>\n<p><strong>Total Steps:</strong> {{phase.totalSteps}}</p>\n<p><strong>Total Tasks:</strong> {{phase.totalTasks}}</p>\n<p><strong>Duration:</strong> {{phase.duration}} days</p>\n<p><strong>Progress:</strong> 100%</p>\n</div>\n\n<p>View the project at: <a href=\"{{projectUrl}}\">{{projectUrl}}</a></p>\n<p>Congratulations to everyone involved!</p>\n\n<p>Best regards,<br>\nCriteriaIQ Technical Validation Team</p>",
    "email_content": null,
    "variables": [
      "recipientUser",
      "phase",
      "project",
      "projectUrl"
    ],
    "is_active": true,
    "is_system": true,
    "email_safe_mode": true,
    "include_project_pdf": false,
    "trigger_events": [
      "map_phase_completed"
    ],
    "recipient_type": "internal",
    "to_recipients": "{{projectTeamEmails}}",
    "cc_recipients": null,
    "bcc_recipients": null,
    "design_name": null
  },
  {
    "name": "MAP Phase Due Soon",
    "template_key": "map_phase_due_soon",
    "description": "Notification sent when a MAP phase is approaching its target completion date",
    "category": "MAP",
    "email_type": "notification",
    "subject": "[MAP] Due Soon: {{phase.name}} ({{project.name}})",
    "text_content": "Hello {{recipientUser.firstName}} {{recipientUser.lastName}},\n\nThis is a reminder that the MAP phase \"{{phase.name}}\" in project \"{{project.name}}\" is approaching its target completion date.\n\nPhase Details:\n- Phase: {{phase.name}}\n- Target Completion Date: {{phase.targetDate}}\n- Days Remaining: {{phase.daysRemaining}}\n- Current Status: {{phase.status}}\n- Current Progress: {{phase.progressPercent}}%\n- Remaining Steps: {{phase.remainingSteps}}\n- Remaining Tasks: {{phase.remainingTasks}}\n\nYou can view the phase and update progress at: {{projectUrl}}\n\nPlease ensure all steps and tasks are on track for timely completion.\n\nBest regards,\nCriteriaIQ Technical Validation Team",
    "html_content": "<h2>MAP Phase Due Soon</h2>\n<p>Hello {{recipientUser.firstName}} {{recipientUser.lastName}},</p>\n<p>This is a reminder that the MAP phase \"<strong>{{phase.name}}</strong>\" in project \"<strong>{{project.name}}</strong>\" is approaching its target completion date.</p>\n\n<div style=\"background-color: #fef3c7; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #f59e0b;\">\n<h3 style=\"margin-top: 0; color: #b45309;\">Phase Details</h3>\n<p><strong>Phase:</strong> {{phase.name}}</p>\n<p><strong>Target Completion Date:</strong> {{phase.targetDate}}</p>\n<p><strong>Days Remaining:</strong> {{phase.daysRemaining}}</p>\n<p><strong>Current Status:</strong> {{phase.status}}</p>\n<p><strong>Current Progress:</strong> {{phase.progressPercent}}%</p>\n<p><strong>Remaining Steps:</strong> {{phase.remainingSteps}}</p>\n<p><strong>Remaining Tasks:</strong> {{phase.remainingTasks}}</p>\n</div>\n\n<p>You can view the phase and update progress at: <a href=\"{{projectUrl}}\">{{projectUrl}}</a></p>\n<p>Please ensure all steps and tasks are on track for timely completion.</p>\n\n<p>Best regards,<br>\nCriteriaIQ Technical Validation Team</p>",
    "email_content": null,
    "variables": [
      "recipientUser",
      "phase",
      "project",
      "projectUrl"
    ],
    "is_active": true,
    "is_system": true,
    "email_safe_mode": true,
    "include_project_pdf": false,
    "trigger_events": [
      "map_phase_due_soon"
    ],
    "recipient_type": "internal",
    "to_recipients": "{{projectTeamEmails}}",
    "cc_recipients": null,
    "bcc_recipients": null,
    "design_name": null
  },
  {
    "name": "MAP Phase Status Changed",
    "template_key": "map_phase_status_changed",
    "description": "Notification sent when a MAP phase status is updated",
    "category": "MAP",
    "email_type": "notification",
    "subject": "[MAP] {{phase.name}} → {{phase.newStatus}} ({{project.name}})",
    "text_content": "Hello {{recipientUser.firstName}} {{recipientUser.lastName}},\n\nThe status of MAP phase \"{{phase.name}}\" in project \"{{project.name}}\" has been updated.\n\nStatus Change:\n- Phase: {{phase.name}}\n- Previous Status: {{phase.oldStatus}}\n- New Status: {{phase.newStatus}}\n- Changed By: {{changedBy.firstName}} {{changedBy.lastName}}\n- Changed At: {{phase.changedAt}}\n\nPhase Progress:\n- Total Steps: {{phase.totalSteps}}\n- Completed Steps: {{phase.completedSteps}}\n- Total Tasks: {{phase.totalTasks}}\n- Completed Tasks: {{phase.completedTasks}}\n- Overall Progress: {{phase.progressPercent}}%\n\nView the phase at: {{projectUrl}}\n\nBest regards,\nCriteriaIQ Technical Validation Team",
    "html_content": "<h2>MAP Phase Status Updated</h2>\n<p>Hello {{recipientUser.firstName}} {{recipientUser.lastName}},</p>\n<p>The status of MAP phase \"<strong>{{phase.name}}</strong>\" in project \"<strong>{{project.name}}</strong>\" has been updated.</p>\n\n<div style=\"background-color: #eff6ff; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #3b82f6;\">\n<h3 style=\"margin-top: 0; color: #1e40af;\">Status Change</h3>\n<p><strong>Phase:</strong> {{phase.name}}</p>\n<p><strong>Previous Status:</strong> <span style=\"color: #6b7280;\">{{phase.oldStatus}}</span></p>\n<p><strong>New Status:</strong> <span style=\"color: #059669; font-weight: bold;\">{{phase.newStatus}}</span></p>\n<p><strong>Changed By:</strong> {{changedBy.firstName}} {{changedBy.lastName}}</p>\n<p><strong>Changed At:</strong> {{phase.changedAt}}</p>\n</div>\n\n<div style=\"background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;\">\n<h3 style=\"margin-top: 0; color: #1e3a8a;\">Phase Progress</h3>\n<p><strong>Total Steps:</strong> {{phase.totalSteps}}</p>\n<p><strong>Completed Steps:</strong> {{phase.completedSteps}}</p>\n<p><strong>Total Tasks:</strong> {{phase.totalTasks}}</p>\n<p><strong>Completed Tasks:</strong> {{phase.completedTasks}}</p>\n<p><strong>Overall Progress:</strong> {{phase.progressPercent}}%</p>\n</div>\n\n<p>View the phase at: <a href=\"{{projectUrl}}\">{{projectUrl}}</a></p>\n\n<p>Best regards,<br>\nCriteriaIQ Technical Validation Team</p>",
    "email_content": null,
    "variables": [
      "recipientUser",
      "phase",
      "project",
      "projectUrl",
      "changedBy"
    ],
    "is_active": true,
    "is_system": true,
    "email_safe_mode": true,
    "include_project_pdf": false,
    "trigger_events": [
      "map_phase_status_changed"
    ],
    "recipient_type": "internal",
    "to_recipients": "{{projectTeamEmails}}",
    "cc_recipients": null,
    "bcc_recipients": null,
    "design_name": null
  },
  {
    "name": "MAP Step Assigned",
    "template_key": "map_step_assigned",
    "description": "Notification sent when a MAP step is assigned to a user",
    "category": "MAP",
    "email_type": "notification",
    "subject": "[MAP] {{step.name}} assigned in {{project.name}}",
    "text_content": "Hello {{assignedUser.firstName}} {{assignedUser.lastName}},\n\nYou have been assigned to a new MAP step in the project \"{{project.name}}\".\n\nStep Details:\n- Step: {{step.name}}\n- Description: {{step.description}}\n- Phase: {{phase.name}}\n- Start Date: {{step.startDate}}\n- Due Date: {{step.dueDate}}\n- Status: {{step.status}}\n- Total Tasks: {{step.totalTasks}}\n- Estimated Hours: {{step.estimatedHours}}\n\nYou can view this step and its tasks at: {{projectUrl}}\n\nPlease review the step details and begin work on the associated tasks.\n\nBest regards,\nCriteriaIQ Technical Validation Team",
    "html_content": "<h2>New MAP Step Assignment</h2>\n<p>Hello {{assignedUser.firstName}} {{assignedUser.lastName}},</p>\n<p>You have been assigned to a new MAP step in the project \"<strong>{{project.name}}</strong>\".</p>\n\n<div style=\"background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;\">\n<h3 style=\"margin-top: 0; color: #1e3a8a;\">Step Details</h3>\n<p><strong>Step:</strong> {{step.name}}</p>\n<p><strong>Description:</strong> {{step.description}}</p>\n<p><strong>Phase:</strong> {{phase.name}}</p>\n<p><strong>Start Date:</strong> {{step.startDate}}</p>\n<p><strong>Due Date:</strong> {{step.dueDate}}</p>\n<p><strong>Status:</strong> {{step.status}}</p>\n<p><strong>Total Tasks:</strong> {{step.totalTasks}}</p>\n<p><strong>Estimated Hours:</strong> {{step.estimatedHours}}</p>\n</div>\n\n<p>You can view this step and its tasks at: <a href=\"{{projectUrl}}\">{{projectUrl}}</a></p>\n<p>Please review the step details and begin work on the associated tasks.</p>\n\n<p>Best regards,<br>\nCriteriaIQ Technical Validation Team</p>",
    "email_content": null,
    "variables": [
      "assignedUser",
      "step",
      "phase",
      "project",
      "projectUrl"
    ],
    "is_active": true,
    "is_system": true,
    "email_safe_mode": true,
    "include_project_pdf": false,
    "trigger_events": [
      "map_step_assigned"
    ],
    "recipient_type": "internal",
    "to_recipients": "{{assignedUserEmail}}",
    "cc_recipients": null,
    "bcc_recipients": null,
    "design_name": null
  },
  {
    "name": "MAP Step Completed",
    "template_key": "map_step_completed",
    "description": "Notification sent when a MAP step is completed",
    "category": "MAP",
    "email_type": "notification",
    "subject": "[MAP] Step Complete: {{step.name}} ({{project.name}})",
    "text_content": "Hello {{recipientUser.firstName}} {{recipientUser.lastName}},\n\nGreat news! The MAP step \"{{step.name}}\" has been completed in project \"{{project.name}}\".\n\nStep Summary:\n- Step: {{step.name}}\n- Phase: {{phase.name}}\n- Completed Date: {{step.completedDate}}\n- Total Tasks: {{step.totalTasks}}\n- Completed Tasks: {{step.completedTasks}}\n- Actual Hours: {{step.actualHours}}\n- Progress: 100%\n\nView the project at: {{projectUrl}}\n\nCongratulations on completing this step!\n\nBest regards,\nCriteriaIQ Technical Validation Team",
    "html_content": "<h2>MAP Step Completed!</h2>\n<p>Hello {{recipientUser.firstName}} {{recipientUser.lastName}},</p>\n<p>Great news! The MAP step \"<strong>{{step.name}}</strong>\" has been completed in project \"<strong>{{project.name}}</strong>\".</p>\n\n<div style=\"background-color: #f0fdf4; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #10b981;\">\n<h3 style=\"margin-top: 0; color: #047857;\">Step Summary</h3>\n<p><strong>Step:</strong> {{step.name}}</p>\n<p><strong>Phase:</strong> {{phase.name}}</p>\n<p><strong>Completed Date:</strong> {{step.completedDate}}</p>\n<p><strong>Total Tasks:</strong> {{step.totalTasks}}</p>\n<p><strong>Completed Tasks:</strong> {{step.completedTasks}}</p>\n<p><strong>Actual Hours:</strong> {{step.actualHours}}</p>\n<p><strong>Progress:</strong> 100%</p>\n</div>\n\n<p>View the project at: <a href=\"{{projectUrl}}\">{{projectUrl}}</a></p>\n<p>Congratulations on completing this step!</p>\n\n<p>Best regards,<br>\nCriteriaIQ Technical Validation Team</p>",
    "email_content": null,
    "variables": [
      "recipientUser",
      "step",
      "phase",
      "project",
      "projectUrl"
    ],
    "is_active": true,
    "is_system": true,
    "email_safe_mode": true,
    "include_project_pdf": false,
    "trigger_events": [
      "map_step_completed"
    ],
    "recipient_type": "internal",
    "to_recipients": "{{projectTeamEmails}}",
    "cc_recipients": null,
    "bcc_recipients": null,
    "design_name": null
  },
  {
    "name": "MAP Step Due Soon",
    "template_key": "map_step_due_soon",
    "description": "Notification sent when a MAP step is approaching its due date",
    "category": "MAP",
    "email_type": "notification",
    "subject": "[MAP] Due Soon: {{step.name}} ({{project.name}})",
    "text_content": "Hello {{recipientUser.firstName}} {{recipientUser.lastName}},\n\nThis is a reminder that the MAP step \"{{step.name}}\" in project \"{{project.name}}\" is approaching its due date.\n\nStep Details:\n- Step: {{step.name}}\n- Phase: {{phase.name}}\n- Due Date: {{step.dueDate}}\n- Days Remaining: {{step.daysRemaining}}\n- Current Status: {{step.status}}\n- Current Progress: {{step.progressPercent}}%\n- Remaining Tasks: {{step.remainingTasks}}\n- Hours Spent: {{step.hoursSpent}}\n\nYou can view the step and update progress at: {{projectUrl}}\n\nPlease ensure all tasks are on track for timely completion.\n\nBest regards,\nCriteriaIQ Technical Validation Team",
    "html_content": "<h2>MAP Step Due Soon</h2>\n<p>Hello {{recipientUser.firstName}} {{recipientUser.lastName}},</p>\n<p>This is a reminder that the MAP step \"<strong>{{step.name}}</strong>\" in project \"<strong>{{project.name}}</strong>\" is approaching its due date.</p>\n\n<div style=\"background-color: #fef3c7; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #f59e0b;\">\n<h3 style=\"margin-top: 0; color: #b45309;\">Step Details</h3>\n<p><strong>Step:</strong> {{step.name}}</p>\n<p><strong>Phase:</strong> {{phase.name}}</p>\n<p><strong>Due Date:</strong> {{step.dueDate}}</p>\n<p><strong>Days Remaining:</strong> {{step.daysRemaining}}</p>\n<p><strong>Current Status:</strong> {{step.status}}</p>\n<p><strong>Current Progress:</strong> {{step.progressPercent}}%</p>\n<p><strong>Remaining Tasks:</strong> {{step.remainingTasks}}</p>\n<p><strong>Hours Spent:</strong> {{step.hoursSpent}}</p>\n</div>\n\n<p>You can view the step and update progress at: <a href=\"{{projectUrl}}\">{{projectUrl}}</a></p>\n<p>Please ensure all tasks are on track for timely completion.</p>\n\n<p>Best regards,<br>\nCriteriaIQ Technical Validation Team</p>",
    "email_content": null,
    "variables": [
      "recipientUser",
      "step",
      "phase",
      "project",
      "projectUrl"
    ],
    "is_active": true,
    "is_system": true,
    "email_safe_mode": true,
    "include_project_pdf": false,
    "trigger_events": [
      "map_step_due_soon"
    ],
    "recipient_type": "internal",
    "to_recipients": "{{projectTeamEmails}}",
    "cc_recipients": null,
    "bcc_recipients": null,
    "design_name": null
  },
  {
    "name": "MAP Step Status Changed",
    "template_key": "map_step_status_changed",
    "description": "Notification sent when a MAP step status is updated",
    "category": "MAP",
    "email_type": "notification",
    "subject": "[MAP] {{step.name}} → {{step.newStatus}} ({{project.name}})",
    "text_content": "Hello {{recipientUser.firstName}} {{recipientUser.lastName}},\n\nThe status of MAP step \"{{step.name}}\" in project \"{{project.name}}\" has been updated.\n\nStatus Change:\n- Step: {{step.name}}\n- Phase: {{phase.name}}\n- Previous Status: {{step.oldStatus}}\n- New Status: {{step.newStatus}}\n- Changed By: {{changedBy.firstName}} {{changedBy.lastName}}\n- Changed At: {{step.changedAt}}\n\nStep Progress:\n- Total Tasks: {{step.totalTasks}}\n- Completed Tasks: {{step.completedTasks}}\n- Overall Progress: {{step.progressPercent}}%\n- Hours Spent: {{step.hoursSpent}}\n\nView the step at: {{projectUrl}}\n\nBest regards,\nCriteriaIQ Technical Validation Team",
    "html_content": "<h2>MAP Step Status Updated</h2>\n<p>Hello {{recipientUser.firstName}} {{recipientUser.lastName}},</p>\n<p>The status of MAP step \"<strong>{{step.name}}</strong>\" in project \"<strong>{{project.name}}</strong>\" has been updated.</p>\n\n<div style=\"background-color: #eff6ff; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #3b82f6;\">\n<h3 style=\"margin-top: 0; color: #1e40af;\">Status Change</h3>\n<p><strong>Step:</strong> {{step.name}}</p>\n<p><strong>Phase:</strong> {{phase.name}}</p>\n<p><strong>Previous Status:</strong> <span style=\"color: #6b7280;\">{{step.oldStatus}}</span></p>\n<p><strong>New Status:</strong> <span style=\"color: #059669; font-weight: bold;\">{{step.newStatus}}</span></p>\n<p><strong>Changed By:</strong> {{changedBy.firstName}} {{changedBy.lastName}}</p>\n<p><strong>Changed At:</strong> {{step.changedAt}}</p>\n</div>\n\n<div style=\"background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;\">\n<h3 style=\"margin-top: 0; color: #1e3a8a;\">Step Progress</h3>\n<p><strong>Total Tasks:</strong> {{step.totalTasks}}</p>\n<p><strong>Completed Tasks:</strong> {{step.completedTasks}}</p>\n<p><strong>Overall Progress:</strong> {{step.progressPercent}}%</p>\n<p><strong>Hours Spent:</strong> {{step.hoursSpent}}</p>\n</div>\n\n<p>View the step at: <a href=\"{{projectUrl}}\">{{projectUrl}}</a></p>\n\n<p>Best regards,<br>\nCriteriaIQ Technical Validation Team</p>",
    "email_content": null,
    "variables": [
      "recipientUser",
      "step",
      "phase",
      "project",
      "projectUrl",
      "changedBy"
    ],
    "is_active": true,
    "is_system": true,
    "email_safe_mode": true,
    "include_project_pdf": false,
    "trigger_events": [
      "map_step_status_changed"
    ],
    "recipient_type": "internal",
    "to_recipients": "{{projectTeamEmails}}",
    "cc_recipients": null,
    "bcc_recipients": null,
    "design_name": null
  },
  {
    "name": "MAP Task Assigned",
    "template_key": "map_task_assigned",
    "description": "Notification sent when a MAP task is assigned to a user",
    "category": "MAP",
    "email_type": "notification",
    "subject": "[MAP] {{task.title}} assigned in {{project.name}}",
    "text_content": "Hello {{assignedUser.firstName}} {{assignedUser.lastName}},\n\nYou have been assigned a new MAP task in the project \"{{project.name}}\".\n\nTask Details:\n- Task: {{task.title}}\n- Description: {{task.description}}\n- Due Date: {{task.dueDate}}\n- Step: {{step.name}}\n- Phase: {{phase.name}}\n- Status: {{task.status}}\n\nYou can view and update this task at: {{projectUrl}}\n\nPlease review the task details and update the status as you make progress.\n\nBest regards,\nCriteriaIQ Technical Validation Team",
    "html_content": "<h2>New MAP Task Assignment</h2>\n<p>Hello {{assignedUser.firstName}} {{assignedUser.lastName}},</p>\n<p>You have been assigned a new MAP task in the project \"<strong>{{project.name}}</strong>\".</p>\n\n<div style=\"background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;\">\n<h3 style=\"margin-top: 0; color: #1e3a8a;\">Task Details</h3>\n<p><strong>Task:</strong> {{task.title}}</p>\n<p><strong>Description:</strong> {{task.description}}</p>\n<p><strong>Due Date:</strong> {{task.dueDate}}</p>\n<p><strong>Step:</strong> {{step.name}}</p>\n<p><strong>Phase:</strong> {{phase.name}}</p>\n<p><strong>Status:</strong> {{task.status}}</p>\n</div>\n\n<p>You can view and update this task at: <a href=\"{{projectUrl}}\">{{projectUrl}}</a></p>\n<p>Please review the task details and update the status as you make progress.</p>\n\n<p>Best regards,<br>\nCriteriaIQ Technical Validation Team</p>",
    "email_content": null,
    "variables": [
      "assignedUser",
      "task",
      "step",
      "phase",
      "project",
      "projectUrl"
    ],
    "is_active": true,
    "is_system": true,
    "email_safe_mode": true,
    "include_project_pdf": false,
    "trigger_events": [
      "map_task_assigned"
    ],
    "recipient_type": "internal",
    "to_recipients": "{{assignedUserEmail}}",
    "cc_recipients": "",
    "bcc_recipients": "",
    "design_name": null
  },
  {
    "name": "MAP Task Completed",
    "template_key": "map_task_completed",
    "description": "Notification sent when a MAP task is completed",
    "category": "MAP",
    "email_type": "notification",
    "subject": "[MAP] Completed: {{task.title}} ({{project.name}})",
    "text_content": "MAP Task Completed\n\nGreat news! A MAP task has been completed in project \"{{project.name}}\".\n\nTask Details:\n- Task: {{task.title}}\n- Description: {{task.description}}\n- Completed By: {{completedBy.firstName}} {{completedBy.lastName}}\n- Completed At: {{completedAt}}\n- Step: {{step.name}}\n- Phase: {{phase.name}}\n\nStep Progress: {{step.completedTasks}} of {{step.totalTasks}} tasks completed ({{step.progressPercentage}}%)\nPhase Progress: {{phase.completedSteps}} of {{phase.totalSteps}} steps completed ({{phase.progressPercentage}}%)\n\nView project details: {{projectUrl}}\n\nCriteriaIQ Technical Validation Team",
    "html_content": "<h2>MAP Task Completed</h2>\n<div style=\"background-color: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 15px; border-radius: 5px; margin: 20px 0;\">\n<strong>🎉 Great news!</strong> A MAP task has been completed in project \"{{project.name}}\".\n</div>\n\n<div style=\"background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;\">\n<h3 style=\"margin-top: 0; color: #1e3a8a;\">Task Details</h3>\n<p><strong>Task:</strong> {{task.title}}</p>\n<p><strong>Description:</strong> {{task.description}}</p>\n<p><strong>Completed By:</strong> {{completedBy.firstName}} {{completedBy.lastName}}</p>\n<p><strong>Completed At:</strong> {{completedAt}}</p>\n<p><strong>Step:</strong> {{step.name}}</p>\n<p><strong>Phase:</strong> {{phase.name}}</p>\n</div>\n\n<div style=\"background-color: #e1f5fe; padding: 15px; border-radius: 5px; margin: 20px 0;\">\n<h4 style=\"margin-top: 0; color: #01579b;\">Progress Update</h4>\n<p><strong>Step Progress:</strong> {{step.completedTasks}} of {{step.totalTasks}} tasks completed ({{step.progressPercentage}}%)</p>\n<p><strong>Phase Progress:</strong> {{phase.completedSteps}} of {{phase.totalSteps}} steps completed ({{phase.progressPercentage}}%)</p>\n</div>\n\n<p>View project details: <a href=\"{{projectUrl}}\">{{projectUrl}}</a></p>\n\n<p>CriteriaIQ Technical Validation Team</p>",
    "email_content": null,
    "variables": [
      "task",
      "step",
      "phase",
      "project",
      "completedBy",
      "completedAt",
      "projectUrl"
    ],
    "is_active": true,
    "is_system": true,
    "email_safe_mode": true,
    "include_project_pdf": false,
    "trigger_events": [
      "map_task_completed"
    ],
    "recipient_type": "internal,external",
    "to_recipients": "{{projectStakeholdersEmails}}",
    "cc_recipients": null,
    "bcc_recipients": null,
    "design_name": null
  },
  {
    "name": "MAP Task Due Soon",
    "template_key": "map_task_due_soon",
    "description": "Notification sent when a MAP task is due soon",
    "category": "MAP",
    "email_type": "notification",
    "subject": "[MAP] Due soon: {{task.title}} ({{project.name}})",
    "text_content": "MAP Task Due Soon Reminder\n\nHello {{assignedUser.firstName}} {{assignedUser.lastName}},\n\nThis is a friendly reminder that one of your MAP tasks is due soon.\n\nTask Details:\n- Task: {{task.title}}\n- Description: {{task.description}}\n- Due Date: {{task.dueDate}}\n- Current Status: {{task.status}}\n- Step: {{step.name}}\n- Phase: {{phase.name}}\n- Days Until Due: {{daysUntilDue}}\n\nPlease review the task and update its status if needed: {{projectUrl}}\n\nIf you need assistance or an extension, please contact your project manager.\n\nBest regards,\nCriteriaIQ Technical Validation Team",
    "html_content": "<h2>MAP Task Due Soon Reminder</h2>\n<p>Hello {{assignedUser.firstName}} {{assignedUser.lastName}},</p>\n<p>This is a friendly reminder that one of your MAP tasks is due soon.</p>\n\n<div style=\"background-color: #fef3c7; border: 1px solid #f59e0b; padding: 20px; border-radius: 5px; margin: 20px 0;\">\n<h3 style=\"margin-top: 0; color: #92400e;\">Task Details</h3>\n<p><strong>Task:</strong> {{task.title}}</p>\n<p><strong>Description:</strong> {{task.description}}</p>\n<p><strong>Due Date:</strong> <span style=\"color: #dc2626;\">{{task.dueDate}}</span></p>\n<p><strong>Current Status:</strong> {{task.status}}</p>\n<p><strong>Step:</strong> {{step.name}}</p>\n<p><strong>Phase:</strong> {{phase.name}}</p>\n<p><strong>Days Until Due:</strong> <span style=\"color: #dc2626; font-weight: bold;\">{{daysUntilDue}}</span></p>\n</div>\n\n<p>Please review the task and update its status if needed: <a href=\"{{projectUrl}}\">{{projectUrl}}</a></p>\n<p>If you need assistance or an extension, please contact your project manager.</p>\n\n<p>Best regards,<br>\nCriteriaIQ Technical Validation Team</p>",
    "email_content": null,
    "variables": [
      "assignedUser",
      "task",
      "step",
      "phase",
      "project",
      "daysUntilDue",
      "projectUrl"
    ],
    "is_active": true,
    "is_system": true,
    "email_safe_mode": true,
    "include_project_pdf": false,
    "trigger_events": [
      "map_task_due_soon"
    ],
    "recipient_type": "internal",
    "to_recipients": "{{assignedUserEmail}}",
    "cc_recipients": "{{projectManagerEmail}}",
    "bcc_recipients": null,
    "design_name": null
  },
  {
    "name": "MAP Task Status Changed",
    "template_key": "map_task_status_changed",
    "description": "Notification sent when a MAP task status changes",
    "category": "MAP",
    "email_type": "notification",
    "subject": "[MAP] {{task.title}} → {{task.status}} ({{project.name}})",
    "text_content": "MAP Task Status Update\n\nThe status of a MAP task has been updated in project \"{{project.name}}\".\n\nTask Details:\n- Task: {{task.title}}\n- Previous Status: {{task.previousStatus}}\n- New Status: {{task.status}}\n- Updated By: {{updatedBy.firstName}} {{updatedBy.lastName}}\n- Updated At: {{updatedAt}}\n- Step: {{step.name}}\n- Phase: {{phase.name}}\n\nYou can view the project details at: {{projectUrl}}\n\nCriteriaIQ Technical Validation Team",
    "html_content": "<h2>MAP Task Status Update</h2>\n<p>The status of a MAP task has been updated in project \"<strong>{{project.name}}</strong>\".</p>\n\n<div style=\"background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;\">\n<h3 style=\"margin-top: 0; color: #1e3a8a;\">Task Details</h3>\n<p><strong>Task:</strong> {{task.title}}</p>\n<p><strong>Previous Status:</strong> <span style=\"color: #dc2626;\">{{task.previousStatus}}</span></p>\n<p><strong>New Status:</strong> <span style=\"color: #059669;\">{{task.status}}</span></p>\n<p><strong>Updated By:</strong> {{updatedBy.firstName}} {{updatedBy.lastName}}</p>\n<p><strong>Updated At:</strong> {{updatedAt}}</p>\n<p><strong>Step:</strong> {{step.name}}</p>\n<p><strong>Phase:</strong> {{phase.name}}</p>\n</div>\n\n<p>You can view the project details at: <a href=\"{{projectUrl}}\">{{projectUrl}}</a></p>\n\n<p>CriteriaIQ Technical Validation Team</p>",
    "email_content": null,
    "variables": [
      "task",
      "step",
      "phase",
      "project",
      "updatedBy",
      "updatedAt",
      "projectUrl"
    ],
    "is_active": true,
    "is_system": true,
    "email_safe_mode": true,
    "include_project_pdf": false,
    "trigger_events": [
      "map_task_status_changed"
    ],
    "recipient_type": "internal,external",
    "to_recipients": "{{projectStakeholdersEmails}}",
    "cc_recipients": null,
    "bcc_recipients": null,
    "design_name": null
  },
  {
    "name": "Password Reset Email",
    "template_key": "password_reset",
    "description": "Sent when a user requests to reset their password",
    "category": "Authentication",
    "email_type": "notification",
    "subject": "Password Reset - Technical Validation Project Manager",
    "text_content": "Technical Validation Project Manager - Password Reset\n\nHello,\n\nYou have requested to reset your password for your Technical Validation Project Manager account.\n\nPlease visit the following link to reset your password:\n{{resetUrl}}\n\nNote: This link will expire in 1 hour for security reasons.\n\nIf you did not request this password reset, please ignore this email.\n\nTechnical Validation Project Manager\nData Security that Starts with Identity™",
    "html_content": "<h2>Password Reset Request</h2>\n<p>Hello,</p>\n<p>You have requested to reset your password for your CriteriaIQ Technical Validation Project Manager account.</p>\n<a href=\"{{resetUrl}}\" style=\"display: inline-block; background-color: #0f3796; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0;\">Reset Password</a>\n<p>If the button does not work, you can copy and paste this link into your browser:</p>\n<p><a href=\"{{resetUrl}}\">{{resetUrl}}</a></p>\n<p><strong>Note:</strong> This link will expire in 1 hour for security reasons.</p>\n<p>If you did not request this password reset, please ignore this email.</p>",
    "email_content": "<h2>Password Reset Request</h2>\n<p>Hello,</p>\n<p>You have requested to reset your password for your CriteriaIQ Technical Validation Project Manager account.</p>\n<p><a style=\"display: inline-block; background-color: #0f3796; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0;\" href=\"{{resetUrl}}\">Reset Password</a></p>\n<p>If the button does not work, you can copy and paste this link into your browser:</p>\n<p><a href=\"{{resetUrl}}\">{{resetUrl}}</a></p>\n<p><strong>Note:</strong> This link will expire in 1 hour for security reasons.</p>\n<p>If you did not request this password reset, please ignore this email.</p>",
    "variables": [
      "{{resetUrl}}"
    ],
    "is_active": true,
    "is_system": true,
    "email_safe_mode": true,
    "include_project_pdf": false,
    "trigger_events": [
      "password_reset_requested"
    ],
    "recipient_type": "{},internal,external",
    "to_recipients": null,
    "cc_recipients": null,
    "bcc_recipients": null,
    "design_name": "CriteriaIQ Default"
  },
  {
    "name": "Project Assignment Notification",
    "template_key": "project_assigned",
    "description": "Sent when a user is assigned to a project",
    "category": "Project Notifications",
    "email_type": "notification",
    "subject": "You have been assigned to project: {{projectName}}",
    "text_content": "Project Assignment Notification\n\nHello {{userName}},\n\nYou have been assigned to a new project in Technical Validation Project Manager.\n\nProject Details:\n- Project Name: {{projectName}}\n- Customer: {{customerName}}\n- Your Role: {{userRole}}\n- Project Status: {{projectStatus}}\n- Start Date: {{startDate}}\n\nYou can access the project details at: {{projectUrl}}\n\nPlease review the project requirements and contact your team lead if you have any questions.\n\nBest regards,\nTechnical Validation Project Manager Team",
    "html_content": "<div style=\"background-color: #e1f5fe; border: 1px solid #01579b; color: #01579b; padding: 15px; border-radius: 5px; margin: 20px 0;\">\n<strong>📋 You have been assigned to a new project!</strong>\n</div>\n<h2>New Project Assignment</h2>\n<p>Hello {{userName}},</p>\n<p>You have been assigned to a new project in CriteriaIQ Technical Validation Project Manager.</p>\n<div style=\"background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;\">\n<h3 style=\"margin-top: 0; color: #1e3a8a;\">Project Details:</h3>\n<ul style=\"margin: 0; padding-left: 20px;\">\n<li><strong>Project Name:</strong> {{projectName}}</li>\n<li><strong>Customer:</strong> {{customerName}}</li>\n<li><strong>Your Role:</strong> {{userRole}}</li>\n<li><strong>Project Status:</strong> <span style=\"background-color: #e3f2fd; padding: 2px 8px; border-radius: 3px;\">{{projectStatus}}</span></li>\n<li><strong>Start Date:</strong> {{startDate}}</li>\n</ul>\n</div>\n<p>You can access the project details using the link below:</p>\n<a href=\"{{projectUrl}}\" style=\"display: inline-block; background-color: #0f3796; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0;\">View Project</a>\n<p>Please review the project requirements and contact your team lead if you have any questions.</p>",
    "email_content": null,
    "variables": [
      "{{userName}}",
      "{{projectName}}",
      "{{customerName}}",
      "{{userRole}}",
      "{{projectStatus}}",
      "{{startDate}}",
      "{{projectUrl}}"
    ],
    "is_active": true,
    "is_system": true,
    "email_safe_mode": true,
    "include_project_pdf": false,
    "trigger_events": [
      "user_assigned_to_project"
    ],
    "recipient_type": "team_member,internal,external",
    "to_recipients": null,
    "cc_recipients": null,
    "bcc_recipients": null,
    "design_name": null
  },
  {
    "name": "Project Status Update",
    "template_key": "project_status_update",
    "description": "Sent when project status changes",
    "category": "Project Notifications",
    "email_type": "project_update",
    "subject": "Project Status Update: {{projectName}}",
    "text_content": "Project Status Update\n\nHello {{userName}},\n\nThe status of project \"{{projectName}}\" has been updated.\n\nProject Details:\n- Project: {{projectName}}\n- Customer: {{customerName}}\n- New Status: {{projectStatus}}\n- Primary Engineer: {{primaryEngineer}}\n\nYou can view the project details at: {{projectUrl}}\n\nBest regards,\nTechnical Validation Project Manager Team",
    "html_content": "<h2>Project Status Update</h2>\n<p>Hello {{userName}},</p>\n<p>The status of project \"{{projectName}}\" has been updated.</p>\n<div style=\"background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;\">\n<h3 style=\"margin-top: 0; color: #1e3a8a;\">Project Details:</h3>\n<ul style=\"margin: 0; padding-left: 20px;\">\n<li><strong>Project:</strong> {{projectName}}</li>\n<li><strong>Customer:</strong> {{customerName}}</li>\n<li><strong>New Status:</strong> <span style=\"background-color: #e3f2fd; padding: 2px 8px; border-radius: 3px;\">{{projectStatus}}</span></li>\n<li><strong>Primary Engineer:</strong> {{primaryEngineer}}</li>\n</ul>\n</div>\n<p>You can view the project details using the link below:</p>\n<a href=\"{{projectUrl}}\" style=\"display: inline-block; background-color: #0f3796; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0;\">View Project</a>",
    "email_content": null,
    "variables": [
      "{{projectName}}",
      "{{customerName}}",
      "{{projectStatus}}",
      "{{primaryEngineer}}",
      "{{userName}}",
      "{{projectUrl}}"
    ],
    "is_active": true,
    "is_system": true,
    "email_safe_mode": true,
    "include_project_pdf": false,
    "trigger_events": [
      "project_status_changed"
    ],
    "recipient_type": "team_member,internal,external",
    "to_recipients": null,
    "cc_recipients": null,
    "bcc_recipients": null,
    "design_name": null
  },
  {
    "name": "System Announcement",
    "template_key": "system_announcement_default",
    "description": "Default email template for system announcements. Includes severity-colored header, announcement content, and schedule information. Variables: {{title}}, {{content}}, {{severity}}, {{startDate}}, {{endDate}}, {{severityStyle}}",
    "category": "System Alerts",
    "email_type": "notification",
    "subject": "{{severity}} Announcement: {{title}}",
    "text_content": null,
    "html_content": "<div style=\"font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;\">\n  <div style=\"padding: 20px; border-radius: 8px; margin-bottom: 20px; {{severityStyle}}\">\n    <h2 style=\"margin: 0 0 8px 0; color: inherit;\">{{title}}</h2>\n    <span style=\"font-size: 12px; opacity: 0.9;\">{{severity}} Announcement</span>\n  </div>\n  <div style=\"padding: 0 20px;\">\n    {{content}}\n  </div>\n  <div style=\"margin-top: 24px; padding: 16px 20px; background-color: #f5f5f5; border-radius: 8px;\">\n    <p style=\"margin: 0; font-size: 13px; color: #666;\">\n      <strong>Effective:</strong> {{startDate}} {{#if endDate}}- {{endDate}}{{/if}}\n    </p>\n  </div>\n  <p style=\"margin-top: 24px; padding: 0 20px; color: #999; font-size: 12px;\">\n    This is an automated system announcement from CriteriaIQ Technical Validation.\n  </p>\n</div>",
    "email_content": "<div style=\"font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;\">\n<div style=\"padding: 20px; border-radius: 8px; margin-bottom: 20px;\">\n<h2 style=\"margin: 0 0 8px 0; color: inherit;\">{{title}}</h2>\n<span style=\"font-size: 12px; opacity: 0.9;\">{{severity}} Announcement</span></div>\n<div style=\"padding: 0 20px;\">{{content}}</div>\n<div style=\"margin-top: 24px; padding: 16px 20px; background-color: #f5f5f5; border-radius: 8px;\">\n<p style=\"margin: 0; font-size: 13px; color: #666;\"><strong>Effective:</strong> {{startDate}} {{#if endDate}}- {{endDate}}{{/if}}</p>\n</div>\n<p style=\"margin-top: 24px; padding: 0 20px; color: #999; font-size: 12px;\">This is an automated system announcement from CriteriaIQ Technical Validation.</p>\n</div>",
    "variables": [],
    "is_active": true,
    "is_system": true,
    "email_safe_mode": true,
    "include_project_pdf": false,
    "trigger_events": [],
    "recipient_type": "internal",
    "to_recipients": null,
    "cc_recipients": null,
    "bcc_recipients": null,
    "design_name": "CriteriaIQ Default"
  },
  {
    "name": "Welcome Email",
    "template_key": "welcome",
    "description": "Sent to new users upon account creation",
    "category": "Authentication",
    "email_type": "welcome",
    "subject": "Welcome to CriteriaIQ Technical Validation",
    "text_content": "Hello {{firstName}} {{lastName}},\n\nWelcome to CriteriaIQ Technical Validation! Your account has been created with the following details:\n\nEmail: {{userEmail}}\nRole: {{userRole}}\n\nYou can now access the platform at: {{dashboardUrl}}\n\nIf you have any questions or need assistance, please contact your administrator.\n\nTechnical Validation Project Manager\nData Security that Starts with Identity™",
    "html_content": "<p>Hello {{firstName}} {{lastName}},</p>\n<p>Welcome to CriteriaIQ Technical Validation! Your account has been created with the following details:</p>\n<div style=\"background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;\">\n<ul style=\"margin: 0; padding-left: 20px;\">\n<li><strong>Email:</strong> {{userEmail}}</li>\n<li><strong>Role:</strong> {{userRole}}</li>\n</ul>\n</div>\n<p>You can now access the platform using the link below:</p>\n<a href=\"{{dashboardUrl}}\" style=\"display: inline-block; background-color: #0f3796; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0;\">Access Platform</a>\n<p>If you have any questions or need assistance, please contact your administrator.</p>",
    "email_content": "<p>Hello {{firstName}} {{lastName}},</p>\n<p>Welcome to CriteriaIQ Technical Validation! Your account has been created with the following details:</p>\n<div style=\"background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;\">\n<ul style=\"margin: 0; padding-left: 20px;\">\n<li><strong>Email:</strong> {{userEmail}}</li>\n<li><strong>Role:</strong> {{userRole}}</li>\n</ul>\n</div>\n<p>You can now access the platform using the link below:</p>\n<p><a style=\"display: inline-block; background-color: #0f3796; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0;\" href=\"{{dashboardUrl}}\">Access Platform</a></p>\n<p>If you have any questions or need assistance, please contact your administrator.</p>",
    "variables": [
      "{{firstName}}",
      "{{lastName}}",
      "{{userEmail}}",
      "{{userRole}}",
      "{{dashboardUrl}}"
    ],
    "is_active": true,
    "is_system": true,
    "email_safe_mode": true,
    "include_project_pdf": false,
    "trigger_events": [
      "user_registered"
    ],
    "recipient_type": "user,internal,external",
    "to_recipients": "",
    "cc_recipients": "",
    "bcc_recipients": "",
    "design_name": "CriteriaIQ Default"
  },
  {
    "name": "Generic Configuration Test",
    "template_key": "generic_configuration_test",
    "description": "Sent when an administrator uses the 'Test Email' button in Email Configuration to verify the email transport is working correctly. Uses the default email design.",
    "category": "System Alerts",
    "email_type": "configuration_test",
    "subject": "[TEST] CriteriaIQ Email Configuration Test",
    "text_content": "This is a test email from CriteriaIQ to verify your email configuration is working correctly.",
    "html_content": null,
    "email_content": "<p>This is a test email from <strong>CriteriaIQ</strong> to verify your email configuration is working correctly.</p>",
    "variables": [],
    "is_active": true,
    "is_system": true,
    "email_safe_mode": false,
    "include_project_pdf": false,
    "trigger_events": null,
    "recipient_type": "internal",
    "to_recipients": "",
    "cc_recipients": "",
    "bcc_recipients": "",
    "design_name": "CriteriaIQ Default"
  }
];

/**
 * Translate a snake_case `SystemEmailTemplateSeed` into the camelCase shape
 * that `emailTemplates.$inferInsert` expects. This is the single source of
 * truth used by both `seedSystemEmailTemplates` (boot-time seeder) and
 * `DatabaseStorage.getEmailTemplates` (runtime list endpoint), so adding a
 * column to the seed schema only requires updating one place. The optional
 * `designId` is resolved separately via the `email_designs` table by the
 * seeder; callers that don't need design linking can omit it (defaults to
 * null, matching the column default).
 */
export function toEmailTemplateInsertRow(
  seed: SystemEmailTemplateSeed,
  designId: number | null = null,
): EmailTemplateInsertRow {
  return {
    name: seed.name,
    templateKey: seed.template_key,
    description: seed.description,
    category: seed.category,
    emailType: seed.email_type,
    subject: seed.subject,
    textContent: seed.text_content,
    htmlContent: seed.html_content,
    emailContent: seed.email_content,
    variables: seed.variables,
    isActive: seed.is_active,
    isSystem: true,
    emailSafeMode: seed.email_safe_mode,
    includeProjectPdf: seed.include_project_pdf,
    triggerEvents: seed.trigger_events,
    recipientType: seed.recipient_type,
    toRecipients: seed.to_recipients,
    ccRecipients: seed.cc_recipients,
    bccRecipients: seed.bcc_recipients,
    designId,
  };
}
