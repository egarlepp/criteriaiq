import { lazy, Suspense } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { FieldSourceBadge } from "@/components/configuration/FieldSourceBadge";
import { apiRequest } from "@/lib/queryClient";
import { mapPublicUrlSource, mapSecretSource } from "@/lib/env-source-badges";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";

// The provider form is large; load it only once the card is opened.
const EmailProviderSelect = lazy(() =>
  import("@/components/configuration/EmailProviderSelect").then((m) => ({ default: m.EmailProviderSelect })),
);

/** Subset of /api/system/env-status used for the Public URL row and the SMTP host badge. */
interface EnvStatusSnapshot {
  publicAppUrl: string;
  publicAppUrlSource: "env" | "file" | "default";
  smtpHostSource: "env" | "file" | "none";
}

function errorMessage(err: unknown): string | undefined {
  return err instanceof Error && err.message ? err.message : undefined;
}

function Spinner() {
  return (
    <div className="flex justify-center py-6">
      <Loader2 className="h-5 w-5 animate-spin text-gray-400 dark:text-gray-500" />
    </div>
  );
}

/**
 * Inline settings for outbound email, opened from the Email Configuration
 * card on Admin › Integrations › Overview: the public URL that emailed links
 * use, the SMTP or Microsoft Graph provider, and a test send. Admins only;
 * the server refuses everyone else.
 */
export function EmailConfigurationForm() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: currentConfig, isLoading, error } = useQuery({
    queryKey: ["/api/email-configuration"],
    queryFn: async () => (await apiRequest("GET", "/api/email-configuration")) || null,
    retry: false,
  });

  // On a 403 or error the badges fall back to "Not set", so the form still renders.
  const { data: envStatus } = useQuery<EnvStatusSnapshot>({
    queryKey: ["/api/system/env-status"],
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: async (config: unknown) => apiRequest("POST", "/api/email-configuration", config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-configuration"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email-configuration/outlook-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/integrations/status"] });
      showSuccessToast("integrations.emailConfiguration.toasts.saved", "integrations.emailConfiguration.toasts.savedDescription");
    },
    onError: (err: unknown) =>
      showErrorToast("integrations.emailConfiguration.toasts.saveFailed", errorMessage(err) ?? "integrations.emailConfiguration.toasts.saveFailedDescription"),
  });

  const testMutation = useMutation({
    mutationFn: async (data: { toEmail: string; templateId?: number }) =>
      (await apiRequest("POST", "/api/email-configuration/test", data)) as { success?: boolean; message?: string } | null,
    onSuccess: (data) => {
      // The server answers 200 with { success: false } when delivery fails.
      if (data?.success === false) {
        showErrorToast("integrations.emailConfiguration.toasts.testFailed", data.message || "integrations.emailConfiguration.toasts.testFailedDescription");
      } else {
        showSuccessToast("integrations.emailConfiguration.toasts.testSent", "integrations.emailConfiguration.toasts.testSentDescription");
      }
    },
    onError: (err: unknown) =>
      showErrorToast("integrations.emailConfiguration.toasts.testFailed", errorMessage(err) ?? "integrations.emailConfiguration.toasts.testFailedDescription"),
  });

  if (isLoading) return <Spinner />;

  if (error) {
    return (
      <div
        className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
        data-testid="email-config-load-error"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">{t("integrations.emailConfiguration.loadErrorTitle")}</p>
          <p className="text-xs">{errorMessage(error) ?? t("integrations.emailConfiguration.loadError")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="email-configuration-form">
      {/* PUBLIC_APP_URL is what password-reset and magic-link emails embed;
          the badge says where it comes from (host env wins over db-config). */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
        data-testid="email-config-public-url-row"
      >
        <div className="min-w-0 space-y-0.5">
          <Label className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
            {t("integrations.emailConfiguration.publicUrl")}
          </Label>
          <code
            className="block truncate font-mono text-xs text-gray-900 dark:text-gray-100"
            data-testid="email-config-public-url-value"
            lang="en"
            dir="ltr"
          >
            {envStatus?.publicAppUrl || "—"}
          </code>
        </div>
        <FieldSourceBadge source={mapPublicUrlSource(envStatus?.publicAppUrlSource)} testId="field-source-badge-public-url" />
      </div>
      <Suspense fallback={<Spinner />}>
        <EmailProviderSelect
          currentConfig={currentConfig || null}
          onSave={(config) => saveMutation.mutate(config)}
          onTest={(toEmail, templateId) => testMutation.mutate({ toEmail, templateId })}
          isSaving={saveMutation.isPending}
          isTesting={testMutation.isPending}
          smtpHostSource={mapSecretSource(envStatus?.smtpHostSource)}
        />
      </Suspense>
    </div>
  );
}
