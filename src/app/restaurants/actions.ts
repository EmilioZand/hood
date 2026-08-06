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
  revalidatePath("/admin/matches");
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

/** Manually marks a location closed/reopened — the same `permanently_closed` status the
 * sync-ratings cron sets from Google's business_status, just set by hand instead. Clears
 * closureSuppressed either way, since that flag only makes sense layered on top of an
 * actual closed status. */
export async function setLocationClosed(locationId: string, restaurantId: string, closed: boolean) {
  await requireAdmin();

  if (!closed) {
    // Reopening a placeholder row created by markRestaurantClosedNoLocation (no address,
    // nothing else worth keeping) removes it entirely instead of leaving an empty "active"
    // location behind — restoring the restaurant to its original zero-location state.
    const [location] = await db
      .select({ address: restaurantLocations.address })
      .from(restaurantLocations)
      .where(eq(restaurantLocations.id, locationId))
      .limit(1);
    if (location && location.address === null) {
      await db.delete(restaurantLocations).where(eq(restaurantLocations.id, locationId));
      revalidatePath(`/restaurants/${restaurantId}`);
      revalidatePath("/");
      revalidatePath("/admin/matches");
      return;
    }
  }

  await db
    .update(restaurantLocations)
    .set({
      status: closed ? "permanently_closed" : "active",
      closedDetectedAt: closed ? new Date() : null,
      closureSuppressed: false,
      updatedAt: new Date(),
    })
    .where(eq(restaurantLocations.id, locationId));
  revalidatePath(`/restaurants/${restaurantId}`);
  revalidatePath("/");
  revalidatePath("/admin/matches");
}

/** Marks a location-less restaurant permanently closed by creating a minimal placeholder
 * location (no address/coordinates — nothing was ever confirmed) carrying the same
 * `permanently_closed` status as a real location. Once created, it's just a normal location
 * to the rest of the app (shows up in the locations list, the "Reopen" toggle above, and
 * match review's single-location toggle) — see setLocationClosed for how reopening it cleans
 * back up. */
export async function markRestaurantClosedNoLocation(restaurantId: string) {
  await requireAdmin();
  await db.insert(restaurantLocations).values({
    restaurantId,
    status: "permanently_closed",
    closedDetectedAt: new Date(),
  });
  revalidatePath(`/restaurants/${restaurantId}`);
  revalidatePath("/");
  revalidatePath("/admin/matches");
}
