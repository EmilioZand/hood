"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { consumeInvite, validateInvite } from "@/lib/data/invites";
import { safeRedirectPath } from "@/lib/http/safeRedirect";

export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  // Untrusted: originates from ?redirectTo= and is echoed into a hidden field. Sanitized
  // because redirect() accepts absolute URLs, which would let a crafted login link bounce
  // a just-authenticated user to a credential-harvesting lookalike.
  const redirectTo = safeRedirectPath(formData.get("redirectTo")?.toString());

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect(redirectTo);
}

export async function signUpWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const inviteToken = String(formData.get("invite") ?? "");

  // Re-validated server-side regardless of what the page already checked — never trust
  // client-supplied state for the actual gate.
  const result = await validateInvite(db, inviteToken, email);
  if (!result.valid) {
    redirect(`/signup?invite=${encodeURIComponent(inviteToken)}&error=${encodeURIComponent(result.reason)}`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/callback`,
    },
  });

  if (error || !data.user) {
    redirect(`/signup?invite=${encodeURIComponent(inviteToken)}&error=${encodeURIComponent(error?.message ?? "Sign up failed")}`);
  }

  await db.update(profiles).set({ isApproved: true }).where(eq(profiles.id, data.user.id));
  await consumeInvite(db, result.invite.id, data.user.id);

  redirect("/login?message=Check your email to confirm your account");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function signInWithGoogle(redirectTo: string, inviteToken?: string) {
  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const callbackUrl = new URL(`${siteUrl}/auth/callback`);
  // Sanitized here so a bad value never even enters the OAuth round trip; the callback
  // sanitizes again at the point of redirect, since this param leaves our control in between.
  callbackUrl.searchParams.set("redirectTo", safeRedirectPath(redirectTo));
  if (inviteToken) callbackUrl.searchParams.set("invite", inviteToken);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error || !data.url) {
    redirect(`/login?error=${encodeURIComponent(error?.message ?? "oauth_failed")}`);
  }

  redirect(data.url);
}
