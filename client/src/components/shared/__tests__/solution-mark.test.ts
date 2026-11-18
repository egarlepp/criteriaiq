// @vitest-environment node
//
// The short name a solution shows in tables: its abbreviation, else initials.

import { describe, expect, it } from "vitest";
import { solutionShortName } from "../solution-mark";

describe("solutionShortName", () => {
  it("uses the abbreviation when the solution has one", () => {
    expect(solutionShortName("Identity Governance", "IGA")).toBe("IGA");
    expect(solutionShortName("Identity Governance", "  PAM ")).toBe("PAM");
  });

  it("falls back to the name's initials", () => {
    expect(solutionShortName("Identity Governance", "")).toBe("IG");
    expect(solutionShortName("Privileged Access Management", null)).toBe("PAM");
    expect(solutionShortName("Cloud-Native Data Loss Prevention Suite")).toBe("CNDL");
  });

  it("uses the first letters of a one-word name", () => {
    expect(solutionShortName("Analytics")).toBe("ANA");
  });
});
