import { fetchWithRetry } from "./httpRetry";

export type YelpBusinessCandidate = {
  businessId: string;
  name: string;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  reviewCount: number | null;
  isClosed: boolean | null;
  url: string | null;
};

/** Maps a single raw Yelp Fusion business result into our candidate shape. Pure — no network, easy to unit test. */
export function mapYelpBusiness(biz: {
  id: string;
  name?: string;
  location?: { display_address?: string[]; city?: string };
  coordinates?: { latitude?: number; longitude?: number };
  rating?: number;
  review_count?: number;
  is_closed?: boolean;
  url?: string;
}): YelpBusinessCandidate {
  return {
    businessId: biz.id,
    name: biz.name ?? "",
    address: biz.location?.display_address?.join(", ") ?? null,
    city: biz.location?.city ?? null,
    latitude: biz.coordinates?.latitude ?? null,
    longitude: biz.coordinates?.longitude ?? null,
    rating: biz.rating ?? null,
    reviewCount: biz.review_count ?? null,
    isClosed: biz.is_closed ?? null,
    url: biz.url ?? null,
  };
}

export async function searchYelpBusinesses(
  term: string,
  location: string,
  apiKey: string,
): Promise<YelpBusinessCandidate[]> {
  const url = `https://api.yelp.com/v3/businesses/search?${new URLSearchParams({ term, location })}`;
  const res = await fetchWithRetry(url, { headers: { Authorization: `Bearer ${apiKey}` } });

  if (!res.ok) {
    throw new Error(`Yelp business search failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return (data.businesses ?? []).map(mapYelpBusiness);
}

/** Nightly refresh of a single confirmed business's rating/review count/closed status. */
export async function getYelpBusinessDetails(
  businessId: string,
  apiKey: string,
): Promise<YelpBusinessCandidate> {
  const res = await fetchWithRetry(`https://api.yelp.com/v3/businesses/${businessId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    throw new Error(`Yelp business details failed: ${res.status} ${await res.text()}`);
  }

  return mapYelpBusiness(await res.json());
}
