# Global Search System

The Global Search system provides a fast, role-aware command palette for quickly finding and navigating to Projects, Customers, Mutual Action Plans (MAPs), Users, and Documents across CriteriaIQ.

## Overview

Global Search is designed as a lightweight, quick-access search experience anchored in the header bar. It provides:

- **Fast access** via keyboard shortcut (`Ctrl+K` / `Cmd+K`) or header button
- **Role-based visibility** - only visible to internal staff roles
- **Server-side permission trimming** - users only see entities they're authorized to access
- **Smart ranking** - prioritizes exact matches, recent items, and user-owned content
- **Debounced queries** with client-side caching for performance

## Architecture

### Frontend Component

```
client/src/components/GlobalSearch.tsx
```

The `GlobalSearch` component renders:
1. A ghost-style ScanSearch button in the header
2. A Command palette popup (using shadcn/ui Command primitives)
3. Debounced search input with loading/empty/error states
4. Grouped results with keyboard navigation

### Backend API

```
GET /api/search?q={query}&limit={limit}
```

The search endpoint in `server/routes.ts`:
- Requires authentication (`isAuthenticated` middleware)
- Enforces role-based access (external roles get empty results)
- Searches across multiple entity types
- Applies scoring and ranking
- Limits results (default: 20, max: 50)

### Data Flow

```
User Input → Debounce (300ms) → Cache Check → API Request → Permission Filter → Rank & Sort → Display
```

## Role-Based Visibility & Security

### Access Control Architecture

Global Search implements a two-tier access control system:

1. **Frontend visibility gate**: The search button is only rendered for internal roles
2. **Backend permission enforcement**: Server-side filtering ensures users only see authorized data

### Who Can See Global Search

| Role | Search Visibility | Entity Access |
|------|-------------------|---------------|
| Admin | Full access | All entities, full user search |
| SE (Solution Engineer) | Full access | All entities, full user search |
| AE (Account Executive) | Full access | All entities, full user search |
| CS (Customer Success) | Full access | All entities, full user search |
| Sales | Visible | Projects (permission-filtered), assigned customers, own MAPs |
| CX | Visible | Projects (permission-filtered), assigned customers, own MAPs |
| Product | Visible | Projects (permission-filtered), assigned customers, own MAPs |
| ProServ | Visible | Projects (permission-filtered), assigned customers, own MAPs |
| Support | Visible | Projects (permission-filtered), assigned customers, own MAPs |
| Customer | Hidden | N/A |
| Partner | Hidden | N/A |
| Guest | Hidden | N/A |

### Permission Enforcement Details

**Projects**: Always filtered through `storage.getProjects(userId, ...)` which applies existing RBAC rules.

**Customers**: 
- Full access roles (Admin, SE, AE, CS): See all customers
- Restricted internal roles (Sales, CX, etc.): Only see customers where they are assigned as Account Representative, Account Engineer, or Contact

**MAP Templates**:
- Full access roles: See all templates
- Restricted internal roles: Only see templates they created or public/shared templates

**Users**:
- Only Admin, SE, AE, and CS roles can search users
- Only approved users are included in results

### User Search Restrictions

User search results are only returned for core internal roles:
- Admin
- SE (Solution Engineer)
- AE (Account Executive)
- CS (Customer Success)

Other internal roles cannot search for users, matching the existing user management page permissions.

## Searchable Entities

### Projects
- **Searchable fields**: Solution Name, Customer Name, Status, Stage
- **URL pattern**: `/projects/{id}`
- **Owner detection**: Primary Engineer, Specialist Engineer, or Assigned SE

### Customers
- **Searchable fields**: Name, Industry, Region
- **URL pattern**: `/customers?customer={id}`
- **Owner detection**: Account Representative or Account Engineer

### Mutual Action Plans (MAP Templates)
- **Searchable fields**: Name, Description
- **URL pattern**: `/map?template={id}`
- **Owner detection**: Created by user

### Users (restricted)
- **Searchable fields**: Full Name, Email, Role
- **URL pattern**: `/admin?tab=users&user={id}`
- **Visibility**: Admin, SE, AE, CS roles only
- **Filter**: Only approved users are shown

### Navigation Pages
- **Searchable fields**: Page Name, Description
- **URL pattern**: Direct page URLs (e.g., `/project`, `/reports`, `/admin`)
- **Visibility**: Role-based - each role sees only pages they can access
- **Score boost**: +10 points for navigation items (quick access priority)

### Documentation
- **Searchable fields**: Document Name, Category, Description
- **URL pattern**: `/about?tab=documentation&doc={docId}`
- **Visibility**: All internal roles (not Customer, Partner, Guest)
- **Categories**: Project & Architecture, Development & Components, Integrations, Security, Database & Operations, Performance, Deployment

### Guide pages (formerly Getting Started)
- **Searchable fields**: Guide Name, Description, plus keywords (help, guide, tutorial)
- **URL pattern**: `/getting-started?tab={guideId}`
- **Visibility**: All internal roles
- **Score boost**: +5 points for guides (help content priority)

### About Page Sections
- **Searchable fields**: Section Name, Description
- **URL pattern**: `/about?tab={tabId}`
- **Visibility**: Role-dependent (some tabs like Clear2Close and Support & Features are internal-only)

## Search Ranking Algorithm

Results are scored on three axes:

### 1. Text Match Score (0-100 points)

The algorithm evaluates all searchable fields for each entity and applies tiered scoring:

- **Exact match on primary field**: 100 points (e.g., project name matches query exactly)
- **Primary field starts with query**: 75 points
- **Primary field contains query**: 50 points
- **Any searchable field contains query**: 30 points (e.g., query matches industry but not name)

The "primary field" varies by entity type:
- Projects: Solution Name
- Customers: Name
- MAP Templates: Name
- Users: Full Name (or email if name is empty)

### 2. Owner/Assignment Boost (+25 points)
Items where the current user is:
- Primary or Specialist Engineer (Projects)
- Account Representative or Account Engineer (Customers)
- Creator (MAP Templates)

### 3. Recency Boost (0-20 points)
Based on `updatedAt` timestamp:
- **< 1 day**: +20 points
- **< 7 days**: +15 points
- **< 30 days**: +10 points
- **< 90 days**: +5 points

Results are sorted by descending score.

## UI/UX Features

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` / `Cmd+K` | Open search popup |
| `↑` / `↓` | Navigate results |
| `Enter` | Select highlighted result |
| `Escape` | Close popup |

### Visual Indicators

- **Clock icon**: Recently accessed item (within 7 days)
- **Star icon**: User's own item (owner/assignee)
- **Color-coded type badges**:
  - Blue: Projects
  - Green: Customers
  - Purple: MAPs
  - Orange: Users
  - Gray: Documents
  - Indigo: Navigation Pages
  - Teal: Guide pages

### Accessibility

- Proper ARIA roles (`dialog`, `listbox`, `option`)
- `aria-expanded` and `aria-controls` on trigger button
- Focus management (auto-focus input, focus trap)
- Keyboard-navigable results
- Screen reader announcements

## Performance Optimizations

### Client-Side Caching

Results are cached in memory for 5 minutes:
```typescript
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
```

### Debouncing

Search requests are debounced by 300ms to reduce API load:
```typescript
const DEBOUNCE_DELAY = 300;
```

### Result Limits

- Default limit: 20 results
- Maximum limit: 50 results
- Server fetches up to 100 entities per type for local filtering

## Internationalization

Global Search supports all 6 CriteriaIQ languages:
- English (en-US)
- German (de-DE)
- Spanish (es-ES)
- French (fr-FR)
- Italian (it-IT)
- Portuguese (pt-BR)

Translation keys are under `globalSearch.*` namespace.

## Future Enhancements

The system is designed to scale to advanced search backends:

1. **Meilisearch/OpenSearch integration**: The `searchGlobal()` API boundary allows swapping the backend without UI changes
2. **Document search**: Infrastructure for document content indexing
3. **Recent/Favorite items**: Pre-populate popup with frequently accessed entities
4. **Advanced search page**: Link to full-featured search with filters

## API Reference

### Request

```http
GET /api/search?q={query}&limit={limit}
Authorization: Session cookie required
```

**Parameters:**
- `q` (required): Search query string
- `limit` (optional): Maximum results (default: 20, max: 50)

### Response

```typescript
interface GlobalSearchResult {
  id: string | number;
  type: "project" | "customer" | "map" | "user" | "document";
  label: string;
  description?: string;
  url: string;
  score: number;
  isRecent?: boolean;
  isMyItem?: boolean;
}
```

**Example Response:**
```json
[
  {
    "id": 42,
    "type": "project",
    "label": "Data Classification POC",
    "description": "Acme Corp \u2022 In Progress",
    "url": "/projects/42",
    "score": 125,
    "isRecent": true,
    "isMyItem": true
  },
  {
    "id": 15,
    "type": "customer",
    "label": "Acme Corporation",
    "description": "Technology \u2022 North America",
    "url": "/customers?customer=15",
    "score": 75,
    "isRecent": false,
    "isMyItem": false
  }
]
```

### Error Response

```json
{
  "message": "Failed to perform search"
}
```

## Component Integration

To add Global Search to a page header, ensure the `Header` component from `@/components/header.tsx` is used. The `GlobalSearch` component is automatically included and will:

1. Check user role for visibility
2. Render the search button (or nothing for external roles)
3. Handle all search UI and navigation

No additional configuration is required per page.
