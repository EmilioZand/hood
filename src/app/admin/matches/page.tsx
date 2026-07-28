import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { restaurantLocations, restaurantMatchCandidates, restaurants } from "@/db/schema";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { deleteRestaurant, markRestaurantClosedNoLocation, setLocationClosed } from "../../restaurants/actions";
import {
  confirmMatch,
  regenerateGoogleMatches,
  rejectAllForSource,
  rejectMatch,
  updateAndResyncGoogle,
} from "./actions";

type Source = "google" | "yelp";
const SOURCES: Source[] = ["google", "yelp"];

export default async function MatchReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; edit?: string }>;
}) {
  const { source: sourceParam, edit: editingId } = await searchParams;
  const sourceFilter: Source | null = sourceParam === "google" || sourceParam === "yelp" ? sourceParam : null;
  const visibleSources = sourceFilter ? [sourceFilter] : SOURCES;

  const rows = await db
    .select({
      candidateId: restaurantMatchCandidates.id,
      restaurantId: restaurants.id,
      restaurantName: restaurants.name,
      restaurantCity: restaurants.city,
      source: restaurantMatchCandidates.source,
      candidateName: restaurantMatchCandidates.candidateName,
      candidateAddress: restaurantMatchCandidates.candidateAddress,
      matchScore: restaurantMatchCandidates.matchScore,
      rank: restaurantMatchCandidates.rank,
    })
    .from(restaurantMatchCandidates)
    .innerJoin(restaurants, eq(restaurants.id, restaurantMatchCandidates.restaurantId))
    .where(eq(restaurantMatchCandidates.status, "pending"))
    .orderBy(restaurants.name, restaurantMatchCandidates.source, restaurantMatchCandidates.rank);

  type Row = (typeof rows)[number];

  // Counts always reflect the full pending queue, regardless of the active filter,
  // so the tally stays a useful "how much is left" reference while browsing one source.
  const candidateCounts: Record<Source, number> = { google: 0, yelp: 0 };
  const restaurantIdsBySource: Record<Source, Set<string>> = { google: new Set(), yelp: new Set() };
  for (const row of rows) {
    candidateCounts[row.source]++;
    restaurantIdsBySource[row.source].add(row.restaurantId);
  }

  type LocationSummary = { id: string; status: string };
  const byRestaurant = new Map<
    string,
    { name: string; city: string; google: Row[]; yelp: Row[]; locations: LocationSummary[] }
  >();
  for (const row of rows) {
    if (sourceFilter && row.source !== sourceFilter) continue;
    if (!byRestaurant.has(row.restaurantId)) {
      byRestaurant.set(row.restaurantId, {
        name: row.restaurantName,
        city: row.restaurantCity,
        google: [],
        yelp: [],
        locations: [],
      });
    }
    byRestaurant.get(row.restaurantId)![row.source].push(row);
  }

  // Spots with no confirmed location at all — Google/Yelp never found a match, or every
  // candidate got rejected — otherwise fall through the cracks entirely once they have
  // no pending candidates left to review. Left out of the Yelp-only filter since there's
  // nothing actionable for them there (no "regenerate" for Yelp yet).
  if (sourceFilter !== "yelp") {
    const unmatched = await db
      .select({ id: restaurants.id, name: restaurants.name, city: restaurants.city })
      .from(restaurants)
      .leftJoin(restaurantLocations, eq(restaurantLocations.restaurantId, restaurants.id))
      .where(isNull(restaurantLocations.id));

    for (const r of unmatched) {
      if (!byRestaurant.has(r.id)) {
        byRestaurant.set(r.id, { name: r.name, city: r.city, google: [], yelp: [], locations: [] });
      }
    }
  }

  // Fetched for the "Mark closed" toggle below — only shown when a restaurant has
  // exactly one location, so there's no ambiguity about which one it applies to (a
  // multi-location chain needs the restaurant detail page's per-location control).
  if (byRestaurant.size > 0) {
    const locations = await db
      .select({
        id: restaurantLocations.id,
        restaurantId: restaurantLocations.restaurantId,
        status: restaurantLocations.status,
      })
      .from(restaurantLocations)
      .where(inArray(restaurantLocations.restaurantId, [...byRestaurant.keys()]));

    for (const l of locations) {
      byRestaurant.get(l.restaurantId)?.locations.push({ id: l.id, status: l.status });
    }
  }

  const sortedRestaurants = [...byRestaurant.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));

  async function confirm(candidateId: string) {
    "use server";
    await confirmMatch(candidateId);
  }

  async function reject(candidateId: string) {
    "use server";
    await rejectMatch(candidateId);
  }

  async function noMatch(restaurantId: string, source: Source) {
    "use server";
    await rejectAllForSource(restaurantId, source);
  }

  async function regenerate(restaurantId: string) {
    "use server";
    await regenerateGoogleMatches(restaurantId);
  }

  async function toggleClosed(locationId: string, restaurantId: string, closed: boolean) {
    "use server";
    await setLocationClosed(locationId, restaurantId, closed);
  }

  async function markClosedNoLocation(restaurantId: string) {
    "use server";
    await markRestaurantClosedNoLocation(restaurantId);
  }

  // currentSource is bound in as a plain string (not the pageHref closure) since these
  // are server actions — only serializable bound args should cross that boundary.
  async function saveEdit(restaurantId: string, currentSource: Source | null, formData: FormData) {
    "use server";
    await updateAndResyncGoogle(restaurantId, formData);
    redirect(currentSource ? `/admin/matches?source=${currentSource}` : "/admin/matches");
  }

  async function deleteEntry(restaurantId: string, currentSource: Source | null) {
    "use server";
    await deleteRestaurant(restaurantId);
    redirect(currentSource ? `/admin/matches?source=${currentSource}` : "/admin/matches");
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">
        Match review ({byRestaurant.size} spot{byRestaurant.size === 1 ? "" : "s"})
      </h1>
      <p className="mb-4 text-sm text-gray-700">
        Confirming a match creates or updates a location (address/coordinates from Google,
        ratings from Google + Yelp). Confirming more than one candidate for the same
        spot adds multiple locations — use this for chains (e.g. a spot with
        several branches). Reject any candidate that isn&apos;t a real match. Spots with no
        confirmed location at all are shown too, even once they run out of pending
        candidates — regenerate a fresh Google search for those anytime.
      </p>

      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        <Link
          href="/admin/matches"
          className={`rounded border px-3 py-1 ${!sourceFilter ? "bg-brand-green text-brand-cream hover:bg-brand-green-dark" : ""}`}
        >
          All ({candidateCounts.google + candidateCounts.yelp})
        </Link>
        <Link
          href="/admin/matches?source=google"
          className={`rounded border px-3 py-1 ${sourceFilter === "google" ? "bg-brand-green text-brand-cream hover:bg-brand-green-dark" : ""}`}
        >
          Google ({candidateCounts.google} · {restaurantIdsBySource.google.size} spots)
        </Link>
        <Link
          href="/admin/matches?source=yelp"
          className={`rounded border px-3 py-1 ${sourceFilter === "yelp" ? "bg-brand-green text-brand-cream hover:bg-brand-green-dark" : ""}`}
        >
          Yelp ({candidateCounts.yelp} · {restaurantIdsBySource.yelp.size} spots)
        </Link>
      </div>

      <div className="flex flex-col gap-6">
        {sortedRestaurants.map(([restaurantId, r]) => (
          <div key={restaurantId} className="rounded border p-4">
            {editingId === restaurantId ? (
              <form
                action={saveEdit.bind(null, restaurantId, sourceFilter)}
                className="mb-3 flex flex-wrap items-end gap-2"
              >
                <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                  Name
                  <input
                    name="name"
                    defaultValue={r.name}
                    required
                    className="rounded border px-2 py-1 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                  City
                  <input
                    name="city"
                    defaultValue={r.city}
                    required
                    className="rounded border px-2 py-1 text-sm"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded bg-brand-green px-2 py-1 text-sm text-brand-cream hover:bg-brand-green-dark"
                >
                  Save &amp; resync Google
                </button>
                <Link
                  href={sourceFilter ? `/admin/matches?source=${sourceFilter}` : "/admin/matches"}
                  className="rounded border px-2 py-1 text-sm"
                >
                  Cancel
                </Link>
              </form>
            ) : (
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-semibold">
                  {r.name} <span className="font-normal text-gray-700">· {r.city}</span>
                </h2>
                <div className="flex shrink-0 gap-1 text-xs">
                  <Link
                    href={
                      sourceFilter
                        ? `/admin/matches?source=${sourceFilter}&edit=${restaurantId}`
                        : `/admin/matches?edit=${restaurantId}`
                    }
                    className="rounded border px-2 py-1"
                  >
                    Edit
                  </Link>
                  {r.locations.length === 0 && (
                    <form action={markClosedNoLocation.bind(null, restaurantId)}>
                      <button type="submit" className="rounded border px-2 py-1 text-red-700">
                        Mark closed
                      </button>
                    </form>
                  )}
                  {r.locations.length === 1 && (
                    <form
                      action={toggleClosed.bind(
                        null,
                        r.locations[0].id,
                        restaurantId,
                        r.locations[0].status !== "permanently_closed",
                      )}
                    >
                      <button type="submit" className="rounded border px-2 py-1 text-red-700">
                        {r.locations[0].status === "permanently_closed" ? "Reopen" : "Mark closed"}
                      </button>
                    </form>
                  )}
                  <form action={deleteEntry.bind(null, restaurantId, sourceFilter)}>
                    <ConfirmSubmitButton
                      title={`Delete ${r.name}?`}
                      body={`This permanently deletes ${r.name} (${r.city}) and all of its notes, ratings, visits, and match candidates. This can't be undone.`}
                      className="rounded border px-2 py-1 text-xs text-red-700"
                    >
                      Delete
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </div>
            )}
            <div
              className={`grid grid-cols-1 gap-4 ${visibleSources.length > 1 ? "sm:grid-cols-2" : ""}`}
            >
              {visibleSources.map((source) => (
                <div key={source}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase text-gray-700">{source}</span>
                    {r[source].length > 0 && (
                      <form action={noMatch.bind(null, restaurantId, source)}>
                        <button type="submit" className="text-xs text-gray-700 underline">
                          No match
                        </button>
                      </form>
                    )}
                  </div>
                  <ul className="flex flex-col gap-2">
                    {r[source].map((c) => (
                      <li key={c.candidateId} className="rounded border px-2 py-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-medium">{c.candidateName}</p>
                            <p className="text-xs text-gray-700">{c.candidateAddress}</p>
                            <p className="text-xs text-gray-600">score {c.matchScore}</p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <form action={confirm.bind(null, c.candidateId)}>
                              <button
                                type="submit"
                                className="rounded border px-2 py-1 text-xs text-green-700"
                              >
                                Confirm
                              </button>
                            </form>
                            <form action={reject.bind(null, c.candidateId)}>
                              <button
                                type="submit"
                                className="rounded border px-2 py-1 text-xs text-red-700"
                              >
                                Reject
                              </button>
                            </form>
                          </div>
                        </div>
                      </li>
                    ))}
                    {r[source].length === 0 && (
                      <li className="flex items-center justify-between gap-2 text-xs text-gray-600">
                        <span>No pending candidates.</span>
                        {source === "google" && (
                          <form action={regenerate.bind(null, restaurantId)}>
                            <button
                              type="submit"
                              className="rounded border px-2 py-1 text-xs text-green-700"
                            >
                              Regenerate matches
                            </button>
                          </form>
                        )}
                      </li>
                    )}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ))}
        {byRestaurant.size === 0 && (
          <p className="text-sm text-gray-700">No pending match candidates.</p>
        )}
      </div>
    </div>
  );
}
