"use client";
import { useEffect, useRef, useState } from "react";
import type jsPDF from "jspdf";

// Aperçu d'un PDF généré, rendu page par page en images (Chrome Android n'affiche pas les PDF intégrés)
export default function PdfPreview({ build, filename, onClose, inline = false }: { build: () => Promise<jsPDF>; filename: string; onClose?: () => void; inline?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<jsPDF | null>(null);
  const [err, setErr] = useState("");
  const [pages, setPages] = useState(0);

  useEffect(() => {
    let cancelled = false;
    box.current?.querySelectorAll("canvas").forEach((c) => c.remove());
    setPages(0);
    (async () => {
      try {
        const doc = await build();
        if (cancelled) return;
        setPdf(doc);
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const task = pdfjs.getDocument({ data: new Uint8Array(doc.output("arraybuffer")) });
        const file = await task.promise;
        setPages(file.numPages);
        const width = (box.current?.clientWidth || 360) - 16;
        const ratio = Math.min(window.devicePixelRatio || 1, 2.5);
        for (let i = 1; i <= file.numPages && !cancelled; i++) {
          const page = await file.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: (width / base.width) * ratio });
          const canvas = document.createElement("canvas");
          canvas.width = vp.width; canvas.height = vp.height;
          canvas.style.width = `${width}px`; canvas.className = "mx-auto mb-3 block rounded bg-white shadow-lg";
          await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
          box.current?.appendChild(canvas);
        }
      } catch (e: any) { if (!cancelled) setErr(e?.message || "Aperçu impossible"); }
    })();
    return () => { cancelled = true; };
  }, [build]);

  async function share() {
    if (!pdf) return;
    const f = new File([pdf.output("blob")], filename, { type: "application/pdf" });
    const nav = navigator as any;
    if (nav.canShare && nav.canShare({ files: [f] })) await nav.share({ files: [f], title: filename }).catch(() => {});
    else pdf.save(filename);
  }

  if (inline) return (
    <div className="space-y-2">
      <div className="rounded-2xl bg-slate-600 p-2" ref={box}>
        {!pages && !err && <p className="py-16 text-center text-sm text-white/80">Chargement du devis…</p>}
        {err && <p className="py-8 text-center text-sm text-red-200">{err}</p>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-ghost" disabled={!pdf} onClick={() => pdf?.save(filename)}>⬇️ Télécharger</button>
        <button className="btn-ghost" disabled={!pdf} onClick={share}>📤 Partager</button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-700">
      <div className="flex items-center justify-between bg-ink px-4 py-3 text-white">
        <span className="truncate text-sm font-semibold">👁 Aperçu{pages ? ` · ${pages} page${pages > 1 ? "s" : ""}` : ""}</span>
        <button onClick={onClose} className="text-2xl leading-none" aria-label="Fermer">×</button>
      </div>
      <div className="flex-1 overflow-y-auto p-2" ref={box}>
        {!pages && !err && <p className="mt-10 text-center text-white/80">Préparation de l'aperçu…</p>}
        {err && <p className="mt-10 text-center text-red-200">{err}</p>}
      </div>
      <div className="grid grid-cols-3 gap-2 bg-ink p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <button className="btn bg-white/10 text-white" onClick={onClose}>Fermer</button>
        <button className="btn bg-white/10 text-white" disabled={!pdf} onClick={() => pdf?.save(filename)}>⬇️ PDF</button>
        <button className="btn bg-flame text-white" disabled={!pdf} onClick={share}>📤 Partager</button>
      </div>
    </div>
  );
}
