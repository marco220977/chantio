"use client";
import { useRef, useState } from "react";
import { sb } from "@/lib/supabase";
import { compressPhoto } from "@/lib/chantiers";
import type { CatalogItem } from "@/lib/types";

type Result = { title?: string; lines: any[]; notes?: string; questions?: string[] };

const blobToDataUrl = (b: Blob) => new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(b); });

export default function AiQuote({ catalog, vat, onApply, onClose }: { catalog: CatalogItem[]; vat: number; onApply: (r: { title?: string; lines: any[]; notes?: string }) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [rec, setRec] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const recog = useRef<any>(null);

  function dictate() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return setErr("La dictée n'est pas disponible sur ce navigateur : utilisez le micro du clavier.");
    if (rec) { recog.current?.stop(); return; }
    const r = new SR(); r.lang = "fr-FR"; r.continuous = true; r.interimResults = false;
    const base = text ? text + " " : "";
    let acc = "";
    r.onresult = (e: any) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) acc += e.results[i][0].transcript + " "; setText(base + acc); };
    r.onend = () => setRec(false); r.onerror = () => setRec(false);
    recog.current = r; r.start(); setRec(true);
  }

  async function generate() {
    setBusy(true); setErr(""); setRes(null);
    const { data, error } = await sb().functions.invoke("devis-ia", { body: {
      description: text, image: photo || undefined, vat,
      catalog: catalog.map((c) => ({ id: c.id, label: c.label, unit: c.unit, unit_price: c.unit_price, vat_rate: c.vat_rate })) } });
    setBusy(false);
    let msg = error?.message;
    if (error) { try { const j = await (error as any).context?.json?.(); if (j?.error) msg = j.error; } catch {} return setErr(msg || "Erreur"); }
    if (data?.error) return setErr(data.error);
    setRes({ ...data, lines: (data.lines || []).map((l: any) => ({ ...l, keep: true })) });
  }

  function apply() {
    const byId = new Map(catalog.map((c) => [c.id, c]));
    const lines = res!.lines.filter((l) => l.keep).map((l) => {
      const c: any = l.id ? byId.get(l.id) : null;
      return {
        label: c?.label || l.label, description: c?.description || (l.estimate ? "" : undefined), qty: Number(l.qty) || 1, unit: c?.unit || l.unit || "u",
        unit_price: Number(c ? c.unit_price : l.unit_price) || 0, vat_rate: Number(l.vat_rate ?? c?.vat_rate ?? vat),
        cost_price: c?.cost_price ?? undefined, supplier: c?.supplier ?? undefined, ref: c?.ref ?? undefined, components: c?.components ?? undefined,
      };
    });
    onApply({ title: res!.title, lines, notes: res!.notes });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold">✨ Devis par IA</h2><button onClick={onClose} className="text-2xl leading-none text-slate-400">×</button></div>
        {!res && <>
          <p className="text-sm text-slate-600">Décrivez le chantier comme à un collègue : l'IA propose les lignes en utilisant vos prix catalogue.</p>
          <textarea className="input min-h-[130px]" placeholder="Ex. : remplacement chaudière gaz murale Saunier Duval de 20 ans par une chaudière à condensation 25 kW, maison de 1985, ventouse horizontale, désembouage du circuit 8 radiateurs, thermostat connecté." value={text} onChange={(e) => setText(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <button className={`btn-ghost ${rec ? "!border-red-400 !text-red-600" : ""}`} onClick={dictate}>{rec ? "⏹ Arrêter" : "🎙 Dicter"}</button>
            <label className="btn-ghost cursor-pointer">{photo ? "✅ Photo jointe" : "📷 Photo (option)"}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await blobToDataUrl(await compressPhoto(f, 1280))); }} /></label>
          </div>
          {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</p>}
          <button className="btn-brand w-full" disabled={busy || text.trim().length < 5} onClick={generate}>{busy ? "Rédaction du devis… (20 s environ)" : "Générer les lignes"}</button>
        </>}
        {res && <>
          {res.title && <p className="font-semibold">{res.title}</p>}
          <div className="space-y-2">
            {res.lines.map((l, i) => (
              <label key={i} className={`flex items-start gap-2 rounded-xl border p-2 text-sm ${l.keep ? "" : "opacity-50"}`}>
                <input type="checkbox" className="mt-1" checked={l.keep} onChange={(e) => setRes({ ...res, lines: res.lines.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)) })} />
                <span className="flex-1">{l.label}
                  <span className="block text-xs text-slate-500">{l.qty} {l.unit} × {Number(l.unit_price).toFixed(2).replace(".", ",")} € HT · TVA {l.vat_rate}% {l.id ? "· 📚 catalogue" : l.estimate ? "· ⚠️ prix estimé, à vérifier" : ""}</span></span>
              </label>
            ))}
          </div>
          {res.notes && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">💡 {res.notes}</p>}
          {!!res.questions?.length && <ul className="list-disc pl-5 text-sm text-slate-600">{res.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>}
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-ghost" onClick={() => setRes(null)}>↩ Modifier</button>
            <button className="btn-brand" onClick={apply}>Ajouter au devis</button>
          </div>
          <p className="text-xs text-slate-400">Vérifiez toujours les quantités et les prix avant d'envoyer le devis.</p>
        </>}
      </div>
    </div>
  );
}
