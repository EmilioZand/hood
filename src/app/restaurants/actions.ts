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

export async function createRestaurant(formData: FormData) {
  const admin = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  if (!name || !city) throw new Error("Name and city are required");

  const [created] = await db
    .insert(restaurants)
    .values({
      name,
      city,
      neighborhood: String(formData.get("neighborhood") ?? "").trim() || null,
      isWalkIn: formData.get("isWalkIn") === "on",
      createdBy: admin.id,
    })
    .returning({ id: restaurants.id });

  await setCuisineTags(db, created.id, String(formData.get("cuisine") ?? ""));

  revalidatePath("/");
  return created.id;
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

  await db
    .update(restaurants)
    .set({
      name,
      city,
      neighborhood: String(formData.get("neighborhood") ?? "").trim() || null,
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
