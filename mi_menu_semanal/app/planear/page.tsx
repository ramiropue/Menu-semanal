import { PlannerClient } from "@/components/planner/PlannerClient";
import { getCombinedRecipes } from "@/lib/recipes/recipeService";

export const dynamic = 'force-dynamic';

export default async function PlannerPage() {
  // Obtener todas las recetas combinadas (Supabase + Markdown manifest) de forma puramente lectura
  const combined = await getCombinedRecipes();
  const recipes = combined.map((rec) => ({
    id: rec.id,
    title: rec.title,
    image: rec.image,
    type: rec.type,
    tags: rec.tags || [],
    time: rec.time,
    calories: rec.calories !== undefined ? String(rec.calories) : undefined,
    category_id: rec.category_id,
    ingredients: rec.ingredients,
  }));

  return <PlannerClient recipes={recipes} />;
}
