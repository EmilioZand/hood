import { describe, expect, it } from "vitest";
import { averageRating } from "./ratings";

describe("averageRating", () => {
  it("returns null when there are no ratings", () => {
    expect(averageRating([])).toBeNull();
  });

  it("returns the rating itself for a single rating", () => {
    expect(averageRating([{ rating: 4 }])).toBe(4);
  });

  it("averages multiple ratings", () => {
    expect(averageRating([{ rating: 5 }, { rating: 3 }, { rating: 4 }])).toBeCloseTo(4, 5);
  });

  it("does not round to a whole number", () => {
    expect(averageRating([{ rating: 5 }, { rating: 4 }])).toBeCloseTo(4.5, 5);
  });
});
