import { fetchWithRetry } from "./httpRetry";

export type BusynessHour = {
  /** 0 = Sunday, matching our schema/JS Date.getDay() convention (BestTime uses 0 = Monday). */
  dayOfWeek: number;
  hour: number;
  busynessScore: number;
};

export type BestTimeForecast = {
  venueId: string;
  hours: BusynessHour[];
};

type BestTimeAnalysisDay = {
  day_info?: { day_int?: number };
  // hour_analysis and day_raw pair up by ARRAY POSITION, not by the "hour" value —
  // BestTime orders both starting at 6am and wrapping around to 5am, not 0-23.
  hour_analysis?: Array<{ hour: number; intensity_nr: number }>;
  day_raw?: number[];
};

type BestTimeForecastResponse = {
  status: string;
  venue_info?: { venue_id?: string };
  analysis?: BestTimeAnalysisDay[];
};

function toOurDayOfWeek(bestTimeDayInt: number): number {
  return (bestTimeDayInt + 1) % 7;
}

/** Pure — no network, easy to unit test against a saved fixture. */
export function parseBestTimeForecast(data: BestTimeForecastResponse): BestTimeForecast {
  const hours: BusynessHour[] = [];

  for (const day of data.analysis ?? []) {
    const dayInt = day.day_info?.day_int;
    if (dayInt == null) continue;
    const dayOfWeek = toOurDayOfWeek(dayInt);

    const hourAnalysis = day.hour_analysis ?? [];
    const dayRaw = day.day_raw ?? [];

    hourAnalysis.forEach((h, i) => {
      if (h.intensity_nr === 999) return; // closed — not "0% busy", just no data for this hour
      const busynessScore = dayRaw[i];
      if (busynessScore == null) return;
      hours.push({ dayOfWeek, hour: h.hour, busynessScore });
    });
  }

  return { venueId: data.venue_info?.venue_id ?? "", hours };
}

/** Creates (or reuses, per BestTime's own dedup) a forecast for a venue. Consumes a forecast credit. */
export async function createForecast(
  venueName: string,
  venueAddress: string,
  apiKey: string,
): Promise<BestTimeForecast> {
  const params = new URLSearchParams({
    api_key_private: apiKey,
    venue_name: venueName,
    venue_address: venueAddress,
  });

  const res = await fetchWithRetry(`https://besttime.app/api/v1/forecasts?${params}`, {
    method: "POST",
  });

  const data = (await res.json()) as BestTimeForecastResponse;
  if (!res.ok || data.status !== "OK") {
    throw new Error(`BestTime forecast failed: ${res.status} ${JSON.stringify(data)}`);
  }

  return parseBestTimeForecast(data);
}
