import { describe, expect, it } from "vitest";
import { journeyTrackWidth, projectCardMinWidth } from "../PortalProjectCardsGrid";

describe("project card width", () => {
  it("grows with each stage and agreement diamond", () => {
    expect(journeyTrackWidth(0, 0)).toBe(0);
    expect(journeyTrackWidth(1, 0)).toBe(28);
    expect(journeyTrackWidth(5, 1)).toBe(28 + 4 * 16 + 4 * 28 + 16);
  });

  it("fits the widest track beside the buttons, never below the base width", () => {
    expect(projectCardMinWidth([])).toBe(340);
    expect(projectCardMinWidth([{ stages: 1, gates: 0 }])).toBe(340);
    const five = projectCardMinWidth([{ stages: 1, gates: 0 }, { stages: 5, gates: 1 }]);
    expect(five).toBe(journeyTrackWidth(5, 1) + 162 + 62);
    expect(projectCardMinWidth([{ stages: 7, gates: 1 }])).toBeGreaterThan(five);
  });
});
