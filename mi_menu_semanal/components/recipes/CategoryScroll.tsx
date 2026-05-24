import { Category } from "@/data/mockData";

export function CategoryScroll({ categories }: { categories: Category[] }) {
  return (
    <section className="mb-12">
      <div className="flex items-center justify-center mb-6">
        <h3 className="font-headline text-2xl font-bold text-on-surface">
          Explorar Categorías
        </h3>
      </div>
      <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-4 -mx-2 px-2 snap-x snap-mandatory md:justify-center md:flex-wrap md:overflow-visible">
        {categories.map((category) => (
          <button
            key={category.id}
            className="flex-shrink-0 flex flex-col items-center gap-3 w-24 md:w-28 snap-start group"
          >
            <div
              className={`w-[72px] h-[72px] md:w-[88px] md:h-[88px] rounded-[24px] flex items-center justify-center transition-all active:scale-95 ${
                category.isActive
                  ? "bg-secondary shadow-md text-white"
                  : "bg-white dark:bg-slate-800 shadow-sm border border-transparent group-hover:border-secondary-fixed text-secondary"
              }`}
            >
              <span className="material-symbols-outlined text-[32px] md:text-[40px]">
                {category.icon}
              </span>
            </div>
            <span
              className={`font-headline font-bold text-[13px] md:text-[15px] uppercase tracking-wider ${
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
