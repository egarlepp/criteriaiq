import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, Save, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { accountPortalSettingsSchema, type AccountPortalSettings } from "@shared/account-portal-settings";

export const ACCOUNT_PORTAL_SETTINGS_KEY = ["/api/admin/account-portal"] as const;
export const ACCOUNT_PORTAL_LINKS_KEY = ["/api/account-portal/links"] as const;

/**
 * Admin › Workplace › Terminology, "Account Portal" card. Holds the link to
 * the company's own customer portal. Internal users see it as a button on
 * the Account Portal header; Customers, Partners and Guests never do.
 * Empty hides the button.
 */
export function AccountPortalSettingsSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery<AccountPortalSettings>({ queryKey: ACCOUNT_PORTAL_SETTINGS_KEY });
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    if (data) setDraft(data.internalPortalUrl);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (next: AccountPortalSettings) =>
      (await apiRequest("PUT", "/api/admin/account-portal", next)) as AccountPortalSettings,
    onSuccess: async () => {
      showSuccessToast("configuration.accountPortal.toasts.saved");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ACCOUNT_PORTAL_SETTINGS_KEY }),
        qc.invalidateQueries({ queryKey: ACCOUNT_PORTAL_LINKS_KEY }),
      ]);
    },
    onError: (err: unknown) => {
      showErrorToast("common.error", err instanceof Error ? err.message : "configuration.accountPortal.toasts.failed");
    },
  });

  const next: AccountPortalSettings | null = draft === null ? null : { internalPortalUrl: draft.trim() };
  const valid = next ? accountPortalSettingsSchema.safeParse(next).success : false;
  const dirty = !!data && draft !== null && draft.trim() !== data.internalPortalUrl;

  return (
    <Card className="flex flex-col gap-4 p-5" data-testid="account-portal-settings-card">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-sky-100 p-2 text-sky-700 dark:bg-sky-950/60 dark:text-sky-400">
          <Users className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-gray-900 dark:text-gray-100">{t("configuration.accountPortal.title")}</p>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{t("configuration.accountPortal.subtitle")}</p>
        </div>
      </div>

      {draft === null ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-gray-400 dark:text-gray-500" />
        </div>
      ) : (
        <>
          <div className="flex max-w-2xl flex-col gap-1">
            <Label htmlFor="account-portal-internal-url" className="text-[11px]">
              {t("configuration.accountPortal.internalPortalUrlLabel")}
            </Label>
            <Input
              id="account-portal-internal-url"
              type="url"
              inputMode="url"
              value={draft}
              maxLength={500}
              placeholder="https://"
              onChange={(e) => setDraft(e.target.value)}
              className="h-8 text-xs dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
              data-testid="account-portal-internal-url"
            />
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{t("configuration.accountPortal.internalPortalUrlHelp")}</p>
          </div>

          {!valid ? (
            <p className="text-[11px] text-red-600 dark:text-red-400">{t("configuration.accountPortal.invalidUrl")}</p>
          ) : null}

          <div>
            <Button
              size="sm"
              onClick={() => next && saveMutation.mutate(next)}
              disabled={saveMutation.isPending || !valid || !dirty}
              data-testid="account-portal-settings-save"
            >
              {saveMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
              {t("common.save")}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
