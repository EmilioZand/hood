import type { OpeningPeriod } from "@/lib/integrations/googlePlaces";

export type OpeningHours = { periods: OpeningPeriod[] } | null;

// All restaurants are in the Bay Area — compute against Pacific time regardless of
// where this code runs (server, or a viewer's browser in another timezone).
const RESTAURANT_TIMEZONE = "America/Los_Angeles";
const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function toPacificDayAndMinutes(date: Date): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: RESTAURANT_TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const weekday = parts.find((p) => p.type === "weekday")!.value;
  let hour = Number(parts.find((p) => p.type === "hour")!.value);
  const minute = Number(parts.find((p) => p.type === "minute")!.value);
  if (hour === 24) hour = 0; // some locales render midnight as "24:00"

  return { day: WEEKDAY_TO_INDEX[weekday], minutes: hour * 60 + minute };
}

/**
 * Whether a restaurant is open at `now`, based on its cached weekly schedule.
 * Returns null when we have no schedule data (distinct from a confident "closed").
 */
export function isOpenNow(openingHours: OpeningHours, now: Date = new Date()): boolean | null {
  if (!openingHours || !openingHours.periods || openingHours.periods.length === 0) return null;

  const { day: nowDay, minutes: nowMinutes } = toPacificDayAndMinutes(now);

  for (const period of openingHours.periods) {
    const openMinutes = period.open.hour * 60 + period.open.minute;
    const closeMinutes = period.close.hour * 60 + period.close.minute;
    const { day: openDay } = period.open;
    const { day: closeDay } = period.close;

    if (openDay === closeDay && closeMinutes > openMinutes) {
      if (nowDay === openDay && nowMinutes >= openMinutes && nowMinutes < closeMinutes) return true;
    } else {
      // Overnight period spanning into the next day.
      if (nowDay === openDay && nowMinutes >= openMinutes) return true;
      if (nowDay === closeDay && nowMinutes < closeMinutes) return true;
    }
  }

  return false;
}
