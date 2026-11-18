import { describe, expect, it } from "vitest";
import { DEFAULT_PROJECT_WORKING_DAYS, parseProjectWorkingDays, projectWorkingDays } from "../project-duration";
import { countWorkingDays } from "../../client/src/components/project-form/utils";
import { addWorkingDays } from "../working-calendar";

describe("project template duration", () => {
  it("accepts whole numbers from 1 to 260, from numbers or form text", () => {
    expect(parseProjectWorkingDays(20)).toBe(20);
    expect(parseProjectWorkingDays("20")).toBe(20);
    expect(parseProjectWorkingDays(260)).toBe(260);
  });

  it("treats anything else as not set", () => {
    for (const v of [0, -3, 261, 2.5, "", " ", "abc", null, undefined, {}]) {
      expect(parseProjectWorkingDays(v)).toBeNull();
    }
  });

  it("falls back to 14 working days", () => {
    expect(projectWorkingDays(null)).toBe(DEFAULT_PROJECT_WORKING_DAYS);
    expect(projectWorkingDays({ durationWorkingDays: null })).toBe(14);
    expect(projectWorkingDays({ durationWorkingDays: 5 })).toBe(5);
  });

  it("skips weekends and holidays when filling the end date", () => {
    const cal = { holidays: new Set(["2026-11-26"]) }; // Thanksgiving, a Thursday
    // Monday Nov 23 + 5 working days: Tue, Wed, Fri, Mon, Tue.
    expect(addWorkingDays("2026-11-23", 5, cal)).toBe("2026-12-01");
  });

  it("counts working days from start to end, both ends included", () => {
    const cal = { holidays: new Set(["2026-11-26"]) };
    expect(countWorkingDays("2026-11-23", "2026-12-01", cal)).toBe(6);
    expect(countWorkingDays("2026-11-28", "2026-11-29", cal)).toBe(0);
    expect(countWorkingDays("2026-12-01", "2026-11-23", cal)).toBe(0);
    expect(countWorkingDays("", "2026-11-23", cal)).toBe(0);
  });
});
