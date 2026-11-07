"use client";
import { sb } from "./supabase";
import { currentPosition, stampPhoto } from "./stamp";

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

// ---------- Vidéos ----------
export const VIDEO_MAX_MB = 50;
export const isVideo = (path: string) => /\.(mp4|webm|mov|3gp|mkv|m4v)$/i.test(path);
export const posterOf = (path: string) => `${path}.jpg`;

// Image d'aperçu de la vidéo (1re seconde), horodatée et géolocalisée
async function videoPoster(file: File, when: Date, pos: { lat: number; lon: number; acc?: number } | null): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
    await new Promise<void>((ok, ko) => { v.onloadeddata = () => ok(); v.onerror = () => ko(new Error("video")); setTimeout(() => ko(new Error("timeout")), 15000); });
    await new Promise<void>((ok) => { v.onseeked = () => ok(); v.currentTime = Math.min(0.5, (v.duration || 1) / 2); setTimeout(ok, 3000); });
    const c = document.createElement("canvas"); c.width = v.videoWidth || 640; c.height = v.videoHeight || 360;
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    const frame: Blob = await new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.85));
    const dur = v.duration && isFinite(v.duration) ? ` ${Math.floor(v.duration / 60)}:${String(Math.round(v.duration % 60)).padStart(2, "0")}` : "";
    return await stampPhoto(frame, 1280, { when, pos, prefix: `▶ Vidéo${dur} · ` });
  } catch { return null; } finally { URL.revokeObjectURL(url); }
}

// Date et position GPS enregistrées dans le nom du fichier vidéo (…_g48.85123_2.35211.mp4)
export function videoInfo(path: string): { date?: Date; lat?: number; lon?: number } {
  const name = path.split("/").pop() || "";
  const ts = Number(name.split("-")[0]);
  const g = /_g(-?\d+\.\d+)_(-?\d+\.\d+)\./.exec(name);
  return { date: ts > 1e12 ? new Date(ts) : undefined, lat: g ? Number(g[1]) : undefined, lon: g ? Number(g[2]) : undefined };
}

async function uploadVideo(companyId: string, folder: string, file: File): Promise<string> {
  const mb = file.size / 1048576;
  if (mb > VIDEO_MAX_MB) throw new Error(`Vidéo trop lourde (${Math.round(mb)} Mo, maximum ${VIDEO_MAX_MB} Mo). Filmez moins longtemps (30 secondes environ) ou baissez la qualité vidéo dans l'appareil photo.`);
  const recent = Math.abs(Date.now() - (file.lastModified || Date.now())) < 10 * 60_000;
  const pos = recent ? await currentPosition() : null;
  const ext = (file.name.split(".").pop() || "").toLowerCase().match(/^(mp4|webm|mov|3gp|mkv|m4v)$/)?.[0] || (file.type.includes("webm") ? "webm" : file.type.includes("quicktime") ? "mov" : "mp4");
  const ts = file.lastModified && !recent ? file.lastModified : Date.now();
  const path = `${companyId}/${folder}/${ts}-${Math.random().toString(36).slice(2, 8)}${pos ? `_g${pos.lat.toFixed(5)}_${pos.lon.toFixed(5)}` : ""}.${ext}`;
  const { error } = await sb().storage.from("chantiers").upload(path, file, { contentType: file.type || `video/${ext}` });
  if (error) throw new Error(/size|exceed|large/i.test(error.message) ? `Vidéo trop lourde pour l'envoi (maximum ${VIDEO_MAX_MB} Mo).` : error.message);
  const poster = await videoPoster(file, new Date(ts), pos);
  if (poster) await sb().storage.from("chantiers").upload(posterOf(path), poster, { contentType: "image/jpeg" });
  return path;
}

// Liens longue durée (1 an) pour les vidéos citées dans les PDF
export async function longLinks(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await sb().storage.from("chantiers").createSignedUrls(paths, 365 * 24 * 3600);
  return Object.fromEntries((data || []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl as string]));
}

export async function uploadPhoto(companyId: string, chantierId: string, file: File): Promise<string> {
  if (file.type.startsWith("video/") || isVideo(file.name)) return uploadVideo(companyId, chantierId, file);
  const blob = await stampPhoto(file);
  const path = `${companyId}/${chantierId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await sb().storage.from("chantiers").upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  return path;
}

const cache = new Map<string, { url: string; exp: number }>();
export async function signedUrls(input: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const paths = Array.from(new Set(input.flatMap((p) => (isVideo(p) ? [p, posterOf(p)] : [p]))));
  const missing = paths.filter((p) => { const c = cache.get(p); if (c && c.exp > Date.now()) { out[p] = c.url; return false; } return true; });
  if (missing.length) {
    const { data } = await sb().storage.from("chantiers").createSignedUrls(missing, 3600);
    for (const d of data || []) if (d.signedUrl && d.path) { out[d.path] = d.signedUrl; cache.set(d.path, { url: d.signedUrl, exp: Date.now() + 3500_000 }); }
  }
  return out;
}

// Suppression d'un média (et de l'aperçu d'une vidéo)
export async function removeMedia(path: string) {
  await sb().storage.from("chantiers").remove(isVideo(path) ? [path, posterOf(path)] : [path]);
}
