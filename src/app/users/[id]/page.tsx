import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/db";
import { profiles, restaurantRatings, restaurantVisits } from "@/db/schema";
import { Avatar } from "@/components/Avatar";
import { AvatarUploadForm } from "@/components/AvatarUploadForm";
import { DisplayNameEditor } from "@/components/DisplayNameEditor";

export default async function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const currentUser = await requireUser();
  const { id } = await params;

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, id)).limit(1);
  if (!profile) notFound();

  const isOwnProfile = id === currentUser.id;

  const [visits, ratings] = await Promise.all([
    db.query.restaurantVisits.findMany({
      where: eq(restaurantVisits.userId, id),
      with: { restaurant: true },
    }),
    db.query.restaurantRatings.findMany({
      where: eq(restaurantRatings.userId, id),
      with: { restaurant: true },
    }),
  ]);

  type ActivityRow = {
    restaurantId: string;
    name: string;
    city: string;
    visitedAt: Date | null;
    rating: number | null;
    lastActivityAt: Date;
  };

  const activityByRestaurant = new Map<string, ActivityRow>();
  for (const v of visits) {
    activityByRestaurant.set(v.restaurantId, {
      restaurantId: v.restaurantId,
      name: v.restaurant.name,
      city: v.restaurant.city,
      visitedAt: v.firstVisitedAt,
      rating: null,
      lastActivityAt: v.firstVisitedAt,
    });
  }
  for (const r of ratings) {
    const existing = activityByRestaurant.get(r.restaurantId);
    activityByRestaurant.set(r.restaurantId, {
      restaurantId: r.restaurantId,
      name: r.restaurant.name,
      city: r.restaurant.city,
      visitedAt: existing?.visitedAt ?? null,
      rating: r.rating,
      lastActivityAt:
        existing && existing.lastActivityAt > r.updatedAt ? existing.lastActivityAt : r.updatedAt,
    });
  }

  const activity = [...activityByRestaurant.values()].sort(
    (a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime(),
  );

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="grid gap-6 sm:grid-cols-[3fr_7fr] sm:items-start">
        <section className="flex flex-col items-center gap-3 rounded-lg border p-4">
          <Avatar avatarUrl={profile.avatarUrl} displayName={profile.displayName} size={88} />
          {isOwnProfile && <AvatarUploadForm />}

          {isOwnProfile ? (
            <DisplayNameEditor displayName={profile.displayName} />
          ) : (
            <span className="text-xl font-semibold">{profile.displayName ?? "Unnamed user"}</span>
          )}

          <dl className="w-full text-sm text-gray-600">
            {isOwnProfile && currentUser.email && (
              <div>
                <dt className="inline font-medium">Email: </dt>
                <dd className="inline">{currentUser.email}</dd>
              </div>
            )}
            <div>
              <dt className="inline font-medium">Member since: </dt>
              <dd className="inline">{profile.createdAt.toLocaleDateString()}</dd>
            </div>
          </dl>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold">
            {isOwnProfile ? "Spots you've" : "Spots they've"} visited or reviewed ({activity.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {activity.map((a) => (
              <li key={a.restaurantId} className="rounded border px-3 py-2 text-sm">
                <Link href={`/restaurants/${a.restaurantId}`} className="font-medium hover:underline">
                  {a.name}
                </Link>
                <span className="text-gray-600"> · {a.city}</span>
                <div className="mt-1 flex items-center gap-3 text-xs text-gray-600">
                  {a.visitedAt && <span>Visited {a.visitedAt.toLocaleDateString()}</span>}
                  {a.rating && (
                    <span>
                      {isOwnProfile ? "Your" : "Their"} rating:{" "}
                      <span className="text-brand-gold-dark">★</span> {a.rating}
                    </span>
                  )}
                </div>
              </li>
            ))}
            {activity.length === 0 && (
              <li className="text-sm text-gray-700">
                No spots visited or reviewed yet
                {isOwnProfile && " — mark one as visited or rate it from its page"}.
              </li>
            )}
          </ul>
        </section>
      </div>
    </main>
  );
}
