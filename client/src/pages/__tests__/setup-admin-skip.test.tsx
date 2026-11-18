// @vitest-environment happy-dom
//
// Component-level coverage for the Setup wizard's "admin already exists"
// skip path. The bootstrap `/api/setup/create-admin` route returns
// `403 + { errorCode: "adminAlreadyExists" }` whenever the database
// already has an approved admin user — this is common when an operator
// re-runs the wizard against an already-initialized database (e.g. after
// a Dokploy redeploy that re-points at the same Postgres). Without the
// lock UI, the operator could only ever see a red "Permission Denied"
// toast and had no way forward, because the form is permanently broken
// for them. This file locks the UX contract on both detection paths:
//
//   * **Pre-emptive**: `/api/setup/status` reports `adminExists: true`
//     when the wizard lands on the admin step, so we render the amber
//     "skip ahead" callout *before* the operator even types anything.
//   * **Reactive**: when the status check is unavailable / out of date,
//     submitting the form returns 403 + `adminAlreadyExists` and we flip
//     into the same lock state without showing the raw error toast.
//
// The lock UI must:
//   1. Render the `data-testid="admin-already-exists-lock"` callout.
//   2. Provide a `data-testid="button-skip-admin-step"` button that
//      navigates the wizard to the SMTP step.
//   3. Disable every admin form input (firstName, lastName, email,
//      password) so the form is visibly inert — leaving fields editable
//      would let the operator type a full password and only learn the
//      bootstrap is locked when Submit silently does nothing.
//   4. Disable the Submit button so the 403 → toast loop stops.
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

  // happy-dom doesn't ship navigator.clipboard. The wizard never copies
  // anything in this test but the env-helper renders on every step and
  // hits navigator.clipboard.writeText if anything goes weird, so wire
  // up a no-op spy to keep the failure modes localized to the assertions
  // below.
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

function clickByTestId(testId: string) {
  const btn = container.querySelector<HTMLButtonElement>(
    `[data-testid="${testId}"]`,
  );
  if (!btn) throw new Error(`button ${testId} not rendered`);
  act(() => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

// Most "Continue" / step-advance buttons in the wizard don't carry
// data-testids (they're stable Continue / Test / Initialize buttons that
// the design team styled as primary actions, not testable affordances).
// We locate them by their localized label, mirroring the
// `clickTestConnection` recipe used in `setup-connect-tip.test.tsx`.
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

// Drives the wizard from the initial Database step all the way to the
// Admin step. Each Continue click in the real flow waits on a different
// fetch (test-connection, initialize, /api/setup/secrets,
// /api/setup/public-url) — the helper mocks every one of those endpoints
// to return success so the test stays focused on the admin-step lock UX
// rather than re-validating earlier steps.
async function navigateToAdminStep(opts: {
  /** What the /api/setup/status mock returns once we hit admin step. */
  statusAdminExists: boolean;
}) {
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/setup/test-connection")) {
      return Promise.resolve(
        jsonResponse(200, { success: true, latencyMs: 12 }),
      );
    }
    if (url.includes("/api/setup/initialize")) {
      return Promise.resolve(
        jsonResponse(200, { success: true, phases: [] }),
      );
    }
    if (url.endsWith("/api/setup/secrets")) {
      return Promise.resolve(
        jsonResponse(200, {
          sessionSecret: { value: "ss", source: "file" },
          encryptionKey: { value: "ek", source: "file" },
        }),
      );
    }
    if (url.includes("/api/setup/public-url")) {
      return Promise.resolve(jsonResponse(200, { success: true }));
    }
    if (url.endsWith("/api/setup/status")) {
      return Promise.resolve(
        jsonResponse(200, {
          adminExists: opts.statusAdminExists,
          settingsExist: false,
          smtpConfigured: false,
          secretsConfigured: true,
        }),
      );
    }
    if (url.includes("/api/auth/user")) {
      return Promise.resolve(jsonResponse(401, { message: "Not authed" }));
    }
    return Promise.resolve(jsonResponse(200, {}));
  });

  render(<Setup />);
  await flush();

  // Step 1 — Database
  setInputValue("input#url", "postgres://u:p@h:5432/db");
  clickByLabel(i18n.t("setup.connect.testButton"));
  await flush();
  await flush();
  // The chevron-suffixed Continue label uses a wrapping ChevronRight icon;
  // happy-dom strips the SVG text, so the trimmed label matches the t() key.
  clickByLabel(i18n.t("setup.actions.continue"));
  await flush();

  // Step 2 — Initialize / schema. handleInitialize calls setStep("secrets")
  // on success, so a single click suffices.
  clickByLabel(i18n.t("setup.initialize.initialize"));
  await flush();
  await flush();
  await flush();

  // Step 3 — Secrets — the helper auto-loads via useEffect; just continue.
  clickByLabel(i18n.t("setup.actions.continue"));
  await flush();

  // Step 4 — Public URL. handleSavePublicUrl calls setStep("admin") on
  // success — the button reuses the shared `setup.actions.continue` label
  // since the network call is implicit.
  setInputValue("input#purl", "https://app.example.com");
  clickByLabel(i18n.t("setup.actions.continue"));
  await flush();
  await flush();

  // Now on the Admin step — the pre-emptive useEffect fires here.
  await flush();
}

describe("Setup — admin-already-exists lock (skip path)", () => {
  it("renders the lock callout pre-emptively when /api/setup/status reports an existing admin", async () => {
    await navigateToAdminStep({ statusAdminExists: true });

    const lock = container.querySelector(
      '[data-testid="admin-already-exists-lock"]',
    );
    expect(lock, "lock callout should render pre-emptively").not.toBeNull();
    expect(lock!.textContent).toContain(
      i18n.t("setup.admin.adminExistsLock.title"),
    );
    expect(lock!.textContent).toContain(
      i18n.t("setup.admin.adminExistsLock.description"),
    );

    // The skip button must use the contract test id the spec calls for so
    // downstream Playwright suites and operator support docs can reference
    // it without breaking on a future rename.
    const skip = container.querySelector(
      '[data-testid="button-skip-admin-step"]',
    );
    expect(skip, "skip button should render with the contract test id")
      .not.toBeNull();
    expect(skip!.textContent).toContain(
      i18n.t("setup.admin.adminExistsLock.skip"),
    );
  });

  it("disables every admin form input AND the Create button when locked", async () => {
    await navigateToAdminStep({ statusAdminExists: true });

    for (const testId of [
      "input-admin-first-name",
      "input-admin-last-name",
      "input-admin-email",
      "input-admin-password",
      "button-create-admin",
    ] as const) {
      const el = container.querySelector<HTMLInputElement | HTMLButtonElement>(
        `[data-testid="${testId}"]`,
      );
      expect(el, `${testId} should render`).not.toBeNull();
      expect(el!.disabled, `${testId} should be disabled when locked`).toBe(
        true,
      );
    }
  });

  it("Skip button advances the wizard from admin → smtp", async () => {
    await navigateToAdminStep({ statusAdminExists: true });
    expect(
      container.querySelector('[data-testid="button-skip-admin-step"]'),
      "must be on admin step before clicking Skip",
    ).not.toBeNull();

    clickByTestId("button-skip-admin-step");
    await flush();

    // The SMTP step's "From address" input is unique to that step and
    // confirms the wizard navigated away from the admin lock.
    const smtpFrom = container.querySelector("input#smtp-from");
    expect(smtpFrom, "wizard should have advanced to the SMTP step")
      .not.toBeNull();
  });

  it("shows a localized retry-oriented message and keeps the form usable when the create-admin POST returns 503 + adminProbeFailed", async () => {
    // The server returns this code when it managed to open a transient
    // admin-bootstrap connection but then could not reach the database
    // to verify whether an approved admin already exists (a transient
    // DB hiccup, not a permanent lock). The wizard must:
    //   1. Show the localized retry copy (NOT the raw server string).
    //   2. Keep every form field's value AND keep the Create button
    //      enabled so the operator can simply click again.
    //   3. NOT flip into the adminLocked state — that path is for
    //      adminAlreadyExists only and would hide the Create button
    //      behind a Skip callout.
    await navigateToAdminStep({ statusAdminExists: false });

    fetchMock.mockImplementationOnce((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      expect(url).toContain("/api/setup/create-admin");
      return Promise.resolve(
        jsonResponse(503, {
          success: false,
          error: "Could not verify whether an admin already exists. Please retry shortly.",
          errorCode: "adminProbeFailed",
        }),
      );
    });

    setInputValue("input#afn", "Ada");
    setInputValue("input#ae", "ada@example.com");
    setInputValue("input#ap", "Correct-Horse-Battery-Staple-9");
    clickByTestId("button-create-admin");
    await flush();
    await flush();

    // Lock callout must NOT appear — this is a transient failure, not
    // the "an admin already exists" terminal state.
    expect(
      container.querySelector('[data-testid="admin-already-exists-lock"]'),
      "lock callout must NOT appear for the transient probe-failure case",
    ).toBeNull();

    // Localized retry message renders (not the raw server text).
    const localized = i18n.t("setup.errors.adminProbeFailed");
    expect(container.textContent).toContain(localized);

    // Form values are preserved so the operator can just retry.
    const firstName = container.querySelector<HTMLInputElement>("input#afn");
    const email = container.querySelector<HTMLInputElement>("input#ae");
    const password = container.querySelector<HTMLInputElement>("input#ap");
    expect(firstName?.value).toBe("Ada");
    expect(email?.value).toBe("ada@example.com");
    expect(password?.value).toBe("Correct-Horse-Battery-Staple-9");
    expect(firstName?.disabled, "first name must remain editable").toBe(false);
    expect(email?.disabled, "email must remain editable").toBe(false);
    expect(password?.disabled, "password must remain editable").toBe(false);

    // Create button stays clickable so the operator can retry inline
    // without re-typing — this is the "Try again" affordance.
    const createBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="button-create-admin"]',
    );
    expect(createBtn, "Create Admin button must still be rendered").not.toBeNull();
    expect(
      createBtn!.disabled,
      "Create Admin button must remain enabled so retry is one click",
    ).toBe(false);
  });

  it("flips into the lock state when the create-admin POST returns 403 + adminAlreadyExists", async () => {
    // Simulate the reactive path: the status endpoint claims no admin
    // exists (perhaps the cached snapshot was stale), the operator types a
    // full admin form and submits, the server is the one that catches the
    // duplicate. The wizard must NOT show the raw red error toast — it
    // must flip the lock state so the friendly skip callout appears.
    await navigateToAdminStep({ statusAdminExists: false });

    // No lock callout yet — the status check claimed there was no admin.
    expect(
      container.querySelector('[data-testid="admin-already-exists-lock"]'),
      "lock should not appear pre-emptively when status says no admin",
    ).toBeNull();

    // Re-arm fetch so the next /api/setup/create-admin POST returns 403.
    fetchMock.mockImplementationOnce((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      expect(url).toContain("/api/setup/create-admin");
      return Promise.resolve(
        jsonResponse(403, {
          success: false,
          errorCode: "adminAlreadyExists",
          message: "Admin already exists",
        }),
      );
    });

    setInputValue("input#afn", "Ada");
    setInputValue("input#ae", "ada@example.com");
    setInputValue("input#ap", "Correct-Horse-Battery-Staple-9");
    clickByTestId("button-create-admin");
    await flush();
    await flush();

    const lock = container.querySelector(
      '[data-testid="admin-already-exists-lock"]',
    );
    expect(lock, "lock should appear after the 403 response").not.toBeNull();
    const skip = container.querySelector(
      '[data-testid="button-skip-admin-step"]',
    );
    expect(skip).not.toBeNull();
  });
});
