import fs from "fs";
import path from "path";
import { findMarkdownFiles, parseMarkdownRecipe, type MarkdownRecipe } from "../lib/markdownRecipes";

/**
 * Script that parses all markdown recipes from RecetasNOTAS/ at build time
 * and writes a deterministic, sorted JSON manifest into data/markdownRecipesManifest.json.
 *
 * This ensures that in serverless runtime environments (such as Netlify Functions or AWS Lambda)
 * where parent directories outside the function bundle are inaccessible, all recipes are
 * statically bundled into the server JavaScript output.
 */
function generateRecipeManifest(): void {
  const candidateDirs = [
    path.resolve(__dirname, "../../RecetasNOTAS"),
    path.resolve(process.cwd(), "..", "RecetasNOTAS"),
    path.resolve(process.cwd(), "RecetasNOTAS"),
  ];

  const notasDir = candidateDirs.find((dir) => fs.existsSync(dir));
  const manifestPath = path.resolve(__dirname, "../data/markdownRecipesManifest.json");

  if (!notasDir) {
    if (fs.existsSync(manifestPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        if (Array.isArray(existing) && existing.length > 0) {
          console.warn(`[manifest] RecetasNOTAS directory not found. Preserving existing manifest with ${existing.length} recipes.`);
          return;
        }
      } catch {
        // invalid existing manifest, proceed to write empty
      }
    }
    console.warn("[manifest] RecetasNOTAS directory not found and no valid existing manifest. Writing empty array.");
    fs.writeFileSync(manifestPath, "[]\n", "utf-8");
    return;
  }

  const files = findMarkdownFiles(notasDir);
  if (files.length === 0) {
    if (fs.existsSync(manifestPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        if (Array.isArray(existing) && existing.length > 0) {
          console.warn(`[manifest] No markdown files found in ${notasDir}. Preserving existing manifest with ${existing.length} recipes.`);
          return;
        }
      } catch {
        // proceed
      }
    }
    console.warn(`[manifest] No markdown files found in ${notasDir}. Writing empty manifest.`);
    fs.writeFileSync(manifestPath, "[]\n", "utf-8");
    return;
  }

  const recipes: MarkdownRecipe[] = [];
  const seenIds = new Map<string, string>();

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const recipe = parseMarkdownRecipe(file, content);

    if (seenIds.has(recipe.id)) {
      throw new Error(
        `[manifest] Duplicate recipe ID detected: "${recipe.id}"\n` +
        `  First occurrence: ${seenIds.get(recipe.id)}\n` +
        `  Second occurrence: ${file}\n` +
        `Recipe IDs must be strictly unique.`
      );
    }

    seenIds.set(recipe.id, file);
    recipes.push(recipe);
  }

  // Sort deterministically by ID ascending
  recipes.sort((a, b) => a.id.localeCompare(b.id));

  const jsonContent = JSON.stringify(recipes, null, 2) + "\n";
  fs.writeFileSync(manifestPath, jsonContent, "utf-8");

  console.log(`[manifest] Successfully generated ${recipes.length} recipe(s) into ${manifestPath}:`);
  for (const r of recipes) {
    console.log(`  - [${r.id}] "${r.title}" (${r.ingredients.length} ingredients, ${r.steps.length} steps)`);
  }
}

generateRecipeManifest();
