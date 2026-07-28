/** Average of a restaurant's user ratings, or null if nobody has rated it yet. */
export function averageRating(ratings: { rating: number }[]): number | null {
  if (ratings.length === 0) return null;
  const sum = ratings.reduce((total, r) => total + r.rating, 0);
  return sum / ratings.length;
}
