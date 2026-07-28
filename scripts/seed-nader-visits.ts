import "./env";
import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { profiles, restaurants, restaurantVisits } from "../src/db/schema";
import { runScript } from "./runScript";

const EMAIL = "mehran22091@gmail.com";
const DISPLAY_NAME = "Nader Mehra";

runScript(async () => {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Find or create the auth user (email_confirm avoids sending a confirmation email).
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

  // The on-insert trigger auto-creates a profiles row; make sure display_name is set
  // (covers the "already existed" path too, in case it was created without metadata).
  await db.update(profiles).set({ displayName: DISPLAY_NAME }).where(eq(profiles.id, userId));

  const legacyVisited = await db
    .select({ id: restaurants.id, name: restaurants.name })
    .from(restaurants)
    .where(eq(restaurants.legacyBeenThere, true));

  console.log(`Backfilling ${legacyVisited.length} legacy-visited restaurants...`);

  for (const r of legacyVisited) {
    await db.insert(restaurantVisits).values({ restaurantId: r.id, userId }).onConflictDoNothing();
  }

  console.log("Done.");
});
