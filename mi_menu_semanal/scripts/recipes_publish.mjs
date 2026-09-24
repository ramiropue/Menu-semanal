import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateRecipesAutomation } from "./recipes_validate.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appDir, "..");

const ALLOWED_BRANCH = "v2/phase-1-household-auth";

function runGit(command, options = {}) {
  return execSync(command, {
    cwd: repoRoot,
    encoding: "utf-8",
    stdio: options.stdio || "pipe",
  }).trim();
}

export function publishRecipesAutomation() {
  const isExecute = process.argv.includes("--execute");
  const allowDelete = process.argv.includes("--allow-delete");

  console.log("==================================================");
  console.log(` 🚀 RECIPES PUBLISH (${isExecute ? "EXECUTE MODE" : "DRY RUN"})`);
  console.log("==================================================");

  // 1. Guard: Check current branch
  const currentBranch = runGit("git rev-parse --abbrev-ref HEAD");
  console.log(`[publish] Current branch: ${currentBranch}`);

  if (currentBranch === "main") {
    console.error(`[publish] CRITICAL SAFETY ERROR: Publishing directly to "main" is strictly forbidden.`);
    process.exit(1);
  }

  if (currentBranch !== ALLOWED_BRANCH) {
    console.error(
      `[publish] CRITICAL SAFETY ERROR: In this phase, recipes can only be published to "${ALLOWED_BRANCH}".\n` +
      `  Current branch is "${currentBranch}". Aborting.`
    );
    process.exit(1);
  }

  // 2. Guard: Remote synchronization check
  console.log("[publish] Fetching origin to verify branch synchronization...");
  try {
    runGit(`git fetch origin ${ALLOWED_BRANCH}`);
  } catch (err) {
    console.error(`[publish] ERROR: Failed to fetch from origin/${ALLOWED_BRANCH}:`, err.message);
    process.exit(1);
  }

  const behindCount = parseInt(
    runGit(`git rev-list --count HEAD..origin/${ALLOWED_BRANCH}`) || "0",
    10
  );
  if (behindCount > 0) {
    console.error(
      `[publish] SAFETY ERROR: Local branch is behind origin/${ALLOWED_BRANCH} by ${behindCount} commit(s).\n` +
      `  Please pull / sync first before publishing. Aborting.`
    );
    process.exit(1);
  }

  // 3. Guard: Working tree safety audit
  const rawStatus = runGit("git status --porcelain");
  const statusLines = rawStatus
    ? rawStatus.split("\n").filter((l) => l && l.length >= 4)
    : [];

  const allowedPathPrefixes = [
    "RecetasNOTAS/",
    "mi_menu_semanal/data/markdownRecipesManifest.json",
  ];

  const dangerousPatterns = [
    /\.DS_Store/,
    /\.env/,
    /\.backup$/,
    /\.dump$/,
    /backups\//,
    /\.log$/,
    /id_rsa/,
    /\.pem$/,
  ];

  const filesToCommit = [];
  const deletions = [];

  for (const line of statusLines) {
    const match = line.match(/^([MADRCU?!]{1,2})\s+(.+)$/);
    const code = match ? match[1] : line.slice(0, 2).trim();
    let filePath = match ? match[2].trim() : line.slice(3).trim();
    if (filePath.includes(" -> ")) {
      filePath = filePath.split(" -> ")[1].trim();
    }

    // Check for dangerous files
    for (const pat of dangerousPatterns) {
      if (pat.test(filePath)) {
        console.error(`[publish] CRITICAL ERROR: Dangerous or secret file detected in git status: "${filePath}". Aborting.`);
        process.exit(1);
      }
    }

    // Check if the modified file is within allowed paths
    const isAllowed = allowedPathPrefixes.some((prefix) => filePath.startsWith(prefix));
    if (!isAllowed) {
      console.error(
        `[publish] SAFETY ERROR: Unrelated changes detected outside recipe notes and manifest:\n` +
        `  -> [${code}] ${filePath}\n` +
        `  Recipes automation only allows changes to RecetasNOTAS/ and data/markdownRecipesManifest.json.\n` +
        `  Please stash, commit, or discard unrelated changes before publishing.`
      );
      process.exit(1);
    }

    if (code === "D" || code === "RD" || code === "MD") {
      deletions.push(filePath);
    } else {
      filesToCommit.push(filePath);
    }
  }

  // Check if deletions occurred
  if (deletions.length > 0 && !allowDelete) {
    console.error(
      `[publish] SAFETY ERROR: Recipe deletion(s) detected:\n` +
      deletions.map((d) => `  - ${d}`).join("\n") +
      `\n  Automated recipe publishing does not allow recipe deletions without the explicit --allow-delete flag.`
    );
    process.exit(1);
  }

  // 4. Run validation
  console.log("\n[publish] Running validation suite before publishing...");
  const validation = validateRecipesAutomation();
  if (!validation.success) {
    console.error("[publish] ERROR: Recipe validation failed. Aborting publish.");
    process.exit(1);
  }

  // Check if there are any changes to publish
  const statusAfterValidation = runGit("git status --porcelain");
  if (!statusAfterValidation) {
    console.log("\n[publish] Working tree is completely clean. No recipe changes to publish.");
    return;
  }

  // Determine which recipes were changed / added
  const changedDiff = runGit("git status --porcelain RecetasNOTAS");
  const changedNoteNames = [];
  if (changedDiff) {
    const lines = changedDiff.split("\n");
    for (const l of lines) {
      const p = l.slice(3).trim();
      const base = path.basename(p, ".md");
      if (base && !changedNoteNames.includes(base)) {
        changedNoteNames.push(base);
      }
    }
  }

  const recipeSummary =
    changedNoteNames.length > 0
      ? changedNoteNames.join(", ")
      : "updates to markdown notes";

  const commitMessage = `feat(recipes): publish ${recipeSummary} note recipe(s)`;

  console.log("\n--------------------------------------------------");
  console.log(" 📋 PUBLISH SUMMARY:");
  console.log(`  - Target branch: ${ALLOWED_BRANCH}`);
  console.log(`  - Staging files: RecetasNOTAS/ and data/markdownRecipesManifest.json`);
  console.log(`  - Recipes affected: ${recipeSummary}`);
  console.log(`  - Commit message: "${commitMessage}"`);
  console.log(`  - Push mode: normal push (no force-push)`);
  console.log("--------------------------------------------------");

  if (!isExecute) {
    console.log("\n[publish] ⚠️ DRY RUN COMPLETE. No changes were committed or pushed.");
    console.log(`[publish] To execute this publish, re-run with:`);
    console.log(`   npm run recipes:publish -- --execute\n`);
    return;
  }

  // EXECUTE MODE
  console.log("\n[publish] Executing commit and push...");
  runGit("git add RecetasNOTAS/ mi_menu_semanal/data/markdownRecipesManifest.json");
  runGit(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`);

  console.log(`[publish] Pushing to origin/${ALLOWED_BRANCH}...`);
  runGit(`git push origin ${ALLOWED_BRANCH}`);

  console.log("\n==================================================");
  console.log(" ✅ RECIPE PUBLICATION COMPLETE");
  console.log(`    Committed: "${commitMessage}"`);
  console.log(`    Pushed to: origin/${ALLOWED_BRANCH}`);
  console.log("==================================================");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  publishRecipesAutomation();
}
