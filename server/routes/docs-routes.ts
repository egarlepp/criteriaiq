import { Express, Request, Response } from "express";
import { db } from "../db";
import {
  docsRepositoryConfigs,
  docsContentCache,
  docsSidebarStructure,
  docsSyncSchedule,
  products,
} from "@shared/schema";
import { eq, and, desc, count, sql } from "drizzle-orm";
import {
  syncRepositoryDocs,
  syncAllRepositories,
  updateSyncSchedule,
  getDocContentForAssessment,
} from "../services/docs-sync-service";
import { isAuthenticated } from "../auth/simpleAuth";

export function registerDocsRoutes(app: Express) {
  console.log("--> Registering Documentation Sync Routes...");

  app.get("/api/docs-repo-configs", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const configs = await db
        .select({
          id: docsRepositoryConfigs.id,
          productId: docsRepositoryConfigs.productId,
          repoOwner: docsRepositoryConfigs.repoOwner,
          repoName: docsRepositoryConfigs.repoName,
          branch: docsRepositoryConfigs.branch,
          docsPath: docsRepositoryConfigs.docsPath,
          version: docsRepositoryConfigs.version,
          sidebarPath: docsRepositoryConfigs.sidebarPath,
          isActive: docsRepositoryConfigs.isActive,
          lastSyncAt: docsRepositoryConfigs.lastSyncAt,
          lastSyncStatus: docsRepositoryConfigs.lastSyncStatus,
          lastSyncMessage: docsRepositoryConfigs.lastSyncMessage,
          totalPages: docsRepositoryConfigs.totalPages,
          createdBy: docsRepositoryConfigs.createdBy,
          createdAt: docsRepositoryConfigs.createdAt,
          updatedAt: docsRepositoryConfigs.updatedAt,
          productName: products.name,
          productAbbreviation: products.abbreviation,
          productSolutionIcon: products.solutionIcon,
          productSolutionIconName: products.solutionIconName,
        })
        .from(docsRepositoryConfigs)
        .leftJoin(products, eq(docsRepositoryConfigs.productId, products.id))
        .orderBy(docsRepositoryConfigs.id);
      res.json(configs);
    } catch (error: any) {
      console.error("Error fetching docs repo configs:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/docs-repo-configs/all-sidebars", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const configs = await db
        .select({
          id: docsRepositoryConfigs.id,
          productId: docsRepositoryConfigs.productId,
          docsPath: docsRepositoryConfigs.docsPath,
          isActive: docsRepositoryConfigs.isActive,
          productName: products.name,
          productAbbreviation: products.abbreviation,
          productSolutionIcon: products.solutionIcon,
          productSolutionIconName: products.solutionIconName,
        })
        .from(docsRepositoryConfigs)
        .leftJoin(products, eq(docsRepositoryConfigs.productId, products.id))
        .where(eq(docsRepositoryConfigs.isActive, true));

      if (configs.length === 0) return res.json([]);

      const results: any[] = [];

      const namespaceKeys = (nodes: any[], prefix: string): void => {
        for (const node of nodes) {
          node.key = `${prefix}:${node.key}`;
          if (node.children?.length > 0) namespaceKeys(node.children, prefix);
        }
      };

      const buildTreeFromCache = (cachedDocs: { filePath: string; title: string | null; tokenEstimate: number | null }[], docsPath: string | null): any[] => {
        let basePrefix = docsPath ? docsPath + "/" : "";
        if (basePrefix && !cachedDocs.some(d => d.filePath.startsWith(basePrefix))) {
          basePrefix = "";
        }
        const treeMap: Record<string, any> = {};
        const treeRoots: any[] = [];

        for (const doc of cachedDocs) {
          const relativePath = basePrefix ? doc.filePath.slice(basePrefix.length) : doc.filePath;
          if (!relativePath) continue;
          const parts = relativePath.split("/");
          let currentParentKey = "";

          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isFile = i === parts.length - 1;
            const key = currentParentKey ? `${currentParentKey}/${part}` : part;

            if (isFile) {
              const cleanName = part.replace(/\.(md|mdx)$/, "");
              if (cleanName === "index") continue;
              const docNode = {
                key,
                label: doc.title || cleanName.replace(/-/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()),
                type: "doc",
                docPath: doc.filePath,
                depth: i,
                children: [],
                pageCount: 1,
                tokenCount: doc.tokenEstimate || 0,
              };
              if (currentParentKey && treeMap[currentParentKey]) {
                treeMap[currentParentKey].children.push(docNode);
              } else {
                treeRoots.push(docNode);
              }
              treeMap[key] = docNode;
            } else {
              if (!treeMap[key]) {
                const catNode = {
                  key,
                  label: part.replace(/-/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()),
                  type: "category",
                  docPath: null,
                  depth: i,
                  children: [],
                  pageCount: 0,
                  tokenCount: 0,
                };
                treeMap[key] = catNode;
                if (currentParentKey && treeMap[currentParentKey]) {
                  treeMap[currentParentKey].children.push(catNode);
                } else {
                  treeRoots.push(catNode);
                }
              }
              currentParentKey = key;
            }
          }
        }
        return treeRoots;
      };

      const aggregateCounts = (node: any): { pages: number; tokens: number } => {
        if (node.type === "doc") return { pages: 1, tokens: node.tokenCount || 0 };
        let pages = 0, tokens = 0;
        for (const child of node.children || []) {
          const c = aggregateCounts(child);
          pages += c.pages;
          tokens += c.tokens;
        }
        node.pageCount = pages;
        node.tokenCount = tokens;
        return { pages, tokens };
      };

      for (const config of configs) {
        const cachedDocs = await db
          .select({
            filePath: docsContentCache.filePath,
            title: docsContentCache.title,
            tokenEstimate: docsContentCache.tokenEstimate,
          })
          .from(docsContentCache)
          .where(eq(docsContentCache.repoConfigId, config.id))
          .orderBy(docsContentCache.filePath);

        const tokenByPath = new Map<string, number>();
        for (const doc of cachedDocs) {
          tokenByPath.set(doc.filePath, doc.tokenEstimate || 0);
        }

        let treeRoots: any[] = [];

        const sidebarNodes = await db
          .select()
          .from(docsSidebarStructure)
          .where(eq(docsSidebarStructure.repoConfigId, config.id))
          .orderBy(docsSidebarStructure.depth, docsSidebarStructure.position);

        if (sidebarNodes.length > 0) {
          const map = new Map<string, any>();
          const roots: any[] = [];

          for (const node of sidebarNodes) {
            map.set(node.nodeKey, {
              key: node.nodeKey,
              label: node.label,
              type: node.nodeType,
              docPath: node.docPath,
              depth: node.depth,
              children: [],
              pageCount: node.nodeType === "doc" ? 1 : 0,
              tokenCount: node.docPath ? (tokenByPath.get(node.docPath) || 0) : 0,
            });
          }

          for (const node of sidebarNodes) {
            const treeNode = map.get(node.nodeKey);
            if (node.parentKey && map.has(node.parentKey)) {
              map.get(node.parentKey).children.push(treeNode);
            } else {
              roots.push(treeNode);
            }
          }

          const hasDocNodes = roots.some((r: any) => {
            const countDocs = (n: any): number => {
              let c = n.type === "doc" ? 1 : 0;
              for (const child of n.children || []) c += countDocs(child);
              return c;
            };
            return countDocs(r) > 0;
          });

          if (hasDocNodes) {
            treeRoots = roots;
          } else if (cachedDocs.length > 0) {
            treeRoots = buildTreeFromCache(cachedDocs, config.docsPath);
          }
        } else if (cachedDocs.length > 0) {
          treeRoots = buildTreeFromCache(cachedDocs, config.docsPath);
        }

        let totalPages = 0, totalTokens = 0;
        for (const root of treeRoots) {
          const c = aggregateCounts(root);
          totalPages += c.pages;
          totalTokens += c.tokens;
        }

        namespaceKeys(treeRoots, String(config.productId));

        results.push({
          productId: config.productId,
          productName: config.productName,
          productAbbreviation: config.productAbbreviation,
          productSolutionIcon: config.productSolutionIcon,
          totalPages,
          totalTokens,
          tree: treeRoots,
        });
      }

      res.json(results);
    } catch (error: any) {
      console.error("Error fetching all sidebars:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/docs-repo-configs/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
      const [config] = await db
        .select()
        .from(docsRepositoryConfigs)
        .where(eq(docsRepositoryConfigs.id, id));
      if (!config) return res.status(404).json({ message: "Config not found" });
      res.json(config);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/docs-repo-configs", isAuthenticated, async (req: Request, res: Response) => {
    const userRole = (req as any).session?.user?.role;
    if (userRole?.toLowerCase() !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    try {
      const { productId, repoOwner, repoName, branch, docsPath, version, sidebarPath } = req.body;
      if (!productId || !docsPath || !repoOwner) {
        return res.status(400).json({ message: "productId, repoOwner and docsPath are required" });
      }

      const existing = await db
        .select()
        .from(docsRepositoryConfigs)
        .where(eq(docsRepositoryConfigs.productId, productId));
      if (existing.length > 0) {
        return res.status(400).json({ message: "A documentation config already exists for this solution" });
      }

      const userId = (req as any).session?.user?.id;
      const inserted = await db.insert(docsRepositoryConfigs).values({
        productId,
        repoOwner,
        repoName: repoName || "docs",
        branch: branch || "dev",
        docsPath,
        version: version || null,
        sidebarPath: sidebarPath || null,
        createdBy: userId,
      } as any).returning();
      const [created] = inserted as any[];

      res.status(201).json(created);
    } catch (error: any) {
      console.error("Error creating docs repo config:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/docs-repo-configs/:id", isAuthenticated, async (req: Request, res: Response) => {
    const userRole = (req as any).session?.user?.role;
    if (userRole?.toLowerCase() !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    try {
      const id = parseInt(req.params.id as string);
      const { repoOwner, repoName, branch, docsPath, version, sidebarPath, isActive } = req.body;

      const [updated] = await db
        .update(docsRepositoryConfigs)
        .set({
          ...(repoOwner !== undefined && { repoOwner }),
          ...(repoName !== undefined && { repoName }),
          ...(branch !== undefined && { branch }),
          ...(docsPath !== undefined && { docsPath }),
          ...(version !== undefined && { version }),
          ...(sidebarPath !== undefined && { sidebarPath }),
          ...(isActive !== undefined && { isActive }),
          updatedAt: new Date(),
        })
        .where(eq(docsRepositoryConfigs.id, id))
        .returning();

      if (!updated) return res.status(404).json({ message: "Config not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/docs-repo-configs/:id", isAuthenticated, async (req: Request, res: Response) => {
    const userRole = (req as any).session?.user?.role;
    if (userRole?.toLowerCase() !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    try {
      const id = parseInt(req.params.id as string);
      await db.delete(docsContentCache).where(eq(docsContentCache.repoConfigId, id));
      await db.delete(docsSidebarStructure).where(eq(docsSidebarStructure.repoConfigId, id));
      await db.delete(docsRepositoryConfigs).where(eq(docsRepositoryConfigs.id, id));
      res.json({ message: "Deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/docs-repo-configs/:id/sync", isAuthenticated, async (req: Request, res: Response) => {
    const userRole = (req as any).session?.user?.role;
    if (userRole?.toLowerCase() !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    try {
      const id = parseInt(req.params.id as string);
      const result = await syncRepositoryDocs(id);
      res.json(result);
    } catch (error: any) {
      console.error("Error syncing docs:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/docs-sync/sync-all", isAuthenticated, async (req: Request, res: Response) => {
    const userRole = (req as any).session?.user?.role;
    if (userRole?.toLowerCase() !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    try {
      const result = await syncAllRepositories();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/docs-repo-configs/:id/sidebar", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
      const nodes = await db
        .select()
        .from(docsSidebarStructure)
        .where(eq(docsSidebarStructure.repoConfigId, id))
        .orderBy(docsSidebarStructure.depth, docsSidebarStructure.position);

      const buildTree = (flatNodes: typeof nodes): any[] => {
        const map = new Map<string, any>();
        const roots: any[] = [];

        for (const node of flatNodes) {
          map.set(node.nodeKey, {
            key: node.nodeKey,
            label: node.label,
            type: node.nodeType,
            docPath: node.docPath,
            depth: node.depth,
            children: [],
          });
        }

        for (const node of flatNodes) {
          const treeNode = map.get(node.nodeKey);
          if (node.parentKey && map.has(node.parentKey)) {
            map.get(node.parentKey).children.push(treeNode);
          } else {
            roots.push(treeNode);
          }
        }

        return roots;
      }

      res.json(buildTree(nodes));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/docs-repo-configs/by-product/:productId/sidebar", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const productId = parseInt(req.params.productId as string);
      const configs = await db
        .select()
        .from(docsRepositoryConfigs)
        .where(and(
          eq(docsRepositoryConfigs.productId, productId),
          eq(docsRepositoryConfigs.isActive, true),
        ));

      if (configs.length === 0) {
        return res.json([]);
      }

      const allNodes: any[] = [];
      for (const config of configs) {
        const nodes = await db
          .select()
          .from(docsSidebarStructure)
          .where(eq(docsSidebarStructure.repoConfigId, config.id))
          .orderBy(docsSidebarStructure.depth, docsSidebarStructure.position);

        const map = new Map<string, any>();
        const roots: any[] = [];

        for (const node of nodes) {
          map.set(node.nodeKey, {
            key: node.nodeKey,
            label: node.label,
            type: node.nodeType,
            docPath: node.docPath,
            depth: node.depth,
            children: [],
          });
        }

        for (const node of nodes) {
          const treeNode = map.get(node.nodeKey);
          if (node.parentKey && map.has(node.parentKey)) {
            map.get(node.parentKey).children.push(treeNode);
          } else {
            roots.push(treeNode);
          }
        }

        const hasNoDocNodes = roots.every((r: any) => {
          const countDocs = (node: any): number => {
            let c = node.type === "doc" ? 1 : 0;
            for (const child of node.children || []) c += countDocs(child);
            return c;
          };
          return countDocs(r) === 0;
        });
        if (hasNoDocNodes) {
          const cachedDocs = await db
            .select({ filePath: docsContentCache.filePath, title: docsContentCache.title })
            .from(docsContentCache)
            .where(eq(docsContentCache.repoConfigId, config.id))
            .orderBy(docsContentCache.filePath);

          if (cachedDocs.length > 0) {
            let basePrefix = config.docsPath ? config.docsPath + "/" : "";
            if (basePrefix && !cachedDocs.some(d => d.filePath.startsWith(basePrefix))) {
              basePrefix = "";
            }
            const treeMap: Record<string, any> = {};
            const treeRoots: any[] = [];

            for (const doc of cachedDocs) {
              const relativePath = basePrefix ? doc.filePath.slice(basePrefix.length) : doc.filePath;
              if (!relativePath) continue;
              const parts = relativePath.split("/");
              let currentParentKey = "";

              for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                const isFile = i === parts.length - 1;
                const key = currentParentKey ? `${currentParentKey}/${part}` : part;

                if (isFile) {
                  const cleanName = part.replace(/\.(md|mdx)$/, "");
                  if (cleanName === "index") continue;
                  const docNode = {
                    key,
                    label: doc.title || cleanName.replace(/-/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()),
                    type: "doc",
                    docPath: doc.filePath,
                    depth: i,
                    children: [],
                  };
                  if (currentParentKey && treeMap[currentParentKey]) {
                    treeMap[currentParentKey].children.push(docNode);
                  } else {
                    treeRoots.push(docNode);
                  }
                  treeMap[key] = docNode;
                } else {
                  if (!treeMap[key]) {
                    const catNode = {
                      key,
                      label: part.replace(/-/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()),
                      type: "category",
                      docPath: null,
                      depth: i,
                      children: [],
                    };
                    treeMap[key] = catNode;
                    if (currentParentKey && treeMap[currentParentKey]) {
                      treeMap[currentParentKey].children.push(catNode);
                    } else {
                      treeRoots.push(catNode);
                    }
                  }
                  currentParentKey = key;
                }
              }
            }

            allNodes.push(...treeRoots);
            continue;
          }
        }

        allNodes.push(...roots);
      }

      res.json(allNodes);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/docs-repo-configs/:id/content", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = (page - 1) * limit;

      const search = (req.query.search as string) || "";

      const whereClause = search
        ? and(
            eq(docsContentCache.repoConfigId, id),
            sql`(${docsContentCache.title} ILIKE ${'%' + search + '%'} OR ${docsContentCache.filePath} ILIKE ${'%' + search + '%'})`
          )
        : eq(docsContentCache.repoConfigId, id);

      const [totalResult] = await db
        .select({ total: count() })
        .from(docsContentCache)
        .where(whereClause);

      const content = await db
        .select({
          id: docsContentCache.id,
          filePath: docsContentCache.filePath,
          title: docsContentCache.title,
          tokenEstimate: docsContentCache.tokenEstimate,
          lastModifiedAt: docsContentCache.lastModifiedAt,
          fetchedAt: docsContentCache.fetchedAt,
          createdAt: docsContentCache.createdAt,
        })
        .from(docsContentCache)
        .where(whereClause)
        .orderBy(docsContentCache.filePath)
        .limit(limit)
        .offset(offset);

      res.json({ pages: content, total: totalResult.total, page, limit });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/docs-content/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
      const [page] = await db
        .select({
          id: docsContentCache.id,
          filePath: docsContentCache.filePath,
          title: docsContentCache.title,
          content: docsContentCache.content,
          tokenEstimate: docsContentCache.tokenEstimate,
          lastModifiedAt: docsContentCache.lastModifiedAt,
          fetchedAt: docsContentCache.fetchedAt,
          contentHash: docsContentCache.contentHash,
        })
        .from(docsContentCache)
        .where(eq(docsContentCache.id, id));

      if (!page) {
        return res.status(404).json({ message: "Page not found" });
      }
      res.json(page);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/docs-repo-configs/:id/tree", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
      const pages = await db
        .select({
          id: docsContentCache.id,
          filePath: docsContentCache.filePath,
          title: docsContentCache.title,
          tokenEstimate: docsContentCache.tokenEstimate,
          createdAt: docsContentCache.createdAt,
          lastModifiedAt: docsContentCache.lastModifiedAt,
        })
        .from(docsContentCache)
        .where(eq(docsContentCache.repoConfigId, id))
        .orderBy(docsContentCache.filePath);

      res.json(pages);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/docs-sync/schedule", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const schedule = await db.select().from(docsSyncSchedule).limit(1);
      if (schedule.length === 0) {
        return res.json({
          syncIntervalHours: 24,
          isEnabled: true,
          lastRunAt: null,
          nextRunAt: null,
          lastRunStatus: null,
          lastRunMessage: null,
        });
      }
      res.json(schedule[0]);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/docs-sync/schedule", isAuthenticated, async (req: Request, res: Response) => {
    const userRole = (req as any).session?.user?.role;
    if (userRole?.toLowerCase() !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    try {
      const { syncIntervalHours, isEnabled } = req.body;
      if (!Number.isInteger(syncIntervalHours) || syncIntervalHours < 1 || syncIntervalHours > 720 || typeof isEnabled !== "boolean") {
        return res.status(400).json({ message: "syncIntervalHours must be a whole number of hours (1-720) and isEnabled a boolean" });
      }
      const userId = (req as any).session?.user?.id;
      await updateSyncSchedule(syncIntervalHours, isEnabled, userId);
      const schedule = await db.select().from(docsSyncSchedule).limit(1);
      res.json(schedule[0]);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  function parseProductsJsContent(jsContent: string): any[] {
    const productMatches: any[] = [];
    const objectBlockRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
    let blockMatch;
    while ((blockMatch = objectBlockRegex.exec(jsContent)) !== null) {
      const block = blockMatch[0];
      const idMatch = block.match(/id:\s*['"]([^'"]+)['"]/);
      const nameMatch = block.match(/name:\s*['"]([^'"]+)['"]/);
      const pathMatch = block.match(/path:\s*['"]([^'"]+)['"]/);
      if (!idMatch || !nameMatch || !pathMatch) continue;

      const productEntry: any = {
        id: idMatch[1],
        name: nameMatch[1],
        path: pathMatch[1],
      };
      const descMatch = block.match(/description:\s*['"]([^'"]*)['"]/);
      if (descMatch) productEntry.description = descMatch[1];

      const versions: any[] = [];
      const versionsSection = block.match(/versions:\s*\[([\s\S]*?)\]/);
      if (versionsSection) {
        const vBlock = versionsSection[1];
        const versionObjRegex = /\{([^}]+)\}/g;
        let vm;
        while ((vm = versionObjRegex.exec(vBlock)) !== null) {
          const vContent = vm[1];
          const vVersion = vContent.match(/version:\s*['"]([^'"]+)['"]/);
          const vLabel = vContent.match(/label:\s*['"]([^'"]+)['"]/);
          const vLatest = vContent.match(/isLatest:\s*(true|false)/);
          const vSidebar = vContent.match(/sidebarFile:\s*['"]([^'"]+)['"]/);
          if (vVersion) {
            versions.push({
              version: vVersion[1],
              label: vLabel?.[1] || vVersion[1],
              isLatest: vLatest?.[1] === "true",
              sidebarFile: vSidebar?.[1] || null,
            });
          }
        }
      }
      productEntry.versions = versions;

      const defaultVersionMatch = block.match(/defaultVersion:\s*['"]([^'"]+)['"]/);
      if (defaultVersionMatch) {
        productEntry.defaultVersion = defaultVersionMatch[1];
      }

      productMatches.push(productEntry);
    }
    return productMatches;
  }

  app.post("/api/docs/fetch-product-config", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { repoOwner, repoName, branch, configPath } = req.body;
      if (!repoOwner || !repoName || !branch) {
        return res.status(400).json({ message: "repoOwner, repoName, and branch are required" });
      }

      const safeSegment = /^[a-zA-Z0-9._-]+$/;
      const safeBranch = /^[a-zA-Z0-9._/-]+$/;
      const safePath = /^[a-zA-Z0-9._/-]+$/;

      if (typeof repoOwner !== "string" || !safeSegment.test(repoOwner)) {
        return res.status(400).json({ message: "Invalid repoOwner: only alphanumeric characters, dots, hyphens, and underscores are allowed" });
      }
      if (typeof repoName !== "string" || !safeSegment.test(repoName)) {
        return res.status(400).json({ message: "Invalid repoName: only alphanumeric characters, dots, hyphens, and underscores are allowed" });
      }
      if (typeof branch !== "string" || !safeBranch.test(branch)) {
        return res.status(400).json({ message: "Invalid branch: only alphanumeric characters, dots, hyphens, underscores, and forward slashes are allowed" });
      }

      const path = (typeof configPath === "string" && configPath) ? configPath : "src/config/products.js";
      if (typeof path !== "string" || !safePath.test(path) || path.includes("..")) {
        return res.status(400).json({ message: "Invalid configPath: path traversal sequences and special characters are not allowed" });
      }

      const rawUrl = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/${branch}/${path}`;
      const resp = await fetch(rawUrl);
      if (!resp.ok) {
        return res.status(404).json({ message: `Could not fetch config at ${path} (HTTP ${resp.status}). Check the path and branch.` });
      }
      const jsContent = await resp.text();
      const productsList = parseProductsJsContent(jsContent);
      if (productsList.length === 0) {
        return res.status(422).json({ message: "File fetched but no product entries could be parsed from it" });
      }

      const entries: any[] = [];
      for (const product of productsList) {
        if (product.versions && product.versions.length > 0) {
          for (const v of product.versions) {
            const versionPath = v.version === "current" ? product.path : `${product.path}/${v.version}`;
            entries.push({
              productId: product.id,
              productName: product.name,
              docsPath: versionPath,
              version: v.version === "current" ? "" : v.version,
              versionLabel: v.label,
              isLatest: v.isLatest,
              sidebarFile: v.sidebarFile?.replace(/^\.\//, "") || "",
            });
          }
        } else {
          entries.push({
            productId: product.id,
            productName: product.name,
            docsPath: product.path,
            version: "",
            versionLabel: "",
            isLatest: true,
            sidebarFile: "",
          });
        }
      }

      res.json({ products: productsList, entries });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/docs/parse-github-url", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== 'string' || url.length > 500) {
        return res.status(400).json({ message: "url is required and must be under 500 characters" });
      }

      const cleanUrl = url.trim().replace(/\/+$/, "");

      const patterns = [
        /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/(?:tree|blob)\/([^\/]+)\/(.+)$/,
        /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/(?:tree|blob)\/([^\/]+)\/?$/,
        /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/?$/,
      ];

      let repoOwner = "";
      let repoName = "";
      let branch = "main";
      let docsPath = "";
      let matched = false;

      for (const pattern of patterns) {
        const m = cleanUrl.match(pattern);
        if (m) {
          repoOwner = m[1];
          repoName = m[2];
          if (m[3]) branch = m[3];
          if (m[4]) docsPath = m[4].replace(/\/+$/, "");
          matched = true;
          break;
        }
      }

      if (!matched) {
        return res.status(400).json({ message: "Could not parse GitHub URL. Try: https://github.com/owner/repo/tree/branch/path" });
      }

      const result: any = { repoOwner, repoName, branch, docsPath };

      try {
        const productsUrl = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/${branch}/src/config/products.js`;
        const resp = await fetch(productsUrl);
        if (resp.ok) {
          const jsContent = await resp.text();
          const productMatches = parseProductsJsContent(jsContent);
          result.products = productMatches;

          if (docsPath) {
            const cleanPath = docsPath.replace(/\/+$/, "");
            const matchedProduct = productMatches.find(p =>
              cleanPath === p.path || cleanPath.startsWith(p.path + "/")
            );
            if (matchedProduct) {
              result.matchedProduct = matchedProduct;
              const pathAfterProduct = cleanPath.substring(matchedProduct.path.length + 1);
              if (pathAfterProduct) {
                const matchedVersion = matchedProduct.versions?.find((v: any) => v.version === pathAfterProduct);
                if (matchedVersion) {
                  result.matchedVersion = matchedVersion;
                  result.docsPath = cleanPath;
                  result.version = matchedVersion.version;
                  result.sidebarPath = matchedVersion.sidebarFile?.replace(/^\.\//, "") || "";
                } else {
                  result.docsPath = cleanPath;
                }
              } else {
                const latestVersion = matchedProduct.versions?.find((v: any) => v.isLatest);
                if (latestVersion) {
                  result.matchedVersion = latestVersion;
                  result.docsPath = matchedProduct.path + (latestVersion.version !== "current" ? `/${latestVersion.version}` : "");
                  result.version = latestVersion.version !== "current" ? latestVersion.version : "";
                  result.sidebarPath = latestVersion.sidebarFile?.replace(/^\.\//, "") || "";
                } else {
                  result.docsPath = cleanPath;
                }
              }
            }
          }
        } else {
          result.productsNote = "Could not fetch repository config — fill in fields manually";
        }
      } catch (fetchErr) {
        result.productsNote = "Could not fetch repository config — fill in fields manually";
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/docs/assessment-content", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { productId, selectedDocKeys } = req.body;
      if (!productId) return res.status(400).json({ message: "productId required" });
      const result = await getDocContentForAssessment(productId, selectedDocKeys || []);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
}
