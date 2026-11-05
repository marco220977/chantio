"use client";
import { useRouter } from "next/navigation";

export default function Header({ title, back, right }: { title: string; back?: boolean; right?: React.ReactNode }) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
      {back && <button onClick={() => router.back()} className="-ml-1 p-1 text-xl" aria-label="Retour">←</button>}
      <h1 className="flex-1 truncate text-lg font-bold">{title}</h1>
      {right}
    </header>
  );
}
