// Demo logins card on the Demo Mode page (real Admins only). Lists the two
// shared accounts, Demo Admin and Demo Engineer, that an Admin hands to
// outside visitors: the address, the password (hidden until shown, with
// copy buttons), the last sign-in and whether sign-in is on. Create makes
// an account ready for its first sign-in; Regenerate gives it a new
// password and ends every open session; Disable turns sign-in off.
// Server: /api/demo/logins (server/lib/demo-logins.ts).
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2, CircleSlash, Copy, Eye, EyeOff, KeyRound, Plus, Power, PowerOff, RefreshCw, ShieldAlert, UserRoundCheck,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { sortRows, useUrlSortState } from "@/lib/sorting";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SortableTableHead } from "@/components/ui/sortable-table";
import { ResponsiveTableActionsMenu, type TableAction } from "@/components/ui/table-actions-menu";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { DemoLoginKind } from "@shared/demo-login";

export interface DemoLoginView {
  kind: DemoLoginKind;
  role: string;
  userId: string | null;
  email: string;
  name: string;
  exists: boolean;
  isActive: boolean;
  /** Readable password (server/lib/demo-logins.ts). */
  signInPassword: string | null;
  lastLogin: string | null;
  loginCount: number;
  mfaEnabled: boolean;
}

type PendingAction = { kind: DemoLoginKind; action: "regenerate" | "disable" } | null;

function CopyButton({ value, label }: { value: string; label: string }) {
  const { t } = useTranslation();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      showSuccessToast(t("configuration.demoMode.loginsCopied"));
    } catch {
      showErrorToast(t("configuration.demoMode.loginsCopyFailed"));
    }
  };
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={copy} aria-label={label}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function DemoLoginsCard() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [sort, handleSort] = useUrlSortState("demoLogins");
  const [shown, setShown] = useState<Partial<Record<DemoLoginKind, boolean>>>({});
  const [pending, setPending] = useState<PendingAction>(null);

  const loginsQ = useQuery<DemoLoginView[]>({ queryKey: ["/api/demo/logins"], retry: false, staleTime: 0 });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["/api/demo/logins"] });
    qc.invalidateQueries({ queryKey: ["/api/demo/audit"] });
    qc.invalidateQueries({ queryKey: ["/api/demo/users"] });
  };

  const act = useMutation({
    mutationFn: ({ kind, action }: { kind: DemoLoginKind; action: "create" | "regenerate" | "enable" | "disable" }) =>
      apiRequest("POST", action === "create" ? `/api/demo/logins/${kind}` : `/api/demo/logins/${kind}/${action}`),
    onSuccess: (_data, { action }) => {
      showSuccessToast(t(`configuration.demoMode.logins${action[0].toUpperCase()}${action.slice(1)}Done`));
      refresh();
    },
    onError: (err: Error) => showErrorToast(t("configuration.demoMode.loginsError"), err.message),
  });

  const roleLabel = (kind: DemoLoginKind) => t(`configuration.demoMode.loginsKind.${kind}`);
  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" });

  const rows = sortRows(loginsQ.data ?? [], sort, {
    account: (r) => roleLabel(r.kind),
    lastLogin: (r) => r.lastLogin ?? "",
  });

  const signInDetails = (row: DemoLoginView) =>
    t("configuration.demoMode.loginsDetailsText", {
      url: window.location.origin,
      email: row.email,
      password: row.signInPassword ?? "",
    });

  const actionsFor = (row: DemoLoginView): TableAction[] => [
    {
      id: "create",
      label: t("configuration.demoMode.loginsCreate"),
      icon: Plus,
      variant: "success",
      hidden: row.exists,
      disabled: act.isPending,
      onClick: () => act.mutate({ kind: row.kind, action: "create" }),
    },
    {
      id: "copy-details",
      label: t("configuration.demoMode.loginsCopyDetails"),
      icon: Copy,
      hidden: !row.exists || !row.signInPassword,
      onClick: () => {
        navigator.clipboard.writeText(signInDetails(row)).then(
          () => showSuccessToast(t("configuration.demoMode.loginsCopied")),
          () => showErrorToast(t("configuration.demoMode.loginsCopyFailed")),
        );
      },
    },
    {
      id: "regenerate",
      label: t("configuration.demoMode.loginsRegenerate"),
      icon: RefreshCw,
      variant: "warning",
      hidden: !row.exists,
      disabled: act.isPending,
      onClick: () => setPending({ kind: row.kind, action: "regenerate" }),
    },
    {
      id: "disable",
      label: t("configuration.demoMode.loginsDisable"),
      icon: PowerOff,
      variant: "destructive",
      hidden: !row.exists || !row.isActive,
      disabled: act.isPending,
      onClick: () => setPending({ kind: row.kind, action: "disable" }),
    },
    {
      id: "enable",
      label: t("configuration.demoMode.loginsEnable"),
      icon: Power,
      variant: "success",
      hidden: !row.exists || row.isActive,
      disabled: act.isPending,
      onClick: () => act.mutate({ kind: row.kind, action: "enable" }),
    },
  ];

  const pendingRow = pending ? loginsQ.data?.find((r) => r.kind === pending.kind) : undefined;

  return (
    <Card data-testid="demo-logins-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-blue-600 dark:text-blue-400" /> {t("configuration.demoMode.loginsTitle")}
        </CardTitle>
        <CardDescription>{t("configuration.demoMode.loginsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t("configuration.demoMode.loginsWarning")}</span>
        </div>
        <div className="border rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <SortableTableHead sortKey="account" sortConfig={sort} onSort={handleSort} className="h-auto px-3 py-2 whitespace-nowrap">
                  {t("configuration.demoMode.loginsColAccount")}
                </SortableTableHead>
                <SortableTableHead sortable={false} className="h-auto px-3 py-2 whitespace-nowrap">
                  {t("configuration.demoMode.loginsColPassword")}
                </SortableTableHead>
                <SortableTableHead sortKey="lastLogin" sortConfig={sort} onSort={handleSort} className="h-auto px-3 py-2 whitespace-nowrap">
                  {t("configuration.demoMode.loginsColLastLogin")}
                </SortableTableHead>
                <SortableTableHead sortable={false} className="h-auto px-3 py-2 text-right">
                  <span className="sr-only">{t("common.actions")}</span>
                </SortableTableHead>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const visible = !!shown[row.kind];
                return (
                  <tr key={row.kind} className="border-t align-middle" data-testid={`demo-login-row-${row.kind}`}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <UserRoundCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="font-medium text-foreground whitespace-nowrap">{roleLabel(row.kind)}</span>
                        <Badge variant="outline">{row.role}</Badge>
                        {!row.exists ? (
                          <Badge variant="outline" className="gap-1 text-muted-foreground">
                            <Plus className="h-3.5 w-3.5" /> {t("configuration.demoMode.loginsStatusNotCreated")}
                          </Badge>
                        ) : row.isActive ? (
                          <Badge variant="outline" className="gap-1 border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 className="h-3.5 w-3.5" /> {t("configuration.demoMode.loginsStatusActive")}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 border-red-300 text-red-700 dark:border-red-700 dark:text-red-300">
                            <CircleSlash className="h-3.5 w-3.5" /> {t("configuration.demoMode.loginsStatusDisabled")}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 pl-6">
                        <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">{row.email}</span>
                        {row.exists && <CopyButton value={row.email} label={t("configuration.demoMode.loginsCopyEmail")} />}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {!row.exists ? (
                        <span className="text-muted-foreground">—</span>
                      ) : row.signInPassword ? (
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-sm tracking-wider" data-testid={`demo-login-password-${row.kind}`}>
                            {visible ? row.signInPassword : "••••••••••"}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setShown((s) => ({ ...s, [row.kind]: !visible }))}
                            aria-label={visible ? t("configuration.demoMode.loginsHidePassword") : t("configuration.demoMode.loginsShowPassword")}
                            title={visible ? t("configuration.demoMode.loginsHidePassword") : t("configuration.demoMode.loginsShowPassword")}
                          >
                            {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                          <CopyButton value={row.signInPassword} label={t("configuration.demoMode.loginsCopyPassword")} />
                        </div>
                      ) : (
                        <span className="text-xs text-amber-700 dark:text-amber-300">{t("configuration.demoMode.loginsPasswordUnreadable")}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.lastLogin ? dateFormat.format(new Date(row.lastLogin)) : t("configuration.demoMode.loginsNever")}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <ResponsiveTableActionsMenu actions={actionsFor(row)} maxVisibleActions={4} />
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                    {loginsQ.isLoading ? t("common.loading") : t("configuration.demoMode.loginsLoadFailed")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">{t("configuration.demoMode.loginsFootnote")}</p>
      </CardContent>

      <ConfirmationDialog
        open={pending !== null}
        onOpenChange={(open) => { if (!open) setPending(null); }}
        title={pending?.action === "disable"
          ? t("configuration.demoMode.loginsDisableTitle", { account: pendingRow ? roleLabel(pendingRow.kind) : "" })
          : t("configuration.demoMode.loginsRegenerateTitle", { account: pendingRow ? roleLabel(pendingRow.kind) : "" })}
        description={pending?.action === "disable"
          ? t("configuration.demoMode.loginsDisableDescription")
          : t("configuration.demoMode.loginsRegenerateDescription")}
        confirmLabel={pending?.action === "disable" ? t("configuration.demoMode.loginsDisable") : t("configuration.demoMode.loginsRegenerate")}
        variant={pending?.action === "disable" ? "destructive" : "warning"}
        onConfirm={() => {
          if (pending) act.mutate(pending);
          setPending(null);
        }}
      />
    </Card>
  );
}
