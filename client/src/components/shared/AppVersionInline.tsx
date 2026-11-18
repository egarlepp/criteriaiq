import type { CSSProperties } from "react";

import {
  AppVersionLabel,
  UNKNOWN_VERSION_SENTINEL,
} from "@/components/shared/AppVersionFooter";

/**
 * Thin presentational wrapper around `<AppVersionLabel />` for surfaces
 * that read the build version from `/api/version` via TanStack Query
 * (About → Introduction "Recent Updates (vX)" header, Flight Deck
 * "What's New" widget). Mirrors the loading / resolved / unknown
 * resolution that `<SidebarVersionLabel />` performs for the main app
 * sidebar so all five UI surfaces (login footer, setup footer, sidebar,
 * About header, Flight Deck) share one source of truth (`version.json`
 * via `/api/version`) **and** one rendering helper for the
 * amber+italic+tooltip "missing build metadata" cue (task-380 / 383 /
 * 389).
 *
 * Returns `null` while the query is still in flight on first mount
 * with no cached payload — surfaces that splice the version into a
 * wrapping label (e.g. the parenthesised "Recent Updates (vX)") can
 * conditionally omit the surrounding chrome by checking for a real
 * version themselves before rendering.
 *
 * The helper deliberately defaults `as="span"` because every existing
 * caller (the About header and the Flight Deck "What's New" subtitle)
 * lives inside a wrapping headline / paragraph context where invalid
 * `<p>` inside `<h3>` markup would otherwise be produced. Callers that
 * need a block-level paragraph (e.g. the Flight Deck widget where the
 * version appears on its own line) can opt back into `as="p"`.
 */
export interface AppVersionInlineProps {
  version: string | null | undefined;
  isLoading: boolean;
  isError: boolean;
  neutralClassName: string;
  as?: "p" | "span";
  style?: CSSProperties;
  testId?: string;
}

export function AppVersionInline({
  version,
  isLoading,
  isError,
  neutralClassName,
  as = "span",
  style,
  testId,
}: AppVersionInlineProps) {
  const hasResolved = !isLoading || isError || Boolean(version);
  if (!hasResolved) return null;

  const resolvedVersion = version || UNKNOWN_VERSION_SENTINEL;
  return (
    <AppVersionLabel
      as={as}
      version={resolvedVersion}
      neutralClassName={neutralClassName}
      style={style}
      testId={testId}
    />
  );
}

export default AppVersionInline;
