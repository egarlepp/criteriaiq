import { describe, expect, it } from "vitest";
import i18next from "i18next";
import enUS from "@/i18n/locales/en-US.json";
import deDE from "@/i18n/locales/de-DE.json";
import { FALLBACK_ACCOUNT_STATUSES, FALLBACK_PROJECT_STATUSES } from "../guide-data";
import { buildGuideSearchIndex, normalizeForSearch, searchGuide } from "../guide-search";

async function makeT(lng: "en" | "de") {
  const instance = i18next.createInstance();
  await instance.init({
    lng,
    fallbackLng: "en",
    resources: { en: { translation: enUS }, de: { translation: deDE } },
    interpolation: { escapeValue: false },
  });
  return instance.t;
}

describe("guide search", () => {
  it("strips accents and case", () => {
    expect(normalizeForSearch("  État Énergie ")).toBe("etat energie");
  });

  it("returns nothing for an empty query", async () => {
    const index = buildGuideSearchIndex(await makeT("en"), [], []);
    expect(searchGuide(index, "   ")).toEqual([]);
  });

  it("finds glossary terms, fields and statuses, ranking label hits first", async () => {
    const index = buildGuideSearchIndex(await makeT("en"), FALLBACK_ACCOUNT_STATUSES, FALLBACK_PROJECT_STATUSES);
    const tcc = searchGuide(index, "tcc");
    expect(tcc.some((hit) => hit.id === "term:project.tcc")).toBe(true);

    const status = FALLBACK_ACCOUNT_STATUSES[0];
    const hits = searchGuide(index, status.name);
    expect(hits[0]?.label).toBe(status.name);
    expect(hits[0]?.topic).toBe("statuses");
  });

  it("requires every word to match", async () => {
    const index = buildGuideSearchIndex(await makeT("en"), [], []);
    expect(searchGuide(index, "tcc zzzznotaword")).toEqual([]);
  });

  it("indexes translated labels", async () => {
    const index = buildGuideSearchIndex(await makeT("de"), [], []);
    const hits = searchGuide(index, "erfolgskriterien");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("caps results at the limit", async () => {
    const index = buildGuideSearchIndex(await makeT("en"), FALLBACK_ACCOUNT_STATUSES, FALLBACK_PROJECT_STATUSES);
    expect(searchGuide(index, "e", 3)).toHaveLength(3);
  });
});
