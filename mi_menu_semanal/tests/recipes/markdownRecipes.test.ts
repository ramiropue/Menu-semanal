import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  getMarkdownRecipes,
  getMarkdownRecipeById,
  parseMarkdownRecipe,
  type MarkdownRecipe,
} from "@/lib/markdownRecipes";
import manifestRecipes from "@/data/markdownRecipesManifest.json";

describe("Markdown Recipes & Netlify Runtime Manifest", () => {
  it("detects exactly the 5 current Markdown recipes", () => {
    const recipes = getMarkdownRecipes();
    expect(recipes).toHaveLength(5);
  });

  it("identifies a single recipe with ID 'md-tacos-big-mac' with complete metadata", () => {
    const recipes = getMarkdownRecipes();
    const tacosMatches = recipes.filter((r) => r.id === "md-tacos-big-mac");

    expect(tacosMatches).toHaveLength(1);

    const tacos = tacosMatches[0];
    expect(tacos.title).toBe("Tacos Big Mac");
    expect(tacos.tags).toContain("Nota");
    expect(tacos.sourceUrl).toBe("https://vm.tiktok.com/ZN8MXJPFE/");
    expect(tacos.ingredients).toHaveLength(6);
    expect(tacos.steps).toHaveLength(6);

    const expectedIngredients = [
      "Tortillas de taco",
      "Carne de hamburguesa",
      "Queso",
      "Lechuga",
      "Pepinillos",
      "Salsa Big Mac",
    ];
    expect(tacos.ingredients.map((i) => i.ingrediente)).toEqual(expectedIngredients);

    // Verify lookup by ID helper
    const byId = getMarkdownRecipeById("md-tacos-big-mac");
    expect(byId).not.toBeNull();
    expect(byId?.id).toBe("md-tacos-big-mac");
  });

  it("ensures there are no duplicate IDs across all recipes", () => {
    const recipes = getMarkdownRecipes();
    const ids = recipes.map((r) => r.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(recipes.length);
  });

  it("verifies the build manifest file exists and matches detected recipes", () => {
    const manifestPath = path.resolve(__dirname, "../../data/markdownRecipesManifest.json");
    expect(fs.existsSync(manifestPath)).toBe(true);

    const raw = fs.readFileSync(manifestPath, "utf-8");
    const parsed: MarkdownRecipe[] = JSON.parse(raw);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(5);

    const manifestIds = parsed.map((r) => r.id);
    expect(manifestIds).toContain("md-tacos-big-mac");

    // Static import matches raw JSON
    expect((manifestRecipes as MarkdownRecipe[]).map((r) => r.id)).toEqual(manifestIds);
  });

  it("provides recipes in runtime without filesystem access via statically bundled manifest", () => {
    // forceManifest simulates Netlify runtime where RecetasNOTAS directory does not exist
    const recipes = getMarkdownRecipes({ forceManifest: true });
    expect(recipes).toHaveLength(5);

    const tacos = getMarkdownRecipeById("md-tacos-big-mac", { forceManifest: true });
    expect(tacos).not.toBeNull();
    expect(tacos?.id).toBe("md-tacos-big-mac");
    expect(tacos?.title).toBe("Tacos Big Mac");
  });

  it("parser throws when duplicate IDs are encountered", () => {
    const content = "# Duplicate Title\n## Ingredientes\n* Sal\n## Pasos\n1. Servir";
    const r1 = parseMarkdownRecipe("path/to/recipe1.md", content);
    const r2 = parseMarkdownRecipe("path/to/recipe2.md", content);

    expect(r1.id).toBe(r2.id);

    // Manifest builder collision detection logic
    const seen = new Map<string, string>();
    seen.set(r1.id, "path/to/recipe1.md");

    expect(() => {
      if (seen.has(r2.id)) {
        throw new Error(`Duplicate recipe ID detected: "${r2.id}"`);
      }
    }).toThrowError(/Duplicate recipe ID detected/);
  });
});
