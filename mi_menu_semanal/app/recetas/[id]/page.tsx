import { Header } from "@/components/ui/Header";
import { BottomNav } from "@/components/ui/BottomNav";
import { getCombinedRecipeById } from "@/lib/recipes/recipeService";
import { RecipeIngredient, RecipeStep } from "@/data/mockData";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { RecipeActions } from "@/components/recipes/RecipeActions";
import { AddIngredientsButton } from "@/components/recipes/AddIngredientsButton";

export const dynamic = 'force-dynamic';

export default async function RecipeDetailPage({ 
  params,
  searchParams
}: { 
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const backUrl = resolvedSearchParams.from === 'planear' ? '/planear' : '/';
  
  // Fetch recipe data with authenticated server client & Markdown fallback
  const supabase = await createClient();
  const recipe = await getCombinedRecipeById(supabase, resolvedParams.id);

  if (!recipe) {
    return notFound();
  }

  // Parse JSONB columns
  const ingredients = recipe.ingredients || [];
  const steps = recipe.steps || [];

  let chefTipsText = recipe.chef_tips || "";
  let sourceUrl = "";
  
  try {
    if (recipe.chef_tips && recipe.chef_tips.startsWith('{')) {
      const parsedTips = JSON.parse(recipe.chef_tips);
      chefTipsText = parsedTips.text || "";
      sourceUrl = parsedTips.url || "";
    } else if (recipe.chef_tips && recipe.chef_tips.includes("Enlace original: ")) {
      const parts = recipe.chef_tips.split("Enlace original: ");
      chefTipsText = parts[0].trim();
      sourceUrl = parts[1].trim();
    }
  } catch {
    // Si falla el parseo, mantenemos chefTipsText como texto plano
  }

  return (
    <div className="bg-background flex-1 overflow-y-auto w-full h-full pb-32 md:pb-16 font-body text-on-surface flex flex-col">
      <Header />
      
      <main className="w-full flex-1 flex flex-col pb-16">
        {/* HERO SECTION */}
        <div className="relative w-full h-[420px] md:h-[540px] lg:h-[600px] overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img 
            src={recipe.image} 
            alt={recipe.title} 
            className="w-full h-full object-cover"
          />
          {/* Gradiente oscuro inferior para legibilidad */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent"></div>
          
          {/* Botón flotante para volver atrás */}
          <div className="absolute top-6 left-6 z-20">
            <Link 
              href={backUrl} 
              className="w-12 h-12 bg-black/30 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-black/50 transition-colors shadow-sm"
              title="Volver"
            >
              <span className="material-symbols-outlined text-[24px]">arrow_back</span>
            </Link>
          </div>

          {/* Título y badge en el banner */}
          <div className="absolute bottom-16 sm:bottom-20 md:bottom-[120px] lg:bottom-[160px] left-0 right-0 px-6 z-10 pointer-events-none">
            <div className="max-w-7xl mx-auto">
              <span className="bg-secondary-container text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-3 inline-block shadow-sm pointer-events-auto">
                Premium
              </span>
              <h1 className="text-white font-headline text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight drop-shadow-md max-w-4xl">
                {recipe.title}
              </h1>
            </div>
          </div>
        </div>

        {/* METADATA BENTO (Superpuesto entre el hero y el contenido) */}
        <section className="px-6 -mt-10 relative z-10 w-full max-w-7xl mx-auto">
          <div className="grid grid-cols-3 gap-3 md:gap-4 max-w-xl">
            <div className="bg-white/80 backdrop-blur-xl border border-white/50 p-4 md:p-6 rounded-3xl flex flex-col items-center justify-center text-center shadow-sm">
              <span className="material-symbols-outlined text-secondary text-2xl md:text-3xl mb-1.5" data-icon="schedule">
                schedule
              </span>
              <span className="text-sm md:text-lg font-bold text-primary font-headline">
                {recipe.time || "45 min"}
              </span>
              <span className="text-[10px] md:text-xs opacity-60 uppercase font-bold tracking-tighter text-on-surface mt-0.5">
                Tiempo
              </span>
            </div>
            <div className="bg-white/80 backdrop-blur-xl border border-white/50 p-4 md:p-6 rounded-3xl flex flex-col items-center justify-center text-center shadow-sm">
              <span className="material-symbols-outlined text-secondary text-2xl md:text-3xl mb-1.5" data-icon="restaurant">
                restaurant
              </span>
              <span className="text-sm md:text-lg font-bold text-primary font-headline">
                Media
              </span>
              <span className="text-[10px] md:text-xs opacity-60 uppercase font-bold tracking-tighter text-on-surface mt-0.5">
                Dificultad
              </span>
            </div>
            <div className="bg-white/80 backdrop-blur-xl border border-white/50 p-4 md:p-6 rounded-3xl flex flex-col items-center justify-center text-center shadow-sm">
              <span className="material-symbols-outlined text-secondary text-2xl md:text-3xl mb-1.5" data-icon="local_fire_department">
                local_fire_department
              </span>
              <span className="text-sm md:text-lg font-bold text-primary font-headline">
                {recipe.calories || "620"} kcal
              </span>
              <span className="text-[10px] md:text-xs opacity-60 uppercase font-bold tracking-tighter text-on-surface mt-0.5">
                Calorías
              </span>
            </div>
          </div>
        </section>

        {/* LAYOUT PRINCIPAL: 2 COLUMNAS EN ESCRITORIO */}
        <div className="w-full max-w-7xl mx-auto px-6 mt-10 md:mt-14 grid grid-cols-1 lg:grid-cols-12 gap-10 md:gap-12">
          
          {/* COLUMNA IZQUIERDA: INGREDIENTES (lg:col-span-4) */}
          <section className="lg:col-span-4">
            <div className="bg-surface-container-highest p-6 md:p-8 rounded-[2.5rem] md:rounded-[3rem] sticky top-24 shadow-sm border border-surface-variant/30">
              <div className="flex items-center justify-between mb-6 md:mb-8">
                <h2 className="font-headline text-2xl md:text-3xl font-extrabold text-primary">
                  Ingredientes
                </h2>
                <span className="material-symbols-outlined text-secondary text-2xl md:text-3xl" data-icon="shopping_basket">
                  shopping_basket
                </span>
              </div>

              <ul className="flex flex-col gap-1.5">
                {ingredients.length > 0 ? (
                  ingredients.map((ing: RecipeIngredient, i: number) => (
                    <li 
                      key={i} 
                      className="flex items-center justify-between py-2.5 md:py-3 border-b border-surface-variant/30 group hover:bg-surface-container-low/50 transition-colors rounded-xl px-2"
                    >
                      <span className="text-sm md:text-base text-on-surface-variant font-medium">
                        {ing.ingrediente}
                      </span>
                      {ing.cantidad && (
                        <span className="px-3.5 py-1.5 rounded-full bg-secondary-container/10 text-secondary font-extrabold text-xs md:text-sm min-w-[4.5rem] text-center shadow-sm">
                          {ing.cantidad}
                        </span>
                      )}
                    </li>
                  ))
                ) : (
                  <p className="text-sm text-on-surface-variant">No hay ingredientes listados.</p>
                )}
              </ul>

              <AddIngredientsButton ingredients={ingredients} />
            </div>
          </section>

          {/* COLUMNA DERECHA: PREPARACIÓN Y ACCIONES (lg:col-span-8) */}
          <section className="lg:col-span-8 space-y-12">
            
            {/* SECCIÓN PREPARACIÓN */}
            <div>
              <div className="flex items-center gap-4 mb-8 md:mb-10">
                <h2 className="font-headline text-3xl md:text-4xl font-extrabold text-primary">
                  Preparación
                </h2>
                <div className="h-1 flex-grow bg-surface-container-highest rounded-full"></div>
              </div>

              <div className="space-y-10 md:space-y-12">
                {steps.length > 0 ? (
                  steps.map((step: RecipeStep, i: number) => (
                    <div key={i} className="flex gap-5 md:gap-8 group">
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-secondary text-white flex items-center justify-center text-xl md:text-3xl font-black italic shadow-lg group-hover:rotate-12 transition-transform">
                          {(i + 1).toString().padStart(2, '0')}
                        </div>
                      </div>
                      <div className="pt-1 md:pt-2 flex-1">
                        <h3 className="text-lg md:text-xl font-bold text-on-surface mb-2 font-headline leading-tight">
                          {step.title ? step.title : `Paso ${i + 1}`}
                        </h3>
                        <p className="text-sm md:text-base leading-relaxed text-on-surface-variant">
                          {step.description || step.text}
                        </p>
                        {step.image_url && (
                          <div className="mt-5 rounded-2xl md:rounded-3xl overflow-hidden h-56 md:h-64 shadow-md">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img 
                              src={step.image_url} 
                              alt={`Paso ${i + 1}`} 
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-on-surface-variant">No hay pasos descritos.</p>
                )}
              </div>
            </div>

            {/* BOTONES DE ACCIÓN (Modificar / Eliminar para Supabase, aviso para Markdown) */}
            <RecipeActions recipeId={recipe.id} source={recipe.source} />

            {/* TARJETA DE VÍDEO ORIGINAL */}
            {sourceUrl && (
              <a 
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl md:rounded-[24px] p-0.5 shadow-md block hover:scale-[1.01] transition-transform"
              >
                <div className="bg-white/95 backdrop-blur-sm rounded-[22px] p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-pink-100 rounded-full flex items-center justify-center text-pink-600 shrink-0">
                      <span className="material-symbols-outlined text-[28px]">play_circle</span>
                    </div>
                    <div>
                      <h4 className="text-base md:text-lg font-bold text-primary font-headline leading-tight">
                        Ver Vídeo Original
                      </h4>
                      <p className="text-xs md:text-sm text-gray-500 mt-0.5">Receta importada</p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-gray-400">arrow_forward_ios</span>
                </div>
              </a>
            )}

            {/* CONSEJO DEL CHEF */}
            {chefTipsText && (
              <div className="mt-12 p-6 md:p-8 border-2 border-dashed border-secondary/30 rounded-3xl bg-secondary-fixed/30 flex items-start gap-4 md:gap-6">
                <span className="material-symbols-outlined text-secondary text-3xl md:text-4xl shrink-0 mt-0.5" data-icon="lightbulb">
                  lightbulb
                </span>
                <div>
                  <h4 className="text-xl md:text-2xl font-bold text-on-secondary-fixed mb-2 italic font-headline">
                    Consejo del Chef
                  </h4>
                  <p className="text-sm md:text-base text-on-secondary-fixed-variant leading-relaxed whitespace-pre-line">
                    {chefTipsText}
                  </p>
                </div>
              </div>
            )}

          </section>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
