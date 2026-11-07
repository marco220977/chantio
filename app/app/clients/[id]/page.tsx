"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { sb } from "@/lib/supabase";
import Header from "@/components/Header";
import { useCompany } from "@/components/CompanyContext";
import { dateFr, eur, STATUS_COLOR, STATUS_LABEL } from "@/lib/calc";
import { CONTRACT_STATUS, equipmentLabel } from "@/lib/maintenance";
import { SAV_STATUS } from "@/lib/quitus-sav";
import { CH_STATUS } from "@/lib/chantiers";

type Row = { href: string; title: string; sub: string; chip?: [string, string]; amount?: string; date: string };
const chip = (map: Record<string, [string, string]>, k: string): [string, string] => map[k] || [k, "bg-slate-100 text-slate-700"];
const REC: Record<string, [string, string]> = { draft: ["À signer", "bg-amber-100 text-amber-800"], signed: ["Signé", "bg-green-100 text-green-800"] };
const IV: Record<string, [string, string]> = { planned: ["Prévue", "bg-blue-100 text-blue-800"], done: ["Terminée", "bg-green-100 text-green-800"], canceled: ["Annulée", "bg-red-100 text-red-700"] };

export default function ClientPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isSup } = useCompany();
  const [c, setC] = useState<any>(null);
  const [sec, setSec] = useState<Record<string, Row[]>>({});
  const [stats, setStats] = useState({ billed: 0, due: 0, quotesOpen: 0 });
  const [tab, setTab] = useState("all");

  useEffect(() => {
    (async () => {
      const s = sb();
      const { data: cl } = await s.from("clients").select("*").eq("id", id).single();
      setC(cl);
      const [docs, ivs, chs, cts, reps, savs, recs] = await Promise.all([
        isSup ? s.from("documents").select("id, kind, number, title, status, total_ttc, issue_date, created_at, amends_id, amendment_no, situation_no").eq("client_id", id).order("created_at", { ascending: false }) : Promise.resolve({ data: [] as any[] }),
        s.from("interventions").select("id, title, starts_at, status, sav_id").eq("client_id", id).order("starts_at", { ascending: false }),
        s.from("chantiers").select("id, title, status, start_date, created_at").eq("client_id", id).order("created_at", { ascending: false }),
        s.from("contracts").select("id, number, status, equipment, next_visit_date, created_at").eq("client_id", id).order("created_at", { ascending: false }),
        s.from("maintenance_reports").select("id, number, status, equipment, visit_date, created_at").eq("client_id", id).order("visit_date", { ascending: false }),
        s.from("sav_tickets").select("id, number, status, problem, equipment, created_at").eq("client_id", id).order("created_at", { ascending: false }),
        s.from("receptions").select("id, number, status, works, reception_date, created_at").eq("client_id", id).order("created_at", { ascending: false }),
      ]);
      const D = (docs.data || []) as any[];
      const doc = (k: string[]) => D.filter((d) => k.includes(d.kind)).map((d) => ({
        href: `/app/doc/${d.id}`, date: d.issue_date || d.created_at,
        title: `${d.kind === "credit" ? "Avoir" : d.kind === "invoice" ? (d.situation_no ? `Situation n° ${d.situation_no}` : "Facture") : d.amends_id ? `Avenant n° ${d.amendment_no}` : "Devis"} ${d.number || "(brouillon)"}`,
        sub: d.title || "", chip: [STATUS_LABEL[d.status] || d.status, STATUS_COLOR[d.status] || ""] as [string, string], amount: eur(d.total_ttc) + " TTC" }));
      setSec({
        quotes: doc(["quote"]),
        invoices: doc(["invoice", "credit"]),
        interventions: (ivs.data || []).map((i: any) => ({ href: i.sav_id ? `/app/sav/${i.sav_id}` : `/app/quitus/nouveau?intervention=${i.id}`, title: i.title, sub: new Date(i.starts_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }), chip: chip(IV, i.status), date: i.starts_at })),
        chantiers: (chs.data || []).map((x: any) => ({ href: `/app/chantiers/${x.id}`, title: x.title, sub: x.start_date ? `Début ${dateFr(x.start_date)}` : "", chip: chip(CH_STATUS, x.status), date: x.created_at })),
        contracts: (cts.data || []).map((x: any) => ({ href: `/app/entretien/contrat/${x.id}`, title: `Contrat ${x.number || ""} — ${equipmentLabel(x.equipment)}`, sub: x.next_visit_date ? `Prochaine visite ${dateFr(x.next_visit_date)}` : "", chip: chip(CONTRACT_STATUS, x.status), date: x.created_at })),
        reports: (reps.data || []).map((x: any) => ({ href: `/app/entretien/visite/${x.id}`, title: `Attestation ${x.number || ""} — ${equipmentLabel(x.equipment)}`, sub: x.visit_date ? `Visite du ${dateFr(x.visit_date)}` : "", chip: x.status === "signed" ? ["Signée", "bg-green-100 text-green-800"] : ["Brouillon", "bg-slate-100 text-slate-700"], date: x.visit_date || x.created_at })),
        sav: (savs.data || []).map((x: any) => ({ href: `/app/sav/${x.id}`, title: `SAV ${x.number || ""}${x.equipment?.type ? " — " + equipmentLabel(x.equipment) : ""}`, sub: x.problem || "", chip: chip(SAV_STATUS, x.status), date: x.created_at })),
        receptions: (recs.data || []).map((x: any) => ({ href: `/app/quitus/${x.id}`, title: `Quitus ${x.number || ""}`, sub: (x.works || "").split("\n")[0], chip: chip(REC, x.status), date: x.reception_date || x.created_at })),
      });
      const inv = D.filter((d) => d.kind === "invoice" && ["issued", "paid"].includes(d.status));
      const cred = D.filter((d) => d.kind === "credit" && d.status !== "draft" && d.status !== "canceled");
      setStats({
        billed: inv.reduce((a, d) => a + Number(d.total_ttc), 0) - cred.reduce((a, d) => a + Math.abs(Number(d.total_ttc)), 0),
        due: inv.filter((d) => d.status === "issued").reduce((a, d) => a + Number(d.total_ttc), 0),
        quotesOpen: D.filter((d) => d.kind === "quote" && d.status === "sent").length,
      });
    })();
  }, [id, isSup]);

  if (!c) return <><Header back title="Client" /><p className="p-6 text-center text-slate-400">Chargement…</p></>;
  const SECTIONS: [string, string][] = [
    ...(isSup ? [["quotes", "📝 Devis"], ["invoices", "💶 Factures"]] as [string, string][] : []),
    ["interventions", "📅 Interventions"], ["chantiers", "🏗 Chantiers"], ["receptions", "✅ Quitus"],
    ["contracts", "🔧 Contrats"], ["reports", "📋 Attestations"], ["sav", "🛠 SAV"],
  ];
  const count = (k: string) => sec[k]?.length || 0;
  const addr = [c.address, c.zip, c.city].filter(Boolean).join(" ");

  return (
    <>
      <Header back title={c.name} right={<Link href={`/app/clients?edit=${c.id}`} className="btn-ghost !px-3 !py-1.5 text-sm">✏️</Link>} />
      <div className="space-y-4 p-4">
        <section className="card space-y-1.5">
          <p className="text-xs text-slate-500">{c.type === "professionnel" ? `Professionnel${c.siret ? ` · SIRET ${c.siret}` : ""}${c.siret_verified_at ? " ✅" : ""}` : "Particulier"}</p>
          {c.phone && <a className="block text-brand" href={`tel:${c.phone}`}>📞 {c.phone}</a>}
          {c.email && <a className="block truncate text-brand" href={`mailto:${c.email}`}>✉️ {c.email}</a>}
          {addr && <a className="block text-brand" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`}>🧭 {addr}</a>}
          {c.notes && <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-sm text-slate-600">{c.notes}</p>}
        </section>

        {isSup && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="card !p-3"><p className="text-[11px] text-slate-500">Facturé</p><p className="font-bold">{eur(stats.billed)}</p></div>
            <div className="card !p-3"><p className="text-[11px] text-slate-500">Reste dû</p><p className={`font-bold ${stats.due > 0 ? "text-red-600" : ""}`}>{eur(stats.due)}</p></div>
            <div className="card !p-3"><p className="text-[11px] text-slate-500">Devis en attente</p><p className="font-bold">{stats.quotesOpen}</p></div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          {isSup && <Link href={`/app/doc/nouveau?kind=quote&client=${c.id}`} className="btn-brand !px-2 text-sm">＋ Devis</Link>}
          <button className="btn-ghost !px-2 text-sm" onClick={() => router.push(`/app/planning?client=${c.id}`)}>＋ Intervention</button>
          <Link href={`/app/sav/nouveau?client=${c.id}`} className="btn-ghost !px-2 text-sm">＋ SAV</Link>
        </div>

        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4">
          <button onClick={() => setTab("all")} className={`chip whitespace-nowrap border py-1.5 ${tab === "all" ? "border-ink bg-ink text-white" : "border-slate-200 bg-white"}`}>Tout</button>
          {SECTIONS.filter(([k]) => count(k)).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`chip whitespace-nowrap border py-1.5 ${tab === k ? "border-ink bg-ink text-white" : "border-slate-200 bg-white"}`}>{l} ({count(k)})</button>
          ))}
        </div>

        {SECTIONS.filter(([k]) => (tab === "all" || tab === k) && count(k)).map(([k, l]) => (
          <section key={k} className="space-y-2">
            <h2 className="font-bold">{l} <span className="text-sm font-normal text-slate-400">({count(k)})</span></h2>
            {sec[k].map((r, i) => (
              <Link key={i} href={r.href} className="card flex items-center justify-between gap-2 !py-3">
                <div className="min-w-0"><p className="truncate font-semibold">{r.title}</p><p className="truncate text-xs text-slate-500">{[r.sub, r.amount].filter(Boolean).join(" · ")}</p></div>
                {r.chip && <span className={`chip shrink-0 ${r.chip[1]}`}>{r.chip[0]}</span>}
              </Link>
            ))}
          </section>
        ))}
        {SECTIONS.every(([k]) => !count(k)) && <p className="py-6 text-center text-sm text-slate-500">Aucun document pour ce client.</p>}
      </div>
    </>
  );
}
