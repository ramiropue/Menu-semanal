/**
 * lib/security/ssrfValidator.ts
 *
 * URL validation for server-side requests.
 *
 * ## What this module provides:
 * - Protocol allowlist (http/https only)
 * - IP range blocking (private, loopback, link-local, multicast, metadata)
 * - IPv4/IPv6 including mapped/hex-normalized forms
 * - Localhost variant blocking
 * - Per-hop redirect validation with manual redirect handling
 * - Streaming body download with byte counting and cancellation
 * - Single deadline timeout covering all redirects + connection + body read
 *
 * ## What this module does NOT provide (SSRF gaps):
 * - DNS rebinding protection: hostnames are validated as strings, but the
 *   runtime `fetch()` performs its own DNS resolution. A hostname that
 *   resolves to a private IP WILL bypass this validation.
 * - `validateResolvedIp()` is exported but NOT used by `safeFetch()` because
 *   Node.js `fetch()` does not expose a hook to inspect the resolved IP
 *   before connecting.
 *
 * ## Enabling in production requires one of:
 * 1. **Domain allowlist** — restrict to known recipe domains only.
 * 2. **Egress proxy** — route outbound requests through a proxy that
 *    validates resolved IPs before forwarding.
 * 3. **Undici custom connector** — use `undici.Agent` with a `connect`
 *    callback that resolves DNS, validates the IP with `validateResolvedIp()`,
 *    and pins the connection to that IP while preserving SNI/TLS via the
 *    `servername` option. Example (not implemented):
 *    ```
 *    const agent = new Agent({
 *      connect(opts, cb) {
 *        dns.lookup(opts.hostname, (err, ip) => {
 *          if (err) return cb(err, null);
 *          if (!validateResolvedIp(ip).valid)
 *            return cb(new Error('Private IP'), null);
 *          opts.hostname = ip;
 *          opts.servername = opts.servername || originalHostname;
 *          tls.connect(opts, cb);
 *        });
 *      }
 *    });
 *    ```
 *
 * Until one of these is implemented, `/api/scrape` MUST remain disabled
 * in production via `SCRAPE_ENABLED` + `NODE_ENV` checks.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SsrfValidationResult {
  valid: boolean;
  reason?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_CONTENT_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "application/xml",
  "text/xml",
  "application/json",
  "text/plain",
];

// Optional: domain allowlist. When non-empty, only these domains are permitted.
const DOMAIN_ALLOWLIST: string[] = [];

// ─── IP Validation ────────────────────────────────────────────────────────────

/**
 * Parse an IPv4 address string into 4 octets, or null if invalid.
 */
function parseIPv4(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;

  const octets: number[] = [];
  for (const part of parts) {
    if (!/^(?:0|[1-9]\d{0,2})$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    octets.push(n);
  }
  return octets;
}

/**
 * Check if an IPv4 address (as 4 octets) is private/reserved.
 */
function isPrivateIPv4(octets: number[]): boolean {
  const [a, b] = octets;

  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0 && octets[2] === 0) return true;
  if (a === 192 && b === 0 && octets[2] === 2) return true;
  if (a === 192 && b === 88 && octets[2] === 99) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && octets[2] === 100) return true;
  if (a === 203 && b === 0 && octets[2] === 113) return true;
  if (a >= 224 && a <= 239) return true;
  if (a >= 240) return true;

  return false;
}

/**
 * Check if an IPv6 address string is private/reserved.
 */
function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();

  if (lower === "::" || lower === "::0") return true;
  if (lower === "::1") return true;

  const v4MappedMatch = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4MappedMatch) {
    const octets = parseIPv4(v4MappedMatch[1]);
    if (octets && isPrivateIPv4(octets)) return true;
  }

  const v4MappedHexMatch = lower.match(
    /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/
  );
  if (v4MappedHexMatch) {
    const hi = parseInt(v4MappedHexMatch[1], 16);
    const lo = parseInt(v4MappedHexMatch[2], 16);
    const octets = [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff];
    if (isPrivateIPv4(octets)) return true;
  }

  const v4CompatMatch = lower.match(/^::(\d+\.\d+\.\d+\.\d+)$/);
  if (v4CompatMatch) {
    const octets = parseIPv4(v4CompatMatch[1]);
    if (octets && isPrivateIPv4(octets)) return true;
  }

  const v4CompatHexMatch = lower.match(
    /^::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/
  );
  if (v4CompatHexMatch) {
    const hi = parseInt(v4CompatHexMatch[1], 16);
    const lo = parseInt(v4CompatHexMatch[2], 16);
    const octets = [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff];
    if (isPrivateIPv4(octets)) return true;
  }

  if (/^f[cd]/.test(lower)) return true;
  if (/^fe[89ab]/.test(lower)) return true;
  if (lower.startsWith("ff")) return true;
  if (lower.startsWith("100::")) return true;
  if (lower.startsWith("2001:db8:")) return true;

  return false;
}

function checkIpHostname(hostname: string): {
  isIp: boolean;
  isPrivate: boolean;
} {
  const cleanHost = hostname.replace(/^\[|\]$/g, "");

  const v4 = parseIPv4(cleanHost);
  if (v4) {
    return { isIp: true, isPrivate: isPrivateIPv4(v4) };
  }

  if (cleanHost.includes(":")) {
    return { isIp: true, isPrivate: isPrivateIPv6(cleanHost) };
  }

  return { isIp: false, isPrivate: false };
}

// ─── URL Validation ───────────────────────────────────────────────────────────

export function validateUrl(urlString: string): SsrfValidationResult {
  if (!urlString || !urlString.trim()) {
    return { valid: false, reason: "URL is empty" };
  }

  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { valid: false, reason: "URL is malformed" };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, reason: "URL contains credentials" };
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return {
      valid: false,
      reason: `Protocol '${parsed.protocol}' is not allowed`,
    };
  }

  const hostname = parsed.hostname;
  if (!hostname) {
    return { valid: false, reason: "URL has no hostname" };
  }

  if (hostname.endsWith(".")) {
    return {
      valid: false,
      reason: "Hostname with trailing dot is not allowed",
    };
  }

  const lowerHost = hostname.toLowerCase();
  if (
    lowerHost === "localhost" ||
    lowerHost === "localhost.localdomain" ||
    lowerHost.endsWith(".localhost")
  ) {
    return { valid: false, reason: "Localhost is not allowed" };
  }

  const ipCheck = checkIpHostname(hostname);
  if (ipCheck.isIp && ipCheck.isPrivate) {
    return { valid: false, reason: "Private/reserved IP address is not allowed" };
  }

  if (DOMAIN_ALLOWLIST.length > 0) {
    const matchesAllowlist = DOMAIN_ALLOWLIST.some(
      (d) => lowerHost === d || lowerHost.endsWith("." + d)
    );
    if (!matchesAllowlist) {
      return { valid: false, reason: "Domain is not in the allowlist" };
    }
  }

  return { valid: true };
}

/**
 * Validate a resolved IP address (from DNS) before connecting.
 * Exported for future use with a custom Undici connector.
 * NOT currently used by safeFetch — see module-level docs for rationale.
 */
export function validateResolvedIp(ip: string): SsrfValidationResult {
  const v4 = parseIPv4(ip);
  if (v4) {
    if (isPrivateIPv4(v4)) {
      return { valid: false, reason: "Resolved IP is private/reserved" };
    }
    return { valid: true };
  }

  if (ip.includes(":")) {
    if (isPrivateIPv6(ip)) {
      return { valid: false, reason: "Resolved IPv6 is private/reserved" };
    }
    return { valid: true };
  }

  return { valid: false, reason: "IP format not recognized" };
}

// ─── Safe Fetch ───────────────────────────────────────────────────────────────

export interface SafeFetchOptions {
  maxRedirects?: number;
  timeoutMs?: number;
  maxBytes?: number;
  allowedContentTypes?: string[];
}

/**
 * Fetch a URL with URL-level SSRF protections.
 *
 * This is NOT a complete SSRF defense — see module-level docs.
 * It provides:
 * - Per-hop redirect URL validation (redirect: "manual")
 * - Single deadline AbortController covering ALL redirects + connection + body
 * - Streaming byte counting with immediate cancellation
 * - Content-Type validation
 * - Redirect body consumption/cancellation before following next hop
 *
 * The timer is set ONCE at the start and cleared ONLY in the outermost
 * finally block, ensuring the deadline covers the entire operation.
 */
export async function safeFetch(
  urlString: string,
  options: SafeFetchOptions = {}
): Promise<{ body: string; finalUrl: string; contentType: string }> {
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_RESPONSE_BYTES;
  const allowedContentTypes =
    options.allowedContentTypes ?? ALLOWED_CONTENT_TYPES;

  let currentUrl = urlString;
  let redirectCount = 0;

  // Validate initial URL
  const initial = validateUrl(currentUrl);
  if (!initial.valid) {
    throw new Error(`SSRF blocked: ${initial.reason}`);
  }

  // Single deadline covering ALL redirects, connections, and body reads
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    while (true) {
      let response: Response;
      try {
        response = await fetch(currentUrl, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; MenuSemanal/2.0; +https://github.com/ramiropue/Menu-semanal)",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3",
          },
        });
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new Error(
            `SSRF blocked: Request timed out after ${timeoutMs}ms`
          );
        }
        throw error;
      }

      // Handle redirects
      if (
        response.status >= 300 &&
        response.status < 400 &&
        response.headers.has("location")
      ) {
        // Cancel the redirect response body before following
        if (response.body) {
          try {
            await response.body.cancel();
          } catch {
            // Ignore cancel errors
          }
        }

        redirectCount++;
        if (redirectCount > maxRedirects) {
          throw new Error(
            `SSRF blocked: Too many redirects (max ${maxRedirects})`
          );
        }

        const location = response.headers.get("location")!;
        let nextUrl: string;
        try {
          nextUrl = new URL(location, currentUrl).href;
        } catch {
          throw new Error("SSRF blocked: Invalid redirect URL");
        }

        // Validate each redirect destination BEFORE following
        const redirectCheck = validateUrl(nextUrl);
        if (!redirectCheck.valid) {
          throw new Error(
            `SSRF blocked at redirect: ${redirectCheck.reason}`
          );
        }

        currentUrl = nextUrl;
        continue;
      }

      // Check Content-Type
      const contentType = response.headers.get("content-type") || "";
      const mimeType = contentType.split(";")[0].trim().toLowerCase();
      if (
        allowedContentTypes.length > 0 &&
        !allowedContentTypes.includes(mimeType)
      ) {
        // Cancel body before throwing
        if (response.body) {
          try {
            await response.body.cancel();
          } catch {
            // Ignore
          }
        }
        throw new Error(
          `SSRF blocked: Content-Type '${mimeType}' is not allowed`
        );
      }

      // Read body with streaming byte counting
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("SSRF blocked: No response body");
      }

      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      const readChunk = async () => {
        if (controller.signal.aborted) {
          throw new Error(
            `SSRF blocked: Request timed out after ${timeoutMs}ms`
          );
        }
        return new Promise<ReadableStreamReadResult<Uint8Array>>(
          (resolve, reject) => {
            const onAbort = () => {
              reader.cancel().catch(() => {});
              reject(
                new Error(
                  `SSRF blocked: Request timed out after ${timeoutMs}ms`
                )
              );
            };
            controller.signal.addEventListener("abort", onAbort, { once: true });
            reader.read().then(
              (result) => {
                controller.signal.removeEventListener("abort", onAbort);
                resolve(result);
              },
              (err) => {
                controller.signal.removeEventListener("abort", onAbort);
                reject(err);
              }
            );
          }
        );
      };

      try {
        while (true) {
          const { done, value } = await readChunk();
          if (done) break;

          totalBytes += value.byteLength;
          if (totalBytes > maxBytes) {
            await reader.cancel();
            throw new Error(
              `SSRF blocked: Response exceeds ${maxBytes} bytes limit`
            );
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }

      const decoder = new TextDecoder("utf-8", { fatal: false });
      const body = decoder.decode(
        chunks.reduce((acc, chunk) => {
          const merged = new Uint8Array(acc.length + chunk.length);
          merged.set(acc);
          merged.set(chunk, acc.length);
          return merged;
        }, new Uint8Array(0))
      );

      return { body, finalUrl: currentUrl, contentType: mimeType };
    }
  } finally {
    // Timer is cleared ONLY here — covers all redirects + connection + body
    clearTimeout(timer);
  }
}

// ─── Exports for testing ──────────────────────────────────────────────────────
export {
  parseIPv4,
  isPrivateIPv4,
  isPrivateIPv6,
  checkIpHostname,
  MAX_REDIRECTS,
  FETCH_TIMEOUT_MS,
  MAX_RESPONSE_BYTES,
};
