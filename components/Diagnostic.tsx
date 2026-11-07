"use client";
import { useEffect, useRef, useState } from "react";
import { sb } from "@/lib/supabase";

type Res = { code_meaning?: string; reliability?: string; summary?: string; causes?: { cause: string; probability?: string; checks?: string[] }[];
  parts?: string[]; safety?: string[]; questions?: string[]; sources?: { title: string; url: string }[] };
const PROB: Record<string, string> = { forte: "bg-red-100 text-red-700", moyenne: "bg-amber-100 text-amber-800", faible: "bg-slate-100 text-slate-600" };

type Notice = { id: number; brand: string; range_label: string | null; code: string; meaning: string; causes: string | null; kind: string | null; source: string | null; source_level: string | null };

// Même normalisation que la base error_codes : F.28 → F28, "5 01" → 501, "E:14" → E14, "Er 101" → 101
export const normCode = (c: string) => c.toUpperCase().replace(/[\s.:\-]/g, "").replace(/^ER/, "");
const BRANDS: [string, RegExp][] = [
  ["Saunier Duval", /saunier|duval|\bsd\b|thema|opalia|isotwin|isofast/i],
  ["Chaffoteaux", /chaffoteaux|chaffo|mira|talia|urbia|serelia|pigma|niagara/i],
  ["De Dietrich", /dietrich|naneo|vivadens|innovens|mcr|evodens/i],
  ["Atlantic", /atlantic|naema|naia|idra|alfea/i],
  ["ELM Leblanc", /e\.?l\.?m|leblanc|megalis|mégalis|egalis|égalis|acleis|odealis/i],
];
const brandOf = (eq: string) => BRANDS.find(([, r]) => r.test(eq))?.[0] || "";
const isUrl = (s?: string | null) => !!s && /^https?:\/\//.test(s);

export function noticeText(n: Notice) {
  return [`Code ${n.code} (${n.brand}${n.range_label ? ` · ${n.range_label}` : ""}) : ${n.meaning}`, n.causes && n.causes !== "—" && `À vérifier : ${n.causes}`].filter(Boolean).join("\n");
}

export function diagText(r: Res, code: string) {
  return [code && `Code ${code}${r.code_meaning ? ` : ${r.code_meaning}` : ""}`, r.summary,
    ...(r.causes || []).map((c, i) => `${i + 1}. ${c.cause}`)].filter(Boolean).join("\n");
}

// Assistant de diagnostic de panne (codes erreur) pour les techniciens
export default function Diagnostic({ equipment = "", onUse }: { equipment?: string; onUse?: (text: string) => void }) {
  const [eq, setEq] = useState(equipment);
  const [code, setCode] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<Res | null>(null);
  const [rec, setRec] = useState(false);
  const recog = useRef<any>(null);
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [others, setOthers] = useState(false);
  useEffect(() => { if (equipment) setEq(equipment); }, [equipment]);

  // Recherche instantanée dans la base des notices constructeurs
  useEffect(() => {
    const n = normCode(code);
    if (n.length < 1) { setNotices(null); return; }
    let stop = false;
    const t = setTimeout(async () => {
      const { data } = await sb().from("error_codes").select("id,brand,range_label,code,meaning,causes,kind,source,source_level").contains("code_norms", [n]).limit(40);
      if (!stop) { setNotices((data as Notice[]) || []); setOthers(false); }
    }, 300);
    return () => { stop = true; clearTimeout(t); };
  }, [code]);
  const brand = brandOf(eq);
  const mine = (notices || []).filter((x) => !brand || x.brand === brand);
  const rest = brand ? (notices || []).filter((x) => x.brand !== brand) : [];
  const shown = brand && !mine.length ? rest : others ? [...mine, ...rest] : mine;

  function dictate() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return setErr("Dictée indisponible sur ce navigateur : utilisez le micro du clavier.");
    if (rec) { recog.current?.stop(); return; }
    const r = new SR(); r.lang = "fr-FR"; r.continuous = true;
    const base = symptoms ? symptoms + " " : ""; let acc = "";
    r.onresult = (e: any) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) acc += e.results[i][0].transcript + " "; setSymptoms(base + acc); };
    r.onend = () => setRec(false); r.onerror = () => setRec(false);
    recog.current = r; r.start(); setRec(true);
  }

  async function run() {
    setBusy(true); setErr("");
    const { data, error } = await sb().functions.invoke("diagnostic", { body: { equipment: eq, code, symptoms, done } });
    setBusy(false);
    if (error) { let m = error.message; try { const j = await (error as any).context?.json?.(); if (j?.error) m = j.error; } catch {} return setErr(m); }
    if (data?.error) return setErr(data.error);
    setRes(data);
  }

  return (
    <section className="card space-y-3">
      <h2 className="font-bold">🩺 Assistant de diagnostic</h2>
      <input className="input" placeholder="Appareil (marque, modèle, type)" value={eq} onChange={(e) => setEq(e.target.value)} />
      <input className="input font-mono uppercase" placeholder="Code erreur affiché (ex : F28, E133, 6A…)" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
      <textarea className="input text-sm" rows={2} placeholder="Symptômes : pas d'eau chaude, se met en sécurité après 10 s, bruit…" value={symptoms} onChange={(e) => setSymptoms(e.target.value)} />
      <textarea className="input text-sm" rows={1} placeholder="Déjà vérifié (option) : pression 1,5 bar, gaz ouvert…" value={done} onChange={(e) => setDone(e.target.value)} />
      <div className="grid grid-cols-3 gap-2">
        <button className={`btn-ghost ${rec ? "!border-red-400 !text-red-600" : ""}`} onClick={dictate}>{rec ? "⏹" : "🎙 Dicter"}</button>
        <button className="btn-brand col-span-2" disabled={busy || (!code.trim() && symptoms.trim().length < 4)} onClick={run}>{busy ? "Recherche… (≈ 30 s)" : res ? "🔁 Relancer" : "🔍 Trouver la panne"}</button>
      </div>
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</p>}

      {notices && normCode(code) && (
        <div className="space-y-2">
          {!notices.length && <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">📘 Code {code} absent de la base des notices ({brand || "toutes marques"}). Utilisez « Trouver la panne » pour une recherche IA.</p>}
          {brand && !mine.length && !!rest.length && <p className="text-xs text-amber-700">Aucune notice {brand} pour ce code. Résultats d&apos;autres marques :</p>}
          {shown.map((n) => (
            <div key={n.id} className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">📘 D&apos;après la notice — {n.brand}</p>
              {n.range_label && <p className="text-[11px] text-slate-500">{n.range_label}</p>}
              <p className="mt-1"><b>{n.code}</b> : {n.meaning}</p>
              {n.causes && n.causes !== "—" && <p className="mt-1 text-slate-700"><b>À vérifier :</b> {n.causes}</p>}
              <p className="mt-1 text-[11px] text-slate-500">{n.kind && <span className="chip mr-1 bg-white">{n.kind}</span>}{isUrl(n.source) ? <a href={n.source!} target="_blank" rel="noreferrer" className="text-brand underline">Voir la notice</a> : n.source}</p>
              {onUse && <button className="btn-ghost mt-2 w-full !py-1.5 text-sm" onClick={() => onUse(noticeText(n))}>📝 Reporter dans le SAV</button>}
            </div>
          ))}
          {brand && !!mine.length && !!rest.length && !others && <button className="text-xs text-brand underline" onClick={() => setOthers(true)}>Voir aussi les autres marques ({rest.length})</button>}
          {!!notices.length && <p className="text-[11px] text-slate-400">Vérifiez que la gamme correspond à l&apos;appareil : un même code peut changer de sens selon la génération. Pas la bonne ? Appuyez sur « Trouver la panne » (IA).</p>}
        </div>
      )}

      {res && (
        <div className="space-y-3">
          {(res.code_meaning || res.summary) && (
            <div className="rounded-xl bg-slate-50 p-3 text-sm">
              {res.code_meaning && <p><b>Code {code}</b> : {res.code_meaning}</p>}
              {res.summary && <p className="mt-1">{res.summary}</p>}
              {res.reliability && <p className={`mt-1 text-xs ${res.reliability === "faible" ? "text-red-700" : "text-slate-500"}`}>Fiabilité : {res.reliability}{res.reliability === "faible" ? " — vérifiez dans la notice du fabricant" : ""}</p>}
            </div>
          )}
          {!!res.safety?.length && <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">⚠️ {res.safety.join(" · ")}</div>}
          {(res.causes || []).map((c, i) => (
            <div key={i} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-2"><p className="font-semibold">{i + 1}. {c.cause}</p>{c.probability && <span className={`chip shrink-0 ${PROB[c.probability] || PROB.faible}`}>{c.probability}</span>}</div>
              {!!c.checks?.length && <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-700">{c.checks.map((k, j) => <li key={j}>{k}</li>)}</ul>}
            </div>
          ))}
          {!!res.parts?.length && <p className="text-sm"><b>Pièces possibles :</b> {res.parts.join(", ")}</p>}
          {!!res.questions?.length && <div className="text-xs text-slate-600"><b>Si ce n'est pas concluant, relevez :</b><ul className="list-disc pl-5">{res.questions.map((q, i) => <li key={i}>{q}</li>)}</ul></div>}
          {!!res.sources?.length && <div className="text-xs text-slate-500"><b>Sources :</b> {res.sources.map((s, i) => <a key={i} href={s.url} target="_blank" rel="noreferrer" className="mr-2 text-brand underline">{s.title.slice(0, 40)}</a>)}</div>}
          {onUse && <button className="btn-primary w-full" onClick={() => onUse(diagText(res, code))}>📝 Reporter dans le diagnostic du SAV</button>}
          <p className="text-[11px] text-slate-400">Aide générée par IA à partir de sources publiques : à confirmer par vos mesures et la notice du fabricant.</p>
        </div>
      )}
    </section>
  );
}
