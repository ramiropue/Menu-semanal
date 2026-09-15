/**
 * tests/security/ssrfValidator.test.ts
 *
 * Comprehensive test suite for SSRF validation.
 * All tests are purely local — no real network requests are made.
 */

import { describe, it, expect } from "vitest";
import {
  validateUrl,
  validateResolvedIp,
  parseIPv4,
  isPrivateIPv4,
  isPrivateIPv6,
  checkIpHostname,
} from "../../lib/security/ssrfValidator";

// ─── Protocol Validation ─────────────────────────────────────────────────────

describe("validateUrl — protocol", () => {
  it("allows http://", () => {
    expect(validateUrl("http://example.com")).toEqual({ valid: true });
  });

  it("allows https://", () => {
    expect(validateUrl("https://example.com/path")).toEqual({ valid: true });
  });

  it("blocks file://", () => {
    const r = validateUrl("file:///etc/passwd");
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("Protocol");
  });

  it("blocks ftp://", () => {
    const r = validateUrl("ftp://example.com/file");
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("Protocol");
  });

  it("blocks gopher://", () => {
    const r = validateUrl("gopher://evil.com");
    expect(r.valid).toBe(false);
  });

  it("blocks javascript:", () => {
    const r = validateUrl("javascript:alert(1)");
    expect(r.valid).toBe(false);
  });

  it("blocks data:", () => {
    const r = validateUrl("data:text/html,<h1>hi</h1>");
    expect(r.valid).toBe(false);
  });
});

// ─── Empty / Malformed URLs ──────────────────────────────────────────────────

describe("validateUrl — empty and malformed", () => {
  it("rejects empty string", () => {
    expect(validateUrl("").valid).toBe(false);
  });

  it("rejects whitespace-only string", () => {
    expect(validateUrl("   ").valid).toBe(false);
  });

  it("rejects nonsense string", () => {
    expect(validateUrl("not-a-url").valid).toBe(false);
  });

  it("treats http:///path as hostname 'path' (URL parser behavior)", () => {
    // Node's URL parser interprets http:///path as hostname='path'
    // This is a valid (non-IP) hostname, so it passes URL validation
    expect(validateUrl("http:///path").valid).toBe(true);
  });
});

// ─── URLs with Credentials ──────────────────────────────────────────────────

describe("validateUrl — credentials in URL", () => {
  it("blocks URL with username", () => {
    const r = validateUrl("http://admin@example.com");
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("credentials");
  });

  it("blocks URL with username:password", () => {
    const r = validateUrl("http://admin:secret@example.com");
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("credentials");
  });
});

// ─── Hostname with trailing dot ─────────────────────────────────────────────

describe("validateUrl — trailing dot bypass", () => {
  it("blocks hostname with trailing dot", () => {
    const r = validateUrl("http://localhost./path");
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("trailing dot");
  });

  it("blocks external hostname with trailing dot", () => {
    const r = validateUrl("http://example.com./path");
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("trailing dot");
  });
});

// ─── Localhost Variants ─────────────────────────────────────────────────────

describe("validateUrl — localhost", () => {
  it("blocks localhost", () => {
    expect(validateUrl("http://localhost").valid).toBe(false);
  });

  it("blocks localhost:3000", () => {
    expect(validateUrl("http://localhost:3000").valid).toBe(false);
  });

  it("blocks LOCALHOST (case-insensitive)", () => {
    expect(validateUrl("http://LOCALHOST").valid).toBe(false);
  });

  it("blocks localhost.localdomain", () => {
    expect(validateUrl("http://localhost.localdomain").valid).toBe(false);
  });

  it("blocks subdomain of localhost", () => {
    expect(validateUrl("http://evil.localhost").valid).toBe(false);
  });

  it("blocks 127.0.0.1", () => {
    expect(validateUrl("http://127.0.0.1").valid).toBe(false);
  });

  it("blocks 127.0.0.1:8080", () => {
    expect(validateUrl("http://127.0.0.1:8080/api").valid).toBe(false);
  });

  it("blocks 127.1.2.3 (all 127.x.x.x)", () => {
    expect(validateUrl("http://127.1.2.3").valid).toBe(false);
  });
});

// ─── Private IPv4 Ranges ────────────────────────────────────────────────────

describe("validateUrl — private IPv4 ranges", () => {
  it("blocks 10.0.0.1 (RFC 1918)", () => {
    expect(validateUrl("http://10.0.0.1").valid).toBe(false);
  });

  it("blocks 10.255.255.255", () => {
    expect(validateUrl("http://10.255.255.255").valid).toBe(false);
  });

  it("blocks 172.16.0.1 (RFC 1918)", () => {
    expect(validateUrl("http://172.16.0.1").valid).toBe(false);
  });

  it("blocks 172.31.255.255", () => {
    expect(validateUrl("http://172.31.255.255").valid).toBe(false);
  });

  it("allows 172.32.0.1 (outside 172.16-31 range)", () => {
    expect(validateUrl("http://172.32.0.1").valid).toBe(true);
  });

  it("blocks 192.168.0.1 (RFC 1918)", () => {
    expect(validateUrl("http://192.168.0.1").valid).toBe(false);
  });

  it("blocks 192.168.255.255", () => {
    expect(validateUrl("http://192.168.255.255").valid).toBe(false);
  });

  it("blocks 0.0.0.0 (this network)", () => {
    expect(validateUrl("http://0.0.0.0").valid).toBe(false);
  });

  it("blocks 100.64.0.1 (CGN shared address space)", () => {
    expect(validateUrl("http://100.64.0.1").valid).toBe(false);
  });
});

// ─── Cloud Metadata Endpoints ───────────────────────────────────────────────

describe("validateUrl — cloud metadata", () => {
  it("blocks 169.254.169.254 (AWS/GCP metadata)", () => {
    expect(validateUrl("http://169.254.169.254").valid).toBe(false);
  });

  it("blocks 169.254.169.254/latest/meta-data/", () => {
    expect(
      validateUrl("http://169.254.169.254/latest/meta-data/").valid
    ).toBe(false);
  });

  it("blocks any 169.254.x.x (link-local)", () => {
    expect(validateUrl("http://169.254.0.1").valid).toBe(false);
  });
});

// ─── Multicast and Reserved ─────────────────────────────────────────────────

describe("validateUrl — multicast and reserved IPv4", () => {
  it("blocks 224.0.0.1 (multicast)", () => {
    expect(validateUrl("http://224.0.0.1").valid).toBe(false);
  });

  it("blocks 239.255.255.255 (multicast upper bound)", () => {
    expect(validateUrl("http://239.255.255.255").valid).toBe(false);
  });

  it("blocks 240.0.0.1 (reserved for future use)", () => {
    expect(validateUrl("http://240.0.0.1").valid).toBe(false);
  });

  it("blocks 255.255.255.255 (broadcast)", () => {
    expect(validateUrl("http://255.255.255.255").valid).toBe(false);
  });
});

// ─── IPv6 ───────────────────────────────────────────────────────────────────

describe("validateUrl — IPv6 addresses", () => {
  it("blocks ::1 (loopback)", () => {
    expect(validateUrl("http://[::1]").valid).toBe(false);
  });

  it("blocks :: (unspecified)", () => {
    expect(validateUrl("http://[::]").valid).toBe(false);
  });

  it("blocks fe80::1 (link-local)", () => {
    expect(validateUrl("http://[fe80::1]").valid).toBe(false);
  });

  it("blocks fd00::1 (unique local)", () => {
    expect(validateUrl("http://[fd00::1]").valid).toBe(false);
  });

  it("blocks fc00::1 (unique local)", () => {
    expect(validateUrl("http://[fc00::1]").valid).toBe(false);
  });

  it("blocks ff02::1 (multicast)", () => {
    expect(validateUrl("http://[ff02::1]").valid).toBe(false);
  });
});

// ─── IPv4-mapped IPv6 ───────────────────────────────────────────────────────

describe("validateUrl — IPv4-mapped IPv6", () => {
  it("blocks ::ffff:127.0.0.1", () => {
    expect(validateUrl("http://[::ffff:127.0.0.1]").valid).toBe(false);
  });

  it("blocks ::ffff:10.0.0.1", () => {
    expect(validateUrl("http://[::ffff:10.0.0.1]").valid).toBe(false);
  });

  it("blocks ::ffff:169.254.169.254 (metadata via mapped)", () => {
    expect(validateUrl("http://[::ffff:169.254.169.254]").valid).toBe(false);
  });

  it("blocks ::ffff:192.168.1.1", () => {
    expect(validateUrl("http://[::ffff:192.168.1.1]").valid).toBe(false);
  });

  it("blocks IPv4-compatible ::192.168.1.1", () => {
    expect(validateUrl("http://[::192.168.1.1]").valid).toBe(false);
  });
});

// ─── Alternative IP Encodings ───────────────────────────────────────────────

describe("validateUrl — alternative IP encodings", () => {
  it("blocks decimal-encoded IP (Node normalizes to 127.0.0.1)", () => {
    // Node's URL parser normalizes 2130706433 → hostname '127.0.0.1'
    // Our validator then detects this as a private IPv4 address
    const r = validateUrl("http://2130706433");
    expect(r.valid).toBe(false);
  });

  it("blocks octal-looking IPs (Node normalizes to 127.0.0.1)", () => {
    // Node's URL parser normalizes 0177.0.0.1 → hostname '127.0.0.1'
    // Our validator then catches the loopback address
    const r = validateUrl("http://0177.0.0.1");
    expect(r.valid).toBe(false);
  });
});

// ─── Valid Public URLs ──────────────────────────────────────────────────────

describe("validateUrl — valid public URLs", () => {
  it("allows tiktok.com", () => {
    expect(validateUrl("https://www.tiktok.com/@user/video/123").valid).toBe(
      true
    );
  });

  it("allows instagram.com", () => {
    expect(validateUrl("https://www.instagram.com/p/abc123/").valid).toBe(true);
  });

  it("allows youtube.com", () => {
    expect(
      validateUrl("https://www.youtube.com/watch?v=abc123").valid
    ).toBe(true);
  });

  it("allows a regular recipe site", () => {
    expect(
      validateUrl("https://recetas.example.com/paella-mariscos").valid
    ).toBe(true);
  });

  it("allows public IPs like 8.8.8.8", () => {
    expect(validateUrl("http://8.8.8.8").valid).toBe(true);
  });
});

// ─── validateResolvedIp ────────────────────────────────────────────────────

describe("validateResolvedIp", () => {
  it("allows public IPv4", () => {
    expect(validateResolvedIp("93.184.216.34").valid).toBe(true);
  });

  it("blocks 127.0.0.1", () => {
    expect(validateResolvedIp("127.0.0.1").valid).toBe(false);
  });

  it("blocks 10.0.0.1", () => {
    expect(validateResolvedIp("10.0.0.1").valid).toBe(false);
  });

  it("blocks 169.254.169.254", () => {
    expect(validateResolvedIp("169.254.169.254").valid).toBe(false);
  });

  it("blocks ::1 (IPv6 loopback)", () => {
    expect(validateResolvedIp("::1").valid).toBe(false);
  });

  it("blocks fe80::1 (link-local IPv6)", () => {
    expect(validateResolvedIp("fe80::1").valid).toBe(false);
  });

  it("allows public IPv6", () => {
    expect(validateResolvedIp("2607:f8b0:4004:800::200e").valid).toBe(true);
  });
});

// ─── parseIPv4 ──────────────────────────────────────────────────────────────

describe("parseIPv4", () => {
  it("parses 127.0.0.1", () => {
    expect(parseIPv4("127.0.0.1")).toEqual([127, 0, 0, 1]);
  });

  it("parses 0.0.0.0", () => {
    expect(parseIPv4("0.0.0.0")).toEqual([0, 0, 0, 0]);
  });

  it("returns null for octal (leading zeros)", () => {
    expect(parseIPv4("0177.0.0.1")).toBeNull();
  });

  it("returns null for hex notation", () => {
    expect(parseIPv4("0x7f.0.0.1")).toBeNull();
  });

  it("returns null for incomplete IPs", () => {
    expect(parseIPv4("127.0.0")).toBeNull();
  });

  it("returns null for out-of-range octets", () => {
    expect(parseIPv4("256.0.0.1")).toBeNull();
  });

  it("returns null for negative values", () => {
    expect(parseIPv4("-1.0.0.0")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseIPv4("")).toBeNull();
  });
});

// ─── isPrivateIPv4 comprehensive ────────────────────────────────────────────

describe("isPrivateIPv4", () => {
  const testCases: [number[], boolean][] = [
    [[0, 0, 0, 0], true],
    [[10, 0, 0, 1], true],
    [[10, 255, 255, 255], true],
    [[127, 0, 0, 1], true],
    [[169, 254, 0, 1], true],
    [[169, 254, 169, 254], true],
    [[172, 16, 0, 1], true],
    [[172, 31, 255, 255], true],
    [[172, 32, 0, 1], false],
    [[192, 168, 0, 1], true],
    [[192, 168, 255, 255], true],
    [[224, 0, 0, 1], true],
    [[239, 255, 255, 255], true],
    [[240, 0, 0, 1], true],
    [[255, 255, 255, 255], true],
    [[8, 8, 8, 8], false],
    [[93, 184, 216, 34], false],
    [[1, 1, 1, 1], false],
    [[100, 64, 0, 1], true],   // CGN
    [[100, 127, 255, 255], true], // CGN upper
    [[100, 128, 0, 1], false], // above CGN
  ];

  testCases.forEach(([octets, expected]) => {
    it(`${octets.join(".")} → ${expected ? "private" : "public"}`, () => {
      expect(isPrivateIPv4(octets)).toBe(expected);
    });
  });
});

// ─── isPrivateIPv6 comprehensive ────────────────────────────────────────────

describe("isPrivateIPv6", () => {
  const testCases: [string, boolean][] = [
    ["::", true],
    ["::1", true],
    ["::0", true],
    ["fe80::1", true],
    ["feb0::1", true],
    ["fc00::1", true],
    ["fd12:3456:789a::1", true],
    ["ff02::1", true],
    ["ff00::1", true],
    ["::ffff:127.0.0.1", true],
    ["::ffff:10.0.0.1", true],
    ["::ffff:169.254.169.254", true],
    ["::192.168.1.1", true],
    ["2001:db8::1", true], // documentation
    ["::ffff:8.8.8.8", false],
    ["2607:f8b0:4004:800::200e", false],
    ["2001:4860:4860::8888", false],
  ];

  testCases.forEach(([ip, expected]) => {
    it(`${ip} → ${expected ? "private" : "public"}`, () => {
      expect(isPrivateIPv6(ip)).toBe(expected);
    });
  });
});

// ─── checkIpHostname ────────────────────────────────────────────────────────

describe("checkIpHostname", () => {
  it("detects IPv4 loopback as private", () => {
    expect(checkIpHostname("127.0.0.1")).toEqual({
      isIp: true,
      isPrivate: true,
    });
  });

  it("detects public IPv4", () => {
    expect(checkIpHostname("8.8.8.8")).toEqual({
      isIp: true,
      isPrivate: false,
    });
  });

  it("detects IPv6 loopback (bracketed)", () => {
    expect(checkIpHostname("[::1]")).toEqual({
      isIp: true,
      isPrivate: true,
    });
  });

  it("detects regular hostname as non-IP", () => {
    expect(checkIpHostname("example.com")).toEqual({
      isIp: false,
      isPrivate: false,
    });
  });
});
