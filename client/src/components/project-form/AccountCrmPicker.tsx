// Create Project's Account Name in CRM mode: search the install's CRM and
// pick an Account (HubSpot Company). The pick is resolved on the server
// (POST /api/crm/accounts/resolve) before anything is created:
//
//   - already linked to a CriteriaIQ account → that account is selected;
//   - CriteriaIQ accounts look like it → "Is this an account you already
//     have?" offers to link one of them (Account Management editors) or
//     use it as is, or to create a new account;
//   - otherwise → the Create Account dialog opens with the CRM link filled,
//     so its fields come from the CRM and stay locked.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Link2, Loader2, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast } from "@/lib/toast-helper";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import type { CrmProviderId } from "@shared/crm-provider";

type Provider = Exclude<CrmProviderId, "none">;
type MatchStrength = "strong" | "likely" | "possible";

interface CrmAccountResult {
  id: string;
  name: string;
  url: string | null;
}

export interface CrmLookalike {
  id: number;
  accountName: string;
  isActive: boolean;
  strength: MatchStrength;
  reason: "domain" | "name" | "similarName";
}

type Resolution =
  | { status: "linked"; customer: { id: number; accountName: string } }
  | { status: "new"; url: string; name: string; lookalikes: CrmLookalike[] };

interface Props {
  provider: Provider;
  /** CriteriaIQ accounts, to mark CRM results that are already linked. */
  customers: Array<{ id: number; accountName: string; crmProvider?: string | null; crmAccountId?: string | null }>;
  /** Select an existing CriteriaIQ account on the form. */
  onSelectAccount: (accountName: string) => void;
  /** Open Create Account with this CRM link filled. */
  onCreateFromCrm: (url: string) => void;
  /** Open this account's dialog with the CRM link filled, so saving links it. */
  onLinkExisting: (customerId: number, url: string) => void;
}

const SEARCH_DEBOUNCE_MS = 300;

const STRENGTH_CLASSES: Record<MatchStrength, string> = {
  strong: "border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300",
  likely: "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  possible: "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const RESOLVE_ERRORS: Record<string, string> = {
  crm_record_missing: "projects.form.accountPicker.errors.missing",
  crm_not_connected: "projects.form.accountPicker.errors.notConnected",
  crm_link_invalid: "projects.form.accountPicker.errors.invalid",
};

function errorCodeOf(error: unknown): string | undefined {
  // apiRequest puts the parsed error body on `details`.
  const details = (error as { details?: { errorCode?: unknown } | null } | null)?.details;
  return typeof details?.errorCode === "string" ? details.errorCode : undefined;
}

export function AccountCrmPicker({ provider, customers, onSelectAccount, onCreateFromCrm, onLinkExisting }: Props) {
  const { t } = useTranslation();
  const canEditAccounts = usePermissions().canEdit("project.customers");
  const crm = provider === "hubspot" ? "HubSpot" : "Salesforce";
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [pending, setPending] = useState<Extract<Resolution, { status: "new" }> | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(term.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [term]);

  const searchEnabled = debounced.length >= 2;
  const { data, isFetching, isError } = useQuery<{ accounts: CrmAccountResult[] }>({
    queryKey: ["/api/crm/accounts/search", provider, debounced],
    queryFn: async () => apiRequest("GET", `/api/crm/accounts/search?q=${encodeURIComponent(debounced)}`),
    enabled: searchEnabled,
    staleTime: 60_000,
  });
  const results = (data?.accounts ?? []).filter((a) => !!a.url);

  const linkedNames = new Map<string, string>();
  for (const c of customers) {
    if (c.crmProvider === provider && c.crmAccountId) linkedNames.set(c.crmAccountId, c.accountName);
  }

  async function pick(account: CrmAccountResult) {
    if (!account.url || resolvingId) return;
    setResolvingId(account.id);
    try {
      const result: Resolution = await apiRequest("POST", "/api/crm/accounts/resolve", { url: account.url });
      setTerm("");
      if (result.status === "linked") {
        onSelectAccount(result.customer.accountName);
      } else if (result.lookalikes.length > 0) {
        setPending(result);
      } else {
        onCreateFromCrm(result.url);
      }
    } catch (error) {
      const key = RESOLVE_ERRORS[errorCodeOf(error) ?? ""] ?? "projects.form.accountPicker.errors.failed";
      showErrorToast("projects.form.accountPicker.errors.title", key);
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <div className="flex-1 min-w-0">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground dark:text-slate-400" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={t("projects.form.accountPicker.searchPlaceholder", { crm })}
          aria-label={t("projects.form.accountPicker.searchPlaceholder", { crm })}
          className="pl-8 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        />
        {isFetching ? (
          <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground dark:text-slate-400" />
        ) : null}
      </div>
      {searchEnabled && !isFetching ? (
        <div className="mt-1 max-h-56 overflow-y-auto rounded-md border bg-white dark:border-slate-700 dark:bg-slate-900">
          {isError ? (
            <p className="px-3 py-2 text-xs text-red-600 dark:text-red-400">{t("projects.form.accountPicker.searchFailed", { crm })}</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground dark:text-slate-400">{t("projects.form.accountPicker.noResults", { crm })}</p>
          ) : (
            results.map((account) => {
              const linkedTo = linkedNames.get(account.id);
              return (
                <button
                  key={account.id}
                  type="button"
                  disabled={!!resolvingId}
                  onClick={() => void pick(account)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm text-slate-800 hover:bg-slate-100 disabled:opacity-60 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <span className="truncate">{account.name}</span>
                  {resolvingId === account.id ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground dark:text-slate-400" />
                  ) : linkedTo ? (
                    <Badge
                      variant="outline"
                      className="shrink-0 gap-1 border-green-300 bg-green-50 px-1.5 py-0 text-[10px] font-medium text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      {t("projects.form.accountPicker.inCriteriaIq")}
                    </Badge>
                  ) : (
                    <span className="shrink-0 text-[11px] text-muted-foreground dark:text-slate-400">
                      {t("projects.form.accountPicker.notInCriteriaIq")}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      ) : null}
      <p className="mt-1 text-xs text-muted-foreground dark:text-slate-400">{t("projects.form.accountPicker.hint", { crm })}</p>

      <Dialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent className="sm:max-w-lg dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-100">{t("projects.form.accountPicker.lookalike.title")}</DialogTitle>
            <DialogDescription className="dark:text-slate-400">
              {t("projects.form.accountPicker.lookalike.description", { crm, name: pending?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2">
            {(pending?.lookalikes ?? []).map((account) => (
              <li
                key={account.id}
                className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 dark:border-slate-700"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-slate-900 dark:text-slate-100">{account.accountName}</span>
                    <Badge variant="outline" className={cn("px-1.5 py-0 text-[10px] font-medium", STRENGTH_CLASSES[account.strength])}>
                      {t(`accounts.createCustomer.crm.suggestions.strength.${account.strength}`)}
                    </Badge>
                    {account.isActive ? null : (
                      <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-medium dark:border-slate-700 dark:text-slate-400">
                        {t("projects.form.accountPicker.lookalike.inactive")}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground dark:text-slate-400">
                    {t(`accounts.createCustomer.crm.suggestions.reason.${account.reason}`)}
                  </p>
                </div>
                {canEditAccounts ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      const url = pending?.url ?? "";
                      setPending(null);
                      onLinkExisting(account.id, url);
                    }}
                  >
                    <Link2 className="mr-1.5 h-3.5 w-3.5" />
                    {t("projects.form.accountPicker.lookalike.link", { crm })}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    onClick={() => {
                      setPending(null);
                      onSelectAccount(account.accountName);
                    }}
                  >
                    {t("projects.form.accountPicker.lookalike.use")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {canEditAccounts ? null : (
            <p className="text-xs text-muted-foreground dark:text-slate-400">{t("projects.form.accountPicker.lookalike.noEditHint", { crm })}</p>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={() => setPending(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={() => {
                const url = pending?.url ?? "";
                setPending(null);
                onCreateFromCrm(url);
              }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {t("projects.form.accountPicker.lookalike.createNew")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
