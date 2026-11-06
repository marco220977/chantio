"use client";
import { sb } from "./supabase";

// Lecture de plaque signalétique via la fonction Supabase « scan-plaque »
export async function scanPlate(image: string): Promise<any> {
  const { data, error } = await sb().functions.invoke("scan-plaque", { body: { image } });
  if (error) {
    let msg = error.message;
    try { const j = await (error as any).context?.json?.(); if (j?.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
