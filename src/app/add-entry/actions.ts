"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { restaurantNotes, restaurantRecommendations, restaurants, restaurantVisits } from "@/db/schema";
import { requireUser } from "@/lib/auth/guards";
import { rankCandidates } from "@/lib/matching/fuzzyMatch";
import { addCuisineTags } from "@/lib/data/cuisines";
import { getOrCreateNeighborhoodId } from "@/lib/data/neighborhoods";

const DUPLICATE_THRESHOLD = 0.5;

/**
 * Submitting immediately creates the restaurant — no admin approval gate. The
 * restaurant_recommendations row is kept as a submission log (who added it, and
 * the possible-duplicate flag), not a pending queue.
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

  const existingRestaurants = await db
    .select({ id: restaurants.id, name: restaurants.name, city: restaurants.city })
    .from(restaurants);

  const ranked = rankCandidates(existingRestaurants, { name, city });
  const bestMatch = ranked[0];
  const possibleDuplicateOf =
    bestMatch && bestMatch.matchScore >= DUPLICATE_THRESHOLD ? bestMatch.id : null;

  const resolvedCity = city ?? "Unknown";
  const neighborhoodId = await getOrCreateNeighborhoodId(db, resolvedCity, neighborhood);

  const [created] = await db
    .insert(restaurants)
    .values({
      name,
      city: resolvedCity,
      neighborhoodId,
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

  revalidatePath("/add-entry");
  revalidatePath("/");
  redirect(`/restaurants/${created.id}`);
}
