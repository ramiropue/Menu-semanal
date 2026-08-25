"use client";

import { useState, useEffect } from "react";
import { Category, Recipe } from "@/data/mockData";
import { SearchBar } from "@/components/ui/SearchBar";
import { CategoryScroll } from "@/components/recipes/CategoryScroll";
import { RecipeGrid } from "@/components/recipes/RecipeGrid";
import { AssignToPlannerModal } from "@/components/planner/AssignToPlannerModal";
import { getFavorites, saveFavorites } from "@/lib/syncStore";

export function HomeContent({ 
  initialCategories, 
  initialRecipes 
}: { 
  initialCategories: Category[], 
  initialRecipes: Recipe[] 
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategoryIds, setActiveCategoryIds] = useState<string[]>([]); // Multi-select
  const [recipes, setRecipes] = useState<Recipe[]>(initialRecipes);
  const [planningRecipe, setPlanningRecipe] = useState<Recipe | null>(null);

  useEffect(() => {
    const loadFavs = async () => {
      const favoriteIds = await getFavorites([]);
      if (favoriteIds && favoriteIds.length > 0) {
        setRecipes(prev => prev.map(r => 
          favoriteIds.includes(r.id) ? { ...r, is_favorite: true } : r
        ));
      }
    };
    loadFavs();
  }, []);

  const activeCategories = initialCategories.filter(c => activeCategoryIds.includes(c.id));

  // Filtrar recetas
  const filteredRecipes = recipes.filter(recipe => {
    const tags = recipe.tags || []; // Proteger contra null
    
    // Filtrar por búsqueda
    const matchesSearch = recipe.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    // Filtrar por categorías (multi-select: la receta debe coincidir con TODAS las categorías activas)
    let matchesCategory = true;
    if (activeCategories.length > 0) {
      const recipeCatIds = recipe.category_ids || (recipe.category_id ? [recipe.category_id] : []);

      matchesCategory = activeCategories.every(cat => {
        if (cat.name === "Favoritas") {
          return recipe.is_favorite === true;
        } else if (cat.name === "Notas") {
          return recipe.id.startsWith("md-");
        } else {
          return recipeCatIds.includes(cat.id);
        }
      });
    }

    return matchesSearch && matchesCategory;
  });

  // Categorías con estado activo actualizado (multi-select)
  const categoriesWithActiveState = initialCategories.map(cat => ({
    ...cat,
    isActive: activeCategoryIds.includes(cat.id)
  }));

  const handleCategoryClick = (id: string) => {
    setActiveCategoryIds(prev => {
      if (id === 'todas') {
        // "Todas" deselecciona todo
        return [];
      }
      if (prev.includes(id)) {
        // Deseleccionar
        return prev.filter(cid => cid !== id);
      } else {
        // Añadir (quitar "todas" si estaba implícito)
        return [...prev.filter(cid => cid !== 'todas'), id];
      }
    });
  };

  // Manejar el toggle de favorito
  const handleToggleFavorite = (recipeId: string, newValue: boolean) => {
    setRecipes(prev => {
      const newRecipes = prev.map(r => r.id === recipeId ? { ...r, is_favorite: newValue } : r);
      const favoriteIds = newRecipes.filter(r => r.is_favorite).map(r => r.id);
      saveFavorites(favoriteIds);
      return newRecipes;
    });
  };

  return (
    <>
      <SearchBar value={searchQuery} onChange={setSearchQuery} />
      <CategoryScroll 
        categories={categoriesWithActiveState} 
        onCategoryClick={handleCategoryClick} 
      />
      <RecipeGrid 
        recipes={filteredRecipes} 
        onToggleFavorite={handleToggleFavorite}
        onAssignToPlanner={(recipe) => setPlanningRecipe(recipe)}
      />
      <AssignToPlannerModal 
        recipe={planningRecipe} 
        onClose={() => setPlanningRecipe(null)} 
        allRecipes={recipes}
      />
    </>
  );
}
