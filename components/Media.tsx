"use client";
import { useState } from "react";
import { isVideo, posterOf } from "@/lib/chantiers";

// Vignette d'une photo ou d'une vidéo (aperçu + ▶)
export function MediaImg({ path, urls, className = "h-full w-full object-cover" }: { path: string; urls: Record<string, string>; className?: string }) {
  const src = isVideo(path) ? urls[posterOf(path)] : urls[path];
  return (
    <span className="relative block h-full w-full">
      {src ? <img src={src} alt="" loading="lazy" className={className} /> : isVideo(path) ? <span className="block h-full w-full bg-slate-800" /> : null}
      {isVideo(path) && <span className="absolute inset-0 flex items-center justify-center"><span className="rounded-full bg-black/60 px-3 py-2 text-lg text-white">▶</span></span>}
    </span>
  );
}

// Lecteur plein écran
export function VideoModal({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black" onClick={onClose}>
      <div className="flex justify-end p-3"><button className="text-3xl text-white" onClick={onClose}>×</button></div>
      <div className="flex flex-1 items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <video src={src} controls autoPlay playsInline className="max-h-full max-w-full" />
      </div>
      <div className="p-3" onClick={(e) => e.stopPropagation()}><a className="btn w-full bg-white/10 text-white" href={src} target="_blank" rel="noreferrer">⬇️ Télécharger</a></div>
    </div>
  );
}

// Grille de vignettes cliquables (photo → nouvel onglet, vidéo → lecteur)
export function MediaGrid({ paths, urls, onRemove, cols = 4 }: { paths: string[]; urls: Record<string, string>; onRemove?: (p: string) => void; cols?: number }) {
  const [play, setPlay] = useState<string | null>(null);
  return (
    <>
      <div className={`grid gap-1.5 ${cols === 3 ? "grid-cols-3" : "grid-cols-4"}`}>
        {paths.map((p) => (
          <div key={p} className="relative aspect-square overflow-hidden rounded-lg bg-slate-100">
            {isVideo(p)
              ? <button className="block h-full w-full" onClick={() => urls[p] && setPlay(urls[p])}><MediaImg path={p} urls={urls} /></button>
              : <a href={urls[p]} target="_blank" rel="noreferrer" className="block h-full w-full"><MediaImg path={p} urls={urls} /></a>}
            {onRemove && <button className="absolute right-0.5 top-0.5 rounded-full bg-black/60 px-1.5 text-xs text-white" onClick={() => onRemove(p)}>×</button>}
          </div>
        ))}
      </div>
      {play && <VideoModal src={play} onClose={() => setPlay(null)} />}
    </>
  );
}

// Boutons d'ajout : photo, vidéo, galerie
export function MediaButtons({ onFiles }: { onFiles: (f: File[]) => void }) {
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files?.length) onFiles(Array.from(e.target.files)); e.target.value = ""; };
  return (
    <div className="grid grid-cols-3 gap-2">
      <label className="btn-ghost cursor-pointer !px-2 text-sm">📷 Photo<input type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} /></label>
      <label className="btn-ghost cursor-pointer !px-2 text-sm">🎥 Vidéo<input type="file" accept="video/*" capture="environment" className="hidden" onChange={pick} /></label>
      <label className="btn-ghost cursor-pointer !px-2 text-sm">🖼 Galerie<input type="file" accept="image/*,video/*" multiple className="hidden" onChange={pick} /></label>
    </div>
  );
}
