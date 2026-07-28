import { awardScrapeCandidates, restaurants } from "@/db/schema";
import type { db as dbType } from "@/db";
import { fetchAllJamesBeardStages, type JamesBeardWinner } from "@/lib/integrations/jamesBeard";
import { rankCandidates } from "@/lib/matching/fuzzyMatch";

const MATCH_THRESHOLD = 0.5;

type RestaurantLookup = { id: string; name: string; city: string };

/** Finds the best-matching restaurant across all of a winner's name segments (see jamesBeard.ts). */
function bestRestaurantMatch(winner: JamesBeardWinner, allRestaurants: RestaurantLookup[]) {
  let best: { id: string; matchScore: number } | null = null;

  for (const segment of winner.nameSegments) {
    const ranked = rankCandidates(allRestaurants, { name: segment, city: winner.city });
    const top = ranked[0];
    if (top && (!best || top.matchScore > best.matchScore)) {
      best = { id: top.id, matchScore: top.matchScore };
    }
  }

  return best;
}

export type ScrapeResult = { winnersFound: number; candidatesInserted: number };

/**
 * Scrapes a year's James Beard semifinalist/finalist/winner pages, fuzzy-matches each
 * entry against our restaurants, and upserts pending review-queue rows — never writes
 * restaurant_awards directly. An admin must confirm before award status is treated as
 * real (see src/app/admin/awards). "Mentioned and listed" counts: semifinalists and
 * finalists are queued the same as outright winners, just tagged with their stage.
 */
export async function scrapeJamesBeardAwards(db: typeof dbType, year: number): Promise<ScrapeResult> {
  const allEntries = await fetchAllJamesBeardStages(year);

  const allRestaurants = await db
    .select({ id: restaurants.id, name: restaurants.name, city: restaurants.city })
    .from(restaurants);

  let candidatesInserted = 0;

  for (const entry of allEntries) {
    const best = bestRestaurantMatch(entry, allRestaurants);
    if (!best || best.matchScore < MATCH_THRESHOLD) continue;

    const result = await db
      .insert(awardScrapeCandidates)
      .values({
        restaurantId: best.id,
        source: "james_beard",
        scrapedName: entry.nameSegments.join(", "),
        scrapedCity: entry.city,
        scrapedAwardText: `${entry.category} (${entry.stage})`,
        scrapedUrl: entry.sourceUrl,
        matchConfidence: best.matchScore.toFixed(3),
        rawPayload: entry,
        status: "pending",
      })
      .onConflictDoUpdate({
        target: [
          awardScrapeCandidates.source,
          awardScrapeCandidates.scrapedUrl,
          awardScrapeCandidates.scrapedAwardText,
          awardScrapeCandidates.restaurantId,
        ],
        set: { lastSeenAt: new Date() },
      })
      .returning({ id: awardScrapeCandidates.id });

    if (result.length > 0) candidatesInserted++;
  }

  return { winnersFound: allEntries.length, candidatesInserted };
}
