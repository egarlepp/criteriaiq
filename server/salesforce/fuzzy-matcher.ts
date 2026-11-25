/**
 * Fuzzy Matching Service for Salesforce Value Translations
 * Used ONLY in config UI to suggest matches - never used during runtime sync
 */

interface FuzzySuggestion {
  cqiValue: string;
  sfValue: string;
  confidence: number;
  matchType: 'exact' | 'case_insensitive' | 'normalized' | 'partial' | 'fuzzy';
}

/** Values longer than this are compared on their first MAX_COMPARE_LENGTH characters. */
const MAX_COMPARE_LENGTH = 255;

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  // The table is (len1 + 1) × (len2 + 1): only real strings, of bounded
  // length, are compared, whatever the caller passes in.
  if (typeof a !== "string" || typeof b !== "string") throw new TypeError("levenshteinDistance compares strings only");
  const str1 = a.length > MAX_COMPARE_LENGTH ? a.slice(0, MAX_COMPARE_LENGTH) : a;
  const str2 = b.length > MAX_COMPARE_LENGTH ? b.slice(0, MAX_COMPARE_LENGTH) : b;
  const len1 = str1.length;
  const len2 = str2.length;
  const dp: number[][] = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) dp[i][0] = i;
  for (let j = 0; j <= len2; j++) dp[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return dp[len1][len2];
}

/**
 * Calculate similarity ratio (0-1) between two strings
 */
export function calculateSimilarity(str1: string, str2: string): number {
  if (typeof str1 !== "string" || typeof str2 !== "string") return 0;
  const maxLen = Math.min(Math.max(str1.length, str2.length), MAX_COMPARE_LENGTH);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(str1, str2);
  return 1 - (distance / maxLen);
}

/**
 * Normalize a string for comparison
 * - Lowercase
 * - Remove special characters
 * - Normalize whitespace
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generate fuzzy match suggestions for a CriteriaIQ value against Salesforce picklist values
 * This is for CONFIG UI suggestions only - not runtime sync
 */
export function generateSuggestions(
  cqiValues: string[],
  sfPicklistValues: string[],
  existingMappings: Array<{ cqiValue: string; sfValue: string }>
): FuzzySuggestion[] {
  const suggestions: FuzzySuggestion[] = [];
  const mappedCqiValues = new Set(existingMappings.map(m => m.cqiValue));
  const mappedSfValues = new Set(existingMappings.map(m => m.sfValue));

  for (const cqiValue of cqiValues) {
    // Skip if already has a mapping
    if (mappedCqiValues.has(cqiValue)) continue;

    for (const sfValue of sfPicklistValues) {
      // Skip if SF value is already mapped
      if (mappedSfValues.has(sfValue)) continue;

      let confidence = 0;
      let matchType: FuzzySuggestion['matchType'] = 'fuzzy';

      // Check for exact match
      if (cqiValue === sfValue) {
        confidence = 1.0;
        matchType = 'exact';
      }
      // Check for case-insensitive match
      else if (cqiValue.toLowerCase() === sfValue.toLowerCase()) {
        confidence = 0.95;
        matchType = 'case_insensitive';
      }
      // Check for normalized match (handling dashes, underscores, spaces)
      else if (normalizeString(cqiValue) === normalizeString(sfValue)) {
        confidence = 0.90;
        matchType = 'normalized';
      }
      // Check for partial match (one contains the other)
      else if (
        cqiValue.toLowerCase().includes(sfValue.toLowerCase()) ||
        sfValue.toLowerCase().includes(cqiValue.toLowerCase())
      ) {
        const shorterLen = Math.min(cqiValue.length, sfValue.length);
        const longerLen = Math.max(cqiValue.length, sfValue.length);
        confidence = 0.7 * (shorterLen / longerLen);
        matchType = 'partial';
      }
      // Fuzzy match using Levenshtein
      else {
        const similarity = calculateSimilarity(
          normalizeString(cqiValue),
          normalizeString(sfValue)
        );
        if (similarity >= 0.6) {
          confidence = similarity * 0.8; // Cap fuzzy matches at 80% confidence
          matchType = 'fuzzy';
        }
      }

      if (confidence >= 0.5) {
        suggestions.push({
          cqiValue,
          sfValue,
          confidence,
          matchType,
        });
      }
    }
  }

  // Sort by confidence descending
  suggestions.sort((a, b) => b.confidence - a.confidence);

  return suggestions;
}

/**
 * Get best suggestion for each unmapped CriteriaIQ value
 */
export function getBestSuggestions(
  cqiValues: string[],
  sfPicklistValues: string[],
  existingMappings: Array<{ cqiValue: string; sfValue: string }>
): FuzzySuggestion[] {
  const allSuggestions = generateSuggestions(cqiValues, sfPicklistValues, existingMappings);
  
  // Group by CQI value and take best match for each
  const bestByValue = new Map<string, FuzzySuggestion>();
  for (const suggestion of allSuggestions) {
    const existing = bestByValue.get(suggestion.cqiValue);
    if (!existing || suggestion.confidence > existing.confidence) {
      bestByValue.set(suggestion.cqiValue, suggestion);
    }
  }

  return Array.from(bestByValue.values());
}
