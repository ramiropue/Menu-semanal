import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  generateRecipeManifest,
  findMarkdownFiles,
  parseMarkdownRecipe,
  validateRecipe,
} from "./generate_recipe_manifest.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appDir, "..");
const notasDir = path.resolve(repoRoot, "RecetasNOTAS");

export function validateRecipesAutomation() {
  console.log("==================================================");
  console.log(" 🔍 RECIPES VALIDATION (recipes:validate)");
  console.log("==================================================");

  // 1. Verify RecetasNOTAS directory exists
  if (!fs.existsSync(notasDir)) {
    console.error(`[validate] ERROR: RecetasNOTAS directory not found at: ${notasDir}`);
    process.exit(1);
  }

  // 2. Discover and inspect markdown files
  const files = findMarkdownFiles(notasDir);
  console.log(`[validate] Found ${files.length} markdown note(s) in RecetasNOTAS/`);

  if (files.length === 0) {
    console.error("[validate] ERROR: No .md files found in RecetasNOTAS/");
    process.exit(1);
  }

  // 3. Validate each recipe structure and check duplicate IDs
  const seenIds = new Map();
  const validatedRecipes = [];

  for (const file of files) {
    const relFile = path.relative(repoRoot, file);
    const content = fs.readFileSync(file, "utf-8");
    const recipe = parseMarkdownRecipe(file, content);

    validateRecipe(recipe, relFile);

    if (seenIds.has(recipe.id)) {
      console.error(
        `[validate] ERROR: Duplicate recipe ID detected: "${recipe.id}"\n` +
        `  File 1: ${seenIds.get(recipe.id)}\n` +
        `  File 2: ${relFile}`
      );
      process.exit(1);
    }

    seenIds.set(recipe.id, relFile);
    validatedRecipes.push({
      id: recipe.id,
      title: recipe.title,
      file: relFile,
      ingredientsCount: recipe.ingredients.length,
      stepsCount: recipe.steps.length,
      hasLink: !!recipe.sourceUrl,
    });
  }

  console.log("[validate] All individual recipe schemas and ID uniqueness validated successfully:");
  for (const r of validatedRecipes) {
    console.log(`  ✓ [${r.id}] "${r.title}" (${r.ingredientsCount} ing, ${r.stepsCount} steps, source: ${r.hasLink ? "yes" : "none"})`);
  }

  // 4. Regenerate manifest
  console.log("\n[validate] Regenerating data/markdownRecipesManifest.json...");
  const manifestResult = generateRecipeManifest({
    sourceDir: notasDir,
    manifestPath: path.resolve(appDir, "data/markdownRecipesManifest.json"),
    allowMissingSource: false,
    exitOnError: true,
  });

  if (!manifestResult.success) {
    console.error("[validate] ERROR: Manifest generation failed.");
    process.exit(1);
  }

  // 5. Run recipe-specific tests
  console.log("\n[validate] Running recipe test suites (Vitest)...");
  try {
    execSync("npx vitest run tests/recipes/", {
      cwd: appDir,
      stdio: "inherit",
    });
  } catch {
    console.error("[validate] ERROR: Recipe unit tests failed.");
    process.exit(1);
  }

  // 6. Run git diff --check
  console.log("\n[validate] Checking git whitespace / diff issues...");
  try {
    execSync("git diff --check", {
      cwd: repoRoot,
      stdio: "inherit",
    });
  } catch {
    console.error("[validate] ERROR: git diff --check detected formatting/whitespace issues.");
    process.exit(1);
  }

  console.log("\n==================================================");
  console.log(" ✅ All recipes and manifest checks passed cleanly!");
  console.log("    (No commits or pushes were performed)");
  console.log("==================================================");

  return { success: true, recipes: validatedRecipes };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  validateRecipesAutomation();
}
