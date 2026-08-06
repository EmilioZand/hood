import { eq } from "drizzle-orm";
import type { db as dbType } from "@/db";
import { cuisineGroups, cuisines, restaurantCuisines } from "@/db/schema";
import { splitCuisines } from "@/lib/import/cuisines";
import { classifyCuisineGroup } from "@/lib/data/cuisineGroups";

export async function getOrCreateCuisine(db: typeof dbType, name: string): Promise<string> {
  const [existing] = await db.select().from(cuisines).where(eq(cuisines.name, name)).limit(1);
  if (existing) return existing.id;

  const groupName = classifyCuisineGroup(name);
  let groupId: string | null = null;
  if (groupName) {
    const [group] = await db.select().from(cuisineGroups).where(eq(cuisineGroups.name, groupName)).limit(1);
    groupId = group?.id ?? null;
  }

  const [created] = await db.insert(cuisines).values({ name, groupId }).returning();
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
