"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BottomNav } from "@/components/ui/BottomNav";
import { getFreezerItems, saveFreezerItems } from "@/lib/syncStore";

export default function AñadirCongeladorPage() {
  const router = useRouter();
  const [titulo, setTitulo] = useState("");
  const [categoria, setCategoria] = useState("Carnes");
  const [ubicacion, setUbicacion] = useState("Casa");
  const [cantidad, setCantidad] = useState(1);
  const [fecha, setFecha] = useState("");
  const [fechaMaxima, setFechaMaxima] = useState("");

  useEffect(() => {
    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000;
    const localToday = new Date(today.getTime() - tzOffset);
    setFecha(localToday.toISOString().split('T')[0]);
    
    const future = new Date(localToday);
    future.setMonth(future.getMonth() + 6); // 6 meses de margen por defecto
    setFechaMaxima(future.toISOString().split('T')[0]);
  }, []);

  const increment = () => setCantidad(c => c + 1);
  const decrement = () => setCantidad(c => Math.max(1, c - 1));

  const handleSave = async () => {
    if (!titulo.trim()) {
      alert("Por favor, introduce el nombre de lo que vas a guardar.");
      return;
    }

    const items = await getFreezerItems([]);

    let icon = "restaurant";
    let iconColor = "text-[#B93B11]";
    let iconBg = "bg-[#FAD9D0]";
    let borderColor = "border-l-[#B93B11]";

    if (categoria === "Carnes") { icon = "kebab_dining"; iconColor = "text-[#B93B11]"; iconBg = "bg-[#FAD9D0]"; borderColor = "border-l-[#B93B11]"; }
    else if (categoria === "Pescados") { icon = "set_meal"; iconColor = "text-[#08635d]"; iconBg = "bg-[#A7F3D0]"; borderColor = "border-l-[#08635d]"; }
    else if (categoria === "Verduras") { icon = "eco"; iconColor = "text-gray-600"; iconBg = "bg-[#E5E7EB]"; borderColor = "border-l-gray-500"; }
    else if (categoria === "Cocinados") { icon = "local_dining"; iconColor = "text-[#0B3B3C]"; iconBg = "bg-[#E2F1F6]"; borderColor = "border-l-[#0B3B3C]"; }

    const newItem = {
      id: Date.now(),
      title: titulo,
      subtitle: `${categoria}`,
      location: ubicacion,
      status: "NUEVO",
      statusColor: iconColor,
      statusBg: iconBg,
      borderColor: borderColor,
      icon: icon,
      iconColor: iconColor,
      iconBg: iconBg,
      unitLabel: "Unidades",
      count: cantidad,
      date: fecha,
      warning: fechaMaxima ? `Máx: ${fechaMaxima}` : "Consumir pronto",
      warningColor: "text-gray-500"
    };

    await saveFreezerItems([newItem, ...items]);
    router.push('/congelador');
  };

  return (
    <div className="bg-[#F6F9FC] h-full w-full overflow-y-auto overflow-x-hidden relative pb-32 md:pb-12 font-plus-jakarta text-[#2A4B4C]">
      
      {/* HEADER SUPERIOR */}
      <header className="px-6 py-6 flex justify-between items-center sticky top-0 z-40 md:max-w-3xl md:mx-auto bg-transparent">
        <div className="flex items-center gap-4">
          <Link href="/congelador" className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm text-[#0B3B3C] hover:bg-gray-50 transition-colors">
            <span className="material-symbols-outlined font-bold text-[24px]">arrow_back</span>
          </Link>
          <h2 className="text-[#0B3B3C] font-bold text-[20px]">Añadir al Congelador</h2>
        </div>
        <div className="w-10"></div> {/* Spacer para mantener el título centrado si se requiere, o simplemente dejarlo sin nada */}
      </header>
      
      <main className="px-6 max-w-3xl mx-auto relative z-10 pt-4">
        
        {/* TITULO */}
        <div className="mb-8">
          <h2 className="text-3xl font-black font-headline tracking-tight leading-none mb-2 text-[#0B3B3C]">Nuevo Registro</h2>
          <p className="text-gray-500 text-[15px] font-medium">Añade nuevos productos a tu inventario</p>
        </div>

        {/* ¿QUÉ VAMOS A GUARDAR? */}
        <div className="mb-6 md:mb-8">
          <label className="block text-[#0B3B3C] font-black text-base md:text-[17px] mb-2 md:mb-3">¿Qué vamos a guardar?</label>
          <div className="relative">
            <input 
              type="text" 
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej: Lasaña, Merluza..." 
              className="w-full bg-[#E2F1F6] text-[#0B3B3C] placeholder-gray-400 rounded-[20px] md:rounded-3xl py-3.5 md:py-4 pl-5 md:pl-6 pr-12 text-[15px] md:text-[16px] font-medium outline-none focus:ring-2 focus:ring-[#B93B11] transition-all"
            />
            <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-[22px] md:text-[26px]">restaurant</span>
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
        <div className="mb-6 md:mb-8">
          <label className="block text-[#0B3B3C] font-black text-base md:text-[17px] mb-3 md:mb-4">Ubicación</label>
          <div className="flex flex-wrap gap-3 md:gap-4">
            {["Casa", "Arcón", "Choco"].map(loc => (
              <button 
                key={loc}
                onClick={() => setUbicacion(loc)}
                className={`px-6 py-2.5 md:px-8 md:py-3 rounded-full font-bold text-sm md:text-[15px] transition-colors ${
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
        {/* CANTIDAD Y FECHAS */}
        <div className="mb-10 md:mb-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6 mb-4">
            <div>
              <label className="block text-[#0B3B3C] font-black text-[15px] md:text-[17px] mb-2 md:mb-4">Cantidad</label>
              <div className="bg-[#E2F1F6] rounded-[16px] md:rounded-[20px] p-2 flex items-center justify-between">
                <button onClick={decrement} className="w-8 h-8 md:w-10 md:h-10 bg-[#D1E6ED] rounded-[10px] md:rounded-xl flex items-center justify-center text-[#B93B11] hover:bg-[#c2dce4] active:scale-95 transition-all">
                  <span className="material-symbols-outlined font-black text-[20px] md:text-[24px]">remove</span>
                </button>
                <span className="font-black text-lg md:text-[20px] text-[#0B3B3C]">{cantidad}</span>
                <button onClick={increment} className="w-8 h-8 md:w-10 md:h-10 bg-[#90290C] rounded-[10px] md:rounded-xl flex items-center justify-center text-white shadow-sm hover:bg-[#7a230a] active:scale-95 transition-all">
                  <span className="material-symbols-outlined font-black text-[20px] md:text-[24px]">add</span>
                </button>
              </div>
            </div>
            <div>
              <label className="block text-[#0B3B3C] font-black text-[15px] md:text-[17px] mb-2 md:mb-4">Congelado el</label>
              <div className="relative">
                <input 
                  type="date" 
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="w-full bg-[#E2F1F6] text-[#0B3B3C] rounded-[16px] md:rounded-[20px] p-3 md:p-3.5 pl-3 md:pl-4 pr-8 md:pr-10 text-sm md:text-[15px] font-bold outline-none focus:ring-2 focus:ring-[#B93B11] transition-all cursor-pointer h-[48px] md:h-[56px]"
                />
              </div>
            </div>
          </div>
          <div className="w-full">
            <label className="block text-[#0B3B3C] font-black text-[15px] md:text-[17px] mb-2 md:mb-4">Fecha máx. de congelado</label>
            <div className="relative">
              <input 
                type="date" 
                value={fechaMaxima}
                onChange={(e) => setFechaMaxima(e.target.value)}
                className="w-full bg-[#FAD9D0] text-[#0B3B3C] border border-[#B93B11]/20 rounded-[16px] md:rounded-[20px] p-3 md:p-3.5 pl-3 md:pl-4 pr-8 md:pr-10 text-sm md:text-[15px] font-bold outline-none focus:ring-2 focus:ring-[#B93B11] transition-all cursor-pointer h-[48px] md:h-[56px]"
              />
            </div>
          </div>
        </div>

        {/* BOTON GUARDAR */}
        <button 
          onClick={handleSave}
          className="w-full bg-[#90290C] text-white rounded-[20px] md:rounded-[24px] py-3.5 md:py-5 flex items-center justify-center gap-2 md:gap-3 font-bold text-base md:text-[18px] shadow-lg hover:bg-[#7a230a] hover:shadow-xl active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined text-[22px] md:text-[24px]">archive</span>
          Guardar
        </button>

      </main>

      <BottomNav />
    </div>
  );
}
