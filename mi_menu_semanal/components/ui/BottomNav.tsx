export function BottomNav() {
  return (
    <nav className="fixed bottom-0 w-full z-50 flex justify-around items-center px-4 pb-4 pt-2 bg-[#f3faff]/80 dark:bg-slate-950/80 backdrop-blur-md border-t border-cyan-100 dark:border-slate-800 shadow-lg rounded-t-2xl md:hidden">
      <a
        className="flex flex-col items-center justify-center text-cyan-600 dark:text-cyan-500 px-3 py-1 hover:text-orange-500 transition-all active:scale-90 duration-200 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-xl"
        href="#"
      >
        <span
          className="material-symbols-outlined"
          style={{ fontVariationSettings: '"FILL" 1' }}
        >
          restaurant
        </span>
        <span className="font-headline font-medium text-[0.625rem]">Recetas</span>
      </a>
      <a
        className="flex flex-col items-center justify-center text-cyan-600 dark:text-cyan-500 px-3 py-1 hover:text-orange-500 transition-all active:scale-90 duration-200"
        href="/planear"
      >
        <span className="material-symbols-outlined">calendar_today</span>
        <span className="font-headline font-medium text-[0.625rem]">Menú semanal</span>
      </a>
      <a
        className="flex flex-col items-center justify-center text-cyan-600 dark:text-cyan-500 px-3 py-1 hover:text-orange-500 transition-all active:scale-90 duration-200"
        href="#"
      >
        <span className="material-symbols-outlined">shopping_cart</span>
        <span className="font-headline font-medium text-[0.625rem]">Lista</span>
      </a>
      <a
        className="flex flex-col items-center justify-center px-3 py-1 hover:text-orange-500 transition-all active:scale-90 duration-200 text-cyan-600 dark:text-cyan-500"
        href="/congelador"
      >
        <span className="material-symbols-outlined">ac_unit</span>
        <span className="font-headline font-medium text-[0.625rem]">Congelador</span>
      </a>
    </nav>
  );
}
