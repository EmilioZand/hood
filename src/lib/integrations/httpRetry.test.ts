import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "./httpRetry";

function jsonResponse(status: number, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({}), { status, headers });
}

describe("fetchWithRetry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns immediately on a successful response, without sleeping", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200));
    vi.stubGlobal("fetch", fetchMock);
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const res = await fetchWithRetry("https://example.com", {}, { sleepFn });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleepFn).not.toHaveBeenCalled();
  });

  it("does not retry a non-retryable 4xx error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(404));
    vi.stubGlobal("fetch", fetchMock);
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const res = await fetchWithRetry("https://example.com", {}, { sleepFn });

    expect(res.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 and eventually succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429))
      .mockResolvedValueOnce(jsonResponse(429))
      .mockResolvedValueOnce(jsonResponse(200));
    vi.stubGlobal("fetch", fetchMock);
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const res = await fetchWithRetry("https://example.com", {}, { sleepFn, baseDelayMs: 10 });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleepFn).toHaveBeenCalledTimes(2);
  });

  it("honors the Retry-After header when present", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { "retry-after": "2" }))
      .mockResolvedValueOnce(jsonResponse(200));
    vi.stubGlobal("fetch", fetchMock);
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    await fetchWithRetry("https://example.com", {}, { sleepFn, baseDelayMs: 10 });

    expect(sleepFn).toHaveBeenCalledWith(2000);
  });

  it("gives up after maxRetries and returns the last error response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(503));
    vi.stubGlobal("fetch", fetchMock);
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const res = await fetchWithRetry(
      "https://example.com",
      {},
      { sleepFn, baseDelayMs: 10, maxRetries: 2 },
    );

    expect(res.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("uses exponential backoff between retries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429))
      .mockResolvedValueOnce(jsonResponse(429))
      .mockResolvedValueOnce(jsonResponse(200));
    vi.stubGlobal("fetch", fetchMock);
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    await fetchWithRetry("https://example.com", {}, { sleepFn, baseDelayMs: 100 });

    expect(sleepFn).toHaveBeenNthCalledWith(1, 100);
    expect(sleepFn).toHaveBeenNthCalledWith(2, 200);
  });
});
