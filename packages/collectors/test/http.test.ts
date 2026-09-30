import { describe, expect, it, vi } from "vitest";

import { HttpError, createHttpClient } from "../src/http.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("collectors: http client", () => {
  it("returns parsed JSON on success", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const client = createHttpClient({ userAgent: "test-agent", minIntervalMs: 0, fetchFn });
    await expect(client.getJson("https://example.com")).resolves.toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({ headers: expect.objectContaining({ "User-Agent": "test-agent" }) }),
    );
  });

  it("retries on 429 and succeeds once the response is OK", async () => {
    vi.useFakeTimers();
    try {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({}, 429))
        .mockResolvedValueOnce(jsonResponse({ ok: true }));
      const client = createHttpClient({ userAgent: "test-agent", minIntervalMs: 0, fetchFn, maxRetries: 2 });
      const resultPromise = client.getJson("https://example.com");
      await vi.runAllTimersAsync();
      await expect(resultPromise).resolves.toEqual({ ok: true });
      expect(fetchFn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws HttpError without retrying on a non-retryable 4xx", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, 404));
    const client = createHttpClient({ userAgent: "test-agent", minIntervalMs: 0, fetchFn });
    await expect(client.getJson("https://example.com")).rejects.toThrow(HttpError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxRetries on persistent 5xx errors", async () => {
    vi.useFakeTimers();
    try {
      const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, 503));
      const client = createHttpClient({ userAgent: "test-agent", minIntervalMs: 0, fetchFn, maxRetries: 2 });
      const assertion = expect(client.getJson("https://example.com")).rejects.toThrow(HttpError);
      await vi.runAllTimersAsync();
      await assertion;
      expect(fetchFn).toHaveBeenCalledTimes(3); // initial + 2 retries
    } finally {
      vi.useRealTimers();
    }
  });
});
