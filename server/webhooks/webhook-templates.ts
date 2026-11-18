/**
 * Webhook Templates
 * 
 * Pre-built templates for:
 * - Microsoft Teams (Adaptive Cards)
 * - Slack (Block Kit)
 * - Generic HTTP (Handlebars customizable JSON)
 * 
 * All templates support the same Handlebars variables as email templates.
 */

export type WebhookServiceType = 'ms_teams' | 'slack' | 'generic';

export interface WebhookTemplate {
  serviceType: WebhookServiceType;
  name: string;
  description: string;
  template: object;
  defaultHeaders?: Record<string, string>;
}

// =============================================================================
// MICROSOFT TEAMS TEMPLATES (Adaptive Cards)
// =============================================================================

export const msTeamsProjectNotification: WebhookTemplate = {
  serviceType: 'ms_teams',
  name: 'Teams - Project Notification',
  description: 'Rich notification card for project events',
  template: {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    "themeColor": "{{statusColor projectStatus}}",
    "summary": "{{triggerKey}} - {{projectName}}",
    "sections": [{
      "activityTitle": "{{projectName}}",
      "activitySubtitle": "{{customerName}}",
      "activityImage": "https://criteriaiq.com/logo.png",
      "facts": [
        {
          "name": "Status",
          "value": "{{projectStatus}}"
        },
        {
          "name": "Risk Level",
          "value": "{{riskLevel}}"
        },
        {
          "name": "MAP Progress",
          "value": "{{mapProgress}}%"
        },
        {
          "name": "Triggered By",
          "value": "{{triggerKey}}"
        }
      ],
      "markdown": true
    }],
    "potentialAction": [{
      "@type": "OpenUri",
      "name": "View Project",
      "targets": [{
        "os": "default",
        "uri": "{{projectUrl}}"
      }]
    }]
  }
};

export const msTeamsMapUpdate: WebhookTemplate = {
  serviceType: 'ms_teams',
  name: 'Teams - MAP Update',
  description: 'Notification for MAP phase, step, or task changes',
  template: {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    "themeColor": "{{statusColor status}}",
    "summary": "MAP Update: {{phaseName}} - {{stepName}}",
    "sections": [{
      "activityTitle": "MAP Update",
      "activitySubtitle": "{{projectName}}",
      "facts": [
        {
          "name": "Phase",
          "value": "{{phaseName}}"
        },
        {
          "name": "Step",
          "value": "{{stepName}}"
        },
        {
          "name": "Task",
          "value": "{{taskName}}"
        },
        {
          "name": "Status",
          "value": "{{status}}"
        },
        {
          "name": "Assigned To",
          "value": "{{assignedTo}}"
        }
      ],
      "markdown": true
    }],
    "potentialAction": [{
      "@type": "OpenUri",
      "name": "View MAP",
      "targets": [{
        "os": "default",
        "uri": "{{mapUrl}}"
      }]
    }]
  }
};

export const msTeamsAlert: WebhookTemplate = {
  serviceType: 'ms_teams',
  name: 'Teams - Alert',
  description: 'High-priority alert notification',
  template: {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    "themeColor": "#DC2626",
    "summary": "Alert: {{alertTitle}}",
    "sections": [{
      "activityTitle": "{{alertTitle}}",
      "activitySubtitle": "Priority: {{priority}}",
      "text": "{{alertMessage}}",
      "facts": [
        {
          "name": "Project",
          "value": "{{projectName}}"
        },
        {
          "name": "Triggered At",
          "value": "{{formatDate timestamp}}"
        }
      ],
      "markdown": true
    }]
  }
};

// =============================================================================
// SLACK TEMPLATES (Block Kit)
// =============================================================================

export const slackProjectNotification: WebhookTemplate = {
  serviceType: 'slack',
  name: 'Slack - Project Notification',
  description: 'Rich notification for project events',
  template: {
    "blocks": [
      {
        "type": "header",
        "text": {
          "type": "plain_text",
          "text": "{{projectName}}",
          "emoji": true
        }
      },
      {
        "type": "section",
        "fields": [
          {
            "type": "mrkdwn",
            "text": "*Customer:*\n{{customerName}}"
          },
          {
            "type": "mrkdwn",
            "text": "*Status:*\n{{projectStatus}}"
          },
          {
            "type": "mrkdwn",
            "text": "*Risk Level:*\n{{riskLevel}}"
          },
          {
            "type": "mrkdwn",
            "text": "*MAP Progress:*\n{{mapProgress}}%"
          }
        ]
      },
      {
        "type": "context",
        "elements": [
          {
            "type": "mrkdwn",
            "text": "Triggered by: *{{triggerKey}}* at {{formatDate timestamp}}"
          }
        ]
      },
      {
        "type": "actions",
        "elements": [
          {
            "type": "button",
            "text": {
              "type": "plain_text",
              "text": "View Project",
              "emoji": true
            },
            "url": "{{projectUrl}}",
            "style": "primary"
          }
        ]
      }
    ]
  }
};

export const slackMapUpdate: WebhookTemplate = {
  serviceType: 'slack',
  name: 'Slack - MAP Update',
  description: 'Notification for MAP changes',
  template: {
    "blocks": [
      {
        "type": "header",
        "text": {
          "type": "plain_text",
          "text": "MAP Update: {{phaseName}}",
          "emoji": true
        }
      },
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": "*Project:* {{projectName}}"
        }
      },
      {
        "type": "section",
        "fields": [
          {
            "type": "mrkdwn",
            "text": "*Step:*\n{{stepName}}"
          },
          {
            "type": "mrkdwn",
            "text": "*Task:*\n{{taskName}}"
          },
          {
            "type": "mrkdwn",
            "text": "*Status:*\n{{status}}"
          },
          {
            "type": "mrkdwn",
            "text": "*Assigned To:*\n{{assignedTo}}"
          }
        ]
      },
      {
        "type": "divider"
      },
      {
        "type": "context",
        "elements": [
          {
            "type": "mrkdwn",
            "text": "Updated at {{formatDate timestamp}}"
          }
        ]
      }
    ]
  }
};

export const slackAlert: WebhookTemplate = {
  serviceType: 'slack',
  name: 'Slack - Alert',
  description: 'High-priority alert notification',
  template: {
    "blocks": [
      {
        "type": "header",
        "text": {
          "type": "plain_text",
          "text": ":warning: {{alertTitle}}",
          "emoji": true
        }
      },
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": "{{alertMessage}}"
        }
      },
      {
        "type": "section",
        "fields": [
          {
            "type": "mrkdwn",
            "text": "*Project:*\n{{projectName}}"
          },
          {
            "type": "mrkdwn",
            "text": "*Priority:*\n{{priority}}"
          }
        ]
      },
      {
        "type": "context",
        "elements": [
          {
            "type": "mrkdwn",
            "text": "Triggered at {{formatDate timestamp}}"
          }
        ]
      }
    ]
  }
};

// =============================================================================
// GENERIC HTTP TEMPLATES
// =============================================================================

export const genericProjectNotification: WebhookTemplate = {
  serviceType: 'generic',
  name: 'Generic - Project Notification',
  description: 'Standard JSON payload for project events',
  template: {
    "event": "{{triggerKey}}",
    "timestamp": "{{timestamp}}",
    "source": "CriteriaIQ",
    "project": {
      "id": "{{projectId}}",
      "name": "{{projectName}}",
      "status": "{{projectStatus}}",
      "url": "{{projectUrl}}"
    },
    "customer": {
      "name": "{{customerName}}",
      "id": "{{customerId}}"
    },
    "risk": {
      "level": "{{riskLevel}}",
      "score": "{{riskScore}}"
    },
    "map": {
      "progress": "{{mapProgress}}"
    },
    "user": {
      "name": "{{userName}}",
      "email": "{{userEmail}}"
    },
    "metadata": "{{json metadata}}"
  }
};

export const genericMapUpdate: WebhookTemplate = {
  serviceType: 'generic',
  name: 'Generic - MAP Update',
  description: 'Standard JSON payload for MAP changes',
  template: {
    "event": "{{triggerKey}}",
    "timestamp": "{{timestamp}}",
    "source": "CriteriaIQ",
    "project": {
      "id": "{{projectId}}",
      "name": "{{projectName}}"
    },
    "phase": {
      "id": "{{phaseId}}",
      "name": "{{phaseName}}",
      "status": "{{phaseStatus}}"
    },
    "step": {
      "id": "{{stepId}}",
      "name": "{{stepName}}",
      "status": "{{stepStatus}}"
    },
    "task": {
      "id": "{{taskId}}",
      "name": "{{taskName}}",
      "status": "{{taskStatus}}",
      "assignedTo": "{{assignedTo}}",
      "dueDate": "{{dueDate}}"
    },
    "changes": "{{json changes}}"
  }
};

export const genericCustomPayload: WebhookTemplate = {
  serviceType: 'generic',
  name: 'Generic - Custom Payload',
  description: 'Minimal template for custom payloads',
  template: {
    "event": "{{triggerKey}}",
    "timestamp": "{{timestamp}}",
    "data": "{{json metadata}}"
  }
};

export const n8nEvent: WebhookTemplate = {
  serviceType: 'generic',
  name: 'n8n - Event',
  description: 'Full event payload for an n8n Webhook node: event key, project and every event field',
  template: {
    "event": "{{triggerKey}}",
    "occurredAt": "{{occurredAt}}",
    "source": "CriteriaIQ",
    "projectId": "{{json projectId}}",
    "userId": "{{json userId}}",
    "data": "{{json metadata}}"
  }
};

// =============================================================================
// TEMPLATE REGISTRY
// =============================================================================

export const WEBHOOK_TEMPLATES: Record<string, WebhookTemplate> = {
  'ms_teams_project': msTeamsProjectNotification,
  'ms_teams_map': msTeamsMapUpdate,
  'ms_teams_alert': msTeamsAlert,
  'slack_project': slackProjectNotification,
  'slack_map': slackMapUpdate,
  'slack_alert': slackAlert,
  'generic_project': genericProjectNotification,
  'generic_map': genericMapUpdate,
  'generic_custom': genericCustomPayload,
  'n8n_event': n8nEvent
};

export function getTemplatesForService(serviceType: WebhookServiceType): WebhookTemplate[] {
  return Object.values(WEBHOOK_TEMPLATES).filter(t => t.serviceType === serviceType);
}

export function getTemplateById(templateId: string): WebhookTemplate | undefined {
  return WEBHOOK_TEMPLATES[templateId];
}

export function getDefaultTemplate(serviceType: WebhookServiceType): WebhookTemplate {
  switch (serviceType) {
    case 'ms_teams':
      return msTeamsProjectNotification;
    case 'slack':
      return slackProjectNotification;
    case 'generic':
    default:
      return genericProjectNotification;
  }
}

// =============================================================================
// AVAILABLE HANDLEBARS VARIABLES
// =============================================================================

export const WEBHOOK_VARIABLES = {
  project: [
    { name: 'projectId', description: 'Project ID' },
    { name: 'projectName', description: 'Project name' },
    { name: 'projectStatus', description: 'Current project status' },
    { name: 'projectUrl', description: 'URL to view the project' },
    { name: 'projectCode', description: 'Project code/reference' }
  ],
  customer: [
    { name: 'customerId', description: 'Customer ID' },
    { name: 'customerName', description: 'Customer/Account name' }
  ],
  risk: [
    { name: 'riskLevel', description: 'Risk level (Red/Yellow/Green)' },
    { name: 'riskScore', description: 'Numeric risk score' }
  ],
  map: [
    { name: 'mapProgress', description: 'Overall MAP completion percentage' },
    { name: 'phaseId', description: 'Phase ID' },
    { name: 'phaseName', description: 'Phase name' },
    { name: 'phaseStatus', description: 'Phase status' },
    { name: 'stepId', description: 'Step ID' },
    { name: 'stepName', description: 'Step name' },
    { name: 'stepStatus', description: 'Step status' },
    { name: 'taskId', description: 'Task ID' },
    { name: 'taskName', description: 'Task name' },
    { name: 'taskStatus', description: 'Task status' },
    { name: 'assignedTo', description: 'Name of assigned user' },
    { name: 'dueDate', description: 'Due date for the item' }
  ],
  user: [
    { name: 'userName', description: 'User full name' },
    { name: 'userEmail', description: 'User email address' },
    { name: 'userId', description: 'User ID' }
  ],
  system: [
    { name: 'triggerKey', description: 'The trigger that fired this webhook' },
    { name: 'timestamp', description: 'When the event occurred' },
    { name: 'webhookName', description: 'Name of this webhook configuration' },
    { name: 'metadata', description: 'Full metadata object from the trigger' }
  ],
  helpers: [
    { name: '{{json variable}}', description: 'Convert object to JSON string' },
    { name: '{{uppercase text}}', description: 'Convert to uppercase' },
    { name: '{{lowercase text}}', description: 'Convert to lowercase' },
    { name: '{{formatDate date}}', description: 'Format date for display' },
    { name: '{{statusColor status}}', description: 'Get color hex for status' },
    { name: '{{#ifEquals a b}}...{{/ifEquals}}', description: 'Conditional equality check' }
  ]
};
