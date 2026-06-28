import { Header } from "@/components/ui/Header";
import { BottomNav } from "@/components/ui/BottomNav";
import { FAB } from "@/components/ui/FAB";
import { HomeContent } from "@/components/recipes/HomeContent";
import { supabase } from "@/lib/supabase";
import { Category, Recipe } from "@/data/mockData";

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { data: dbCategories } = await supabase.from("categories").select("*").not("id", "in", '("_PLANNER_STATE_","_FREEZER_STATE_","_SHOPPING_LIST_STATE_","_FAVORITES_STATE_")').order("sort_order");
  
  const categories: Category[] = [
    { id: 'todas', name: 'Todas', icon: 'grid_view' },
    { id: 'favoritas', name: 'Favoritas', icon: 'favorite' },
    ...(dbCategories || []).map(c => ({
      id: c.id,
      name: c.name,
      icon: c.icon
    }))
  ];

  // Fetch recipes from Supabase
  const { data: recipesData } = await supabase.from("recipes").select("*");

  const recipes: Recipe[] = (recipesData || []).map((rec) => ({
    id: rec.id,
    title: rec.title,
    image: rec.image,
    tags: rec.tags,
    type: rec.type,
    time: rec.time,
    rating: rec.rating,
    isWeeklyFavorite: rec.is_weekly_favorite,
    is_favorite: rec.is_favorite,
    servings: rec.servings,
    calories: rec.calories,
    description: rec.description,
    category_id: rec.category_id,
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
