/** Splits a raw "Cuisine / Type" spreadsheet cell into individual normalized, deduped tags. */
export function splitCuisines(raw: string | null | undefined): string[] {
  if (!raw) return [];
  if (raw.trim().toLowerCase() === "cuisine / type") return []; // placeholder artifact in source data

  return [
    ...new Set(
      raw
        .split("/")
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .map((part) => part.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())),
    ),
  ];
}
