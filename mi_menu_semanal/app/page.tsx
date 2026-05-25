import { Header } from "@/components/ui/Header";
import { SearchBar } from "@/components/ui/SearchBar";
import { BottomNav } from "@/components/ui/BottomNav";
import { FAB } from "@/components/ui/FAB";
import { CategoryScroll } from "@/components/recipes/CategoryScroll";
import { RecipeGrid } from "@/components/recipes/RecipeGrid";
import { supabase } from "@/lib/supabase";
import { Category, Recipe } from "@/data/mockData";

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { data: categoriesData } = await supabase.from("categories").select("*");
  const { data: recipesData } = await supabase.from("recipes").select("*");

  const categories: Category[] = (categoriesData || []).map((cat) => ({
    id: cat.id,
    name: cat.name,
    icon: cat.icon,
    isActive: cat.is_active,
  }));

  const recipes: Recipe[] = (recipesData || []).map((rec) => ({
    id: rec.id,
    title: rec.title,
    image: rec.image,
    tags: rec.tags,
    type: rec.type,
    time: rec.time,
    rating: rec.rating,
    isWeeklyFavorite: rec.is_weekly_favorite,
    servings: rec.servings,
    calories: rec.calories,
    description: rec.description,
  }));

  return (
    <>
      <Header />
      <main className="max-w-7xl mx-auto px-6 pt-8 pb-32 md:pb-12 w-full overflow-hidden">
        <SearchBar />
        <CategoryScroll categories={categories} />
        <RecipeGrid recipes={recipes} />
      </main>
      <BottomNav />
      <FAB />
    </>
  );
}
