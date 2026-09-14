"use client";

import { Ingredient } from "@/data/ingredients";
import { getShoppingList, saveShoppingList } from "@/lib/syncStore";

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
    } else if (n.endsWith("s") && !n.endsWith("is") && !n.endsWith("us") && n.length > 3) {
      n = n.slice(0, -1);
    }
    return n;
  };

  const handleAdd = async () => {
    if (!ingredients || ingredients.length === 0) {
      alert("Esta receta no tiene ingredientes.");
      return;
    }

    const currentList: (Ingredient & { checked: boolean })[] = await getShoppingList([]);

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
    await saveShoppingList(newList);
    alert(`¡Se han añadido los ingredientes a tu Lista de la Compra!`);
  };

  return (
    <button 
      type="button"
      onClick={handleAdd} 
      className="w-full mt-8 md:mt-10 py-4 md:py-5 bg-primary text-on-primary rounded-2xl font-bold text-sm md:text-base flex items-center justify-center gap-3 active:scale-95 transition-all hover:bg-primary-container shadow-md cursor-pointer"
    >
      <span className="material-symbols-outlined text-xl md:text-2xl" data-icon="list_alt">list_alt</span>
      Añadir a la lista
    </button>
  );
}
