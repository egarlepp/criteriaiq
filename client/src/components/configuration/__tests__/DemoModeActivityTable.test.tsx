// @vitest-environment happy-dom
//
// Recent Activity on the Demo Mode page: events show as a table with the
// action's label, the people's names and readable counts, never raw JSON
// or user ids.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import DemoModeActivityTable, { type DemoEventView } from "../DemoModeActivityTable";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const admin = { id: "user_1791392064216_efx77d214", name: "Ada Admin", email: "ada@x.test" };
const EVENTS: DemoEventView[] = [
  {
    id: 2, action: "demo_seed", createdAt: "2026-11-17T19:48:42.781Z", actor: admin, target: null,
    counts: { customers: 10, projects: 50, mapPhases: 182, mapTasks: 4125 }, wiped: null,
  },
  {
    id: 1, action: "demo_user_enter", createdAt: "2026-11-17T19:40:36.963Z", actor: admin,
    target: { id: "user_2", name: "Ben Brown", email: "ben@x.test" }, counts: null, wiped: null,
  },
];

let container: HTMLDivElement;
let root: Root;

async function render() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(["/api/demo/audit"], EVENTS);
  await act(async () => {
    root.render(
      <QueryClientProvider client={qc}>
        <DemoModeActivityTable />
      </QueryClientProvider>,
    );
  });
}

beforeEach(async () => {
  await i18n.changeLanguage("en-US");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("DemoModeActivityTable", () => {
  it("shows names, action labels and readable counts", async () => {
    await render();
    const text = container.textContent ?? "";
    expect(text).toContain("Seeded");
    expect(text).toContain("Turned on for a user");
    expect(text).toContain("Ada Admin");
    expect(text).toContain("Ben Brown");
    expect(text).toContain("10 accounts, 50 projects");
    expect(text).not.toContain("user_1791392064216");
    expect(text).not.toContain("{");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
  });

  it("expands to every count on Show all", async () => {
    await render();
    const button = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Show all"));
    expect(button?.textContent).toContain("2 more");
    expect(container.textContent).not.toContain("map tasks");
    await act(async () => button!.click());
    expect(container.textContent).toContain("4,125 map tasks");
    expect(container.textContent).toContain("Show less");
  });
});
