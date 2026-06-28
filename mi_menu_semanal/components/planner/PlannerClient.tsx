"use client";

import { useState, useRef, useEffect } from "react";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import Link from "next/link";
import { BottomNav } from "@/components/ui/BottomNav";
import { Header } from "@/components/ui/Header";
import { RECIPE_INGREDIENTS, Ingredient } from "@/data/ingredients";

interface Recipe {
  id: string;
  title: string;
  image: string;
  type: string;
  tags: string[];
  time?: string;
  calories?: string;
  category_id?: string;
  ingredients?: any[];
}

interface MealSlot {
  type: "DESAYUNO" | "COMIDA" | "CENA";
  recipeId?: string | null;
  recipeIds?: string[];
}

interface NormalizedMealSlot {
  type: "DESAYUNO" | "COMIDA" | "CENA";
  recipeIds: string[];
}

export function PlannerClient({ recipes }: { recipes: Recipe[] }) {
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  
  const [exportAction, setExportAction] = useState<'download' | 'share' | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const generatePDF = async (action: 'download' | 'share') => {
    if (!printRef.current) return;
    setExportAction(action);
    setIsExporting(true);
    
    // Wait for the DOM to update with the new header
    await new Promise(resolve => setTimeout(resolve, 200));
    
    try {
      // html2canvas da error con variables modernas (como colores LAB/OKLCH de Tailwind v4)
      // Usamos html-to-image que usa foreignObject SVG (soporte nativo de renderizado)
      const imgData = await toPng(printRef.current, { 
        cacheBust: true, 
        pixelRatio: 2,
        backgroundColor: '#F6F9FC',
        fontEmbedCSS: '', // Evita el error de CORS al intentar leer fuentes externas
      });
      
      // Orientation: landscape ('l') for month view, portrait ('p') for week view
      const orientation = viewMode === 'month' ? 'l' : 'p';
      const pdf = new jsPDF(orientation, 'mm', 'a4');
      
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      
      // Márgenes físicos en el PDF (en milímetros)
      const marginX = 15;
      const marginY = 15;
      
      const maxWidth = pageWidth - (marginX * 2);
      
      const domWidth = printRef.current.offsetWidth;
      const domHeight = printRef.current.offsetHeight;
      const calculatedHeight = (domHeight * maxWidth) / domWidth;
      
      // Ajustamos si la altura calculada se pasa del alto de la página
      const finalWidth = calculatedHeight > (pageHeight - (marginY * 2)) 
        ? (maxWidth * (pageHeight - (marginY * 2))) / calculatedHeight 
        : maxWidth;
      const finalHeight = calculatedHeight > (pageHeight - (marginY * 2)) 
        ? pageHeight - (marginY * 2) 
        : calculatedHeight;
        
      // Centramos la imagen si el ancho fue reducido para encajar en el alto
      const offsetX = marginX + (maxWidth - finalWidth) / 2;
      
      pdf.addImage(imgData, 'PNG', offsetX, marginY, finalWidth, finalHeight);
      
      const pdfBlob = pdf.output('blob');
      
      // Restauramos el estado de exportación visual
      setIsExporting(false);
      
      if (action === 'download') {
        pdf.save('menu_semanal.pdf');
      } else if (action === 'share') {
        const file = new File([pdfBlob], 'menu_semanal.pdf', { type: 'application/pdf' });
        
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'Menú Semanal',
            text: 'Aquí tienes la organización del menú.'
          });
        } else {
          alert('Tu navegador no soporta compartir archivos directamente. El PDF se abrirá para que puedas guardarlo o enviarlo.');
          const pdfUrl = URL.createObjectURL(pdfBlob);
          window.open(pdfUrl, '_blank');
        }
      }
      
    } catch (error) {
      console.error('Error generating PDF', error);
      alert('Hubo un error al generar el PDF.');
      setIsExporting(false);
    } finally {
      setExportAction(null);
    }
  };
  
  const normalizeName = (name: string) => {
    let n = name.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (n.endsWith("ces")) {
      n = n.slice(0, -3) + "z"; // nueces -> nuez, luces -> luz
    } else if (n.endsWith("es") && n.length > 3) {
      n = n.slice(0, -2);
    } else if (n.endsWith("s") && n.length > 2) {
      n = n.slice(0, -1);
    }
    return n;
  };

  const addToShoppingList = () => {
    const activeDates = viewMode === 'week' 
      ? currentWeekDays.map(d => d.date) 
      : currentMonthDays.filter(d => d !== null).map(d => d!.date);

    const saved = localStorage.getItem('shopping_list_items');
    const currentList: (Ingredient & { checked: boolean })[] = saved ? JSON.parse(saved) : [];

    const map = new Map<string, Ingredient & { checked: boolean }>();
    currentList.forEach(ing => {
      const normName = normalizeName(ing.name);
      const key = `${normName}-${ing.unit}-${ing.category}`;
      map.set(key, ing);
    });

    let addedCount = 0;
    activeDates.forEach(date => {
      const meals = getNormalizedMealsForDate(date);
      meals.forEach(meal => {
        meal.recipeIds.forEach(recipeId => {
          const recipe = recipes.find(r => r.id === recipeId);
          let ingredients: Ingredient[] = [];
          if (recipe?.ingredients && recipe.ingredients.length > 0) {
            ingredients = recipe.ingredients.map(ing => ({
              name: ing.ingrediente || ing.name,
              quantity: parseFloat(ing.cantidad || ing.quantity) || 1,
              unit: ing.unidad || ing.unit || "uds",
              category: "Otros" as any
            }));
          } else if (RECIPE_INGREDIENTS[recipeId]) {
            ingredients = RECIPE_INGREDIENTS[recipeId];
          }

          if (ingredients.length > 0) {
            ingredients.forEach(ing => {
              addedCount++;
              const normName = normalizeName(ing.name);
              const key = `${normName}-${ing.unit}-${ing.category}`;
              if (map.has(key)) {
                const existing = map.get(key)!;
                existing.quantity += ing.quantity;
              } else {
                map.set(key, { ...ing, checked: false });
              }
            });
          }
        });
      });
    });

    if (addedCount === 0) {
      alert("No hay recetas asignadas con ingredientes en la vista actual.");
      return;
    }

    const newList = Array.from(map.values());
    localStorage.setItem('shopping_list_items', JSON.stringify(newList));
    alert(`¡Se han añadido los ingredientes a tu Lista de la Compra!`);
  };
  
  // Logic to generate the week's days based on weekOffset
  const getWeekDays = (offset: number) => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); 
    const monday = new Date(today.setDate(diff));
    monday.setDate(monday.getDate() + (offset * 7));

    const days = [];
    const dayNames = ["LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO", "DOMINGO"];
    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(monday);
      currentDate.setDate(monday.getDate() + i);
      days.push({
        name: dayNames[i],
        dateStr: currentDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
        date: currentDate.toISOString().split('T')[0],
      });
    }
    return days;
  };

  const currentWeekDays = getWeekDays(weekOffset);
  const weekRange = `${currentWeekDays[0].dateStr} - ${currentWeekDays[6].dateStr}`;

  const getMonthDays = (offset: number) => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + offset + 1, 0);
    let firstDayOfWeek = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    const days = [];
    const monthName = firstDay.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const currentDate = new Date(firstDay.getFullYear(), firstDay.getMonth(), i);
      const offsetMs = currentDate.getTimezoneOffset() * 60000;
      const localDate = new Date(currentDate.getTime() - offsetMs);
      days.push({
        dateNumber: i,
        date: localDate.toISOString().split('T')[0],
      });
    }
    return { days, monthName };
  };

  const { days: currentMonthDays, monthName } = getMonthDays(monthOffset);

  // Mock state for the planned meals (in a real app, this would come from DB based on date)
  const [plannedMeals, setPlannedMeals] = useState<Record<string, MealSlot[]>>({});

  useEffect(() => {
    const loadMeals = () => {
      const saved = localStorage.getItem('planner_meals');
      if (saved) {
        try {
          setPlannedMeals(JSON.parse(saved));
        } catch (e) {
          console.error("Error parsing planned meals from localStorage", e);
        }
      }
    };

    loadMeals();

    window.addEventListener('planner_meals_updated', loadMeals);
    window.addEventListener('storage', loadMeals);
    window.addEventListener('focus', loadMeals);

    return () => {
      window.removeEventListener('planner_meals_updated', loadMeals);
      window.removeEventListener('storage', loadMeals);
      window.removeEventListener('focus', loadMeals);
    };
  }, []);

  // Get meals for a specific date (initialize if empty)
  const getNormalizedMealsForDate = (date: string): NormalizedMealSlot[] => {
    const rawMeals = plannedMeals[date];
    if (!rawMeals) {
      return [
        { type: "DESAYUNO", recipeIds: [] },
        { type: "COMIDA", recipeIds: [] },
        { type: "CENA", recipeIds: [] }
      ];
    }
    
    const normalized: NormalizedMealSlot[] = [];
    for (const type of ["DESAYUNO", "COMIDA", "CENA"] as const) {
      const typeMeals = rawMeals.filter(m => m.type === type);
      const recipeIds: string[] = [];
      for (const m of typeMeals) {
        if (m.recipeIds) recipeIds.push(...m.recipeIds);
        else if (m.recipeId) recipeIds.push(m.recipeId);
      }
      normalized.push({ type, recipeIds });
    }
    return normalized;
  };

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ date: string, type: string, isReplacement?: boolean, replaceIndex?: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const openModal = (date: string, type: string, isReplacement = false, replaceIndex?: number) => {
    setSelectedSlot({ date, type, isReplacement, replaceIndex });
    setSearchQuery("");
    setIsModalOpen(true);
  };

  const assignRecipe = (recipeId: string) => {
    if (!selectedSlot) return;
    const { date, type, isReplacement, replaceIndex } = selectedSlot;
    
    const meals = getNormalizedMealsForDate(date);
    const newMeals = [...meals];
    const mealIndex = newMeals.findIndex(m => m.type === type);
    
    if (mealIndex >= 0) {
      if (isReplacement && replaceIndex !== undefined) {
         const newRecipeIds = [...newMeals[mealIndex].recipeIds];
         newRecipeIds[replaceIndex] = recipeId;
         newMeals[mealIndex] = { ...newMeals[mealIndex], recipeIds: newRecipeIds };
      } else {
         newMeals[mealIndex] = { 
           ...newMeals[mealIndex], 
           recipeIds: [...newMeals[mealIndex].recipeIds, recipeId] 
         };
      }
    }
    
    const updatedMeals = {
      ...plannedMeals,
      [date]: newMeals
    };
    
    setPlannedMeals(updatedMeals);
    localStorage.setItem('planner_meals', JSON.stringify(updatedMeals));
    window.dispatchEvent(new Event('planner_meals_updated'));
    setIsModalOpen(false);
  };

  const removeRecipe = (date: string, type: string, indexToRemove: number) => {
    const meals = getNormalizedMealsForDate(date);
    const newMeals = [...meals];
    const mealIndex = newMeals.findIndex(m => m.type === type);
    
    if (mealIndex >= 0) {
      const newRecipeIds = [...newMeals[mealIndex].recipeIds];
      newRecipeIds.splice(indexToRemove, 1);
      newMeals[mealIndex] = { ...newMeals[mealIndex], recipeIds: newRecipeIds };
      
      const updatedMeals = {
        ...plannedMeals,
        [date]: newMeals
      };
      
      setPlannedMeals(updatedMeals);
      localStorage.setItem('planner_meals', JSON.stringify(updatedMeals));
      window.dispatchEvent(new Event('planner_meals_updated'));
    }
  };

  // Filtrar recetas para el modal
  const getFilteredRecipes = () => {
    if (!selectedSlot) return [];
    
    // Si hay texto de búsqueda, buscamos en todas las recetas ignorando el filtro inteligente
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      return recipes.filter(r => 
        r.title.toLowerCase().includes(q) || 
        r.tags?.some(t => t.toLowerCase().includes(q))
      );
    }
    
    const term = selectedSlot.type.toLowerCase();
    
    return recipes.filter(r => {
      let inTags = r.tags?.some(t => t.toLowerCase().includes(term));
      let inType = r.type?.toLowerCase() === term;
      let inCategory = false;
      
      // Mapeos inteligentes por categoría
      // Asumiendo category_id de la BD (1:Favoritas, 2:Entrantes, 3:Desayuno, 4:Carne, 5:Pescado, 6:Ensaladas, 7:Postres)
      if (term === 'desayuno' && r.category_id === '3') inCategory = true;
      if (term === 'comida' && ['2', '4', '5', '6'].includes(r.category_id || '')) inCategory = true;
      if (term === 'cena' && ['2', '5', '6'].includes(r.category_id || '')) inCategory = true;
      
      // Ampliación de tags si es "comida" o "cena"
      if (term === 'comida' && r.tags?.some(t => ['carne', 'pescado', 'fuerte', 'plato principal', 'almuerzo'].includes(t.toLowerCase()))) inTags = true;
      if (term === 'cena' && r.tags?.some(t => ['ligero', 'pescado', 'ensalada', 'cena'].includes(t.toLowerCase()))) inTags = true;

      return inTags || inType || inCategory;
    });
  };

  const filteredRecipes = getFilteredRecipes();
  const showFallback = filteredRecipes.length === 0 && searchQuery.trim() === "";

  return (
    <div className="bg-[#F6F9FC] h-full w-full overflow-y-auto overflow-x-hidden flex-1 flex flex-col pb-32 md:pb-12 font-plus-jakarta text-[#2A4B4C]">
      
      {/* HEADER SUPERIOR */}
      <Header />
      
      {/* CONTENIDO PRINCIPAL */}
      <main className="px-6 pt-10 md:pt-12 w-full max-w-7xl mx-auto relative z-10">
        
        {/* TITULAR Y SELECTOR DE SEMANA */}
        <div className="mb-8 md:mb-10">
          <p className="text-[#B93B11] font-extrabold text-[10px] md:text-[11px] tracking-[0.15em] uppercase mb-1">
            MENÚ DE LA SEMANA
          </p>
          <h1 className="text-3xl md:text-5xl font-black text-[#0B3B3C] font-headline leading-tight tracking-tight mb-4 md:mb-5">
            Planificador Semanal
          </h1>
          
          {/* Selector */}
          <div className="flex items-center justify-between bg-white rounded-2xl p-3 shadow-sm mb-6 border border-[#E2F1F6]">
            <button onClick={() => viewMode === 'week' ? setWeekOffset(prev => prev - 1) : setMonthOffset(prev => prev - 1)} className="w-10 h-10 rounded-full bg-[#F6F9FC] flex items-center justify-center text-[#0B3B3C] hover:bg-[#E2F1F6] transition-colors">
              <span className="material-symbols-outlined text-[20px]">chevron_left</span>
            </button>
            <span className="font-black text-[#0B3B3C] text-[14px] uppercase tracking-wider text-center flex-1">
              {viewMode === 'week' ? weekRange : monthName}
            </span>
            <button onClick={() => viewMode === 'week' ? setWeekOffset(prev => prev + 1) : setMonthOffset(prev => prev + 1)} className="w-10 h-10 rounded-full bg-[#F6F9FC] flex items-center justify-center text-[#0B3B3C] hover:bg-[#E2F1F6] transition-colors">
              <span className="material-symbols-outlined text-[20px]">chevron_right</span>
            </button>
          </div>

          <div className="flex flex-col md:flex-row justify-center items-center gap-4 md:gap-6">
            <div className="flex bg-[#E2F1F6] rounded-xl p-1 shadow-sm w-full md:w-fit">
              <button 
                onClick={() => setViewMode('week')}
                className={`flex-1 md:flex-none justify-center px-4 md:px-6 py-2 md:py-2.5 rounded-lg font-bold flex items-center gap-2 text-sm md:text-[15px] transition-all ${viewMode === 'week' ? 'bg-white text-[#0B3B3C] shadow-sm' : 'text-[#2A4B4C] hover:bg-[#D1E6ED]'}`}
              >
                <span className="material-symbols-outlined text-[18px]">view_agenda</span>
                Semana
              </button>
              <button 
                onClick={() => setViewMode('month')}
                className={`flex-1 md:flex-none justify-center px-4 md:px-6 py-2 md:py-2.5 rounded-lg font-bold flex items-center gap-2 text-sm md:text-[15px] transition-all ${viewMode === 'month' ? 'bg-white text-[#0B3B3C] shadow-sm' : 'text-[#2A4B4C] hover:bg-[#D1E6ED]'}`}
              >
                <span className="material-symbols-outlined text-[18px]">calendar_month</span>
                Mes
              </button>
            </div>

            <div className="flex flex-col sm:flex-row w-full md:w-auto gap-2">
              <button 
                onClick={addToShoppingList}
                className="w-full md:w-auto bg-[#E2F1F6] text-[#0B3B3C] px-4 py-2.5 rounded-xl font-bold flex justify-center items-center gap-2 text-sm md:text-[14px] hover:bg-[#D1E6ED] transition-colors shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">add_shopping_cart</span>
                Añadir a la compra
              </button>
              <button 
                onClick={() => generatePDF('download')}
                disabled={exportAction !== null}
                className="w-full md:w-auto bg-[#0B3B3C] text-white px-4 py-2.5 rounded-xl font-bold flex justify-center items-center gap-2 text-sm md:text-[14px] hover:bg-[#2A4B4C] transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exportAction === 'download' ? (
                  <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                ) : (
                  <span className="material-symbols-outlined text-[18px]">download</span>
                )}
                Descargar
              </button>
              <button 
                onClick={() => generatePDF('share')}
                disabled={exportAction !== null}
                className="w-full md:w-auto bg-white text-[#0B3B3C] border border-[#0B3B3C]/20 px-4 py-2.5 rounded-xl font-bold flex justify-center items-center gap-2 text-sm md:text-[14px] hover:bg-[#F6F9FC] transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exportAction === 'share' ? (
                  <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                ) : (
                  <span className="material-symbols-outlined text-[18px]">ios_share</span>
                )}
                Compartir
              </button>
            </div>
          </div>
        </div>

        {/* CONTENEDOR PARA CAPTURAR EN PDF */}
        <div ref={printRef} className={`bg-[#F6F9FC] p-2 md:p-4 -mx-2 md:-mx-4 rounded-3xl ${isExporting ? 'px-8 pt-8 pb-12' : ''}`}>
          
          {/* CABECERA EXCLUSIVA PARA EL PDF */}
          {isExporting && (
            <div className="mb-8 text-center border-b-2 border-gray-200/50 pb-6">
              <h1 className="text-4xl font-black text-[#0B3B3C] font-headline tracking-tight">Organización del Menú</h1>
              <p className="text-[#B93B11] font-extrabold text-[14px] tracking-[0.2em] uppercase mt-3">
                {viewMode === 'week' ? weekRange : monthName}
              </p>
            </div>
          )}

          {/* DIAS DE LA SEMANA / CALENDARIO */}
          {viewMode === 'month' ? (
          <div className="bg-white rounded-3xl p-3 md:p-6 shadow-sm border border-[#E2F1F6]">
            {/* Cabecera días semana */}
            <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2">
              {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(day => (
                <div key={day} className="text-center font-bold text-[#B93B11] text-[10px] md:text-xs">
                  {day}
                </div>
              ))}
            </div>
            {/* Grid del mes */}
            <div className="grid grid-cols-7 gap-1 md:gap-2">
              {currentMonthDays.map((day, i) => {
                if (!day) return <div key={`empty-${i}`} className="h-[60px] md:h-[100px] rounded-xl bg-[#F6F9FC]/50"></div>;
                
                const meals = getNormalizedMealsForDate(day.date);
                const hasAnyMeal = meals.some(m => m.recipeIds.length > 0);
                const isToday = day.date === new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
                
                return (
                  <div 
                    key={day.date} 
                    className={`h-[65px] md:h-[100px] rounded-xl border p-1 md:p-2 flex flex-col hover:border-[#0B3B3C]/30 transition-colors cursor-pointer group ${isToday ? 'bg-[#FFF5F0] border-[#ECAE96]' : 'bg-[#F6F9FC] border-gray-100'}`}
                  >
                    <div className={`text-[10px] md:text-sm font-black mb-0.5 md:mb-1 opacity-80 group-hover:opacity-100 ${isToday ? 'text-[#B93B11]' : 'text-[#0B3B3C]'}`}>{day.dateNumber}</div>
                    <div className="flex-1 flex flex-col gap-0.5 overflow-hidden">
                      {meals.map((meal, idx) => (
                         <div key={meal.type} className="flex flex-col gap-0.5">
                            {meal.recipeIds.map((recipeId, rIdx) => {
                               const recipe = recipes.find(r => r.id === recipeId);
                               return (
                                  <div 
                                    key={`${idx}-${rIdx}`}
                                    onClick={(e) => { e.stopPropagation(); openModal(day.date, meal.type, true, rIdx); }}
                                    className="bg-[#0B3B3C] text-white text-[7px] md:text-[9px] font-bold px-1 py-[2px] rounded md:rounded-md truncate leading-none"
                                    title={recipe ? recipe.title : ''}
                                  >
                                    {recipe ? recipe.title : ''}
                                  </div>
                               )
                            })}
                            {meal.recipeIds.length === 0 && (
                              <div 
                                onClick={(e) => { e.stopPropagation(); openModal(day.date, meal.type); }}
                                className="bg-transparent text-gray-400 hover:bg-gray-200/50 text-[7px] md:text-[9px] font-bold px-1 py-[2px] rounded md:rounded-md truncate leading-none"
                                title={`Añadir ${meal.type.toLowerCase()}`}
                              >
                                {meal.type.substring(0,3)}
                              </div>
                            )}
                         </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-12">
           {currentWeekDays.map((day) => {
             const meals = getNormalizedMealsForDate(day.date);
             return (
               <div key={day.date} className="space-y-3 md:space-y-4">
                 {/* Título del día */}
                 <h2 className="text-[#0B3B3C] italic font-black text-xl md:text-[22px] tracking-wide ml-1 flex items-baseline gap-2">
                   {day.name} <span className="text-gray-400 font-bold text-sm md:text-[15px] not-italic">{day.dateStr}</span>
                 </h2>
                 
                 {/* Lista de comidas */}
                 <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
                    {meals.map((meal) => (
                       <div key={meal.type} className="flex flex-col gap-2">
                          {meal.recipeIds.length === 0 ? (
                            // CARTA SIN PLANIFICAR
                            <div onClick={() => openModal(day.date, meal.type)} className="bg-white/40 border-[1.5px] border-dashed border-gray-300 rounded-[24px] p-3.5 flex items-center gap-4 hover:bg-white/60 transition-colors cursor-pointer group">
                              <div className="w-[52px] h-[52px] md:w-[60px] md:h-[60px] rounded-[16px] bg-[#E2F1F6] flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-gray-400 group-hover:text-[#0B3B3C] transition-colors text-[20px] md:text-[24px]">restaurant</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[#B93B11] text-[9px] md:text-[10px] font-black uppercase tracking-widest mb-0.5">
                                  {meal.type}
                                </p>
                                <p className="text-gray-400 font-medium text-sm md:text-[15px] leading-tight">
                                  Sin planificar
                                </p>
                              </div>
                              <button className="text-gray-300 group-hover:text-[#B93B11] p-2 transition-colors">
                                <span className="material-symbols-outlined text-[22px]">add_circle</span>
                              </button>
                            </div>
                          ) : (
                            <>
                              {meal.recipeIds.map((recipeId, rIndex) => {
                                 const recipe = recipes.find(r => r.id === recipeId);
                                 if (!recipe) return null;
                                 return (
                                    // CARTA PLANIFICADA
                                    <div key={rIndex} className="bg-white rounded-[24px] p-3.5 shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-md transition-shadow group relative">
                                      <div className="flex items-center gap-3 md:gap-4">
                                        <Link href={`/recetas/${recipe.id}?from=planear`} className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
                                          <div className="w-[52px] h-[52px] md:w-[60px] md:h-[60px] rounded-[16px] overflow-hidden shrink-0 shadow-sm bg-gray-100">
                                            {recipe.image && <img src={recipe.image} alt={recipe.title} className="w-full h-full object-cover" />}
                                          </div>
                                          <div className="flex-1 min-w-0 pr-2">
                                            <p className="text-[#B93B11] text-[9px] md:text-[10px] font-black uppercase tracking-widest mb-0.5">
                                              {meal.type}
                                            </p>
                                            <p className="text-[#0B3B3C] font-bold text-sm md:text-[15px] leading-tight truncate">
                                              {recipe.title}
                                            </p>
                                          </div>
                                        </Link>
                                        <div className="flex flex-col gap-1 shrink-0 z-10 border-l pl-2 md:pl-3 border-gray-100">
                                          <button onClick={() => openModal(day.date, meal.type, true, rIndex)} className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-[#0B3B3C] transition-colors" title="Cambiar receta">
                                            <span className="material-symbols-outlined text-[16px]">swap_horiz</span>
                                          </button>
                                          <button onClick={() => removeRecipe(day.date, meal.type, rIndex)} className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors" title="Quitar receta">
                                            <span className="material-symbols-outlined text-[16px]">close</span>
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                 )
                              })}
                              {/* Botón para añadir otra receta a este mismo bloque */}
                              <button onClick={() => openModal(day.date, meal.type)} className="w-full py-2 border-2 border-dashed border-[#E2F1F6] rounded-xl text-[#2A4B4C] text-xs font-bold hover:bg-[#E2F1F6]/50 hover:text-[#0B3B3C] transition-colors flex items-center justify-center gap-1 mt-1">
                                 <span className="material-symbols-outlined text-[16px]">add</span>
                                 Añadir otra
                              </button>
                            </>
                          )}
                       </div>
                    ))}
                 </div>
               </div>
             )
           })}
        </div>
        )}
        </div>
      </main>

      {/* MODAL PARA ELEGIR RECETA */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#0B3B3C]/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="bg-[#F6F9FC] w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl relative z-10 animate-in slide-in-from-bottom-10 md:slide-in-from-bottom-0 md:zoom-in-95">
            <div className="p-6 bg-white flex justify-between items-center border-b border-gray-100">
              <div>
                <h3 className="font-headline font-black text-[22px] text-[#0B3B3C]">Elige una receta</h3>
                <p className="text-[#B93B11] font-bold text-[12px] tracking-wider uppercase mt-1">{selectedSlot?.type}</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-200">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            {/* Buscador */}
            <div className="p-4 border-b border-gray-100 bg-[#F6F9FC]/50">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">search</span>
                <input 
                  type="text" 
                  placeholder="Buscar cualquier receta..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-sm text-[#0B3B3C] placeholder:text-gray-400 focus:outline-none focus:border-[#B93B11] focus:ring-1 focus:ring-[#B93B11] shadow-sm"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                )}
              </div>
            </div>

            <div className="p-4 max-h-[50vh] overflow-y-auto space-y-3 hide-scrollbar">
              
              {!showFallback && filteredRecipes.length > 0 && filteredRecipes.map(recipe => (
                <div key={recipe.id} onClick={() => assignRecipe(recipe.id)} className="bg-white rounded-2xl p-3 flex items-center gap-4 cursor-pointer hover:ring-2 hover:ring-[#B93B11] transition-all shadow-sm">
                  <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0">
                    <img src={recipe.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=100&q=80'} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-[#0B3B3C] text-[15px]">{recipe.title}</p>
                    <p className="text-gray-400 text-xs mt-0.5">{recipe.time || '30 min'} • {recipe.calories || '450'} kcal</p>
                  </div>
                </div>
              ))}

              {!showFallback && filteredRecipes.length === 0 && (
                <div className="text-center py-8 px-2">
                  <span className="material-symbols-outlined text-[48px] text-gray-300 mb-2">search_off</span>
                  <p className="text-[#2A4B4C] text-[15px]">No se han encontrado recetas con "{searchQuery}".</p>
                </div>
              )}

              {showFallback && (
                <div className="text-center py-4 px-2">
                  <p className="text-[#2A4B4C] mb-4 text-[15px]">No tienes recetas etiquetadas exactamente como <b>{selectedSlot?.type}</b>.</p>
                  <p className="text-sm font-bold text-[#0B3B3C] mb-4 text-left">Todas tus recetas:</p>
                  {recipes.map(recipe => (
                    <div key={recipe.id} onClick={() => assignRecipe(recipe.id)} className="bg-white rounded-2xl p-3 flex items-center gap-4 cursor-pointer hover:ring-2 hover:ring-[#B93B11] transition-all shadow-sm mb-3 text-left">
                      <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0">
                        <img src={recipe.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=100&q=80'} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-[#0B3B3C] text-[15px] leading-tight mb-1">{recipe.title}</p>
                        <p className="text-gray-400 text-[11px] font-bold uppercase tracking-wider">{recipe.type || 'Plato Fuerte'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
