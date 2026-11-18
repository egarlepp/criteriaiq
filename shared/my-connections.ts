// What GET /api/crm/me answers: the signed-in user's own CRM connection, for
// Profile Settings › Integrations and the sidebar footer icon. Ported from
// ImpactIQ's My Settings › Connections. One install has one CRM, so only the
// chosen CRM's block is filled in.
import type { CrmProviderId } from "./crm-provider";

export interface MySalesforceConnection {
  /** The admin has saved Salesforce OAuth credentials. */
  configured: boolean;
  /** A token is on file for this user. */
  connected: boolean;
  /**
   * Whether Salesforce accepted the stored token on the last check (cached
   * for a few minutes). false = revoked or expired, so the user must
   * reconnect. null = not connected, or the check couldn't tell (network
   * error), which is never shown as broken.
   */
  healthy: boolean | null;
  /** Salesforce username the token belongs to, when the check could read it. */
  accountLabel: string | null;
  connectedAt: string | null;
}

export interface MyHubspotConnection {
  /** The admin has saved the portal's HubSpot key. */
  configured: boolean;
  portalName: string | null;
  /** The active HubSpot owner matched to this user by email, if any. */
  owner: { id: string; name: string | null; email: string | null } | null;
}

export interface MyCrmConnection {
  provider: CrmProviderId;
  /** Customer, Guest and Partner users never use the CRM; screens show no card. */
  external: boolean;
  salesforce: MySalesforceConnection | null;
  hubspot: MyHubspotConnection | null;
}

/** True when the user has a working link to the install's CRM. null = no CRM applies to them. */
export function isCrmConnectionReady(me: MyCrmConnection | undefined | null): boolean | null {
  if (!me || me.external || me.provider === "none") return null;
  if (me.provider === "salesforce") {
    const sf = me.salesforce;
    return !!sf?.connected && sf.healthy !== false;
  }
  if (me.provider === "hubspot") return !!me.hubspot?.configured && !!me.hubspot.owner;
  return null;
}
