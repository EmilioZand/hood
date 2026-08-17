import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { consumeInvite, validateInvite } from "@/lib/data/invites";
import { safeRedirectPath } from "@/lib/http/safeRedirect";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Sanitized at the sink: this param survived an OAuth round trip through Google, so it
  // is untrusted regardless of what signInWithGoogle put in it.
  const redirectTo = safeRedirectPath(searchParams.get("redirectTo"));
  const inviteToken = searchParams.get("invite");

  if (code) {
    const supabase = await createClient();
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const [profile] = await db.select().from(profiles).where(eq(profiles.id, data.user.id)).limit(1);

      // Google OAuth auto-provisions an account on first sign-in — there's no separate
      // "sign up" step to gate the way password sign-up has, so a brand-new (unapproved)
      // profile must redeem a valid invite right here or the account never gets approved.
      if (profile && !profile.isApproved) {
        const result = await validateInvite(db, inviteToken, data.user.email);
        if (!result.valid) {
          await supabase.auth.signOut();
          return NextResponse.redirect(
            `${origin}/login?error=${encodeURIComponent("This app is invite-only. Ask an admin for an invite link.")}`,
          );
        }
        await db.update(profiles).set({ isApproved: true }).where(eq(profiles.id, data.user.id));
        await consumeInvite(db, result.invite.id, data.user.id);
      }

      // new URL(path, origin) rather than string concat — concatenation produced an
      // unparseable URL (and a 500) for any value that wasn't already a bare path.
      return NextResponse.redirect(new URL(redirectTo, origin));
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
