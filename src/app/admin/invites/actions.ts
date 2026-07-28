"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { invites } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { generateInviteToken } from "@/lib/data/invites";

export async function createInvite(formData: FormData) {
  const admin = await requireAdmin();
  const email = String(formData.get("email") ?? "").trim() || null;

  await db.insert(invites).values({
    token: generateInviteToken(),
    email,
    createdBy: admin.id,
  });

  revalidatePath("/admin/invites");
}

export async function revokeInvite(inviteId: string) {
  await requireAdmin();
  await db.update(invites).set({ revokedAt: new Date() }).where(eq(invites.id, inviteId));
  revalidatePath("/admin/invites");
}
