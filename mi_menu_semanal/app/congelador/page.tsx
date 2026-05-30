"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Header } from "@/components/ui/Header";
import { BottomNav } from "@/components/ui/BottomNav";

  const DEFAULT_ITEMS = [
    {
      id: 1,
      title: "Lasaña de Carne",
      subtitle: "Casera • Platos",
      location: "Casa",
      status: "PRIORIDAD",
      statusColor: "text-[#B93B11]",
      statusBg: "bg-[#FAD9D0]",
      borderColor: "border-l-[#B93B11]",
      icon: "restaurant",
      iconColor: "text-[#B93B11]",
      iconBg: "bg-[#FAD9D0]",
      unitLabel: "Unidades disponibles",
      count: 2,
      date: "2023-12-10",
      warning: "Consumir pronto",
      warningColor: "text-[#B93B11]"
    },
    {
      id: 2,
      title: "Lomos de Salmón",
      subtitle: "Noruego • Pescados",
      location: "Choco",
      status: "FRESCO",
      statusColor: "text-[#08635d]",
      statusBg: "bg-[#A7F3D0]",
      borderColor: "border-l-[#0B3B3C]",
      icon: "set_meal",
      iconColor: "text-[#0B3B3C]",
      iconBg: "bg-[#A7F3D0]",
      unitLabel: "Paquetes de 2u",
      count: 4,
      date: "2023-10-28",
      warning: "45 días restantes",
      warningColor: "text-[#0B3B3C]"
    },
    {
      id: 3,
      title: "Espinacas Baby",
      subtitle: "Bolsa 500g • Verduras",
      location: "Arcón",
      status: "ESTABLE",
      statusColor: "text-gray-600",
      statusBg: "bg-[#E5E7EB]",
      borderColor: "border-l-gray-500",
      icon: "eco",
      iconColor: "text-gray-600",
      iconBg: "bg-[#E5E7EB]",
      unitLabel: "Bolsas",
      count: 1,
      date: "2023-11-05",
      warning: "Larga duración",
      warningColor: "text-gray-500"
    }
  ];

export default function CongeladorPage() {
  const [filter, setFilter] = useState("Todos");
  const [searchQuery, setSearchQuery] = useState("");
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('congelador_items');
    if (saved) {
      setItems(JSON.parse(saved));
    } else {
      setItems(DEFAULT_ITEMS);
      localStorage.setItem('congelador_items', JSON.stringify(DEFAULT_ITEMS));
    }
  }, []);

  const updateCount = (id: number, delta: number) => {
    setItems(prevItems => {
      const newItems = prevItems.map(item => {
        if (item.id === id) {
          return { ...item, count: Math.max(0, item.count + delta) };
        }
        return item;
      });
      localStorage.setItem('congelador_items', JSON.stringify(newItems));
      return newItems;
    });
  };

  const updateDate = (id: number, newDate: string) => {
    setItems(prevItems => {
      const newItems = prevItems.map(item => item.id === id ? { ...item, date: newDate } : item);
      localStorage.setItem('congelador_items', JSON.stringify(newItems));
      return newItems;
    });
  };

  const deleteItem = (id: number) => {
    setItems(prevItems => {
      const newItems = prevItems.filter(item => item.id !== id);
      localStorage.setItem('congelador_items', JSON.stringify(newItems));
      return newItems;
    });
  };

  const filteredItems = items.filter(item => {
    const matchesLocation = filter === "Todos" || item.location === filter;
    const term = searchQuery.toLowerCase();
    const matchesSearch = item.title.toLowerCase().includes(term) || item.subtitle.toLowerCase().includes(term);
    return matchesLocation && matchesSearch;
  });

  return (
    <div className="bg-[#F6F9FC] h-full w-full overflow-y-auto overflow-x-hidden relative pb-32 md:pb-12 font-plus-jakarta text-[#2A4B4C]">
      <Header />
      
      <main className="px-4 md:px-6 pt-10 md:pt-12 max-w-7xl mx-auto relative z-10">
        <h1 className="text-3xl md:text-[42px] lg:text-5xl font-black text-[#0B3B3C] font-headline tracking-tight leading-none mb-6 md:mb-10 text-center">
          Mis <span className="text-[#B93B11]">Congeladores</span>
        </h1>

        {/* Buscador */}
        <div className="relative mb-6 max-w-xl mx-auto group">
          <span className="material-symbols-outlined absolute left-4 md:left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#B93B11] transition-colors text-[22px] md:text-[24px]">
            search
          </span>
          <input 
            type="text" 
            placeholder="Buscar por nombre, tipo..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border-2 border-gray-100 rounded-2xl py-3.5 md:py-4 pl-12 md:pl-14 pr-4 md:pr-6 text-[#0B3B3C] text-[15px] md:text-[16px] font-bold outline-none focus:border-[#B93B11] focus:ring-4 focus:ring-[#B93B11]/10 transition-all shadow-sm placeholder:text-gray-400 placeholder:font-medium"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 bg-gray-100 w-6 h-6 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
            >
              <span className="material-symbols-outlined text-[14px] font-bold">close</span>
            </button>
          )}
        </div>

        {/* Filtros */}
        <div className="flex justify-center gap-4 overflow-x-auto hide-scrollbar mb-10 pb-2 -mx-6 px-6 md:mx-0 md:px-0">
          {["Todos", "Casa", "Choco", "Arcón"].map(loc => (
            <button 
              key={loc}
              onClick={() => setFilter(loc)}
              className={`px-5 py-2 md:px-6 md:py-2.5 rounded-full font-bold text-sm md:text-[15px] shrink-0 transition-colors ${
                filter === loc 
                  ? "bg-[#0B3B3C] text-white shadow-sm" 
                  : "bg-[#D1E6ED] text-[#0B3B3C] hover:bg-[#c2dce4]"
              }`}
            >
              {loc}
            </button>
          ))}
        </div>

        {/* Tarjetas de Inventario */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {filteredItems.length === 0 ? (
            <div className="text-center py-10 col-span-full">
              <p className="text-gray-500 font-medium">No hay productos en este congelador.</p>
            </div>
          ) : null}

          {filteredItems.map(item => (
             <div key={item.id} className={`bg-white rounded-[20px] md:rounded-[24px] p-4 md:p-5 shadow-[0_4px_20px_rgb(0,0,0,0.04)] border-l-4 md:border-l-[6px] ${item.borderColor} flex flex-col`}>
               
               <div className="flex justify-between items-start mb-4 md:mb-5 gap-3">
                 <div className={`w-[48px] h-[48px] md:w-[56px] md:h-[56px] rounded-[14px] md:rounded-[16px] ${item.iconBg} flex items-center justify-center shrink-0`}>
                   <span className={`material-symbols-outlined text-[24px] md:text-[28px] ${item.iconColor}`}>{item.icon}</span>
                 </div>
                 <div className="flex-1 min-w-0 pt-0.5">
                   <h2 className="text-base md:text-lg font-black text-[#0B3B3C] leading-tight truncate">{item.title}</h2>
                   <div className="flex items-center gap-2 mt-0.5">
                     <p className="text-gray-500 text-xs md:text-sm font-medium truncate">{item.subtitle}</p>
                     <span className="bg-[#E2F1F6] text-[#0B3B3C] px-2 py-0.5 rounded-md text-[9px] md:text-[10px] font-bold uppercase tracking-wider shrink-0">
                       📍 {item.location}
                     </span>
                   </div>
                 </div>
                 <div className={`${item.statusBg} ${item.statusColor} px-2.5 py-1 md:px-3 md:py-1 rounded-full text-[9px] md:text-[10px] font-black tracking-widest uppercase shrink-0 mt-1`}>
                   {item.status}
                 </div>
               </div>

               <div className="flex-1 flex flex-col justify-end">
                 <div className="bg-[#F6F9FC] rounded-2xl p-2.5 flex justify-between items-center mb-4">
                   <span className="text-[#0B3B3C] font-bold text-xs md:text-sm pl-1">{item.unitLabel}</span>
                   <div className="flex items-center gap-2 md:gap-3">
                     {item.count === 0 && (
                       <button onClick={() => deleteItem(item.id)} className="w-8 h-8 md:w-9 md:h-9 bg-[#FAD9D0] rounded-full flex items-center justify-center shadow-sm text-[#B93B11] hover:bg-[#f6c6b9] active:scale-95 transition-all" title="Eliminar">
                         <span className="material-symbols-outlined font-black text-[18px] md:text-[20px]">delete</span>
                       </button>
                     )}
                     <button onClick={() => updateCount(item.id, -1)} className="w-8 h-8 md:w-9 md:h-9 bg-white rounded-full flex items-center justify-center shadow-sm text-[#0B3B3C] hover:bg-gray-50 active:scale-95 transition-all">
                       <span className="material-symbols-outlined font-black text-[18px] md:text-[20px]">remove</span>
                     </button>
                     <span className="text-lg md:text-[20px] font-black text-[#0B3B3C] w-5 md:w-6 text-center">{item.count}</span>
                     <button onClick={() => updateCount(item.id, 1)} className="w-8 h-8 md:w-9 md:h-9 bg-white rounded-full flex items-center justify-center shadow-sm text-[#0B3B3C] hover:bg-gray-50 active:scale-95 transition-all">
                       <span className="material-symbols-outlined font-black text-[18px] md:text-[20px]">add</span>
                     </button>
                   </div>
                 </div>

                 <div className="flex justify-between items-end">
                   <div>
                     <p className={`text-[8px] md:text-[9px] font-black uppercase tracking-widest mb-1 md:mb-1.5 ${item.statusColor}`}>FECHA CONGELADO</p>
                     <div className="relative">
                       <input 
                         type="date" 
                         value={item.date} 
                         onChange={(e) => updateDate(item.id, e.target.value)}
                         className="bg-[#F6F9FC] border border-[#E2F1F6] rounded-lg py-1.5 md:py-2 pl-2 md:pl-3 pr-6 text-[#2A4B4C] text-xs md:text-sm font-bold outline-none focus:ring-2 focus:ring-[#0B3B3C]/20 transition-all cursor-pointer h-8 md:h-9" 
                       />
                     </div>
                   </div>
                   <span className={`${item.warningColor} text-xs md:text-sm font-bold mb-1 md:mb-1.5 truncate ml-2`}>{item.warning}</span>
                 </div>
               </div>
            </div>
          ))}
        </div>
      </main>

      {/* FAB Añadir */}
      <Link href="/congelador/nuevo" className="fixed bottom-24 right-6 md:bottom-12 md:right-12 w-[68px] h-[68px] bg-[#B93B11] text-white rounded-full flex items-center justify-center shadow-xl shadow-[#B93B11]/30 hover:bg-[#a0320e] hover:scale-105 active:scale-95 transition-all z-50">
        <span className="material-symbols-outlined text-[36px]">add</span>
      </Link>

      <BottomNav />
    </div>
  );
}
