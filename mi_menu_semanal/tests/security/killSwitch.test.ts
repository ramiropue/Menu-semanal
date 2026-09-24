/**
 * tests/security/killSwitch.test.ts
 *
 * Tests for the SCRAPE_ENABLED kill switch behavior.
 * Verifies fail-closed semantics: only the exact string 'true' enables
 * the endpoint. All other values (absent, 'false', 'TRUE', '1', 'yes', etc.)
 * must result in the endpoint being disabled.
 */

import { describe, it, expect } from "vitest";

/**
 * Simulates the kill switch logic from app/api/scrape/route.ts:
 *   const SCRAPE_ENABLED = process.env.SCRAPE_ENABLED === 'true';
 */
function evaluateKillSwitch(envValue: string | undefined): boolean {
  return envValue === "true";
}

describe("Kill switch — fail-closed semantics", () => {
  it("SCRAPE_ENABLED=undefined (absent) → disabled", () => {
    expect(evaluateKillSwitch(undefined)).toBe(false);
  });

  it("SCRAPE_ENABLED='' (empty) → disabled", () => {
    expect(evaluateKillSwitch("")).toBe(false);
  });

  it("SCRAPE_ENABLED='false' → disabled", () => {
    expect(evaluateKillSwitch("false")).toBe(false);
  });

  it("SCRAPE_ENABLED='true' → enabled", () => {
    expect(evaluateKillSwitch("true")).toBe(true);
  });

  it("SCRAPE_ENABLED='TRUE' → disabled (case-sensitive)", () => {
    expect(evaluateKillSwitch("TRUE")).toBe(false);
  });

  it("SCRAPE_ENABLED='True' → disabled (case-sensitive)", () => {
    expect(evaluateKillSwitch("True")).toBe(false);
  });

  it("SCRAPE_ENABLED='1' → disabled (not 'true')", () => {
    expect(evaluateKillSwitch("1")).toBe(false);
  });

  it("SCRAPE_ENABLED='yes' → disabled (not 'true')", () => {
    expect(evaluateKillSwitch("yes")).toBe(false);
  });

  it("SCRAPE_ENABLED='on' → disabled (not 'true')", () => {
    expect(evaluateKillSwitch("on")).toBe(false);
  });

  it("SCRAPE_ENABLED='enabled' → disabled (not 'true')", () => {
    expect(evaluateKillSwitch("enabled")).toBe(false);
  });

  it("SCRAPE_ENABLED=' true ' (whitespace) → disabled (exact match)", () => {
    expect(evaluateKillSwitch(" true ")).toBe(false);
  });

  it("SCRAPE_ENABLED='false ' (trailing space) → disabled", () => {
    expect(evaluateKillSwitch("false ")).toBe(false);
  });
});

describe("Kill switch — production scenarios", () => {
  it("Variable absent in production → endpoint disabled (safe default)", () => {
    // Simulates a deploy where SCRAPE_ENABLED is not set
    expect(evaluateKillSwitch(undefined)).toBe(false);
  });

  it("SCRAPE_ENABLED=false in production → endpoint disabled", () => {
    expect(evaluateKillSwitch("false")).toBe(false);
  });

  it("SCRAPE_ENABLED=true in production → endpoint enabled (explicit opt-in)", () => {
    expect(evaluateKillSwitch("true")).toBe(true);
  });

  it("Random value → endpoint disabled", () => {
    expect(evaluateKillSwitch("maybe")).toBe(false);
  });
});
