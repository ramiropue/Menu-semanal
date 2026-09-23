import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Convert a filename / title into a URL-safe slug */
function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Recursively find all .md files under a directory */
function findMarkdownFiles(dir) {
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
function parseMarkdownRecipe(filePath, content) {
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

function generateRecipeManifest() {
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
          console.log(`[manifest] RecetasNOTAS directory not present in environment. Preserving existing manifest with ${existing.length} recipes.`);
          return;
        }
      } catch {
        // proceed
      }
    }
    console.warn("[manifest] RecetasNOTAS directory not found. Writing empty manifest.");
    fs.writeFileSync(manifestPath, "[]\n", "utf-8");
    return;
  }

  const files = findMarkdownFiles(notasDir);
  if (files.length === 0) {
    if (fs.existsSync(manifestPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        if (Array.isArray(existing) && existing.length > 0) {
          console.log(`[manifest] No markdown files found in ${notasDir}. Preserving existing manifest with ${existing.length} recipes.`);
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

  const recipes = [];
  const seenIds = new Map();

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
