import { useState, type ComponentType, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, CheckCircle2, CircleSlash, Info, Link2, Loader2, LogOut, RefreshCcw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { cn } from "@/lib/utils";

// One connection on Profile Settings › Integrations, ported from ImpactIQ's
// My Settings ConnectionCard: status pill, who it's connected as, since when,
// and Connect / Reconnect / Disconnect. Shared by every per-user connection
// (CRM and Outlook) so they look and behave the same.

export type ConnectionState = "connected" | "needs-reconnect" | "not-connected" | "attention";

// May return a promise; the dialog does not wait for it.
type DisconnectHandler = () => unknown;

interface ConnectionCardProps {
  icon: ComponentType<{ className?: string }>;
  name: string;
  description: string;
  state: ConnectionState;
  loading?: boolean;
  /** Overrides the pill text for the state (e.g. "Not matched"). */
  stateLabel?: string;
  /** "Connected as" value. */
  accountLabel?: string | null;
  accountLabelPrefix?: string;
  connectedAt?: string | null;
  /** Amber note under the header, e.g. "not set up by your admin". */
  notice?: ReactNode;
  onConnect?: () => void;
  connectLabel?: string;
  onDisconnect?: DisconnectHandler;
  disconnecting?: boolean;
  /** Extra lines under the account details. */
  children?: ReactNode;
  /** Not set up by an admin yet: the card shows grayed out with a "Not set up" pill and no actions. */
  disabled?: boolean;
  testId: string;
}

const iconTone: Record<ConnectionState, string> = {
  connected: "bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-400",
  "needs-reconnect": "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400",
  attention: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400",
  "not-connected": "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

const pillTone: Record<ConnectionState, string> = {
  connected: "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300",
  "needs-reconnect": "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  attention: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  "not-connected": "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

export function ConnectionCard({
  icon: Icon,
  name,
  description,
  state,
  loading = false,
  stateLabel,
  accountLabel,
  accountLabelPrefix,
  connectedAt,
  notice,
  onConnect,
  connectLabel,
  onDisconnect,
  disconnecting = false,
  children,
  disabled = false,
  testId,
}: ConnectionCardProps) {
  const { t, i18n } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const defaultLabel: Record<ConnectionState, string> = {
    connected: t("profile.integrations.statusConnected"),
    "needs-reconnect": t("profile.integrations.statusReconnectNeeded"),
    attention: t("profile.integrations.statusAttention"),
    "not-connected": t("profile.integrations.statusNotConnected"),
  };
  const PillIcon = !disabled && state === "connected" ? CheckCircle2 : disabled || state === "not-connected" ? CircleSlash : AlertCircle;
  const hasToken = !disabled && (state === "connected" || state === "needs-reconnect");
  const tone = disabled ? "not-connected" : state;

  return (
    <Card
      data-testid={testId}
      data-disabled={disabled || undefined}
      aria-disabled={disabled || undefined}
      className={cn(disabled && "border-dashed bg-gray-50/60 opacity-70 dark:bg-gray-900/40")}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={cn("rounded-lg p-2", iconTone[tone])}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">{name}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
          {loading ? (
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <span
              className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium", pillTone[tone])}
              data-testid={`${testId}-status`}
            >
              <PillIcon className="h-3.5 w-3.5" />
              {disabled ? t("profile.integrations.statusNotSetUp") : stateLabel ?? defaultLabel[state]}
            </span>
          )}
        </div>
      </CardHeader>
      {!loading && (
        <CardContent className="space-y-3">
          {accountLabel && (
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <span className="text-muted-foreground">{accountLabelPrefix ?? t("profile.integrations.connectedAs")}:</span>{" "}
              <span className="font-medium">{accountLabel}</span>
            </p>
          )}
          {hasToken && connectedAt && (
            <p className="text-xs text-muted-foreground">
              {t("profile.integrations.connectedSince", {
                date: new Date(connectedAt).toLocaleDateString(i18n.language, { year: "numeric", month: "short", day: "numeric" }),
              })}
            </p>
          )}
          {notice && (
            <div
              className={cn(
                "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
                disabled
                  ? "border-gray-200 bg-gray-100 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
              )}
              data-testid={`${testId}-notice`}
            >
              {disabled ? <Info className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
              <div>{notice}</div>
            </div>
          )}
          {children}
          {!disabled && (onConnect || (hasToken && onDisconnect)) && (
            <div className="flex flex-wrap gap-2">
              {onConnect && (
                <Button
                  size="sm"
                  variant={hasToken ? "outline" : "default"}
                  onClick={onConnect}
                  data-testid={`${testId}-connect`}
                >
                  {hasToken ? <RefreshCcw className="mr-2 h-4 w-4" /> : <Link2 className="mr-2 h-4 w-4" />}
                  {hasToken ? t("profile.integrations.reconnectButton") : connectLabel}
                </Button>
              )}
              {hasToken && onDisconnect && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmOpen(true)}
                  disabled={disconnecting}
                  className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                  data-testid={`${testId}-disconnect`}
                >
                  {disconnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
                  {t("profile.integrations.disconnectButton")}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      )}
      {onDisconnect && (
        <ConfirmationDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={t("profile.integrations.disconnectConfirmTitle", { name })}
          description={t("profile.integrations.disconnectConfirmDescription", { name })}
          confirmLabel={t("profile.integrations.disconnectButton")}
          cancelLabel={t("profile.integrations.cancelButton")}
          variant="destructive"
          onConfirm={() => void onDisconnect()}
        />
      )}
    </Card>
  );
}
