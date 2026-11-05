"use client";
import { sb } from "./supabase";

export type Chantier = {
  id: string; title: string; status: string; client_id?: string | null; client_snapshot?: any; document_id?: string | null;
  address?: string; start_date?: string; end_date?: string; notes?: string; cover_path?: string | null; created_at?: string;
};
export type Entry = { id: string; chantier_id: string; created_at: string; author?: string; tag: string; text?: string; photos: string[] };

export const CH_STATUS: Record<string, [string, string]> = {
  planned: ["À venir", "bg-blue-100 text-blue-800"],
  in_progress: ["En cours", "bg-amber-100 text-amber-800"],
  done: ["Terminé", "bg-green-100 text-green-800"],
};

export const TAGS: Record<string, [string, string]> = {
  avant: ["Avant", "bg-slate-200 text-slate-700"],
  pendant: ["Pendant", "bg-blue-100 text-blue-800"],
  apres: ["Après", "bg-green-100 text-green-800"],
  probleme: ["Problème", "bg-red-100 text-red-700"],
  reception: ["Réception", "bg-purple-100 text-purple-800"],
};

export async function compressPhoto(file: File, max = 1600): Promise<Blob> {
  const img = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.8));
}

export async function uploadPhoto(companyId: string, chantierId: string, file: File): Promise<string> {
  const blob = await compressPhoto(file);
  const path = `${companyId}/${chantierId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await sb().storage.from("chantiers").upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  return path;
}

const cache = new Map<string, { url: string; exp: number }>();
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const missing = paths.filter((p) => { const c = cache.get(p); if (c && c.exp > Date.now()) { out[p] = c.url; return false; } return true; });
  if (missing.length) {
    const { data } = await sb().storage.from("chantiers").createSignedUrls(missing, 3600);
    for (const d of data || []) if (d.signedUrl && d.path) { out[d.path] = d.signedUrl; cache.set(d.path, { url: d.signedUrl, exp: Date.now() + 3500_000 }); }
  }
  return out;
}
