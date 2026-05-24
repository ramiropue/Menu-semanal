"use client";

import { useState } from "react";
import Link from "next/link";
import { BottomNav } from "@/components/ui/BottomNav";

export default function AñadirCongeladorPage() {
  const [categoria, setCategoria] = useState("Carnes");
  const [ubicacion, setUbicacion] = useState("Casa");
  const [cantidad, setCantidad] = useState(1);
  const [fecha, setFecha] = useState("2024-05-20");

  const increment = () => setCantidad(c => c + 1);
  const decrement = () => setCantidad(c => Math.max(1, c - 1));

  return (
    <div className="bg-[#F6F9FC] min-h-screen pb-32 md:pb-12 font-plus-jakarta text-[#2A4B4C]">
      
      {/* HEADER SUPERIOR */}
      <header className="px-6 py-6 flex justify-between items-center sticky top-0 z-40 md:max-w-3xl md:mx-auto bg-transparent">
        <div className="flex items-center gap-4">
          <Link href="/congelador" className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm text-[#0B3B3C] hover:bg-gray-50 transition-colors">
            <span className="material-symbols-outlined font-bold text-[24px]">arrow_back</span>
          </Link>
          <h2 className="text-[#0B3B3C] font-bold text-[20px]">Añadir al Congelador</h2>
        </div>
        <button className="text-[#0B3B3C] w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm hover:bg-gray-50 transition-colors">
          <span className="material-symbols-outlined">settings</span>
        </button>
      </header>
      
      <main className="px-6 max-w-3xl mx-auto relative z-10 -mt-6">
        
        {/* HERO IMAGE */}
        <div className="w-full h-[220px] rounded-[32px] overflow-hidden relative mb-10 shadow-lg">
          <img src="https://images.unsplash.com/photo-1571104508999-893933eff2bc?auto=format&fit=crop&w=800&q=80" alt="Freezer" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B3B3C]/80 to-transparent"></div>
          <div className="absolute bottom-6 left-6 text-white">
            <h2 className="text-3xl font-black font-headline tracking-tight leading-none mb-1">Nuevo Registro</h2>
            <p className="text-white/80 text-[15px] font-medium">Organiza tu reserva culinaria</p>
          </div>
        </div>

        {/* ¿QUÉ VAMOS A GUARDAR? */}
        <div className="mb-8">
          <label className="block text-[#0B3B3C] font-black text-[17px] mb-3">¿Qué vamos a guardar?</label>
          <div className="relative">
            <input 
              type="text" 
              placeholder="Ej: Lasaña de la abuela, Merluza..." 
              className="w-full bg-[#E2F1F6] text-[#0B3B3C] placeholder-gray-400 rounded-3xl py-4 pl-6 pr-12 text-[16px] font-medium outline-none focus:ring-2 focus:ring-[#B93B11] transition-all"
            />
            <span className="material-symbols-outlined absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 text-[26px]">restaurant</span>
          </div>
        </div>

        {/* CATEGORÍA */}
        <div className="mb-8">
          <label className="block text-[#0B3B3C] font-black text-[17px] mb-4">Categoría</label>
          <div className="grid grid-cols-2 gap-4">
            
            {/* Carnes */}
            <button onClick={() => setCategoria("Carnes")} className={`h-[110px] rounded-3xl flex flex-col items-center justify-center gap-2 transition-all ${categoria === "Carnes" ? "bg-[#FAD9D0] border-2 border-[#B93B11]" : "bg-[#E2F1F6] border-2 border-transparent"}`}>
              <span className={`material-symbols-outlined text-[36px] ${categoria === "Carnes" ? "text-[#B93B11]" : "text-[#B93B11]"}`}>kebab_dining</span>
              <span className={`font-bold text-[14px] ${categoria === "Carnes" ? "text-[#0B3B3C]" : "text-[#0B3B3C]"}`}>Carnes</span>
            </button>

            {/* Pescados */}
            <button onClick={() => setCategoria("Pescados")} className={`h-[110px] rounded-3xl flex flex-col items-center justify-center gap-2 transition-all ${categoria === "Pescados" ? "bg-[#FAD9D0] border-2 border-[#B93B11]" : "bg-[#E2F1F6] border-2 border-transparent"}`}>
              <span className={`material-symbols-outlined text-[36px] ${categoria === "Pescados" ? "text-[#B93B11]" : "text-[#B93B11]"}`}>set_meal</span>
              <span className={`font-bold text-[14px] ${categoria === "Pescados" ? "text-[#0B3B3C]" : "text-[#0B3B3C]"}`}>Pescados</span>
            </button>

            {/* Verduras */}
            <button onClick={() => setCategoria("Verduras")} className={`h-[110px] rounded-3xl flex flex-col items-center justify-center gap-2 transition-all ${categoria === "Verduras" ? "bg-[#FAD9D0] border-2 border-[#B93B11]" : "bg-[#E2F1F6] border-2 border-transparent"}`}>
              <span className={`material-symbols-outlined text-[36px] ${categoria === "Verduras" ? "text-[#B93B11]" : "text-[#B93B11]"}`}>eco</span>
              <span className={`font-bold text-[14px] ${categoria === "Verduras" ? "text-[#0B3B3C]" : "text-[#0B3B3C]"}`}>Verduras</span>
            </button>

            {/* Cocinados */}
            <button onClick={() => setCategoria("Cocinados")} className={`h-[110px] rounded-3xl flex flex-col items-center justify-center gap-2 transition-all ${categoria === "Cocinados" ? "bg-[#FAD9D0] border-2 border-[#B93B11]" : "bg-[#E2F1F6] border-2 border-transparent"}`}>
              <span className={`material-symbols-outlined text-[36px] ${categoria === "Cocinados" ? "text-[#B93B11]" : "text-[#B93B11]"}`}>local_dining</span>
              <span className={`font-bold text-[14px] ${categoria === "Cocinados" ? "text-[#0B3B3C]" : "text-[#0B3B3C]"}`}>Cocinados</span>
            </button>
            
          </div>
        </div>

        {/* UBICACIÓN */}
        <div className="mb-8">
          <label className="block text-[#0B3B3C] font-black text-[17px] mb-4">Ubicación</label>
          <div className="flex gap-4">
            {["Casa", "Arcón", "Choco"].map(loc => (
              <button 
                key={loc}
                onClick={() => setUbicacion(loc)}
                className={`px-8 py-3 rounded-full font-bold text-[15px] transition-colors ${
                  ubicacion === loc 
                    ? "bg-[#0B3B3C] text-white shadow-sm" 
                    : "bg-[#E2F1F6] text-[#0B3B3C] hover:bg-[#c2dce4]"
                }`}
              >
                {loc}
              </button>
            ))}
          </div>
        </div>

        {/* CANTIDAD Y FECHA */}
        <div className="grid grid-cols-2 gap-6 mb-12">
          <div>
            <label className="block text-[#0B3B3C] font-black text-[17px] mb-4">Cantidad</label>
            <div className="bg-[#E2F1F6] rounded-[20px] p-2 flex items-center justify-between">
              <button onClick={decrement} className="w-10 h-10 bg-[#D1E6ED] rounded-xl flex items-center justify-center text-[#B93B11] hover:bg-[#c2dce4] active:scale-95 transition-all">
                <span className="material-symbols-outlined font-black">remove</span>
              </button>
              <span className="font-black text-[20px] text-[#0B3B3C]">{cantidad}</span>
              <button onClick={increment} className="w-10 h-10 bg-[#90290C] rounded-xl flex items-center justify-center text-white shadow-sm hover:bg-[#7a230a] active:scale-95 transition-all">
                <span className="material-symbols-outlined font-black">add</span>
              </button>
            </div>
          </div>
          <div>
            <label className="block text-[#0B3B3C] font-black text-[17px] mb-4">Congelado el</label>
            <div className="relative">
              <input 
                type="date" 
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full bg-[#E2F1F6] text-[#0B3B3C] rounded-[20px] p-3.5 pl-4 pr-10 text-[15px] font-bold outline-none focus:ring-2 focus:ring-[#B93B11] transition-all cursor-pointer h-[56px]"
              />
            </div>
          </div>
        </div>

        {/* BOTON GUARDAR */}
        <button className="w-full bg-[#90290C] text-white rounded-[24px] py-4 md:py-5 flex items-center justify-center gap-3 font-bold text-[18px] shadow-lg hover:bg-[#7a230a] hover:shadow-xl active:scale-95 transition-all">
          <span className="material-symbols-outlined text-[24px]">archive</span>
          Guardar
        </button>

      </main>

      <BottomNav />
    </div>
  );
}
