# Webhook System Reference

CriteriaIQ's webhook system allows you to send real-time notifications to external services when automation triggers fire. This guide covers configuration, templates, and integration with external services.

## Overview

The webhook system supports three service types:
- **Microsoft Teams** - Send Adaptive Cards to Teams channels
- **Slack** - Send Block Kit messages to Slack channels  
- **Generic HTTP** - Send JSON payloads to any HTTP endpoint

Webhooks integrate with the existing Email Automation system, allowing you to add `trigger_webhook` actions alongside email actions using the same 65+ triggers.

## Getting Started

### Creating a Webhook

1. Navigate to **Communications** > **Webhooks**
2. Click **New Webhook**
3. Follow the 3-step wizard:
   - **Step 1**: Select your service (Teams, Slack, or Generic HTTP)
   - **Step 2**: Configure name, endpoint URL, and payload template
   - **Step 3**: Test the connection and save

### Endpoint URLs

#### Microsoft Teams
1. In Teams, navigate to the channel for notifications
2. Click the channel settings (...) > **Workflows**
3. Search for "Post to a channel when a webhook request is received"
4. Follow the setup wizard to get your webhook URL
5. The URL will look like: `https://prod-XX.westus.logic.azure.com/workflows/...`

#### Slack
1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Create a new app or select existing
3. Enable **Incoming Webhooks**
4. Add a new webhook to a workspace
5. Copy the webhook URL: `https://hooks.slack.com/services/T.../B.../...`

#### Generic HTTP
Any HTTPS endpoint that accepts POST requests with JSON body.

## Template Variables

All templates use Handlebars syntax. Available variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `{{projectName}}` | Project name | "Acme Corp Implementation" |
| `{{projectId}}` | Project ID | 123 |
| `{{customerName}}` | Customer name | "Acme Corporation" |
| `{{triggeredBy}}` | User who triggered event | "john.smith@company.com" |
| `{{triggerKey}}` | Trigger identifier | "map.phase.completed" |
| `{{timestamp}}` | ISO timestamp | "2024-01-15T10:30:00Z" |
| `{{ruleId}}` | Automation rule ID | 5 |
| `{{phaseName}}` | MAP phase name | "Discovery" |
| `{{stepName}}` | MAP step name | "Requirements Gathering" |
| `{{taskName}}` | MAP task name | "Schedule kickoff call" |
| `{{entityType}}` | Entity type (phase/step/task) | "phase" |
| `{{action}}` | Action performed | "completed" |

### Example: Teams Adaptive Card

```json
{
  "type": "message",
  "attachments": [{
    "contentType": "application/vnd.microsoft.card.adaptive",
    "content": {
      "type": "AdaptiveCard",
      "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
      "version": "1.4",
      "body": [{
        "type": "TextBlock",
        "text": "{{projectName}} - {{action}}",
        "weight": "bolder",
        "size": "medium"
      }, {
        "type": "FactSet",
        "facts": [
          {"title": "Customer", "value": "{{customerName}}"},
          {"title": "Triggered By", "value": "{{triggeredBy}}"},
          {"title": "Time", "value": "{{timestamp}}"}
        ]
      }]
    }
  }]
}
```

### Example: Slack Block Kit

```json
{
  "blocks": [{
    "type": "header",
    "text": {
      "type": "plain_text",
      "text": "CriteriaIQ Notification"
    }
  }, {
    "type": "section",
    "fields": [
      {"type": "mrkdwn", "text": "*Project:*\n{{projectName}}"},
      {"type": "mrkdwn", "text": "*Customer:*\n{{customerName}}"},
      {"type": "mrkdwn", "text": "*Event:*\n{{triggerKey}}"},
      {"type": "mrkdwn", "text": "*By:*\n{{triggeredBy}}"}
    ]
  }]
}
```

## Security Features

### HMAC-SHA256 Signing

Enable payload signing for secure verification:
1. In webhook settings, add a **Signing Secret**
2. CriteriaIQ will add an `X-Webhook-Signature` header
3. Verify the signature on your endpoint:

```javascript
const crypto = require('crypto');

function verifySignature(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  return `sha256=${expected}` === signature;
}
```

### Retry Logic

Webhooks use exponential backoff for reliability:
- **Attempt 1**: Immediate
- **Attempt 2**: 2 second delay
- **Attempt 3**: 4 second delay

Configure retries per webhook in Advanced Settings.

## Delivery History

View recent deliveries from the webhook list:
1. Click the **...** menu on any webhook
2. Select **View History**
3. See last 10 deliveries with:
   - Status code (200, 500, etc.)
   - Timestamp
   - Response body preview
   - Request payload

## Integration with Automation Rules

Add webhooks to automation rules:
1. Go to **Communications** > **Email Automation** > **Rules**
2. Create or edit a rule
3. In the **Actions** tab, select **Trigger Webhook**
4. Choose the webhook from the dropdown
5. The webhook will fire when the rule's triggers match

## Common Trigger Keys

| Trigger | Description |
|---------|-------------|
| `map.phase.created` | MAP Phase created |
| `map.phase.completed` | MAP Phase marked complete |
| `map.step.created` | MAP Step created |
| `map.step.completed` | MAP Step marked complete |
| `map.task.created` | MAP Task created |
| `map.task.completed` | MAP Task marked complete |
| `project.created` | New project created |
| `project.status_changed` | Project status updated |
| `project.risk_level_changed` | Project risk level changed |

See [EMAIL_AUTOMATION_TRIGGERS.md](./email-triggers-reference.md) for the complete list of 65+ triggers.

## Salesforce Integration

CriteriaIQ supports user-context Salesforce OAuth for project enrichment.

### Connecting Salesforce

1. Navigate to **Profile** settings
2. Click **Connect to Salesforce**
3. Authorize the CriteriaIQ application
4. Your connection is stored securely with encrypted tokens

### Project Enrichment

With Salesforce connected:
1. When creating/editing a project, use **Enrich from Salesforce**
2. Search for an Opportunity by name
3. Auto-populate: Customer name, description, amount, close date
4. The Salesforce Opportunity ID is linked for future sync

### Environment Variables

Salesforce OAuth requires these environment variables (contact your administrator):
- `SALESFORCE_CLIENT_ID` - Connected App Client ID
- `SALESFORCE_CLIENT_SECRET` - Connected App Client Secret  
- `SALESFORCE_LOGIN_URL` - Login URL (default: https://login.salesforce.com)

## Troubleshooting

### Webhook Not Firing
1. Verify the webhook is **Active** (toggle is on)
2. Check the automation rule is **Enabled**
3. Confirm the trigger matches the event

### Delivery Failures
1. Check **View History** for error details
2. Verify the endpoint URL is correct
3. Ensure the endpoint accepts POST requests
4. Check if HTTPS certificate is valid

### Template Errors
1. Validate JSON syntax in your template
2. Ensure all Handlebars variables are properly closed
3. Test with the **Test** button before saving

## API Reference

### Webhooks CRUD

```
GET    /api/webhooks           - List all webhooks
GET    /api/webhooks/:id       - Get single webhook
POST   /api/webhooks           - Create webhook
PUT    /api/webhooks/:id       - Update webhook
DELETE /api/webhooks/:id       - Delete webhook
POST   /api/webhooks/:id/test  - Test webhook
POST   /api/webhooks/:id/toggle - Toggle active state
GET    /api/webhooks/:id/deliveries - Get delivery history
```

### Salesforce Endpoints

```
GET  /api/auth/salesforce/status     - Check connection status
GET  /api/auth/salesforce/connect    - Initiate OAuth flow
POST /api/auth/salesforce/disconnect - Disconnect account
GET  /api/salesforce/opportunities/search?q=term - Search opportunities
GET  /api/salesforce/opportunities/:id - Get opportunity details
POST /api/salesforce/enrich          - Enrich project from opportunity
```
