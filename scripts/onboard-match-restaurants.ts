import "./env";
import pLimit from "p-limit";
import { eq, notInArray } from "drizzle-orm";
import { db } from "../src/db";
import { restaurants, restaurantMatchCandidates } from "../src/db/schema";
import { rankCandidates } from "../src/lib/matching/fuzzyMatch";
import { queueGoogleMatchCandidates } from "../src/lib/data/googlePlacesMatch";
import { searchYelpBusinesses } from "../src/lib/integrations/yelp";
import { runScript } from "./runScript";

const TOP_N = 3;
const GOOGLE_CONCURRENCY = 5;
const YELP_CONCURRENCY = 1; // Yelp's free tier hits 429s fast even at low concurrency
const NEEDS_REVIEW_THRESHOLD = 0.55;

type Target = { id: string; name: string; city: string };

async function matchGoogle(r: Target) {
  const queued = await queueGoogleMatchCandidates(db, r, process.env.GOOGLE_PLACES_API_KEY!);
  return queued[0]?.matchScore ?? 0;
}

async function matchYelp(r: Target) {
  const candidates = await searchYelpBusinesses(
    r.name,
    `${r.city}, CA`,
    process.env.YELP_FUSION_API_KEY!,
  );

  const ranked = rankCandidates(candidates, { name: r.name, city: r.city });

  for (const [i, c] of ranked.slice(0, TOP_N).entries()) {
    await db
      .insert(restaurantMatchCandidates)
      .values({
        restaurantId: r.id,
        source: "yelp",
        candidateExtId: c.businessId,
        candidateName: c.name,
        candidateAddress: c.address,
        candidateCity: c.city,
        matchScore: c.matchScore.toFixed(3),
        rank: i + 1,
        rawPayload: c,
        status: "pending",
      })
      .onConflictDoNothing();
  }

  return ranked[0]?.matchScore ?? 0;
}

async function runSource(
  source: "google" | "yelp",
  matchFn: (r: Target) => Promise<number>,
  concurrency: number,
  targets: Target[],
) {
  const limit = pLimit(concurrency);
  let lowConfidence = 0;
  let failures = 0;

  await Promise.all(
    targets.map((r) =>
      limit(async () => {
        try {
          const topScore = await matchFn(r);
          if (topScore < NEEDS_REVIEW_THRESHOLD) {
            lowConfidence++;
            console.log(`  [${source}] low-confidence: ${r.name} (${r.city}) — ${topScore.toFixed(2)}`);
          }
        } catch (err) {
          failures++;
          console.error(`  [${source}] FAILED: ${r.name} (${r.city}) —`, err instanceof Error ? err.message : err);
        }
      }),
    ),
  );

  console.log(
    `[${source}] Done. ${targets.length - failures} processed, ${lowConfidence} low-confidence, ${failures} failed.`,
  );
}

async function targetsMissingSource(source: "google" | "yelp", rowLimit?: number) {
  const matchedIds = db
    .select({ id: restaurantMatchCandidates.restaurantId })
    .from(restaurantMatchCandidates)
    .where(eq(restaurantMatchCandidates.source, source));

  const query = db
    .select({ id: restaurants.id, name: restaurants.name, city: restaurants.city })
    .from(restaurants)
    .where(notInArray(restaurants.id, matchedIds));

  return rowLimit ? query.limit(rowLimit) : query;
}

runScript(async () => {
  const sourceArg = process.argv.find((a) => a.startsWith("--source="))?.split("=")[1];
  const sources = sourceArg ? [sourceArg as "google" | "yelp"] : (["google", "yelp"] as const);
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const rowLimit = limitArg ? Number(limitArg.split("=")[1]) : undefined;

  for (const source of sources) {
    const targets = await targetsMissingSource(source, rowLimit);
    console.log(`Matching ${targets.length} restaurants missing ${source} candidates...`);
    if (source === "google") {
      await runSource("google", matchGoogle, GOOGLE_CONCURRENCY, targets);
    } else {
      await runSource("yelp", matchYelp, YELP_CONCURRENCY, targets);
    }
  }
});
