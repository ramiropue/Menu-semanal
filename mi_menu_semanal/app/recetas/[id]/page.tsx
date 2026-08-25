import { Header } from "@/components/ui/Header";
import { BottomNav } from "@/components/ui/BottomNav";
import { supabase } from "@/lib/supabase";
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
    if (recipe.chef_tips && recipe.chef_tips.startsWith('{')) {
      const parsedTips = JSON.parse(recipe.chef_tips);
      chefTipsText = parsedTips.text || "";
      sourceUrl = parsedTips.url || "";
    } else if (recipe.chef_tips && recipe.chef_tips.includes("Enlace original: ")) {
      const parts = recipe.chef_tips.split("Enlace original: ");
      chefTipsText = parts[0].trim();
      sourceUrl = parts[1].trim();
    }
  } catch(e) {
    // Si falla el parseo, mantenemos chefTipsText como está
  }

  return (
    <div className="bg-[#F6F9FC] flex-1 overflow-y-auto w-full h-full pb-32 md:pb-12 font-plus-jakarta text-[#2A4B4C] flex flex-col">
      <Header />
      
      {/* Centramos el contenido principal para que en pantallas grandes se vea como una tarjeta limpia */}
      <main className="max-w-4xl mx-auto w-full flex-1 flex flex-col bg-[#F6F9FC] md:shadow-2xl md:min-h-screen relative">
        
        {/* HERO SECTION */}
        <div className="relative w-full h-[55vh] bg-black md:rounded-t-3xl">
          <img 
            src={recipe.image} 
            alt={recipe.title} 
            className="w-full h-full object-cover opacity-80"
          />
          {/* Gradiente oscuro inferior para legibilidad */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent md:rounded-t-3xl"></div>
          
          <div className="absolute top-6 left-6 z-10">
            <Link href={backUrl} className="w-12 h-12 bg-black/30 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-black/50 transition-colors">
              <span className="material-symbols-outlined text-[24px]">arrow_back</span>
            </Link>
          </div>

          <div className="absolute bottom-[4.5rem] left-0 w-full px-6 md:px-8">
            <span className="bg-[#FF6B00] text-white text-[10px] md:text-xs font-black px-3 py-1.5 rounded-full tracking-widest uppercase mb-3 inline-block shadow-md">
              Premium
            </span>
            <h1 className="text-3xl md:text-5xl font-black text-white font-headline leading-tight drop-shadow-lg">
              {recipe.title}
            </h1>
          </div>
          
          {/* INFO CARDS (Superpuestas entre la imagen y el fondo) */}
          <div className="absolute -bottom-8 md:-bottom-10 left-0 w-full px-4 md:px-6 flex justify-center gap-2 md:gap-6 z-20">
            <div className="bg-white/90 backdrop-blur-xl rounded-2xl md:rounded-3xl p-3 md:p-4 flex flex-col items-center justify-center w-[90px] md:w-[105px] shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
              <span className="material-symbols-outlined text-[#B93B11] text-[24px] md:text-[28px] mb-1">schedule</span>
              <span className="font-extrabold text-[13px] md:text-[15px] text-[#0B3B3C]">{recipe.time || "45 min"}</span>
              <span className="text-[9px] md:text-[10px] text-gray-400 font-black tracking-widest mt-1">TIEMPO</span>
            </div>
            <div className="bg-white/90 backdrop-blur-xl rounded-2xl md:rounded-3xl p-3 md:p-4 flex flex-col items-center justify-center w-[90px] md:w-[105px] shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
              <span className="material-symbols-outlined text-[#B93B11] text-[24px] md:text-[28px] mb-1">restaurant</span>
              <span className="font-extrabold text-[13px] md:text-[15px] text-[#0B3B3C]">Media</span>
              <span className="text-[9px] md:text-[10px] text-gray-400 font-black tracking-widest mt-1">DIFICULTAD</span>
            </div>
            <div className="bg-white/90 backdrop-blur-xl rounded-2xl md:rounded-3xl p-3 md:p-4 flex flex-col items-center justify-center w-[90px] md:w-[105px] shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
              <span className="material-symbols-outlined text-[#B93B11] text-[24px] md:text-[28px] mb-1">local_fire_department</span>
              <span className="font-extrabold text-[13px] md:text-[15px] text-[#0B3B3C]">{recipe.calories || "620"} kcal</span>
              <span className="text-[9px] md:text-[10px] text-gray-400 font-black tracking-widest mt-1">CALORÍAS</span>
            </div>
          </div>
        </div>

        <div className="px-5 md:px-6 pt-16 md:pt-20 pb-12 space-y-10 md:space-y-12">
          
          {/* INGREDIENTES */}
          <section className="bg-[#E2F1F6] rounded-3xl p-6 md:p-8 shadow-sm">
            <div className="flex justify-between items-center mb-6 md:mb-8">
              <h2 className="text-[22px] md:text-[26px] font-black text-[#0B3B3C] font-headline tracking-tight">Ingredientes</h2>
              <span className="material-symbols-outlined text-[#B93B11] text-[28px] md:text-[32px]">shopping_basket</span>
            </div>
            
            <ul className="space-y-3 md:space-y-4 mb-6 md:mb-8">
              {ingredients.length > 0 ? ingredients.map((ing: any, i: number) => (
                <li key={i} className="flex justify-between items-center py-1">
                  <span className="text-base md:text-[18px] text-[#2A4B4C] font-medium">{ing.ingrediente}</span>
                  <span className="bg-[#D1E6ED] text-[#B93B11] font-bold px-3 py-1 md:px-4 md:py-1.5 rounded-full text-sm md:text-[15px]">
                    {ing.cantidad}
                  </span>
                </li>
              )) : (
                <p className="text-base md:text-lg text-[#2A4B4C]">No hay ingredientes listados.</p>
              )}
            </ul>
            
            <AddIngredientsButton ingredients={ingredients} />
          </section>

          {/* PREPARACIÓN */}
          <section className="px-1 md:px-2">
            <div className="flex items-center gap-4 md:gap-6 mb-8 md:mb-10">
              <h2 className="text-[22px] md:text-[28px] font-black text-[#0B3B3C] font-headline tracking-tight">Preparación</h2>
              <div className="flex-1 h-[2px] bg-[#D1E6ED] rounded-full"></div>
            </div>

            <div className="space-y-8 md:space-y-10">
              {steps.length > 0 ? steps.map((step: any, i: number) => (
                <div key={i} className="flex gap-4 md:gap-5">
                  <div className="w-[40px] h-[40px] md:w-[52px] md:h-[52px] flex-shrink-0 rounded-full bg-[#B93B11] text-white font-black text-lg md:text-[22px] flex items-center justify-center shadow-md">
                    {(i + 1).toString().padStart(2, '0')}
                  </div>
                  <div className="pt-1 md:pt-2 flex-1">
                    <h3 className="text-base md:text-[19px] font-bold text-[#0B3B3C] mb-1 md:mb-2 leading-tight">Paso {i + 1}</h3>
                    <p className="text-sm md:text-[18px] text-[#2A4B4C] leading-[1.6]">
                      {step.description || step.text}
                    </p>
                  </div>
                </div>
              )) : (
                <p className="text-base md:text-lg text-gray-500">No hay pasos descritos.</p>
              )}
            </div>
          </section>

          {/* BOTONES DE ACCIÓN */}
          <RecipeActions recipeId={recipe.id} />

          {/* TARJETA DE VÍDEO ORIGINAL */}
          {sourceUrl && (
            <a 
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mx-1 md:mx-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl md:rounded-[24px] p-1 shadow-lg block mt-8 hover:scale-[1.02] transition-transform"
            >
              <div className="bg-white/95 backdrop-blur-sm rounded-[20px] p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-pink-100 rounded-full flex items-center justify-center text-pink-600">
                    <span className="material-symbols-outlined text-[28px]">play_circle</span>
                  </div>
                  <div>
                    <h3 className="text-base md:text-[18px] font-bold text-[#0B3B3C] leading-tight">Ver Vídeo Original</h3>
                    <p className="text-xs md:text-sm text-gray-500 mt-0.5">Receta importada</p>
                  </div>
                </div>
                <span className="material-symbols-outlined text-gray-400">arrow_forward_ios</span>
              </div>
            </a>
          )}

          {/* CONSEJO DEL CHEF */}
          {chefTipsText && (
            <section className="mx-1 md:mx-2 bg-[#FFF5F0] rounded-2xl md:rounded-[24px] p-6 md:p-8 border-[2px] border-dashed border-[#ECAE96] relative mt-6">
              <div className="absolute -top-4 left-4 md:left-6 bg-[#FFF5F0] px-2">
                <span className="material-symbols-outlined text-[#B93B11] text-[24px] md:text-[32px]">lightbulb</span>
              </div>
              <h3 className="text-base md:text-[19px] font-bold text-[#0B3B3C] italic mb-2 md:mb-3 mt-1">Consejo del Chef</h3>
              <p className="text-[#B93B11] text-sm md:text-[18px] leading-[1.6]">
                {chefTipsText}
              </p>
            </section>
          )}

        </div>
      </main>

      <BottomNav />
    </div>
  );
}
