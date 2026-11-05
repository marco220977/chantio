"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import { dateFr, eur, STATUS_COLOR, STATUS_LABEL } from "@/lib/calc";
import Header from "./Header";
import type { Doc } from "@/lib/types";

export default function DocList({ kind }: { kind: "quote" | "invoice" }) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const filters = kind === "quote"
    ? ["all", "draft", "sent", "signed", "invoiced", "refused"]
    : ["all", "draft", "issued", "paid", "canceled"];

  useEffect(() => {
    sb().from("documents").select("*").in("kind", kind === "quote" ? ["quote"] : ["invoice", "credit"])
      .order("created_at", { ascending: false }).then(({ data }) => setDocs(data || []));
  }, [kind]);

  const list = (docs || []).filter((d) =>
    (status === "all" || d.status === status) &&
    (!q || `${d.number} ${d.client_snapshot?.name} ${d.title}`.toLowerCase().includes(q.toLowerCase())));

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Header title={kind === "quote" ? "Devis" : "Factures"}
        right={<Link href={`/app/doc/nouveau?kind=${kind}`} className="btn-brand !px-3 !py-1.5 text-sm">＋ Nouveau</Link>} />
      <div className="space-y-3 p-4">
        <input className="input" placeholder="Rechercher (client, n°, objet)…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {filters.map((f) => (
            <button key={f} onClick={() => setStatus(f)}
              className={`chip whitespace-nowrap border py-1.5 ${status === f ? "border-ink bg-ink text-white" : "border-slate-200 bg-white"}`}>
              {f === "all" ? "Tous" : STATUS_LABEL[f]}
            </button>
          ))}
        </div>
        {docs === null && <p className="text-center text-slate-400">Chargement…</p>}
        {docs && list.length === 0 && <p className="py-10 text-center text-slate-500">Aucun document.</p>}
        {list.map((d) => (
          <Link key={d.id} href={`/app/doc/${d.id}`} className="card flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">{d.client_snapshot?.name || "Sans client"}</p>
              <p className="truncate text-sm text-slate-500">{d.title || "—"}</p>
              <p className="text-xs text-slate-400">
                {d.kind === "credit" ? "Avoir " : ""}{d.number || "Brouillon"} · {dateFr(d.issue_date)}
                {d.status === "issued" && d.due_date && d.due_date < today && <span className="ml-1 font-semibold text-red-600">· en retard</span>}
              </p>
            </div>
            <div className="text-right">
              <p className="font-bold">{eur(d.total_ttc)}</p>
              <span className={`chip mt-1 ${STATUS_COLOR[d.status]}`}>{STATUS_LABEL[d.status]}</span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
