"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import { dateFr } from "@/lib/calc";
import Header from "@/components/Header";
import type { Reception } from "@/lib/quitus-sav";

export default function QuitusList() {
  const [list, setList] = useState<Reception[] | null>(null);
  useEffect(() => { sb().from("receptions").select("*").order("created_at", { ascending: false }).then(({ data }) => setList(data || [])); }, []);
  const label = (r: Reception) => r.status === "draft" ? ["Brouillon", "bg-slate-100 text-slate-700"]
    : r.with_reserves && !r.reserves_lifted_at ? ["Réserves en cours", "bg-amber-100 text-amber-800"] : ["Signé", "bg-green-100 text-green-800"];
  return (
    <>
      <Header back title="Quitus / réception" right={<Link href="/app/quitus/nouveau" className="btn-brand !px-3 !py-1.5 text-sm">＋ Quitus</Link>} />
      <div className="space-y-2 p-4">
        <p className="text-sm text-slate-500">Procès-verbaux de réception des travaux signés par le client. La date de réception fait partir les garanties (1 an, 2 ans, 10 ans).</p>
        {list === null && <p className="text-center text-slate-400">Chargement…</p>}
        {list?.length === 0 && <p className="py-10 text-center text-slate-500">Aucun quitus.</p>}
        {list?.map((r) => { const [l, cls] = label(r); return (
          <Link key={r.id} href={`/app/quitus/${r.id}`} className="card flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">{r.client_snapshot?.name || "Sans client"}</p>
              <p className="truncate text-sm text-slate-500">{r.works?.split("\n")[0] || "—"}</p>
              <p className="text-xs text-slate-400">{r.number} · réception {dateFr(r.reception_date)}</p>
            </div>
            <span className={`chip ${cls}`}>{l}</span>
          </Link>); })}
      </div>
    </>
  );
}
