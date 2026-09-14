"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

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
      const { error } = await supabase
        .from("recipes")
        .delete()
        .eq("id", recipeId);

      if (error) {
        throw error;
      }

      alert("Receta eliminada con éxito.");
      router.push("/");
    } catch (error: any) {
      console.error("Error al eliminar la receta:", error);
      alert("Hubo un error al eliminar la receta: " + error.message);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-4 mt-10 md:mt-14">
      <Link 
        href={`/recetas/nueva?edit=${recipeId}`}
        className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-3.5 md:py-4 rounded-2xl border-2 border-primary/20 text-primary font-bold text-sm md:text-base hover:bg-primary/5 active:scale-95 transition-all cursor-pointer"
      >
        <span className="material-symbols-outlined text-xl">edit</span>
        Modificar
      </Link>
      <button 
        type="button"
        onClick={handleDelete}
        className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-3.5 md:py-4 rounded-2xl bg-error/10 text-error font-bold text-sm md:text-base hover:bg-error/20 active:scale-95 transition-all cursor-pointer"
      >
        <span className="material-symbols-outlined text-xl">delete</span>
        Eliminar
      </button>
    </div>
  );
}
