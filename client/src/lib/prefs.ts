import { getSimpleCode } from '@/config/locales';

export function applyTheme(theme: "light" | "dark") {
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(theme);
  localStorage.setItem("theme", theme);
}

export function applyLocale(locale: string, i18n?: any) {
  const simpleCode = getSimpleCode(locale);
  document.documentElement.setAttribute("lang", locale);
  localStorage.setItem("preferredLocale", locale);
  if (i18n?.changeLanguage) {
    i18n.changeLanguage(simpleCode);
  }
}

export function getStoredTheme(): "light" | "dark" {
  const stored = localStorage.getItem("theme");
  return (stored === "dark" ? "dark" : "light");
}

export function getStoredLocale(): string {
  return localStorage.getItem("preferredLocale") || "en-US";
}
