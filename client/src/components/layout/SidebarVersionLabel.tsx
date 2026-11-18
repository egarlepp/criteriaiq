import {
  AppVersionLabel,
  UNKNOWN_VERSION_SENTINEL,
} from "@/components/shared/AppVersionFooter";

/**
 * Renders the version shown under the CriteriaIQ logo at the top of the
 * main app sidebar (wrapped in a link by `<SidebarVersionLink />`).
 *
 * Resolves the version returned by `/api/version` into one of three
 * visible states:
 *
 *   1. **Real version** (e.g. `"v2.1.4"`): rendered through
 *      `<AppVersionLabel />` with the sidebar's neutral grey treatment
 *      and no tooltip — unchanged from the pre-task-383 visual.
 *   2. **`"unknown"` sentinel**: either returned verbatim by the server
 *      (when `version.json` is missing — see
 *      `server/lib/version-info.ts`) **or** synthesized client-side
 *      when the `/api/version` query has settled without a usable
 *      payload (network error, non-2xx, or missing `version` field).
 *      Rendered through `<AppVersionLabel />` so it picks up the
 *      shared amber+italic+tooltip cue from task-380.
 *   3. **Loading**: while the query is still in flight on first mount
 *      and there is no cached payload yet, render an empty placeholder
 *      so the sidebar row layout (theme toggle + sign-out button) does
 *      not flicker.
 *
 * Importantly, the legacy hardcoded `"v0.7.10"` literal that used to
 * be rendered as a fallback is gone — operators of self-hosted installs
 * will now see the `"unknown"` cue instead of a string masquerading as
 * a real build (task-383).
 */
export interface SidebarVersionLabelProps {
  version: string | null | undefined;
  isLoading: boolean;
  isError: boolean;
  /** "span" when the label sits inside a button (the version link). */
  as?: "p" | "span";
}

export function SidebarVersionLabel({
  version,
  isLoading,
  isError,
  as = "p",
}: SidebarVersionLabelProps) {
  const hasResolved = !isLoading || isError || Boolean(version);
  const resolvedVersion = version || UNKNOWN_VERSION_SENTINEL;

  if (!hasResolved) {
    const Tag = as;
    return (
      <Tag
        className="text-xs text-gray-400 select-none"
        style={{ fontSize: "10px" }}
        data-testid="sidebar-version-label"
        data-version-state="loading"
      />
    );
  }

  return (
    <AppVersionLabel
      as={as}
      version={resolvedVersion}
      neutralClassName="text-xs text-gray-400"
      style={{ fontSize: "10px" }}
      testId="sidebar-version-label"
    />
  );
}

export default SidebarVersionLabel;
