import { SolutionGraphic } from "@/components/ui/solution-graphic";
import { useState, useRef, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";
import {
  FileText,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  Eye,
  ArrowLeft,
  Hash,
  Clock,
  FolderTree,
  FolderOpen,
  Folder,
  Coins,
  BookOpen,
  List,
  Network,
} from "lucide-react";

interface SyncedPagesDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  configId: number;
  productName: string;
  productIcon?: string | null;
  productIconName?: string | null;
  totalPages: number | null;
  lastSyncAt?: string | null;
}

interface CachedPage {
  id: number;
  filePath: string;
  title: string | null;
  tokenEstimate: number | null;
  lastModifiedAt: string | null;
  fetchedAt: string | null;
  createdAt: string | null;
}

interface TreePage {
  id: number;
  filePath: string;
  title: string | null;
  tokenEstimate: number | null;
  createdAt: string | null;
  lastModifiedAt: string | null;
}

interface PageContent {
  id: number;
  filePath: string;
  title: string | null;
  content: string | null;
  tokenEstimate: number | null;
  lastModifiedAt: string | null;
  fetchedAt: string | null;
  contentHash: string | null;
}

interface PagesResponse {
  pages: CachedPage[];
  total: number;
  page: number;
  limit: number;
}

interface TreeNode {
  name: string;
  path: string;
  page?: TreePage;
  children: TreeNode[];
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildTree(pages: TreePage[], basePath: string): TreeNode[] {
  const root: TreeNode = { name: "", path: "", children: [] };

  const prefix = basePath ? basePath.replace(/\/$/, "") + "/" : "";

  for (const page of pages) {
    const relativePath = prefix && page.filePath.startsWith(prefix)
      ? page.filePath.slice(prefix.length)
      : page.filePath;

    const parts = relativePath.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;

      if (isFile) {
        current.children.push({
          name: part,
          path: page.filePath,
          page,
          children: [],
        });
      } else {
        let folder = current.children.find((c) => !c.page && c.name === part);
        if (!folder) {
          folder = { name: part, path: parts.slice(0, i + 1).join("/"), children: [] };
          current.children.push(folder);
        }
        current = folder;
      }
    }
  }

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (!a.page && b.page) return -1;
      if (a.page && !b.page) return 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.children.length > 0) sortNodes(node.children);
    }
  };

  sortNodes(root.children);
  return root.children;
}

function TreeNodeRow({
  node,
  depth,
  expandedPaths,
  toggleExpand,
  onSelectPage,
  lastSyncAt,
  pageFilter,
}: {
  node: TreeNode;
  depth: number;
  expandedPaths: Set<string>;
  toggleExpand: (path: string) => void;
  onSelectPage: (id: number) => void;
  lastSyncAt: string | null | undefined;
  pageFilter: PageFilter;
}) {
  const isFolder = !node.page;
  const isExpanded = expandedPaths.has(node.path);
  const syncAt = lastSyncAt ?? null;

  if (isFolder) {
    if (!hasMatchingPages(node, syncAt, pageFilter)) return null;
    const pageCount = countPages(node);
    return (
      <>
        <div
          className="flex items-center gap-1.5 py-1.5 px-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer transition-colors"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => toggleExpand(node.path)}
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          ) : (
            <ChevronRightIcon className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          )}
          {isExpanded ? (
            <FolderOpen className="h-4 w-4 text-amber-500 dark:text-amber-400 shrink-0" />
          ) : (
            <Folder className="h-4 w-4 text-amber-500 dark:text-amber-400 shrink-0" />
          )}
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
            {node.name}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto shrink-0">
            {pageCount}
          </span>
        </div>
        {isExpanded &&
          node.children.map((child) => (
            <TreeNodeRow
              key={child.path + (child.page?.id ?? "")}
              node={child}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              toggleExpand={toggleExpand}
              onSelectPage={onSelectPage}
              lastSyncAt={lastSyncAt}
              pageFilter={pageFilter}
            />
          ))}
      </>
    );
  }

  if (!pageMatchesFilter(node.page!, syncAt, pageFilter)) return null;

  const displayName = node.page?.title || node.name.replace(/\.md$/, "");
  const { isNew, isUpdated } = node.page ? getPageStatus(node.page, syncAt) : { isNew: false, isUpdated: false };

  return (
    <div
      className="flex items-center gap-1.5 py-1.5 px-2 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer transition-colors group"
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
      onClick={() => node.page && onSelectPage(node.page.id)}
    >
      <div className="w-3.5 shrink-0" />
      <FileText className="h-4 w-4 text-blue-500 dark:text-blue-400 shrink-0" />
      <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">
        {displayName}
      </span>
      {isNew && (
        <Badge className="text-[10px] px-1.5 py-0 h-4 bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 border-0 font-medium shrink-0">
          New
        </Badge>
      )}
      {isUpdated && (
        <Badge className="text-[10px] px-1.5 py-0 h-4 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 border-0 font-medium shrink-0">
          Updated
        </Badge>
      )}
      {node.page?.tokenEstimate != null && (
        <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0 ml-1">
          {node.page.tokenEstimate.toLocaleString()}
        </span>
      )}
    </div>
  );
}

function countPages(node: TreeNode): number {
  if (node.page) return 1;
  return node.children.reduce((sum, child) => sum + countPages(child), 0);
}

type PageFilter = "all" | "new" | "updated";

function getPageStatus(page: TreePage, lastSyncAt: string | null): { isNew: boolean; isUpdated: boolean } {
  const lastSyncDate = lastSyncAt ? new Date(lastSyncAt) : null;
  const createdDate = page.createdAt ? new Date(page.createdAt) : null;
  const modifiedDate = page.lastModifiedAt ? new Date(page.lastModifiedAt) : null;
  const isNew = !!(lastSyncDate && createdDate && createdDate >= lastSyncDate);
  const isUpdated = !isNew && !!(lastSyncDate && modifiedDate && modifiedDate >= lastSyncDate);
  return { isNew, isUpdated };
}

function pageMatchesFilter(page: TreePage, lastSyncAt: string | null, filter: PageFilter): boolean {
  if (filter === "all") return true;
  const { isNew, isUpdated } = getPageStatus(page, lastSyncAt);
  if (filter === "new") return isNew;
  if (filter === "updated") return isUpdated;
  return true;
}

function hasMatchingPages(node: TreeNode, lastSyncAt: string | null, filter: PageFilter): boolean {
  if (filter === "all") return true;
  if (node.page) return pageMatchesFilter(node.page, lastSyncAt, filter);
  return node.children.some((child) => hasMatchingPages(child, lastSyncAt, filter));
}

export function SyncedPagesDrawer({
  open,
  onOpenChange,
  configId,
  productName,
  productIcon,
  productIconName,
  totalPages,
  lastSyncAt,
}: SyncedPagesDrawerProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedPageId, setSelectedPageId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"tree" | "list">("tree");
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [pageFilter, setPageFilter] = useState<PageFilter>("all");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageSize = 30;

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setCurrentPage(1);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
  }, []);

  const toggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback((nodes: TreeNode[]) => {
    const paths = new Set<string>();
    const collect = (list: TreeNode[]) => {
      for (const n of list) {
        if (!n.page && n.children.length > 0) {
          paths.add(n.path);
          collect(n.children);
        }
      }
    };
    collect(nodes);
    setExpandedPaths(paths);
  }, []);

  const { data: pagesData, isLoading } = useQuery<PagesResponse>({
    queryKey: [`/api/docs-repo-configs/${configId}/content`, currentPage, debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(pageSize),
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      return await apiRequest("GET", `/api/docs-repo-configs/${configId}/content?${params}`);
    },
    enabled: open && viewMode === "list" && !selectedPageId,
  });

  const { data: treeData, isLoading: isTreeLoading } = useQuery<TreePage[]>({
    queryKey: [`/api/docs-repo-configs/${configId}/tree`],
    queryFn: async () => {
      return await apiRequest("GET", `/api/docs-repo-configs/${configId}/tree`);
    },
    enabled: open && viewMode === "tree" && !selectedPageId,
  });

  const { data: pageContent, isLoading: isContentLoading } = useQuery<PageContent>({
    queryKey: [`/api/docs-content/${selectedPageId}`],
    queryFn: async () => {
      return await apiRequest("GET", `/api/docs-content/${selectedPageId}`);
    },
    enabled: !!selectedPageId,
  });

  const treeNodes = useMemo(() => {
    if (!treeData || treeData.length === 0) return [];
    const allDirParts = treeData.map((p) => {
      const parts = p.filePath.split("/");
      return parts.slice(0, parts.length - 1);
    });
    let commonDepth = 0;
    if (allDirParts.length > 0) {
      const first = allDirParts[0];
      for (let i = 0; i < first.length; i++) {
        if (allDirParts.every((parts) => parts.length > i && parts[i] === first[i])) {
          commonDepth = i + 1;
        } else {
          break;
        }
      }
    }
    const commonPrefix = commonDepth > 0
      ? allDirParts[0].slice(0, commonDepth).join("/") + "/"
      : "";
    return buildTree(treeData, commonPrefix);
  }, [treeData]);

  const totalCount = pagesData?.total ?? totalPages ?? 0;
  const totalPagesCount = Math.ceil(totalCount / pageSize);
  const pages = pagesData?.pages ?? [];

  const handleClose = () => {
    setSelectedPageId(null);
    setSearch("");
    setDebouncedSearch("");
    setCurrentPage(1);
    setExpandedPaths(new Set());
    setPageFilter("all");
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="w-full sm:max-w-[700px] overflow-hidden flex flex-col">
        <SheetHeader className="pb-4 shrink-0">
          <SheetTitle className="flex items-center gap-2 text-lg">
            {selectedPageId ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedPageId(null)}
                  className="h-7 w-7 p-0 mr-1"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <FileText className="h-5 w-5 text-blue-600" />
                Page Content
              </>
            ) : (
              <>
                {productIcon || productIconName ? (
                  <SolutionGraphic graphic={productIcon} icon={productIconName} name={productName} className="h-5 w-5" />
                ) : (
                  <BookOpen className="h-5 w-5 text-blue-600" />
                )}
                Synced Pages
              </>
            )}
          </SheetTitle>
          <SheetDescription>
            {selectedPageId
              ? pageContent?.title || pageContent?.filePath || "Loading..."
              : `${treeData?.length ?? totalCount} pages synced for ${productName}`}
          </SheetDescription>
        </SheetHeader>

        {selectedPageId ? (
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            {isContentLoading ? (
              <div className="space-y-3 p-2">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : pageContent ? (
              <>
                <div className="flex flex-wrap items-center gap-2 mb-3 shrink-0 px-1">
                  <Badge variant="outline" className="text-xs dark:border-gray-600 dark:text-gray-400">
                    <FolderTree className="h-3 w-3 mr-1" />
                    {pageContent.filePath}
                  </Badge>
                  {pageContent.tokenEstimate != null && (
                    <Badge variant="outline" className="text-xs dark:border-gray-600 dark:text-gray-400">
                      <Coins className="h-3 w-3 mr-1" />
                      {pageContent.tokenEstimate.toLocaleString()} tokens
                    </Badge>
                  )}
                  {pageContent.contentHash && (
                    <Badge variant="outline" className="text-xs dark:border-gray-600 dark:text-gray-400">
                      <Hash className="h-3 w-3 mr-1" />
                      {pageContent.contentHash.substring(0, 8)}
                    </Badge>
                  )}
                </div>
                <ScrollArea className="flex-1 min-h-0">
                  <div className="pr-4">
                    <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono leading-relaxed bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border dark:border-gray-700">
                      {pageContent.content || "No content available."}
                    </pre>
                  </div>
                </ScrollArea>
              </>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">Page not found.</p>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            <div className="flex items-center gap-2 mb-3 shrink-0">
              {viewMode === "list" && (
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search by title or file path..."
                    value={search}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-9 dark:border-gray-600 dark:bg-gray-800"
                  />
                </div>
              )}
              {viewMode === "tree" && treeNodes.length > 0 && (
                <div className="flex-1 flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => expandAll(treeNodes)}
                    className="text-xs dark:border-gray-600 dark:text-gray-300"
                  >
                    Expand All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setExpandedPaths(new Set())}
                    className="text-xs dark:border-gray-600 dark:text-gray-300"
                  >
                    Collapse All
                  </Button>
                </div>
              )}
              {lastSyncAt && (
                <div className="flex items-center border rounded-md dark:border-gray-600 shrink-0">
                  {(["all", "new", "updated"] as PageFilter[]).map((f, idx) => (
                    <Button
                      key={f}
                      variant={pageFilter === f ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setPageFilter(f)}
                      className={`h-8 px-2.5 text-xs capitalize ${idx === 0 ? "rounded-r-none" : idx === 2 ? "rounded-l-none" : "rounded-none border-x dark:border-gray-600"}`}
                    >
                      {f === "all" ? "All" : f === "new" ? "New" : "Updated"}
                    </Button>
                  ))}
                </div>
              )}
              <div className="flex items-center border rounded-md dark:border-gray-600 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={viewMode === "tree" ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("tree")}
                      className="h-8 w-8 p-0 rounded-r-none"
                    >
                      <Network className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Table of Contents</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={viewMode === "list" ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("list")}
                      className="h-8 w-8 p-0 rounded-l-none"
                    >
                      <List className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Flat List</TooltipContent>
                </Tooltip>
              </div>
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <div className="pr-4">
                {viewMode === "tree" ? (
                  isTreeLoading ? (
                    Array.from({ length: 10 }).map((_, i) => (
                      <div key={i} className="py-1.5 px-2" style={{ paddingLeft: `${(i % 3) * 16 + 8}px` }}>
                        <Skeleton className="h-4 w-2/3" />
                      </div>
                    ))
                  ) : treeNodes.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                      <FolderTree className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">No pages synced yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-0">
                      {treeNodes.map((node) => (
                        <TreeNodeRow
                          key={node.path + (node.page?.id ?? "")}
                          node={node}
                          depth={0}
                          expandedPaths={expandedPaths}
                          toggleExpand={toggleExpand}
                          onSelectPage={setSelectedPageId}
                          lastSyncAt={lastSyncAt}
                          pageFilter={pageFilter}
                        />
                      ))}
                    </div>
                  )
                ) : (
                  <div className="space-y-1">
                    {isLoading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="p-3 rounded-lg">
                          <Skeleton className="h-4 w-2/3 mb-2" />
                          <Skeleton className="h-3 w-full" />
                        </div>
                      ))
                    ) : pages.length === 0 ? (
                      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                        <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        <p className="text-sm">
                          {debouncedSearch ? "No pages match your search." : "No pages synced yet."}
                        </p>
                      </div>
                    ) : (() => {
                      const filteredPages = pages.filter((page) => pageMatchesFilter(page, lastSyncAt ?? null, pageFilter));
                      if (filteredPages.length === 0) {
                        return (
                          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                            <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                            <p className="text-sm">
                              No {pageFilter === "new" ? "new" : "updated"} pages since the last sync.
                            </p>
                          </div>
                        );
                      }
                      return filteredPages.map((page) => {
                        const lastSyncDate = lastSyncAt ? new Date(lastSyncAt) : null;
                        const createdDate = page.createdAt ? new Date(page.createdAt) : null;
                        const modifiedDate = page.lastModifiedAt ? new Date(page.lastModifiedAt) : null;
                        const isNew = lastSyncDate && createdDate && createdDate >= lastSyncDate;
                        const isUpdated = !isNew && lastSyncDate && modifiedDate && modifiedDate >= lastSyncDate;
                        return (
                        <div
                          key={page.id}
                          className="group flex items-start justify-between p-3 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                          onClick={() => setSelectedPageId(page.id)}
                        >
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            <FileText className="h-4 w-4 text-blue-500 dark:text-blue-400 mt-0.5 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                  {page.title || page.filePath.split("/").pop() || "Untitled"}
                                </p>
                                {isNew && (
                                  <Badge className="text-[10px] px-1.5 py-0 h-4 bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 border-0 font-medium shrink-0">
                                    New
                                  </Badge>
                                )}
                                {isUpdated && (
                                  <Badge className="text-[10px] px-1.5 py-0 h-4 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 border-0 font-medium shrink-0">
                                    Updated
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                {page.filePath}
                              </p>
                              <div className="flex items-center gap-3 mt-1.5">
                                {page.tokenEstimate != null && (
                                  <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                                    <Coins className="h-3 w-3" />
                                    {page.tokenEstimate.toLocaleString()}
                                  </span>
                                )}
                                {page.fetchedAt && (
                                  <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {formatDate(page.fetchedAt)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPageId(page.id);
                            }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
            </ScrollArea>

            {viewMode === "list" && totalPagesCount > 1 && (
              <div className="flex items-center justify-between pt-3 mt-2 border-t dark:border-gray-700 shrink-0">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Page {currentPage} of {totalPagesCount} ({totalCount} pages)
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => p - 1)}
                    className="h-7 w-7 p-0 dark:border-gray-600"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPagesCount}
                    onClick={() => setCurrentPage((p) => p + 1)}
                    className="h-7 w-7 p-0 dark:border-gray-600"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
