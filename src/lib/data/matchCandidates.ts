import { eq } from "drizzle-orm";
import type { db as dbType } from "@/db";
import { restaurantLocations, restaurantMatchCandidates } from "@/db/schema";
import type { GooglePlaceCandidate } from "@/lib/integrations/googlePlaces";
import type { YelpBusinessCandidate } from "@/lib/integrations/yelp";
import { trigramSimilarity } from "@/lib/matching/fuzzyMatch";

// A restaurant can have several confirmed locations (chains, e.g. "Fiorella" has 3 SF
// locations) — an address above this similarity is treated as "the same physical place"
// so a Yelp confirm attaches to an existing Google-derived location instead of creating
// a duplicate blank one. Addresses are distinctive strings, so this can be stricter than
// the name-matching threshold.
const SAME_ADDRESS_THRESHOLD = 0.5;

function findMatchingLocation<T extends { address: string | null }>(
  locations: T[],
  candidateAddress: string | null,
): T | null {
  if (!candidateAddress) return null;

  let best: { location: T; score: number } | null = null;
  for (const location of locations) {
    if (!location.address) continue;
    const score = trigramSimilarity(
      location.address.toLowerCase(),
      candidateAddress.toLowerCase(),
    );
    if (score >= SAME_ADDRESS_THRESHOLD && (!best || score > best.score)) {
      best = { location, score };
    }
  }
  return best?.location ?? null;
}

/**
 * Applies a confirmed match candidate onto one of its restaurant's locations
 * (address/coordinates/ratings), creating a new location row if no existing one matches
 * by address (this is how a chain restaurant accumulates multiple locations). Does NOT
 * reject sibling candidates — several can be confirmed as separate, equally valid
 * locations of the same restaurant. Framework-agnostic — used by both the admin review
 * server action (human confirm) and the auto-confirm script (unambiguous high-confidence
 * matches), which is why `confirmedBy` is passed in rather than read from a
 * request-scoped session.
 */
export async function applyConfirmedMatch(
  db: typeof dbType,
  candidateId: string,
  confirmedBy: string | null,
) {
  const [candidate] = await db
    .select()
    .from(restaurantMatchCandidates)
    .where(eq(restaurantMatchCandidates.id, candidateId))
    .limit(1);
  if (!candidate) return;

  const now = new Date();
  const restaurantId = candidate.restaurantId!;
  const existingLocations = await db
    .select()
    .from(restaurantLocations)
    .where(eq(restaurantLocations.restaurantId, restaurantId));

  if (candidate.source === "google") {
    const payload = candidate.rawPayload as GooglePlaceCandidate;
    const byPlaceId = existingLocations.find((l) => l.googlePlaceId === candidate.candidateExtId);
    const target = byPlaceId ?? findMatchingLocation(existingLocations, payload.address);

    const fields = {
      googlePlaceId: candidate.candidateExtId,
      address: payload.address,
      latitude: payload.latitude != null ? payload.latitude.toString() : null,
      longitude: payload.longitude != null ? payload.longitude.toString() : null,
      googleRating: payload.rating != null ? payload.rating.toString() : null,
      googleRatingCount: payload.ratingCount,
      googleBusinessStatus: payload.businessStatus,
      googleOpeningHours: payload.openingHours,
      googleLastSyncedAt: now,
      updatedAt: now,
    };

    if (target) {
      await db.update(restaurantLocations).set(fields).where(eq(restaurantLocations.id, target.id));
    } else {
      await db.insert(restaurantLocations).values({ restaurantId, ...fields });
    }
  } else {
    const payload = candidate.rawPayload as YelpBusinessCandidate;
    const byBusinessId = existingLocations.find((l) => l.yelpBusinessId === candidate.candidateExtId);
    const target = byBusinessId ?? findMatchingLocation(existingLocations, payload.address);

    const fields = {
      yelpBusinessId: candidate.candidateExtId,
      yelpUrl: payload.url,
      yelpRating: payload.rating != null ? payload.rating.toString() : null,
      yelpReviewCount: payload.reviewCount,
      yelpLastSyncedAt: now,
      updatedAt: now,
    };

    if (target) {
      await db.update(restaurantLocations).set(fields).where(eq(restaurantLocations.id, target.id));
    } else {
      // No matching Google-derived location — Yelp is the only source for this
      // location's address/coordinates, so seed them from its own payload.
      await db.insert(restaurantLocations).values({
        restaurantId,
        address: payload.address,
        latitude: payload.latitude != null ? payload.latitude.toString() : null,
        longitude: payload.longitude != null ? payload.longitude.toString() : null,
        ...fields,
      });
    }
  }

  await db
    .update(restaurantMatchCandidates)
    .set({ status: "confirmed", reviewedBy: confirmedBy, reviewedAt: now })
    .where(eq(restaurantMatchCandidates.id, candidateId));
}
