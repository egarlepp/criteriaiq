import type { ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CalendarDays, CalendarOff, CalendarX, Cloud, CloudAlert, CloudOff, Loader2 } from "lucide-react";
import { isCrmConnectionReady } from "@shared/my-connections";
import { useMyCrmConnection } from "@/hooks/use-my-crm-connection";
import { useMyOutlookConnection } from "@/hooks/use-my-outlook-connection";
import { isOutlookConnectionReady } from "@shared/outlook";
import { cn } from "@/lib/utils";
import { FOOTER_ICON_SIZE, FOOTER_ICON_STROKE, footerIconBoxClass } from "./sidebar-components";

// CRM (Salesforce or HubSpot) and Outlook status icons in the sidebar footer,
// ported from ImpactIQ's sidebar: grey when the deployment has no integration
// set up, the sidebar link color when the user can connect, green once
// connected. Icon only; the status text shows on hover. The CRM icon always
// opens Profile Settings › Integrations, where the user connects or sees why
// they can't. The Outlook icon shows the user's own calendar link once an
// admin has set up Outlook sign-in; until then it shows whether the
// deployment sends mail through Outlook.

interface OutlookStatus {
  configured: boolean;
  connected: boolean;
}

interface ConnectionIconProps {
  loading: boolean;
  configured: boolean;
  connected: boolean;
  connectedLabel: string;
  notConfiguredLabel: string;
  connectLabel?: string;
  ConnectedIcon: ComponentType<{ className?: string; size?: number; strokeWidth?: number }>;
  DisconnectedIcon: ComponentType<{ className?: string; size?: number; strokeWidth?: number }>;
  onConnectedClick?: () => void;
  onConnectClick?: () => void;
  testId: string;
}

// Same size as the footer's other icon buttons (SidebarSettingsButton etc.).
const iconBoxClass = footerIconBoxClass;
const iconProps = { size: FOOTER_ICON_SIZE, strokeWidth: FOOTER_ICON_STROKE };

function ConnectionIcon({
  loading,
  configured,
  connected,
  connectedLabel,
  notConfiguredLabel,
  connectLabel,
  ConnectedIcon,
  DisconnectedIcon,
  onConnectedClick,
  onConnectClick,
  testId,
}: ConnectionIconProps) {
  if (loading) {
    return (
      <span className={cn(iconBoxClass, "brand-sidebar-muted")} data-testid={testId}>
        <Loader2 {...iconProps} className="animate-spin" />
      </span>
    );
  }

  if (connected) {
    const connectedClass = cn(iconBoxClass, "text-green-700 dark:text-green-400");
    return onConnectedClick ? (
      <button
        type="button"
        onClick={onConnectedClick}
        className={cn(connectedClass, "transition-colors hover:bg-green-50 dark:hover:bg-green-950/40")}
        title={connectedLabel}
        aria-label={connectedLabel}
        data-testid={testId}
      >
        <ConnectedIcon {...iconProps} />
      </button>
    ) : (
      <span className={connectedClass} title={connectedLabel} aria-label={connectedLabel} role="img" data-testid={testId}>
        <ConnectedIcon {...iconProps} />
      </span>
    );
  }

  if (!configured || !connectLabel || !onConnectClick) {
    return (
      <span className={cn(iconBoxClass, "brand-sidebar-muted")} title={notConfiguredLabel} aria-label={notConfiguredLabel} role="img" data-testid={testId}>
        <DisconnectedIcon {...iconProps} />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onConnectClick}
      className={cn(iconBoxClass, "brand-sidebar-link transition-colors")}
      title={connectLabel}
      aria-label={connectLabel}
      data-testid={testId}
    >
      <DisconnectedIcon {...iconProps} />
    </button>
  );
}

export function SidebarConnections({ collapsed, onOpenIntegrations }: {
  collapsed: boolean;
  /** Opens My Settings on its Integrations tab. */
  onOpenIntegrations: () => void;
}) {
  const { t } = useTranslation();

  const { data: crm, isLoading: crmLoading } = useMyCrmConnection();
  const crmReady = isCrmConnectionReady(crm);
  const crmName = crm?.provider === "hubspot" ? t("layout.sidebar.connections.hubspot") : t("layout.sidebar.connections.salesforce");
  const crmConfigured = crm?.provider === "hubspot" ? !!crm.hubspot?.configured : !!crm?.salesforce?.configured || !!crm?.salesforce?.connected;
  const crmNeedsAttention = crm?.provider === "salesforce" ? crm.salesforce?.healthy === false : crm?.provider === "hubspot" && !!crm.hubspot?.configured;

  const { data: myOutlook, isLoading: myOutlookLoading } = useMyOutlookConnection();
  const outlookReady = isOutlookConnectionReady(myOutlook);
  const perUserOutlook = outlookReady !== null;
  const { data: outlookStatus, isLoading: outlookLoading } = useQuery<OutlookStatus>({
    queryKey: ["/api/email-configuration/outlook-status"],
    staleTime: 60000,
    enabled: !myOutlookLoading && !perUserOutlook,
  });
  const outlookNeedsAttention = perUserOutlook && !!myOutlook?.connected && myOutlook.healthy === false;

  return (
    <div className={cn("flex items-center", collapsed ? "flex-col gap-2" : "gap-1")}>
      {crmReady === null && !crmLoading ? null : <ConnectionIcon
        loading={crmLoading}
        configured={crmConfigured}
        connected={crmReady === true}
        connectedLabel={t("layout.sidebar.connections.crmConnectedAs", { crm: crmName })}
        notConfiguredLabel={t("layout.sidebar.connections.crmNotConfigured")}
        connectLabel={crmNeedsAttention
          ? t("layout.sidebar.connections.crmNeedsAttention", { crm: crmName })
          : t("layout.sidebar.connections.crmConnectTo", { crm: crmName })}
        ConnectedIcon={Cloud}
        DisconnectedIcon={crmNeedsAttention ? CloudAlert : CloudOff}
        onConnectedClick={onOpenIntegrations}
        onConnectClick={onOpenIntegrations}
        testId="sidebar-connection-crm"
      />}
      {perUserOutlook ? (
        <ConnectionIcon
          loading={false}
          configured={!!myOutlook?.available}
          connected={outlookReady === true}
          connectedLabel={t("layout.sidebar.connections.outlookCalendarConnected")}
          notConfiguredLabel={t("layout.sidebar.connections.outlookNotConfigured")}
          connectLabel={outlookNeedsAttention
            ? t("layout.sidebar.connections.outlookNeedsAttention")
            : t("layout.sidebar.connections.outlookConnect")}
          ConnectedIcon={CalendarDays}
          DisconnectedIcon={outlookNeedsAttention ? CalendarX : CalendarOff}
          onConnectedClick={onOpenIntegrations}
          onConnectClick={onOpenIntegrations}
          testId="sidebar-connection-outlook"
        />
      ) : (
        <ConnectionIcon
          loading={myOutlookLoading || outlookLoading}
          configured={outlookStatus?.configured ?? false}
          connected={outlookStatus?.connected ?? false}
          connectedLabel={t("layout.sidebar.connections.outlookConnected")}
          notConfiguredLabel={t("layout.sidebar.connections.outlookNotConfigured")}
          ConnectedIcon={CalendarDays}
          DisconnectedIcon={CalendarOff}
          testId="sidebar-connection-outlook"
        />
      )}
    </div>
  );
}
