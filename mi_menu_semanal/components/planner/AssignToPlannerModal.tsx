"use client";

import { useState, useEffect } from "react";
import { Recipe } from "@/data/mockData";
import { getPlannedMeals, savePlannedMeals, PLANNER_EVENT_KEY, MealSlot } from "@/lib/plannerStore";

interface AssignToPlannerModalProps {
  recipe: Recipe | null;
  onClose: () => void;
}

interface NormalizedMealSlot {
  type: "DESAYUNO" | "COMIDA" | "CENA";
  recipeIds: string[];
}

export function AssignToPlannerModal({ recipe, onClose }: AssignToPlannerModalProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [plannedMeals, setPlannedMeals] = useState<Record<string, MealSlot[]>>({});

  useEffect(() => {
    const loadMeals = async () => {
      const meals = await getPlannedMeals();
      setPlannedMeals(meals);
    };

    if (recipe) {
      loadMeals();
    }

    const handleLocalUpdate = () => {
      const saved = localStorage.getItem("planner_meals");
      if (saved) {
        try { setPlannedMeals(JSON.parse(saved)); } catch (e) {}
      }
    };

    window.addEventListener(PLANNER_EVENT_KEY, handleLocalUpdate);
    window.addEventListener("storage", handleLocalUpdate);
    window.addEventListener("focus", loadMeals);

    return () => {
      window.removeEventListener(PLANNER_EVENT_KEY, handleLocalUpdate);
      window.removeEventListener("storage", handleLocalUpdate);
      window.removeEventListener("focus", loadMeals);
    };
  }, [recipe]);

  if (!recipe) return null;

  // Helper to generate the 7 days of the currently selected week
  const getDaysOfWeek = (offset: number) => {
    const today = new Date();
    const day = today.getDay(); // 0 is Sunday
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(today.setDate(diff));
    monday.setDate(monday.getDate() + offset * 7);

    const days = [];
    const dayNames = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(monday);
      currentDate.setDate(monday.getDate() + i);
      const dateStr = currentDate.toISOString().split("T")[0];
      const formattedDate = currentDate.toLocaleDateString("es-ES", { day: "numeric", month: "short" });

      days.push({
        name: dayNames[i],
        dateStr,
        formattedDate,
      });
    }
    return days;
  };

  const days = getDaysOfWeek(weekOffset);

  // Normalize meal slots for a date
  const getNormalizedMealsForDate = (date: string): NormalizedMealSlot[] => {
    const rawMeals = plannedMeals[date];
    if (!rawMeals) {
      return [
        { type: "DESAYUNO", recipeIds: [] },
        { type: "COMIDA", recipeIds: [] },
        { type: "CENA", recipeIds: [] },
      ];
    }

    const normalized: NormalizedMealSlot[] = [];
    for (const type of ["DESAYUNO", "COMIDA", "CENA"] as const) {
      const typeMeals = rawMeals.filter((m) => m.type === type);
      const recipeIds: string[] = [];
      for (const m of typeMeals) {
        if (m.recipeIds) recipeIds.push(...m.recipeIds);
        else if (m.recipeId) recipeIds.push(m.recipeId);
      }
      normalized.push({ type, recipeIds });
    }
    return normalized;
  };

  const toggleAssignRecipe = (date: string, type: "DESAYUNO" | "COMIDA" | "CENA") => {
    const meals = getNormalizedMealsForDate(date);
    const newMeals = [...meals];
    const mealIndex = newMeals.findIndex((m) => m.type === type);

    if (mealIndex >= 0) {
      const currentIds = [...newMeals[mealIndex].recipeIds];
      const existingIndex = currentIds.indexOf(recipe.id);

      if (existingIndex >= 0) {
        // Remove if already assigned
        currentIds.splice(existingIndex, 1);
      } else {
        // Add to slot
        currentIds.push(recipe.id);
      }

      newMeals[mealIndex] = { ...newMeals[mealIndex], recipeIds: currentIds };
    }

    const updatedMeals = {
      ...plannedMeals,
      [date]: newMeals,
    };

    setPlannedMeals(updatedMeals);
    savePlannedMeals(updatedMeals);
  };

  const isAssigned = (date: string, type: "DESAYUNO" | "COMIDA" | "CENA") => {
    const meals = getNormalizedMealsForDate(date);
    const slot = meals.find((m) => m.type === type);
    return slot?.recipeIds.includes(recipe.id) || false;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-3xl max-w-lg w-full max-h-[85vh] overflow-hidden shadow-2xl border border-gray-100 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 md:p-6 bg-[#0B3B3C] text-white flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 overflow-hidden">
            <img 
              src={recipe.image} 
              alt={recipe.title} 
              className="w-12 h-12 rounded-xl object-cover shrink-0 border-2 border-white/20" 
            />
            <div className="overflow-hidden">
              <p className="text-xs text-[#EAF5F8]/80 font-bold uppercase tracking-wider">Planificar receta</p>
              <h3 className="font-headline font-bold text-lg truncate">{recipe.title}</h3>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>

        {/* Week Selector */}
        <div className="p-4 bg-[#F6F9FC] border-b border-gray-100 flex items-center justify-between">
          <button
            onClick={() => setWeekOffset((prev) => prev - 1)}
            className="p-2 rounded-xl bg-white text-[#0B3B3C] hover:bg-gray-100 transition-colors shadow-sm font-bold flex items-center gap-1 text-xs cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">chevron_left</span> Anterior
          </button>
          
          <span className="font-bold text-[#0B3B3C] text-sm">
            {weekOffset === 0 ? "Esta semana" : weekOffset === 1 ? "Próxima semana" : weekOffset === -1 ? "Semana anterior" : `Semana ${weekOffset > 0 ? `+${weekOffset}` : weekOffset}`}
          </span>

          <button
            onClick={() => setWeekOffset((prev) => prev + 1)}
            className="p-2 rounded-xl bg-white text-[#0B3B3C] hover:bg-gray-100 transition-colors shadow-sm font-bold flex items-center gap-1 text-xs cursor-pointer"
          >
            Siguiente <span className="material-symbols-outlined text-sm">chevron_right</span>
          </button>
        </div>

        {/* Days List */}
        <div className="p-4 md:p-6 overflow-y-auto space-y-3 flex-1">
          <p className="text-xs text-gray-500 mb-2">Haz clic en una comida para añadir o quitar esta receta:</p>
          {days.map((day) => {
            const isToday = day.dateStr === new Date().toISOString().split("T")[0];
            return (
              <div 
                key={day.dateStr}
                className={`p-3.5 rounded-2xl border transition-all ${isToday ? 'bg-[#EAF5F8]/40 border-[#0B3B3C]/20 shadow-sm' : 'bg-white border-gray-100 hover:border-gray-200'}`}
              >
                <div className="flex items-center justify-between mb-2.5">
                  <span className="font-bold text-[#0B3B3C] text-sm md:text-base flex items-center gap-1.5">
                    {day.name}
                    {isToday && <span className="text-[10px] bg-[#0B3B3C] text-white px-2 py-0.5 rounded-full font-bold">Hoy</span>}
                  </span>
                  <span className="text-xs text-gray-400 font-bold">{day.formattedDate}</span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {(["DESAYUNO", "COMIDA", "CENA"] as const).map((type) => {
                    const assigned = isAssigned(day.dateStr, type);
                    const label = type === "DESAYUNO" ? "Desayuno" : type === "COMIDA" ? "Comida" : "Cena";
                    const icon = type === "DESAYUNO" ? "free_breakfast" : type === "COMIDA" ? "restaurant" : "soup_kitchen";

                    return (
                      <button
                        key={type}
                        onClick={() => toggleAssignRecipe(day.dateStr, type)}
                        className={`py-2 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          assigned
                            ? "bg-[#B93B11] text-white shadow-md scale-[1.02]"
                            : "bg-[#F6F9FC] text-[#2A4B4C] hover:bg-gray-200/70 border border-gray-200/50"
                        }`}
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          {assigned ? "check" : icon}
                        </span>
                        <span className="truncate">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-[#0B3B3C] text-white rounded-xl font-bold text-sm hover:bg-[#155455] transition-colors cursor-pointer shadow-sm"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
