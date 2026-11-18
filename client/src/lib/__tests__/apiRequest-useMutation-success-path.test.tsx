// @vitest-environment happy-dom
//
// Targeted success-path coverage for the WRITE side of task #754.
//
// Every fixed call site followed the same shape:
//
//   const m = useMutation({
//     mutationFn: async (input) => {
//       const res = await apiRequest("POST", "/api/...", input);
//       return res.json();   // <-- the bug: TypeError, swallowed
//                            //     by the mutation into onError
//     },
//     onSuccess: (data) => { ...consume data here... },
//   });
//
// The fix everywhere was to drop the `.json()` and return the
// already-parsed body directly. This test exercises the *real*
// `apiRequest` (no shim) inside a real `useMutation` to lock the
// success-path contract that ALL of those write surfaces now depend
// on:
//
//   - The `onSuccess` callback receives the parsed body.
//   - The mutation is in the `success` (not `error`) state.
//   - `mutateAsync` resolves with the parsed body so callers that
//     `await` it (e.g. CriteriaBuilderStepper's appendLink mutation,
//     the salesforce linkage modal's chained mutations) receive a
//     usable object instead of a Response.
//
// Component-level surfaces (LinkageModal, ConflictToast, EssentialsSection,
// LoginManagementSection, ImportUsersDialog,
// CriteriaBuilderStepper, TAPDrawer, etc.) all follow this exact same
// shape; the lint script
// `scripts/check-api-request-json-usage.ts` (wired into `npm run build`
// as `lint:api-request-json`) statically blocks any future
// reintroduction at those sites.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
} from "@tanstack/react-query";

import { apiRequest } from "../queryClient";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const ORIGINAL_FETCH = globalThis.fetch;
let container: HTMLDivElement;
let root: Root;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  globalThis.fetch = ORIGINAL_FETCH;
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

interface CapturedMutation {
  mutateAsync: (input: { name: string }) => Promise<unknown>;
  status: "idle" | "pending" | "success" | "error";
  data: unknown;
  error: unknown;
}

interface SuccessHarnessProps {
  url: string;
  capture: { current: CapturedMutation | null };
  onSuccessSeen: { current: unknown };
}

function SuccessHarness({ url, capture, onSuccessSeen }: SuccessHarnessProps) {
  const mutation = useMutation({
    mutationFn: async (input: { name: string }) => {
      // Mirrors the post-fix shape used everywhere in the task #754
      // sweep: just `await apiRequest(...)` and return the parsed
      // body directly.
      return await apiRequest("POST", url, input);
    },
    onSuccess: (data) => {
      onSuccessSeen.current = data;
    },
  });
  capture.current = {
    mutateAsync: mutation.mutateAsync,
    status: mutation.status,
    data: mutation.data,
    error: mutation.error,
  };
  return null;
}

async function renderHarness(
  url: string,
): Promise<{
  capture: { current: CapturedMutation | null };
  onSuccessSeen: { current: unknown };
}> {
  const capture: { current: CapturedMutation | null } = { current: null };
  const onSuccessSeen: { current: unknown } = { current: null };
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <SuccessHarness
          url={url}
          capture={capture}
          onSuccessSeen={onSuccessSeen}
        />
      </QueryClientProvider>,
    );
  });
  // Initial paint so the harness captures `mutateAsync`.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return { capture, onSuccessSeen };
}

async function drain(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
}

describe("useMutation + real apiRequest success path (task #754)", () => {
  it("resolves mutateAsync with the parsed body and invokes onSuccess with the same value", async () => {
    const serverBody = { id: 99, name: "Acme", createdAt: "2026-04-30T00:00:00Z" };
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse(serverBody, 201),
    ) as typeof globalThis.fetch;

    const { capture, onSuccessSeen } = await renderHarness("/api/widgets");
    const resolved = await capture.current!.mutateAsync({ name: "Acme" });
    await drain();

    // `mutateAsync` resolves with the parsed body — callers like
    // CriteriaBuilderStepper.handleCreate that read `data.id` off
    // the result depend on this exact shape.
    expect(resolved).toEqual(serverBody);
    // `onSuccess(data)` sees the same object — every fixed mutation
    // in the task #754 sweep writes through this callback.
    expect(onSuccessSeen.current).toEqual(serverBody);
    // The mutation lands in the `success` state (NOT `error` — the
    // pre-fix bug bounced into error because `.json()` threw).
    expect(capture.current!.status).toBe("success");
    expect(capture.current!.error).toBeNull();
  });

  it("a mutation that returns a 204 with no body still completes successfully (data === null)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(null, { status: 204 }),
    ) as typeof globalThis.fetch;

    const { capture, onSuccessSeen } = await renderHarness("/api/widgets/99");
    const resolved = await capture.current!.mutateAsync({ name: "ignored" });
    await drain();

    expect(resolved).toBeNull();
    expect(onSuccessSeen.current).toBeNull();
    expect(capture.current!.status).toBe("success");
  });
});
