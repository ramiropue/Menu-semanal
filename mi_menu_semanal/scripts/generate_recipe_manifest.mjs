import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Convert a filename / title into a URL-safe slug */
export function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Recursively find all .md files under a directory */
export function findMarkdownFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(fullPath);
    }
  }

  return results;
}

/** Parse markdown recipe content into structured object */
export function parseMarkdownRecipe(filePath, content) {
  const lines = content.split("\n");

  let title = "";
  const ingredients = [];
  const steps = [];
  const tags = [];
  const links = [];
  let sourceUrl = null;
  const sections = {};

  let currentSection = "";
  let currentSectionContent = "";

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (/^#\s+/.test(line) && !title) {
      title = line.replace(/^#\s+/, "").trim();
      continue;
    }

    if (/^##\s+/.test(line)) {
      if (currentSection && currentSectionContent.trim()) {
        sections[currentSection] = currentSectionContent.trim();
      }
      currentSection = line.replace(/^##\s+/, "").trim();
      currentSectionContent = "";
      continue;
    }

    if (currentSection) {
      currentSectionContent += line + "\n";
    }

    const tagMatches = line.match(/(?:^|\s)#([A-Za-zÀ-ÿ0-9_]+)/g);
    if (tagMatches && !/^#{1,6}\s/.test(line)) {
      for (const tag of tagMatches) {
        const cleaned = tag.trim().replace(/^#/, "");
        if (cleaned && !tags.includes(cleaned)) {
          tags.push(cleaned);
        }
      }
    }

    const linkRegex = /\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;
    let linkMatch;
    while ((linkMatch = linkRegex.exec(line)) !== null) {
      links.push({ text: linkMatch[1], url: linkMatch[2] });
    }

    if (/^Link:/i.test(line.trim())) {
      const urlMatch = line.match(/\((https?:\/\/[^)]+)\)/);
      if (urlMatch) {
        sourceUrl = urlMatch[1];
      } else {
        const bareUrl = line.replace(/^Link:\s*/i, "").replace(/\+/g, "").trim();
        if (bareUrl.startsWith("http")) {
          sourceUrl = bareUrl;
        }
      }
    }

    const normalizedSection = currentSection.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (normalizedSection === "ingredientes") {
      const bulletMatch = line.match(/^\s*[\*\-]\s+(.+)/);
      if (bulletMatch) {
        const raw = bulletMatch[1].trim();
        const qtyMatch = raw.match(/^([≈~]?\d[\d/.,]*\s*(?:g|kg|ml|l|cdta|cdas?|un(?:idad(?:es)?)?|pizca|ud)?\.?)\s+(?:de\s+)?(.+)/i);
        if (qtyMatch) {
          ingredients.push({
            cantidad: qtyMatch[1].trim(),
            ingrediente: qtyMatch[2].trim(),
          });
        } else {
          ingredients.push({
            cantidad: "",
            ingrediente: raw,
          });
        }
      }
    }

    if (normalizedSection === "pasos" || normalizedSection === "preparacion") {
      const orderedMatch = line.match(/^\s*\d+\.\s+(.+)/);
      if (orderedMatch) {
        steps.push({
          step: steps.length + 1,
          description: orderedMatch[1].trim(),
        });
      }
    }
  }

  if (currentSection && currentSectionContent.trim()) {
    sections[currentSection] = currentSectionContent.trim();
  }

  if (!title) {
    title = path.basename(filePath, ".md");
  }

  const slug = slugify(title);
  const id = `md-${slug}`;

  if (tags.length === 0) {
    tags.push("Nota");
  }

  return {
    id,
    title,
    ingredients,
    steps,
    tags,
    links,
    sourceUrl,
    sections,
    rawContent: content,
  };
}

/**
 * Validates a parsed recipe for minimum integrity requirements:
 * non-empty title, at least 1 valid ingredient, at least 1 valid step.
 */
export function validateRecipe(recipe, filePath = "") {
  if (!recipe.title || !recipe.title.trim()) {
    throw new Error(`[manifest] Recipe in "${filePath}" is missing a title.`);
  }

  if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
    throw new Error(`[manifest] Recipe "${recipe.title}" in "${filePath}" has no ingredients.`);
  }

  for (const ing of recipe.ingredients) {
    if (!ing.ingrediente || !ing.ingrediente.trim()) {
      throw new Error(`[manifest] Recipe "${recipe.title}" in "${filePath}" contains a blank ingredient name.`);
    }
  }

  if (!Array.isArray(recipe.steps) || recipe.steps.length === 0) {
    throw new Error(`[manifest] Recipe "${recipe.title}" in "${filePath}" has no preparation steps.`);
  }

  for (const st of recipe.steps) {
    if (!st.description || !st.description.trim()) {
      throw new Error(`[manifest] Recipe "${recipe.title}" in "${filePath}" contains a blank step description.`);
    }
  }

  if (!recipe.id || !recipe.id.startsWith("md-")) {
    throw new Error(`[manifest] Recipe "${recipe.title}" has an invalid ID "${recipe.id}".`);
  }
}

/**
 * Generates the recipe manifest from markdown notes.
 *
 * Options:
 * - sourceDir: custom source directory path
 * - manifestPath: custom destination manifest path
 * - allowMissingSource: boolean; if false (default), missing source causes error exit
 * - exitOnError: boolean (default: true for CLI usage)
 */
export function generateRecipeManifest(options = {}) {
  const allowMissingSource =
    options.allowMissingSource ??
    (process.argv.includes("--allow-missing-source") || process.env.ALLOW_MISSING_RECETAS_SOURCE === "true");

  const exitOnError = options.exitOnError ?? true;

  const candidateDirs = options.sourceDir
    ? [path.resolve(options.sourceDir)]
    : [
        path.resolve(__dirname, "../../RecetasNOTAS"),
        path.resolve(process.cwd(), "..", "RecetasNOTAS"),
        path.resolve(process.cwd(), "RecetasNOTAS"),
      ];

  const notasDir = candidateDirs.find((dir) => fs.existsSync(dir));
  const manifestPath = options.manifestPath
    ? path.resolve(options.manifestPath)
    : path.resolve(__dirname, "../data/markdownRecipesManifest.json");

  if (!notasDir) {
    const errorMsg =
      `[manifest] ERROR: Source directory RecetasNOTAS not found.\n` +
      `  Checked locations:\n` +
      candidateDirs.map((d) => `    - ${d}`).join("\n") +
      `\n  To allow missing source in specialized environments, pass --allow-missing-source.`;

    if (allowMissingSource) {
      console.warn(`[manifest] WARNING: Source directory not found, but --allow-missing-source is active. Preserving existing manifest.`);
      return { success: true, preserved: true, recipes: [] };
    }

    console.error(errorMsg);
    if (exitOnError) {
      process.exit(1);
    }
    throw new Error(errorMsg);
  }

  const files = findMarkdownFiles(notasDir);
  if (files.length === 0) {
    const errorMsg = `[manifest] ERROR: No markdown (.md) files found in source directory "${notasDir}".`;
    if (allowMissingSource) {
      console.warn(`[manifest] WARNING: No markdown files found, but --allow-missing-source is active. Preserving existing manifest.`);
      return { success: true, preserved: true, recipes: [] };
    }

    console.error(errorMsg);
    if (exitOnError) {
      process.exit(1);
    }
    throw new Error(errorMsg);
  }

  const recipes = [];
  const seenIds = new Map();

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const recipe = parseMarkdownRecipe(file, content);

    // Validate recipe content
    validateRecipe(recipe, file);

    // Enforce ID uniqueness
    if (seenIds.has(recipe.id)) {
      const dupError =
        `[manifest] Duplicate recipe ID detected: "${recipe.id}"\n` +
        `  First occurrence: ${seenIds.get(recipe.id)}\n` +
        `  Second occurrence: ${file}\n` +
        `Recipe IDs must be strictly unique.`;
      console.error(dupError);
      if (exitOnError) {
        process.exit(1);
      }
      throw new Error(dupError);
    }

    seenIds.set(recipe.id, file);
    recipes.push(recipe);
  }

  // Sort deterministically by ID ascending
  recipes.sort((a, b) => a.id.localeCompare(b.id));

  // Atomic write: write to temp file in destination directory then renameSync
  const manifestDir = path.dirname(manifestPath);
  if (!fs.existsSync(manifestDir)) {
    fs.mkdirSync(manifestDir, { recursive: true });
  }

  const tempPath = path.join(manifestDir, `.${path.basename(manifestPath)}.tmp.${Date.now()}`);
  const jsonContent = JSON.stringify(recipes, null, 2) + "\n";

  fs.writeFileSync(tempPath, jsonContent, "utf-8");
  fs.renameSync(tempPath, manifestPath);

  console.log(`[manifest] Successfully generated ${recipes.length} recipe(s) into ${manifestPath}:`);
  for (const r of recipes) {
    console.log(`  - [${r.id}] "${r.title}" (${r.ingredients.length} ingredients, ${r.steps.length} steps)`);
  }

  return { success: true, preserved: false, recipes };
}

// Auto-run when executed directly via CLI
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  generateRecipeManifest();
}
