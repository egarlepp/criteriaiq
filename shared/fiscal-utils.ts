import type { FiscalConfig } from "./schema";

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export const DEFAULT_FISCAL_CONFIG: FiscalConfig = {
  displayMode: "calendar",
  fiscalYearStartMonth: 1,
  yearNamingOffset: 0,
};

export function getFiscalYearForDate(date: Date, config: FiscalConfig): number {
  const month = date.getMonth() + 1;
  const calendarYear = date.getFullYear();
  
  if (config.displayMode === "calendar") {
    return calendarYear;
  }
  
  if (month >= config.fiscalYearStartMonth) {
    return calendarYear + config.yearNamingOffset;
  } else {
    return calendarYear + config.yearNamingOffset - 1;
  }
}

export function getFiscalQuarterForDate(date: Date, config: FiscalConfig): number {
  const month = date.getMonth() + 1;
  
  if (config.displayMode === "calendar") {
    return Math.ceil(month / 3);
  }
  
  const fiscalMonthIndex = ((month - config.fiscalYearStartMonth + 12) % 12);
  return Math.floor(fiscalMonthIndex / 3) + 1;
}

export function getCurrentFiscalYear(config: FiscalConfig): number {
  return getFiscalYearForDate(new Date(), config);
}

export function getCurrentFiscalQuarter(config: FiscalConfig): number {
  return getFiscalQuarterForDate(new Date(), config);
}

export function formatFiscalPeriod(date: Date, config: FiscalConfig): string {
  const year = getFiscalYearForDate(date, config);
  const quarter = getFiscalQuarterForDate(date, config);
  
  if (config.displayMode === "calendar") {
    return `Q${quarter} ${year}`;
  }
  
  return `Q${quarter} FY${year.toString().slice(-2)}`;
}

export function getQuarterDateRange(
  year: number,
  quarter: number,
  config: FiscalConfig
): { start: Date; end: Date } {
  if (config.displayMode === "calendar") {
    const startMonth = (quarter - 1) * 3;
    const start = new Date(year, startMonth, 1);
    const end = new Date(year, startMonth + 3, 0);
    return { start, end };
  }
  
  const fiscalYearStartMonth = config.fiscalYearStartMonth - 1;
  const startMonthOffset = (quarter - 1) * 3;
  const actualStartMonth = (fiscalYearStartMonth + startMonthOffset) % 12;
  
  let startYear = year - config.yearNamingOffset;
  if (actualStartMonth < fiscalYearStartMonth) {
    startYear += 1;
  }
  
  const start = new Date(startYear, actualStartMonth, 1);
  const end = new Date(startYear, actualStartMonth + 3, 0);
  
  return { start, end };
}

export function getFiscalYearDateRange(
  fiscalYear: number,
  config: FiscalConfig
): { start: Date; end: Date } {
  if (config.displayMode === "calendar") {
    return {
      start: new Date(fiscalYear, 0, 1),
      end: new Date(fiscalYear, 11, 31),
    };
  }
  
  const calendarYear = fiscalYear - config.yearNamingOffset;
  const startMonth = config.fiscalYearStartMonth - 1;
  
  const start = new Date(calendarYear, startMonth, 1);
  const end = new Date(calendarYear + 1, startMonth, 0);
  
  return { start, end };
}

export function getExampleDates(config: FiscalConfig): Array<{
  date: Date;
  formatted: string;
  description: string;
}> {
  const today = new Date();
  const examples: Array<{ date: Date; formatted: string; description: string }> = [];
  
  examples.push({
    date: today,
    formatted: formatFiscalPeriod(today, config),
    description: "Today",
  });
  
  const nextQuarter = new Date(today);
  nextQuarter.setMonth(nextQuarter.getMonth() + 3);
  examples.push({
    date: nextQuarter,
    formatted: formatFiscalPeriod(nextQuarter, config),
    description: "3 months from now",
  });
  
  const sixMonthsAgo = new Date(today);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  examples.push({
    date: sixMonthsAgo,
    formatted: formatFiscalPeriod(sixMonthsAgo, config),
    description: "6 months ago",
  });
  
  return examples;
}
