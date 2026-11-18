import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { SIDEBAR_NAV, filterSidebarNav } from "@/components/layout/sidebar-nav-config";
import { buildPageIndex, searchPageIndex, type PageSearchEntry } from "./page-search-index";
import { apiRequest } from "@/lib/queryClient";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { 
  ScanSearch, 
  FolderGit2, 
  Building2, 
  ClipboardList, 
  Users, 
  FileText,
  Loader2,
  AlertCircle,
  Clock,
  Star,
  Home,
  BookOpen,
  SquareTerminal
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCrmProvider } from "@/hooks/use-crm-provider";

export interface GlobalSearchResult {
  id: string | number;
  type: "project" | "customer" | "map" | "user" | "document" | "page" | "guide";
  label: string;
  description?: string;
  url: string;
  score?: number;
  isRecent?: boolean;
  isMyItem?: boolean;
}

interface SearchCache {
  [query: string]: {
    results: GlobalSearchResult[];
    timestamp: number;
  };
}

const CACHE_TTL = 5 * 60 * 1000;
const DEBOUNCE_DELAY = 300;
const MAX_RESULTS = 20;

const EXTERNAL_ROLES = ["Customer", "Partner", "Guest"];

const TYPE_ICONS: Record<GlobalSearchResult["type"], React.ComponentType<{ className?: string }>> = {
  project: FolderGit2,
  customer: Building2,
  map: ClipboardList,
  user: Users,
  document: FileText,
  page: Home,
  guide: BookOpen,
};

const TYPE_COLORS: Record<GlobalSearchResult["type"], string> = {
  project: "text-blue-600 dark:text-blue-400",
  customer: "text-green-600 dark:text-green-400",
  map: "text-purple-600 dark:text-purple-400",
  user: "text-orange-600 dark:text-orange-400",
  document: "text-gray-600 dark:text-gray-400",
  page: "text-indigo-600 dark:text-indigo-400",
  guide: "text-teal-600 dark:text-teal-400",
};

export function GlobalSearch() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { canView } = usePermissions();
  const { provider: activeCrm } = useCrmProvider();
  const [, setLocation] = useLocation();
  
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const searchCache = useRef<SearchCache>({});
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isInternalUser = useMemo(() => {
    if (!user?.role) return false;
    return !EXTERNAL_ROLES.includes(user.role);
  }, [user?.role]);

  // Page results come from the sidebar menu (same permission filter), so
  // pages that move, get renamed or are removed stay in sync with search.
  // The index is rebuilt every render and read through a ref: canView is a new
  // function on each render, so memoizing on it would change withPageResults →
  // performSearch → debouncedSearch every render, and the search effect would
  // loop on setResults (React error #185).
  const role = user?.role;
  const pageIndexRef = useRef<PageSearchEntry[]>([]);
  pageIndexRef.current = buildPageIndex(
    filterSidebarNav(SIDEBAR_NAV, canView, role === "Admin", activeCrm, !!user?.demoLogin),
    (key) => t(key),
    role === "Admin",
  );

  const withPageResults = useCallback((q: string, serverResults: GlobalSearchResult[]): GlobalSearchResult[] => {
    const pages: GlobalSearchResult[] = searchPageIndex(pageIndexRef.current, q).map((hit) => ({
      id: hit.id,
      type: "page",
      label: hit.label,
      description: hit.trail.join(" › "),
      url: hit.href,
      score: hit.score,
    }));
    return [...serverResults, ...pages]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, MAX_RESULTS);
  }, []);

  const isMac = useMemo(() => {
    if (typeof navigator !== 'undefined') {
      return /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    }
    return false;
  }, []);

  const getCachedResults = useCallback((q: string): GlobalSearchResult[] | null => {
    const cached = searchCache.current[q];
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.results;
    }
    return null;
  }, []);

  const setCachedResults = useCallback((q: string, res: GlobalSearchResult[]) => {
    searchCache.current[q] = {
      results: res,
      timestamp: Date.now(),
    };
  }, []);

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setError(null);
      return;
    }

    const cached = getCachedResults(searchQuery);
    if (cached) {
      setResults(withPageResults(searchQuery, cached));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiRequest("GET", `/api/search?q=${encodeURIComponent(searchQuery)}&limit=${MAX_RESULTS}`);
      const searchResults = response as GlobalSearchResult[];
      setResults(withPageResults(searchQuery, searchResults));
      setCachedResults(searchQuery, searchResults);
    } catch (err) {
      console.error("Global search error:", err);
      setError(t("globalSearch.error", "Failed to search. Please try again."));
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [getCachedResults, setCachedResults, withPageResults, t]);

  const debouncedSearch = useCallback((searchQuery: string) => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    if (!searchQuery.trim()) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    
    debounceTimer.current = setTimeout(() => {
      performSearch(searchQuery);
    }, DEBOUNCE_DELAY);
  }, [performSearch]);

  useEffect(() => {
    debouncedSearch(query);
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [query, debouncedSearch]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (isInternalUser) {
          setOpen(true);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isInternalUser]);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  const handleSelect = useCallback((result: GlobalSearchResult) => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setLocation(result.url);
  }, [setLocation]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    }
  }, [results, selectedIndex, handleSelect]);

  const groupedResults = useMemo(() => {
    const groups: Record<GlobalSearchResult["type"], GlobalSearchResult[]> = {
      project: [],
      customer: [],
      map: [],
      user: [],
      document: [],
      page: [],
      guide: [],
    };

    results.forEach((result) => {
      if (groups[result.type]) {
        groups[result.type].push(result);
      }
    });

    return groups;
  }, [results]);

  const getTypeLabel = (type: GlobalSearchResult["type"]): string => {
    const labels: Record<GlobalSearchResult["type"], string> = {
      project: t("globalSearch.types.project", "Projects"),
      customer: t("globalSearch.types.customer", "Customers"),
      map: t("globalSearch.types.map", "Mutual Action Plans"),
      user: t("globalSearch.types.user", "Users"),
      document: t("globalSearch.types.document", "Documentation"),
      page: t("globalSearch.types.page", "Pages"),
      guide: t("globalSearch.types.guide", "Guide"),
    };
    return labels[type];
  };

  if (!isInternalUser) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={buttonRef}
          onClick={() => setOpen(true)}
          className="p-2 brand-topbar-icon-btn rounded-md transition-all duration-200 bg-transparent border-0 focus:outline-none focus:ring-2"
          title={t("globalSearch.button", "Global Search (Ctrl+K)")}
          aria-label={t("globalSearch.button", "Global Search")}
          aria-expanded={open}
          aria-controls="global-search-popup"
          aria-haspopup="dialog"
        >
          <ScanSearch className="h-5 w-5 stroke-current fill-none stroke-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent 
        id="global-search-popup"
        className="w-[400px] p-0 shadow-lg"
        align="end"
        sideOffset={8}
        role="dialog"
        aria-label={t("globalSearch.dialogLabel", "Global search")}
        onKeyDown={handleKeyDown}
      >
        <Command className="rounded-lg border shadow-md" shouldFilter={false}>
          <CommandInput
            ref={inputRef}
            placeholder={t("globalSearch.placeholder", "Search projects, customers, MAPs...")}
            value={query}
            onValueChange={setQuery}
            className="h-12"
            aria-label={t("globalSearch.inputLabel", "Search")}
          />
          <CommandList className="max-h-[350px]">
            {isLoading && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">
                  {t("globalSearch.searching", "Searching...")}
                </span>
              </div>
            )}
            
            {error && (
              <div className="flex items-center justify-center py-6 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <span className="ml-2 text-sm">{error}</span>
              </div>
            )}
            
            {!isLoading && !error && query.trim() === "" && (
              <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
                {t("globalSearch.typeToSearch", "Type to search...")}
              </CommandEmpty>
            )}
            
            {!isLoading && !error && query.trim() !== "" && results.length === 0 && (
              <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
                {t("globalSearch.noResults", "No results for")} "{query}"
              </CommandEmpty>
            )}

            {!isLoading && !error && results.length > 0 && (
              <>
                {Object.entries(groupedResults).map(([type, items], groupIndex) => {
                  if (items.length === 0) return null;
                  
                  const TypeIcon = TYPE_ICONS[type as GlobalSearchResult["type"]];
                  const typeColor = TYPE_COLORS[type as GlobalSearchResult["type"]];
                  
                  return (
                    <div key={type}>
                      {groupIndex > 0 && <CommandSeparator />}
                      <CommandGroup heading={getTypeLabel(type as GlobalSearchResult["type"])}>
                        {items.map((result, itemIndex) => {
                          const globalIndex = results.indexOf(result);
                          const isSelected = globalIndex === selectedIndex;
                          
                          return (
                            <CommandItem
                              key={`${result.type}-${result.id}`}
                              value={`${result.type}-${result.id}`}
                              onSelect={() => handleSelect(result)}
                              className={cn(
                                "flex items-start gap-3 px-3 py-2 cursor-pointer",
                                isSelected && "bg-accent"
                              )}
                              aria-selected={isSelected}
                            >
                              <TypeIcon className={cn("h-4 w-4 mt-0.5 shrink-0", typeColor)} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium truncate text-foreground">
                                    {result.label}
                                  </span>
                                  {result.isRecent && (
                                    <span title={t("globalSearch.recent", "Recently accessed")}>
                                      <Clock className="h-3 w-3 text-muted-foreground" />
                                    </span>
                                  )}
                                  {result.isMyItem && (
                                    <span title={t("globalSearch.myItem", "Your item")}>
                                      <Star className="h-3 w-3 text-yellow-500" />
                                    </span>
                                  )}
                                </div>
                                {result.description && (
                                  <p className="text-xs text-muted-foreground truncate">
                                    {result.description}
                                  </p>
                                )}
                              </div>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </div>
                  );
                })}
              </>
            )}
          </CommandList>
          
          <div className="border-t px-3 py-2 text-xs text-muted-foreground flex items-center justify-between">
            <span>{t("globalSearch.hint", "Navigate with ↑↓, select with Enter")}</span>
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              {isMac ? (
                <><span className="text-xs">⌘</span>K</>
              ) : (
                <>Ctrl+K</>
              )}
            </kbd>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
