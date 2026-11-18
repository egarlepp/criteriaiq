// Task #723 — Configuration → Demo Mode admin page. Status tiles, per-
// session/per-user/app-wide toggles, seed form, typed-confirm wipe,
// in-page docs accordion, recent-audit list. The page itself is on the
// excluded path list so the user picker always shows real accounts.
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { sortRows, useUrlSortState } from "@/lib/sorting";
import { SortableTableHead } from "@/components/ui/sortable-table";
import { showErrorToast, showSuccessToast, showInfoToast, showWarningToast } from "@/lib/toast-helper";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { ExcludedScreenNotice } from "@/components/layout/ExcludedScreenNotice";
import { useDemoStatus } from "@/hooks/useDemoStatus";
import { useDemoCountLabels } from "./demo-count-labels";
import DemoModeActivityTable from "./DemoModeActivityTable";
import {
  Database, DatabaseZap, FlaskConical, Skull, Trash2, Users, AlertTriangle, Search, BookOpen,
  MonitorPlay, Clock, Globe, History, RefreshCw,
} from "lucide-react";

interface DemoUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
  isActive: boolean | null;
  demoModeForcedOn: boolean | null;
}

const PICKER_LIMIT = 50;

export default function DemoModeSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: status, refetch: refetchStatus } = useDemoStatus();

  const usersQ = useQuery<DemoUser[]>({
    queryKey: ["/api/demo/users"],
    retry: false,
  });
  // Source of truth for "has any demo data been seeded?" — used by the
  // toggle follow-up toast to decide whether to nudge the operator to
  // seed first. Cheap COUNT(*) WHERE is_demo on the headline tables.
  const countsQ = useQuery<{ counts: Record<string, number>; total: number; hasAny: boolean }>({
    queryKey: ["/api/demo/counts"],
    retry: false,
  });

  // After a mode flip / seed / wipe we have to drop ALL cached lists
  // for tagged tables — not just the demo-mode meta queries — because
  // the rows the user is allowed to see have changed wholesale. We
  // invalidate every query whose key starts with one of the impacted
  // API paths.
  const TAGGED_API_PREFIXES = [
    "/api/demo",
    "/api/customers",
    "/api/projects",
    "/api/tags",
    "/api/products",
    "/api/email-templates",
    "/api/dashboard-layouts",
    "/api/custom-reports",
    "/api/map-templates",
    "/api/assumptions",
    "/api/dependencies",
    "/api/ai-providers",
    "/api/activity-logs",
  ];
  const invalidateAll = () => {
    for (const prefix of TAGGED_API_PREFIXES) {
      qc.invalidateQueries({
        predicate: (q) => {
          const k0 = q.queryKey?.[0];
          return typeof k0 === "string" && k0.startsWith(prefix);
        },
      });
    }
    refetchStatus();
  };

  // Seed and wipe counts as a short, readable summary ("5 accounts,
  // 10 projects, …") instead of raw JSON in the toast description.
  const { formatCounts } = useDemoCountLabels();

  // Local override flipped by the seed/wipe mutation onSuccess
  // handlers below — the /api/demo/counts refetch is async and we
  // want toast detection to be correct immediately after a seed/wipe
  // without waiting a network round-trip.
  const [seededOverride, setSeededOverride] = useState<boolean | null>(null);
  const [lastSeededAt, setLastSeededAt] = useState<Date | null>(null);
  const [sessionSeedCount, setSessionSeedCount] = useState(0);

  // Keep `seededOverride` strictly transient: as soon as the next
  // /api/demo/counts payload agrees with the optimistic override (or
  // the override no longer matches a fresher server truth), drop it
  // so the counts endpoint remains the authoritative source. This
  // prevents staleness when another admin seeds/wipes in parallel.
  const lastCountsDataUpdatedAt = useRef<number>(0);
  useEffect(() => {
    if (seededOverride === null) return;
    if (!countsQ.dataUpdatedAt) return;
    if (countsQ.dataUpdatedAt === lastCountsDataUpdatedAt.current) return;
    lastCountsDataUpdatedAt.current = countsQ.dataUpdatedAt;
    setSeededOverride(null);
  }, [countsQ.dataUpdatedAt, seededOverride]);

  // "Is there any demo data right now?" — authoritative source is the
  // /api/demo/counts endpoint (COUNT(*) WHERE is_demo on the headline
  // tagged tables). The optimistic `seededOverride` short-circuits
  // immediately after a seed/wipe so the toggle follow-up toast
  // doesn't depend on the network round-trip. Returns null while the
  // counts query is loading so callers can distinguish "unknown" from
  // "no data" — the toggle toast suppresses the warning until counts
  // resolve to avoid false positives.
  const hasDemoData: boolean | null = useMemo(() => {
    if (seededOverride !== null) return seededOverride;
    if (countsQ.data) return countsQ.data.hasAny;
    return null;
  }, [countsQ.data, seededOverride]);

  // After turning demo ON, hint that data may take a few seconds AND
  // that the user may need to seed first. After turning OFF, hint that
  // production data is on the way back. When we can tell no demo data
  // exists yet, escalate to a warning toast prompting a seed.
  const showToggleFollowUp = (enable: boolean, scope: "session" | "user" | "app-wide") => {
    if (enable) {
      const subject =
        scope === "session"
          ? t("configuration.demoMode.subjectSession")
          : scope === "user"
          ? t("configuration.demoMode.subjectUser")
          : t("configuration.demoMode.subjectApplication");
      if (hasDemoData === false) {
        showWarningToast(
          t("configuration.demoMode.noDataYetTitle"),
          t("configuration.demoMode.noDataYetDescription", { subject }),
        );
      } else {
        showInfoToast(
          t("configuration.demoMode.headsUp"),
          t("configuration.demoMode.followUpEnabled", { subject }),
        );
      }
    } else {
      showInfoToast(
        t("configuration.demoMode.headsUp"),
        t("configuration.demoMode.followUpDisabled"),
      );
    }
  };

  const toggleSession = useMutation({
    mutationFn: (enable: boolean) =>
      apiRequest("POST", `/api/demo/session/${enable ? "enter" : "exit"}`),
    onSuccess: (_data, enable) => {
      showSuccessToast(
        enable ? t("configuration.demoMode.sessionEnabled") : t("configuration.demoMode.sessionDisabled"),
      );
      showToggleFollowUp(enable, "session");
      invalidateAll();
    },
    onError: (err: Error) => showErrorToast(t("configuration.demoMode.errorSession"), err.message),
  });

  const toggleAppWide = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest("POST", "/api/demo/app-wide", { enabled }),
    onSuccess: (_data, enabled) => {
      showSuccessToast(
        enabled ? t("configuration.demoMode.appWideEnabled") : t("configuration.demoMode.appWideDisabled"),
      );
      showToggleFollowUp(enabled, "app-wide");
      invalidateAll();
    },
    onError: (err: Error) => showErrorToast(t("configuration.demoMode.errorAppWide"), err.message),
  });

  const toggleUser = useMutation({
    mutationFn: ({ id, enable }: { id: string; enable: boolean }) =>
      apiRequest("POST", `/api/demo/users/${id}/${enable ? "enter" : "exit"}`),
    onSuccess: (_data, vars) => {
      showSuccessToast(
        vars.enable ? t("configuration.demoMode.userForcedOn") : t("configuration.demoMode.userCleared"),
      );
      showToggleFollowUp(vars.enable, "user");
      invalidateAll();
    },
    onError: (err: Error) => showErrorToast(t("configuration.demoMode.errorUser"), err.message),
  });

  const [seedForm, setSeedForm] = useState({
    customers: 6,
    projectsPerCustomer: 2,
    mapDepth: 3,
    includeAi: false,
  });
  const seedMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/demo/seed", seedForm),
    onSuccess: (data: { counts?: Record<string, number> }) => {
      showSuccessToast(
        t("configuration.demoMode.seededTitle"),
        t("configuration.demoMode.seededDescription", { summary: formatCounts(data?.counts) }),
      );
      setSeededOverride(true);
      setLastSeededAt(new Date());
      setSessionSeedCount((n) => n + 1);
      invalidateAll();
    },
    onError: (err: Error) => showErrorToast(t("configuration.demoMode.errorSeed"), err.message),
  });

  // Reseed: wipe and seed again with the form's settings, in one call.
  const [reseedOpen, setReseedOpen] = useState(false);
  const reseedMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/demo/reseed", { ...seedForm, confirm: "RESEED DEMO DATA" }),
    onSuccess: (data: { counts?: Record<string, number> }) => {
      showSuccessToast(
        t("configuration.demoMode.reseededTitle"),
        t("configuration.demoMode.seededDescription", { summary: formatCounts(data?.counts) }),
      );
      setSeededOverride(true);
      setLastSeededAt(new Date());
      setSessionSeedCount((n) => n + 1);
      invalidateAll();
    },
    onError: (err: Error) => showErrorToast(t("configuration.demoMode.errorReseed"), err.message),
  });

  const [wipeConfirm, setWipeConfirm] = useState("");
  const wipeMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/demo/wipe", { confirm: wipeConfirm }),
    onSuccess: (data: { counts?: Record<string, number> }) => {
      showSuccessToast(
        t("configuration.demoMode.wipedTitle"),
        t("configuration.demoMode.wipedDescription", { summary: formatCounts(data?.counts) }),
      );
      setSeededOverride(false);
      setLastSeededAt(null);
      setSessionSeedCount(0);
      setWipeConfirm("");
      invalidateAll();
    },
    onError: (err: Error) => showErrorToast(t("configuration.demoMode.errorWipe"), err.message),
  });

  // ── Per-user picker state ───────────────────────────────────────────
  const [userQuery, setUserQuery] = useState("");
  const [userSort, handleUserSort] = useUrlSortState("demoUsers");
  const filteredUsers = useMemo(() => {
    const all = usersQ.data ?? [];
    const q = userQuery.trim().toLowerCase();
    const matches = q
      ? all.filter((u) => {
          const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.toLowerCase();
          return name.includes(q)
            || (u.email ?? "").toLowerCase().includes(q)
            || (u.role ?? "").toLowerCase().includes(q);
        })
      : all.filter((u) => u.demoModeForcedOn);
    return sortRows(matches.slice(0, PICKER_LIMIT), userSort, {
      name: (u) => [u.firstName, u.lastName].filter(Boolean).join(" "),
      email: (u) => u.email ?? "",
      role: (u) => u.role ?? "",
      demoModeForcedOn: (u) => Boolean(u.demoModeForcedOn),
    });
  }, [usersQ.data, userQuery, userSort]);
  const totalMatches = useMemo(() => {
    const all = usersQ.data ?? [];
    if (!userQuery.trim()) return all.filter((u) => u.demoModeForcedOn).length;
    const q = userQuery.trim().toLowerCase();
    return all.filter((u) => {
      const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.toLowerCase();
      return name.includes(q)
        || (u.email ?? "").toLowerCase().includes(q)
        || (u.role ?? "").toLowerCase().includes(q);
    }).length;
  }, [usersQ.data, userQuery]);

  // ── App-wide confirmation dialog ────────────────────────────────────
  const [appWideConfirmOpen, setAppWideConfirmOpen] = useState(false);

  return (
    <div className="space-y-4">
    <div data-testid="demo-mode-section" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-600 dark:text-blue-400" /> {t("configuration.demoMode.pageTitle")}
          </CardTitle>
          <CardDescription>
            {t("configuration.demoMode.statusDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ExcludedScreenNotice />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <StatusTile label={t("configuration.demoMode.resolvedState")} value={status?.active ? t("configuration.demoMode.stateActive") : t("configuration.demoMode.stateOff")} highlight={status?.active} />
            <StatusTile label={t("configuration.demoMode.sources")} value={status?.source ? formatSource(status.source) : t("configuration.demoMode.stateNone")} />
            <StatusTile label={t("configuration.demoMode.yourSession")} value={status?.sessionFlag ? t("configuration.demoMode.stateOn") : t("configuration.demoMode.stateOff")} highlight={status?.sessionFlag} />
            <StatusTile label={t("configuration.demoMode.appWideState")} value={status?.appWideFlag ? t("configuration.demoMode.stateOn") : t("configuration.demoMode.stateOff")} highlight={status?.appWideFlag} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" /> {t("configuration.demoMode.sessionTitle")}
            </CardTitle>
            <CardDescription>
              {t("configuration.demoMode.sessionDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <Switch
              data-testid="demo-session-toggle"
              checked={Boolean(status?.sessionFlag)}
              onCheckedChange={(v) => toggleSession.mutate(v)}
              disabled={toggleSession.isPending}
            />
            <Label>{t("configuration.demoMode.sessionToggleLabel")}</Label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-blue-600 dark:text-blue-400" /> {t("configuration.demoMode.appWideTitle")}
            </CardTitle>
            <CardDescription>
              {t("configuration.demoMode.appWideDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <Switch
              data-testid="demo-appwide-toggle"
              checked={Boolean(status?.appWideFlag)}
              onCheckedChange={(v) => {
                // Turning ON requires confirmation; turning OFF is one click.
                if (v) {
                  setAppWideConfirmOpen(true);
                } else {
                  toggleAppWide.mutate(false);
                }
              }}
              disabled={toggleAppWide.isPending}
            />
            <Label>{t("configuration.demoMode.appWideToggleLabel")}</Label>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={appWideConfirmOpen} onOpenChange={setAppWideConfirmOpen}>
        <AlertDialogContent data-testid="demo-appwide-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("configuration.demoMode.appWideConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("configuration.demoMode.appWideConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="demo-appwide-confirm"
              onClick={() => { toggleAppWide.mutate(true); setAppWideConfirmOpen(false); }}
            >
              {t("configuration.demoMode.appWideConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" /> {t("configuration.demoMode.perUserTitle")}
          </CardTitle>
          <CardDescription>
            {t("configuration.demoMode.perUserDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              data-testid="demo-user-search"
              placeholder={t("configuration.demoMode.perUserSearch")}
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="text-xs text-muted-foreground">
            {t("configuration.demoMode.perUserShowing", { shown: filteredUsers.length, total: totalMatches, count: totalMatches })}
            {totalMatches > PICKER_LIMIT && ` ${t("configuration.demoMode.perUserRefineSearch")}`}
          </div>
          <div className="border rounded-md max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <SortableTableHead sortKey="name" sortConfig={userSort} onSort={handleUserSort} className="h-auto px-3 py-2">
                    {t("common.name")}
                  </SortableTableHead>
                  <SortableTableHead sortKey="email" sortConfig={userSort} onSort={handleUserSort} className="h-auto px-3 py-2">
                    {t("common.email")}
                  </SortableTableHead>
                  <SortableTableHead sortKey="role" sortConfig={userSort} onSort={handleUserSort} className="h-auto px-3 py-2">
                    {t("common.role")}
                  </SortableTableHead>
                  <SortableTableHead sortKey="demoModeForcedOn" sortConfig={userSort} onSort={handleUserSort} align="right" className="h-auto px-3 py-2">
                    {t("configuration.demoMode.colDemoForcedOn")}
                  </SortableTableHead>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || "—";
                  return (
                    <tr key={u.id} className="border-t">
                      <td className="px-3 py-2">{name}</td>
                      <td className="px-3 py-2 font-mono text-xs">{u.email ?? "—"}</td>
                      <td className="px-3 py-2"><Badge variant="outline">{u.role ?? "—"}</Badge></td>
                      <td className="px-3 py-2 text-right">
                        <Switch
                          data-testid={`demo-user-toggle-${u.id}`}
                          checked={Boolean(u.demoModeForcedOn)}
                          onCheckedChange={(v) => toggleUser.mutate({ id: u.id, enable: v })}
                        />
                      </td>
                    </tr>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                      {userQuery.trim()
                        ? t("configuration.demoMode.perUserEmptySearch")
                        : t("configuration.demoMode.perUserEmptyDefault")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="demo-counts-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-blue-600 dark:text-blue-400" /> {t("configuration.demoMode.seedTitle")}
          </CardTitle>
          <CardDescription>{t("configuration.demoMode.seedDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <NumField label={t("configuration.demoMode.seedAccounts")} value={seedForm.customers} onChange={(v) => setSeedForm((f) => ({ ...f, customers: v }))} />
            <NumField label={t("configuration.demoMode.seedProjectsPerAccount")} value={seedForm.projectsPerCustomer} onChange={(v) => setSeedForm((f) => ({ ...f, projectsPerCustomer: v }))} />
            <NumField label={t("configuration.demoMode.seedMapDepth")} value={seedForm.mapDepth} onChange={(v) => setSeedForm((f) => ({ ...f, mapDepth: v }))} />
            <div className="flex items-end gap-2">
              <Switch
                checked={seedForm.includeAi}
                onCheckedChange={(v) => setSeedForm((f) => ({ ...f, includeAi: v }))}
              />
              <Label>{t("configuration.demoMode.seedIncludeAi")}</Label>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              data-testid="demo-seed-button"
              onClick={() => seedMut.mutate()}
              disabled={seedMut.isPending || reseedMut.isPending || hasDemoData === true}
            >
              <DatabaseZap className="h-4 w-4" />
              {seedMut.isPending ? t("configuration.demoMode.seeding") : t("configuration.demoMode.seedButton")}
            </Button>
            <Button
              data-testid="demo-reseed-button"
              variant="outline"
              onClick={() => setReseedOpen(true)}
              disabled={hasDemoData !== true || seedMut.isPending || reseedMut.isPending}
            >
              <RefreshCw className={`h-4 w-4 ${reseedMut.isPending ? "animate-spin" : ""}`} />
              {reseedMut.isPending ? t("configuration.demoMode.reseeding") : t("configuration.demoMode.reseedButton")}
            </Button>
          </div>
          {hasDemoData === true && (
            <p className="text-xs text-muted-foreground">{t("configuration.demoMode.seedExistsHint")}</p>
          )}
          <ConfirmationDialog
            open={reseedOpen}
            onOpenChange={setReseedOpen}
            title={t("configuration.demoMode.reseedConfirmTitle")}
            description={t("configuration.demoMode.reseedConfirmDescription", {
              accounts: seedForm.customers,
              projects: seedForm.customers * seedForm.projectsPerCustomer,
            })}
            confirmLabel={t("configuration.demoMode.reseedButton")}
            variant="warning"
            onConfirm={() => {
              setReseedOpen(false);
              reseedMut.mutate();
            }}
          />
        </CardContent>

        <Separator />

        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Database className="h-4 w-4 text-blue-600 dark:text-blue-400" /> {t("configuration.demoMode.countsTitle")}
          </CardTitle>
          <CardDescription>
            Live row counts of <code>is_demo = true</code> across the headline tagged tables.
            Zero across the board means demo mode will render empty dashboards — seed first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatusTile
              label={t("configuration.demoMode.demoAccounts")}
              value={countsQ.isLoading ? "…" : String(countsQ.data?.counts.customers ?? 0)}
              highlight={(countsQ.data?.counts.customers ?? 0) > 0}
            />
            <StatusTile
              label={t("configuration.demoMode.demoProjects")}
              value={countsQ.isLoading ? "…" : String(countsQ.data?.counts.projects ?? 0)}
              highlight={(countsQ.data?.counts.projects ?? 0) > 0}
            />
            <StatusTile
              label={t("configuration.demoMode.demoMapTemplates")}
              value={countsQ.isLoading ? "…" : String(countsQ.data?.counts.mapTemplates ?? 0)}
              highlight={(countsQ.data?.counts.mapTemplates ?? 0) > 0}
            />
            <StatusTile
              label={t("configuration.demoMode.demoTags")}
              value={countsQ.isLoading ? "…" : String(countsQ.data?.counts.tags ?? 0)}
              highlight={(countsQ.data?.counts.tags ?? 0) > 0}
            />
          </div>
          {countsQ.data && !countsQ.data.hasAny && (
            <div className="mt-3 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              {t("configuration.demoMode.noDataSeeded")}
            </div>
          )}
          {(lastSeededAt !== null || sessionSeedCount > 0) && (
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground border-t pt-3">
              {lastSeededAt && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {t("configuration.demoMode.lastSeededAt", {
                    time: lastSeededAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                  })}
                </span>
              )}
              {sessionSeedCount > 0 && (
                <span className="flex items-center gap-1">
                  <DatabaseZap className="h-3.5 w-3.5" />
                  {t("configuration.demoMode.sessionSeedCount", { count: sessionSeedCount })}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" /> {t("configuration.demoMode.wipeTitle")}
          </CardTitle>
          <CardDescription>
            Permanently deletes every row flagged <code>is_demo = true</code> across all tagged
            tables, inside a single transaction with a non-demo-row safety assertion before
            commit. Production rows are never touched. Type <strong>{t("configuration.demoMode.wipePhrase")}</strong> to
            confirm.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 items-center text-sm text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" /> {t("configuration.demoMode.wipeCannotUndo")}
          </div>
          <Input
            data-testid="demo-wipe-confirm"
            placeholder={t("configuration.demoMode.wipeConfirmPlaceholder")}
            value={wipeConfirm}
            onChange={(e) => setWipeConfirm(e.target.value)}
          />
          <Button
            data-testid="demo-wipe-button"
            variant="destructive"
            disabled={wipeConfirm !== "WIPE DEMO DATA" || wipeMut.isPending}
            onClick={() => wipeMut.mutate()}
          >
            {!wipeMut.isPending && <Skull className="h-4 w-4" />}
            {wipeMut.isPending ? t("configuration.demoMode.wiping") : t("configuration.demoMode.wipeButton")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" /> {t("configuration.demoMode.docsTitle")}
          </CardTitle>
          <CardDescription>
            Quick reference. The full operator doc lives at{" "}
            <code>docs/admin/demo-mode.md</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full" data-testid="demo-docs-accordion">
            <AccordionItem value="sources">
              <AccordionTrigger>{t("configuration.demoMode.docsTurnOnTitle")}</AccordionTrigger>
              <AccordionContent className="text-sm space-y-2">
                <p>{t("configuration.demoMode.docsTurnOnIntro")}</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Per-session</strong> — only your current browser, cleared on logout.</li>
                  <li><strong>Per-user</strong> — flips a specific account into demo permanently. Useful for SE accounts.</li>
                  <li><strong>App-wide</strong> — every user including non-admins. Requires confirmation.</li>
                </ul>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="isolation">
              <AccordionTrigger>{t("configuration.demoMode.docsIsolationTitle")}</AccordionTrigger>
              <AccordionContent className="text-sm space-y-2">
                <p>
                  Every tagged table has an <code>is_demo</code> column. Storage queries call
                  <code> applyDemoFilter(table)</code> which adds
                  <code> WHERE is_demo = &lt;current request mode&gt;</code> — so demo
                  sessions only see demo rows and production sessions never see demo rows.
                </p>
                <p>
                  The seeder only ever inserts <code>is_demo=true</code> rows. The wipe only
                  ever deletes <code>is_demo=true</code> rows, inside a single transaction.
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="excluded">
              <AccordionTrigger>{t("configuration.demoMode.docsExcludedTitle")}</AccordionTrigger>
              <AccordionContent className="text-sm space-y-2">
                <p>
                  Administrative surfaces — system settings, users management, roles/permissions,
                  audit, archive, the about/getting-started pages, DB connections, and the Demo
                  Mode page itself — operate against production no matter what.
                </p>
                <p>
                  Those screens still show the yellow banner so you remember you're in demo,
                  plus an inline "Production data" badge.
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="audit">
              <AccordionTrigger>{t("configuration.demoMode.docsAuditTitle")}</AccordionTrigger>
              <AccordionContent className="text-sm">
                {t("configuration.demoMode.docsAuditBody")}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-blue-600 dark:text-blue-400" /> {t("configuration.demoMode.activityTitle")}
          </CardTitle>
          <CardDescription>{t("configuration.demoMode.activityDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <DemoModeActivityTable />
        </CardContent>
      </Card>
    </div>
  </div>  
  );
}

/** Format raw API source strings into readable labels.
 *  e.g. "app_wide" → "App Wide", "session+user" → "Session + User"
 */
function formatSource(src: string): string {
  return src
    .split("+")
    .map((part) =>
      part
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
    )
    .join(" + ");
}

function StatusTile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${highlight ? "border-amber-400 dark:border-amber-600 bg-amber-100 dark:bg-amber-900/30" : ""}`}>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="text-sm font-mono mt-1">{value}</div>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
