"use client";

import { Category } from "@/data/mockData";
import Link from "next/link";

export function CategoryScroll({ 
  categories, 
  onCategoryClick 
}: { 
  categories: Category[];
  onCategoryClick?: (id: string) => void;
}) {
  return (
    <section className="mb-10 md:mb-12">
      <div className="flex items-center justify-center mb-4 md:mb-5">
        <h3 className="font-headline text-xl md:text-[22px] font-bold text-on-surface">
          Explorar Categorías
        </h3>
      </div>
      <div className="grid grid-cols-4 sm:flex sm:flex-wrap sm:justify-center gap-2 md:gap-4 pb-4 px-1 md:px-0 w-full justify-items-center">
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onCategoryClick?.(category.id);
            }}
            className="flex-shrink-0 flex flex-col items-center gap-1.5 md:gap-2 w-[52px] md:w-24 group cursor-pointer touch-manipulation select-none"
          >
            <div
              className={`w-[46px] h-[46px] md:w-[72px] md:h-[72px] rounded-[14px] md:rounded-[20px] flex items-center justify-center transition-all active:scale-95 ${
                category.isActive
                  ? "bg-secondary shadow-md text-white"
                  : "bg-white dark:bg-slate-800 shadow-sm border border-transparent group-hover:border-secondary-fixed text-secondary"
              }`}
            >
              <span className="material-symbols-outlined text-[24px] md:text-[32px] pointer-events-none">
                {category.icon}
              </span>
            </div>
            <span
              className={`font-headline font-bold text-[8.5px] md:text-[13px] uppercase tracking-tighter md:tracking-wider text-center leading-tight pointer-events-none ${
                category.isActive ? "text-secondary" : "text-on-surface"
              }`}
            >
              {category.name}
            </span>
          </button>
        ))}
        <Link
          href="/categorias"
          className="flex-shrink-0 flex flex-col items-center gap-1.5 md:gap-2 w-[52px] md:w-24 group cursor-pointer touch-manipulation select-none"
        >
          <div className="w-[46px] h-[46px] md:w-[72px] md:h-[72px] rounded-[14px] md:rounded-[20px] flex items-center justify-center transition-all active:scale-95 bg-[#EAF5F8] border border-dashed border-[#2A4B4C]/30 group-hover:border-[#0B3B3C] text-[#2A4B4C] group-hover:text-[#0B3B3C]">
            <span className="material-symbols-outlined text-[24px] md:text-[32px] pointer-events-none">
              settings
            </span>
          </div>
          <span className="font-headline font-bold text-[8.5px] md:text-[13px] uppercase tracking-tighter md:tracking-wider text-center leading-tight text-on-surface pointer-events-none">
            Ajustes
          </span>
        </Link>
      </div>
    </section>
  );
}
