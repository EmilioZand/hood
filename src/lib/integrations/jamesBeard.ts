import * as cheerio from "cheerio";
import { fetchWithRetry } from "./httpRetry";

export type JamesBeardStage = "semifinalist" | "finalist" | "winner";

export type JamesBeardWinner = {
  category: string;
  stage: JamesBeardStage;
  // Everything before city/state — could be "Person, Restaurant" or just "Restaurant"
  // depending on the award type, which isn't reliably distinguishable from markup alone.
  // For group nominations ("Chef, Group (RestaurantA, RestaurantB), City1, City2, ST")
  // every comma/paren-separated piece ends up here — each is tried as a match candidate.
  nameSegments: string[];
  city: string | null;
  state: string | null;
  rawText: string;
  sourceUrl: string;
};

/**
 * Parses one JBF award-listing page. All three page types (semifinalists, finalists —
 * JBF calls them "nominees" — and winners) share the same underlying shape: a category
 * heading followed by one or more entries before the next heading. They differ only in
 * heading tag (h3 for semifinalists, h4 for finalists/winners) and entry cardinality
 * (winners: one bare <p> per heading; semifinalists/finalists: a <ul><li><p>> per
 * candidate). Pure — no network, unit tested against saved fixtures per stage.
 *
 * This markup has shifted before and will shift again; if this stops finding anything,
 * check the real page structure before assuming a season had no Bay Area entries.
 */
export function parseJamesBeardPage(
  html: string,
  sourceUrl: string,
  stage: JamesBeardStage,
  headingSelector: string,
): JamesBeardWinner[] {
  const $ = cheerio.load(html);
  const entries: JamesBeardWinner[] = [];

  function processEntry(rawText: string, category: string) {
    const cleaned = rawText.replace(/\s+/g, " ").trim();
    if (!cleaned) return;

    // Group nominations nest a restaurant list in parens, e.g. "Cal-India Collective
    // (Ettan, Copra, Eylan and Little Blue Door), Palo Alto, ... CA" — pull those out
    // and split them on their own commas, since a plain outer split would otherwise
    // merge the first paren item onto whatever precedes it ("Cal-India Collective Ettan").
    const parenSegments = [...cleaned.matchAll(/\(([^)]*)\)/g)].flatMap((m) =>
      m[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    const outerText = cleaned.replace(/\([^)]*\)/g, "");
    const outerParts = outerText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (outerParts.length < 2) return;

    const state = outerParts[outerParts.length - 1];
    const city = outerParts[outerParts.length - 2];
    const nameSegments = [...outerParts.slice(0, -2), ...parenSegments];
    if (nameSegments.length === 0) return;

    entries.push({ category, stage, nameSegments, city, state, rawText: cleaned, sourceUrl });
  }

  $(headingSelector).each((_, el) => {
    const category = $(el).text().replace(/\s+/g, " ").trim();
    if (!category) return;

    let node = $(el).next();
    while (node.length && !node.is(headingSelector)) {
      if (node.is("p")) {
        processEntry(node.text(), category);
      } else {
        node.find("p").each((_, pEl) => processEntry($(pEl).text(), category));
      }
      node = node.next();
    }
  });

  return entries;
}

async function fetchJamesBeardPage(
  slug: string,
  stage: JamesBeardStage,
  headingSelector: string,
): Promise<JamesBeardWinner[]> {
  const url = `https://www.jamesbeard.org/stories/${slug}`;
  const res = await fetchWithRetry(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; BayAreaRestaurantsBot/1.0)" },
  });

  if (!res.ok) {
    throw new Error(`James Beard ${stage} fetch failed: ${res.status}`);
  }

  const html = await res.text();
  return parseJamesBeardPage(html, url, stage, headingSelector);
}

export function fetchJamesBeardSemifinalists(year: number) {
  return fetchJamesBeardPage(`james-beard-award-semifinalists-${year}`, "semifinalist", "h3.h3");
}

export function fetchJamesBeardFinalists(year: number) {
  return fetchJamesBeardPage(
    `james-beard-awards-restaurant-and-chef-nominees-${year}`,
    "finalist",
    "h4.h4",
  );
}

export function fetchJamesBeardWinners(year: number) {
  return fetchJamesBeardPage(`james-beard-award-winners-${year}`, "winner", "h4.h4");
}

export async function fetchAllJamesBeardStages(year: number): Promise<JamesBeardWinner[]> {
  const [semifinalists, finalists, winners] = await Promise.all([
    fetchJamesBeardSemifinalists(year).catch(() => []),
    fetchJamesBeardFinalists(year).catch(() => []),
    fetchJamesBeardWinners(year).catch(() => []),
  ]);
  return [...semifinalists, ...finalists, ...winners];
}
