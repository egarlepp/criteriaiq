// @vitest-environment happy-dom
//
// Component coverage for the read-only health-check landing introduced
// in task-378. The view replaces the unconditional "wizard at step 1"
// landing whenever /api/setup/status reports a non-null
// `setupCompletedAt`. We assert:
//
//   - The wizard is rendered when `setupCompletedAt` is null (status
//     marker absent → fresh install path is unchanged).
//   - The health-check view is rendered when `setupCompletedAt` is set
//     and pass/fail rows reflect the mocked /api/health and
//     /api/setup/status responses.
//   - The "Reconfigure…" button shows an AlertDialog confirmation; only
//     after confirming does the wizard mount.
//   - When `?reentry=1` is on the URL the explanation banner appears
//     and the failing check row is marked as expanded.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import Setup from "../setup";
import i18n from "@/i18n";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
let originalFetch: typeof globalThis.fetch | undefined;

interface MigrationFailureFixture {
  filename: string;
  sqlState?: string | null;
  error: string;
  failedAt: string;
}

interface StatusOverride {
  setupCompletedAt: string | null;
  // Mirrors the subset of /api/setup/status fields the health-check view
  // relies on. Defaults below paint a fully-green system unless a test
  // overrides one of them.
  setupRequired?: boolean;
  adminExists?: boolean;
  hasSessionSecret?: boolean;
  hasEncryptionKey?: boolean;
  publicAppUrl?: string;
  // Origin of the publicAppUrl in the running process — `'default'` is
  // the fallback-localhost state that drives the new "Restart required"
  // callout and the "Public URL not yet loaded" wording (Task #582).
  // Optional: tests that don't set it default to undefined (omitted),
  // matching the legacy "older server didn't ship the field" behavior
  // the client tolerates.
  publicAppUrlSource?: "env" | "file" | "default";
  // The remaining three wizard-managed source fields the bootstrap
  // snapshot ships. Per Task #582 §19 the Restart Required callout
  // ORs these with publicAppUrlSource so a stale databaseUrlSource
  // ('wizard' = file has it but env doesn't) also triggers the
  // banner. Optional: an undefined value normalizes to `null` on the
  // client and never trips the callout.
  databaseUrlSource?: "env" | "wizard" | "none";
  sessionSecretSource?: "env" | "file" | "none";
  encryptionKeySource?: "env" | "file" | "none";
  lastMigrationFailure?: MigrationFailureFixture | null;
  // /api/setup/migrations-summary fixture (Task #399). Defaults to a
  // healthy "all applied, latest a few minutes ago" shape so tests
  // that don't care about the migrations row stay green.
  migrationsSummary?: {
    appliedCount: number;
    latestAppliedAt: string | null;
    anyPendingOnDisk: boolean;
  } | null;
  // When set, /api/setup/migrations-summary returns this HTTP status
  // (with an empty body) so we can exercise the error path without
  // also breaking the schema of the happy-path fixture.
  migrationsSummaryStatus?: number;
}

function installFetchMock(opts: StatusOverride) {
  const status = {
    setupRequired: false,
    adminExists: true,
    hasSessionSecret: true,
    hasEncryptionKey: true,
    publicAppUrl: "",
    lastMigrationFailure: null as MigrationFailureFixture | null,
    ...opts,
  };
  const migrationsSummary =
    opts.migrationsSummary === undefined
      ? {
          appliedCount: 7,
          latestAppliedAt: "2026-04-26T11:55:00.000Z",
          anyPendingOnDisk: false,
        }
      : opts.migrationsSummary;
  const migrationsSummaryStatus = opts.migrationsSummaryStatus ?? 200;
  fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.includes("/api/setup/status")) {
      return Promise.resolve(
        new Response(JSON.stringify(status), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/api/setup/migrations-summary")) {
      // Honor migrationsSummaryStatus first (lets tests force a 500
      // without also having to invent a body shape).
      if (migrationsSummaryStatus !== 200) {
        return Promise.resolve(
          new Response(JSON.stringify({ message: "internal_error" }), {
            status: migrationsSummaryStatus,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify(migrationsSummary ?? {}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/api/health")) {
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true, uptimeSec: 12 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/api/auth/user")) {
      return Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/api/setup/complete") && method === "POST") {
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, setupCompletedAt: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    return Promise.resolve(
      new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
  originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  // Task #455: the "Go to Login" button writes
  // criteriaiq:fromSetup to sessionStorage. Clear it so the
  // assertion in that test can't pass on a leaked value from a
  // previous test, and the rest of the suite isn't affected by it.
  try {
    window.sessionStorage.removeItem("criteriaiq:fromSetup");
  } catch {
    /* sessionStorage unavailable in some test envs — safe to ignore */
  }
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  } else {
    delete (globalThis as { fetch?: typeof globalThis.fetch }).fetch;
  }
  // Reset the URL to a clean state so ?reentry=1 from one test cannot
  // leak into the next.
  window.history.replaceState({}, "", "/setup");
  try {
    window.sessionStorage.removeItem("criteriaiq:fromSetup");
  } catch {
    /* see beforeEach */
  }
  vi.restoreAllMocks();
});

async function flush(times = 8) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

function render() {
  act(() => {
    root.render(<Setup />);
  });
}

describe("Setup wizard-vs-health-check landing", () => {
  it("renders the wizard when setupCompletedAt is null (fresh install)", async () => {
    installFetchMock({ setupCompletedAt: null });
    render();
    await flush();
    expect(container.querySelector('[data-testid="card-setup-health-check"]')).toBeNull();
    // The wizard's step 1 has the connect-step backdrop test id.
    expect(container.querySelector('[data-testid="setup-backdrop"]')).not.toBeNull();
  });

  it("renders the health-check view when setupCompletedAt is set", async () => {
    installFetchMock({ setupCompletedAt: "2026-04-26T12:00:00.000Z" });
    render();
    await flush();
    const card = container.querySelector('[data-testid="card-setup-health-check"]');
    expect(card).not.toBeNull();
    // Pass-state rows for the always-green seed values.
    const dbRow = container.querySelector('[data-testid="row-check-dbReachable"]');
    expect(dbRow?.getAttribute("data-ok")).toBe("true");
    const adminRow = container.querySelector('[data-testid="row-check-adminExists"]');
    expect(adminRow?.getAttribute("data-ok")).toBe("true");
  });

  it("shows the failing check as red when the underlying status reports a failure", async () => {
    installFetchMock({
      setupCompletedAt: "2026-04-26T12:00:00.000Z",
      adminExists: false,
    });
    render();
    await flush();
    const adminRow = container.querySelector('[data-testid="row-check-adminExists"]');
    expect(adminRow?.getAttribute("data-ok")).toBe("false");
  });

  it("requires explicit confirmation before reopening the wizard", async () => {
    installFetchMock({ setupCompletedAt: "2026-04-26T12:00:00.000Z" });
    render();
    await flush();
    expect(container.querySelector('[data-testid="card-setup-health-check"]')).not.toBeNull();
    // Click "Reconfigure…" — dialog must appear, wizard must NOT be mounted yet.
    const reconfigureBtn = container.querySelector(
      '[data-testid="button-reconfigure"]',
    ) as HTMLButtonElement | null;
    expect(reconfigureBtn).not.toBeNull();
    act(() => {
      reconfigureBtn!.click();
    });
    await flush();
    // The AlertDialog renders into a Radix portal — search globally.
    const dialog = document.querySelector('[data-testid="dialog-confirm-reconfigure"]');
    expect(dialog).not.toBeNull();
    // We are still on the health-check view until the operator
    // explicitly confirms — the wizard card must not yet be mounted.
    // (Both views now share the SetupShell chrome introduced in
    // task-420, so `setup-backdrop` is no longer a wizard-only
    // marker; assert against the health-check card instead.)
    expect(
      container.querySelector('[data-testid="card-setup-health-check"]'),
    ).not.toBeNull();
    // Confirm — wizard should now mount.
    const confirmBtn = document.querySelector(
      '[data-testid="button-confirm-reconfigure"]',
    ) as HTMLButtonElement | null;
    expect(confirmBtn).not.toBeNull();
    act(() => {
      confirmBtn!.click();
    });
    await flush();
    expect(container.querySelector('[data-testid="setup-backdrop"]')).not.toBeNull();
    // The health-check card is gone now that the wizard has taken
    // over the page.
    expect(
      container.querySelector('[data-testid="card-setup-health-check"]'),
    ).toBeNull();
  });

  // Task #679: in Reconfigure mode the wizard mutating endpoints
  // are not mounted, so every forward-progress button is gated on
  // `isReconfigureMode`. The first test verifies the user-visible
  // behaviour at the Connect step (callout + disabled Continue);
  // the second is a contract test that asserts every other gated
  // button (which the test cannot navigate to since forward nav is
  // itself disabled) still wires the same flag into its `disabled`
  // prop. Together they cover the full set the server stops
  // mounting post-install.
  it("shows the Reconfigure-mode callout and disables Connect → Continue after confirming", async () => {
    installFetchMock({ setupCompletedAt: "2026-04-26T12:00:00.000Z" });
    render();
    await flush();
    const reconfigureBtn = container.querySelector(
      '[data-testid="button-reconfigure"]',
    ) as HTMLButtonElement | null;
    expect(reconfigureBtn).not.toBeNull();
    act(() => {
      reconfigureBtn!.click();
    });
    await flush();
    const confirmBtn = document.querySelector(
      '[data-testid="button-confirm-reconfigure"]',
    ) as HTMLButtonElement | null;
    expect(confirmBtn).not.toBeNull();
    act(() => {
      confirmBtn!.click();
    });
    await flush();
    const callout = container.querySelector(
      '[data-testid="callout-reconfigure-mode"]',
    );
    expect(callout).not.toBeNull();
    const continueBtn = container.querySelector(
      '[data-testid="button-continue-connect"]',
    ) as HTMLButtonElement | null;
    expect(continueBtn).not.toBeNull();
    expect(continueBtn!.disabled).toBe(true);
  });

  it("wires isReconfigureMode into the disabled prop of every mutating wizard button", async () => {
    // Forward navigation is itself disabled in Reconfigure mode, so
    // the Initialize / Secrets / Public URL / Admin / SMTP / Done
    // step bodies are unreachable from a click-driven test. This
    // contract test reads setup.tsx and asserts each button's JSX
    // block references `isReconfigureMode` in its `disabled` prop.
    // If a future contributor adds a new mutating button without
    // wiring the flag, this test fails with a clear pointer to the
    // gap.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const source = fs.readFileSync(
      path.resolve(__dirname, "../setup.tsx"),
      "utf8",
    );
    const gatedTestIds = [
      "button-continue-connect",
      "button-initialize",
      "button-continue-secrets",
      "button-save-public-url",
      "button-create-admin",
      "button-skip-smtp",
      "button-save-smtp",
      "button-restart-server",
    ];
    for (const testId of gatedTestIds) {
      const idx = source.indexOf(`data-testid="${testId}"`);
      expect(idx, `${testId} not found in setup.tsx`).toBeGreaterThan(-1);
      // Look back from the testid to the enclosing `<Button` opening
      // tag and forward to the matching `>` so we capture only this
      // button's props, not unrelated siblings.
      const open = source.lastIndexOf("<Button", idx);
      const close = source.indexOf(">", idx);
      expect(open, `<Button opener for ${testId} not found`).toBeGreaterThan(-1);
      expect(close, `<Button closer for ${testId} not found`).toBeGreaterThan(-1);
      const propBlock = source.slice(open, close);
      expect(
        propBlock.includes("isReconfigureMode"),
        `${testId} is missing the isReconfigureMode gate (Task #679)`,
      ).toBe(true);
    }
  });

  it("does NOT render the last-migration-failure panel when the marker is null", async () => {
    installFetchMock({
      setupCompletedAt: "2026-04-26T12:00:00.000Z",
      lastMigrationFailure: null,
    });
    render();
    await flush();
    expect(
      container.querySelector('[data-testid="panel-last-migration-failure"]'),
    ).toBeNull();
  });

  it("renders the last-migration-failure panel with filename, SQLSTATE, timestamp and error", async () => {
    installFetchMock({
      setupCompletedAt: "2026-04-26T12:00:00.000Z",
      lastMigrationFailure: {
        filename: "023_add_foo_index.sql",
        sqlState: "42P07",
        error: "relation \"foo\" already exists",
        failedAt: "2026-04-25T08:30:00.000Z",
      },
    });
    render();
    await flush();
    const panel = container.querySelector('[data-testid="panel-last-migration-failure"]');
    expect(panel).not.toBeNull();
    expect(
      container.querySelector('[data-testid="text-last-migration-failure-filename"]')?.textContent,
    ).toBe("023_add_foo_index.sql");
    expect(
      container.querySelector('[data-testid="text-last-migration-failure-sqlstate"]')?.textContent,
    ).toBe("42P07");
    expect(
      container.querySelector('[data-testid="text-last-migration-failure-error"]')?.textContent,
    ).toContain("relation");
    expect(
      container.querySelector('[data-testid="text-last-migration-failure-failed-at"]'),
    ).not.toBeNull();
    // Title interpolates the failing filename.
    expect(panel?.textContent ?? "").toContain("023_add_foo_index.sql");
  });

  // Task #426 — the "Failed at" row inside the migration-failure
  // panel now reuses `formatRelativeTime` + the existing 30 s
  // `useRelativeTimeTick` cadence, so an operator scanning the
  // panel right after a crashed redeploy reads "5 minutes ago"
  // instead of having to mentally diff a raw locale-formatted
  // timestamp against the wall clock. Mirrors the migrations-row
  // assertion above: mock Date.now(), assert the relative phrase,
  // and confirm the raw "2026" never sneaks back in.
  it("renders the migration-failure 'failed at' line as a relative phrase like 'X hours ago'", async () => {
    const now = new Date("2026-04-26T12:00:00.000Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(now);
    installFetchMock({
      setupCompletedAt: "2026-04-26T12:00:00.000Z",
      lastMigrationFailure: {
        filename: "026_add_orders_index.sql",
        sqlState: "42P07",
        error: "relation \"orders\" already exists",
        // 2 hours before "now"
        failedAt: "2026-04-26T10:00:00.000Z",
      },
    });
    render();
    await flush();

    const failedAt = container.querySelector(
      '[data-testid="text-last-migration-failure-failed-at"]',
    );
    expect(failedAt, "failed-at row must mount").not.toBeNull();
    const text = failedAt!.textContent ?? "";
    // Intl.RelativeTimeFormat(en, {numeric:"auto"}) returns "2 hours
    // ago" for -2 hours — assert on the human-friendly fragment so
    // the test does not pin to a specific Intl polyfill quirk.
    expect(text.toLowerCase()).toContain("hour");
    expect(text.toLowerCase()).toContain("ago");
    // The raw locale-formatted timestamp must NOT appear — that's
    // the exact regression Task #426 set out to fix.
    expect(text).not.toContain("2026");
  });

  it("omits the SQLSTATE row when sqlState is null on the marker", async () => {
    installFetchMock({
      setupCompletedAt: "2026-04-26T12:00:00.000Z",
      lastMigrationFailure: {
        filename: "024_drop_legacy.sql",
        sqlState: null,
        error: "permission denied",
        failedAt: "2026-04-25T09:00:00.000Z",
      },
    });
    render();
    await flush();
    expect(
      container.querySelector('[data-testid="panel-last-migration-failure"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="text-last-migration-failure-sqlstate"]'),
    ).toBeNull();
  });

  it("copies the marker as JSON when the operator clicks the copy button", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const marker = {
      filename: "025_alter_users.sql",
      sqlState: "23505",
      error: "duplicate key value",
      failedAt: "2026-04-25T10:00:00.000Z",
    };
    installFetchMock({
      setupCompletedAt: "2026-04-26T12:00:00.000Z",
      lastMigrationFailure: marker,
    });
    render();
    await flush();
    const btn = container.querySelector(
      '[data-testid="button-copy-last-migration-failure"]',
    ) as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    await act(async () => {
      btn!.click();
    });
    await flush();
    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = writeText.mock.calls[0][0] as string;
    // Must be valid JSON and round-trip back to the original marker.
    expect(JSON.parse(copied)).toEqual(marker);
    // Button label flips to "Copied" briefly after a successful write.
    expect(btn!.textContent ?? "").toContain("Copied");
  });

  it("ignores a malformed lastMigrationFailure payload", async () => {
    installFetchMock({
      setupCompletedAt: "2026-04-26T12:00:00.000Z",
      // Cast through unknown to satisfy the typed override while still
      // exercising the runtime guard against half-populated payloads.
      lastMigrationFailure: { filename: "x" } as unknown as MigrationFailureFixture,
    });
    render();
    await flush();
    expect(
      container.querySelector('[data-testid="panel-last-migration-failure"]'),
    ).toBeNull();
  });

  // -------------------------------------------------------------------
  // Task #399 — "Recent upgrade activity" row backed by
  // /api/setup/migrations-summary. The row is informational (not a
  // green/red gate operators normally police), so its detail line
  // MUST render even on the happy ok=true path: that summary IS the
  // value the operator came to /setup to confirm. These tests lock in
  // the four states (healthy with applied count, healthy but empty,
  // pending-on-disk failure, HTTP error) and the always-show-detail
  // contract that code review caught us missing on the first pass.
  // -------------------------------------------------------------------
  it("renders the migrations row as ok and shows applied count + latest timestamp without expanding", async () => {
    installFetchMock({
      setupCompletedAt: "2026-04-26T12:00:00.000Z",
      migrationsSummary: {
        appliedCount: 7,
        latestAppliedAt: "2026-04-26T11:55:00.000Z",
        anyPendingOnDisk: false,
      },
    });
    render();
    await flush();

    const row = container.querySelector('[data-testid="row-check-migrationsApplied"]');
    expect(row, "migrations row must mount").not.toBeNull();
    expect(row?.getAttribute("data-ok")).toBe("true");
    // Critical: detail visible WITHOUT clicking expand. This is the
    // primary UX requirement that the previous review caught. Since the
    // expand/collapse rows landed (717a0f8f) the row satisfies it by
    // auto-expanding (`alwaysShowDetail`) rather than by rendering its
    // detail outside the collapsible panel.
    expect(row?.getAttribute("data-expanded")).toBe("true");
    const detail = container.querySelector(
      '[data-testid="detail-check-migrationsApplied"]',
    );
    expect(
      detail,
      "summary detail must render on the healthy path — the count IS the value",
    ).not.toBeNull();
    expect(detail!.textContent).toContain("7");
  });

  it("renders the empty-but-healthy state when no migrations have been applied yet", async () => {
    installFetchMock({
      setupCompletedAt: "2026-04-26T12:00:00.000Z",
      migrationsSummary: {
        appliedCount: 0,
        latestAppliedAt: null,
        anyPendingOnDisk: false,
      },
    });
    render();
    await flush();

    const row = container.querySelector('[data-testid="row-check-migrationsApplied"]');
    expect(row?.getAttribute("data-ok")).toBe("true");
    const detail = container.querySelector(
      '[data-testid="detail-check-migrationsApplied"]',
    );
    expect(detail).not.toBeNull();
    expect(detail!.textContent).toBe(
      `${i18n.t("setup.healthCheck.dataLabel")} ${i18n.t("setup.done.checks.migrationsNone")}`,
    );
  });

  it("fails the row and surfaces the pending warning when anyPendingOnDisk is true", async () => {
    installFetchMock({
      setupCompletedAt: "2026-04-26T12:00:00.000Z",
      migrationsSummary: {
        appliedCount: 5,
        latestAppliedAt: "2026-04-25T10:00:00.000Z",
        anyPendingOnDisk: true,
      },
    });
    render();
    await flush();

    const row = container.querySelector('[data-testid="row-check-migrationsApplied"]');
    expect(
      row?.getAttribute("data-ok"),
      "anyPendingOnDisk=true MUST flip the row to failing — mirrors System Health",
    ).toBe("false");
    const detail = container.querySelector(
      '[data-testid="detail-check-migrationsApplied"]',
    );
    expect(detail).not.toBeNull();
    expect(detail!.textContent).toContain("5");
    expect(detail!.textContent?.toLowerCase()).toContain("pending");
  });

  it("fails the row and surfaces the all-pending warning when nothing is applied yet", async () => {
    installFetchMock({
      setupCompletedAt: "2026-04-26T12:00:00.000Z",
      migrationsSummary: {
        appliedCount: 0,
        latestAppliedAt: null,
        anyPendingOnDisk: true,
      },
    });
    render();
    await flush();

    const row = container.querySelector('[data-testid="row-check-migrationsApplied"]');
    expect(row?.getAttribute("data-ok")).toBe("false");
    const detail = container.querySelector(
      '[data-testid="detail-check-migrationsApplied"]',
    );
    expect(detail!.textContent).toBe(
      `${i18n.t("setup.healthCheck.dataLabel")} ${i18n.t("setup.done.checks.migrationsAllPending")}`,
    );
  });

  it("fails the row with an HTTP error detail when migrations-summary returns 500", async () => {
    installFetchMock({
      setupCompletedAt: "2026-04-26T12:00:00.000Z",
      migrationsSummaryStatus: 500,
    });
    render();
    await flush();

    const row = container.querySelector('[data-testid="row-check-migrationsApplied"]');
    expect(row?.getAttribute("data-ok")).toBe("false");
    const detail = container.querySelector(
      '[data-testid="detail-check-migrationsApplied"]',
    );
    expect(detail!.textContent).toContain("500");
  });

  // -------------------------------------------------------------------
  // Task #409 — relative-time rendering on the migrations row.
  // The detail line should read "X minutes ago" / "just now" instead
  // of a raw locale-formatted timestamp so an operator scanning the
  // page right after a redeploy immediately recognises the runner
  // just finished. We mock Date.now() so the assertions are
  // deterministic regardless of when the test happens to run.
  // -------------------------------------------------------------------
  it("renders the latest applied-at timestamp as a relative phrase like 'X minutes ago'", async () => {
    const now = new Date("2026-04-26T12:00:00.000Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(now);
    installFetchMock({
      setupCompletedAt: "2026-04-26T12:00:00.000Z",
      migrationsSummary: {
        appliedCount: 3,
        // 5 minutes before "now"
        latestAppliedAt: "2026-04-26T11:55:00.000Z",
        anyPendingOnDisk: false,
      },
    });
    render();
    await flush();

    const detail = container.querySelector(
      '[data-testid="detail-check-migrationsApplied"]',
    );
    expect(detail).not.toBeNull();
    const text = detail!.textContent ?? "";
    // Intl.RelativeTimeFormat(en, {numeric:"auto"}) returns "5 minutes
    // ago" for -5 minutes — assert on the human-friendly fragment so
    // the test does not pin to a specific Intl polyfill quirk.
    expect(text.toLowerCase()).toContain("minute");
    expect(text).toContain("ago");
    expect(text).toContain("3");
    // The raw locale-formatted timestamp must NOT appear — that's the
    // exact regression Task #409 set out to fix.
    expect(text).not.toContain("2026");
  });

  it("renders 'now' (or the locale equivalent) when the latest timestamp is within a few seconds of now", async () => {
    const now = new Date("2026-04-26T12:00:00.000Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(now);
    installFetchMock({
      setupCompletedAt: "2026-04-26T12:00:00.000Z",
      migrationsSummary: {
        appliedCount: 2,
        // 1 second before "now" — falls inside the ±5 s "now" bucket.
        latestAppliedAt: "2026-04-26T11:59:59.000Z",
        anyPendingOnDisk: false,
      },
    });
    render();
    await flush();

    const detail = container.querySelector(
      '[data-testid="detail-check-migrationsApplied"]',
    );
    expect(detail).not.toBeNull();
    const text = (detail!.textContent ?? "").toLowerCase();
    // Intl.RelativeTimeFormat returns "now" for (0, "second") in
    // English with numeric:"auto". Accept either "now" or the
    // singular-second fallback to stay polyfill-tolerant.
    expect(text).toMatch(/\bnow\b|second/);
    // Still no raw timestamp.
    expect(detail!.textContent ?? "").not.toContain("2026");
  });

  it("falls back to '—' when applied count is non-zero but the latest timestamp is missing", async () => {
    installFetchMock({
      setupCompletedAt: "2026-04-26T12:00:00.000Z",
      migrationsSummary: {
        appliedCount: 4,
        latestAppliedAt: null,
        anyPendingOnDisk: false,
      },
    });
    render();
    await flush();

    const detail = container.querySelector(
      '[data-testid="detail-check-migrationsApplied"]',
    );
    expect(detail).not.toBeNull();
    // The "—" placeholder protects the i18n interpolation when the
    // server omits the timestamp — must render literally, not as
    // "undefined" or an empty string mid-sentence.
    expect(detail!.textContent ?? "").toContain("—");
    expect(detail!.textContent ?? "").not.toContain("undefined");
  });

  it("renders the relative phrase for the pending-with-some-applied state too", async () => {
    const now = new Date("2026-04-26T12:00:00.000Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(now);
    installFetchMock({
      setupCompletedAt: "2026-04-26T12:00:00.000Z",
      migrationsSummary: {
        appliedCount: 5,
        // 2 hours before "now"
        latestAppliedAt: "2026-04-26T10:00:00.000Z",
        anyPendingOnDisk: true,
      },
    });
    render();
    await flush();

    const detail = container.querySelector(
      '[data-testid="detail-check-migrationsApplied"]',
    );
    expect(detail).not.toBeNull();
    const text = (detail!.textContent ?? "").toLowerCase();
    expect(text).toContain("hour");
    expect(text).toContain("ago");
    expect(text).toContain("pending");
  });

  it("renders the shared SetupShell chrome (backdrop, theme toggle, get help, version footer) around the health-check card (task-420)", async () => {
    installFetchMock({ setupCompletedAt: "2026-04-26T12:00:00.000Z" });
    render();
    await flush();
    // The health-check card itself is mounted...
    expect(
      container.querySelector('[data-testid="card-setup-health-check"]'),
    ).not.toBeNull();
    // ...wrapped in the same SetupShell chrome the wizard uses, so
    // the gradient backdrop, theme toggle, get-help button and the
    // version footer all paint exactly as they do during initial
    // setup. Pre-task-420, the health-check view was a bare
    // `min-h-screen flex … bg-background` div with none of these
    // surfaces, which is the cosmetic regression captured in the
    // task description.
    expect(container.querySelector('[data-testid="setup-backdrop"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="button-theme-toggle"]')).not.toBeNull();
    // The version footer mounts asynchronously after /api/version
    // resolves, but the request goes through the fetch mock and the
    // mock returns 200 with `{}` for unknown URLs — so the footer
    // stays hidden in this fixture. Instead, assert that the
    // CriteriaIQ logo from the shell IS painted (it's the most
    // visible piece of the missing chrome from the bug report).
    const logo = container.querySelector('img[alt="CriteriaIQ"]');
    expect(logo).not.toBeNull();
    // The language switcher trigger renders inside the top-right
    // chrome region; the LanguageSwitcher component uses
    // `aria-label={t('language.switchLanguage')}` on its button so
    // we can locate it without relying on the (non-test-id'd)
    // dropdown markup.
    const langSwitcherTrigger = container.querySelector(
      'button[aria-label="Switch Language"]',
    );
    expect(langSwitcherTrigger).not.toBeNull();
    // No wizard pills on the health-check view (passing the absent
    // `pills` prop to SetupShell must not render anything that
    // looks like a wizard step indicator).
    expect(container.querySelector('[data-testid="step-pills"]')).toBeNull();
  });

  // -------------------------------------------------------------------
  // Task #414 — the relative-time phrase rendered on the migrations
  // row must update in place as the underlying timestamp ages, even
  // when the operator does not click "Re-run checks". A `setInterval`
  // owned by the component re-renders the label every 30 s; when the
  // component unmounts that interval must be cleared so we do not
  // leak timers into the rest of the wizard.
  // -------------------------------------------------------------------
  it("ticks the relative-time label forward without a refetch when the wall clock advances", async () => {
    vi.useFakeTimers();
    try {
      const t0 = new Date("2026-04-26T12:00:00.000Z").getTime();
      vi.setSystemTime(new Date(t0));
      installFetchMock({
        setupCompletedAt: "2026-04-26T12:00:00.000Z",
        migrationsSummary: {
          appliedCount: 4,
          // 1 minute before "now" at first paint.
          latestAppliedAt: "2026-04-26T11:59:00.000Z",
          anyPendingOnDisk: false,
        },
      });
      render();
      // Drain mount + initial fetches without advancing the wall
      // clock — `await flush()` would tick our fake timers too.
      for (let i = 0; i < 8; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0);
        });
      }
      const detail = container.querySelector(
        '[data-testid="detail-check-migrationsApplied"]',
      );
      expect(detail).not.toBeNull();
      const initialText = (detail!.textContent ?? "").toLowerCase();
      expect(initialText).toContain("minute");
      expect(initialText).toContain("ago");
      // Snapshot how many times the migrations-summary endpoint was
      // hit so we can prove the tick re-renders the LABEL without
      // re-fetching the underlying data. (Other unrelated polling
      // intervals owned by the setup wizard shell — e.g. the
      // post-restart status probe — would inflate the total fetch
      // count, so we narrow to the one endpoint this row owns.)
      const summaryCallsBefore = fetchMock.mock.calls.filter(
        (call: unknown[]) => String(call[0]).includes("/api/setup/migrations-summary"),
      ).length;

      // Advance the wall clock by ~10 minutes — well past the 30 s
      // interval the component installs. The label must reflect the
      // new "10 minutes ago" reading on its own.
      vi.setSystemTime(new Date(t0 + 10 * 60 * 1000));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
      });

      const updated = container.querySelector(
        '[data-testid="detail-check-migrationsApplied"]',
      );
      expect(updated).not.toBeNull();
      const updatedText = (updated!.textContent ?? "").toLowerCase();
      // Still a minute-grained phrase, but a different number than
      // the "1 minute ago" we started with — locking in that the
      // label genuinely re-rendered against fresh `Date.now()`.
      expect(updatedText).toContain("minute");
      expect(updatedText).toContain("ago");
      expect(updatedText).not.toBe(initialText);
      // No additional /api/setup/migrations-summary requests were
      // made — the tick is purely a render-time recompute, no
      // network traffic.
      const summaryCallsAfter = fetchMock.mock.calls.filter(
        (call: unknown[]) => String(call[0]).includes("/api/setup/migrations-summary"),
      ).length;
      expect(summaryCallsAfter).toBe(summaryCallsBefore);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the relative-time interval on unmount so no timers leak", async () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(window, "clearInterval");
    try {
      installFetchMock({
        setupCompletedAt: "2026-04-26T12:00:00.000Z",
        migrationsSummary: {
          appliedCount: 1,
          latestAppliedAt: "2026-04-26T11:55:00.000Z",
          anyPendingOnDisk: false,
        },
      });
      render();
      for (let i = 0; i < 8; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0);
        });
      }
      // Tear down the React tree; the interval registered inside
      // `useRelativeTimeTick` must be released.
      act(() => {
        root.unmount();
      });
      expect(clearSpy).toHaveBeenCalled();
      // Re-create the root so afterEach's unmount call is harmless.
      root = createRoot(container);
    } finally {
      clearSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("expands the failing check and shows the reentry banner when ?reentry=1", async () => {
    window.history.replaceState({}, "", "/setup?reentry=1");
    installFetchMock({
      setupCompletedAt: "2026-04-26T12:00:00.000Z",
      adminExists: false, // first failing row
    });
    render();
    await flush();
    const banner = container.querySelector('[data-testid="banner-reentry"]');
    expect(banner).not.toBeNull();
    const adminRow = container.querySelector('[data-testid="row-check-adminExists"]');
    expect(adminRow?.getAttribute("data-expanded")).toBe("true");
  });

  // Task #455 — clicking the "Go to Login" button on the read-only
  // health-check view MUST write the criteriaiq:fromSetup
  // sessionStorage flag before navigating away. useAuth's 401 handler
  // reads that flag to suppress the post-redeploy bounce back to
  // /setup?reentry=1; without the write the operator gets trapped on
  // the diagnostic screen whenever the localStorage "had a session"
  // marker is set (dev auto-login or any prior session). The wizard's
  // Done-step button has done this since the original task-378 work;
  // this test pins the parity for the health-check screen's button.
  it("writes the criteriaiq:fromSetup sessionStorage flag when 'Go to Login' is clicked from the health-check view", async () => {
    installFetchMock({ setupCompletedAt: "2026-04-26T12:00:00.000Z" });
    // Stub window.location.href assignment so happy-dom doesn't try
    // to navigate the test harness — we only care that the flag is
    // written before the navigation attempt.
    const originalLocation = window.location;
    let assignedHref: string | null = null;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...originalLocation,
        get href() {
          return String(originalLocation.href);
        },
        set href(v: string) {
          assignedHref = v;
        },
      },
    });
    try {
      render();
      await flush();

      expect(
        window.sessionStorage.getItem("criteriaiq:fromSetup"),
        "flag must be absent before the click — guards against a stale value masking a regression",
      ).toBeNull();

      const btn = container.querySelector(
        '[data-testid="button-go-to-login"]',
      ) as HTMLButtonElement | null;
      expect(btn, "'Go to Login' button must mount on the health-check view").not.toBeNull();
      act(() => {
        btn!.click();
      });
      await flush();

      expect(
        window.sessionStorage.getItem("criteriaiq:fromSetup"),
        "Task #455: the click handler must write the explicit-exit flag so useAuth's 401 handler skips the bounce back to /setup?reentry=1",
      ).toBe("1");
      expect(
        assignedHref,
        "click must still attempt the navigation to '/' — the flag write is in addition to, not in place of, the redirect",
      ).toBe("/");
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: originalLocation,
      });
    }
  });

  // Task #410 bonus — when the only failing row is the upgrade-activity
  // (migrations) row and the operator lands here via ?reentry=1, that
  // row must be the one auto-expanded. The migrations row already
  // renders its detail unconditionally (`alwaysShowDetail: true`), so
  // we assert on the `data-expanded` flag directly to prove the
  // reentry/firstFailureIndex selection actually picked it — not just
  // that some detail text happens to be visible.
  it("auto-expands the failing-pending migrations row under ?reentry=1", async () => {
    window.history.replaceState({}, "", "/setup?reentry=1");
    installFetchMock({
      setupCompletedAt: "2026-04-26T12:00:00.000Z",
      // Setting a non-empty publicAppUrl flips the publicUrlResolves
      // row green — the probe URL ends in "/api/health" and is matched
      // by the fetch mock's health branch. Without this every fixture
      // would fail publicUrlResolves first and the reentry logic would
      // expand THAT row instead of migrations.
      publicAppUrl: "https://example.com",
      // Every other status-derived check stays green; only the
      // migrations row fails so it is the first (and only) failing
      // check the reentry logic can latch onto.
      migrationsSummary: {
        appliedCount: 5,
        latestAppliedAt: "2026-04-26T11:55:00.000Z",
        anyPendingOnDisk: true,
      },
    });
    render();
    await flush();

    const banner = container.querySelector('[data-testid="banner-reentry"]');
    expect(banner).not.toBeNull();

    const migrationsRow = container.querySelector(
      '[data-testid="row-check-migrationsApplied"]',
    );
    expect(migrationsRow?.getAttribute("data-ok")).toBe("false");
    expect(
      migrationsRow?.getAttribute("data-expanded"),
      "?reentry=1 must auto-expand the first failing row, which here is migrations",
    ).toBe("true");

    // Sanity: a non-failing earlier row must NOT be the one expanded.
    const dbRow = container.querySelector('[data-testid="row-check-dbReachable"]');
    expect(dbRow?.getAttribute("data-expanded")).toBe("false");
  });
});

// Task #582: when the bootstrap snapshot reports
// `publicAppUrlSource === 'default'` the running process is still on
// the localhost fallback. The view must:
//   1. Render an amber "Restart required" callout with a Restart
//      button so operators don't have to scroll to find it.
//   2. Replace the misleading "http://localhost:5000 unreachable"
//      detail on the publicUrl row with the new "not yet loaded —
//      restart the server to apply" wording.
//   3. Hide the callout when the operator clicks Dismiss.
//   4. Hide the callout automatically once the source flips to
//      `'env'` or `'file'` (post-restart hydrate worked).
describe("Setup health check — restart-required callout (Task #582)", () => {
  it("renders the callout when publicAppUrlSource is 'default'", async () => {
    installFetchMock({
      setupCompletedAt: "2026-04-26T12:00:00.000Z",
      publicAppUrl: "http://localhost:5000",
      publicAppUrlSource: "default",
    });
    render();
    await flush();
    const callout = container.querySelector(
      '[data-testid="callout-restart-required"]',
    );
    expect(
      callout,
      "Restart Required callout must surface when source === 'default'",
    ).not.toBeNull();
    // Both action buttons must be present and enabled by default.
    const restartBtn = container.querySelector(
      '[data-testid="button-restart-required-restart"]',
    ) as HTMLButtonElement | null;
    const dismissBtn = container.querySelector(
      '[data-testid="button-restart-required-dismiss"]',
    ) as HTMLButtonElement | null;
    expect(restartBtn).not.toBeNull();
    expect(dismissBtn).not.toBeNull();
    expect(restartBtn?.disabled).toBe(false);
    expect(dismissBtn?.disabled).toBe(false);
  });

  it("does NOT render the callout when publicAppUrlSource is 'env'", async () => {
    installFetchMock({
      setupCompletedAt: "2026-04-26T12:00:00.000Z",
      publicAppUrl: "https://example.com",
      publicAppUrlSource: "env",
    });
    render();
    await flush();
    expect(
      container.querySelector('[data-testid="callout-restart-required"]'),
      "Source 'env' means the post-restart hydrate already promoted the saved value — the callout must stay hidden",
    ).toBeNull();
  });

  it("does NOT render the callout when publicAppUrlSource is 'file'", async () => {
    installFetchMock({
      setupCompletedAt: "2026-04-26T12:00:00.000Z",
      publicAppUrl: "https://example.com",
      publicAppUrlSource: "file",
    });
    render();
    await flush();
    expect(
      container.querySelector('[data-testid="callout-restart-required"]'),
    ).toBeNull();
  });

  it("does NOT render the callout when the snapshot omits publicAppUrlSource (older server / undefined)", async () => {
    // The client tolerates older servers that don't ship the field.
    // The safe default in that state is "don't fire the callout" —
    // we'd rather miss a true-positive than burn the operator with a
    // false-positive amber banner on an otherwise-healthy install.
    installFetchMock({
      setupCompletedAt: "2026-04-26T12:00:00.000Z",
      publicAppUrl: "https://example.com",
      // publicAppUrlSource intentionally omitted.
    });
    render();
    await flush();
    expect(
      container.querySelector('[data-testid="callout-restart-required"]'),
    ).toBeNull();
  });

  it("hides the callout after the operator clicks Dismiss", async () => {
    installFetchMock({
      setupCompletedAt: "2026-04-26T12:00:00.000Z",
      publicAppUrl: "http://localhost:5000",
      publicAppUrlSource: "default",
    });
    render();
    await flush();
    const dismissBtn = container.querySelector(
      '[data-testid="button-restart-required-dismiss"]',
    ) as HTMLButtonElement | null;
    expect(dismissBtn).not.toBeNull();
    act(() => {
      dismissBtn!.click();
    });
    await flush();
    expect(
      container.querySelector('[data-testid="callout-restart-required"]'),
      "Dismiss must remove the callout from the DOM until the next page load",
    ).toBeNull();
  });

  it("uses the 'not loaded' wording on the publicUrl row instead of the misleading 'localhost:5000 unreachable'", async () => {
    installFetchMock({
      setupCompletedAt: "2026-04-26T12:00:00.000Z",
      publicAppUrl: "http://localhost:5000",
      publicAppUrlSource: "default",
    });
    render();
    await flush();
    const row = container.querySelector(
      '[data-testid="row-check-publicUrlResolves"]',
    );
    expect(row?.getAttribute("data-ok")).toBe("false");
    // Non-summary rows render collapsed (717a0f8f); the detail line
    // only mounts once the operator opens the row.
    act(() => {
      (row!.querySelector("button") as HTMLButtonElement).click();
    });
    await flush();
    const detail = container.querySelector(
      '[data-testid="detail-check-publicUrlResolves"]',
    );
    expect(detail).not.toBeNull();
    const text = detail?.textContent ?? "";
    // The new wording must mention the running server / restart so the
    // operator knows the cause is "stale config", not "actual network
    // failure". The misleading "unreachable" / "Failed to fetch"
    // phrasing must be gone.
    expect(text.toLowerCase()).toContain("running server");
    expect(text.toLowerCase()).toContain("restart");
    expect(text).not.toMatch(/unreachable/i);
    expect(text).not.toContain("http://localhost:5000");
  });

  it("keeps the normal probe wording when publicAppUrlSource is 'env' / 'file'", async () => {
    installFetchMock({
      setupCompletedAt: "2026-04-26T12:00:00.000Z",
      publicAppUrl: "https://example.com",
      publicAppUrlSource: "env",
    });
    render();
    await flush();
    const row = container.querySelector(
      '[data-testid="row-check-publicUrlResolves"]',
    );
    // The mock /api/health response is `{ ok: true }` so the probe
    // should land on the green "publicUrlOk" branch — proving the new
    // 'default' branch did NOT spuriously fire for non-default sources.
    expect(row?.getAttribute("data-ok")).toBe("true");
  });

  // -- Task #582 §19: broader OR-of-four-sources gating --------------
  // The callout must fire when ANY wizard-managed source field reports
  // a stale state, not just publicAppUrlSource. The most common
  // production trigger besides 'default' publicAppUrl is
  // databaseUrlSource === 'wizard' (file has it, env doesn't), which
  // happens whenever the operator pasted a DB URL into step 2 but the
  // container hasn't been restarted yet so hydrate has not yet copied
  // it into env.
  it("renders the callout when databaseUrlSource is 'wizard' even if publicAppUrlSource is healthy", async () => {
    installFetchMock({
      setupCompletedAt: "2026-04-26T12:00:00.000Z",
      publicAppUrl: "https://example.com",
      publicAppUrlSource: "env",
      databaseUrlSource: "wizard",
    });
    render();
    await flush();
    expect(
      container.querySelector('[data-testid="callout-restart-required"]'),
      "A stale databaseUrlSource alone must be enough to trigger the callout.",
    ).not.toBeNull();
  });

  it("does NOT render the callout when every tracked source is healthy", async () => {
    installFetchMock({
      setupCompletedAt: "2026-04-26T12:00:00.000Z",
      publicAppUrl: "https://example.com",
      publicAppUrlSource: "env",
      databaseUrlSource: "env",
      sessionSecretSource: "env",
      encryptionKeySource: "env",
    });
    render();
    await flush();
    expect(
      container.querySelector('[data-testid="callout-restart-required"]'),
      "All sources reading from env means the running process is fully promoted — the callout must stay hidden.",
    ).toBeNull();
  });

  it("renders the callout when both publicAppUrlSource and databaseUrlSource are stale (OR-gate stays satisfied)", async () => {
    // Sanity check that the OR isn't accidentally an XOR — both being
    // stale at once is the most common real-world scenario right after
    // a fresh wizard run but before the first restart.
    installFetchMock({
      setupCompletedAt: "2026-04-26T12:00:00.000Z",
      publicAppUrl: "http://localhost:5000",
      publicAppUrlSource: "default",
      databaseUrlSource: "wizard",
    });
    render();
    await flush();
    expect(
      container.querySelector('[data-testid="callout-restart-required"]'),
    ).not.toBeNull();
  });

  // -- Task #582 §H: auth-refusal inline error UX --------------------
  // When POST /api/setup/restart returns 401 (no session) or 403
  // (non-Admin), handleRestart in setup-health-check-view.tsx must:
  //   1. Skip the 12s polling/countdown loop (no restart will happen).
  //   2. Surface an inline destructive error pointing the operator at
  //      "log in as Admin first" — the same i18n key
  //      `setup.restartRequired.authRequired` we ship in all 6 locales.
  //   3. Re-enable the restart button so the operator can retry after
  //      logging in.
  // This locks the contract with the server-side gate
  // (registerSetupStatusRoutes opts.restartRequiresAdmin) — the
  // matching server tests live in
  // server/__tests__/setup-status-bootstrap-snapshot-spread.test.ts
  // ("registerSetupStatusRoutes — restartRequiresAdmin gating").
  it("renders inline auth-required error when /api/setup/restart returns 401 (no countdown, no false success)", async () => {
    installFetchMock({
      setupCompletedAt: "2026-04-26T12:00:00.000Z",
      publicAppUrl: "http://localhost:5000",
      publicAppUrlSource: "default",
    });
    // Override the restart endpoint to return 401. installFetchMock's
    // catch-all would otherwise reply 200 and let the polling loop run
    // for 12 wall-clock seconds, which we explicitly want to AVOID
    // proving here.
    const originalImpl = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.includes("/api/setup/restart") && method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: false,
              error: "Authentication required",
              errorCode: "unauthenticated",
            }),
            {
              status: 401,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }
      return originalImpl!(input, init);
    });
    render();
    await flush();

    const restartBtn = container.querySelector(
      '[data-testid="button-restart-required-restart"]',
    ) as HTMLButtonElement | null;
    expect(restartBtn).not.toBeNull();
    act(() => {
      restartBtn!.click();
    });
    await flush();

    const errorEl = container.querySelector(
      '[data-testid="text-restart-required-error"]',
    );
    expect(
      errorEl,
      "401 from /api/setup/restart must surface an inline error so the operator knows to log in first",
    ).not.toBeNull();
    expect(errorEl?.getAttribute("role")).toBe("alert");
    // The English authRequired string mentions both Admin and restart —
    // assertion stays locale-tolerant by checking the raw key wording
    // we ship in en-US.json without depending on the i18n machinery
    // (i18n.changeLanguage("en") in beforeEach guarantees en-US).
    const text = errorEl?.textContent ?? "";
    expect(text.toLowerCase()).toContain("admin");
    // Critical: the countdown UI must NOT have started — the early
    // return inside handleRestart bails before setCountdown.
    expect(
      container.querySelector('[data-testid="text-restart-required-countdown"]'),
      "401 path must NOT start the polling/countdown loop",
    ).toBeNull();
    // Button must be re-enabled so the operator can retry post-login.
    expect(restartBtn?.disabled).toBe(false);
  });

  it("renders the same inline auth-required error when /api/setup/restart returns 403 (non-Admin role)", async () => {
    installFetchMock({
      setupCompletedAt: "2026-04-26T12:00:00.000Z",
      publicAppUrl: "http://localhost:5000",
      publicAppUrlSource: "default",
    });
    const originalImpl = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.includes("/api/setup/restart") && method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: false,
              error: "Admin role required",
              errorCode: "forbidden",
            }),
            {
              status: 403,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }
      return originalImpl!(input, init);
    });
    render();
    await flush();

    const restartBtn = container.querySelector(
      '[data-testid="button-restart-required-restart"]',
    ) as HTMLButtonElement | null;
    act(() => {
      restartBtn!.click();
    });
    await flush();

    const errorEl = container.querySelector(
      '[data-testid="text-restart-required-error"]',
    );
    expect(errorEl, "403 must surface the same inline auth-required error as 401").not.toBeNull();
    expect(
      container.querySelector('[data-testid="text-restart-required-countdown"]'),
    ).toBeNull();
  });
});
