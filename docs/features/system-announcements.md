# System Announcements Engine

## Overview

The System Announcements Engine is a comprehensive notification system that enables administrators to broadcast important messages to users across CriteriaIQ. It supports multiple display modes, granular targeting options, severity levels, and optional email integration.

### Key Features

- **Multiple Display Modes**: Header bell icon and bottom banner
- **Severity Levels**: Info, Warning, and Critical with distinct visual styling
- **Granular Targeting**: Role-based and user-specific targeting
- **Read Tracking**: Per-user read receipts with timestamps
- **Scheduling**: Start and end date controls for time-limited announcements
- **Email Integration**: Optional email notifications using existing email templates
- **Rich Text Content**: Full Markdown support with syntax highlighting and embeds

---

## Architecture

### Database Schema

The System Announcements Engine uses two primary tables:

#### `system_announcements` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial | Primary key |
| `title` | text | Announcement headline (required) |
| `content` | text | MDX/rich text content body |
| `severity` | varchar | `info`, `warning`, or `critical` |
| `targetRoles` | jsonb | Array of role names to target (null = all roles) |
| `targetUserIds` | jsonb | Array of specific user IDs to target |
| `targetTeamIds` | jsonb | Team ids; when set, only people on these teams see it ([Teams](teams.md#teams-as-recipients)) |
| `targetSubteamIds` | jsonb | Subteam ids; reaches the subteam and the subteams nested under it |
| `startDate` | timestamp | When the announcement becomes visible |
| `endDate` | timestamp | When the announcement expires (null = no expiry) |
| `isActive` | boolean | Master on/off toggle |
| `showInHeader` | boolean | Display in bell icon dropdown |
| `showInFooter` | boolean | Display as bottom banner |
| `sendEmail` | boolean | Trigger email notification |
| `emailTemplateId` | integer | FK to email_templates table |
| `createdBy` | varchar | FK to users table |
| `createdAt` | timestamp | Creation timestamp |
| `updatedAt` | timestamp | Last modification timestamp |

**Indexes:**
- `idx_system_announcements_active` - Fast filtering by active status
- `idx_system_announcements_dates` - Date range queries
- `idx_system_announcements_severity` - Severity-based sorting

#### `announcement_reads` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial | Primary key |
| `userId` | varchar | FK to users table (cascade delete) |
| `announcementId` | integer | FK to system_announcements (cascade delete) |
| `readAt` | timestamp | When user read the announcement |

**Constraints:**
- `unique_user_announcement_read` - Prevents duplicate read entries

---

## API Endpoints

### User Endpoints

#### GET `/api/announcements/active`
Retrieves active announcements for the authenticated user.

**Authentication**: Required

**Response Filtering Logic:**
1. Only announcements where `isActive = true`
2. `startDate <= current time`
3. `endDate > current time` (or null for no expiry)
4. User's role matches `targetRoles` (if specified)
5. User's ID matches `targetUserIds` (if specified)
6. User is on one of `targetTeamIds` / `targetSubteamIds` (if specified)

**Response:**
```json
[
  {
    "id": 1,
    "title": "Scheduled Maintenance",
    "content": "The system will undergo maintenance...",
    "severity": "warning",
    "showInHeader": true,
    "showInFooter": true,
    "startDate": "2024-01-15T00:00:00Z",
    "endDate": "2024-01-16T00:00:00Z",
    "createdAt": "2024-01-10T10:30:00Z",
    "isRead": false,
    "readAt": null
  }
]
```

**Sorting**: Critical > Warning > Info, then by date (newest first)

#### POST `/api/announcements/:id/read`
Marks an announcement as read for the authenticated user.

**Authentication**: Required

**Response:**
```json
{
  "message": "Marked as read",
  "readAt": "2024-01-15T14:30:00Z"
}
```

### Admin Endpoints

#### GET `/api/admin/announcements`
Retrieves all announcements for admin management.

**Authorization**: Admin role required

**Response**: Full announcement objects with creator details

#### POST `/api/admin/announcements`
Creates a new announcement.

**Authorization**: Admin role required

**Request Body:**
```json
{
  "title": "Important Update",
  "content": "## New Feature Released\n\nWe're excited to announce...",
  "severity": "info",
  "targetRoles": ["Admin", "Solution Engineer"],
  "targetUserIds": null,
  "startDate": "2024-01-15T09:00:00Z",
  "endDate": "2024-01-22T09:00:00Z",
  "isActive": true,
  "showInHeader": true,
  "showInFooter": false,
  "sendEmail": true,
  "emailTemplateId": 5
}
```

#### PUT `/api/admin/announcements/:id`
Updates an existing announcement.

**Authorization**: Admin role required

#### DELETE `/api/admin/announcements/:id`
Deletes an announcement and all associated read receipts.

**Authorization**: Admin role required

---

## React Components

### Component Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│ Header (layout.tsx)                                     │
│  └── AnnouncementBell                                   │
│       └── AnnouncementDetailDialog (shared)             │
├─────────────────────────────────────────────────────────┤
│ Main Content                                            │
├─────────────────────────────────────────────────────────┤
│ Footer Area                                             │
│  └── AnnouncementBanner                                 │
│       └── AnnouncementDetailDialog (shared)             │
└─────────────────────────────────────────────────────────┘

Admin Area:
┌─────────────────────────────────────────────────────────┐
│ Configuration → Announcements Tab                       │
│  └── AnnouncementsManager                               │
│       ├── Announcement Table                            │
│       ├── Create/Edit Dialog (TiptapEditor)                │
│       └── Preview Dialog                                │
└─────────────────────────────────────────────────────────┘
```

### `AnnouncementBell`

**Location**: `client/src/components/AnnouncementBell.tsx`

Header bell icon component that displays announcements in a dropdown popover.

**Features:**
- Unread count badge (red circle with number)
- Animated bell icon when there are unread announcements
- Sorted by: unread first, then severity, then date
- Click to open detail dialog
- Automatic read marking on click

**Props:**
```typescript
interface AnnouncementBellProps {
  enabled?: boolean; // Default: true
}
```

### `AnnouncementBanner`

**Location**: `client/src/components/AnnouncementBanner.tsx`

Bottom-of-page banner for displaying important announcements.

**Features:**
- Carousel navigation for multiple announcements
- Severity-based styling (border color, background)
- Dismiss button (marks as read)
- Click to expand full content
- Auto-hides when no footer announcements exist

**Props:**
```typescript
interface AnnouncementBannerProps {
  enabled?: boolean; // Default: true
}
```

### `AnnouncementDetailDialog`

**Location**: `client/src/components/AnnouncementDetailDialog.tsx`

Shared reusable dialog for displaying full announcement content.

**Features:**
- Megaphone icon in title
- Severity badge with appropriate color and icon
- Relative timestamp display
- Full Markdown rendering with:
  - GitHub Flavored Markdown (remarkGfm)
  - Raw HTML support (rehypeRaw)
  - Proper dark mode styling

**Props:**
```typescript
interface AnnouncementDetailDialogProps {
  announcement: AnnouncementDetailData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

### `AnnouncementsManager`

**Location**: `client/src/components/configuration/AnnouncementsManager.tsx`

Admin interface for creating and managing announcements.

**Features:**
- Full CRUD operations table
- Create/Edit dialog with:
  - Title input
  - TiptapEditor for rich content
  - Severity dropdown (Info/Warning/Critical)
  - Role targeting multi-select
  - User-specific targeting with search
  - Start/End date pickers
  - Display mode toggles (Header/Footer/Welcome Modal)
  - Email notification toggle with template selection
- Preview mode for content verification
- Status indicators (Active/Inactive, Scheduled/Expired)
- Confirmation dialogs for destructive actions

---

## Custom Hook

### `useAnnouncements`

**Location**: `client/src/hooks/useAnnouncements.ts`

React hook for accessing announcements throughout the application.

**Usage:**
```typescript
const {
  announcements,        // All announcements for user
  headerAnnouncements,  // Filtered for showInHeader
  footerAnnouncements,  // Filtered for showInFooter
  unreadCount,          // Total unread count
  unreadHeaderCount,    // Unread in header only
  isLoading,            // Loading state
  error,                // Error state
  markAsRead,           // Function to mark as read
  isMarkingAsRead,      // Mutation loading state
} = useAnnouncements(enabled);
```

**Caching Strategy:**
- `staleTime`: 60 seconds
- `refetchInterval`: 5 minutes (background refresh)

---

## Severity Levels

| Severity | Icon | Use Case | Visual Style |
|----------|------|----------|--------------|
| **Info** | Info (ℹ️) | General updates, new features, tips | Blue accent |
| **Warning** | AlertTriangle (⚠️) | Scheduled maintenance, upcoming changes | Amber accent |
| **Critical** | XCircle (❌) | Outages, urgent security notices | Red accent |

### Styling Configuration

```typescript
const severityConfig = {
  info: { 
    icon: Info, 
    color: 'text-blue-500',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    borderColor: 'border-blue-200 dark:border-blue-800'
  },
  warning: { 
    icon: AlertTriangle, 
    color: 'text-amber-500',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    borderColor: 'border-amber-200 dark:border-amber-800'
  },
  critical: { 
    icon: XCircle, 
    color: 'text-red-500',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    borderColor: 'border-red-200 dark:border-red-800'
  },
};
```

---

## Targeting System

### Role-Based Targeting

Target announcements to specific user roles:

```json
{
  "targetRoles": ["Admin", "Solution Engineer", "Sales Manager"]
}
```

- **Empty array or null**: All roles see the announcement
- **Specific roles**: Only users with matching roles see it

### User-Specific Targeting

Target individual users by their ID:

```json
{
  "targetUserIds": ["user-123", "user-456"]
}
```

- Combines with role targeting (AND logic)
- Useful for beta features or personal notifications

### Targeting Matrix

| targetRoles | targetUserIds | Who Sees It |
|-------------|---------------|-------------|
| null/empty | null/empty | Everyone |
| ["Admin"] | null/empty | All Admins |
| null/empty | ["user-1"] | Only user-1 |
| ["Admin"] | ["user-1"] | Only user-1 (if Admin) |

---

## Email Integration

When `sendEmail: true` is set, the system can trigger email notifications:

1. **Template Selection**: Choose from announcement-category email templates
2. **Recipient Logic**: Based on targetRoles and targetUserIds
3. **Template Variables**: Title, content, severity, dates available

**Note**: Email sending integration with the Email Automation System is available for scheduled delivery.

---

## Display Modes

### Header Bell Icon (`showInHeader`)

- Appears in the main navigation header
- Shows unread count badge
- Dropdown list with scrollable announcements
- Persistent until manually dismissed

### Bottom Banner (`showInFooter`)

- Fixed position at bottom of viewport
- Carousel for multiple announcements
- Dismiss button per announcement
- Higher visibility for important notices

---

## Maintenance Window

Admins announce planned downtime from the same page: **New Maintenance Announcement** (left of **New Announcement**) opens a modal with the start time (local), expected length (5 to 1,440 minutes) and an optional note. It is not a row in `system_announcements`: one window at a time is stored in `system_settings` key `maintenance_window` (`shared/maintenance.ts`; `GET /api/maintenance` for signed-in users, `GET`/`PUT`/`DELETE /api/admin/maintenance` for Admins). A scheduled or running window shows as a strip above the announcements list; its **Edit** button reopens the modal to change or cancel it (`client/src/components/configuration/MaintenanceWindowDialog.tsx`). Every page shows a countdown banner until it starts and a "maintenance in progress" banner while it runs (`client/src/components/layout/MaintenanceBanner.tsx`). It only shows the banner; the redeploy is still done in Dokploy. The old System Settings › Maintenance URL redirects here.

## Admin Guide

### Creating an Announcement

1. Navigate to **Configuration → Announcements**
2. Click **Create Announcement**
3. Fill in required fields:
   - **Title**: Brief, attention-grabbing headline
   - **Content**: Use Markdown for formatting
   - **Severity**: Match urgency level appropriately
4. Configure targeting:
   - Leave empty for all users
   - Select roles for role-based visibility
   - Add specific users for targeted messaging
5. Set scheduling:
   - **Start Date**: When to begin showing
   - **End Date**: When to stop (optional)
6. Choose display modes
7. Optionally enable email notification
8. Click **Create**

### Best Practices

1. **Severity Selection**:
   - Use **Info** for general updates (80% of announcements)
   - Reserve **Warning** for important changes (15%)
   - Use **Critical** sparingly for true emergencies (5%)

2. **Content Guidelines**:
   - Keep titles under 60 characters
   - Front-load important information
   - Include actionable next steps
   - Use formatting for scanability

3. **Scheduling**:
   - Set appropriate end dates to avoid stale content
   - Schedule maintenance announcements 24-48 hours ahead
   - Use start dates for planned feature announcements

4. **Targeting**:
   - Prefer role-based over user-specific when possible
   - Test with a small group before broader rollout
   - Consider time zones for global teams

---

## Technical Notes

### Performance Considerations

- Announcements are cached client-side for 60 seconds
- Background refresh every 5 minutes
- Read receipts use upsert to prevent duplicates
- Indexes optimize common query patterns

### Security

- Admin-only access for CRUD operations
- User can only see announcements targeted to them
- Read receipts tied to authenticated user ID
- Cascade delete cleans up orphaned data

### Future Enhancements

- [ ] Welcome modal implementation
- [ ] Email sending integration
- [ ] Announcement analytics (view counts, click-through)
- [ ] A/B testing for announcement content
- [ ] Rich media attachments (images, videos)
- [ ] Announcement categories/tags

---

## Troubleshooting

### Announcement Not Appearing

1. Check `isActive` is `true`
2. Verify `startDate` is in the past
3. Confirm `endDate` is in the future (or null)
4. Check user's role matches `targetRoles`
5. If `targetUserIds` is set, verify user ID is included

### Read Status Not Updating

1. Check browser console for API errors
2. Verify user is authenticated
3. Check `announcement_reads` table for entry
4. Clear React Query cache if needed

### Email Not Sending

1. Confirm `sendEmail` is true
2. Verify `emailTemplateId` references active template
3. Check Email Automation System logs
4. Verify recipient email addresses are valid
