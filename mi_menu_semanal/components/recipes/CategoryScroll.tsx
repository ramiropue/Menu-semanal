import { Category } from "@/data/mockData";

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
      <div className="flex justify-between md:justify-center gap-1 md:gap-4 pb-4 px-1 md:px-0 md:flex-wrap w-full">
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => onCategoryClick?.(category.id)}
            className="flex-shrink-0 flex flex-col items-center gap-1.5 md:gap-2 w-[52px] md:w-24 group cursor-pointer"
          >
            <div
              className={`w-[46px] h-[46px] md:w-[72px] md:h-[72px] rounded-[14px] md:rounded-[20px] flex items-center justify-center transition-all active:scale-95 ${
                category.isActive
                  ? "bg-secondary shadow-md text-white"
                  : "bg-white dark:bg-slate-800 shadow-sm border border-transparent group-hover:border-secondary-fixed text-secondary"
              }`}
            >
              <span className="material-symbols-outlined text-[24px] md:text-[32px]">
                {category.icon}
              </span>
            </div>
            <span
              className={`font-headline font-bold text-[8.5px] md:text-[13px] uppercase tracking-tighter md:tracking-wider text-center leading-tight ${
                category.isActive ? "text-secondary" : "text-on-surface"
              }`}
            >
              {category.name}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
