"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import { dateFr } from "@/lib/calc";
import Header from "@/components/Header";
import { useCompany } from "@/components/CompanyContext";
import { equipmentLabel } from "@/lib/maintenance";
import { SAV_STATUS, type Ticket } from "@/lib/quitus-sav";

export default function SavList() {
  const [list, setList] = useState<Ticket[] | null>(null);
  const [filter, setFilter] = useState("open");
  const [q, setQ] = useState("");
  const { me, isSup } = useCompany();
  const [mine, setMine] = useState(false);
  useEffect(() => { if (me && !isSup) setMine(true); }, [me, isSup]);
  useEffect(() => { sb().from("sav_tickets").select("*").order("created_at", { ascending: false }).then(({ data }) => setList(data || [])); }, []);
  const shown = (list || [])
    .filter((t) => (filter === "all" ? true : filter === "open" ? !["resolved", "closed"].includes(t.status) : ["resolved", "closed"].includes(t.status)))
    .filter((t) => !mine || t.assigned_to === me?.user_id)
    .filter((t) => !q || `${t.number} ${t.client_snapshot?.name} ${t.problem} ${t.equipment?.brand}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.priority === "urgent" ? 0 : 1) - (b.priority === "urgent" ? 0 : 1));
  return (
    <>
      <Header back title="SAV" right={<Link href="/app/sav/nouveau" className="btn-brand !px-3 !py-1.5 text-sm">＋ Demande</Link>} />
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-3 rounded-xl bg-slate-200 p-1">
          {[["open", "En cours"], ["done", "Traités"], ["all", "Tous"]].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`rounded-lg py-2 text-sm font-semibold ${filter === k ? "bg-white shadow" : "text-slate-600"}`}>{l}</button>
          ))}
        </div>
        <input className="input" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Seulement mes SAV</label>
        {list === null && <p className="text-center text-slate-400">Chargement…</p>}
        {list && shown.length === 0 && <p className="py-10 text-center text-slate-500">Aucune demande.</p>}
        {shown.map((t) => (
          <Link key={t.id} href={`/app/sav/${t.id}`} className={`card block ${t.priority === "urgent" && !["resolved", "closed"].includes(t.status) ? "border-l-4 border-l-red-500" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="truncate font-semibold">{t.priority === "urgent" ? "🚨 " : ""}{t.client_snapshot?.name || "Sans client"}</p>
              <span className={`chip flex-none ${SAV_STATUS[t.status]?.[1]}`}>{SAV_STATUS[t.status]?.[0]}</span>
            </div>
            <p className="line-clamp-2 text-sm text-slate-600">{t.problem}</p>
            <p className="text-xs text-slate-400">{t.number} · {dateFr(t.created_at)}{t.equipment?.type || t.equipment?.brand ? ` · ${equipmentLabel(t.equipment)} ${t.equipment.brand || ""}` : ""}{t.scheduled_at ? ` · RDV ${new Date(t.scheduled_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}` : ""}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
