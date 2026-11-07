"use client";
import { useEffect } from "react";

export default function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  // Bloque le défilement de la page derrière la fenêtre, et le rétablit à la fermeture
  useEffect(() => {
    const b = document.body;
    const prev = b.style.overflow;
    b.style.overflow = "hidden";
    return () => { b.style.overflow = prev; };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="max-h-[88dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-3xl"
        style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }} onClick={(e) => e.stopPropagation()}>
        <div className="sticky -top-5 z-10 -mx-5 -mt-5 mb-4 flex items-center justify-between bg-white px-5 pb-2 pt-5">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="px-2 text-3xl leading-none text-slate-400" aria-label="Fermer">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
