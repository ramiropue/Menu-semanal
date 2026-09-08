import { PlannerClient } from "@/components/planner/PlannerClient";
import db from "@/lib/db";
import { RowDataPacket } from "mysql2";

export const dynamic = 'force-dynamic';

export default async function PlannerPage() {
  // Obtener todas las recetas para pasarlas al componente cliente
  const [recipesData] = await db.query<RowDataPacket[]>("SELECT * FROM recipes");
  
  const recipes = (recipesData || []).map((rec: any) => ({
    id: rec.id,
    title: rec.title,
    image: rec.image,
    type: rec.type,
    tags: typeof rec.tags === 'string' ? JSON.parse(rec.tags) : (rec.tags || []),
    time: rec.time,
    calories: rec.calories,
    category_id: rec.category_id,
    ingredients: typeof rec.ingredients === 'string' ? JSON.parse(rec.ingredients) : (rec.ingredients || [])
  }));

  return <PlannerClient recipes={recipes} />;
}
