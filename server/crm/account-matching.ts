// Which CRM accounts an unlinked CriteriaIQ account may be (PR 4 of the
// CRM-linked accounts plan). Pure. Strongest first:
//
//   strong   one of the account's approved email domains is the CRM
//            account's website domain
//   likely   the names are equal once case, punctuation and company
//            suffixes (Inc, LLC, GmbH, …) are dropped
//   possible the normalized names are at least 85% alike (Levenshtein ratio)
//
// Suggestions are only ever suggestions: a person links or dismisses each.
import { calculateSimilarity } from "../salesforce/fuzzy-matcher";

export type MatchStrength = "strong" | "likely" | "possible";
export type MatchReason = "domain" | "name" | "similarName";

export const SIMILAR_NAME_THRESHOLD = 0.85;
export const MAX_SUGGESTIONS = 3;

const COMPANY_SUFFIXES = new Set([
  "inc", "incorporated", "llc", "llp", "lp", "ltd", "limited", "corp", "corporation", "co", "company",
  "gmbh", "ag", "kg", "sa", "sas", "sarl", "srl", "spa", "plc", "bv", "nv", "pty", "oy", "ab", "as", "aps",
  "kk", "pte", "pvt", "sl", "the",
]);

/** "The Acme Co., Inc." → "acme"; "Smith & Sons GmbH" → "smith and sons". */
export function normalizeCompanyName(name: string): string {
  const words = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/\b([a-z])\.(?=[a-z]\.)/g, "$1") // S.A. → SA
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  // Drop suffixes from the end (and a leading "the"), but never every word.
  while (words.length > 1 && COMPANY_SUFFIXES.has(words[words.length - 1])) words.pop();
  if (words.length > 1 && words[0] === "the") words.shift();
  return words.join(" ");
}

/** "https://www.Acme.com/about" → "acme.com"; null when it isn't a web address. */
export function websiteDomain(website: string | null | undefined): string | null {
  const raw = (website ?? "").trim();
  if (!raw) return null;
  try {
    const host = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase();
    const bare = host.replace(/^www\d*\./, "");
    return bare.includes(".") ? bare : null;
  } catch {
    return null;
  }
}

export interface MatchSubject {
  accountName: string;
  approvedEmailDomains: string[] | null | undefined;
}

export interface MatchCandidate {
  id: string;
  name: string;
  url: string | null;
  website: string | null;
}

export interface CrmMatch extends MatchCandidate {
  strength: MatchStrength;
  reason: MatchReason;
  /** 1 for domain and exact-name matches, the name similarity otherwise. */
  score: number;
}

/** How this CRM account matches the CriteriaIQ account, or null when it doesn't. */
export function matchCandidate(subject: MatchSubject, candidate: MatchCandidate): CrmMatch | null {
  const domain = websiteDomain(candidate.website);
  const domains = new Set((subject.approvedEmailDomains ?? []).map((d) => d.trim().toLowerCase().replace(/^@/, "")));
  if (domain && domains.has(domain)) return { ...candidate, strength: "strong", reason: "domain", score: 1 };

  const a = normalizeCompanyName(subject.accountName);
  const b = normalizeCompanyName(candidate.name);
  if (!a || !b) return null;
  if (a === b) return { ...candidate, strength: "likely", reason: "name", score: 1 };

  const score = calculateSimilarity(a, b);
  if (score >= SIMILAR_NAME_THRESHOLD) return { ...candidate, strength: "possible", reason: "similarName", score };
  return null;
}

const RANK: Record<MatchStrength, number> = { strong: 0, likely: 1, possible: 2 };

/**
 * The best matches among `candidates`, strongest first, leaving out CRM
 * accounts already linked to an account or dismissed for this one.
 */
export function rankCrmMatches(
  subject: MatchSubject,
  candidates: MatchCandidate[],
  exclude: ReadonlySet<string>,
  limit = MAX_SUGGESTIONS,
): CrmMatch[] {
  const seen = new Set<string>();
  const matches: CrmMatch[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.id) || exclude.has(candidate.id)) continue;
    seen.add(candidate.id);
    const match = matchCandidate(subject, candidate);
    if (match) matches.push(match);
  }
  return matches
    .sort((x, y) => RANK[x.strength] - RANK[y.strength] || y.score - x.score || x.name.localeCompare(y.name))
    .slice(0, limit);
}

/**
 * What to search the CRM for: the full name, and its first word when that
 * is distinctive enough to catch "Acme" for "Acme Holdings".
 */
export function searchTermsFor(accountName: string): string[] {
  const full = accountName.trim().slice(0, 100);
  const first = normalizeCompanyName(accountName).split(" ")[0] ?? "";
  const terms = [full];
  if (first.length >= 4 && first !== full.toLowerCase()) terms.push(first);
  return terms.filter((t) => t.length >= 2);
}
