import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { restaurantRecommendations, restaurants } from "@/db/schema";
import { requireUser } from "@/lib/auth/guards";
import { submitRecommendation } from "./actions";

export default async function AddEntryPage() {
  await requireUser();

  const submissions = await db.query.restaurantRecommendations.findMany({
    orderBy: [desc(restaurantRecommendations.createdAt)],
  });

  const duplicateNames = new Map<string, string>();
  for (const sub of submissions) {
    if (sub.possibleDuplicateOf) {
      const [dup] = await db
        .select({ name: restaurants.name })
        .from(restaurants)
        .where(eq(restaurants.id, sub.possibleDuplicateOf))
        .limit(1);
      if (dup) duplicateNames.set(sub.id, dup.name);
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">Add a spot</h1>
      <p className="mb-4 text-sm text-gray-700">
        Know a spot that&apos;s missing from the list? Add it here — it&apos;s added right away.
      </p>

      <form action={submitRecommendation} className="mb-8 flex flex-col gap-3">
        <input name="name" placeholder="Name" required className="rounded border px-3 py-2" />
        <input name="city" placeholder="City" className="rounded border px-3 py-2" />
        <input name="neighborhood" placeholder="Neighborhood" className="rounded border px-3 py-2" />
        <input name="cuisine" placeholder="Cuisine" className="rounded border px-3 py-2" />
        <textarea name="notes" placeholder="Why should we try it?" className="rounded border px-3 py-2" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="alreadyVisited" /> I&apos;ve been there
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isHighPriority" /> High priority
        </label>
        <button type="submit" className="rounded bg-brand-green px-3 py-2 text-brand-cream hover:bg-brand-green-dark">
          Submit
        </button>
      </form>

      <h2 className="mb-2 text-lg font-semibold">Submitted entries</h2>
      <ul className="flex flex-col gap-3">
        {submissions.map((sub) => (
          <li key={sub.id} className="rounded border px-3 py-2 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">{sub.name}</span>
                {sub.city && <span className="text-gray-700"> · {sub.city}</span>}
              </div>
              {sub.resultingRestaurantId && (
                <Link href={`/restaurants/${sub.resultingRestaurantId}`} className="text-sm underline">
                  View
                </Link>
              )}
            </div>
            {duplicateNames.has(sub.id) && (
              <p className="mt-1 text-xs text-brand-gold-dark">
                Possible duplicate of &quot;{duplicateNames.get(sub.id)}&quot;
              </p>
            )}
            {sub.notes && <p className="mt-1 text-gray-700">{sub.notes}</p>}
          </li>
        ))}
        {submissions.length === 0 && <li className="text-sm text-gray-700">No submissions yet.</li>}
      </ul>
    </main>
  );
}
