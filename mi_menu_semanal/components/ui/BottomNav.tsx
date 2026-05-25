"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function BottomNav() {
  const pathname = usePathname();

  const navItems = [
    { href: "/", icon: "restaurant", label: "Recetas", fill: true },
    { href: "/planear", icon: "calendar_today", label: "Menú semanal" },
    { href: "/lista", icon: "shopping_cart", label: "Lista" }, // Placeholder for now
    { href: "/congelador", icon: "ac_unit", label: "Congelador" },
  ];

  return (
    <nav className="fixed bottom-0 w-full z-50 flex justify-around items-center px-4 pb-4 pt-2 bg-[#f3faff]/80 dark:bg-slate-950/80 backdrop-blur-md border-t border-cyan-100 dark:border-slate-800 shadow-lg rounded-t-2xl md:hidden">
      {navItems.map((item) => {
        // Determinamos si está activa: 
        // 1. Coincidencia exacta
        // 2. O si es la home ("/") y estamos en "/recetas/..."
        const isActive = 
          pathname === item.href || 
          (item.href === "/" && pathname?.startsWith("/recetas"));
          
        return (
          <Link
            key={item.label}
            href={item.href}
            className={`flex flex-col items-center justify-center px-3 py-1 transition-all active:scale-90 duration-200 rounded-xl ${
              isActive
                ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"
                : "text-cyan-600 dark:text-cyan-500 hover:text-orange-500"
            }`}
          >
            <span
              className="material-symbols-outlined"
              style={(item.fill || isActive) ? { fontVariationSettings: '"FILL" 1' } : {}}
            >
              {item.icon}
            </span>
            <span className="font-headline font-medium text-[0.625rem] mt-0.5">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
