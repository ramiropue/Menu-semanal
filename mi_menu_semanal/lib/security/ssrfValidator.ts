/**
 * lib/security/ssrfValidator.ts
 *
 * Validates URLs before server-side fetching to prevent SSRF attacks.
 * Blocks private IPs, loopback, link-local, multicast, metadata endpoints,
 * and non-HTTP(S) protocols.
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
  // Block octal (0-prefixed), hex (0x-prefixed), and decimal-encoded IPs
  const parts = ip.split(".");
  if (parts.length !== 4) return null;

  const octets: number[] = [];
  for (const part of parts) {
    // Reject empty parts, leading zeros (octal), hex, or non-numeric
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

  // 0.0.0.0/8 — "This host on this network"
  if (a === 0) return true;
  // 10.0.0.0/8 — Private
  if (a === 10) return true;
  // 100.64.0.0/10 — Shared address space (CGN)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 127.0.0.0/8 — Loopback
  if (a === 127) return true;
  // 169.254.0.0/16 — Link-local
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 — Private
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24 — IETF Protocol Assignments
  if (a === 192 && b === 0 && octets[2] === 0) return true;
  // 192.0.2.0/24 — TEST-NET-1
  if (a === 192 && b === 0 && octets[2] === 2) return true;
  // 192.88.99.0/24 — Deprecated 6to4 relay anycast
  if (a === 192 && b === 88 && octets[2] === 99) return true;
  // 192.168.0.0/16 — Private
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15 — Benchmark testing
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 198.51.100.0/24 — TEST-NET-2
  if (a === 198 && b === 51 && octets[2] === 100) return true;
  // 203.0.113.0/24 — TEST-NET-3
  if (a === 203 && b === 0 && octets[2] === 113) return true;
  // 224.0.0.0/4 — Multicast
  if (a >= 224 && a <= 239) return true;
  // 240.0.0.0/4 — Reserved for future use
  if (a >= 240) return true;

  return false;
}

/**
 * Check if an IPv6 address string is private/reserved.
 * Also handles IPv4-mapped IPv6 (::ffff:x.x.x.x) and IPv4-compatible IPv6 (::x.x.x.x).
 */
function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();

  // Unspecified address
  if (lower === "::" || lower === "::0") return true;
  // Loopback
  if (lower === "::1") return true;

  // IPv4-mapped IPv6: ::ffff:x.x.x.x (dotted-decimal form)
  const v4MappedMatch = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4MappedMatch) {
    const octets = parseIPv4(v4MappedMatch[1]);
    if (octets && isPrivateIPv4(octets)) return true;
  }

  // IPv4-mapped IPv6 in hex form: ::ffff:HHHH:HHHH
  // Node.js URL parser normalizes ::ffff:127.0.0.1 → ::ffff:7f00:1
  const v4MappedHexMatch = lower.match(
    /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/
  );
  if (v4MappedHexMatch) {
    const hi = parseInt(v4MappedHexMatch[1], 16);
    const lo = parseInt(v4MappedHexMatch[2], 16);
    const octets = [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff];
    if (isPrivateIPv4(octets)) return true;
  }

  // IPv4-compatible IPv6: ::x.x.x.x
  const v4CompatMatch = lower.match(/^::(\d+\.\d+\.\d+\.\d+)$/);
  if (v4CompatMatch) {
    const octets = parseIPv4(v4CompatMatch[1]);
    if (octets && isPrivateIPv4(octets)) return true;
  }

  // IPv4-compatible IPv6 in hex form: ::HHHH:HHHH
  const v4CompatHexMatch = lower.match(
    /^::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/
  );
  if (v4CompatHexMatch) {
    const hi = parseInt(v4CompatHexMatch[1], 16);
    const lo = parseInt(v4CompatHexMatch[2], 16);
    const octets = [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff];
    if (isPrivateIPv4(octets)) return true;
  }

  // fc00::/7 — Unique local address
  if (/^f[cd]/.test(lower)) return true;
  // fe80::/10 — Link-local
  if (/^fe[89ab]/.test(lower)) return true;
  // ff00::/8 — Multicast
  if (lower.startsWith("ff")) return true;
  // 100::  (deprecated 6to4, Teredo, etc.)
  if (lower.startsWith("100::")) return true;
  // 2001:db8::/32 — Documentation
  if (lower.startsWith("2001:db8:")) return true;

  return false;
}

/**
 * Check if a hostname string is an IP literal and if so, whether it's private.
 * Returns { isIp: true, isPrivate: true/false } or { isIp: false }.
 */
function checkIpHostname(hostname: string): {
  isIp: boolean;
  isPrivate: boolean;
} {
  // Strip brackets for IPv6 literals
  const cleanHost = hostname.replace(/^\[|\]$/g, "");

  // Check IPv4
  const v4 = parseIPv4(cleanHost);
  if (v4) {
    return { isIp: true, isPrivate: isPrivateIPv4(v4) };
  }

  // Check IPv6
  if (cleanHost.includes(":")) {
    return { isIp: true, isPrivate: isPrivateIPv6(cleanHost) };
  }

  return { isIp: false, isPrivate: false };
}

// ─── URL Validation ───────────────────────────────────────────────────────────

/**
 * Validate a URL for safety before making a server-side request.
 */
export function validateUrl(urlString: string): SsrfValidationResult {
  // Reject empty or whitespace-only
  if (!urlString || !urlString.trim()) {
    return { valid: false, reason: "URL is empty" };
  }

  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { valid: false, reason: "URL is malformed" };
  }

  // Block credentials in URL
  if (parsed.username || parsed.password) {
    return { valid: false, reason: "URL contains credentials" };
  }

  // Protocol check
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return {
      valid: false,
      reason: `Protocol '${parsed.protocol}' is not allowed`,
    };
  }

  // Hostname must exist
  const hostname = parsed.hostname;
  if (!hostname) {
    return { valid: false, reason: "URL has no hostname" };
  }

  // Block hostnames with trailing dot (DNS root) — potential bypass
  if (hostname.endsWith(".")) {
    return {
      valid: false,
      reason: "Hostname with trailing dot is not allowed",
    };
  }

  // Block localhost variants
  const lowerHost = hostname.toLowerCase();
  if (
    lowerHost === "localhost" ||
    lowerHost === "localhost.localdomain" ||
    lowerHost.endsWith(".localhost")
  ) {
    return { valid: false, reason: "Localhost is not allowed" };
  }

  // Check if hostname is a direct IP address
  const ipCheck = checkIpHostname(hostname);
  if (ipCheck.isIp && ipCheck.isPrivate) {
    return { valid: false, reason: "Private/reserved IP address is not allowed" };
  }

  // Domain allowlist (if configured)
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
 * Call this after DNS resolution to block DNS rebinding attacks.
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

/**
 * Configuration for safeFetch.
 */
export interface SafeFetchOptions {
  maxRedirects?: number;
  timeoutMs?: number;
  maxBytes?: number;
  allowedContentTypes?: string[];
}

/**
 * Fetch a URL with SSRF protections applied at each redirect hop.
 * Returns the response body as a string, truncated to maxBytes.
 *
 * Throws on any validation failure, timeout, or excessive size.
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

  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(currentUrl, {
        method: "GET",
        redirect: "manual", // Handle redirects manually to validate each hop
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
      clearTimeout(timer);
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(`SSRF blocked: Request timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }

    // Handle redirects
    if (
      response.status >= 300 &&
      response.status < 400 &&
      response.headers.has("location")
    ) {
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

      // Validate each redirect destination
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
      throw new Error(
        `SSRF blocked: Content-Type '${mimeType}' is not allowed`
      );
    }

    // Read body with size limit
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("SSRF blocked: No response body");
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          reader.cancel();
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
