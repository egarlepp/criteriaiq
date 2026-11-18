import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRelativeUpdatedAt } from "./freshness";

interface HealthFreshnessIndicatorProps {
  // Wall-clock millis when the underlying TanStack Query query last
  // received fresh data (`useQuery({...}).dataUpdatedAt`). Using the
  // client-side value rather than the server's `lastChecked` keeps the
  // label tracking the dashboard's own freshness — if the network
  // stalls and the next poll never lands, the counter keeps climbing
  // and operators see the staleness instead of a label pinned to
  // whatever the last successful response said.
  dataUpdatedAt: number;
  // True while a fetch (initial or background poll or manual click) is
  // in flight. Drives the spinner and disables the button so impatient
  // operators can't queue a flood of duplicate fetches.
  isFetching: boolean;
  // Fired when the operator clicks the manual "Refresh now" button.
  // Tabs wire this to their query's `refetch`.
  onRefresh: () => void;
  // Stable per-tab prefix (`database-health`, `email-health`, etc.) so
  // each tab's component test can target its own indicator without
  // colliding with sibling tabs that may also be mounted (the System
  // Health overview keeps a separate `system-health-*` namespace).
  testIdPrefix: string;
  // Optional ISO timestamp from the server's `lastChecked` field. When
  // supplied we surface its locale-formatted form as a hover/title
  // tooltip on the relative label so the absolute time is still
  // available for audit/debug without taking a second header line
  // (Task #442 — drops the redundant per-tab "Last checked: …" row
  // now that the relative indicator covers the at-a-glance case).
  lastCheckedIso?: string;
}

// Live "updated Xs ago" / spinner / "Refresh now" affordance shared by
// every System Health category tab (Task #425). Mirrors the overview
// header's freshness indicator (Task #418) so an operator drilling
// into a sub-tab during an incident sees the same signal — whether
// the panel is live, frozen, or about to refresh — without having to
// jump back to the overview to check.
//
// Ticks once per second on a per-instance interval. The interval is
// only mounted while the indicator is rendered (each tab unmounts
// when the operator switches sub-tabs), so we don't pay for ticks on
// tabs the operator isn't looking at.
export function HealthFreshnessIndicator({
  dataUpdatedAt,
  isFetching,
  onRefresh,
  testIdPrefix,
  lastCheckedIso,
}: HealthFreshnessIndicatorProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Format the absolute timestamp once per render. We swallow parse
  // failures (the server has historically always returned a valid
  // ISO string, but defensively dropping the tooltip is preferable
  // to crashing the header if a future payload regresses).
  let absoluteTitle: string | undefined;
  if (lastCheckedIso) {
    const parsed = new Date(lastCheckedIso);
    if (!Number.isNaN(parsed.getTime())) {
      absoluteTitle = `Last checked: ${parsed.toLocaleString()}`;
    }
  }

  return (
    <span className="flex items-center gap-2 text-xs text-muted-foreground">
      <span
        data-testid={`${testIdPrefix}-updated-ago`}
        aria-live="polite"
        title={absoluteTitle}
      >
        {formatRelativeUpdatedAt(dataUpdatedAt, nowMs)}
      </span>
      {isFetching && (
        <Loader2
          data-testid={`${testIdPrefix}-refreshing-spinner`}
          className="h-3.5 w-3.5 animate-spin"
          aria-label="Refreshing"
        />
      )}
      <Button
        variant="outline"
        size="sm"
        data-testid={`${testIdPrefix}-refresh-now`}
        onClick={onRefresh}
        disabled={isFetching}
      >
        <RefreshCw className="h-3.5 w-3.5 mr-1" />
        Refresh now
      </Button>
    </span>
  );
}
