import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeJourney, type JourneyCriterionInput, type JourneyPhaseInput } from "@shared/value-journey";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
    i18n: { language: "en-US" },
  }),
}));

const journey = vi.hoisted(() => ({ data: undefined as unknown, isLoading: false }));
vi.mock("@/components/value-journey/use-value-journey", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/value-journey/use-value-journey")>();
  return { ...actual, useProjectJourney: () => journey };
});

import { ValueJourneyCard } from "../ValueJourneyCard";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const stages = [
  { id: 1, name: "Plan", description: "Agree scope.", iconName: "Search", color: "#1e40af", orderIndex: 0, agreementGate: false },
  { id: 2, name: "Build", description: "Install it.", iconName: "Hammer", color: "#0891b2", orderIndex: 1, agreementGate: true },
  { id: 3, name: "Validate", description: "Run the agreed tests.", iconName: "FlaskConical", color: "#d97706", orderIndex: 2, agreementGate: false },
];

const phase = (id: number, orderIndex: number, stageId: number, status: string): JourneyPhaseInput => ({
  id,
  name: `Phase ${id}`,
  orderIndex,
  stageId,
  status,
});

const criterion = (id: number, status: string, priority: string, mapPhaseId: number): JourneyCriterionInput => ({
  id,
  lineNumber: id,
  criterion: `Criterion ${id}`,
  status,
  priority,
  mapPhaseId,
  isActive: true,
});

function setJourney(agreementStatus: "none" | "sent" | "agreed" | "changed" = "agreed") {
  journey.data = {
    stages: computeJourney({
      stages,
      phases: [phase(10, 0, 1, "complete"), phase(20, 1, 2, "in_progress"), phase(30, 2, 3, "not_started")],
      criteria: [criterion(1, "complete", "must_have", 30), criterion(2, "in_progress", "must_have", 30), criterion(3, "complete", "nice_to_have", 30)],
      taskCounts: [{ phaseId: 20, total: 4, done: 1 }],
    }),
    agreement: { status: agreementStatus, agreedAt: agreementStatus === "agreed" ? "2026-10-22T14:14:00Z" : null, agreedByName: "Dana", requestedAt: null },
  };
}

let container: HTMLDivElement;
let root: Root;

function render(props: { isExternalViewer?: boolean; onOpenCriteria?: () => void } = {}) {
  act(() => {
    root.render(<ValueJourneyCard projectId={5} isExternalViewer={props.isExternalViewer ?? false} locale="en-US" onOpenCriteria={props.onOpenCriteria} />);
  });
}

const q = (testId: string) => container.querySelector(`[data-testid="${testId}"]`);

describe("ValueJourneyCard", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    journey.isLoading = false;
    setJourney();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("draws one step per stage and marks the first stage not done as current", () => {
    render();
    expect(q("workspace-journey-stage-stage-1")?.getAttribute("aria-current")).toBeNull();
    expect(q("workspace-journey-stage-stage-2")?.getAttribute("aria-current")).toBe("step");
    expect(q("workspace-journey-count")?.textContent).toBe('valueJourney.card.doneCount:{"done":1,"total":3}');
  });

  it("keeps the details folded until the toggle opens them", () => {
    render();
    expect(q("workspace-journey-detail")).toBeNull();
    expect(q("workspace-journey-toggle")?.getAttribute("aria-expanded")).toBe("false");
    act(() => (q("workspace-journey-toggle") as HTMLButtonElement).click());
    expect(q("workspace-journey-detail")).not.toBeNull();
    act(() => (q("workspace-journey-toggle") as HTMLButtonElement).click());
    expect(q("workspace-journey-detail")).toBeNull();
  });

  it("opens on the current stage and shows another stage when it is picked", () => {
    render();
    act(() => (q("workspace-journey-toggle") as HTMLButtonElement).click());
    expect(q("workspace-journey-detail")?.textContent).toContain("Install it.");
    act(() => (q("workspace-journey-stage-stage-3") as HTMLButtonElement).click());
    expect(q("workspace-journey-detail")?.textContent).toContain("Run the agreed tests.");
    expect(q("workspace-journey-detail")?.textContent).toContain("Criterion 2");
  });

  it("counts must-haves apart from all criteria", () => {
    render();
    act(() => (q("workspace-journey-toggle") as HTMLButtonElement).click());
    const tiles = q("workspace-journey-tiles")?.textContent ?? "";
    expect(tiles).toContain('valueJourney.card.ofTotal:{"done":1,"total":2}');
    expect(tiles).toContain('valueJourney.card.ofTotal:{"done":2,"total":3}');
  });

  it("puts the agreement diamond before the gate stage and opens the criteria from it", () => {
    const onOpenCriteria = vi.fn();
    render({ onOpenCriteria });
    const diamond = q("workspace-journey-agreement") as HTMLButtonElement;
    expect(diamond.title).toContain("valueJourney.agreement.diamondAgreed");
    act(() => diamond.click());
    expect(onOpenCriteria).toHaveBeenCalled();
  });

  it("tells staff when the project has no plan and shows customers nothing", () => {
    journey.data = { stages: [], agreement: { status: "none", agreedAt: null, agreedByName: null, requestedAt: null } };
    render();
    expect(q("workspace-journey-missing")).not.toBeNull();
    render({ isExternalViewer: true });
    expect(container.textContent).toBe("");
  });
});
