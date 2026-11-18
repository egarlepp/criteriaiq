// Admin › Monitoring & Audit › Page Usage (Admin only). How often each page
// was opened, and by how many people, so pages nobody uses can be found and
// removed. Totals only, never who opened what. See docs/features/page-usage.md.
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { BarChart3, CalendarClock, EyeOff, FileQuestion, Info, Loader2, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table";
import { sortRows, useUrlSortState } from "@/lib/sorting";
import { pageCatalog, type PageCatalogEntry } from "@/lib/page-view-key";
import { PAGE_USAGE_WINDOWS, type PageUsageReport, type PageUsageWindow } from "@shared/page-views";

interface UsageLine {
  entry: PageCatalogEntry;
  /** Recorded under a key the menu no longer has. */
  removed: boolean;
  views: number;
  users: number;
  lastViewedAt: string | null;
}

export function PageUsageTab() {
  const { t, i18n } = useTranslation();
  const [days, setDays] = useState<PageUsageWindow>(90);
  const [onlyUnused, setOnlyUnused] = useState(false);
  const [sortConfig, handleSort] = useUrlSortState("pageUsage");
  const { data, isLoading, isError, isFetching, refetch } = useQuery<PageUsageReport>({
    queryKey: [`/api/admin/page-usage?days=${days}`],
  });

  const catalog = useMemo(() => pageCatalog(), []);
  const lines = useMemo<UsageLine[]>(() => {
    const byKey = new Map((data?.rows ?? []).map((r) => [r.pageKey, r]));
    const known = new Set(catalog.map((e) => e.key));
    const result: UsageLine[] = catalog.map((entry) => {
      const row = byKey.get(entry.key);
      return { entry, removed: false, views: row?.views ?? 0, users: row?.users ?? 0, lastViewedAt: row?.lastViewedAt ?? null };
    });
    for (const row of data?.rows ?? []) {
      if (known.has(row.pageKey)) continue;
      result.push({
        entry: { key: row.pageKey, trailKeys: [], adminOnly: false },
        removed: true,
        views: row.views,
        users: row.users,
        lastViewedAt: row.lastViewedAt,
      });
    }
    return result;
  }, [catalog, data]);

  const labelOf = (entry: PageCatalogEntry) =>
    entry.trailKeys.length ? t(entry.trailKeys[entry.trailKeys.length - 1]) : entry.path ?? entry.key;
  const trailOf = (line: UsageLine) => {
    if (line.removed) return t("systemHealth.pageUsage.notInMenu");
    if (!line.entry.trailKeys.length) return t("systemHealth.pageUsage.outsideMenu");
    return line.entry.trailKeys.slice(0, -1).map((k) => t(k)).join(" › ");
  };

  // Default order (no column chosen): least-viewed first, so unused pages
  // surface at the top. A column click re-sorts; ties keep this order.
  const sorted = useMemo(
    () =>
      sortRows(
        lines
          .filter((l) => !onlyUnused || l.views === 0)
          .sort((a, b) => a.views - b.views || a.users - b.users || labelOf(a.entry).localeCompare(labelOf(b.entry))),
        sortConfig,
        {
          page: (l) => labelOf(l.entry),
          views: (l) => l.views,
          users: (l) => l.users,
          lastViewedAt: (l) => (l.lastViewedAt ? new Date(l.lastViewedAt) : null),
        },
      ),
    // labelOf reads t(), which changes with the language.
    [lines, onlyUnused, sortConfig, t],
  );

  const unusedCount = lines.filter((l) => !l.removed && l.views === 0).length;
  const pageCount = lines.filter((l) => !l.removed).length;
  const fmt = (n: number) => n.toLocaleString(i18n.language);
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(i18n.language);

  return (
    <div className="space-y-4">
      <div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-100">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-1.5">
          <p>{t("systemHealth.pageUsage.intro")}</p>
          <p>{t("systemHealth.pageUsage.introCaution")}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <CalendarClock className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">{t("systemHealth.pageUsage.trackingSinceLabel")}</p>
              <p className="font-semibold">
                {data?.trackingSince ? fmtDate(`${data.trackingSince}T00:00:00Z`) : t("systemHealth.pageUsage.notStarted")}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Users className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">{t("systemHealth.pageUsage.activeUsers", { days })}</p>
              <p className="font-semibold">{data ? fmt(data.activeUsers) : "–"}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <EyeOff className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">{t("systemHealth.pageUsage.unusedPages", { days })}</p>
              <p className="font-semibold">{data ? t("systemHealth.pageUsage.unusedOf", { unused: fmt(unusedCount), total: fmt(pageCount) }) : "–"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4" />
              {t("systemHealth.pageUsage.tableTitle")}
            </CardTitle>
            <CardDescription>{t("systemHealth.pageUsage.tableBody")}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch id="page-usage-only-unused" checked={onlyUnused} onCheckedChange={setOnlyUnused} />
              <Label htmlFor="page-usage-only-unused" className="text-sm">
                {t("systemHealth.pageUsage.onlyUnused")}
              </Label>
            </div>
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v) as PageUsageWindow)}>
              <SelectTrigger className="w-40" aria-label={t("systemHealth.pageUsage.windowLabel")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_USAGE_WINDOWS.map((w) => (
                  <SelectItem key={w} value={String(w)}>
                    {t("systemHealth.pageUsage.windowOption", { days: w })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
              {t("systemHealth.pageUsage.refresh")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isError && <p className="text-sm text-red-600 dark:text-red-400">{t("systemHealth.pageUsage.loadFailed")}</p>}
          {isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("systemHealth.pageUsage.loading")}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="page" sortConfig={sortConfig} onSort={handleSort}>
                    {t("systemHealth.pageUsage.colPage")}
                  </SortableTableHead>
                  <SortableTableHead sortKey="views" sortConfig={sortConfig} onSort={handleSort} align="right">
                    {t("systemHealth.pageUsage.colViews")}
                  </SortableTableHead>
                  <SortableTableHead sortKey="users" sortConfig={sortConfig} onSort={handleSort} align="right">
                    {t("systemHealth.pageUsage.colPeople")}
                  </SortableTableHead>
                  <SortableTableHead sortKey="lastViewedAt" sortConfig={sortConfig} onSort={handleSort} align="right">
                    {t("systemHealth.pageUsage.colLastViewed")}
                  </SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((line) => {
                  const Icon = line.entry.icon ?? FileQuestion;
                  return (
                    <TableRow key={line.entry.key} data-testid={`page-usage-row-${line.entry.key}`}>
                      <TableCell>
                        <div className="flex items-start gap-2">
                          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div>
                            <div className="flex flex-wrap items-center gap-2 font-medium">
                              {line.entry.href ? (
                                <Link href={line.entry.href} className="text-primary hover:underline">
                                  {labelOf(line.entry)}
                                </Link>
                              ) : (
                                labelOf(line.entry)
                              )}
                              {line.entry.adminOnly && (
                                <Badge variant="outline" className="gap-1 text-xs font-normal">
                                  <ShieldCheck className="h-3 w-3" />
                                  {t("systemHealth.pageUsage.adminOnly")}
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">{trailOf(line)}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${line.views === 0 ? "text-amber-700 dark:text-amber-400" : ""}`}>
                        {fmt(line.views)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(line.users)}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {line.lastViewedAt ? fmtDate(line.lastViewedAt) : t("systemHealth.pageUsage.never")}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
