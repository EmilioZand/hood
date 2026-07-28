import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client (Client Components) — used for the auth UI
// (sign in/up forms, OAuth redirect) only, not for data access.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
