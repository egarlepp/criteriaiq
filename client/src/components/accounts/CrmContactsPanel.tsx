// A linked account's CRM contacts on the account dialog (Account Access):
// tick contacts to import them as Account Users, untick to stop syncing,
// Invite to give an imported user login access, and, for Admins, accept an
// email the CRM changed. Imported users can't sign in until invited.
// Rules and state come from GET /api/customers/:id/crm-contacts
// (server/crm/account-contacts.ts); every action takes effect at once,
// separately from the dialog's Save.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2, Mail, UserPlus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import type { CrmProviderId } from "@shared/crm-provider";

type Provider = Exclude<CrmProviderId, "none">;
type ContactState = "imported" | "linkable" | "available" | "adminOnly" | "blocked";
type BlockReason = "noEmail" | "personalDomain" | "internalDomain" | "otherAccount" | "linkedElsewhere";

interface ContactRow {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  title: string | null;
  state: ContactState;
  reason?: BlockReason;
  userId?: string;
  user?: { isActive: boolean; crmEmail: string | null };
}

interface ContactList {
  status: "ok";
  crmProvider: string;
  contacts: ContactRow[];
  missing: Array<{ userId: string; name: string; email: string | null }>;
}

interface Props {
  customerId: number;
  provider: Provider;
}

const STATE_CLASSES: Record<ContactState, string> = {
  imported: "border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300",
  linkable: "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  available: "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
  adminOnly: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  blocked: "border-slate-300 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400",
};

function errorCodeOf(error: unknown): string | undefined {
  // apiRequest puts the parsed error body on `details`.
  const details = (error as { details?: { errorCode?: unknown } | null } | null)?.details;
  return typeof details?.errorCode === "string" ? details.errorCode : undefined;
}

export function crmContactsKey(customerId: number) {
  return ["/api/customers", customerId, "crm-contacts"] as const;
}

export function CrmContactsPanel({ customerId, provider }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { canEdit } = usePermissions();
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";
  const canImport = canEdit("project.team-users");
  const canInvite = canEdit("config.user-management");
  const crm = provider === "hubspot" ? "HubSpot" : "Salesforce";
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery<ContactList>({
    queryKey: crmContactsKey(customerId),
    queryFn: () => apiRequest("GET", `/api/customers/${customerId}/crm-contacts`),
    staleTime: 60_000,
    retry: false,
  });

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: crmContactsKey(customerId) });
    void queryClient.invalidateQueries({ queryKey: ["/api/users"] });
  };

  const importMutation = useMutation({
    mutationFn: (contactIds: string[]) =>
      apiRequest("POST", `/api/customers/${customerId}/crm-contacts/import`, { contactIds }) as Promise<{
        results: Array<{ outcome: "imported" | "linked" | "skipped" }>;
      }>,
    onSuccess: (result) => {
      setSelected(new Set());
      refreshAll();
      const skipped = result.results.filter((r) => r.outcome === "skipped").length;
      if (skipped > 0) {
        showErrorToast("accounts.createCustomer.crm.contacts.toasts.partialTitle", "accounts.createCustomer.crm.contacts.toasts.partial");
      } else {
        showSuccessToast("accounts.createCustomer.crm.contacts.toasts.imported");
      }
    },
    onError: () => showErrorToast("accounts.createCustomer.crm.contacts.toasts.failedTitle", "accounts.createCustomer.crm.contacts.toasts.importFailed"),
  });

  const userAction = useMutation({
    mutationFn: ({ userId, action }: { userId: string; action: "stop-sync" | "invite" | "accept-email" }) =>
      apiRequest("POST", `/api/customers/${customerId}/crm-contacts/${encodeURIComponent(userId)}/${action}`),
    onSuccess: (_data, { action }) => {
      refreshAll();
      showSuccessToast(`accounts.createCustomer.crm.contacts.toasts.${action === "stop-sync" ? "stopped" : action === "invite" ? "invited" : "emailAccepted"}`);
    },
    onError: (err) => {
      const code = errorCodeOf(err);
      showErrorToast(
        "accounts.createCustomer.crm.contacts.toasts.failedTitle",
        code === "email_taken" ? "accounts.createCustomer.crm.contacts.toasts.emailTaken" : "accounts.createCustomer.crm.contacts.toasts.actionFailed",
      );
    },
  });

  const busy = importMutation.isPending || userAction.isPending;

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground dark:text-slate-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {t("accounts.createCustomer.crm.contacts.loading", { crm })}
      </p>
    );
  }

  if (error || !data) {
    const code = errorCodeOf(error);
    const key =
      code === "scope_missing"
        ? "accounts.createCustomer.crm.contacts.errors.scopeMissing"
        : code === "not_connected"
          ? "accounts.createCustomer.crm.contacts.errors.notConnected"
          : "accounts.createCustomer.crm.contacts.errors.failed";
    return (
      <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {t(key, { crm })}
      </p>
    );
  }

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const selectable = (row: ContactRow) => canImport && (row.state === "available" || row.state === "linkable" || (row.state === "adminOnly" && isAdmin));

  return (
    <div className="space-y-2 rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium text-slate-900 dark:text-slate-100">
          <Users className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          {t("accounts.createCustomer.crm.contacts.title", { crm })}
        </p>
        {canImport ? (
          <Button
            type="button"
            size="sm"
            disabled={selected.size === 0 || busy}
            onClick={() => importMutation.mutate(Array.from(selected))}
          >
            {importMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <UserPlus className="mr-1.5 h-3.5 w-3.5" />}
            {t("accounts.createCustomer.crm.contacts.import", { count: selected.size })}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground dark:text-slate-400">{t("accounts.createCustomer.crm.contacts.hint", { crm })}</p>

      {data.contacts.length === 0 ? (
        <p className="py-2 text-xs text-muted-foreground dark:text-slate-400">{t("accounts.createCustomer.crm.contacts.none", { crm })}</p>
      ) : (
        <ul className="max-h-72 divide-y overflow-y-auto dark:divide-slate-800">
          {data.contacts.map((row) => {
            const name = [row.firstName, row.lastName].filter(Boolean).join(" ") || row.email || row.id;
            const imported = row.state === "imported";
            return (
              <li key={row.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                <Checkbox
                  checked={imported || selected.has(row.id)}
                  disabled={busy || (imported ? !canImport || !row.userId : !selectable(row))}
                  onCheckedChange={(checked) => {
                    if (imported && row.userId) {
                      if (!checked) userAction.mutate({ userId: row.userId, action: "stop-sync" });
                      return;
                    }
                    toggle(row.id, checked === true);
                  }}
                  aria-label={t(imported ? "accounts.createCustomer.crm.contacts.untick" : "accounts.createCustomer.crm.contacts.tick", { name })}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-slate-900 dark:text-slate-100">{name}</span>
                    <Badge variant="outline" className={cn("px-1.5 py-0 text-[10px] font-medium", STATE_CLASSES[row.state])}>
                      {row.state === "blocked" && row.reason
                        ? t(`accounts.createCustomer.crm.contacts.reason.${row.reason}`)
                        : t(`accounts.createCustomer.crm.contacts.state.${row.state}`)}
                    </Badge>
                    {imported && row.user && !row.user.isActive ? (
                      <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-medium dark:border-slate-700 dark:text-slate-400">
                        {t("accounts.createCustomer.crm.contacts.notInvited")}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground dark:text-slate-400">
                    {[row.email, row.title].filter(Boolean).join(" · ")}
                  </p>
                  {imported && row.user?.crmEmail ? (
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="h-3 w-3" />
                      {t("accounts.createCustomer.crm.contacts.emailDiffers", { crm, email: row.user.crmEmail })}
                      {isAdmin && row.userId ? (
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-xs text-amber-800 dark:text-amber-200"
                          disabled={busy}
                          onClick={() => userAction.mutate({ userId: row.userId!, action: "accept-email" })}
                        >
                          {t("accounts.createCustomer.crm.contacts.acceptEmail")}
                        </Button>
                      ) : null}
                    </p>
                  ) : null}
                </div>
                {imported && row.user && !row.user.isActive && canInvite && row.userId ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    className="h-7 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    onClick={() => userAction.mutate({ userId: row.userId!, action: "invite" })}
                  >
                    <Mail className="mr-1.5 h-3.5 w-3.5" />
                    {t("accounts.createCustomer.crm.contacts.invite")}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {data.missing.length > 0 ? (
        <div className="space-y-1 rounded-md border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/40">
          <p className="flex items-center gap-1.5 text-xs font-medium text-red-800 dark:text-red-200">
            <AlertTriangle className="h-3.5 w-3.5" />
            {t("accounts.createCustomer.crm.contacts.missingTitle", { crm })}
          </p>
          <ul className="space-y-1">
            {data.missing.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center gap-2 text-xs text-red-800 dark:text-red-200">
                <span className="font-medium">{m.name}</span>
                {m.email ? <span className="text-red-700/80 dark:text-red-300/80">{m.email}</span> : null}
                {canImport ? (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs text-red-800 dark:text-red-200"
                    disabled={busy}
                    onClick={() => userAction.mutate({ userId: m.userId, action: "stop-sync" })}
                  >
                    {t("accounts.createCustomer.crm.contacts.keepAsLocal")}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="text-xs text-red-700/80 dark:text-red-300/80">{t("accounts.createCustomer.crm.contacts.missingHint")}</p>
        </div>
      ) : null}
    </div>
  );
}
