import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Gauge, Loader2, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";

interface RateLimitSettings {
  enabled: boolean;
  max: number;
  windowSeconds: number;
}

const RATE_LIMIT_QUERY_KEY = ["/api/admin/rate-limit"] as const;

// Mirrors the server bounds in server/lib/rate-limit-settings.ts.
const BOUNDS = { minMax: 1, maxMax: 1_000_000, minWindow: 10, maxWindow: 3600 } as const;

function isValid(s: RateLimitSettings): boolean {
  return (
    Number.isInteger(s.max) &&
    s.max >= BOUNDS.minMax &&
    s.max <= BOUNDS.maxMax &&
    Number.isInteger(s.windowSeconds) &&
    s.windowSeconds >= BOUNDS.minWindow &&
    s.windowSeconds <= BOUNDS.maxWindow
  );
}

/**
 * Admin › Integrations › Overview › Rate Limiting (from ImpactIQ). Sets the
 * global API request limit per browser session (per IP when signed out).
 * Login, MFA and SSO keep their own tighter limits on top.
 */
export function RateLimitCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery<RateLimitSettings>({ queryKey: RATE_LIMIT_QUERY_KEY });
  const [draft, setDraft] = useState<RateLimitSettings | null>(null);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (next: RateLimitSettings) =>
      (await apiRequest("PUT", "/api/admin/rate-limit", next)) as RateLimitSettings,
    onSuccess: async (saved) => {
      setDraft(saved);
      showSuccessToast("integrations.rateLimit.toasts.saved");
      await qc.invalidateQueries({ queryKey: RATE_LIMIT_QUERY_KEY });
    },
    onError: (err: unknown) => {
      showErrorToast("common.error", err instanceof Error ? err.message : "integrations.rateLimit.toasts.failed");
    },
  });

  return (
    <Card className="flex flex-col gap-4 p-5" data-testid="rate-limit-card">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-indigo-100 p-2 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400">
          <Gauge className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-gray-900 dark:text-gray-100">{t("integrations.rateLimit.title")}</p>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{t("integrations.rateLimit.subtitle")}</p>
        </div>
      </div>

      {!draft ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-gray-400 dark:text-gray-500" />
        </div>
      ) : (
        <>
          <div className="flex items-start gap-2">
            <Checkbox
              id="rate-limit-enabled"
              checked={draft.enabled}
              onCheckedChange={(checked) => setDraft({ ...draft, enabled: checked === true })}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="rate-limit-enabled" className="cursor-pointer font-semibold text-gray-700 dark:text-gray-300">
                {t("integrations.rateLimit.enabledLabel")}
              </Label>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{t("integrations.rateLimit.enabledHint")}</p>
            </div>
          </div>

          <div className="grid max-w-md grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="rate-limit-max" className="text-[11px]">
                {t("integrations.rateLimit.maxLabel")}
              </Label>
              <Input
                id="rate-limit-max"
                type="number"
                min={BOUNDS.minMax}
                max={BOUNDS.maxMax}
                value={Number.isFinite(draft.max) ? draft.max : ""}
                disabled={!draft.enabled}
                onChange={(e) => setDraft({ ...draft, max: e.target.valueAsNumber })}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="rate-limit-window" className="text-[11px]">
                {t("integrations.rateLimit.windowLabel")}
              </Label>
              <Input
                id="rate-limit-window"
                type="number"
                min={BOUNDS.minWindow}
                max={BOUNDS.maxWindow}
                value={Number.isFinite(draft.windowSeconds) ? draft.windowSeconds : ""}
                disabled={!draft.enabled}
                onChange={(e) => setDraft({ ...draft, windowSeconds: e.target.valueAsNumber })}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            {isValid(draft)
              ? t("integrations.rateLimit.summary", { max: draft.max, seconds: draft.windowSeconds })
              : t("integrations.rateLimit.bounds", {
                  minMax: BOUNDS.minMax,
                  maxMax: BOUNDS.maxMax.toLocaleString(),
                  minWindow: BOUNDS.minWindow,
                  maxWindow: BOUNDS.maxWindow,
                })}
          </p>

          <div>
            <Button size="sm" onClick={() => saveMutation.mutate(draft)} disabled={saveMutation.isPending || !isValid(draft)}>
              {saveMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
              {t("common.save")}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
