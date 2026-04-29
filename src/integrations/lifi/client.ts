/**
 * LI.FI HTTP client.
 *
 * Safety rules:
 * - LI.FI does not require an API key; never attach an Authorization header.
 * - Retry only on transient failures (5xx and 429). 4xx must never be retried.
 * - Response content is display-only and untrusted.
 * - Requests are issued sequentially.
 */

import { getLifiConfig } from "./config.js";

const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1_500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  return BASE_BACKOFF_MS * attempt;
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

async function readBody(res: Response): Promise<string> {
  return res.text().catch(() => "(unreadable body)");
}

export class LifiApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    public readonly body: string,
  ) {
    super(`LI.FI API error ${status} for ${path}: ${body}`);
    this.name = "LifiApiError";
  }
}

export async function lifiGet<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<T> {
  const { baseUrl } = getLifiConfig();
  const url = new URL(`${baseUrl}${path}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(backoffMs(attempt));
    }

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      continue;
    }

    if (res.ok) {
      return res.json() as Promise<T>;
    }

    const body = await readBody(res);

    if (isRetryable(res.status)) {
      lastError = new LifiApiError(res.status, path, body);
      continue;
    }

    throw new LifiApiError(res.status, path, body);
  }

  throw lastError ?? new Error(`LI.FI request failed for ${path}`);
}

export async function lifiPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const { baseUrl } = getLifiConfig();
  const url = `${baseUrl}${path}`;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(backoffMs(attempt));
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      continue;
    }

    if (res.ok) {
      return res.json() as Promise<T>;
    }

    const responseBody = await readBody(res);

    if (isRetryable(res.status)) {
      lastError = new LifiApiError(res.status, path, responseBody);
      continue;
    }

    throw new LifiApiError(res.status, path, responseBody);
  }

  throw lastError ?? new Error(`LI.FI request failed for ${path}`);
}
