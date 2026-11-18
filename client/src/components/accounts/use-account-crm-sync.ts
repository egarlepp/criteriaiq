// A linked account's CRM-owned fields on the account dialog: which fields
// are read-only, the before/after preview when a CRM account is picked, the
// refresh when a stale account opens (over a day since its last sync), and
// the Refresh button. The server enforces the same lock on save
// (server/lib/account-crm-link.ts lockedAccountFields).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { useCrmStatus } from "@/hooks/use-crm-status";
import type { CrmProviderId } from "@shared/crm-provider";

export type CrmManagedField = "accountName" | "industryId" | "region" | "website" | "accountRepresentativeId";

export interface CrmAccountValues {
  accountName?: string;
  industryId?: number;
  region?: string;
  website?: string;
  accountRepresentativeId?: string;
}

export interface CrmFieldChange {
  field: CrmManagedField;
  from: string | number | null;
  to: string | number | null;
}

export interface CrmLinkPreview {
  crmProvider: string;
  crmAccountId: string;
  name: string;
  values: CrmAccountValues;
  managed: CrmManagedField[];
  changes: CrmFieldChange[];
  existingAccount: { id: number; accountName: string } | null;
}

/** The CRM columns of a saved account, as GET /api/customers returns them to internal users. */
export interface LinkedAccountState {
  id: number;
  salesforceAccountUrl: string | null;
  crmProvider: string | null;
  crmAccountId: string | null;
  crmSyncedAt: string | null;
  crmManagedFields: string[] | null;
  crmRecordMissingAt: string | null;
  website: string | null;
}

const PREVIEW_DEBOUNCE_MS = 400;
const STALE_HOURS = 24;

function stateOf(customer: Record<string, unknown> | null | undefined): LinkedAccountState | null {
  if (!customer || typeof customer.id !== "number") return null;
  const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
  return {
    id: customer.id,
    salesforceAccountUrl: str(customer.salesforceAccountUrl),
    crmProvider: str(customer.crmProvider),
    crmAccountId: str(customer.crmAccountId),
    crmSyncedAt: str(customer.crmSyncedAt),
    crmManagedFields: Array.isArray(customer.crmManagedFields) ? (customer.crmManagedFields as string[]) : null,
    crmRecordMissingAt: str(customer.crmRecordMissingAt),
    website: str(customer.website),
  };
}

interface Options {
  /** The saved account being edited; null on create. */
  editingCustomer: Record<string, unknown> | null;
  installCrm: CrmProviderId;
  /** The CRM link URL in the form now. */
  url: string;
  /** Copies CRM values into the form (after a preview or a refresh). */
  onApply: (values: CrmAccountValues) => void;
}

export function useAccountCrmSync({ editingCustomer, installCrm, url, onApply }: Options) {
  const queryClient = useQueryClient();
  const { connected } = useCrmStatus();
  const [saved, setSaved] = useState<LinkedAccountState | null>(() => stateOf(editingCustomer));
  const [preview, setPreview] = useState<CrmLinkPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const applyRef = useRef(onApply);
  applyRef.current = onApply;

  useEffect(() => {
    setSaved(stateOf(editingCustomer));
    setPreview(null);
  }, [editingCustomer]);

  const trimmed = url.trim();
  const savedLinked = !!saved?.crmAccountId && saved.crmProvider === installCrm && !!saved.salesforceAccountUrl;
  /** The form still holds the saved link, so the saved lock applies. */
  const linkUnchanged = savedLinked && trimmed === (saved?.salesforceAccountUrl ?? "").trim();

  const lockedFields = useMemo<Set<CrmManagedField>>(() => {
    if (installCrm === "none" || !trimmed) return new Set();
    if (linkUnchanged) {
      return new Set(["accountName", ...((saved?.crmManagedFields ?? []) as CrmManagedField[])]);
    }
    if (preview) return new Set(["accountName", ...preview.managed]);
    return new Set();
  }, [installCrm, trimmed, linkUnchanged, saved, preview]);

  // A newly picked or pasted link: show what the CRM would change and fill
  // the form with it. The save pulls the same values on the server.
  useEffect(() => {
    if (installCrm === "none" || !connected || !trimmed || linkUnchanged) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      setPreviewing(true);
      try {
        const result: CrmLinkPreview = await apiRequest("POST", "/api/customers/crm-link-preview", {
          url: trimmed,
          ...(saved ? { customerId: saved.id } : {}),
        });
        if (cancelled) return;
        setPreview(result);
        applyRef.current(result.values);
      } catch {
        // A link the CRM doesn't know is caught on save; no preview meanwhile.
        if (!cancelled) setPreview(null);
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [installCrm, connected, trimmed, linkUnchanged, saved?.id]);

  const runRefresh = useCallback(
    async (ifOlderThanHours?: number): Promise<boolean> => {
      if (!saved) return false;
      const body: { status: string; customer: Record<string, unknown> } = await apiRequest(
        "POST",
        `/api/customers/${saved.id}/crm-refresh`,
        ifOlderThanHours ? { ifOlderThanHours } : {},
      );
      const next = stateOf(body.customer);
      if (next) setSaved(next);
      if (body.status === "refreshed") {
        // Only the fields the CRM owns, so edits in progress elsewhere stay.
        const c = body.customer;
        const managed = new Set(["accountName", ...(next?.crmManagedFields ?? [])]);
        const pick = <T,>(field: CrmManagedField, value: T | undefined) => (managed.has(field) ? value : undefined);
        applyRef.current({
          accountName: pick("accountName", typeof c.accountName === "string" ? c.accountName : undefined),
          industryId: pick("industryId", typeof c.industryId === "number" ? c.industryId : undefined),
          region: pick("region", typeof c.region === "string" ? c.region : undefined),
          accountRepresentativeId: pick(
            "accountRepresentativeId",
            typeof c.accountRepresentativeId === "string" ? c.accountRepresentativeId : undefined,
          ),
        });
        void queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      }
      return body.status === "refreshed";
    },
    [saved, queryClient],
  );

  // Opening a linked account that hasn't synced for a day refreshes it quietly.
  const openedFor = useRef<number | null>(null);
  useEffect(() => {
    if (!savedLinked || !connected || !saved || openedFor.current === saved.id) return;
    openedFor.current = saved.id;
    void runRefresh(STALE_HOURS).catch(() => undefined);
  }, [savedLinked, connected, saved, runRefresh]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await runRefresh();
      showSuccessToast("accounts.createCustomer.crm.sync.refreshed");
    } catch {
      showErrorToast("accounts.createCustomer.crm.sync.refreshFailedTitle", "accounts.createCustomer.crm.sync.refreshFailed");
    } finally {
      setRefreshing(false);
    }
  }, [runRefresh]);

  return {
    connected,
    saved,
    savedLinked,
    linkUnchanged,
    lockedFields,
    preview,
    previewing,
    refreshing,
    refresh,
  };
}
