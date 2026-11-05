"use client";
import { sb } from "./supabase";

export async function sendMail(body: Record<string, any>) {
  const { data: { session } } = await sb().auth.getSession();
  const r = await fetch("/api/send-document", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify({ ...body, origin: location.origin }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Échec de l'envoi");
  return j;
}

export async function askEmail(current?: string | null, clientId?: string | null): Promise<string | null> {
  let to = current || "";
  if (!to) {
    to = (prompt("Adresse e-mail du client ?") || "").trim();
    if (!to) return null;
    if (clientId) await sb().from("clients").update({ email: to }).eq("id", clientId);
  }
  return to;
}

export const snapshotOf = (c?: any) => c ? { name: c.name, email: c.email, phone: c.phone, address: c.address, zip: c.zip, city: c.city, type: c.type, siret: c.siret } : null;
