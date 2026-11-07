"use client";
import { useEffect, useState } from "react";
import { checkSiret, type SiretInfo } from "@/lib/siret";

const d = (s?: string | null) => (s ? new Date(s).toLocaleDateString("fr-FR") : "—");
const EFF: Record<string, string> = { NN: "non renseigné", "00": "0 salarié", "01": "1-2", "02": "3-5", "03": "6-9", "11": "10-19", "12": "20-49", "21": "50-99", "22": "100-199", "31": "200-249", "32": "250-499", "41": "500-999", "42": "1 000-1 999" };

// Vérification d'une entreprise cliente : équivalent des informations du Kbis (registres officiels)
export default function KbisCard({ siret, onLoaded }: { siret: string; onLoaded?: (i: SiretInfo) => void }) {
  const [info, setInfo] = useState<(SiretInfo & { error?: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const c = checkSiret(siret || "");
  const siren = c.ok ? c.siren! : "";

  async function load() {
    setBusy(true);
    try {
      const r = await fetch(`/api/siret?q=${c.siret || siren}&full=1`); const j = await r.json(); setInfo(j);
      if (j.found) onLoaded?.(j);
    }
    catch { setInfo({ found: false, siren, error: "Vérification impossible (connexion)." }); }
    setBusy(false);
  }
  // Lancement automatique dès qu'un SIRET valide est saisi
  useEffect(() => { if (c.ok && !info && !busy) load(); }, [siret]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!c.ok) return null;
  if (!info) return <button type="button" className="btn-ghost w-full" disabled={busy} onClick={load}>{busy ? "Interrogation des registres…" : "📄 Vérifier l'entreprise (infos Kbis)"}</button>;
  if (info.error || !info.found) return <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">⚠️ {info.error || "Entreprise introuvable au registre."}</p>;

  const proc = info.procedures;
  const rows: [string, string][] = [
    ["Raison sociale", info.name || "—"],
    ["Forme juridique", info.legal_form || "—"],
    ["SIREN / SIRET", `${info.siren}${info.siret ? ` / ${info.siret}` : ""}`],
    ["Immatriculation", `${d(info.created)}${info.rcs ? " · RCS" : ""}`],
    ["Siège", info.head_office || "—"],
    ["Activité", `${info.activity_label || ""}${info.naf ? ` (${info.naf})` : ""}` || "—"],
    ["TVA intracom.", info.vat_number || "—"],
    ["Effectif", info.employees ? EFF[info.employees] || info.employees : "—"],
  ];
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-3 text-sm">
      <p className={`rounded-lg p-2 text-xs font-semibold ${info.active ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
        {info.active ? "✅ Entreprise active au registre" : `❌ Entreprise fermée / radiée${info.closed_on ? ` le ${d(info.closed_on)}` : ""}`}
      </p>
      {proc === null && <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">Procédures collectives : vérification BODACC indisponible.</p>}
      {proc && proc.length === 0 && <p className="rounded-lg bg-green-50 p-2 text-xs text-green-800">✅ Aucune procédure collective publiée au BODACC</p>}
      {proc && proc.length > 0 && (
        <div className="rounded-lg bg-red-50 p-2 text-xs text-red-700"><b>⚠️ Procédure(s) collective(s) au BODACC :</b>
          {proc.map((p, i) => <div key={i}>{d(p.date)} — {p.type}{p.court ? ` (${p.court})` : ""}</div>)}
          <div className="mt-1">Prudence : demandez un acompte ou un paiement à la commande.</div></div>
      )}
      <table className="w-full text-xs"><tbody>
        {rows.map(([k, v]) => <tr key={k} className="border-t border-slate-100"><td className="py-1 pr-2 text-slate-500">{k}</td><td className="py-1">{v}</td></tr>)}
        {!!info.directors?.length && <tr className="border-t border-slate-100"><td className="py-1 pr-2 align-top text-slate-500">Dirigeants</td>
          <td className="py-1">{info.directors.map((x, i) => <div key={i}>{x.name}{x.role ? ` — ${x.role}` : ""}</div>)}</td></tr>}
      </tbody></table>
      <div className="grid grid-cols-2 gap-2">
        <a className="btn-ghost !py-2 text-xs" target="_blank" rel="noreferrer" href={`https://annuaire-entreprises.data.gouv.fr/documents/${info.siren}`}>📥 Extrait RNE gratuit</a>
        <a className="btn-ghost !py-2 text-xs" target="_blank" rel="noreferrer" href={`https://www.infogreffe.fr/entreprise/${info.siren}`}>📄 Kbis officiel (Infogreffe)</a>
      </div>
      <p className="text-[11px] text-slate-400">Sources : registre Sirene / RNE (INSEE, INPI) et BODACC. Le Kbis officiel est délivré par le greffe (payant).</p>
    </div>
  );
}
