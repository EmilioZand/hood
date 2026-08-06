import { fetchWithRetry } from "./httpRetry";

export type OpeningPeriod = {
  open: { day: number; hour: number; minute: number };
  close: { day: number; hour: number; minute: number };
};

export type GooglePlaceCandidate = {
  placeId: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  ratingCount: number | null;
  businessStatus: string | null;
  openingHours: { periods: OpeningPeriod[] } | null;
  // Used only to auto-populate a new spot's Neighborhood/Cuisine fields when they're
  // left blank (see add-entry/actions.ts's submitRecommendation) — never overwrites
  // anything a human typed.
  neighborhood: string | null;
  cuisine: string | null;
};

type AddressComponent = { longText?: string; shortText?: string; types?: string[] };

// Google returns the most specific neighborhood-like component first when present;
// "sublocality" components (district-level, broader than a neighborhood) are the closest
// fallback when "neighborhood" itself is absent.
const NEIGHBORHOOD_COMPONENT_TYPES = ["neighborhood", "sublocality_level_1", "sublocality"];

function extractNeighborhood(components: AddressComponent[] | undefined): string | null {
  if (!components) return null;
  for (const type of NEIGHBORHOOD_COMPONENT_TYPES) {
    const match = components.find((c) => c.types?.includes(type));
    if (match) return match.longText ?? match.shortText ?? null;
  }
  return null;
}

// Google's primaryTypeDisplayName reads like "Japanese Restaurant" or "Sushi Restaurant" —
// close enough to our own free-text cuisine tags (e.g. "Japanese") once the generic
// " Restaurant" suffix is stripped. Left as-is for types that aren't restaurant-shaped
// (e.g. "Cafe", "Bakery" — both already exist as real cuisine tags in this app).
function deriveCuisine(primaryTypeDisplayName: { text?: string } | undefined): string | null {
  const text = primaryTypeDisplayName?.text?.trim();
  if (!text) return null;
  const stripped = text.replace(/\s+Restaurant$/i, "").trim();
  return stripped || null;
}

const SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "places.regularOpeningHours.periods",
  "places.primaryTypeDisplayName",
].join(",");

/** Maps a single raw Places API (New) result into our candidate shape. Pure — no network, easy to unit test. */
export function mapGooglePlace(place: {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: AddressComponent[];
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  regularOpeningHours?: { periods?: OpeningPeriod[] };
  primaryTypeDisplayName?: { text?: string };
}): GooglePlaceCandidate {
  return {
    placeId: place.id,
    name: place.displayName?.text ?? "",
    address: place.formattedAddress ?? null,
    latitude: place.location?.latitude ?? null,
    longitude: place.location?.longitude ?? null,
    rating: place.rating ?? null,
    ratingCount: place.userRatingCount ?? null,
    businessStatus: place.businessStatus ?? null,
    openingHours: place.regularOpeningHours?.periods
      ? { periods: place.regularOpeningHours.periods }
      : null,
    neighborhood: extractNeighborhood(place.addressComponents),
    cuisine: deriveCuisine(place.primaryTypeDisplayName),
  };
}

export async function searchGooglePlaces(
  query: string,
  apiKey: string,
): Promise<GooglePlaceCandidate[]> {
  const res = await fetchWithRetry("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": SEARCH_FIELD_MASK,
    },
    body: JSON.stringify({ textQuery: query }),
  });

  if (!res.ok) {
    throw new Error(`Google Places searchText failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return (data.places ?? []).map(mapGooglePlace);
}

const DETAILS_FIELD_MASK = [
  "id",
  "rating",
  "userRatingCount",
  "businessStatus",
  "regularOpeningHours.periods",
].join(",");

/** Weekly refresh — field-masked to the cheapest billing tier (no photos/reviews/etc). */
export async function getGooglePlaceDetails(
  placeId: string,
  apiKey: string,
): Promise<GooglePlaceCandidate> {
  const res = await fetchWithRetry(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": DETAILS_FIELD_MASK,
    },
  });

  if (!res.ok) {
    throw new Error(`Google Places details failed: ${res.status} ${await res.text()}`);
  }

  return mapGooglePlace(await res.json());
}
