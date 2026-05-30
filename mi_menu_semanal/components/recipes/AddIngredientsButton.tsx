"use client";

import { Ingredient } from "@/data/ingredients";

interface Props {
  ingredients: any[];
}

export function AddIngredientsButton({ ingredients }: Props) {
  const normalizeName = (name: string) => {
    let n = name.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (n.endsWith("ces")) {
      n = n.slice(0, -3) + "z";
    } else if (n.endsWith("es") && n.length > 3) {
      n = n.slice(0, -2);
    } else if (n.endsWith("s") && n.length > 2) {
      n = n.slice(0, -1);
    }
    return n;
  };

  const handleAdd = () => {
    if (!ingredients || ingredients.length === 0) {
      alert("Esta receta no tiene ingredientes.");
      return;
    }

    const saved = localStorage.getItem('shopping_list_items');
    const currentList: (Ingredient & { checked: boolean })[] = saved ? JSON.parse(saved) : [];

    const map = new Map<string, Ingredient & { checked: boolean }>();
    currentList.forEach(ing => {
      const normName = normalizeName(ing.name);
      const key = `${normName}-${ing.unit}-${ing.category}`;
      map.set(key, ing);
    });

    let addedCount = 0;
    ingredients.forEach(ing => {
      addedCount++;
      const name = ing.ingrediente || ing.name;
      const quantity = parseFloat(ing.cantidad || ing.quantity) || 1;
      const unit = ing.unidad || ing.unit || "uds";
      const category = "Otros";

      const normName = normalizeName(name);
      const key = `${normName}-${unit}-${category}`;
      
      if (map.has(key)) {
        const existing = map.get(key)!;
        existing.quantity += quantity;
      } else {
        map.set(key, { name, quantity, unit, category: category as any, checked: false });
      }
    });

    const newList = Array.from(map.values());
    localStorage.setItem('shopping_list_items', JSON.stringify(newList));
    alert(`¡Se han añadido los ingredientes a tu Lista de la Compra!`);
  };

  return (
    <button onClick={handleAdd} className="w-full bg-[#0B3B3C] text-white py-3 md:py-4 rounded-xl md:rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-[#082a2b] transition-colors text-base md:text-[17px] shadow-md">
      <span className="material-symbols-outlined text-[20px] md:text-[22px]">list_alt</span>
      Añadir a la lista
    </button>
  );
}
