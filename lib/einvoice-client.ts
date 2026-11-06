"use client";
import { sb } from "./supabase";

export async function callEInvoice(action: string, docId?: string) {
  const { data: { session } } = await sb().auth.getSession();
  const r = await fetch("/api/einvoice", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ action, docId }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Erreur de transmission");
  return j;
}
