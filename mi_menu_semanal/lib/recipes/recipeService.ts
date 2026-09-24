import { supabase as defaultSupabase } from "@/lib/supabase";
import { Recipe } from "@/data/mockData";
import {
  getMarkdownRecipes,
  getMarkdownRecipeById,
  type MarkdownRecipe,
} from "@/lib/markdownRecipes";
import type { SupabaseClient } from "@supabase/supabase-js";

export const MD_PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&q=80&w=800";

export interface RecipeDetail {
  id: string;
  title: string;
  image?: string;
  tags?: string[];
  type?: string;
  time?: string;
  rating?: number | null;
  is_weekly_favorite?: boolean;
  is_favorite?: boolean;
  servings?: number;
  calories?: number | string;
  description?: string | null;
  category_id?: string | null;
  category_ids?: string[];
  categories?: { name?: string; icon?: string } | null;
  ingredients: Recipe["ingredients"];
  steps: Recipe["steps"];
  chef_tips?: string;
  source?: "supabase" | "markdown";
}

/**
 * Converts a database row from the `recipes` table into the unified `Recipe` model.
 */
export function dbRowToRecipe(row: Record<string, unknown>): Recipe {
  const rawType = String(row.type || "standard");
  const validTypes = ["featured", "standard", "horizontal"] as const;
  const type = validTypes.includes(rawType as (typeof validTypes)[number])
    ? (rawType as (typeof validTypes)[number])
    : "standard";

  return {
    id: String(row.id),
    title: String(row.title || ""),
    image: (row.image as string) || MD_PLACEHOLDER_IMAGE,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    type,
    time: String(row.time || "30 min"),
    rating: row.rating ? Number(row.rating) : undefined,
    isWeeklyFavorite: !!row.is_weekly_favorite,
    is_favorite: !!row.is_favorite,
    servings: typeof row.servings === "number" ? row.servings : 4,
    calories: typeof row.calories === "number" ? row.calories : undefined,
    description: (row.description as string) || undefined,
    category_id: (row.category_id as string) || undefined,
    category_ids: Array.isArray(row.category_ids)
      ? (row.category_ids as string[])
      : row.category_id
      ? [String(row.category_id)]
      : [],
    source: "supabase",
    ingredients: (row.ingredients as Recipe["ingredients"]) || [],
    steps: (row.steps as Recipe["steps"]) || [],
    chef_tips: (row.chef_tips as string) || "",
  };
}

/**
 * Converts a parsed Markdown recipe into the unified `Recipe` model.
 */
export function markdownRecipeToRecipe(md: MarkdownRecipe): Recipe {
  return {
    id: md.id,
    title: md.title,
    image: MD_PLACEHOLDER_IMAGE,
    tags: md.tags && md.tags.length > 0 ? md.tags : ["Nota"],
    type: "standard",
    time: "30 min",
    rating: undefined,
    isWeeklyFavorite: false,
    is_favorite: false,
    servings: 4,
    calories: 620,
    description: undefined,
    category_id: undefined,
    category_ids: [],
    source: "markdown",
    ingredients: md.ingredients,
    steps: md.steps.map((s) => ({
      step: s.step,
      description: s.description,
      title: `Paso ${s.step}`,
    })),
    chef_tips: md.sourceUrl ? JSON.stringify({ text: "", url: md.sourceUrl }) : "",
    markdownContent: {
      ingredients: md.ingredients,
      steps: md.steps,
      links: md.links,
      sourceUrl: md.sourceUrl,
      sections: md.sections,
    },
  };
}

export interface CombinedRecipesOptions {
  client?: SupabaseClient;
  forceManifest?: boolean;
}

/**
 * Pure read-only loader that combines Supabase database rows and Markdown recipes.
 *
 * Rules:
 * 1. Zero DB writes: never executes INSERT, UPDATE, UPSERT, or DELETE.
 * 2. Supabase precedence: if a recipe exists with the same ID in both Supabase
 *    and the Markdown manifest, the Supabase version prevails (preserving user edits).
 * 3. Markdown availability: recipes from the manifest are immediately visible
 *    even when they have not yet been imported or persisted in Supabase.
 * 4. Deduplication: strictly unique IDs across the entire returned list.
 */
export async function getCombinedRecipes(
  options?: CombinedRecipesOptions
): Promise<Recipe[]> {
  const client = options?.client ?? defaultSupabase;

  // 1. Fetch from Supabase
  let dbData: Record<string, unknown>[] | null = null;
  try {
    const res = await client.from("recipes").select("*");
    dbData = res.data as Record<string, unknown>[] | null;
    if (res.error) {
      console.warn("[recipeService] Supabase recipes fetch error:", res.error.message);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[recipeService] Failed to query Supabase recipes:", msg);
  }

  const dbRecipes: Recipe[] = (dbData || []).map(dbRowToRecipe);
  const seenIds = new Set<string>(dbRecipes.map((r) => r.id));

  // 2. Fetch Markdown recipes (from manifest in runtime, or live disk in local dev)
  const mdList = getMarkdownRecipes({ forceManifest: options?.forceManifest });
  const mdRecipes: Recipe[] = [];

  for (const md of mdList) {
    if (seenIds.has(md.id)) {
      // Supabase version takes precedence
      continue;
    }
    seenIds.add(md.id);
    mdRecipes.push(markdownRecipeToRecipe(md));
  }

  return [...dbRecipes, ...mdRecipes];
}

/**
 * Pure read-only loader for a single recipe by ID.
 *
 * Checks Supabase first (joined with categories).
 * Falls back to the Markdown manifest when Supabase does not contain the row.
 * Returns `null` if not found in either source.
 * Never executes database writes during lookups.
 */
export async function getCombinedRecipeById(
  id: string,
  options?: CombinedRecipesOptions
): Promise<RecipeDetail | null> {
  const client = options?.client ?? defaultSupabase;

  // 1. Try Supabase first
  try {
    const { data: dbRecipe, error } = await client
      .from("recipes")
      .select("*, categories(name, icon)")
      .eq("id", id)
      .maybeSingle();

    if (!error && dbRecipe) {
      const row = dbRecipe as Record<string, unknown>;
      return {
        id: String(row.id),
        title: String(row.title || ""),
        image: (row.image as string) || MD_PLACEHOLDER_IMAGE,
        tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
        type: (row.type as string) || "standard",
        time: String(row.time || "30 min"),
        rating: row.rating ? Number(row.rating) : null,
        is_weekly_favorite: !!row.is_weekly_favorite,
        is_favorite: !!row.is_favorite,
        servings: typeof row.servings === "number" ? row.servings : 4,
        calories: typeof row.calories === "number" ? row.calories : (row.calories as string | undefined),
        description: (row.description as string) || null,
        category_id: (row.category_id as string) || null,
        category_ids: Array.isArray(row.category_ids)
          ? (row.category_ids as string[])
          : row.category_id
          ? [String(row.category_id)]
          : [],
        categories: (row.categories as { name?: string; icon?: string } | null) || null,
        ingredients: (row.ingredients as Recipe["ingredients"]) || [],
        steps: (row.steps as Recipe["steps"]) || [],
        chef_tips: (row.chef_tips as string) || "",
        source: "supabase",
      };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[recipeService] Supabase lookup for "${id}" failed:`, msg);
  }

  // 2. Fallback to Markdown
  const mdRecipe = getMarkdownRecipeById(id, { forceManifest: options?.forceManifest });
  if (!mdRecipe) {
    return null;
  }

  // Format markdown recipe to match detail page schema
  return {
    id: mdRecipe.id,
    title: mdRecipe.title,
    image: MD_PLACEHOLDER_IMAGE,
    tags: mdRecipe.tags && mdRecipe.tags.length > 0 ? mdRecipe.tags : ["Nota"],
    type: "standard",
    time: "30 min",
    rating: null,
    is_weekly_favorite: false,
    is_favorite: false,
    servings: 4,
    calories: 620,
    description: null,
    category_id: null,
    category_ids: [],
    categories: null,
    ingredients: mdRecipe.ingredients,
    steps: mdRecipe.steps.map((s) => ({
      step: s.step,
      description: s.description,
      title: `Paso ${s.step}`,
    })),
    chef_tips: mdRecipe.sourceUrl
      ? JSON.stringify({ text: "", url: mdRecipe.sourceUrl })
      : "",
    source: "markdown",
  };
}
