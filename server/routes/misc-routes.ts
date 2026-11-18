// Misc routes (Phase 8 extraction #28).
//
// Final non-auth slice — infrastructure-style endpoints + the docs
// site:
//
//   GET  /api/search                          (cross-entity search)
//   GET  /api/version
//   GET  /api/version/updates                 (interim updates, internal users)
//   GET  /api/files/:key                      (signed-URL passthrough)
//   GET  /api/solution-icons
//   POST /api/upload-images                   (rich-text image upload)
//   POST /api/documents                       (project document upload)
//   POST /api/customers/:customerId/documents (customer document upload)
//   GET  /api/customers/:customerId/documents
//   GET  /api/documents/:id/download
//   GET  /docs (+ per-doc HTML/MD pairs registered in a loop)
//
// Bundled because they share the same pool of file-handling helpers.
import type { Express } from "express";
import type { Multer } from "multer";
import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { eq, and, or, desc, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import { storage } from "../storage";
import { db } from "../db";
import { customers, projects, users } from "@shared/schema";
import { isAuthenticated } from "../auth/simpleAuth";
import { hasCustomerAccess } from "../lib/customer-access";
import {
  documentationItems,
  gettingStartedItems,
  aboutItems,
} from "../search/searchConfig";
import { getVersionInfo, getVersionUpdates } from "../lib/version-info";
import { docsManifest } from "../docs-manifest";
import { createDocsLoader } from "../docs-runtime-loader";
import {
  QUARANTINE_DIR,
  ensureQuarantineDir,
  ALLOWED_MIME_TYPES,
  BLOCKED_EXTENSIONS,
  MAX_FILE_SIZE_BYTES,
  buildDocumentPath,
  buildLogoPath,
  buildRichTextPath,
  buildSupportPath,
  normalizeFilename,
} from "../lib/upload-config";
import { processUpload } from "../lib/upload-processor";
import { uploadFile as gcsUploadFile, generateSignedUrl } from "../lib/cloud-storage";
import { requireInternalUser } from "../lib/internal-access";
import { getLibraryViewer, canViewLibraryItem } from "../lib/library-access";

export async function registerMiscRoutes(
  app: Express,
  { upload, handleMulterError }: { upload: Multer; handleMulterError: any },
) {
  // Global Search API endpoint - Role-aware search across entities
  // Security: Only internal roles can access. Results are filtered based on user permissions.
  app.get('/api/search', isAuthenticated, async (req: any, res) => {
    try {
      const query = (req.query.q as string || '').trim().toLowerCase();
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const userEmail = req.session.user.email;

      if (!query) {
        return res.json([]);
      }

      interface SearchResult {
        id: string | number;
        type: 'project' | 'customer' | 'map' | 'user' | 'document';
        label: string;
        description?: string;
        url: string;
        score: number;
        isRecent?: boolean;
        isMyItem?: boolean;
      }

      const results: SearchResult[] = [];
      
      // External roles cannot access global search at all
      const externalRoles = ['Customer', 'Partner', 'Guest'];
      if (externalRoles.includes(userRole)) {
        return res.json([]);
      }

      // Define roles that have full access vs restricted access
      const fullAccessRoles = ['Admin', 'SE', 'AE', 'CS'];
      const hasFullAccess = fullAccessRoles.includes(userRole);
      
      // Restricted internal roles can still search but with limited scope
      const restrictedInternalRoles = ['Sales', 'CX', 'Product', 'ProServ', 'Support'];
      const isRestrictedInternal = restrictedInternalRoles.includes(userRole);

      // Calculate score based on ALL searchable text fields
      const calculateScore = (searchableFields: string[], primaryField: string, isOwner: boolean, updatedAt?: Date | string | null): number => {
        let score = 0;
        const allText = searchableFields.join(' ').toLowerCase();
        const primaryLower = primaryField.toLowerCase();
        
        // Text match scoring - check primary field first (higher weight)
        if (primaryLower === query) {
          score += 100; // Exact match on primary field
        } else if (primaryLower.startsWith(query)) {
          score += 75; // Starts with query on primary field
        } else if (primaryLower.includes(query)) {
          score += 50; // Contains query on primary field
        } else if (allText.includes(query)) {
          score += 30; // Contains query in any searchable field
        }
        
        // Owner boost
        if (isOwner) {
          score += 25;
        }
        
        // Recency boost
        if (updatedAt) {
          const updated = new Date(updatedAt);
          const daysSinceUpdate = (Date.now() - updated.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceUpdate < 1) score += 20;
          else if (daysSinceUpdate < 7) score += 15;
          else if (daysSinceUpdate < 30) score += 10;
          else if (daysSinceUpdate < 90) score += 5;
        }
        
        return score;
      };

      // Search Projects - uses permission-aware storage.getProjects which already filters by user access
      const projects: any[] = await storage.getProjects(userId, { limit: 100, offset: 0 } as any);
      for (const project of projects) {
        const searchableFields = [
          project.solutionName || '',
          project.customerName || '',
          project.status || '',
          project.stage || ''
        ];
        const allText = searchableFields.join(' ').toLowerCase();
        
        if (allText.includes(query)) {
          const isOwner = project.primaryEngineerId === userId || 
                         project.specialistEngineerId === userId ||
                         (project.assignedSeId === userId);
          
          const isRecent = project.updatedAt && 
            (Date.now() - new Date(project.updatedAt).getTime()) < 7 * 24 * 60 * 60 * 1000;
          
          results.push({
            id: project.id,
            type: 'project',
            label: project.solutionName || `Project #${project.id}`,
            description: `${project.customerName || 'No customer'} • ${project.status || 'Unknown status'}`,
            url: `/projects/${project.id}`,
            score: calculateScore(searchableFields, project.solutionName || '', isOwner, project.updatedAt),
            isRecent,
            isMyItem: isOwner
          });
        }
      }

      // Search Customers - available to all internal roles (matches existing /api/customers endpoint behavior)
      // For restricted roles, only show customers they have direct association with
      const customers: any[] = await storage.getCustomers();
      for (const customer of customers) {
        // For restricted internal roles, filter to customers they're assigned to
        if (isRestrictedInternal) {
          const isAssigned = customer.accountRepresentativeId === userId || 
                            customer.accountEngineerId === userId ||
                            (customer.contactUsers && Array.isArray(customer.contactUsers) && 
                             customer.contactUsers.some((c: any) => c.userId === userId));
          if (!isAssigned) continue;
        }
        
        const searchableFields = [
          customer.name || '',
          customer.industry || '',
          customer.region || ''
        ];
        const allText = searchableFields.join(' ').toLowerCase();
        
        if (allText.includes(query)) {
          const isOwner = customer.accountRepresentativeId === userId || 
                         customer.accountEngineerId === userId;
          
          const isRecent = customer.updatedAt && 
            (Date.now() - new Date(customer.updatedAt).getTime()) < 7 * 24 * 60 * 60 * 1000;
          
          results.push({
            id: customer.id,
            type: 'customer',
            label: customer.name,
            description: `${customer.industry || 'No industry'} • ${customer.region || 'No region'}`,
            url: `/customers?customer=${customer.id}`,
            score: calculateScore(searchableFields, customer.name || '', isOwner, customer.updatedAt),
            isRecent,
            isMyItem: isOwner
          });
        }
      }

      // Search MAP Templates - available to all internal roles who can access /map
      // Restricted roles only see templates they created or that are public/internal visibility
      try {
        const mapTemplates = await storage.getMapTemplates();
        for (const template of mapTemplates) {
          // For restricted roles, only show their own templates or shared (internal/public visibility)
          const isTemplateOwner = template.createdByUserId === userId;
          const isSharedTemplate = template.visibility === 'internal' || template.visibility === 'public';
          
          if (isRestrictedInternal && !isTemplateOwner && !isSharedTemplate) {
            continue;
          }
          
          const searchableFields = [
            template.name || '',
            template.description || ''
          ];
          const allText = searchableFields.join(' ').toLowerCase();
          
          if (allText.includes(query)) {
            const isRecent = template.updatedAt && 
              (Date.now() - new Date(template.updatedAt).getTime()) < 7 * 24 * 60 * 60 * 1000;
            
            results.push({
              id: template.id,
              type: 'map',
              label: template.name,
              description: `MAP Template • ${template.description?.substring(0, 50) || 'No description'}`,
              url: `/map?template=${template.id}`,
              score: calculateScore(searchableFields, template.name || '', isTemplateOwner, template.updatedAt),
              isRecent,
              isMyItem: isTemplateOwner
            });
          }
        }
      } catch (mapError) {
        console.log('MAP search skipped:', mapError);
      }

      // Search Users - only available to Admin and core internal roles (SE, AE, CS)
      // This matches the existing user management permissions
      if (hasFullAccess) {
        try {
          const users: any[] = await storage.getUsers();
          for (const user of users) {
            if (!user.isApproved) continue;
            
            const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
            const searchableFields = [
              fullName,
              user.email || '',
              user.role || ''
            ];
            const allText = searchableFields.join(' ').toLowerCase();
            
            if (allText.includes(query)) {
              results.push({
                id: user.id,
                type: 'user',
                label: fullName || user.email,
                description: `${user.role || 'User'} • ${user.email}`,
                url: `/admin?tab=users&user=${user.id}`,
                score: calculateScore(searchableFields, fullName || user.email, false, null),
                isRecent: false,
                isMyItem: user.id === userId
              });
            }
          }
        } catch (userError) {
          console.log('User search skipped:', userError);
        }
      }

      // Pages are matched on the client from the sidebar menu (page-search-index.ts).

      // Search Documentation - available to all internal roles (not Customer, Partner, Guest)
      // documentationItems is imported from ./search/searchConfig

      for (const doc of documentationItems) {
        const searchableFields = [doc.name, doc.category, doc.description];
        const allText = searchableFields.join(' ').toLowerCase();
        
        if (allText.includes(query)) {
          results.push({
            id: doc.id,
            type: 'document',
            label: doc.name,
            description: `${doc.category} • ${doc.description.substring(0, 50)}...`,
            url: doc.url,
            score: calculateScore(searchableFields, doc.name, false, null),
            isRecent: false,
            isMyItem: false
          });
        }
      }

      // Search Getting Started guides - available to all internal roles
      // gettingStartedItems is imported from ./search/searchConfig

      for (const guide of gettingStartedItems) {
        const searchableFields = [guide.name, guide.description, 'getting started', 'help', 'guide', 'tutorial'];
        const allText = searchableFields.join(' ').toLowerCase();
        
        if (allText.includes(query)) {
          results.push({
            id: guide.id,
            type: 'guide' as any,
            label: guide.name,
            description: `Guide • ${guide.description}`,
            url: guide.url,
            score: calculateScore(searchableFields, guide.name, false, null) + 5, // Slight boost for guides
            isRecent: false,
            isMyItem: false
          });
        }
      }

      // Search About page sections - role-aware (some tabs are internal-only)
      // aboutItems is imported from ./search/searchConfig

      for (const aboutItem of aboutItems) {
        // Skip internal-only items for restricted roles
        if (aboutItem.requiresInternal && isRestrictedInternal) continue;
        
        const searchableFields = [aboutItem.name, aboutItem.description, 'about'];
        const allText = searchableFields.join(' ').toLowerCase();
        
        if (allText.includes(query)) {
          results.push({
            id: aboutItem.id,
            type: 'page' as any,
            label: aboutItem.name,
            description: `About • ${aboutItem.description}`,
            url: aboutItem.url,
            score: calculateScore(searchableFields, aboutItem.name, false, null),
            isRecent: false,
            isMyItem: false
          });
        }
      }

      // Sort by score (highest first) and limit results
      results.sort((a, b) => b.score - a.score);
      const limitedResults = results.slice(0, limit);

      res.json(limitedResults);
    } catch (error: any) {
      console.error('Global search error:', error);
      res.status(500).json({ message: 'Failed to perform search' });
    }
  });

  // Version API endpoint
  app.get('/api/version', (_req, res) => {
    // Resolution + diagnostic logging live in `getVersionInfo` so the
    // route stays a thin shell and the unknown-version fallback is
    // unit-testable without standing up the full route registry.
    res.json(getVersionInfo());
  });

  // Interim updates in the current release (one per merge to main, titled
  // by the PR). Unlike /api/version this is not public: PR titles can name
  // internal or security work, so only signed-in internal users get it.
  app.get('/api/version/updates', isAuthenticated, requireInternalUser, (_req, res) => {
    res.json(getVersionUpdates());
  });

  // Serve locally-stored GCS fallback files (when GCS_BUCKET_NAME is not configured)
  // Files are stored at attached_assets/{gcsObjectKey} and served here.
  //
  // We stream the file directly with fs.createReadStream rather than
  // res.sendFile() because the underlying `send` library throws
  // NotFoundError on some Windows paths even when fs.existsSync sees
  // the file (intermittent stat/openSync race inside send; reproduces
  // for branding uploads under attached_assets/system/branding/...).
  // Direct streaming bypasses send's internal checks while preserving
  // the same Content-Type detection via mime lookup on the filename.
  // Auth gate that allows pre-auth access to the two login-screen
  // branding slots (login_logo, login_bg) — those need to render before
  // any session cookie exists. Everything else still requires auth.
  const PUBLIC_BRANDING_PREFIXES = [
    'system/branding/login_logo/',
    'system/branding/login_bg/',
  ];
  const filesAuthGate = (req: any, res: any, next: any) => {
    const rawKey = Array.isArray(req.params.key) ? req.params.key.join('/') : (req.params.key || '');
    let decoded = '';
    try { decoded = decodeURIComponent(rawKey); } catch { decoded = rawKey; }
    const isPublicBranding = PUBLIC_BRANDING_PREFIXES.some(p => decoded.startsWith(p));
    if (isPublicBranding) return next();
    return isAuthenticated(req, res, next);
  };

  // Stored files are user uploads. nosniff stops the browser guessing a
  // script type, and an SVG opened directly gets a CSP with no script
  // and a sandbox, so a script that slipped past the upload-time SVG
  // sanitizer still can't run on the app's origin.
  const setStoredFileSafetyHeaders = (res: any, contentType: string) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (contentType.startsWith('image/svg+xml')) {
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox");
    }
  };

  app.get('/api/files/*key', filesAuthGate, async (req: any, res) => {
    try {
      const rawKey = Array.isArray(req.params.key) ? req.params.key.join('/') : (req.params.key || '');
      const gcsObjectKey = decodeURIComponent(rawKey);
      // Prevent path traversal
      if (gcsObjectKey.includes('..') || path.isAbsolute(gcsObjectKey)) {
        return res.status(400).json({ message: 'Invalid file key' });
      }

      // 0. Database blob store (the `db` storage provider). Checked FIRST
      //    because when DB-blob is active, runtime uploads live here, not
      //    on disk. Bundled image-layer defaults (criteriaiq-logo_white.png,
      //    5A PNGs) still fall through to the disk candidates below. The
      //    lookup is a cheap indexed query and returns null when the files
      //    DB isn't configured/ready, so disk-only installs are unaffected.
      try {
        const { isFilesDbReady, getUploadedFile } = await import('../lib/files-db');
        if (isFilesDbReady()) {
          const blob = await getUploadedFile(gcsObjectKey);
          if (blob) {
            const extDb = path.extname(gcsObjectKey).toLowerCase();
            const mimeDb: Record<string, string> = {
              '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
              '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
              '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8',
              '.csv': 'text/csv; charset=utf-8', '.json': 'application/json; charset=utf-8',
            };
            const dbContentType = blob.mimeType || mimeDb[extDb] || 'application/octet-stream';
            res.setHeader('Content-Type', dbContentType);
            setStoredFileSafetyHeaders(res, dbContentType);
            res.setHeader('Content-Length', String(blob.data.length));
            res.setHeader('Cache-Control', 'private, max-age=300');
            return res.end(blob.data);
          }
        }
      } catch (err: any) {
        // Files-DB lookup failure is non-fatal — fall through to disk so a
        // transient files-DB blip doesn't 500 requests for bundled assets.
        console.warn('[api/files] files-db lookup failed, falling back to disk:', err?.message ?? err);
      }

      // Resolve which on-disk file backs this object key. The route
      // checks several paths in order so that:
      //
      //   1. `uploads/`           — current write path for ALL admin
      //      uploads (customer logos, branding images, project
      //      artifacts, etc.). Lives on a persistent volume in every
      //      deploy (the `/app/uploads` mount declared in both
      //      Dockerfile and docker-compose.yml). This is the new home
      //      for runtime mutations.
      //
      //   2. `attached_assets/`   — bundled defaults shipped in the
      //      Docker image at build time (criteriaiq-logo_white.png,
      //      5A framework PNGs, etc.). Read-only, lives in the image
      //      layer. Also serves as a fallback for legacy uploads that
      //      were written here before the split — those files have
      //      mostly been wiped by ephemeral-layer resets but a few may
      //      still be present, and existing DB rows pointing at them
      //      stay reachable until an admin re-uploads.
      //
      //   3. main-repo's `attached_assets/` — dev-time only fallback
      //      when running from `<repo>/.claude/worktrees/<name>/`. The
      //      gitignored subtrees are empty in worktrees by default;
      //      this lets the dev server see uploads written by the main
      //      checkout. Never triggers in production (which doesn't
      //      run from a worktree path).
      //
      // The order matters: uploads/ wins for currently-stored runtime
      // assets; attached_assets/ wins for bundled defaults. The two
      // never collide because admin uploads use unique hash-suffixed
      // filenames the bundled defaults never would.
      const cwd = process.cwd();
      const candidates: string[] = [
        path.join(cwd, 'uploads', gcsObjectKey),
        path.join(cwd, 'attached_assets', gcsObjectKey),
      ];
      const wtMatch = cwd.match(/^(.+)[\\/]\.claude[\\/]worktrees[\\/][^\\/]+$/);
      if (wtMatch) {
        candidates.push(path.join(wtMatch[1], 'uploads', gcsObjectKey));
        candidates.push(path.join(wtMatch[1], 'attached_assets', gcsObjectKey));
      }

      let localPath: string | undefined;
      let stat: fs.Stats | undefined;
      for (const candidate of candidates) {
        try {
          const s = fs.statSync(candidate);
          if (s.isFile()) {
            localPath = candidate;
            stat = s;
            break;
          }
        } catch {
          // Candidate doesn't exist — try the next one.
        }
      }

      if (!stat || !localPath) {
        return res.status(404).json({ message: 'File not found' });
      }
      // Minimal MIME map covering the file types branding/logos/docs
      // upload pipelines accept today. Falls back to octet-stream for
      // anything unknown — same default `send` would produce.
      const ext = path.extname(localPath).toLowerCase();
      const mime: Record<string, string> = {
        '.png':  'image/png',
        '.jpg':  'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif':  'image/gif',
        '.webp': 'image/webp',
        '.svg':  'image/svg+xml',
        '.pdf':  'application/pdf',
        '.txt':  'text/plain; charset=utf-8',
        '.csv':  'text/csv; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
      };
      const diskContentType = mime[ext] ?? 'application/octet-stream';
      res.setHeader('Content-Type', diskContentType);
      setStoredFileSafetyHeaders(res, diskContentType);
      res.setHeader('Content-Length', String(stat.size));
      res.setHeader('Cache-Control', 'private, max-age=300');
      const stream = fs.createReadStream(localPath);
      stream.on('error', (err) => {
        console.error('Error streaming local file:', err);
        if (!res.headersSent) {
          res.status(500).json({ message: 'Failed to serve file' });
        } else {
          res.destroy();
        }
      });
      stream.pipe(res);
    } catch (err) {
      console.error('Error serving local file:', err);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Failed to serve file' });
      }
    }
  });

  // Solution Icons API endpoint — lists icons under system/solution-icons/
  // in the active storage provider. Unions three sources: the files DB
  // (canonical when the `db` provider is active), the on-disk uploads/
  // directory (where the LocalDriver writes), and the legacy
  // attached_assets/solution_icons/ location for any pre-migration files.
  // The Solution Icons admin card in Configuration → System Settings →
  // Media is what populates the canonical location going forward.
  app.get('/api/solution-icons', async (req, res) => {
    try {
      const seen = new Set<string>();

      // 1. Files DB (the new canonical source when active provider is `db`).
      try {
        const { listUploadedKeysByPrefix } = await import('../lib/files-db');
        const PREFIX = 'system/solution-icons/';
        const keys = await listUploadedKeysByPrefix(PREFIX);
        for (const k of keys) {
          const name = k.slice(PREFIX.length);
          if (name) seen.add(name);
        }
      } catch (e: any) {
        console.warn('[solution-icons] files-db list failed:', e?.message ?? e);
      }

      // 2. On-disk locations — LocalDriver write site + legacy bundle dir.
      const dirs = [
        path.join(process.cwd(), 'uploads', 'system', 'solution-icons'),
        path.join(process.cwd(), 'attached_assets', 'solution_icons'),
      ];
      for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue;
        for (const file of fs.readdirSync(dir)) {
          const ext = path.extname(file).toLowerCase();
          if (!['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(ext)) continue;
          seen.add(file);
        }
      }

      // Pull admin-set display-name overrides for any filenames we know
      // about. The metadata row is the source of truth for the
      // dropdown label; we fall back to a filename-derived name only
      // when nothing's been entered.
      const filenames = Array.from(seen);
      let metadataMap = new Map<string, string>();
      try {
        const { db } = await import('../db');
        const { solutionIconMetadata } = await import('@shared/schema');
        const { inArray } = await import('drizzle-orm');
        if (filenames.length > 0) {
          const rows = await db
            .select()
            .from(solutionIconMetadata)
            .where(inArray(solutionIconMetadata.filename, filenames));
          for (const r of rows) {
            if (r.displayName) metadataMap.set(r.filename, r.displayName);
          }
        }
      } catch (e: any) {
        console.warn('[solution-icons] metadata fetch failed:', e?.message ?? e);
      }

      const icons = filenames
        .map(filename => {
          // Prefer the admin-set display name; otherwise fall back to a
          // filename-derived label (strip extension + numeric version
          // suffix like _256).
          const adminDisplayName = metadataMap.get(filename);
          let displayName: string;
          if (adminDisplayName) {
            displayName = adminDisplayName;
          } else {
            displayName = filename.replace(/\.[^/.]+$/, '').replace(/_\d+$/, '');
          }
          return {
            filename,
            displayName,
            path: `/api/files/system/solution-icons/${filename}`,
            hasMetadata: !!adminDisplayName,
          };
        })
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

      res.json(icons);
    } catch (error: any) {
      console.error('Error fetching solution icons:', error);
      res.status(500).json({ message: 'Failed to fetch solution icons' });
    }
  });

  // Dedicated image upload endpoint for rich text editors
  const richTextImageUpload = multer({
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
          'image/webp': '.webp'
        };
        const safeExtension = mimetypeToExt[file.mimetype] || '.jpg';
        cb(null, `rtimage_${uniqueId}${safeExtension}`);
      }
    }),
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 1
    },
    fileFilter: (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
      if (file.originalname.includes('..') || file.originalname.includes('/') || file.originalname.includes('\\')) {
        const error = new Error('Filename contains invalid characters');
        (error as any).code = 'INVALID_FILENAME';
        return cb(error);
      }
      const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (allowedImageTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        const error = new Error(`Only image files are allowed. Supported: JPEG, PNG, GIF, WebP`);
        (error as any).code = 'UNSUPPORTED_FILE_TYPE';
        cb(error);
      }
    },
  });

  app.post('/api/upload-images', isAuthenticated, richTextImageUpload.single('file'), handleMulterError, async (req: any, res: any) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No image uploaded" });
      }

      const safeFilename = normalizeFilename(req.file.originalname);
      const gcsObjectKey = buildRichTextPath(safeFilename);

      const result = await processUpload(req.file, gcsObjectKey, 'image');
      if (!result.ok) {
        return res.status(result.status).json({ message: result.reason });
      }
      const { file: pf } = result;

      // Track rich-text images in the documents table so storage health can report their sizes
      await storage.createDocument({
        originalName: pf.originalName,
        givenName: pf.safeFilename,
        fileName: pf.safeFilename,
        mimeType: pf.mimeType,
        fileSize: pf.fileSize,
        uploadedByUserId: req.session.user.id,
        gcsPath: pf.gcsPath,
        documentType: 'rich-text-image',
        scanStatus: 'clean',
        sensitivityLabel: 'internal',
      });

      res.json({
        url: pf.url,
        filename: pf.safeFilename,
        originalName: pf.originalName,
        size: pf.fileSize,
        mimeType: pf.mimeType
      });
    } catch (error: any) {
      console.error('Rich text editor image upload error:', error);
      res.status(500).json({ message: "Image upload failed" });
    }
  });

  // Document upload endpoint
  app.post('/api/documents', isAuthenticated, requireInternalUser, upload.single('file'), async (req: any, res) => {
    try {
      const userId = req.session.user.id;

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const {
        givenName,
        description = '',
        documentType,
        solutionIds: solutionIdsStr = '[]',
        accountIds: accountIdsStr = '[]',
        owner = req.session.user.role || 'Unknown',
        ownerId = userId,
        isActive: isActiveStr = 'true',
      } = req.body;
      const isActive = isActiveStr === 'true' || isActiveStr === true;

      if (!givenName || !documentType) {
        // Clean up quarantine file
        try { fs.unlinkSync(req.file.path); } catch {}
        return res.status(400).json({ message: "Given name and document type are required" });
      }

      let solutionIds: any[] = [];
      try { solutionIds = JSON.parse(solutionIdsStr); } catch {}

      let accountIds: number[] | null = null;
      try {
        const parsed = JSON.parse(accountIdsStr);
        if (parsed === null) {
          accountIds = null;
        } else if (Array.isArray(parsed)) {
          accountIds = parsed.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id));
        }
      } catch {}

      // Determine accountId for GCS path (use first account or null)
      const primaryAccountId = Array.isArray(accountIds) && accountIds.length > 0 ? accountIds[0] : null;
      const safeFilename = normalizeFilename(req.file.originalname);
      // Pass userId so no-account uploads go to system/documents/{userId}/{filename}
      const gcsObjectKey = buildDocumentPath(primaryAccountId, safeFilename, req.session.user.id);

      // Run quarantine pipeline: magic bytes → hash → ClamAV → GCS upload
      const result = await processUpload(req.file, gcsObjectKey, 'document');
      if (!result.ok) {
        return res.status(result.status).json({ message: result.reason });
      }
      const { file: pf } = result;

      const document = await storage.createDocument({
        givenName,
        fileName: pf.safeFilename,
        originalName: pf.originalName,
        originalFileName: pf.originalName,
        fileSize: pf.fileSize,
        mimeType: pf.mimeType,
        fileType: pf.mimeType,
        description,
        documentType,
        solutionIds,
        accountIds,
        owner,
        ownerId,
        uploadedByUserId: userId,
        gcsPath: pf.gcsPath,
        storedPath: pf.gcsPath,
        fileHash: pf.fileHash,
        scanStatus: pf.scanStatus,
        scannedAt: new Date(),
        isActive,
      });

      console.log('Document created successfully:', document.id);
      res.status(201).json(document);
    } catch (error: any) {
      console.error("Error creating document:", error);
      res.status(500).json({ message: "Failed to create document" });
    }
  });

  // Customer-specific document upload endpoint
  app.post('/api/customers/:customerId/documents', isAuthenticated, upload.single('file'), async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const customerId = parseInt(req.params.customerId as string);

      if (!await hasCustomerAccess(userId, req.session.user.role, customerId)) {
        if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
        return res.status(403).json({ message: "Access denied to this customer" });
      }

      const customer = await storage.getCustomer(customerId);
      if (!customer) {
        if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
        return res.status(404).json({ message: "Customer not found" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file provided" });
      }

      // Parse solutionIds
      let solutionIds: any[] = [];
      if (req.body.solutionIds) {
        try {
          const parsed = typeof req.body.solutionIds === 'string'
            ? JSON.parse(req.body.solutionIds)
            : req.body.solutionIds;
          solutionIds = Array.isArray(parsed) ? parsed : [];
        } catch {}
      }

      // Parse accountIds
      let accountIds: number[] | null = [customerId];
      if (req.body.accountIds !== undefined) {
        try {
          const parsed = typeof req.body.accountIds === 'string'
            ? JSON.parse(req.body.accountIds)
            : req.body.accountIds;
          if (parsed === null) {
            accountIds = null;
          } else if (Array.isArray(parsed)) {
            accountIds = parsed.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id));
          }
        } catch {}
      }

      const safeFilename = normalizeFilename(req.file.originalname);
      const gcsObjectKey = buildDocumentPath(customerId, safeFilename);

      const result = await processUpload(req.file, gcsObjectKey, 'document');
      if (!result.ok) {
        return res.status(result.status).json({ message: result.reason });
      }
      const { file: pf } = result;

      const isActiveCustomer = req.body.isActive === 'true' || req.body.isActive === true || req.body.isActive === undefined;

      const document = await storage.createCustomerDocument({
        originalName: pf.originalName,
        givenName: req.body.givenName || pf.originalName,
        fileName: pf.safeFilename,
        mimeType: pf.mimeType,
        fileType: pf.mimeType,
        fileSize: pf.fileSize,
        uploadedByUserId: userId,
        projectId: req.body.projectId ? parseInt(req.body.projectId) : null,
        customerId,
        gcsPath: pf.gcsPath,
        storedPath: pf.gcsPath,
        description: req.body.description || '',
        documentType: req.body.documentType || 'Other',
        solutionIds,
        accountIds,
        owner: req.session.user.role || 'Unknown',
        ownerId: userId,
        fileHash: pf.fileHash,
        scanStatus: pf.scanStatus,
        scannedAt: new Date(),
        isActive: isActiveCustomer,
      });

      res.status(201).json(document);
    } catch (error: any) {
      console.error("Error uploading customer document:", error);
      res.status(500).json({ message: "Failed to upload document" });
    }
  });

  // Customer-specific document listing endpoint
  app.get('/api/customers/:customerId/documents', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const customerId = parseInt(req.params.customerId as string);
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = parseInt(req.query.offset as string) || 0;

      // Check if user has access to this customer
      if (!await hasCustomerAccess(userId, req.session.user.role, customerId)) {
        return res.status(403).json({ message: "Access denied to this customer" });
      }

      const result = await storage.getDocumentsByCustomer(customerId, limit, offset);
      res.json(result);

    } catch (error: any) {
      console.error("Error fetching customer documents:", error);
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  // Document download endpoint
  app.get('/api/documents/:id/download', isAuthenticated, async (req: any, res) => {
    try {
      const documentId = parseInt(req.params.id as string);
      const document = await storage.getDocument(documentId);

      if (!document || !canViewLibraryItem(await getLibraryViewer(req), document)) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Legacy uploads sit on disk under attached_assets/uploads_documents.
      // Every newer upload is in the configured file storage under its
      // object key (gcsPath): send the browser to that file instead.
      const filePath = path.join(process.cwd(), 'attached_assets', 'uploads_documents', path.basename(document.fileName));

      if (!fs.existsSync(filePath)) {
        const objectKey: string | null = document.gcsPath || document.storedPath || null;
        if (objectKey && !objectKey.includes('..') && !path.isAbsolute(objectKey) && !/^[a-z]+:\/\//i.test(objectKey)) {
          return res.redirect(await generateSignedUrl(objectKey));
        }
        return res.status(404).json({ message: "File not found on server" });
      }

      // Set security headers for safe file download
      res.setHeader('Content-Disposition', `attachment; filename="${document.originalFileName || document.fileName}"`);
      res.setHeader('Content-Type', 'application/octet-stream'); // Force download, prevent execution
      res.setHeader('X-Content-Type-Options', 'nosniff'); // Prevent MIME sniffing
      res.setHeader('X-Frame-Options', 'DENY'); // Prevent framing
      res.setHeader('Content-Security-Policy', "default-src 'none'"); // No script execution
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate'); // No caching

      // Stream the file
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);

      fileStream.on('error', (error) => {
        console.error('Error streaming file:', error);
        if (!res.headersSent) {
          res.status(500).json({ message: "Error downloading file" });
        }
      });

    } catch (error: any) {
      console.error("Error downloading document:", error);
      res.status(500).json({ message: "Failed to download document" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // In-app documentation viewer routes.
  //
  // The full route list and source paths are declared in
  // `server/docs-manifest.ts`. At build time, `scripts/bundle-runtime-docs.ts`
  // serializes those source files into `dist/runtime-docs.json`, which is
  // loaded here at startup. In development the bundle isn't on disk, so
  // we fall back to reading the live `docs/` tree, which means edits to
  // doc files are reflected without a rebuild.
  //
  // The runtime Docker image intentionally does NOT carry the `docs/`
  // tree (task #474, enforced by `scripts/verify-no-internal-docs.sh`),
  // so the bundle is the only path that works in production.
  // ──────────────────────────────────────────────────────────────────────
  // Bundle loading + dev-mode fallback live in `./docs-runtime-loader`
  // so the integration test exercises the same code path the
  // production server uses.
  const { loadDocSource, loadDocDates } = createDocsLoader();

  const isReadableRole = (req: any) => {
    const role = req.session?.user?.role?.toLowerCase?.();
    return !role || !['customer', 'partner', 'guest'].includes(role);
  };

  const renderDocAsHtml = (markdown: string, title: string): string => {
    let htmlContent = markdown
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^\* (.*$)/gim, '<li>$1</li>')
      .replace(/^\- (.*$)/gim, '<li>$1</li>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/```([^`]+)```/g, '<pre><code>$1</code></pre>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');

    htmlContent = htmlContent.replace(/(<li>.*?<\/li>)+/g, (match) => `<ul>${match}</ul>`);

    if (!htmlContent.includes('<h') && !htmlContent.includes('<ul>')) {
      htmlContent = `<p>${htmlContent}</p>`;
    }

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - CriteriaIQ Documentation</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #212166; border-bottom: 3px solid #212166; padding-bottom: 10px; }
        h2 { color: #212166; border-bottom: 1px solid #e0e0e0; padding-bottom: 5px; margin-top: 30px; }
        h3 { color: #555; margin-top: 25px; }
        code {
            background: #f4f4f4;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Monaco', 'Menlo', monospace;
        }
        pre {
            background: #f8f8f8;
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
            border-left: 4px solid #212166;
        }
        ul, ol { padding-left: 30px; }
        li { margin: 5px 0; }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e0e0e0;
        }
        .back-link {
            display: inline-block;
            margin-bottom: 20px;
            color: #212166;
            text-decoration: none;
            font-weight: bold;
        }
        .back-link:hover { text-decoration: underline; }
        .doc-nav {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
        }
        .doc-nav a {
            color: #212166;
            text-decoration: none;
            margin-right: 20px;
            font-weight: 500;
        }
        .doc-nav a:hover { text-decoration: underline; }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
        }
        th {
            background-color: #f2f2f2;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>CriteriaIQ Documentation</h1>
            <p>Technical Validation</p>
        </div>

        <div class="doc-nav">
            <a href="/docs/project_overview">Project Overview</a>
            <a href="/docs/design_document">Design Document</a>
            <a href="/docs/workflow_diagram">Workflow Diagrams</a>
            <a href="/docs/deployment">Deployment Guide</a>
            <a href="/docs/technical-architecture">Technical Architecture</a>
            <a href="/docs/language_translation">Language Translation</a>
        </div>

        <a href="/" class="back-link">← Back to Application</a>

        <div class="content">
            ${htmlContent}
        </div>
    </div>
</body>
</html>`;
  };

  const sendHtmlAccessDenied = (res: any) =>
    res.status(403).send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Access Denied - CriteriaIQ</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; margin-top: 100px; }
        .error { color: #666; }
        .error-code { color: #212166; font-size: 2em; font-weight: bold; }
    </style>
</head>
<body>
    <div class="error-code">403</div>
    <h1>Access Denied</h1>
    <p class="error">You do not have permission to access this documentation.</p>
    <a href="/">← Back to Application</a>
</body>
</html>`);

  const sendHtmlNotFound = (res: any) =>
    res.status(404).send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Documentation Not Found - CriteriaIQ</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; margin-top: 100px; }
        .error { color: #666; }
    </style>
</head>
<body>
    <h1>Documentation Not Found</h1>
    <p class="error">The requested documentation file could not be found.</p>
    <a href="/">← Back to Application</a>
</body>
</html>`);

  const serveMarkdownAsHtml = (source: string, title: string) => {
    return (req: any, res: any) => {
      if (!isReadableRole(req)) return sendHtmlAccessDenied(res);
      try {
        const content = loadDocSource(source);
        if (content === null) return sendHtmlNotFound(res);
        res.setHeader('Content-Type', 'text/html');
        res.send(renderDocAsHtml(content, title));
      } catch (error: any) {
        console.error('Error serving documentation:', error);
        res.status(500).send('Error loading documentation');
      }
    };
  };

  const serveRawMarkdown = (source: string) => {
    return (req: any, res: any) => {
      if (!isReadableRole(req)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      try {
        const content = loadDocSource(source);
        if (content === null) {
          return res.status(404).json({ error: 'Documentation not found' });
        }
        res.setHeader('Content-Type', 'text/plain');
        res.send(content);
      } catch (error: any) {
        console.error('Error reading documentation:', error);
        res.status(500).json({ error: 'Failed to load documentation' });
      }
    };
  };

  // Aggregate Posted/Updated dates for every documented source,
  // keyed by the API endpoint path the React About page consumes.
  // This replaces the 56 hand-maintained `postedAt`/`updatedAt`
  // string pairs that used to live in `client/src/pages/about.tsx`
  // (and predictably drifted into the future). Production reads
  // build-time `git log` results from `dist/runtime-docs.json`; dev
  // computes the dates on-the-fly the first time each source is
  // requested (cached for the process lifetime — see
  // `docs-runtime-loader.ts`). Open to any reader; the dates
  // themselves are not sensitive.
  app.get('/api/docs/dates', (_req, res) => {
    const result: Record<string, { posted: string | null; updated: string | null }> = {};
    for (const entry of docsManifest) {
      const dates = loadDocDates(entry.source);
      for (const apiPath of entry.apiRoutes ?? []) {
        result[apiPath] = dates;
      }
    }
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json(result);
  });

  // Register every API and HTML route declared in the docs manifest.
  for (const entry of docsManifest) {
    for (const apiPath of entry.apiRoutes ?? []) {
      app.get(apiPath, serveRawMarkdown(entry.source));
    }
    for (const html of entry.htmlRoutes ?? []) {
      app.get(html.path, serveMarkdownAsHtml(entry.source, html.title));
    }
  }

  // Documentation index route (role-based access control)
  app.get('/docs', (req, res) => {
    // Check role-based access - Customer, Partner, and Guest roles cannot access
    if (req.session?.user?.role && ['customer', 'partner', 'guest'].includes(req.session.user.role.toLowerCase())) {
      return res.status(403).send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Access Denied - CriteriaIQ</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; margin-top: 100px; }
        .error { color: #666; }
        .error-code { color: #212166; font-size: 2em; font-weight: bold; }
    </style>
</head>
<body>
    <div class="error-code">403</div>
    <h1>Access Denied</h1>
    <p class="error">You do not have permission to access this documentation.</p>
    <a href="/">← Back to Application</a>
</body>
</html>`);
    }

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CriteriaIQ Documentation</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #212166; text-align: center; margin-bottom: 30px; }
        .doc-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin: 30px 0;
        }
        .doc-card {
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            padding: 20px;
            background: #fafafa;
            text-decoration: none;
            color: inherit;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .doc-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            text-decoration: none;
        }
        .doc-card h3 {
            color: #212166;
            margin-top: 0;
        }
        .doc-card p {
            color: #666;
            margin-bottom: 0;
        }
        .back-link {
            display: inline-block;
            margin-bottom: 20px;
            color: #212166;
            text-decoration: none;
            font-weight: bold;
        }
        .back-link:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="container">
        <h1>CriteriaIQ Documentation</h1>
        <p style="text-align: center; color: #666; margin-bottom: 40px;">
            Comprehensive documentation for CriteriaIQ
        </p>

        <a href="/" class="back-link">← Back to Application</a>

        <div class="doc-grid">
            <a href="/docs/project_overview" class="doc-card">
                <h3>📌 Project Overview</h3>
                <p>High-level project summary, goals, stakeholders, and current status with key milestones and technical architecture overview.</p>
            </a>

            <a href="/docs/design_document" class="doc-card">
                <h3>🎨 Design Document</h3>
                <p>Comprehensive design specifications including technical architecture, data models, user experience standards, and feature specifications.</p>
            </a>

            <a href="/docs/workflow_diagram" class="doc-card">
                <h3>🔄 Workflow Diagrams</h3>
                <p>Visual workflow diagrams showing system processes, user flows, authentication, project management, and data architecture.</p>
            </a>

            <a href="/docs/deployment" class="doc-card">
                <h3>🚀 Deployment Guide</h3>
                <p>Deployment instructions, versioning system, environment setup, and best practices for production deployments.</p>
            </a>

            <a href="/docs/technical-architecture" class="doc-card">
                <h3>⚙️ Technical Architecture</h3>
                <p>Detailed technical implementation guide, system architecture, user preferences, and development guidelines.</p>
            </a>

            <a href="/docs/language_translation" class="doc-card">
                <h3>🌍 Language Translation</h3>
                <p>Information and guidelines for translating the application's UI and content.</p>
            </a>

            <a href="/docs/performance_monitoring_guide" class="doc-card">
                <h3>🚀 Performance Monitoring Guide</h3>
                <p>Comprehensive guide for performance monitoring, database optimization, and system performance tracking with best practices.</p>
            </a>

            <a href="/docs/websocket_stability_guide" class="doc-card">
                <h3>🌐 WebSocket Stability Guide</h3>
                <p>Implementation guide for WebSocket connection management, automatic reconnection, and stability monitoring for real-time features.</p>
            </a>

            <a href="/docs/memory_management_guide" class="doc-card">
                <h3>🧠 Memory Management Guide</h3>
                <p>Best practices for memory management, EventEmitter leak prevention, and resource optimization to maintain application stability.</p>
            </a>

            <a href="/docs/sorting_docs" class="doc-card">
                <h3>📊 Sorting System Documentation</h3>
                <p>Detailed documentation of the table sorting system, implementation details, and usage guidelines for developers.</p>
            </a>

            <a href="/docs/error_handling_debug" class="doc-card">
                <h3>🐛 Error Handling & Debug Guide</h3>
                <p>Comprehensive guide for debugging and error handling throughout the application, including troubleshooting steps and best practices.</p>
            </a>
        </div>

        <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
            <p style="color: #666;">
                <strong>CriteriaIQ</strong> v0.1.03 - Technical Validation<br>
                Last updated: August 2025
            </p>
        </div>
    </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  });
}
