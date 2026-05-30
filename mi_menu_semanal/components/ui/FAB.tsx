import Link from "next/link";

export function FAB() {
  return (
    <div className="fixed bottom-24 right-6 md:bottom-12 md:right-12 z-[60]">
      <Link href="/recetas/nueva" className="w-[68px] h-[68px] bg-secondary text-white rounded-full flex items-center justify-center shadow-xl shadow-secondary/30 hover:scale-105 active:scale-95 transition-all">
        <span className="material-symbols-outlined text-[36px]">add</span>
      </Link>
    </div>
  );
}
