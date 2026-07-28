import { describe, expect, it } from "vitest";
import { mapGooglePlace } from "./googlePlaces";
import fixture from "./__fixtures__/google-places-waki.json";

describe("mapGooglePlace", () => {
  it("maps a real Places API (New) result to our candidate shape", () => {
    expect(mapGooglePlace(fixture)).toEqual({
      placeId: "ChIJkTHW2l6Bj4AR9ayFQ-J4Kqw",
      name: "Waki",
      address: "1403 Webster St, Alameda, CA 94501, USA",
      latitude: 37.7716751,
      longitude: -122.2770072,
      rating: 4.6,
      ratingCount: 129,
      businessStatus: "OPERATIONAL",
      openingHours: { periods: fixture.regularOpeningHours.periods },
    });
  });

  it("handles missing optional fields without throwing", () => {
    const result = mapGooglePlace({ id: "abc123" });
    expect(result).toEqual({
      placeId: "abc123",
      name: "",
      address: null,
      latitude: null,
      longitude: null,
      rating: null,
      ratingCount: null,
      businessStatus: null,
      openingHours: null,
    });
  });
});
