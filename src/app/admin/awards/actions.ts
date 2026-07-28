"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { awardScrapeCandidates, restaurantAwards } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import type { JamesBeardWinner } from "@/lib/integrations/jamesBeard";

function extractYear(url: string): number | null {
  const match = url.match(/(\d{4})\D*$/);
  return match ? Number(match[1]) : null;
}

const STAGE_RANK = { none: 0, semifinalist: 1, finalist: 2, winner: 3 } as const;

export async function confirmAwardCandidate(candidateId: string) {
  const admin = await requireAdmin();

  const [candidate] = await db
    .select()
    .from(awardScrapeCandidates)
    .where(eq(awardScrapeCandidates.id, candidateId))
    .limit(1);
  if (!candidate || !candidate.restaurantId) return;

  const now = new Date();

  if (candidate.source === "james_beard") {
    const payload = candidate.rawPayload as JamesBeardWinner;
    const stage = payload.stage;

    const [existing] = await db
      .select({ jamesBeardStatus: restaurantAwards.jamesBeardStatus })
      .from(restaurantAwards)
      .where(eq(restaurantAwards.restaurantId, candidate.restaurantId))
      .limit(1);

    // Never let confirming an older/lower stage (e.g. semifinalist) downgrade a
    // restaurant that's already recorded as finalist/winner for this same review.
    const shouldApply = !existing || STAGE_RANK[stage] >= STAGE_RANK[existing.jamesBeardStatus];

    if (shouldApply) {
      await db
        .insert(restaurantAwards)
        .values({
          restaurantId: candidate.restaurantId,
          jamesBeardStatus: stage,
          jamesBeardCategory: payload.category,
          jamesBeardYear: extractYear(candidate.scrapedUrl),
          jamesBeardUrl: candidate.scrapedUrl,
          confirmedBy: admin.id,
          confirmedAt: now,
        })
        .onConflictDoUpdate({
          target: restaurantAwards.restaurantId,
          set: {
            jamesBeardStatus: stage,
            jamesBeardCategory: payload.category,
            jamesBeardYear: extractYear(candidate.scrapedUrl),
            jamesBeardUrl: candidate.scrapedUrl,
            confirmedBy: admin.id,
            confirmedAt: now,
          },
        });
    }
  }

  await db
    .update(awardScrapeCandidates)
    .set({ status: "confirmed", reviewedBy: admin.id, reviewedAt: now })
    .where(eq(awardScrapeCandidates.id, candidateId));

  revalidatePath("/admin/awards");
}

export async function rejectAwardCandidate(candidateId: string) {
  const admin = await requireAdmin();
  await db
    .update(awardScrapeCandidates)
    .set({ status: "rejected", reviewedBy: admin.id, reviewedAt: new Date() })
    .where(eq(awardScrapeCandidates.id, candidateId));
  revalidatePath("/admin/awards");
}
