// Where an Account User came from: imported from a CRM contact (name and
// title follow the contact) or added in CriteriaIQ. Imported users also
// show the CRM flags: the contact is gone from the account, or the CRM
// has a different email (an Admin accepts it on the account dialog).
import { useTranslation } from "react-i18next";
import { AlertTriangle, CloudCog } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface UserSourceFields {
  crmProvider?: string | null;
  crmContactId?: string | null;
  crmEmail?: string | null;
  crmContactMissingAt?: string | null;
}

function crmName(provider: string): string {
  return provider === "hubspot" ? "HubSpot" : "Salesforce";
}

export function UserSourceBadge({ user }: { user: UserSourceFields }) {
  const { t } = useTranslation();
  const fromCrm = !!user.crmProvider && !!user.crmContactId;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {fromCrm ? (
        <Badge
          variant="outline"
          className="gap-1 border-orange-300 bg-orange-50 px-1.5 py-0 text-[10px] font-medium text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300"
        >
          <CloudCog className="h-3 w-3" />
          {t("users.source.fromCrm", { crm: crmName(user.crmProvider!) })}
        </Badge>
      ) : (
        <Badge
          variant="outline"
          className="border-slate-300 bg-slate-50 px-1.5 py-0 text-[10px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
        >
          {t("users.source.local")}
        </Badge>
      )}
      {fromCrm && user.crmContactMissingAt ? (
        <Badge
          variant="outline"
          className="gap-1 border-red-300 bg-red-50 px-1.5 py-0 text-[10px] font-medium text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
        >
          <AlertTriangle className="h-3 w-3" />
          {t("users.source.contactMissing", { crm: crmName(user.crmProvider!) })}
        </Badge>
      ) : null}
      {fromCrm && user.crmEmail ? (
        <Badge
          variant="outline"
          title={user.crmEmail}
          className="gap-1 border-amber-300 bg-amber-50 px-1.5 py-0 text-[10px] font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
        >
          <AlertTriangle className="h-3 w-3" />
          {t("users.source.emailDiffers", { crm: crmName(user.crmProvider!) })}
        </Badge>
      ) : null}
    </span>
  );
}
