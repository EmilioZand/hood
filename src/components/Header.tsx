import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { SearchBox } from "@/components/SearchBox";
import { Avatar } from "@/components/Avatar";

export async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
  const isAdmin = profile?.isAdmin ?? false;
  const isApproved = profile?.isApproved ?? false;

  return (
    <header className="flex flex-wrap items-center gap-3 bg-brand-green px-6 py-3 text-brand-cream sm:grid sm:grid-cols-[auto_1fr_auto] sm:flex-nowrap">
      <Link href="/" className="flex items-center gap-2">
        <Image src="/icon.png" alt="" width={36} height={36}/>
        <span className="hidden text-xs text-brand-cream/70 sm:inline">What's good in the hood?</span>
      </Link>
      {isApproved && (
        <div className="order-last w-full sm:order-none sm:mx-auto sm:w-full sm:max-w-xl">
          <Suspense fallback={null}>
            <SearchBox />
          </Suspense>
        </div>
      )}
      <nav className="flex items-center gap-4 text-sm sm:col-start-3 sm:justify-self-end">
        {isApproved && (
          <>
            <Link href="/" className="hover:text-brand-gold">
              Spots
            </Link>
            <Link href="/add-entry" className="hover:text-brand-gold">
              Add Spot
            </Link>
            {isAdmin && (
              <Link href="/admin" className="hover:text-brand-gold">
                Admin
              </Link>
            )}
          </>
        )}
        <Link href={`/users/${user.id}`} aria-label="Your profile">
          <Avatar avatarUrl={profile?.avatarUrl ?? null} displayName={profile?.displayName ?? null} size={32} />
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded border border-brand-cream/30 px-2 py-1 hover:bg-brand-green-dark"
          >
            Sign out
          </button>
        </form>
      </nav>
    </header>
  );
}
