import type { db as dbType } from "@/db";
import { restaurantMatchCandidates } from "@/db/schema";
import { rankCandidates } from "@/lib/matching/fuzzyMatch";
import { searchGooglePlaces } from "@/lib/integrations/googlePlaces";

const TOP_N = 3;

export type QueuedCandidate = { id: string; matchScore: number };

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
  const candidates = await searchGooglePlaces(
    `${restaurant.name} ${restaurant.city}, CA restaurant`,
    apiKey,
  );

  // Google's formattedAddress isn't reliably parseable into a clean city, so
  // name-similarity carries the match — the text query already constrains by city.
  const ranked = rankCandidates(
    candidates.map((c) => ({ ...c, city: null })),
    { name: restaurant.name, city: null },
  );

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
    if (row) queued.push({ id: row.id, matchScore: c.matchScore });
  }

  return queued;
}
