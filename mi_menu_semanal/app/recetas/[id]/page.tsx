import { Header } from "@/components/ui/Header";
import { BottomNav } from "@/components/ui/BottomNav";
import { supabase } from "@/lib/supabase";
import { notFound } from "next/navigation";
import Link from "next/link";
import { RecipeActions } from "@/components/recipes/RecipeActions";

interface Props {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ from?: string }>;
}

export default async function RecipeDetailPage({
  params,
  searchParams,
}: Props) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const backUrl = resolvedSearchParams.from === 'planear' ? '/planear' : '/';
  
  // Fetch recipe data (works for both regular and markdown-imported recipes)
  const { data: recipe, error } = await supabase
    .from("recipes")
    .select(`*, categories(name, icon)`)
    .eq("id", resolvedParams.id)
    .single();

  if (error || !recipe) {
    return notFound();
  }

  // Parse JSONB columns
  const ingredients = recipe.ingredients || [];
  const steps = recipe.steps || [];

  let chefTipsText = recipe.chef_tips || "";
  let sourceUrl = "";
  try {
    const parsed = JSON.parse(recipe.chef_tips || "{}");
    if (typeof parsed === "object" && parsed !== null) {
      chefTipsText = parsed.text || "";
      sourceUrl = parsed.url || "";
    }
  } catch (e) {
    // Keep as plain text if it wasn't JSON
  }

  const categoryName = recipe.categories?.name || "General";
  const categoryIcon = recipe.categories?.icon || "restaurant";

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden flex flex-col bg-background relative font-plus-jakarta text-[#2A4B4C]">
      <Header />
      
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 md:px-6 pt-6 pb-24 md:pb-12">
        {/* Navigation Breadcrumb / Back Button */}
        <div className="flex items-center justify-between mb-6">
          <Link 
            href={backUrl}
            className="flex items-center gap-2 text-primary font-bold text-sm bg-[#EAF5F8] px-3 py-1.5 rounded-full hover:bg-primary/10 transition-colors w-fit"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Volver a {backUrl === '/planear' ? 'Planificador' : 'Recetas'}
          </Link>

          <RecipeActions recipeId={recipe.id} />
        </div>

        {/* Recipe Content */}
        <div className="bg-surface rounded-2xl md:rounded-3xl border border-[#2A4B4C]/10 overflow-hidden shadow-sm">
          {/* Header Image */}
          <div className="relative h-64 md:h-96 w-full bg-slate-100">
            <img 
              src={recipe.image} 
              alt={recipe.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end p-6">
              <div className="text-white">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-[18px] text-accent">
                    {categoryIcon}
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    {categoryName}
                  </span>
                </div>
                <h1 className="text-2xl md:text-4xl font-headline font-extrabold leading-tight">
                  {recipe.title}
                </h1>
              </div>
            </div>
          </div>

          <div className="p-6 md:p-8 space-y-8">
            {/* Meta Info */}
            <div className="flex flex-wrap items-center gap-4 py-3 border-y border-[#2A4B4C]/10 text-sm">
              {recipe.time && (
                <div className="flex items-center gap-1.5 text-on-surface-variant font-medium">
                  <span className="material-symbols-outlined text-[18px] text-primary">schedule</span>
                  <span>{recipe.time}</span>
                </div>
              )}
              {recipe.calories && (
                <div className="flex items-center gap-1.5 text-on-surface-variant font-medium">
                  <span className="material-symbols-outlined text-[18px] text-secondary">local_fire_department</span>
                  <span>{recipe.calories} kcal</span>
                </div>
              )}
              {recipe.servings && (
                <div className="flex items-center gap-1.5 text-on-surface-variant font-medium">
                  <span className="material-symbols-outlined text-[18px] text-primary">group</span>
                  <span>{recipe.servings} raciones</span>
                </div>
              )}
              {sourceUrl && (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-primary font-bold hover:underline ml-auto"
                >
                  <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                  <span>Ver video / fuente original</span>
                </a>
              )}
            </div>

            {/* Tags */}
            {recipe.tags && recipe.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {recipe.tags.map((tag: string, i: number) => (
                  <span 
                    key={i}
                    className="px-2.5 py-1 bg-[#EAF5F8] text-primary text-xs font-bold rounded-lg border border-[#2A4B4C]/10"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            {/* Ingredients */}
            <div>
              <h2 className="text-xl font-headline font-bold mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">nutrition</span>
                Ingredientes
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {ingredients.map((ing: any, i: number) => (
                  <div 
                    key={i}
                    className="flex items-center justify-between p-3 rounded-xl bg-background border border-[#2A4B4C]/5 text-sm"
                  >
                    <span className="font-medium">{ing.ingrediente}</span>
                    {ing.cantidad && (
                      <span className="text-on-surface-variant font-bold bg-white px-2 py-0.5 rounded-md border border-[#2A4B4C]/10 text-xs">
                        {ing.cantidad}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Steps */}
            <div>
              <h2 className="text-xl font-headline font-bold mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">format_list_numbered</span>
                Preparación
              </h2>
              <div className="space-y-4">
                {steps.map((step: any, i: number) => (
                  <div 
                    key={i}
                    className="flex gap-4 p-4 rounded-xl bg-background border border-[#2A4B4C]/5"
                  >
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-secondary text-white font-bold text-sm flex items-center justify-center">
                      {step.step || i + 1}
                    </div>
                    <div className="flex-1 text-sm md:text-base leading-relaxed text-on-surface pt-0.5">
                      {step.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Chef Tips */}
            {chefTipsText && (
              <div className="p-4 md:p-5 rounded-2xl bg-amber-50 border border-amber-200/60 text-amber-900">
                <div className="flex items-center gap-2 font-bold mb-2">
                  <span className="material-symbols-outlined text-[20px] text-amber-600">lightbulb</span>
                  <span>Consejos del Chef</span>
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-line">
                  {chefTipsText}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
