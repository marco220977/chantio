"use client";
import { sb } from "./supabase";

export const FB_KIND: Record<string, string> = { idee: "💡 Idée / amélioration", bug: "🐞 Problème", autre: "💬 Autre" };
export const FB_STATUS: Record<string, [string, string]> = {
  nouveau: ["Reçue", "bg-slate-100 text-slate-700"], etude: ["À l'étude", "bg-blue-100 text-blue-800"],
  prevu: ["Prévue", "bg-amber-100 text-amber-800"], fait: ["Disponible", "bg-green-100 text-green-800"], refuse: ["Non retenue", "bg-red-100 text-red-700"],
};
export async function notifyFeedback(id: string, action: "new" | "reply") {
  const { data: { session } } = await sb().auth.getSession();
  await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ id, action }) }).catch(() => {});
}
