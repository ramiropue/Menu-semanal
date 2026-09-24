import { describe, it, expect, vi } from "vitest";
import {
  getCombinedRecipes,
  getCombinedRecipeById,
  dbRowToRecipe,
  markdownRecipeToRecipe,
} from "@/lib/recipes/recipeService";
import { getMarkdownRecipes } from "@/lib/markdownRecipes";
import type { SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

function createMockSupabase(
  dbRows: Record<string, unknown>[] = [],
  options: { error?: { message: string; code?: string } | null; networkError?: Error | null } = {}
) {
  const insertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
  const updateSpy = vi.fn().mockResolvedValue({ data: null, error: null });
  const upsertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
  const deleteSpy = vi.fn().mockResolvedValue({ data: null, error: null });

  const client = {
    from: vi.fn(() => {
      if (options.networkError) {
        throw options.networkError;
      }

      return {
        select: vi.fn(() => {
          if (options.networkError) {
            throw options.networkError;
          }

          return {
            eq: vi.fn((col: string, val: unknown) => {
              if (options.error) {
                return {
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: null,
                    error: options.error,
                  }),
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: options.error,
                  }),
                };
              }
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
            data: options.error ? null : dbRows,
            error: options.error || null,
            then: (resolve: (val: { data: Record<string, unknown>[] | null; error: unknown }) => void) =>
              resolve({
                data: options.error ? null : dbRows,
                error: options.error || null,
              }),
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

  it("throws error when SupabaseClient is not provided", async () => {
    // @ts-expect-error Testing missing client runtime guard
    await expect(getCombinedRecipes(null)).rejects.toThrow(
      "An authenticated SupabaseClient is required"
    );
    // @ts-expect-error Testing missing client runtime guard
    await expect(getCombinedRecipeById(null, "some-id")).rejects.toThrow(
      "An authenticated SupabaseClient is required"
    );
  });

  it("includes 'Tacos Big Mac' in catalog when Supabase does not contain 'md-tacos-big-mac'", async () => {
    const mockSupabase = createMockSupabase([]);

    const recipes = await getCombinedRecipes(mockSupabase, {
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
    };

    const mockSupabase = createMockSupabase([userEditedTacos]);

    const recipes = await getCombinedRecipes(mockSupabase, {
      forceManifest: true,
    });

    const tacos = recipes.filter((r) => r.id === "md-tacos-big-mac");
    expect(tacos).toHaveLength(1);
    expect(tacos[0].title).toBe("Tacos Big Mac (Edición Casera Personalizada)");
    expect(tacos[0].source).toBe("supabase");
    expect(tacos[0].servings).toBe(2);
  });

  it("contains strictly unique IDs across the entire returned list", async () => {
    const existingDbRecipes = [
      { id: "md-arroz-meloso-de-pulpo-y-gambones", title: "Pulpo DB", tags: [] },
      { id: "db-custom-pasta", title: "Pasta Custom", tags: [] },
    ];

    const mockSupabase = createMockSupabase(existingDbRecipes);

    const recipes = await getCombinedRecipes(mockSupabase, {
      forceManifest: true,
    });

    const ids = recipes.map((r) => r.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it("never executes insert, update, upsert, or delete on Supabase client during getCombinedRecipes", async () => {
    const mockSupabase = createMockSupabase([]);

    await getCombinedRecipes(mockSupabase, {
      forceManifest: true,
    });

    expect(mockSupabase.insertSpy).not.toHaveBeenCalled();
    expect(mockSupabase.updateSpy).not.toHaveBeenCalled();
    expect(mockSupabase.upsertSpy).not.toHaveBeenCalled();
    expect(mockSupabase.deleteSpy).not.toHaveBeenCalled();
  });

  it("planner can resolve a recipe originating only from the markdown manifest", async () => {
    const mockSupabase = createMockSupabase([]);
    const recipes = await getCombinedRecipes(mockSupabase, {
      forceManifest: true,
    });

    const plannedRecipe = recipes.find((r) => r.id === "md-tacos-big-mac");
    expect(plannedRecipe).toBeDefined();
    expect(plannedRecipe?.title).toBe("Tacos Big Mac");
    expect(plannedRecipe?.ingredients).toBeDefined();
    expect(plannedRecipe?.ingredients?.length).toBeGreaterThan(0);
  });

  describe("Error propagation & discrimination", () => {
    it("1. Fila encontrada: Supabase returns existing row", async () => {
      const dbRow = {
        id: "recipe-db-1",
        title: "Lentejas Caseras",
        time: "45 min",
        ingredients: [{ cantidad: "200g", ingrediente: "Lentejas" }],
        steps: [{ step: 1, description: "Cocer" }],
      };
      const mockSupabase = createMockSupabase([dbRow]);
      const detail = await getCombinedRecipeById(mockSupabase, "recipe-db-1");

      expect(detail).not.toBeNull();
      expect(detail!.id).toBe("recipe-db-1");
      expect(detail!.title).toBe("Lentejas Caseras");
      expect(detail!.source).toBe("supabase");
    });

    it("2. Consulta correcta sin fila: falls back to markdown (e.g. md-tacos-big-mac)", async () => {
      const mockSupabase = createMockSupabase([]);
      const detail = await getCombinedRecipeById(mockSupabase, "md-tacos-big-mac", {
        forceManifest: true,
      });

      expect(detail).not.toBeNull();
      expect(detail!.id).toBe("md-tacos-big-mac");
      expect(detail!.title).toBe("Tacos Big Mac");
      expect(detail!.source).toBe("markdown");
    });

    it("3. Consulta correcta sin fila en DB ni en Markdown: returns null", async () => {
      const mockSupabase = createMockSupabase([]);
      const detail = await getCombinedRecipeById(mockSupabase, "non-existent-recipe", {
        forceManifest: true,
      });

      expect(detail).toBeNull();
    });

    it("4. Usuario no autorizado (401 / 403): throws error and NEVER falls back to partial markdown catalog", async () => {
      const unauthClient = createMockSupabase([], {
        error: { message: "Invalid JWT token or session expired", code: "401" },
      });

      await expect(getCombinedRecipes(unauthClient)).rejects.toThrow(
        "Supabase recipes fetch error: Invalid JWT token or session expired (code: 401)"
      );

      await expect(getCombinedRecipeById(unauthClient, "md-tacos-big-mac")).rejects.toThrow(
        'Supabase recipe lookup for "md-tacos-big-mac" failed: Invalid JWT token or session expired (code: 401)'
      );
    });

    it("5. Error SQL / RLS (42501): throws error and does not hide permission violation", async () => {
      const rlsErrorClient = createMockSupabase([], {
        error: { message: "permission denied for table recipes", code: "42501" },
      });

      await expect(getCombinedRecipes(rlsErrorClient)).rejects.toThrow(
        "Supabase recipes fetch error: permission denied for table recipes (code: 42501)"
      );

      await expect(getCombinedRecipeById(rlsErrorClient, "some-id")).rejects.toThrow(
        "permission denied for table recipes (code: 42501)"
      );
    });

    it("6. Error de red: throws error and does not swallow network failure", async () => {
      const networkErrorClient = createMockSupabase([], {
        networkError: new Error("Failed to fetch: Connection reset by peer"),
      });

      await expect(getCombinedRecipes(networkErrorClient)).rejects.toThrow(
        "Failed to fetch: Connection reset by peer"
      );

      await expect(getCombinedRecipeById(networkErrorClient, "md-tacos-big-mac")).rejects.toThrow(
        "Failed to fetch: Connection reset by peer"
      );
    });
  });

  describe("Architectural enforcement — No legacy anonymous client imports", () => {
    it("ensures protected pages and read service do NOT import the legacy anonymous singleton", () => {
      const filesToCheck = [
        "app/page.tsx",
        "app/planear/page.tsx",
        "app/recetas/[id]/page.tsx",
        "app/recetas/nueva/page.tsx",
        "app/categorias/page.tsx",
        "lib/recipes/recipeService.ts",
        "lib/markdownRecipes.ts",
        "components/recipes/RecipeActions.tsx",
        "components/planner/AssignToPlannerModal.tsx",
      ];

      for (const relPath of filesToCheck) {
        const fullPath = path.resolve(__dirname, "../../", relPath);
        expect(fs.existsSync(fullPath)).toBe(true);
        const content = fs.readFileSync(fullPath, "utf-8");

        // Must not import from "@/lib/supabase" or '@/lib/supabase' directly
        const forbiddenImportRegex = /from\s+['"]@\/lib\/supabase['"]/g;
        const matches = content.match(forbiddenImportRegex);
        expect(
          matches,
          `File "${relPath}" must not import from legacy "@lib/supabase". Found: ${matches}`
        ).toBeNull();
      }
    });
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
