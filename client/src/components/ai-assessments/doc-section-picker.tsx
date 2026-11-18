import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, ChevronDown, ChevronRight, FileText, FolderOpen, Package } from "lucide-react";

interface SidebarNode {
  key: string;
  label: string;
  type: "category" | "doc";
  docPath: string | null;
  depth: number;
  children: SidebarNode[];
  pageCount?: number;
  tokenCount?: number;
}

interface SolutionSidebar {
  productId: number;
  productName: string;
  productAbbreviation: string;
  productSolutionIcon: string | null;
  totalPages: number;
  totalTokens: number;
  tree: SidebarNode[];
}

interface DocSectionPickerProps {
  selectedKeys: string[];
  onChange: (keys: string[]) => void;
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(tokens >= 10000 ? 0 : 1)}k`;
  return String(tokens);
}

export function DocSectionPicker({ selectedKeys, onChange }: DocSectionPickerProps) {
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  const { data: solutions = [], isLoading } = useQuery<SolutionSidebar[]>({
    queryKey: ["/api/docs-repo-configs/all-sidebars"],
    queryFn: async () => {
      const res = await fetch("/api/docs-repo-configs/all-sidebars", {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const toggleExpanded = useCallback((key: string) => {
    setExpandedNodes((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const getAllDocKeys = useCallback((node: SidebarNode): string[] => {
    const keys: string[] = [];
    if (node.type === "doc" && node.docPath) keys.push(node.key);
    if (node.type === "category" && node.children.length === 0) keys.push(node.key);
    for (const child of node.children) {
      keys.push(...getAllDocKeys(child));
    }
    return keys;
  }, []);

  const getAllDocKeysForSolution = useCallback((solution: SolutionSidebar): string[] => {
    return solution.tree.flatMap(node => getAllDocKeys(node));
  }, [getAllDocKeys]);

  const toggleNode = useCallback(
    (node: SidebarNode) => {
      if (node.type === "doc" && node.docPath) {
        const next = selectedKeys.includes(node.key)
          ? selectedKeys.filter((k) => k !== node.key)
          : [...selectedKeys, node.key];
        onChange(next);
      } else {
        const childKeys = getAllDocKeys(node);
        const allSelected = childKeys.every((k) => selectedKeys.includes(k));
        const next = allSelected
          ? selectedKeys.filter((k) => !childKeys.includes(k))
          : [...new Set([...selectedKeys, ...childKeys])];
        onChange(next);
      }
    },
    [selectedKeys, onChange, getAllDocKeys]
  );

  const toggleSolution = useCallback(
    (solution: SolutionSidebar) => {
      const allKeys = getAllDocKeysForSolution(solution);
      const allSelected = allKeys.every((k) => selectedKeys.includes(k));
      const next = allSelected
        ? selectedKeys.filter((k) => !allKeys.includes(k))
        : [...new Set([...selectedKeys, ...allKeys])];
      onChange(next);
    },
    [selectedKeys, onChange, getAllDocKeysForSolution]
  );

  const getNodeState = useCallback(
    (node: SidebarNode): boolean | "indeterminate" => {
      if (node.type === "doc") return selectedKeys.includes(node.key);
      const childKeys = getAllDocKeys(node);
      if (childKeys.length === 0) return false;
      const allSelected = childKeys.every((k) => selectedKeys.includes(k));
      const someSelected = childKeys.some((k) => selectedKeys.includes(k));
      if (allSelected) return true;
      if (someSelected) return "indeterminate";
      return false;
    },
    [selectedKeys, getAllDocKeys]
  );

  const getSolutionState = useCallback(
    (solution: SolutionSidebar): boolean | "indeterminate" => {
      const allKeys = getAllDocKeysForSolution(solution);
      if (allKeys.length === 0) return false;
      const allSelected = allKeys.every((k) => selectedKeys.includes(k));
      const someSelected = allKeys.some((k) => selectedKeys.includes(k));
      if (allSelected) return true;
      if (someSelected) return "indeterminate";
      return false;
    },
    [selectedKeys, getAllDocKeysForSolution]
  );

  const selectedTokenCount = useMemo(() => {
    let tokens = 0;
    const collectTokens = (node: SidebarNode) => {
      if (node.type === "doc" && selectedKeys.includes(node.key)) {
        tokens += node.tokenCount || 0;
      }
      for (const child of node.children) collectTokens(child);
    };
    for (const sol of solutions) {
      for (const root of sol.tree) collectTokens(root);
    }
    return tokens;
  }, [solutions, selectedKeys]);

  if (isLoading) {
    return (
      <div className="space-y-2 p-2">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-6 w-5/6" />
      </div>
    );
  }

  if (solutions.length === 0) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        <BookOpen className="h-8 w-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
        No documentation sources configured
      </div>
    );
  }

  const renderNode = (node: SidebarNode, depth: number = 0): React.ReactNode => {
    const isExpanded = expandedNodes[node.key] ?? false;
    const hasChildren = node.children.length > 0;
    const state = getNodeState(node);

    return (
      <div key={node.key}>
        <div
          className="flex items-center gap-1.5 py-1 px-1 cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/20 rounded-sm"
          style={{ paddingLeft: `${depth * 14 + 6}px` }}
          onClick={() => hasChildren && toggleExpanded(node.key)}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            )
          ) : (
            <span className="w-3" />
          )}
          <Checkbox
            checked={state === true ? true : state === "indeterminate" ? "indeterminate" : false}
            onCheckedChange={() => toggleNode(node)}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 h-3.5 w-3.5"
          />
          {node.type === "category" ? (
            <FolderOpen className="h-3 w-3 text-amber-500 dark:text-amber-400 shrink-0" />
          ) : (
            <FileText className="h-3 w-3 text-blue-500 dark:text-blue-400 shrink-0" />
          )}
          <span className="text-xs text-foreground truncate flex-1">{node.label}</span>
          {(node.pageCount !== undefined && node.pageCount > 0) && (
            <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
              {node.type === "category" 
                ? `${node.pageCount}p / ${formatTokenCount(node.tokenCount || 0)}t`
                : `${formatTokenCount(node.tokenCount || 0)}t`
              }
            </span>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div>{node.children.map((child) => renderNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-green-600 dark:text-green-400" />
          <span className="text-sm font-medium text-foreground">Documentation Sections</span>
        </div>
        {selectedKeys.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {selectedKeys.length} selected{selectedTokenCount > 0 ? ` · ${formatTokenCount(selectedTokenCount)}t` : ""}
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-2">
        Select documentation sections to include as AI context for this criterion
      </p>
      <ScrollArea className="h-[240px] rounded-md border border-border bg-background p-1">
        {solutions.map((solution) => {
          const solKey = `__sol_${solution.productId}`;
          const isExpanded = expandedNodes[solKey] ?? false;
          const state = getSolutionState(solution);

          return (
            <div key={solKey} className="mb-1">
              <div
                className="flex items-center gap-1.5 py-1.5 px-2 cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/20 rounded-sm bg-muted/30 dark:bg-muted/10"
                onClick={() => toggleExpanded(solKey)}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <Checkbox
                  checked={state === true ? true : state === "indeterminate" ? "indeterminate" : false}
                  onCheckedChange={() => toggleSolution(solution)}
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0"
                />
                <Package className="h-3.5 w-3.5 text-purple-500 dark:text-purple-400 shrink-0" />
                <span className="text-xs font-medium text-foreground truncate flex-1">
                  {solution.productName}
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                  {solution.totalPages}p / {formatTokenCount(solution.totalTokens)}t
                </span>
              </div>
              {isExpanded && (
                <div className="ml-1">
                  {solution.tree.map((node) => renderNode(node, 1))}
                </div>
              )}
            </div>
          );
        })}
      </ScrollArea>
    </div>
  );
}
