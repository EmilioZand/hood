const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type FetchWithRetryOptions = {
  maxRetries?: number;
  baseDelayMs?: number;
  sleepFn?: (ms: number) => Promise<void>;
};

/**
 * Wraps fetch with exponential backoff on 429/5xx, honoring Retry-After when present.
 * Used by every external API client here (Google Places, Yelp, and future BestTime/scraper
 * calls) since rate limits are the norm, not the exception, once we're calling per-restaurant.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const maxRetries = options.maxRetries ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const sleepFn = options.sleepFn ?? defaultSleep;

  let attempt = 0;
  while (true) {
    const res = await fetch(url, init);

    if (!RETRYABLE_STATUSES.has(res.status) || attempt >= maxRetries) {
      return res;
    }

    const retryAfter = res.headers.get("retry-after");
    const delay = retryAfter ? Number(retryAfter) * 1000 : baseDelayMs * 2 ** attempt;
    await sleepFn(delay);
    attempt++;
  }
}
