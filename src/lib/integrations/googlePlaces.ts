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
};

const SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "places.regularOpeningHours.periods",
].join(",");

/** Maps a single raw Places API (New) result into our candidate shape. Pure — no network, easy to unit test. */
export function mapGooglePlace(place: {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  regularOpeningHours?: { periods?: OpeningPeriod[] };
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
