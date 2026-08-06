import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { restaurantRecommendations, restaurants } from "@/db/schema";
import { requireUser } from "@/lib/auth/guards";
import { getAllNeighborhoods } from "@/lib/data/neighborhoods";
import { getAllCuisines } from "@/lib/data/restaurants";
import { Combobox } from "@/components/Combobox";
import { CuisineCombobox } from "@/components/CuisineCombobox";
import { startAddSpot, submitRecommendation } from "./actions";

export default async function AddEntryPage({
  searchParams,
}: {
  searchParams: Promise<{
    step?: string;
    name?: string;
    city?: string;
    neighborhood?: string;
    cuisine?: string;
    matched?: string;
    dupId?: string;
    dupName?: string;
    dupCity?: string;
    exactDupId?: string;
    exactDupName?: string;
  }>;
}) {
  await requireUser();
  const params = await searchParams;
  const isStep2 = params.step === "2" && !!params.name && !!params.city;
  const exactDuplicate =
    !isStep2 && params.exactDupId ? { id: params.exactDupId, name: params.exactDupName ?? "" } : null;
  const duplicate =
    !isStep2 && !exactDuplicate && params.dupId
      ? { id: params.dupId, name: params.dupName ?? "", city: params.dupCity ?? "" }
      : null;

  const [submissions, neighborhoods, allCuisines] = await Promise.all([
    db.query.restaurantRecommendations.findMany({
      orderBy: [desc(restaurantRecommendations.createdAt)],
    }),
    getAllNeighborhoods(db),
    getAllCuisines(),
  ]);
  const cuisineNames = allCuisines.map((c) => c.name);
  const cityOptions = [...new Set(neighborhoods.map((n) => n.city))].sort();
  const neighborhoodOptions = [
    ...new Set(
      neighborhoods
        .filter((n) => n.city.trim().toLowerCase() === (params.city ?? "").trim().toLowerCase())
        .map((n) => n.name),
    ),
  ].sort();

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

      {!isStep2 ? (
        <>
          <p className="mb-4 text-sm text-gray-700">
            Know a spot that&apos;s missing from the list? Start with the name and city — we&apos;ll
            check Google for a match to help fill in the rest.
          </p>
          {exactDuplicate ? (
            <div className="mb-4 rounded border border-brand-gold bg-brand-gold/10 px-3 py-2 text-sm">
              This spot already exists:{" "}
              <Link href={`/restaurants/${exactDuplicate.id}`} className="font-medium underline">
                {exactDuplicate.name}
              </Link>
              . A restaurant with several locations shares one entry — add or edit its locations
              from its own page instead of creating a second one here.
            </div>
          ) : (
            duplicate && (
              <div className="mb-4 rounded border border-brand-gold bg-brand-gold/10 px-3 py-2 text-sm">
                A similar spot already exists:{" "}
                <Link href={`/restaurants/${duplicate.id}`} className="font-medium underline">
                  {duplicate.name} · {duplicate.city}
                </Link>
                . Submit again to add this as a separate spot anyway.
              </div>
            )
          )}
          {!exactDuplicate && (
            <form action={startAddSpot} className="mb-8 flex flex-col gap-3">
              {duplicate && (
                <>
                  <input type="hidden" name="confirmCreate" value="1" />
                  <input type="hidden" name="dupId" value={duplicate.id} />
                </>
              )}
              <input
                name="name"
                placeholder="Name"
                required
                defaultValue={params.name ?? ""}
                className="rounded border px-3 py-2"
              />
              <Combobox
                name="city"
                placeholder="City"
                required
                options={cityOptions}
                defaultValue={params.city ?? ""}
                className="rounded border px-3 py-2"
              />
              <button type="submit" className="rounded bg-brand-green px-3 py-2 text-brand-cream hover:bg-brand-green-dark">
                {duplicate ? "Create anyway" : "Continue"}
              </button>
            </form>
          )}
          {exactDuplicate && (
            <Link href="/add-entry" className="mb-8 inline-block text-sm underline">
              ← Start over with a different name or city
            </Link>
          )}
        </>
      ) : (
        <>
          <p className="mb-4 text-sm text-gray-700">
            {params.matched === "1"
              ? "Found a likely match on Google — review the details below before adding it."
              : "No confident match found on Google — fill in the details below."}
          </p>
          <form action={submitRecommendation} className="mb-8 flex flex-col gap-3">
            <input type="hidden" name="name" value={params.name ?? ""} />
            <input type="hidden" name="city" value={params.city ?? ""} />
            <input type="hidden" name="dupId" value={params.dupId ?? ""} />
            <p className="rounded border bg-gray-50 px-3 py-2 text-sm">
              <span className="font-medium">{params.name}</span>
              <span className="text-gray-600"> · {params.city}</span>
            </p>
            <Combobox
              name="neighborhood"
              placeholder="Neighborhood"
              options={neighborhoodOptions}
              defaultValue={params.neighborhood ?? ""}
              className="rounded border px-3 py-2"
            />
            <CuisineCombobox
              name="cuisine"
              cuisines={cuisineNames}
              defaultValue={params.cuisine ?? ""}
              placeholder="Cuisine"
            />
            <textarea name="notes" placeholder="Why should we try it?" className="rounded border px-3 py-2" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="alreadyVisited" /> I&apos;ve been there
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isHighPriority" /> High priority
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isWalkIn" /> Accepts walk-ins
            </label>
            <div className="flex items-center gap-3">
              <Link
                href={`/add-entry?${new URLSearchParams({ name: params.name ?? "", city: params.city ?? "" }).toString()}`}
                className="text-sm underline"
              >
                ← Back
              </Link>
              <button type="submit" className="rounded bg-brand-green px-3 py-2 text-brand-cream hover:bg-brand-green-dark">
                Add spot
              </button>
            </div>
          </form>
        </>
      )}

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
