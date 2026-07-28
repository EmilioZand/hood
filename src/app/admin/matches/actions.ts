"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { restaurantMatchCandidates } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { applyConfirmedMatch } from "@/lib/data/matchCandidates";

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
