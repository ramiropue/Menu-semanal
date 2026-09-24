"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface RecipeActionsProps {
  recipeId: string;
  source?: "supabase" | "markdown" | string;
}

export function RecipeActions({ recipeId, source }: RecipeActionsProps) {
  const router = useRouter();

  // Recetas administradas desde Markdown (RecetasNOTAS): no se ofrecen mutaciones de BD
  if (source === "markdown") {
    return (
      <div
        data-testid="markdown-recipe-notice"
        className="flex items-center gap-2.5 mt-8 md:mt-10 px-4 py-3 rounded-2xl bg-surface-container-low border border-outline-variant/30 text-outline text-xs md:text-sm font-medium"
      >
        <span className="material-symbols-outlined text-base text-secondary" data-icon="description">
          description
        </span>
        <span>Receta administrada desde RecetasNOTAS</span>
      </div>
    );
  }

  const handleDelete = async () => {
    if (!confirm("¿Estás seguro de que quieres eliminar esta receta? Esta acción no se puede deshacer.")) {
      return;
    }

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("recipes")
        .delete()
        .eq("id", recipeId);

      if (error) {
        throw error;
      }

      alert("Receta eliminada con éxito.");
      router.push("/");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("Error al eliminar la receta:", error);
      alert("Hubo un error al eliminar la receta: " + msg);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-4 mt-10 md:mt-14" data-testid="supabase-recipe-actions">
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
