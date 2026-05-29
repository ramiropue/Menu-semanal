"use client";

import { useState, useEffect } from "react";
import { Category, Recipe } from "@/data/mockData";
import { SearchBar } from "@/components/ui/SearchBar";
import { CategoryScroll } from "@/components/recipes/CategoryScroll";
import { RecipeGrid } from "@/components/recipes/RecipeGrid";

export function HomeContent({ 
  initialCategories, 
  initialRecipes 
}: { 
  initialCategories: Category[], 
  initialRecipes: Recipe[] 
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<string>(""); // Ninguna por defecto para mostrar todas
  const [recipes, setRecipes] = useState<Recipe[]>(initialRecipes);

  // Cargar favoritos desde localStorage al inicio
  useEffect(() => {
    try {
      const savedFavorites = localStorage.getItem('mimenu_favorites');
      if (savedFavorites) {
        const favoriteIds = JSON.parse(savedFavorites);
        setRecipes(prev => prev.map(r => 
          favoriteIds.includes(r.id) ? { ...r, is_favorite: true } : r
        ));
      }
    } catch (e) {
      console.error("Error loading favorites", e);
    }
  }, []);

  const activeCategory = initialCategories.find(c => c.id === activeCategoryId);

  // Filtrar recetas
  const filteredRecipes = recipes.filter(recipe => {
    const tags = recipe.tags || []; // Proteger contra null
    
    // Filtrar por búsqueda
    const matchesSearch = recipe.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    // Filtrar por categoría
    let matchesCategory = true;
    if (activeCategory) {
      if (activeCategory.name === "Favoritas") {
        matchesCategory = recipe.is_favorite === true;
      } else {
        const catNameLower = activeCategory.name.toLowerCase();
        matchesCategory = tags.some(tag => tag.toLowerCase().includes(catNameLower));
      }
    }

    return matchesSearch && matchesCategory;
  });

  // Categorías con estado activo actualizado
  const categoriesWithActiveState = initialCategories.map(cat => ({
    ...cat,
    isActive: cat.id === '0' ? activeCategoryId === "" : cat.id === activeCategoryId
  }));

  const handleCategoryClick = (id: string) => {
    if (id === '0') {
      setActiveCategoryId("");
      return;
    }
    // Si se hace clic en la misma categoría, la deseleccionamos (vuelve a 'Todas')
    setActiveCategoryId(prev => prev === id ? "" : id);
  };

  // Manejar el toggle de favorito
  const handleToggleFavorite = (recipeId: string, newValue: boolean) => {
    setRecipes(prev => {
      const newRecipes = prev.map(r => r.id === recipeId ? { ...r, is_favorite: newValue } : r);
      // Guardar en localStorage
      try {
        const favoriteIds = newRecipes.filter(r => r.is_favorite).map(r => r.id);
        localStorage.setItem('mimenu_favorites', JSON.stringify(favoriteIds));
      } catch (e) {
        console.error("Error saving favorites", e);
      }
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
      />
    </>
  );
}
