"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { sb } from "@/lib/supabase";
import { dateFr, eur } from "@/lib/calc";
import Header from "@/components/Header";
import { useCompany } from "@/components/CompanyContext";
import { CONTRACT_STATUS, equipmentLabel, nextTerm, renewalNoticeDue, type Contract, type Report } from "@/lib/maintenance";

function List() {
  const [tab, setTab] = useState(useSearchParams().get("tab") || "contrats");
  const [contracts, setContracts] = useState<Contract[] | null>(null);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [q, setQ] = useState("");
  const { isSup } = useCompany();

  useEffect(() => {
    sb().from("contracts").select("*").order("next_visit_date", { ascending: true, nullsFirst: false }).then(({ data }) => setContracts(data || []));
    sb().from("maintenance_reports").select("*").order("visit_date", { ascending: false }).then(({ data }) => setReports(data || []));
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const match = (x: any) => !q || `${x.number} ${x.client_snapshot?.name} ${x.equipment?.brand} ${x.equipment?.model}`.toLowerCase().includes(q.toLowerCase());
  const due = (contracts || []).filter((c) => c.status === "active" && c.next_visit_date && c.next_visit_date <= in30);
  const notices = (contracts || []).filter(renewalNoticeDue);

  return (
    <>
      <Header title="Entretien" right={(tab !== "contrats" || isSup) &&
        <Link href={tab === "contrats" ? "/app/entretien/contrat/nouveau" : "/app/entretien/visite/nouveau"} className="btn-brand !px-3 !py-1.5 text-sm">＋ {tab === "contrats" ? "Contrat" : "Visite"}</Link>} />
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-2 rounded-xl bg-slate-200 p-1">
          {[["contrats", "Contrats"], ["attestations", "Attestations"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-lg py-2 text-sm font-semibold ${tab === k ? "bg-white shadow" : "text-slate-600"}`}>{l}</button>
          ))}
        </div>

        {tab === "contrats" && due.length > 0 && (
          <div className="card border-amber-300 bg-amber-50">
            <p className="font-bold">🔔 {due.length} visite{due.length > 1 ? "s" : ""} à planifier sous 30 jours</p>
            {due.slice(0, 5).map((c) => (
              <Link key={c.id} href={`/app/entretien/contrat/${c.id}`} className="mt-1 block text-sm">
                <span className={c.next_visit_date! < today ? "font-semibold text-red-700" : ""}>{dateFr(c.next_visit_date)}</span> — {c.client_snapshot?.name} ({equipmentLabel(c.equipment)})
              </Link>
            ))}
          </div>
        )}
        {isSup && tab === "contrats" && notices.length > 0 && (
          <div className="card border-blue-200 bg-blue-50 text-sm">
            <p className="font-bold">📨 Avis de reconduction à envoyer ({notices.length})</p>
            <p className="text-slate-600">Obligatoire pour les particuliers entre 3 mois et 1 mois avant l'échéance (loi Chatel). Ouvrez le contrat et appuyez sur « Avis d'échéance ».</p>
          </div>
        )}

        <input className="input" placeholder="Rechercher (client, n°, marque)…" value={q} onChange={(e) => setQ(e.target.value)} />

        {tab === "contrats" && (contracts === null ? <p className="text-center text-slate-400">Chargement…</p> :
          contracts.filter(match).length === 0 ? <p className="py-10 text-center text-slate-500">Aucun contrat.</p> :
          contracts.filter(match).map((c) => (
            <Link key={c.id} href={`/app/entretien/contrat/${c.id}`} className="card flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{c.client_snapshot?.name || "Sans client"}</p>
                <p className="truncate text-sm text-slate-500">{equipmentLabel(c.equipment)} {c.equipment?.brand || ""}</p>
                <p className="text-xs text-slate-400">{c.number || "Brouillon"}{c.status === "active" ? ` · échéance ${dateFr(nextTerm(c))}` : ""}{c.next_visit_date && c.status === "active" ? ` · visite ${dateFr(c.next_visit_date)}` : ""}</p>
              </div>
              <div className="text-right">
                {isSup && <p className="font-bold">{eur(c.price_ht)}<span className="text-xs font-normal text-slate-400"> HT/an</span></p>}
                <span className={`chip mt-1 ${CONTRACT_STATUS[c.status]?.[1]}`}>{CONTRACT_STATUS[c.status]?.[0]}</span>
              </div>
            </Link>
          )))}

        {tab === "attestations" && (reports === null ? <p className="text-center text-slate-400">Chargement…</p> :
          reports.filter(match).length === 0 ? <p className="py-10 text-center text-slate-500">Aucune attestation.</p> :
          reports.filter(match).map((r) => (
            <Link key={r.id} href={`/app/entretien/visite/${r.id}`} className="card flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{r.client_snapshot?.name || "Sans client"}</p>
                <p className="truncate text-sm text-slate-500">{equipmentLabel(r.equipment)} {r.equipment?.brand || ""}</p>
                <p className="text-xs text-slate-400">{r.number || "Brouillon"} · {dateFr(r.visit_date)}</p>
              </div>
              <span className={`chip ${r.status === "done" ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-700"}`}>{r.status === "done" ? "Validée" : "Brouillon"}</span>
            </Link>
          )))}
      </div>
    </>
  );
}
export default function Page() { return <Suspense><List /></Suspense>; }
