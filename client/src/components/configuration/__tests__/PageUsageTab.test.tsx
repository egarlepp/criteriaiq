// @vitest-environment happy-dom
//
// Page Usage screen: every page in the menu is listed, least used first,
// pages with no views can be shown alone, and a key the menu no longer has is
// still shown, marked as removed.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { PageUsageTab } from "../system-health/PageUsageTab";
import { queryClient } from "@/lib/queryClient";
import i18n from "@/i18n";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let originalFetch: typeof fetch;

const report = {
  days: 90,
  trackingSince: "2026-10-01",
  activeUsers: 4,
  rows: [
    { pageKey: "dashboard", views: 120, users: 4, lastViewedAt: "2026-10-26T10:00:00.000Z" },
    { pageKey: "system-health-backup", views: 2, users: 1, lastViewedAt: "2026-10-20T10:00:00.000Z" },
    { pageKey: "old-retired-page", views: 5, users: 2, lastViewedAt: "2026-10-05T10:00:00.000Z" },
  ],
};

function respond(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers({ "content-type": "application/json" }),
  } as unknown as Response;
}

async function flush() {
  for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); });
}

const rowKeys = () =>
  [...container.querySelectorAll("[data-testid^='page-usage-row-']")].map((r) => r.getAttribute("data-testid")!.replace("page-usage-row-", ""));

beforeEach(async () => {
  await i18n.changeLanguage("en");
  // Column sorts live in the URL; start each test unsorted.
  window.history.replaceState({}, "", "/");
  queryClient.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async () => respond(report)) as unknown as typeof fetch;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  globalThis.fetch = originalFetch;
});

describe("PageUsageTab", () => {
  it("lists every page, least used first, with removed keys marked", async () => {
    await act(async () =>
      root.render(
        <QueryClientProvider client={queryClient}>
          <PageUsageTab />
        </QueryClientProvider>,
      ),
    );
    await flush();
    // Slower machines (e.g. the self-hosted CI runner) need more ticks to render the rows.
    for (let i = 0; i < 50 && rowKeys().length === 0; i++) await flush();
    const keys = rowKeys();
    expect(keys.length).toBeGreaterThan(50);
    expect(keys[keys.length - 1]).toBe("dashboard");
    expect(keys.indexOf("system-health-backup")).toBeLessThan(keys.indexOf("old-retired-page"));
    expect(container.textContent).toContain("No longer in the menu");
    expect(container.textContent).toContain("Admins only");

    const onlyUnused = container.querySelector("#page-usage-only-unused") as HTMLButtonElement;
    await act(async () => onlyUnused.click());
    const unused = rowKeys();
    expect(unused).not.toContain("dashboard");
    expect(unused).not.toContain("old-retired-page");
    expect(unused.length).toBe(keys.length - 3);
  });

  it("sorts by a column header, toggling direction on a second click", async () => {
    await act(async () =>
      root.render(
        <QueryClientProvider client={queryClient}>
          <PageUsageTab />
        </QueryClientProvider>,
      ),
    );
    await flush();
    for (let i = 0; i < 50 && !container.querySelector("th"); i++) await flush();
    const header = (label: string) =>
      [...container.querySelectorAll("th button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement;

    await act(async () => header("Views").click());
    expect(rowKeys()[rowKeys().length - 1]).toBe("dashboard");
    expect(container.querySelector("th[aria-sort='ascending']")?.textContent).toContain("Views");

    await act(async () => header("Views").click());
    const desc = rowKeys();
    expect(desc.slice(0, 3)).toEqual(["dashboard", "old-retired-page", "system-health-backup"]);
    expect(container.querySelector("th[aria-sort='descending']")?.textContent).toContain("Views");

    await act(async () => header("Last viewed").click());
    expect(rowKeys().slice(0, 3)).toEqual(["old-retired-page", "system-health-backup", "dashboard"]);
  });
});
