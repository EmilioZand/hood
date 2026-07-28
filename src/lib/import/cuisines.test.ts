import { describe, expect, it } from "vitest";
import { splitCuisines } from "./cuisines";

describe("splitCuisines", () => {
  it("splits slash-separated cuisines and title-cases each part", () => {
    expect(splitCuisines("Chinese / dim sum")).toEqual(["Chinese", "Dim Sum"]);
  });

  it("returns a single-element array for a plain cuisine", () => {
    expect(splitCuisines("Japanese")).toEqual(["Japanese"]);
  });

  it("treats the literal header artifact 'Cuisine / Type' as no cuisine", () => {
    expect(splitCuisines("Cuisine / Type")).toEqual([]);
    expect(splitCuisines("cuisine / type")).toEqual([]);
  });

  it("returns an empty array for null/undefined/blank input", () => {
    expect(splitCuisines(null)).toEqual([]);
    expect(splitCuisines(undefined)).toEqual([]);
    expect(splitCuisines("")).toEqual([]);
  });

  it("dedupes repeated parts regardless of original casing", () => {
    expect(splitCuisines("sushi / Sushi / SUSHI")).toEqual(["Sushi"]);
  });

  it("trims whitespace around parts", () => {
    expect(splitCuisines("  Peruvian   /   Rotisserie chicken  ")).toEqual([
      "Peruvian",
      "Rotisserie Chicken",
    ]);
  });
});
