// @vitest-environment happy-dom
//
// Coverage for task #367: every persisted-config input on the Setup
// wizard (Public URL, Session Secret, Encryption Key, SMTP Host) must
// render the same operator-friendly source-of-truth badge that the
// Done step's RunningServerSeesPanel introduced. Operators kept
// reporting "I saved it but it didn't take effect" because host-env
// values always win over data/db-config.json — these badges make the
// precedence visible at the input itself, not just on the Done step.
//
// We render the wizard, drive it onto the Public URL, Secrets, and
// SMTP steps under three SecretsSnapshot mixes (env, file, none) and
// assert each badge:
//   * carries a stable data-testid so other suites can target it,
//   * carries a `data-source` matching the EnvHelperSource it was
//     given,
//   * renders the localized operator-friendly text from
//     `setup.envHelper.fieldBadge.*`.
//
// We deliberately exercise both the SecretRow (Session Secret /
// Encryption Key) and the bespoke Public URL / SMTP Host inputs so a
// future refactor can't silently drop the badge from one path while
// leaving it on the others.
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

beforeEach(async () => {
  await i18n.changeLanguage("en");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  fetchMock = vi.fn();
  originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
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
  vi.restoreAllMocks();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function render(ui: React.ReactElement) {
  act(() => {
    root.render(ui);
  });
}

function setInputValue(selector: string, value: string) {
  const el = container.querySelector<HTMLInputElement>(selector);
  if (!el) throw new Error(`input ${selector} not rendered`);
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function clickByLabel(label: string) {
  const buttons = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button"),
  );
  const btn = buttons.find((b) => b.textContent?.trim() === label);
  if (!btn) {
    const labels = buttons.map((b) => b.textContent?.trim()).join(" | ");
    throw new Error(`button "${label}" not rendered. saw: ${labels}`);
  }
  if (btn.disabled) {
    throw new Error(`button "${label}" is disabled and cannot be clicked`);
  }
  act(() => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

type SourceMix = {
  sessionSecretSource?: "env" | "file" | "none";
  encryptionKeySource?: "env" | "file" | "none";
  publicAppUrlSource?: "env" | "file" | "default";
  // task-370: the bootstrap snapshot now exposes smtpHostSource so the
  // SMTP step's badge can render "From wizard file" the moment the
  // wizard loads (instead of waiting for the operator to re-type a
  // previously deferred host). Defaults to "none" so the legacy tests
  // that don't set it still see a "Not set" badge by default.
  smtpHostSource?: "env" | "file" | "none";
};

// Wires every endpoint the wizard hits with a success response, with
// the SecretsSnapshot the Secrets / Public URL steps consume locked to
// the source-mix the test wants to assert on.
function installFetchMock(sources: SourceMix) {
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/setup/test-connection")) {
      return Promise.resolve(jsonResponse(200, { success: true, latencyMs: 1 }));
    }
    if (url.includes("/api/setup/initialize")) {
      return Promise.resolve(jsonResponse(200, { success: true, phases: [] }));
    }
    if (url.endsWith("/api/setup/secrets")) {
      return Promise.resolve(
        jsonResponse(200, {
          hasConnectionUrl: true,
          databaseUrlSource: "env",
          hasSessionSecret: true,
          sessionSecretSource: sources.sessionSecretSource ?? "file",
          sessionSecretValue: "session-value-1234567890",
          hasEncryptionKey: true,
          encryptionKeySource: sources.encryptionKeySource ?? "file",
          encryptionKeyValue: "encryption-value-1234567890",
          publicAppUrl: "https://existing.example.com",
          publicAppUrlSource: sources.publicAppUrlSource ?? "default",
          smtpHostSource: sources.smtpHostSource ?? "none",
        }),
      );
    }
    if (url.endsWith("/api/setup/status")) {
      return Promise.resolve(
        jsonResponse(200, {
          setupRequired: true,
          adminExists: false,
          publicAppUrl: "",
          hasSessionSecret: true,
          hasEncryptionKey: true,
          dbHealth: { reachable: true, lastErrorCode: null },
        }),
      );
    }
    if (url.includes("/api/setup/public-url")) {
      return Promise.resolve(jsonResponse(200, { success: true }));
    }
    if (url.includes("/api/setup/create-admin")) {
      return Promise.resolve(jsonResponse(200, { success: true }));
    }
    if (url.includes("/api/setup/smtp")) {
      return Promise.resolve(jsonResponse(200, { success: true }));
    }
    if (url.includes("/api/setup/crm-provider")) {
      return Promise.resolve(jsonResponse(200, { success: true, provider: "salesforce" }));
    }
    if (url.includes("/api/auth/user")) {
      return Promise.resolve(jsonResponse(401, { message: "Not authed" }));
    }
    return Promise.resolve(jsonResponse(200, {}));
  });
}

// Walk: connect → initialize → secrets. The Secrets step is where the
// SESSION_SECRET / ENCRYPTION_KEY badges live, so the secrets-step
// tests stop here.
async function navigateToSecretsStep(sources: SourceMix = {}) {
  installFetchMock(sources);
  render(<Setup />);
  await flush();
  setInputValue("input#url", "postgres://u:p@h:5432/db");
  clickByLabel(i18n.t("setup.connect.testButton"));
  await flush();
  await flush();
  clickByLabel(i18n.t("setup.actions.continue"));
  await flush();
  clickByLabel(i18n.t("setup.initialize.initialize"));
  await flush();
  await flush();
  await flush();
}

// Walk one step further: connect → initialize → secrets → public-url.
async function navigateToPublicUrlStep(sources: SourceMix = {}) {
  await navigateToSecretsStep(sources);
  clickByLabel(i18n.t("setup.actions.continue"));
  await flush();
}

// Walk all the way to the SMTP step (skipping admin via the empty
// form is not possible, but the SMTP step renders unconditionally
// once we route there directly via the admin-skip path is not
// applicable here — instead this helper drives the wizard through
// admin by submitting valid credentials).
async function navigateToSmtpStep(sources: SourceMix = {}) {
  await navigateToPublicUrlStep(sources);
  setInputValue("input#purl", "https://app.example.com");
  clickByLabel(i18n.t("setup.actions.continue"));
  await flush();
  await flush();
  // Admin step
  setInputValue("input#afn", "Ada");
  setInputValue("input#ae", "ada@example.com");
  setInputValue("input#ap", "Correct-Horse-Battery-Staple-9");
  const createBtn = container.querySelector<HTMLButtonElement>(
    '[data-testid="button-create-admin"]',
  );
  if (!createBtn) throw new Error("create-admin button not rendered");
  act(() => {
    createBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
  await flush();
}

function badgeAt(testId: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  if (!el) throw new Error(`badge ${testId} not rendered`);
  return el;
}

describe("Setup — per-input source-of-truth badges (task #367)", () => {
  it("Secrets step: Session Secret + Encryption Key badges reflect the snapshot source", async () => {
    await navigateToSecretsStep({
      sessionSecretSource: "env",
      encryptionKeySource: "file",
    });

    const session = badgeAt("field-source-badge-session-secret");
    expect(session.dataset.source).toBe("env");
    expect(session.textContent).toBe(
      i18n.t("setup.envHelper.fieldBadge.env"),
    );

    const encryption = badgeAt("field-source-badge-encryption-key");
    expect(encryption.dataset.source).toBe("file");
    expect(encryption.textContent).toBe(
      i18n.t("setup.envHelper.fieldBadge.file"),
    );
  });

  it("Secrets step: collapses snapshot 'none' to the not-set badge", async () => {
    await navigateToSecretsStep({
      sessionSecretSource: "none",
      encryptionKeySource: "none",
    });

    expect(
      badgeAt("field-source-badge-session-secret").dataset.source,
    ).toBe("not-set");
    expect(
      badgeAt("field-source-badge-session-secret").textContent,
    ).toBe(i18n.t("setup.envHelper.fieldBadge.not-set"));
    expect(
      badgeAt("field-source-badge-encryption-key").dataset.source,
    ).toBe("not-set");
  });

  it("Public URL step: badge shows 'env' wording when host already exports PUBLIC_APP_URL", async () => {
    await navigateToPublicUrlStep({ publicAppUrlSource: "env" });

    const badge = badgeAt("field-source-badge-public-url");
    expect(badge.dataset.source).toBe("env");
    expect(badge.textContent).toBe(
      i18n.t("setup.envHelper.fieldBadge.env"),
    );
  });

  it("Public URL step: badge shows 'file' wording when only the wizard has the value", async () => {
    await navigateToPublicUrlStep({ publicAppUrlSource: "file" });

    const badge = badgeAt("field-source-badge-public-url");
    expect(badge.dataset.source).toBe("file");
    expect(badge.textContent).toBe(
      i18n.t("setup.envHelper.fieldBadge.file"),
    );
  });

  it("Public URL step: badge collapses snapshot 'default' to not-set", async () => {
    await navigateToPublicUrlStep({ publicAppUrlSource: "default" });

    const badge = badgeAt("field-source-badge-public-url");
    expect(badge.dataset.source).toBe("not-set");
    expect(badge.textContent).toBe(
      i18n.t("setup.envHelper.fieldBadge.not-set"),
    );
  });

  // task-454: snapshot value is suppressed from the env-helper panel when
  // its source is "default" (server's localhost fallback).
  it("Secrets step: snapshot publicAppUrlSource='default' suppresses the PUBLIC_APP_URL value in the env-helper panel (task-454)", async () => {
    await navigateToSecretsStep({ publicAppUrlSource: "default" });

    const row = container.querySelector<HTMLElement>(
      '[data-testid="env-row-PUBLIC_APP_URL"]',
    );
    expect(row, "PUBLIC_APP_URL env-helper row should render").not.toBeNull();
    expect(row!.textContent).not.toContain("existing.example.com");
    expect(row!.textContent).not.toContain("localhost");
    expect(row!.dataset.unset).toBe("true");

    const value = container.querySelector<HTMLElement>(
      '[data-testid="env-row-value-PUBLIC_APP_URL"]',
    )!;
    expect(value.textContent).toBe(
      i18n.t("setup.envHelper.placeholders.publicAppUrl"),
    );

    const copyBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="button-copy-env-PUBLIC_APP_URL"]',
    )!;
    expect(copyBtn.disabled).toBe(true);
  });

  it("Secrets step: snapshot publicAppUrlSource='env' or 'file' continues to surface the persisted value in the env-helper panel (task-454)", async () => {
    // Targeted fix: env/file sources still surface the persisted value.
    await navigateToSecretsStep({ publicAppUrlSource: "env" });
    let row = container.querySelector<HTMLElement>(
      '[data-testid="env-row-PUBLIC_APP_URL"]',
    )!;
    expect(row.textContent).toContain("existing.example.com");
    expect(row.dataset.unset).toBe("false");

    // Re-mount in the file branch.
    act(() => {
      root.unmount();
    });
    container.remove();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await navigateToSecretsStep({ publicAppUrlSource: "file" });
    row = container.querySelector<HTMLElement>(
      '[data-testid="env-row-PUBLIC_APP_URL"]',
    )!;
    expect(row.textContent).toContain("existing.example.com");
    expect(row.dataset.unset).toBe("false");
  });

  it("SMTP Host badge: shows 'not-set' when the snapshot has no deferred SMTP host (task-370)", async () => {
    // Snapshot-driven: the previous behaviour inferred the badge from
    // `smtpHost.trim()`, so typing into the input flipped it to
    // "file" before any save. Task-370 moved the source-of-truth onto
    // the snapshot's `smtpHostSource`, so the badge now stays
    // "not-set" until the wizard reloads with the deferred SMTP block
    // visible in `data/db-config.json`. Typing into the input no
    // longer changes the badge — that's the whole point: the badge
    // describes what the running server WILL see, not what the
    // operator has typed but not yet saved.
    await navigateToSmtpStep({ smtpHostSource: "none" });

    let badge = badgeAt("field-source-badge-smtp-host");
    expect(badge.dataset.source).toBe("not-set");
    expect(badge.textContent).toBe(
      i18n.t("setup.envHelper.fieldBadge.not-set"),
    );

    setInputValue("input#smtp-host", "smtp.example.com");
    await flush();

    // Still "not-set" — the snapshot hasn't been re-read, and the
    // local input value doesn't drive the badge any more.
    badge = badgeAt("field-source-badge-smtp-host");
    expect(badge.dataset.source).toBe("not-set");
  });

  it("SMTP Host badge: shows 'file' immediately when the snapshot reports a previously deferred host (task-370)", async () => {
    // Reproduces the exact scenario task-370 was opened to fix: on a
    // prior wizard run the operator saved an SMTP host into
    // `data/db-config.json`, then came back to the wizard. With the
    // old local-input inference the badge stayed "Not set" until they
    // re-typed the host. With the snapshot-driven badge it now
    // reflects "From wizard file" the moment the wizard loads.
    await navigateToSmtpStep({ smtpHostSource: "file" });

    const badge = badgeAt("field-source-badge-smtp-host");
    expect(badge.dataset.source).toBe("file");
    expect(badge.textContent).toBe(
      i18n.t("setup.envHelper.fieldBadge.file"),
    );
  });

  it("SMTP Host badge: shows 'env' when a future SMTP_HOST host-env is set (task-370)", async () => {
    // The snapshot intentionally grades smtpHostSource in the same
    // env/file/none shape as the secrets even though the server does
    // not currently consume an SMTP_HOST env var, so a future
    // env-promoted value can render the blue "From host env" badge
    // without further client churn. Locking that contract here so a
    // future shape change has to update the test consciously.
    await navigateToSmtpStep({ smtpHostSource: "env" });

    const badge = badgeAt("field-source-badge-smtp-host");
    expect(badge.dataset.source).toBe("env");
    expect(badge.textContent).toBe(
      i18n.t("setup.envHelper.fieldBadge.env"),
    );
  });

  it("Public URL badge: re-fetches the snapshot after a successful Save Public URL so the badge transitions from 'not-set' to 'file' (task-375)", async () => {
    // Mirrors the task-371 SMTP test below for the Public URL save
    // path. Task-367 wired the Public URL badge to the bootstrap
    // snapshot's `publicAppUrlSource` field instead of inferring it
    // from the locally typed input. That fixed the
    // "previously-saved Public URL stays invisible" problem on a
    // return visit, but it also meant that within a single wizard
    // session the badge stayed "Not set" if the operator routed
    // back to the Public URL step right after clicking Save &
    // Continue — the snapshot the wizard cached on the Secrets
    // step was now stale and wasn't re-read until the page
    // reloaded. Task-375 has handleSavePublicUrl re-fetch
    // /api/setup/secrets and call setSecrets after a successful
    // save so the badge would flip to "From wizard file" the
    // moment the value is persisted, matching what the operator
    // just did.
    //
    // We exercise the full refresh path with a deferred-promise mock
    // for the second secrets call so we can pin three distinct
    // observations:
    //   1. Pre-save the badge is "not-set" because the bootstrap
    //      snapshot reports publicAppUrlSource: "default".
    //   2. Mid-save, while the post-save secrets refresh is still in
    //      flight, the badge stays "not-set". This guards two
    //      regressions in one shot: the wizard must not flip the
    //      badge eagerly from the locally typed Public URL (the
    //      task-367 contract) AND it must actually initiate the
    //      refresh (the second /api/setup/secrets call must have
    //      been issued).
    //   3. Post-save, after we resolve the deferred refresh with
    //      publicAppUrlSource: "file", the wizard processes the new
    //      snapshot and auto-navigates to the Admin step. The
    //      Public URL step unmounts as part of that auto-navigation
    //      (handled in handleSavePublicUrl's setStep("admin") call
    //      after the refresh await), so by the time we re-query the
    //      DOM the badge is gone — but the literal "→ file"
    //      transition is proven by the fact that the wizard reached
    //      Admin at all: setStep is only called after the refresh
    //      await resolves, which means setSecrets(snapshot) ran
    //      with the "file" body. The shared snapshot-driven render
    //      path is locked in by the sibling "shows 'file' wording
    //      when only the wizard has the value" test above, so we
    //      don't need to re-prove the badge mapping here.
    let secretsCallCount = 0;
    let resolveSecondSecrets: ((response: Response) => void) | null = null;
    const secondSecretsPromise = new Promise<Response>((resolve) => {
      resolveSecondSecrets = resolve;
    });

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/setup/test-connection")) {
        return Promise.resolve(
          jsonResponse(200, { success: true, latencyMs: 1 }),
        );
      }
      if (url.includes("/api/setup/initialize")) {
        return Promise.resolve(
          jsonResponse(200, { success: true, phases: [] }),
        );
      }
      if (url.endsWith("/api/setup/secrets")) {
        secretsCallCount++;
        if (secretsCallCount === 1) {
          // First call (Secrets step mount): publicAppUrlSource
          // "default" so the Public URL badge starts as "not-set".
          return Promise.resolve(
            jsonResponse(200, {
              hasConnectionUrl: true,
              databaseUrlSource: "env",
              hasSessionSecret: true,
              sessionSecretSource: "file",
              sessionSecretValue: "session-value-1234567890",
              hasEncryptionKey: true,
              encryptionKeySource: "file",
              encryptionKeyValue: "encryption-value-1234567890",
              publicAppUrl: "",
              publicAppUrlSource: "default",
              smtpHostSource: "none",
            }),
          );
        }
        // Second call (post-save refresh): held open via deferred
        // promise so the test can verify the in-flight badge state
        // before resolving with the new snapshot.
        return secondSecretsPromise;
      }
      if (url.endsWith("/api/setup/status")) {
        return Promise.resolve(
          jsonResponse(200, {
            setupRequired: true,
            adminExists: false,
            publicAppUrl: "",
            hasSessionSecret: true,
            hasEncryptionKey: true,
            dbHealth: { reachable: true, lastErrorCode: null },
          }),
        );
      }
      if (url.includes("/api/setup/public-url")) {
        return Promise.resolve(jsonResponse(200, { success: true }));
      }
      if (url.includes("/api/auth/user")) {
        return Promise.resolve(
          jsonResponse(401, { message: "Not authed" }),
        );
      }
      return Promise.resolve(jsonResponse(200, {}));
    });

    // Walk the wizard to the Public URL step inline rather than via
    // navigateToPublicUrlStep — that helper installs its own
    // fetchMock implementation and would clobber the deferred
    // wiring above.
    render(<Setup />);
    await flush();
    setInputValue("input#url", "postgres://u:p@h:5432/db");
    clickByLabel(i18n.t("setup.connect.testButton"));
    await flush();
    await flush();
    clickByLabel(i18n.t("setup.actions.continue"));
    await flush();
    clickByLabel(i18n.t("setup.initialize.initialize"));
    await flush();
    await flush();
    await flush();
    clickByLabel(i18n.t("setup.actions.continue"));
    await flush();

    // (1) Pre-save: badge mirrors the bootstrap snapshot's
    // publicAppUrlSource:"default" → operator-friendly "Not set".
    let badge = badgeAt("field-source-badge-public-url");
    expect(badge.dataset.source).toBe("not-set");
    expect(badge.textContent).toBe(
      i18n.t("setup.envHelper.fieldBadge.not-set"),
    );
    expect(
      secretsCallCount,
      "wizard must fetch /api/setup/secrets exactly once on the way " +
        "to the Public URL step (the Secrets-step mount)",
    ).toBe(1);

    // Fill the Public URL form and click Save & Continue.
    setInputValue("input#purl", "https://app.example.com");
    const saveBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="button-save-public-url"]',
    );
    if (!saveBtn) throw new Error("save-public-url button not rendered");
    act(() => {
      saveBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    // After this flush the public-url POST has resolved and
    // handleSavePublicUrl has dispatched the second
    // /api/setup/secrets fetch — which we intentionally hold open
    // via secondSecretsPromise. The wizard is therefore parked
    // between the public-url success and the setStep("admin") call
    // that the refresh await gates.
    await flush();
    await flush();

    // (2) Mid-save, in-flight: badge must NOT flip yet.
    //   * Without task-375, the wizard would never re-fetch the
    //     snapshot, so the badge would stay "not-set" forever — we
    //     guard that lower bound by asserting the second secrets
    //     fetch was actually issued (secretsCallCount >= 2).
    //   * Without task-367 (snapshot-driven badge), typing into
    //     #purl above would have flipped the badge to "file"
    //     eagerly — we guard that upper bound by asserting the
    //     badge is still "not-set" while the refresh is in flight.
    badge = badgeAt("field-source-badge-public-url");
    expect(
      badge.dataset.source,
      "badge must stay not-set until setSecrets runs with the " +
        "refreshed snapshot",
    ).toBe("not-set");
    expect(
      secretsCallCount,
      "handleSavePublicUrl must initiate the post-save secrets refresh",
    ).toBeGreaterThanOrEqual(2);

    // (3) Resolve the refresh with publicAppUrlSource:"file". The
    // wizard will call setSecrets(snapshot) and then
    // setStep("admin") sequentially after the same await microtask
    // boundary, so React 18's automatic batching commits both
    // updates in one render — the Public URL step unmounts as part
    // of the same render that flips the badge to "file". By the
    // time `act` exits, the wizard is on the Admin step.
    await act(async () => {
      if (!resolveSecondSecrets) {
        throw new Error("deferred secrets resolver missing");
      }
      resolveSecondSecrets(
        jsonResponse(200, {
          hasConnectionUrl: true,
          databaseUrlSource: "env",
          hasSessionSecret: true,
          sessionSecretSource: "file",
          sessionSecretValue: "session-value-1234567890",
          hasEncryptionKey: true,
          encryptionKeySource: "file",
          encryptionKeyValue: "encryption-value-1234567890",
          publicAppUrl: "https://app.example.com",
          publicAppUrlSource: "file",
          smtpHostSource: "none",
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    // The Public URL step has unmounted — the badge testid is no
    // longer in the DOM. This proves setStep("admin") ran, which
    // means the refresh await above completed: setSecrets(snapshot)
    // was called with the "file" body before navigation.
    expect(
      container.querySelector('[data-testid="field-source-badge-public-url"]'),
      "Public URL step must unmount once the wizard auto-navigates " +
        "to Admin after the post-save refresh resolves",
    ).toBeNull();
    // Sanity check: we are actually on the Admin step, not stuck on
    // an error state. The create-admin button only renders on the
    // Admin step, so its presence pins the navigation.
    expect(
      container.querySelector('[data-testid="button-create-admin"]'),
      "wizard must reach the Admin step after the post-save secrets " +
        "refresh resolves",
    ).not.toBeNull();
  });

  it("SMTP Host badge: re-fetches the snapshot after a successful Save SMTP so the badge transitions from 'not-set' to 'file' (task-371)", async () => {
    // Task-370 wired the SMTP host badge to the bootstrap snapshot's
    // `smtpHostSource` field instead of inferring it from the locally
    // typed input. That fixed the "previously-deferred host stays
    // invisible" problem on a return visit, but it also meant that
    // within a single wizard session the badge stayed "Not set"
    // right after the operator clicked Save SMTP — the snapshot the
    // wizard cached on the Secrets step was now stale and wasn't
    // re-read until the page reloaded. Task-371 has handleSaveSmtp
    // re-fetch /api/setup/secrets and call setSecrets after a
    // successful save so the badge flips to "From wizard file" the
    // moment the deferred row is written, matching what the operator
    // just did.
    //
    // We exercise the full refresh path with a deferred-promise mock
    // for the second secrets call so we can pin three distinct
    // observations:
    //   1. Pre-save the badge is "not-set" because the bootstrap
    //      snapshot reports smtpHostSource: "none".
    //   2. Mid-save, while the post-save secrets refresh is still in
    //      flight, the badge stays "not-set". This guards two
    //      regressions in one shot: the wizard must not flip the
    //      badge eagerly from the locally typed host (the task-370
    //      contract) AND it must actually initiate the refresh (the
    //      second /api/setup/secrets call must have been issued).
    //   3. Post-save, after we resolve the deferred refresh with
    //      smtpHostSource: "file", the wizard processes the new
    //      snapshot and auto-navigates to the Done step. The SMTP
    //      step unmounts as part of that auto-navigation (handled in
    //      handleSaveSmtp's setStep("crm") call after the refresh
    //      await), so by the time we re-query the DOM the badge is
    //      gone — but the literal "→ file" transition is proven by
    //      the fact that the wizard reached Done at all: setStep is
    //      only called after the refresh await resolves, which means
    //      setSecrets(snapshot) ran with the "file" body. The shared
    //      snapshot-driven render path is locked in by the sibling
    //      "shows 'file' immediately when the snapshot reports a
    //      previously deferred host" test above, so we don't need to
    //      re-prove the badge mapping here.
    let secretsCallCount = 0;
    let resolveSecondSecrets: ((response: Response) => void) | null = null;
    const secondSecretsPromise = new Promise<Response>((resolve) => {
      resolveSecondSecrets = resolve;
    });

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/setup/test-connection")) {
        return Promise.resolve(
          jsonResponse(200, { success: true, latencyMs: 1 }),
        );
      }
      if (url.includes("/api/setup/initialize")) {
        return Promise.resolve(
          jsonResponse(200, { success: true, phases: [] }),
        );
      }
      if (url.endsWith("/api/setup/secrets")) {
        secretsCallCount++;
        if (secretsCallCount === 1) {
          // First call (Secrets step mount): smtpHostSource "none"
          // so the SMTP badge starts as "not-set".
          return Promise.resolve(
            jsonResponse(200, {
              hasConnectionUrl: true,
              databaseUrlSource: "env",
              hasSessionSecret: true,
              sessionSecretSource: "file",
              sessionSecretValue: "session-value-1234567890",
              hasEncryptionKey: true,
              encryptionKeySource: "file",
              encryptionKeyValue: "encryption-value-1234567890",
              publicAppUrl: "https://existing.example.com",
              publicAppUrlSource: "env",
              smtpHostSource: "none",
            }),
          );
        }
        if (secretsCallCount === 2) {
          // Second call (post-save refresh from handleSavePublicUrl
          // — added in task-375). The wizard now re-fetches the
          // secrets snapshot after the Public URL save too, so the
          // SMTP-step deferred refresh has shifted from the 2nd
          // call to the 3rd. Resolve this one immediately with the
          // same shape as the first so the wizard can transition
          // into the Admin step and we can keep walking forward.
          return Promise.resolve(
            jsonResponse(200, {
              hasConnectionUrl: true,
              databaseUrlSource: "env",
              hasSessionSecret: true,
              sessionSecretSource: "file",
              sessionSecretValue: "session-value-1234567890",
              hasEncryptionKey: true,
              encryptionKeySource: "file",
              encryptionKeyValue: "encryption-value-1234567890",
              publicAppUrl: "https://app.example.com",
              publicAppUrlSource: "env",
              smtpHostSource: "none",
            }),
          );
        }
        // Third call (post-save SMTP refresh): held open via
        // deferred promise so the test can verify the in-flight
        // badge state before resolving with the new snapshot.
        return secondSecretsPromise;
      }
      if (url.endsWith("/api/setup/status")) {
        return Promise.resolve(
          jsonResponse(200, {
            setupRequired: true,
            adminExists: false,
            publicAppUrl: "",
            hasSessionSecret: true,
            hasEncryptionKey: true,
            dbHealth: { reachable: true, lastErrorCode: null },
          }),
        );
      }
      if (url.includes("/api/setup/public-url")) {
        return Promise.resolve(jsonResponse(200, { success: true }));
      }
      if (url.includes("/api/setup/create-admin")) {
        return Promise.resolve(jsonResponse(200, { success: true }));
      }
      if (url.includes("/api/setup/smtp")) {
        return Promise.resolve(jsonResponse(200, { success: true }));
      }
      if (url.includes("/api/setup/crm-provider")) {
        return Promise.resolve(jsonResponse(200, { success: true, provider: "salesforce" }));
      }
      if (url.includes("/api/health")) {
        return Promise.resolve(
          jsonResponse(200, { ok: true, uptimeSec: 1 }),
        );
      }
      if (url.includes("/api/auth/user")) {
        return Promise.resolve(
          jsonResponse(401, { message: "Not authed" }),
        );
      }
      return Promise.resolve(jsonResponse(200, {}));
    });

    // Walk the wizard to the SMTP step inline rather than via
    // navigateToSmtpStep — that helper installs its own fetchMock
    // implementation and would clobber the deferred wiring above.
    render(<Setup />);
    await flush();
    setInputValue("input#url", "postgres://u:p@h:5432/db");
    clickByLabel(i18n.t("setup.connect.testButton"));
    await flush();
    await flush();
    clickByLabel(i18n.t("setup.actions.continue"));
    await flush();
    clickByLabel(i18n.t("setup.initialize.initialize"));
    await flush();
    await flush();
    await flush();
    clickByLabel(i18n.t("setup.actions.continue"));
    await flush();
    setInputValue("input#purl", "https://app.example.com");
    clickByLabel(i18n.t("setup.actions.continue"));
    await flush();
    await flush();
    setInputValue("input#afn", "Ada");
    setInputValue("input#ae", "ada@example.com");
    setInputValue("input#ap", "Correct-Horse-Battery-Staple-9");
    const createBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="button-create-admin"]',
    );
    if (!createBtn) throw new Error("create-admin button not rendered");
    act(() => {
      createBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    await flush();

    // (1) Pre-save: badge mirrors the bootstrap snapshot's
    // smtpHostSource:"none" → operator-friendly "Not set".
    let badge = badgeAt("field-source-badge-smtp-host");
    expect(badge.dataset.source).toBe("not-set");
    expect(badge.textContent).toBe(
      i18n.t("setup.envHelper.fieldBadge.not-set"),
    );
    expect(
      secretsCallCount,
      "wizard must fetch /api/setup/secrets twice on the way to the " +
        "SMTP step: once on the Secrets-step mount, and once as the " +
        "post-save refresh handleSavePublicUrl performs (task-375)",
    ).toBe(2);

    // Fill the SMTP form and click Save.
    setInputValue("input#smtp-host", "smtp.example.com");
    setInputValue("input#smtp-user", "noreply@example.com");
    setInputValue("input#smtp-from", "noreply@example.com");
    const saveBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="button-save-smtp"]',
    );
    if (!saveBtn) throw new Error("save-smtp button not rendered");
    act(() => {
      saveBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    // After this flush the SMTP POST has resolved and handleSaveSmtp
    // has dispatched the second /api/setup/secrets fetch — which we
    // intentionally hold open via secondSecretsPromise. The wizard
    // is therefore parked between the SMTP success and the
    // setStep("crm") call that the refresh await gates.
    await flush();
    await flush();

    // (2) Mid-save, in-flight: badge must NOT flip yet.
    //   * Without task-371, the wizard would never re-fetch the
    //     snapshot, so the badge would stay "not-set" forever — we
    //     guard that lower bound by asserting the SMTP-save
    //     secrets fetch was actually issued (secretsCallCount >= 3
    //     since task-375 added an additional fetch during the
    //     public-url save the SMTP test walks through).
    //   * Without task-370 (snapshot-driven badge), typing into
    //     #smtp-host above would have flipped the badge to "file"
    //     eagerly — we guard that upper bound by asserting the
    //     badge is still "not-set" while the refresh is in flight.
    badge = badgeAt("field-source-badge-smtp-host");
    expect(
      badge.dataset.source,
      "badge must stay not-set until setSecrets runs with the " +
        "refreshed snapshot",
    ).toBe("not-set");
    expect(
      secretsCallCount,
      "handleSaveSmtp must initiate the post-save secrets refresh",
    ).toBeGreaterThanOrEqual(3);

    // (3) Resolve the refresh with smtpHostSource:"file". The
    // wizard will call setSecrets(snapshot) and then setStep("crm")
    // sequentially after the same await microtask boundary, so
    // React 18's automatic batching commits both updates in one
    // render — the SMTP step unmounts as part of the same render
    // that flips the badge to "file". By the time `act` exits, the
    // wizard is on the Done step.
    await act(async () => {
      if (!resolveSecondSecrets) {
        throw new Error("deferred secrets resolver missing");
      }
      resolveSecondSecrets(
        jsonResponse(200, {
          hasConnectionUrl: true,
          databaseUrlSource: "env",
          hasSessionSecret: true,
          sessionSecretSource: "file",
          sessionSecretValue: "session-value-1234567890",
          hasEncryptionKey: true,
          encryptionKeySource: "file",
          encryptionKeyValue: "encryption-value-1234567890",
          publicAppUrl: "https://existing.example.com",
          publicAppUrlSource: "env",
          smtpHostSource: "file",
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    // A second flush for any lingering effect work (auto-runHealthChecks
    // on Done entry, callout state settles, etc.).
    await flush();

    // The SMTP step has unmounted — the badge testid is no longer
    // in the DOM. This proves setStep("crm") ran, which means the
    // refresh await above completed: setSecrets(snapshot) was
    // called with the "file" body before navigation.
    expect(
      container.querySelector('[data-testid="field-source-badge-smtp-host"]'),
      "SMTP step must unmount once the wizard auto-navigates to Done " +
        "after the post-save refresh resolves",
    ).toBeNull();
    // Sanity check: we are actually on the next step (CRM), not stuck
    // on an error state. `button-save-crm` only renders there, so its
    // presence pins the navigation.
    expect(
      container.querySelector('[data-testid="button-save-crm"]'),
      "wizard must reach the CRM step after the post-save secrets " +
        "refresh resolves",
    ).not.toBeNull();
  });
});

describe("Setup — fieldBadge i18n keys are populated for all 6 locales", () => {
  // Locks the contract that the operator-friendly badge labels exist
  // in every locale bundle the app ships. A missing key would
  // otherwise silently fall back to the raw i18n key string and look
  // broken to users on de-DE / es-ES / fr-FR / it-IT / pt-BR.
  const LOCALES = ["en", "de", "es", "fr", "it", "pt"] as const;
  const SOURCES = ["env", "file", "wizard", "not-set"] as const;

  for (const locale of LOCALES) {
    it(`${locale}: every fieldBadge.* key resolves to a non-empty string`, async () => {
      await i18n.changeLanguage(locale);
      for (const src of SOURCES) {
        const key = `setup.envHelper.fieldBadge.${src}`;
        const value = i18n.t(key);
        expect(value, `${locale}:${key} missing`).not.toBe(key);
        expect(value.length, `${locale}:${key} empty`).toBeGreaterThan(0);
      }
    });
  }
});
