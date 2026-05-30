import Link from "next/link";

export function FAB() {
  return (
    <div className="fixed bottom-24 md:bottom-20 inset-x-0 mx-auto max-w-[90rem] z-[60] pointer-events-none">
      <Link href="/recetas/nueva" className="absolute right-4 md:right-0 w-14 h-14 md:w-16 md:h-16 bg-secondary text-white rounded-full shadow-lg flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-200 group pointer-events-auto">
        <span className="material-symbols-outlined text-3xl md:text-4xl">add</span>
      </Link>
    </div>
  );
}
