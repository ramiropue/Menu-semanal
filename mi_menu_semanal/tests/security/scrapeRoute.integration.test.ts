/**
 * tests/security/scrapeRoute.integration.test.ts
 *
 * Integration tests for /api/scrape POST handler.
 * Tests import the real route handler and mock global.fetch to verify
 * actual behavior under different env/network scenarios.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Helpers ────────────────────────────────────────────────────────────────

function setEnv(key: string, value: string | undefined) {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) {
    delete env[key];
  } else {
    env[key] = value;
  }
}

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeResponse(
  status: number,
  headers: Record<string, string>,
  body?: string
): Response {
  const res = new Response(body ?? "", {
    status,
    headers,
  });
  return res;
}

function makeStreamingResponse(
  status: number,
  headers: Record<string, string>,
  chunks: Uint8Array[],
  hangAfter?: number
): Response {
  let chunkIndex = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (hangAfter !== undefined && chunkIndex >= hangAfter) {
        // Never resolve — simulates a server that sends headers but hangs
        return new Promise(() => {});
      }
      if (chunkIndex < chunks.length) {
        controller.enqueue(chunks[chunkIndex++]);
      } else {
        controller.close();
      }
    },
  });
  return new Response(stream, { status, headers });
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe("scrape route — integration tests", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    // Clear relevant env vars
    setEnv("SCRAPE_ENABLED", undefined);
    setEnv("NODE_ENV", undefined);
    setEnv("GEMINI_API_KEY", undefined);
    setEnv("SCRAPE_FETCH_TIMEOUT_MS", undefined);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  async function loadRoute() {
    const mod = await import("../../app/api/scrape/route");
    return mod.POST;
  }

  // ─── Kill switch & production tests ─────────────────────────────────

  it("returns 503 when SCRAPE_ENABLED is absent", async () => {
    const POST = await loadRoute();
    const res = await POST(makeRequest({ url: "https://example.com" }));
    expect(res.status).toBe(503);
  });

  it("returns 503 when SCRAPE_ENABLED=false", async () => {
    setEnv("SCRAPE_ENABLED", "false");
    const POST = await loadRoute();
    const res = await POST(makeRequest({ url: "https://example.com" }));
    expect(res.status).toBe(503);
  });

  it("returns 503 in production even with SCRAPE_ENABLED=true", async () => {
    setEnv("SCRAPE_ENABLED", "true");
    setEnv("NODE_ENV", "production");
    const POST = await loadRoute();
    const res = await POST(makeRequest({ url: "https://example.com" }));
    expect(res.status).toBe(503);
  });

  it("returns 503 when SCRAPE_ENABLED=TRUE (case-sensitive)", async () => {
    setEnv("SCRAPE_ENABLED", "TRUE");
    const POST = await loadRoute();
    const res = await POST(makeRequest({ url: "https://example.com" }));
    expect(res.status).toBe(503);
  });

  it("allows request when SCRAPE_ENABLED=true and not production", async () => {
    setEnv("SCRAPE_ENABLED", "true");
    setEnv("NODE_ENV", "development");
    // Will fail at GEMINI_API_KEY check, but NOT at kill switch
    const POST = await loadRoute();
    const res = await POST(makeRequest({ url: "https://example.com" }));
    // Should not be 503 — should reach SSRF or GEMINI check
    expect(res.status).not.toBe(503);
  });

  // ─── SSRF validation tests ─────────────────────────────────────────

  it("blocks private IP (127.0.0.1) before any fetch", async () => {
    setEnv("SCRAPE_ENABLED", "true");
    setEnv("NODE_ENV", "development");
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const POST = await loadRoute();
    const res = await POST(makeRequest({ url: "http://127.0.0.1/admin" }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks metadata endpoint (169.254.169.254) before any fetch", async () => {
    setEnv("SCRAPE_ENABLED", "true");
    setEnv("NODE_ENV", "development");
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const POST = await loadRoute();
    const res = await POST(
      makeRequest({ url: "http://169.254.169.254/latest/meta-data/" })
    );
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ─── Redirect to private IP tests ─────────────────────────────────

  it("blocks redirect from public to 127.0.0.1 — second URL never fetched", async () => {
    setEnv("SCRAPE_ENABLED", "true");
    setEnv("NODE_ENV", "development");
    setEnv("GEMINI_API_KEY", "test-key");

    const fetchCalls: string[] = [];
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      fetchCalls.push(url);

      if (url === "https://example.com/recipe") {
        return makeResponse(302, {
          location: "http://127.0.0.1/evil",
          "content-type": "text/html",
        });
      }
      // This should NEVER be reached
      return makeResponse(200, { "content-type": "text/html" }, "<html></html>");
    }) as unknown as typeof fetch;

    const POST = await loadRoute();
    const res = await POST(makeRequest({ url: "https://example.com/recipe" }));
    expect(res.status).toBe(400);
    // Verify second URL was NEVER fetched
    expect(fetchCalls).toEqual(["https://example.com/recipe"]);
    expect(fetchCalls).not.toContain("http://127.0.0.1/evil");
  });

  it("blocks redirect from public to 169.254.169.254", async () => {
    setEnv("SCRAPE_ENABLED", "true");
    setEnv("NODE_ENV", "development");
    setEnv("GEMINI_API_KEY", "test-key");

    const fetchCalls: string[] = [];
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      fetchCalls.push(url);

      if (url === "https://example.com/recipe") {
        return makeResponse(301, {
          location: "http://169.254.169.254/latest/meta-data/",
          "content-type": "text/html",
        });
      }
      return makeResponse(200, { "content-type": "text/html" }, "<html></html>");
    }) as unknown as typeof fetch;

    const POST = await loadRoute();
    const res = await POST(makeRequest({ url: "https://example.com/recipe" }));
    expect(res.status).toBe(400);
    expect(fetchCalls).not.toContain(
      "http://169.254.169.254/latest/meta-data/"
    );
  });

  // ─── Timeout: server sends headers but body never finishes ────────

  it("aborts when body never finishes (timeout)", async () => {
    setEnv("SCRAPE_ENABLED", "true");
    setEnv("NODE_ENV", "development");
    setEnv("GEMINI_API_KEY", "test-key");
    setEnv("SCRAPE_FETCH_TIMEOUT_MS", "100");

    globalThis.fetch = vi.fn(async () => {
      // Return a response whose body hangs after first chunk
      return makeStreamingResponse(
        200,
        { "content-type": "text/html" },
        [new TextEncoder().encode("<html>start...")],
        1 // hang after first chunk
      );
    }) as unknown as typeof fetch;

    const POST = await loadRoute();
    const res = await POST(makeRequest({ url: "https://example.com/recipe" }));
    // safeFetch times out, throws "SSRF blocked: Request timed out...", route returns 400
    expect(res.status).toBe(400);
  });

  // ─── Excessive bytes ──────────────────────────────────────────────

  it("cancels response when body exceeds byte limit", async () => {
    setEnv("SCRAPE_ENABLED", "true");
    setEnv("NODE_ENV", "development");
    setEnv("GEMINI_API_KEY", "test-key");

    // Create 3MB of data (over 2MB limit)
    const bigChunk = new Uint8Array(1024 * 1024); // 1MB
    bigChunk.fill(65); // 'A'

    let cancelCalled = false;
    globalThis.fetch = vi.fn(async () => {
      let chunkIndex = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (chunkIndex < 3) {
            controller.enqueue(new Uint8Array(bigChunk));
            chunkIndex++;
          } else {
            controller.close();
          }
        },
      });
      const response = new Response(stream, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
      // Spy on reader.cancel to verify safeFetch cancels the stream
      const bodyWithReader = response.body as unknown as {
        getReader: () => ReadableStreamDefaultReader<Uint8Array>;
      };
      const originalGetReader = bodyWithReader.getReader.bind(bodyWithReader);
      bodyWithReader.getReader = () => {
        const reader = originalGetReader();
        const originalCancel = reader.cancel.bind(reader);
        reader.cancel = async (reason) => {
          cancelCalled = true;
          return originalCancel(reason);
        };
        return reader;
      };
      return response;
    }) as unknown as typeof fetch;

    const POST = await loadRoute();
    const res = await POST(
      makeRequest({ url: "https://example.com/recipe" })
    );
    // safeFetch throws SSRF blocked: Response exceeds... → route returns 400
    expect(res.status).toBe(400);
    expect(cancelCalled).toBe(true);
  });

  // ─── Too many redirects ───────────────────────────────────────────

  it("blocks chain exceeding max redirects", async () => {
    setEnv("SCRAPE_ENABLED", "true");
    setEnv("NODE_ENV", "development");
    setEnv("GEMINI_API_KEY", "test-key");

    let redirectNum = 0;
    globalThis.fetch = vi.fn(async () => {
      redirectNum++;
      // Always redirect to another public URL
      return makeResponse(302, {
        location: `https://example.com/redirect/${redirectNum}`,
        "content-type": "text/html",
      });
    }) as unknown as typeof fetch;

    const POST = await loadRoute();
    const res = await POST(
      makeRequest({ url: "https://example.com/start" })
    );
    // safeFetch throws SSRF blocked: Too many redirects... → route returns 400
    expect(res.status).toBe(400);
    expect(redirectNum).toBeLessThanOrEqual(7);
  });

  // ─── Content-Type validation ──────────────────────────────────────

  it("blocks response with disallowed Content-Type", async () => {
    setEnv("SCRAPE_ENABLED", "true");
    setEnv("NODE_ENV", "development");
    setEnv("GEMINI_API_KEY", "test-key");

    globalThis.fetch = vi.fn(async () => {
      return makeResponse(
        200,
        { "content-type": "application/octet-stream" },
        "binary data"
      );
    }) as unknown as typeof fetch;

    const POST = await loadRoute();
    const res = await POST(
      makeRequest({ url: "https://example.com/recipe" })
    );
    // safeFetch rejects bad content-type → route returns 400
    expect(res.status).toBe(400);
  });

  it("blocks response with missing Content-Type", async () => {
    setEnv("SCRAPE_ENABLED", "true");
    setEnv("NODE_ENV", "development");
    setEnv("GEMINI_API_KEY", "test-key");

    globalThis.fetch = vi.fn(async () => {
      return makeResponse(200, {}, "no content type");
    }) as unknown as typeof fetch;

    const POST = await loadRoute();
    const res = await POST(
      makeRequest({ url: "https://example.com/recipe" })
    );
    // Empty content-type → mimeType="" → not in allowedContentTypes → route returns 400
    expect(res.status).toBe(400);
  });

  // ─── Regression: redirect:follow must fail ─────────────────────────

  it("never uses redirect:follow in any fetch call", async () => {
    setEnv("SCRAPE_ENABLED", "true");
    setEnv("NODE_ENV", "development");
    setEnv("GEMINI_API_KEY", "test-key");

    const fetchOptions: RequestInit[] = [];
    globalThis.fetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (init) fetchOptions.push(init);
      return makeResponse(200, { "content-type": "text/html" }, "<html><body>recipe</body></html>");
    }) as unknown as typeof fetch;

    const POST = await loadRoute();
    await POST(makeRequest({ url: "https://example.com/recipe" }));

    // Verify NO fetch call used redirect:'follow'
    for (const opts of fetchOptions) {
      expect(opts.redirect).not.toBe("follow");
    }
  });
});
