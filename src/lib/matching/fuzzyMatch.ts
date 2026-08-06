// Pure-JS trigram matching, mirroring Postgres pg_trgm's similarity() so scores
// computed here (in scripts/tests) and scores computed in SQL stay comparable.

const GENERIC_WORDS = new Set([
  "the",
  "a",
  "an",
  "restaurant",
  "restaurants",
  "cafe",
  "bar",
  "grill",
  "kitchen",
  "eatery",
]);

// Includes "smart"/curly quote variants (‘-’ single, “-” double) —
// e.g. "Charmaine's" (straight ') vs "Charmaine’s" (curly ’, common when a
// name is copy-pasted from a website) must normalize identically, or the curly version
// keeps its apostrophe glued to the word while the straight one gets stripped to a
// space, hurting trigram similarity for what's obviously the same name.
const PUNCTUATION_RE = /[.,/#!$%^&*;:{}=\-_`~()'"‘’“”]/g;
// Unicode combining diacritical marks (U+0300-U+036F), left behind after NFD
// decomposition splits e.g. "è" into "e" + a combining grave accent.
const DIACRITICS_RE = /[̀-ͯ]/g;

/** Strips accents so "Angèle" and "Angele" (or "café"/"cafe") compare equal — a single
 * accented character otherwise drags down trigram similarity disproportionately in a
 * short name, even though it's clearly the same word. */
function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(DIACRITICS_RE, "");
}

/**
 * Normalizes a restaurant name for comparison: lowercases, strips accents and
 * punctuation, drops generic words ("The", "Restaurant", "Bar & Grill"), collapses
 * whitespace. Cuisine-bearing words (e.g. "Sushi", "Izakaya") are deliberately kept.
 */
export function normalizeName(name: string): string {
  const cleaned = stripDiacritics(name.toLowerCase())
    .replace(PUNCTUATION_RE, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0 && !GENERIC_WORDS.has(word))
    .join(" ")
    .trim();

  return cleaned.length > 0 ? cleaned : stripDiacritics(name.toLowerCase()).trim();
}

/** Pads a string and returns its set of character trigrams, as pg_trgm does. */
export function trigrams(input: string): Set<string> {
  const padded = `  ${input}  `;
  const grams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

/** Jaccard similarity of two trigram sets, in [0, 1] — same measure pg_trgm's similarity() uses. */
export function trigramSimilarity(a: string, b: string): number {
  if (a === b) return 1;

  const setA = trigrams(a);
  const setB = trigrams(b);

  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const gram of setA) {
    if (setB.has(gram)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Overlap (Szymkiewicz–Simpson) coefficient: intersection / min(|A|, |B|), in [0, 1].
 * Jaccard similarity penalizes a short name being contained within a much longer one
 * (e.g. "Amelie" vs "Amelie San Francisco" scores ~0.30 under pure Jaccard, since the
 * union is dominated by the longer string) even though that's a near-certain match —
 * the same problem pg_trgm's word_similarity() exists to solve. Overlap coefficient
 * instead asks "is the shorter name basically entirely present in the longer one?".
 */
export function trigramOverlap(a: string, b: string): number {
  if (a === b) return 1;

  const setA = trigrams(a);
  const setB = trigrams(b);

  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const gram of setA) {
    if (setB.has(gram)) intersection++;
  }

  return intersection / Math.min(setA.size, setB.size);
}

export type MatchCandidate = {
  name: string;
  city?: string | null;
};

const CITY_MATCH_BOOST = 0.25;
// A mismatch is real evidence, not just an absence of evidence — without this, a chain
// with identically-named locations in two different cities scores 1.0 for BOTH (a perfect
// name match leaves the boost formula no headroom to differentiate them), so multi-location
// restaurants could never be disambiguated by city alone. Only applied when both sides
// actually report a city — no city data means no adjustment either way, not a penalty.
const CITY_MISMATCH_PENALTY = 0.35;

/**
 * Scores how well a candidate (e.g. a Google Places / Yelp / scraped result)
 * matches a target restaurant record. Combines name trigram similarity with a
 * substantial adjustment for an exact (case-insensitive) city match/mismatch.
 * Result is clamped to [0, 1].
 */
export function scoreMatch(candidate: MatchCandidate, target: MatchCandidate): number {
  const a = normalizeName(candidate.name);
  const b = normalizeName(target.name);
  // Take the more generous of the two measures: Jaccard suits similar-length names
  // (typos, reordering), overlap coefficient suits containment (city/qualifier suffixes).
  const nameScore = Math.max(trigramSimilarity(a, b), trigramOverlap(a, b));

  let adjusted = nameScore;
  if (candidate.city && target.city) {
    const cityMatches = candidate.city.trim().toLowerCase() === target.city.trim().toLowerCase();
    adjusted = cityMatches
      ? nameScore + CITY_MATCH_BOOST * (1 - nameScore)
      : nameScore * (1 - CITY_MISMATCH_PENALTY);
  }

  return Math.min(1, Math.max(0, adjusted));
}

export type ScoredCandidate<T> = T & { matchScore: number };

/** Ranks a list of candidates against a target, highest score first. */
export function rankCandidates<T extends MatchCandidate>(
  candidates: T[],
  target: MatchCandidate,
): ScoredCandidate<T>[] {
  return candidates
    .map((candidate) => ({ ...candidate, matchScore: scoreMatch(candidate, target) }))
    .sort((a, b) => b.matchScore - a.matchScore);
}

// Shared across every Google-match auto-confirm caller (spot creation, the add-a-spot
// wizard's prefill, and the standalone auto-confirm script) so the bar for "confident
// enough to write without human review" can't silently drift apart between them.
export const GOOGLE_AUTO_CONFIRM_THRESHOLD = 0.8;
const DEFAULT_AUTO_CONFIRM_MARGIN = 0.15;

/**
 * Picks a single candidate safe to auto-confirm without human review, or null if none
 * qualifies. A restaurant with multiple locations (a chain) can still auto-confirm as
 * long as the top candidate clears the threshold AND is decisively ahead of the runner-up
 * — not just "the only candidate present". Two candidates that are still close (a real
 * tie, e.g. same city appearing twice, or no city data to break the tie with) fall through
 * to manual review instead, since we can't safely tell them apart.
 */
export function pickAutoConfirmWinner<T extends { matchScore: number }>(
  candidates: T[],
  threshold: number,
  margin: number = DEFAULT_AUTO_CONFIRM_MARGIN,
): T | null {
  if (candidates.length === 0) return null;

  const sorted = [...candidates].sort((a, b) => b.matchScore - a.matchScore);
  const [top, second] = sorted;

  if (top.matchScore < threshold) return null;
  if (!second) return top;
  return top.matchScore - second.matchScore >= margin ? top : null;
}
