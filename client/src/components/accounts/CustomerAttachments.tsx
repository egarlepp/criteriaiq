import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function CustomerAttachments({ userId, userEmail }: { userId: string; userEmail?: string }) {
  const { t } = useTranslation();
  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ["/api/customers"],
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  // Internal staff: the user's email domain is linked (Domain Allow List) to
  // an account flagged is_internal — the same rule the server applies in
  // getInternalAccountForEmailDomain. Show that account instead of a list of
  // customer attachments. The allow list is admin-only; for other roles the
  // query is skipped and users simply show their attachments.
  const { user: currentUser } = useAuth();
  const isAdminViewer = (currentUser as any)?.role === "Admin";
  const { data: allowedDomains = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/allowed-domains"],
    enabled: isAdminViewer,
    staleTime: 5 * 60 * 1000,
  });
  // Internal accounts are excluded from the default /api/customers list.
  const { data: internalAccounts = [] } = useQuery<any[]>({
    queryKey: ["/api/customers", { scope: "internal" }],
    staleTime: 5 * 60 * 1000,
  });
  const listedUser = users.find((u: any) => u.id === userId);
  const resolvedEmail = userEmail || listedUser?.email;
  const internalAccountName = useMemo(() => {
    // Staff linked to the internal account directly in the user form.
    const linked = (internalAccounts as any[]).find((c) => c.id === listedUser?.accountId);
    if (linked) return linked.accountName as string;
    const domain = resolvedEmail?.toLowerCase().trim().split("@")[1];
    if (!domain) return undefined;
    const link = (allowedDomains as any[]).find(
      (d) => d?.isActive !== false && String(d?.domain).toLowerCase() === domain,
    );
    if (!link?.accountId) return undefined;
    return (internalAccounts as any[]).find((c) => c.id === link.accountId)?.accountName as string | undefined;
  }, [resolvedEmail, allowedDomains, internalAccounts, listedUser?.accountId]);

  if (internalAccountName) {
    return <span className="text-sm text-gray-900 dark:text-gray-100">{internalAccountName} ({t("accounts.customerAttachments.internal")})</span>;
  }

  const attachedCustomers = customers.filter((customer: any) => {
    if (customer.accountRepresentativeId === userId || customer.accountEngineerId === userId) {
      return true;
    }

    if (customer.contactUsers && Array.isArray(customer.contactUsers)) {
      return customer.contactUsers.some((contact: any) => contact.userId === userId);
    }

    return false;
  });

  if (attachedCustomers.length === 0) {
    return <span className="text-red-600 dark:text-red-400 text-sm">{t("accounts.customerAttachments.notAttached")}</span>;
  }

  if (attachedCustomers.length === 1) {
    return <span className="text-sm text-gray-900 dark:text-gray-100">{attachedCustomers[0].accountName}</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-sm text-blue-600 dark:text-blue-400 cursor-pointer">
          {t("accounts.customerAttachments.customersCount", { count: attachedCustomers.length })}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="!bg-white dark:!bg-slate-800 !text-black dark:!text-slate-100 !text-xs !px-2 !py-1 !border !border-gray-200 dark:!border-slate-700 !shadow-md !font-normal max-w-xs">
        <div className="space-y-1">
          {attachedCustomers.map((customer: any) => (
            <div key={customer.id}>{customer.accountName}</div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export default CustomerAttachments;
