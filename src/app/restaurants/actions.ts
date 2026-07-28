"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  restaurantAwards,
  restaurantLocations,
  restaurantNotes,
  restaurantRatings,
  restaurants,
  restaurantVisits,
} from "@/db/schema";
import { requireAdmin, requireUser } from "@/lib/auth/guards";
import { setCuisineTags } from "@/lib/data/cuisines";
import { getOrCreateNeighborhoodId } from "@/lib/data/neighborhoods";
import { rankCandidates, pickAutoConfirmWinner } from "@/lib/matching/fuzzyMatch";
import { queueGoogleMatchCandidates } from "@/lib/data/googlePlacesMatch";
import { applyConfirmedMatch } from "@/lib/data/matchCandidates";

// Higher than restaurant_recommendations' duplicate-flagging bar (0.5) because this one
// actually blocks creation (behind an explicit "create anyway" resubmit) rather than just
// leaving an advisory note. At 0.5, two unrelated same-city restaurants with only a couple
// of shared trigram fragments (e.g. "Zuni Cafe" vs "Bar Gemini", raw name similarity ~0.33)
// could cross the line on the same-city boost alone. 0.65 requires a same-city match to
// still carry a raw name score of ~0.53+ — comfortably below true near-duplicates (typo/
// accent/generic-word variants score >0.85 in fuzzyMatch.test.ts) but above coincidental
// city-only overlap.
const DUPLICATE_THRESHOLD = 0.65;
// Matches scripts/auto-confirm-matches.ts's bar for auto-confirming a Google match
// without human review.
const AUTO_CONFIRM_THRESHOLD = 0.8;

export type CreateRestaurantResult =
  | { duplicate: { id: string; name: string; city: string } }
  | { id: string };

export async function createRestaurant(formData: FormData): Promise<CreateRestaurantResult> {
  const admin = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  if (!name || !city) throw new Error("Name and city are required");

  if (formData.get("confirmCreate") !== "1") {
    const existing = await db
      .select({ id: restaurants.id, name: restaurants.name, city: restaurants.city })
      .from(restaurants);
    const bestMatch = rankCandidates(existing, { name, city })[0];
    if (bestMatch && bestMatch.matchScore >= DUPLICATE_THRESHOLD) {
      return { duplicate: { id: bestMatch.id, name: bestMatch.name, city: bestMatch.city } };
    }
  }

  const neighborhoodId = await getOrCreateNeighborhoodId(
    db,
    city,
    String(formData.get("neighborhood") ?? "").trim() || null,
  );

  const [created] = await db
    .insert(restaurants)
    .values({
      name,
      city,
      neighborhoodId,
      isWalkIn: formData.get("isWalkIn") === "on",
      createdBy: admin.id,
    })
    .returning({ id: restaurants.id });

  await setCuisineTags(db, created.id, String(formData.get("cuisine") ?? ""));

  // Best-effort — a Places lookup failure shouldn't block spot creation. Anything not
  // auto-confirmed here is still queued as a pending candidate for /admin/matches.
  if (process.env.GOOGLE_PLACES_API_KEY) {
    try {
      const queued = await queueGoogleMatchCandidates(
        db,
        { id: created.id, name, city },
        process.env.GOOGLE_PLACES_API_KEY,
      );
      const winner = pickAutoConfirmWinner(queued, AUTO_CONFIRM_THRESHOLD);
      if (winner) await applyConfirmedMatch(db, winner.id, admin.id);
    } catch {
      // Ignored — admin can still find/confirm a match later via /admin/matches.
    }
  }

  revalidatePath("/");
  return { id: created.id };
}

const MICHELIN_STATUSES = [
  "none",
  "selected",
  "bib_gourmand",
  "one_star",
  "two_star",
  "three_star",
] as const;

export async function updateRestaurant(id: string, formData: FormData) {
  const admin = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  if (!name || !city) throw new Error("Name and city are required");

  const neighborhoodId = await getOrCreateNeighborhoodId(
    db,
    city,
    String(formData.get("neighborhood") ?? "").trim() || null,
  );

  await db
    .update(restaurants)
    .set({
      name,
      city,
      neighborhoodId,
      isWalkIn: formData.get("isWalkIn") === "on",
      updatedAt: new Date(),
    })
    .where(eq(restaurants.id, id));

  await setCuisineTags(db, id, String(formData.get("cuisine") ?? ""));

  const michelinStatusRaw = String(formData.get("michelinStatus") ?? "none");
  const michelinStatus = MICHELIN_STATUSES.includes(michelinStatusRaw as (typeof MICHELIN_STATUSES)[number])
    ? (michelinStatusRaw as (typeof MICHELIN_STATUSES)[number])
    : "none";

  await db
    .insert(restaurantAwards)
    .values({
      restaurantId: id,
      michelinStatus,
      confirmedBy: admin.id,
      confirmedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: restaurantAwards.restaurantId,
      set: { michelinStatus, confirmedBy: admin.id, confirmedAt: new Date() },
    });

  revalidatePath("/");
  revalidatePath(`/restaurants/${id}`);
}

export async function deleteRestaurant(id: string) {
  await requireAdmin();
  await db.delete(restaurants).where(eq(restaurants.id, id));
  revalidatePath("/");
}

export async function toggleHighPriority(id: string, next: boolean) {
  await requireAdmin();
  await db
    .update(restaurants)
    .set({ isHighPriority: next, priority: next ? "high" : "none", updatedAt: new Date() })
    .where(eq(restaurants.id, id));
  revalidatePath("/");
  revalidatePath(`/restaurants/${id}`);
}

export async function toggleVisited(id: string) {
  const user = await requireUser();

  const [existing] = await db
    .select()
    .from(restaurantVisits)
    .where(and(eq(restaurantVisits.restaurantId, id), eq(restaurantVisits.userId, user.id)))
    .limit(1);

  if (existing) {
    await db
      .delete(restaurantVisits)
      .where(and(eq(restaurantVisits.restaurantId, id), eq(restaurantVisits.userId, user.id)));
  } else {
    await db.insert(restaurantVisits).values({ restaurantId: id, userId: user.id });
  }

  revalidatePath("/");
  revalidatePath(`/restaurants/${id}`);
}

export async function rateRestaurant(id: string, rating: number) {
  const user = await requireUser();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error("Rating must be an integer between 1 and 5");
  }

  await db
    .insert(restaurantRatings)
    .values({ restaurantId: id, userId: user.id, rating })
    .onConflictDoUpdate({
      target: [restaurantRatings.restaurantId, restaurantRatings.userId],
      set: { rating, updatedAt: new Date() },
    });

  revalidatePath("/");
  revalidatePath(`/restaurants/${id}`);
}

export async function addNote(id: string, body: string) {
  const user = await requireUser();
  const trimmed = body.trim();
  if (!trimmed) return;

  await db.insert(restaurantNotes).values({ restaurantId: id, authorId: user.id, body: trimmed });
  revalidatePath(`/restaurants/${id}`);
}

export async function closeSuppressClosure(locationId: string, restaurantId: string, suppressed: boolean) {
  await requireAdmin();
  await db
    .update(restaurantLocations)
    .set({ closureSuppressed: suppressed })
    .where(eq(restaurantLocations.id, locationId));
  revalidatePath(`/restaurants/${restaurantId}`);
  revalidatePath("/");
}
