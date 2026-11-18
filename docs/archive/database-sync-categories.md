# Database Table Synchronization Categories

> **Archived 2026-10-27.** The Data Sync page this guide supported was
> retired: it only stored per-table labels and nothing used them to copy
> data. To move data between installs, use Backup & Restore
> ([`../features/backup-restore.md`](../features/backup-restore.md)).
## CriteriaIQ Database Table Classification

**Version:** 2.0  
**Last Updated:** February 1, 2026  
**Purpose:** Define which database tables should synchronize between Development and Production

---

## Overview

This document categorizes all database tables into three synchronization groups:

1. **Always Sync** - Configuration and reference data that must be identical
2. **Conditional Sync** - Transactional data that syncs during testing phase only
3. **Never Sync** - Runtime/ephemeral data that should remain environment-specific

---

## Synchronization Categories

### Category 1: Always Sync
**Purpose:** Core configuration and reference data  
**Sync Frequency:** Every deployment  
**Description:** These tables contain system configuration, templates, and reference data that define how the application operates. They must be identical across environments.

| Table Name | Description | Why Always Sync |
|------------|-------------|-----------------|
| `action_items` | Reusable action items | Core success criteria framework |
| `ai_provider_configs` | AI provider configurations (OpenAI, Anthropic, etc.) | System AI integration settings |
| `allowed_domains` | Email domain restrictions for registration | Security configuration |
| `compliance_regulations` | Compliance and regulatory requirements | Core reference data needed by all projects |
| `components` | Product component definitions | Success criteria framework |
| `criteria_library` | Reusable success criteria | Core success criteria framework |
| `criteria_outcomes` | Links criteria to outcomes | Junction table for success criteria |
| `customer_status_configs` | Customer status configurations | Defines available customer statuses |
| `dashboard_configs` | Dashboard layout configurations | System dashboard framework |
| `dashboard_layouts` | Dashboard layout definitions | System dashboard framework |
| `email_automation_config` | Email automation settings | Communication framework |
| `email_configuration` | SMTP and email provider settings | System email configuration |
| `email_designs` | Reusable email design templates | Communication framework |
| `email_rule_actions` | Email automation rule actions | Workflow automation framework |
| `email_rule_conditions` | Email automation rule conditions | Workflow automation framework |
| `email_rules` | Email automation rules | Workflow automation framework |
| `email_templates` | Email template definitions | Communication framework |
| `email_triggers` | Email automation triggers | Workflow automation framework |
| `end_date_flags` | Configurable end date flags | Reporting configuration |
| `execution_plans` | Execution plan templates | Project planning framework |
| `expected_outcomes` | Reusable expected outcomes | Core success criteria framework |
| `flight_deck_configs` | Flight deck widget configurations | Dashboard framework |
| `flight_deck_tips` | Flight deck tips and guidance | User onboarding content |
| `industries` | Industry classifications | Reference data for customer categorization |
| `industry_compliance_regulations` | Links industries to compliance regulations | Junction table for compliance management |
| `map_automation_config` | MAP automation settings | MAP automation framework |
| `map_templates` | Mutual Action Plan templates | MAP framework |
| `map_template_phases` | Template phases for MAPs | MAP framework |
| `map_template_steps` | Template steps for MAPs | MAP framework |
| `map_template_tasks` | Template tasks for MAPs | MAP framework |
| `outcome_actions` | Links outcomes to actions | Junction table for success criteria |
| `outcome_config` | Project outcome configurations | Outcome framework settings |
| `product_actions` | Links products to actions | Junction table for products |
| `product_components` | Links products to components | Junction table for products |
| `product_criteria` | Links products to criteria | Junction table for success criteria |
| `product_outcomes` | Links products to outcomes | Junction table for products |
| `products` | Product/solution catalog | Core success criteria framework |
| `ranking_configs` | Project ranking configurations | Defines ranking levels system-wide |
| `risk_criteria` | AI risk assessment criteria | Risk management configuration |
| `risk_level_configs` | Risk level configurations | Defines risk levels system-wide |
| `role_permissions` | Default permissions for each role | Security and permissions framework |
| `roles` | User role definitions | Security and permissions framework |
| `salesforce_field_mappings` | Salesforce field mapping configurations | Salesforce integration framework |
| `salesforce_sync_policies` | Salesforce sync policy definitions | Salesforce integration framework |
| `salesforce_value_maps` | Salesforce value translation mappings | Salesforce integration framework |
| `status_configs` | Project status configurations | Defines available statuses system-wide |
| `system_announcements` | System-wide announcements | User communication framework |
| `system_settings` | Global system settings | Core system configuration |
| `tags` | System tags | Categorization and filtering framework |
| `user_permissions` | User-specific permission overrides | Security and permissions framework |
| `validation_criteria_templates` | Validation criteria templates | Success criteria template framework |
| `webhooks` | Webhook endpoint configurations | Integration framework |
| `widget_configs` | Dashboard widget configurations | Dashboard framework |

**Total: 53 tables**

---

### Category 2: Conditional Sync
**Purpose:** Transactional data needed during testing  
**Sync Frequency:** On-demand during testing phase only  
**Description:** These tables contain actual work data (projects, customers, users). During testing, they sync to maintain parity. Once in production, these become environment-specific.

| Table Name | Description | Special Considerations |
|------------|-------------|------------------------|
| `access_codes` | Project access codes | Customer portal access |
| `code_scripts` | Code snippets and scripts | Project artifact data |
| `custom_reports` | User-defined custom reports | Report definitions and configurations |
| `customer_access` | Customer access permissions | Project-specific access control |
| `customers` | Customer organization records | Include customer logos and metadata |
| `dashboard_metrics` | Dashboard metric definitions | User-created metrics |
| `documents` | Uploaded project documents | File references only, actual files stored separately |
| `evaluation_request_products` | Links evaluations to products | Junction table for evaluations |
| `evaluation_requests` | Customer evaluation requests | Project workflow data |
| `infrastructure_profiles` | Customer infrastructure profiles | Technical discovery data |
| `links` | Resource links for projects | Project-specific URLs and resources |
| `map_assignment_overrides` | MAP assignment override rules | Mutual Action Plan data |
| `map_links` | MAP-related resource links | Mutual Action Plan data |
| `map_phases` | Project-specific MAP phases | Mutual Action Plan data |
| `map_steps` | Project-specific MAP steps | Mutual Action Plan data |
| `map_tasks` | Project-specific MAP tasks | Mutual Action Plan data |
| `project_gap_links` | Links to gap analysis items | Gap analysis data |
| `project_gaps` | Project gap analysis items | Gap analysis data |
| `project_map_notification_settings` | MAP notification preferences | Project-specific settings |
| `project_maps` | Project MAP associations | MAP project data |
| `project_outcomes` | Project outcome tracking | Outcome data |
| `project_templates` | Project templates | May contain customer-specific templates |
| `projects` | Technical validation projects | Core transactional data |
| `salesforce_oauth_config` | Salesforce OAuth tokens | **Sanitize:** Clear tokens after restore |
| `salesforce_record_links` | Links to Salesforce records | Salesforce integration data |
| `success_criteria` | Project success criteria | Linked to specific projects |
| `support_requests` | Support and feature requests | Development and testing feedback |
| `user_accounts` | User account associations | User-customer relationships |
| `user_board_preferences` | Kanban board preferences | User preferences |
| `user_email_preferences` | User email notification preferences | User preferences |
| `users` | User accounts and profiles | **Sanitize:** Clear `reset_token`, `reset_token_expiry`, `totp_secret_enc` after restore |
| `validation_criteria_template_links` | Links templates to projects | Template association data |

**Total: 32 tables**

**Post-Sync Sanitization Required:**
```sql
-- After restoring users table, clear sensitive fields
UPDATE users SET reset_token = NULL, reset_token_expiry = NULL;
UPDATE users SET totp_secret_enc = NULL WHERE totp_secret_enc IS NOT NULL;

-- Clear Salesforce OAuth tokens
UPDATE salesforce_oauth_config SET 
  access_token_enc = NULL, 
  refresh_token_enc = NULL,
  instance_url = NULL;
```

---

### Category 3: Never Sync
**Purpose:** Environment-specific runtime data  
**Sync Frequency:** Never  
**Description:** These tables contain ephemeral, security-sensitive, or environment-specific data that should remain separate. Syncing these could overwrite production audit trails or compromise security.

| Table Name | Description | Why Never Sync |
|------------|-------------|----------------|
| `access_code_audit_log` | Access code usage audit trail | Production audit trail |
| `access_code_usage` | Access code usage tracking | Environment-specific usage data |
| `activity_logs` | System activity logs | Production audit trail |
| `announcement_reads` | User announcement read status | User-specific state |
| `archive_log` | Archival operation log | Production archive history |
| `archived_customers` | Archived customer records | Historical data, environment-specific |
| `archived_projects` | Archived project records | Historical data, environment-specific |
| `archived_users` | Archived user records | Historical data, environment-specific |
| `audit_logins` | Login attempt history | Production audit trail must be preserved |
| `domain_audit_log` | Domain allowlist audit trail | Security audit trail |
| `email_logs` | Sent email tracking | Production email history must be preserved |
| `email_rule_audits` | Email rule execution audit | Workflow audit trail |
| `email_schedules` | Scheduled email queue | Environment-specific queue |
| `kanban_audit_events` | Kanban board audit events | Production audit trail |
| `map_template_applications` | MAP template application tracking | Operational tracking data |
| `metric_snapshots` | Dashboard metric snapshots | Historical metrics, environment-specific |
| `mfa_events` | MFA security event log | Security audit trail |
| `mfa_recovery_codes` | MFA recovery codes | Security-sensitive, user-specific |
| `project_audits` | Project change history | Production audit trail |
| `project_risk_predictions` | AI risk analysis results | Calculated data, can be regenerated |
| `report_executions` | Report execution history | Production reporting metrics |
| `risk_alerts` | Risk alert history | Production alerting history |
| `salesforce_describe_cache` | Salesforce schema cache | Runtime cache, regeneratable |
| `salesforce_sync_queue` | Salesforce sync job queue | Environment-specific queue |
| `salesforce_sync_run_items` | Salesforce sync run details | Environment-specific sync history |
| `salesforce_sync_runs` | Salesforce sync run history | Environment-specific sync history |
| `sessions` | User session data | Active sessions are environment-specific |
| `trusted_devices` | Trusted device tokens | Security-sensitive, environment-specific |
| `user_report_favorites` | User report favorites | User preferences, environment-specific |
| `user_sessions` | Extended user session data | Session data, environment-specific |
| `webauthn_credentials` | WebAuthn passkey credentials | Security-sensitive, user-specific |
| `webhook_deliveries` | Webhook delivery history | Environment-specific delivery logs |

**Total: 32 tables**

**Critical Security Note:** These tables often contain authentication tokens, session data, and audit trails. Overwriting them would:
- Break active user sessions
- Compromise security tokens and MFA credentials
- Erase production audit history
- Violate compliance requirements for audit trail integrity

---

## Summary

| Category | Table Count | Description |
|----------|-------------|-------------|
| Always Sync | 53 | Configuration, templates, reference data |
| Conditional Sync | 32 | User/project/customer transactional data |
| Never Sync | 32 | Runtime, audit, security, cache data |
| **Total** | **117** | All database tables |

---

## Sync Workflow Decision Tree

```
New Table Added to Schema
         |
         v
    [Decision]
         |
    Is this table...
         |
    ├─ Configuration/Template Data?
    |  (Defines how system works)
    |  └─> Always Sync
    |
    ├─ User/Project/Customer Data?
    |  (Actual work being done)
    |  └─> Conditional Sync
    |      └─> [Testing Phase: Yes]
    |      └─> [Production Phase: No]
    |
    └─ Runtime/Audit/Session Data?
       (Environment-specific operations)
       └─> Never Sync
```

---

## Governance Rules

### Adding New Tables

When adding a new table to `shared/schema.ts`, you MUST:

1. **Categorize the table** into one of three sync categories
2. **Document the decision** in this file
3. **Update sync scripts** if it's an Always Sync table
4. **Add to migration checklist** for schema changes

### Migration Checklist Template

```markdown
- [ ] Table category determined: [Always / Conditional / Never]
- [ ] Added to database-sync-categories.md
- [ ] If Always Sync: Added to pg_dump command in runbook
- [ ] If Conditional Sync: Documented special handling requirements
- [ ] If Never Sync: Documented why it should remain environment-specific
- [ ] Schema migration generated and tested
```

---

## Production Launch Transition

When transitioning from testing to production:

### Phase 1: Testing (Current)
- Sync: Always Sync + Conditional Sync
- Production data mirrors development

### Phase 2: Production Launch (Future)
- Sync: Always Sync only
- Production has independent customer/project data
- Stop syncing Conditional Sync tables
- Implement production data reduction:
  ```sql
  -- Example cleanup for test data
  DELETE FROM projects WHERE tags @> ARRAY['test-data'];
  DELETE FROM customers WHERE company LIKE '%Test%';
  ```

### Phase 3: Production Operations
- Only configuration updates sync
- Production and development data fully independent
- Schema changes continue to sync via migrations

---

## Monitoring and Compliance

### Recommended Checks

**Before Each Sync:**
- [ ] Verify development database is in stable state
- [ ] Confirm no active production users
- [ ] Backup production database
- [ ] Review recent schema changes

**After Each Sync:**
- [ ] Compare row counts (Always Sync tables should match)
- [ ] Verify foreign key integrity
- [ ] Test application login
- [ ] Spot-check key reference data (compliance regulations, users)

### Metrics to Track

| Metric | Development | Production | Expected |
|--------|-------------|------------|----------|
| Always Sync table count | [Check] | [Check] | Should match |
| Conditional Sync row counts | [Check] | [Check] | Should match during testing |
| Never Sync tables | [Check] | [Check] | Should differ |
| Migration history | [Check] | [Check] | Should match exactly |

---

## Document History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-10-01 | Initial categorization of all 61 database tables | System |
| 2.0 | 2026-02-01 | Updated to include all 117 tables with 56 new additions | System |

---

## Related Documentation

- [Database Sync Runbook](./database-sync-runbook.md) - Step-by-step sync procedures
- [Drizzle ORM Documentation](https://orm.drizzle.team/) - Schema management
- [Schema Definition](../shared/schema.ts) - Authoritative table definitions
