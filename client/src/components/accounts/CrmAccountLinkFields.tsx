// The account's CRM link on the account dialog: the record URL plus, when
// the signed-in user can query the CRM, a search that fills it. The link is
// a Salesforce Account or a HubSpot Company, whichever the install uses.
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, Search, ShieldAlert } from "lucide-react";
import type { TFunction } from "i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { useCrmStatus } from "@/hooks/use-crm-status";
import type { CrmProviderId } from "@shared/crm-provider";

interface CrmAccountResult {
  id: string;
  name: string;
  url: string | null;
}

interface CrmAccountLinkFieldsProps {
  provider: Exclude<CrmProviderId, "none">;
  value: string;
  onChange: (url: string) => void;
  /** Called with the picked record's name, so an empty account name can be filled. */
  onPickName?: (name: string) => void;
  /**
   * The saved link is in place: the URL is read-only and the search hidden.
   * Changing it means unlinking first (Admin only).
   */
  locked?: boolean;
  /** Shown under the link: the sync status of a linked account, or the preview of a new link. */
  children?: ReactNode;
  /** True on create and when the saved account is linked: saving with no link needs an Admin exception. */
  linkRequired: boolean;
  isAdmin: boolean;
  /** The Admin's reason for leaving the account unlinked. */
  exceptionReason: string;
  onExceptionReasonChange: (reason: string) => void;
  /** The exception already on the saved account, if any. */
  approvedException?: { reason: string; at: string | null } | null;
  /** The account name typed so far, sent with an exception request. */
  accountName: string;
}

/** Max length of an exception reason; the server enforces the same limit. */
export const CRM_LINK_REASON_MAX = 500;

/**
 * The translated message for a CRM-link refusal from the account save, or
 * null when the error is something else.
 */
export function crmLinkErrorMessage(
  t: TFunction,
  errorData: { errorCode?: string; existingAccount?: { accountName?: string } } | null | undefined,
): string | null {
  switch (errorData?.errorCode) {
    case "crm_account_already_linked":
      return errorData.existingAccount?.accountName
        ? t("accounts.createCustomer.crm.alreadyLinkedTo", { account: errorData.existingAccount.accountName })
        : t("accounts.createCustomer.crm.alreadyLinked");
    case "crm_link_required":
      return t("accounts.createCustomer.crm.linkRequired");
    case "crm_link_reason_required":
      return t("accounts.createCustomer.crm.exceptionReasonRequired");
    case "crm_link_reason_too_long":
      return t("accounts.createCustomer.crm.exceptionReasonTooLong", { max: CRM_LINK_REASON_MAX });
    default:
      return null;
  }
}

const SEARCH_DEBOUNCE_MS = 300;

export function CrmAccountLinkFields({
  provider,
  value,
  onChange,
  onPickName,
  locked = false,
  children,
  linkRequired,
  isAdmin,
  exceptionReason,
  onExceptionReasonChange,
  approvedException,
  accountName,
}: CrmAccountLinkFieldsProps) {
  const { t } = useTranslation();
  const { connected } = useCrmStatus();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(term.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [term]);

  const searchEnabled = connected && !locked && debounced.length >= 2;
  const { data, isFetching, isError } = useQuery<{ accounts: CrmAccountResult[] }>({
    queryKey: ["/api/crm/accounts/search", provider, debounced],
    queryFn: async () => apiRequest("GET", `/api/crm/accounts/search?q=${encodeURIComponent(debounced)}`),
    enabled: searchEnabled,
    staleTime: 60_000,
  });
  const results = (data?.accounts ?? []).filter((a) => !!a.url);

  const urlLabel = provider === "hubspot" ? t("accounts.createCustomer.crm.hubspotUrlLabel") : t("accounts.createCustomer.fields.salesforceUrlLabel");
  const urlPlaceholder = provider === "hubspot" ? "https://app.hubspot.com/contacts/..." : "https://example.salesforce.com/...";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="crmAccountUrl">{urlLabel}</Label>
          <Input
            id="crmAccountUrl"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={urlPlaceholder}
            readOnly={locked}
            className={locked ? "bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300" : undefined}
          />
        </div>
        {locked ? null : (
        <div>
          <Label htmlFor="crmAccountSearch">
            {provider === "hubspot" ? t("accounts.createCustomer.crm.searchHubspot") : t("accounts.createCustomer.crm.searchSalesforce")}
          </Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="crmAccountSearch"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              disabled={!connected}
              placeholder={connected ? t("accounts.createCustomer.crm.searchPlaceholder") : t("accounts.createCustomer.crm.notConnected")}
              className="pl-8"
            />
            {isFetching ? (
              <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            ) : null}
          </div>
          {searchEnabled && !isFetching ? (
            <div className="mt-1 max-h-40 overflow-y-auto rounded-md border bg-white dark:bg-slate-900 dark:border-slate-700">
              {isError ? (
                <p className="px-3 py-2 text-xs text-red-600 dark:text-red-400">{t("accounts.createCustomer.crm.searchFailed")}</p>
              ) : results.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">{t("accounts.createCustomer.crm.noResults")}</p>
              ) : (
                results.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => {
                      onChange(account.url ?? "");
                      onPickName?.(account.name);
                      setTerm("");
                    }}
                    className="block w-full text-left px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {account.name}
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
        )}
      </div>
      {children}
      {!value.trim() ? (
        <UnlinkedAccountNotice
          provider={provider}
          linkRequired={linkRequired}
          isAdmin={isAdmin}
          exceptionReason={exceptionReason}
          onExceptionReasonChange={onExceptionReasonChange}
          approvedException={approvedException}
          accountName={accountName}
        />
      ) : null}
    </div>
  );
}

interface UnlinkedAccountNoticeProps {
  provider: Exclude<CrmProviderId, "none">;
  linkRequired: boolean;
  isAdmin: boolean;
  exceptionReason: string;
  onExceptionReasonChange: (reason: string) => void;
  approvedException?: { reason: string; at: string | null } | null;
  accountName: string;
}

/**
 * Shown while the account has no CRM link. An Admin can approve it as an
 * exception with a reason; anyone else can ask the Admins for one.
 */
function UnlinkedAccountNotice({
  provider,
  linkRequired,
  isAdmin,
  exceptionReason,
  onExceptionReasonChange,
  approvedException,
  accountName,
}: UnlinkedAccountNoticeProps) {
  const { t } = useTranslation();
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestReason, setRequestReason] = useState("");
  const [sending, setSending] = useState(false);
  const crmName = provider === "hubspot" ? "HubSpot" : "Salesforce";

  const sendRequest = async () => {
    const reason = requestReason.trim();
    if (!accountName.trim() || !reason) {
      showErrorToast("common.error", "accounts.createCustomer.crm.requestNeedsNameAndReason");
      return;
    }
    setSending(true);
    try {
      await apiRequest("POST", "/api/customers/crm-link-exception-requests", { accountName: accountName.trim(), reason });
      showSuccessToast("common.success", "accounts.createCustomer.crm.requestSent");
      setRequestOpen(false);
      setRequestReason("");
    } catch {
      showErrorToast("common.error", "accounts.createCustomer.crm.requestFailed");
    } finally {
      setSending(false);
    }
  };

  if (approvedException && !linkRequired) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <p className="font-medium">{t("accounts.createCustomer.crm.approvedExceptionTitle")}</p>
        <p className="mt-0.5 text-xs">
          {approvedException.at
            ? t("accounts.createCustomer.crm.approvedExceptionOn", { date: new Date(approvedException.at).toLocaleDateString(), reason: approvedException.reason })
            : approvedException.reason}
        </p>
      </div>
    );
  }

  if (!linkRequired && !isAdmin) {
    return (
      <p className="text-xs text-amber-700 dark:text-amber-300">{t("accounts.createCustomer.crm.needsLink", { crm: crmName })}</p>
    );
  }

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2 dark:border-amber-800 dark:bg-amber-950/40">
      <div className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200">
        <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
        <p>
          {isAdmin
            ? t("accounts.createCustomer.crm.adminExceptionHint", { crm: crmName })
            : t("accounts.createCustomer.crm.requestExceptionHint", { crm: crmName })}
        </p>
      </div>
      {isAdmin ? (
        <div>
          <Label htmlFor="crmLinkExceptionReason" className="text-amber-900 dark:text-amber-200">
            {t("accounts.createCustomer.crm.exceptionReasonLabel")}
          </Label>
          <Textarea
            id="crmLinkExceptionReason"
            value={exceptionReason}
            maxLength={CRM_LINK_REASON_MAX}
            onChange={(e) => onExceptionReasonChange(e.target.value)}
            placeholder={t("accounts.createCustomer.crm.exceptionReasonPlaceholder")}
            className="mt-1 bg-white dark:bg-slate-900"
            rows={2}
          />
        </div>
      ) : requestOpen ? (
        <div className="space-y-2">
          <Label htmlFor="crmLinkExceptionRequest" className="text-amber-900 dark:text-amber-200">
            {t("accounts.createCustomer.crm.exceptionReasonLabel")}
          </Label>
          <Textarea
            id="crmLinkExceptionRequest"
            value={requestReason}
            maxLength={CRM_LINK_REASON_MAX}
            onChange={(e) => setRequestReason(e.target.value)}
            placeholder={t("accounts.createCustomer.crm.exceptionReasonPlaceholder")}
            className="bg-white dark:bg-slate-900"
            rows={2}
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={sendRequest} disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {t("accounts.createCustomer.crm.sendRequest")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setRequestOpen(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => setRequestOpen(true)}>
          {t("accounts.createCustomer.crm.requestException")}
        </Button>
      )}
    </div>
  );
}
