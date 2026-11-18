export const LOCALES = [
  { code: 'en-US', name: 'English', flag: '🇺🇸', simpleCode: 'en' },
  { code: 'es-ES', name: 'Español', flag: '🇪🇸', simpleCode: 'es' },
  { code: 'fr-FR', name: 'Français', flag: '🇫🇷', simpleCode: 'fr' },
  { code: 'de-DE', name: 'Deutsch', flag: '🇩🇪', simpleCode: 'de' },
  { code: 'it-IT', name: 'Italiano', flag: '🇮🇹', simpleCode: 'it' },
  { code: 'pt-BR', name: 'Português', flag: '🇧🇷', simpleCode: 'pt' },
] as const;

export const getLocaleByCode = (code: string) => {
  return LOCALES.find(l => l.code === code || l.simpleCode === code);
};

export const getLocaleName = (code: string) => {
  const locale = getLocaleByCode(code);
  return locale ? locale.name : code;
};

export const getSimpleCode = (fullCode: string) => {
  const locale = LOCALES.find(l => l.code === fullCode);
  return locale ? locale.simpleCode : fullCode.split('-')[0];
};

export const getFullCode = (simpleCode: string) => {
  const locale = LOCALES.find(l => l.simpleCode === simpleCode);
  return locale ? locale.code : simpleCode;
};
