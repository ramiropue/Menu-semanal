import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RecipeActions } from "@/components/recipes/RecipeActions";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

// Mock supabase client
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: vi.fn(() => ({
      delete: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    })),
  }),
}));

describe("RecipeActions Component Contract", () => {
  it("renders discrete notice and NO mutation buttons when recipe.source is 'markdown'", () => {
    const html = renderToStaticMarkup(
      <RecipeActions recipeId="md-tacos-big-mac" source="markdown" />
    );

    // Must show discrete notice
    expect(html).toContain("Receta administrada desde RecetasNOTAS");
    expect(html).toContain("data-testid=\"markdown-recipe-notice\"");

    // Must NOT render Modificar or Eliminar buttons
    expect(html).not.toContain("Modificar");
    expect(html).not.toContain("Eliminar");
    expect(html).not.toContain("data-testid=\"supabase-recipe-actions\"");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("/recetas/nueva?edit=");
  });

  it("renders Modificar and Eliminar buttons when recipe.source is 'supabase'", () => {
    const html = renderToStaticMarkup(
      <RecipeActions recipeId="db-receta-paella" source="supabase" />
    );

    // Must render action buttons
    expect(html).toContain("Modificar");
    expect(html).toContain("Eliminar");
    expect(html).toContain("data-testid=\"supabase-recipe-actions\"");
    expect(html).toContain("/recetas/nueva?edit=db-receta-paella");
    expect(html).toContain("<button");

    // Must NOT show markdown notice
    expect(html).not.toContain("Receta administrada desde RecetasNOTAS");
    expect(html).not.toContain("data-testid=\"markdown-recipe-notice\"");
  });

  it("defaults to supabase actions when source is undefined (legacy compatibility)", () => {
    const html = renderToStaticMarkup(
      <RecipeActions recipeId="rec-standard-legacy" />
    );

    expect(html).toContain("Modificar");
    expect(html).toContain("Eliminar");
    expect(html).not.toContain("Receta administrada desde RecetasNOTAS");
  });
});
