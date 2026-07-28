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
 * Corrects a restaurant's name/city right from the review queue (a likely cause of a
 * bad match batch) and re-runs the Google search against the corrected values. Clears
 * out the old pending/rejected Google candidates first — they were scored against the
 * name/city that's now wrong — but leaves any already-confirmed candidate alone, since
 * that already created a real location independent of this candidate row.
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

  if (process.env.GOOGLE_PLACES_API_KEY) {
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
      // Ignored — the name/city update still applies; resync can be retried later.
    }
  }

  revalidatePath("/admin/matches");
  revalidatePath("/");
  revalidatePath(`/restaurants/${restaurantId}`);
}
