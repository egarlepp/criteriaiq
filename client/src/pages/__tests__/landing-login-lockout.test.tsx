// @vitest-environment happy-dom
//
// Component-level coverage for the Landing login form's brute-force
// lockout messaging (Task #629).
//
// Background: Task #616 added a 10-attempt / 15-minute per-account
// ceiling and a 30-attempt / 15-minute per-IP ceiling on `/api/login`.
// When the ceiling fires the server returns HTTP 429 with the message
// "Too many login attempts. Please try again later." The login form
// previously treated every non-200 response the same way ("Invalid
// credentials"), so a legitimate user who'd typo'd their password ten
// times in a row had no idea the server had locked them out — they
// just kept guessing.
//
// Task #629 distinguishes 429 from 401 on the front-end and surfaces
// a dedicated lockout notice (with a live mm:ss countdown when the
// server returns a `retryAfterSeconds` payload). This file locks the
// contract:
//   1. A 401 response renders the generic "invalid credentials" copy.
//   2. A 429 response with `code: "LOGIN_RATE_LIMITED"` and a
//      `retryAfterSeconds` payload renders the dedicated lockout
//      notice (NOT the generic invalid-credentials copy) with a
//      visible mm:ss countdown formatted from the server-provided
//      cooldown.
//   3. The lockout notice is keyed off `code` even when the server
//      omits `retryAfterSeconds` — falls back to a static "wait a few
//      minutes" message instead of pretending nothing's wrong.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import Landing from "../landing";
import i18n from "@/i18n";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
let originalFetch: typeof globalThis.fetch | undefined;
let queryClient: QueryClient;

beforeEach(async () => {
  await i18n.changeLanguage("en");

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  fetchMock = vi.fn();
  originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  // Defensive shim — happy-dom doesn't ship navigator.clipboard and
  // Landing never calls it, but a sibling component might in the
  // future and we'd rather not have an unrelated test fail on that.
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });

  // Default: every page-load query (products, version, setup-status)
  // returns a benign empty payload. Individual tests override the
  // /api/login branch via mockImplementation.
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/public/products")) {
      return Promise.resolve(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/api/version")) {
      return Promise.resolve(
        new Response(JSON.stringify({ version: "v0.0.0" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/api/setup/status")) {
      return Promise.resolve(
        new Response(JSON.stringify({ adminExists: false }), {
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

  sessionStorage.clear();
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
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function render() {
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <Landing />
      </QueryClientProvider>,
    );
  });
}

// Open the auth dialog, type credentials, and submit the form.
// Mirrors the user gesture path: click "Get Started" → fill email +
// password → submit. We deliberately drive the submit through the
// form's own dispatchEvent so the React onSubmit handler fires the
// same way a real click on the sign-in button would.
async function openAndSubmitLogin(email: string, password: string) {
  // The "Get Started" button is the only path into the auth dialog
  // on the landing screen. Clicking it sets `showAuthDialog=true`
  // and switches to login mode.
  const getStartedButton = Array.from(
    container.querySelectorAll("button"),
  ).find((b) => b.textContent?.includes(i18n.t("landing.getStarted")));
  if (!getStartedButton) {
    throw new Error("could not find Get Started button");
  }
  await act(async () => {
    getStartedButton.click();
  });
  await flush();

  const emailInput = document.querySelector<HTMLInputElement>("input#email");
  const passwordInput = document.querySelector<HTMLInputElement>("input#password");
  if (!emailInput || !passwordInput) {
    throw new Error("could not find login form inputs");
  }
  await act(async () => {
    const emailSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    emailSetter.call(emailInput, email);
    emailInput.dispatchEvent(new Event("input", { bubbles: true }));
    emailSetter.call(passwordInput, password);
    passwordInput.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await flush();

  const form = emailInput.closest("form");
  if (!form) {
    throw new Error("could not find login form element");
  }
  await act(async () => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  // Two flushes — one for the apiRequest fetch resolution, one for
  // the resulting setState() to commit and re-render.
  await flush();
  await flush();
}

function mockLoginResponse(response: Response) {
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/login")) {
      return Promise.resolve(response);
    }
    if (url.includes("/api/public/products")) {
      return Promise.resolve(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/api/version")) {
      return Promise.resolve(
        new Response(JSON.stringify({ version: "v0.0.0" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/api/setup/status")) {
      return Promise.resolve(
        new Response(JSON.stringify({ adminExists: false }), {
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
}

describe("Landing — login lockout messaging (Task #629)", () => {
  it("renders the generic invalid-credentials notice on a 401 response (regression baseline)", async () => {
    // Sanity check that the EXISTING 401 → "invalid credentials" path
    // still works — we don't want this task's lockout branch to
    // accidentally swallow plain bad-password attempts.
    mockLoginResponse(
      new Response(
        JSON.stringify({ message: "Invalid email or password" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      ),
    );

    render();
    await flush();
    await openAndSubmitLogin("victim@example.com", "wrong-password");

    // Radix Dialog renders into a portal attached to document.body,
    // not into the test's React root container — so we query
    // document.body to find the form's notices.
    expect(
      document.body.querySelector('[data-testid="login-lockout-notice"]'),
      "401 must NOT trigger the brute-force lockout banner",
    ).toBeNull();
    const errorNotice = document.body.querySelector(
      '[data-testid="login-error-notice"]',
    );
    expect(errorNotice, "401 must render the inline invalid-credentials copy").not.toBeNull();
    expect(errorNotice!.textContent).toContain(
      i18n.t("auth.errors.invalidCredentials"),
    );
  });

  it("renders the lockout banner with a mm:ss countdown when /api/login returns 429 with retryAfterSeconds", async () => {
    // Freeze wall-clock time so the countdown effect produces a
    // deterministic mm:ss string we can assert on. 90s → "1:30".
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-28T12:00:00Z"));

    mockLoginResponse(
      new Response(
        JSON.stringify({
          message: "Too many login attempts. Please try again later.",
          code: "LOGIN_RATE_LIMITED",
          retryAfterSeconds: 90,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "90",
          },
        },
      ),
    );

    render();
    await flush();
    await openAndSubmitLogin("victim@example.com", "wrong-password");

    const lockoutNotice = document.body.querySelector(
      '[data-testid="login-lockout-notice"]',
    );
    expect(
      lockoutNotice,
      "429 must render the dedicated lockout banner",
    ).not.toBeNull();
    expect(lockoutNotice!.textContent).toContain("1:30");
    expect(lockoutNotice!.textContent).not.toContain(
      i18n.t("auth.errors.invalidCredentials"),
    );
    // The plain invalid-credentials notice must yield to the lockout
    // banner — they're mutually exclusive in the UI.
    expect(
      document.body.querySelector('[data-testid="login-error-notice"]'),
      "lockout banner must replace, not coexist with, the invalid-credentials copy",
    ).toBeNull();
  });

  it("falls back to the static 'wait a few minutes' copy when 429 omits retryAfterSeconds", async () => {
    // Defensive branch: if a future server change ever drops the
    // `retryAfterSeconds` field (or proxies/intermediaries strip it)
    // the form must still tell the user they're locked out — just
    // without the live countdown.
    mockLoginResponse(
      new Response(
        JSON.stringify({
          message: "Too many login attempts. Please try again later.",
          code: "LOGIN_RATE_LIMITED",
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    render();
    await flush();
    await openAndSubmitLogin("victim@example.com", "wrong-password");

    // Without `retryAfterSeconds` we can't render the dedicated
    // lockout banner (it's gated on `lockoutResetAt`), so the form
    // falls back to the inline error notice with the static
    // "tooManyAttempts" copy. Either way it must NOT show the
    // generic invalid-credentials message.
    const errorNotice = document.body.querySelector(
      '[data-testid="login-error-notice"]',
    );
    expect(
      errorNotice,
      "429 without retryAfterSeconds still must surface a lockout-flavored message",
    ).not.toBeNull();
    expect(errorNotice!.textContent).toContain(
      i18n.t("auth.errors.tooManyAttempts"),
    );
    expect(errorNotice!.textContent).not.toContain(
      i18n.t("auth.errors.invalidCredentials"),
    );
  });
});
