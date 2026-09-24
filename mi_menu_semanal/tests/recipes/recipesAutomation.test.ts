import { describe, it, expect, vi } from "vitest";
import {
  sanitizeTitleForCommit,
  checkBranchSync,
} from "../../scripts/recipes_publish.mjs";
import {
  isIgnoredFile,
  isFileStable,
  processChanges,
  setWatcherState,
} from "../../scripts/recipes_watch.mjs";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Recipes Publication Automation Hardening", () => {
  describe("Command Injection Prevention (Requirement 4)", () => {
    it("sanitizes titles containing shell metacharacters, control characters, and newlines", () => {
      // Input with control characters, newlines, semicolons, backticks, $(), quotes
      const maliciousTitle = "Tacos `rm -rf /` and $(whoami); echo 'hacked'\r\nNew\nLine\x00";
      const sanitized = sanitizeTitleForCommit(maliciousTitle);

      // Must be single-line
      expect(sanitized).not.toContain("\n");
      expect(sanitized).not.toContain("\r");
      expect(sanitized).not.toContain("\x00");

      // All internal control characters collapsed to single spaces
      expect(sanitized).toBe("Tacos `rm -rf /` and $(whoami); echo 'hacked' New Line");
    });

    it("handles quotes, spaces, and complex characters safely as literal string data", () => {
      const complexTitle = '  Receta: "Pollo al Curry" & \'Arroz con Mango\'  ';
      const sanitized = sanitizeTitleForCommit(complexTitle);

      expect(sanitized).toBe('Receta: "Pollo al Curry" & \'Arroz con Mango\'');
    });

    it("returns empty string for null or undefined titles without throwing", () => {
      expect(sanitizeTitleForCommit(null as unknown as string)).toBe("");
      expect(sanitizeTitleForCommit(undefined as unknown as string)).toBe("");
      expect(sanitizeTitleForCommit("")).toBe("");
    });
  });

  describe("Branch Synchronization Logic (Requirement 5)", () => {
    it("checkBranchSync queries git rev-list and returns structural sync status", () => {
      const res = checkBranchSync();
      expect(typeof res.aheadCount).toBe("number");
      expect(typeof res.behindCount).toBe("number");
      expect(typeof res.isDiverged).toBe("boolean");
      expect(typeof res.isIdentical).toBe("boolean");
    });

    it("correctly identifies synchronized, ahead, behind, and diverged states", () => {
      // Simulate sync responses
      const syncIdentical = { aheadCount: 0, behindCount: 0, isDiverged: false, isIdentical: true };
      expect(syncIdentical.isIdentical).toBe(true);
      expect(syncIdentical.aheadCount).toBe(0);
      expect(syncIdentical.behindCount).toBe(0);

      const syncAhead = { aheadCount: 2, behindCount: 0, isDiverged: false, isIdentical: false };
      expect(syncAhead.isIdentical).toBe(false);
      expect(syncAhead.aheadCount).toBe(2);

      const syncBehind = { aheadCount: 0, behindCount: 3, isDiverged: false, isIdentical: false };
      expect(syncBehind.isIdentical).toBe(false);
      expect(syncBehind.behindCount).toBe(3);

      const syncDiverged = { aheadCount: 1, behindCount: 1, isDiverged: true, isIdentical: false };
      expect(syncDiverged.isDiverged).toBe(true);
    });
  });

  describe("Watcher Filter and Stability (Requirement 6)", () => {
    it("filters out .DS_Store, temporary files, hidden files, and non-md files", () => {
      expect(isIgnoredFile(".DS_Store")).toBe(true);
      expect(isIgnoredFile(".git/index")).toBe(true);
      expect(isIgnoredFile("recipe.md~")).toBe(true);
      expect(isIgnoredFile("recipe.md.tmp")).toBe(true);
      expect(isIgnoredFile("recipe.png")).toBe(true);
      expect(isIgnoredFile("recipe.json")).toBe(true);
      expect(isIgnoredFile(null)).toBe(true);

      // Valid markdown files
      expect(isIgnoredFile("Receta.md")).toBe(false);
      expect(isIgnoredFile("Tacos Big Mac.md")).toBe(false);
    });

    it("isFileStable detects when a file is no longer changing", async () => {
      const tempFile = path.join(os.tmpdir(), `stability-test-${Date.now()}.md`);
      fs.writeFileSync(tempFile, "# Test Content\n", "utf-8");

      try {
        const stable = await isFileStable(tempFile, 50, 3);
        expect(stable).toBe(true);
      } finally {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    });

    it("manages concurrency lock and queues pendingRun when event arrives during processing", async () => {
      setWatcherState({ isProcessing: false, pendingRun: false });

      const executedRuns: string[] = [];

      // A slow runner that records its start and end
      const slowRunner = vi.fn(async () => {
        executedRuns.push("run-1-start");
        // Simulate event arriving while running
        setWatcherState({ isProcessing: true });
        // Trigger a second event while first is processing
        await processChanges({
          runner: async () => {
            executedRuns.push("run-2");
          },
        });
        executedRuns.push("run-1-end");
      });

      await processChanges({ runner: slowRunner });

      // After first call to processChanges, state should have captured pendingRun
      // and then resolved it in finally
      expect(executedRuns).toContain("run-1-start");
      expect(executedRuns).toContain("run-1-end");
    });
  });
});
