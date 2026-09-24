import { describe, it, expect, vi } from "vitest";
import {
  getCombinedRecipes,
  getCombinedRecipeById,
  dbRowToRecipe,
  markdownRecipeToRecipe,
} from "@/lib/recipes/recipeService";
import { getMarkdownRecipes } from "@/lib/markdownRecipes";
import type { SupabaseClient } from "@supabase/supabase-js";

function createMockSupabase(dbRows: Record<string, unknown>[] = []) {
  const insertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
  const updateSpy = vi.fn().mockResolvedValue({ data: null, error: null });
  const upsertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
  const deleteSpy = vi.fn().mockResolvedValue({ data: null, error: null });

  const client = {
    from: vi.fn(() => {
      return {
        select: vi.fn(() => {
          return {
            eq: vi.fn((col: string, val: unknown) => {
              const matching = dbRows.find((r) => r[col] === val);
              return {
                maybeSingle: vi.fn().mockResolvedValue({
                  data: matching || null,
                  error: null,
                }),
                single: vi.fn().mockResolvedValue({
                  data: matching || null,
                  error: matching ? null : { message: "Row not found", code: "PGRST116" },
                }),
              };
            }),
            data: dbRows,
            error: null,
            then: (resolve: (val: { data: Record<string, unknown>[]; error: null }) => void) =>
              resolve({ data: dbRows, error: null }),
          };
        }),
        insert: insertSpy,
        update: updateSpy,
        upsert: upsertSpy,
        delete: deleteSpy,
      };
    }),
    insertSpy,
    updateSpy,
    upsertSpy,
    deleteSpy,
  } as unknown as SupabaseClient & {
    insertSpy: ReturnType<typeof vi.fn>;
    updateSpy: ReturnType<typeof vi.fn>;
    upsertSpy: ReturnType<typeof vi.fn>;
    deleteSpy: ReturnType<typeof vi.fn>;
  };

  return client;
}

describe("RecipeService — Combined Read Layer without GET Writes", () => {
  it("detects all 5 current Markdown recipes", () => {
    const mdRecipes = getMarkdownRecipes();
    expect(mdRecipes).toHaveLength(5);
    const ids = mdRecipes.map((r) => r.id);
    expect(ids).toContain("md-tacos-big-mac");
  });

  it("includes 'Tacos Big Mac' in catalog when Supabase does not contain 'md-tacos-big-mac'", async () => {
    const mockSupabase = createMockSupabase([]);

    const recipes = await getCombinedRecipes({
      client: mockSupabase,
      forceManifest: true,
    });

    const tacos = recipes.find((r) => r.id === "md-tacos-big-mac");
    expect(tacos).toBeDefined();
    expect(tacos?.title).toBe("Tacos Big Mac");
    expect(tacos?.source).toBe("markdown");
    expect(tacos?.ingredients).toHaveLength(6);
    expect(tacos?.steps).toHaveLength(6);
  });

  it("prioritizes Supabase recipe over Markdown when IDs match (preserves user edits)", async () => {
    const userEditedTacos = {
      id: "md-tacos-big-mac",
      title: "Tacos Big Mac (Edición Casera Personalizada)",
      image: "https://example.com/custom-tacos.jpg",
      tags: ["Favoritas", "Nota"],
      type: "featured",
      time: "20 min",
      rating: 5,
      is_weekly_favorite: true,
      is_favorite: true,
      servings: 2,
      calories: 550,
      description: "Versión con carne smash picada",
      category_id: "4",
      category_ids: ["4"],
      ingredients: [{ cantidad: "4", ingrediente: "Tortillas de maíz" }],
      steps: [{ step: 1, description: "Dorar tortillas" }],
      chef_tips: "Usar carne con 20% de grasa",
    };

    const mockSupabase = createMockSupabase([userEditedTacos]);

    const recipes = await getCombinedRecipes({
      client: mockSupabase,
      forceManifest: true,
    });

    const matching = recipes.filter((r) => r.id === "md-tacos-big-mac");
    // Exactly 1 recipe for this ID
    expect(matching).toHaveLength(1);

    const recipe = matching[0];
    expect(recipe.title).toBe("Tacos Big Mac (Edición Casera Personalizada)");
    expect(recipe.image).toBe("https://example.com/custom-tacos.jpg");
    expect(recipe.source).toBe("supabase");
    expect(recipe.time).toBe("20 min");
    expect(recipe.is_favorite).toBe(true);
    expect(recipe.isWeeklyFavorite).toBe(true);
  });

  it("guarantees strictly unique IDs across combined recipes", async () => {
    const existingDbRecipe = {
      id: "md-arroz-meloso-de-pulpo-y-gambones",
      title: "Arroz meloso en BD",
      image: "https://example.com/arroz.jpg",
      tags: ["Arroz"],
      type: "standard",
    };

    const mockSupabase = createMockSupabase([existingDbRecipe]);
    const recipes = await getCombinedRecipes({
      client: mockSupabase,
      forceManifest: true,
    });

    const ids = recipes.map((r) => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(recipes.length);
  });

  it("never executes INSERT, UPDATE, UPSERT, or DELETE during catalog and detail lookups", async () => {
    const mockSupabase = createMockSupabase([]);

    // 1. Load catalog
    await getCombinedRecipes({
      client: mockSupabase,
      forceManifest: true,
    });

    // 2. Load detail of existing markdown recipe
    await getCombinedRecipeById("md-tacos-big-mac", {
      client: mockSupabase,
      forceManifest: true,
    });

    // 3. Load detail of non-existent recipe
    await getCombinedRecipeById("non-existent-id", {
      client: mockSupabase,
      forceManifest: true,
    });

    // Verify ZERO writes occurred
    expect(mockSupabase.insertSpy).not.toHaveBeenCalled();
    expect(mockSupabase.updateSpy).not.toHaveBeenCalled();
    expect(mockSupabase.upsertSpy).not.toHaveBeenCalled();
    expect(mockSupabase.deleteSpy).not.toHaveBeenCalled();
  });

  it("allows planner to resolve a recipe originating only from the manifest", async () => {
    const mockSupabase = createMockSupabase([]);
    const recipes = await getCombinedRecipes({
      client: mockSupabase,
      forceManifest: true,
    });

    // Planner lookup simulation: finding a recipe by ID in planner recipes list
    const plannedRecipe = recipes.find((r) => r.id === "md-tacos-big-mac");
    expect(plannedRecipe).toBeDefined();
    expect(plannedRecipe?.title).toBe("Tacos Big Mac");
    expect(plannedRecipe?.ingredients).toBeDefined();
    expect(plannedRecipe?.ingredients?.length).toBeGreaterThan(0);
  });

  it("correctly resolves recipe detail for markdown fallback", async () => {
    const mockSupabase = createMockSupabase([]);
    const detail = await getCombinedRecipeById("md-tacos-big-mac", {
      client: mockSupabase,
      forceManifest: true,
    });

    expect(detail).not.toBeNull();
    expect(detail!.id).toBe("md-tacos-big-mac");
    expect(detail!.title).toBe("Tacos Big Mac");
    expect(detail!.ingredients).toHaveLength(6);
    expect(detail!.steps).toHaveLength(6);
    expect(detail!.source).toBe("markdown");
    expect(detail!.chef_tips).toContain("https://vm.tiktok.com/ZN8MXJPFE/");
  });

  it("returns null when recipe does not exist in Supabase or Markdown", async () => {
    const mockSupabase = createMockSupabase([]);
    const detail = await getCombinedRecipeById("unknown-recipe-999", {
      client: mockSupabase,
      forceManifest: true,
    });

    expect(detail).toBeNull();
  });

  it("centralizes conversion helpers dbRowToRecipe and markdownRecipeToRecipe", () => {
    const row = {
      id: "rec-123",
      title: "Receta Test",
      image: "test.jpg",
      tags: ["Test"],
      type: "featured",
      time: "15 min",
      rating: "4.5",
      is_weekly_favorite: true,
      is_favorite: true,
      servings: 2,
      calories: 400,
      description: "Desc",
      category_id: "cat-1",
      category_ids: ["cat-1", "cat-2"],
      ingredients: [{ cantidad: "1", ingrediente: "Sal" }],
      steps: [{ step: 1, description: "Mezclar" }],
      chef_tips: "Tip",
    };

    const converted = dbRowToRecipe(row);
    expect(converted.id).toBe("rec-123");
    expect(converted.rating).toBe(4.5);
    expect(converted.isWeeklyFavorite).toBe(true);
    expect(converted.category_ids).toEqual(["cat-1", "cat-2"]);

    const md = {
      id: "md-test",
      title: "Markdown Test",
      ingredients: [{ cantidad: "100g", ingrediente: "Azúcar" }],
      steps: [{ step: 1, description: "Batir" }],
      tags: ["Dulce"],
      links: [],
      sourceUrl: "https://example.com/video",
      sections: {},
      rawContent: "",
    };

    const convertedMd = markdownRecipeToRecipe(md);
    expect(convertedMd.id).toBe("md-test");
    expect(convertedMd.source).toBe("markdown");
    expect(convertedMd.tags).toEqual(["Dulce"]);
    expect(convertedMd.chef_tips).toContain("https://example.com/video");
  });
});
