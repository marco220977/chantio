"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import { eur, STATUS_COLOR, STATUS_LABEL } from "@/lib/calc";
import { useCompany } from "@/components/CompanyContext";
import type { Doc } from "@/lib/types";

export default function Dashboard() {
  const { company } = useCompany();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [next, setNext] = useState<any[]>([]);
  const [dueVisits, setDueVisits] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const s = sb();
      const { data } = await s.from("documents").select("*").order("created_at", { ascending: false }).limit(300);
      setDocs(data || []);
      const { data: iv } = await s.from("interventions").select("*, clients(name)")
        .gte("starts_at", new Date().toISOString()).eq("status", "planned").order("starts_at").limit(3);
      setNext(iv || []);
      const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      const { data: ct } = await s.from("contracts").select("id, client_snapshot, next_visit_date, equipment").eq("status", "active").lte("next_visit_date", in30).order("next_visit_date");
      setDueVisits(ct || []);
    })();
  }, []);

  const month = new Date().toISOString().slice(0, 7);
  const paidMonth = docs.filter((d) => d.kind === "invoice" && d.status === "paid" && d.paid_at?.startsWith(month)).reduce((s, d) => s + Number(d.total_ttc), 0);
  const unpaid = docs.filter((d) => d.kind === "invoice" && d.status === "issued");
  const late = unpaid.filter((d) => d.due_date && d.due_date < new Date().toISOString().slice(0, 10));
  const pending = docs.filter((d) => d.kind === "quote" && ["draft", "sent"].includes(d.status));
  const toInvoice = docs.filter((d) => d.kind === "quote" && d.status === "signed");

  const Stat = ({ label, value, sub, href }: any) => (
    <Link href={href} className="card block">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-extrabold">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </Link>
  );

  return (
    <div className="space-y-5 p-4">
      <div className="pt-2">
        <p className="text-sm text-slate-500">Bonjour 👋</p>
        <h1 className="text-2xl font-extrabold">{company?.name || "…"}</h1>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/app/doc/nouveau?kind=quote" className="btn-brand py-4">＋ Nouveau devis</Link>
        <Link href="/app/entretien/visite/nouveau" className="btn-primary py-4">🔧 Visite d'entretien</Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Encaissé ce mois" value={eur(paidMonth)} href="/app/factures" />
        <Stat label="À encaisser" value={eur(unpaid.reduce((s, d) => s + Number(d.total_ttc), 0))} sub={late.length ? `⚠️ ${late.length} en retard` : `${unpaid.length} facture(s)`} href="/app/factures" />
        <Stat label="Devis en attente" value={pending.length} sub={eur(pending.reduce((s, d) => s + Number(d.total_ttc), 0))} href="/app/devis" />
        <Stat label="Signés à facturer" value={toInvoice.length} sub={eur(toInvoice.reduce((s, d) => s + Number(d.total_ttc), 0))} href="/app/devis" />
      </div>

      {company && !company.siret && (
        <Link href="/app/parametres" className="card block border-amber-300 bg-amber-50 text-sm">
          ⚠️ Complétez vos informations légales (SIRET, adresse, assurance décennale) pour des documents conformes →
        </Link>
      )}

      {dueVisits.length > 0 && (
        <Link href="/app/entretien" className="card block border-amber-300 bg-amber-50">
          <p className="font-bold">🔧 {dueVisits.length} entretien{dueVisits.length > 1 ? "s" : ""} sous contrat à planifier</p>
          <p className="text-sm text-slate-600">{dueVisits.slice(0, 3).map((c) => c.client_snapshot?.name).join(", ")}{dueVisits.length > 3 ? "…" : ""}</p>
        </Link>
      )}

      <section>
        <h2 className="mb-2 font-bold">Prochaines interventions</h2>
        {next.length === 0 && <p className="text-sm text-slate-500">Rien de prévu. <Link href="/app/planning" className="text-brand">Planifier →</Link></p>}
        <div className="space-y-2">
          {next.map((i) => (
            <Link key={i.id} href="/app/planning" className="card block py-3">
              <p className="font-semibold">{i.title}</p>
              <p className="text-sm text-slate-500">{new Date(i.starts_at).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {i.clients?.name || i.address}</p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-bold">Activité récente</h2>
        <div className="space-y-2">
          {docs.slice(0, 5).map((d) => (
            <Link key={d.id} href={`/app/doc/${d.id}`} className="card flex items-center justify-between py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{d.client_snapshot?.name || "Sans client"}</p>
                <p className="text-xs text-slate-500">{d.number || "Brouillon"} · {eur(d.total_ttc)}</p>
              </div>
              <span className={`chip ${STATUS_COLOR[d.status]}`}>{STATUS_LABEL[d.status]}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
