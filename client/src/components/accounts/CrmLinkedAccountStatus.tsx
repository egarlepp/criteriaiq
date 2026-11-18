// The account dialog's view of a CRM link: the "Managed in Salesforce"
// badge on read-only fields, the linked account's sync status with Refresh
// and the Admin-only Unlink, and the before/after preview when a CRM account
// is picked. State lives in use-account-crm-sync.ts.
import { useTranslation } from "react-i18next";
import { AlertTriangle, CloudCog, Link2Off, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CrmProviderId } from "@shared/crm-provider";
import type { CrmFieldChange, CrmLinkPreview, LinkedAccountState } from "./use-account-crm-sync";
import type { CrmLinkStatus } from "./account-crm-link-status";

type Provider = Exclude<CrmProviderId, "none">;

function crmName(provider: Provider): string {
  return provider === "hubspot" ? "HubSpot" : "Salesforce";
}

/** Small badge next to a field label: the field comes from the CRM and can't be edited here. */
export function CrmManagedBadge({ provider }: { provider: Provider }) {
  const { t } = useTranslation();
  return (
    <Badge
      variant="outline"
      className="ml-2 gap-1 px-1.5 py-0 text-[10px] font-medium border-orange-300 text-orange-700 bg-orange-50 dark:border-orange-800 dark:text-orange-300 dark:bg-orange-950/40"
      title={t("accounts.createCustomer.crm.sync.managedTooltip", { crm: crmName(provider) })}
    >
      <CloudCog className="h-3 w-3" />
      {t("accounts.createCustomer.crm.sync.managedIn", { crm: crmName(provider) })}
    </Badge>
  );
}

interface StatusProps {
  provider: Provider;
  saved: LinkedAccountState;
  connected: boolean;
  isAdmin: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onUnlink: () => void;
}

/** A saved, linked account: when it last synced, Refresh, and Unlink for Admins. */
export function CrmLinkedAccountStatus({ provider, saved, connected, isAdmin, refreshing, onRefresh, onUnlink }: StatusProps) {
  const { t } = useTranslation();
  const crm = crmName(provider);
  return (
    <div className="space-y-2">
      {saved.crmRecordMissingAt ? (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t("accounts.createCustomer.crm.sync.recordMissing", { crm })}</span>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
        <span>
          {saved.crmSyncedAt
            ? t("accounts.createCustomer.crm.sync.lastSynced", { crm, date: new Date(saved.crmSyncedAt).toLocaleString() })
            : t("accounts.createCustomer.crm.sync.notSyncedYet", { crm })}
        </span>
        {saved.website ? (
          <a
            href={saved.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            {saved.website.replace(/^https?:\/\//, "")}
          </a>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!connected || refreshing}
          title={connected ? undefined : t("accounts.createCustomer.crm.notConnected")}
          onClick={onRefresh}
          className="h-7 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {refreshing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
          {t("accounts.createCustomer.crm.sync.refresh")}
        </Button>
        {isAdmin ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onUnlink}
            className="h-7 border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
          >
            <Link2Off className="mr-1.5 h-3.5 w-3.5" />
            {t("accounts.createCustomer.crm.sync.unlink")}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground dark:text-slate-400">
        {isAdmin ? t("accounts.createCustomer.crm.sync.unlinkHintAdmin") : t("accounts.createCustomer.crm.sync.unlinkHint")}
      </p>
    </div>
  );
}

interface PreviewProps {
  provider: Provider;
  preview: CrmLinkPreview | null;
  previewing: boolean;
  /** Turns a field's raw value (an industry id, a user id) into what the user reads. */
  describe: (change: CrmFieldChange, side: "from" | "to") => string;
}

/** What picking this CRM account changes on the account, shown before saving. */
export function CrmLinkPreviewPanel({ provider, preview, previewing, describe }: PreviewProps) {
  const { t } = useTranslation();
  const crm = crmName(provider);
  if (previewing) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground dark:text-slate-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {t("accounts.createCustomer.crm.sync.previewLoading", { crm })}
      </p>
    );
  }
  if (!preview) return null;
  return (
    <div className="space-y-2 rounded-md border border-orange-200 bg-white px-3 py-2 dark:border-orange-900 dark:bg-slate-900">
      {preview.existingAccount ? (
        <p className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("accounts.createCustomer.crm.alreadyLinkedTo", { account: preview.existingAccount.accountName })}
        </p>
      ) : null}
      <p className="text-xs font-medium text-slate-800 dark:text-slate-200">
        {t("accounts.createCustomer.crm.sync.previewTitle", { crm, name: preview.name })}
      </p>
      {preview.changes.length === 0 ? (
        <p className="text-xs text-muted-foreground dark:text-slate-400">{t("accounts.createCustomer.crm.sync.previewNoChanges")}</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {preview.changes.map((change) => (
            <li key={change.field} className="grid grid-cols-[8rem_1fr] gap-2">
              <span className="text-muted-foreground dark:text-slate-400">
                {t(`accounts.createCustomer.crm.sync.fields.${change.field}`)}
              </span>
              <span className="text-slate-800 dark:text-slate-200">
                {change.from === null || change.from === "" ? (
                  describe(change, "to")
                ) : (
                  <>
                    <span className="line-through text-slate-400 dark:text-slate-500">{describe(change, "from")}</span>
                    {" → "}
                    {describe(change, "to")}
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground dark:text-slate-400">{t("accounts.createCustomer.crm.sync.previewHint", { crm })}</p>
    </div>
  );
}

const LINK_STATUS_CLASSES: Record<CrmLinkStatus, string> = {
  linked: "border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300",
  missing: "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300",
  exception: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  needsLink: "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300",
  internal: "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400",
};

/** The Account Directory's "CRM link" pill. */
export function CrmLinkStatusBadge({ status }: { status: CrmLinkStatus }) {
  const { t } = useTranslation();
  return (
    <Badge variant="outline" className={`px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${LINK_STATUS_CLASSES[status]}`}>
      {t(`accounts.directory.crmLink.status.${status}`)}
    </Badge>
  );
}
