// Products / Criteria / Components / Value Mappings routes (Phase 8
// extraction #25). Massive bundled slice — every solution-side
// taxonomy endpoint:
//
//   /api/public/products              (landing-page unauthenticated)
//   /api/products                     CRUD + setting-inactive
//   /api/criteria + criteria-library  CRUD
//   /api/outcomes + /api/actions      CRUD
//   /api/components                   CRUD
//   /api/value-mappings               (criteria + product variants)
//   /api/relationships                (cross-entity links)
//
// Mechanical sed extraction.
import type { Express } from "express";
import { eq, and, or, desc, ilike } from "drizzle-orm";
import { z } from "zod";
import { storage } from "../storage";
import { requireSectionEdit } from "../lib/section-permissions";
import { db } from "../db";
import {
  productCriteria,
  components,
  productComponents,
  productOutcomes,
  productActions,
  productValueMappings,
  criteriaValueMappings,
  valueMappings,
  criteriaLibrary,
  projects,
  projectCompetitors,
  validationCriteriaTemplates,
  infrastructureProfiles,
  infrastructureDiscoveryDataSchema,
  products,
  users,
  insertSuccessCriteriaSchema,
  insertValidationCriteriaTemplateLinkSchema,
} from "@shared/schema";
import { isAuthenticated } from "../auth/simpleAuth";
import { isExternalRole } from "../lib/internal-access";
import { getExternalUserAccountIds } from "../lib/customer-access";
import { canUseInfrastructureProfiles } from "../lib/infrastructure-profile-access";

// 404 (not 403) for an account or profile the caller may not use, so an
// outside user cannot probe which ids exist.
const PROFILE_NOT_FOUND = { message: "Profile not found" } as const;

/** The profile's account when the caller may use it, else null. */
async function accessibleProfileAccount(req: any, profileId: number): Promise<number | null> {
  const profile = await storage.getInfrastructureProfileRef(profileId);
  if (!profile) return null;
  return (await canUseInfrastructureProfiles(req.session?.user, profile.customerId)) ? profile.customerId : null;
}

// Global Validation Criteria library writes need edit permission on the
// matching Validation Criteria tab, or on the Criteria Builder (Library ›
// Templates), which creates library items and links them. Before this,
// any signed-in user could change or delete library items.
const CRITERIA_BUILDER_SECTION = "template_management.criteria-builder";
const SOLUTIONS_EDIT = requireSectionEdit("success-criteria.solutions", CRITERIA_BUILDER_SECTION);
const COMPONENTS_EDIT = requireSectionEdit("success-criteria.components", CRITERIA_BUILDER_SECTION);
const VALUE_MAPPING_EDIT = requireSectionEdit("success-criteria.value-mapping", CRITERIA_BUILDER_SECTION);
const CRITERIA_EDIT = requireSectionEdit("success-criteria.criteria", CRITERIA_BUILDER_SECTION);
const OUTCOMES_EDIT = requireSectionEdit("success-criteria.outcomes", CRITERIA_BUILDER_SECTION);
const ACTIONS_EDIT = requireSectionEdit("success-criteria.actions", CRITERIA_BUILDER_SECTION);

/**
 * A solution's lucide icon name, or null. Only plain icon names
 * ("ShieldCheck") are stored; anything else clears the icon.
 */
function cleanSolutionIconName(value: unknown): string | null {
  return typeof value === "string" && /^[A-Z][A-Za-z0-9]{0,63}$/.test(value) ? value : null;
}

export function registerProductsCriteriaRoutes(app: Express) {
  // Dedicated public products endpoint for unauthenticated users (landing page registration)
  app.get('/api/public/products', async (req, res) => {
    try {
      // Use the optimized function that gets active products with criteria
      const filteredProducts = await storage.getActiveProductsWithCriteria();
      
      // Ensure response terminates properly with all required headers
      return res.status(200).set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, private, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Products-Filter': 'active+criteriaOnly',
        'X-Env': process.env.NODE_ENV || 'development',
        'X-Auth-Context': req.session?.user ? 'authenticated' : 'unauthenticated',
        'Content-Type': 'application/json',
        'Vary': 'Cookie'
      }).json(filteredProducts);
      
    } catch (error: any) {
      console.error('Error in /api/public/products:', error);
      return res.status(500).set({
        'Content-Type': 'application/json'
      }).json({ message: 'Failed to fetch public products' });
    }
  });

  // Products routes
  app.get('/api/products', async (req, res) => {
    try {
      // Strict boolean parsing to prevent production environment issues
      const showInactive = req.query.showInactive === 'true';
      const criteriaOnly = req.query.criteriaOnly === 'true';
      
      // If criteriaOnly is requested, return only active products with Success Criteria (for public access)
      if (criteriaOnly) {
        console.log('API: Fetching products with criteria only...');
        
        // ENHANCED cache control headers for production environment
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Last-Modified', new Date().toUTCString());
        res.setHeader('ETag', Math.random().toString());
        res.setHeader('Vary', '*');
        
        // PRODUCTION FIX: Always enforce active-only filtering for criteriaOnly requests
        console.log('API: PRODUCTION MODE - Force fetching ACTIVE products only');
        const allActiveProducts = await storage.getProducts(false); // FORCE active only, never show inactive
        const filteredProducts = [];
        
        // Enhanced diagnostic logging for production debugging
        console.log('API: criteriaOnly request - Total active products from DB:', allActiveProducts.length);
        console.log('API: PRODUCTION CHECK - Forcing showInactive=false, received query:', req.query);
        console.log('API: criteriaOnly request - Active products:', allActiveProducts.map(p => `${p.name}(active:${p.isActive})`));
        
        for (const product of allActiveProducts) {
          const criteriaIds = await storage.getLinkedCriteria(product.id);
          if (criteriaIds.length > 0) {
            filteredProducts.push(product);
          }
        }
        
        console.log('API: Found products with criteria:', filteredProducts.length);
        console.log('API: Filtered products with criteria:', filteredProducts.map(p => `${p.name}(active:${p.isActive})`));
        
        // FINAL SAFETY CHECK: Filter out any inactive products that might have slipped through
        const finalProducts = filteredProducts.filter(p => p.isActive === true);
        console.log('API: FINAL SAFETY CHECK - Products after isActive filter:', finalProducts.length);
        console.log('API: FINAL PRODUCTS:', finalProducts.map(p => `${p.name}(active:${p.isActive})`));
        
        return res.json(finalProducts);
      }
      
      // Regular authenticated access with showInactive option
      if (!req.session.user) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      const products = await storage.getProducts(showInactive);
      res.json(products);
    } catch (error: any) {
      console.error("Error fetching products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  // Create new product (Solution)
  app.post('/api/products', isAuthenticated, SOLUTIONS_EDIT, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const { name, abbreviation, description, tags, isActive, isSystem, solutionIcon, solutionIconName, documentationLinkId, docsRepoConfigId } = req.body;

      // Validate required fields
      if (!name || !name.trim()) {
        return res.status(400).json({ message: "Product name is required" });
      }
      if (!abbreviation || !abbreviation.trim()) {
        return res.status(400).json({ message: "Product abbreviation is required" });
      }

      const product = await storage.createProduct({
        name: name.trim(),
        abbreviation: abbreviation.trim(),
        description: description || null,
        tags: tags || [],
        isActive: isActive !== undefined ? isActive : true,
        isSystem: userRole === 'Admin' ? (isSystem === true) : false,
        solutionIcon: solutionIcon || null,
        solutionIconName: cleanSolutionIconName(solutionIconName),
        documentationLinkId: documentationLinkId || null,
        docsRepoConfigId: docsRepoConfigId || null,
        createdBy: userId,
      });

      res.status(201).json(product);
    } catch (error: any) {
      console.error("Error creating product:", error);
      res.status(500).json({ message: "Failed to create product" });
    }
  });

  // Get single product by ID
  app.get('/api/products/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) {
        return res.status(400).json({ message: 'Invalid product ID' });
      }
      const product = await storage.getProductById(id);
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }
      res.json(product);
    } catch (error: any) {
      console.error('Error fetching product:', error);
      res.status(500).json({ message: 'Failed to fetch product' });
    }
  });

  // PATCH endpoint for setting product (solution) inactive
  app.patch('/api/products/:id', isAuthenticated, SOLUTIONS_EDIT, async (req: any, res) => {
    try {
      const productId = parseInt(req.params.id as string);
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const updates = { ...req.body };

      // Validate that we have at least one field to update
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No fields to update" });
      }

      // Prevent non-Admins from editing isSystem items
      const existingProduct = await storage.getProductById(productId);
      if (existingProduct?.isSystem && userRole !== 'Admin') {
        return res.status(403).json({ message: "Only Admins can modify system items" });
      }

      // Only Admins can set isSystem
      if (updates.isSystem !== undefined && userRole !== 'Admin') {
        delete updates.isSystem;
      }

      if (updates.solutionIconName !== undefined) {
        updates.solutionIconName = cleanSolutionIconName(updates.solutionIconName);
      }

      updates.updatedBy = userId;

      const product = await storage.updateProduct(productId, updates);
      res.json(product);
    } catch (error: any) {
      console.error("Error updating product:", error);
      res.status(500).json({ message: "Failed to update product" });
    }
  });

  // Delete product (Solution) with cascade deletion of related success criteria
  app.delete('/api/products/:id', isAuthenticated, SOLUTIONS_EDIT, async (req: any, res) => {
    try {
      const productId = parseInt(req.params.id as string);
      const userId = req.session.user.id;
      const userRole = req.session.user.role;

      // Get product first to log activity
      const product = await storage.getProductById(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Prevent non-Admins from deleting isSystem items
      if (product.isSystem && userRole !== 'Admin') {
        return res.status(403).json({ message: "Only Admins can delete system items" });
      }

      // Pre-check: find all references before attempting deletion
      // Escape SQL wildcard characters in the product name to prevent false-positive matches
      const escapedProductName = product.name.replace(/[%_\\]/g, '\\$&');
      const [solutionNameProjectRefs, competitorProjectRefs, vcLibraryComponentRefs, templateRefs] = await Promise.all([
        // Active projects that list this solution as their primary solution by name.
        // solutionName is a comma-separated string (e.g. "Acme Auditor, PolicyPak").
        // Delimiter-aware matching: check exact, first, last, and middle token positions
        // with patterns for both ", " (current save format) and "," (legacy/no-space).
        db.select({ id: projects.id, name: projects.name })
          .from(projects)
          .where(and(
            eq((projects as any).isActive, true),
            or(
              ilike(projects.solutionName, escapedProductName),               // exact / only value
              ilike(projects.solutionName, `${escapedProductName},%`),        // first token (no-space)
              ilike(projects.solutionName, `${escapedProductName}, %`),       // first token (with space)
              ilike(projects.solutionName, `%,${escapedProductName}`),        // last token (no-space)
              ilike(projects.solutionName, `%, ${escapedProductName}`),       // last token (with space)
              ilike(projects.solutionName, `%,${escapedProductName},%`),      // middle (no-space)
              ilike(projects.solutionName, `%, ${escapedProductName},%`),     // middle (with space)
              ilike(projects.solutionName, `%, ${escapedProductName}, %`),    // middle (both spaces)
            ),
          )),
        // Projects that reference this solution via project_competitors (FK NO ACTION)
        db.select({ id: projects.id, name: projects.name })
          .from(projectCompetitors)
          .innerJoin(projects, eq(projectCompetitors.projectId, projects.id))
          .where(eq(projectCompetitors.solutionId, productId)),
        // components.solution_id is NOT NULL with NO ACTION — blocks delete if rows exist
        db.select({ id: components.id, name: components.name })
          .from(components)
          .where(eq(components.solutionId, productId)),
        // validation_criteria_templates.root_solution_id references this solution
        db.select({ id: validationCriteriaTemplates.id, name: validationCriteriaTemplates.name })
          .from(validationCriteriaTemplates)
          .where(eq(validationCriteriaTemplates.rootSolutionId, productId)),
      ]);

      // Merge project refs from both sources, deduplicating by project ID
      const allProjectRefs = [...new Map(
        [...solutionNameProjectRefs, ...competitorProjectRefs].map(r => [r.id, r])
      ).values()];

      if (allProjectRefs.length > 0 || vcLibraryComponentRefs.length > 0 || templateRefs.length > 0) {
        const parts: string[] = [];
        const referencesPayload: Record<string, string[]> = {};
        if (allProjectRefs.length > 0) {
          const names = allProjectRefs.map(r => r.name || "Unnamed Project");
          parts.push(`Projects: ${names.join(", ")}`);
          referencesPayload.projects = names;
        }
        if (vcLibraryComponentRefs.length > 0) {
          const names = vcLibraryComponentRefs.map(c => c.name || `#${c.id}`);
          parts.push(`Components: ${names.join(", ")}`);
          referencesPayload.components = names;
        }
        if (templateRefs.length > 0) {
          const names = templateRefs.map(t => t.name || `Template #${t.id}`);
          parts.push(`Templates: ${names.join(", ")}`);
          referencesPayload.templates = names;
        }
        return res.status(400).json({
          message: `Cannot delete solution: It is still referenced in ${parts.join("; ")}. Please remove all references before deleting.`,
          references: referencesPayload,
        });
      }

      // Auto-clean library junction rows (safe to remove — these are library config links)
      await Promise.all([
        db.delete(productCriteria).where(eq(productCriteria.productId, productId)),
        db.delete(productComponents).where(eq(productComponents.productId, productId)),
        db.delete(productOutcomes).where(eq(productOutcomes.productId, productId)),
        db.delete(productActions).where(eq(productActions.productId, productId)),
        db.delete(productValueMappings).where(eq(productValueMappings.productId, productId)),
      ]);

      // Delete all success criteria that reference this product
      await storage.deleteSuccessCriteriaByProduct(product.name);

      // Delete the product itself
      await storage.deleteProduct(productId);

      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting product:", error);

      // Check if this is a foreign key constraint error
      if (error.code === '23503') {
        return res.status(400).json({
          message: "Cannot delete solution: This solution is still referenced by other data. Please remove all references before deleting."
        });
      }

      res.status(500).json({ message: "Failed to delete solution due to an unexpected error" });
    }
  });

  // PATCH endpoints for setting items inactive
  app.patch('/api/criteria/:id', isAuthenticated, CRITERIA_EDIT, async (req: any, res) => {
    try {
      const criteriaId = parseInt(req.params.id as string);
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const updates = { ...req.body };

      // Validate that we have at least one field to update
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No fields to update" });
      }

      // Prevent non-Admins from editing isSystem items
      const existingCriteria = await storage.getCriteriaById(criteriaId);
      if (existingCriteria?.isSystem && userRole !== 'Admin') {
        return res.status(403).json({ message: "Only Admins can modify system items" });
      }

      // Only Admins can set isSystem
      if (updates.isSystem !== undefined && userRole !== 'Admin') {
        delete updates.isSystem;
      }

      updates.updatedBy = userId;

      const criteria = await storage.updateCriteria(criteriaId, updates);

      res.json(criteria);
    } catch (error: any) {
      console.error("Error updating criteria:", error);
      res.status(500).json({ message: "Failed to update criteria" });
    }
  });

  app.patch('/api/outcomes/:id', isAuthenticated, OUTCOMES_EDIT, async (req: any, res) => {
    try {
      const outcomeId = parseInt(req.params.id as string);
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const updates = { ...req.body };

      // Validate that we have at least one field to update
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No fields to update" });
      }

      // Prevent non-Admins from editing isSystem items
      const existingOutcome = await storage.getOutcomeById(outcomeId);
      if (existingOutcome?.isSystem && userRole !== 'Admin') {
        return res.status(403).json({ message: "Only Admins can modify system items" });
      }

      // Only Admins can set isSystem
      if (updates.isSystem !== undefined && userRole !== 'Admin') {
        delete updates.isSystem;
      }

      updates.updatedBy = userId;

      const outcome = await storage.updateOutcome(outcomeId, updates);

      res.json(outcome);
    } catch (error: any) {
      console.error("Error updating outcome:", error);
      res.status(500).json({ message: "Failed to update outcome" });
    }
  });

  app.patch('/api/actions/:id', isAuthenticated, ACTIONS_EDIT, async (req: any, res) => {
    try {
      const actionId = parseInt(req.params.id as string);
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const updates = { ...req.body };

      // Validate that we have at least one field to update
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No fields to update" });
      }

      // Prevent non-Admins from editing isSystem items
      const existingAction = await storage.getActionById(actionId);
      if (existingAction?.isSystem && userRole !== 'Admin') {
        return res.status(403).json({ message: "Only Admins can modify system items" });
      }

      // Only Admins can set isSystem
      if (updates.isSystem !== undefined && userRole !== 'Admin') {
        delete updates.isSystem;
      }

      updates.updatedBy = userId;

      const action = await storage.updateAction(actionId, updates);

      res.json(action);
    } catch (error: any) {
      console.error("Error updating action:", error);
      res.status(500).json({ message: "Failed to update action" });
    }
  });

  // Usage checking endpoints
  app.get('/api/criteria/:id/usage', isAuthenticated, async (req: any, res) => {
    try {
      const criteriaId = parseInt(req.params.id as string);
      const projects = await storage.getProjectsUsingCriteria(criteriaId);

      res.json({
        isUsed: projects.length > 0,
        projects: projects,
        count: projects.length
      });
    } catch (error: any) {
      console.error("Error checking criteria usage:", error);
      res.status(500).json({ message: "Failed to check criteria usage" });
    }
  });

  app.get('/api/outcomes/:id/usage', isAuthenticated, async (req: any, res) => {
    try {
      const outcomeId = parseInt(req.params.id as string);
      const projects = await storage.getProjectsUsingOutcome(outcomeId);

      res.json({
        isUsed: projects.length > 0,
        projects: projects,
        count: projects.length
      });
    } catch (error: any) {
      console.error("Error checking outcome usage:", error);
      res.status(500).json({ message: "Failed to check outcome usage" });
    }
  });

  app.get('/api/actions/:id/usage', isAuthenticated, async (req: any, res) => {
    try {
      const actionId = parseInt(req.params.id as string);
      const projects = await storage.getProjectsUsingAction(actionId);

      res.json({
        isUsed: projects.length > 0,
        projects: projects,
        count: projects.length
      });
    } catch (error: any) {
      console.error("Error checking action usage:", error);
      res.status(500).json({ message: "Failed to check action usage" });
    }
  });



  // =============================================================================
  // INFRASTRUCTURE PROFILES ROUTES (Multi-Profile Infrastructure Intelligence)
  // =============================================================================

  // Per-account summary: profile count and the default profile's name. The
  // Account Directory and the project form show the Infrastructure Discovery
  // icon bold, with the default profile's name, for accounts listed here.
  // Outside users only get the accounts they belong to.
  app.get("/api/infrastructure-profiles/summary", isAuthenticated, async (req: any, res) => {
    try {
      const viewer = req.session.user as { id?: string; role?: string; email?: string } | undefined;
      if (!viewer?.role || isExternalRole(viewer.role)) {
        const accountIds = viewer?.id ? await getExternalUserAccountIds(viewer.id, viewer.email) : [];
        return res.json(await storage.getInfrastructureProfileSummaries(accountIds));
      }
      res.json(await storage.getInfrastructureProfileSummaries());
    } catch (error: unknown) {
      console.error("Error fetching infrastructure profile summary:", error);
      res.status(500).json({ message: "Failed to fetch infrastructure profile summary" });
    }
  });

  // Get all profiles for a customer
  app.get("/api/customers/:customerId/infrastructure-profiles", isAuthenticated, async (req: any, res) => {
    try {
      const customerId = parseInt(req.params.customerId as string);
      if (isNaN(customerId)) {
        return res.status(400).json({ message: "Invalid customer ID" });
      }
      if (!(await canUseInfrastructureProfiles(req.session?.user, customerId))) {
        return res.status(404).json({ message: "Customer not found" });
      }

      const profiles = await db
        .select({
          id: infrastructureProfiles.id,
          customerId: infrastructureProfiles.customerId,
          profileName: infrastructureProfiles.profileName,
          isDefault: infrastructureProfiles.isDefault,
          discoveryData: infrastructureProfiles.discoveryData,
          createdBy: infrastructureProfiles.createdBy,
          createdAt: infrastructureProfiles.createdAt,
          updatedAt: infrastructureProfiles.updatedAt,
        })
        .from(infrastructureProfiles)
        .where(eq(infrastructureProfiles.customerId, customerId))
        .orderBy(desc(infrastructureProfiles.isDefault), infrastructureProfiles.profileName);

      // Enrich with creator info
      const enrichedProfiles = await Promise.all(
        profiles.map(async (profile) => {
          const creator = await db
            .select({ firstName: users.firstName, lastName: users.lastName })
            .from(users)
            .where(eq(users.id, profile.createdBy))
            .limit(1);
          return {
            ...profile,
            creatorName: creator[0] ? `${creator[0].firstName} ${creator[0].lastName}` : "Unknown",
          };
        })
      );

      res.json(enrichedProfiles);
    } catch (error: any) {
      console.error("Error fetching infrastructure profiles:", error);
      res.status(500).json({ message: "Failed to fetch infrastructure profiles" });
    }
  });

  // Create a new infrastructure profile
  app.post("/api/customers/:customerId/infrastructure-profiles", isAuthenticated, async (req: any, res) => {
    try {
      const customerId = parseInt(req.params.customerId as string);
      const userId = req.session.user.id;

      if (isNaN(customerId)) {
        return res.status(400).json({ message: "Invalid customer ID" });
      }
      if (!(await canUseInfrastructureProfiles(req.session?.user, customerId))) {
        return res.status(404).json({ message: "Customer not found" });
      }

      const { profileName, isDefault, discoveryData } = req.body;

      if (!profileName || profileName.trim() === "") {
        return res.status(400).json({ message: "Profile name is required" });
      }

      // Validate discoveryData against Zod schema if provided
      if (discoveryData !== undefined) {
        // discoveryData must be an object (null, arrays, primitives are invalid)
        if (discoveryData === null || typeof discoveryData !== 'object' || Array.isArray(discoveryData)) {
          return res.status(400).json({ message: "Discovery data must be an object" });
        }
        const validationResult = infrastructureDiscoveryDataSchema.safeParse(discoveryData);
        if (!validationResult.success) {
          return res.status(400).json({ 
            message: "Invalid discovery data format",
            errors: validationResult.error.flatten().fieldErrors 
          });
        }
      }

      // If this profile should be default, unset other defaults first
      if (isDefault) {
        await db
          .update(infrastructureProfiles)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(eq(infrastructureProfiles.customerId, customerId));
      }

      const [newProfile] = await db
        .insert(infrastructureProfiles)
        .values({
          customerId,
          profileName: profileName.trim(),
          isDefault: isDefault || false,
          discoveryData: discoveryData || {},
          createdBy: userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      res.status(201).json(newProfile);
    } catch (error: any) {
      console.error("Error creating infrastructure profile:", error);
      res.status(500).json({ message: "Failed to create infrastructure profile" });
    }
  });

  // Update an infrastructure profile
  app.patch("/api/infrastructure-profiles/:id", isAuthenticated, async (req: any, res) => {
    try {
      const profileId = parseInt(req.params.id as string);

      if (isNaN(profileId)) {
        return res.status(400).json({ message: "Invalid profile ID" });
      }
      if ((await accessibleProfileAccount(req, profileId)) === null) {
        return res.status(404).json(PROFILE_NOT_FOUND);
      }

      const { profileName, discoveryData } = req.body;

      const updates: any = { updatedAt: new Date() };
      if (profileName !== undefined) {
        if (profileName.trim() === "") {
          return res.status(400).json({ message: "Profile name cannot be empty" });
        }
        updates.profileName = profileName.trim();
      }
      if (discoveryData !== undefined) {
        // discoveryData must be an object (null, arrays, primitives are invalid)
        if (discoveryData === null || typeof discoveryData !== 'object' || Array.isArray(discoveryData)) {
          return res.status(400).json({ message: "Discovery data must be an object" });
        }
        const validationResult = infrastructureDiscoveryDataSchema.safeParse(discoveryData);
        if (!validationResult.success) {
          return res.status(400).json({ 
            message: "Invalid discovery data format",
            errors: validationResult.error.flatten().fieldErrors 
          });
        }
        updates.discoveryData = discoveryData;
      }

      const [updatedProfile] = await db
        .update(infrastructureProfiles)
        .set(updates)
        .where(eq(infrastructureProfiles.id, profileId))
        .returning();

      if (!updatedProfile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      res.json(updatedProfile);
    } catch (error: any) {
      console.error("Error updating infrastructure profile:", error);
      res.status(500).json({ message: "Failed to update infrastructure profile" });
    }
  });

  // Set a profile as default (and unset others for that customer)
  app.put("/api/infrastructure-profiles/:id/default", isAuthenticated, async (req: any, res) => {
    try {
      const profileId = parseInt(req.params.id as string);

      if (isNaN(profileId)) {
        return res.status(400).json({ message: "Invalid profile ID" });
      }
      if ((await accessibleProfileAccount(req, profileId)) === null) {
        return res.status(404).json(PROFILE_NOT_FOUND);
      }

      // Get the profile to find its customer
      const [profile] = await db
        .select()
        .from(infrastructureProfiles)
        .where(eq(infrastructureProfiles.id, profileId))
        .limit(1);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      // Unset all defaults for this customer
      await db
        .update(infrastructureProfiles)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(infrastructureProfiles.customerId, profile.customerId));

      // Set this profile as default
      const [updatedProfile] = await db
        .update(infrastructureProfiles)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(infrastructureProfiles.id, profileId))
        .returning();

      res.json(updatedProfile);
    } catch (error: any) {
      console.error("Error setting default infrastructure profile:", error);
      res.status(500).json({ message: "Failed to set default profile" });
    }
  });

  // Delete an infrastructure profile
  app.delete("/api/infrastructure-profiles/:id", isAuthenticated, async (req: any, res) => {
    try {
      const profileId = parseInt(req.params.id as string);

      if (isNaN(profileId)) {
        return res.status(400).json({ message: "Invalid profile ID" });
      }
      if ((await accessibleProfileAccount(req, profileId)) === null) {
        return res.status(404).json(PROFILE_NOT_FOUND);
      }

      // First, get the profile to check if it's the default
      const [profileToDelete] = await db
        .select()
        .from(infrastructureProfiles)
        .where(eq(infrastructureProfiles.id, profileId))
        .limit(1);

      if (!profileToDelete) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const customerId = profileToDelete.customerId;
      const wasDefault = profileToDelete.isDefault;

      // Delete the profile
      await db
        .delete(infrastructureProfiles)
        .where(eq(infrastructureProfiles.id, profileId));

      // If deleted profile was default, reassign default to another profile
      if (wasDefault) {
        const remainingProfiles = await db
          .select()
          .from(infrastructureProfiles)
          .where(eq(infrastructureProfiles.customerId, customerId))
          .orderBy(infrastructureProfiles.createdAt)
          .limit(1);

        if (remainingProfiles.length > 0) {
          await db
            .update(infrastructureProfiles)
            .set({ isDefault: true, updatedAt: new Date() })
            .where(eq(infrastructureProfiles.id, remainingProfiles[0].id));
        }
      }

      res.json({ message: "Profile deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting infrastructure profile:", error);
      res.status(500).json({ message: "Failed to delete infrastructure profile" });
    }
  });

  // Components routes (optional layer between Solutions and Criteria)
  app.get("/api/components", isAuthenticated, async (req, res) => {
    try {
      const { showInactive, solutionId } = req.query;
      const components = await storage.getComponents(
        showInactive === 'true',
        solutionId ? parseInt(solutionId as string) : undefined
      );
      res.json(components);
    } catch (error: any) {
      console.error("Error fetching components:", error);
      res.status(500).json({ message: "Failed to fetch components" });
    }
  });

  app.post("/api/components", isAuthenticated, COMPONENTS_EDIT, async (req: any, res) => {
    try {
      const { name, description, solutionIds, isAllSolutions, isActive, isSystem } = req.body;
      const userId = req.session.user.id;
      const userRole = req.session.user.role;

      if (!name) {
        return res.status(400).json({ message: "Name is required" });
      }

      // solutionIds should be an array (non-All Solutions entities only)
      const parsedSolutionIds = Array.isArray(solutionIds) 
        ? solutionIds.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id))
        : [];

      const component = await storage.createComponent({
        name,
        description: description || null,
        solutionIds: parsedSolutionIds,
        isAllSolutions: isAllSolutions === true,
        isActive: isActive !== false,
        isSystem: userRole === 'Admin' ? (isSystem === true) : false,
        createdBy: userId
      });

      res.status(201).json(component);
    } catch (error: any) {
      console.error("Error creating component:", error);
      res.status(500).json({ message: "Failed to create component" });
    }
  });

  app.put("/api/components/:id", isAuthenticated, COMPONENTS_EDIT, async (req: any, res) => {
    try {
      const componentId = parseInt(req.params.id as string);
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const { name, description, solutionIds, isAllSolutions, isActive, isSystem } = req.body;

      // Prevent non-Admins from editing isSystem items
      const existingComponentForPut = await storage.getComponentById(componentId);
      if (existingComponentForPut?.isSystem && userRole !== 'Admin') {
        return res.status(403).json({ message: "Only Admins can modify system items" });
      }

      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (isAllSolutions !== undefined) updates.isAllSolutions = isAllSolutions;
      if (solutionIds !== undefined) {
        updates.solutionIds = Array.isArray(solutionIds)
          ? solutionIds.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id))
          : [];
      }
      if (isActive !== undefined) updates.isActive = isActive;
      if (isSystem !== undefined && userRole === 'Admin') updates.isSystem = isSystem;
      updates.updatedBy = userId;

      const component = await storage.updateComponent(componentId, updates);
      res.json(component);
    } catch (error: any) {
      console.error("Error updating component:", error);
      res.status(500).json({ message: "Failed to update component" });
    }
  });

  app.patch("/api/components/:id", isAuthenticated, COMPONENTS_EDIT, async (req: any, res) => {
    try {
      const componentId = parseInt(req.params.id as string);
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const { name, description, solutionIds, isAllSolutions, isActive, isSystem } = req.body;

      // Prevent non-Admins from editing isSystem items
      const existingComponent = await storage.getComponentById(componentId);
      if (existingComponent?.isSystem && userRole !== 'Admin') {
        return res.status(403).json({ message: "Only Admins can modify system items" });
      }

      // Validate required fields cannot be null
      if (name !== undefined && (name === null || name.trim() === "")) {
        return res.status(400).json({ message: "Name cannot be empty" });
      }

      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (isAllSolutions !== undefined) updates.isAllSolutions = isAllSolutions;
      if (solutionIds !== undefined) {
        updates.solutionIds = Array.isArray(solutionIds)
          ? solutionIds.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id))
          : [];
      }
      if (isActive !== undefined) updates.isActive = isActive;
      if (isSystem !== undefined && userRole === 'Admin') updates.isSystem = isSystem;
      updates.updatedBy = userId;

      const component = await storage.updateComponent(componentId, updates);
      res.json(component);
    } catch (error: any) {
      console.error("Error updating component:", error);
      res.status(500).json({ message: "Failed to update component" });
    }
  });

  app.delete("/api/components/:id", isAuthenticated, COMPONENTS_EDIT, async (req: any, res) => {
    try {
      const componentId = parseInt(req.params.id as string);
      const userRole = req.session.user.role;

      // Prevent non-Admins from deleting isSystem items
      const existingComponent = await storage.getComponentById(componentId);
      if (existingComponent?.isSystem && userRole !== 'Admin') {
        return res.status(403).json({ message: "Only Admins can delete system items" });
      }

      // Pre-check: find which solutions currently use this component
      const productRefs = await db
        .select({ id: products.id, name: products.name })
        .from(productComponents)
        .innerJoin(products, eq(productComponents.productId, products.id))
        .where(eq(productComponents.componentId, componentId));

      if (productRefs.length > 0) {
        const names = productRefs.map(p => p.name || `Solution #${p.id}`);
        return res.status(400).json({
          message: `Cannot delete component: It is still assigned to solution(s). Please remove all assignments before deleting.`,
          references: { products: names },
        });
      }

      // No blocking references — safe to delete
      await storage.deleteComponent(componentId);

      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting component:", error);
      if (error.code === '23503') {
        return res.status(400).json({ message: "Cannot delete component: It is still referenced by other data. Please remove all references before deleting." });
      }
      res.status(500).json({ message: "Failed to delete component" });
    }
  });

  // Success Criteria Library routes
  app.get("/api/criteria", isAuthenticated, async (req, res) => {
    try {
      const { showInactive } = req.query;
      const criteria = await storage.getCriteria(showInactive === 'true');
      res.json(criteria);
    } catch (error: any) {
      console.error('Error fetching criteria:', error);
      res.status(500).json({ message: 'Failed to fetch criteria' });
    }
  });

  app.get("/api/outcomes", isAuthenticated, async (req, res) => {
    try {
      const { showInactive } = req.query;
      const outcomes = await storage.getOutcomes(showInactive === 'true');
      res.json(outcomes);
    } catch (error: any) {
      console.error("Error fetching outcomes:", error);
      res.status(500).json({ message: "Failed to fetch outcomes" });
    }
  });

  app.get("/api/actions", isAuthenticated, async (req, res) => {
    try {
      const { showInactive } = req.query;
      const actions = await storage.getActions(showInactive === 'true');
      res.json(actions);
    } catch (error: any) {
      console.error("Error fetching actions:", error);
      res.status(500).json({ message: "Failed to fetch actions" });
    }
  });

  // Criteria counts endpoint - MUST be before /api/criteria/:id to avoid route conflict
  app.get("/api/criteria/counts", isAuthenticated, async (req, res) => {
    try {
      const criteriaCounts = await storage.getCriteriaCounts();
      res.json(criteriaCounts);
    } catch (error: any) {
      console.error("Error fetching criteria counts:", error);
      res.status(500).json({ message: "Failed to fetch criteria counts" });
    }
  });

  app.get("/api/criteria/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid criteria ID" });
      }
      const criteria = await storage.getCriteriaById(id);
      if (!criteria) {
        return res.status(404).json({ message: "Criteria not found" });
      }
      res.json(criteria);
    } catch (error: any) {
      console.error("Error fetching criteria:", error);
      res.status(500).json({ message: "Failed to fetch criteria" });
    }
  });

  app.get("/api/outcomes/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid outcome ID" });
      }
      const outcome = await storage.getOutcomeById(id);
      if (!outcome) {
        return res.status(404).json({ message: "Outcome not found" });
      }
      res.json(outcome);
    } catch (error: any) {
      console.error("Error fetching outcome:", error);
      res.status(500).json({ message: "Failed to fetch outcome" });
    }
  });

  app.get("/api/actions/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid action ID" });
      }
      const action = await storage.getActionById(id);
      if (!action) {
        return res.status(404).json({ message: "Action not found" });
      }
      res.json(action);
    } catch (error: any) {
      console.error("Error fetching action:", error);
      res.status(500).json({ message: "Failed to fetch action" });
    }
  });

  app.post("/api/criteria", isAuthenticated, CRITERIA_EDIT, async (req: any, res) => {
    try {
      const { name, description, solutionIds, isAllSolutions, isSystem } = req.body;
      const userId = req.session.user.id;
      const userRole = req.session.user.role;

      if (!name) {
        return res.status(400).json({ message: "Name is required" });
      }

      const criteria = await storage.createCriteria({
        name,
        description: description || null,
        createdBy: userId,
        solutionIds: solutionIds || [],
        isAllSolutions: isAllSolutions === true,
        isSystem: userRole === 'Admin' ? (isSystem === true) : false,
      });

      res.status(201).json(criteria);
    } catch (error: any) {
      console.error("Error creating criteria:", error);
      res.status(500).json({ message: "Failed to create criteria" });
    }
  });

  app.post("/api/outcomes", isAuthenticated, OUTCOMES_EDIT, async (req: any, res) => {
    try {
      const { name, description, solutionIds, isAllSolutions, isSystem } = req.body;
      const userId = req.session.user.id;
      const userRole = req.session.user.role;

      if (!name) {
        return res.status(400).json({ message: "Name is required" });
      }

      const outcome = await storage.createOutcome({
        name,
        description: description || null,
        createdBy: userId,
        solutionIds: solutionIds || [],
        isAllSolutions: isAllSolutions === true,
        isSystem: userRole === 'Admin' ? (isSystem === true) : false,
      });

      res.status(201).json(outcome);
    } catch (error: any) {
      console.error("Error creating outcome:", error);
      res.status(500).json({ message: "Failed to create outcome" });
    }
  });

  app.post("/api/actions", isAuthenticated, ACTIONS_EDIT, async (req: any, res) => {
    try {
      const { name, description, solutionIds, isAllSolutions, isSystem } = req.body;
      const userId = req.session.user.id;
      const userRole = req.session.user.role;

      if (!name) {
        return res.status(400).json({ message: "Name is required" });
      }

      const action = await storage.createAction({
        name,
        description: description || null,
        createdBy: userId,
        solutionIds: solutionIds || [],
        isAllSolutions: isAllSolutions === true,
        isSystem: userRole === 'Admin' ? (isSystem === true) : false,
      });

      res.status(201).json(action);
    } catch (error: any) {
      console.error("Error creating action:", error);
      res.status(500).json({ message: "Failed to create action" });
    }
  });

  app.delete("/api/criteria/:id", isAuthenticated, CRITERIA_EDIT, async (req: any, res) => {
    try {
      const criteriaId = parseInt(req.params.id as string);
      const userRole = req.session.user.role;

      // Prevent non-Admins from deleting isSystem items
      const existingCriteria = await storage.getCriteriaById(criteriaId);
      if (existingCriteria?.isSystem && userRole !== 'Admin') {
        return res.status(403).json({ message: "Only Admins can delete system items" });
      }

      // Pre-check: find which solutions currently use this criteria, and any linked value mappings
      const [productRefs, valueMappingRefs] = await Promise.all([
        db.select({ id: products.id, name: products.name })
          .from(productCriteria)
          .innerJoin(products, eq(productCriteria.productId, products.id))
          .where(eq(productCriteria.criteriaId, criteriaId)),
        db.select({ id: valueMappings.id, name: valueMappings.name })
          .from(criteriaValueMappings)
          .innerJoin(valueMappings, eq(criteriaValueMappings.valueMappingId, valueMappings.id))
          .where(eq(criteriaValueMappings.criteriaId, criteriaId)),
      ]);

      if (productRefs.length > 0 || valueMappingRefs.length > 0) {
        const parts: string[] = [];
        const referencesPayload: Record<string, string[]> = {};
        if (productRefs.length > 0) {
          const names = productRefs.map(p => p.name || `Solution #${p.id}`);
          parts.push(`Solutions: ${names.join(", ")}`);
          referencesPayload.products = names;
        }
        if (valueMappingRefs.length > 0) {
          const names = valueMappingRefs.map(v => v.name || `Value Mapping #${v.id}`);
          parts.push(`Value Mappings: ${names.join(", ")}`);
          referencesPayload.valueMappings = names;
        }
        return res.status(400).json({
          message: `Cannot delete criteria: It is still referenced in ${parts.join("; ")}. Please remove all references before deleting.`,
          references: referencesPayload,
        });
      }

      // No blocking references — delete child outcomes/actions then the criteria itself
      await storage.deleteActionsByOutcomeCriteria(criteriaId);
      await storage.deleteOutcomesByCriteria(criteriaId);
      await storage.deleteCriteria(criteriaId);

      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting criteria:", error);
      if (error.code === '23503') {
        return res.status(400).json({ message: "Cannot delete criteria: It is still referenced by other data. Please remove all references before deleting." });
      }
      res.status(500).json({ message: "Failed to delete criteria" });
    }
  });

  app.delete("/api/outcomes/:id", isAuthenticated, OUTCOMES_EDIT, async (req: any, res) => {
    try {
      const outcomeId = parseInt(req.params.id as string);
      const userRole = req.session.user.role;

      // Prevent non-Admins from deleting isSystem items
      const existingOutcome = await storage.getOutcomeById(outcomeId);
      if (existingOutcome?.isSystem && userRole !== 'Admin') {
        return res.status(403).json({ message: "Only Admins can delete system items" });
      }

      // Pre-check: find which solutions currently use this outcome
      const productRefs = await db
        .select({ id: products.id, name: products.name })
        .from(productOutcomes)
        .innerJoin(products, eq(productOutcomes.productId, products.id))
        .where(eq(productOutcomes.outcomeId, outcomeId));

      if (productRefs.length > 0) {
        const names = productRefs.map(p => p.name || `Solution #${p.id}`);
        return res.status(400).json({
          message: `Cannot delete expected outcome: It is still assigned to solution(s). Please remove all assignments before deleting.`,
          references: { products: names },
        });
      }

      // No blocking references — delete child actions then the outcome itself
      await storage.deleteActionsByOutcome(outcomeId);
      await storage.deleteOutcome(outcomeId);

      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting outcome:", error);
      if (error.code === '23503') {
        return res.status(400).json({ message: "Cannot delete expected outcome: It is still referenced by other data. Please remove all references before deleting." });
      }
      res.status(500).json({ message: "Failed to delete outcome" });
    }
  });

  app.delete("/api/actions/:id", isAuthenticated, ACTIONS_EDIT, async (req: any, res) => {
    try {
      const actionId = parseInt(req.params.id as string);
      const userRole = req.session.user.role;

      // Prevent non-Admins from deleting isSystem items
      const existingAction = await storage.getActionById(actionId);
      if (existingAction?.isSystem && userRole !== 'Admin') {
        return res.status(403).json({ message: "Only Admins can delete system items" });
      }

      // Pre-check: find which solutions currently use this action
      const productRefs = await db
        .select({ id: products.id, name: products.name })
        .from(productActions)
        .innerJoin(products, eq(productActions.productId, products.id))
        .where(eq(productActions.actionId, actionId));

      if (productRefs.length > 0) {
        const names = productRefs.map(p => p.name || `Solution #${p.id}`);
        return res.status(400).json({
          message: `Cannot delete action: It is still assigned to solution(s). Please remove all assignments before deleting.`,
          references: { products: names },
        });
      }

      // No blocking references — safe to delete
      await storage.deleteAction(actionId);
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting action:", error);
      if (error.code === '23503') {
        return res.status(400).json({ message: "Cannot delete action: It is still referenced by other data. Please remove all references before deleting." });
      }
      res.status(500).json({ message: "Failed to delete action" });
    }
  });

  // Solution-scoped entity endpoints (for independent dropdown selection)
  // Supports includeAll=true query param to show ALL entities (for "Show Hidden" checkbox)
  app.get("/api/components/by-solution/:solutionId", isAuthenticated, async (req, res) => {
    try {
      const solutionId = parseInt(req.params.solutionId as string);
      if (isNaN(solutionId)) {
        return res.status(400).json({ message: "Invalid solution ID" });
      }
      
      const includeAll = req.query.includeAll === 'true';
      
      // Get all components
      const allComponents = await storage.getComponents(false);
      
      // If includeAll is true, return ALL components (for "Show Hidden" feature)
      if (includeAll) {
        res.json(allComponents);
        return;
      }
      
      // Otherwise, filter to include:
      // 1. Components with productId matching this solution
      // 2. Components with empty solutionIds array (All Solutions)
      const filteredComponents = allComponents.filter((comp: any) => {
        const isLinkedToSolution = Array.isArray(comp.solutionIds) && comp.solutionIds.includes(solutionId);
        const isAllSolutions = !comp.solutionIds || comp.solutionIds.length === 0;
        return isLinkedToSolution || isAllSolutions;
      });
      
      res.json(filteredComponents);
    } catch (error: any) {
      console.error("Error fetching components by solution:", error);
      res.status(500).json({ message: "Failed to fetch components" });
    }
  });

  app.get("/api/criteria/by-solution/:solutionId", isAuthenticated, async (req, res) => {
    try {
      const solutionId = parseInt(req.params.solutionId as string);
      if (isNaN(solutionId)) {
        return res.status(400).json({ message: "Invalid solution ID" });
      }
      
      const includeAll = req.query.includeAll === 'true';
      
      // Get all criteria
      const allCriteria = await storage.getCriteria(false);
      
      // If includeAll is true, return ALL criteria (for "Show Hidden" feature)
      if (includeAll) {
        res.json(allCriteria);
        return;
      }
      
      // Otherwise, filter to include:
      // 1. Criteria linked to this solution via product-criteria links
      // 2. Criteria with empty solutionIds array (All Solutions)
      const filteredCriteria = allCriteria.filter((criteria: any) => {
        const isAllSolutions = !criteria.solutionIds || criteria.solutionIds.length === 0;
        return criteria.solutionIds?.includes(solutionId) || isAllSolutions;
      });
      
      res.json(filteredCriteria);
    } catch (error: any) {
      console.error("Error fetching criteria by solution:", error);
      res.status(500).json({ message: "Failed to fetch criteria" });
    }
  });

  app.get("/api/outcomes/by-solution/:solutionId", isAuthenticated, async (req, res) => {
    try {
      const solutionId = parseInt(req.params.solutionId as string);
      if (isNaN(solutionId)) {
        return res.status(400).json({ message: "Invalid solution ID" });
      }
      
      const includeAll = req.query.includeAll === 'true';
      
      // Get all outcomes
      const allOutcomes = await storage.getOutcomes(false);
      
      // If includeAll is true, return ALL outcomes (for "Show Hidden" feature)
      if (includeAll) {
        res.json(allOutcomes);
        return;
      }
      
      // Otherwise, filter to include:
      // 1. Outcomes linked to this solution
      // 2. Outcomes with empty solutionIds array (All Solutions)
      const filteredOutcomes = allOutcomes.filter((outcome: any) => {
        const isAllSolutions = !outcome.solutionIds || outcome.solutionIds.length === 0;
        return outcome.solutionIds?.includes(solutionId) || isAllSolutions;
      });
      
      res.json(filteredOutcomes);
    } catch (error: any) {
      console.error("Error fetching outcomes by solution:", error);
      res.status(500).json({ message: "Failed to fetch outcomes" });
    }
  });

  app.get("/api/value-mappings", isAuthenticated, async (req, res) => {
    try {
      const showInactive = req.query.showInactive === 'true';
      const mappings = await storage.getValueMappings(showInactive);
      res.json(mappings);
    } catch (error: any) {
      console.error("Error fetching value mappings:", error);
      res.status(500).json({ message: "Failed to fetch value mappings" });
    }
  });

  app.post("/api/value-mappings", isAuthenticated, VALUE_MAPPING_EDIT, async (req: any, res) => {
    try {
      const { name, description, solutionIds, isAllSolutions, isSystem } = req.body;
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      if (!name) {
        return res.status(400).json({ message: "Name is required" });
      }
      const mapping = await storage.createValueMapping({
        name,
        description: description || null,
        createdBy: userId,
        solutionIds: solutionIds || [],
        isAllSolutions: isAllSolutions === true,
        isSystem: userRole === 'Admin' ? (isSystem === true) : false,
      });
      res.status(201).json(mapping);
    } catch (error: any) {
      console.error("Error creating value mapping:", error);
      res.status(500).json({ message: "Failed to create value mapping" });
    }
  });

  app.patch("/api/value-mappings/:id", isAuthenticated, VALUE_MAPPING_EDIT, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid value mapping ID" });
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const updates = { ...req.body };

      // Prevent non-Admins from editing isSystem items
      const existingValueMapping = await storage.getValueMappingById(id);
      if (existingValueMapping?.isSystem && userRole !== 'Admin') {
        return res.status(403).json({ message: "Only Admins can modify system items" });
      }

      // Only Admins can set isSystem
      if (updates.isSystem !== undefined && userRole !== 'Admin') {
        delete updates.isSystem;
      }
      updates.updatedBy = userId;

      const updated = await storage.updateValueMapping(id, updates);
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating value mapping:", error);
      res.status(500).json({ message: "Failed to update value mapping" });
    }
  });

  app.delete("/api/value-mappings/:id", isAuthenticated, VALUE_MAPPING_EDIT, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid value mapping ID" });
      const userRole = req.session.user.role;

      // Prevent non-Admins from deleting isSystem items
      const existingValueMapping = await storage.getValueMappingById(id);
      if (existingValueMapping?.isSystem && userRole !== 'Admin') {
        return res.status(403).json({ message: "Only Admins can delete system items" });
      }

      // Pre-check: find all blocking references (solutions and criteria)
      const [productRefs, criteriaRefs] = await Promise.all([
        db.select({ id: products.id, name: products.name })
          .from(productValueMappings)
          .innerJoin(products, eq(productValueMappings.productId, products.id))
          .where(eq(productValueMappings.valueMappingId, id)),
        db.select({ id: criteriaLibrary.id, name: criteriaLibrary.name })
          .from(criteriaValueMappings)
          .innerJoin(criteriaLibrary, eq(criteriaValueMappings.criteriaId, criteriaLibrary.id))
          .where(eq(criteriaValueMappings.valueMappingId, id)),
      ]);

      if (productRefs.length > 0 || criteriaRefs.length > 0) {
        const parts: string[] = [];
        const referencesPayload: Record<string, string[]> = {};
        if (productRefs.length > 0) {
          const names = productRefs.map(p => p.name || `Solution #${p.id}`);
          parts.push(`Solutions: ${names.join(", ")}`);
          referencesPayload.products = names;
        }
        if (criteriaRefs.length > 0) {
          const names = criteriaRefs.map(c => c.name || `Criteria #${c.id}`);
          parts.push(`Criteria: ${names.join(", ")}`);
          referencesPayload.criteria = names;
        }
        return res.status(400).json({
          message: `Cannot delete value mapping: It is still referenced in ${parts.join("; ")}. Please remove all references before deleting.`,
          references: referencesPayload,
        });
      }

      // No blocking references — permanently delete
      await storage.deleteValueMapping(id);
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting value mapping:", error);
      if (error.code === '23503') {
        return res.status(400).json({ message: "Cannot delete value mapping: It is still referenced by other data. Please remove all references before deleting." });
      }
      res.status(500).json({ message: "Failed to delete value mapping" });
    }
  });

  app.get("/api/value-mappings/by-solution/:solutionId", isAuthenticated, async (req, res) => {
    try {
      const solutionId = parseInt(req.params.solutionId as string);
      if (isNaN(solutionId)) {
        return res.status(400).json({ message: "Invalid solution ID" });
      }
      const includeAll = req.query.includeAll === 'true';
      const allMappings = await storage.getValueMappings(false);
      if (includeAll) {
        res.json(allMappings);
        return;
      }
      const filtered = allMappings.filter((vm: any) => {
        const isAllSolutions = !vm.solutionIds || vm.solutionIds.length === 0;
        return vm.solutionIds?.includes(solutionId) || isAllSolutions;
      });
      res.json(filtered);
    } catch (error: any) {
      console.error("Error fetching value mappings by solution:", error);
      res.status(500).json({ message: "Failed to fetch value mappings" });
    }
  });

  app.get("/api/actions/by-solution/:solutionId", isAuthenticated, async (req, res) => {
    try {
      const solutionId = parseInt(req.params.solutionId as string);
      if (isNaN(solutionId)) {
        return res.status(400).json({ message: "Invalid solution ID" });
      }
      
      const includeAll = req.query.includeAll === 'true';
      
      // Get all actions
      const allActions = await storage.getActions(false);
      
      // If includeAll is true, return ALL actions (for "Show Hidden" feature)
      if (includeAll) {
        res.json(allActions);
        return;
      }
      
      // Otherwise, filter to include:
      // 1. Actions linked to this solution
      // 2. Actions with empty solutionIds array (All Solutions)
      const filteredActions = allActions.filter((action: any) => {
        const isAllSolutions = !action.solutionIds || action.solutionIds.length === 0;
        return action.solutionIds?.includes(solutionId) || isAllSolutions;
      });
      
      res.json(filteredActions);
    } catch (error: any) {
      console.error("Error fetching actions by solution:", error);
      res.status(500).json({ message: "Failed to fetch actions" });
    }
  });



  app.get("/api/success-criteria/links/criteria/:productId", isAuthenticated, async (req, res) => {
    try {
      const productId = parseInt(req.params.productId as string);
      if (isNaN(productId)) return res.status(400).json({ message: "Invalid product ID" });
      const ids = await storage.getLinkedCriteria(productId);
      res.json(ids);
    } catch (error: any) {
      console.error("Error fetching linked criteria:", error);
      res.status(500).json({ message: "Failed to fetch linked criteria" });
    }
  });

  app.get("/api/success-criteria/links/outcomes/:criteriaId", isAuthenticated, async (req, res) => {
    try {
      const criteriaId = parseInt(req.params.criteriaId as string);
      if (isNaN(criteriaId)) return res.status(400).json({ message: "Invalid criteria ID" });
      const ids = await storage.getLinkedOutcomes(criteriaId);
      res.json(ids);
    } catch (error: any) {
      console.error("Error fetching linked outcomes:", error);
      res.status(500).json({ message: "Failed to fetch linked outcomes" });
    }
  });

  app.get("/api/success-criteria/links/actions/:outcomeId", isAuthenticated, async (req, res) => {
    try {
      const outcomeId = parseInt(req.params.outcomeId as string);
      if (isNaN(outcomeId)) return res.status(400).json({ message: "Invalid outcome ID" });
      const ids = await storage.getLinkedActions(outcomeId);
      res.json(ids);
    } catch (error: any) {
      console.error("Error fetching linked actions:", error);
      res.status(500).json({ message: "Failed to fetch linked actions" });
    }
  });

  // Get hierarchical relationships - reverse lookups for display
  app.get("/api/success-criteria/links/products-for-criteria/:id", isAuthenticated, async (req, res) => {
    try {
      const criteriaId = parseInt(req.params.id as string);
      // Find which products have this criteria linked to them - reverse lookup
      const results = await storage.getCriteriaLinkedToProduct(criteriaId);
      res.json(results);
    } catch (error: any) {
      console.error("Error fetching criteria relationships:", error);
      res.status(500).json({ message: "Failed to fetch relationships" });
    }
  });

  app.get("/api/success-criteria/links/criteria-for-outcome/:id", isAuthenticated, async (req, res) => {
    try {
      const outcomeId = parseInt(req.params.id as string);
      // Find which criteria have this outcome linked to them - reverse lookup
      const results = await storage.getOutcomesLinkedToCriteria(outcomeId);
      res.json(results);
    } catch (error: any) {
      console.error("Error fetching outcome relationships:", error);
      res.status(500).json({ message: "Failed to fetch relationships" });
    }
  });

  app.get("/api/success-criteria/links/outcomes-for-action/:id", isAuthenticated, async (req, res) => {
    try {
      const actionId = parseInt(req.params.id as string);
      // Find which outcomes have this action linked to them - reverse lookup
      const results = await storage.getActionsLinkedToOutcome(actionId);
      res.json(results);
    } catch (error: any) {
      console.error("Error fetching action relationships:", error);
      res.status(500).json({ message: "Failed to fetch relationships" });
    }
  });
}
