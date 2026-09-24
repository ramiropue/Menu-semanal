import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  generateRecipeManifest,
  validateRecipe,
} from "../../scripts/generate_recipe_manifest.mjs";

describe("Hardened Manifest Generator", () => {
  let tempDir: string;
  let manifestPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "recipe-manifest-test-"));
    manifestPath = path.join(tempDir, "data", "markdownRecipesManifest.json");
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    // Write an existing non-empty manifest to verify it is NOT wiped on error
    fs.writeFileSync(manifestPath, JSON.stringify([{ id: "md-existing" }], null, 2), "utf-8");
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("throws clear error when source directory does not exist and does NOT wipe existing manifest", () => {
    const nonExistentDir = path.join(tempDir, "nonexistent_recetas");

    expect(() => {
      generateRecipeManifest({
        sourceDir: nonExistentDir,
        manifestPath,
        allowMissingSource: false,
        exitOnError: false,
      });
    }).toThrowError(/Source directory RecetasNOTAS not found/);

    // Verify existing manifest was preserved intact
    const content = fs.readFileSync(manifestPath, "utf-8");
    expect(content).toContain("md-existing");
  });

  it("preserves manifest without throwing when allowMissingSource is true", () => {
    const nonExistentDir = path.join(tempDir, "nonexistent_recetas");

    const result = generateRecipeManifest({
      sourceDir: nonExistentDir,
      manifestPath,
      allowMissingSource: true,
      exitOnError: false,
    });

    expect(result.success).toBe(true);
    expect(result.preserved).toBe(true);

    const content = fs.readFileSync(manifestPath, "utf-8");
    expect(content).toContain("md-existing");
  });

  it("validates that a recipe must have a non-empty title", () => {
    const invalid = {
      id: "md-no-title",
      title: "",
      ingredients: [{ cantidad: "1", ingrediente: "Tomate" }],
      steps: [{ step: 1, description: "Cortar" }],
    };

    expect(() => validateRecipe(invalid, "test.md")).toThrowError(/missing a title/);
  });

  it("validates that a recipe must have at least one valid ingredient", () => {
    const noIngredients = {
      id: "md-no-ingredients",
      title: "Receta Sin Ingredientes",
      ingredients: [],
      steps: [{ step: 1, description: "Cocinar" }],
    };
    expect(() => validateRecipe(noIngredients, "test.md")).toThrowError(/has no ingredients/);

    const blankIngredient = {
      id: "md-blank-ingredient",
      title: "Receta Ingrediente Vacío",
      ingredients: [{ cantidad: "1", ingrediente: "   " }],
      steps: [{ step: 1, description: "Cocinar" }],
    };
    expect(() => validateRecipe(blankIngredient, "test.md")).toThrowError(/blank ingredient name/);
  });

  it("validates that a recipe must have at least one valid step", () => {
    const noSteps = {
      id: "md-no-steps",
      title: "Receta Sin Pasos",
      ingredients: [{ cantidad: "1", ingrediente: "Arroz" }],
      steps: [],
    };
    expect(() => validateRecipe(noSteps, "test.md")).toThrowError(/has no preparation steps/);

    const blankStep = {
      id: "md-blank-step",
      title: "Receta Paso Vacío",
      ingredients: [{ cantidad: "1", ingrediente: "Arroz" }],
      steps: [{ step: 1, description: "   " }],
    };
    expect(() => validateRecipe(blankStep, "test.md")).toThrowError(/blank step description/);
  });

  it("detects duplicate recipe IDs and throws descriptive error", () => {
    const notesDir = path.join(tempDir, "RecetasNOTAS");
    fs.mkdirSync(path.join(notesDir, "Recipe1"), { recursive: true });
    fs.mkdirSync(path.join(notesDir, "Recipe2"), { recursive: true });

    const mdContent = "# Misma Receta\n## Ingredientes\n* 100g de pasta\n## Pasos\n1. Hervir agua";
    fs.writeFileSync(path.join(notesDir, "Recipe1", "Recipe1.md"), mdContent, "utf-8");
    fs.writeFileSync(path.join(notesDir, "Recipe2", "Recipe2.md"), mdContent, "utf-8");

    expect(() => {
      generateRecipeManifest({
        sourceDir: notesDir,
        manifestPath,
        exitOnError: false,
      });
    }).toThrowError(/Duplicate recipe ID detected: "md-misma-receta"/);
  });

  it("writes manifest atomically and sorts recipes deterministically by ID", () => {
    const notesDir = path.join(tempDir, "RecetasNOTAS");
    fs.mkdirSync(path.join(notesDir, "B_Recipe"), { recursive: true });
    fs.mkdirSync(path.join(notesDir, "A_Recipe"), { recursive: true });

    fs.writeFileSync(
      path.join(notesDir, "B_Recipe", "B.md"),
      "# Zeta Receta\n## Ingredientes\n* Sal\n## Pasos\n1. Servir",
      "utf-8"
    );
    fs.writeFileSync(
      path.join(notesDir, "A_Recipe", "A.md"),
      "# Alfa Receta\n## Ingredientes\n* Pimienta\n## Pasos\n1. Moler",
      "utf-8"
    );

    const result = generateRecipeManifest({
      sourceDir: notesDir,
      manifestPath,
      exitOnError: false,
    });

    expect(result.success).toBe(true);
    expect(result.recipes).toHaveLength(2);

    // Sorted by ID: md-alfa-receta then md-zeta-receta
    expect(result.recipes[0].id).toBe("md-alfa-receta");
    expect(result.recipes[1].id).toBe("md-zeta-receta");

    // File on disk matches
    const written = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(written[0].id).toBe("md-alfa-receta");
    expect(written[1].id).toBe("md-zeta-receta");
  });
});
