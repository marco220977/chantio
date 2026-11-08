"use client";
import { useState } from "react";
import { sb } from "@/lib/supabase";

// Lien de prise de RDV en ligne envoyé au client (créneaux optimisés selon les trajets)
export default function RdvLink({ ticket, companyName, onToken, table = "sav_tickets" }: { ticket: any; companyName: string; onToken?: (t: string) => void; table?: "sav_tickets" | "receptions" }) {
  const [token, setToken] = useState<string>(ticket.booking_token || "");
  const [msg, setMsg] = useState("");
  const phone = String(ticket.client_snapshot?.phone || "").replace(/[^\d+]/g, "");
  const email = ticket.client_snapshot?.email || "";
  const url = token ? `${location.origin}/rdv/${token}` : "";
  const text = `Bonjour, ${companyName} : choisissez votre rendez-vous pour ${table === "receptions" ? "l'intervention" : `l'intervention SAV n° ${ticket.number}`} ici : ${url}`;

  async function ensure() {
    if (token) return token;
    const tk = crypto.randomUUID();
    const { error } = await sb().from(table).update({ booking_token: tk }).eq("id", ticket.id);
    if (error) { setMsg(error.message); return ""; }
    setToken(tk); onToken?.(tk); return tk;
  }
  const wa = phone ? (phone.startsWith("0") ? "33" + phone.slice(1) : phone.replace("+", "")) : "";

  if (!token) return <button className="btn-ghost w-full" onClick={ensure}>📲 Laisser le client choisir son RDV en ligne</button>;
  return (
    <div className="space-y-2 rounded-xl bg-slate-50 p-3">
      <p className="text-sm font-semibold">📲 Lien de prise de RDV pour le client</p>
      <p className="text-xs text-slate-500">Le client voit uniquement les créneaux où un technicien est déjà dans son secteur.</p>
      <div className="grid grid-cols-2 gap-2">
        {phone && <a className="btn-ghost text-center text-sm" href={`sms:${phone}?body=${encodeURIComponent(text)}`}>💬 SMS</a>}
        {wa && <a className="btn-ghost text-center text-sm" href={`https://wa.me/${wa}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">🟢 WhatsApp</a>}
        {email && <a className="btn-ghost text-center text-sm" href={`mailto:${email}?subject=${encodeURIComponent(table === "receptions" ? "Rendez-vous d'intervention" : `Rendez-vous SAV n° ${ticket.number}`)}&body=${encodeURIComponent(text)}`}>📧 E-mail</a>}
        <button className="btn-ghost text-sm" onClick={async () => { try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(url); setMsg("Lien copié"); } } catch {} }}>🔗 Partager</button>
        <button className="btn-ghost text-sm" onClick={async () => { await navigator.clipboard.writeText(url).catch(() => {}); setMsg("Lien copié"); }}>📋 Copier</button>
        <a className="btn-ghost text-center text-sm" href={url} target="_blank" rel="noreferrer">👁 Voir</a>
      </div>
      {msg && <p className="text-xs text-emerald-700">{msg}</p>}
    </div>
  );
}
