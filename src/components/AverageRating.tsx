/** Read-only "★ 4.3 (12)" display — used wherever a spot's average user rating shows up. */
export function AverageRating({ average, count }: { average: number; count: number }) {
  return (
    <span className="whitespace-nowrap text-sm text-gray-700">
      <span className="text-brand-gold-dark">★</span> {average.toFixed(1)}{" "}
      <span className="text-gray-500">
        ({count} rating{count === 1 ? "" : "s"})
      </span>
    </span>
  );
}
