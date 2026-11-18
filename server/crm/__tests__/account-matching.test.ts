// @vitest-environment node
//
// Which CRM accounts an unlinked account may be: same domain (strong), same
// name once suffixes are dropped (likely), or a close name (possible).
import { describe, expect, it } from "vitest";
import { matchCandidate, normalizeCompanyName, rankCrmMatches, searchTermsFor, websiteDomain } from "../account-matching";

const subject = { accountName: "Acme Corporation", approvedEmailDomains: ["acme.com"] };
const candidate = (id: string, name: string, website: string | null = null) => ({ id, name, url: `https://crm/${id}`, website });

describe("normalizeCompanyName", () => {
  it.each([
    ["Acme, Inc.", "acme"],
    ["The Acme Co.", "acme"],
    ["Smith & Sons GmbH", "smith and sons"],
    ["Société Générale S.A.", "societe generale"],
    ["Inc", "inc"],
  ])("%s → %s", (raw, normalized) => {
    expect(normalizeCompanyName(raw)).toBe(normalized);
  });
});

describe("websiteDomain", () => {
  it("strips the scheme, www and path", () => {
    expect(websiteDomain("https://www.Acme.com/about")).toBe("acme.com");
    expect(websiteDomain("acme.co.uk")).toBe("acme.co.uk");
    expect(websiteDomain("localhost")).toBeNull();
    expect(websiteDomain(null)).toBeNull();
  });
});

describe("matchCandidate", () => {
  it("rates a shared email domain strongest, whatever the name", () => {
    expect(matchCandidate(subject, candidate("1", "ACME Holdings Group", "www.acme.com"))).toMatchObject({
      strength: "strong",
      reason: "domain",
    });
  });

  it("rates an equal normalized name likely", () => {
    expect(matchCandidate(subject, candidate("2", "ACME, Inc."))).toMatchObject({ strength: "likely", reason: "name" });
  });

  it("rates a close name possible, and ignores distant ones", () => {
    expect(matchCandidate({ accountName: "Globex Industries", approvedEmailDomains: [] }, candidate("3", "Globex Industrie"))).toMatchObject({
      strength: "possible",
      reason: "similarName",
    });
    expect(matchCandidate(subject, candidate("4", "Acme Logistics"))).toBeNull();
  });
});

describe("rankCrmMatches", () => {
  it("orders strongest first, skips excluded ids and caps at three", () => {
    const ranked = rankCrmMatches(
      { accountName: "Globex", approvedEmailDomains: ["globex.io"] },
      [
        candidate("a", "Globexx"),
        candidate("b", "Globex Inc"),
        candidate("c", "Something Else", "https://globex.io"),
        candidate("d", "Globex LLC"),
        candidate("e", "Globex Ltd"),
        candidate("b", "Globex Inc"),
      ],
      new Set(["d"]),
    );
    expect(ranked.map((m) => m.id)).toEqual(["c", "b", "e"]);
  });
});

describe("searchTermsFor", () => {
  it("searches the full name and a distinctive first word", () => {
    expect(searchTermsFor("Acme Holdings Ltd")).toEqual(["Acme Holdings Ltd", "acme"]);
    expect(searchTermsFor("IBM")).toEqual(["IBM"]);
  });
});
