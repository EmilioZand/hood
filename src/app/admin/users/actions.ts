"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";

export async function setAdminStatus(userId: string, isAdmin: boolean) {
  const admin = await requireAdmin();
  // Prevent an admin from locking themselves out by demoting their own account —
  // another admin has to do it instead.
  if (admin.id === userId) {
    throw new Error("You can't change your own admin status.");
  }

  await db.update(profiles).set({ isAdmin }).where(eq(profiles.id, userId));
  revalidatePath("/admin/users");
}
