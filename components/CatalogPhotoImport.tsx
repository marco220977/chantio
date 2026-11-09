"use client";
import { useState } from "react";
import { sb } from "@/lib/supabase";
import { compressPhoto } from "@/lib/chantiers";
import { VAT_RATES } from "@/lib/calc";
import type { CatalogItem } from "@/lib/types";
import { useCompany } from "@/components/CompanyContext";

type Row = { keep: boolean; label: string; description?: string; open?: boolean; ref?: string; brand?: string; unit: string; cost: number | null; pub: number | null; category: string; match?: CatalogItem };
const toUrl = (b: Blob) => new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(b); });
const num = (v: any) => { const n = Number(String(v ?? "").replace(",", ".")); return isFinite(n) ? n : 0; };
const round2 = (n: number) => Math.round(n * 100) / 100;
const PRESETS: [string, string][] = [
  ["Prix d'achat codé en centimes", "La colonne « RéfPro » contient mon prix d'achat HT écrit en centimes, sans virgule (exemple : 50389 = 503,89 €). La colonne « Prix HT » est le prix public. Garde comme référence la colonne « Réf. Four. »."],
  ["Prix affichés = prix publics", "Tous les prix de la page sont des prix publics HT : ne remplis pas le prix d'achat."],
  ["Prix affichés = prix nets", "Tous les prix de la page sont mes prix nets d'achat HT."],
  ["Colonne remise", "La colonne « Remise » est mon pourcentage de remise sur le prix public : calcule le prix d'achat = prix public × (1 − remise)."],
];

// Ajout d'articles au catalogue depuis des photos (catalogue papier, tarif, ticket, facture) lues par l'IA
export default function CatalogPhotoImport({ items, onDone, onClose }: { items: CatalogItem[]; onDone: (msg: string) => void; onClose: () => void }) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [margin, setMargin] = useState("30");
  const [remise, setRemise] = useState("0");
  const [vat, setVat] = useState(10);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const { company, reload } = useCompany();
  const [hint, setHint] = useState<string>((company as any)?.catalog_ai_hint || "");
  const [showHint, setShowHint] = useState<boolean>(!!(company as any)?.catalog_ai_hint);

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const out: string[] = [];
    for (const f of Array.from(files).slice(0, 4 - photos.length)) out.push(await toUrl(await compressPhoto(f, 2000)));
    setPhotos((p) => [...p, ...out].slice(0, 4));
  }

  async function read() {
    setBusy("Lecture des photos par l'IA… (30 à 60 s)"); setErr("");
    // La consigne est mémorisée pour la prochaine fois
    if ((hint || "") !== ((company as any)?.catalog_ai_hint || "")) { await sb().from("companies").update({ catalog_ai_hint: hint.trim() || null }).eq("id", company!.id); reload(); }
    const { data, error } = await sb().functions.invoke("catalogue-photo", { body: { images: photos, hint } });
    setBusy("");
    let msg = data?.error;
    if (error) { msg = error.message; try { const j = await (error as any).context?.json?.(); if (j?.error) msg = j.error; } catch {} }
    if (msg) return setErr(msg);
    const byRef = new Map(items.filter((i) => i.ref).map((i) => [String(i.ref).trim().toUpperCase(), i]));
    setSupplier(data.supplier || ""); setNotes(data.notes || "");
    const n = (v: any) => (v == null || v === "" ? null : num(v));
    setRows((data.items || []).map((x: any) => ({ keep: x.cost != null || x.public != null, label: x.label || "", description: x.description || "", ref: x.ref || "", brand: x.brand || "", unit: x.unit || "u",
      cost: n(x.cost), pub: n(x.public), category: x.category || "Fournitures",
      match: x.ref ? byRef.get(String(x.ref).trim().toUpperCase()) : undefined })));
  }

  // Prix d'achat : celui lu sur la page, sinon prix public moins la remise
  const cost = (r: Row) => r.cost != null ? round2(r.cost) : r.pub != null ? round2(r.pub * (1 - num(remise) / 100)) : 0;
  const sale = (r: Row) => round2(cost(r) * (1 + num(margin) / 100));
  const setRow = (i: number, p: Partial<Row>) => setRows((rs) => rs && rs.map((x, j) => (j === i ? { ...x, ...p } : x)));

  async function save() {
    const sel = (rows || []).filter((r) => r.keep && r.label.trim());
    if (!sel.length) return setErr("Cochez au moins un article.");
    setBusy("Enregistrement…"); setErr("");
    let created = 0, updated = 0;
    const news = sel.filter((r) => !r.match).map((r) => ({ category: r.category, label: r.label.trim(), unit: r.unit || "u", unit_price: sale(r), cost_price: cost(r),
      vat_rate: vat, ref: r.ref || null, brand: r.brand || null, public_price: r.pub,
      description: r.description?.trim() || null }));
    if (news.length) { const { error } = await sb().from("catalog_items").insert(news); if (error) { setBusy(""); return setErr(error.message); } created = news.length; }
    for (const r of sel.filter((x) => x.match)) {
      const { error } = await sb().from("catalog_items").update({ cost_price: cost(r), unit_price: sale(r), ...(r.pub != null ? { public_price: r.pub } : {}), ...(r.description?.trim() ? { description: r.description.trim() } : {}), updated_at: new Date().toISOString() }).eq("id", r.match!.id);
      if (!error) updated++;
    }
    setBusy("");
    onDone(`✅ ${created} article${created > 1 ? "s" : ""} ajouté${created > 1 ? "s" : ""}${updated ? `, ${updated} prix mis à jour` : ""} depuis les photos.`);
  }

  return (
    <div className="space-y-3">
      {!rows && <>
        <p className="text-sm text-slate-600">Photographiez une page de catalogue papier, un tarif, une étiquette, un ticket de comptoir ou une facture fournisseur (4 photos maximum par lecture). Prenez la page bien à plat, nette et éclairée.</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="btn-ghost cursor-pointer text-center">📷 Photo<input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => addFiles(e.target.files)} /></label>
          <label className="btn-ghost cursor-pointer text-center">🖼 Galerie<input type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} /></label>
        </div>
        {!!photos.length && <div className="grid grid-cols-4 gap-2">{photos.map((p, i) => (
          <div key={i} className="relative"><img src={p} alt="" className="h-20 w-full rounded-lg object-cover" /><button className="absolute right-0 top-0 rounded-full bg-white px-1.5 text-xs shadow" onClick={() => setPhotos(photos.filter((_, j) => j !== i))}>✕</button></div>))}</div>}
        <div className="rounded-xl bg-slate-50 p-3">
          <button type="button" className="text-sm font-semibold text-brand" onClick={() => setShowHint(!showHint)}>{showHint ? "▾" : "▸"} Consigne pour l'IA {hint ? "(mémorisée)" : "(facultatif)"}</button>
          {showHint && <div className="mt-2 space-y-2">
            <p className="text-xs text-slate-500">Expliquez comment lire votre catalogue : quelle colonne est votre prix d'achat, le prix public, la référence… La consigne est gardée pour les prochaines photos.</p>
            <div className="flex flex-wrap gap-1">{PRESETS.map(([l, t]) => <button key={l} type="button" className="chip border border-slate-300 bg-white text-xs" onClick={() => setHint(t)}>{l}</button>)}</div>
            <textarea className="input text-sm" rows={3} placeholder="Ex : la colonne RéfPro est mon prix d'achat en centimes (50389 = 503,89 €)…" value={hint} onChange={(e) => setHint(e.target.value)} />
          </div>}
        </div>
        <button className="btn-brand w-full" disabled={!photos.length || !!busy} onClick={read}>{busy || `✨ Lire ${photos.length || ""} photo${photos.length > 1 ? "s" : ""} avec l'IA`}</button>
      </>}

      {rows && <>
        <p className="text-sm"><b>{rows.length}</b> article{rows.length > 1 ? "s" : ""} trouvé{rows.length > 1 ? "s" : ""}{supplier ? ` — ${supplier}` : ""}. Vérifiez avant d'ajouter.</p>
        {notes && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{notes}</p>}
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2">
          <label className="text-[11px] text-slate-500">Marge %<input className="input !px-2 text-sm" inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} /></label>
          <label className="text-[11px] text-slate-500">Remise si pas de prix d'achat %<input className="input !px-2 text-sm" inputMode="decimal" value={remise} onChange={(e) => setRemise(e.target.value)} /></label>
          <label className="text-[11px] text-slate-500">TVA<select className="input !px-1 text-sm" value={vat} onChange={(e) => setVat(Number(e.target.value))}>{VAT_RATES.map((v) => <option key={v} value={v}>{String(v).replace(".", ",")} %</option>)}</select></label>
        </div>
        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {rows.map((r, i) => (
            <div key={i} className={`space-y-1 rounded-xl border p-2 text-sm ${r.keep ? "" : "opacity-50"}`}>
              <div className="flex items-start gap-2">
                <input type="checkbox" className="mt-2" checked={r.keep} onChange={(e) => setRow(i, { keep: e.target.checked })} />
                <textarea className="input flex-1 !py-1 text-sm" rows={2} value={r.label} onChange={(e) => setRow(i, { label: e.target.value })} />
              </div>
              <div className="pl-6">
                {r.open
                  ? <textarea className="input text-xs" rows={5} placeholder="Description (reprise sur vos devis)" value={r.description || ""} onChange={(e) => setRow(i, { description: e.target.value })} />
                  : <button type="button" className="w-full text-left text-xs text-slate-500" onClick={() => setRow(i, { open: true })}>{r.description ? <><span className="line-clamp-2">{r.description}</span><span className="text-brand">✏️ Voir / modifier la description</span></> : <span className="text-brand">＋ Ajouter une description</span>}</button>}
              </div>
              <div className="grid grid-cols-4 gap-1 pl-6">
                <label className="text-[10px] text-slate-500">Réf.<input className="input !px-2 !py-1 text-xs" value={r.ref || ""} onChange={(e) => setRow(i, { ref: e.target.value })} /></label>
                <label className="text-[10px] text-slate-500">Unité<input className="input !px-2 !py-1 text-xs" value={r.unit} onChange={(e) => setRow(i, { unit: e.target.value })} /></label>
                <label className="text-[10px] text-slate-500">Achat HT<input className="input !px-2 !py-1 text-xs" inputMode="decimal" value={r.cost ?? ""} onChange={(e) => setRow(i, { cost: e.target.value === "" ? null : num(e.target.value) })} /></label>
                <label className="text-[10px] text-slate-500">Public HT<input className="input !px-2 !py-1 text-xs" inputMode="decimal" value={r.pub ?? ""} onChange={(e) => setRow(i, { pub: e.target.value === "" ? null : num(e.target.value) })} /></label>
              </div>
              <p className="pl-6 text-[11px] text-slate-500">
                {r.brand ? `${r.brand} · ` : ""}{r.category} · {r.cost == null && r.pub == null ? "⚠️ prix illisible" : <>achat {cost(r).toFixed(2).replace(".", ",")} €{r.cost == null ? ` (public − ${num(remise)} %)` : ""}{r.pub != null && r.cost != null && r.pub > 0 ? ` · remise ${Math.round((1 - r.cost / r.pub) * 1000) / 10} %` : ""} · <b>vente {sale(r).toFixed(2).replace(".", ",")} € HT</b></>}
                {r.match && <span className="ml-1 text-blue-700">· déjà au catalogue : prix mis à jour</span>}
              </p>
            </div>
          ))}
        </div>
        {err && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{err}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-ghost" onClick={() => { setRows(null); setPhotos([]); }}>↩ Recommencer</button>
          <button className="btn-brand" disabled={!!busy} onClick={save}>{busy || `Ajouter (${rows.filter((r) => r.keep).length})`}</button>
        </div>
      </>}
      {err && !rows && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{err}</p>}
      <button className="w-full text-center text-sm text-slate-500" onClick={onClose}>Fermer</button>
    </div>
  );
}
