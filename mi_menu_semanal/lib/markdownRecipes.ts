import fs from "fs";
import path from "path";
import db from "@/lib/db";
import { RowDataPacket } from "mysql2";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MarkdownIngredient = {
  cantidad: string;
  ingrediente: string;
};

export type MarkdownStep = {
  step: number;
  description: string;
};

export type MarkdownRecipe = {
  id: string;               // md-<slug>
  title: string;
  ingredients: MarkdownIngredient[];
  steps: MarkdownStep[];
  tags: string[];
  links: { text: string; url: string }[];
  sourceUrl: string | null;  // Primary link extracted from "Link:" line
  sections: Record<string, string>; // Extra sections not yet handled
  rawContent: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a filename / title into a URL-safe slug */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // remove diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Recursively find all .md files under a directory */
function findMarkdownFiles(dir: string): string[] {
  const results: string[] = [];

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

// ─── Parser ───────────────────────────────────────────────────────────────────

function parseMarkdownRecipe(filePath: string, content: string): MarkdownRecipe {
  const lines = content.split("\n");

  let title = "";
  const ingredients: MarkdownIngredient[] = [];
  const steps: MarkdownStep[] = [];
  const tags: string[] = [];
  const links: { text: string; url: string }[] = [];
  let sourceUrl: string | null = null;
  const sections: Record<string, string> = {};

  // Detect title from H1
  let currentSection = "";
  let currentSectionContent = "";

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // H1 → title
    if (/^#\s+/.test(line) && !title) {
      title = line.replace(/^#\s+/, "").trim();
      continue;
    }

    // H2 → new section
    if (/^##\s+/.test(line)) {
      // Save previous section
      if (currentSection && currentSectionContent.trim()) {
        sections[currentSection] = currentSectionContent.trim();
      }
      currentSection = line.replace(/^##\s+/, "").trim();
      currentSectionContent = "";
      continue;
    }

    // Accumulate section content
    if (currentSection) {
      currentSectionContent += line + "\n";
    }

    // Extract inline tags (standalone #Tag patterns, not markdown headings)
    const tagMatches = line.match(/(?:^|\s)#([A-Za-zÀ-ÿ0-9_]+)/g);
    if (tagMatches && !/^#{1,6}\s/.test(line)) {
      for (const tag of tagMatches) {
        const cleaned = tag.trim().replace(/^#/, "");
        if (cleaned && !tags.includes(cleaned)) {
          tags.push(cleaned);
        }
      }
    }

    // Extract markdown links [text](url)
    const linkRegex = /\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;
    let linkMatch;
    while ((linkMatch = linkRegex.exec(line)) !== null) {
      links.push({ text: linkMatch[1], url: linkMatch[2] });
    }

    // Detect "Link:" line for source URL
    if (/^Link:/i.test(line.trim())) {
      const urlMatch = line.match(/\((https?:\/\/[^)]+)\)/);
      if (urlMatch) {
        sourceUrl = urlMatch[1];
      } else {
        // Try bare URL
        const bareUrl = line.replace(/^Link:\s*/i, "").replace(/\+/g, "").trim();
        if (bareUrl.startsWith("http")) {
          sourceUrl = bareUrl;
        }
      }
    }

    // Parse ingredients (unordered list items under "Ingredientes" section)
    const normalizedSection = currentSection.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (normalizedSection === "ingredientes") {
      const bulletMatch = line.match(/^\s*[\*\-]\s+(.+)/);
      if (bulletMatch) {
        const raw = bulletMatch[1].trim();
        // Try to split quantity from ingredient name
        // Patterns: "200g de arroz", "1/2 pimiento", "≈800ml de fumet"
        const qtyMatch = raw.match(/^([≈~]?\d[\d/.,]*\s*(?:g|kg|ml|l|cdta|cdas?|un(?:idad(?:es)?)?|pizca|ud)?\.?)\s+(?:de\s+)?(.+)/i);
        if (qtyMatch) {
          ingredients.push({
            cantidad: qtyMatch[1].trim(),
            ingrediente: qtyMatch[2].trim(),
          });
        } else {
          // No clear quantity — put everything as ingrediente
          ingredients.push({
            cantidad: "",
            ingrediente: raw,
          });
        }
      }
    }

    // Parse steps (ordered list items under "Pasos" / "Preparación" section)
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

  // Save last section
  if (currentSection && currentSectionContent.trim()) {
    sections[currentSection] = currentSectionContent.trim();
  }

  // Fallback title from filename
  if (!title) {
    title = path.basename(filePath, ".md");
  }

  // Generate a stable ID
  const slug = slugify(title);
  const id = `md-${slug}`;

  // If no explicit tags, generate from section names
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

// ─── Public API ───────────────────────────────────────────────────────────────

const RECETAS_NOTAS_DIR = path.resolve(process.cwd(), "..", "RecetasNOTAS");

/** Get all markdown recipes from RecetasNOTAS/ */
export function getMarkdownRecipes(): MarkdownRecipe[] {
  const files = findMarkdownFiles(RECETAS_NOTAS_DIR);
  return files.map((filePath) => {
    const content = fs.readFileSync(filePath, "utf-8");
    return parseMarkdownRecipe(filePath, content);
  });
}

/** Get a single markdown recipe by its ID (md-<slug>) */
export function getMarkdownRecipeById(id: string): MarkdownRecipe | null {
  const recipes = getMarkdownRecipes();
  return recipes.find((r) => r.id === id) || null;
}

// Default placeholder image for imported markdown recipes
const MD_PLACEHOLDER_IMAGE = "https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&q=80&w=800";

/**
 * Import markdown recipes into MariaDB (INSERT ... ON DUPLICATE KEY skip).
 * Once imported, they become regular editable recipes.
 * Existing recipes with the same ID are NOT overwritten (preserves user edits).
 */
export async function importMarkdownToDatabase(): Promise<void> {
  const mdRecipes = getMarkdownRecipes();
  if (mdRecipes.length === 0) return;

  for (const md of mdRecipes) {
    const row = {
      id: md.id,
      title: md.title,
      image: MD_PLACEHOLDER_IMAGE,
      tags: JSON.stringify(md.tags),
      type: "standard",
      ingredients: JSON.stringify(md.ingredients),
      steps: JSON.stringify(md.steps.map((s) => ({ step: s.step, description: s.description }))),
      chef_tips: JSON.stringify({
        text: "",
        url: md.sourceUrl || "",
      }),
      is_weekly_favorite: 0,
      is_draft: 0,
    };

    // Check if already exists
    const [existing] = await db.query<RowDataPacket[]>(
      "SELECT id FROM recipes WHERE id = ?",
      [md.id]
    );

    if (existing.length > 0) {
      // Already imported — skip (preserves user edits)
      continue;
    }

    try {
      await db.query(
        `INSERT INTO recipes (id, title, image, tags, type, ingredients, steps, chef_tips, is_weekly_favorite, is_draft)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.title,
          row.image,
          row.tags,
          row.type,
          row.ingredients,
          row.steps,
          row.chef_tips,
          row.is_weekly_favorite,
          row.is_draft,
        ]
      );
      console.log(`✅ Imported markdown recipe: ${md.title}`);
    } catch (error: any) {
      console.error(`Error importing markdown recipe "${md.title}":`, error.message);
    }
  }
}
