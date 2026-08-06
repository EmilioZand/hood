/**
 * Rolls a free-text cuisine tag up into a broad category, so search for "asian" can
 * match a restaurant tagged "Japanese" or "Ramen" even though that word never appears
 * in the tag. Order matters: earlier groups win on a tag that matches more than one
 * keyword list (e.g. "Latin American Rooftop Bar" and "Asian American Bakery" both
 * contain the generic word "american", so American is checked last; origin-specific
 * groups are checked before the generic format groups Breakfast/American so e.g.
 * "French Bakery" stays European and "Mexican Brunch" stays Latin American instead of
 * falling into Breakfast).
 */
export const CUISINE_GROUPS: [name: string, keywords: string[]][] = [
  ["Asian", [
    "asian", "japanese", "chinese", "korean", "thai", "vietnamese", "taiwanese",
    "malaysian", "filipino", "indonesian", "singaporean", "sri lankan", "pakistani",
    "indian", "sichuan", "cantonese", "southeast asian", "hong kong",
    "ramen", "sushi", "izakaya", "omakase", "udon", "soba", "katsu", "yakitori",
    "wonton", "banh mi", "dim sum", "hand rolls", "bao", "matcha", "sake", "dumpling",
  ]],
  ["Latin American", [
    "latin american", "mexican", "peruvian", "oaxacan", "argentinian", "brazilian",
    "birria", "taco", "burrito", "margarita", "tequila",
  ]],
  ["Middle Eastern & Mediterranean", [
    "persian", "iranian", "turkish", "moroccan", "tunisian", "lebanese",
    "middle eastern", "mediterranean",
  ]],
  ["European", [
    "french", "italian", "spanish", "greek", "sardinian",
    "pizza", "tapas", "lasagna",
  ]],
  ["American", [
    "american", "californian", "southern", "soul food", "steakhouse",
  ]],
  ["Breakfast", [
    "bakery", "brunch", "bagel", "croissant", "crepe", "breakfast",
  ]],
];

/** Returns the group a cuisine tag rolls up into, or null if it's a generic
 * venue/format word (Bar, Steak, Sandwiches...) with no single national origin. */
export function classifyCuisineGroup(cuisineName: string): string | null {
  const lower = cuisineName.toLowerCase();
  for (const [group, keywords] of CUISINE_GROUPS) {
    if (keywords.some((kw) => lower.includes(kw))) return group;
  }
  return null;
}
