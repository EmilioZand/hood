import "./env";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { restaurantMatchCandidates, restaurants } from "../src/db/schema";
import { scoreMatch } from "../src/lib/matching/fuzzyMatch";
import { runScript } from "./runScript";

// Recomputes matchScore for pending candidates against the current scoreMatch formula,
// using data already stored (candidateName/candidateCity + the restaurant's name/city) —
// no API calls needed. Run this after any change to the scoring algorithm so existing
// review-queue rows reflect it, rather than only new matcher runs.
runScript(async () => {
  const pending = await db
    .select({
      id: restaurantMatchCandidates.id,
      candidateName: restaurantMatchCandidates.candidateName,
      candidateCity: restaurantMatchCandidates.candidateCity,
      restaurantName: restaurants.name,
      restaurantCity: restaurants.city,
      oldScore: restaurantMatchCandidates.matchScore,
    })
    .from(restaurantMatchCandidates)
    .innerJoin(restaurants, eq(restaurants.id, restaurantMatchCandidates.restaurantId))
    .where(eq(restaurantMatchCandidates.status, "pending"));

  let changed = 0;
  for (const c of pending) {
    const newScore = scoreMatch(
      { name: c.candidateName, city: c.candidateCity },
      { name: c.restaurantName, city: c.restaurantCity },
    );
    const newScoreStr = newScore.toFixed(3);
    if (newScoreStr !== c.oldScore) {
      await db
        .update(restaurantMatchCandidates)
        .set({ matchScore: newScoreStr })
        .where(eq(restaurantMatchCandidates.id, c.id));
      changed++;
    }
  }

  console.log(`Rescored ${pending.length} pending candidates, ${changed} scores changed.`);
});
