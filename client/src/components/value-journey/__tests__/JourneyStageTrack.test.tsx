import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeJourney } from "@shared/value-journey";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
    i18n: { language: "en-US" },
  }),
}));

const journey = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock("../use-value-journey", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../use-value-journey")>();
  return { ...actual, useProjectJourney: () => journey };
});

import { JourneyStageTrack } from "../JourneyStageTrack";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const stages = [
  { id: 1, name: "Plan", description: null, iconName: "Search", color: "#1e40af", orderIndex: 0, agreementGate: false },
  { id: 2, name: "Build", description: null, iconName: "Hammer", color: "#0891b2", orderIndex: 1, agreementGate: false },
  { id: 3, name: "Validate", description: null, iconName: "FlaskConical", color: "#d97706", orderIndex: 2, agreementGate: false },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  journey.data = {
    stages: computeJourney({
      stages,
      phases: [
        { id: 10, name: "A", orderIndex: 0, stageId: 1, status: "complete" },
        { id: 20, name: "B", orderIndex: 1, stageId: 2, status: "in_progress" },
        { id: 30, name: "C", orderIndex: 2, stageId: 3, status: "not_started" },
      ],
      criteria: [],
      taskCounts: [],
    }),
    agreement: { status: "none", agreedAt: null, agreedByName: null, requestedAt: null },
  };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("JourneyStageTrack icons variant", () => {
  it("draws one round icon per stage in that stage's color", () => {
    act(() => root.render(<JourneyStageTrack projectId={7} variant="icons" />));
    const done = container.querySelector<HTMLElement>('[data-testid="journey-track-stage-7-stage-1"]')!;
    const current = container.querySelector<HTMLElement>('[data-testid="journey-track-stage-7-stage-2"]')!;
    const upcoming = container.querySelector<HTMLElement>('[data-testid="journey-track-stage-7-stage-3"]')!;
    expect(done.dataset.state).toBe("done");
    expect(done.style.backgroundColor).toMatch(/1e40af|rgb\(30, 64, 175\)/i);
    expect(current.getAttribute("aria-current")).toBe("step");
    expect(current.style.backgroundColor).toMatch(/0891b2|rgb\(8, 145, 178\)/i);
    expect(upcoming.dataset.state).toBe("upcoming");
    // Stages not started yet are grayed out, not drawn in their color.
    expect(upcoming.style.color).toBe("");
    expect(upcoming.className).toContain("text-slate-400");
    expect(upcoming.getAttribute("aria-label")).toContain("Validate");
    // Done stages keep their own icon and add a check; others have no check.
    expect(done.querySelector("svg")).not.toBeNull();
    expect(container.querySelector('[data-testid="journey-track-done-7-stage-1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="journey-track-done-7-stage-2"]')).toBeNull();
  });
});

describe("JourneyStageTrack banner variant", () => {
  it("uses the same stage-colored icons as the portal, with each stage's line", () => {
    act(() => root.render(<JourneyStageTrack projectId={7} variant="banner" />));
    const done = container.querySelector<HTMLElement>('[data-testid="journey-banner-icon-stage-1"]')!;
    const current = container.querySelector<HTMLElement>('[data-testid="journey-banner-icon-stage-2"]')!;
    const upcoming = container.querySelector<HTMLElement>('[data-testid="journey-banner-icon-stage-3"]')!;
    expect(done.style.backgroundColor).toMatch(/1e40af|rgb\(30, 64, 175\)/i);
    expect(current.style.backgroundColor).toMatch(/0891b2|rgb\(8, 145, 178\)/i);
    expect(current.getAttribute("aria-current")).toBe("step");
    expect(upcoming.className).toContain("text-slate-400");
    // Every stage keeps its own icon; only the done one adds the check.
    expect(done.querySelector("svg")).not.toBeNull();
    expect(container.querySelector('[data-testid="journey-banner-done-stage-1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="journey-banner-done-stage-2"]')).toBeNull();
    // The stage card shows its name and the short state line.
    const card = container.querySelector<HTMLElement>('[data-testid="journey-banner-stage-stage-3"]')!;
    expect(card.textContent).toContain("Validate");
    expect(card.textContent).toContain("valueJourney.state.upcoming");
  });
});
