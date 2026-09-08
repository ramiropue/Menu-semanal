"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";

interface RecipeActionsProps {
  recipeId: string;
}

export function RecipeActions({ recipeId }: RecipeActionsProps) {
  const router = useRouter();

  const handleDelete = async () => {
    if (!confirm("¿Estás seguro de que quieres eliminar esta receta? Esta acción no se puede deshacer.")) {
      return;
    }

    try {
      const res = await fetch(`/api/recipes/${recipeId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al eliminar");
      }

      alert("Receta eliminada con éxito.");
      router.push("/");
    } catch (error: any) {
      console.error("Error al eliminar la receta:", error);
      alert("Hubo un error al eliminar la receta: " + error.message);
    }
  };

  return (
    <div className="flex flex-col md:flex-row gap-3 md:gap-4 pt-4 md:pt-6 px-1 md:px-2">
      <Link 
        href={`/recetas/nueva?edit=${recipeId}`}
        className="flex-1 bg-transparent border-2 border-[#D1E6ED] text-[#0B3B3C] py-3 md:py-4 rounded-xl md:rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-[#D1E6ED]/50 transition-colors text-base md:text-[17px] cursor-pointer"
      >
        <span className="material-symbols-outlined text-[20px] md:text-[22px]">edit</span>
        Modificar
      </Link>
      <button 
        type="button"
        onClick={handleDelete}
        className="flex-1 bg-[#FAD9D0] text-[#B93B11] py-3 md:py-4 rounded-xl md:rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-[#F8C8BA] transition-colors text-base md:text-[17px] cursor-pointer"
      >
        <span className="material-symbols-outlined text-[20px] md:text-[22px]">delete</span>
        Eliminar
      </button>
    </div>
  );
}
