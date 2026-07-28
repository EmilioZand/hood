import { describe, expect, it, vi, beforeEach } from "vitest";
import { syncRestaurantRatings } from "./syncRatings";
import { getGooglePlaceDetails } from "@/lib/integrations/googlePlaces";
import { getYelpBusinessDetails } from "@/lib/integrations/yelp";

vi.mock("@/lib/integrations/googlePlaces", () => ({
  getGooglePlaceDetails: vi.fn(),
}));
vi.mock("@/lib/integrations/yelp", () => ({
  getYelpBusinessDetails: vi.fn(),
}));

function fakeDb() {
  let captured: Record<string, unknown> | null = null;
  const chain = {
    update: () => chain,
    set: (vals: Record<string, unknown>) => {
      captured = vals;
      return chain;
    },
    where: async () => {},
  };
  return { db: chain as never, getCaptured: () => captured! };
}

const baseRestaurant = {
  id: "r1",
  googlePlaceId: "g1",
  yelpBusinessId: "y1",
  status: "active",
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("syncRestaurantRatings", () => {
  it("updates google rating, opening hours, and business status on success", async () => {
    vi.mocked(getGooglePlaceDetails).mockResolvedValue({
      placeId: "g1",
      name: "Test",
      address: null,
      latitude: null,
      longitude: null,
      rating: 4.2,
      ratingCount: 88,
      businessStatus: "OPERATIONAL",
      openingHours: { periods: [] },
    });
    vi.mocked(getYelpBusinessDetails).mockResolvedValue({
      businessId: "y1",
      name: "Test",
      address: null,
      city: null,
      latitude: null,
      longitude: null,
      rating: 4.0,
      reviewCount: 50,
      isClosed: false,
      url: "https://yelp.com/biz/test",
    });

    const { db, getCaptured } = fakeDb();
    await syncRestaurantRatings(db, { ...baseRestaurant }, { google: "gkey", yelp: "ykey" });

    const captured = getCaptured();
    expect(captured.googleRating).toBe("4.2");
    expect(captured.googleRatingCount).toBe(88);
    expect(captured.googleBusinessStatus).toBe("OPERATIONAL");
    expect(captured.googleOpeningHours).toEqual({ periods: [] });
    expect(captured.yelpRating).toBe("4");
    expect(captured.yelpReviewCount).toBe(50);
    expect(captured.yelpUrl).toBe("https://yelp.com/biz/test");
    expect(captured.lastSyncError).toBeNull();
  });

  it("marks permanently closed when Google reports it, and stamps closedDetectedAt", async () => {
    vi.mocked(getGooglePlaceDetails).mockResolvedValue({
      placeId: "g1",
      name: "Test",
      address: null,
      latitude: null,
      longitude: null,
      rating: null,
      ratingCount: null,
      businessStatus: "CLOSED_PERMANENTLY",
      openingHours: null,
    });

    const { db, getCaptured } = fakeDb();
    await syncRestaurantRatings(
      db,
      { ...baseRestaurant, yelpBusinessId: null, status: "active" },
      { google: "gkey" },
    );

    const captured = getCaptured();
    expect(captured.status).toBe("permanently_closed");
    expect(captured.closedDetectedAt).toBeInstanceOf(Date);
  });

  it("reopens a restaurant if Google reverses a prior closure report", async () => {
    vi.mocked(getGooglePlaceDetails).mockResolvedValue({
      placeId: "g1",
      name: "Test",
      address: null,
      latitude: null,
      longitude: null,
      rating: 4.0,
      ratingCount: 10,
      businessStatus: "OPERATIONAL",
      openingHours: null,
    });

    const { db, getCaptured } = fakeDb();
    await syncRestaurantRatings(
      db,
      { ...baseRestaurant, yelpBusinessId: null, status: "permanently_closed" },
      { google: "gkey" },
    );

    const captured = getCaptured();
    expect(captured.status).toBe("active");
    expect(captured.closedDetectedAt).toBeNull();
  });

  it("does not touch status once already permanently_closed and still reported closed", async () => {
    vi.mocked(getGooglePlaceDetails).mockResolvedValue({
      placeId: "g1",
      name: "Test",
      address: null,
      latitude: null,
      longitude: null,
      rating: null,
      ratingCount: null,
      businessStatus: "CLOSED_PERMANENTLY",
      openingHours: null,
    });

    const { db, getCaptured } = fakeDb();
    await syncRestaurantRatings(
      db,
      { ...baseRestaurant, yelpBusinessId: null, status: "permanently_closed" },
      { google: "gkey" },
    );

    expect(getCaptured().status).toBeUndefined();
  });

  it("records a per-source error without throwing, and skips fields for the failed source", async () => {
    vi.mocked(getGooglePlaceDetails).mockRejectedValue(new Error("Google Places details failed: 404"));
    vi.mocked(getYelpBusinessDetails).mockResolvedValue({
      businessId: "y1",
      name: "Test",
      address: null,
      city: null,
      latitude: null,
      longitude: null,
      rating: 3.5,
      reviewCount: 12,
      isClosed: false,
      url: null,
    });

    const { db, getCaptured } = fakeDb();
    await expect(
      syncRestaurantRatings(db, { ...baseRestaurant }, { google: "gkey", yelp: "ykey" }),
    ).resolves.toBeUndefined();

    const captured = getCaptured();
    expect(captured.googleRating).toBeUndefined();
    expect(captured.yelpRating).toBe("3.5");
    expect(captured.lastSyncError).toContain("google:");
  });

  it("skips a source entirely when its API key or ext id is missing", async () => {
    vi.mocked(getGooglePlaceDetails).mockResolvedValue({
      placeId: "g1",
      name: "Test",
      address: null,
      latitude: null,
      longitude: null,
      rating: 4.1,
      ratingCount: 20,
      businessStatus: "OPERATIONAL",
      openingHours: null,
    });

    const { db, getCaptured } = fakeDb();
    await syncRestaurantRatings(db, { ...baseRestaurant, yelpBusinessId: null }, { google: "gkey" });

    expect(getGooglePlaceDetails).toHaveBeenCalledTimes(1);
    expect(getYelpBusinessDetails).not.toHaveBeenCalled();
    expect(getCaptured().lastSyncError).toBeNull();
  });
});
