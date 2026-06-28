"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/ui/Header";
import { BottomNav } from "@/components/ui/BottomNav";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface DbCategory {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
}

const PREDEFINED_ICONS = [
  "restaurant", "dinner_dining", "lunch_dining", "breakfast_dining", 
  "local_cafe", "local_bar", "icecream", "cake", "bakery_dining", 
  "ramen_dining", "set_meal", "phishing", "nutrition", "egg", 
  "cookie", "fastfood", "tapas", "local_pizza", "kebab_dining", "soup_kitchen"
];

function SortableCategoryItem({ category, setEditingIconId, handleDelete }: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    position: 'relative' as any,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className={`p-3 md:p-4 border-b border-gray-50 last:border-0 flex items-center justify-between transition-colors rounded-2xl ${isDragging ? 'bg-white shadow-xl scale-[1.02]' : 'bg-white hover:bg-[#F6F9FC]'}`}
    >
      <div className="flex items-center gap-3 md:gap-4 flex-1">
        <div 
          onClick={() => setEditingIconId(category.id)}
          className="w-[40px] h-[40px] md:w-[48px] md:h-[48px] rounded-xl bg-[#EAF5F8] flex items-center justify-center text-[#0B3B3C] shadow-sm cursor-pointer hover:bg-[#D1E6ED] transition-colors relative z-10"
          title="Cambiar icono"
        >
          <span className="material-symbols-outlined">{category.icon}</span>
          <div className="absolute -bottom-1 -right-1 bg-[#0B3B3C] rounded-full w-4 h-4 flex items-center justify-center border-2 border-white">
            <span className="material-symbols-outlined text-[10px] text-white">edit</span>
          </div>
        </div>
        <div>
          <p className="font-bold text-[#0B3B3C] text-[15px] md:text-base">{category.name}</p>
          <p className="text-[10px] md:text-xs text-gray-400 font-bold tracking-wider uppercase mt-0.5">Personalizada</p>
        </div>
      </div>
      
      <div className="flex items-center gap-1 md:gap-2 z-10">
        <div 
          {...attributes} 
          {...listeners} 
          className="text-gray-300 mr-2 flex items-center justify-center cursor-grab active:cursor-grabbing p-2 touch-none" 
          title="Arrastra para reordenar"
        >
          <span className="material-symbols-outlined">drag_indicator</span>
        </div>
        <button 
          onClick={() => handleDelete(category.id, category.name)}
          className="w-[36px] h-[36px] md:w-[40px] md:h-[40px] rounded-xl flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
          title="Eliminar categoría"
        >
          <span className="material-symbols-outlined">delete</span>
        </button>
      </div>
    </div>
  );
}

export default function CategoriasPage() {
  const [categories, setCategories] = useState<DbCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Create Category State
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("restaurant");

  // Editing Category Icon
  const [editingIconId, setEditingIconId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const loadCategories = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .not('id', 'in', '("_PLANNER_STATE_","_FREEZER_STATE_","_SHOPPING_LIST_STATE_","_FAVORITES_STATE_")')
      .order('sort_order');
      
    if (error) {
      console.error("Error loading categories:", error);
    } else {
      setCategories(data || []);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (active.id !== over?.id && over) {
      const oldIndex = categories.findIndex((c) => c.id === active.id);
      const newIndex = categories.findIndex((c) => c.id === over.id);
      
      let _categories = arrayMove(categories, oldIndex, newIndex);
      // Ensure all objects get sequential sort_order
      _categories = _categories.map((c, i) => ({ ...c, sort_order: i + 1 }));
      
      setCategories(_categories);
      
      // Save all to DB asynchronously
      await Promise.all(_categories.map(c => 
        supabase.from('categories').update({ sort_order: c.sort_order }).eq('id', c.id)
      ));
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`¿Estás seguro de que quieres eliminar la categoría "${name}"? Las recetas que pertenezcan a esta categoría se quedarán sin categoría asignada.`)) {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) {
        alert("Error al eliminar la categoría");
        console.error(error);
      } else {
        setCategories(categories.filter(c => c.id !== id));
      }
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) {
      alert("Por favor, introduce un nombre para la categoría.");
      return;
    }

    const maxSortOrder = categories.length > 0 ? Math.max(...categories.map(c => c.sort_order || 0)) : 0;
    
    const newCategory = {
      id: Date.now().toString(),
      name: newName.trim(),
      icon: newIcon,
      is_active: false,
      sort_order: maxSortOrder + 1
    };

    const { error } = await supabase.from('categories').insert(newCategory);
    
    if (error) {
      alert("Error al crear la categoría");
      console.error(error);
    } else {
      setCategories([...categories, newCategory]);
      setNewName("");
      setNewIcon("restaurant");
      setIsCreating(false);
    }
  };

  const handleUpdateIcon = async (id: string, icon: string) => {
    // Update local immediately
    setCategories(categories.map(c => c.id === id ? { ...c, icon } : c));
    setEditingIconId(null);
    
    // Save to DB
    const { error } = await supabase.from('categories').update({ icon }).eq('id', id);
    if (error) {
      alert("Error al actualizar el icono");
      console.error(error);
    }
  };

  return (
    <div className="bg-[#F6F9FC] flex-1 overflow-y-auto w-full h-full pb-32 md:pb-12 font-plus-jakarta text-[#2A4B4C] flex flex-col relative">
      <Header />
      
      <main className="max-w-3xl mx-auto px-4 pt-8 pb-12 flex-1 w-full flex flex-col">
        <div className="mb-6 flex justify-between items-end">
          <div>
            <p className="text-sm font-bold text-[#B93B11] tracking-widest uppercase mb-1">
              Configuración
            </p>
            <h1 className="text-3xl font-black text-[#0B3B3C] font-headline">
              Categorías
            </h1>
          </div>
          <Link href="/" className="bg-[#EAF5F8] text-[#0B3B3C] px-4 py-2 rounded-xl font-bold text-sm hover:bg-[#D1E6ED] transition-colors flex items-center gap-1">
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Volver
          </Link>
        </div>

        {/* Create Category Panel */}
        {isCreating ? (
          <div className="bg-white rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] mb-8 border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-[#0B3B3C]">Nueva Categoría</h2>
              <button onClick={() => setIsCreating(false)} className="text-gray-400 hover:text-gray-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-[#2A4B4C] mb-2">Nombre</label>
                <input 
                  type="text" 
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Ej: Comida Italiana" 
                  className="w-full rounded-xl border-none p-3 shadow-sm bg-[#F6F9FC] focus:ring-2 focus:ring-[#0B3B3C] outline-none text-base text-[#2A4B4C]" 
                />
              </div>
              
              <div>
                <label className="block text-sm font-bold text-[#2A4B4C] mb-2">Icono</label>
                <div className="flex flex-wrap gap-2 max-h-[150px] overflow-y-auto p-2 bg-[#F6F9FC] rounded-xl border border-gray-100">
                  {PREDEFINED_ICONS.map(icon => (
                    <button
                      key={icon}
                      onClick={() => setNewIcon(icon)}
                      className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                        newIcon === icon 
                          ? 'bg-[#0B3B3C] text-white shadow-md scale-110' 
                          : 'bg-white text-gray-500 hover:bg-gray-100'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[20px]">{icon}</span>
                    </button>
                  ))}
                </div>
              </div>
              
              <button 
                onClick={handleCreate}
                className="w-full bg-[#B93B11] text-white font-bold py-3 rounded-xl hover:bg-[#8A2B0A] transition-colors flex justify-center items-center gap-2"
              >
                <span className="material-symbols-outlined">add</span>
                Crear Categoría
              </button>
            </div>
          </div>
        ) : (
          <button 
            onClick={() => setIsCreating(true)}
            className="w-full bg-white border-2 border-dashed border-[#B93B11]/30 text-[#B93B11] font-bold py-4 rounded-2xl mb-8 hover:bg-[#FFF5F0] transition-colors flex justify-center items-center gap-2 shadow-sm"
          >
            <span className="material-symbols-outlined">add_circle</span>
            Añadir Nueva Categoría
          </button>
        )}

        {/* Categories List */}
        <div className="bg-white rounded-3xl p-2 md:p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100">
          
          <div className="p-3 md:p-4 border-b border-gray-100 flex items-center justify-between opacity-60">
            <div className="flex items-center gap-3 md:gap-4 flex-1">
              <div className="w-[40px] h-[40px] md:w-[48px] md:h-[48px] rounded-xl bg-gray-100 flex items-center justify-center text-gray-400">
                <span className="material-symbols-outlined">grid_view</span>
              </div>
              <div>
                <p className="font-bold text-[#0B3B3C] text-[15px] md:text-base">Todas</p>
                <p className="text-[10px] md:text-xs text-gray-400 font-bold tracking-wider uppercase mt-0.5">Sistema</p>
              </div>
            </div>
            <div className="text-xs text-gray-400 bg-gray-100 px-3 py-1.5 rounded-full font-bold">Fijo</div>
          </div>

          <div className="p-3 md:p-4 border-b border-gray-100 flex items-center justify-between opacity-60">
            <div className="flex items-center gap-3 md:gap-4 flex-1">
              <div className="w-[40px] h-[40px] md:w-[48px] md:h-[48px] rounded-xl bg-[#FFF5F0] flex items-center justify-center text-[#B93B11]">
                <span className="material-symbols-outlined">favorite</span>
              </div>
              <div>
                <p className="font-bold text-[#0B3B3C] text-[15px] md:text-base">Favoritas</p>
                <p className="text-[10px] md:text-xs text-gray-400 font-bold tracking-wider uppercase mt-0.5">Sistema</p>
              </div>
            </div>
            <div className="text-xs text-gray-400 bg-gray-100 px-3 py-1.5 rounded-full font-bold">Fijo</div>
          </div>

          {isLoading ? (
            <div className="py-12 flex justify-center items-center flex-col text-[#0B3B3C]">
              <span className="material-symbols-outlined animate-spin text-3xl mb-3">sync</span>
              <p className="font-bold text-sm">Cargando...</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={categories}
                strategy={verticalListSortingStrategy}
              >
                {categories.map((category) => (
                  <SortableCategoryItem 
                    key={category.id} 
                    category={category} 
                    setEditingIconId={setEditingIconId}
                    handleDelete={handleDelete}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      </main>
      
      {/* Mobile-friendly Icon Editor Modal */}
      {editingIconId && (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-end sm:items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-8">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-[#0B3B3C] text-lg">Elige un icono</h3>
              <button onClick={() => setEditingIconId(null)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200">
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
            <div className="grid grid-cols-5 gap-3 max-h-[40vh] overflow-y-auto p-1">
              {PREDEFINED_ICONS.map(icon => (
                <button
                  key={icon}
                  onClick={() => handleUpdateIcon(editingIconId, icon)}
                  className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                    categories.find(c => c.id === editingIconId)?.icon === icon 
                      ? 'bg-[#0B3B3C] text-white shadow-md scale-110' 
                      : 'bg-[#F6F9FC] text-gray-500 hover:bg-[#EAF5F8] hover:text-[#0B3B3C]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[24px]">{icon}</span>
                </button>
              ))}
            </div>
            <button 
              onClick={() => setEditingIconId(null)}
              className="w-full mt-6 bg-gray-100 text-gray-700 font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
