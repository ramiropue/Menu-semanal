import { Header } from "@/components/ui/Header";
import { BottomNav } from "@/components/ui/BottomNav";
import { FAB } from "@/components/ui/FAB";
import { HomeContent } from "@/components/recipes/HomeContent";
import { supabase } from "@/lib/supabase";
import { Category } from "@/data/mockData";
import { getCombinedRecipes } from "@/lib/recipes/recipeService";

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { data: dbCategories } = await supabase
    .from("categories")
    .select("*")
    .not("id", "in", '("_PLANNER_STATE_","_FREEZER_STATE_","_SHOPPING_LIST_STATE_","_FAVORITES_STATE_")')
    .order("sort_order");
  
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

  // Pure read-only combined catalog (Supabase + Markdown manifest, zero DB writes)
  const recipes = await getCombinedRecipes();

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
