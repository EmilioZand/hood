import { describe, expect, it } from "vitest";
import { applyConfirmedMatch } from "./matchCandidates";
import { restaurantLocations, restaurantMatchCandidates } from "@/db/schema";
import type { GooglePlaceCandidate } from "@/lib/integrations/googlePlaces";
import type { YelpBusinessCandidate } from "@/lib/integrations/yelp";

type FakeLocation = {
  id: string;
  address: string | null;
  googlePlaceId?: string | null;
  yelpBusinessId?: string | null;
};

function thenable<T>(value: T) {
  return { limit: async () => value, then: (resolve: (v: T) => void) => resolve(value) };
}

function fakeDb(candidate: Record<string, unknown>, existingLocations: FakeLocation[]) {
  const inserted: Record<string, unknown>[] = [];
  const updated: { table: unknown; values: Record<string, unknown> }[] = [];

  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => {
          if (table === restaurantMatchCandidates) return thenable([candidate]);
          if (table === restaurantLocations) return thenable(existingLocations);
          return thenable([]);
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          updated.push({ table, values });
        },
      }),
    }),
    insert: () => ({
      values: async (values: Record<string, unknown>) => {
        inserted.push(values);
      },
    }),
  };

  return { db: db as never, inserted, updated };
}

const googleCandidate = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: "cand-1",
  restaurantId: "r1",
  source: "google",
  candidateExtId: "place-123",
  rawPayload: {
    placeId: "place-123",
    name: "Fiorella",
    address: "2339 Chestnut St, San Francisco, CA",
    latitude: 37.8,
    longitude: -122.44,
    rating: 4.5,
    ratingCount: 200,
    businessStatus: "OPERATIONAL",
    openingHours: null,
  } satisfies GooglePlaceCandidate,
  ...overrides,
});

const yelpCandidate = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: "cand-2",
  restaurantId: "r1",
  source: "yelp",
  candidateExtId: "yelp-abc",
  rawPayload: {
    businessId: "yelp-abc",
    name: "Fiorella",
    address: "2339 Chestnut St, San Francisco, CA",
    city: "San Francisco",
    latitude: 37.8,
    longitude: -122.44,
    rating: 4.0,
    reviewCount: 80,
    isClosed: false,
    url: "https://yelp.com/biz/fiorella",
  } satisfies YelpBusinessCandidate,
  ...overrides,
});

describe("applyConfirmedMatch", () => {
  it("creates a new location when the restaurant has none yet", async () => {
    const { db, inserted, updated } = fakeDb(googleCandidate(), []);
    await applyConfirmedMatch(db, "cand-1", "admin1");

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      restaurantId: "r1",
      googlePlaceId: "place-123",
      address: "2339 Chestnut St, San Francisco, CA",
    });
    expect(updated.find((u) => u.table === restaurantMatchCandidates)?.values).toMatchObject({
      status: "confirmed",
      reviewedBy: "admin1",
    });
  });

  it("creates a second, separate location for a different address of the same restaurant (chain support)", async () => {
    const existing: FakeLocation[] = [
      { id: "loc-1", address: "123 Fillmore St, San Francisco, CA", googlePlaceId: "place-000" },
    ];
    const { db, inserted } = fakeDb(googleCandidate(), existing);
    await applyConfirmedMatch(db, "cand-1", "admin1");

    // A dissimilar address doesn't match the existing location, so a new one is inserted
    // rather than overwriting the first branch's data.
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ restaurantId: "r1", googlePlaceId: "place-123" });
  });

  it("updates the existing location in place when re-confirming the same googlePlaceId", async () => {
    const existing: FakeLocation[] = [
      { id: "loc-1", address: "2339 Chestnut St, San Francisco, CA", googlePlaceId: "place-123" },
    ];
    const { db, inserted, updated } = fakeDb(googleCandidate(), existing);
    await applyConfirmedMatch(db, "cand-1", "admin1");

    expect(inserted).toHaveLength(0);
    const locationUpdate = updated.find((u) => u.table === restaurantLocations);
    expect(locationUpdate?.values).toMatchObject({ googlePlaceId: "place-123" });
  });

  it("attaches a Yelp confirm to an existing Google-derived location at the same address", async () => {
    const existing: FakeLocation[] = [
      { id: "loc-1", address: "2339 Chestnut St, San Francisco, CA", googlePlaceId: "place-123" },
    ];
    const { db, inserted, updated } = fakeDb(yelpCandidate(), existing);
    await applyConfirmedMatch(db, "cand-2", "admin1");

    expect(inserted).toHaveLength(0);
    const locationUpdate = updated.find((u) => u.table === restaurantLocations);
    expect(locationUpdate?.values).toMatchObject({ yelpBusinessId: "yelp-abc" });
  });

  it("seeds a new location from Yelp's own address/coordinates when no existing location matches", async () => {
    const existing: FakeLocation[] = [
      { id: "loc-1", address: "999 Some Other Rd, Oakland, CA", googlePlaceId: "place-999" },
    ];
    const { db, inserted } = fakeDb(yelpCandidate(), existing);
    await applyConfirmedMatch(db, "cand-2", "admin1");

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      restaurantId: "r1",
      yelpBusinessId: "yelp-abc",
      address: "2339 Chestnut St, San Francisco, CA",
      latitude: "37.8",
      longitude: "-122.44",
    });
  });

  it("does not reject any sibling candidates — several can be confirmed as separate locations", async () => {
    const { db, updated } = fakeDb(googleCandidate(), []);
    await applyConfirmedMatch(db, "cand-1", "admin1");

    const candidateUpdates = updated.filter((u) => u.table === restaurantMatchCandidates);
    expect(candidateUpdates).toHaveLength(1);
    expect(candidateUpdates[0].values.status).toBe("confirmed");
  });
});
