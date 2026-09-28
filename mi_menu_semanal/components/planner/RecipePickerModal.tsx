"use client";

import { useState, useEffect } from "react";

export interface Recipe {
  id: string;
  title: string;
  image?: string;
  type?: string;
  tags?: string[];
  time?: string;
  calories?: string;
  category_id?: string;
  ingredients?: unknown[];
}

export interface SelectedSlot {
  date: string;
  type: string;
  isReplacement?: boolean;
  replaceIndex?: number;
}

export interface RecipePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSlot: SelectedSlot | null;
  recipes: Recipe[];
  onSelectRecipe: (recipeId: string) => void;
  initialSearchQuery?: string;
}

export function filterRecipesForSlot(recipes: Recipe[], selectedSlot: SelectedSlot | null, searchQuery: string): Recipe[] {
  if (!selectedSlot) return [];

  // Si hay texto de búsqueda, buscamos en todas las recetas ignorando el filtro inteligente
  if (searchQuery.trim() !== "") {
    const q = searchQuery.toLowerCase();
    return recipes.filter(r =>
      r.title.toLowerCase().includes(q) ||
      r.tags?.some(t => t.toLowerCase().includes(q))
    );
  }

  const term = selectedSlot.type.toLowerCase();

  return recipes.filter(r => {
    let inTags = r.tags?.some(t => t.toLowerCase().includes(term));
    const inType = r.type?.toLowerCase() === term;
    let inCategory = false;

    // Mapeos inteligentes por categoría
    // (1:Favoritas, 2:Entrantes, 3:Desayuno, 4:Carne, 5:Pescado, 6:Ensaladas, 7:Postres)
    if (term === "desayuno" && r.category_id === "3") inCategory = true;
    if (term === "comida" && ["2", "4", "5", "6"].includes(r.category_id || "")) inCategory = true;
    if (term === "cena" && ["2", "5", "6"].includes(r.category_id || "")) inCategory = true;

    // Ampliación de tags si es "comida" o "cena"
    if (term === "comida" && r.tags?.some(t => ["carne", "pescado", "fuerte", "plato principal", "almuerzo"].includes(t.toLowerCase()))) {
      inTags = true;
    }
    if (term === "cena" && r.tags?.some(t => ["ligero", "pescado", "ensalada", "cena"].includes(t.toLowerCase()))) {
      inTags = true;
    }

    return Boolean(inTags || inType || inCategory);
  });
}

export function RecipePickerModal({
  isOpen,
  onClose,
  selectedSlot,
  recipes,
  onSelectRecipe,
  initialSearchQuery = "",
}: RecipePickerModalProps) {
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredRecipes = filterRecipesForSlot(recipes, selectedSlot, searchQuery);
  const showFallback = filteredRecipes.length === 0 && searchQuery.trim() === "";

  return (
    <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center p-3 sm:p-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] md:py-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[#0B3B3C]/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="recipe-modal-title"
        className="bg-[#F6F9FC] w-full max-w-md rounded-[28px] md:rounded-[32px] overflow-hidden shadow-2xl relative z-10 flex flex-col max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-1.5rem)] md:max-h-[85vh] animate-in slide-in-from-bottom-10 md:slide-in-from-bottom-0 md:zoom-in-95"
      >
        {/* Cabecera persistente */}
        <div className="p-4 sm:p-6 bg-white flex justify-between items-center border-b border-gray-100 shrink-0">
          <div>
            <h3 id="recipe-modal-title" className="font-headline font-black text-xl sm:text-[22px] text-[#0B3B3C]">
              Elige una receta
            </h3>
            <p className="text-[#B93B11] font-bold text-[12px] tracking-wider uppercase mt-0.5 sm:mt-1">
              {selectedSlot?.type}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
          >
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>

        {/* Buscador persistente con text-[16px] en móvil para evitar zoom en Safari */}
        <div className="p-3 sm:p-4 border-b border-gray-100 bg-[#F6F9FC]/50 shrink-0">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]" aria-hidden="true">
              search
            </span>
            <input
              type="text"
              placeholder="Buscar cualquier receta..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-xl py-2.5 pl-10 pr-10 text-[16px] md:text-sm text-[#0B3B3C] placeholder:text-gray-400 focus:outline-none focus:border-[#B93B11] focus:ring-1 focus:ring-[#B93B11] shadow-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Limpiar búsqueda"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
              >
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
              </button>
            )}
          </div>
        </div>

        {/* Lista desplazable con flex-1 min-h-0 y zona segura inferior */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3 hide-scrollbar overscroll-contain pb-[calc(1rem+env(safe-area-inset-bottom,0px))] md:pb-4">
          {!showFallback && filteredRecipes.length > 0 && filteredRecipes.map((recipe) => (
            <div
              key={recipe.id}
              onClick={() => onSelectRecipe(recipe.id)}
              className="bg-white rounded-2xl p-3 flex items-center gap-4 cursor-pointer hover:ring-2 hover:ring-[#B93B11] transition-all shadow-sm"
            >
              <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0">
                <img
                  src={recipe.image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=100&q=80"}
                  className="w-full h-full object-cover"
                  alt=""
                />
              </div>
              <div className="flex-1">
                <p className="font-bold text-[#0B3B3C] text-[15px]">{recipe.title}</p>
                <p className="text-gray-400 text-xs mt-0.5">
                  {recipe.time || "30 min"} • {recipe.calories || "450"} kcal
                </p>
              </div>
            </div>
          ))}

          {!showFallback && filteredRecipes.length === 0 && (
            <div className="text-center py-8 px-2">
              <span className="material-symbols-outlined text-[48px] text-gray-300 mb-2" aria-hidden="true">
                search_off
              </span>
              <p className="text-[#2A4B4C] text-[15px]">No se han encontrado recetas con &quot;{searchQuery}&quot;.</p>
            </div>
          )}

          {showFallback && (
            <div className="text-center py-4 px-2">
              <p className="text-[#2A4B4C] mb-4 text-[15px]">
                No tienes recetas etiquetadas exactamente como <b>{selectedSlot?.type}</b>.
              </p>
              <p className="text-sm font-bold text-[#0B3B3C] mb-4 text-left">Todas tus recetas:</p>
              {recipes.map((recipe) => (
                <div
                  key={recipe.id}
                  onClick={() => onSelectRecipe(recipe.id)}
                  className="bg-white rounded-2xl p-3 flex items-center gap-4 cursor-pointer hover:ring-2 hover:ring-[#B93B11] transition-all shadow-sm mb-3 text-left"
                >
                  <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0">
                    <img
                      src={recipe.image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=100&q=80"}
                      className="w-full h-full object-cover"
                      alt=""
                    />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-[#0B3B3C] text-[15px] leading-tight mb-1">{recipe.title}</p>
                    <p className="text-gray-400 text-[11px] font-bold uppercase tracking-wider">
                      {recipe.type || "Plato Fuerte"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
