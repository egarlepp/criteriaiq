// The edit form's reset effect depends on `users`. Before the fix, every
// render handed it a fresh `[]` while /api/users was loading, so the effect
// re-ran on every render and React stopped with "Maximum update depth
// exceeded". The loading fallbacks must keep one identity across renders.
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useProjectFormData } from "../useProjectFormData";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("useProjectFormData loading fallbacks", () => {
  it("returns the same empty lists on every render while queries are pending", async () => {
    // A query function that never resolves keeps every list in its loading state.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, queryFn: () => new Promise(() => undefined) } },
    });
    const seen: Array<ReturnType<typeof useProjectFormData>> = [];
    let bump: () => void = () => undefined;

    function Probe() {
      const [, setTick] = useState(0);
      bump = () => setTick((n) => n + 1);
      seen.push(useProjectFormData({ isAuthenticated: true }));
      return null;
    }

    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <Probe />
        </QueryClientProvider>,
      );
    });
    await act(async () => bump());

    const first = seen[0];
    const last = seen[seen.length - 1];
    expect(seen.length).toBeGreaterThan(1);
    expect(last.users).toEqual([]);
    expect(last.users).toBe(first.users);
    expect(last.customers).toBe(first.customers);
    expect(last.salesEngineers).toBe(first.salesEngineers);

    await act(async () => root.unmount());
    client.clear();
  });
});
