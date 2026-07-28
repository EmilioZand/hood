import pLimit from "p-limit";
import { or, isNotNull } from "drizzle-orm";
import type { db as dbType } from "@/db";
import { restaurantLocations } from "@/db/schema";
import { syncRestaurantRatings, type SyncApiKeys } from "./syncRatings";

const CONCURRENCY = 3; // shared limit — Yelp's low rate limit is the binding constraint

export type SyncBatchResult = { total: number; succeeded: number; failed: number };

/** Runs syncRestaurantRatings across every location with a confirmed Google or Yelp match. */
export async function runSyncBatch(db: typeof dbType, apiKeys: SyncApiKeys): Promise<SyncBatchResult> {
  const targets = await db
    .select({
      id: restaurantLocations.id,
      googlePlaceId: restaurantLocations.googlePlaceId,
      yelpBusinessId: restaurantLocations.yelpBusinessId,
      status: restaurantLocations.status,
    })
    .from(restaurantLocations)
    .where(or(isNotNull(restaurantLocations.googlePlaceId), isNotNull(restaurantLocations.yelpBusinessId)));

  const limit = pLimit(CONCURRENCY);
  let succeeded = 0;
  let failed = 0;

  await Promise.all(
    targets.map((r) =>
      limit(async () => {
        try {
          await syncRestaurantRatings(db, r, apiKeys);
          succeeded++;
        } catch {
          // syncRestaurantRatings already isolates per-source errors onto the row;
          // reaching here means the final db.update() itself failed.
          failed++;
        }
      }),
    ),
  );

  return { total: targets.length, succeeded, failed };
}
