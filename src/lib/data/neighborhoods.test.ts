import { describe, expect, it } from "vitest";
import { getOrCreateNeighborhoodId } from "./neighborhoods";

function fakeDb({
  firstLookup = null,
  afterConflictLookup = null,
  insertConflicts = false,
}: {
  firstLookup?: { id: string } | null;
  afterConflictLookup?: { id: string } | null;
  insertConflicts?: boolean;
}) {
  let selectCalls = 0;
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            selectCalls++;
            const row = selectCalls === 1 ? firstLookup : afterConflictLookup;
            return row ? [row] : [];
          },
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: async () => (insertConflicts ? [] : [{ id: "new-row" }]),
        }),
      }),
    }),
  };
  return db as never;
}

describe("getOrCreateNeighborhoodId", () => {
  it("returns null without touching the db when no name is given", async () => {
    const db = fakeDb({});
    expect(await getOrCreateNeighborhoodId(db, "San Francisco", null)).toBeNull();
  });

  it("returns the existing row's id when (city, name) already exists", async () => {
    const db = fakeDb({ firstLookup: { id: "existing-row" } });
    expect(await getOrCreateNeighborhoodId(db, "San Francisco", "Mission")).toBe("existing-row");
  });

  it("creates a new row and returns its id when none exists", async () => {
    const db = fakeDb({});
    expect(await getOrCreateNeighborhoodId(db, "San Francisco", "SoMa")).toBe("new-row");
  });

  it("falls back to re-reading the row when a concurrent insert wins the (city, name) race", async () => {
    const db = fakeDb({ insertConflicts: true, afterConflictLookup: { id: "winner-row" } });
    expect(await getOrCreateNeighborhoodId(db, "San Francisco", "Mission")).toBe("winner-row");
  });
});
