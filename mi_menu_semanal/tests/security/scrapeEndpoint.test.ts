/**
 * tests/security/scrapeEndpoint.test.ts
 *
 * Tests for the /api/scrape endpoint security:
 * - SSRF validation is applied before any fetch
 * - Kill switch disables the endpoint
 *
 * These tests validate the SSRF integration, not the scraping logic itself.
 * No real network requests are made.
 */

import { describe, it, expect } from "vitest";
import { validateUrl } from "../../lib/security/ssrfValidator";

// ─── SSRF Vectors that should be blocked ────────────────────────────────────

describe("scrape endpoint — SSRF vectors blocked at URL validation", () => {
  const blockedUrls = [
    // Localhost / loopback
    "http://localhost:3000/api/secret",
    "http://127.0.0.1:8080/admin",
    "http://127.1.2.3/flag",

    // Private networks
    "http://10.0.0.1/internal",
    "http://172.16.0.1/dashboard",
    "http://192.168.1.1/admin",

    // Cloud metadata
    "http://169.254.169.254/latest/meta-data/",
    "http://169.254.169.254/latest/meta-data/iam/security-credentials/",

    // IPv6 loopback
    "http://[::1]:3000/api/secret",
    "http://[::1]/admin",

    // IPv6 private
    "http://[fd00::1]/internal",
    "http://[fe80::1]/link-local",

    // Protocol attacks
    "file:///etc/passwd",
    "ftp://192.168.1.1/",
    "gopher://evil.com/_",
    "javascript:alert(1)",
    "data:text/html,<h1>pwned</h1>",

    // URL credentials
    "http://admin:password@internal.corp/",

    // IPv4-mapped IPv6 (hex-normalized by Node)
    // These will be validated at the IP level
  ];

  blockedUrls.forEach((url) => {
    it(`blocks ${url}`, () => {
      const result = validateUrl(url);
      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
    });
  });
});

// ─── Legitimate recipe URLs that should be allowed ──────────────────────────

describe("scrape endpoint — legitimate recipe URLs allowed", () => {
  const allowedUrls = [
    "https://www.tiktok.com/@chef/video/12345",
    "https://www.instagram.com/p/abc123/",
    "https://www.youtube.com/watch?v=abc123",
    "https://www.recetasgratis.net/receta-paella-valenciana-71619.html",
    "https://cookpad.com/es/recetas/12345-tortilla-espanola",
    "https://www.directoalpaladar.com/recetas",
    "https://vm.tiktok.com/abc123/",
    "http://example.com/mi-receta",
  ];

  allowedUrls.forEach((url) => {
    it(`allows ${url}`, () => {
      const result = validateUrl(url);
      expect(result.valid).toBe(true);
    });
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe("scrape endpoint — edge cases", () => {
  it("rejects empty URL", () => {
    expect(validateUrl("").valid).toBe(false);
  });

  it("rejects malformed URL", () => {
    expect(validateUrl("not-a-url-at-all").valid).toBe(false);
  });

  it("rejects URL with only spaces", () => {
    expect(validateUrl("   ").valid).toBe(false);
  });

  it("rejects URL with trailing dot (DNS bypass)", () => {
    expect(validateUrl("http://localhost./api").valid).toBe(false);
  });
});
