# Archive Management System

## Overview

The Archive Management System provides **soft-delete functionality** for Users, Projects, and Customers in CriteriaIQ. Instead of permanently deleting records, items are moved to archive tables where they can be viewed, audited, and restored if needed. This approach ensures data integrity, maintains audit trails, and allows recovery from accidental deletions.

## Key Features

- **Soft Delete**: Records are archived rather than permanently deleted
- **Full Data Preservation**: All entity data is captured at the time of archiving
- **Activity Logging**: Every archive and restore action is logged with user and timestamp
- **Restore Capability**: Archived items can be restored to their original tables
- **Audit Trail**: Complete history of all archive operations

## Access & Navigation

The Archive Management page is accessible via:
- **Sidebar**: Configuration → Archives
- **URL**: `/admin?tab=archive&subtab=log|users|projects|customers` (Admin › Monitoring & Audit › Archive Management; old `/archive-management` links redirect)

### Tab Structure

| Tab | Description |
|-----|-------------|
| **Activity Log** | Complete history of all archive/restore operations |
| **Users** | View and manage archived user accounts |
| **Projects** | View and manage archived projects |
| **Customers** | View and manage archived customer records |

## How Archiving Works

### Trigger Points

Items are archived when a user clicks the **Delete** button on:

| Entity | Delete Location | Archive Function |
|--------|-----------------|------------------|
| **Users** | Configuration → User Management → Delete User | `archiveUser()` |
| **Projects** | Project List → Delete, Project Detail → Delete | `archiveProject()` |
| **Customers** | Customer List → Delete, Customer Detail → Delete | `archiveCustomer()` |

### Archive Process Flow

```
1. User clicks Delete button
2. Confirmation dialog appears
3. Upon confirmation:
   a. Source record is copied to archive table (archived_users/projects/customers)
   b. Archive log entry is created with metadata
   c. Related cleanup is performed (permissions, references, etc.)
   d. Source record is deleted from original table
4. Success notification is displayed
```

### User Archive Special Handling

When a user is archived, additional cleanup occurs:
- User permissions records are deleted
- MFA data (recovery codes, trusted devices, WebAuthn credentials, MFA events) is removed
- Project references are updated to show "(D)" suffix indicating a deleted user
- Supporting engineer arrays are updated across all affected projects

### Project Archive Special Handling

When a project is archived:
- Related success criteria are preserved within the archived record
- Activity logs for the project are cleaned up
- Customer access records are removed
- Project audit records are deleted

## Database Schema

### Archive Tables

#### archived_users
Stores all user data at time of archiving plus:
- `archivedAt` - Timestamp when archived
- `archivedBy` - User ID who performed the archive

#### archived_projects
Stores all project data at time of archiving plus:
- `archivedAt` - Timestamp when archived
- `archivedBy` - User ID who performed the archive

#### archived_customers
Stores all customer data at time of archiving plus:
- `archivedAt` - Timestamp when archived
- `archivedBy` - User ID who performed the archive

#### archive_log
Central activity log for all archive operations:

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial | Primary key |
| `entityType` | varchar | 'user', 'project', or 'customer' |
| `entityId` | varchar | Original ID of archived entity |
| `entityName` | varchar | Display name for easy reference |
| `archivedBy` | varchar | User ID who performed action |
| `archivedAt` | timestamp | When the action occurred |
| `reason` | text | Optional reason for archiving |

## Restore Functionality

### Restore Process

Archived items can be restored by users with appropriate permissions:

1. Navigate to Archive Management
2. Select the appropriate tab (Users/Projects/Customers)
3. Find the item to restore
4. Click the **Restore** action button
5. Confirm the restoration

### What Happens During Restore

```
1. Data is copied from archive table back to source table
2. Archive table record is deleted
3. A restore entry is logged in the archive log
4. Success notification is displayed
```

**Note**: Restored items return to their state at the time of archiving. Any changes made in the system after archiving (e.g., new fields, schema changes) may result in default values being applied to new fields.

## API Endpoints

### Archive Data Retrieval

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/archive/users` | GET | List all archived users |
| `/api/archive/projects` | GET | List all archived projects |
| `/api/archive/customers` | GET | List all archived customers |
| `/api/archive/log` | GET | Get archive activity log (supports `?limit=N`) |
| `/api/archive/users/:id` | GET | Get specific archived user |
| `/api/archive/projects/:id` | GET | Get specific archived project |
| `/api/archive/customers/:id` | GET | Get specific archived customer |

### Restore Operations

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/archive/users/:id/restore` | POST | Restore an archived user |
| `/api/archive/projects/:id/restore` | POST | Restore an archived project |
| `/api/archive/customers/:id/restore` | POST | Restore an archived customer |

### Permanent Deletion

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/archive/users/:id` | DELETE | Permanently delete archived user |
| `/api/archive/projects/:id` | DELETE | Permanently delete archived project |
| `/api/archive/customers/:id` | DELETE | Permanently delete archived customer |

## Permissions

Archive management operations require appropriate role permissions:

| Action | Required Role |
|--------|---------------|
| View archived items | Admin, CX Director, Support |
| Restore items | Admin only |
| Permanently delete | Admin only |

## Best Practices

### When to Archive vs. Deactivate

- **Archive**: Use when an entity is no longer needed and should be removed from active views
- **Deactivate**: Use when an entity should remain visible but be marked as inactive (e.g., `isActive = false`)

### Data Retention

- Archived data is retained indefinitely by default
- Consider implementing periodic cleanup policies for very old archived records
- Always review archived items before permanent deletion

### Audit Compliance

- The archive log provides a complete audit trail for compliance purposes
- All archive and restore operations are timestamped and attributed to specific users
- Activity logs can be exported for compliance reporting

## System Health Integration

The System Health page (Configuration → System Health) includes archive schema validation that:
- Compares source table columns with archive table columns
- Identifies any schema drift (fields added to source tables but missing from archive tables)
- Alerts administrators when archive tables need to be updated

## Troubleshooting

### Common Issues

**Issue**: Archived user's name appears as "(D)" in projects
**Resolution**: This is expected behavior. When a user is archived, their references in projects are updated to show "(D)" to indicate the user was deleted. Restoring the user will not automatically revert these references.

**Issue**: Cannot restore archived item
**Resolution**: Ensure you have Admin role permissions. Check if there are any unique constraint conflicts (e.g., email already exists for a new user).

**Issue**: Missing data after restore
**Resolution**: Fields added to the schema after the item was archived will have default or null values. Review and update the restored record as needed.

## Related Documentation

- [Account & User Management](./account-user-management.md)
- [Backup & Restore](./backup-restore.md)
- [API Reference](../guides/api-reference.md)
