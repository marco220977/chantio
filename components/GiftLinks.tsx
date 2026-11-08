"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";

type Gift = { code: string; label?: string; months: number | null; max_uses: number; uses: number; expires_at?: string | null; disabled: boolean; created_at: string;
  redemptions: { name?: string; email?: string; at: string }[] };
const d = (s?: string | null) => (s ? new Date(s).toLocaleDateString("fr-FR") : "");

// Liens d'accès offert (administrateur)
export default function GiftLinks() {
  const [list, setList] = useState<Gift[]>([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ label: "", months: "0", uses: "1", days: "30" });
  const [msg, setMsg] = useState("");
  const load = () => sb().rpc("admin_gift_list").then(({ data }) => setList(data || []));
  useEffect(() => { load(); }, []);
  const url = (c: string) => `${location.origin}/offert/${c}`;
  const text = (g: Gift) => `🎁 Je t'offre l'accès à l'application ${g.months ? `pendant ${g.months} mois` : "sans limite de durée"} (devis, factures, planning, SAV…) : ${url(g.code)}`;

  async function create() {
    const { data, error } = await sb().rpc("admin_gift_create", { p_label: f.label, p_months: Number(f.months), p_max_uses: Number(f.uses) || 1, p_valid_days: Number(f.days) || 0 });
    if (error) return setMsg(error.message);
    setOpen(false); setF({ label: "", months: "0", uses: "1", days: "30" }); await load();
    setMsg(`✅ Lien créé : ${url(data)}`);
  }
  async function share(g: Gift) {
    try { if (navigator.share) await navigator.share({ text: text(g) }); else { await navigator.clipboard.writeText(url(g.code)); setMsg("Lien copié"); } } catch {}
  }

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between"><p className="font-bold">🎁 Liens d'accès offert</p><button className="btn-brand !px-3 !py-1.5 text-sm" onClick={() => setOpen(!open)}>{open ? "Annuler" : "＋ Nouveau"}</button></div>
      <p className="text-xs text-slate-500">Envoyez un lien : la personne crée son compte (ou l'active sur son compte existant) et a l'application gratuitement, sans carte bancaire.</p>
      {open && (
        <div className="space-y-2 rounded-xl bg-slate-50 p-3">
          <input className="input" placeholder="Pour qui ? (ex. : Paul, plombier Créteil)" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[11px] text-slate-500">Durée offerte<select className="input !px-1 text-sm" value={f.months} onChange={(e) => setF({ ...f, months: e.target.value })}>
              <option value="0">Illimitée</option><option value="1">1 mois</option><option value="3">3 mois</option><option value="6">6 mois</option><option value="12">12 mois</option></select></label>
            <label className="text-[11px] text-slate-500">Utilisations<input className="input !px-2 text-sm" inputMode="numeric" value={f.uses} onChange={(e) => setF({ ...f, uses: e.target.value })} /></label>
            <label className="text-[11px] text-slate-500">Lien valable<select className="input !px-1 text-sm" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })}>
              <option value="7">7 jours</option><option value="30">30 jours</option><option value="90">90 jours</option><option value="0">Sans limite</option></select></label>
          </div>
          <button className="btn-brand w-full" onClick={create}>Créer le lien</button>
        </div>
      )}
      {msg && <p className="break-all rounded-lg bg-green-50 p-2 text-xs text-green-800">{msg}</p>}
      {list.map((g) => {
        const expired = g.expires_at && new Date(g.expires_at).getTime() < Date.now();
        const usable = !g.disabled && !expired && g.uses < g.max_uses;
        return (
          <div key={g.code} className={`space-y-1 rounded-xl border p-3 text-sm ${usable ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-2">
              <div><p className="font-semibold">{g.label || "Lien offert"} <span className="font-mono text-xs text-slate-400">{g.code}</span></p>
                <p className="text-xs text-slate-500">{g.months ? `${g.months} mois offerts` : "Accès illimité"} · {g.uses}/{g.max_uses} utilisé{g.max_uses > 1 ? "s" : ""}{g.expires_at ? ` · lien valable jusqu'au ${d(g.expires_at)}` : ""}</p></div>
              <span className={`chip shrink-0 ${usable ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-600"}`}>{g.disabled ? "Désactivé" : expired ? "Expiré" : g.uses >= g.max_uses ? "Utilisé" : "Actif"}</span>
            </div>
            {g.redemptions.map((r, i) => <p key={i} className="text-xs text-slate-600">✅ {r.name || "—"} · {r.email} · {d(r.at)}</p>)}
            <div className="flex flex-wrap gap-2 pt-1">
              {usable && <>
                <button className="btn-ghost !px-3 !py-1 text-xs" onClick={() => share(g)}>🔗 Partager</button>
                <a className="btn-ghost !px-3 !py-1 text-xs" href={`sms:?body=${encodeURIComponent(text(g))}`}>💬 SMS</a>
                <a className="btn-ghost !px-3 !py-1 text-xs" href={`https://wa.me/?text=${encodeURIComponent(text(g))}`} target="_blank" rel="noreferrer">🟢 WhatsApp</a>
                <button className="btn-ghost !px-3 !py-1 text-xs" onClick={async () => { await navigator.clipboard.writeText(url(g.code)).catch(() => {}); setMsg("Lien copié"); }}>📋 Copier</button>
              </>}
              <button className="btn-ghost !px-3 !py-1 text-xs" onClick={async () => { await sb().rpc("admin_gift_toggle", { p_code: g.code, p_disabled: !g.disabled }); load(); }}>{g.disabled ? "Réactiver" : "Désactiver"}</button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
