import { describe, expect, it } from "vitest";
import { parseBestTimeForecast } from "./bestTime";
import fixture from "./__fixtures__/besttime-waki.json";

describe("parseBestTimeForecast", () => {
  const result = parseBestTimeForecast(fixture as never);

  it("extracts the venue id", () => {
    expect(result.venueId).toBe("ven_77714b344a2d51467961395241346a42366c325748546b4a496843");
  });

  it("converts BestTime's Monday=0 day convention to our Sunday=0 convention", () => {
    // Fixture's first analysis entry is day_int=0 (Monday) -> our dayOfWeek should be 1.
    const mondayHours = result.hours.filter((h) => h.dayOfWeek === 1);
    expect(mondayHours.length).toBeGreaterThan(0);
  });

  it("pairs hour_analysis and day_raw by array position, using hour_analysis's own hour label", () => {
    // Real Monday data: hour 19 (7pm) is the peak, day_raw value 60, at array position 13 —
    // not day_raw[19], which is a different (closed) slot.
    const mondayPeak = result.hours.find((h) => h.dayOfWeek === 1 && h.hour === 19);
    expect(mondayPeak?.busynessScore).toBe(60);
  });

  it("excludes closed hours (intensity_nr 999) rather than treating them as 0% busy", () => {
    const mondayNoon = result.hours.find((h) => h.dayOfWeek === 1 && h.hour === 12);
    expect(mondayNoon).toBeUndefined();
  });

  it("includes a real quiet-but-open hour with its actual score", () => {
    const mondayAt5pm = result.hours.find((h) => h.dayOfWeek === 1 && h.hour === 17);
    expect(mondayAt5pm?.busynessScore).toBe(30);
  });

  it("produces entries for all seven days", () => {
    const distinctDays = new Set(result.hours.map((h) => h.dayOfWeek));
    expect(distinctDays.size).toBe(7);
  });

  it("returns an empty hours array when analysis is missing", () => {
    expect(parseBestTimeForecast({ status: "OK" })).toEqual({ venueId: "", hours: [] });
  });
});
