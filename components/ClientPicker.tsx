"use client";
import { useState } from "react";
import { sb } from "@/lib/supabase";
import type { Client } from "@/lib/types";

// Liste de clients avec création d'un nouveau client sur place (ajouté au fichier clients)
export default function ClientPicker({ clients, value, onChange, onCreated, disabled, placeholder = "— Client —", showCity }: {
  clients: Client[]; value?: string | null; onChange: (c: Client | null) => void; onCreated?: (c: Client) => void;
  disabled?: boolean; placeholder?: string; showCity?: boolean;
}) {
  const [nc, setNc] = useState<Partial<Client> | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!nc?.name?.trim()) return setErr("Indiquez le nom du client.");
    setBusy(true); setErr("");
    const row = { type: nc.type || "particulier", name: nc.name.trim(), phone: nc.phone?.trim() || null, email: nc.email?.trim().toLowerCase() || null,
      address: nc.address?.trim() || null, zip: nc.zip?.trim() || null, city: nc.city?.trim() || null };
    const { data, error } = await sb().from("clients").insert(row).select().single();
    setBusy(false);
    if (error) return setErr(error.message);
    onCreated?.(data); onChange(data); setNc(null);
  }

  if (nc) return (
    <div className="space-y-2 rounded-xl border border-brand/30 bg-slate-50 p-3">
      <p className="text-sm font-semibold">＋ Nouveau client <span className="font-normal text-slate-500">(ajouté au fichier clients)</span></p>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-200 p-1 text-xs">
        {[["particulier", "Particulier"], ["professionnel", "Professionnel"]].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setNc({ ...nc, type: k })} className={`rounded-md py-1.5 font-semibold ${nc.type === k ? "bg-white shadow" : "text-slate-600"}`}>{l}</button>
        ))}
      </div>
      <input className="input" placeholder={nc.type === "professionnel" ? "Raison sociale *" : "Nom et prénom *"} value={nc.name || ""} onChange={(e) => setNc({ ...nc, name: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <input className="input" type="tel" placeholder="Téléphone" value={nc.phone || ""} onChange={(e) => setNc({ ...nc, phone: e.target.value })} />
        <input className="input" type="email" placeholder="E-mail" value={nc.email || ""} onChange={(e) => setNc({ ...nc, email: e.target.value })} />
      </div>
      <input className="input" placeholder="Adresse (n° et rue)" value={nc.address || ""} onChange={(e) => setNc({ ...nc, address: e.target.value })} />
      <div className="grid grid-cols-3 gap-2">
        <input className="input" inputMode="numeric" placeholder="CP" value={nc.zip || ""} onChange={(e) => setNc({ ...nc, zip: e.target.value })} />
        <input className="input col-span-2" placeholder="Ville" value={nc.city || ""} onChange={(e) => setNc({ ...nc, city: e.target.value })} />
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-ghost" onClick={() => setNc(null)}>Annuler</button>
        <button type="button" className="btn-brand" disabled={busy} onClick={create}>{busy ? "…" : "Ajouter le client"}</button>
      </div>
    </div>
  );

  return (
    <select className="input" disabled={disabled} value={value || ""} onChange={(e) => {
      if (e.target.value === "__new") { setErr(""); setNc({ type: "particulier" }); return; }
      onChange(clients.find((x) => x.id === e.target.value) || null);
    }}>
      <option value="">{placeholder}</option>
      <option value="__new">＋ Nouveau client…</option>
      {clients.map((x) => <option key={x.id} value={x.id}>{x.name}{showCity && x.city ? ` (${x.city})` : ""}</option>)}
    </select>
  );
}
