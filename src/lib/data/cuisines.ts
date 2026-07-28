import { eq } from "drizzle-orm";
import type { db as dbType } from "@/db";
import { cuisines, restaurantCuisines } from "@/db/schema";
import { splitCuisines } from "@/lib/import/cuisines";

export async function getOrCreateCuisine(db: typeof dbType, name: string): Promise<string> {
  const [existing] = await db.select().from(cuisines).where(eq(cuisines.name, name)).limit(1);
  if (existing) return existing.id;
  const [created] = await db.insert(cuisines).values({ name }).returning();
  return created.id;
}

/** Tags a restaurant with cuisines parsed from raw text, creating cuisines as needed. */
export async function addCuisineTags(db: typeof dbType, restaurantId: string, cuisineText: string | null) {
  for (const name of splitCuisines(cuisineText)) {
    const cuisineId = await getOrCreateCuisine(db, name);
    await db.insert(restaurantCuisines).values({ restaurantId, cuisineId }).onConflictDoNothing();
  }
}

/** Replaces a restaurant's cuisine tags entirely with those parsed from raw text. */
export async function setCuisineTags(db: typeof dbType, restaurantId: string, cuisineText: string | null) {
  await db.delete(restaurantCuisines).where(eq(restaurantCuisines.restaurantId, restaurantId));
  await addCuisineTags(db, restaurantId, cuisineText);
}
