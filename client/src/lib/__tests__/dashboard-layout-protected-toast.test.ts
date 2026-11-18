// @vitest-environment happy-dom
//
// Locks the centralized friendly-toast handler that surfaces the
// server's `DASHBOARD_LAYOUT_PROTECTED` 409 (Task #555) for any
// caller that flows through `apiRequest` (Task #561).
//
// The dashboard builder's "Delete Current" menu item is currently
// disabled for the seeded built-in Overview row, so the disabled UI
// alone prevents the typical accidental DELETE. This test guards the
// other side of the loop: if a future flow (a bulk-cleanup screen, a
// dev-tool POST, an admin script) ever does fire
// `DELETE /api/dashboard-layout/:id` against the protected row, the
// shared `apiRequest` helper recognizes the 409 + stable `code` and
// shows a calm, plain-language toast instead of the generic
// "HTTP 409: Conflict" string. The error continues to throw so
// callers can still react to the failure.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest, ApiError } from "../queryClient";

const ORIGINAL_FETCH = globalThis.fetch;

let toastMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  toastMock = vi.fn();
  const useToastModule = await import("@/hooks/use-toast");
  vi.spyOn(useToastModule, "toast").mockImplementation(
    toastMock as unknown as typeof useToastModule.toast,
  );
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

function mockFetchOnce(response: { status: number; body: unknown }) {
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    }),
  ) as typeof globalThis.fetch;
}

describe("apiRequest — DASHBOARD_LAYOUT_PROTECTED handling", () => {
  it("shows a friendly error toast and throws an ApiError when the server returns 409 with the protected code", async () => {
    const serverMessage =
      "This is a built-in dashboard and cannot be deleted. " +
      "You can edit its widgets and sections, but it must remain on the system.";
    mockFetchOnce({
      status: 409,
      body: { code: "DASHBOARD_LAYOUT_PROTECTED", message: serverMessage },
    });

    let caught: unknown;
    try {
      await apiRequest("DELETE", "/api/dashboard-layout/1");
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(409);

    expect(toastMock).toHaveBeenCalledTimes(1);
    const call = toastMock.mock.calls[0]?.[0] as {
      title: string;
      description?: string;
      variant: string;
    };
    expect(call.variant).toBe("error");
    // Title is a plain English string, not an i18n key, so i18n.t
    // returns it unchanged.
    expect(call.title).toBe("Built-in dashboard");
    expect(call.description).toBe(serverMessage);
  });

  it("falls back to the canonical message when the server omits a body message but still emits the protected code", async () => {
    mockFetchOnce({
      status: 409,
      body: { code: "DASHBOARD_LAYOUT_PROTECTED" },
    });

    await expect(
      apiRequest("DELETE", "/api/dashboard-layout/2"),
    ).rejects.toBeInstanceOf(ApiError);

    expect(toastMock).toHaveBeenCalledTimes(1);
    const call = toastMock.mock.calls[0]?.[0] as { description?: string };
    expect(call.description).toBe(
      "This is a built-in dashboard and cannot be deleted. " +
        "You can edit its widgets and sections, but it must remain on the system.",
    );
  });

  it("does not show the friendly toast for unrelated 409 responses", async () => {
    mockFetchOnce({
      status: 409,
      body: { message: "Some other conflict", code: "SOME_OTHER_CODE" },
    });

    await expect(
      apiRequest("DELETE", "/api/dashboard-layout/3"),
    ).rejects.toBeInstanceOf(ApiError);

    expect(toastMock).not.toHaveBeenCalled();
  });

  it("does not show the friendly toast for non-409 errors that happen to mention the code", async () => {
    mockFetchOnce({
      status: 500,
      body: { code: "DASHBOARD_LAYOUT_PROTECTED", message: "boom" },
    });

    await expect(
      apiRequest("DELETE", "/api/dashboard-layout/4"),
    ).rejects.toBeInstanceOf(ApiError);

    expect(toastMock).not.toHaveBeenCalled();
  });
});
