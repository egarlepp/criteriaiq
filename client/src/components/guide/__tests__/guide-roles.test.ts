import { describe, expect, it } from "vitest";
import i18next from "i18next";
import enUS from "@/i18n/locales/en-US.json";
import deDE from "@/i18n/locales/de-DE.json";
import frFR from "@/i18n/locales/fr-FR.json";
import esES from "@/i18n/locales/es-ES.json";
import itIT from "@/i18n/locales/it-IT.json";
import ptBR from "@/i18n/locales/pt-BR.json";
import {
  FALLBACK_ACCOUNT_STATUSES,
  FALLBACK_PROJECT_STATUSES,
  GUIDE_ROLES,
  GUIDE_STAGES,
  GUIDE_TOPICS,
  ROLE_POPULAR_SEARCHES,
  ROLE_STAGE_ITEMS,
  ROLE_TOPIC_ORDER,
  topicDescriptionKey,
} from "../guide-data";
import { buildGuideSearchIndex, searchGuide } from "../guide-search";

const LOCALES = { en: enUS, de: deDE, fr: frFR, es: esES, it: itIT, pt: ptBR } as const;

async function makeT(lng: keyof typeof LOCALES) {
  const instance = i18next.createInstance();
  await instance.init({
    lng,
    fallbackLng: false,
    resources: { [lng]: { translation: LOCALES[lng] } },
    interpolation: { escapeValue: false },
  });
  return instance;
}

describe("guide role content", () => {
  it("orders every topic exactly once for each role", () => {
    const all = GUIDE_TOPICS.map((topic) => topic.key).sort();
    for (const role of GUIDE_ROLES) {
      expect([...ROLE_TOPIC_ORDER[role.key]].sort()).toEqual(all);
    }
  });

  for (const lng of Object.keys(LOCALES) as (keyof typeof LOCALES)[]) {
    it(`has every role's checklist, tip, status card and topic text in ${lng}`, async () => {
      const i18n = await makeT(lng);
      for (const { key: role } of GUIDE_ROLES) {
        expect(i18n.exists(`guide.journey.roles.${role}.tip`)).toBe(true);
        expect(i18n.exists(`guide.accountStatuses.roles.${role}.title`)).toBe(true);
        expect(i18n.exists(`guide.accountStatuses.roles.${role}.description`)).toBe(true);
        for (const stage of GUIDE_STAGES) {
          for (const item of ROLE_STAGE_ITEMS[role][stage]) {
            expect(i18n.exists(`guide.journey.roles.${role}.${stage}.${item}`), `${role}.${stage}.${item}`).toBe(true);
          }
        }
        for (const topic of ROLE_TOPIC_ORDER[role]) {
          expect(i18n.exists(topicDescriptionKey(role, topic)), `${role} ${topic}`).toBe(true);
        }
      }
    });

    it(`finds results for every popular search pill in ${lng}`, async () => {
      const i18n = await makeT(lng);
      const index = buildGuideSearchIndex(i18n.t, FALLBACK_ACCOUNT_STATUSES, FALLBACK_PROJECT_STATUSES);
      for (const { key: role } of GUIDE_ROLES) {
        for (const pill of ROLE_POPULAR_SEARCHES[role]) {
          const query = i18n.t(`guide.popular.${pill}`);
          expect(searchGuide(index, query).length, `${role} pill "${query}"`).toBeGreaterThan(0);
        }
      }
    });
  }
});
