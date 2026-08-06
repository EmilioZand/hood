import type { db as dbType } from "@/db";
import { restaurantMatchCandidates } from "@/db/schema";
import { rankCandidates } from "@/lib/matching/fuzzyMatch";
import { searchGooglePlaces, type GooglePlaceCandidate } from "@/lib/integrations/googlePlaces";

const TOP_N = 3;

export type QueuedCandidate = {
  id: string;
  matchScore: number;
  neighborhood: string | null;
  cuisine: string | null;
};

/**
 * Searches Google Places for a restaurant and ranks results by name similarity — no DB
 * writes, safe to call before a restaurant row even exists (e.g. the add-a-spot wizard's
 * preview step). Shared with queueGoogleMatchCandidates below so both stay in sync.
 */
export async function findRankedGoogleMatches(
  name: string,
  city: string,
  apiKey: string,
): Promise<(GooglePlaceCandidate & { matchScore: number })[]> {
  const candidates = await searchGooglePlaces(`${name} ${city}, CA restaurant`, apiKey);

  // Google's formattedAddress isn't reliably parseable into a clean city, so
  // name-similarity carries the match — the text query already constrains by city.
  return rankCandidates(candidates.map((c) => ({ ...c, city: null })), { name, city: null });
}

/**
 * Searches Google Places for a restaurant and queues its top few results as pending
 * `restaurant_match_candidates` rows for admin review — never writes a location directly.
 * Shared by the onboarding matcher script and the "add a spot" flow so both stay in sync.
 */
export async function queueGoogleMatchCandidates(
  db: typeof dbType,
  restaurant: { id: string; name: string; city: string },
  apiKey: string,
): Promise<QueuedCandidate[]> {
  const ranked = await findRankedGoogleMatches(restaurant.name, restaurant.city, apiKey);

  const queued: QueuedCandidate[] = [];
  for (const [i, c] of ranked.slice(0, TOP_N).entries()) {
    const [row] = await db
      .insert(restaurantMatchCandidates)
      .values({
        restaurantId: restaurant.id,
        source: "google",
        candidateExtId: c.placeId,
        candidateName: c.name,
        candidateAddress: c.address,
        candidateCity: null,
        matchScore: c.matchScore.toFixed(3),
        rank: i + 1,
        rawPayload: c,
        status: "pending",
      })
      .onConflictDoNothing()
      .returning({ id: restaurantMatchCandidates.id });
    if (row) {
      queued.push({ id: row.id, matchScore: c.matchScore, neighborhood: c.neighborhood, cuisine: c.cuisine });
    }
  }

  return queued;
}
