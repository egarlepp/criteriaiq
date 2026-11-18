import { describe, it, expect } from "vitest";
import { PROJECT_TYPES } from "@shared/project-types";
import { planProjectDocuments } from "../demo-artifacts";

const base = { accountName: "[demo] Acme Corp", solutionNames: ["Identity Governance"], type: "POV" };

describe("planProjectDocuments", () => {
  it("gives an early project its kickoff deck and test plan only", () => {
    const docs = planProjectDocuments({ ...base, stage: "early" });
    expect(docs.map((d) => d.givenName)).toEqual(["POV Kickoff Deck", "POV Test Plan"]);
  });

  it("adds the architecture once work is under way, and a readout once closed", () => {
    expect(planProjectDocuments({ ...base, stage: "mid" }).map((d) => d.givenName)).toContain("Solution Architecture");
    for (const stage of ["won", "lost"]) {
      const names = planProjectDocuments({ ...base, stage }).map((d) => d.givenName);
      expect(names).toContain("POV Readout");
    }
    expect(planProjectDocuments({ ...base, stage: "late" }).map((d) => d.givenName)).not.toContain("POV Readout");
  });

  it("uses document types the upload dialog offers and drops the [demo] prefix from text", () => {
    const offered = new Set(["Architecture", "Product Info", "Visio", "Reference", "Documentation", "Battlecard",
      "Datasheet", "Internal Notes", "Win/Loss Info", "Demo Notes", "Other"]);
    for (const doc of planProjectDocuments({ ...base, stage: "won" })) {
      expect(offered.has(doc.documentType)).toBe(true);
      expect(doc.description).not.toContain("[demo]");
      expect(doc.sections.length).toBeGreaterThan(0);
    }
  });
});

describe("PROJECT_TYPES", () => {
  it("lists the types the project form offers", () => {
    expect([...PROJECT_TYPES]).toEqual(["POC", "POV", "Trial", "Partner", "RTU"]);
  });
});
