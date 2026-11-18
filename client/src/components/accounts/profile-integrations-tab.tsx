import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CalendarDays, Cloud, DatabaseZap, Info, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { useValidationRecordLabel } from "@/hooks/use-validation-record-label";
import { MY_CRM_CONNECTION_KEY, useMyCrmConnection } from "@/hooks/use-my-crm-connection";
import { CRM_STATUS_KEY } from "@/hooks/use-crm-status";
import { MY_OUTLOOK_CONNECTION_KEY, useMyOutlookConnection } from "@/hooks/use-my-outlook-connection";
import type { MyOutlookConnection } from "@shared/outlook";
import type { MySalesforceConnection, MyHubspotConnection } from "@shared/my-connections";
import { ConnectionCard, type ConnectionState } from "./connection-card";

// Profile Settings › Integrations: the user's own connections, as in
// ImpactIQ's My Settings › Connections. Every connection always has a card,
// grayed out until an admin sets it up. One install has one CRM: once it's
// chosen only that CRM's card shows; before then both show grayed out.

function salesforceState(sf: MySalesforceConnection): ConnectionState {
  if (!sf.connected) return "not-connected";
  return sf.healthy === false ? "needs-reconnect" : "connected";
}

const NOT_SET_UP_SALESFORCE: MySalesforceConnection = { configured: false, connected: false, healthy: null, accountLabel: null, connectedAt: null };
const NOT_SET_UP_HUBSPOT: MyHubspotConnection = { configured: false, portalName: null, owner: null };

function SalesforceCard({ sf, loading, noCrmChosen = false }: { sf: MySalesforceConnection; loading: boolean; noCrmChosen?: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const recordName = useValidationRecordLabel();
  const state = salesforceState(sf);
  // Nothing to connect to and no link to remove.
  const disabled = noCrmChosen || (!sf.configured && !sf.connected);

  const disconnect = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/salesforce/disconnect"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MY_CRM_CONNECTION_KEY });
      queryClient.invalidateQueries({ queryKey: CRM_STATUS_KEY });
      showSuccessToast(t("profile.integrations.disconnectedTitle"), t("profile.integrations.disconnectedDescription"));
    },
    onError: () => {
      showErrorToast(t("profile.integrations.errorTitle"), t("profile.integrations.disconnectFailed"));
    },
  });

  return (
    <ConnectionCard
      icon={Cloud}
      name={t("profile.integrations.salesforceTitle")}
      description={t("profile.integrations.salesforceDescription", { record: recordName })}
      state={state}
      loading={loading}
      accountLabel={sf.connected ? sf.accountLabel : null}
      connectedAt={sf.connectedAt}
      disabled={disabled}
      notice={
        noCrmChosen
          ? t("profile.integrations.noCrmChosen")
          : !sf.configured && !sf.connected
          ? t("profile.integrations.notConfiguredDescription")
          : state === "needs-reconnect"
            ? t("profile.integrations.tokenBroken")
            : undefined
      }
      onConnect={sf.configured ? () => { window.location.href = "/api/auth/salesforce/connect"; } : undefined}
      connectLabel={t("profile.integrations.connectButton")}
      onDisconnect={() => disconnect.mutateAsync().then(() => undefined, () => undefined)}
      disconnecting={disconnect.isPending}
      testId="integration-salesforce"
    >
      {state === "not-connected" && sf.configured && (
        <p className="text-sm text-muted-foreground">{t("profile.integrations.connectIntro")}</p>
      )}
    </ConnectionCard>
  );
}

function HubspotCard({ hs, loading, noCrmChosen = false }: { hs: MyHubspotConnection; loading: boolean; noCrmChosen?: boolean }) {
  const { t } = useTranslation();
  const matched = hs.configured && !!hs.owner;
  const state: ConnectionState = matched ? "connected" : hs.configured ? "attention" : "not-connected";
  const ownerLabel = hs.owner
    ? hs.owner.name && hs.owner.email
      ? `${hs.owner.name} (${hs.owner.email})`
      : hs.owner.name ?? hs.owner.email ?? hs.owner.id
    : null;

  return (
    <ConnectionCard
      icon={Cloud}
      name={t("profile.integrations.hubspotTitle")}
      description={t("profile.integrations.hubspotDescription")}
      state={state}
      loading={loading}
      stateLabel={state === "attention" ? t("profile.integrations.hubspotNotMatched") : undefined}
      disabled={noCrmChosen || !hs.configured}
      accountLabel={ownerLabel}
      accountLabelPrefix={t("profile.integrations.hubspotMatchedAs")}
      notice={
        noCrmChosen
          ? t("profile.integrations.noCrmChosen")
          : !hs.configured
          ? t("profile.integrations.hubspotNotConfigured")
          : !hs.owner
            ? t("profile.integrations.hubspotNoOwner")
            : undefined
      }
      testId="integration-hubspot"
    >
      {hs.configured && hs.portalName && (
        <p className="text-xs text-muted-foreground">{t("profile.integrations.hubspotPortal", { portal: hs.portalName })}</p>
      )}
    </ConnectionCard>
  );
}

function outlookState(me: MyOutlookConnection): ConnectionState {
  if (!me.connected) return "not-connected";
  return me.healthy === false ? "needs-reconnect" : "connected";
}

function OutlookCard({ me, loading }: { me: MyOutlookConnection; loading: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const state = outlookState(me);

  const disconnect = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/microsoft/disconnect"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MY_OUTLOOK_CONNECTION_KEY });
      showSuccessToast(t("profile.integrations.disconnectedTitle"), t("profile.integrations.outlookDisconnectedDescription"));
    },
    onError: () => {
      showErrorToast(t("profile.integrations.errorTitle"), t("profile.integrations.disconnectFailed"));
    },
  });

  return (
    <ConnectionCard
      icon={CalendarDays}
      name={t("profile.integrations.outlookTitle")}
      description={t("profile.integrations.outlookDescription")}
      state={state}
      loading={loading}
      accountLabel={me.connected ? me.accountLabel : null}
      connectedAt={me.connectedAt}
      disabled={!me.available && !me.connected}
      notice={
        !me.available && !me.connected
          ? t("profile.integrations.outlookNotSetUp")
          : !me.available
          ? t("profile.integrations.outlookTurnedOff")
          : state === "needs-reconnect"
            ? t("profile.integrations.outlookTokenBroken")
            : undefined
      }
      onConnect={me.available ? () => { window.location.href = "/api/auth/microsoft/connect"; } : undefined}
      connectLabel={t("profile.integrations.outlookConnectButton")}
      onDisconnect={() => disconnect.mutateAsync().then(() => undefined, () => undefined)}
      disconnecting={disconnect.isPending}
      testId="integration-outlook"
    >
      {state === "not-connected" && me.available && (
        <p className="text-sm text-muted-foreground">{t("profile.integrations.outlookConnectIntro")}</p>
      )}
    </ConnectionCard>
  );
}

function InfoLine({ text, testId }: { text: string; testId: string }) {
  return (
    <div
      className="flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300"
      data-testid={testId}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <span>{text}</span>
    </div>
  );
}

export function ProfileIntegrationsTab() {
  const { t } = useTranslation();
  const { data: me, isLoading } = useMyCrmConnection();
  const { data: outlook, isLoading: outlookLoading } = useMyOutlookConnection();
  const external = !!me?.external || !!outlook?.external;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 flex items-center gap-2 text-lg font-semibold">
          <DatabaseZap className="h-5 w-5" />
          {t("profile.integrations.heading")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("profile.integrations.description")}</p>
      </div>

      {isLoading || !me ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label={t("profile.integrations.loading")} />
      ) : external ? (
        <InfoLine text={t("profile.integrations.externalNoCrm")} testId="integration-external" />
      ) : me.provider === "salesforce" ? (
        <SalesforceCard sf={me.salesforce ?? NOT_SET_UP_SALESFORCE} loading={isLoading} />
      ) : me.provider === "hubspot" ? (
        <HubspotCard hs={me.hubspot ?? NOT_SET_UP_HUBSPOT} loading={isLoading} />
      ) : (
        <>
          <SalesforceCard sf={NOT_SET_UP_SALESFORCE} loading={false} noCrmChosen />
          <HubspotCard hs={NOT_SET_UP_HUBSPOT} loading={false} noCrmChosen />
        </>
      )}

      {!external && outlook && <OutlookCard me={outlook} loading={outlookLoading} />}
    </div>
  );
}
