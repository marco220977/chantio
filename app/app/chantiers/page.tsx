"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import { dateFr } from "@/lib/calc";
import Header from "@/components/Header";
import { useCompany } from "@/components/CompanyContext";
import { CH_STATUS, signedUrls, type Chantier } from "@/lib/chantiers";

export default function Chantiers() {
  const [list, setList] = useState<(Chantier & { count?: number })[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("active");
  const [q, setQ] = useState("");
  const { me, isSup } = useCompany();
  const [mine, setMine] = useState(false);
  useEffect(() => { if (me && !isSup) setMine(true); }, [me, isSup]);

  useEffect(() => {
    (async () => {
      const { data } = await sb().from("chantiers").select("*, chantier_entries(count)").order("created_at", { ascending: false });
      const rows = (data || []).map((c: any) => ({ ...c, count: c.chantier_entries?.[0]?.count || 0 }));
      setList(rows);
      const covers = rows.map((c: Chantier) => c.cover_path).filter(Boolean) as string[];
      if (covers.length) setUrls(await signedUrls(covers));
    })();
  }, []);

  const shown = (list || []).filter((c: any) => !mine || !c.team?.length || c.team.includes(me?.user_id)).filter((c) => (status === "all" || (status === "active" ? c.status !== "done" : c.status === "done"))
    && (!q || `${c.title} ${c.client_snapshot?.name} ${c.address}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <>
      <Header title="Chantiers" right={<Link href="/app/chantiers/nouveau" className="btn-brand !px-3 !py-1.5 text-sm">＋ Chantier</Link>} />
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-3 rounded-xl bg-slate-200 p-1">
          {[["active", "En cours"], ["done", "Terminés"], ["all", "Tous"]].map(([k, l]) => (
            <button key={k} onClick={() => setStatus(k)} className={`rounded-lg py-2 text-sm font-semibold ${status === k ? "bg-white shadow" : "text-slate-600"}`}>{l}</button>
          ))}
        </div>
        <input className="input" placeholder="Rechercher (client, adresse)…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Seulement mes chantiers</label>
        {list === null && <p className="text-center text-slate-400">Chargement…</p>}
        {list && shown.length === 0 && <p className="py-10 text-center text-slate-500">Aucun chantier.</p>}
        {shown.map((c) => (
          <Link key={c.id} href={`/app/chantiers/${c.id}`} className="card flex gap-3 !p-3">
            <div className="h-20 w-20 flex-none overflow-hidden rounded-xl bg-slate-100">
              {c.cover_path && urls[c.cover_path] ? <img src={urls[c.cover_path]} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-2xl">🏗️</div>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="truncate font-semibold">{c.title}</p>
                <span className={`chip flex-none ${CH_STATUS[c.status]?.[1]}`}>{CH_STATUS[c.status]?.[0]}</span>
              </div>
              <p className="truncate text-sm text-slate-500">{c.client_snapshot?.name}</p>
              <p className="truncate text-xs text-slate-400">{c.address}</p>
              <p className="text-xs text-slate-400">{c.start_date ? `Début ${dateFr(c.start_date)} · ` : ""}{c.count} entrée{(c.count || 0) > 1 ? "s" : ""}</p>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
