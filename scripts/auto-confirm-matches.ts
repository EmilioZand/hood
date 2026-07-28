import "./env";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { restaurantMatchCandidates } from "../src/db/schema";
import { applyConfirmedMatch } from "../src/lib/data/matchCandidates";
import { pickAutoConfirmWinner } from "../src/lib/matching/fuzzyMatch";
import { runScript } from "./runScript";

const AUTO_CONFIRM_THRESHOLD = 0.8;
const AUTO_CONFIRM_MARGIN = 0.15;

runScript(async () => {
  const pending = await db
    .select()
    .from(restaurantMatchCandidates)
    .where(eq(restaurantMatchCandidates.status, "pending"));

  const groups = new Map<string, typeof pending>();
  for (const c of pending) {
    const key = `${c.restaurantId}:${c.source}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }

  let confirmed = 0;
  let skippedTied = 0;
  let skippedLowConfidence = 0;

  for (const [, candidates] of groups) {
    const scored = candidates.map((c) => ({ ...c, matchScore: Number(c.matchScore) }));
    const winner = pickAutoConfirmWinner(scored, AUTO_CONFIRM_THRESHOLD, AUTO_CONFIRM_MARGIN);

    if (!winner) {
      // Distinguish "genuinely too close to call" (a real tie, e.g. same city twice,
      // or no city data to break the tie with) from "just not confident enough" —
      // useful for eyeballing how much of the backlog is which.
      const top = Math.max(...scored.map((c) => c.matchScore));
      if (top >= AUTO_CONFIRM_THRESHOLD) skippedTied++;
      else skippedLowConfidence++;
      continue;
    }

    await applyConfirmedMatch(db, winner.id, null);
    confirmed++;
  }

  console.log(
    `Auto-confirmed ${confirmed} matches (score >= ${AUTO_CONFIRM_THRESHOLD}, decisively ahead of any runner-up by >= ${AUTO_CONFIRM_MARGIN}). ` +
      `Left ${skippedTied} tied/ambiguous and ${skippedLowConfidence} low-confidence for manual review.`,
  );
});
