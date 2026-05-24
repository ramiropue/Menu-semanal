export function SearchBar() {
  return (
    <section className="mb-12">
      <div className="mb-6 text-center">
        <h2 className="font-headline text-4xl md:text-5xl font-extrabold text-on-surface tracking-tight leading-tight">
          Mis <span className="text-secondary italic">Recetas</span>
        </h2>
        <p className="text-on-surface-variant text-lg mt-2 font-medium">
          Encuentra inspiración para tu próxima creación.
        </p>
      </div>
      <div className="relative group max-w-2xl mx-auto">
        <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none text-primary">
          <span className="material-symbols-outlined text-[28px]">search</span>
        </div>
        <input
          className="w-full bg-surface-container-low border-none rounded-full py-5 pl-16 pr-6 text-on-surface-variant text-[18px] md:text-xl font-medium placeholder:text-outline/60 focus:ring-4 focus:ring-primary-fixed-dim/30 transition-all shadow-sm outline-none"
          placeholder="Buscar ingredientes, platos..."
          type="text"
        />
      </div>
    </section>
  );
}
