import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, X, Eye, ArrowRight, UserX } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { showErrorToast } from "@/lib/toast-helper";
import { apiRequest } from "@/lib/queryClient";

// Per-admin dismissible banner listing users that migration 035
// deactivated as case-variant duplicates, paired with the surviving
// account. Hidden when the server reports dismissed=true or there
// are no `+dup`-renamed losers.

interface DuplicateUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean | null;
  deactivatedAt?: string | null;
}

interface SurvivingUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean | null;
}

interface DuplicateEntry {
  loser: DuplicateUser;
  originalEmail: string;
  surviving: SurvivingUser | null;
}

interface DuplicateNoticeResponse {
  dismissed: boolean;
  dismissedAt: string | null;
  duplicates: DuplicateEntry[];
}

interface DuplicateCleanupNoticeProps {
  // Opens the View User dialog by id; parent looks the user up in
  // its existing /api/users query.
  onReviewUser?: (userId: string) => void;
}

const QUERY_KEY = ["/api/users/duplicate-cleanup-notice"] as const;

function displayName(user: DuplicateUser | SurvivingUser): string {
  const parts = [user.firstName ?? "", user.lastName ?? ""]
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return user.email ?? user.id;
}

export default function DuplicateCleanupNotice({
  onReviewUser,
}: DuplicateCleanupNoticeProps) {
  const { user: currentUser, isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isAdmin = currentUser?.role === "Admin";

  const { data, isLoading } = useQuery<DuplicateNoticeResponse>({
    queryKey: QUERY_KEY,
    enabled: isAuthenticated && isAdmin,
  });

  const dismissMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(
        "POST",
        "/api/users/duplicate-cleanup-notice/dismiss",
      );
    },
    onSuccess: () => {
      // Optimistic hide; refetch reconfirms.
      queryClient.setQueryData<DuplicateNoticeResponse | undefined>(
        QUERY_KEY,
        (prev) =>
          prev
            ? { ...prev, dismissed: true, dismissedAt: new Date().toISOString() }
            : prev,
      );
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({
        title: t("accounts.duplicateCleanup.toastDismissedTitle"),
        description: t("accounts.duplicateCleanup.toastDismissedDescription"),
      });
    },
    onError: (err: any) => {
      // Routed through the shared error helper so the production
      // toast-lint check (which forbids direct `variant:"destructive"`
      // calls — see task #461) stays green and the visual style
      // matches every other error toast in the app.
      showErrorToast(
        t("accounts.duplicateCleanup.toastDismissFailed"),
        err?.message ?? t("accounts.duplicateCleanup.toastTryAgain"),
      );
    },
  });

  const duplicates = useMemo(() => data?.duplicates ?? [], [data]);

  if (!isAdmin) return null;
  if (isLoading) return null;
  if (!data) return null;
  if (data.dismissed) return null;
  if (duplicates.length === 0) return null;

  return (
    <Card
      data-testid="duplicate-cleanup-notice"
      className="relative overflow-hidden border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-900/20"
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-amber-900 dark:text-amber-100">
                  {duplicates.length === 1
                    ? t("accounts.duplicateCleanup.deactivatedSingular")
                    : t("accounts.duplicateCleanup.deactivatedPlural", { count: duplicates.length })}
                </h3>
                <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                  {t("accounts.duplicateCleanup.explanationPlain")}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => dismissMutation.mutate()}
                disabled={dismissMutation.isPending}
                aria-label={t("accounts.duplicateCleanup.dismissAriaLabel")}
                data-testid="dismiss-duplicate-cleanup-notice"
                className="text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100 -mt-1 -mr-2 shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-3 space-y-2">
              {duplicates.map(({ loser, surviving, originalEmail }) => (
                <div
                  key={loser.id}
                  data-testid={`duplicate-pair-${loser.id}`}
                  className="rounded border border-amber-200 dark:border-amber-800/60 bg-white dark:bg-gray-900/40 p-3"
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <UserX className="h-4 w-4 text-red-500 dark:text-red-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                            {displayName(loser)}
                          </span>
                          <Badge
                            variant="outline"
                            className="text-xs border-red-300 text-red-700 dark:border-red-700 dark:text-red-300"
                          >
                            {t("accounts.duplicateCleanup.deactivatedBadge")}
                          </Badge>
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400 truncate">
                          {t("accounts.duplicateCleanup.renamedTo")}{" "}
                          <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800">
                            {loser.email ?? t("accounts.duplicateCleanup.noEmail")}
                          </code>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-500 truncate">
                          {t("accounts.duplicateCleanup.originalEmail")}{" "}
                          <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800">
                            {originalEmail}
                          </code>
                        </div>
                      </div>
                    </div>

                    <ArrowRight className="hidden md:block h-4 w-4 text-gray-400 shrink-0" />

                    <div className="flex items-center gap-2 min-w-0">
                      {surviving ? (
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                              {displayName(surviving)}
                            </span>
                            <Badge
                              variant="outline"
                              className="text-xs border-green-300 text-green-700 dark:border-green-700 dark:text-green-300"
                            >
                              {t("accounts.duplicateCleanup.survivingBadge")}
                            </Badge>
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400 truncate">
                            {surviving.email ?? t("accounts.duplicateCleanup.noEmail")}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-gray-500 dark:text-gray-400 italic">
                          {t("accounts.duplicateCleanup.noSurviving")}{" "}
                          <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800">
                            {originalEmail}
                          </code>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {onReviewUser && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onReviewUser(loser.id)}
                          data-testid={`review-loser-${loser.id}`}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          {t("accounts.duplicateCleanup.reviewDeactivated")}
                        </Button>
                      )}
                      {onReviewUser && surviving && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onReviewUser(surviving.id)}
                          data-testid={`review-surviving-${surviving.id}`}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          {t("accounts.duplicateCleanup.reviewSurviving")}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
