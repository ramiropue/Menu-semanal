"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Header() {
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "Recetas" },
    { href: "/planear", label: "Menú semanal" },
    { href: "/lista", label: "Lista de la compra" }, // Placeholder
    { href: "/congelador", label: "Congelador" },
  ];

  return (
    <header className="bg-cyan-50/80 dark:bg-slate-900/80 backdrop-blur-md docked full-width top-0 sticky z-50 flex items-center justify-between px-6 py-4 w-full tonal-shift bg-cyan-100/50 dark:bg-cyan-900/20">
      <div className="flex-1 flex items-center">
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <img 
            src="/icon.png" 
            alt="Logo MiMenú" 
            className="w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl shadow-md object-cover" 
          />
          <span className="font-headline font-black text-xl md:text-2xl text-cyan-900 dark:text-cyan-100 tracking-tight hidden sm:block">MiMenú</span>
        </Link>
      </div>
      
      <nav className="hidden md:flex gap-12 justify-center items-center">
        {navItems.map((item) => {
          const isActive = 
            pathname === item.href || 
            (item.href === "/" && pathname?.startsWith("/recetas"));
            
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`px-5 py-2.5 rounded-full font-bold font-plus-jakarta text-base tracking-tight transition-all duration-300 ${
                isActive
                  ? "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 shadow-sm hover:shadow-md hover:-translate-y-0.5"
                  : "text-cyan-800 dark:text-cyan-200 hover:bg-white/80 dark:hover:bg-slate-800/80 hover:text-orange-600 dark:hover:text-orange-400 hover:shadow-md hover:-translate-y-0.5"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1 flex justify-end">
        <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center overflow-hidden border-2 border-primary-fixed ring-2 ring-primary-container/20">
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
