import { describe, expect, it } from "vitest";
import { demoAccountAbbreviation, demoProjectBaseName } from "../demo-project-names";

describe("demo project names", () => {
  it("abbreviates faker company names", () => {
    expect(demoAccountAbbreviation("[demo] Robel, Quitzon and Bechtelar")).toBe("RQB");
    expect(demoAccountAbbreviation("[demo] Tillman - Stokes")).toBe("TS");
    expect(demoAccountAbbreviation("[demo] West Inc")).toBe("WEST");
    expect(demoAccountAbbreviation("[demo] ")).toBe("ACCT");
  });

  it("joins the account and solution abbreviations", () => {
    expect(demoProjectBaseName("RQB", ["IGA", "PAM"])).toBe("RQB-IGA-PAM");
    expect(demoProjectBaseName("WEST", ["", "AAN"])).toBe("WEST-AAN");
  });
});
