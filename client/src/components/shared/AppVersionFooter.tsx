import { useEffect, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";

/**
 * Tiny bottom-left version footer used on both the login (landing) and
 * setup screens. Renders nothing while the version query is loading or
 * if `/api/version` fails — matching the original landing-page behaviour
 * where operators never see a stale or empty placeholder string.
 *
 * Uses raw `fetch` + `useState` rather than React Query so it can mount
 * outside a `QueryClientProvider` (the Setup wizard test harness renders
 * `<Setup />` directly without one).
 *
 * When `/api/version` returns the literal `"unknown"` sentinel (server
 * could not read `version.json` and no `VITE_APP_VERSION` was set), the
 * footer renders in an amber tint with a `title` tooltip explaining the
 * missing build metadata, instead of looking visually identical to a
 * real version line. See task-380.
 */
export const UNKNOWN_VERSION_SENTINEL = "unknown";
export const UNKNOWN_VERSION_TOOLTIP =
  "Build version not detected — version.json may be missing from the runtime image";

/**
 * Shared styling helper for any UI surface that displays the build
 * version returned by `/api/version`. Encapsulates the "amber + italic
 * + explanatory tooltip" cue introduced for the `"unknown"` sentinel
 * (see task-380) so the missing-metadata signal looks identical
 * everywhere it appears (login footer, setup footer, sidebar — see
 * task-383).
 *
 * Callers supply the neutral classes used when the version is real
 * (e.g. `"text-gray-400"` for the footer, `"text-xs text-gray-400"`
 * for the sidebar). When the version is the `"unknown"` sentinel the
 * neutral classes are deliberately swapped for the amber/italic/cursor
 * cue so a stale neutral colour can never bleed through.
 */
export interface AppVersionLabelProps {
  version: string;
  neutralClassName: string;
  style?: CSSProperties;
  testId?: string;
  /**
   * HTML element to render the label as. Defaults to `"p"` (preserves
   * the original block-level footer/sidebar usage). Pass `"span"` when
   * splicing the label into a wrapping inline context such as a
   * `CardTitle` heading — the About → Introduction "Recent Updates
   * (vX)" header uses this so it can sit inside the heading without
   * producing invalid `<p>` inside `<h3>` markup.
   */
  as?: "p" | "span";
}

export function AppVersionLabel({
  version,
  neutralClassName,
  style,
  testId,
  as = "p",
}: AppVersionLabelProps) {
  const { t } = useTranslation();
  const isUnknown = version === UNKNOWN_VERSION_SENTINEL;
  const className = isUnknown
    ? "text-amber-600 dark:text-amber-400 italic select-none cursor-help"
    : `${neutralClassName} select-none`;

  const Tag = as;
  return (
    <Tag
      className={className}
      style={style}
      data-testid={testId}
      data-version-unknown={isUnknown ? "true" : "false"}
      title={isUnknown ? t("shared.appVersion.unknownTooltip") : undefined}
    >
      {version}
    </Tag>
  );
}

export function AppVersionFooter() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/version")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { version?: string }) => {
        if (cancelled) return;
        if (data?.version) setVersion(data.version);
      })
      .catch(() => {
        // Silent: matches the original landing-page behaviour where a
        // failed /api/version fetch left the footer hidden rather than
        // rendering a placeholder.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!version) return null;

  const isUnknown = version === UNKNOWN_VERSION_SENTINEL;

  return (
    <div
      className="fixed bottom-4 left-4 z-10"
      data-testid="app-version-footer"
      data-version-unknown={isUnknown ? "true" : "false"}
    >
      <AppVersionLabel
        version={version}
        neutralClassName="text-gray-400"
        style={{ fontSize: "7px" }}
        testId="app-version-footer-text"
      />
    </div>
  );
}

export default AppVersionFooter;
