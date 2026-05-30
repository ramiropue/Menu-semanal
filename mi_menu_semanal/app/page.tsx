import { Header } from "@/components/ui/Header";
import { BottomNav } from "@/components/ui/BottomNav";
import { FAB } from "@/components/ui/FAB";
import { HomeContent } from "@/components/recipes/HomeContent";
import { supabase } from "@/lib/supabase";
import { Category, Recipe } from "@/data/mockData";

export const dynamic = 'force-dynamic';

export default async function Home() {
  // Categorías fijas sin necesidad de usar la base de datos
  const categories: Category[] = [
    { id: '0', name: 'Todas', icon: 'grid_view' },
    { id: '1', name: 'Favoritas', icon: 'favorite' },
    { id: '2', name: 'Entrantes', icon: 'restaurant' },
    { id: '3', name: 'Desayuno', icon: 'breakfast_dining' },
    { id: '4', name: 'Carne', icon: 'set_meal' },
    { id: '5', name: 'Pescado', icon: 'phishing' },
    { id: '6', name: 'Ensaladas', icon: 'nutrition' },
    { id: '7', name: 'Postres', icon: 'icecream' },
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
    <div className="h-full w-full overflow-y-auto flex flex-col bg-background relative">
      <Header />
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 pt-8 pb-32 md:pb-12">
        <HomeContent initialCategories={categories} initialRecipes={recipes} />
      </main>
      <BottomNav />
      <FAB />
    </div>
  );
}
