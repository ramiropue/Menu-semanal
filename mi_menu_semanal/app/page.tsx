import { Header } from "@/components/ui/Header";
import { BottomNav } from "@/components/ui/BottomNav";
import { FAB } from "@/components/ui/FAB";
import { HomeContent } from "@/components/recipes/HomeContent";
import db from "@/lib/db";
import { Category, Recipe } from "@/data/mockData";
import { importMarkdownToDatabase } from "@/lib/markdownRecipes";
import { RowDataPacket } from "mysql2";

export const dynamic = 'force-dynamic';

export default async function Home() {
  // Auto-import markdown recipes to MariaDB (idempotent — skips existing)
  await importMarkdownToDatabase();

  // Fetch categories (excluding internal state keys)
  const [dbCategories] = await db.query<RowDataPacket[]>(
    `SELECT * FROM categories 
     WHERE id NOT IN ('_PLANNER_STATE_', '_FREEZER_STATE_', '_SHOPPING_LIST_STATE_', '_FAVORITES_STATE_')
     ORDER BY sort_order, id`
  );
  
  const categories: Category[] = [
    { id: 'todas', name: 'Todas', icon: 'grid_view' },
    { id: 'favoritas', name: 'Favoritas', icon: 'favorite' },
    { id: 'notas', name: 'Notas', icon: 'description' },
    ...(dbCategories || []).map(c => ({
      id: c.id,
      name: c.name,
      icon: c.icon
    }))
  ];

  // Fetch ALL recipes from MariaDB (markdown recipes are now included)
  const [recipesData] = await db.query<RowDataPacket[]>("SELECT * FROM recipes");

  const recipes: Recipe[] = (recipesData || []).map((rec) => ({
    id: rec.id,
    title: rec.title,
    image: rec.image,
    tags: typeof rec.tags === 'string' ? JSON.parse(rec.tags) : (rec.tags || []),
    type: rec.type,
    time: rec.time,
    rating: rec.rating ? Number(rec.rating) : undefined,
    isWeeklyFavorite: !!rec.is_weekly_favorite,
    is_favorite: !!rec.is_favorite,
    servings: rec.servings,
    calories: rec.calories,
    description: rec.description,
    category_id: rec.category_id,
    category_ids: typeof rec.category_ids === 'string' ? JSON.parse(rec.category_ids) : (rec.category_ids || (rec.category_id ? [rec.category_id] : [])),
  }));

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden flex flex-col bg-background relative font-plus-jakarta text-[#2A4B4C]">
      <Header />
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 pt-8 pb-32 md:pb-12">
        <HomeContent initialCategories={categories} initialRecipes={recipes} />
      </main>
      <BottomNav />
      <FAB />
    </div>
  );
}
