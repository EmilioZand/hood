import { eq } from "drizzle-orm";
import { db } from "@/db";
import { awardScrapeCandidates, restaurants } from "@/db/schema";
import { confirmAwardCandidate, rejectAwardCandidate } from "./actions";

export default async function AwardReviewPage() {
  const rows = await db
    .select({
      candidateId: awardScrapeCandidates.id,
      restaurantName: restaurants.name,
      restaurantCity: restaurants.city,
      source: awardScrapeCandidates.source,
      scrapedName: awardScrapeCandidates.scrapedName,
      scrapedAwardText: awardScrapeCandidates.scrapedAwardText,
      scrapedUrl: awardScrapeCandidates.scrapedUrl,
      matchConfidence: awardScrapeCandidates.matchConfidence,
    })
    .from(awardScrapeCandidates)
    .innerJoin(restaurants, eq(restaurants.id, awardScrapeCandidates.restaurantId))
    .where(eq(awardScrapeCandidates.status, "pending"))
    .orderBy(awardScrapeCandidates.matchConfidence);

  async function confirm(candidateId: string) {
    "use server";
    await confirmAwardCandidate(candidateId);
  }

  async function reject(candidateId: string) {
    "use server";
    await rejectAwardCandidate(candidateId);
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Award review ({rows.length})</h1>
      <p className="mb-6 text-sm text-gray-600">
        Scraped from public award-list pages. Nothing is applied to a spot until
        confirmed here. Michelin has no scrape source (its site blocks automated access) —
        enter Michelin status directly on a spot&apos;s edit page.
      </p>

      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.candidateId} className="rounded border px-3 py-2 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  {r.restaurantName} <span className="text-gray-700">· {r.restaurantCity}</span>
                </p>
                <p>{r.scrapedAwardText}</p>
                <p className="text-xs text-gray-700">
                  Scraped: &quot;{r.scrapedName}&quot; · confidence {r.matchConfidence} ·{" "}
                  <a href={r.scrapedUrl} target="_blank" rel="noopener noreferrer" className="underline">
                    source
                  </a>
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <form action={confirm.bind(null, r.candidateId)}>
                  <button type="submit" className="rounded border px-2 py-1 text-green-700">
                    Confirm
                  </button>
                </form>
                <form action={reject.bind(null, r.candidateId)}>
                  <button type="submit" className="rounded border px-2 py-1 text-red-700">
                    Reject
                  </button>
                </form>
              </div>
            </div>
          </li>
        ))}
        {rows.length === 0 && <li className="text-sm text-gray-700">Nothing pending review.</li>}
      </ul>
    </div>
  );
}
