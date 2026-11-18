import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
    i18n: { language: "en-US" },
  }),
}));

import { ProjectBriefCard } from "../ProjectBriefCard";

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

const tabs = () => Array.from(container.querySelectorAll<HTMLButtonElement>('[data-testid^="workspace-brief-tab-"]'));
const panel = () => container.querySelector('[data-testid="workspace-brief-panel"]')?.textContent ?? "";

describe("ProjectBriefCard", () => {
  it("shows only the sections with content and switches between them", () => {
    act(() =>
      root.render(
        <ProjectBriefCard
          problem="Unreviewed privileged accounts."
          objective="  "
          solution="Automated certifications."
          regulations={["SOX", "GDPR"]}
          startDate="2026-09-05"
          endDate="2026-12-24"
          today={new Date(2026, 10, 11)}
          locale="en-US"
        />,
      ),
    );
    expect(tabs().map((tab) => tab.dataset.testid)).toEqual([
      "workspace-brief-tab-problem",
      "workspace-brief-tab-solution",
      "workspace-brief-tab-policy",
    ]);
    expect(panel()).toContain("Unreviewed privileged accounts.");
    act(() => tabs()[2].click());
    expect(tabs()[2].getAttribute("aria-pressed")).toBe("true");
    expect(panel()).toContain("SOX");
    expect(panel()).toContain("GDPR");
  });

  it("draws the date ribbon with the duration and moves with the arrow keys", () => {
    act(() =>
      root.render(
        <ProjectBriefCard problem="P" objective="O" startDate="2026-09-05" endDate="2026-12-24" today={new Date(2026, 10, 11)} locale="en-US" />,
      ),
    );
    const ribbon = container.querySelector('[data-testid="workspace-brief-ribbon"]');
    expect(ribbon?.textContent).toContain('workspace.brief.days:{"count":110}');
    act(() => tabs()[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(tabs()[1].getAttribute("aria-pressed")).toBe("true");
  });

  it("says when nothing is written and no dates are set", () => {
    act(() => root.render(<ProjectBriefCard locale="en-US" />));
    expect(container.querySelector('[data-testid="workspace-brief-empty"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="workspace-brief-nodates"]')?.textContent).toBe("workspace.brief.noDates");
  });
});
