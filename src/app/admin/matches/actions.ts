"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { restaurantMatchCandidates, restaurants } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { applyConfirmedMatch } from "@/lib/data/matchCandidates";
import { queueGoogleMatchCandidates } from "@/lib/data/googlePlacesMatch";

export async function confirmMatch(candidateId: string) {
  const admin = await requireAdmin();
  await applyConfirmedMatch(db, candidateId, admin.id);
  revalidatePath("/admin/matches");
}

export async function rejectMatch(candidateId: string) {
  const admin = await requireAdmin();
  await db
    .update(restaurantMatchCandidates)
    .set({ status: "rejected", reviewedBy: admin.id, reviewedAt: new Date() })
    .where(eq(restaurantMatchCandidates.id, candidateId));
  revalidatePath("/admin/matches");
}

export async function rejectAllForSource(restaurantId: string, source: "google" | "yelp") {
  const admin = await requireAdmin();
  await db
    .update(restaurantMatchCandidates)
    .set({ status: "rejected", reviewedBy: admin.id, reviewedAt: new Date() })
    .where(
      and(
        eq(restaurantMatchCandidates.restaurantId, restaurantId),
        eq(restaurantMatchCandidates.source, source),
      ),
    );
  revalidatePath("/admin/matches");
}

/**
 * Clears out old pending/rejected Google candidates for a restaurant (they were scored
 * against whatever name/city was current at the time) and re-runs the Google search —
 * shared by the "edit name/city" and plain "regenerate" flows below. Leaves any
 * already-confirmed candidate alone, since that already created a real location
 * independent of this candidate row. Best-effort: silently does nothing if Google
 * Places isn't configured or the search fails, same as spot-creation's own lookup.
 */
async function resyncGoogleCandidates(restaurantId: string, name: string, city: string) {
  if (!process.env.GOOGLE_PLACES_API_KEY) return;

  try {
    await db
      .delete(restaurantMatchCandidates)
      .where(
        and(
          eq(restaurantMatchCandidates.restaurantId, restaurantId),
          eq(restaurantMatchCandidates.source, "google"),
          inArray(restaurantMatchCandidates.status, ["pending", "rejected"]),
        ),
      );
    await queueGoogleMatchCandidates(db, { id: restaurantId, name, city }, process.env.GOOGLE_PLACES_API_KEY);
  } catch {
    // Ignored — can be retried later from the review queue.
  }
}

/**
 * Corrects a restaurant's name/city right from the review queue (a likely cause of a
 * bad match batch) and re-runs the Google search against the corrected values.
 */
export async function updateAndResyncGoogle(restaurantId: string, formData: FormData) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  if (!name || !city) throw new Error("Name and city are required");

  await db
    .update(restaurants)
    .set({ name, city, updatedAt: new Date() })
    .where(eq(restaurants.id, restaurantId));

  await resyncGoogleCandidates(restaurantId, name, city);

  revalidatePath("/admin/matches");
  revalidatePath("/");
  revalidatePath(`/restaurants/${restaurantId}`);
}

/**
 * Re-runs the Google search for a restaurant with no pending Google candidates left to
 * review (name/city unchanged) — for a spot Google never matched, or where every
 * candidate got rejected, without needing to go through the edit form first.
 */
export async function regenerateGoogleMatches(restaurantId: string) {
  await requireAdmin();

  const [restaurant] = await db
    .select({ name: restaurants.name, city: restaurants.city })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  if (!restaurant) return;

  await resyncGoogleCandidates(restaurantId, restaurant.name, restaurant.city);

  revalidatePath("/admin/matches");
}
