import "server-only";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

export class UnauthorizedError extends Error {
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Admin access required") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export type CurrentUser = {
  id: string;
  email: string | null;
  isAdmin: boolean;
  displayName: string | null;
  avatarUrl: string | null;
};

// The real authorization gate. proxy.ts only redirects the browser for UX;
// every server action / route handler must call this independently, since
// Drizzle connects to Postgres directly and does not enforce RLS.
export async function requireUser(): Promise<CurrentUser> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new UnauthorizedError();
  }

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);

  // Belt-and-suspenders: a Google account only reaches here unapproved if it somehow
  // bypassed the invite check in the OAuth callback (see src/app/auth/callback/route.ts).
  if (profile && !profile.isApproved) {
    redirect("/pending-approval");
  }

  return {
    id: user.id,
    email: user.email ?? null,
    isAdmin: profile?.isAdmin ?? false,
    displayName: profile?.displayName ?? null,
    avatarUrl: profile?.avatarUrl ?? null,
  };
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.isAdmin) {
    throw new ForbiddenError();
  }
  return user;
}
