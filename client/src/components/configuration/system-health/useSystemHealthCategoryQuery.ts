import { useQuery, type UseQueryOptions, type UseQueryResult } from "@tanstack/react-query";

// Auto-refresh contract for the System Health overview and every
// per-category sub-tab (Tasks #411 / #417 / #421).
//
// Task #411 wired periodic polling into the headline overview so an
// admin parked on the page would see status flips without reloading.
// Task #417 propagated the same explicit settings onto each per-tab
// `useQuery` so a future global TanStack Query default change couldn't
// silently start polling tabs the operator parked in the background.
// Task #421 extracts those repeated lines into this single helper so a
// new sub-tab inherits the contract by default — a contributor adding
// a tenth tab can't quietly forget any of the three settings.
//
// - `refetchIntervalInBackground: false` pins the "pause while the
//   tab is hidden" behaviour. It's also the TanStack Query default
//   today, but pinning it here protects against future default
//   changes and against accidental drift between siblings.
// - `refetchOnWindowFocus: true` triggers an immediate refetch when
//   the operator brings the tab back into focus, so the resumed view
//   doesn't have to wait for the next polling tick to redraw.
// - `refetchInterval` is supplied per call site because different
//   categories pay different costs to compute (e.g. archive
//   validation is much heavier than background-services counters).
//   It accepts `false` as well as a number so the overview header
//   can fully pause auto-refresh (Task #443) when an operator picks
//   the "Off" cadence — TanStack Query treats `false` here as
//   "disable polling entirely" while still honouring manual
//   `refetch()` calls and the focus refetch above.
export const SYSTEM_HEALTH_AUTO_REFRESH_DEFAULTS = {
  refetchIntervalInBackground: false as const,
  refetchOnWindowFocus: true as const,
} as const;

// Thin wrapper around `useQuery` that bakes in the System Health
// auto-refresh contract. Callers must supply `refetchInterval`
// (the contract's third pillar) along with the usual `queryKey` /
// `queryFn`; the other two settings are applied last so a caller
// can't accidentally drift them.
export function useSystemHealthCategoryQuery<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
>(
  options: UseQueryOptions<TQueryFnData, TError, TData> & {
    refetchInterval: number | false;
  },
): UseQueryResult<TData, TError> {
  return useQuery<TQueryFnData, TError, TData>({
    ...options,
    refetchIntervalInBackground:
      SYSTEM_HEALTH_AUTO_REFRESH_DEFAULTS.refetchIntervalInBackground,
    refetchOnWindowFocus:
      SYSTEM_HEALTH_AUTO_REFRESH_DEFAULTS.refetchOnWindowFocus,
  });
}
