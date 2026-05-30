"use client";

import { useState, useEffect, useMemo } from "react";
import { Header } from "@/components/ui/Header";
import { BottomNav } from "@/components/ui/BottomNav";
import { RECIPE_INGREDIENTS, IngredientCategory } from "@/data/ingredients";

interface AggregatedIngredient {
  name: string;
  quantity: number;
  unit: string;
  category: IngredientCategory;
  checked: boolean;
}

export default function ShoppingListPage() {
  const [ingredientsList, setIngredientsList] = useState<AggregatedIngredient[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('shopping_list_items');
    if (saved) {
      try {
        setIngredientsList(JSON.parse(saved));
      } catch (e) {
        console.error("Error parsing shopping list", e);
      }
    }
  }, []);

  const toggleCheck = (index: number) => {
    const newList = [...ingredientsList];
    newList[index].checked = !newList[index].checked;
    setIngredientsList(newList);
    localStorage.setItem('shopping_list_items', JSON.stringify(newList));
  };

  const deleteIngredient = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newList = [...ingredientsList];
    newList.splice(index, 1);
    setIngredientsList(newList);
    localStorage.setItem('shopping_list_items', JSON.stringify(newList));
  };

  const clearList = () => {
    if (window.confirm("¿Estás seguro de que quieres vaciar toda la lista de la compra?")) {
      setIngredientsList([]);
      localStorage.removeItem('shopping_list_items');
    }
  };

  const aggregatedIngredients = useMemo(() => {
    const grouped: Record<string, (AggregatedIngredient & { originalIndex: number })[]> = {};
    ingredientsList.forEach((ing, index) => {
      if (!grouped[ing.category]) grouped[ing.category] = [];
      grouped[ing.category].push({ ...ing, originalIndex: index });
    });
    return grouped;
  }, [ingredientsList]);

  const categories = Object.keys(aggregatedIngredients).sort();

  return (
    <div className="h-full w-full overflow-y-auto bg-[#F6F9FC] pb-32 md:pb-12 font-plus-jakarta text-[#2A4B4C] relative">
      <Header />
      
      <main className="px-4 md:px-6 pt-10 md:pt-12 max-w-3xl mx-auto relative z-10">
        <h1 className="text-3xl md:text-[42px] lg:text-5xl font-black text-[#0B3B3C] font-headline tracking-tight leading-none mb-2 md:mb-4 text-center">
          Lista de la <span className="text-[#B93B11]">Compra</span>
        </h1>
        <p className="text-center text-gray-500 font-medium mb-10 text-[15px] md:text-base">
          Ingredientes generados a partir de tu menú semanal
        </p>

        {categories.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center shadow-sm border border-gray-100">
            <span className="material-symbols-outlined text-[48px] text-gray-300 mb-4 block">shopping_cart</span>
            <p className="text-gray-500 font-medium">Aún no hay ingredientes. ¡Ve a la pestaña "Menú semanal" y usa el botón de "Añadir a la compra" para generar tu lista!</p>
          </div>
        ) : (
          <>
            <div className="flex justify-end mb-4">
              <button 
                onClick={clearList}
                className="bg-white border border-red-100 text-[#B93B11] px-4 py-2 rounded-xl font-bold flex items-center gap-2 text-sm hover:bg-[#FAD9D0] transition-colors shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">delete_sweep</span>
                Vaciar lista completa
              </button>
            </div>
            <div className="space-y-6">
            {categories.map(category => (
              <div key={category} className="bg-white rounded-3xl p-5 md:p-6 shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-[#E2F1F6]">
                <h2 className="text-xl md:text-2xl font-black text-[#0B3B3C] mb-4 flex items-center gap-2">
                  {category === 'Verduras' && <span className="text-[#0B3B3C]">🥬</span>}
                  {category === 'Carne' && <span className="text-[#B93B11]">🥩</span>}
                  {category === 'Pescado' && <span className="text-[#08635d]">🐟</span>}
                  {category === 'Lácteos' && <span className="text-[#F5A623]">🧀</span>}
                  {category === 'Fruta' && <span className="text-[#D0021B]">🍎</span>}
                  {category === 'Despensa' && <span className="text-[#8B572A]">🥫</span>}
                  {category === 'Otros' && <span className="text-gray-500">🛒</span>}
                  {category}
                </h2>
                
                <div className="space-y-3">
                  {aggregatedIngredients[category].map(ing => {
                    const isChecked = ing.checked;
                    return (
                      <div 
                        key={ing.originalIndex} 
                        className={`flex items-center justify-between p-3.5 rounded-2xl transition-all cursor-pointer shadow-sm ${isChecked ? 'bg-[#E2F1F6]/50 opacity-60' : 'bg-[#F6F9FC] hover:bg-[#E2F1F6] border border-transparent hover:border-[#D1E6ED]'}`}
                        onClick={() => toggleCheck(ing.originalIndex)}
                      >
                        <div className="flex items-center gap-3 md:gap-4">
                          <div className={`w-6 h-6 md:w-7 md:h-7 rounded-lg border-2 flex items-center justify-center transition-colors shrink-0 ${isChecked ? 'bg-[#B93B11] border-[#B93B11]' : 'border-gray-300 bg-white'}`}>
                            {isChecked && <span className="material-symbols-outlined text-white text-[16px] md:text-[18px] font-bold">check</span>}
                          </div>
                          <span className={`font-bold text-[15px] md:text-lg leading-tight ${isChecked ? 'line-through text-gray-500' : 'text-[#0B3B3C]'}`}>
                            {ing.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 md:gap-3 shrink-0">
                          <div className={`px-3 py-1 md:px-4 md:py-1.5 rounded-xl border flex-1 text-center min-w-[70px] ${isChecked ? 'bg-transparent border-transparent' : 'bg-white border-gray-100 shadow-sm'}`}>
                            <span className={`font-black text-sm md:text-base ${isChecked ? 'text-gray-400' : 'text-[#0B3B3C]'}`}>
                              {ing.quantity} <span className="text-gray-500 font-bold text-xs md:text-sm uppercase">{ing.unit}</span>
                            </span>
                          </div>
                          <button 
                            onClick={(e) => deleteIngredient(ing.originalIndex, e)}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="Eliminar ingrediente"
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            </div>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
