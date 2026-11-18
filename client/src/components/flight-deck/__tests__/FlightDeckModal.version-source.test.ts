// Source-level regression guard for task-389. The Flight Deck modal's
// "What's New!" widget used to display the build version from a
// hardcoded `CURRENT_VERSION = "v0.7.10"` constant imported from
// `@/components/about/RecentUpdatesContent`, which silently drifted
// from the value served by `/api/version` (driven by `version.json`)
// every time the build was bumped. Task-389 unifies the read path:
// the widget must now render through the shared `<AppVersionInline />`
// helper fed from `/api/version`, so editing `version.json` (or
// running `./update-version.sh <version>`) is the single edit point.
//
// In the same spirit as the existing `SidebarVersionLabel` /
// `AppVersionFooter` "never falls back to 'v0.7.10'" runtime tests,
// this guard fails fast if a future edit re-introduces a hardcoded
// version literal or re-imports the now-removed `CURRENT_VERSION`
// constant. It is deliberately a source-level grep rather than a
// component test because the "regression" we care about is the
// presence of the literal in source, not just its rendered output.
import { readFileSync } from "fs";
import path from "path";

import { describe, expect, it } from "vitest";

const FLIGHT_DECK_MODAL_PATH = path.resolve(
  __dirname,
  "..",
  "FlightDeckModal.tsx",
);

describe("FlightDeckModal — single source of truth (task-389)", () => {
  const source = readFileSync(FLIGHT_DECK_MODAL_PATH, "utf8");

  it("does not contain a hardcoded version literal in the form 'v0.7.10'", () => {
    // Catches a future edit that pastes the raw version literal back
    // into the "What's New!" widget (the original drift mode that
    // motivated task-389). The widget must instead resolve the
    // version through `/api/version` via `<AppVersionInline />`.
    expect(source).not.toMatch(/['"`]v0\.7\.10['"`]/);
  });

  it("does not contain a hardcoded vX.Y.Z(N) version literal of any kind in the source", () => {
    // Generalises the guard above so a bump to v0.7.11 / v0.8.0 still
    // catches re-introduction of a hardcoded literal. We deliberately
    // match the `v<digits>.<digits>.<digits>` shape used by every
    // historical CriteriaIQ version (see `version.json` /
    // `docs/guides/version-update-guide.md`).
    expect(source).not.toMatch(/['"`]v\d+\.\d+\.\d+['"`]/);
  });

  it("does not import the removed CURRENT_VERSION constant", () => {
    // The constant was deleted from RecentUpdatesContent.tsx in
    // task-389. Re-introducing the import would mean someone has
    // re-exported a hardcoded literal somewhere — fail fast.
    expect(source).not.toMatch(/CURRENT_VERSION/);
  });

  it("uses the shared AppVersionInline helper fed from /api/version", () => {
    // Positive assertion: the "What's New!" widget must be wired
    // through the shared helper so the amber+italic+tooltip "missing
    // build metadata" cue lands here too whenever `/api/version`
    // returns the `"unknown"` sentinel.
    expect(source).toMatch(/AppVersionInline/);
    expect(source).toMatch(/queryKey:\s*\[['"]\/api\/version['"]\]/);
  });
});
