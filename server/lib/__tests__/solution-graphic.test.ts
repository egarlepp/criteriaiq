import { describe, expect, it } from "vitest";
import { solutionGraphicPath } from "../solution-graphic";

describe("solutionGraphicPath", () => {
  it("serves a bare filename from system/solution-icons", () => {
    expect(solutionGraphicPath("Netwrix Auditor.svg")).toBe("/api/files/system/solution-icons/Netwrix%20Auditor.svg");
  });
  it("keeps a path or URL as it is", () => {
    expect(solutionGraphicPath("/api/files/x.png")).toBe("/api/files/x.png");
    expect(solutionGraphicPath("https://cdn.example.com/a.png")).toBe("https://cdn.example.com/a.png");
  });
  it("is null for none or blank", () => {
    expect(solutionGraphicPath("none")).toBeNull();
    expect(solutionGraphicPath("")).toBeNull();
    expect(solutionGraphicPath(null)).toBeNull();
  });
});
