import type { TFunction } from "i18next";
export const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern Time (ET)", labelKey: "timezones.americaNewYork" },
  { value: "America/Chicago", label: "Central Time (CT)", labelKey: "timezones.americaChicago" },
  { value: "America/Denver", label: "Mountain Time (MT)", labelKey: "timezones.americaDenver" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)", labelKey: "timezones.americaLosAngeles" },
  { value: "America/Anchorage", label: "Alaska Time (AKT)", labelKey: "timezones.americaAnchorage" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HST)", labelKey: "timezones.pacificHonolulu" },
  { value: "America/Toronto", label: "Eastern Time - Canada", labelKey: "timezones.americaToronto" },
  { value: "America/Vancouver", label: "Pacific Time - Canada", labelKey: "timezones.americaVancouver" },
  { value: "Europe/London", label: "Greenwich Mean Time (GMT)", labelKey: "timezones.europeLondon" },
  { value: "Europe/Paris", label: "Paris - Central European Time (CET)", labelKey: "timezones.europeParis" },
  { value: "Europe/Berlin", label: "Berlin - Central European Time (CET)", labelKey: "timezones.europeBerlin" },
  { value: "Europe/Rome", label: "Rome - Central European Time (CET)", labelKey: "timezones.europeRome" },
  { value: "Europe/Madrid", label: "Madrid - Central European Time (CET)", labelKey: "timezones.europeMadrid" },
  { value: "Europe/Amsterdam", label: "Amsterdam - Central European Time (CET)", labelKey: "timezones.europeAmsterdam" },
  { value: "Europe/Brussels", label: "Brussels - Central European Time (CET)", labelKey: "timezones.europeBrussels" },
  { value: "Europe/Vienna", label: "Vienna - Central European Time (CET)", labelKey: "timezones.europeVienna" },
  { value: "Europe/Zurich", label: "Zurich - Central European Time (CET)", labelKey: "timezones.europeZurich" },
  { value: "Europe/Stockholm", label: "Stockholm - Central European Time (CET)", labelKey: "timezones.europeStockholm" },
  { value: "Europe/Oslo", label: "Oslo - Central European Time (CET)", labelKey: "timezones.europeOslo" },
  { value: "Europe/Copenhagen", label: "Copenhagen - Central European Time (CET)", labelKey: "timezones.europeCopenhagen" },
  { value: "Europe/Helsinki", label: "Helsinki - Eastern European Time (EET)", labelKey: "timezones.europeHelsinki" },
  { value: "Europe/Athens", label: "Athens - Eastern European Time (EET)", labelKey: "timezones.europeAthens" },
  { value: "Europe/Moscow", label: "Moscow Time (MSK)", labelKey: "timezones.europeMoscow" },
  { value: "Asia/Tokyo", label: "Japan Standard Time (JST)", labelKey: "timezones.asiaTokyo" },
  { value: "Asia/Shanghai", label: "China Standard Time (CST)", labelKey: "timezones.asiaShanghai" },
  { value: "Asia/Hong_Kong", label: "Hong Kong Time (HKT)", labelKey: "timezones.asiaHongKong" },
  { value: "Asia/Singapore", label: "Singapore Standard Time (SGT)", labelKey: "timezones.asiaSingapore" },
  { value: "Asia/Seoul", label: "Korea Standard Time (KST)", labelKey: "timezones.asiaSeoul" },
  { value: "Asia/Kolkata", label: "India Standard Time (IST)", labelKey: "timezones.asiaKolkata" },
  { value: "Asia/Dubai", label: "Gulf Standard Time (GST)", labelKey: "timezones.asiaDubai" },
  { value: "Australia/Sydney", label: "Sydney - Australian Eastern Time (AET)", labelKey: "timezones.australiaSydney" },
  { value: "Australia/Melbourne", label: "Melbourne - Australian Eastern Time (AET)", labelKey: "timezones.australiaMelbourne" },
  { value: "Australia/Perth", label: "Australian Western Time (AWT)", labelKey: "timezones.australiaPerth" },
  { value: "Pacific/Auckland", label: "New Zealand Time (NZST)", labelKey: "timezones.pacificAuckland" },
  { value: "America/Sao_Paulo", label: "Brasília Time (BRT)", labelKey: "timezones.americaSaoPaulo" },
  { value: "America/Mexico_City", label: "Central Standard Time - Mexico", labelKey: "timezones.americaMexicoCity" },
  { value: "America/Argentina/Buenos_Aires", label: "Argentina Time (ART)", labelKey: "timezones.americaBuenosAires" },
  { value: "Africa/Cairo", label: "Cairo - Eastern European Time (EET)", labelKey: "timezones.africaCairo" },
  { value: "Africa/Johannesburg", label: "South Africa Standard Time (SAST)", labelKey: "timezones.africaJohannesburg" },
  { value: "UTC", label: "Coordinated Universal Time (UTC)", labelKey: "timezones.utc" }
];


export const getTimezoneLabel = (timezone: string, t?: TFunction) => {
  const option = TIMEZONE_OPTIONS.find(opt => opt.value === timezone);
  if (!option) return timezone;
  if (t) return t(option.labelKey, { defaultValue: option.label });
  return option.label;
};

export const formatDateInTimezone = (date: Date | string, timezone: string) => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleString('en-US', { 
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
};
