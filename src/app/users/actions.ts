"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export async function updateProfile(formData: FormData) {
  const user = await requireUser();
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName) throw new Error("Display name is required");

  await db.update(profiles).set({ displayName }).where(eq(profiles.id, user.id));
  revalidatePath(`/users/${user.id}`);
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export async function uploadAvatar(formData: FormData) {
  const user = await requireUser();
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose an image first");
  if (!file.type.startsWith("image/")) throw new Error("Avatar must be an image");
  if (file.size > MAX_AVATAR_BYTES) throw new Error("Avatar must be under 5MB");

  const supabase = await createClient();
  // Fixed path (no extension) so a re-upload replaces the same object via upsert
  // instead of accumulating one file per upload — content-type comes from the
  // upload call, not the path, so this renders correctly regardless.
  const path = `${user.id}/avatar`;
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(path);
  // Cache-bust: the path never changes across re-uploads, so without a unique query
  // param the browser (and any CDN) would keep showing the old cached image.
  const avatarUrl = `${publicUrl}?t=${Date.now()}`;

  await db.update(profiles).set({ avatarUrl }).where(eq(profiles.id, user.id));
  revalidatePath(`/users/${user.id}`);
}
