// Customer routes (Phase 8 extraction #21).
//
// 10 handlers covering customer CRUD + the small customer-competitors
// surface that lived just below in routes.ts:
//
//   GET    /api/customers
//   GET    /api/customers/accessible
//   GET    /api/customers/debug/all
//   GET    /api/customers/:id
//   GET    /api/customers/:id/customer-users
//   POST   /api/customers
//   PUT    /api/customers/:id
//   DELETE /api/customers/:id              (archive, not hard delete)
//   GET    /api/customers/:id/competitors
//   PUT    /api/customers/:id/competitors/sync
//
// POST/PUT take an optional logo upload via the `customerLogoUpload`
// multer instance defined inline (image MIME filter, 5MB limit, disk
// storage in QUARANTINE_DIR). Per-user accessible-customers filter
// from lib/customer-access.
import type { Express, NextFunction, Request, Response } from "express";
import multer from "multer";
import crypto from "crypto";
import { eq, or } from "drizzle-orm";
import { storage } from "../storage";
import { db } from "../db";
import { customers, customerCompetitors, competitors, technologySpaces, insertCustomerSchema } from "@shared/schema";
import { isAuthenticated } from "../auth/simpleAuth";
import { getUserAccessibleCustomers, getExternalUserAccountIds } from "../lib/customer-access";
import { internalAccountChangeRefusal, isExternalRole, isInternalAccount, requireInternalUser } from "../lib/internal-access";
import { requireSectionEdit, userCanEditSection } from "../lib/section-permissions";
import { accountLinkRefusal } from "../lib/crm-record-fields";
import { accountLinkChange, isCrmAccountConflict, linkChangeColumns, lockedAccountFields } from "../lib/account-crm-link";
import { refreshAccountFromCrm } from "../crm/account-refresh";
import { checkAccountLink, CRM_ACCOUNT_CONFLICT_BODY } from "../lib/account-crm-link-check";
import { getCrmProviderId } from "../crm/provider-setting";
import { customerForViewer } from "../lib/external-fields";
import { QUARANTINE_DIR, ensureQuarantineDir, normalizeFilename, buildLogoPath } from "../lib/upload-config";
import { processUpload } from "../lib/upload-processor";
import { withFreshLogo } from "../lib/customer-logo";

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;

// Normalize a raw domains list: lowercase, trim, strip leading @, dedupe, validate.
function normalizeDomains(raw: any): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(
    raw
      .map((d: any) => String(d ?? "").toLowerCase().trim().replace(/^@/, ""))
      .filter((d: string) => d && DOMAIN_RE.test(d)),
  ));
}

// Mirror an account's approved domains to the allowed_domains table so Login
// Management + signup validation see them. The account form is authoritative:
// existing domains are (re)assigned to this account (domains are globally unique),
// removed ones are deleted, new domains are created (autoApprove OFF by default).
async function reconcileAccountDomains(customerId: number, domains: string[], userId: string): Promise<void> {
  const wanted = normalizeDomains(domains);
  const existing = await storage.getAllowedDomainsByAccountId(customerId);
  const existingSet = new Set(existing.map((r) => r.domain.toLowerCase()));
  for (const row of existing) {
    if (!wanted.includes(row.domain.toLowerCase())) {
      await storage.deleteAllowedDomain(row.id, userId);
    }
  }
  for (const domain of wanted) {
    if (existingSet.has(domain)) continue;
    const globalRow = await storage.getAllowedDomainByDomain(domain);
    if (globalRow) {
      await storage.updateAllowedDomain(globalRow.id, { accountId: customerId }, userId);
    } else {
      await storage.createAllowedDomain({ domain, addedBy: userId, accountId: customerId, autoApprove: false });
    }
  }
}

// Account writes. Outside users (Customer, Partner, Guest) never change
// accounts; changing or archiving an existing one, or which email domains
// sign up into it, needs edit on Account Management (project.customers).
// Creating one (without approved domains), and setting an account's competitors (the account dialog
// saves them right after it creates the account), stay open to every
// internal user because the project forms create accounts inline.
// The internal (company) account is Admin-only on top of that: only an
// Admin may mark or unmark an account as internal, deactivate it, or
// archive it (see internalAccountChangeRefusal).
const ACCOUNT_EDIT = requireSectionEdit("project.customers");

function parseCustomerId(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * After a save links an account, pull its CRM-owned fields straight away on
 * the saving user's connection. A user who can't reach the CRM still saves
 * the link; the nightly refresh (or the next open) fills the fields.
 */
async function pullLinkedAccount<T>(customerId: number, userId: string, saved: T): Promise<T> {
  try {
    const outcome = await refreshAccountFromCrm(customerId, userId);
    if (outcome.status === "refreshed" || outcome.status === "missing") return outcome.customer as T;
  } catch (error) {
    console.error(`[accounts] could not pull CRM fields for account ${customerId}:`, error);
  }
  return saved;
}

async function requireExistingCustomer(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseCustomerId(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid customer ID" });
    if (!(await storage.getCustomer(id))) return res.status(404).json({ message: "Customer not found" });
    return next();
  } catch (error) {
    return next(error);
  }
}

export function registerCustomersRoutes(app: Express) {
  app.get("/api/customers", isAuthenticated, async (req, res) => {
    try {
      const customers = await storage.getCustomers();
      // Internal (login-only) accounts are segregated from the rest of the app.
      // Default (no scope / "external") hides them so they never appear in
      // project/POC selectors, dashboards, etc. Callers opt in explicitly:
      //   scope=all      -> Account Directory (shows everything, badges internal)
      //   scope=internal -> Login Management dropdowns (internal accounts only)
      const scope = typeof req.query.scope === "string" ? req.query.scope : "external";
      let result = customers;
      // Outside users only ever see the accounts they belong to.
      const viewer = (req as { session?: { user?: { id?: string; role?: string; email?: string } } }).session?.user;
      if (!viewer?.role || isExternalRole(viewer.role)) {
        const accessible = new Set(viewer?.id ? await getExternalUserAccountIds(viewer.id, viewer.email) : []);
        const visible = customers.filter((c) => accessible.has(c.id) && (c as any).isInternal !== true);
        return res.json(
          (await Promise.all(visible.map(withFreshLogo))).map((c) => customerForViewer(viewer?.role, c)),
        );
      }
      if (scope === "internal") {
        result = customers.filter((c) => (c as any).isInternal === true);
      } else if (scope !== "all") {
        result = customers.filter((c) => (c as any).isInternal !== true);
      }
      res.json(await Promise.all(result.map(withFreshLogo)));
    } catch (error: any) {
      console.error("Error fetching customers:", error);
      res.status(500).json({ message: "Failed to fetch customers" });
    }
  });

  // Get accessible customers for external users (Customer/Partner/Guest roles)
  app.get("/api/customers/accessible", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const userEmail = req.session.user.email;

      // Only external users (Customer/Partner/Guest) use this endpoint
      if (!isExternalRole(userRole)) {
        return res.status(403).json({ message: "This endpoint is only for external users" });
      }

      // Get accessible customer IDs for this user
      const accessibleCustomerIds = await getUserAccessibleCustomers(userId, userEmail);
      
      if (accessibleCustomerIds.length === 0) {
        return res.json([]);
      }

      // Get the full customer details for accessible customer IDs
      const allCustomers = await storage.getCustomers();
      const accessibleCustomers = allCustomers.filter(customer => 
        accessibleCustomerIds.includes(customer.id)
      );

      console.log(`API: Retrieved ${accessibleCustomers.length} accessible customers for external user ${userId} (${userRole})`);
      res.json(accessibleCustomers.map((customer) => customerForViewer(userRole, customer)));
    } catch (error: any) {
      console.error("Error fetching accessible customers:", error);
      res.status(500).json({ message: "Failed to fetch accessible customers" });
    }
  });

  // Debug endpoint to see all customers including inactive
  app.get("/api/customers/debug/all", isAuthenticated, async (req: any, res) => {
    try {
      // Only allow admin users to access this debug endpoint
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const allCustomers = await storage.getAllCustomersIncludingInactive();
      res.json({
        total: allCustomers.length,
        customers: allCustomers
      });
    } catch (error: any) {
      console.error("Error fetching all customers:", error);
      res.status(500).json({ message: "Failed to fetch all customers" });
    }
  });

  app.get("/api/customers/:id", isAuthenticated, async (req: any, res) => {
    try {
      const customerId = parseInt(req.params.id as string);
      if (isNaN(customerId)) {
        return res.status(400).json({ error: 'Invalid customer ID' });
      }

      const customer = await storage.getCustomer(customerId);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      const viewer = req.session.user;
      if (!viewer?.role || isExternalRole(viewer.role)) {
        const accessible = await getExternalUserAccountIds(viewer.id, viewer.email);
        if (!accessible.includes(customerId)) {
          return res.status(404).json({ message: "Customer not found" });
        }
      }

      res.json(customerForViewer(viewer?.role, await withFreshLogo(customer)));
    } catch (error: any) {
      console.error("Error fetching customer:", error);
      res.status(500).json({ message: "Failed to fetch customer" });
    }
  });

  // Get customer users with "Customer" role for a specific customer
  app.get("/api/customers/:id/customer-users", isAuthenticated, async (req: any, res) => {
    try {
      const customerId = parseInt(req.params.id as string);
      if (isNaN(customerId)) {
        return res.status(400).json({ error: 'Invalid customer ID' });
      }

      const customer = await storage.getCustomer(customerId);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      // Get the contact users from the customer
      const contactUsers = customer.contactUsers as Array<{userId: string; stakeholderTypes: string[]}> || [];
      
      // Fetch user details for each contact user
      const customerUsers = [];
      for (const contactUser of contactUsers) {
        const user = await storage.getUser(contactUser.userId);
        // Filter only users with "Customer" role (case-insensitive)
        if (user && user.role && user.role.toLowerCase() === 'customer') {
          customerUsers.push({
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            fullName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
          });
        }
      }

      console.log(`API: Retrieved ${customerUsers.length} customer users for customer ${customerId}`);
      res.json(customerUsers);
    } catch (error: any) {
      console.error("Error fetching customer users:", error);
      res.status(500).json({ message: "Failed to fetch customer users" });
    }
  });

  // Configure multer specifically for customer logos. Allow-list +
  // size cap MUST match server/lib/upload-config.ts (LOGO_ALLOWED_MIMES
  // and LOGO_MAX_BYTES). SVG uploads pass through the sanitizer in
  // processUpload before storage — see server/lib/svg-sanitizer.ts.
  const customerLogoUpload = multer({
    storage: multer.diskStorage({
      destination: function (req, file, cb) {
        ensureQuarantineDir();
        cb(null, QUARANTINE_DIR);
      },
      filename: function (req, file, cb) {
        const uniqueId = crypto.randomUUID();
        const mimetypeToExt: Record<string, string> = {
          'image/jpeg': '.jpg',
          'image/jpg': '.jpg',
          'image/png': '.png',
          'image/gif': '.gif',
          'image/webp': '.webp',
          'image/svg+xml': '.svg',
        };
        const ext = mimetypeToExt[file.mimetype] || '.jpg';
        cb(null, `logo_${uniqueId}${ext}`);
      }
    }),
    limits: { fileSize: 3 * 1024 * 1024 }, // 3 MB — matches LOGO_MAX_BYTES + the UI promise
    fileFilter: (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        const error = new Error('Invalid file type. Only JPEG, PNG, GIF, WebP, and SVG are allowed for customer logos.');
        (error as any).code = 'UNSUPPORTED_FILE_TYPE';
        cb(error);
      }
    },
  });

  // Create customer endpoint
  app.post('/api/customers', isAuthenticated, requireInternalUser, customerLogoUpload.single('logo'), async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      console.log("Creating customer with body:", req.body);
      console.log("File:", req.file);

      // Internal (login-only) accounts require nothing beyond the account name.
      // All customer-account fields are optional/ignored for them.
      const isInternal = req.body.isInternal === 'true';
      // An internal account turns everyone on its email domains into staff
      // with access to every account, so only an Admin may create one.
      if (isInternal && req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Only an Admin can mark an account as internal" });
      }

      // Validate required fields
      if (!req.body.accountName || !req.body.accountName.trim()) {
        return res.status(400).json({
          message: "Account name is required",
          error: "VALIDATION_ERROR",
          details: "Please provide a valid account name"
        });
      }

      if (!isInternal) {
        if (!req.body.industryId) {
          return res.status(400).json({
            message: "Industry is required",
            error: "VALIDATION_ERROR",
            details: "Please select an industry for this customer"
          });
        }

        if (!req.body.region) {
          return res.status(400).json({
            message: "Region is required",
            error: "VALIDATION_ERROR",
            details: "Please select a region for this customer"
          });
        }

        if (!req.body.accountRepresentativeId) {
          return res.status(400).json({
            message: "Account Representative is required",
            error: "VALIDATION_ERROR",
            details: "Please select an Account Representative"
          });
        }

        if (!req.body.accountEngineerId) {
          return res.status(400).json({
            message: "Account Engineer is required",
            error: "VALIDATION_ERROR",
            details: "Please select an Account Engineer"
          });
        }
      }

      // Parse JSON fields that come as strings from FormData
      let productInterests = [];
      let contactUsers = [];

      try {
        productInterests = req.body.productInterests ? JSON.parse(req.body.productInterests) : [];
        contactUsers = req.body.contactUsers ? JSON.parse(req.body.contactUsers) : [];
      } catch (parseError: any) {
        return res.status(400).json({
          message: "Invalid data format",
          error: "PARSE_ERROR",
          details: "Failed to parse product interests or contact users data"
        });
      }

      if (!isInternal) {
        if (productInterests.length === 0) {
          return res.status(400).json({
            message: "At least one solution interest is required",
            error: "VALIDATION_ERROR",
            details: "Please select at least one solution that this customer is interested in"
          });
        }

        // Contact users (Account Access) are intentionally NOT required at
        // account-creation time. An account is the first thing created on a
        // fresh install — before any non-admin users exist to assign — and
        // contact users are managed afterwards (when users are created and
        // assigned, or when a user adds the account to themselves). Requiring
        // one here blocked initial account creation entirely.
      }

      // Handle logo upload via quarantine pipeline
      let logoUrl = null;
      let logoSize: number | null = null;
      if (req.file) {
        const safeLogoName = normalizeFilename(req.file.originalname);
        const logoGcsKey = `accounts/logos/${safeLogoName}`;
        const logoResult = await processUpload(req.file, logoGcsKey, 'logo');
        if (!logoResult.ok) {
          return res.status(logoResult.status).json({ message: logoResult.reason });
        }
        logoUrl = logoResult.file.url;
        logoSize = logoResult.file.fileSize;
      }

      let approvedEmailDomains: string[] = [];
      try {
        approvedEmailDomains = normalizeDomains(req.body.approvedEmailDomains ? JSON.parse(req.body.approvedEmailDomains) : []);
      } catch { approvedEmailDomains = []; }
      // An existing domain moves to the new account, so claiming domains
      // needs the same Account Management edit as changing them later.
      if (approvedEmailDomains.length > 0 && !(await userCanEditSection(req, "project.customers"))) {
        return res.status(403).json({ message: "You do not have permission to set approved email domains" });
      }

      const activeCrm = await getCrmProviderId();
      const accountLinkError = accountLinkRefusal(req.body.salesforceAccountUrl, null, activeCrm);
      if (accountLinkError) {
        return res.status(400).json({ message: accountLinkError, error: "VALIDATION_ERROR", errorCode: "crm_provider_mismatch" });
      }
      // With a CRM active the account must be linked, unless an Admin
      // approves an exception with a reason. No CRM: no link needed.
      const linkCheck = await checkAccountLink({
        activeProvider: activeCrm,
        isInternal,
        role: req.session.user.role,
        userId,
        nextUrl: req.body.salesforceAccountUrl,
        exceptionReason: req.body.crmLinkExceptionReason,
      });
      if (!linkCheck.ok) return res.status(linkCheck.status).json(linkCheck.body);
      const linkChange = accountLinkChange(activeCrm, null, req.body.salesforceAccountUrl);

      const customerData = {
        accountName: req.body.accountName.trim(),
        abbreviation: req.body.abbreviation?.trim() || null,
        industryId: req.body.industryId ? parseInt(req.body.industryId) : null,
        region: req.body.region || null,
        productInterests,
        contactUsers,
        salesforceAccountUrl: req.body.salesforceAccountUrl || null,
        logoUrl,
        logoSize,
        isActive: req.body.isActive !== 'false',
        isPartner: req.body.isPartner === 'true',
        isInternal,
        approvedEmailDomains,
        accountRepresentativeId: req.body.accountRepresentativeId || null,
        accountEngineerId: req.body.accountEngineerId || null,
        ...linkCheck.extraColumns,
        ...linkChangeColumns(linkChange, userId),
      };

      console.log("Final customer data to insert:", customerData);

      const created = await storage.createCustomer(customerData as any);
      // A linked account takes its name, industry, region, website and owner from the CRM.
      const customer = linkChange === "linked" ? await pullLinkedAccount(created.id, userId, created) : created;

      // Mirror approved domains to the allowed_domains table (Login Mgmt + signup).
      try {
        await reconcileAccountDomains(customer.id, approvedEmailDomains, userId);
      } catch (domainErr) {
        console.error("Failed to reconcile account domains (create):", domainErr);
      }

      res.status(201).json(customer);
    } catch (error: any) {
      console.error("Error creating customer:", error);

      if (isCrmAccountConflict(error)) {
        return res.status(409).json(CRM_ACCOUNT_CONFLICT_BODY);
      }

      // Provide detailed error information
      if (error.code === '23505') {
        return res.status(409).json({
          message: "A customer with this name already exists",
          error: "DUPLICATE_ERROR",
          details: "Please choose a different account name"
        });
      }

      if (error.name === 'ValidationError') {
        return res.status(400).json({
          message: "Validation failed",
          error: "VALIDATION_ERROR",
          details: error.message
        });
      }

      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            message: "Logo file is too large",
            error: "FILE_SIZE_ERROR",
            details: "Logo file must be less than 3MB"
          });
        }
        return res.status(400).json({
          message: "Logo upload failed",
          error: "UPLOAD_ERROR",
          details: error.message
        });
      }

      res.status(500).json({
        message: "Failed to create customer",
        error: "SERVER_ERROR",
        details: "An unexpected error occurred while creating the customer. Please try again or contact support."
      });
    }
  });

  // Update customer endpoint
  app.put('/api/customers/:id', isAuthenticated, requireInternalUser, ACCOUNT_EDIT, requireExistingCustomer, customerLogoUpload.single('logo'), async (req: any, res) => {
    try {
      const customerId = parseInt(req.params.id as string);
      const userId = req.session.user.id;

      const existing = await storage.getCustomer(customerId);
      const internalRefusal = internalAccountChangeRefusal(req.session.user.role, existing ?? {}, {
        isInternal: req.body.isInternal === 'true',
        isActive: req.body.isActive !== 'false',
      });
      if (internalRefusal) {
        return res.status(403).json({ message: internalRefusal });
      }

      console.log("Updating customer", customerId, "with body:", req.body);

      // Log the specific fields we're interested in
      console.log("Account Representative ID received:", req.body.accountRepresentativeId);
      console.log("Account Engineer ID received:", req.body.accountEngineerId);

      // Parse JSON fields that come as strings from FormData
      let productInterests = [];
      let contactUsers = [];

      try {
        // Handle productInterests - it should be an array for PostgreSQL text[] column
        if (req.body.productInterests) {
          if (typeof req.body.productInterests === 'string') {
            try {
              const parsed = JSON.parse(req.body.productInterests);
              // Ensure it's an array and flatten any nested arrays
              if (Array.isArray(parsed)) {
                productInterests = parsed.flat().filter(item => item !== null && item !== undefined && item !== '');
              } else {
                productInterests = [String(parsed)];
              }
            } catch (jsonError) {
              console.error("Failed to parse productInterests JSON:", req.body.productInterests);
              // If it's not valid JSON, treat it as a single item array
              productInterests = [String(req.body.productInterests)];
            }
          } else if (Array.isArray(req.body.productInterests)) {
            productInterests = req.body.productInterests.flat().filter((item: any) => item !== null && item !== undefined && item !== '');
          } else {
            productInterests = [String(req.body.productInterests)];
          }
        }

        // Handle contactUsers - check if it's already an array or needs parsing
        if (req.body.contactUsers) {
          if (typeof req.body.contactUsers === 'string') {
            try {
              contactUsers = JSON.parse(req.body.contactUsers);
              // Ensure it's an array and flatten any nested arrays
              if (Array.isArray(contactUsers)) {
                contactUsers = contactUsers.flat();
              } else {
                contactUsers = [];
              }
            } catch (jsonError) {
              console.error("Failed to parse contactUsers JSON:", req.body.contactUsers);
              contactUsers = [];
            }
          } else if (Array.isArray(req.body.contactUsers)) {
            contactUsers = req.body.contactUsers.flat();
          }
        }
      } catch (parseError: any) {
        console.error("Error parsing JSON fields:", parseError);
        console.error("productInterests type:", typeof req.body.productInterests, "value:", req.body.productInterests);
        console.error("contactUsers type:", typeof req.body.contactUsers, "value:", req.body.contactUsers);
        return res.status(400).json({ message: "Invalid JSON in form data", error: parseError.message });
      }

      // Handle logo upload via quarantine pipeline
      let logoUrl = undefined; // Don't update logo if no new file
      let newLogoSize: number | undefined = undefined;
      if (req.file) {
        const safeLogoName = normalizeFilename(req.file.originalname);
        const customerId = parseInt(req.params.id as string);
        const logoGcsKey = buildLogoPath(customerId, safeLogoName);
        const logoResult = await processUpload(req.file, logoGcsKey, 'logo');
        if (!logoResult.ok) {
          return res.status(logoResult.status).json({ message: logoResult.reason });
        }
        logoUrl = logoResult.file.url;
        newLogoSize = logoResult.file.fileSize;
      }

      let approvedEmailDomains: string[] = [];
      try {
        approvedEmailDomains = normalizeDomains(req.body.approvedEmailDomains ? JSON.parse(req.body.approvedEmailDomains) : []);
      } catch { approvedEmailDomains = []; }

      // The internal account's domains decide who counts as staff.
      if (isInternalAccount(existing) && req.session.user.role !== 'Admin') {
        const current = (await storage.getAllowedDomainsByAccountId(customerId)).map((r) => r.domain.toLowerCase());
        const unchanged = current.length === approvedEmailDomains.length && approvedEmailDomains.every((d) => current.includes(d));
        if (!unchanged) {
          return res.status(403).json({ message: "Only an Admin can change the internal account's email domains" });
        }
      }

      const existingCustomer = await storage.getCustomer(customerId);
      const activeCrm = await getCrmProviderId();
      const accountLinkError = accountLinkRefusal(
        req.body.salesforceAccountUrl,
        existingCustomer?.salesforceAccountUrl ?? null,
        activeCrm,
      );
      if (accountLinkError) {
        return res.status(400).json({ message: accountLinkError, error: "VALIDATION_ERROR", errorCode: "crm_provider_mismatch" });
      }
      // Removing a CRM link is Admin-only and needs a reason.
      const linkCheck = await checkAccountLink({
        activeProvider: activeCrm,
        isInternal: req.body.isInternal === 'true',
        role: req.session.user.role,
        userId,
        nextUrl: req.body.salesforceAccountUrl,
        stored: { id: customerId, salesforceAccountUrl: existingCustomer?.salesforceAccountUrl ?? null },
        exceptionReason: req.body.crmLinkExceptionReason,
      });
      if (!linkCheck.ok) return res.status(linkCheck.status).json(linkCheck.body);
      const linkChange = accountLinkChange(activeCrm, existingCustomer ?? null, req.body.salesforceAccountUrl);

      const updateData: any = {
        accountName: req.body.accountName,
        abbreviation: req.body.abbreviation?.trim() || null,
        industryId: req.body.industryId ? parseInt(req.body.industryId) : null,
        region: req.body.region || null,
        productInterests,
        contactUsers,
        salesforceAccountUrl: req.body.salesforceAccountUrl || null,
        isActive: req.body.isActive !== 'false',
        isPartner: req.body.isPartner === 'true',
        isInternal: req.body.isInternal === 'true',
        approvedEmailDomains,
        accountRepresentativeId: req.body.accountRepresentativeId || null,
        accountEngineerId: req.body.accountEngineerId || null,
        ...linkCheck.extraColumns,
        ...linkChangeColumns(linkChange, userId),
      };

      // CRM-owned fields of a linked account are read-only here: the stored
      // value wins over whatever the form sent (the name always, the rest
      // once the CRM has filled them).
      for (const field of lockedAccountFields(linkChange, existingCustomer ?? null)) {
        if (existingCustomer && field in existingCustomer) {
          updateData[field] = (existingCustomer as unknown as Record<string, unknown>)[field];
        }
      }

      // Only update logo if a new file was uploaded, or clear it when the
      // form's "Remove Logo" was used without a replacement.
      if (logoUrl !== undefined) {
        updateData.logoUrl = logoUrl;
        updateData.logoSize = newLogoSize;
      } else if (req.body.removeLogo === 'true') {
        updateData.logoUrl = null;
        updateData.logoSize = null;
      }

      console.log("Final update data:", updateData);

      const saved = await storage.updateCustomer(customerId, updateData);
      const customer =
        linkChange === "linked" || linkChange === "relinked" ? await pullLinkedAccount(customerId, userId, saved) : saved;

      // Mirror approved domains to the allowed_domains table (Login Mgmt + signup).
      try {
        await reconcileAccountDomains(customerId, approvedEmailDomains, userId);
      } catch (domainErr) {
        console.error("Failed to reconcile account domains (update):", domainErr);
      }

      // Push the change to Salesforce if this account is linked (queued,
      // debounced, retried; never blocks or fails this save).
      void import('../salesforce/index.js')
        .then(({ salesforceSyncService }) => salesforceSyncService.queueOutboundSyncIfLinked('customer', String(customerId), userId))
        .catch((sfError) => console.error('Failed to queue Salesforce sync:', sfError));

      res.json(customer ? await withFreshLogo(customer) : customer);
    } catch (error: any) {
      if (isCrmAccountConflict(error)) {
        return res.status(409).json(CRM_ACCOUNT_CONFLICT_BODY);
      }
      console.error("Error updating customer:", error);
      res.status(500).json({ message: "Failed to update customer", error: error.message });
    }
  });

  app.delete("/api/customers/:id", isAuthenticated, requireInternalUser, ACCOUNT_EDIT, requireExistingCustomer, async (req: any, res) => {
    try {
      const customerId = parseInt(req.params.id as string);
      const userId = req.session.user.id;

      const existing = await storage.getCustomer(customerId);
      const internalRefusal = internalAccountChangeRefusal(req.session.user.role, existing ?? {});
      if (internalRefusal) {
        return res.status(403).json({ message: internalRefusal });
      }

      // Pull the operator-supplied reason (if any) from the request body so it
      // is persisted alongside the archived row. Falls back to the legacy
      // sentinel when no reason was provided to keep older clients working.
      const rawReason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
      const reason = rawReason.length > 0 ? rawReason : 'Archived via delete action';

      // Archive the customer instead of deleting it
      await storage.archiveCustomer(customerId, userId, reason);
      res.json({ message: "Customer archived successfully" });
    } catch (error: any) {
      console.error("Error archiving customer:", error);
      res.status(500).json({ message: "Failed to archive customer" });
    }
  });

  // =============================================================================
  // CUSTOMER COMPETITORS ROUTES
  // =============================================================================

  app.get("/api/customers/:id/competitors", isAuthenticated, async (req: any, res) => {
    try {
      const customerId = parseInt(req.params.id as string);
      if (isNaN(customerId)) return res.status(400).json({ message: "Invalid customer ID" });
      const rows = await db
        .select({
          id: customerCompetitors.id,
          customerId: customerCompetitors.customerId,
          competitorId: customerCompetitors.competitorId,
          spaceId: customerCompetitors.spaceId,
          relationship: customerCompetitors.relationship,
          createdAt: customerCompetitors.createdAt,
          competitorName: competitors.name,
          competitorSlug: competitors.slug,
          spaceCode: technologySpaces.code,
          spaceName: technologySpaces.name,
          spaceColor: technologySpaces.color,
        })
        .from(customerCompetitors)
        .leftJoin(competitors, eq(customerCompetitors.competitorId, competitors.id))
        .leftJoin(technologySpaces, eq(customerCompetitors.spaceId, technologySpaces.id))
        .where(eq(customerCompetitors.customerId, customerId));
      res.json(rows);
    } catch (error: any) {
      console.error("GET /api/customers/:id/competitors error:", error);
      res.status(500).json({ message: "Failed to fetch customer competitors" });
    }
  });

  app.put("/api/customers/:id/competitors/sync", isAuthenticated, requireInternalUser, requireExistingCustomer, async (req: any, res) => {
    try {
      const customerId = parseInt(req.params.id as string);
      if (isNaN(customerId)) return res.status(400).json({ message: "Invalid customer ID" });
      const { connectedCompetitors } = req.body;
      if (!Array.isArray(connectedCompetitors)) return res.status(400).json({ message: "connectedCompetitors must be an array" });
      await db.delete(customerCompetitors).where(eq(customerCompetitors.customerId, customerId));
      if (connectedCompetitors.length > 0) {
        await db.insert(customerCompetitors).values(
          connectedCompetitors.map((c: any) => ({
            customerId,
            competitorId: parseInt(c.competitorId),
            spaceId: c.spaceId ? parseInt(c.spaceId) : null,
            relationship: c.relationship || null,
          }))
        );
      }
      res.json({ message: "Competitors synced" });
    } catch (error: any) {
      console.error("PUT /api/customers/:id/competitors/sync error:", error);
      res.status(500).json({ message: "Failed to sync competitors" });
    }
  });

  // ── Approved Email Domains (account ↔ allowed_domains) ───────────────────────
  // An account's approved domains are simply allowed_domains rows linked to it.
  // This unifies with Configuration → User Management → Login Management (shared
  // table), and is the allowlist the signup flow validates code-based users against.

  app.get("/api/customers/:id/approved-domains", isAuthenticated, async (req: any, res) => {
    try {
      const customerId = parseInt(req.params.id as string);
      if (isNaN(customerId)) return res.status(400).json({ message: "Invalid customer ID" });
      // The customer column is the authoritative store for an account's domains.
      const customer = await storage.getCustomer(customerId);
      res.json(Array.isArray((customer as any)?.approvedEmailDomains) ? (customer as any).approvedEmailDomains : []);
    } catch (error: any) {
      console.error("GET /api/customers/:id/approved-domains error:", error);
      res.status(500).json({ message: "Failed to fetch approved domains" });
    }
  });

  app.put("/api/customers/:id/approved-domains/sync", isAuthenticated, requireInternalUser, ACCOUNT_EDIT, requireExistingCustomer, async (req: any, res) => {
    try {
      const customerId = parseInt(req.params.id as string);
      if (isNaN(customerId)) return res.status(400).json({ message: "Invalid customer ID" });
      const userId = req.session.user.id;
      const { domains } = req.body;
      if (!Array.isArray(domains)) return res.status(400).json({ message: "domains must be an array" });
      if (req.session.user.role !== 'Admin' && isInternalAccount(await storage.getCustomer(customerId))) {
        return res.status(403).json({ message: "Only an Admin can change the internal account's email domains" });
      }

      // Normalize: lowercase, trim, strip leading @, basic x.y format, dedupe.
      const domainRe = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;
      const wanted = Array.from(new Set(
        domains
          .map((d: any) => String(d ?? "").toLowerCase().trim().replace(/^@/, ""))
          .filter((d: string) => d && domainRe.test(d)),
      ));

      const existing = await storage.getAllowedDomainsByAccountId(customerId);
      const existingDomains = new Set(existing.map((r) => r.domain.toLowerCase()));

      // Remove domains no longer listed (only rows belonging to this account).
      for (const row of existing) {
        if (!wanted.includes(row.domain.toLowerCase())) {
          await storage.deleteAllowedDomain(row.id, userId);
        }
      }

      // Add/relink new domains. The Account form is the authoritative place to
      // define an account's domains, so if a domain already exists (even linked
      // to another account) we (re)assign it to THIS account — domains are
      // globally unique, so last assignment wins. New domains are created with
      // autoApprove OFF (validation-only); an existing row keeps its autoApprove
      // (managed in Login Management) and only its account link is updated.
      const reassigned: string[] = [];
      let added = 0;
      for (const domain of wanted) {
        if (existingDomains.has(domain)) continue;
        const globalRow = await storage.getAllowedDomainByDomain(domain);
        if (globalRow) {
          if (globalRow.accountId && globalRow.accountId !== customerId) {
            reassigned.push(domain); // moved from another account to this one
          }
          await storage.updateAllowedDomain(globalRow.id, { accountId: customerId }, userId);
          added++;
        } else {
          await storage.createAllowedDomain({ domain, addedBy: userId, accountId: customerId, autoApprove: false });
          added++;
        }
      }

      res.json({ synced: added, reassigned });
    } catch (error: any) {
      console.error("PUT /api/customers/:id/approved-domains/sync error:", error);
      res.status(500).json({ message: "Failed to sync approved domains" });
    }
  });
}
