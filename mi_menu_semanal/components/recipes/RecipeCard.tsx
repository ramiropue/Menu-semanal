"use client";

import { Recipe } from "@/data/mockData";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export function RecipeCard({ 
  recipe,
  onToggleFavorite,
  onAssignToPlanner
}: { 
  recipe: Recipe;
  onToggleFavorite?: (id: string, newValue: boolean) => void;
  onAssignToPlanner?: (recipe: Recipe) => void;
}) {
  const handleFavoriteClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const newValue = !recipe.is_favorite;
    
    // Actualizar estado local y localStorage a través del padre
    onToggleFavorite?.(recipe.id, newValue);
  };

  return (
    <Link href={`/recetas/${recipe.id}`} className="group relative overflow-hidden rounded-3xl bg-surface-container flex flex-col h-full shadow-sm hover:shadow-md transition-all duration-300 border border-outline-variant/30 block cursor-pointer">
      <div className="aspect-[4/3] w-full overflow-hidden relative shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={recipe.title}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          src={recipe.image}
        />
        {onAssignToPlanner && (
          <div 
            className="absolute top-4 left-4 w-10 h-10 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-[#0B3B3C] transition-colors cursor-pointer z-10 shadow-sm" 
            title="Añadir a planificación semanal"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAssignToPlanner(recipe);
            }}
          >
            <span className="material-symbols-outlined text-[20px]">calendar_add_on</span>
          </div>
        )}
        <div 
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-secondary transition-colors cursor-pointer z-10" 
          onClick={handleFavoriteClick}
        >
          <span 
            className={`material-symbols-outlined text-[20px] ${recipe.is_favorite ? 'text-secondary-fixed' : ''}`}
            style={{ fontVariationSettings: recipe.is_favorite ? '"FILL" 1' : '"FILL" 0' }}
          >
            favorite
          </span>
        </div>
        {(recipe.time || recipe.rating) && (
          <div className="absolute bottom-4 left-4 flex gap-2">
            {recipe.time && (
              <span className="bg-black/40 backdrop-blur-md px-3 py-1 rounded-full text-[12px] font-bold text-white flex items-center gap-1 shadow-sm">
                <span className="material-symbols-outlined text-[14px]">schedule</span> {recipe.time}
              </span>
            )}
            {recipe.rating && (
              <span className="bg-black/40 backdrop-blur-md px-3 py-1 rounded-full text-[12px] font-bold text-white flex items-center gap-1 shadow-sm">
                <span className="material-symbols-outlined text-[14px] text-orange-400" style={{ fontVariationSettings: '"FILL" 1' }}>star</span> {recipe.rating}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="p-5 flex-1 flex flex-col justify-between">
        <div>
          <h4 className="font-headline text-lg font-bold text-on-surface mb-2 line-clamp-2 leading-snug group-hover:text-orange-600 transition-colors">
            {recipe.title}
          </h4>
          <div className="flex flex-wrap gap-2">
            {recipe.tags.slice(0, 3).map((tag, index) => (
              <span
                key={index}
                className={`text-[11px] font-bold uppercase tracking-wider ${
                  index % 2 === 0 ? "text-primary" : "text-secondary"
                }`}
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Link>
  );
}
