import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { crmWordingVariables, DEFAULT_CRM_PROVIDER, type CrmProviderId } from '@shared/crm-provider';

import enUS from './locales/en-US.json';
import frFR from './locales/fr-FR.json';
import deDE from './locales/de-DE.json';
import esES from './locales/es-ES.json';
import ptBR from './locales/pt-BR.json';
import itIT from './locales/it-IT.json';

const resources = {
  en: { translation: enUS },
  fr: { translation: frFR },
  de: { translation: deDE },
  es: { translation: esES },
  pt: { translation: ptBR },
  it: { translation: itIT }
};

if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      fallbackLng: 'en',
      debug: false,

      detection: {
        order: ['localStorage', 'navigator', 'htmlTag'],
        caches: ['localStorage'],
        lookupLocalStorage: 'i18nextLng'
      },

      // {{crm}} / {{crmShort}} name the install's CRM in every string, with
      // no t() argument; applyCrmWording() below points them at the CRM.
      interpolation: {
        escapeValue: false,
        defaultVariables: { ...crmWordingVariables(DEFAULT_CRM_PROVIDER), record: 'Evaluation' }
      }
    });
}

i18n.on('languageChanged', (lng) => {
  const localeMap: Record<string, string> = {
    'en': 'en-US',
    'es': 'es-ES',
    'fr': 'fr-FR',
    'de': 'de-DE',
    'it': 'it-IT',
    'pt': 'pt-BR'
  };
  document.documentElement.lang = localeMap[lng] || lng;
});

/**
 * Points {{crm}} / {{crmShort}} at the install's CRM (Admin › Integrations ›
 * Overview › CRM) and re-renders translated components, which react-i18next
 * does on languageChanged. Called by useCrmProvider() whenever it learns the
 * CRM; a call that changes nothing does nothing. ImpactIQ's applyCrmWording.
 */
export function applyCrmWording(provider: CrmProviderId): void {
  const next = crmWordingVariables(provider);
  const interpolation = i18n.options.interpolation ?? (i18n.options.interpolation = {});
  const current = interpolation.defaultVariables ?? {};
  if (current.crm === next.crm && current.crmShort === next.crmShort) return;
  interpolation.defaultVariables = { ...current, ...next };
  i18n.emit('languageChanged', i18n.language);
}

/**
 * Points {{record}} at the admin-chosen validation record name (Admin ›
 * System Settings › Terminology) for strings rendered without a `record`
 * argument, such as sidebar and tab labels. Called by
 * useValidationRecordLabel(); a call that changes nothing does nothing.
 * An explicit t(key, { record }) still wins.
 */
export function applyRecordWording(record: string): void {
  const interpolation = i18n.options.interpolation ?? (i18n.options.interpolation = {});
  const current = interpolation.defaultVariables ?? {};
  if (!record || current.record === record) return;
  interpolation.defaultVariables = { ...current, record };
  i18n.emit('languageChanged', i18n.language);
}

export default i18n;
