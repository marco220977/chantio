"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import { eur, STATUS_COLOR, STATUS_LABEL } from "@/lib/calc";
import { memberName, useCompany } from "@/components/CompanyContext";
import type { Doc } from "@/lib/types";

function SupDashboard() {
  const { company } = useCompany();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [next, setNext] = useState<any[]>([]);
  const [dueVisits, setDueVisits] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [sav, setSav] = useState<any[]>([]);

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
      const { data: ch } = await s.from("chantiers").select("id, title, client_snapshot").eq("status", "in_progress").order("created_at", { ascending: false }).limit(3);
      setSites(ch || []);
      const { data: sv } = await s.from("sav_tickets").select("id, priority, client_snapshot").not("status", "in", "(resolved,closed)");
      setSav(sv || []);
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
        <Stat label="Encaissé ce mois" value={eur(paidMonth)} sub="Voir l'évolution →" href="/app/chiffre-affaires" />
        <Stat label="À encaisser" value={eur(unpaid.reduce((s, d) => s + Number(d.total_ttc), 0))} sub={late.length ? `⚠️ ${late.length} en retard` : `${unpaid.length} facture(s)`} href="/app/factures" />
        <Stat label="Devis en attente" value={pending.length} sub={eur(pending.reduce((s, d) => s + Number(d.total_ttc), 0))} href="/app/devis" />
        <Stat label="Signés à facturer" value={toInvoice.length} sub={eur(toInvoice.reduce((s, d) => s + Number(d.total_ttc), 0))} href="/app/devis" />
      </div>

      {company && !company.siret && (
        <Link href="/app/parametres" className="card block border-amber-300 bg-amber-50 text-sm">
          ⚠️ Complétez vos informations légales (SIRET, adresse, assurance décennale) pour des documents conformes →
        </Link>
      )}

      {sav.length > 0 && (
        <Link href="/app/sav" className={`card block ${sav.some((x) => x.priority === "urgent") ? "border-red-300 bg-red-50" : ""}`}>
          <p className="font-bold">🛠 {sav.length} SAV en cours{sav.some((x) => x.priority === "urgent") ? ` dont ${sav.filter((x) => x.priority === "urgent").length} urgent(s)` : ""}</p>
          <p className="text-sm text-slate-600">{sav.slice(0, 3).map((x) => x.client_snapshot?.name).join(", ")}</p>
        </Link>
      )}

      {dueVisits.length > 0 && (
        <Link href="/app/entretien" className="card block border-amber-300 bg-amber-50">
          <p className="font-bold">🔧 {dueVisits.length} entretien{dueVisits.length > 1 ? "s" : ""} sous contrat à planifier</p>
          <p className="text-sm text-slate-600">{dueVisits.slice(0, 3).map((c) => c.client_snapshot?.name).join(", ")}{dueVisits.length > 3 ? "…" : ""}</p>
        </Link>
      )}

      <TeamToday />

      {sites.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold">Chantiers en cours</h2>
          <div className="space-y-2">
            {sites.map((c) => (
              <Link key={c.id} href={`/app/chantiers/${c.id}`} className="card flex items-center justify-between py-3">
                <div className="min-w-0"><p className="truncate font-semibold">🏗️ {c.title}</p><p className="truncate text-xs text-slate-500">{c.client_snapshot?.name}</p></div>
                <span className="text-sm text-flame">📷 →</span>
              </Link>
            ))}
          </div>
        </section>
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

function TechHome() {
  const { me, company } = useCompany();
  const [today, setToday] = useState<any[]>([]);
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [sav, setSav] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);

  useEffect(() => {
    if (!me) return;
    (async () => {
      const s = sb();
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(start); end.setDate(end.getDate() + 1);
      const week = new Date(start); week.setDate(week.getDate() + 7);
      const { data: iv } = await s.from("interventions").select("*, clients(name, phone)").eq("assigned_to", me.user_id)
        .gte("starts_at", start.toISOString()).lt("starts_at", week.toISOString()).neq("status", "canceled").order("starts_at");
      setToday((iv || []).filter((i: any) => new Date(i.starts_at) < end));
      setUpcoming((iv || []).filter((i: any) => new Date(i.starts_at) >= end));
      const { data: sv } = await s.from("sav_tickets").select("id, number, priority, problem, client_snapshot, scheduled_at, status").eq("assigned_to", me.user_id).not("status", "in", "(resolved,closed)").order("scheduled_at");
      setSav(sv || []);
      const { data: ch } = await s.from("chantiers").select("id, title, client_snapshot, team").eq("status", "in_progress").order("created_at", { ascending: false });
      setSites((ch || []).filter((c: any) => !c.team?.length || c.team.includes(me.user_id)));
    })();
  }, [me]);

  const Iv = ({ i }: { i: any }) => (
    <div className={`card space-y-2 border-l-4 ${i.status === "done" ? "border-l-green-500 opacity-60" : "border-l-flame"}`}>
      <p className="font-semibold">{new Date(i.starts_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · {i.title}</p>
      <p className="text-sm text-slate-500">{[i.clients?.name, i.address].filter(Boolean).join(" · ")}</p>
      {i.notes && <p className="text-sm">{i.notes}</p>}
      <div className="flex gap-2">
        {i.address && <a className="btn-ghost flex-1 !py-2 text-sm" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(i.address)}`}>🧭 Y aller</a>}
        {i.clients?.phone && <a className="btn-ghost flex-1 !py-2 text-sm" href={`tel:${i.clients.phone}`}>📞 Appeler</a>}
        {i.status !== "done" && <button className="btn-primary flex-1 !py-2 text-sm" onClick={async () => { await sb().from("interventions").update({ status: "done" }).eq("id", i.id); setToday(today.map((x) => (x.id === i.id ? { ...x, status: "done" } : x))); }}>✅ Fait</button>}
      </div>
    </div>
  );

  return (
    <div className="space-y-5 p-4">
      <div className="pt-2">
        <p className="text-sm text-slate-500">{new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1 className="text-2xl font-extrabold">Bonjour {me?.full_name?.split(" ")[0] || ""} 👋</h1>
        <p className="text-sm text-slate-500">{company?.name}</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Link href="/app/chantiers" className="btn-brand flex-col !py-3 text-sm">📷<span>Photo chantier</span></Link>
        <Link href="/app/entretien/visite/nouveau" className="btn-primary flex-col !py-3 text-sm">🔧<span>Entretien</span></Link>
        <Link href="/app/sav/nouveau" className="btn-ghost flex-col !py-3 text-sm">🛠<span>SAV</span></Link>
      </div>

      <section>
        <h2 className="mb-2 font-bold">Aujourd'hui ({today.length})</h2>
        {today.length === 0 && <p className="text-sm text-slate-500">Aucune intervention prévue aujourd'hui.</p>}
        <div className="space-y-2">{today.map((i) => <Iv key={i.id} i={i} />)}</div>
      </section>

      {sav.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold">Mes SAV ({sav.length})</h2>
          <div className="space-y-2">
            {sav.map((t) => (
              <Link key={t.id} href={`/app/sav/${t.id}`} className={`card block ${t.priority === "urgent" ? "border-l-4 border-l-red-500" : ""}`}>
                <p className="font-semibold">{t.priority === "urgent" ? "🚨 " : ""}{t.client_snapshot?.name}</p>
                <p className="line-clamp-1 text-sm text-slate-600">{t.problem}</p>
                {t.scheduled_at && <p className="text-xs text-slate-400">RDV {new Date(t.scheduled_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</p>}
              </Link>
            ))}
          </div>
        </section>
      )}

      {sites.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold">Chantiers en cours</h2>
          <div className="space-y-2">
            {sites.map((c) => (
              <Link key={c.id} href={`/app/chantiers/${c.id}`} className="card flex items-center justify-between py-3">
                <div className="min-w-0"><p className="truncate font-semibold">🏗️ {c.title}</p><p className="truncate text-xs text-slate-500">{c.client_snapshot?.name}</p></div>
                <span className="text-sm text-flame">📷 →</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold">Cette semaine</h2>
          <div className="space-y-2">
            {upcoming.map((i) => (
              <Link key={i.id} href="/app/planning" className="card block py-3">
                <p className="font-semibold">{i.title}</p>
                <p className="text-sm text-slate-500">{new Date(i.starts_at).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {i.clients?.name || i.address}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function TeamToday() {
  const { team } = useCompany();
  const [ivs, setIvs] = useState<any[]>([]);
  useEffect(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    sb().from("interventions").select("id, title, starts_at, status, assigned_to, clients(name)").gte("starts_at", start.toISOString()).lt("starts_at", end.toISOString()).order("starts_at")
      .then(({ data }) => setIvs(data || []));
  }, []);
  const techs = team.filter((m) => m.role === "technician");
  if (!techs.length) return null;
  return (
    <section>
      <div className="mb-2 flex items-center justify-between"><h2 className="font-bold">Équipe aujourd'hui</h2><Link href="/app/equipe" className="text-sm text-brand">Équipe →</Link></div>
      <div className="space-y-2">
        {techs.map((t) => {
          const mine = ivs.filter((i) => i.assigned_to === t.user_id);
          return (
            <div key={t.user_id} className="card py-3">
              <p className="font-semibold">👷 {memberName(t)} <span className="text-xs font-normal text-slate-500">· {mine.filter((i) => i.status === "done").length}/{mine.length} terminée(s)</span></p>
              {mine.length === 0 ? <p className="text-sm text-slate-400">Aucune intervention</p> : mine.map((i) => (
                <p key={i.id} className={`text-sm ${i.status === "done" ? "text-slate-400 line-through" : ""}`}>{new Date(i.starts_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} {i.title}{i.clients?.name ? ` — ${i.clients.name}` : ""}</p>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function Home() {
  const { isSup, loaded } = useCompany();
  if (!loaded) return <p className="p-8 text-center text-slate-400">Chargement…</p>;
  return isSup ? <SupDashboard /> : <TechHome />;
}
