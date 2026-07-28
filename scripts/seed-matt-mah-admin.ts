import "./env";
import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { profiles } from "../src/db/schema";
import { runScript } from "./runScript";

const EMAIL = "matthewariimah@gmail.com";
const DISPLAY_NAME = "Matt Mah";

runScript(async () => {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Find or create the auth user (email_confirm avoids sending a confirmation email, and
  // — same reason as seed-nader-visits.ts — lets Supabase's automatic account-linking-by-
  // verified-email attach a future Google sign-in to this same account instead of erroring).
  const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  if (listError) throw listError;

  let userId = existingUsers.users.find((u) => u.email === EMAIL)?.id;

  if (!userId) {
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: EMAIL,
      email_confirm: true,
      user_metadata: { full_name: DISPLAY_NAME },
    });
    if (createError) throw createError;
    userId = created.user.id;
    console.log(`Created auth user ${EMAIL} (${userId})`);
  } else {
    console.log(`Found existing auth user ${EMAIL} (${userId})`);
  }

  // The on-insert trigger auto-creates a profiles row (non-admin, non-approved by
  // default) — promote it to an approved admin, and make sure the name is set (covers
  // the "already existed" path too, in case it was created without metadata).
  await db
    .update(profiles)
    .set({ displayName: DISPLAY_NAME, isAdmin: true, isApproved: true })
    .where(eq(profiles.id, userId));

  console.log(`${DISPLAY_NAME} is now an approved admin.`);
});
