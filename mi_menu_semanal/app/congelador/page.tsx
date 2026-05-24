"use client";

import { useState } from "react";
import Link from "next/link";
import { Header } from "@/components/ui/Header";
import { BottomNav } from "@/components/ui/BottomNav";

export default function CongeladorPage() {
  const [filter, setFilter] = useState("Todos");
  
  const [items, setItems] = useState([
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
  ]);

  const updateCount = (id: number, delta: number) => {
    setItems(items.map(item => {
      if (item.id === id) {
        const newCount = Math.max(0, item.count + delta);
        return { ...item, count: newCount };
      }
      return item;
    }));
  };

  const updateDate = (id: number, newDate: string) => {
    setItems(items.map(item => item.id === id ? { ...item, date: newDate } : item));
  };

  const filteredItems = filter === "Todos" ? items : items.filter(item => item.location === filter);

  return (
    <div className="bg-[#F6F9FC] min-h-screen pb-32 md:pb-12 font-plus-jakarta text-[#2A4B4C]">
      <Header />
      
      <main className="px-6 pt-10 md:pt-12 max-w-3xl mx-auto relative z-10">
        <h1 className="text-[42px] md:text-5xl font-black text-[#0B3B3C] font-headline tracking-tight leading-none mb-10 text-center">
          Mis <span className="text-[#B93B11]">Congeladores</span>
        </h1>

        {/* Filtros */}
        <div className="flex justify-center gap-4 overflow-x-auto hide-scrollbar mb-10 pb-2 -mx-6 px-6 md:mx-0 md:px-0">
          {["Todos", "Casa", "Choco", "Arcón"].map(loc => (
            <button 
              key={loc}
              onClick={() => setFilter(loc)}
              className={`px-6 py-2.5 rounded-full font-bold text-[15px] shrink-0 transition-colors ${
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
        <div className="space-y-8">
          {filteredItems.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-gray-500 font-medium">No hay productos en este congelador.</p>
            </div>
          ) : null}

          {filteredItems.map(item => (
            <div key={item.id} className={`bg-white rounded-[32px] p-6 md:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border-l-8 ${item.borderColor}`}>
               
               <div className="flex justify-between items-start mb-8 gap-4">
                 <div className={`w-[64px] h-[64px] rounded-[20px] ${item.iconBg} flex items-center justify-center shrink-0`}>
                   <span className={`material-symbols-outlined text-[32px] ${item.iconColor}`}>{item.icon}</span>
                 </div>
                 <div className="flex-1 min-w-0 pt-1">
                   <h2 className="text-[22px] font-black text-[#0B3B3C] leading-tight truncate">{item.title}</h2>
                   <p className="text-gray-500 text-[16px] font-medium mt-1">{item.subtitle}</p>
                 </div>
                 <div className={`${item.statusBg} ${item.statusColor} px-4 py-1.5 rounded-full text-[11px] font-black tracking-widest uppercase shrink-0 mt-1`}>
                   {item.status}
                 </div>
               </div>

               <div className="bg-[#F6F9FC] rounded-[24px] p-4 flex justify-between items-center mb-6">
                 <span className="text-[#0B3B3C] font-bold text-[17px] pl-2">{item.unitLabel}</span>
                 <div className="flex items-center gap-5">
                   <button onClick={() => updateCount(item.id, -1)} className="w-11 h-11 bg-white rounded-full flex items-center justify-center shadow-sm text-[#0B3B3C] hover:bg-gray-50 active:scale-95 transition-all">
                     <span className="material-symbols-outlined font-black text-[24px]">remove</span>
                   </button>
                   <span className="text-[24px] font-black text-[#0B3B3C] w-8 text-center">{item.count}</span>
                   <button onClick={() => updateCount(item.id, 1)} className="w-11 h-11 bg-white rounded-full flex items-center justify-center shadow-sm text-[#0B3B3C] hover:bg-gray-50 active:scale-95 transition-all">
                     <span className="material-symbols-outlined font-black text-[24px]">add</span>
                   </button>
                 </div>
               </div>

               <div className="flex justify-between items-end">
                 <div>
                   <p className={`text-[11px] font-black uppercase tracking-widest mb-2 ${item.statusColor}`}>FECHA DE CONGELADO</p>
                   <div className="relative">
                     <input 
                       type="date" 
                       value={item.date} 
                       onChange={(e) => updateDate(item.id, e.target.value)}
                       className="bg-[#F6F9FC] border border-[#E2F1F6] rounded-xl py-2.5 pl-4 pr-10 text-[#2A4B4C] text-[15px] font-bold outline-none focus:ring-2 focus:ring-[#0B3B3C]/20 transition-all cursor-pointer" 
                     />
                   </div>
                 </div>
                 <span className={`${item.warningColor} text-[15px] font-bold mb-2`}>{item.warning}</span>
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
