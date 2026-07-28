import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseJamesBeardPage } from "./jamesBeard";

function loadFixture(name: string): string {
  return readFileSync(join(__dirname, `__fixtures__/${name}`), "utf-8");
}

const WINNERS_URL = "https://www.jamesbeard.org/stories/james-beard-award-winners-2026";
const SEMIFINALISTS_URL = "https://www.jamesbeard.org/stories/james-beard-award-semifinalists-2026";

describe("parseJamesBeardPage — winners (single <p> per h4)", () => {
  const winners = parseJamesBeardPage(
    loadFixture("james-beard-winners-2026.html"),
    WINNERS_URL,
    "winner",
    "h4.h4",
  );

  it("parses a 'Person, Restaurant, City, State' entry", () => {
    const tusk = winners.find((w) => w.category === "Outstanding Chef");
    expect(tusk).toEqual({
      category: "Outstanding Chef",
      stage: "winner",
      nameSegments: ["Michael Tusk", "Quince"],
      city: "San Francisco",
      state: "CA",
      rawText: "Michael Tusk, Quince, San Francisco, CA",
      sourceUrl: WINNERS_URL,
    });
  });

  it("parses a restaurant-only entry with no person name (3 comma parts)", () => {
    const outstanding = winners.find((w) => w.category.startsWith("Outstanding Restaurant "));
    expect(outstanding?.nameSegments).toEqual(["Kalaya"]);
    expect(outstanding?.city).toBe("Philadelphia");
    expect(outstanding?.state).toBe("PA");
  });

  it("handles a restaurant name containing '&' safely", () => {
    const ito = winners.find((w) => w.rawText.includes("Royal Sushi"));
    expect(ito?.nameSegments).toEqual(["Jesse Ito", "Royal Sushi & Izakaya"]);
  });

  it("skips a section header h4 with no following <p>", () => {
    expect(winners.some((w) => w.category.includes("Best Chefs (by region)"))).toBe(false);
  });

  it("does not throw on a 'City, D.C.' style two-part location", () => {
    const pastry = winners.find((w) => w.category === "Outstanding Pastry Chef or Baker");
    expect(pastry?.city).toBe("Washington");
    expect(pastry?.state).toBe("D.C.");
  });

  it("finds the expected number of parsed winners from the fixture", () => {
    expect(winners).toHaveLength(8);
  });
});

describe("parseJamesBeardPage — semifinalists (multi-entry <ul><li><p> per h3)", () => {
  const semifinalists = parseJamesBeardPage(
    loadFixture("james-beard-semifinalists-2026.html"),
    SEMIFINALISTS_URL,
    "semifinalist",
    "h3.h3",
  );

  it("collects multiple entries under a single category heading", () => {
    const restaurateurEntries = semifinalists.filter((w) => w.category === "Outstanding Restaurateur");
    expect(restaurateurEntries).toHaveLength(2);
  });

  it("pulls a paren-nested restaurant name out as its own segment", () => {
    const calIndia = semifinalists.find((w) => w.rawText.includes("Cal-India Collective"));
    expect(calIndia?.nameSegments).toContain("Copra");
    expect(calIndia?.nameSegments).toContain("Ettan");
  });

  it("stamps every entry with the semifinalist stage", () => {
    expect(semifinalists.every((w) => w.stage === "semifinalist")).toBe(true);
  });

  it("does not bleed entries across category boundaries", () => {
    const chefEntries = semifinalists.filter((w) => w.category === "Outstanding Chef");
    expect(chefEntries.map((w) => w.nameSegments[0])).toEqual(["Michael Tusk", "Foreign Cinema"]);
  });

  it("skips a region section header with no entries of its own", () => {
    expect(semifinalists.some((w) => w.category.includes("Best Chefs (by region)"))).toBe(false);
  });
});
