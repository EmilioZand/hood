"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { restaurantNotes, restaurantRecommendations, restaurants, restaurantVisits } from "@/db/schema";
import { requireUser } from "@/lib/auth/guards";
import { rankCandidates, pickAutoConfirmWinner, GOOGLE_AUTO_CONFIRM_THRESHOLD } from "@/lib/matching/fuzzyMatch";
import { addCuisineTags } from "@/lib/data/cuisines";
import { getOrCreateNeighborhoodId } from "@/lib/data/neighborhoods";
import { findRankedGoogleMatches, queueGoogleMatchCandidates } from "@/lib/data/googlePlacesMatch";
import { applyConfirmedMatch } from "@/lib/data/matchCandidates";

// The one duplicate-detection bar for adding a spot, whoever's adding it. At 0.5, two
// unrelated same-city restaurants with only a couple of shared trigram fragments (e.g.
// "Harris" vs "Morris", raw name similarity 0.5 from sharing "rris") could cross the line
// on the same-city boost alone. 0.65 requires a same-city match to still carry a raw name
// score of ~0.53+ — comfortably below true near-duplicates (typo/accent/generic-word
// variants score >0.85 in fuzzyMatch.test.ts) but above coincidental short-name overlap.
const DUPLICATE_THRESHOLD = 0.65;

/**
 * Step 1 of the add-a-spot wizard: takes just name + city. Blocks on a confident
 * duplicate (redirects back here with a warning, same name/city preserved, and a
 * "Create anyway" resubmit) unless already confirmed. Otherwise does a best-effort
 * Google lookup and hands off to step 2 with Neighborhood/Cuisine prefilled from a
 * confident match (same bar as the auto-confirm below — if it's not confident enough to
 * write without review, it's not confident enough to prefill without a caveat either). No
 * restaurant is created until step 2 is submitted.
 */
export async function startAddSpot(formData: FormData) {
  await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  if (!name || !city) throw new Error("Name and city are required");

  // Carried forward once a duplicate warning has already been shown and overridden —
  // resubmitting with confirmCreate=1 skips the check below, so this is the only record
  // of which restaurant it was flagged against (needed at step 2 for the log).
  let confirmedDupId = String(formData.get("dupId") ?? "").trim() || null;

  if (formData.get("confirmCreate") !== "1") {
    confirmedDupId = null;
    const existing = await db
      .select({ id: restaurants.id, name: restaurants.name, city: restaurants.city })
      .from(restaurants);

    // A restaurant's (name, city) pair is its identity — a chain's multiple branches are
    // modeled as multiple locations under one restaurant row (see restaurants' own schema
    // comment), enforced by a DB-level unique constraint. So unlike a fuzzy near-duplicate,
    // an exact (case-insensitive) match here has no "create anyway": that insert would
    // just fail the constraint. Point at the existing one instead.
    const exactMatch = existing.find(
      (r) => r.name.trim().toLowerCase() === name.toLowerCase() && r.city.trim().toLowerCase() === city.toLowerCase(),
    );
    if (exactMatch) {
      const qp = new URLSearchParams({ name, city, exactDupId: exactMatch.id, exactDupName: exactMatch.name });
      redirect(`/add-entry?${qp.toString()}`);
    }

    const bestMatch = rankCandidates(existing, { name, city })[0];
    if (bestMatch && bestMatch.matchScore >= DUPLICATE_THRESHOLD) {
      const qp = new URLSearchParams({
        name,
        city,
        dupId: bestMatch.id,
        dupName: bestMatch.name,
        dupCity: bestMatch.city,
      });
      redirect(`/add-entry?${qp.toString()}`);
    }
  }

  let neighborhood = "";
  let cuisine = "";
  let matched = false;

  if (process.env.GOOGLE_PLACES_API_KEY) {
    try {
      const ranked = await findRankedGoogleMatches(name, city, process.env.GOOGLE_PLACES_API_KEY);
      const winner = pickAutoConfirmWinner(ranked, GOOGLE_AUTO_CONFIRM_THRESHOLD);
      if (winner) {
        matched = true;
        neighborhood = winner.neighborhood ?? "";
        cuisine = winner.cuisine ?? "";
      }
    } catch {
      // Best-effort — falls through to step 2 with blank fields for manual entry.
    }
  }

  const qp = new URLSearchParams({ step: "2", name, city });
  if (neighborhood) qp.set("neighborhood", neighborhood);
  if (cuisine) qp.set("cuisine", cuisine);
  if (matched) qp.set("matched", "1");
  if (confirmedDupId) qp.set("dupId", confirmedDupId);
  redirect(`/add-entry?${qp.toString()}`);
}

/**
 * Step 2: submitting immediately creates the restaurant — no admin approval gate. The
 * restaurant_recommendations row is kept as a submission log (who added it, and
 * the possible-duplicate flag carried over from step 1's check), not a pending queue.
 */
export async function submitRecommendation(formData: FormData) {
  const user = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required");
  const city = String(formData.get("city") ?? "").trim() || null;
  const neighborhood = String(formData.get("neighborhood") ?? "").trim() || null;
  const cuisineText = String(formData.get("cuisine") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const isHighPriority = formData.get("isHighPriority") === "on";
  const alreadyVisited = formData.get("alreadyVisited") === "on";
  const isWalkIn = formData.get("isWalkIn") === "on";
  const possibleDuplicateOf = String(formData.get("dupId") ?? "").trim() || null;

  const resolvedCity = city ?? "Unknown";
  const neighborhoodId = await getOrCreateNeighborhoodId(db, resolvedCity, neighborhood);

  const [created] = await db
    .insert(restaurants)
    .values({
      name,
      city: resolvedCity,
      neighborhoodId,
      isWalkIn,
      isHighPriority,
      priority: isHighPriority ? "high" : "none",
      createdBy: user.id,
    })
    .returning({ id: restaurants.id });

  await addCuisineTags(db, created.id, cuisineText);

  if (alreadyVisited) {
    await db.insert(restaurantVisits).values({ restaurantId: created.id, userId: user.id });
  }

  if (notes) {
    await db.insert(restaurantNotes).values({ restaurantId: created.id, authorId: user.id, body: notes });
  }

  await db.insert(restaurantRecommendations).values({
    name,
    city,
    neighborhood,
    cuisineText,
    notes,
    isHighPriority,
    alreadyVisited,
    suggestedBy: user.id,
    possibleDuplicateOf,
    status: "approved",
    reviewedBy: user.id,
    reviewedAt: new Date(),
    resultingRestaurantId: created.id,
  });

  // Best-effort: a confident Google match auto-applies its address/coordinates/rating;
  // anything less confident is still queued as a pending candidate for /admin/matches.
  if (process.env.GOOGLE_PLACES_API_KEY) {
    try {
      const queued = await queueGoogleMatchCandidates(
        db,
        { id: created.id, name, city: resolvedCity },
        process.env.GOOGLE_PLACES_API_KEY,
      );
      const winner = pickAutoConfirmWinner(queued, GOOGLE_AUTO_CONFIRM_THRESHOLD);
      if (winner) await applyConfirmedMatch(db, winner.id, user.id);
    } catch {
      // Ignored — can still be found/confirmed later via /admin/matches.
    }
  }

  revalidatePath("/add-entry");
  revalidatePath("/");
  redirect(`/restaurants/${created.id}`);
}
