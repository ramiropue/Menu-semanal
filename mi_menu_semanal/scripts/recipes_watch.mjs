import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appDir, "..");
const notasDir = path.resolve(repoRoot, "RecetasNOTAS");

const DEBOUNCE_MS = 1200;
let debounceTimer = null;
let isProcessing = false;
let pendingRun = false;

const isExecute = process.argv.includes("--execute");

export function isIgnoredFile(filename) {
  if (!filename) return true;
  const base = path.basename(filename);
  if (base.startsWith(".") || base === ".DS_Store" || base.endsWith("~") || base.endsWith(".tmp")) {
    return true;
  }
  if (!base.endsWith(".md")) {
    return true;
  }
  return false;
}

/**
 * Checks if a file has finished being written by comparing size and mtimeMs across intervals.
 */
export async function isFileStable(filePath, checkIntervalMs = 200, maxChecks = 4) {
  if (!fs.existsSync(filePath)) return true;
  let lastStat = null;
  for (let i = 0; i < maxChecks; i++) {
    try {
      const currentStat = fs.statSync(filePath);
      if (lastStat) {
        if (currentStat.size === lastStat.size && currentStat.mtimeMs === lastStat.mtimeMs) {
          return true;
        }
      }
      lastStat = currentStat;
    } catch {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, checkIntervalMs));
  }
  return true;
}

export function getWatcherState() {
  return { isProcessing, pendingRun };
}

export function setWatcherState(state) {
  if (state.isProcessing !== undefined) isProcessing = state.isProcessing;
  if (state.pendingRun !== undefined) pendingRun = state.pendingRun;
}

export function runPipeline() {
  const args = ["scripts/recipes_publish.mjs"];
  if (isExecute) {
    args.push("--execute");
  }

  execFileSync("node", args, {
    cwd: appDir,
    stdio: "inherit",
  });
}

/**
 * Executes changes with concurrency lock, pendingRun queuing, and safe subprocess invocation.
 */
export async function processChanges(options = {}) {
  const runner = options.runner || runPipeline;

  if (isProcessing) {
    pendingRun = true;
    console.log("[watcher] Event received while processing; marked pending for next iteration.");
    return;
  }

  isProcessing = true;
  console.log("\n--------------------------------------------------");
  console.log(`[watcher] Triggered change event. Running recipe pipeline (${isExecute ? "EXECUTE" : "DRY RUN"})...`);

  try {
    await runner();
    console.log("[watcher] Pipeline run finished successfully.");
  } catch {
    console.error("[watcher] Pipeline run finished with error(s). Watcher continues running.");
  } finally {
    isProcessing = false;
    if (pendingRun) {
      pendingRun = false;
      console.log("[watcher] Executing pending run queued during previous processing...");
      setTimeout(() => {
        processChanges(options);
      }, 200);
    }
  }
}

export function startRecipesWatcher() {
  if (!fs.existsSync(notasDir)) {
    console.error(`[watcher] ERROR: Directory RecetasNOTAS not found: ${notasDir}`);
    process.exit(1);
  }

  console.log("==================================================");
  console.log(` 👀 RECIPES WATCHER (${isExecute ? "EXECUTE MODE" : "DRY RUN MODE"})`);
  console.log(`  Watching: ${notasDir}`);
  console.log(`  Debounce: ${DEBOUNCE_MS}ms`);
  console.log("==================================================");
  console.log("Press Ctrl+C to stop.\n");

  fs.watch(notasDir, { recursive: true }, async (eventType, filename) => {
    if (isIgnoredFile(filename)) {
      return;
    }

    const fullPath = path.join(notasDir, filename);
    console.log(`[watcher] Detected [${eventType}] on: ${filename}`);

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(async () => {
      debounceTimer = null;
      // Ensure file writing is stable before processing
      const stable = await isFileStable(fullPath);
      if (!stable) {
        console.warn(`[watcher] File "${filename}" still changing; waiting for next cycle.`);
        return;
      }
      processChanges();
    }, DEBOUNCE_MS);
  });

  const cleanup = () => {
    console.log("\n[watcher] Stopping recipe watcher...");
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  startRecipesWatcher();
}
