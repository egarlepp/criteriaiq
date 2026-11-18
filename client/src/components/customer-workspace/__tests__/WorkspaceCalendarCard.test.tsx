import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Keys come back as text, with count for the plural day label.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) => (options?.count != null ? `${key}:${options.count}` : key),
    i18n: { language: "en-US" },
  }),
}));

import { WorkspaceCalendarCard, type CalendarEvent } from "../WorkspaceCalendarCard";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const today = new Date(2026, 10, 10);
const events: CalendarEvent[] = [
  { key: "start", date: "2026-11-02", kind: "start", label: "Project starts" },
  { key: "todo-1", date: "2026-11-23", kind: "todo", label: "Access review" },
  { key: "todo-2", date: "2026-11-23", kind: "todo", label: "SoD report", overdue: true },
  { key: "dec", date: "2026-12-05", kind: "end", label: "Project ends" },
  { key: "none", date: null, kind: "milestone", label: "No date" },
];

function render() {
  act(() => root.render(<WorkspaceCalendarCard events={events} today={today} locale="en-US" />));
}

function listedLabels(): string[] {
  const section = container.querySelector("ul.flex.flex-col.gap-1\\.5");
  return Array.from(section?.querySelectorAll("li") ?? []).map((li) => li.textContent ?? "");
}

describe("WorkspaceCalendarCard", () => {
  it("lists the month's dated events in date order and skips undated ones", () => {
    render();
    const labels = listedLabels();
    expect(labels).toHaveLength(3);
    expect(labels[0]).toContain("Project starts");
    expect(labels[1]).toContain("Access review");
    expect(labels.join(" ")).not.toContain("No date");
    expect(labels.join(" ")).not.toContain("Project ends");
  });

  it("makes only days with events clickable, and a click lists that day", () => {
    render();
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button[role=gridcell]"));
    // Nov 2, Nov 23 and Dec 5 (shown in the trailing week).
    expect(buttons).toHaveLength(3);
    const nov23 = buttons.find((button) => button.getAttribute("aria-label")?.includes(":2"));
    expect(nov23).toBeDefined();
    act(() => nov23!.click());
    expect(listedLabels()).toHaveLength(2);
    expect(nov23!.getAttribute("aria-pressed")).toBe("true");
  });

  it("moves to the next month", () => {
    render();
    const next = container.querySelector<HTMLButtonElement>('button[aria-label="workspace.calendar.next"]');
    act(() => next!.click());
    const labels = listedLabels();
    expect(labels).toHaveLength(1);
    expect(labels[0]).toContain("Project ends");
  });
});
