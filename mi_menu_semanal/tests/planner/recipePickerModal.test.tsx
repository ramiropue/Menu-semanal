import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  RecipePickerModal,
  filterRecipesForSlot,
  Recipe,
  SelectedSlot,
} from "@/components/planner/RecipePickerModal";

describe("RecipePickerModal Component & Accessibility Contract", () => {
  const mockRecipes: Recipe[] = [
    {
      id: "rec-1",
      title: "Tostadas de aguacate y huevo",
      type: "Desayuno",
      category_id: "3",
      tags: ["desayuno", "saludable"],
      time: "15 min",
      calories: "350",
    },
    {
      id: "rec-2",
      title: "Arroz meloso de pollo y verduras",
      type: "Plato Principal",
      category_id: "4",
      tags: ["carne", "almuerzo", "fuerte"],
      time: "45 min",
      calories: "620",
    },
    {
      id: "rec-3",
      title: "Salmón a la plancha con espárragos",
      type: "Cena",
      category_id: "5",
      tags: ["pescado", "ligero", "cena"],
      time: "20 min",
      calories: "410",
    },
    {
      id: "rec-4",
      title: "Ensalada templada de gulas",
      type: "Entrante",
      category_id: "6",
      tags: ["ensalada", "cena", "ligero"],
      time: "10 min",
      calories: "280",
    },
  ];

  // =========================================================================
  // 1. APERTURA Y CIERRE DEL MODAL
  // =========================================================================
  describe("1. Apertura y Cierre", () => {
    it("no renderiza nada en el DOM cuando isOpen es false", () => {
      const html = renderToStaticMarkup(
        <RecipePickerModal
          isOpen={false}
          onClose={vi.fn()}
          selectedSlot={{ date: "2026-09-28", type: "COMIDA" }}
          recipes={mockRecipes}
          onSelectRecipe={vi.fn()}
        />
      );

      expect(html).toBe("");
    });

    it("renderiza el modal completo cuando isOpen es true", () => {
      const html = renderToStaticMarkup(
        <RecipePickerModal
          isOpen={true}
          onClose={vi.fn()}
          selectedSlot={{ date: "2026-09-28", type: "COMIDA" }}
          recipes={mockRecipes}
          onSelectRecipe={vi.fn()}
        />
      );

      expect(html).toContain("Elige una receta");
      expect(html).toContain("COMIDA");
      expect(html).toContain('placeholder="Buscar cualquier receta..."');
    });

    it("proporciona un botón de cierre accesible con aria-label='Cerrar'", () => {
      const html = renderToStaticMarkup(
        <RecipePickerModal
          isOpen={true}
          onClose={vi.fn()}
          selectedSlot={{ date: "2026-09-28", type: "CENA" }}
          recipes={mockRecipes}
          onSelectRecipe={vi.fn()}
        />
      );

      expect(html).toContain('aria-label="Cerrar"');
    });
  });

  // =========================================================================
  // 2. SEMÁNTICA DE DIÁLOGO Y ACCESIBILIDAD (WAI-ARIA)
  // =========================================================================
  describe("2. Semántica de Diálogo y Accesibilidad", () => {
    it("cumple con los atributos WAI-ARIA para diálogo modal accesible", () => {
      const html = renderToStaticMarkup(
        <RecipePickerModal
          isOpen={true}
          onClose={vi.fn()}
          selectedSlot={{ date: "2026-09-28", type: "DESAYUNO" }}
          recipes={mockRecipes}
          onSelectRecipe={vi.fn()}
        />
      );

      // 1. role="dialog"
      expect(html).toContain('role="dialog"');

      // 2. aria-modal="true"
      expect(html).toContain('aria-modal="true"');

      // 3. aria-labelledby asociado al id del título
      expect(html).toContain('aria-labelledby="recipe-modal-title"');
      expect(html).toContain('id="recipe-modal-title"');

      // 4. Backdrop con aria-hidden="true"
      expect(html).toContain('aria-hidden="true"');
    });
  });

  // =========================================================================
  // 3. RESPONSIVE DESIGN Y COMPATIBILIDAD CON SAFARI EN IPHONE
  // =========================================================================
  describe("3. Responsive Design y Reglas de Safari / iOS", () => {
    it("utiliza z-[100] para quedar visualmente por encima de BottomNav (z-50) y de toda la interfaz", () => {
      const html = renderToStaticMarkup(
        <RecipePickerModal
          isOpen={true}
          onClose={vi.fn()}
          selectedSlot={{ date: "2026-09-28", type: "COMIDA" }}
          recipes={mockRecipes}
          onSelectRecipe={vi.fn()}
        />
      );

      expect(html).toContain("z-[100]");
    });

    it("utiliza 100dvh y contempla safe-area-inset en top y bottom", () => {
      const html = renderToStaticMarkup(
        <RecipePickerModal
          isOpen={true}
          onClose={vi.fn()}
          selectedSlot={{ date: "2026-09-28", type: "COMIDA" }}
          recipes={mockRecipes}
          onSelectRecipe={vi.fn()}
        />
      );

      // Wrapper con safe areas
      expect(html).toContain("pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]");
      expect(html).toContain("pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]");

      // Tarjeta con altura máxima basada en 100dvh
      expect(html).toContain("max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-1.5rem)]");
    });

    it("utiliza flex-1 min-h-0 overflow-y-auto en la lista de recetas, eliminando max-h-[50vh]", () => {
      const html = renderToStaticMarkup(
        <RecipePickerModal
          isOpen={true}
          onClose={vi.fn()}
          selectedSlot={{ date: "2026-09-28", type: "COMIDA" }}
          recipes={mockRecipes}
          onSelectRecipe={vi.fn()}
        />
      );

      expect(html).toContain("flex-1 min-h-0 overflow-y-auto");
      expect(html).not.toContain("max-h-[50vh]");
    });

    it("aplica al menos 16px en el buscador en móvil para prevenir el auto-zoom de Safari", () => {
      const html = renderToStaticMarkup(
        <RecipePickerModal
          isOpen={true}
          onClose={vi.fn()}
          selectedSlot={{ date: "2026-09-28", type: "COMIDA" }}
          recipes={mockRecipes}
          onSelectRecipe={vi.fn()}
        />
      );

      expect(html).toContain("text-[16px]");
    });

    it("mantiene cabecera y buscador como elementos shrink-0 no comprimibles", () => {
      const html = renderToStaticMarkup(
        <RecipePickerModal
          isOpen={true}
          onClose={vi.fn()}
          selectedSlot={{ date: "2026-09-28", type: "COMIDA" }}
          recipes={mockRecipes}
          onSelectRecipe={vi.fn()}
        />
      );

      // Tanto la cabecera como el buscador tienen clase shrink-0
      const shrinkOccurrences = (html.match(/shrink-0/g) || []).length;
      expect(shrinkOccurrences).toBeGreaterThanOrEqual(2);
    });
  });

  // =========================================================================
  // 4. AUSENCIA DE REGRESIONES EN LOS TRES TIPOS DE COMIDA
  // =========================================================================
  describe("4. Filtrado Inteligente para DESAYUNO, COMIDA y CENA", () => {
    it("filtra correctamente las recetas para DESAYUNO", () => {
      const slot: SelectedSlot = { date: "2026-09-28", type: "DESAYUNO" };
      const filtered = filterRecipesForSlot(mockRecipes, slot, "");

      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe("rec-1");
      expect(filtered[0].title).toBe("Tostadas de aguacate y huevo");
    });

    it("filtra correctamente las recetas para COMIDA", () => {
      const slot: SelectedSlot = { date: "2026-09-28", type: "COMIDA" };
      const filtered = filterRecipesForSlot(mockRecipes, slot, "");

      // rec-2 (category 4 Carne/Pollo) y rec-3 (category 5 Pescado) aplican a comida
      const ids = filtered.map((r) => r.id);
      expect(ids).toContain("rec-2");
      expect(ids).toContain("rec-3");
      expect(ids).not.toContain("rec-1");
    });

    it("filtra correctamente las recetas para CENA", () => {
      const slot: SelectedSlot = { date: "2026-09-28", type: "CENA" };
      const filtered = filterRecipesForSlot(mockRecipes, slot, "");

      // rec-3 (Cena, pescado, ligero) y rec-4 (category 6 ensaladas, cena)
      const ids = filtered.map((r) => r.id);
      expect(ids).toContain("rec-3");
      expect(ids).toContain("rec-4");
      expect(ids).not.toContain("rec-1");
      expect(ids).not.toContain("rec-2");
    });

    it("activa fallback cuando no hay recetas del tipo seleccionado", () => {
      const emptyBreakfastRecipes: Recipe[] = [mockRecipes[1], mockRecipes[2]]; // solo comida y cena
      const html = renderToStaticMarkup(
        <RecipePickerModal
          isOpen={true}
          onClose={vi.fn()}
          selectedSlot={{ date: "2026-09-28", type: "DESAYUNO" }}
          recipes={emptyBreakfastRecipes}
          onSelectRecipe={vi.fn()}
        />
      );

      expect(html).toContain("No tienes recetas etiquetadas exactamente como");
      expect(html).toContain("Todas tus recetas:");
      expect(html).toContain("Arroz meloso de pollo y verduras");
    });
  });

  // =========================================================================
  // 5. BÚSQUEDA DE RECETAS
  // =========================================================================
  describe("5. Búsqueda de Recetas", () => {
    it("filtra recetas en tiempo real por título ignorando el tipo de comida", () => {
      const slot: SelectedSlot = { date: "2026-09-28", type: "CENA" };
      // Aunque el slot es CENA, buscar "aguacate" debe encontrar la tostada de desayuno
      const filtered = filterRecipesForSlot(mockRecipes, slot, "aguacate");

      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe("rec-1");
    });

    it("filtra recetas por etiquetas (tags)", () => {
      const slot: SelectedSlot = { date: "2026-09-28", type: "DESAYUNO" };
      const filtered = filterRecipesForSlot(mockRecipes, slot, "fuerte");

      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe("rec-2");
    });

    it("muestra mensaje amigable cuando no hay resultados de búsqueda", () => {
      const html = renderToStaticMarkup(
        <RecipePickerModal
          isOpen={true}
          onClose={vi.fn()}
          selectedSlot={{ date: "2026-09-28", type: "COMIDA" }}
          recipes={mockRecipes}
          onSelectRecipe={vi.fn()}
          initialSearchQuery="pizza de piña inexistente"
        />
      );

      expect(html).toContain('No se han encontrado recetas con &quot;pizza de piña inexistente&quot;.');
      expect(html).toContain('search_off');
    });

    it("muestra botón para limpiar búsqueda cuando searchQuery no está vacío", () => {
      const html = renderToStaticMarkup(
        <RecipePickerModal
          isOpen={true}
          onClose={vi.fn()}
          selectedSlot={{ date: "2026-09-28", type: "COMIDA" }}
          recipes={mockRecipes}
          onSelectRecipe={vi.fn()}
          initialSearchQuery="salmón"
        />
      );

      expect(html).toContain('aria-label="Limpiar búsqueda"');
    });
  });

  // =========================================================================
  // 6. SELECCIÓN DE RECETA
  // =========================================================================
  describe("6. Selección de Receta", () => {
    it("renderiza tarjetas de receta interactivas con título, tiempo y calorías", () => {
      const html = renderToStaticMarkup(
        <RecipePickerModal
          isOpen={true}
          onClose={vi.fn()}
          selectedSlot={{ date: "2026-09-28", type: "COMIDA" }}
          recipes={mockRecipes}
          onSelectRecipe={vi.fn()}
        />
      );

      expect(html).toContain("Arroz meloso de pollo y verduras");
      expect(html).toContain("45 min • 620 kcal");
    });
  });
});
