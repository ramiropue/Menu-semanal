export function Header() {
  return (
    <header className="bg-cyan-50/80 dark:bg-slate-900/80 backdrop-blur-md docked full-width top-0 sticky z-50 flex items-center justify-between px-6 py-4 w-full tonal-shift bg-cyan-100/50 dark:bg-cyan-900/20">
      <div className="flex-1 flex items-center">
        <a href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <div className="w-8 h-8 rounded-xl bg-orange-500 flex items-center justify-center text-white shadow-md">
            <span className="material-symbols-outlined text-lg">restaurant_menu</span>
          </div>
          <span className="font-headline font-black text-xl text-cyan-900 dark:text-cyan-100 tracking-tight hidden sm:block">MiMenú</span>
        </a>
      </div>
      
      <nav className="hidden md:flex gap-12 justify-center items-center">
        <a
          className="px-5 py-2.5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 font-bold font-plus-jakarta text-base tracking-tight shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
          href="#"
        >
          Recetas
        </a>
        <a
          className="px-5 py-2.5 rounded-full text-cyan-800 dark:text-cyan-200 font-bold font-plus-jakarta text-base tracking-tight hover:bg-white/80 dark:hover:bg-slate-800/80 hover:text-orange-600 dark:hover:text-orange-400 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
          href="/planear"
        >
          Menú semanal
        </a>
        <a
          className="px-5 py-2.5 rounded-full text-cyan-800 dark:text-cyan-200 font-bold font-plus-jakarta text-base tracking-tight hover:bg-white/80 dark:hover:bg-slate-800/80 hover:text-orange-600 dark:hover:text-orange-400 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
          href="#"
        >
          Lista de la compra
        </a>
        <a
          className="px-5 py-2.5 rounded-full text-cyan-800 dark:text-cyan-200 font-bold font-plus-jakarta text-base tracking-tight hover:bg-white/80 dark:hover:bg-slate-800/80 hover:text-orange-600 dark:hover:text-orange-400 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
          href="/congelador"
        >
          Congelador
        </a>
      </nav>

      <div className="flex-1 flex justify-end">
        <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center overflow-hidden border-2 border-primary-fixed ring-2 ring-primary-container/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="Perfil de Chef"
            className="w-full h-full object-cover"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuCaHVUEqJ_EsMFIYTbDiGDN8Mv7LyHDcjaAU75Ia76pGbP3xzS5hVV7s2-z_Q4W1C4ZmQaT_pCjmyf6nF68ZdfWg43WjmN6jbvUd17-5gGb8Nm54nxZSun-inV4xJgjZj-XGIkh-jd11Uj75X-_9KlHSt7A0NH9OoLtoxUrjDNcYWnFCw0GkX0YtmUIkFtywdcah1WjViNpCHrVT3B3z_OkGopU2zPjsZssXcnYSqC2IE4xRaC_CWj9Jv_cWarjrt6dhUFWf_M1lAg"
          />
        </div>
      </div>
    </header>
  );
}
