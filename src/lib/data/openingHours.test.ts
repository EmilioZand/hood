import { describe, expect, it } from "vitest";
import { isOpenNow } from "./openingHours";
import wakiFixture from "@/lib/integrations/__fixtures__/google-places-waki.json";

// Waki's real hours: Sun 12:00-14:30 & 16:00-21:00, Mon-Sat 17:00-21:00 (all Pacific).
const wakiHours = { periods: wakiFixture.regularOpeningHours.periods };

describe("isOpenNow", () => {
  it("returns null when there is no opening-hours data", () => {
    expect(isOpenNow(null)).toBeNull();
    expect(isOpenNow({ periods: [] })).toBeNull();
  });

  it("is open during Sunday lunch service", () => {
    // 2026-01-04 is a Sunday; 21:00 UTC = 13:00 PST (UTC-8 in January).
    expect(isOpenNow(wakiHours, new Date("2026-01-04T21:00:00Z"))).toBe(true);
  });

  it("is closed during the Sunday afternoon gap", () => {
    // 23:00 UTC = 15:00 PST — between lunch (ends 14:30) and dinner (starts 16:00).
    expect(isOpenNow(wakiHours, new Date("2026-01-04T23:00:00Z"))).toBe(false);
  });

  it("is open on a Monday evening", () => {
    // 2026-01-05 is a Monday; Jan 6 02:00 UTC = Jan 5 18:00 PST.
    expect(isOpenNow(wakiHours, new Date("2026-01-06T02:00:00Z"))).toBe(true);
  });

  it("is closed on a Monday morning", () => {
    // Jan 5 18:00 UTC = Jan 5 10:00 PST.
    expect(isOpenNow(wakiHours, new Date("2026-01-05T18:00:00Z"))).toBe(false);
  });

  it("handles an overnight period spanning midnight", () => {
    const overnightHours = {
      periods: [{ open: { day: 5, hour: 22, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } }],
    };
    // Friday 23:00 PST — within the overnight period.
    // 2026-01-02 is a Friday; Jan 3 07:00 UTC = Jan 2 23:00 PST.
    expect(isOpenNow(overnightHours, new Date("2026-01-03T07:00:00Z"))).toBe(true);
    // Saturday 01:00 PST — still within the same overnight period (closes 02:00 Sat).
    // Jan 3 09:00 UTC = Jan 3 01:00 PST.
    expect(isOpenNow(overnightHours, new Date("2026-01-03T09:00:00Z"))).toBe(true);
    // Saturday 03:00 PST — after the overnight period has closed.
    expect(isOpenNow(overnightHours, new Date("2026-01-03T11:00:00Z"))).toBe(false);
  });
});
