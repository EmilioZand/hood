import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { restaurantMatchCandidates, restaurants } from "@/db/schema";
import { confirmMatch, rejectAllForSource, rejectMatch } from "./actions";

type Source = "google" | "yelp";
const SOURCES: Source[] = ["google", "yelp"];

export default async function MatchReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const { source: sourceParam } = await searchParams;
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

  const byRestaurant = new Map<string, { name: string; city: string; google: Row[]; yelp: Row[] }>();
  for (const row of rows) {
    if (sourceFilter && row.source !== sourceFilter) continue;
    if (!byRestaurant.has(row.restaurantId)) {
      byRestaurant.set(row.restaurantId, {
        name: row.restaurantName,
        city: row.restaurantCity,
        google: [],
        yelp: [],
      });
    }
    byRestaurant.get(row.restaurantId)![row.source].push(row);
  }

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

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">
        Match review ({byRestaurant.size} spot{byRestaurant.size === 1 ? "" : "s"})
      </h1>
      <p className="mb-4 text-sm text-gray-700">
        Confirming a match creates or updates a location (address/coordinates from Google,
        ratings from Google + Yelp). Confirming more than one candidate for the same
        spot adds multiple locations — use this for chains (e.g. a spot with
        several branches). Reject any candidate that isn&apos;t a real match.
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
        {[...byRestaurant.entries()].map(([restaurantId, r]) => (
          <div key={restaurantId} className="rounded border p-4">
            <h2 className="mb-3 font-semibold">
              {r.name} <span className="font-normal text-gray-700">· {r.city}</span>
            </h2>
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
                      <li className="text-xs text-gray-600">No pending candidates.</li>
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
