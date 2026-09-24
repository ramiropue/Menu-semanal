import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appDir, "..");
const notasDir = path.resolve(repoRoot, "RecetasNOTAS");

const DEBOUNCE_MS = 1200;
let debounceTimer = null;
let isProcessing = false;

const isExecute = process.argv.includes("--execute");

function isIgnoredFile(filename) {
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

function processChanges() {
  if (isProcessing) {
    console.log("[watcher] Already processing an event; event queued.");
    return;
  }

  isProcessing = true;
  console.log("\n--------------------------------------------------");
  console.log(`[watcher] Triggered change event. Running recipe pipeline (${isExecute ? "EXECUTE" : "DRY RUN"})...`);

  try {
    const cmd = isExecute
      ? "node scripts/recipes_publish.mjs --execute"
      : "node scripts/recipes_publish.mjs";

    execSync(cmd, {
      cwd: appDir,
      stdio: "inherit",
    });
    console.log("[watcher] Pipeline run finished successfully.");
  } catch {
    console.error("[watcher] Pipeline run finished with error(s). Watcher continues running.");
  } finally {
    isProcessing = false;
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

  fs.watch(notasDir, { recursive: true }, (eventType, filename) => {
    if (isIgnoredFile(filename)) {
      return;
    }

    console.log(`[watcher] Detected [${eventType}] on: ${filename}`);

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = null;
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
