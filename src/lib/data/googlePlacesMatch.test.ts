import { describe, expect, it, vi, beforeEach } from "vitest";
import { queueGoogleMatchCandidates } from "./googlePlacesMatch";
import { searchGooglePlaces } from "@/lib/integrations/googlePlaces";

vi.mock("@/lib/integrations/googlePlaces", () => ({
  searchGooglePlaces: vi.fn(),
}));

function fakeDb(skipExtIds: Set<string> = new Set()) {
  const inserted: Record<string, unknown>[] = [];
  let nextId = 1;
  const db = {
    insert: () => ({
      values: (vals: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (skipExtIds.has(vals.candidateExtId as string)) return [];
            inserted.push(vals);
            return [{ id: `row-${nextId++}` }];
          },
        }),
      }),
    }),
  };
  return { db: db as never, inserted };
}

const restaurant = { id: "r1", name: "Fiorella", city: "San Francisco" };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("queueGoogleMatchCandidates", () => {
  it("queues the top candidates as pending rows and returns their ids/scores", async () => {
    vi.mocked(searchGooglePlaces).mockResolvedValue([
      {
        placeId: "place-1",
        name: "Fiorella",
        address: "2339 Chestnut St, San Francisco, CA",
        latitude: 37.8,
        longitude: -122.44,
        rating: 4.5,
        ratingCount: 200,
        businessStatus: "OPERATIONAL",
        openingHours: null,
        neighborhood: "Marina",
        cuisine: "Italian",
      },
    ]);

    const { db, inserted } = fakeDb();
    const queued = await queueGoogleMatchCandidates(db, restaurant, "test-key");

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      restaurantId: "r1",
      source: "google",
      candidateExtId: "place-1",
      status: "pending",
    });
    expect(queued).toEqual([
      { id: "row-1", matchScore: expect.any(Number), neighborhood: "Marina", cuisine: "Italian" },
    ]);
  });

  it("caps at the top 3 candidates when more are returned", async () => {
    vi.mocked(searchGooglePlaces).mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({
        placeId: `place-${i}`,
        name: "Fiorella",
        address: null,
        latitude: null,
        longitude: null,
        rating: null,
        ratingCount: null,
        businessStatus: null,
        openingHours: null,
        neighborhood: null,
        cuisine: null,
      })),
    );

    const { db, inserted } = fakeDb();
    const queued = await queueGoogleMatchCandidates(db, restaurant, "test-key");

    expect(inserted).toHaveLength(3);
    expect(queued).toHaveLength(3);
  });

  it("excludes candidates skipped by onConflictDoNothing (already queued) from the result", async () => {
    vi.mocked(searchGooglePlaces).mockResolvedValue([
      { placeId: "place-1", name: "Fiorella", address: null, latitude: null, longitude: null, rating: null, ratingCount: null, businessStatus: null, openingHours: null, neighborhood: null, cuisine: null },
      { placeId: "place-2", name: "Fiorella", address: null, latitude: null, longitude: null, rating: null, ratingCount: null, businessStatus: null, openingHours: null, neighborhood: null, cuisine: null },
    ]);

    const { db } = fakeDb(new Set(["place-1"]));
    const queued = await queueGoogleMatchCandidates(db, restaurant, "test-key");

    expect(queued).toHaveLength(1);
    expect(queued[0].id).toBe("row-1");
  });

  it("returns an empty list when Google finds nothing", async () => {
    vi.mocked(searchGooglePlaces).mockResolvedValue([]);
    const { db, inserted } = fakeDb();
    const queued = await queueGoogleMatchCandidates(db, restaurant, "test-key");

    expect(inserted).toHaveLength(0);
    expect(queued).toHaveLength(0);
  });
});
