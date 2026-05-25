"use client";

import { useState } from "react";
import Link from "next/link";
import { BottomNav } from "@/components/ui/BottomNav";
import { Header } from "@/components/ui/Header";

interface Recipe {
  id: string;
  title: string;
  image: string;
  type: string;
  tags: string[];
  time?: string;
  calories?: string;
}

interface MealSlot {
  type: "DESAYUNO" | "ALMUERZO" | "CENA";
  recipeId: string | null;
}

export function PlannerClient({ recipes }: { recipes: Recipe[] }) {
  const [weekOffset, setWeekOffset] = useState(0);
  
  // Logic to generate the week's days based on weekOffset
  const getWeekDays = (offset: number) => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); 
    const monday = new Date(today.setDate(diff));
    monday.setDate(monday.getDate() + (offset * 7));

    const days = [];
    const dayNames = ["LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO", "DOMINGO"];
    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(monday);
      currentDate.setDate(monday.getDate() + i);
      days.push({
        name: dayNames[i],
        dateStr: currentDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
        date: currentDate.toISOString().split('T')[0],
      });
    }
    return days;
  };

  const currentWeekDays = getWeekDays(weekOffset);
  const weekRange = `${currentWeekDays[0].dateStr} - ${currentWeekDays[6].dateStr}`;

  // Mock state for the planned meals (in a real app, this would come from DB based on date)
  const [plannedMeals, setPlannedMeals] = useState<Record<string, MealSlot[]>>({});

  // Get meals for a specific date (initialize if empty)
  const getMealsForDate = (date: string): MealSlot[] => {
    if (plannedMeals[date]) return plannedMeals[date];
    return [
      { type: "DESAYUNO", recipeId: null },
      { type: "ALMUERZO", recipeId: null },
      { type: "CENA", recipeId: null }
    ];
  };

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ date: string, type: string, index: number } | null>(null);

  const openModal = (date: string, type: string, index: number) => {
    setSelectedSlot({ date, type, index });
    setIsModalOpen(true);
  };

  const assignRecipe = (recipeId: string) => {
    if (!selectedSlot) return;
    const { date, index } = selectedSlot;
    const meals = getMealsForDate(date);
    const newMeals = [...meals];
    newMeals[index] = { ...newMeals[index], recipeId };
    
    setPlannedMeals({
      ...plannedMeals,
      [date]: newMeals
    });
    setIsModalOpen(false);
  };

  // Filtrar recetas para el modal
  const getFilteredRecipes = () => {
    if (!selectedSlot) return [];
    return recipes.filter(r => 
      r.type?.toLowerCase() === selectedSlot.type.toLowerCase() || 
      r.tags?.some(t => t.toLowerCase() === selectedSlot.type.toLowerCase())
    );
  };

  const filteredRecipes = getFilteredRecipes();
  const showFallback = filteredRecipes.length === 0;

  return (
    <div className="bg-[#F6F9FC] min-h-screen pb-32 md:pb-12 font-plus-jakarta text-[#2A4B4C]">
      
      {/* HEADER SUPERIOR */}
      <Header />
      
      {/* CONTENIDO PRINCIPAL */}
      <main className="px-6 pt-10 md:pt-12 max-w-3xl mx-auto relative z-10">
        
        {/* TITULAR Y SELECTOR DE SEMANA */}
        <div className="mb-8 md:mb-10">
          <p className="text-[#B93B11] font-extrabold text-[10px] md:text-[11px] tracking-[0.15em] uppercase mb-1">
            MENÚ DE LA SEMANA
          </p>
          <h1 className="text-3xl md:text-5xl font-black text-[#0B3B3C] font-headline leading-tight tracking-tight mb-4 md:mb-5">
            Planificador Semanal
          </h1>
          
          {/* Week Selector */}
          <div className="flex items-center justify-between bg-white rounded-2xl p-3 shadow-sm mb-6 border border-[#E2F1F6]">
            <button onClick={() => setWeekOffset(prev => prev - 1)} className="w-10 h-10 rounded-full bg-[#F6F9FC] flex items-center justify-center text-[#0B3B3C] hover:bg-[#E2F1F6] transition-colors">
              <span className="material-symbols-outlined text-[20px]">chevron_left</span>
            </button>
            <span className="font-black text-[#0B3B3C] text-[14px] uppercase tracking-wider">
              {weekRange}
            </span>
            <button onClick={() => setWeekOffset(prev => prev + 1)} className="w-10 h-10 rounded-full bg-[#F6F9FC] flex items-center justify-center text-[#0B3B3C] hover:bg-[#E2F1F6] transition-colors">
              <span className="material-symbols-outlined text-[20px]">chevron_right</span>
            </button>
          </div>

          <div className="flex gap-2 md:gap-3">
             <button className="flex-1 md:flex-none justify-center bg-[#0B3B3C] text-white px-4 md:px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-sm text-sm md:text-[15px] hover:bg-[#082a2b] transition-colors">
               <span className="material-symbols-outlined text-[18px] md:text-[20px]">share</span>
               Compartir
             </button>
             <button className="bg-[#D1E6ED] text-[#0B3B3C] w-[44px] h-[44px] rounded-xl flex items-center justify-center shadow-sm hover:bg-[#c2dce4] transition-colors shrink-0">
               <span className="material-symbols-outlined text-[20px]">settings</span>
             </button>
          </div>
        </div>

        {/* DIAS DE LA SEMANA */}
        <div className="space-y-12">
           {currentWeekDays.map((day) => {
             const meals = getMealsForDate(day.date);
             return (
               <div key={day.date} className="space-y-3 md:space-y-4">
                 {/* Título del día */}
                 <h2 className="text-[#0B3B3C] italic font-black text-xl md:text-[22px] tracking-wide ml-1 flex items-baseline gap-2">
                   {day.name} <span className="text-gray-400 font-bold text-sm md:text-[15px] not-italic">{day.dateStr}</span>
                 </h2>
                 
                 {/* Lista de comidas */}
                 <div className="flex flex-col gap-3">
                    {meals.map((meal, index) => {
                      if (meal.recipeId) {
                        // CARTA PLANIFICADA
                        const recipe = recipes.find(r => r.id === meal.recipeId);
                        if (!recipe) return null;
                        
                        return (
                          <Link href={`/recetas/${recipe.id}`} key={index} className="bg-white rounded-[24px] p-3.5 shadow-[0_4px_20px_rgb(0,0,0,0.03)] flex items-center gap-4 hover:shadow-md transition-shadow cursor-pointer block">
                            <div className="w-[52px] h-[52px] md:w-[60px] md:h-[60px] rounded-[16px] overflow-hidden shrink-0 shadow-sm">
                              <img src={recipe.image!} alt={recipe.title} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[#B93B11] text-[9px] md:text-[10px] font-black uppercase tracking-widest mb-0.5">
                                {meal.type}
                              </p>
                              <p className="text-[#0B3B3C] font-bold text-sm md:text-[15px] leading-tight truncate">
                                {recipe.title}
                              </p>
                            </div>
                            <div className="text-gray-400 hover:text-[#0B3B3C] p-2 transition-colors">
                              <span className="material-symbols-outlined text-[20px]">visibility</span>
                            </div>
                          </Link>
                        );
                      } else {
                        // CARTA SIN PLANIFICAR
                        return (
                          <div key={index} onClick={() => openModal(day.date, meal.type, index)} className="bg-white/40 border-[1.5px] border-dashed border-gray-300 rounded-[24px] p-3.5 flex items-center gap-4 hover:bg-white/60 transition-colors cursor-pointer group">
                            <div className="w-[52px] h-[52px] md:w-[60px] md:h-[60px] rounded-[16px] bg-[#E2F1F6] flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined text-gray-400 group-hover:text-[#0B3B3C] transition-colors text-[20px] md:text-[24px]">restaurant</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[#B93B11] text-[9px] md:text-[10px] font-black uppercase tracking-widest mb-0.5">
                                {meal.type}
                              </p>
                              <p className="text-gray-400 font-medium text-sm md:text-[15px] leading-tight">
                                Sin planificar
                              </p>
                            </div>
                            <button className="text-gray-300 group-hover:text-[#B93B11] p-2 transition-colors">
                              <span className="material-symbols-outlined text-[22px]">add_circle</span>
                            </button>
                          </div>
                        );
                      }
                    })}
                 </div>
               </div>
             )
           })}
        </div>
      </main>

      {/* MODAL PARA ELEGIR RECETA */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#0B3B3C]/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="bg-[#F6F9FC] w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl relative z-10 animate-in slide-in-from-bottom-10 md:slide-in-from-bottom-0 md:zoom-in-95">
            <div className="p-6 bg-white flex justify-between items-center border-b border-gray-100">
              <div>
                <h3 className="font-headline font-black text-[22px] text-[#0B3B3C]">Elige una receta</h3>
                <p className="text-[#B93B11] font-bold text-[12px] tracking-wider uppercase mt-1">{selectedSlot?.type}</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-200">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-4 max-h-[50vh] overflow-y-auto space-y-3 hide-scrollbar">
              
              {!showFallback && filteredRecipes.map(recipe => (
                <div key={recipe.id} onClick={() => assignRecipe(recipe.id)} className="bg-white rounded-2xl p-3 flex items-center gap-4 cursor-pointer hover:ring-2 hover:ring-[#B93B11] transition-all shadow-sm">
                  <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0">
                    <img src={recipe.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=100&q=80'} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-[#0B3B3C] text-[15px]">{recipe.title}</p>
                    <p className="text-gray-400 text-xs mt-0.5">{recipe.time || '30 min'} • {recipe.calories || '450'} kcal</p>
                  </div>
                </div>
              ))}

              {showFallback && (
                <div className="text-center py-4 px-2">
                  <p className="text-[#2A4B4C] mb-4 text-[15px]">No tienes recetas etiquetadas exactamente como <b>{selectedSlot?.type}</b>.</p>
                  <p className="text-sm font-bold text-[#0B3B3C] mb-4 text-left">Todas tus recetas:</p>
                  {recipes.map(recipe => (
                    <div key={recipe.id} onClick={() => assignRecipe(recipe.id)} className="bg-white rounded-2xl p-3 flex items-center gap-4 cursor-pointer hover:ring-2 hover:ring-[#B93B11] transition-all shadow-sm mb-3 text-left">
                      <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0">
                        <img src={recipe.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=100&q=80'} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-[#0B3B3C] text-[15px] leading-tight mb-1">{recipe.title}</p>
                        <p className="text-gray-400 text-[11px] font-bold uppercase tracking-wider">{recipe.type || 'Plato Fuerte'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
