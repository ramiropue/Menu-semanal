import Link from "next/link";

export function FAB() {
  return (
    <Link href="/recetas/nueva" className="fixed bottom-24 right-6 w-14 h-14 bg-secondary text-white rounded-full shadow-lg flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-200 z-[60] group">
      <span className="material-symbols-outlined text-3xl">add</span>
    </Link>
  );
}
