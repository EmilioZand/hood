import { describe, expect, it } from "vitest";
import { mapYelpBusiness } from "./yelp";
import fixture from "./__fixtures__/yelp-waki.json";

describe("mapYelpBusiness", () => {
  it("maps a real Yelp Fusion business result to our candidate shape", () => {
    expect(mapYelpBusiness(fixture)).toEqual({
      businessId: "4JNswX9a6x9JBjo0w5Kyww",
      name: "WAKI Japanese Cuisine",
      address: "1403 Webster St, Alameda, CA 94501",
      city: "Alameda",
      latitude: 37.771612,
      longitude: -122.277037,
      rating: 4.5,
      reviewCount: 260,
      isClosed: false,
      url: "https://www.yelp.com/biz/waki-japanese-cuisine-alameda",
    });
  });

  it("handles missing optional fields without throwing", () => {
    const result = mapYelpBusiness({ id: "xyz789" });
    expect(result).toEqual({
      businessId: "xyz789",
      name: "",
      address: null,
      city: null,
      latitude: null,
      longitude: null,
      rating: null,
      reviewCount: null,
      isClosed: null,
      url: null,
    });
  });
});
