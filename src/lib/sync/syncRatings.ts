import { eq } from "drizzle-orm";
import type { db as dbType } from "@/db";
import { restaurantLocations } from "@/db/schema";
import { getGooglePlaceDetails } from "@/lib/integrations/googlePlaces";
import { getYelpBusinessDetails } from "@/lib/integrations/yelp";

export type SyncTarget = {
  id: string;
  googlePlaceId: string | null;
  yelpBusinessId: string | null;
  status: string;
};

export type SyncApiKeys = { google?: string; yelp?: string };

/**
 * Refreshes one location's Google/Yelp ratings, opening hours, and closed-permanently
 * status. Never throws — records failures on the row itself (`lastSyncError`) so one bad
 * location can't take down a batch run. Google's businessStatus is the source of truth
 * for closure, surfaced to users as a banner rather than auto-hiding (see
 * restaurant_locations schema `closureSuppressed` for the admin false-positive override).
 * A chain's locations sync independently — one branch closing doesn't affect siblings.
 */
export async function syncRestaurantRatings(
  db: typeof dbType,
  location: SyncTarget,
  apiKeys: SyncApiKeys,
): Promise<void> {
  const updates: Partial<typeof restaurantLocations.$inferInsert> = { updatedAt: new Date() };
  const errors: string[] = [];

  if (location.googlePlaceId && apiKeys.google) {
    try {
      const details = await getGooglePlaceDetails(location.googlePlaceId, apiKeys.google);
      updates.googleRating = details.rating != null ? details.rating.toString() : null;
      updates.googleRatingCount = details.ratingCount;
      updates.googleBusinessStatus = details.businessStatus;
      updates.googleOpeningHours = details.openingHours;
      updates.googleLastSyncedAt = new Date();

      if (details.businessStatus === "CLOSED_PERMANENTLY" && location.status !== "permanently_closed") {
        updates.status = "permanently_closed";
        updates.closedDetectedAt = new Date();
      } else if (details.businessStatus === "OPERATIONAL" && location.status === "permanently_closed") {
        // Google walked back a prior closure report — reopen rather than leave it stuck.
        updates.status = "active";
        updates.closedDetectedAt = null;
      }
    } catch (err) {
      errors.push(`google: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (location.yelpBusinessId && apiKeys.yelp) {
    try {
      const details = await getYelpBusinessDetails(location.yelpBusinessId, apiKeys.yelp);
      updates.yelpRating = details.rating != null ? details.rating.toString() : null;
      updates.yelpReviewCount = details.reviewCount;
      updates.yelpUrl = details.url;
      updates.yelpLastSyncedAt = new Date();
    } catch (err) {
      errors.push(`yelp: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  updates.lastSyncError = errors.length > 0 ? errors.join("; ") : null;

  await db.update(restaurantLocations).set(updates).where(eq(restaurantLocations.id, location.id));
}
