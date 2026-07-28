import { and, eq } from "drizzle-orm";
import type { db as dbType } from "@/db";
import { neighborhoods } from "@/db/schema";

/** Finds or creates the (city, name) neighborhood row, returning its id — null if no
 * name was given, since neighborhood is optional on a restaurant. */
export async function getOrCreateNeighborhoodId(
  db: typeof dbType,
  city: string,
  name: string | null,
): Promise<string | null> {
  if (!name) return null;

  const [existing] = await db
    .select({ id: neighborhoods.id })
    .from(neighborhoods)
    .where(and(eq(neighborhoods.city, city), eq(neighborhoods.name, name)))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(neighborhoods)
    .values({ city, name })
    .onConflictDoNothing()
    .returning({ id: neighborhoods.id });
  if (created) return created.id;

  // Lost a race with a concurrent insert of the same (city, name) pair — it exists now.
  const [afterConflict] = await db
    .select({ id: neighborhoods.id })
    .from(neighborhoods)
    .where(and(eq(neighborhoods.city, city), eq(neighborhoods.name, name)))
    .limit(1);
  return afterConflict?.id ?? null;
}

export async function getAllNeighborhoods(db: typeof dbType) {
  return db.select({ id: neighborhoods.id, name: neighborhoods.name, city: neighborhoods.city }).from(neighborhoods);
}
