import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { getRestaurantById } from "@/lib/data/restaurants";
import { averageRating } from "@/lib/data/ratings";
import {
  addNote,
  deleteRestaurant,
  markRestaurantClosedNoLocation,
  rateRestaurant,
  setLocationClosed,
  toggleHighPriority,
  toggleVisited,
} from "../actions";
import { RestaurantMap } from "@/components/RestaurantMap";
import { AverageRating } from "@/components/AverageRating";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";

const MICHELIN_LABELS: Record<string, string> = {
  selected: "Selected",
  bib_gourmand: "Bib Gourmand",
  one_star: "★",
  two_star: "★★",
  three_star: "★★★",
};

const JAMES_BEARD_LABELS: Record<string, string> = {
  semifinalist: "Semifinalist",
  finalist: "Finalist",
  winner: "Winner",
};

// Only ever used as a same-origin Link href, but `back` arrives via a query param and
// could in principle be crafted (e.g. "//evil.com") into a host-changing URL — restrict
// it to an actual relative path before trusting it.
function isSafeRelativePath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\");
}

export default async function RestaurantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ back?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { back } = await searchParams;
  const backHref = back && isSafeRelativePath(back) ? back : "/";
  const restaurant = await getRestaurantById(id);
  if (!restaurant) notFound();

  const iVisited = restaurant.visits.some((v) => v.userId === user.id);
  const myRating = restaurant.ratings.find((r) => r.userId === user.id)?.rating ?? 0;
  const avgRating = averageRating(restaurant.ratings);

  async function toggleVisitedAction() {
    "use server";
    await toggleVisited(id);
  }

  async function toggleHighPriorityAction() {
    "use server";
    await toggleHighPriority(id, !restaurant!.isHighPriority);
  }

  async function deleteAction() {
    "use server";
    const { redirect } = await import("next/navigation");
    await deleteRestaurant(id);
    redirect("/");
  }

  async function addNoteAction(formData: FormData) {
    "use server";
    await addNote(id, String(formData.get("body") ?? ""));
  }

  async function rateAction(value: number) {
    "use server";
    await rateRestaurant(id, value);
  }

  async function toggleClosedAction(locationId: string, closed: boolean) {
    "use server";
    await setLocationClosed(locationId, id, closed);
  }

  async function markClosedNoLocationAction() {
    "use server";
    await markRestaurantClosedNoLocation(id);
  }

  const geolocatedLocations = restaurant.locations.filter(
    (l) => l.latitude !== null && l.longitude !== null,
  );

  return (
    <main className="mx-auto max-w-5xl p-6">
      <Link
        href={backHref}
        className="mb-4 -ml-2 inline-flex items-center gap-1 rounded px-2 py-1.5 text-sm text-gray-600 hover:text-brand-green"
      >
        <span aria-hidden="true">←</span> Back to spots
      </Link>
      <div className="grid gap-8 md:grid-cols-2">
      <div>
        {geolocatedLocations.length > 0 ? (
          <RestaurantMap
            pins={geolocatedLocations.map((l) => ({
              id: l.id,
              restaurantId: restaurant.id,
              name: restaurant.name,
              address: l.address,
              latitude: Number(l.latitude),
              longitude: Number(l.longitude),
              cuisines: restaurant.cuisines.map((c) => c.cuisine.name),
              googleRating: l.googleRating,
              isHighPriority: restaurant.isHighPriority,
            }))}
            fitBounds
            className="h-80 w-full rounded border md:h-[32rem]"
            wrapperClassName="md:sticky md:top-6"
          />
        ) : (
          <div className="flex h-80 flex-col items-center justify-center gap-2 rounded border border-dashed p-6 text-center text-sm text-gray-700 md:sticky md:top-6 md:h-[32rem]">
            <p>No confirmed location yet.</p>
            {user.isAdmin && (
              <Link href="/admin/matches" className="underline">
                Review matches
              </Link>
            )}
          </div>
        )}
      </div>

      <div>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{restaurant.name}</h1>
          <p className="text-gray-600">
            {restaurant.neighborhood ? `${restaurant.neighborhood.name}, ` : ""}
            {restaurant.city}
          </p>
          {restaurant.locations.length > 1 && (
            <p className="text-sm text-gray-700">{restaurant.locations.length} locations</p>
          )}
        </div>
        {user.isAdmin && (
          <div className="flex gap-2 text-sm">
            <Link href={`/restaurants/${id}/edit`} className="rounded border px-2 py-1">
              Edit
            </Link>
            <form action={deleteAction}>
              <ConfirmSubmitButton
                title={`Delete ${restaurant.name}?`}
                body={`This permanently deletes ${restaurant.name} (${restaurant.city}) and all of its notes, ratings, visits, and match candidates. This can't be undone.`}
                className="rounded border px-2 py-1 text-red-700"
              >
                Delete
              </ConfirmSubmitButton>
            </form>
          </div>
        )}
      </div>

      <section className="mb-4">
        <h2 className="mb-2 text-lg font-semibold">
          {restaurant.locations.length > 1 ? "Locations" : "Location"}
        </h2>
        {restaurant.locations.length === 0 ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-gray-700">No confirmed location yet.</p>
            {user.isAdmin && (
              <form action={markClosedNoLocationAction}>
                <button type="submit" className="shrink-0 rounded border px-2 py-1 text-xs text-red-700">
                  Mark closed
                </button>
              </form>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {restaurant.locations.map((l) => (
              <li key={l.id} className="rounded border px-3 py-2 text-sm">
                <div className="flex items-start justify-between gap-2">
                  {l.address && <p className="text-gray-700">{l.address}</p>}
                  {user.isAdmin && (
                    <form action={toggleClosedAction.bind(null, l.id, l.status !== "permanently_closed")}>
                      <button
                        type="submit"
                        className="shrink-0 rounded border px-2 py-1 text-xs text-red-700"
                      >
                        {l.status === "permanently_closed" ? "Reopen" : "Mark closed"}
                      </button>
                    </form>
                  )}
                </div>

                {l.status === "permanently_closed" && !l.closureSuppressed && (
                  <p className="mt-1 rounded bg-red-50 px-2 py-1 text-red-800">
                    Reported permanently closed
                    {l.closedDetectedAt && ` (${l.closedDetectedAt.toLocaleDateString()})`}.
                  </p>
                )}

                {(l.googleRating || l.yelpRating) && (
                  <div className="mt-1 flex flex-wrap gap-4">
                    {l.googleRating && (
                      <span>
                        Google: <strong>{l.googleRating}</strong>★ ({l.googleRatingCount} reviews)
                      </span>
                    )}
                    {l.yelpRating && (
                      <span>
                        Yelp: <strong>{l.yelpRating}</strong>★ ({l.yelpReviewCount} reviews,{" "}
                        {l.yelpUrl ? (
                          <a
                            href={l.yelpUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline"
                          >
                            powered by Yelp
                          </a>
                        ) : (
                          "powered by Yelp"
                        )}
                        )
                      </span>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {restaurant.award &&
        (restaurant.award.michelinStatus !== "none" || restaurant.award.jamesBeardStatus !== "none") && (
          <div className="mb-4 flex flex-wrap gap-2 text-sm">
            {restaurant.award.michelinStatus !== "none" && (
              <span className="rounded bg-red-50 px-2 py-1 text-red-800">
                Michelin: {MICHELIN_LABELS[restaurant.award.michelinStatus]}
              </span>
            )}
            {restaurant.award.jamesBeardStatus !== "none" && (
              <span className="rounded bg-red-50 px-2 py-1 text-red-800">
                James Beard {JAMES_BEARD_LABELS[restaurant.award.jamesBeardStatus]}
                {restaurant.award.jamesBeardCategory ? `: ${restaurant.award.jamesBeardCategory}` : ""}
                {restaurant.award.jamesBeardYear ? ` (${restaurant.award.jamesBeardYear})` : ""}
              </span>
            )}
          </div>
        )}

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {restaurant.cuisines.map((c) => (
          <span key={c.cuisineId} className="rounded bg-gray-100 px-2 py-1">
            {c.cuisine.name}
          </span>
        ))}
        {restaurant.isWalkIn !== null && (
          <span className="rounded bg-gray-100 px-2 py-1">
            {restaurant.isWalkIn ? "Walk-ins OK" : "Reservations recommended"}
          </span>
        )}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <form action={toggleVisitedAction}>
          <button
            type="submit"
            className={`rounded px-3 py-2 text-sm ${
              iVisited ? "bg-green-100 text-green-800" : "border"
            }`}
          >
            {iVisited ? "✓ Visited by you" : "Mark as visited"}
          </button>
        </form>

        {user.isAdmin && (
          <form action={toggleHighPriorityAction}>
            <button
              type="submit"
              className={`rounded px-3 py-2 text-sm ${
                restaurant.isHighPriority ? "bg-brand-gold/20 text-brand-gold-dark" : "border"
              }`}
            >
              {restaurant.isHighPriority ? "★ High priority" : "Mark high priority"}
            </button>
          </form>
        )}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="text-sm text-gray-600">Your rating:</span>
        <div className="flex">
          {[1, 2, 3, 4, 5].map((n) => (
            <form key={n} action={rateAction.bind(null, n)}>
              <button
                type="submit"
                aria-label={`Rate ${n} star${n === 1 ? "" : "s"}`}
                className={`px-0.5 text-xl leading-none ${n <= myRating ? "text-brand-gold-dark" : "text-gray-300"}`}
              >
                ★
              </button>
            </form>
          ))}
        </div>
        {avgRating !== null && <AverageRating average={avgRating} count={restaurant.ratings.length} />}
      </div>

      <div className="mb-6 text-sm text-gray-600">
        {restaurant.visits.length === 0 ? (
          <p>No one has marked this visited yet.</p>
        ) : (
          <p>
            Visited by:{" "}
            {restaurant.visits.map((v, i) => (
              <span key={v.userId}>
                {i > 0 && ", "}
                <Link href={`/users/${v.userId}`} className="hover:underline">
                  {v.user.displayName || "a user"}
                </Link>
              </span>
            ))}
          </p>
        )}
      </div>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Notes</h2>
        <form action={addNoteAction} className="mb-4 flex gap-2">
          <input
            name="body"
            placeholder="Add a note..."
            required
            className="flex-1 rounded border px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded bg-brand-green px-3 py-2 text-sm text-brand-cream hover:bg-brand-green-dark">
            Post
          </button>
        </form>
        <ul className="flex flex-col gap-3">
          {restaurant.notes
            .filter((n) => !n.deletedAt)
            .map((n) => (
              <li key={n.id} className="rounded border px-3 py-2 text-sm">
                <p>{n.body}</p>
                <p className="mt-1 text-xs text-gray-700">
                  {n.authorId ? (
                    <Link href={`/users/${n.authorId}`} className="hover:underline">
                      {n.author?.displayName || "Unknown"}
                    </Link>
                  ) : (
                    n.author?.displayName || "Unknown"
                  )}{" "}
                  · {n.createdAt.toLocaleDateString()}
                </p>
              </li>
            ))}
          {restaurant.notes.length === 0 && (
            <li className="text-sm text-gray-700">No notes yet.</li>
          )}
        </ul>
      </section>
      </div>
      </div>
    </main>
  );
}
