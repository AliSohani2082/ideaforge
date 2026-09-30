export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
  }
}

export interface HttpClientOptions {
  readonly userAgent: string;
  /** Politeness delay between requests through this client — rate limits are part of the interface. */
  readonly minIntervalMs: number;
  readonly maxRetries?: number;
  readonly headers?: Readonly<Record<string, string>>;
  /** Injectable for tests; defaults to the global fetch. */
  readonly fetchFn?: typeof fetch;
}

export interface HttpClient {
  getJson(url: string): Promise<unknown>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A small retry/backoff/rate-limited GET-JSON client shared by every collector. */
export function createHttpClient(options: HttpClientOptions): HttpClient {
  const fetchFn = options.fetchFn ?? fetch;
  const maxRetries = options.maxRetries ?? 3;
  let lastRequestAt = 0;

  async function throttle(): Promise<void> {
    const wait = options.minIntervalMs - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
  }

  return {
    async getJson(url: string): Promise<unknown> {
      let attempt = 0;
      for (;;) {
        await throttle();
        const res = await fetchFn(url, {
          headers: { "User-Agent": options.userAgent, ...options.headers },
        });
        if (res.ok) return res.json();
        const retryable = res.status === 429 || res.status >= 500;
        if (retryable && attempt < maxRetries) {
          attempt += 1;
          await sleep(Math.min(2 ** attempt * 500, 8000));
          continue;
        }
        throw new HttpError(res.status, url);
      }
    },
  };
}
