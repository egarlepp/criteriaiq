// "Possible CRM matches" on an unlinked account's dialog: up to three CRM
// accounts it may be, strongest first (same domain, same name, close name).
// Link fills the CRM link (the preview then shows what changes); "Not this
// one" is remembered so the pair isn't suggested again. Nothing shows with
// no CRM, when the user hasn't connected it, or when there's no match.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link2, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast } from "@/lib/toast-helper";
import { useCrmStatus } from "@/hooks/use-crm-status";
import { cn } from "@/lib/utils";

export type MatchStrength = "strong" | "likely" | "possible";

export interface CrmMatchSuggestion {
  id: string;
  name: string;
  url: string | null;
  website: string | null;
  strength: MatchStrength;
  reason: "domain" | "name" | "similarName";
  score: number;
}

const STRENGTH_CLASSES: Record<MatchStrength, string> = {
  strong: "border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300",
  likely: "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  possible: "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export function crmSuggestionsKey(customerId: number) {
  return ["/api/customers", customerId, "crm-suggestions"] as const;
}

interface Props {
  customerId: number;
  /** Whether the user may link or dismiss (Account Management edit). */
  canEdit: boolean;
  onLink: (suggestion: CrmMatchSuggestion) => void;
}

export function CrmMatchSuggestions({ customerId, canEdit, onLink }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { provider, connected } = useCrmStatus();

  const { data } = useQuery<{ status: string; suggestions: CrmMatchSuggestion[] }>({
    queryKey: crmSuggestionsKey(customerId),
    queryFn: () => apiRequest("GET", `/api/customers/${customerId}/crm-suggestions`),
    enabled: provider !== "none" && connected,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const dismiss = useMutation({
    mutationFn: (crmAccountId: string) =>
      apiRequest("POST", `/api/customers/${customerId}/crm-suggestions/dismiss`, { crmAccountId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: crmSuggestionsKey(customerId) }),
    onError: () => showErrorToast("accounts.createCustomer.crm.suggestions.dismissFailedTitle", "accounts.createCustomer.crm.suggestions.dismissFailed"),
  });

  const suggestions = (data?.suggestions ?? []).filter((s) => !!s.url);
  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-2 rounded-md border border-blue-200 bg-white px-3 py-2 dark:border-blue-900 dark:bg-slate-900">
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-800 dark:text-slate-200">
        <Sparkles className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
        {t("accounts.createCustomer.crm.suggestions.title")}
      </p>
      <ul className="space-y-1.5">
        {suggestions.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-slate-900 dark:text-slate-100">{s.name}</span>
            <Badge variant="outline" className={cn("px-1.5 py-0 text-[10px] font-medium", STRENGTH_CLASSES[s.strength])}>
              {t(`accounts.createCustomer.crm.suggestions.strength.${s.strength}`)}
            </Badge>
            <span className="text-xs text-muted-foreground dark:text-slate-400">
              {t(`accounts.createCustomer.crm.suggestions.reason.${s.reason}`)}
              {s.website ? ` · ${s.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}` : ""}
            </span>
            {canEdit ? (
              <span className="ml-auto flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  onClick={() => onLink(s)}
                >
                  <Link2 className="mr-1 h-3.5 w-3.5" />
                  {t("accounts.createCustomer.crm.suggestions.link")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  disabled={dismiss.isPending}
                  onClick={() => dismiss.mutate(s.id)}
                >
                  <X className="mr-1 h-3.5 w-3.5" />
                  {t("accounts.createCustomer.crm.suggestions.dismiss")}
                </Button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
