# Account & User Management System

## Overview

CriteriaIQ implements a comprehensive account and user management system designed for enterprise environments. This document covers the complete workflow for creating accounts and users, including validation rules, approval processes, and security measures.

## Account Management

### What is an Account?

An **Account** (formerly "Customer") represents an organization or company that your team is working with during technical validation. Each account can have multiple associated users (contacts, stakeholders) and projects.

### Account Creation

Accounts are created through the Account Portal interface:

1. Navigate to **Account Portal** from the sidebar
2. Click the **Create Account** button in the header
3. Fill in required account information:
   - **Account Name** (required)
   - **Industry** (optional)
   - **Region** (optional)
   - **Website** (optional)
   - Additional metadata fields

### Account Logo and Sales Account Assignment

- **Account Logo.** On a cloud storage provider (GCS, S3, Azure) the stored logo
  URL is a signed link that expires after an hour, so `GET /api/customers` and
  `GET /api/customers/:id` re-sign it on every read
  (`server/lib/customer-logo.ts`). A single project's fetch does the same for
  both its saved `customerLogo` copy and the account's live logo
  (`customerLogoLive`), so project pages don't show an expired logo either. If a saved logo still can't load (for example
  its file is gone), the Edit Account dialog shows a "Logo not found" placeholder
  instead of a broken image. **Remove Logo** followed by Update Account now clears
  the saved logo (`removeLogo=true`).
- **Sales Account Assignment** (formerly "Team Assignment") is the dialog section
  that sets the account's Sales representative and Sales Engineer.

### Account Requirements

| Field | Required | Description |
|-------|----------|-------------|
| Account Name | Yes | Organization/company name |
| Industry | No | Business industry classification |
| Region | No | Geographic region |
| Website | No | Company website URL |

### How projects link to their account

A project points at its account by id (`projects.customer_id`, migration 120),
so renaming an account never detaches its projects. `projects.customer_name`
stays as the display copy:

- **Create / edit a project:** storage sets `customer_id` from the chosen
  account name (`withResolvedCustomerId()` in `server/storage/_project-customer.ts`),
  matching ignoring case and surrounding spaces. Saving a project without
  changing its account leaves the link alone.
- **Rename an account:** `updateCustomer()` updates `customer_name` on its
  active and archived projects in the same transaction. Projects still linked
  only by the old name are adopted, unless another account has that name.
- **Joins** use `projectCustomerJoin`: by id, falling back to the name for the
  few rows the migration could not resolve (a name shared by two accounts,
  or one no account has).
- The id is a soft reference with no foreign key, because archiving an
  account removes its row and restore brings it back with the same id.

This is the first step of the CRM-linked accounts plan, where a linked
account's name comes from the CRM and changes there.

## User Management

### User Types & Roles

CriteriaIQ supports multiple user roles with different access levels:

| Role | Access Level | Description |
|------|--------------|-------------|
| Admin | Full | Complete system access, user management |
| Engineer | High | Solution Engineer with project access |
| Sales | Medium | Sales team member, limited admin |
| Customer | External | Customer contact, portal access only |
| Guest | External | Limited read-only access |
| Partner | External | Partner organization user |

### User Creation Workflow

Users are created through a 4-step wizard interface:

#### Step 1: Identity (Blue)
- First Name (required)
- Last Name (required)
- Email (required, validated)
- Password (required for new users)

#### Step 2: Organization (Purple)
- Account - depends on the role:
  - Customer and Guest: one customer account (required)
  - Partner: one or more customer accounts (required)
  - Every other role, Admin included, is internal staff with access to all
    accounts. The Account field offers your internal (company) account, or
    "No internal account"; when there is exactly one internal account it is
    picked by default. Staff whose email domain belongs to an internal account
    are linked to it automatically and the field is locked.
- Role (required)
- Title (required)
- Department (required)
- Region (required)
- Timezone (required)

#### Step 3: Specializations (Green)
- Solutions/Specialties (at least one required)
- Exclusive selection logic: "None" disables other options

#### Step 4: Permissions (Amber)
- Stakeholder Types (at least one required)
- Exclusive selection logic: "All" disables individual selections

### Who Can Change Users

User-management writes are checked on the server, not just hidden in the UI:

| Action | Who can do it |
|---|---|
| Create, edit or archive users (`POST /api/users`, `PUT /api/users/:userId`, `DELETE /api/users/:userId`) | Admins, and users with **edit** or **admin** on Configuration → User Management |
| Grant the Admin role, or edit / archive an Admin or protected account | Admins only |
| Change roles via `PUT /api/users/:userId/role`, or change section permissions (`/api/user-permissions/:userId`) | Admins only |
| Archive a protected account | Nobody |
| Update only a contact's stakeholder types (the project form) | Any internal user; not Customer, Guest or Partner |

`PUT /api/users/:userId` also ignores fields that aren't part of the edit form (password hash and history, MFA and SSO columns, `isProtected`, approval and login counters), so they can't be set through it. Users can't change their own account through `PUT /api/users/me`; only admins and user managers can.

### Who Can See Users

| List | What the caller gets |
|---|---|
| `GET /api/users` | Admins, users with **view** or higher on Configuration → User Management, and every internal role get every user. Customer, Guest and Partner users get internal staff plus the external users who share one of their accounts (home account, linked Partner accounts, or an account's contact list). |
| `GET /api/user-permissions` | Admins and User Management viewers get every row. Everyone else gets only their own rows. |
| `GET /api/user-permissions/:userId` | Your own rows, or anyone's if you are an Admin or User Management viewer. Otherwise 403. |

Neither list includes password hashes, MFA secrets, reset tokens or Salesforce tokens. The permission rows carry only the owner's id, name, email, role and active flag.

## Email Domain Restrictions

### Blocked Domains

To ensure users register with legitimate business email addresses, the following personal and disposable email domains are **blocked**:

| Domain | Type | Reason |
|--------|------|--------|
| gmail.com | Personal | Consumer email provider |
| outlook.com | Personal | Consumer email provider |
| yahoo.com | Personal | Consumer email provider |
| hotmail.com | Personal | Consumer email provider |
| icloud.com | Personal | Consumer email provider |
| aol.com | Personal | Consumer email provider |
| protonmail.com | Personal | Consumer email provider |
| mailinator.com | Disposable | Temporary email service |
| 10minutemail.com | Disposable | Temporary email service |
| guerrillamail.com | Disposable | Temporary email service |
| temp-mail.org | Disposable | Temporary email service |
| yopmail.com | Disposable | Temporary email service |

### Validation Behavior

- Validation occurs on both frontend (CreateUserDialog) and backend (API endpoints)
- Error message displayed: "Company Emails Only! Personal and disposable email domains are not allowed."
- This applies to both user creation and user updates

### Email Format Validation

In addition to domain blocking, all emails must:
- Match valid email format pattern
- Be unique within the system (no duplicate emails)

## Automated Approval Logic (Defense in Depth)

CriteriaIQ implements a 4-step validation hierarchy for new user registration, providing multiple layers of security:

### Validation Hierarchy

| Step | Check | Outcome if Matched |
|------|-------|-------------------|
| 1 | Block List | Reject with error (personal/disposable domains) |
| 2 | Domain Allow List | Auto-approve if domain is whitelisted |
| 3 | Access Code | Auto-approve if valid code provided |
| 4 | Manual Approval | User created with `isApproved: false` |

### Step 1: Block List (Reject)
Personal and disposable email domains are immediately rejected (see Email Domain Restrictions above).

### Step 2: Domain Allow List (Auto-Approve)
Administrators can configure allowed email domains. Users registering with a whitelisted domain are automatically approved.

### Step 3: Access Code (Auto-Approve)
Users can provide an access code during registration. Valid codes automatically approve the user and track usage.

### Step 4: Manual Approval (Pending)
Users who don't match allow list or access code are created with pending approval status.

## Login Management (Admin Only)

The Login Management section provides administrators with tools to configure automated approval settings.

### Accessing Login Management

1. Navigate to **Projects Workspace** from sidebar
2. Click **Accounts** section
3. Select **Login Management** (Admin role required)

### Internal Accounts & Domain-Scoped Registration (v0.7.40)

This release adds a lightweight account type and ties registration to an account's
email domains. Key concepts:

- **Internal (login-only) accounts.** In Account Directory → Create Account, an
  admin-only **Internal** checkbox creates a minimal account that requires only a
  name (all other sections are skipped). Internal accounts are **segregated**:
  `GET /api/customers` excludes them by default (`scope=external`), so they never
  appear in project/POC selectors or dashboards. The Account Directory opts in with
  `scope=all` (showing an "Internal" badge); Login Management dropdowns use
  `scope=internal`. Backed by `customers.is_internal` (mirrored to
  `archived_customers`).

- **Internal account is Admin-only.** Beyond Account Management edit, only an
  Admin may mark or unmark an account as internal (on create or edit), deactivate
  the internal account, change its approved email domains, or archive it. The
  server refuses these with 403 (`internalAccountChangeRefusal` in
  `server/lib/internal-access.ts`); the Account Directory hides Delete Account on
  the internal account for everyone else. It also hides the Evaluation Requests
  and Infrastructure Discovery actions on internal accounts for everyone, since
  the company's own account has neither.

- **Staff on the internal account.** `users.account_id` for internal staff may
  only point at an internal account (`server/lib/user-account-assignment.ts`); an
  outside user (Customer, Guest, Partner) can never point at one. A staff user
  whose email domain is linked to an internal account is always linked to it, the
  same rule SSO sign-in applies. The Users table's Account column shows the
  internal account for both.

- **Approved Email Domains per account.** The Account form has an **Approved Email
  Domains** chips field. These are stored as `allowed_domains` rows linked to the
  account (`account_id`) — the **same table** the Domain Allow List uses, so the two
  are one source of truth. Routes: `GET /api/customers/:id/approved-domains` and
  `PUT …/approved-domains/sync` (non-destructive reconcile; new domains default to
  auto-approve OFF; a domain already owned by another account is reported as a
  conflict since `domain` is globally unique).

- **Account-first Add Domain.** The Login Management → Add Domain dialog selects the
  **account first**, then lets you check which of that account's domains to allow
  (and free-type new ones). Submits via `POST /api/admin/allowed-domains/bulk`
  (create-or-relink, sets auto-approve, optional login-code). The Domain Allow List
  table shows an **"All Domains"** badge when every one of an account's domains is
  auto-approved.

- **Per-code domain targeting.** An access code can target **one, several, or all**
  of its account's domains (`access_codes.domains text[]`; null/empty = all). The
  Generate/Edit Code dialogs show the account's domains as checkboxes.

- **Signup domain validation.** When registering with a code: the account must have
  ≥1 approved domain (else blocked), and the email's domain must match — the code's
  specific domains if set, otherwise any of the account's domains. Registration also
  honors domain auto-approve, persists the bcrypt-hashed password and timezone, and
  records access-code usage.

### Domain Allow List Tab

Manage whitelisted email domains that receive automatic approval:

| Feature | Description |
|---------|-------------|
| Add Domain | Enter domain (e.g., "acme.com") to whitelist |
| Delete Domain | Remove domain from allow list |
| Retroactive Approval | When adding a domain, pending users with that domain are automatically approved |
| Usage Display | Shows count of users registered with each domain |

### Access Codes Tab

Manage invite codes for controlled user registration:

| Feature | Description |
|---------|-------------|
| Generate Code | Creates new code with optional prefix and random alphanumeric pattern |
| Code Format | Prefix (optional) + 8-character random string (e.g., "ACME-A7B3C9D2") |
| Account Linking | Each code is linked to a specific account |
| Max Uses | Set maximum number of times a code can be used |
| Expiration | Optional expiration date for time-limited access |
| Usage Tracking | View how many times each code has been used |
| Delete Code | Remove code (existing users created with code are unaffected) |

### Access Code Fields

| Field | Required | Description |
|-------|----------|-------------|
| Account | Yes | Account users will be linked to |
| Prefix | No | Custom prefix (e.g., company initials) |
| Max Uses | Yes | Maximum redemptions allowed |
| Expires At | No | Optional expiration date/time |

## User Approval Process

### How Approval Works

1. **New User Registration**: User is validated through 4-step hierarchy
2. **Auto-Approval**: If domain is whitelisted or valid access code provided, user is approved automatically
3. **Manual Pending**: Otherwise, account is set to `isApproved: false`
4. **Login Blocked**: Users with `isApproved: false` cannot log in
5. **Visual Indicator**: Unapproved users display with **red text** throughout the system
6. **Admin Approval**: An Admin or Engineer must approve the user from the User Account Approvals section
7. **Login Enabled**: Once approved (`isApproved: true`), the user can log in normally

### Approval UI Indicators

| State | Visual Indicator | Login Access |
|-------|------------------|--------------|
| Pending Approval | Red text, bold | Blocked |
| Approved | Normal text | Allowed |
| Inactive | Gray text | Blocked |

### Where Approval Status Appears

The red text indicator for unapproved users appears in:
- Users Dashboard table
- User selection dropdowns (project forms)
- Account Portal team members list
- Configuration pages

### Approval Workflow Locations

Administrators can approve pending users from:
- **Dashboard > Users tab** - User Account Approvals section
- **Account Portal > Team tab** - Individual user management
- **Configuration > Users** - System-wide user management

## Required Fields Summary

### For User Creation

| Field | Required | Step |
|-------|----------|------|
| First Name | Yes | 1 - Identity |
| Last Name | Yes | 1 - Identity |
| Email | Yes | 1 - Identity |
| Password | Yes (create only) | 1 - Identity |
| Account | Yes | 2 - Organization |
| Role | Yes | 2 - Organization |
| Title | Yes | 2 - Organization |
| Department | Yes | 2 - Organization |
| Region | Yes | 2 - Organization |
| Timezone | Yes | 2 - Organization |
| Specialties | Yes (at least 1) | 3 - Specializations |
| Stakeholder Types | Yes (at least 1) | 4 - Permissions |

### For User Updates

- Password is optional (only Admin can update)
- All other required fields remain mandatory
- Email changes trigger domain validation

## Security Measures

### Password Requirements

When creating or updating passwords:
- Minimum 10 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

### Session Management

- Users must be approved before session creation
- Unapproved users receive `ACCOUNT_PENDING_APPROVAL` error code
- Sessions are cookie-based with CSRF protection

### Role-Based Access Control

- Different roles have different permissions
- Customer/Guest/Partner roles are filtered in approval workflows
- Admin/Engineer roles can manage user approvals

## Exceptions & Edge Cases

### Internal vs External Users

- **Internal Users** (every role except Customer, Guest and Partner, Admin included): access to all accounts; optionally linked to the internal account
- **External Users** (Customer, Guest, Partner): Limited to account-specific access

### Protected Users

- System may have protected users that cannot be deleted or have restricted editing
- Protected status is indicated by `isProtected: true` flag

### Account Association

- Customer, Guest and Partner users must be linked to a customer account (via `accountId`, or the Partner account list); internal staff may be linked to the internal account
- Personal email domains (gmail.com, outlook.com, …) are blocked for new addresses only: an existing user on one can still be edited as long as the email is unchanged
- The `accountId` field replaced the legacy `company` text field
- Users without an account cannot be created

## API Endpoints

### User Creation
```
POST /api/users
```
- Validates email format and domain (4-step hierarchy)
- Optional `accessCode` field for auto-approval
- Requires authentication
- Returns `isApproved` based on validation outcome

### User Update
```
PUT /api/users/:userId
```
- Validates email if changed
- Checks domain restrictions
- Preserves approval status unless explicitly changed

### User Approval
```
PUT /api/users/:userId
```
- Set `isApproved: true` to approve
- Only Admin/Engineer can approve users

### Pending Users List
```
GET /api/pending-users
```
- Returns all users where `isApproved === false`
- Filtered for Customer, Guest, Partner roles in UI

### Domain Allow List (Admin Only)
```
GET /api/admin/allowed-domains
```
- Returns all whitelisted domains with usage counts

```
POST /api/admin/allowed-domains
```
- Adds domain to allow list
- Retroactively approves pending users with matching domain

```
DELETE /api/admin/allowed-domains/:id
```
- Removes domain from allow list

### Access Codes (Admin Only)
```
GET /api/admin/access-codes
```
- Returns all access codes with usage tracking

```
POST /api/admin/access-codes
```
- Creates new access code with account linking

```
DELETE /api/admin/access-codes/:id
```
- Removes access code

## Database Schema

### Users Table Key Fields

| Column | Type | Description |
|--------|------|-------------|
| id | varchar | Unique user identifier |
| email | varchar | Unique email address |
| account_id | integer (FK) | Links to customers.id |
| is_approved | boolean | Approval status (default: false) |
| is_active | boolean | Active status |
| role | varchar | User role |
| first_name | varchar | First name |
| last_name | varchar | Last name |

### Allowed Domains Table

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| domain | varchar | Email domain (unique) |
| account_id | integer (FK) | Account this domain belongs to (an account's "approved domains") |
| auto_approve | boolean | Whether registrations from this domain are auto-approved |
| added_by | varchar (FK) | Admin who added domain |
| created_at | timestamp | When domain was added |

### Access Codes Table

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| code | varchar | Unique access code |
| account_id | integer (FK) | Account users will be linked to |
| assigned_role | varchar | Role granted to users who register with the code |
| max_uses | integer | Maximum redemptions allowed |
| uses_count | integer | Current redemption count |
| expires_at | timestamp | Optional expiration date |
| bypass_limits | boolean | When true, ignores max-uses + expiry (unlimited / never expires) |
| domains | text[] | Domains this code targets (null/empty = all of the account's domains) |
| created_by | varchar (FK) | Admin who created code |
| created_at | timestamp | When code was created |

### Customers Table — Internal flag

| Column | Type | Description |
|--------|------|-------------|
| is_internal | boolean | Marks a login-only internal account; excluded from default customer lists |

### Access Code Usage Table

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| access_code_id | integer (FK) | Links to access_codes.id |
| user_id | varchar (FK) | User who redeemed code |
| used_at | timestamp | When code was redeemed |

## Related Documentation

- [MFA System Documentation](../guides/mfa-system.md) - Multi-factor authentication
- [Email Automation System](./email-triggers-reference.md) - Email notifications for user events
- [Design Document](../architecture/design-document.md) - UI/UX decisions and recent updates

## When a user's access changes

A signed-in user's access follows their account as it is now, not as it was at sign-in:

- **Every request re-checks the account.** `isAuthenticated` re-reads the user's active flag, approval and role, cached for 30 seconds per server (`server/auth/session-revocation.ts`). A deactivated, unapproved or archived user is signed out on their next request (401 `SESSION_REVOKED`). A role change applies to their session without a new sign-in.
- **Admin changes end stored sessions right away.** Deactivating, archiving, changing a role, or an admin password reset deletes the user's sessions from the `sessions` table, so every server sees it. Deactivating or archiving also revokes the API keys that user created. A password reset by email signs out every session; a self-service password change keeps only the current one. Each of these writes a `sessions_revoked` row to Login History.
- **Deactivated accounts can't sign in** with a password (403 `ACCOUNT_DEACTIVATED`); the SSO callback already refused them.
- **MFA is required for every role**, outside users included, unless the user signs in through an SSO provider whose MFA the admin trusts. In production the API answers 403 `MFA_SETUP_REQUIRED` to a user who hasn't enrolled, except on the enrollment, status and sign-out routes (`server/auth/mfa-enforcement.ts`).
