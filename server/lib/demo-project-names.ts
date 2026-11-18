// Demo accounts and projects are named the way the project form names a
// real one: the account's abbreviation, then each solution's abbreviation,
// then the project id (e.g. "RQB-IGA-17"; see project-form.tsx and the
// create route, which appends the id).

const SKIPPED_WORDS = new Set(["and", "&", "-", "of", "the", "inc", "llc", "ltd", "group"]);

/** Initials of an account name ("[demo] Robel, Quitzon and Bechtelar" → "RQB"), 2-5 letters. */
export function demoAccountAbbreviation(accountName: string): string {
  const words = accountName
    .replace(/^\[demo\]\s*/i, "")
    .split(/[\s,/]+/)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, ""))
    .filter((w) => w.length > 0 && !SKIPPED_WORDS.has(w.toLowerCase()));
  if (words.length === 0) return "ACCT";
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words.map((w) => w[0]).join("").slice(0, 5).toUpperCase();
}

/** "RQB-IGA-PAM" (no id yet). Fits projects.name (varchar 100). */
export function demoProjectBaseName(accountAbbreviation: string, solutionAbbreviations: string[]): string {
  const parts = [accountAbbreviation, ...solutionAbbreviations.filter((a) => a.length > 0)];
  return parts.join("-").slice(0, 80);
}
