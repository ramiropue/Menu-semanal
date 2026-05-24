import { PlannerClient } from "@/components/planner/PlannerClient";
import { supabase } from "@/lib/supabase";

export const dynamic = 'force-dynamic';

export default async function PlannerPage() {
  // Obtener todas las recetas para pasarlas al componente cliente
  const { data: recipesData } = await supabase.from("recipes").select("*");
  
  const recipes = (recipesData || []).map((rec: any) => ({
    id: rec.id,
    title: rec.title,
    image: rec.image,
    type: rec.type,
    tags: rec.tags || [],
    time: rec.time,
    calories: rec.calories
  }));

  return <PlannerClient recipes={recipes} />;
}
