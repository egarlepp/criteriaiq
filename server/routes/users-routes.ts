// Users + User Permissions + Password routes (Phase 8 extraction #11n).
//
// Final admin-routes slice — the heaviest one. 16 handlers covering
// the full /api/users surface plus the user-permissions admin
// endpoints and the password-reset auth flow:
//
//   User CRUD + bulk:
//     GET    /api/users
//     GET    /api/users/by-roles
//     GET    /api/users/duplicate-cleanup-notice
//     POST   /api/users/duplicate-cleanup-notice/dismiss
//     POST   /api/users
//     POST   /api/users/import
//     PUT    /api/users/:userId
//     PUT    /api/users/:userId/role
//     PUT    /api/users/:userId/password
//     DELETE /api/users/:userId
//
//   User permissions admin:
//     GET    /api/user-permissions
//     GET    /api/user-permissions/:userId
//     POST   /api/user-permissions/:userId
//     PUT    /api/user-permissions/:userId
//
//   Password-reset flow (public):
//     POST   /api/auth/request-password-reset
//     POST   /api/auth/reset-password
//
// Notes:
//   - Partner users carry a multi-account selection that lives in a
//     junction table; the list endpoint enriches each Partner with
//     `selectedAccountIds`.
//   - Password persistence routes share a single password-history
//     guard (getPasswordHistorySize / isPasswordInHistory /
//     buildNextPasswordHistory from auth/simpleAuth) that prevents
//     reuse of the last N passwords.
//   - Uses bcrypt for hashing and crypto.randomBytes for reset-token
//     generation.
import { PERSONAL_EMAIL_DOMAINS } from "../lib/personal-email-domains";
import { CRM_CONTACT_FIELDS } from "@shared/crm-contact-fields";
import type { Express } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { eq, and, or, desc, sql } from "drizzle-orm";
import { storage } from "../storage";
import { db } from "../db";
import { users, isAllowedLoginMethod, ALLOWED_LOGIN_METHODS } from "@shared/schema";
import { permissionRowsForUser, userCanEditSection, userCanViewSection } from "../lib/section-permissions";
import { toPageValues, validatePermissionPayload } from "@shared/permissions";
import { EXTERNAL_ROLES, isExternalRole, isInternalAccount } from "../lib/internal-access";
import { parseRequestedAccountId, resolveAccountAssignment } from "../lib/user-account-assignment";
import { revokeUserAccess, type RevocationReason } from "../auth/session-revocation";
import {
  insertUserSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
} from "@shared/schema";
import {
  isAuthenticated,
  getPasswordHistorySize,
  isPasswordInHistory,
  buildNextPasswordHistory,
} from "../auth/simpleAuth";
import {
  sendPasswordResetEmail,
  sendWelcomeEmail,
} from "../email/email";
import {
  adminErrorFallback,
  validateAdminPasswordField,
  PASSWORD_RECENTLY_USED_ERROR_CODE,
} from "@shared/admin-validation";

// Validates an optional `allowedLoginMethods` field on the user CRUD
// routes. Only admins may set it, and only to one of the known values.
// Returns null when the input is absent or acceptable.
function checkAllowedLoginMethodsInput(
  value: unknown,
  actorRole: string | undefined,
): { status: number; message: string } | null {
  if (value === undefined) return null;
  if (actorRole !== "Admin") {
    return { status: 403, message: "Only administrators can change allowed login methods" };
  }
  if (!isAllowedLoginMethod(value)) {
    return { status: 400, message: `allowedLoginMethods must be one of: ${ALLOWED_LOGIN_METHODS.join(", ")}` };
  }
  return null;
}

// ── Authorization for user-management writes ──────────────────────────────
// Before this, every write below only required a signed-in session, so any
// user (a Customer included) could change any account's role, permissions or
// status, archive users, or create accounts. Rules now:
//   - Writes need the Admin role or "edit"/"admin" on the
//     Configuration → User Management section.
//   - Only an Admin can grant the Admin role, edit or archive an Admin or
//     protected account, change roles via the dedicated route, or change
//     section permissions (otherwise a user manager could grant
//     themselves anything).
//   - Protected accounts can never be archived.
//   - The one non-manager write is the project form's stakeholder-type
//     update, allowed for internal (non-customer-facing) roles.
const USER_MANAGEMENT_SECTION = "config.user-management";

// Fields an admin or user manager may set through PUT /api/users/:userId.
// Anything else (password hash and history, MFA and SSO columns,
// isProtected, isApproved, login counters, tokens, ids) is dropped so it
// can't be mass-assigned. `newPassword` / `password` are handled by the
// admin-only password block below.
const EDITABLE_USER_FIELDS = new Set([
  "firstName", "lastName", "email", "accountId", "allAccountsAccess",
  "selectedAccountIds", "company", "title", "region", "role", "department",
  "managerId", "stakeholderTypes", "solutions", "specialties", "timezone",
  "isActive", "receiveEmails", "skipWelcomeEmail", "forcePasswordChange",
  "allowedLoginMethods", "newPassword", "password",
]);

function isAdminActor(req: any): boolean {
  return req.session.user?.role === "Admin";
}

async function canManageUsers(req: any): Promise<boolean> {
  return userCanEditSection(req, USER_MANAGEMENT_SECTION);
}

// ── Read scoping for the user and permission lists ─────────────────────────
// Admins and anyone who can view Configuration → User Management see every
// user and every permission row. Other users see only their own permission
// rows. Customer, Guest and Partner users see internal staff plus the
// external users who share one of their accounts, so one customer can't
// list another customer's people.
async function canReadUserDirectory(req: any): Promise<boolean> {
  return userCanViewSection(req, USER_MANAGEMENT_SECTION);
}

type ListedUser = { id: string; role?: string | null; accountId?: number | null; selectedAccountIds?: number[] };

async function scopeUsersForExternalViewer<T extends ListedUser>(actorId: string, list: T[]): Promise<T[]> {
  const contactAccounts = new Map<string, number[]>();
  for (const customer of await storage.getAllCustomersIncludingInactive()) {
    if (!Array.isArray(customer.contactUsers)) continue;
    for (const contact of customer.contactUsers as Array<{ userId?: string }>) {
      if (!contact?.userId) continue;
      const ids = contactAccounts.get(contact.userId) ?? [];
      ids.push(customer.id);
      contactAccounts.set(contact.userId, ids);
    }
  }
  const accountsOf = (u: ListedUser): number[] => [
    ...(u.accountId != null ? [u.accountId] : []),
    ...(u.selectedAccountIds ?? []),
    ...(contactAccounts.get(u.id) ?? []),
  ];

  const actor = list.find((u) => u.id === actorId);
  const actorAccounts = new Set<number>([
    ...(actor ? accountsOf(actor) : []),
    ...(await storage.getUserAccounts(actorId)),
  ]);

  return list.filter((u) =>
    u.id === actorId ||
    !EXTERNAL_ROLES.has(u.role ?? "") ||
    accountsOf(u).some((accountId) => actorAccounts.has(accountId)),
  );
}

function forbidden(res: any, message: string) {
  return res.status(403).json({ message });
}

// Ends the target's sessions after an admin change (P0-2). The acting
// admin keeps their own session when they change their own account.
function endSessionsFor(
  req: any,
  userId: string,
  reason: RevocationReason,
  target?: { email?: string | null; firstName?: string | null; lastName?: string | null },
) {
  const actor = req.session?.user;
  return revokeUserAccess(userId, {
    reason,
    actor,
    exceptSid: actor?.id === userId ? req.sessionID : undefined,
    target,
    ipAddress: req.ip,
    userAgent: req.get?.("user-agent"),
  });
}

export function registerUsersRoutes(app: Express) {
  // User Permission routes
  app.get("/api/users", isAuthenticated, async (req, res) => {
    try {
      // Use the safe projection — drops password hash, TOTP secret,
      // Salesforce tokens, reset token, and password history before
      // anything leaves the DB. Many lower-privilege UI flows
      // (assignee dropdowns, contact pickers, customer portal team
      // tabs) legitimately need to list users, so we project the
      // sensitive columns out at the storage layer rather than
      // admin-gating the route. See the architect security review
      // and `getAllUsersSafe()` in server/storage/users.ts.
      const users = await storage.getAllUsersSafe();

      // Enrich Partner users with their selectedAccountIds from junction table
      const multiAccountRoles = ['Partner'];
      const enrichedUsers = await Promise.all(users.map(async (user) => {
        if (user.role && multiAccountRoles.includes(user.role)) {
          const accountIds = await storage.getUserAccounts(user.id);
          return { ...user, selectedAccountIds: accountIds };
        }
        return { ...user, selectedAccountIds: [] };
      }));

      const actor = (req as any).session.user;
      if (EXTERNAL_ROLES.has(actor?.role) && !(await canReadUserDirectory(req))) {
        return res.json(await scopeUsersForExternalViewer(actor.id, enrichedUsers));
      }

      res.json(enrichedUsers);
    } catch (error: any) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Get users by roles (for announcement targeting)
  app.get("/api/users/by-roles", isAuthenticated, async (req: any, res) => {
    try {
      // Only allow Admins
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Only administrators can fetch users by role" });
      }

      const roles = req.query.roles;
      if (!roles) {
        return res.json([]);
      }

      // Handle both single role and array of roles
      const roleList = Array.isArray(roles) ? roles : [roles];

      const allUsers = await storage.getAllUsers();
      const filteredUsers = allUsers
        .filter((user: any) => 
          user.isActive && 
          user.isApproved && 
          roleList.includes(user.role)
        )
        .map((user: any) => ({
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
        }));

      res.json(filteredUsers);
    } catch (error: any) {
      console.error("Error fetching users by roles:", error);
      res.status(500).json({ message: "Failed to fetch users by roles" });
    }
  });

  // Admin-only surface listing users that migration 035 deactivated
  // as case-variant duplicates (email matches `+dup<id>+<8hex>@`),
  // paired with their surviving counterpart.
  app.get(
    "/api/users/duplicate-cleanup-notice",
    isAuthenticated,
    async (req: any, res) => {
      try {
        if (req.session.user.role !== "Admin") {
          return res
            .status(403)
            .json({ message: "Only administrators can view the duplicate cleanup notice" });
        }

        const { reconstructOriginalEmail, isNoticeDismissed } = await import(
          "../lib/duplicate-cleanup-notice"
        );

        const losers = await db
          .select({
            id: users.id,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
            isActive: users.isActive,
            updatedAt: users.updatedAt,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(
            and(
              eq(users.isActive, false),
              sql`${users.email} ~ '\\+dup[0-9]+\\+[0-9a-f]{8}@'`,
            ),
          )
          .orderBy(desc(users.updatedAt));

        const reconstructed = losers
          .map((loser) => ({
            loser,
            originalEmail: reconstructOriginalEmail(loser.email),
          }))
          .filter((r): r is { loser: typeof losers[number]; originalEmail: string } =>
            r.originalEmail !== null,
          );

        let survivors: Array<{
          id: string;
          email: string | null;
          firstName: string | null;
          lastName: string | null;
          isActive: boolean | null;
        }> = [];
        if (reconstructed.length > 0) {
          const candidates = Array.from(
            new Set(reconstructed.map((r) => r.originalEmail.toLowerCase())),
          );
          survivors = await db
            .select({
              id: users.id,
              email: users.email,
              firstName: users.firstName,
              lastName: users.lastName,
              isActive: users.isActive,
            })
            .from(users)
            .where(
              and(
                sql`LOWER(${users.email}) = ANY(${candidates})`,
                eq(users.isActive, true),
              ),
            );
        }
        const survivorByLower = new Map<string, (typeof survivors)[number]>();
        for (const s of survivors) {
          if (s.email) {
            const key = s.email.toLowerCase();
            const existing = survivorByLower.get(key);
            if (!existing || s.id < existing.id) {
              survivorByLower.set(key, s);
            }
          }
        }

        const duplicates = reconstructed.map(({ loser, originalEmail }) => ({
          loser: {
            id: loser.id,
            email: loser.email,
            firstName: loser.firstName,
            lastName: loser.lastName,
            isActive: loser.isActive,
            deactivatedAt: loser.updatedAt,
          },
          originalEmail,
          surviving: survivorByLower.get(originalEmail.toLowerCase()) ?? null,
        }));

        const me = await storage.getUser(req.session.user.id);
        const dismissedAt = me?.dupCleanupNoticeDismissedAt ?? null;
        const dismissed = isNoticeDismissed(
          dismissedAt,
          duplicates.map((d) => d.loser.deactivatedAt ?? null),
        );

        res.json({
          dismissed,
          dismissedAt,
          duplicates,
        });
      } catch (error: any) {
        console.error("Error fetching duplicate cleanup notice:", error);
        res
          .status(500)
          .json({ message: "Failed to fetch duplicate cleanup notice" });
      }
    },
  );

  app.post(
    "/api/users/duplicate-cleanup-notice/dismiss",
    isAuthenticated,
    async (req: any, res) => {
      try {
        if (req.session.user.role !== "Admin") {
          return res
            .status(403)
            .json({ message: "Only administrators can dismiss the duplicate cleanup notice" });
        }
        const now = new Date();
        await db
          .update(users)
          .set({ dupCleanupNoticeDismissedAt: now, updatedAt: now })
          .where(eq(users.id, req.session.user.id));
        res.json({ ok: true, dismissedAt: now.toISOString() });
      } catch (error: any) {
        console.error("Error dismissing duplicate cleanup notice:", error);
        res
          .status(500)
          .json({ message: "Failed to dismiss duplicate cleanup notice" });
      }
    },
  );

  app.post("/api/users", isAuthenticated, async (req: any, res) => {
    try {
      const { firstName, lastName, email, accountId, allAccountsAccess, selectedAccountIds, title, region, role = 'Engineer', department, managerId, stakeholderTypes, solutions, specialties, password, accessCode } = req.body;

      if (!(await canManageUsers(req))) {
        return forbidden(res, "You don't have permission to create users");
      }
      if (role === 'Admin' && !isAdminActor(req)) {
        return forbidden(res, "Only administrators can create Admin users");
      }

      // Validation
      if (!firstName || !email) {
        return res.status(400).json({ message: "First name and email are required" });
      }

      // Per-user sign-in policy (migration 075) is an admin governance
      // setting; omitted means the column default (okta_password).
      const loginMethodError = checkAllowedLoginMethodsInput(req.body.allowedLoginMethods, req.session.user.role);
      if (loginMethodError) {
        return res.status(loginMethodError.status).json({ message: loginMethodError.message });
      }
      
      // Role-based account validation
      const multiAccountRoles = ['Partner'];
      
      if (!isExternalRole(role)) {
        // Internal staff (every role but Customer, Guest, Partner) get "All
        // Accounts" access; an internal account is optional.
      } else if (multiAccountRoles.includes(role)) {
        // Partner requires at least one account selected
        if (!selectedAccountIds || selectedAccountIds.length === 0) {
          return res.status(400).json({ message: "At least one account must be selected for Partner role" });
        }
      } else {
        // Customer and Guest require a single account
        if (!accountId) {
          return res.status(400).json({ message: "Account is required" });
        }
      }

      // Email validation (length cap prevents ReDoS on the regex)
      if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: "Invalid email format" });
      }
      
      // =============================================================================
      // DEFENSE IN DEPTH - 4-STEP VALIDATION HIERARCHY
      // =============================================================================
      
      // STEP 1: Block List - Reject personal/disposable email domains
      const blockedDomains = PERSONAL_EMAIL_DOMAINS;
      const emailDomain = email.toLowerCase().split('@')[1];
      if (blockedDomains.includes(emailDomain)) {
        return res.status(400).json({ message: "Company Emails Only! Personal and disposable email domains are not allowed." });
      }

      // Check if user already exists by email
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({ message: "User with this email already exists" });
      }

      // STEP 2: Allow List - Check if domain is in allowed domains (auto-approve)
      let isAutoApproved = false;
      let approvalReason = '';
      let finalAccountId = accountId;
      
      const isDomainAllowed = await storage.checkDomainAllowed(emailDomain);
      if (isDomainAllowed) {
        isAutoApproved = true;
        approvalReason = `Email domain "${emailDomain}" is on the approved allow list`;
      }
      
      // STEP 3: Invite Code - Validate and use access code (auto-approve)
      if (!isAutoApproved && accessCode && accessCode.trim()) {
        // Generate a temporary user ID for tracking
        const tempUserId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const codeValidation = await storage.validateAndUseAccessCode(
          accessCode.trim(), 
          tempUserId, 
          email
        );
        
        if (codeValidation.valid) {
          isAutoApproved = true;
          approvalReason = `Valid access code "${accessCode}" used`;
          
          // If access code is linked to an account, use that account
          if (codeValidation.accountId) {
            finalAccountId = codeValidation.accountId;
          }
        } else {
          // Invalid access code - return error
          return res.status(400).json({ 
            message: codeValidation.error || "Invalid access code",
            field: 'accessCode'
          });
        }
      }
      
      // STEP 4: Default - Manual approval required (isApproved = false by default in schema)
      // If not auto-approved, user will have isApproved = false

      // Generate unique ID for the user (timestamp + random)
      const uniqueId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Hash password if provided (admin functionality)
      let hashedPassword = undefined;
      if (password && req.session.user.role === 'Admin') {
        // Validate against the shared admin password rules so an admin
        // cannot create a user with a password the public sign-up or
        // bootstrap-admin endpoints would reject.
        const passwordError = validateAdminPasswordField(password);
        if (passwordError) {
          return res.status(400).json({ message: adminErrorFallback(passwordError) });
        }
        hashedPassword = await bcrypt.hash(password, 10);
      }

      // Determine account assignment based on role and email domain. An
      // email whose domain is linked to an internal account (Domain Allow
      // List -> account flagged is_internal) is internal staff: no single
      // account and access to all accounts.
      const internalAccount = await storage.getInternalAccountForEmailDomain(email.toLowerCase().trim().split('@')[1] ?? '');
      const requestedAccountId = parseRequestedAccountId(finalAccountId);
      const requestedAccount = requestedAccountId != null ? await storage.getCustomer(requestedAccountId) : undefined;
      const assignment = resolveAccountAssignment({
        role,
        requestedAccountId,
        requestedAccountIsInternal: requestedAccount ? isInternalAccount(requestedAccount) : undefined,
        domainInternalAccountId: internalAccount?.id ?? null,
      });
      if (!assignment.ok) {
        return res.status(400).json({ message: assignment.message });
      }
      const userAccountId = assignment.staff ? assignment.accountId :
                           multiAccountRoles.includes(role) ? null :
                           requestedAccountId ?? null;
      const userAllAccountsAccess = assignment.staff;
      
      // Create new user using createUser method
      const userData = {
        id: uniqueId,
        email,
        firstName,
        lastName,
        accountId: userAccountId,
        allAccountsAccess: userAllAccountsAccess,
        company: req.body.company || undefined,
        title,
        region,
        role,
        department,
        managerId: managerId || null,
        stakeholderTypes,
        specialties: solutions ?? specialties,
        password: hashedPassword,
        timezone: req.body.timezone || "America/New_York",
        isActive: req.body.isActive !== false, // default to true
        isApproved: isAutoApproved, // Auto-approve based on allow list or access code
        receiveEmails: req.body.receiveEmails !== false, // default to true
        skipWelcomeEmail: req.body.skipWelcomeEmail === true,
        forcePasswordChange: req.body.forcePasswordChange === true,
        createdBy: req.session.user.id, // Track who created this user
        ...(req.body.allowedLoginMethods !== undefined
          ? { allowedLoginMethods: req.body.allowedLoginMethods }
          : {}),
      };

      const newUser = await storage.createUser(userData);

      // A new user starts with their role's page permissions (Role
      // Management). An Admin can then change them in the same dialog, which
      // saves through PUT /api/user-permissions/:userId.
      try {
        const roleRow = await storage.getRoleByName(role);
        if (roleRow) {
          const defaults = toPageValues(await storage.getRolePermissions(roleRow.id));
          if (defaults.length > 0) await storage.setUserPermissions(newUser.id, defaults);
        }
      } catch (permissionError) {
        // The account exists; an Admin can still set its pages by hand.
        console.error("Failed to copy role permissions to new user:", permissionError);
      }

      // Save multi-account assignments for Partner role to junction table
      if (multiAccountRoles.includes(role) && selectedAccountIds && selectedAccountIds.length > 0) {
        await storage.setUserAccounts(newUser.id, selectedAccountIds, req.session.user.id);
      }
      
      // Log approval status
      if (isAutoApproved) {
        console.log(`[Defense in Depth] User ${email} auto-approved: ${approvalReason}`);
      } else {
        console.log(`[Defense in Depth] User ${email} requires manual approval`);
      }

      // Send welcome email if password was set and skipWelcomeEmail is not set
      if (hashedPassword && !newUser.skipWelcomeEmail) {
        try {
          await sendWelcomeEmail({
            email: newUser.email!,
            firstName: newUser.firstName!,
            lastName: newUser.lastName!,
            role: newUser.role!
          });
        } catch (emailError) {
          console.error("Failed to send welcome email:", emailError);
          // Continue even if email fails
        }
      }

      // Get user accounts for Partner role
      let userAccountsList: number[] = [];
      if (multiAccountRoles.includes(role) && selectedAccountIds) {
        userAccountsList = selectedAccountIds;
      }
      
      // Ensure all required fields are in the response for frontend usage
      const userResponse = {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        accountId: newUser.accountId,
        allAccountsAccess: newUser.allAccountsAccess,
        selectedAccountIds: userAccountsList,
        title: newUser.title,
        region: newUser.region,
        role: newUser.role,
        department: newUser.department,
        stakeholderTypes: newUser.stakeholderTypes,
        specialties: newUser.specialties,
        timezone: newUser.timezone,
        isActive: newUser.isActive,
        createdBy: newUser.createdBy,
        createdAt: newUser.createdAt,
        updatedAt: newUser.updatedAt,
      };

      console.log("Sending user response:", userResponse);
      res.status(201).json(userResponse);
    } catch (error: any) {
      console.error("Error creating user:", error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  // Bulk import users endpoint
  app.post("/api/users/import", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Only administrators can import users" });
      }

      const { users, skipWelcomeEmails, accessCodeId, emailTemplateId } = req.body;
      if (!users || !Array.isArray(users) || users.length === 0) {
        return res.status(400).json({ message: "No users provided for import" });
      }

      if (users.length > 200) {
        return res.status(400).json({ message: "Maximum 200 users can be imported at once" });
      }

      const defaultPassword = `CrIQ_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}!`;
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);

      // Resolve and validate access code if one was provided
      let accessCodeRecord: any = undefined;
      if (accessCodeId) {
        accessCodeRecord = await storage.getAccessCodeById(Number(accessCodeId));
        if (!accessCodeRecord || !accessCodeRecord.isActive) {
          return res.status(400).json({ message: "Selected access code is invalid or inactive" });
        }
      }

      const blockedDomains = PERSONAL_EMAIL_DOMAINS;

      const internalRoles = ['Admin', 'Manager', 'se', 'CX', 'Engineer', 'Support', 'Services', 'Sales', 'Product'];
      const results: { rowNumber: number; email: string; status: string; reason?: string }[] = [];
      let created = 0;
      let failed = 0;
      let skipped = 0;

      for (let i = 0; i < users.length; i++) {
        const userData = users[i];
        const email = userData.email?.trim().toLowerCase();
        const rowNumber = userData.rowNumber || i + 2;

        try {
          if (!email || !userData.firstName || !userData.lastName || !userData.role) {
            results.push({ rowNumber, email: email || "unknown", status: "failed", reason: "Missing required fields" });
            failed++;
            continue;
          }

          const emailDomain = email.split('@')[1];
          if (blockedDomains.includes(emailDomain)) {
            results.push({ rowNumber, email, status: "failed", reason: "Personal/disposable email domain not allowed" });
            failed++;
            continue;
          }

          const existingUser = await storage.getUserByEmail(email);
          if (existingUser) {
            results.push({ rowNumber, email, status: "skipped", reason: "Email already exists" });
            skipped++;
            continue;
          }

          const isInternalDomain = !!(await storage.getInternalAccountForEmailDomain(emailDomain));
          const isDomainAllowed = await storage.checkDomainAllowed(emailDomain);
          const isAutoApproved = isDomainAllowed || isInternalDomain;

          const uniqueId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          // Apply access code approval for users not on the domain allow list
          let isApproved = isAutoApproved;
          if (!isApproved && accessCodeRecord) {
            try {
              const useResult = await storage.validateAndUseAccessCode(
                accessCodeRecord.code,
                uniqueId,
                email
              );
              if (useResult.valid) {
                isApproved = true;
              }
            } catch (codeErr) {
              console.error(`[import] Failed to apply access code for ${email}:`, codeErr);
            }
          }

          const newUserData = {
            id: uniqueId,
            email,
            firstName: userData.firstName.trim(),
            lastName: userData.lastName.trim(),
            role: userData.role,
            title: userData.title?.trim() || "",
            department: userData.department?.trim() || "",
            region: userData.region?.trim() || "",
            timezone: userData.timezone || "America/New_York",
            password: hashedPassword,
            isActive: userData.isActive !== false,
            isApproved: isApproved,
            receiveEmails: userData.receiveEmails !== false,
            skipWelcomeEmail: skipWelcomeEmails === true,
            forcePasswordChange: true,
            stakeholderTypes: ["None"],
            specialties: ["None"],
            accountId: null,
            allAccountsAccess: isInternalDomain || internalRoles.includes(userData.role),
            createdBy: req.session.user.id,
          };

          await storage.createUser(newUserData);

          if (!skipWelcomeEmails) {
            try {
              await sendWelcomeEmail(
                {
                  email,
                  firstName: userData.firstName.trim(),
                  lastName: userData.lastName.trim(),
                  role: userData.role,
                },
                {
                  templateId: emailTemplateId ? Number(emailTemplateId) : undefined,
                  accessCode: accessCodeRecord?.code,
                }
              );
            } catch (emailError) {
              console.error(`Failed to send welcome email to ${email}:`, emailError);
            }
          }

          results.push({ rowNumber, email, status: "created" });
          created++;

          if (i < users.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        } catch (error: any) {
          console.error(`Error importing user ${email}:`, error);
          results.push({ rowNumber, email: email || "unknown", status: "failed", reason: error.message || "Unexpected error" });
          failed++;
        }
      }

      console.log(`[User Import] Complete: ${created} created, ${failed} failed, ${skipped} skipped by ${req.session.user.email}`);

      res.json({
        success: true,
        created,
        failed,
        skipped,
        defaultPassword,
        results,
      });
    } catch (error: any) {
      console.error("Error in bulk user import:", error);
      res.status(500).json({ message: "Failed to import users" });
    }
  });

  app.get("/api/user-permissions", isAuthenticated, async (req, res) => {
    try {
      const permissions = await storage.getAllUserPermissions();
      if (await canReadUserDirectory(req)) {
        return res.json(permissions);
      }
      const actorId = (req as any).session.user?.id;
      res.json(permissions.filter((p) => p.userId === actorId));
    } catch (error: any) {
      console.error("Error fetching user permissions:", error);
      res.status(500).json({ message: "Failed to fetch user permissions" });
    }
  });

  app.get("/api/user-permissions/:userId", isAuthenticated, async (req, res) => {
    try {
      if (req.params.userId !== (req as any).session.user?.id && !(await canReadUserDirectory(req))) {
        return forbidden(res, "You can only view your own permissions");
      }
      const permissions = await permissionRowsForUser(req.params.userId as string);
      res.json(permissions);
    } catch (error: any) {
      console.error("Error fetching user permissions:", error);
      res.status(500).json({ message: "Failed to fetch user permissions" });
    }
  });

  app.post("/api/user-permissions/:userId", isAuthenticated, async (req, res) => {
    try {
      if (!isAdminActor(req)) {
        return forbidden(res, "Only administrators can change user permissions");
      }
      const parsed = validatePermissionPayload(req.body?.permissions);
      if (!parsed.ok) return res.status(400).json({ message: parsed.error });
      await storage.setUserPermissions(req.params.userId as string, parsed.permissions);
      res.json({ message: "User permissions updated successfully" });
    } catch (error: any) {
      console.error("Error updating user permissions:", error);
      res.status(500).json({ message: "Failed to update user permissions" });
    }
  });

  app.put("/api/users/:userId/role", isAuthenticated, async (req, res) => {
    try {
      if (!isAdminActor(req)) {
        return forbidden(res, "Only administrators can change user roles");
      }
      const userId = req.params.userId as string;
      const before = await storage.getUser(userId);
      const user = await storage.updateUserRole(userId, req.body.role);
      if (before && user && before.role !== user.role) {
        await endSessionsFor(req, userId, "role_changed");
      }
      res.json(user);
    } catch (error: any) {
      console.error("Error updating user role:", error);
      res.status(500).json({ message: "Failed to update user role" });
    }
  });

  // Update user
  app.put('/api/users/:userId', isAuthenticated, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const body = req.body ?? {};
      const bodyKeys = Object.keys(body);

      // The project form updates a contact's stakeholder types; any
      // internal user may do that and nothing else without being a
      // user manager.
      const stakeholderTypesOnly =
        bodyKeys.length === 1 && bodyKeys[0] === "stakeholderTypes" && Array.isArray(body.stakeholderTypes);
      if (stakeholderTypesOnly) {
        if (EXTERNAL_ROLES.has(req.session.user.role)) {
          return forbidden(res, "You don't have permission to update this user");
        }
      } else if (!(await canManageUsers(req))) {
        return forbidden(res, "You don't have permission to update users");
      }

      const target = await storage.getUser(userId);
      if (!target) {
        return res.status(404).json({ message: "User not found" });
      }
      if (!isAdminActor(req) && !stakeholderTypesOnly) {
        if (target.role === 'Admin' || target.isProtected) {
          return forbidden(res, "Only administrators can edit administrator accounts");
        }
        if (body.role === 'Admin') {
          return forbidden(res, "Only administrators can grant the Admin role");
        }
      }

      const updates: Record<string, any> = {};
      for (const key of bodyKeys) {
        if (EDITABLE_USER_FIELDS.has(key)) updates[key] = body[key];
      }
      // A user imported from a CRM contact takes name and title from the
      // contact (server/crm/account-contacts.ts); a save keeps the stored ones.
      if (target.crmContactId) {
        for (const field of CRM_CONTACT_FIELDS) delete updates[field];
      }
      const deactivating = updates.isActive === false && target.isActive !== false;
      const roleChanging = typeof updates.role === "string" && updates.role !== target.role;
      let passwordReset = false;

      const loginMethodError = checkAllowedLoginMethodsInput(updates.allowedLoginMethods, req.session.user.role);
      if (loginMethodError) {
        return res.status(loginMethodError.status).json({ message: loginMethodError.message });
      }

      // Check for email uniqueness if email is being updated
      if (updates.email) {
        // Email validation (length cap prevents ReDoS on the regex)
        if (updates.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email)) {
          return res.status(400).json({ message: "Invalid email format" });
        }
        
        // Validate email domain - block personal/disposable domains
        const blockedDomains = PERSONAL_EMAIL_DOMAINS;
        // Only a new address is checked, so an existing user on a personal
        // domain can still be edited without changing their email.
        const emailDomain = updates.email.toLowerCase().split('@')[1];
        const emailUnchanged = updates.email.trim().toLowerCase() === (target.email ?? '').trim().toLowerCase();
        if (!emailUnchanged && blockedDomains.includes(emailDomain)) {
          return res.status(400).json({ message: "Company Emails Only! Personal and disposable email domains are not allowed." });
        }

        // Check if another user already has this email
        const existingUser = await storage.getUserByEmail(updates.email);
        if (existingUser && existingUser.id !== userId) {
          return res.status(409).json({ message: "User with this email already exists" });
        }
      }
      
      // Role-based account validation
      const multiAccountRoles = ['Partner'];
      const role = updates.role || target.role;
      
      // Internal staff: every role but Customer, Guest, Partner, or an email
      // domain linked to an internal account. Their accountId may only name
      // an internal account (see server/lib/user-account-assignment.ts).
      const userEmail = updates.email || target.email || '';
      const internalAccount = await storage.getInternalAccountForEmailDomain(userEmail.toLowerCase().trim().split('@')[1] ?? '');
      const requestedAccountId = parseRequestedAccountId(updates.accountId);
      const requestedAccount = requestedAccountId != null ? await storage.getCustomer(requestedAccountId) : undefined;
      const assignment = resolveAccountAssignment({
        role,
        requestedAccountId,
        requestedAccountIsInternal: requestedAccount ? isInternalAccount(requestedAccount) : undefined,
        domainInternalAccountId: internalAccount?.id ?? null,
      });
      if (!assignment.ok) {
        return res.status(400).json({ message: assignment.message });
      }
      
      if (assignment.staff) {
        updates.allAccountsAccess = true;
        delete updates.selectedAccountIds;
        // Domain-linked staff always point at their internal account. Other
        // staff keep their current account unless the form sent one.
        if (internalAccount || updates.accountId !== undefined || roleChanging) {
          updates.accountId = assignment.accountId;
        }
      } else {
        if (updates.allAccountsAccess !== undefined || updates.selectedAccountIds !== undefined) {
          if (multiAccountRoles.includes(role)) {
            if (updates.selectedAccountIds && updates.selectedAccountIds.length > 0) {
              await storage.setUserAccounts(userId, updates.selectedAccountIds, req.session.user.id);
            }
            updates.allAccountsAccess = false;
            updates.accountId = null;
            delete updates.selectedAccountIds;
          } else {
            updates.allAccountsAccess = false;
            if (updates.accountId !== undefined && !updates.accountId) {
              return res.status(400).json({ message: "Account is required" });
            }
          }
        } else if (updates.accountId !== undefined && !updates.accountId && !multiAccountRoles.includes(role)) {
          return res.status(400).json({ message: "Account is required" });
        }
      }

      // Defence in depth: some clients (and any future ones we don't
      // control) may post the rotated password under the bare
      // `password` field instead of `newPassword`. Treat it the same so
      // the strength/history/hashing pipeline below always fires —
      // without this normalisation, a raw plaintext value would fall
      // through to `storage.updateUser(userId, updates)` and be written
      // to the password column unhashed.
      if (
        typeof updates.password === 'string' &&
        updates.password.trim() &&
        !updates.newPassword
      ) {
        updates.newPassword = updates.password;
      }
      // Whether or not we promoted it above, never let a bare
      // `password` field reach storage — only the freshly-hashed value
      // computed in the admin block below should ever be written.
      delete updates.password;

      // Handle password update if provided and user is admin
      if (updates.newPassword && req.session.user.role === 'Admin') {
        // Validate against the shared admin password rules so an admin
        // editing another user cannot set a password the public sign-up or
        // bootstrap-admin endpoints would reject.
        const passwordError = validateAdminPasswordField(updates.newPassword);
        if (passwordError) {
          return res.status(400).json({ message: adminErrorFallback(passwordError) });
        }

        // Block cycling the teammate's password back to one of their
        // recently-used hashes. Mirrors the self-change route in
        // `/api/users/me/password` so an admin reset can't quietly bypass
        // the same policy. The error response carries a stable
        // `errorCode` + `historySize` so the dialog can surface a clear
        // inline message instead of a transient toast.
        const targetUser = await storage.getUser(userId);
        if (!targetUser) {
          return res.status(404).json({ message: "User not found" });
        }
        const historySize = getPasswordHistorySize();
        const reused = await isPasswordInHistory(
          updates.newPassword,
          targetUser.passwordHistory,
          historySize,
        );
        if (reused) {
          return res.status(400).json({
            message: `New password must not match any of the user's last ${historySize} passwords`,
            errorCode: PASSWORD_RECENTLY_USED_ERROR_CODE,
            historySize,
          });
        }

        const hashedPassword = await bcrypt.hash(updates.newPassword, 10);
        const nextHistory = buildNextPasswordHistory(
          targetUser.password,
          targetUser.passwordHistory,
          historySize,
        );
        // Use `updateUser` (not `updateUserPassword`) so the new hash and
        // the rotated history land in the same row update — keeping the
        // history column in lockstep with the active password.
        await storage.updateUser(userId, {
          password: hashedPassword,
          passwordHistory: nextHistory,
        });

        passwordReset = true;
        // Remove password from updates object to avoid updating it twice
        delete updates.newPassword;
      }

      // Handle timezone, isActive, and receiveEmails fields
      if (updates.timezone !== undefined) {
        await storage.updateUser(userId, { timezone: updates.timezone });
        delete updates.timezone;
      }

      if (updates.isActive !== undefined) {
        await storage.updateUser(userId, { isActive: updates.isActive });
        delete updates.isActive;
      }

      if (updates.receiveEmails !== undefined) {
        await storage.updateUser(userId, { receiveEmails: updates.receiveEmails });
        delete updates.receiveEmails;
      }

      // Handle solutions field mapping for backward compatibility
      if (updates.solutions !== undefined) {
        updates.specialties = updates.solutions;
        delete updates.solutions;
      }

      // Update user in storage
      const updatedUser = await storage.updateUser(userId, updates);
      const revocation: RevocationReason | null = deactivating
        ? "deactivated"
        : roleChanging
          ? "role_changed"
          : passwordReset
            ? "password_reset"
            : null;
      if (revocation) await endSessionsFor(req, userId, revocation);
      res.json(updatedUser);
    } catch (error: any) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // Delete user (archive instead)
  app.delete('/api/users/:userId', isAuthenticated, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const currentUserId = req.session.user.id;

      // Prevent deletion of the main admin user (the authenticated user)
      if (userId === currentUserId) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }

      if (!(await canManageUsers(req))) {
        return forbidden(res, "You don't have permission to archive users");
      }
      const target = await storage.getUser(userId);
      if (!target) {
        return res.status(404).json({ message: "User not found" });
      }
      if (target.isProtected) {
        return forbidden(res, "Protected accounts cannot be archived");
      }
      if (target.role === 'Admin' && !isAdminActor(req)) {
        return forbidden(res, "Only administrators can archive administrator accounts");
      }

      // Pull the operator-supplied reason (if any) from the request body so it
      // is persisted alongside the archived row. Falls back to the legacy
      // sentinel when no reason was provided to keep older clients working.
      const rawReason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
      const reason = rawReason.length > 0 ? rawReason : 'Archived via delete action';

      // Archive the user instead of deleting
      await storage.archiveUser(userId, currentUserId, reason);
      await endSessionsFor(req, userId, "archived", target);
      res.json({ message: "User archived successfully" });
    } catch (error: any) {
      console.error("Error archiving user:", error);
      res.status(500).json({ message: "Failed to archive user" });
    }
  });

  // Update user permissions
  app.put('/api/user-permissions/:userId', isAuthenticated, async (req, res) => {
    try {
      if (!isAdminActor(req)) {
        return forbidden(res, "Only administrators can change user permissions");
      }
      const { userId } = req.params;
      const parsed = validatePermissionPayload(req.body?.permissions);
      if (!parsed.ok) return res.status(400).json({ message: parsed.error });

      await storage.setUserPermissions(userId as string, parsed.permissions);
      res.json({ message: "Permissions updated successfully" });
    } catch (error: any) {
      console.error("Error updating user permissions:", error);
      res.status(500).json({ message: "Failed to update permissions" });
    }
  });

  // Password management routes
  // Update user password (Admin only)
  app.put('/api/users/:userId/password', isAuthenticated, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { newPassword } = req.body;

      // Check if the current user is an admin
      const currentUser = req.session.user;
      if (currentUser.role !== 'Admin') {
        return res.status(403).json({ message: "Only admins can reset user passwords" });
      }

      if (!newPassword) {
        return res.status(400).json({ message: "New password is required" });
      }

      // Validate against the shared admin password rules so an admin
      // resetting another user's password cannot set one the public
      // sign-up or bootstrap-admin endpoints would reject.
      const passwordError = validateAdminPasswordField(newPassword);
      if (passwordError) {
        return res.status(400).json({ message: adminErrorFallback(passwordError) });
      }

      // Block cycling the teammate's password back to one of their
      // recently-used hashes. Same policy as the self-change route in
      // `/api/users/me/password` and the inline path in
      // `PUT /api/users/:userId`. Returns a stable `errorCode` so the
      // dialog can render a localized inline message keyed off the
      // configured `historySize` instead of a generic toast.
      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      const historySize = getPasswordHistorySize();
      const reused = await isPasswordInHistory(
        newPassword,
        targetUser.passwordHistory,
        historySize,
      );
      if (reused) {
        return res.status(400).json({
          message: `New password must not match any of the user's last ${historySize} passwords`,
          errorCode: PASSWORD_RECENTLY_USED_ERROR_CODE,
          historySize,
        });
      }

      // Hash the new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Rotate history alongside the password update so the column stays
      // in sync with the active hash.
      const nextHistory = buildNextPasswordHistory(
        targetUser.password,
        targetUser.passwordHistory,
        historySize,
      );
      await storage.updateUser(userId, {
        password: hashedPassword,
        passwordHistory: nextHistory,
      });
      await endSessionsFor(req, userId, "password_reset");

      res.json({ message: "Password updated successfully" });
    } catch (error: any) {
      console.error("Error updating user password:", error);
      res.status(500).json({ message: "Failed to update password" });
    }
  });

  // Request password reset
  app.post('/api/auth/request-password-reset', async (req, res) => {
    try {
      // Trim BEFORE zod validation — the email-format regex on
      // `passwordResetRequestSchema` rejects leading/trailing
      // whitespace, so a request from a direct API caller that didn't
      // pre-trim would 400 even though the underlying address is
      // perfectly valid. The landing page already trims; this matches
      // it server-side as defense-in-depth (Task #535).
      const rawEmail = typeof req.body?.email === 'string'
        ? req.body.email.trim()
        : req.body?.email;
      const validatedData = passwordResetRequestSchema.parse({
        ...(req.body ?? {}),
        email: rawEmail,
      });
      // Lowercase post-validation so the case-insensitive `LOWER(...)`
      // lookup in `getUserByEmail` matches regardless of how the
      // operator typed their address.
      const email = validatedData.email.toLowerCase();

      // Case-insensitive lookup (storage layer compares LOWER(email)).
      const user = await storage.getUserByEmail(email);
      if (!user) {
        // Don't reveal if email exists or not for security — the
        // client always gets the same generic 200. We DO surface the
        // miss in the server log under a sha256-truncated identifier
        // so an operator can match a support call to the right
        // request without ever logging the raw email (Task #535).
        const emailHash = crypto
          .createHash('sha256')
          .update(email)
          .digest('hex')
          .slice(0, 16);
        console.warn(
          `[request-password-reset] no user matched email hash=${emailHash}`,
        );
        return res.json({ message: "If an account with that email exists, a password reset link has been sent." });
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

      // Save reset token to database
      await storage.setPasswordResetToken(user.id, resetToken, resetTokenExpiry);

      // Send reset email — use the canonical email stored on the user
      // row so the recipient address matches the casing/format the
      // operator originally entered when the account was created
      // (avoids "to: ian@x.com" vs "Ian@x.com" mismatches in inbox
      // search and SMTP relay logs).
      const emailSent = await sendPasswordResetEmail(user.email, resetToken);

      if (!emailSent) {
        console.error("Failed to send password reset email to user id:", user.id);
        return res.status(500).json({ message: "Failed to send password reset email. Please try again later." });
      }

      res.json({ message: "If an account with that email exists, a password reset link has been sent." });
    } catch (error: any) {
      console.error("Error requesting password reset:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: error.issues[0].message });
      }
      res.status(500).json({ message: "Failed to process password reset request" });
    }
  });

  // Reset password with token
  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      // Trim before zod validation so a token URL-pasted with stray
      // whitespace and a password copied with a trailing newline both
      // pass the same validation gate as a clean submission. The
      // landing-page reset form already trims on the client (Task
      // #535) — this is the matching defense for direct API callers.
      const rawToken = typeof req.body?.token === 'string' ? req.body.token.trim() : req.body?.token;
      const rawNewPassword = typeof req.body?.newPassword === 'string'
        ? req.body.newPassword.trim()
        : req.body?.newPassword;
      const validatedData = passwordResetSchema.parse({
        token: rawToken,
        newPassword: rawNewPassword,
      });
      const { token, newPassword } = validatedData;

      // sha256-truncated identifier used for log correlation only —
      // never the raw token, which would let anyone with log access
      // reset the matching account.
      const tokenHash = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex')
        .slice(0, 16);

      // Find user by reset token (also checks expiry).
      const user = await storage.getUserByResetToken(token);
      if (!user) {
        // The user-facing error stays a generic 400 (no oracle for
        // attackers), but the server log distinguishes "token never
        // existed" from "token existed but is past its 1h TTL" so an
        // operator can immediately tell which side of the flow broke
        // when a real user calls in. Without this split, every broken
        // reset looks identical in the logs (Task #535).
        const stale = await storage.findUserByResetTokenIgnoreExpiry(token);
        if (stale) {
          // expired_by is the number of milliseconds the token has
          // been past its TTL — surfaces "this expired 30s ago" vs
          // "this expired 6 hours ago" in incident triage without
          // exposing the absolute timestamp on the wire.
          const expiry = stale.resetTokenExpiry
            ? new Date(stale.resetTokenExpiry).getTime()
            : null;
          const expiredByMs =
            expiry !== null ? Math.max(0, Date.now() - expiry) : null;
          console.warn(
            `[reset-password] token expired tokenHash=${tokenHash} userId=${stale.id} expired_by=${expiredByMs ?? 'unknown'}ms`,
          );
        } else {
          console.warn(
            `[reset-password] token not found tokenHash=${tokenHash}`,
          );
        }
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      // Block cycling the password back to one of the user's recently-used
      // hashes. Mirrors the policy enforced by the admin reset route above
      // and the self-change route in `/api/users/me/password`. Returns a
      // stable `errorCode` so the public reset page can render the inline
      // reuse message keyed off `historySize` instead of a generic toast.
      const historySize = getPasswordHistorySize();
      const reused = await isPasswordInHistory(
        newPassword,
        user.passwordHistory,
        historySize,
      );
      if (reused) {
        return res.status(400).json({
          message: `New password must not match any of your last ${historySize} passwords`,
          errorCode: PASSWORD_RECENTLY_USED_ERROR_CODE,
          historySize,
        });
      }

      // Hash the new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Rotate history alongside the password update so the column stays
      // in sync with the active hash for subsequent attempts.
      const nextHistory = buildNextPasswordHistory(
        user.password,
        user.passwordHistory,
        historySize,
      );
      await storage.updateUser(user.id, {
        password: hashedPassword,
        passwordHistory: nextHistory,
      });
      await storage.clearPasswordResetToken(user.id);
      // Whoever held the old password loses any session they had.
      await revokeUserAccess(user.id, {
        reason: "password_reset",
        target: user,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });

      console.info(
        `[reset-password] success tokenHash=${tokenHash} userId=${user.id}`,
      );

      // Echo the canonical email back to the client so the reset
      // page can immediately POST to /api/login and sign the user
      // in without a second password entry. Keeping this on a 200
      // (rather than redirecting server-side) preserves the existing
      // contract: callers that don't want auto-login can still rely
      // on the `message` field (Task #535).
      //
      // Always lowercase the echoed value (Task #540). New rows have
      // been written lowercased since the email-normalization fix, but
      // legacy rows can still carry mixed-case addresses. The auto-
      // login probe on the reset page POSTs straight to /api/login
      // with whatever we return here; /api/login does its own
      // case-insensitive lookup either way, but pinning "always
      // lowercased on the way out" keeps the wire contract single-
      // shaped so future consumers of this envelope (audit, support
      // tooling) don't have to re-normalize per call site.
      // Always a lowercased string (never null/undefined) so the FE
      // `typeof data?.email === "string"` guard treats this envelope
      // as the canonical-email shape on every successful reset. The
      // `?? ""` fallback is a defensive belt-and-suspenders for the
      // theoretically-impossible case of a reset-token-bearing user
      // row with no email — the schema marks email nullable, but a
      // user who doesn't have one couldn't have requested the reset
      // in the first place. An empty string here harmlessly drops
      // the FE into its manual-sign-in fallback without crashing.
      res.json({
        message: "Password reset successfully",
        email: (user.email ?? "").toLowerCase(),
      });
    } catch (error: any) {
      console.error("Error resetting password:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: error.issues[0].message });
      }
      res.status(500).json({ message: "Failed to reset password" });
    }
  });
}
