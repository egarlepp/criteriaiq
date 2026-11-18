// Login Management routes (Phase 8 extraction #11b).
//
// Domain Allow List (admin-only) + Access Codes (admin-only CRUD plus
// one public validation endpoint used during registration).
//
// Admin-only:
//   GET    /api/admin/allowed-domains
//   POST   /api/admin/allowed-domains
//   PUT    /api/admin/allowed-domains/:id
//   DELETE /api/admin/allowed-domains/:id
//   GET    /api/admin/access-codes
//   POST   /api/admin/access-codes
//   PATCH  /api/admin/access-codes/:id/deactivate
//   GET    /api/admin/access-codes/:id/usage
//   DELETE /api/admin/access-codes/:id
//
// Public:
//   POST   /api/validate-access-code   (registration flow)
//
// The two sub-domains live together because they share infrastructure
// (account/creator-name enrichment, retroactive auto-approval logic)
// and are presented as a single "Login Management" page in the admin
// UI. Pure storage usage; no broadcaster, no multer.
import type { Express } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth/simpleAuth";

export function registerLoginManagementRoutes(app: Express) {
  // GET /api/admin/allowed-domains - List all allowed domains
  app.get("/api/admin/allowed-domains", isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;
      if (userRole !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const domains = await storage.getAllAllowedDomains();

      // Enrich with account and creator names
      const enrichedDomains = await Promise.all(domains.map(async (domain) => {
        let createdByName = null;
        let accountName = null;

        if (domain.addedBy) {
          const user = await storage.getUser(domain.addedBy);
          createdByName = user ? `${user.firstName} ${user.lastName}` : null;
        }

        if (domain.accountId) {
          const account = await storage.getCustomer(domain.accountId);
          accountName = account?.accountName || null;
        }

        return {
          ...domain,
          createdByName,
          accountName,
          createdById: domain.addedBy,
        };
      }));

      res.json(enrichedDomains);
    } catch (error: any) {
      console.error("Error fetching allowed domains:", error);
      res.status(500).json({ message: "Failed to fetch allowed domains" });
    }
  });

  // POST /api/admin/allowed-domains - Add a new allowed domain
  app.post("/api/admin/allowed-domains", isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;
      if (userRole !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { domain, accountId, autoApprove, createCode, assignedRole } = req.body;
      if (!domain || domain.trim() === '') {
        return res.status(400).json({ message: "Domain is required" });
      }

      // "Create login code" requires an account to associate the code with.
      if (createCode && !accountId) {
        return res.status(400).json({ message: "An account must be linked to auto-create a login code" });
      }

      const cleanDomain = domain.toLowerCase().trim().replace(/^@/, '');

      // Check if domain already exists
      const existing = await storage.getAllowedDomainByDomain(cleanDomain);
      if (existing) {
        return res.status(400).json({ message: "Domain already exists in allow list" });
      }

      const newDomain = await storage.createAllowedDomain({
        domain: cleanDomain,
        addedBy: req.session.user.id,
        accountId: accountId || null,
        autoApprove: autoApprove !== undefined ? autoApprove : true,
      });

      // Trigger retroactive approval for users with matching domain if autoApprove is enabled.
      // approveUsersByDomain matches on the login gate (isApproved) — the prior loop set
      // isActive on the wrong query and never actually approved registered users.
      let approvedCount = 0;
      if (newDomain.autoApprove) {
        approvedCount = await storage.approveUsersByDomain(cleanDomain);
      }

      // Optionally auto-generate an access code for this domain. Prefix = first
      // 3 alpha chars of the domain, upper-cased (padded with X if too short).
      // Defaults to bypassLimits (unlimited / never expires); fully editable after.
      let generatedCode = null;
      if (createCode && accountId) {
        const account = await storage.getCustomer(accountId);
        if (account) {
          const prefix = cleanDomain.replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
          const code = storage.generateRandomAccessCode(8, prefix);
          generatedCode = await storage.createAccessCode({
            code,
            associatedAccountId: account.id,
            associatedAccountName: account.accountName,
            assignedRole: assignedRole || null,
            description: `Auto-generated for domain ${cleanDomain}`,
            maxUses: 1,
            expiresAt: null,
            bypassLimits: true,
            createdBy: req.session.user.id,
          });
        }
      }

      res.json({
        domain: newDomain,
        generatedCode,
        retroactiveApprovals: approvedCount,
        message: approvedCount > 0
          ? `Domain added. ${approvedCount} pending user(s) were automatically approved.`
          : 'Domain added to allow list.'
      });
    } catch (error: any) {
      console.error("Error adding allowed domain:", error);
      res.status(500).json({ message: "Failed to add domain" });
    }
  });

  // POST /api/admin/allowed-domains/bulk - Link/allow multiple domains to an
  // account at once (account-first Add Domain flow). Non-destructive: each
  // domain is created (if new) or relinked + auto-approve updated (if existing);
  // domains not listed are left untouched. Optionally generates one login code
  // for the account targeting the selected domains.
  app.post("/api/admin/allowed-domains/bulk", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      const userId = req.session.user.id;
      const { accountId, autoApprove, createCode, assignedRole } = req.body;
      const domainRe = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;
      const domains: string[] = Array.from(new Set(
        (Array.isArray(req.body.domains) ? req.body.domains : [])
          .map((d: any) => String(d ?? "").toLowerCase().trim().replace(/^@/, ""))
          .filter((d: string) => d && domainRe.test(d)),
      ));
      if (domains.length === 0) {
        return res.status(400).json({ message: "At least one valid domain is required" });
      }

      const wantAutoApprove = autoApprove !== false; // default true
      let linked = 0;
      let approvedCount = 0;
      for (const domain of domains) {
        const existing = await storage.getAllowedDomainByDomain(domain);
        if (existing) {
          await storage.updateAllowedDomain(existing.id, {
            accountId: accountId ?? existing.accountId ?? null,
            autoApprove: wantAutoApprove,
          }, userId);
        } else {
          await storage.createAllowedDomain({ domain, addedBy: userId, accountId: accountId ?? null, autoApprove: wantAutoApprove });
        }
        linked++;
        if (wantAutoApprove) {
          approvedCount += await storage.approveUsersByDomain(domain);
        }
      }

      // Merge the domains into the account's authoritative approved-domains column
      // so they appear as badges on the Account form (single source of truth).
      if (accountId) {
        try {
          const account = await storage.getCustomer(accountId);
          if (account) {
            const current: string[] = Array.isArray((account as any).approvedEmailDomains) ? (account as any).approvedEmailDomains : [];
            const merged = Array.from(new Set([...current.map((d) => d.toLowerCase()), ...domains]));
            if (merged.length !== current.length) {
              await storage.updateCustomer(accountId, { approvedEmailDomains: merged } as any);
            }
          }
        } catch (colErr) {
          console.error("Failed to merge domains into account column:", colErr);
        }
      }

      // Optional: one login code for the account targeting these domains.
      let generatedCode = null;
      if (createCode && accountId) {
        const account = await storage.getCustomer(accountId);
        if (account) {
          const prefix = domains[0].replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
          const code = storage.generateRandomAccessCode(8, prefix);
          generatedCode = await storage.createAccessCode({
            code,
            associatedAccountId: account.id,
            associatedAccountName: account.accountName,
            assignedRole: assignedRole || null,
            description: `Auto-generated for domains: ${domains.join(", ")}`,
            maxUses: 1,
            expiresAt: null,
            bypassLimits: true,
            domains,
            createdBy: userId,
          });
        }
      }

      res.json({ linked, retroactiveApprovals: approvedCount, generatedCode });
    } catch (error: any) {
      console.error("Error bulk-adding allowed domains:", error);
      res.status(500).json({ message: "Failed to add domains" });
    }
  });

  // PUT /api/admin/allowed-domains/:id - Update an allowed domain
  app.put("/api/admin/allowed-domains/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;
      if (userRole !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id as string);
      const { accountId, autoApprove } = req.body;

      const existingDomain = await storage.getAllowedDomainById(id);
      if (!existingDomain) {
        return res.status(404).json({ message: "Domain not found" });
      }

      const wasAutoApprove = existingDomain.autoApprove;

      const updated = await storage.updateAllowedDomain(
        id,
        {
          accountId: accountId === null ? null : (accountId || undefined),
          autoApprove
        },
        req.session.user.id
      );

      if (!updated) {
        return res.status(404).json({ message: "Domain not found" });
      }

      // Trigger retroactive approval if autoApprove was just enabled.
      // Uses the isApproved-based helper (the login gate) rather than the old
      // isActive loop that never actually approved registered users.
      let approvedCount = 0;
      if (autoApprove && !wasAutoApprove) {
        approvedCount = await storage.approveUsersByDomain(updated.domain);
      }

      // Enrich the response with account name
      let accountName = null;
      if (updated.accountId) {
        const account = await storage.getCustomer(updated.accountId);
        accountName = account?.accountName || null;
      }

      res.json({
        domain: { ...updated, accountName },
        retroactiveApprovals: approvedCount,
        message: approvedCount > 0
          ? `Domain updated. ${approvedCount} pending user(s) were automatically approved.`
          : 'Domain updated successfully.'
      });
    } catch (error: any) {
      console.error("Error updating allowed domain:", error);
      res.status(500).json({ message: "Failed to update domain" });
    }
  });

  // DELETE /api/admin/allowed-domains/:id - Remove an allowed domain
  app.delete("/api/admin/allowed-domains/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;
      if (userRole !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id as string);
      const deleted = await storage.deleteAllowedDomain(id, req.session.user.id);

      if (!deleted) {
        return res.status(404).json({ message: "Domain not found" });
      }

      res.json({ message: "Domain removed from allow list" });
    } catch (error: any) {
      console.error("Error deleting allowed domain:", error);
      res.status(500).json({ message: "Failed to delete domain" });
    }
  });

  // GET /api/admin/access-codes - List all access codes
  app.get("/api/admin/access-codes", isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;
      if (userRole !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const codes = await storage.getAllAccessCodes();

      // Enrich with account and creator names
      const enrichedCodes = await Promise.all(codes.map(async (code) => {
        let createdByName = null;
        let accountName = code.associatedAccountName;

        if (code.createdBy) {
          const user = await storage.getUser(code.createdBy);
          createdByName = user ? `${user.firstName} ${user.lastName}` : null;
        }

        if (code.associatedAccountId && !accountName) {
          const account = await storage.getCustomer(code.associatedAccountId);
          accountName = account?.accountName || null;
        }

        return {
          ...code,
          accountId: code.associatedAccountId,
          createdByName,
          accountName,
          currentUses: code.usesCount
        };
      }));

      res.json(enrichedCodes);
    } catch (error: any) {
      console.error("Error fetching access codes:", error);
      res.status(500).json({ message: "Failed to fetch access codes" });
    }
  });

  // POST /api/admin/access-codes - Generate a new access code
  app.post("/api/admin/access-codes", isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;
      if (userRole !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { accountId, prefix, description, maxUses, expiresInDays, assignedRole, bypassLimits } = req.body;
      const isBypass = bypassLimits === true;

      if (!accountId) {
        return res.status(400).json({ message: "Account is required" });
      }

      if (!prefix || prefix.length !== 3 || !/^[A-Z]{3}$/.test(prefix.toUpperCase())) {
        return res.status(400).json({ message: "Code prefix must be exactly 3 letters" });
      }

      // When bypassLimits is on, the max-uses / expiry inputs are ignored.
      if (!isBypass) {
        if (!maxUses || maxUses < 1 || maxUses > 20) {
          return res.status(400).json({ message: "Max uses must be between 1 and 20" });
        }

        if (!expiresInDays || expiresInDays < 1 || expiresInDays > 30) {
          return res.status(400).json({ message: "Expires in days must be between 1 and 30" });
        }
      }

      if (!assignedRole) {
        return res.status(400).json({ message: "Role is required" });
      }

      // Get account name for storage
      const account = await storage.getCustomer(accountId);
      if (!account) {
        return res.status(400).json({ message: "Account not found" });
      }

      // Generate unique code with custom prefix
      const code = storage.generateRandomAccessCode(8, prefix.toUpperCase());

      // Calculate expiration date (null when bypassing limits)
      let expiresAt: Date | null = null;
      if (!isBypass) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiresInDays);
      }

      // Optional per-code domain targeting (subset of the account's domains).
      // Empty / missing = valid for ALL of the account's approved domains.
      const codeDomains = Array.isArray(req.body.domains)
        ? req.body.domains.map((d: any) => String(d).toLowerCase().trim()).filter(Boolean)
        : [];

      const newCode = await storage.createAccessCode({
        code,
        associatedAccountId: accountId,
        associatedAccountName: account.accountName,
        assignedRole,
        description: description || null,
        maxUses: isBypass ? 1 : maxUses,
        expiresAt,
        bypassLimits: isBypass,
        domains: codeDomains.length > 0 ? codeDomains : null,
        createdBy: req.session.user.id
      });

      res.json({
        ...newCode,
        accountName: account.accountName,
        currentUses: 0
      });
    } catch (error: any) {
      console.error("Error creating access code:", error);
      res.status(500).json({ message: "Failed to create access code" });
    }
  });

  // PUT /api/admin/access-codes/:id - Edit an existing access code
  app.put("/api/admin/access-codes/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;
      if (userRole !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id as string);
      const { accountId, description, maxUses, expiresInDays, assignedRole, bypassLimits } = req.body;
      const isBypass = bypassLimits === true;

      const existing = await storage.getAccessCodeById(id);
      if (!existing) {
        return res.status(404).json({ message: "Access code not found" });
      }

      if (!assignedRole) {
        return res.status(400).json({ message: "Role is required" });
      }

      if (!isBypass) {
        if (!maxUses || maxUses < 1 || maxUses > 20) {
          return res.status(400).json({ message: "Max uses must be between 1 and 20" });
        }
        if (!expiresInDays || expiresInDays < 1 || expiresInDays > 30) {
          return res.status(400).json({ message: "Expires in days must be between 1 and 30" });
        }
      }

      // Resolve account (optional change). The code string itself stays stable.
      let associatedAccountId = existing.associatedAccountId;
      let associatedAccountName = existing.associatedAccountName;
      if (accountId && accountId !== existing.associatedAccountId) {
        const account = await storage.getCustomer(accountId);
        if (!account) {
          return res.status(400).json({ message: "Account not found" });
        }
        associatedAccountId = account.id;
        associatedAccountName = account.accountName;
      }

      // Recompute expiry: null when bypassing, otherwise now + days.
      let expiresAt: Date | null = null;
      if (!isBypass) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiresInDays);
      }

      const codeDomains = Array.isArray(req.body.domains)
        ? req.body.domains.map((d: any) => String(d).toLowerCase().trim()).filter(Boolean)
        : [];

      const updated = await storage.updateAccessCode(
        id,
        {
          associatedAccountId,
          associatedAccountName,
          assignedRole,
          description: description ?? null,
          maxUses: isBypass ? existing.maxUses : maxUses,
          expiresAt,
          bypassLimits: isBypass,
          domains: codeDomains.length > 0 ? codeDomains : null,
        } as any,
        req.session.user.id
      );

      res.json(updated);
    } catch (error: any) {
      console.error("Error updating access code:", error);
      res.status(500).json({ message: "Failed to update access code" });
    }
  });

  // PATCH /api/admin/access-codes/:id/deactivate - Deactivate an access code
  app.patch("/api/admin/access-codes/:id/deactivate", isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;
      if (userRole !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id as string);
      const deactivated = await storage.deactivateAccessCode(id, req.session.user.id);

      if (!deactivated) {
        return res.status(404).json({ message: "Access code not found" });
      }

      res.json({ message: "Access code deactivated", code: deactivated });
    } catch (error: any) {
      console.error("Error deactivating access code:", error);
      res.status(500).json({ message: "Failed to deactivate access code" });
    }
  });

  // PATCH /api/admin/access-codes/:id/reactivate - Reactivate an inactive access code
  app.patch("/api/admin/access-codes/:id/reactivate", isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;
      if (userRole !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id as string);
      const reactivated = await storage.reactivateAccessCode(id, req.session.user.id);

      if (!reactivated) {
        return res.status(404).json({ message: "Access code not found" });
      }

      res.json({ message: "Access code reactivated", code: reactivated });
    } catch (error: any) {
      console.error("Error reactivating access code:", error);
      res.status(500).json({ message: "Failed to reactivate access code" });
    }
  });

  // GET /api/admin/access-codes/:id/usage - Get users who used this access code
  app.get("/api/admin/access-codes/:id/usage", isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;
      if (userRole !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id as string);

      // Get users who registered with this access code using numeric id directly
      const users = await storage.getUsersByAccessCodeId(id);

      res.json(users);
    } catch (error: any) {
      console.error("Error fetching access code usage:", error);
      res.status(500).json({ message: "Failed to fetch access code usage" });
    }
  });

  // DELETE /api/admin/access-codes/:id - Delete an access code
  app.delete("/api/admin/access-codes/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;
      if (userRole !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id as string);
      const deleted = await storage.deleteAccessCode(id, req.session.user.id);

      if (!deleted) {
        return res.status(404).json({ message: "Access code not found" });
      }

      res.json({ message: "Access code deleted" });
    } catch (error: any) {
      console.error("Error deleting access code:", error);
      res.status(500).json({ message: "Failed to delete access code" });
    }
  });

  // POST /api/validate-access-code - Public endpoint to validate access code for registration
  app.post("/api/validate-access-code", async (req, res) => {
    try {
      const { code } = req.body;

      if (!code || typeof code !== 'string') {
        return res.status(400).json({ valid: false, message: "Access code is required" });
      }

      // Find the access code
      const accessCode = await storage.getAccessCodeByCode(code.toUpperCase().trim());

      if (!accessCode) {
        return res.status(404).json({ valid: false, message: "Invalid access code" });
      }

      // Check if active
      if (!accessCode.isActive) {
        return res.status(400).json({ valid: false, message: "This access code has been deactivated" });
      }

      // bypassLimits codes ignore both the expiry window and the max-uses cap.
      if (!accessCode.bypassLimits) {
        // Check if expired
        if (accessCode.expiresAt && new Date(accessCode.expiresAt) < new Date()) {
          return res.status(400).json({ valid: false, message: "This access code has expired" });
        }

        // Check if max uses reached
        if (accessCode.maxUses && accessCode.usesCount >= accessCode.maxUses) {
          return res.status(400).json({ valid: false, message: "This access code has reached its maximum usage limit" });
        }
      }

      // Get account name + internal flag — either from access code or fetch from customers table
      let accountName = accessCode.associatedAccountName;
      let isInternal = false;
      if (accessCode.associatedAccountId) {
        const account = await storage.getCustomer(accessCode.associatedAccountId);
        if (account) {
          if (!accountName) accountName = account.accountName;
          isInternal = (account as any).isInternal === true;
        }
      }

      // Return validated code info (without sensitive details)
      res.json({
        valid: true,
        accountId: accessCode.associatedAccountId,
        accountName: accountName || "Unknown Account",
        assignedRole: accessCode.assignedRole,
        isInternal,
        codeId: accessCode.id
      });
    } catch (error: any) {
      console.error("Error validating access code:", error);
      res.status(500).json({ valid: false, message: "Failed to validate access code" });
    }
  });
}
