// @vitest-environment happy-dom
//
// Regression coverage for the post-reset auto-login probe on the
// reset-password page (`client/src/pages/reset-password.tsx`),
// originally fixed in task #535 and pinned here in task #539.
//
// Background: the pre-task-535 implementation of `handleSubmit` did
//
//     const response = await apiRequest('POST', '/api/auth/reset-password', …);
//     if (response.ok) { …auto-login… }
//
// `apiRequest` returns the *parsed JSON body* on success (not a
// Response), so `response.ok` was always `undefined` → the
// auto-login branch never ran, the operator never got their session
// cookie, and the success toast was missed entirely. The current
// code awaits `apiRequest` (parsed JSON), reads `data.email`, and
// fires a second `apiRequest('POST', '/api/login', …)` followed by
// `markSessionEstablished()` and a hard navigation to `/`.
//
// This test mounts the real `ResetPassword` component, stubs `fetch`
// so /api/auth/reset-password echoes the canonical lowercased email
// the server returns post-task-535, and asserts that:
//   1. The follow-up `/api/login` call actually happens with the
//      echoed email + the password the user just chose.
//   2. `markSessionEstablished()` is called so the useAuth bounce
//      from task #420 sends the operator to the right place on the
//      next page load.
//   3. The hard navigation to `/` fires (we stub `window.location`
//      so happy-dom doesn't try to navigate the test harness).
//
// If anyone re-introduces the `response.ok` shape or removes the
// auto-login probe, all three assertions fail loudly.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import ResetPassword from "../reset-password";
import i18n from "@/i18n";

// Stub the session marker so we can assert the auto-login branch
// flipped it to "established" without touching real localStorage and
// without leaking state across tests in the same worker. We import
// the mocked module after declaring the mock so the spies are the
// same instance the component sees.
vi.mock("@/lib/session-marker", () => ({
  markSessionEstablished: vi.fn(),
  clearSessionEstablished: vi.fn(),
  hasSessionEstablished: vi.fn(() => false),
}));
import * as sessionMarker from "@/lib/session-marker";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

// A password the shared admin-validation helper accepts (>=10 chars,
// upper+lower+digit+special). The submit handler trims its value, so
// we deliberately add no surrounding whitespace here — the trim
// behaviour is exercised by other tests; here we only care about
// the auto-login probe shape.
const NEW_PASSWORD = "NewP@ssw0rd!";
// What the server echoes back on a successful reset. Post-task-535
// the server lower-cases this on the way out so the auto-login probe
// hits the same normalization the login route does.
const ECHOED_EMAIL = "jane.doe@example.com";

let container: HTMLDivElement;
let root: Root;
let originalFetch: typeof globalThis.fetch | undefined;
let fetchMock: ReturnType<typeof vi.fn>;
let originalLocation: Location;
// Explicit call signature avoids vitest 4.x's
// `Mock<Procedure | Constructable>` ambiguity, which makes a bare
// `vi.fn()` look like it could be a constructor — TS then rejects
// `hrefSetter(value)` with "Did you mean to include 'new'?".
// Pinning the signature here keeps `npm test --typecheck` green.
let hrefSetter: Mock<(value: unknown) => void>;

interface RecordedRequest {
  url: string;
  method: string;
  body: unknown;
}
let requests: RecordedRequest[];

beforeEach(async () => {
  await i18n.changeLanguage("en");
  requests = [];

  // Mount under a token-bearing URL so the page renders the form
  // branch (the invalid-token branch never reaches handleSubmit).
  window.history.replaceState(
    {},
    "",
    "/reset-password?token=test-reset-token",
  );

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    let body: unknown = undefined;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    requests.push({ url, method, body });

    if (url.includes("/api/version")) {
      // AuthShell mounts AppVersionFooter which probes /api/version.
      return new Response(JSON.stringify({ version: "v0.7.10" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("/api/auth/reset-password")) {
      // Mirror the post-task-535 success envelope: a `message` plus
      // the canonical lowercased email so the FE auto-login probe
      // has the value it needs to call /api/login on the operator's
      // behalf without re-prompting for it.
      return new Response(
        JSON.stringify({
          message: "Password reset successful",
          email: ECHOED_EMAIL,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (url.includes("/api/login")) {
      // The auto-login probe — return the same shape the real
      // /api/login route returns on success (a `user` object plus a
      // `message`), so apiRequest parses it without throwing.
      return new Response(
        JSON.stringify({
          user: {
            id: "user_test_reset_auto_login",
            email: ECHOED_EMAIL,
            firstName: "Ian",
            lastName: "Andersen",
            role: "Admin",
            isApproved: true,
          },
          message: "Login successful",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  // Stub window.location.href assignment so happy-dom doesn't try to
  // navigate the test harness on the success branch's
  // `window.location.href = "/"`. Same Proxy pattern used by
  // landing-setup-complete-banner.test.tsx.
  originalLocation = window.location;
  hrefSetter = vi.fn<(value: unknown) => void>();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: new Proxy(originalLocation, {
      set(target, prop, value) {
        if (prop === "href") {
          hrefSetter(value);
          return true;
        }
        (target as unknown as Record<string | symbol, unknown>)[prop] = value;
        return true;
      },
      get(target, prop) {
        return (target as unknown as Record<string | symbol, unknown>)[prop];
      },
    }),
  });

  document.documentElement.classList.remove("dark");
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
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
  vi.clearAllMocks();
  document.documentElement.classList.remove("dark");
  window.history.replaceState({}, "", "/");
});

// <AuthShell> resolves the admin-uploaded login background through
// useBrandingAsset → useQuery, so the tree needs a QueryClientProvider.
function render() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <ResetPassword />
      </QueryClientProvider>,
    );
  });
}

function setInputValue(input: HTMLInputElement, value: string) {
  // React tracks the previous value on the DOM node — we have to
  // poke the native setter so the synthetic onChange handler sees a
  // real change and updates state.
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("ResetPassword — auto-login probe regression (task #539)", () => {
  it("calls /api/login with the echoed email after a successful reset and marks the session established", async () => {
    render();
    await flush();

    const newPassword = container.querySelector<HTMLInputElement>(
      "input#newPassword",
    );
    const confirmPassword = container.querySelector<HTMLInputElement>(
      "input#confirmPassword",
    );
    expect(newPassword, "newPassword input must render").toBeTruthy();
    expect(confirmPassword, "confirmPassword input must render").toBeTruthy();

    act(() => {
      setInputValue(newPassword!, NEW_PASSWORD);
      setInputValue(confirmPassword!, NEW_PASSWORD);
    });
    await flush();

    const form = container.querySelector<HTMLFormElement>("form");
    expect(form, "reset-password form must render").toBeTruthy();
    act(() => {
      form!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    // Allow handleSubmit → reset-password fetch → auto-login fetch →
    // markSessionEstablished → location.href chain to settle. Each
    // `await apiRequest(…)` is one microtask tick; flush a few extra
    // for safety.
    await flush();
    await flush();
    await flush();
    await flush();

    // 1. Reset call happened with the new password.
    const resetCall = requests.find((r) =>
      r.url.includes("/api/auth/reset-password"),
    );
    expect(resetCall, "reset-password call must fire").toBeTruthy();
    expect(resetCall!.method).toBe("POST");
    expect(resetCall!.body).toMatchObject({
      token: "test-reset-token",
      newPassword: NEW_PASSWORD,
    });

    // 2. Auto-login probe happened with the echoed email and the
    // password the user just chose. This is the *whole point* of
    // this test — pre-task-535, this call never fired because
    // `response.ok` was undefined and the success branch was dead
    // code.
    const loginCall = requests.find((r) => r.url.includes("/api/login"));
    expect(
      loginCall,
      "auto-login probe must fire after a successful reset",
    ).toBeTruthy();
    expect(loginCall!.method).toBe("POST");
    expect(loginCall!.body).toMatchObject({
      email: ECHOED_EMAIL,
      password: NEW_PASSWORD,
    });

    // 3. Session marker flipped + hard navigation to `/` queued.
    expect(sessionMarker.markSessionEstablished).toHaveBeenCalledTimes(1);
    expect(hrefSetter).toHaveBeenCalledWith("/");
  });

  it("does NOT navigate or mark the session when the auto-login probe itself fails", async () => {
    // If the silent /api/login call comes back non-2xx (e.g. the
    // operator must complete an MFA enrollment first, or the
    // account is suddenly locked), the page must keep the operator
    // on the reset-password screen and surface the auto-login
    // failure copy instead of pretending login succeeded. This
    // guards the catch branch added in task #535.
    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = (init?.method ?? "GET").toUpperCase();
        let body: unknown = undefined;
        if (typeof init?.body === "string") {
          try {
            body = JSON.parse(init.body);
          } catch {
            body = init.body;
          }
        }
        requests.push({ url, method, body });

        if (url.includes("/api/version")) {
          return new Response(JSON.stringify({ version: "v0.7.10" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.includes("/api/auth/reset-password")) {
          return new Response(
            JSON.stringify({
              message: "Password reset successful",
              email: ECHOED_EMAIL,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (url.includes("/api/login")) {
          return new Response(
            JSON.stringify({ message: "MFA enrollment required" }),
            {
              status: 403,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        return new Response("{}", { status: 200 });
      },
    );

    render();
    await flush();

    const newPassword = container.querySelector<HTMLInputElement>(
      "input#newPassword",
    );
    const confirmPassword = container.querySelector<HTMLInputElement>(
      "input#confirmPassword",
    );
    act(() => {
      setInputValue(newPassword!, NEW_PASSWORD);
      setInputValue(confirmPassword!, NEW_PASSWORD);
    });
    await flush();

    const form = container.querySelector<HTMLFormElement>("form");
    act(() => {
      form!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await flush();
    await flush();
    await flush();
    await flush();

    // The probe still fires (the FE doesn't know it'll fail).
    const loginCall = requests.find((r) => r.url.includes("/api/login"));
    expect(loginCall, "auto-login probe must still be attempted").toBeTruthy();

    // But the failure branch must NOT mark the session established
    // and must NOT navigate the operator away — they need to see
    // the auto-login-failed copy and use the manual sign-in path.
    expect(sessionMarker.markSessionEstablished).not.toHaveBeenCalled();
    expect(hrefSetter).not.toHaveBeenCalled();
  });
});
