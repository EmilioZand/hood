import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { getRestaurantsWithRelations, type RestaurantListItem } from "@/lib/data/restaurants";
import { isOpenNow } from "@/lib/data/openingHours";
import { averageRating } from "@/lib/data/ratings";
import { RestaurantMap, type MapPin } from "@/components/RestaurantMap";
import { FilterForm } from "@/components/FilterForm";
import { AverageRating } from "@/components/AverageRating";

type Filters = {
  neighborhood?: string;
  city?: string;
  cuisine?: string;
  openNow?: string;
  walkIn?: string;
  highPriority?: string;
  visited?: string;
  q?: string;
  view?: string;
};

function matchesSearch(r: RestaurantListItem, query: string): boolean {
  if (!query) return true;
  return (
    r.name.toLowerCase().includes(query) ||
    r.city.toLowerCase().includes(query) ||
    (r.neighborhood?.toLowerCase().includes(query) ?? false) ||
    r.cuisines.some((c) => c.cuisine.name.toLowerCase().includes(query))
  );
}

function matchesSharedFilters(
  r: RestaurantListItem,
  filters: Filters,
  activeNeighborhood: string | undefined,
  currentUserId: string,
): boolean {
  if (activeNeighborhood && r.neighborhood !== activeNeighborhood) return false;
  if (filters.city && r.city !== filters.city) return false;
  if (filters.cuisine && !r.cuisines.some((c) => c.cuisine.name === filters.cuisine)) return false;
  if (filters.highPriority === "1" && !r.isHighPriority) return false;
  if (filters.walkIn === "1" && r.isWalkIn !== true) return false;
  if (filters.visited === "mine" && !r.visits.some((v) => v.userId === currentUserId)) return false;
  if (filters.visited === "unvisited" && r.visits.length > 0) return false;
  if (filters.openNow === "1" && !r.locations.some((l) => isOpenNow(l.googleOpeningHours) === true)) {
    return false;
  }
  if (!matchesSearch(r, (filters.q ?? "").trim().toLowerCase())) return false;
  return true;
}

// Preserves every other active filter while only changing which panel the mobile
// toggle points at — a plain link, no client JS needed to switch views.
function viewLink(filters: Filters, view: "list" | "map"): string {
  const params = new URLSearchParams();
  for (const key of ["neighborhood", "city", "cuisine", "openNow", "walkIn", "highPriority", "visited", "q"] as const) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  params.set("view", view);
  return `/?${params.toString()}`;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Filters>;
}) {
  const user = await requireUser();
  const filters = await searchParams;
  const view = filters.view === "map" ? "map" : "list";

  const all = await getRestaurantsWithRelations();

  // Scoped by the selected city so picking a city immediately narrows the
  // neighborhood options to ones that actually exist within it.
  const restaurantsForCity = filters.city ? all.filter((r) => r.city === filters.city) : all;
  const neighborhoods = [
    ...new Set(restaurantsForCity.map((r) => r.neighborhood).filter((n): n is string => !!n)),
  ].sort();
  const cities = [...new Set(all.map((r) => r.city))].sort();
  const cuisineNames = [...new Set(all.flatMap((r) => r.cuisines.map((c) => c.cuisine.name)))].sort();

  // A neighborhood picked before switching cities may no longer apply — ignore it
  // rather than silently filtering to zero results.
  const activeNeighborhood =
    filters.neighborhood && neighborhoods.includes(filters.neighborhood) ? filters.neighborhood : undefined;

  const filteredRestaurants = all.filter((r) =>
    matchesSharedFilters(r, filters, activeNeighborhood, user.id),
  );

  const restaurantsWithoutLocation = filteredRestaurants.filter(
    (r) => !r.locations.some((l) => l.latitude !== null && l.longitude !== null),
  );

  // One pin per open, geolocated location — a chain restaurant contributes one pin
  // per branch, each independently filterable/closeable.
  const pins: MapPin[] = filteredRestaurants.flatMap((r) =>
    r.locations
      .filter((l) => l.latitude !== null && l.longitude !== null && l.status !== "permanently_closed")
      .filter((l) => filters.openNow !== "1" || isOpenNow(l.googleOpeningHours) === true)
      .map((l) => ({
        id: l.id,
        restaurantId: r.id,
        name: r.name,
        address: l.address,
        latitude: Number(l.latitude),
        longitude: Number(l.longitude),
        cuisines: r.cuisines.map((c) => c.cuisine.name),
        googleRating: l.googleRating,
        isHighPriority: r.isHighPriority,
      })),
  );

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {filteredRestaurants.length} spot{filteredRestaurants.length === 1 ? "" : "s"}
        </h1>
        {user.isAdmin && (
          <Link href="/restaurants/new" className="rounded bg-brand-green px-3 py-2 text-sm text-brand-cream hover:bg-brand-green-dark">
            + Add spot
          </Link>
        )}
      </div>

      <FilterForm className="mb-4 flex flex-col gap-3 rounded-lg border bg-brand-green/5 p-4">
        <input type="hidden" name="q" value={filters.q ?? ""} />
        <input type="hidden" name="view" value={view} />
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Neighborhood
            <select
              name="neighborhood"
              defaultValue={activeNeighborhood ?? ""}
              className="min-w-[10rem] rounded border px-2 py-1.5 text-sm font-normal text-black"
            >
              <option value="">All neighborhoods</option>
              {neighborhoods.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            City
            <select
              name="city"
              defaultValue={filters.city ?? ""}
              className="min-w-[9rem] rounded border px-2 py-1.5 text-sm font-normal text-black"
            >
              <option value="">All cities</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Cuisine
            <select
              name="cuisine"
              defaultValue={filters.cuisine ?? ""}
              className="min-w-[9rem] rounded border px-2 py-1.5 text-sm font-normal text-black"
            >
              <option value="">All cuisines</option>
              {cuisineNames.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Visited
            <select
              name="visited"
              defaultValue={filters.visited ?? ""}
              className="min-w-[9rem] rounded border px-2 py-1.5 text-sm font-normal text-black"
            >
              <option value="">Any visited status</option>
              <option value="mine">Visited by me</option>
              <option value="unvisited">Not yet visited</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="openNow" value="1" defaultChecked={filters.openNow === "1"} />
            Open now
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="walkIn" value="1" defaultChecked={filters.walkIn === "1"} />
            Walk-ins OK
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              name="highPriority"
              value="1"
              defaultChecked={filters.highPriority === "1"}
            />
            High priority only
          </label>
        </div>
      </FilterForm>

      <div className="mb-4 flex gap-2 text-sm sm:hidden">
        <Link
          href={viewLink(filters, "list")}
          className={`rounded border px-3 py-1 ${view === "list" ? "bg-brand-green text-brand-cream" : ""}`}
        >
          List
        </Link>
        <Link
          href={viewLink(filters, "map")}
          className={`rounded border px-3 py-1 ${view === "map" ? "bg-brand-green text-brand-cream" : ""}`}
        >
          Map
        </Link>
      </div>

      <div className="grid items-start gap-4 sm:grid-cols-[1fr_1.2fr]">
        <div className={view === "map" ? "hidden sm:block" : ""}>
          <ul className="divide-y rounded-lg border">
            {filteredRestaurants.map((r) => {
              const avg = averageRating(r.ratings);
              return (
                <li key={r.id} className="flex items-center justify-between px-3 py-3">
                  <Link href={`/restaurants/${r.id}`} className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{r.name}</span>
                      {r.isHighPriority && (
                        <span className="rounded bg-brand-gold/20 px-1.5 py-0.5 text-xs text-brand-gold-dark">
                          High priority
                        </span>
                      )}
                      {r.locations.length > 0 &&
                        r.locations.every((l) => l.status === "permanently_closed" && !l.closureSuppressed) && (
                          <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800">
                            Reported closed
                          </span>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1 text-sm text-gray-600">
                      <span>
                        {r.neighborhood ? `${r.neighborhood}, ` : ""}
                        {r.city}
                      </span>
                      {r.cuisines.map((c) => (
                        <span
                          key={c.cuisineId}
                          className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700"
                        >
                          {c.cuisine.name}
                        </span>
                      ))}
                    </div>
                  </Link>
                  <div className="flex shrink-0 flex-col items-end gap-0.5 text-sm text-gray-700">
                    {avg !== null && <AverageRating average={avg} count={r.ratings.length} />}
                    <span>{r.visits.length > 0 ? `Visited by ${r.visits.length}` : "Not visited"}</span>
                  </div>
                </li>
              );
            })}
            {filteredRestaurants.length === 0 && (
              <li className="py-6 text-center text-gray-700">No matches.</li>
            )}
          </ul>
        </div>

        <div className={view === "list" ? "hidden sm:block" : ""}>
          <RestaurantMap
            pins={pins}
            className="h-[35vh] w-full rounded border sm:h-[calc(50vh-4.5rem)]"
            wrapperClassName="sm:sticky sm:top-6"
          />
          {restaurantsWithoutLocation.length > 0 && (
            <p className="mt-2 text-xs text-gray-700">
              {restaurantsWithoutLocation.length} spot
              {restaurantsWithoutLocation.length === 1 ? "" : "s"} not shown on the map (no confirmed
              location yet)
              {user.isAdmin && (
                <>
                  {" — see "}
                  <Link href="/admin/matches" className="underline">
                    match review
                  </Link>
                </>
              )}
              .
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
