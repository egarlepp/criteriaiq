// Source-level regression guard for task-389. The About → Introduction
// "Recent Updates (vX)" header used to read its version from a
// hardcoded `CURRENT_VERSION = "v0.7.10"` constant exported from
// `RecentUpdatesContent.tsx`, which silently drifted from the value
// served by `/api/version` (driven by `version.json`) every time the
// build was bumped. Task-389 unifies the read path: the About header
// must now render through the shared `<AppVersionInline />` helper
// fed from `/api/version`, so editing `version.json` (or running
// `./update-version.sh <version>`) is the single edit point.
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

const INTRODUCTION_TAB_PATH = path.resolve(
  __dirname,
  "..",
  "IntroductionTab.tsx",
);

const RECENT_UPDATES_CONTENT_PATH = path.resolve(
  __dirname,
  "..",
  "RecentUpdatesContent.tsx",
);

describe("IntroductionTab — single source of truth (task-389)", () => {
  const introSource = readFileSync(INTRODUCTION_TAB_PATH, "utf8");

  it("does not contain a hardcoded version literal in the form 'v0.7.10'", () => {
    // Catches a future edit that pastes the raw version literal back
    // into the CardTitle (the original drift mode that motivated
    // task-389). The header must instead resolve the version through
    // `/api/version` via `<AppVersionInline />`.
    expect(introSource).not.toMatch(/['"`]v0\.7\.10['"`]/);
  });

  it("does not contain a hardcoded vX.Y.Z(N) version literal of any kind in the source", () => {
    // Generalises the guard above so a bump to v0.7.11 / v0.8.0 still
    // catches re-introduction of a hardcoded literal. We deliberately
    // match the `v<digits>.<digits>.<digits>` shape used by every
    // historical CriteriaIQ version (see `version.json` /
    // `docs/guides/version-update-guide.md`).
    expect(introSource).not.toMatch(/['"`]v\d+\.\d+\.\d+['"`]/);
  });

  it("does not import the removed CURRENT_VERSION constant", () => {
    // The constant was deleted from RecentUpdatesContent.tsx in
    // task-389. Re-introducing the import would mean someone has
    // re-exported a hardcoded literal somewhere — fail fast.
    expect(introSource).not.toMatch(/CURRENT_VERSION/);
  });

  it("uses the shared AppVersionInline helper for the Recent Updates header", () => {
    // Positive assertion: the header must be wired through the shared
    // helper so the amber+italic+tooltip "missing build metadata" cue
    // lands here too whenever `/api/version` returns the `"unknown"`
    // sentinel.
    expect(introSource).toMatch(/AppVersionInline/);
    expect(introSource).toMatch(/queryKey:\s*\[['"]\/api\/version['"]\]/);
  });
});

describe("RecentUpdatesContent — CURRENT_VERSION export removed (task-389)", () => {
  const recentUpdatesSource = readFileSync(
    RECENT_UPDATES_CONTENT_PATH,
    "utf8",
  );

  it("no longer exports a CURRENT_VERSION constant that other files could import", () => {
    // Re-introducing the export would re-open the drift surface that
    // task-389 closed: the constant lived next to the changelog body
    // and was easy to forget to bump alongside `version.json`.
    expect(recentUpdatesSource).not.toMatch(
      /export\s+const\s+CURRENT_VERSION\b/,
    );
  });

  it("does not contain a hardcoded vX.Y.Z literal in the changelog body", () => {
    // The changelog copy itself is plain prose (e.g. "Tiptap v3"); a
    // raw `v0.7.10`-shaped literal would mean somebody has wired the
    // changelog body to the build version, which is exactly the drift
    // mode task-389 closed.
    expect(recentUpdatesSource).not.toMatch(/['"`]v\d+\.\d+\.\d+['"`]/);
  });
});
