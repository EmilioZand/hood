import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cuisines, restaurants } from "@/db/schema";

export async function getAllCuisines() {
  return db.select().from(cuisines).orderBy(cuisines.name);
}

// Small dataset (hundreds, not millions of rows) — fetch with relations and
// filter/sort in-memory rather than building a dynamic SQL WHERE clause.
export async function getRestaurantsWithRelations() {
  return db.query.restaurants.findMany({
    with: {
      locations: true,
      cuisines: { with: { cuisine: true } },
      visits: { with: { user: true } },
      ratings: true,
      award: true,
    },
    orderBy: (r, { asc }) => [asc(r.name)],
  });
}

export async function getRestaurantById(id: string) {
  return db.query.restaurants.findFirst({
    where: eq(restaurants.id, id),
    with: {
      locations: true,
      cuisines: { with: { cuisine: true } },
      visits: { with: { user: true } },
      ratings: true,
      notes: { with: { author: true }, orderBy: (n, { desc }) => [desc(n.createdAt)] },
      award: true,
    },
  });
}

export type RestaurantWithRelations = NonNullable<Awaited<ReturnType<typeof getRestaurantById>>>;
export type RestaurantListItem = Awaited<ReturnType<typeof getRestaurantsWithRelations>>[number];
