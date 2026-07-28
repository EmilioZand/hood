import { describe, expect, it } from "vitest";
import {
  normalizeName,
  pickAutoConfirmWinner,
  rankCandidates,
  scoreMatch,
  trigramOverlap,
  trigramSimilarity,
} from "./fuzzyMatch";

describe("normalizeName", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeName("Marlena's!")).toBe("marlena s");
  });

  it("drops generic business words but keeps cuisine words", () => {
    expect(normalizeName("The Ramen Bar & Grill")).toBe("ramen");
    expect(normalizeName("Funky Elephant Restaurant")).toBe("funky elephant");
  });

  it("falls back to the lowercased original if everything is generic", () => {
    expect(normalizeName("The Restaurant")).toBe("the restaurant");
  });

  it("strips accents so accented and plain spellings normalize identically", () => {
    // Real case reported: "Angèle Restaurant & Bar" vs "Angele Restaurant & Bar" scored
    // 0.625 — after "Restaurant"/"Bar" are dropped as generic words, this reduces to
    // "angèle" vs "angele", where one accented character disproportionately hurt a
    // 6-letter word's trigram similarity, even though it's clearly the same name.
    expect(normalizeName("Angèle Restaurant & Bar")).toBe(normalizeName("Angele Restaurant & Bar"));
    expect(normalizeName("Café Réveille")).toBe(normalizeName("Cafe Reveille"));
  });

  it("treats curly/smart quotes the same as straight ones", () => {
    // Real case reported: "Charmaine's" (straight ') vs "Charmaine's" (curly ’, common
    // when copy-pasted from a website) scored 0.769 — the straight apostrophe was
    // stripped to a space by the punctuation regex, but the curly one wasn't recognized
    // at all and stayed glued to the word, so the two spellings normalized differently.
    expect(normalizeName("Charmaine's")).toBe(normalizeName("Charmaine’s"));
    expect(normalizeName("Charmaine's")).toBe("charmaine s");
  });
});

describe("trigramSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(trigramSimilarity("waki", "waki")).toBe(1);
  });

  it("returns 0 for completely dissimilar strings", () => {
    expect(trigramSimilarity("waki", "zzzz")).toBe(0);
  });

  it("returns a high score for near-identical strings", () => {
    const score = trigramSimilarity("fish and bird sousaku izakaya", "fish & bird sousaku izakaya");
    expect(score).toBeGreaterThan(0.7);
  });

  it("returns a low score for unrelated strings", () => {
    const score = trigramSimilarity("waki", "chez noir");
    expect(score).toBeLessThan(0.2);
  });
});

describe("trigramOverlap", () => {
  it("returns 1 for identical strings", () => {
    expect(trigramOverlap("waki", "waki")).toBe(1);
  });

  it("returns 0 for completely dissimilar strings", () => {
    expect(trigramOverlap("waki", "zzzz")).toBe(0);
  });

  it("scores much higher than Jaccard when a short name is fully contained in a longer one", () => {
    // Real case reported: "Amelie" vs "Amelie San Francisco" scored 0.30 under plain
    // Jaccard (trigramSimilarity), even though the short name is entirely present.
    const jaccard = trigramSimilarity("amelie", "amelie san francisco");
    const overlap = trigramOverlap("amelie", "amelie san francisco");
    expect(jaccard).toBeCloseTo(0.304, 2);
    expect(overlap).toBeGreaterThan(0.85);
    expect(overlap).toBeGreaterThan(jaccard);
  });
});

describe("scoreMatch", () => {
  it("scores a short name highly against a longer candidate that contains it plus a city suffix", () => {
    // The exact real-world report: our tracked "Amelie" vs a Google/Yelp result
    // literally named "Amelie San Francisco" (common for disambiguating chain locations).
    const score = scoreMatch(
      { name: "Amelie San Francisco", city: "San Francisco" },
      { name: "Amelie", city: "San Francisco" },
    );
    expect(score).toBeGreaterThan(0.85);
  });

  it("scores an accented vs. plain spelling of the same restaurant near 1", () => {
    const score = scoreMatch(
      { name: "Angèle Restaurant & Bar", city: "Napa" },
      { name: "Angele Restaurant & Bar", city: "Napa" },
    );
    expect(score).toBeCloseTo(1, 5);
  });

  it("scores an exact name + city match near 1", () => {
    const score = scoreMatch(
      { name: "Waki", city: "Alameda" },
      { name: "Waki", city: "Alameda" },
    );
    expect(score).toBeCloseTo(1, 5);
  });

  it("boosts score when city matches exactly", () => {
    const withCity = scoreMatch(
      { name: "Curry Hyuga", city: "Burlingame" },
      { name: "Curry Hyuga Japanese Curry", city: "Burlingame" },
    );
    const withoutCity = scoreMatch(
      { name: "Curry Hyuga", city: "San Jose" },
      { name: "Curry Hyuga Japanese Curry", city: "Burlingame" },
    );
    expect(withCity).toBeGreaterThan(withoutCity);
  });

  it("is case-insensitive for city comparison", () => {
    const score = scoreMatch(
      { name: "Waki", city: "ALAMEDA" },
      { name: "Waki", city: "alameda" },
    );
    expect(score).toBeCloseTo(1, 5);
  });

  it("handles a missing city on either side without throwing", () => {
    expect(() => scoreMatch({ name: "Waki" }, { name: "Waki", city: "Alameda" })).not.toThrow();
    expect(scoreMatch({ name: "Waki" }, { name: "Waki", city: "Alameda" })).toBe(1);
  });

  it("clamps to [0, 1]", () => {
    const score = scoreMatch({ name: "Waki", city: "Alameda" }, { name: "Waki", city: "Alameda" });
    expect(score).toBeLessThanOrEqual(1);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("substantially penalizes a city mismatch even with a perfect name match, breaking chain-location ties", () => {
    // Real case reported: a chain restaurant (e.g. "Funky Elephant") with identically-named
    // locations in two different cities both scored 1.0 under the old formula, since a
    // perfect name match left the boost nowhere to go — city mismatch has to actively
    // subtract, not just fail to add, or multi-location chains can never be disambiguated.
    const target = { name: "Funky Elephant", city: "San Francisco" };
    const correctLocation = scoreMatch({ name: "Funky Elephant", city: "San Francisco" }, target);
    const wrongLocation = scoreMatch({ name: "Funky Elephant", city: "Berkeley" }, target);

    expect(correctLocation).toBeCloseTo(1, 5);
    expect(wrongLocation).toBeLessThan(0.7);
    expect(correctLocation - wrongLocation).toBeGreaterThanOrEqual(0.15);
  });

  it("does not penalize when city is simply unknown on one side (no evidence, not contradicting evidence)", () => {
    const score = scoreMatch({ name: "Waki" }, { name: "Waki", city: "Alameda" });
    expect(score).toBe(1);
  });
});

describe("pickAutoConfirmWinner", () => {
  it("returns null when there are no candidates", () => {
    expect(pickAutoConfirmWinner([], 0.8)).toBeNull();
  });

  it("returns the sole candidate when it clears the threshold", () => {
    const candidates = [{ id: "a", matchScore: 0.9 }];
    expect(pickAutoConfirmWinner(candidates, 0.8)?.id).toBe("a");
  });

  it("returns null when the sole candidate is below the threshold", () => {
    const candidates = [{ id: "a", matchScore: 0.7 }];
    expect(pickAutoConfirmWinner(candidates, 0.8)).toBeNull();
  });

  it("picks a decisive winner among a multi-location chain's candidates", () => {
    // The exact scenario this exists for: city-penalty fix widens the gap enough
    // that the correct location can auto-confirm even though a same-named
    // wrong-city duplicate is also in the candidate set.
    const candidates = [
      { id: "correct-city", matchScore: 1.0 },
      { id: "wrong-city", matchScore: 0.65 },
    ];
    expect(pickAutoConfirmWinner(candidates, 0.8)?.id).toBe("correct-city");
  });

  it("refuses to pick when the top two are still a genuine tie", () => {
    const candidates = [
      { id: "a", matchScore: 0.9 },
      { id: "b", matchScore: 0.88 },
    ];
    expect(pickAutoConfirmWinner(candidates, 0.8, 0.15)).toBeNull();
  });

  it("respects a custom margin", () => {
    const candidates = [
      { id: "a", matchScore: 0.9 },
      { id: "b", matchScore: 0.8 },
    ];
    expect(pickAutoConfirmWinner(candidates, 0.8, 0.05)?.id).toBe("a");
    expect(pickAutoConfirmWinner(candidates, 0.8, 0.2)).toBeNull();
  });
});

describe("rankCandidates", () => {
  it("sorts candidates highest score first", () => {
    const target = { name: "Waki", city: "Alameda" };
    const candidates = [
      { id: "a", name: "Some Unrelated Place", city: "Oakland" },
      { id: "b", name: "Waki", city: "Alameda" },
      { id: "c", name: "Waki Japanese", city: "Alameda" },
    ];

    const ranked = rankCandidates(candidates, target);

    expect(ranked[0].id).toBe("b");
    expect(ranked.map((c) => c.matchScore)).toEqual(
      [...ranked.map((c) => c.matchScore)].sort((a, b) => b - a),
    );
  });

  it("attaches a matchScore to every candidate without mutating the input", () => {
    const candidates = [{ id: "a", name: "Waki", city: "Alameda" }];
    const ranked = rankCandidates(candidates, { name: "Waki", city: "Alameda" });

    expect(ranked[0]).toMatchObject({ id: "a", name: "Waki", city: "Alameda" });
    expect(typeof ranked[0].matchScore).toBe("number");
    expect(candidates[0]).not.toHaveProperty("matchScore");
  });
});
