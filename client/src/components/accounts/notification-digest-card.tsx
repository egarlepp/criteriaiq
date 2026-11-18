import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BellRing, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";

type Digest = "off" | "daily";

const PREFS_KEY = ["/api/users/me/notification-preferences"] as const;

/**
 * Profile › Notifications: how the bell's notifications reach you. In-app
 * only, or in-app plus a daily email of the unread ones. Saves on change,
 * separately from the email preferences form below it.
 */
export function NotificationDigestCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ digest: Digest }>({
    queryKey: PREFS_KEY,
    queryFn: async () => (await apiRequest("GET", "/api/users/me/notification-preferences")) as { digest: Digest },
  });

  const save = useMutation({
    mutationFn: async (digest: Digest) =>
      (await apiRequest("PUT", "/api/users/me/notification-preferences", { digest })) as { digest: Digest },
    onSuccess: (next) => {
      qc.setQueryData(PREFS_KEY, next);
      showSuccessToast("profile.notifications.savedTitle", "profile.notificationDigest.saved");
    },
    onError: () => {
      showErrorToast("profile.notifications.errorTitle", "profile.notifications.saveFailed");
    },
  });

  return (
    <Card data-testid="notification-digest-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="h-5 w-5" />
          {t("profile.notificationDigest.title")}
        </CardTitle>
        <CardDescription>{t("profile.notificationDigest.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading || !data ? (
          <Loader2 className="h-4 w-4 animate-spin text-gray-400 dark:text-gray-500" />
        ) : (
          <RadioGroup
            value={data.digest}
            onValueChange={(value) => save.mutate(value as Digest)}
            disabled={save.isPending}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="off" id="digest-off" />
              <Label htmlFor="digest-off" className="cursor-pointer">
                {t("profile.notificationDigest.inAppOnly")}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="daily" id="digest-daily" />
              <Label htmlFor="digest-daily" className="cursor-pointer">
                {t("profile.notificationDigest.daily")}
              </Label>
            </div>
          </RadioGroup>
        )}
        <p className="mt-3 text-xs text-muted-foreground">{t("profile.notificationDigest.hint")}</p>
      </CardContent>
    </Card>
  );
}
